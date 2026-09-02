import { NextRequest, NextResponse } from 'next/server';
import { readCredential } from '@/lib/config';
import { db } from '@/lib/db';
import { webhookEvents, paymentFailures, customers, recoveryJourneys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyWebhookSignature, computePayloadHash } from '@/lib/razorpay/webhooks';
import { RazorpayWebhookPayload } from '@/lib/razorpay/types';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';
import { generateId } from '@/lib/utils/ids';
import { formatIST, getClock } from '@/lib/utils/time';
import { writeAuditLog } from '@/lib/utils/audit';
import { normalizePhoneE164 } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';


/**
 * Makes a request-derived value safe to log (CodeQL js/log-injection).
 *
 * `payload.event` comes from the request body. Signature verification runs first, so only a
 * holder of the webhook secret can reach these lines — but a newline in a logged value forges
 * log entries wherever those logs are shipped, and "an attacker would need the secret" is a
 * reason to rank the risk low, not to interpolate raw request data into a log at all.
 */
function forLog(value: unknown): string {
  return String(value ?? '')
    .replace(/[^\w.:@ -]/g, '')
    .slice(0, 64);
}

/** `recov_<journeyId>_att<n>` — the reference the coordinator stamps on every link it creates. */
function journeyIdFromReference(reference: string | undefined | null): string | null {
  if (!reference) return null;
  const match = reference.match(/^recov_(.+)_att\d+$/);
  return match ? match[1] : null;
}

/**
 * Closes the journey a recovered payment belongs to.
 *
 * Attribution is deliberate rather than best-effort: a journey is matched by the payment link id
 * we stored when we created it, or by the `recov_<journeyId>_att<n>` reference we stamped on it.
 * Both are our own identifiers, so a match is a fact. A payment that carries neither is recorded
 * and left alone — guessing which open journey it belonged to would fabricate the one number the
 * whole project is judged on.
 */
async function resolveFromPaymentEvent(
  payload: RazorpayWebhookPayload
): Promise<{ resolvedJourneyId: string | null; reason?: string }> {
  const link = payload.payload.payment_link?.entity;
  const payment = payload.payload.payment?.entity;

  const linkId = link?.id ?? null;
  const journeyIdFromRef = journeyIdFromReference(link?.reference_id);

  let journey = null;

  if (journeyIdFromRef) {
    [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyIdFromRef))
      .limit(1);
  }

  if (!journey && linkId) {
    [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.paymentLinkId, linkId))
      .limit(1);
  }

  if (!journey) {
    console.warn(
      `[webhook:razorpay] ${forLog(payload.event)} carried no link id or recovery reference; ` +
        'recording it without attributing a recovery.'
    );
    return { resolvedJourneyId: null, reason: 'no_matching_journey' };
  }

  // The amount actually paid, falling back to what the journey put at risk.
  const amountPaid = payment?.amount ?? journey.amountAtRisk;
  const paymentId = payment?.id ?? `${payload.event}_${linkId ?? journey.id}`;

  // resolveJourneyWithPayment is idempotent (RA-09), so a Razorpay retry of the same delivery
  // cannot double-count the recovery even if the idempotency claim above were bypassed.
  await recoveryCoordinator.resolveJourneyWithPayment(journey.id, paymentId, amountPaid);

  await writeAuditLog({
    journeyId: journey.id,
    actor: 'razorpay',
    eventType: 'payment_recovered_via_webhook',
    eventData: {
      event: payload.event,
      paymentLinkId: linkId,
      referenceId: link?.reference_id ?? null,
      amountPaid,
      attribution: journeyIdFromRef ? 'recovery_reference' : 'payment_link_id',
    },
  });

  return { resolvedJourneyId: journey.id };
}

