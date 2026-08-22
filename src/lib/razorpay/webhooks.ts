import crypto from 'crypto';

/**
 * Validates the Razorpay webhook signature using HMAC-SHA256 in constant time.
 * Timing-safe comparison prevents byte-by-byte timing attack oracles.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(signature, 'hex');

    // Length check first: crypto.timingSafeEqual throws on length mismatch
    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch (error) {
    console.error('[razorpay:verifyWebhookSignature] Error verifying signature:', error);
    return false;
  }
}

/**
 * Computes a SHA-256 hash of the raw webhook body for idempotency tracking.
 */
export function computePayloadHash(rawBody: string): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}
