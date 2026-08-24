import crypto from 'crypto';

export interface WhatsAppDispatchPayload {
  toPhone: string;
  customerName: string;
  messageText: string;
  paymentLinkUrl: string;
  hasQuickReplyButtons?: boolean;
}

export interface WhatsAppDispatchResult {
  channel: 'whatsapp';
  messageId: string;
  deliveryStatus: 'sent' | 'delivered' | 'read';
  deliveredAt: string;
  readAt: string;
  status: 'success' | 'failed';
}

/**
 * Simulates WhatsApp Interactive Business API message dispatch.
 */
export async function sendWhatsAppMessage(
  payload: WhatsAppDispatchPayload
): Promise<WhatsAppDispatchResult> {
  const now = new Date();
  const deliveredTime = new Date(now.getTime() + 1200); // 1.2s delivery
  const readTime = new Date(now.getTime() + 3500); // 3.5s read receipt

  // We reference payload to preserve interface compatibility while keeping phone PII out of identifiers
  void payload;

  // deliveryStatus reflects only what has genuinely happened at send time.
  // deliveredAt/readAt are simulated future timestamps for a later
  // status-callback path to report, not evidence that delivery or reading
  // has already occurred (see RA-12).
  return {
    channel: 'whatsapp',
    messageId: `wa_msg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    deliveryStatus: 'sent',
    deliveredAt: deliveredTime.toISOString(),
    readAt: readTime.toISOString(),
    status: 'success',
  };
}
