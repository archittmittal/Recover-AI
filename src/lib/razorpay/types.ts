export type RazorpayErrorSource =
  | 'customer'
  | 'gateway'
  | 'business'
  | 'internal'
  | 'issuer_bank'
  | 'customer_psp'
  | 'network'
  | 'beneficiary_bank';

export type RazorpayErrorStep =
  | 'payment_initiation'
  | 'authentication'
  | 'authorization';

export type RazorpayErrorCode =
  | 'BAD_REQUEST_ERROR'
  | 'GATEWAY_ERROR'
  | 'SERVER_ERROR';

export type RazorpayPaymentMethod =
  | 'card'
  | 'upi'
  | 'netbanking'
  | 'emandate';

export type RazorpayFailureType =
  | 'one_time'
  | 'subscription'
  | 'mandate'
  | 'invoice';

export type RazorpayWebhookEventType =
  | 'payment.failed'
  | 'payment.authorized'
  | 'payment.captured'
  | 'subscription.pending'
  | 'subscription.halted'
  | 'subscription.charged'
  | 'subscription.cancelled'
  | 'payment_link.paid'
  | 'payment_link.expired'
  | 'payment_link.cancelled'
  | 'invoice.paid'
  | 'invoice.expired';

export interface RazorpayPaymentEntity {
  id: string; // pay_xxxx
  amount: number; // in paise
  currency: string;
  status: string;
  order_id: string; // order_xxxx
  subscription_id?: string | null;
  invoice_id?: string | null;
  method: RazorpayPaymentMethod | string;
  email?: string;
  contact?: string;
  customer_id?: string; // cust_xxxx, present when the payment is linked to a saved Razorpay customer
  error_code?: RazorpayErrorCode | string;
  error_description?: string;
  error_source?: RazorpayErrorSource | string;
  error_step?: RazorpayErrorStep | string;
  error_reason?: string;
  notes?: Record<string, string>;
  created_at?: number;
}

export interface RazorpaySubscriptionEntity {
  id: string; // sub_xxxx
  plan_id?: string;
  customer_id?: string;
  status: 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'cancelled' | 'completed' | 'expired';
  current_start?: number;
  current_end?: number;
  ended_at?: number;
  quantity?: number;
  notes?: Record<string, string>;
  charge_at?: number;
  start_at?: number;
  end_at?: number;
  total_count?: number;
  paid_count?: number;
  remaining_count?: number;
  short_url?: string;
}

export interface RazorpayPaymentLinkEntity {
  id: string; // plink_xxxx
  amount: number; // in paise
  currency: string;
  status: 'created' | 'partially_paid' | 'paid' | 'cancelled' | 'expired';
  short_url: string;
  reference_id?: string;
  description?: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  expire_by?: number;
  payments?: Array<{
    payment_id: string;
    amount: number;
    status: string;
    method: string;
  }>;
}

export interface RazorpayInvoiceEntity {
  id: string; // inv_xxxx
  amount: number; // in paise
  currency: string;
  status: 'draft' | 'issued' | 'paid' | 'cancelled' | 'expired';
  order_id?: string;
  customer_id?: string;
  short_url?: string;
  expire_by?: number;
}

export interface RazorpayWebhookPayload {
  entity: string; // 'event'
  account_id: string;
  event: RazorpayWebhookEventType;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    subscription?: {
      entity: RazorpaySubscriptionEntity;
    };
    payment_link?: {
      entity: RazorpayPaymentLinkEntity;
    };
    invoice?: {
      entity: RazorpayInvoiceEntity;
    };
  };
  created_at: number;
}

export interface CreatePaymentLinkRequest {
  amount: number; // in paise
  currency?: string;
  accept_partial?: boolean;
  reference_id?: string;
  description?: string;
  customer: {
    name: string;
    email?: string;
    contact: string;
  };
  notify?: {
    sms?: boolean;
    email?: boolean;
  };
  reminder_enable?: boolean;
  notes?: Record<string, string>;
  callback_url?: string;
  callback_method?: 'get' | 'post';
  expire_by?: number;
}
