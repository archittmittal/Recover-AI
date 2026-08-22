export interface VoiceCallPayload {
  toPhone: string;
  customerName: string;
  amount: number; // in paise
  language: 'en' | 'hi' | 'hinglish';
  paymentLinkUrl: string;
}

export interface VoiceCallResult {
  channel: 'voice';
  callId: string;
  callStatus: 'completed' | 'no_answer' | 'busy' | 'failed';
  callDurationSeconds: number;
  transcriptSnippet: string;
  customerAction: 'pressed_1_sms_link' | 'promised_to_pay' | 'hung_up' | 'requested_opt_out';
  executedAt: string;
}

/**
 * Simulates AI Outbound Voice call with Hinglish conversational synthesis.
 */
export async function simulateVoiceCall(
  payload: VoiceCallPayload
): Promise<VoiceCallResult> {
  const rupeeAmount = `₹${(payload.amount / 100).toLocaleString('en-IN')}`;
  const name = payload.customerName.split(' ')[0] || 'Customer';

  let script: string;
  if (payload.language === 'hi' || payload.language === 'hinglish') {
    script = `Agent: Namaste ${name} ji, RecoverAI se bol rahe hain. Aapka ${rupeeAmount} ka transaction incomplete reh gaya tha. Kya aap payment link SMS par prapt karna chahte hain? Press 1.`;
  } else {
    script = `Agent: Hello ${name}, this is RecoverAI. We noticed your payment of ${rupeeAmount} could not be completed. Press 1 to receive a secure payment link via SMS.`;
  }

  return {
    channel: 'voice',
    callId: `call_${Date.now()}`,
    callStatus: 'completed',
    callDurationSeconds: 42,
    transcriptSnippet: script,
    customerAction: 'pressed_1_sms_link',
    executedAt: new Date().toISOString(),
  };
}
