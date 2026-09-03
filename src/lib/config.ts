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

/**
 * A value still holding its `.env.example` template form.
 *
 * Exported because the auth layer needs exactly this test and nothing more: a session secret
 * containing the substring "mock" is a perfectly good secret, while one containing the
 * `XXXXXXXX` marker is the literal text shipped in the public repository.
 */
export function isTemplatePlaceholder(value: string | undefined): boolean {
  return !value || value.includes('XXXXXXXX');
}

/** Credentials still holding their .env.example placeholder value, or explicitly mocked. */
function isPlaceholder(value: string | undefined): boolean {
  return isTemplatePlaceholder(value) || value!.includes('mock');
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

  // Mock mode hands out no credentials, even real ones. `.env.example` promises "mock (default)
  // — no outbound calls; payment links and LLM copy are simulated", and that was false: a
  // configured GEMINI_API_KEY was returned here, so the Gemini client initialised and every
  // journey made a live LLM call. A mock-mode batch run took two minutes of real API traffic,
  // and the deployed webhook handler spent seconds per delivery on a call the mode says it does
  // not make. Set RECOVERAI_MODE=live to actually use the models.
  if (!isLive()) return undefined;

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

/**
 * The seed for the simulation response model (RA-23).
 *
 * Deliberately not 12345, the fixture seed in `src/lib/db/seed.ts`. One shared seed would mean
 * that adding a customer name to the fixture list silently moves every recovery outcome, which
 * makes a "reproducible" result reproducible only until someone edits an unrelated array.
 */
export const DEFAULT_SIMULATION_SEED = 20260823;

export function getSimulationSeed(): number {
  const raw = (process.env.SIMULATION_SEED || '').trim();
  if (raw === '') return DEFAULT_SIMULATION_SEED;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`[config] Invalid SIMULATION_SEED="${raw}". Expected an integer.`);
  }
  return parsed;
}

/**
 * Whether the declared response model decides recovery outcomes.
 *
 * In mock mode it always does — nothing else could, since no real payment can arrive. In live
 * mode outcomes normally come from Razorpay webhooks, and inventing recoveries alongside real
 * ones would corrupt a real merchant's numbers.
 *
 * `SIMULATE_OUTCOMES=true` overrides that for the case the two modes could not previously serve
 * together: a demo that wants real Gemini copy and real payment links *and* a populated recovery
 * rate, without waiting for 150 people to pay. It is deliberately a separate switch rather than a
 * widening of "mock", so the choice is visible in the environment, and `GET /api/metrics` reports
 * it in `provenance` so the dashboard keeps saying the figures are simulated.
 *
 * A deployment carrying real merchant traffic must leave it unset.
 */
export function shouldSimulateOutcomes(): boolean {
  if (!isLive()) return true;
  return (process.env.SIMULATE_OUTCOMES || '').trim().toLowerCase() === 'true';
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
