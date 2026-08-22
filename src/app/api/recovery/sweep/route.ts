import { NextRequest, NextResponse } from 'next/server';
import { runCheckoutAbandonmentSweep } from '@/lib/recovery/abandonment-sweep';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Optional cron/shared-secret check if configured in environment
    const configuredSecret = process.env.RECOVERY_SWEEP_SECRET || process.env.CRON_SECRET;
    if (configuredSecret) {
      const authHeader = req.headers.get('authorization');
      const secretHeader = req.headers.get('x-recovery-secret');
      const token = authHeader?.replace(/^Bearer\s+/i, '') || secretHeader;

      if (!token || token !== configuredSecret) {
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing sweep secret' } },
          { status: 401 }
        );
      }
    }

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