export async function POST(req: NextRequest) {
  let eventId: string | undefined;

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const secret = readCredential('RAZORPAY_WEBHOOK_SECRET');

    // Signature verification is mandatory. A missing or placeholder secret is a
    // deployment misconfiguration, not permission to skip verification (RA-01).
    if (!secret) {
      console.error('[webhook:razorpay] RAZORPAY_WEBHOOK_SECRET not configured — rejecting request');
      return NextResponse.json(
        { success: false, error: { code: 'NOT_CONFIGURED', message: 'Webhook secret not configured' } },
        { status: 503 }
      );
    }

    const isValid = verifyWebhookSignature(rawBody, signature, secret);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } },
        { status: 400 }
      );
    }

    // Razorpay identifies each webhook delivery via the x-razorpay-event-id header,
    // not a field in the JSON body (the body carries no top-level `id` at all — see
    // RazorpayWebhookPayload). Relying on a body field that is never sent meant
    // deduplication silently never matched (RA-04).
    eventId = req.headers.get('x-razorpay-event-id') || undefined;
    if (!eventId) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_EVENT_ID', message: 'Missing x-razorpay-event-id header' } },
        { status: 400 }
      );
    }

    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    const payloadHash = computePayloadHash(rawBody);
    const nowStr = formatIST(getClock().now());

    // 1. Idempotency Claim: atomic insert-or-conflict on the primary key, so
    // two concurrent deliveries of the same event can never both proceed
    // (the previous select-then-insert was a TOCTOU race).
    const claimed = await db
      .insert(webhookEvents)
      .values({
        id: eventId,
        eventType: payload.event,
        payloadHash,
        processingStatus: 'processing',
        receivedAt: nowStr,
      })
      .onConflictDoNothing()
      .returning();

    if (claimed.length === 0) {
      const [prior] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, eventId))
        .limit(1);

      if (prior?.processingStatus === 'processed') {
        // Only a genuinely completed event is a true duplicate.
        return NextResponse.json({
          success: true,
          data: { message: 'Duplicate webhook event ignored (idempotent)', eventId },
        });
      }

      if (prior?.processingStatus === 'failed') {
        // A prior attempt errored out. Reclaim atomically (compare-and-swap
        // on status) and reprocess this delivery instead of swallowing it.
        const reclaimed = await db
          .update(webhookEvents)
          .set({ processingStatus: 'processing', errorMessage: null })
          .where(and(eq(webhookEvents.id, eventId), eq(webhookEvents.processingStatus, 'failed')))
          .returning();

        if (reclaimed.length === 0) {
          // Lost the reclaim race to another concurrent retry delivery.
          return NextResponse.json(
            { success: false, error: { code: 'RETRY', message: 'Event reprocessing already in progress' } },
            { status: 503 }
          );
        }
        // Falls through to process the event below.
      } else {
        // Still 'processing' — another delivery is actively working on it.
        // Ask Razorpay to retry later rather than reporting false success.
        return NextResponse.json(
          { success: false, error: { code: 'RETRY', message: 'Event is currently being processed' } },
          { status: 503 }
        );
      }
    }

    // 2. Process Event Types
    //
    // A recovered payment closes the journey it belongs to. Before this, `payment_link.paid` and
    // `payment.captured` were verified, recorded, marked processed and then dropped — so a
    // customer who actually paid through a recovery link never resolved anything, and the
    // dashboard's recovered figure could only move via the simulator's Pay button. The
    // deployment guide meanwhile told operators to subscribe to both.
    if (payload.event === 'payment_link.paid' || payload.event === 'payment.captured') {
      const resolution = await resolveFromPaymentEvent(payload);

      await db
        .update(webhookEvents)
        .set({
          processingStatus: 'processed',
          processedAt: formatIST(getClock().now()),
        })
        .where(eq(webhookEvents.id, eventId));

      return NextResponse.json({
        success: true,
        data: { eventId, status: 'processed', ...resolution },
      });
    }

    if (payload.event === 'payment.failed' && payload.payload.payment) {
      const payment = payload.payload.payment.entity;

      // Resolve customer identity without fabricating contact details
      // (see RA-16). Priority: Razorpay's own customer id, then a
      // normalized phone number, then — only if neither is available — a
      // distinct, unlinked record whose journey is marked uncontactable.
      const razorpayCustomerId = payment.customer_id || null;
      const normalizedContact = normalizePhoneE164(payment.contact);
      const email = payment.email || null;

      let customerId: string;
      let isUncontactable = false;

      if (razorpayCustomerId) {
        const existing = await db
          .select()
          .from(customers)
          .where(eq(customers.razorpayCustomerId, razorpayCustomerId))
          .limit(1);
        customerId = existing.length > 0 ? existing[0].id : generateId('cust');
        if (existing.length === 0) {
          await db.insert(customers).values({
            id: customerId,
            razorpayCustomerId,
            name: payment.notes?.customer_name || 'Customer',
            email,
            phone: normalizedContact,
            preferredLanguage: 'en',
            segment: 'b2c',
            totalFailures: 1,
            totalRecoveredAmount: 0,
            dndStatus: 'active',
            createdAt: nowStr,
            updatedAt: nowStr,
          });
        }
      } else if (normalizedContact) {
        const existing = await db
          .select()
          .from(customers)
          .where(eq(customers.phone, normalizedContact))
          .limit(1);
        customerId = existing.length > 0 ? existing[0].id : generateId('cust');
        if (existing.length === 0) {
          await db.insert(customers).values({
            id: customerId,
            razorpayCustomerId: null,
            name: payment.notes?.customer_name || 'Customer',
            email,
            phone: normalizedContact,
            preferredLanguage: 'en',
            segment: 'b2c',
            totalFailures: 1,
            totalRecoveredAmount: 0,
            dndStatus: 'active',
            createdAt: nowStr,
            updatedAt: nowStr,
          });
        }
      } else {
        // No usable identity: create a distinct unlinked record instead of
        // collapsing into a shared placeholder row.
        customerId = generateId('cust');
        isUncontactable = true;
        await db.insert(customers).values({
          id: customerId,
          razorpayCustomerId: null,
          name: payment.notes?.customer_name || 'Customer',
          email,
          phone: null,
          preferredLanguage: 'en',
          segment: 'b2c',
          totalFailures: 1,
          totalRecoveredAmount: 0,
          dndStatus: 'active',
          createdAt: nowStr,
          updatedAt: nowStr,
        });
      }

      const failureId = generateId('fail');
      await db.insert(paymentFailures).values({
        id: failureId,
        customerId,
        razorpayPaymentId: payment.id,
        razorpayOrderId: payment.order_id,
        razorpaySubscriptionId: payment.subscription_id || null,
        razorpayInvoiceId: payment.invoice_id || null,
        amount: payment.amount,
        currency: payment.currency || 'INR',
        paymentMethod: payment.method || 'card',
        failureType: payment.subscription_id ? 'subscription' : 'one_time',
        errorCode: payment.error_code || 'BAD_REQUEST_ERROR',
        errorSource: payment.error_source || 'customer',
        errorStep: payment.error_step || 'authorization',
        errorReason: payment.error_reason || 'payment_failed',
        errorDescription: payment.error_description || 'Payment failure recorded via webhook.',
        createdAt: nowStr,
      });

      // Trigger recovery coordinator, or mark the journey uncontactable
      // without ever attempting to dispatch outreach.
      if (isUncontactable) {
        await recoveryCoordinator.createUncontactableJourney(failureId);
      } else {
        await recoveryCoordinator.startRecoveryJourney(failureId);
      }
    }

    // Mark webhook as processed
    await db
      .update(webhookEvents)
      .set({
        processingStatus: 'processed',
        processedAt: formatIST(getClock().now()),
      })
      .where(eq(webhookEvents.id, eventId));

    return NextResponse.json({
      success: true,
      data: { eventId, status: 'processed' },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown webhook error';
    console.error('[POST /api/webhooks/razorpay]', error);

    if (eventId) {
      try {
        await db
          .update(webhookEvents)
          .set({
            processingStatus: 'failed',
            errorMessage: errorMsg,
            processedAt: formatIST(getClock().now()),
          })
          .where(eq(webhookEvents.id, eventId));
      } catch (updateError) {
        console.error('[POST /api/webhooks/razorpay] Failed to mark event as failed', updateError);
      }
    }

    return NextResponse.json(
      { success: false, error: { code: 'WEBHOOK_PROCESSING_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
