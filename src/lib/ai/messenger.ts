import { gemini } from './gemini';
import { getGeminiModel } from '../config';
import { MESSAGE_GENERATION_SYSTEM_PROMPT } from './prompts';
import { sanitizePromptInput } from './sanitize';

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
 * True if `text` contains anything a messaging client would turn into a tappable target.
 *
 * Deliberately broad: a false positive costs a personalised message (the deterministic
 * template ships instead), while a false negative ships an attacker-chosen payment target to
 * a real customer. The asymmetry decides the tuning.
 */
export function containsActionableTarget(text: string): boolean {
  const patterns: RegExp[] = [
    // Any explicit scheme with an authority: https://, upi://, intent://, javascript: ...
    /[a-z][a-z0-9+.-]*:\/\//i,
    // Actionable schemes that carry no "//"
    /\b(?:tel|mailto|sms|smsto|upi|whatsapp|intent|market|geo|data|javascript|file|ftp|bitcoin|ethereum):/i,
    // Bare or www-prefixed domains: wa.me/x, evil.example/pay, www.rzp-secure.example.
    // The final label must be 2+ letters, so "₹2,499.00", "e.g." and "i.e." do not match.
    /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b/i,
    // UPI virtual payment address: name@bank. Not a URL, but it is a payment target.
    /\b[a-z0-9._-]{2,}@[a-z][a-z0-9.-]{1,}\b/i,
  ];
  return patterns.some((re) => re.test(text));
}

/**
 * Generates an empathetic, channel-appropriate recovery message using Gemini with template fallback.
 */
export async function generateRecoveryMessage(
  rawParams: MessageGenerationParams
): Promise<GeneratedMessageResult> {
  // The customer name traces back to attacker-influenceable input (e.g. a webhook
  // payload's payment.notes.customer_name). Strip newlines/control characters and
  // cap length so it cannot be mistaken for prompt instructions (RA-03). Only the
  // first name is kept — the full name is not data the LLM prompt needs, and
  // SECURITY.md/ETHICAL_AI_FRAMEWORK.md both document first-name-only as the
  // data minimization boundary for LLM prompts (RA-17).
  const params: MessageGenerationParams = {
    ...rawParams,
    customerName: sanitizePromptInput(rawParams.customerName, 60).split(' ')[0] || 'there',
  };

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

      // Enforce the invariants the system prompt declares fixed: the payment link
      // and amount must survive verbatim, and no other URL may be present. A
      // substring check like `.includes('http')` is satisfied by ANY url —
      // including one an attacker substituted via an injected instruction
      // (e.g. through an unsanitized customerName) — so it does not actually
      // verify the real link made it through (RA-03).
      // Only the payment link may be actionable. Enumerating bad schemes is a blocklist and
      // loses to the next one, so instead the known-good link is removed and ANYTHING
      // link-shaped left behind rejects the message.
      //
      // The previous check matched `https?://` alone, which let a message ship carrying
      // `upi://pay?pa=fraud@okaxis&am=2499` (opens a UPI app pre-filled to an attacker's VPA),
      // `tel:`, `wa.me/...`, or a bare `evil.example/pay` that WhatsApp linkifies anyway.
      const remainder = cleanMessage.split(params.paymentLinkUrl).join(' ');
      const linkIntact =
        cleanMessage.includes(params.paymentLinkUrl) && !containsActionableTarget(remainder);

      const amountIntact = cleanMessage.includes(rupeeAmount);

      if (cleanMessage.length <= charLimit && linkIntact && amountIntact) {
        return {
          message: cleanMessage,
          llmReasoning: parsed.reasoning || `Personalized empathetic copy generated via ${getGeminiModel()}.`,
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
