import { NextRequest, NextResponse } from 'next/server';
import {
  ClockDirectionError,
  ClockInputError,
  advanceDemoClock,
  getClockState,
} from '@/lib/utils/demo-clock';

export const dynamic = 'force-dynamic';

/**
 * Demo clock controls (RA-31). Sits under /api/simulator/* so it inherits that surface's
 * guard: on a production build it answers 404 unless RECOVERAI_DEMO_MODE is explicitly on.
 * Moving time is a demo affordance, and a deployment taking real Razorpay traffic must not
 * expose it at all.
 */
export async function GET() {
  return NextResponse.json({ success: true, data: getClockState() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { advanceMinutes, toIso } = body as { advanceMinutes?: number; toIso?: string };

    const result = await advanceDemoClock({ advanceMinutes, toIso });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        message: `Advanced ${result.advancedMinutes} minutes: ${result.fromIso} → ${result.toIso}`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ClockDirectionError) {
      return NextResponse.json(
        { success: false, error: { code: 'CLOCK_BACKWARDS', message: error.message } },
        { status: 409 }
      );
    }
    if (error instanceof ClockInputError) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: error.message } },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Error advancing the demo clock';
    console.error('[POST /api/simulator/clock]', error);
    return NextResponse.json(
      { success: false, error: { code: 'CLOCK_ERROR', message } },
      { status: 500 }
    );
  }
}
