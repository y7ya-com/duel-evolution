CREATE TABLE `duel_archive` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`a_acct` text NOT NULL,
	`a_slot` integer,
	`a_name` text,
	`b_acct` text,
	`b_slot` integer,
	`b_name` text,
	`rival` integer,
	`npc` integer,
	`tier` text,
	`ai_rev` integer,
	`game` integer NOT NULL,
	`result` text NOT NULL,
	`reason` text,
	`turns` integer NOT NULL,
	`secs` integer NOT NULL,
	`first` integer NOT NULL,
	`lp_a` integer,
	`lp_b` integer,
	`decisions` integer,
	`file` text,
	`file_bytes` integer,
	`commands` text
);
--> statement-breakpoint
CREATE INDEX `duel_archive_at_idx` ON `duel_archive` (`at`);--> statement-breakpoint
CREATE INDEX `duel_archive_a_idx` ON `duel_archive` (`a_acct`,`at`);--> statement-breakpoint
CREATE INDEX `duel_archive_b_idx` ON `duel_archive` (`b_acct`,`at`);--> statement-breakpoint
CREATE INDEX `duel_archive_npc_idx` ON `duel_archive` (`npc`,`at`);