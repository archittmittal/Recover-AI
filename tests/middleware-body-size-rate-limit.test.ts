import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';
import { resetRateLimitState, RATE_LIMIT_CAPACITY } from '../src/lib/utils/rate-limit';

function buildRequest(opts: { contentLength?: number; ip?: string; path?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.contentLength !== undefined) headers['content-length'] = String(opts.contentLength);
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;

  return new NextRequest(`http://localhost${opts.path ?? '/api/webhooks/razorpay'}`, {
    method: 'POST',
    headers,
  });
}

describe('middleware — body size cap (RA-20)', () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  it('rejects a body over 64KB with 413 before any parsing', () => {
    const res = middleware(buildRequest({ contentLength: 64 * 1024 + 1, ip: `1.1.1.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).toBe(413);
  });

  it('accepts a body exactly at the 64KB boundary', () => {
    const res = middleware(buildRequest({ contentLength: 64 * 1024, ip: `1.1.2.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(413);
  });

  it('accepts a small legitimate webhook body', () => {
    const res = middleware(buildRequest({ contentLength: 512, ip: `1.1.3.${crypto.randomUUID().slice(0, 2)}` }));
    expect(res.status).not.toBe(413);
    expect(res.status).not.toBe(429);
  });
});

describe('middleware — per-IP rate limit (RA-20)', () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  it('allows a burst up to the documented capacity, then returns 429 with Retry-After', () => {
    const ip = `2.2.2.${crypto.randomUUID().slice(0, 2)}`;

    for (let i = 0; i < RATE_LIMIT_CAPACITY; i++) {
      const res = middleware(buildRequest({ contentLength: 100, ip }));
      expect(res.status).not.toBe(429);
    }

    const overLimit = middleware(buildRequest({ contentLength: 100, ip }));
    expect(overLimit.status).toBe(429);
    expect(overLimit.headers.get('Retry-After')).toBeTruthy();
  });

  it('tracks rate limits independently per IP', () => {
    const ipA = `3.3.3.${crypto.randomUUID().slice(0, 2)}`;
    const ipB = `3.3.4.${crypto.randomUUID().slice(0, 2)}`;

    for (let i = 0; i < RATE_LIMIT_CAPACITY; i++) {
      middleware(buildRequest({ contentLength: 100, ip: ipA }));
    }
    const ipAOverLimit = middleware(buildRequest({ contentLength: 100, ip: ipA }));
    expect(ipAOverLimit.status).toBe(429);

    // A different IP still has its own full bucket.
    const ipBFirstRequest = middleware(buildRequest({ contentLength: 100, ip: ipB }));
    expect(ipBFirstRequest.status).not.toBe(429);
  });

  it('does not rate-limit normal, low-volume legitimate traffic', () => {
    const ip = `4.4.4.${crypto.randomUUID().slice(0, 2)}`;

    for (let i = 0; i < 5; i++) {
      const res = middleware(buildRequest({ contentLength: 200, ip }));
      expect(res.status).not.toBe(429);
      expect(res.status).not.toBe(413);
    }
  });
});
