import crypto from 'crypto';

/**
 * Constant-time string comparison. Length is checked first (a length
 * mismatch is public information, not something worth hiding), then the
 * actual bytes are compared via crypto.timingSafeEqual so a byte-by-byte
 * timing oracle can't be used to guess a secret one character at a time.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}
