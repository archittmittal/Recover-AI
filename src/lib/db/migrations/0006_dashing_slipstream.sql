PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text,
	`action_id` text,
	`actor` text NOT NULL,
	`event_type` text NOT NULL,
	`event_data` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `recovery_journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`action_id`) REFERENCES `recovery_actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_audit_logs`("id", "journey_id", "action_id", "actor", "event_type", "event_data", "created_at") SELECT "id", "journey_id", "action_id", "actor", "event_type", "event_data", "created_at" FROM `audit_logs`;--> statement-breakpoint
DROP TABLE `audit_logs`;--> statement-breakpoint
ALTER TABLE `__new_audit_logs` RENAME TO `audit_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_audit_journey` ON `audit_logs` (`journey_id`);