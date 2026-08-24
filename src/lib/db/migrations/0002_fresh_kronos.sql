PRAGMA foreign_keys=OFF;--> statement-breakpoint
ALTER TABLE `customers` ADD `razorpay_customer_id` text;--> statement-breakpoint
CREATE TABLE `__new_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`razorpay_customer_id` text,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`preferred_language` text NOT NULL,
	`segment` text NOT NULL,
	`total_failures` integer DEFAULT 0 NOT NULL,
	`total_recovered_amount` integer DEFAULT 0 NOT NULL,
	`dnd_status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_customers`("id", "razorpay_customer_id", "name", "email", "phone", "preferred_language", "segment", "total_failures", "total_recovered_amount", "dnd_status", "created_at", "updated_at") SELECT "id", "razorpay_customer_id", "name", "email", "phone", "preferred_language", "segment", "total_failures", "total_recovered_amount", "dnd_status", "created_at", "updated_at" FROM `customers`;--> statement-breakpoint
DROP TABLE `customers`;--> statement-breakpoint
ALTER TABLE `__new_customers` RENAME TO `customers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_razorpay_customer_id_unique` ON `customers` (`razorpay_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`email`);