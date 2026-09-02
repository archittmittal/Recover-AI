import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import { isSessionConfigured, createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session';
import { POST as login } from '../src/app/api/auth/login/route';
import { resetRateLimitState } from '../src/lib/utils/rate-limit';

/**
 * A `.env` copied verbatim from `.env.example` — which is exactly what the README tells a new
 * contributor to do — left `SESSION_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX`. The old check was
 * `secret.length > 0`, so that counted as configured, with two consequences:
 *
 *   1. Sessions were signed with a key published in this repository. Anyone could forge a valid
 *      cookie for any deployment that had not replaced it.
 *   2. RA-05's escape hatch for "login is not configured" never fired, so every page redirected
 *      to a login that could not succeed — the exact trap that code was written to avoid.
 *
 * The same blindness made `/api/recovery/*` answer 401 ("your secret is wrong") where the honest
 * answer was 503 ("no secret is configured here").
 */

const PLACEHOLDER = 'XXXXXXXXXXXXXXXXXXXXXXXX';
const REAL_SECRET = 'a-real-secret-0123456789abcdef';

const buildRequest = (path: string, ip: string) =>
  new NextRequest(new URL(`http://localhost${path}`), {
    headers: new Headers({ 'x-forwarded-for': ip }),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimitState();
});

describe('placeholder session secret', () => {
  it('is not a configured secret', () => {
    vi.stubEnv('SESSION_SECRET', PLACEHOLDER);
    expect(isSessionConfigured()).toBe(false);
    expect(createSessionToken('admin')).toBeNull();
  });

  it('is not rescued by being long', () => {
    vi.stubEnv('SESSION_SECRET', `${PLACEHOLDER}${PLACEHOLDER}`);
    expect(isSessionConfigured()).toBe(false);
  });

  it('rejects a secret too short to be worth signing with', () => {
    vi.stubEnv('SESSION_SECRET', 'short');
    expect(isSessionConfigured()).toBe(false);
  });

  it('accepts a real secret', () => {
    vi.stubEnv('SESSION_SECRET', REAL_SECRET);
    expect(isSessionConfigured()).toBe(true);
    expect(createSessionToken('admin')).toContain('.');
  });

  it('lets pages render rather than looping to an impossible login', () => {
    vi.stubEnv('SESSION_SECRET', PLACEHOLDER);
    const res = proxy(buildRequest('/', '10.9.0.1'));
    // Not a redirect: the operator sees the dashboard shell and the misconfiguration is
    // visible, while every API tier below still refuses.
    expect(res.status).not.toBe(307);
  });

  it('still refuses the API with a placeholder secret', () => {
    vi.stubEnv('SESSION_SECRET', PLACEHOLDER);
    const res = proxy(buildRequest('/api/customers', '10.9.0.2'));
    expect(res.status).toBe(401);
  });
});

describe('placeholder login credentials', () => {
  const post = (body: unknown) =>
    login(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) as never
    );

  it('answers 503, not 401, when the credentials are still the template', async () => {
    vi.stubEnv('SESSION_SECRET', REAL_SECRET);
    vi.stubEnv('DASHBOARD_USERNAME', 'admin');
    vi.stubEnv('DASHBOARD_PASSWORD', PLACEHOLDER);

    const res = await post({ username: 'admin', password: PLACEHOLDER });
    // 401 would be a lie: nothing the operator types can succeed.
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('NOT_CONFIGURED');
  });

  it('will not issue a session signed with the repository placeholder', async () => {
    vi.stubEnv('SESSION_SECRET', PLACEHOLDER);
    vi.stubEnv('DASHBOARD_USERNAME', 'admin');
    vi.stubEnv('DASHBOARD_PASSWORD', 'correct-horse-battery-staple');

    const res = await post({ username: 'admin', password: 'correct-horse-battery-staple' });
    expect(res.status).toBe(503);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('issues a cookie once everything is real', async () => {
    vi.stubEnv('SESSION_SECRET', REAL_SECRET);
    vi.stubEnv('DASHBOARD_USERNAME', 'admin');
    vi.stubEnv('DASHBOARD_PASSWORD', 'correct-horse-battery-staple');

    const res = await post({ username: 'admin', password: 'correct-horse-battery-staple' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain(SESSION_COOKIE_NAME);
  });
});

describe('placeholder cron secret', () => {
  it('fails closed with 503 rather than claiming the presented secret was wrong', () => {
    vi.stubEnv('SESSION_SECRET', REAL_SECRET);
    vi.stubEnv('RECOVERY_SWEEP_SECRET', PLACEHOLDER);

    const res = proxy(buildRequest('/api/recovery/trigger', '10.9.0.3'));
    expect(res.status).toBe(503);
  });

  it('rejects a wrong secret with 401 once a real one is configured', () => {
    vi.stubEnv('SESSION_SECRET', REAL_SECRET);
    vi.stubEnv('RECOVERY_SWEEP_SECRET', 'a-real-cron-secret-0123456789');

    const req = new NextRequest(new URL('http://localhost/api/recovery/trigger'), {
      headers: new Headers({ 'x-forwarded-for': '10.9.0.4', 'x-recovery-secret': 'wrong' }),
    });
    expect(proxy(req).status).toBe(401);
  });
});
