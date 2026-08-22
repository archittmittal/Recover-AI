import { db } from './index';
import { customers, paymentFailures, recoveryJourneys, recoveryActions, auditLogs, webhookEvents } from './schema';
import { getClock, formatIST } from '../utils/time';
import { SeededRNG } from '../simulation/rng';
import { eq } from 'drizzle-orm';

const INDIAN_NAMES = [
  'Aarav Sharma', 'Aditya Patel', 'Amit Verma', 'Arjun Singh', 'Ananya Iyer',
  'Deepak Gupta', 'Devendra Mishra', 'Gaurav Joshi', 'Ishaan Nair', 'Karan Mehta',
  'Rahul Kapoor', 'Rohan Sen', 'Siddharth Rao', 'Varun Reddy', 'Yash Chawla',
  'Priya Patel', 'Neha Sharma', 'Riya Gupta', 'Sneha Reddy', 'Aishwarya Nair',
  'Divya Iyer', 'Kavita Singh', 'Meera Joshi', 'Pooja Kapoor', 'Shreya Verma',
  'Vikram Malhotra', 'Sanjay Goel', 'Rajesh Kumar', 'Vijay Prasad', 'Anil Saxena',
  'Sunil Chaudhary', 'Manoj Dubey', 'Alok Pandey', 'Sandeep Bansal', 'Rajiv Jain',
  'Kiran Nair', 'Sunita Rao', 'Kirti Desai', 'Priti Bhat', 'Manju Hegde'
];

function generateSeededId(prefix: string, index: number): string {
  return `${prefix}_${String(index + 1).padStart(16, '0')}`;
}

