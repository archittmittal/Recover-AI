import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'recoverai_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

/**
 * Stateless, signed session cookie: base64url(payload) + '.' +
 * HMAC-SHA256(payload, SESSION_SECRET). No server-side session store is
 * needed — the signature and embedded expiry are the whole trust boundary.
 */

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

export function isSessionConfigured(): boolean {
  return getSessionSecret() !== null;
}

export function createSessionToken(username: string): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const payload = JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS });
  const payloadB64 = Buffer.from(payload, 'utf-8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;

  const secret = getSessionSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
      u?: unknown;
      exp?: unknown;
    };
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}
