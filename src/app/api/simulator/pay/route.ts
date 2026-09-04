import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recoveryJourneys } from '@/lib/db/schema';
import { and, desc, eq, ne } from 'drizzle-orm';
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
      // The seeded batch gives every customer one journey per experiment arm, so an unqualified
      // `limit(1)` picked whichever came first — in practice arm A, the control. Prefer the
      // agent's own arm; it is the only one a "customer paid" click is about.
      const list = await db
        .select()
        .from(recoveryJourneys)
        .where(and(eq(recoveryJourneys.customerId, customerId), ne(recoveryJourneys.arm, 'A')))
        .orderBy(desc(recoveryJourneys.arm))
        .limit(1);
      if (list.length > 0) journey = list[0];
    }

    if (!journey) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Recovery journey not found.' } },
        { status: 404 }
      );
    }

    // Arm A answers "what does doing nothing cost?". A recovery in it is not a demo convenience,
    // it is a contaminated control — and the dashboard would then show the no-agent arm
    // recovering money, which is incoherent in front of anyone reading carefully. Observed for
    // real: a Pay click on the deployment resolved rj_KYyKnpXrdUk33Cgx and put ₹6,173 into arm A.
    if (journey.arm === 'A') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CONTROL_ARM',
            message:
              'This journey is in arm A, the no-outreach control. Paying it would corrupt the ' +
              'baseline the comparison depends on.',
          },
        },
        { status: 409 }
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
