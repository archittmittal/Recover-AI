/**
 * Sanitises the `next` parameter the proxy attaches when it bounces an unauthenticated request
 * to the login page.
 *
 * Without this, `/login?next=https://evil.example/phish` sends the user off-site the moment
 * they authenticate — an open redirect, and a good one, because the victim arrives having just
 * proved they trust this dashboard. Only a same-origin path is ever returned.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;

  // Must be a rooted path. Rejects "https://evil.example", "//evil.example" (protocol-relative,
  // which a browser resolves against the current scheme), "/\\evil.example" (backslashes are
  // normalised to slashes by some browsers), and anything with a scheme or credentials.
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('\\')) return fallback;

  // A control character or newline can smuggle a second header or break the URL parse.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  return raw;
}
