import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, recoveryJourneys, recoveryActions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { processCustomerConversation } from '@/lib/ai/conversation';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';
import { generateId } from '@/lib/utils/ids';
import { formatIST, getClock } from '@/lib/utils/time';
import { writeAuditLog } from '@/lib/utils/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { journeyId, customerId, message } = body;

    if (!message || (!journeyId && !customerId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Message and journeyId or customerId are required.' } },
        { status: 400 }
      );
    }

    // Find active journey
    let journey;
    if (journeyId) {
      const list = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.id, journeyId)).limit(1);
      if (list.length > 0) journey = list[0];
    } else if (customerId) {
      const list = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.customerId, customerId)).limit(1);
      if (list.length > 0) journey = list[0];
    }

    if (!journey) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Recovery journey not found.' } },
        { status: 404 }
      );
    }

    const customerList = await db.select().from(customers).where(eq(customers.id, journey.customerId)).limit(1);
    const customer = customerList.length > 0 ? customerList[0] : null;

    // 1. Process customer message through coordinator (handles stopping rules like STOP)
    await recoveryCoordinator.handleCustomerResponse(journey.id, message);

    // 2. Generate contextual response via conversational agent
    const paymentUrl = `https://rzp.io/i/recov_${journey.id}`;
    const conversationResult = await processCustomerConversation({
      customerName: customer?.name || 'Customer',
      customerMessage: message,
      amount: journey.amountAtRisk,
      paymentLinkUrl: paymentUrl,
      preferredLanguage: (customer?.preferredLanguage || 'en') as 'en' | 'hi' | 'hinglish',
    });

    const nowStr = formatIST(getClock().now());
    const actionId = generateId('ra');

    // 3. Record agent conversational reply action
    await db.insert(recoveryActions).values({
      id: actionId,
      journeyId: journey.id,
      attemptNumber: journey.currentAttempt,
      channel: journey.currentChannel || 'whatsapp',
      actionType: 'reminder',
      messageContent: conversationResult.responseMessage,
      llmReasoning: conversationResult.reasoning,
      deliveryStatus: 'delivered',
      customerResponse: message,
      outcome: conversationResult.intent === 'opt_out' ? 'opted_out' : 'pending',
      scheduledAt: nowStr,
      executedAt: nowStr,
      createdAt: nowStr,
    });

    await writeAuditLog({
      journeyId: journey.id,
      actionId,
      actor: 'agent',
      eventType: 'conversational_reply_sent',
      eventData: {
        customerMessage: message,
        agentResponse: conversationResult.responseMessage,
        intent: conversationResult.intent,
        actionRequired: conversationResult.actionRequired,
      },
    });

    // Re-fetch updated journey
    const updatedJourneys = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.id, journey.id)).limit(1);
    const updatedJourney = updatedJourneys[0];

    return NextResponse.json({
      success: true,
      data: {
        agentResponse: conversationResult.responseMessage,
        intent: conversationResult.intent,
        actionRequired: conversationResult.actionRequired,
        journeyStatus: updatedJourney.status,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error processing customer reply';
    console.error('[POST /api/simulator/reply]', error);
    return NextResponse.json(
      { success: false, error: { code: 'REPLY_PROCESSING_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
