import { sendWhatsAppMessage, WhatsAppDispatchResult } from './whatsapp';
import { sendSmsMessage, SmsDispatchResult } from './sms';
import { simulateVoiceCall, VoiceCallResult } from './voice';

export type DispatchChannel = 'whatsapp' | 'sms' | 'voice' | 'email';

export interface DispatchMessageOptions {
  channel: DispatchChannel;
  toPhone: string;
  toEmail?: string;
  customerName: string;
  messageText: string;
  paymentLinkUrl: string;
  amount: number; // in paise
  language?: 'en' | 'hi' | 'hinglish';
}

export type DispatchResult =
  | WhatsAppDispatchResult
  | SmsDispatchResult
  | VoiceCallResult
  | { channel: 'email'; messageId: string; deliveryStatus: 'sent'; status: 'success' };

export class CommunicationManager {
  /**
   * Dispatches recovery message through the selected communication channel.
   */
  async dispatch(options: DispatchMessageOptions): Promise<DispatchResult> {
    switch (options.channel) {
      case 'whatsapp':
        return sendWhatsAppMessage({
          toPhone: options.toPhone,
          customerName: options.customerName,
          messageText: options.messageText,
          paymentLinkUrl: options.paymentLinkUrl,
        });

      case 'sms':
        return sendSmsMessage({
          toPhone: options.toPhone,
          messageText: options.messageText,
        });

      case 'voice':
        return simulateVoiceCall({
          toPhone: options.toPhone,
          customerName: options.customerName,
          amount: options.amount,
          language: options.language || 'en',
          paymentLinkUrl: options.paymentLinkUrl,
        });

      case 'email':
      default:
        return {
          channel: 'email',
          messageId: `email_${Date.now()}`,
          deliveryStatus: 'sent',
          status: 'success',
        };
    }
  }
}

export const communicationManager = new CommunicationManager();

export interface NormalizedDispatchResult {
  deliveryStatus: 'sent' | 'delivered' | 'failed';
  providerMessageId: string;
  succeeded: boolean;
}

/**
 * Reduces the per-channel DispatchResult union to the fields the
 * recovery_actions row actually needs, so callers don't need to branch on
 * channel-specific shapes (voice reports callId/callStatus, the others
 * report messageId/deliveryStatus/status).
 */
export function normalizeDispatchResult(result: DispatchResult): NormalizedDispatchResult {
  if (result.channel === 'voice') {
    const succeeded = result.callStatus === 'completed';
    return {
      deliveryStatus: succeeded ? 'delivered' : 'failed',
      providerMessageId: result.callId,
      succeeded,
    };
  }

  const succeeded = result.status === 'success';
  // Defensive clamp: providers are expected to only ever report 'sent' at
  // dispatch time (see RA-12); 'read' would only be valid arriving later
  // through a status-callback path this manager does not yet implement.
  const rawStatus = result.deliveryStatus === 'read' ? 'delivered' : result.deliveryStatus;

  return {
    deliveryStatus: succeeded ? rawStatus : 'failed',
    providerMessageId: result.messageId,
    succeeded,
  };
}
