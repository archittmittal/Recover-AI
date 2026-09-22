import { describe, it, expect, vi, afterEach } from 'vitest';
import { middleware } from '../src/proxy';

/**
 * RA-02: /api/simulator/* (seed, pay, reply) has no authentication and
 * /api/simulator/seed truncates every table, including audit_logs. Blocking
 * it in a real production deployment (unless explicitly opted into as a demo
 * environment) is the load-bearing part of the fix.
 */
describe('simulator route middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('blocks with 404 in a production build with no opt-in', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECOVERAI_DEMO_MODE', '');

    const res = middleware();
    expect(res.status).toBe(404);
  });

  it('blocks with 404 in production when the opt-in is set to anything other than "true"', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECOVERAI_DEMO_MODE', 'yes');

    const res = middleware();
    expect(res.status).toBe(404);
  });

  it('passes through in production when RECOVERAI_DEMO_MODE=true', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECOVERAI_DEMO_MODE', 'true');

    const res = middleware();
    expect(res.status).not.toBe(404);
  });

  it('passes through outside production regardless of the opt-in', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RECOVERAI_DEMO_MODE', '');

    const res = middleware();
    expect(res.status).not.toBe(404);
  });
});
