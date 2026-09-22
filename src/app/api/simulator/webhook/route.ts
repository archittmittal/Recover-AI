import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { readCredential } from '@/lib/config';
import { POST as razorpayWebhook } from '../../webhooks/razorpay/route';

export const dynamic = 'force-dynamic';

/**
 * Signs a simulated Razorpay webhook and feeds it to the real handler.
 *
 * The simulator used to POST its payload straight at `/api/webhooks/razorpay` with no
 * `x-razorpay-signature` and no `x-razorpay-event-id`. That was written before RA-01 made
 * signature verification mandatory, and nobody updated it: the button answered 503 with no
 * webhook secret configured and 400 with one, so both demo controls had been dead for as long as
 * the security fix had been in place.
 *
 * The secret cannot go to the browser, so the signing happens here. The request is then handed to
 * the genuine handler rather than around it — verification, idempotency and journey creation all
 * run exactly as they do for a real delivery. A simulator that skipped verification would be
 * demonstrating something the production path does not do.
 */

type Scenario = 'card_decline' | 'mandate_failure';

const SCENARIOS: Record<Scenario, { amount: number; method: string; errorReason: string; description: string; customerName: string }> = {
  card_decline: {
    amount: 299900,
    method: 'card',
    errorReason: 'insufficient_funds',
    description: 'The card has insufficient credit limit or balance.',
    customerName: 'Aarav Sharma',
  },
  mandate_failure: {
    amount: 149900,
    method: 'emandate',
    errorReason: 'mandate_inactive',
    description: 'E-mandate is not in an active state.',
    customerName: 'Priya Patel',
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const scenario: Scenario = body?.scenario === 'mandate_failure' ? 'mandate_failure' : 'card_decline';
    const preset = SCENARIOS[scenario];

    const secret = readCredential('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_CONFIGURED',
            message:
              'RAZORPAY_WEBHOOK_SECRET is not set, so a simulated delivery cannot be signed — ' +
              'which is the same answer a real Razorpay delivery would get.',
          },
        },
        { status: 503 }
      );
    }

    const suffix = crypto.randomUUID();
    // Every event id is unique, so repeated clicks create new journeys rather than being
    // rejected by the idempotency guard — which is what a presenter clicking twice expects.
    const eventId = `evt_sim_${suffix}`;

    const payload = {
      entity: 'event',
      account_id: 'acc_simulated',
      event: 'payment.failed',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: `pay_sim_${suffix}`,
            amount: preset.amount,
            currency: 'INR',
            status: 'failed',
            order_id: `order_sim_${suffix}`,
            method: preset.method,
            email: 'simulated.customer@example.com',
            contact: '+919876543210',
            error_code: 'BAD_REQUEST_ERROR',
            error_description: preset.description,
            error_source: 'customer',
            error_step: 'authorization',
            error_reason: preset.errorReason,
            notes: { customer_name: preset.customerName },
          },
        },
      },
    };

    // Signed over the exact bytes the handler will read back, since HMAC is over the raw body.
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const forwarded = new NextRequest(new URL('http://internal/api/webhooks/razorpay'), {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': eventId,
      }),
      body: rawBody,
    });

    const response = await razorpayWebhook(forwarded);
    const result = await response.json();

    return NextResponse.json(
      {
        success: response.status === 200,
        data: {
          eventId,
          scenario,
          errorReason: preset.errorReason,
          handlerStatus: response.status,
          handlerResponse: result,
          message:
            response.status === 200
              ? `Signed ${scenario.replace('_', ' ')} webhook accepted and processed (${eventId})`
              : `The webhook handler rejected the simulated delivery (${response.status})`,
        },
      },
      { status: response.status }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error simulating a webhook delivery';
    console.error('[POST /api/simulator/webhook]', error);
    return NextResponse.json(
      { success: false, error: { code: 'SIMULATED_WEBHOOK_ERROR', message } },
      { status: 500 }
    );
  }
}
