CREATE TABLE `login_ip` (
	`user_id` text NOT NULL,
	`ip` text NOT NULL,
	`day` text NOT NULL,
	`asn` integer,
	`as_org` text,
	`country` text,
	`first` integer NOT NULL,
	`last` integer NOT NULL,
	`n` integer NOT NULL,
	PRIMARY KEY(`user_id`, `ip`, `day`)
);
--> statement-breakpoint
CREATE INDEX `login_ip_ip_idx` ON `login_ip` (`ip`,`day`);--> statement-breakpoint
CREATE INDEX `login_ip_day_idx` ON `login_ip` (`day`);--> statement-breakpoint
CREATE TABLE `trade_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`result` text NOT NULL,
	`a_acct` text NOT NULL,
	`a_slot` integer,
	`a_name` text,
	`a_gave` text NOT NULL,
	`b_acct` text NOT NULL,
	`b_slot` integer,
	`b_name` text,
	`b_gave` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trade_log_at_idx` ON `trade_log` (`at`);--> statement-breakpoint
CREATE INDEX `trade_log_a_idx` ON `trade_log` (`a_acct`,`at`);--> statement-breakpoint
CREATE INDEX `trade_log_b_idx` ON `trade_log` (`b_acct`,`at`);