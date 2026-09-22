import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';

/**
 * The login page offers evaluators a one-click sign-in (RA-27). Its credentials are literals in
 * the page source — deliberately, because a judge holding the URL should not have to ask anyone
 * for a password — which creates a coupling that is easy to break silently: change the constant
 * without changing the deployment's environment, or vice versa, and the button answers 401 in
 * front of the one person it exists to help.
 *
 * These tests hold both ends of that coupling together, and hold the gate that keeps the button
 * off a deployment carrying real records.
 */

const { POST: login } = await import('../src/app/api/auth/login/route');

const source = fs.readFileSync('src/app/login/page.tsx', 'utf8');

function constantFromPage(name: string): string {
  const match = source.match(new RegExp(`const ${name} = '([^']+)'`));
  if (!match) throw new Error(`${name} is no longer declared in the login page`);
  return match[1];
}

afterEach(() => vi.unstubAllEnvs());

const post = (body: unknown) =>
  login(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );

describe('evaluator quick login', () => {
  it('declares both credentials on the page', () => {
    expect(constantFromPage('DEMO_USERNAME')).toBeTruthy();
    expect(constantFromPage('DEMO_PASSWORD')).toBeTruthy();
  });

  it('signs in with exactly the credentials the page publishes', async () => {
    const username = constantFromPage('DEMO_USERNAME');
    const password = constantFromPage('DEMO_PASSWORD');

    vi.stubEnv('SESSION_SECRET', 'a-real-session-secret-0123456789');
    vi.stubEnv('DASHBOARD_USERNAME', username);
    vi.stubEnv('DASHBOARD_PASSWORD', password);

    const res = await post({ username, password });

    // If this fails, the button is broken for the evaluator it was built for.
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('recoverai_session');
  });

  it('is still just a normal login — a wrong password is refused', async () => {
    vi.stubEnv('SESSION_SECRET', 'a-real-session-secret-0123456789');
    vi.stubEnv('DASHBOARD_USERNAME', constantFromPage('DEMO_USERNAME'));
    vi.stubEnv('DASHBOARD_PASSWORD', constantFromPage('DEMO_PASSWORD'));

    const res = await post({ username: constantFromPage('DEMO_USERNAME'), password: 'not-it' });
    expect(res.status).toBe(401);
  });

  /**
   * The button is rendered only behind NEXT_PUBLIC_DEMO_LOGIN. A deployment holding real customer
   * records leaves it unset and the button does not exist — publishing a password next to real
   * PII would undo RA-05 entirely.
   */
  it('renders the button only when the demo flag is set', () => {
    expect(source).toContain("process.env.NEXT_PUBLIC_DEMO_LOGIN === 'true'");
    expect(source).toMatch(/demoLoginEnabled\s*&&/);
  });

  it('tells the reader the records behind it are synthetic', () => {
    expect(source).toMatch(/synthetic/i);
  });
});
