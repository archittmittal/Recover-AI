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

  return {
    channel: 'whatsapp',
    messageId: `wa_msg_${Date.now()}_${payload.toPhone.slice(-4)}`,
    deliveryStatus: 'read',
    deliveredAt: deliveredTime.toISOString(),
    readAt: readTime.toISOString(),
    status: 'success',
  };
}
