import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getGeminiModel, requireCredential } from '../config';

class GeminiClient {
  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private apiKey: string;

  constructor() {
    // Throws in live mode when the key is missing or a placeholder, rather than silently
    // leaving this.model null and degrading every message to the template fallback.
    this.apiKey = requireCredential('GEMINI_API_KEY') || '';
    if (this.apiKey) {
      try {
        this.client = new GoogleGenerativeAI(this.apiKey);
        this.model = this.client.getGenerativeModel({
          model: getGeminiModel(),
        });
      } catch (error) {
        console.error('[GeminiClient] Initialization error:', error);
      }
    }
  }

  isAvailable(): boolean {
    return this.model !== null;
  }

  getModel(): GenerativeModel | null {
    return this.model;
  }
}

export const gemini = new GeminiClient();
