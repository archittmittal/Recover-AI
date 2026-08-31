/**
 * One explicit switch for whether this process talks to real services.
 *
 * Mock-vs-live used to be inferred separately in three places by checking whether a
 * credential contained the string `XXXXXXXX` (src/lib/ai/gemini.ts, src/lib/razorpay/client.ts,
 * and the webhook route). Inferring a deployment decision from the shape of a credential means
 * a typo, a truncated paste, or a rotated-but-unset key silently downgrades the process to
 * simulated behaviour with no signal — which is exactly how the project reached a state where
 * no Gemini call and no Razorpay call had ever actually run (RA-24).
 *
 * The mode is now declared, not guessed, and `live` refuses to start without real credentials.
 */

export type RecoverAiMode = 'mock' | 'live';

/** Credentials still holding their .env.example placeholder value. */
function isPlaceholder(value: string | undefined): boolean {
  return !value || value.includes('XXXXXXXX') || value.includes('mock');
}

export function getMode(): RecoverAiMode {
  const raw = (process.env.RECOVERAI_MODE || '').trim().toLowerCase();
  if (raw === 'live') return 'live';
  if (raw === 'mock' || raw === '') return 'mock';
  throw new Error(
    `[config] Invalid RECOVERAI_MODE="${raw}". Expected "mock" or "live".`
  );
}

export function isLive(): boolean {
  return getMode() === 'live';
}

/**
 * Returns a credential, or throws in live mode when it is absent or still a placeholder.
 * In mock mode a missing credential is expected and returns undefined.
 */
/**
 * Non-throwing read: returns the credential, or undefined when absent or still a placeholder.
 * For call sites that must degrade gracefully rather than fail startup — the webhook route
 * answers 503 on a missing secret and must not turn that into an unhandled 500.
 */
export function readCredential(name: string): string | undefined {
  const value = process.env[name];
  return isPlaceholder(value) ? undefined : value;
}

export function requireCredential(name: string): string | undefined {
  const value = process.env[name];
  if (!isLive()) return isPlaceholder(value) ? undefined : value;

  if (isPlaceholder(value)) {
    throw new Error(
      `[config] RECOVERAI_MODE=live but ${name} is missing or still a placeholder. ` +
        `Set a real value, or run with RECOVERAI_MODE=mock.`
    );
  }
  return value;
}

/**
 * The Gemini model id.
 *
 * Pinned rather than floating: `gemini-flash-latest` would let Google move the model under a
 * recorded demo. Overridable so a retirement does not require a code change — `gemini-2.5-flash`
 * was hardcoded here and had been retired for new API keys, which meant every message silently
 * took the template fallback.
 */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
}

/** One line at startup naming what is actually wired, so a silent downgrade is visible. */
export function describeIntegrations(): string {
  const mode = getMode();
  const status = (name: string) => (isPlaceholder(process.env[name]) ? 'unset' : 'configured');
  return (
    `[config] mode=${mode} ` +
    `razorpay=${status('RAZORPAY_KEY_SECRET')} ` +
    `webhook=${status('RAZORPAY_WEBHOOK_SECRET')} ` +
    `gemini=${status('GEMINI_API_KEY')} model=${getGeminiModel()}`
  );
}