export async function seedDatabase(): Promise<number> {
  const rng = new SeededRNG(12345); // Seed for reproducible batches
  const now = getClock().now();

  // 1. Clean existing records in dependency order
  await db.delete(auditLogs);
  await db.delete(recoveryActions);
  await db.delete(recoveryJourneys);
  await db.delete(paymentFailures);
  await db.delete(customers);
  await db.delete(webhookEvents);

  // 2. Generate 50 Customers
  const generatedCustomers: typeof customers.$inferInsert[] = [];
  for (let i = 0; i < 50; i++) {
    const name = INDIAN_NAMES[i % INDIAN_NAMES.length] + (i >= INDIAN_NAMES.length ? ` ${Math.floor(i / INDIAN_NAMES.length)}` : '');
    const email = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@example.com';
    const phone = `+9198765${String(10000 + i).slice(1)}`;
    const segment = i >= 40 ? 'b2b' : 'b2c';
    const preferredLanguage = segment === 'b2b' ? 'en' : rng.pick(['en', 'hi', 'hinglish']);
    
    // Set DND opted_out for index 12 (as a test case)
    const dndStatus = i === 12 ? 'opted_out' : 'active';
    
    const timeOffset = (50 - i) * 60 * 60 * 1000; // spread out signups
    const signupTime = new Date(now.getTime() - timeOffset);

    generatedCustomers.push({
      id: generateSeededId('cust', i),
      name,
      email,
      phone,
      preferredLanguage,
      segment,
      totalFailures: 0,
      totalRecoveredAmount: 0,
      dndStatus,
      createdAt: formatIST(signupTime),
      updatedAt: formatIST(signupTime),
    });
  }
  await db.insert(customers).values(generatedCustomers);

  // 3. Generate 50 Payment Failures spanning the 6 categories
  const generatedFailures: typeof paymentFailures.$inferInsert[] = [];
  
  // Helper to generate a failure item
  const buildFailure = (
    index: number,
    failureType: 'one_time' | 'subscription' | 'mandate' | 'invoice',
    method: 'card' | 'upi' | 'netbanking' | 'emandate',
    reason: string,
    source: 'customer' | 'gateway' | 'business' | 'internal' | 'issuer_bank' | 'customer_psp' | 'network' | 'beneficiary_bank',
    step: 'payment_initiation' | 'authentication' | 'authorization',
    code: 'BAD_REQUEST_ERROR' | 'GATEWAY_ERROR' | 'SERVER_ERROR',
    description: string,
    amount: number
  ): typeof paymentFailures.$inferInsert => {
    const failureId = generateSeededId('fail', index);
    const customerId = generateSeededId('cust', index);
    const payId = `pay_${String(rng.range(100000000000, 999999999999))}`;
    const ordId = `order_${String(rng.range(100000000000, 999999999999))}`;
    const subId = failureType === 'subscription' || failureType === 'mandate' ? `sub_${String(rng.range(100000000000, 999999999999))}` : null;
    const invId = failureType === 'invoice' ? `inv_${String(rng.range(100000000000, 999999999999))}` : null;

    // Failures happened slightly before now
    const failOffset = (50 - index) * 15 * 60 * 1000;
    const failTime = new Date(now.getTime() - failOffset);

    return {
      id: failureId,
      customerId,
      razorpayPaymentId: payId,
      razorpayOrderId: ordId,
      razorpaySubscriptionId: subId,
      razorpayInvoiceId: invId,
      amount,
      currency: 'INR',
      paymentMethod: method,
      failureType,
      errorCode: code,
      errorSource: source,
      errorStep: step,
      errorReason: reason,
      errorDescription: description,
      createdAt: formatIST(failTime),
    };
  };

  let failIdx = 0;

  // Category 1: One-time card failures (8 records)
  const c1Reasons = [
    { r: 'insufficient_funds', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'The card has insufficient credit limit or balance.' },
    { r: 'insufficient_funds', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'The card has insufficient credit limit or balance.' },
    { r: 'insufficient_funds', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'The card has insufficient credit limit or balance.' },
    { r: 'card_expired', s: 'customer', st: 'payment_initiation', c: 'BAD_REQUEST_ERROR', d: 'The card expiry date is in the past.' },
    { r: 'card_expired', s: 'customer', st: 'payment_initiation', c: 'BAD_REQUEST_ERROR', d: 'The card expiry date is in the past.' },
    { r: 'card_declined', s: 'issuer_bank', st: 'authorization', c: 'GATEWAY_ERROR', d: 'The bank declined the transaction.' },
    { r: 'card_declined', s: 'issuer_bank', st: 'authorization', c: 'GATEWAY_ERROR', d: 'The bank declined the transaction.' },
    { r: 'authentication_failed', s: 'customer', st: 'authentication', c: 'BAD_REQUEST_ERROR', d: 'OTP verification failed.' }
  ] as const;
  for (const item of c1Reasons) {
    const amt = rng.range(499, 9999) * 100;
    generatedFailures.push(
      buildFailure(failIdx, 'one_time', 'card', item.r, item.s, item.st, item.c, item.d, amt)
    );
    failIdx++;
  }

  // Category 2: One-time UPI failures (7 records)
  const c2Reasons = [
    { r: 'payment_cancelled', s: 'customer', st: 'authentication', c: 'BAD_REQUEST_ERROR', d: 'Payment cancelled by user in their UPI app.' },
    { r: 'payment_cancelled', s: 'customer', st: 'authentication', c: 'BAD_REQUEST_ERROR', d: 'Payment cancelled by user in their UPI app.' },
    { r: 'payment_cancelled', s: 'customer', st: 'authentication', c: 'BAD_REQUEST_ERROR', d: 'Payment cancelled by user in their UPI app.' },
    { r: 'gateway_technical_error', s: 'gateway', st: 'authorization', c: 'GATEWAY_ERROR', d: 'Technical error at NPCI/gateway.' },
    { r: 'gateway_technical_error', s: 'gateway', st: 'authorization', c: 'GATEWAY_ERROR', d: 'Technical error at NPCI/gateway.' },
    { r: 'bank_account_invalid', s: 'customer_psp', st: 'payment_initiation', c: 'BAD_REQUEST_ERROR', d: 'The customer PSP reported an invalid bank account.' },
    { r: 'bank_account_invalid', s: 'customer_psp', st: 'payment_initiation', c: 'BAD_REQUEST_ERROR', d: 'The customer PSP reported an invalid bank account.' }
  ] as const;
  for (const item of c2Reasons) {
    const amt = rng.range(199, 4999) * 100;
    generatedFailures.push(
      buildFailure(failIdx, 'one_time', 'upi', item.r, item.s, item.st, item.c, item.d, amt)
    );
    failIdx++;
  }

  // Category 3: Subscription card failures (8 records)
  const c3Reasons = [
    { r: 'insufficient_funds', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'Insufficient balance to charge subscription.' },
    { r: 'insufficient_funds', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'Insufficient balance to charge subscription.' },
    { r: 'insufficient_funds', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'Insufficient balance to charge subscription.' },
    { r: 'card_expired', s: 'customer', st: 'payment_initiation', c: 'BAD_REQUEST_ERROR', d: 'Subscribed card has expired.' },
    { r: 'card_expired', s: 'customer', st: 'payment_initiation', c: 'BAD_REQUEST_ERROR', d: 'Subscribed card has expired.' },
    { r: 'card_expired', s: 'customer', st: 'payment_initiation', c: 'BAD_REQUEST_ERROR', d: 'Subscribed card has expired.' },
    { r: 'mandate_inactive', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'E-mandate is not in active state.' },
    { r: 'mandate_inactive', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'E-mandate is not in active state.' }
  ] as const;
  for (const item of c3Reasons) {
    const amt = rng.pick([49900, 99900, 149900, 199900, 299900]);
    generatedFailures.push(
      buildFailure(failIdx, 'subscription', 'card', item.r, item.s, item.st, item.c, item.d, amt)
    );
    failIdx++;
  }

  // Category 4: Subscription mandate failures (7 records)
  const c4Reasons = [
    { r: 'mandate_inactive', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'Recurring payment mandate revoked or inactive.' },
    { r: 'mandate_inactive', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'Recurring payment mandate revoked or inactive.' },
    { r: 'mandate_inactive', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'Recurring payment mandate revoked or inactive.' },
    { r: 'mandate_inactive', s: 'customer', st: 'authorization', c: 'BAD_REQUEST_ERROR', d: 'Recurring payment mandate revoked or inactive.' },
    { r: 'authentication_failed', s: 'customer', st: 'authentication', c: 'BAD_REQUEST_ERROR', d: 'Mandate pre-debit notification authentication failed.' },
    { r: 'authentication_failed', s: 'customer', st: 'authentication', c: 'BAD_REQUEST_ERROR', d: 'Mandate pre-debit notification authentication failed.' },
    { r: 'authentication_failed', s: 'customer', st: 'authentication', c: 'BAD_REQUEST_ERROR', d: 'Mandate pre-debit notification authentication failed.' }
  ] as const;
  for (const item of c4Reasons) {
    const amt = rng.pick([99900, 199900, 499900]);
    generatedFailures.push(
      buildFailure(failIdx, 'mandate', 'emandate', item.r, item.s, item.st, item.c, item.d, amt)
    );
    failIdx++;
  }

  // Category 5: Checkout abandonment (10 records)
  for (let i = 0; i < 10; i++) {
    const amt = rng.range(999, 19999) * 100;
    generatedFailures.push(
      buildFailure(
        failIdx,
        'one_time',
        rng.pick(['card', 'upi']),
        'checkout_abandonment',
        'customer',
        'payment_initiation',
        'BAD_REQUEST_ERROR',
        'Order created but customer abandoned the checkout screen without submitting payment details.',
        amt
      )
    );
    failIdx++;
  }

  // Category 6: B2B overdue invoices (10 records)
  for (let i = 0; i < 10; i++) {
    const amt = rng.range(5000, 75000) * 100; // e.g. ₹5,000 to ₹75,000
    generatedFailures.push(
      buildFailure(
        failIdx,
        'invoice',
        'netbanking',
        'invoice_overdue',
        'customer',
        'authorization',
        'BAD_REQUEST_ERROR',
        'B2B commercial invoice has passed its due date and remains unpaid.',
        amt
      )
    );
    failIdx++;
  }

  await db.insert(paymentFailures).values(generatedFailures);

  // 4. Update customer total_failures statistics based on generated failures
  for (let i = 0; i < 50; i++) {
    const custId = generateSeededId('cust', i);
    const count = generatedFailures.filter(f => f.customerId === custId).length;
    await db.update(customers)
      .set({ totalFailures: count })
      .where(eq(customers.id, custId));
  }

  return generatedFailures.length;
}
