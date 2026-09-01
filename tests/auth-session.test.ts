import { describe, it, expect, afterEach, vi } from 'vitest';
import { timingSafeStringEqual } from '../src/lib/auth/crypto';
import { createSessionToken, verifySessionToken, isSessionConfigured } from '../src/lib/auth/session';

describe('timingSafeStringEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeStringEqual('secret123', 'secret123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(timingSafeStringEqual('secret123', 'secret124')).toBe(false);
  });

  it('returns false for different-length strings without throwing', () => {
    expect(timingSafeStringEqual('short', 'a-much-longer-string')).toBe(false);
  });
});

describe('session token creation and verification', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports unconfigured when SESSION_SECRET is unset', () => {
    vi.stubEnv('SESSION_SECRET', '');
    expect(isSessionConfigured()).toBe(false);
    expect(createSessionToken('admin')).toBeNull();
  });

  it('creates and verifies a valid token', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret-a');
    const token = createSessionToken('admin');
    expect(token).toBeTruthy();
    expect(verifySessionToken(token)).toBe(true);
  });

  it('rejects a token signed with a different secret', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret-a');
    const token = createSessionToken('admin');

    vi.stubEnv('SESSION_SECRET', 'test-secret-b');
    expect(verifySessionToken(token)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret-a');
    const token = createSessionToken('admin')!;
    const [payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ u: 'attacker', exp: Date.now() + 999999 }), 'utf-8').toString(
      'base64url'
    );
    expect(verifySessionToken(`${tamperedPayload}.${signature}`)).toBe(false);
    void payload;
  });

  it('rejects an expired token', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret-a');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now - 13 * 60 * 60 * 1000); // 13h ago, TTL is 12h
    const token = createSessionToken('admin');
    vi.spyOn(Date, 'now').mockReturnValue(now);

    expect(verifySessionToken(token)).toBe(false);
    vi.restoreAllMocks();
  });

  it('rejects malformed tokens', () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret-a');
    expect(verifySessionToken('not-a-real-token')).toBe(false);
    expect(verifySessionToken(null)).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });
});
