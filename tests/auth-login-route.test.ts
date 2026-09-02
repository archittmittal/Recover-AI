import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { SESSION_COOKIE_NAME, verifySessionToken } from '../src/lib/auth/session';

function buildLoginRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login (RA-05)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 when login is not configured', async () => {
    vi.stubEnv('DASHBOARD_USERNAME', '');
    vi.stubEnv('DASHBOARD_PASSWORD', '');
    vi.stubEnv('SESSION_SECRET', '');

    const res = await login(buildLoginRequest({ username: 'admin', password: 'anything' }));
    expect(res.status).toBe(503);
  });

  it('rejects wrong credentials with 401 and sets no cookie', async () => {
    vi.stubEnv('DASHBOARD_USERNAME', 'admin');
    vi.stubEnv('DASHBOARD_PASSWORD', 'correct-horse-battery-staple');
    vi.stubEnv('SESSION_SECRET', 'test-secret-0123456789abcdef');

    const res = await login(buildLoginRequest({ username: 'admin', password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('accepts correct credentials and sets a valid, httpOnly session cookie', async () => {
    vi.stubEnv('DASHBOARD_USERNAME', 'admin');
    vi.stubEnv('DASHBOARD_PASSWORD', 'correct-horse-battery-staple');
    vi.stubEnv('SESSION_SECRET', 'test-secret-0123456789abcdef');

    const res = await login(buildLoginRequest({ username: 'admin', password: 'correct-horse-battery-staple' }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie.toLowerCase()).toContain('httponly');

    const tokenMatch = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    expect(tokenMatch).toBeTruthy();
    expect(verifySessionToken(tokenMatch![1])).toBe(true);
  });

  it('rejects a non-string username/password payload without throwing', async () => {
    vi.stubEnv('DASHBOARD_USERNAME', 'admin');
    vi.stubEnv('DASHBOARD_PASSWORD', 'correct-horse-battery-staple');
    vi.stubEnv('SESSION_SECRET', 'test-secret-0123456789abcdef');

    const res = await login(buildLoginRequest({ username: 12345, password: null }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout (RA-05)', () => {
  it('clears the session cookie', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});
