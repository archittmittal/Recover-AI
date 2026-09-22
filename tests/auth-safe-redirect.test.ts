import { describe, it, expect } from 'vitest';
import { safeNextPath } from '../src/lib/auth/safe-redirect';

/**
 * RA-05 — the login page redirects to whatever `?next=` says once credentials are accepted.
 * Unchecked, that is an open redirect on the one page where a victim has just demonstrated
 * they trust this application.
 */
describe('safeNextPath', () => {
  it('keeps a same-origin path, including its query and fragment', () => {
    expect(safeNextPath('/customers')).toBe('/customers');
    expect(safeNextPath('/customers/cust_1?tab=audit#top')).toBe('/customers/cust_1?tab=audit#top');
  });

  it('falls back for anything that could leave the origin', () => {
    for (const hostile of [
      'https://evil.example/phish',
      'http://evil.example',
      '//evil.example', // protocol-relative: the browser supplies the scheme
      '/\\evil.example', // backslashes are normalised to slashes by some browsers
      '/path\\..\\evil',
      'javascript:alert(1)',
      'evil.example',
      '/foo\nSet-Cookie: x=1', // control characters can smuggle a second header
    ]) {
      expect(safeNextPath(hostile), `expected "${hostile}" to be rejected`).toBe('/');
    }
  });

  it('falls back when the parameter is absent or empty', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath(null, '/dashboard')).toBe('/dashboard');
  });
});
