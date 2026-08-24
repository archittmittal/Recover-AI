CREATE INDEX `idx_audit_journey` ON `audit_logs` (`journey_id`);--> statement-breakpoint
CREATE INDEX `idx_failures_customer` ON `payment_failures` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_actions_journey` ON `recovery_actions` (`journey_id`);--> statement-breakpoint
CREATE INDEX `idx_journeys_customer` ON `recovery_journeys` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_journeys_failure` ON `recovery_journeys` (`failure_id`);