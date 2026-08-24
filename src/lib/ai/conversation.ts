import { gemini } from './gemini';
import { CONVERSATIONAL_REPLY_SYSTEM_PROMPT } from './prompts';
import { detectOptOut } from '../recovery/stopping-rules';
import { sanitizePromptInput } from './sanitize';

export interface ConversationInput {
  customerName: string;
  customerMessage: string;
  amount: number; // in paise
  previousAgentMessage?: string;
  paymentLinkUrl: string;
  preferredLanguage?: 'en' | 'hi' | 'hinglish';
}

export interface ConversationResponse {
  responseMessage: string;
  intent: 'opt_out' | 'pay_later' | 'technical_issue' | 'dispute' | 'general_query';
  actionRequired: 'stop' | 'schedule_reminder' | 'send_alternative_link' | 'escalate_human' | 'none';
  reasoning: string;
  isFallback: boolean;
}

export async function processCustomerConversation(
  input: ConversationInput
): Promise<ConversationResponse> {
  // 1. Fast deterministic check for hard opt-outs across English and Hindi/Hinglish.
  // Uses the same matcher as the deterministic stopping-rule engine so the two
  // can never drift out of sync (see RA-08/RA-11).
  if (detectOptOut(input.customerMessage)) {
    return {
      responseMessage: `You have been unsubscribed. No further messages will be sent. Thank you.`,
      intent: 'opt_out',
      actionRequired: 'stop',
      reasoning: 'Customer provided explicit STOP opt-out keyword.',
      isFallback: false,
    };
  }

  const model = gemini.getModel();
  const rupeeAmount = `₹${(input.amount / 100).toLocaleString('en-IN')}`;

  // 2. Default fallback response if LLM is offline
  const fallbackResponse: ConversationResponse = {
    responseMessage: `Thank you for your message. You can complete your payment of ${rupeeAmount} here: ${input.paymentLinkUrl} . Reply STOP to opt out.`,
    intent: 'general_query',
    actionRequired: 'none',
    reasoning: 'Deterministic fallback response applied.',
    isFallback: true,
  };

  if (!model) {
    return fallbackResponse;
  }

  try {
    // customerName traces back to attacker-influenceable input (e.g. a webhook
    // payload's payment.notes.customer_name); contain it before it reaches the
    // prompt (RA-03). customerMessage is left intact — it is the customer's own
    // reply and the field this endpoint exists to interpret.
    const safeCustomerName = sanitizePromptInput(input.customerName, 60);
    const userPrompt = `
Customer "${safeCustomerName}" replied: "${input.customerMessage}"
Amount: ${rupeeAmount}
Original Link: ${input.paymentLinkUrl}
Language: ${input.preferredLanguage || 'en'}
${input.previousAgentMessage ? `Previous outreach: "${input.previousAgentMessage}"` : ''}
`;

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `${CONVERSATIONAL_REPLY_SYSTEM_PROMPT}\n${userPrompt}` }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    if (parsed && parsed.response_message) {
      return {
        responseMessage: parsed.response_message,
        intent: parsed.intent || 'general_query',
        actionRequired: parsed.action_required || 'none',
        reasoning: parsed.reasoning || 'Response generated via Gemini 2.5 Flash conversational model.',
        isFallback: false,
      };
    }
  } catch (error) {
    console.error('[ai:processCustomerConversation] Error in conversational agent:', error);
  }

  return fallbackResponse;
}
