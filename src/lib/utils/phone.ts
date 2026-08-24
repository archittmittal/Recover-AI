/**
 * Normalizes a raw contact number to E.164 (+<countrycode><number>), or
 * returns null if it cannot be normalized. Assumes a bare 10-digit number
 * (no leading '+') is an Indian mobile number, since this product targets
 * Razorpay's India merchant base.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digitsAndPlus = trimmed.replace(/[^\d+]/g, '');

  if (digitsAndPlus.startsWith('+')) {
    const digits = digitsAndPlus.slice(1);
    return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
  }

  if (/^\d{10}$/.test(digitsAndPlus)) {
    return `+91${digitsAndPlus}`;
  }

  if (/^\d{8,15}$/.test(digitsAndPlus)) {
    return `+${digitsAndPlus}`;
  }

  return null;
}
