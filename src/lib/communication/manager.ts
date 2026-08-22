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
