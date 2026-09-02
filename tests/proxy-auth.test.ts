import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import { resetRateLimitState } from '../src/lib/utils/rate-limit';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session';

const SESSION_SECRET = 'ra05-test-session-secret';

function buildRequest(path: string, opts: { cookie?: string; headers?: Record<string, string>; ip?: string } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers['cookie'] = opts.cookie;
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;

  return new NextRequest(`http://localhost${path}`, { headers });
}

function sessionCookie() {
  const token = createSessionToken('admin');
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe('proxy — dashboard read routes require a session (RA-05)', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.stubEnv('SESSION_SECRET', SESSION_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects /api/customers with 401 when no session cookie is present', () => {
    const res = proxy(buildRequest('/api/customers', { ip: `10.0.0.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).toBe(401);
  });

  it('rejects /api/metrics with 401 for a tampered session cookie', () => {
    const res = proxy(
      buildRequest('/api/metrics', {
        cookie: `${SESSION_COOKIE_NAME}=not.a.valid.token`,
        ip: `10.0.1.${crypto.randomUUID().slice(0, 2)}`,
      })
    );
    expect(res.status).toBe(401);
  });

  it('allows /api/customers through with a valid session cookie', () => {
    const res = proxy(
      buildRequest('/api/customers', { cookie: sessionCookie(), ip: `10.0.2.${crypto.randomUUID().slice(0, 2)}` })
    );
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('proxy — /api/simulator/* gated on demo mode, not session (RA-05)', () => {
  beforeEach(() => {
    resetRateLimitState();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * The gate is the production build plus the opt-in, not the opt-in alone (RA-02): local
   * development has to be able to drive the simulator without setting a flag, or every
   * contributor's first `npm run dev` hits a 404 on the seed button.
   */
  it('returns 404 on a production build with no opt-in, session or not', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECOVERAI_DEMO_MODE', '');
    const res = proxy(buildRequest('/api/simulator/seed', { ip: `10.0.3.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).toBe(404);
  });

  it('blocks the clock route too, so a live deployment cannot move the agent clock', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECOVERAI_DEMO_MODE', '');
    const res = proxy(buildRequest('/api/simulator/clock', { ip: `10.0.5.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).toBe(404);
  });

  it('passes through with no session required when demo mode is on', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECOVERAI_DEMO_MODE', 'true');
    const res = proxy(buildRequest('/api/simulator/seed', { ip: `10.0.4.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(401);
  });

  /**
   * The one destructive route on an otherwise open demo surface: /api/simulator/seed truncates
   * every table. On a public demo a visitor may drive everything else, but resetting the batch
   * out from under a judge is the operator's call alone.
   */
  it('requires a session to reseed once auth is configured, while the rest stays open', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECOVERAI_DEMO_MODE', 'true');
    vi.stubEnv('SESSION_SECRET', 'a-real-session-secret-0123456789');

    const seed = proxy(buildRequest('/api/simulator/seed', { ip: `10.0.7.${crypto.randomUUID().slice(0, 2)}` }));
    expect(seed.status).toBe(401);

    for (const open of ['/api/simulator/webhook', '/api/simulator/pay', '/api/simulator/clock']) {
      const res = proxy(buildRequest(open, { ip: `10.0.8.${crypto.randomUUID().slice(0, 2)}` }));
      expect(res.status, open).not.toBe(401);
      expect(res.status, open).not.toBe(404);
    }
  });

  it('lets a logged-in operator reseed', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECOVERAI_DEMO_MODE', 'true');
    vi.stubEnv('SESSION_SECRET', 'a-real-session-secret-0123456789');

    const token = createSessionToken('admin');
    const req = new NextRequest(new URL('http://localhost/api/simulator/seed'), {
      headers: new Headers({
        'x-forwarded-for': `10.0.9.${crypto.randomUUID().slice(0, 2)}`,
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      }),
    });

    expect(proxy(req).status).not.toBe(401);
  });

  it('leaves the zero-config local seed button working with no auth set up', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SESSION_SECRET', '');

    // Nothing to protect on a developer's machine, and `npm run dev` must not require a login
    // before the very first seed.
    const res = proxy(buildRequest('/api/simulator/seed', { ip: `10.0.10.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(401);
  });

  it('passes through outside production without an opt-in', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RECOVERAI_DEMO_MODE', '');
    const res = proxy(buildRequest('/api/simulator/pay', { ip: `10.0.6.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(401);
  });
});

describe('proxy — /api/recovery/* accepts a session or a cron secret, fails closed (RA-05)', () => {
  beforeEach(() => {
    resetRateLimitState();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 (not 200) when unconfigured and no session is presented', () => {
    vi.stubEnv('RECOVERY_SWEEP_SECRET', '');
    vi.stubEnv('CRON_SECRET', '');
    const res = proxy(buildRequest('/api/recovery/sweep', { ip: `10.0.5.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).toBe(503);
  });

  it('returns 401 for a wrong secret when configured', () => {
    vi.stubEnv('RECOVERY_SWEEP_SECRET', 'correct-secret');
    const res = proxy(
      buildRequest('/api/recovery/trigger', {
        headers: { 'x-recovery-secret': 'wrong-secret' },
        ip: `10.0.6.${crypto.randomUUID().slice(0, 2)}`,
      })
    );
    expect(res.status).toBe(401);
  });

  it('passes through with the correct cron secret and no session', () => {
    vi.stubEnv('RECOVERY_SWEEP_SECRET', 'correct-secret');
    const res = proxy(
      buildRequest('/api/recovery/trigger', {
        headers: { authorization: 'Bearer correct-secret' },
        ip: `10.0.7.${crypto.randomUUID().slice(0, 2)}`,
      })
    );
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(503);
  });

  it('passes through with a valid dashboard session even with no secret configured', () => {
    vi.stubEnv('SESSION_SECRET', SESSION_SECRET);
    vi.stubEnv('RECOVERY_SWEEP_SECRET', '');
    vi.stubEnv('CRON_SECRET', '');
    const res = proxy(
      buildRequest('/api/recovery/trigger', { cookie: sessionCookie(), ip: `10.0.8.${crypto.randomUUID().slice(0, 2)}` })
    );
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(503);
  });
});

describe('proxy — webhook and auth routes are exempt from session/secret tiering (RA-05)', () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  it('lets an unauthenticated request through to the webhook route (it has its own HMAC check)', () => {
    const res = proxy(buildRequest('/api/webhooks/razorpay', { ip: `10.0.9.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(503);
  });

  it('lets an unauthenticated request through to /api/auth/login (otherwise no one could log in)', () => {
    const res = proxy(buildRequest('/api/auth/login', { ip: `10.0.10.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(401);
  });
});

describe('proxy — dashboard pages redirect to /login without a session (RA-05)', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.stubEnv('SESSION_SECRET', SESSION_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects the overview page to /login when unauthenticated', () => {
    const res = proxy(buildRequest('/', { ip: `10.0.11.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('renders the login page itself without a session', () => {
    const res = proxy(buildRequest('/login', { ip: `10.0.12.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(307);
  });

  it('renders the overview page through when a valid session is present', () => {
    const res = proxy(buildRequest('/', { cookie: sessionCookie(), ip: `10.0.13.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(307);
  });

  it('does not redirect-loop pages when SESSION_SECRET itself is unconfigured', () => {
    vi.stubEnv('SESSION_SECRET', '');
    const res = proxy(buildRequest('/', { ip: `10.0.14.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(307);
  });
});
