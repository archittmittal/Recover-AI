export interface SmsDispatchPayload {
  toPhone: string;
  messageText: string;
  dltTemplateId?: string;
  senderId?: string; // default: 'RCVRAI'
}

export interface SmsDispatchResult {
  channel: 'sms';
  messageId: string;
  deliveryStatus: 'sent' | 'delivered';
  deliveredAt: string;
  senderId: string;
  dltEntityId: string;
  status: 'success' | 'failed';
}

/**
 * Simulates TRAI DLT-compliant transactional SMS dispatch.
 */
export async function sendSmsMessage(
  payload: SmsDispatchPayload
): Promise<SmsDispatchResult> {
  const now = new Date();
  const deliveredTime = new Date(now.getTime() + 800);

  // deliveryStatus reflects only what has genuinely happened at send time;
  // deliveredAt is a simulated future timestamp, not evidence of delivery
  // (see RA-12).
  return {
    channel: 'sms',
    messageId: `sms_msg_${Date.now()}`,
    deliveryStatus: 'sent',
    deliveredAt: deliveredTime.toISOString(),
    senderId: payload.senderId || 'RCVRAI',
    dltEntityId: '1101458920000012345',
    status: 'success',
  };
}
