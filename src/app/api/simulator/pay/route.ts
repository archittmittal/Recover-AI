import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recoveryJourneys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { recoveryCoordinator } from '@/lib/recovery/coordinator';
import { generateId } from '@/lib/utils/ids';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { journeyId, customerId } = body;

    if (!journeyId && !customerId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'journeyId or customerId is required.' } },
        { status: 400 }
      );
    }

    let journey;
    if (journeyId) {
      const list = await db.select().from(recoveryJourneys).where(eq(recoveryJourneys.id, journeyId)).limit(1);
      if (list.length > 0) journey = list[0];
    } else if (customerId) {
      const list = await db
        .select()
        .from(recoveryJourneys)
        .where(eq(recoveryJourneys.customerId, customerId))
        .limit(1);
      if (list.length > 0) journey = list[0];
    }

    if (!journey) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Recovery journey not found.' } },
        { status: 404 }
      );
    }

    const payId = `pay_sim_${generateId('cust')}`;
    const amountToRecover = journey.amountAtRisk;

    await recoveryCoordinator.resolveJourneyWithPayment(journey.id, payId, amountToRecover);

    return NextResponse.json({
      success: true,
      data: {
        journeyId: journey.id,
        paymentId: payId,
        amountRecovered: amountToRecover,
        status: 'resolved',
        message: `Successfully recovered ₹${(amountToRecover / 100).toLocaleString('en-IN')}`,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error simulating payment';
    console.error('[POST /api/simulator/pay]', error);
    return NextResponse.json(
      { success: false, error: { code: 'PAYMENT_SIMULATION_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
