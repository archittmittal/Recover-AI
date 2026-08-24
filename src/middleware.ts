import { NextResponse } from 'next/server';

/**
 * Guards the demo/simulator surface (`/api/simulator/*`) from being reachable
 * on a real production deployment.
 *
 * These routes exist to drive the buildathon demo dashboard — seeding data,
 * simulating a customer payment, injecting a simulated customer reply — and
 * none of them are authenticated (RA-02, RA-05). `/api/simulator/seed` in
 * particular truncates every table, including the append-only `audit_logs`.
 * That is an acceptable, explicitly-invoked reset button for a demo
 * environment and an unacceptable one for a deployment handling real
 * Razorpay traffic.
 *
 * Blocked whenever NODE_ENV === 'production', unless the deployment opts in
 * with RECOVERAI_DEMO_MODE=true (e.g. a hosted demo/judging environment that
 * is intentionally public and reset-able). Anything short of a production
 * build (local dev, CI, preview deployments) is left untouched so the
 * existing demo workflow keeps working with zero new required configuration.
 */
export function middleware() {
  const isProduction = process.env.NODE_ENV === 'production';
  const demoModeOptIn = process.env.RECOVERAI_DEMO_MODE === 'true';

  if (isProduction && !demoModeOptIn) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
      { status: 404 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/simulator/:path*',
};
