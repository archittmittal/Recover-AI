/**
 * Contains untrusted text before it is interpolated into an LLM prompt.
 *
 * Fields such as a customer's name or a Razorpay error_reason ultimately trace
 * back to values an attacker can influence (webhook payload fields, a
 * customer's own reply text). Stripping structural characters and capping
 * length keeps that text from being mistaken for prompt instructions by the
 * model — it does not by itself guarantee the model ignores injected
 * instructions, which is why generateRecoveryMessage still validates the
 * model's output against the real invariants (see messenger.ts).
 */
export function sanitizePromptInput(value: string, maxLength = 120): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
