import { NextResponse } from 'next/server';
import { runCheckoutAbandonmentSweep } from '@/lib/recovery/abandonment-sweep';

export const dynamic = 'force-dynamic';

// Authorization (dashboard session or cron secret, failing closed if the
// secret is unconfigured) is enforced in src/proxy.ts before this handler
// ever runs — see RA-05.
export async function POST() {
  try {
    const result = await runCheckoutAbandonmentSweep();
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error executing abandonment sweep';
    console.error('[POST /api/recovery/sweep]', error);
    return NextResponse.json(
      { success: false, error: { code: 'SWEEP_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
