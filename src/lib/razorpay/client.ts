import {
  CreatePaymentLinkRequest,
  RazorpayPaymentLinkEntity,
  RazorpayPaymentEntity,
  RazorpaySubscriptionEntity,
} from './types';
import { nanoid } from 'nanoid';
import { isLive, requireCredential } from '../config';

export class RazorpayClient {
  private keyId: string;
  private keySecret: string;
  private baseUrl: string;

  constructor() {
    this.keyId = requireCredential('RAZORPAY_KEY_ID') || '';
    this.keySecret = requireCredential('RAZORPAY_KEY_SECRET') || '';
    this.baseUrl = 'https://api.razorpay.com/v1';
  }

  private getAuthHeader(): string {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return `Basic ${auth}`;
  }

  /**
   * Mock mode is declared via RECOVERAI_MODE, not inferred from the shape of a credential.
   * In live mode requireCredential() has already thrown if either value is absent, so the
   * remaining check is only a defensive guard.
   */
  private isMockMode(): boolean {
    return !isLive() || !this.keyId || !this.keySecret;
  }

  /**
   * Creates a Razorpay Payment Link for revenue recovery
   */
  async createPaymentLink(params: CreatePaymentLinkRequest): Promise<RazorpayPaymentLinkEntity> {
    if (this.isMockMode()) {
      const plinkId = `plink_${nanoid(14)}`;
      return {
        id: plinkId,
        amount: params.amount,
        currency: params.currency || 'INR',
        status: 'created',
        short_url: `https://rzp.io/i/recov_${nanoid(8)}`,
        reference_id: params.reference_id,
        description: params.description,
        customer: params.customer,
        notes: params.notes,
        expire_by: params.expire_by,
      };
    }

    const response = await fetch(`${this.baseUrl}/payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay createPaymentLink failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Fetches payment link status and payment details
   */
  async getPaymentLink(paymentLinkId: string): Promise<RazorpayPaymentLinkEntity> {
    if (this.isMockMode()) {
      return {
        id: paymentLinkId,
        amount: 49900,
        currency: 'INR',
        status: 'created',
        short_url: `https://rzp.io/i/${paymentLinkId}`,
      };
    }

    const response = await fetch(`${this.baseUrl}/payment_links/${paymentLinkId}`, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay getPaymentLink failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Fetches payment details including error parameters
   */
  async getPayment(paymentId: string): Promise<RazorpayPaymentEntity> {
    if (this.isMockMode()) {
      return {
        id: paymentId,
        amount: 49900,
        currency: 'INR',
        status: 'failed',
        order_id: `order_${nanoid(14)}`,
        method: 'card',
        error_code: 'BAD_REQUEST_ERROR',
        error_source: 'customer',
        error_step: 'authorization',
        error_reason: 'insufficient_funds',
        error_description: 'Payment was declined by the bank due to insufficient funds.',
      };
    }

    const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay getPayment failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Fetches subscription state
   */
  async getSubscription(subscriptionId: string): Promise<RazorpaySubscriptionEntity> {
    if (this.isMockMode()) {
      return {
        id: subscriptionId,
        status: 'active',
      };
    }

    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Razorpay getSubscription failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }
}

// Singleton client instance
export const razorpayClient = new RazorpayClient();
