import { razorpayClient } from './client';
import { RazorpayPaymentLinkEntity } from './types';

export interface RecoveryLinkOptions {
  journeyId: string;
  attemptNumber: number;
  amount: number; // in paise
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  description?: string;
  expireByHours?: number;
}

/**
 * Creates a compliant Razorpay Payment Link for an autonomous recovery journey.
 */
export async function createRecoveryPaymentLink(
  options: RecoveryLinkOptions
): Promise<RazorpayPaymentLinkEntity> {
  const expireTimestamp = options.expireByHours
    ? Math.floor(Date.now() / 1000) + options.expireByHours * 3600
    : Math.floor(Date.now() / 1000) + 72 * 3600; // 72h default

  return razorpayClient.createPaymentLink({
    amount: options.amount,
    currency: 'INR',
    accept_partial: false,
    reference_id: `recov_${options.journeyId}_att${options.attemptNumber}`,
    description: options.description || `Payment recovery for journey ${options.journeyId}`,
    customer: {
      name: options.customerName,
      email: options.customerEmail,
      contact: options.customerPhone,
    },
    notify: {
      sms: true,
      email: true,
    },
    reminder_enable: true,
    notes: {
      journey_id: options.journeyId,
      attempt_number: String(options.attemptNumber),
      campaign: 'recoverai_autonomous',
    },
    expire_by: expireTimestamp,
  });
}
