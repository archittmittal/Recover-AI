CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`action_id` text,
	`actor` text NOT NULL,
	`event_type` text NOT NULL,
	`event_data` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `recovery_journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`action_id`) REFERENCES `recovery_actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`preferred_language` text NOT NULL,
	`segment` text NOT NULL,
	`total_failures` integer DEFAULT 0 NOT NULL,
	`total_recovered_amount` integer DEFAULT 0 NOT NULL,
	`dnd_status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`razorpay_payment_id` text NOT NULL,
	`razorpay_order_id` text NOT NULL,
	`razorpay_subscription_id` text,
	`razorpay_invoice_id` text,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`payment_method` text NOT NULL,
	`failure_type` text NOT NULL,
	`error_code` text NOT NULL,
	`error_source` text NOT NULL,
	`error_step` text NOT NULL,
	`error_reason` text NOT NULL,
	`error_description` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recovery_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`channel` text NOT NULL,
	`action_type` text NOT NULL,
	`message_content` text NOT NULL,
	`llm_reasoning` text,
	`delivery_status` text NOT NULL,
	`customer_response` text,
	`outcome` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`executed_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `recovery_journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recovery_journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`failure_id` text NOT NULL,
	`status` text NOT NULL,
	`strategy` text NOT NULL,
	`amount_at_risk` integer NOT NULL,
	`amount_recovered` integer DEFAULT 0 NOT NULL,
	`recovery_payment_id` text,
	`payment_link_id` text,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`current_attempt` integer DEFAULT 0 NOT NULL,
	`current_channel` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`failure_id`) REFERENCES `payment_failures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`processing_status` text NOT NULL,
	`error_message` text,
	`received_at` text NOT NULL,
	`processed_at` text
);
