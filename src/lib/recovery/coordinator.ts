import { db } from '../db';
import {
  customers,
  paymentFailures,
  recoveryJourneys,
  recoveryActions,
} from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { generateId } from '../utils/ids';
import { getClock, formatIST } from '../utils/time';
import { writeAuditLog } from '../utils/audit';
import { classifyFailureWithLLM } from '../ai/classifier';
import { generateRecoveryMessage } from '../ai/messenger';
import { razorpayClient } from '../razorpay/client';
import { communicationManager, normalizeDispatchResult } from '../communication/manager';
import { RecoveryStrategy } from './classifier';
import { getChannelForAttempt, STRATEGY_CONFIGS } from './strategies';
import { evaluateStoppingRules } from './stopping-rules';
import { calculateNextScheduledTime } from './scheduler';

export class RecoveryCoordinator {
  /**
   * Initializes or continues a recovery journey for a given payment failure.
   */
  async startRecoveryJourney(failureId: string): Promise<string> {
    const failureList = await db
      .select()
      .from(paymentFailures)
      .where(eq(paymentFailures.id, failureId))
      .limit(1);

    if (failureList.length === 0) {
      throw new Error(`Payment failure not found: ${failureId}`);
    }

    const failure = failureList[0];

    // Fetch customer details
    const customerList = await db
      .select()
      .from(customers)
      .where(eq(customers.id, failure.customerId))
      .limit(1);

    if (customerList.length === 0) {
      throw new Error(`Customer not found: ${failure.customerId}`);
    }

    const customer = customerList[0];

    // Check if an existing journey is already active
    const existingJourneys = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.failureId, failureId))
      .limit(1);

    let journeyId: string;
    const nowStr = formatIST(getClock().now());

    if (existingJourneys.length > 0) {
      journeyId = existingJourneys[0].id;
    } else {
      journeyId = generateId('rj');

      // 1. Stage 1: Detect & Diagnose
      const classification = await classifyFailureWithLLM({
        errorSource: failure.errorSource,
        errorStep: failure.errorStep,
        errorCode: failure.errorCode,
        errorReason: failure.errorReason,
        failureType: failure.failureType,
        customerSegment: customer.segment as 'b2c' | 'b2b',
        amount: failure.amount,
      });

      const selectedStrategy = classification.strategy || 'smart_retry';

      await db.insert(recoveryJourneys).values({
        id: journeyId,
        customerId: customer.id,
        failureId: failure.id,
        status: 'detected',
        strategy: selectedStrategy,
        amountAtRisk: failure.amount,
        amountRecovered: 0,
        maxAttempts: 3,
        currentAttempt: 0,
        currentChannel: null,
        createdAt: nowStr,
        updatedAt: nowStr,
      });

      await writeAuditLog({
        journeyId,
        actor: 'system',
        eventType: 'journey_started',
        eventData: {
          failureId: failure.id,
          amount: failure.amount,
          errorReason: failure.errorReason,
          errorSource: failure.errorSource,
          classifiedStrategy: selectedStrategy,
          classificationReasoning: classification.reasoning,
        },
      });

      // Advance to diagnosing -> recovering
      await db
        .update(recoveryJourneys)
        .set({ status: 'recovering', updatedAt: nowStr })
        .where(eq(recoveryJourneys.id, journeyId));
    }

    // Execute first recovery attempt
    await this.processRecoveryAttempt(journeyId);

    return journeyId;
  }

  /**
   * Executes the next recovery outreach attempt in the journey lifecycle.
   */
  async processRecoveryAttempt(journeyId: string): Promise<void> {
    const journeyList = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId))
      .limit(1);

    if (journeyList.length === 0) return;
    const journey = journeyList[0];

    // If journey is already closed, do nothing
    if (journey.status === 'resolved' || journey.status === 'opted_out' || journey.status === 'exhausted') {
      return;
    }

    // Respect the strategy's configured retry backoff (retryIntervalsHours). Each
    // action's scheduledAt records the earliest time the *next* attempt may fire
    // (see where it's computed below); if that time hasn't arrived, this call is
    // a no-op instead of dispatching immediately (RA-07). Without this, a caller
    // that invokes processRecoveryAttempt repeatedly — e.g. a sweep triggered
    // every minute — burns a journey's entire attempt ladder in seconds instead
    // of across the days retryIntervalsHours specifies.
    const [latestAction] = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId))
      .orderBy(desc(recoveryActions.attemptNumber))
      .limit(1);

    if (latestAction && new Date(latestAction.scheduledAt) > getClock().now()) {
      return;
    }

    const customerList = await db
      .select()
      .from(customers)
      .where(eq(customers.id, journey.customerId))
      .limit(1);

    if (customerList.length === 0) return;
    const customer = customerList[0];

    // Check stopping rules before making an attempt. The 8AM-7PM IST contact
    // window (RBI Fair Practices Code) is enforced here, not skipped — tests
    // that need to dispatch outreach set a daytime FixedClock instead (RA-06).
    const stoppingCheck = evaluateStoppingRules({
      journeyStatus: journey.status,
      currentAttempt: journey.currentAttempt,
      maxAttempts: journey.maxAttempts,
      customerDndStatus: customer.dndStatus,
      checkContactHours: true,
    });

    const now = getClock().now();
    const nowStr = formatIST(now);

    if (stoppingCheck.shouldStop) {
      if (stoppingCheck.nextStatus && stoppingCheck.nextStatus !== journey.status) {
        await db
          .update(recoveryJourneys)
          .set({ status: stoppingCheck.nextStatus, updatedAt: nowStr })
          .where(eq(recoveryJourneys.id, journeyId));
      }

      // Log every fired stopping rule, not only ones that change the status label.
      // The contact-hours rule's nextStatus ('recovering') is the same string as
      // the journey's current status while deferred, so gating the log on a
      // status change silently dropped the audit trail for every deferred
      // attempt (RA-06) — the one place that record matters most.
      await writeAuditLog({
        journeyId,
        actor: 'agent',
        eventType: 'stopping_rule_triggered',
        eventData: {
          rule: stoppingCheck.ruleFired,
          reason: stoppingCheck.reason,
          newStatus: stoppingCheck.nextStatus,
        },
      });
      return;
    }

    // Advance attempt counter & determine channel
    const nextAttempt = journey.currentAttempt + 1;
    const strategy = (
      journey.strategy in STRATEGY_CONFIGS ? journey.strategy : 'payment_link'
    ) as RecoveryStrategy;
    const channel = getChannelForAttempt(strategy, nextAttempt);

    // Generate Razorpay Payment Link. A failure here must abort the attempt
    // rather than degrade to a fabricated URL: a customer sent a dead link
    // burns one of three attempts for nothing (see RA-14). Skipped attempts
    // are recoverable on the next sweep; a spent attempt with a broken link
    // is not.
    let paymentUrl: string;
    let paymentLinkId: string | null;

    try {
      const plink = await razorpayClient.createPaymentLink({
        amount: journey.amountAtRisk,
        currency: 'INR',
        reference_id: `recov_${journey.id}_att${nextAttempt}`,
        description: `Payment recovery attempt #${nextAttempt}`,
        customer: {
          name: customer.name,
          email: customer.email,
          contact: customer.phone,
        },
      });
      paymentUrl = plink.short_url;
      paymentLinkId = plink.id;
    } catch (error) {
      console.warn('[RecoveryCoordinator] Payment link generation failed, aborting attempt:', error);
      await writeAuditLog({
        journeyId,
        actor: 'system',
        eventType: 'attempt_aborted',
        eventData: {
          reason: 'payment_link_unavailable',
          attemptNumber: nextAttempt,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }

    // Generate personalized message via LLM
    const strategyConfig = STRATEGY_CONFIGS[strategy] || STRATEGY_CONFIGS.payment_link;
    const discount = nextAttempt > 1 && strategyConfig.allowDiscount ? 10 : 0;

    const messageResult = await generateRecoveryMessage({
      customerName: customer.name,
      language: (customer.preferredLanguage || 'en') as 'en' | 'hi' | 'hinglish',
      channel: channel === 'sms' ? 'sms' : 'whatsapp',
      amount: journey.amountAtRisk,
      failureReason: 'transaction decline',
      paymentLinkUrl: paymentUrl,
      discountPercentage: discount,
    });

    // Actually dispatch the message through the channel-specific provider,
    // instead of hardcoding deliveryStatus (see RA-12).
    const dispatch = await communicationManager.dispatch({
      channel,
      toPhone: customer.phone,
      toEmail: customer.email,
      customerName: customer.name,
      messageText: messageResult.message,
      paymentLinkUrl: paymentUrl,
      amount: journey.amountAtRisk,
      language: (customer.preferredLanguage || 'en') as 'en' | 'hi' | 'hinglish',
    });
    const { deliveryStatus, providerMessageId, succeeded } = normalizeDispatchResult(dispatch);

    const actionId = generateId('ra');
    // scheduledAt on this row marks when the *next* attempt (nextAttempt + 1) is
    // allowed to fire, per the strategy's configured backoff — not when this
    // attempt itself ran (that's executedAt, set to nowStr below).
    const nextIntervalHours = strategyConfig.retryIntervalsHours[nextAttempt - 1] ?? 24;
    const scheduleInfo = calculateNextScheduledTime(nextIntervalHours);

    // Record recovery action
    await db.insert(recoveryActions).values({
      id: actionId,
      journeyId,
      attemptNumber: nextAttempt,
      channel,
      actionType: journey.strategy === 'smart_retry' ? 'retry' : 'payment_link',
      messageContent: messageResult.message,
      llmReasoning: messageResult.llmReasoning,
      deliveryStatus,
      providerMessageId,
      customerResponse: null,
      outcome: succeeded ? 'pending' : 'failed',
      scheduledAt: scheduleInfo.scheduledIso,
      executedAt: nowStr,
      createdAt: nowStr,
    });

    if (!succeeded) {
      // Dispatch failed: don't consume the attempt or advance journey state,
      // so a genuine retry can still occur (attempt accounting on failure
      // is RA-14's concern; this just avoids silently burning the attempt).
      await writeAuditLog({
        journeyId,
        actionId,
        actor: 'agent',
        eventType: 'dispatch_failed',
        eventData: { attemptNumber: nextAttempt, channel, providerMessageId },
      });
      return;
    }

    // Update journey status and attempt
    const newStatus = nextAttempt >= journey.maxAttempts ? 'exhausted' : 'recovering';

    await db
      .update(recoveryJourneys)
      .set({
        currentAttempt: nextAttempt,
        currentChannel: channel,
        paymentLinkId: paymentLinkId,
        status: newStatus,
        updatedAt: nowStr,
      })
      .where(eq(recoveryJourneys.id, journeyId));

    // Audit log entry
    await writeAuditLog({
      journeyId,
      actionId,
      actor: 'agent',
      eventType: 'outreach_dispatched',
      eventData: {
        attemptNumber: nextAttempt,
        channel,
        message: messageResult.message,
        llmReasoning: messageResult.llmReasoning,
        isTemplateFallback: messageResult.isTemplateFallback,
        paymentLinkId,
        providerMessageId,
      },
    });
  }

  /**
   * Handles an incoming customer reply in the customer chat simulator or live webhook.
   */
  async handleCustomerResponse(journeyId: string, responseText: string): Promise<void> {
    const journeyList = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId))
      .limit(1);

    if (journeyList.length === 0) return;
    const journey = journeyList[0];

    const customerList = await db
      .select()
      .from(customers)
      .where(eq(customers.id, journey.customerId))
      .limit(1);

    if (customerList.length === 0) return;
    const customer = customerList[0];

    const nowStr = formatIST(getClock().now());

    // Audit log customer response
    await writeAuditLog({
      journeyId,
      actor: 'customer',
      eventType: 'customer_replied',
      eventData: {
        responseText,
      },
    });

    // Check opt-out stopping rule
    const stoppingCheck = evaluateStoppingRules({
      journeyStatus: journey.status,
      currentAttempt: journey.currentAttempt,
      maxAttempts: journey.maxAttempts,
      customerDndStatus: customer.dndStatus,
      customerMessage: responseText,
    });

    if (stoppingCheck.ruleFired === 'opt_out') {
      await db
        .update(customers)
        .set({ dndStatus: 'opted_out', updatedAt: nowStr })
        .where(eq(customers.id, customer.id));

      await db
        .update(recoveryJourneys)
        .set({ status: 'opted_out', updatedAt: nowStr })
        .where(eq(recoveryJourneys.id, journeyId));

      await writeAuditLog({
        journeyId,
        actor: 'agent',
        eventType: 'customer_opted_out',
        eventData: {
          reason: 'Customer replied STOP',
        },
      });
    }
  }

  /**
   * Marks a journey as resolved when payment succeeds.
   */
  async resolveJourneyWithPayment(
    journeyId: string,
    paymentId: string,
    amountPaid: number
  ): Promise<void> {
    const nowStr = formatIST(getClock().now());

    const journeyList = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId))
      .limit(1);

    if (journeyList.length === 0) return;
    const journey = journeyList[0];

    // Idempotency guard: this journey's payment has already been recorded.
    // Without this, repeated calls (retried webhooks, replayed simulator
    // requests) would keep incrementing the customer's lifetime total.
    if (journey.status === 'resolved') return;

    await db
      .update(recoveryJourneys)
      .set({
        status: 'resolved',
        amountRecovered: amountPaid,
        recoveryPaymentId: paymentId,
        resolvedAt: nowStr,
        updatedAt: nowStr,
      })
      .where(eq(recoveryJourneys.id, journeyId));

    // Attribute the conversion to the most recent outreach action so channel
    // metrics can report real conversion rates instead of always reading 0.
    const [lastAction] = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId))
      .orderBy(desc(recoveryActions.attemptNumber))
      .limit(1);

    if (lastAction) {
      await db
        .update(recoveryActions)
        .set({ outcome: 'payment_completed' })
        .where(eq(recoveryActions.id, lastAction.id));
    }

    // Recompute the customer's lifetime recovered total as a derived sum over
    // their journeys, rather than maintaining an incrementing counter that
    // can drift out of sync with the source of truth.
    const customerJourneys = await db
      .select({ amountRecovered: recoveryJourneys.amountRecovered })
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.customerId, journey.customerId));

    const totalRecoveredAmount = customerJourneys.reduce(
      (sum, j) => sum + j.amountRecovered,
      0
    );

    await db
      .update(customers)
      .set({
        totalRecoveredAmount,
        updatedAt: nowStr,
      })
      .where(eq(customers.id, journey.customerId));

    await writeAuditLog({
      journeyId,
      actor: 'razorpay',
      eventType: 'payment_recovered',
      eventData: {
        paymentId,
        amountRecovered: amountPaid,
        resolvedAt: nowStr,
      },
    });
  }
}

export const recoveryCoordinator = new RecoveryCoordinator();
