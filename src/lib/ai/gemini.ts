import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getGeminiModel, requireCredential } from '../config';

class GeminiClient {
  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private initialised = false;

  /**
   * Credentials are read on first use, never at construction.
   *
   * `export const gemini = new GeminiClient()` runs whenever this module is imported — including
   * during `next build`, which evaluates every route module to collect page data. Reading a
   * credential there made the *build* depend on runtime secrets: with RECOVERAI_MODE=live and no
   * key in the build environment, `requireCredential` threw and the deployment failed with
   * "Failed to collect configuration for /api/recovery/sweep", nowhere near the actual cause.
   *
   * Deferring the read keeps the loud failure where it belongs — the first request that needs a
   * model — and lets a build succeed without production secrets, which is what a preview
   * deployment has to be able to do.
   */
  private ensureInitialised(): void {
    if (this.initialised) return;
    this.initialised = true;

    // Throws in live mode when the key is missing or a placeholder, rather than silently
    // leaving this.model null and degrading every message to the template fallback.
    const apiKey = requireCredential('GEMINI_API_KEY') || '';
    if (!apiKey) return;

    try {
      this.client = new GoogleGenerativeAI(apiKey);
      this.model = this.client.getGenerativeModel({ model: getGeminiModel() });
    } catch (error) {
      console.error('[GeminiClient] Initialization error:', error);
    }
  }

  isAvailable(): boolean {
    this.ensureInitialised();
    return this.model !== null;
  }

  getModel(): GenerativeModel | null {
    this.ensureInitialised();
    return this.model;
  }
}

export const gemini = new GeminiClient();
