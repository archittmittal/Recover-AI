/**
 * Rupee formatting, in one place.
 *
 * `(paise / 100).toLocaleString('en-IN')` drops a trailing zero, so 73280 paise rendered as
 * "₹732.8" — in customer-facing WhatsApp and SMS copy, in the voice script, and on the
 * dashboard. A malformed amount in a payment message is the one formatting bug this project
 * cannot afford, and it contradicted the claim that monetary values are always read from the
 * database rather than improvised.
 *
 * Whole rupees stay whole (₹2,499, not ₹2,499.00); anything with paise keeps both digits.
 */
export function formatPaise(paise: number): string {
  return `₹${formatRupeeAmount((paise || 0) / 100)}`;
}

/** As above, for a value already converted to rupees. */
export function formatRupees(rupees: number): string {
  return `₹${formatRupeeAmount(rupees || 0)}`;
}

function formatRupeeAmount(rupees: number): string {
  const hasPaise = Math.round(rupees * 100) % 100 !== 0;
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
}
