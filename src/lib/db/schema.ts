import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(), // prefix: cust_
  razorpayCustomerId: text('razorpay_customer_id').unique(), // Razorpay's own customer id, when known
  name: text('name').notNull(),
  email: text('email').unique(), // nullable: not every payment carries one
  phone: text('phone'), // nullable: never fabricate a contact number (RA-16)
  preferredLanguage: text('preferred_language').notNull(), // 'en' | 'hi' | 'hinglish'
  segment: text('segment').notNull(), // 'b2c' | 'b2b'
  totalFailures: integer('total_failures').notNull().default(0),
  totalRecoveredAmount: integer('total_recovered_amount').notNull().default(0), // paise
  dndStatus: text('dnd_status').notNull().default('active'), // 'active' | 'opted_out'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const paymentFailures = sqliteTable('payment_failures', {
  id: text('id').primaryKey(), // prefix: fail_
  customerId: text('customer_id').notNull().references(() => customers.id),
  razorpayPaymentId: text('razorpay_payment_id').notNull(),
  razorpayOrderId: text('razorpay_order_id').notNull(),
  razorpaySubscriptionId: text('razorpay_subscription_id'),
  razorpayInvoiceId: text('razorpay_invoice_id'),
  amount: integer('amount').notNull(), // paise
  currency: text('currency').notNull().default('INR'),
  paymentMethod: text('payment_method').notNull(), // 'card' | 'upi' | 'netbanking' | 'emandate'
  failureType: text('failure_type').notNull(), // 'one_time' | 'subscription' | 'mandate' | 'invoice'
  errorCode: text('error_code').notNull(), // 'BAD_REQUEST_ERROR' | 'GATEWAY_ERROR' | 'SERVER_ERROR'
  errorSource: text('error_source').notNull(), // 'customer' | 'gateway' | 'business' | 'internal' | 'issuer_bank' | 'customer_psp' | 'network' | 'beneficiary_bank'
  errorStep: text('error_step').notNull(), // 'payment_initiation' | 'authentication' | 'authorization'
  errorReason: text('error_reason').notNull(),
  errorDescription: text('error_description').notNull(),
  createdAt: text('created_at').notNull(),
});

export const recoveryJourneys = sqliteTable('recovery_journeys', {
  id: text('id').primaryKey(), // prefix: rj_
  customerId: text('customer_id').notNull().references(() => customers.id),
  failureId: text('failure_id').notNull().references(() => paymentFailures.id),
  status: text('status').notNull(), // 'detected' | 'diagnosing' | 'recovering' | 'escalating' | 'resolved' | 'exhausted' | 'opted_out' | 'uncontactable'
  strategy: text('strategy').notNull(), // 'smart_retry' | 'payment_link' | 'conversational' | 'invoice_reminder'
  amountAtRisk: integer('amount_at_risk').notNull(), // paise
  amountRecovered: integer('amount_recovered').notNull().default(0), // paise
  recoveryPaymentId: text('recovery_payment_id'),
  paymentLinkId: text('payment_link_id'),
  maxAttempts: integer('max_attempts').notNull().default(3),
  currentAttempt: integer('current_attempt').notNull().default(0),
  currentChannel: text('current_channel'), // 'whatsapp' | 'sms' | 'email' | 'voice'
  resolvedAt: text('resolved_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const recoveryActions = sqliteTable('recovery_actions', {
  id: text('id').primaryKey(), // prefix: ra_
  journeyId: text('journey_id').notNull().references(() => recoveryJourneys.id),
  attemptNumber: integer('attempt_number').notNull(),
  channel: text('channel').notNull(), // 'whatsapp' | 'sms' | 'email' | 'voice'
  actionType: text('action_type').notNull(), // 'retry' | 'payment_link' | 'reminder' | 'discount_offer' | 'escalation' | 'voice_call'
  messageContent: text('message_content').notNull(),
  llmReasoning: text('llm_reasoning'),
  deliveryStatus: text('delivery_status').notNull(), // 'sent' | 'delivered' | 'read' | 'failed'
  providerMessageId: text('provider_message_id'),
  customerResponse: text('customer_response'),
  outcome: text('outcome').notNull(), // 'pending' | 'payment_completed' | 'ignored' | 'opted_out' | 'failed'
  scheduledAt: text('scheduled_at').notNull(),
  executedAt: text('executed_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(), // prefix: audit_
  journeyId: text('journey_id').notNull().references(() => recoveryJourneys.id),
  actionId: text('action_id').references(() => recoveryActions.id),
  actor: text('actor').notNull(), // 'system' | 'agent' | 'customer' | 'razorpay'
  eventType: text('event_type').notNull(),
  eventData: text('event_data').notNull(), // JSON string payload
  createdAt: text('created_at').notNull(),
});

export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(), // razorpay event id
  eventType: text('event_type').notNull(),
  payloadHash: text('payload_hash').notNull(),
  processingStatus: text('processing_status').notNull(), // 'processing' | 'processed' | 'failed'
  errorMessage: text('error_message'),
  receivedAt: text('received_at').notNull(),
  processedAt: text('processed_at'),
});

// Relations for easier Drizzle querying
export const customersRelations = relations(customers, ({ many }) => ({
  paymentFailures: many(paymentFailures),
  recoveryJourneys: many(recoveryJourneys),
}));

export const paymentFailuresRelations = relations(paymentFailures, ({ one }) => ({
  customer: one(customers, {
    fields: [paymentFailures.customerId],
    references: [customers.id],
  }),
  recoveryJourney: one(recoveryJourneys, {
    fields: [paymentFailures.id],
    references: [recoveryJourneys.failureId],
  }),
}));

export const recoveryJourneysRelations = relations(recoveryJourneys, ({ one, many }) => ({
  customer: one(customers, {
    fields: [recoveryJourneys.customerId],
    references: [customers.id],
  }),
  failure: one(paymentFailures, {
    fields: [recoveryJourneys.failureId],
    references: [paymentFailures.id],
  }),
  recoveryActions: many(recoveryActions),
  auditLogs: many(auditLogs),
}));

export const recoveryActionsRelations = relations(recoveryActions, ({ one }) => ({
  journey: one(recoveryJourneys, {
    fields: [recoveryActions.journeyId],
    references: [recoveryJourneys.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  journey: one(recoveryJourneys, {
    fields: [auditLogs.journeyId],
    references: [recoveryJourneys.id],
  }),
  action: one(recoveryActions, {
    fields: [auditLogs.actionId],
    references: [recoveryActions.id],
  }),
}));
