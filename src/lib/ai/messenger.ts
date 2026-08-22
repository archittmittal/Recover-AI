import { gemini } from './gemini';
import { MESSAGE_GENERATION_SYSTEM_PROMPT } from './prompts';

export interface MessageGenerationParams {
  customerName: string;
  language: 'en' | 'hi' | 'hinglish';
  channel: 'whatsapp' | 'sms';
  amount: number; // in paise
  failureReason: string;
  paymentLinkUrl: string;
  productDescription?: string;
  discountPercentage?: number;
}

export interface GeneratedMessageResult {
  message: string;
  llmReasoning: string;
  isTemplateFallback: boolean;
}

/**
 * Deterministic template fallback messages ensuring 100% reliability if LLM is unavailable.
 */
function getTemplateFallbackMessage(params: MessageGenerationParams): string {
  const rupeeAmount = `₹${(params.amount / 100).toLocaleString('en-IN')}`;
  const name = params.customerName.split(' ')[0] || 'there';

  if (params.channel === 'sms') {
    if (params.language === 'hi' || params.language === 'hinglish') {
      return `Hi ${name}, aapka ${rupeeAmount} ka payment complete nahi ho paya. Click karke retry karein: ${params.paymentLinkUrl} . Reply STOP to unsubscribe.`;
    }
    return `Hi ${name}, your payment of ${rupeeAmount} could not be processed. Complete it here: ${params.paymentLinkUrl} . Reply STOP to unsubscribe.`;
  }

  // WhatsApp template
  if (params.language === 'hinglish') {
    return `Namaste ${name}! 🙏\n\nAapka ${rupeeAmount} ka transaction complete nahi ho saka. Chinta na karein, aap niche diye gaye link se UPI ya card dwara payment poora kar sakte hain:\n👉 ${params.paymentLinkUrl}\n\nKisi bhi madad ke liye yahan reply karein.\nReply STOP to unsubscribe.`;
  }

  if (params.language === 'hi') {
    return `नमस्ते ${name}! 🙏\n\nआपका ${rupeeAmount} का भुगतान अधूरा रह गया। आप नीचे दिए गए सुरक्षित लिंक से भुगतान पूरा कर सकते हैं:\n👉 ${params.paymentLinkUrl}\n\nकिसी भी सहायता के लिए उत्तर दें।\nReply STOP to unsubscribe.`;
  }

  return `Hello ${name}! 👋\n\nWe noticed your recent payment of ${rupeeAmount} didn't go through. You can easily complete your payment using this secure link:\n👉 ${params.paymentLinkUrl}\n\nFeel free to reply if you need any assistance!\nReply STOP to unsubscribe.`;
}

/**
 * Generates an empathetic, channel-appropriate recovery message using Gemini with template fallback.
 */
export async function generateRecoveryMessage(
  params: MessageGenerationParams
): Promise<GeneratedMessageResult> {
  const fallbackText = getTemplateFallbackMessage(params);
  const model = gemini.getModel();

  if (!model) {
    return {
      message: fallbackText,
      llmReasoning: 'Deterministic template applied (Gemini offline or unconfigured).',
      isTemplateFallback: true,
    };
  }

  try {
    const rupeeAmount = `₹${(params.amount / 100).toLocaleString('en-IN')}`;
    const userPrompt = `
Generate a ${params.channel.toUpperCase()} message for:
- Customer Name: "${params.customerName}"
- Preferred Language: "${params.language}"
- Amount: ${rupeeAmount} (MUST be included exactly)
- Failure Reason: "${params.failureReason}"
- Payment Link: ${params.paymentLinkUrl} (MUST be included exactly)
- Product: "${params.productDescription || 'your order'}"
${params.discountPercentage ? `- Discount Offered: ${params.discountPercentage}%` : ''}
`;

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `${MESSAGE_GENERATION_SYSTEM_PROMPT}\n${userPrompt}` }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    if (parsed && parsed.message && typeof parsed.message === 'string') {
      const charLimit = params.channel === 'sms' ? 180 : 350;
      const cleanMessage = parsed.message.trim();

      // Verify that the message includes the payment link and isn't truncated
      if (cleanMessage.length <= charLimit && cleanMessage.includes('http')) {
        return {
          message: cleanMessage,
          llmReasoning: parsed.reasoning || 'Personalized empathetic copy generated via Gemini 2.5 Flash.',
          isTemplateFallback: false,
        };
      }
    }
  } catch (error) {
    console.error('[ai:generateRecoveryMessage] Gemini generation error, using fallback:', error);
  }

  return {
    message: fallbackText,
    llmReasoning: 'Deterministic template applied after LLM validation fallback.',
    isTemplateFallback: true,
  };
}
