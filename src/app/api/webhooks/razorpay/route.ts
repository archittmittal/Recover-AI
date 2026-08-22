import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { webhookEvents, paymentFailures, customers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyWebhookSignature, computePayloadHash } from '@/lib/razorpay/webhooks';
import { RazorpayWebhookPayload } from '@/lib/razorpay/types';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';
import { generateId } from '@/lib/utils/ids';
import { formatIST, getClock } from '@/lib/utils/time';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

    // Signature verification (in production or when secret is set)
    if (secret && !secret.includes('XXXXXXXX')) {
      const isValid = verifyWebhookSignature(rawBody, signature, secret);
      if (!isValid) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } },
          { status: 400 }
        );
      }
    }

    const payload: RazorpayWebhookPayload = JSON.parse(rawBody);
    const eventId = (payload as any).id || `evt_${generateId('audit')}`;
    const payloadHash = computePayloadHash(rawBody);
    const nowStr = formatIST(getClock().now());

    // 1. Idempotency Check: Claim event in webhook_events table
    const existingEvent = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, eventId))
      .limit(1);

    if (existingEvent.length > 0) {
      // Event has already been processed or is currently being processed
      return NextResponse.json({
        success: true,
        data: { message: 'Duplicate webhook event ignored (idempotent)', eventId },
      });
    }

    // Insert as processing
    await db.insert(webhookEvents).values({
      id: eventId,
      eventType: payload.event,
      payloadHash,
      processingStatus: 'processing',
      receivedAt: nowStr,
    });

    // 2. Process Event Types
    if (payload.event === 'payment.failed' && payload.payload.payment) {
      const payment = payload.payload.payment.entity;

      // Find or create customer
      let customerId: string;
      const existingCustomer = await db
        .select()
        .from(customers)
        .where(eq(customers.email, payment.email || 'customer@example.com'))
        .limit(1);

      if (existingCustomer.length > 0) {
        customerId = existingCustomer[0].id;
      } else {
        customerId = generateId('cust');
        await db.insert(customers).values({
          id: customerId,
          name: payment.notes?.customer_name || 'Customer',
          email: payment.email || 'customer@example.com',
          phone: payment.contact || '+919876543210',
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
        paymentMethod: payment.method as any,
        failureType: payment.subscription_id ? 'subscription' : 'one_time',
        errorCode: (payment.error_code as any) || 'BAD_REQUEST_ERROR',
        errorSource: (payment.error_source as any) || 'customer',
        errorStep: (payment.error_step as any) || 'authorization',
        errorReason: payment.error_reason || 'payment_failed',
        errorDescription: payment.error_description || 'Payment failure recorded via webhook.',
        createdAt: nowStr,
      });

      // Trigger recovery coordinator
      await recoveryCoordinator.startRecoveryJourney(failureId);
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
    return NextResponse.json(
      { success: false, error: { code: 'WEBHOOK_PROCESSING_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
