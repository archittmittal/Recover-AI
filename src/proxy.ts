import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { timingSafeStringEqual } from '@/lib/auth/crypto';
import { isSessionConfigured, verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

// Reject oversized bodies before any parsing/hashing work happens (see
// RA-20). This is a first-line check on the declared Content-Length, not a
// substitute for a real streaming cap — a request omitting the header
// (e.g. chunked transfer-encoding) isn't caught here.
const MAX_BODY_BYTES = 64 * 1024;

function unauthorizedJson(message: string) {
  return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
}

function unavailableJson(message: string) {
  return NextResponse.json({ success: false, error: { code: 'NOT_CONFIGURED', message } }, { status: 503 });
}

function hasValidSession(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
}

function hasValidCronSecret(req: NextRequest): { configured: boolean; valid: boolean } {
  const configuredSecret = process.env.RECOVERY_SWEEP_SECRET || process.env.CRON_SECRET || '';
  if (!configuredSecret) {
    return { configured: false, valid: false };
  }

  const authHeader = req.headers.get('authorization');
  const secretHeader = req.headers.get('x-recovery-secret');
  const token = authHeader?.replace(/^Bearer\s+/i, '') || secretHeader || '';

  return { configured: true, valid: token.length > 0 && timingSafeStringEqual(token, configuredSecret) };
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  if (isApiRoute) {
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 64KB limit' } },
        { status: 413 }
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const { allowed, retryAfterSeconds } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }
  }

  // The Razorpay webhook authenticates itself with an HMAC signature (see
  // RA-01) and login/logout must be reachable while unauthenticated — both
  // are exempt from the session/secret tiering below.
  if (pathname.startsWith('/api/webhooks/') || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // /api/simulator/*: a public demo tool, gated on demo mode rather than a
  // session, matching the existing RECOVERAI_DEMO_MODE convention.
  if (pathname.startsWith('/api/simulator/')) {
    if (process.env.RECOVERAI_DEMO_MODE !== 'true') {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
        { status: 404 }
      );
    }
    return NextResponse.next();
  }

  // /api/recovery/*: the dashboard's own "Run Recovery"/"Sweep" buttons call
  // these directly, so a valid dashboard session is accepted, in addition to
  // the cron secret for external schedulers. Unlike the old sweep route, an
  // unconfigured secret with no session now fails closed (503), not open.
  if (pathname.startsWith('/api/recovery/')) {
    if (hasValidSession(req)) {
      return NextResponse.next();
    }
    const cron = hasValidCronSecret(req);
    if (cron.valid) {
      return NextResponse.next();
    }
    if (!cron.configured) {
      return unavailableJson('Recovery endpoint has no cron secret configured and no session was presented');
    }
    return unauthorizedJson('Invalid or missing recovery secret');
  }

  if (isApiRoute) {
    // Every other /api/* route (customers, metrics, ...) is dashboard data:
    // require a valid session.
    if (!hasValidSession(req)) {
      return unauthorizedJson('Authentication required');
    }
    return NextResponse.next();
  }

  // Page routes: allow the login page itself and Next.js internals through
  // unauthenticated; redirect everything else to /login when there's no
  // valid session.
  if (pathname === '/login') {
    return NextResponse.next();
  }

  if (!hasValidSession(req)) {
    if (!isSessionConfigured()) {
      // Login isn't configured at all (SESSION_SECRET missing) — don't trap
      // the operator in an unusable redirect loop; let pages render so the
      // misconfiguration is visible instead of silently redirecting forever.
      return NextResponse.next();
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
