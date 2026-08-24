/**
 * Masks a phone number, keeping only the country code and last 4 digits
 * visible (e.g. "+919876543210" -> "+91******3210"). Values that don't
 * match the expected shape are returned unchanged.
 */
export function maskPhone(phone: string): string {
  return phone.replace(/^(\+\d{2})\d+(\d{4})$/, '$1******$2');
}

/**
 * Masks an email address, keeping only the first character of the local
 * part and the full domain (e.g. "aarav@example.com" -> "a***@example.com").
 */
export function maskEmail(email: string): string {
  return email.replace(/^(.).*(@.*)$/, '$1***$2');
}

const PHONE_PATTERN = /^\+?\d[\d\s-]{7,14}\d$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (EMAIL_PATTERN.test(value)) return maskEmail(value);
    if (PHONE_PATTERN.test(value)) return maskPhone(value.replace(/[\s-]/g, ''));
    return value;
  }
  if (Array.isArray(value)) return value.map(maskValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = maskValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursively walks an object and masks any string value that is, in its
 * entirety, a phone number or email address, before it is persisted (see
 * writeAuditLog / RA-17). This does not scan free-text fields for embedded
 * phone/email substrings — only values that are themselves a phone number
 * or email.
 */
export function maskPiiDeep<T>(value: T): T {
  return maskValue(value) as T;
}
