import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

class GeminiClient {
  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (this.apiKey && !this.apiKey.includes('XXXXXXXX') && !this.apiKey.includes('mock')) {
      try {
        this.client = new GoogleGenerativeAI(this.apiKey);
        this.model = this.client.getGenerativeModel({
          model: 'gemini-2.5-flash',
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
