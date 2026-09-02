import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { timingSafeStringEqual } from '@/lib/auth/crypto';
import { isSessionConfigured, verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isTemplatePlaceholder } from '@/lib/config';

/**
 * One gate in front of every route (RA-05).
 *
 * Before this, no route in the application had an authenticated caller: `/api/customers`
 * returned every customer's name, email and phone to anyone who asked, `/api/metrics` exposed
 * whole-book revenue, and `/api/recovery/trigger` let an anonymous caller make the system
 * message real people. The one route that gestured at auth — the sweep's shared secret — only
 * checked it `if (configuredSecret)`, so it failed open whenever the env var was unset.
 *
 * Lives in `proxy.ts` rather than `middleware.ts`: the middleware convention is deprecated in
 * Next.js 16 and renamed to proxy, which defaults to the Node.js runtime — which is what lets
 * the session HMAC below use `node:crypto` at all.
 */

// Reject oversized bodies before any parsing/hashing work happens (see RA-20). This is a
// first-line check on the declared Content-Length, not a substitute for a real streaming cap —
// a request omitting the header (e.g. chunked transfer-encoding) isn't caught here.
const MAX_BODY_BYTES = 64 * 1024;

function unauthorizedJson(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message } },
    { status: 401 }
  );
}

function unavailableJson(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_CONFIGURED', message } },
    { status: 503 }
  );
}

function notFoundJson() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
    { status: 404 }
  );
}

function hasValidSession(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * The demo surface is blocked on a production build unless explicitly opted in (RA-02).
 *
 * Deliberately *not* gated on a session: the hosted demo is meant to be usable by an evaluator
 * who has no account, and `RECOVERAI_DEMO_MODE` is the switch that says a deployment is that
 * demo. A deployment carrying real Razorpay traffic leaves it unset and these routes 404 —
 * including `/api/simulator/clock`, which would otherwise let a caller move time.
 */
function simulatorSurfaceBlocked(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const demoModeOptIn = process.env.RECOVERAI_DEMO_MODE === 'true';
  return isProduction && !demoModeOptIn;
}

function hasValidCronSecret(req: NextRequest): { configured: boolean; valid: boolean } {
  const configuredSecret = process.env.RECOVERY_SWEEP_SECRET || process.env.CRON_SECRET || '';

  // A template placeholder is not a configured secret. Treating it as one made this route
  // answer 401 ("your secret is wrong") where the honest answer is 503 ("this endpoint has no
  // secret set up"), and would have accepted a value published in this repository.
  if (isTemplatePlaceholder(configuredSecret)) {
    return { configured: false, valid: false };
  }

  const authHeader = req.headers.get('authorization');
  const secretHeader = req.headers.get('x-recovery-secret');
  const token = authHeader?.replace(/^Bearer\s+/i, '') || secretHeader || '';

  return {
    configured: true,
    valid: token.length > 0 && timingSafeStringEqual(token, configuredSecret),
  };
}

export function proxy(req?: NextRequest): NextResponse {
  // Called with no request only by the simulator-guard tests, which assert the environment
  // policy in isolation. Everything below needs a request to reason about.
  if (!req) {
    return simulatorSurfaceBlocked() ? notFoundJson() : NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  if (isApiRoute) {
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 64KB limit' },
        },
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

  // The Razorpay webhook authenticates itself with an HMAC signature (RA-01), and login/logout
  // must be reachable while unauthenticated — both are exempt from the tiering below. Note the
  // webhook is not unguarded: it verifies its own signature and rejects an unsigned request.
  if (pathname.startsWith('/api/webhooks/') || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/simulator/')) {
    if (simulatorSurfaceBlocked()) return notFoundJson();

    // Within the demo surface, one route is not like the others: /api/simulator/seed truncates
    // every table. Anyone may drive the demo — inject a webhook, pay, reply, move the clock —
    // but only the operator may reset it, so a visitor cannot wipe the batch mid-judging.
    //
    // Gated on a session only once one is configured at all: on a developer's machine with no
    // SESSION_SECRET there is nothing to protect and the zero-config seed button must keep
    // working exactly as it does today.
    if (pathname.startsWith('/api/simulator/seed') && isSessionConfigured() && !hasValidSession(req)) {
      return unauthorizedJson(
        'Reseeding the batch requires a dashboard session. The rest of the simulator is open.'
      );
    }

    return NextResponse.next();
  }

  // /api/recovery/*: the dashboard's own "Run Recovery" button calls these directly, so a valid
  // session is accepted alongside the cron secret an external scheduler would use. Unlike the
  // old inline check in sweep/route.ts, an unconfigured secret with no session now fails closed
  // (503) rather than open (200).
  if (pathname.startsWith('/api/recovery/')) {
    if (hasValidSession(req)) {
      return NextResponse.next();
    }
    const cron = hasValidCronSecret(req);
    if (cron.valid) {
      return NextResponse.next();
    }
    if (!cron.configured) {
      return unavailableJson(
        'Recovery endpoint has no cron secret configured and no session was presented'
      );
    }
    return unauthorizedJson('Invalid or missing recovery secret');
  }

  // Every other /api/* route (customers, metrics, ...) is dashboard data — and the customer
  // routes carry the PII this issue exists to stop leaking.
  if (isApiRoute) {
    if (!hasValidSession(req)) {
      return unauthorizedJson('Authentication required');
    }
    return NextResponse.next();
  }

  // Page routes: the login page is always reachable; everything else redirects to it.
  if (pathname === '/login') {
    return NextResponse.next();
  }

  if (!hasValidSession(req)) {
    if (!isSessionConfigured()) {
      // Login is not configured at all (SESSION_SECRET unset). Redirecting would trap the
      // operator in a loop against a login page that cannot succeed, so pages render and the
      // misconfiguration stays visible. The API tiers above still refuse, so this leaks nothing.
      return NextResponse.next();
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/** Deprecated alias: `middleware.ts` was renamed to `proxy.ts` in Next.js 16. */
export const middleware = proxy;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
