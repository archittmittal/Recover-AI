ALTER TABLE `payment_failures` ADD `arm` text DEFAULT 'C' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_failures` ADD `simulation_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_failures_arm` ON `payment_failures` (`arm`);--> statement-breakpoint
ALTER TABLE `recovery_journeys` ADD `arm` text DEFAULT 'C' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_journeys_arm` ON `recovery_journeys` (`arm`);