import crypto from 'crypto';
import { isTemplatePlaceholder } from '../config';

export const SESSION_COOKIE_NAME = 'recoverai_session';

/**
 * Below this, a signing key is not worth calling one. Deliberately treated as *unconfigured*
 * rather than accepted, so the proxy's "login isn't set up" path renders pages instead of
 * looping against a login that cannot be trusted.
 */
const MIN_SECRET_LENGTH = 16;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

/**
 * Stateless, signed session cookie: base64url(payload) + '.' +
 * HMAC-SHA256(payload, SESSION_SECRET). No server-side session store is
 * needed — the signature and embedded expiry are the whole trust boundary.
 */

/**
 * The signing key, or null when there isn't a usable one.
 *
 * `length > 0` was not enough. `.env.example` ships
 * `SESSION_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX`, and a `.env` copied verbatim — which is exactly
 * what the README tells a new contributor to do — satisfied that test. Two consequences, both
 * real: sessions were signed with a key published in this repository, so anyone could forge a
 * valid cookie; and the proxy's escape hatch for "login is not configured" never fired, so the
 * dashboard redirected to a login that could not succeed.
 */
function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;

  if (isTemplatePlaceholder(secret)) return null;
  if (secret!.length < MIN_SECRET_LENGTH) {
    console.warn(
      `[auth] SESSION_SECRET is ${secret!.length} characters; ${MIN_SECRET_LENGTH} is the minimum. ` +
        'Treating login as unconfigured.'
    );
    return null;
  }

  return secret!;
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
