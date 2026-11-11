CREATE TABLE `npc_ai_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`by` text NOT NULL,
	`note` text,
	`overlay` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `duel_archive` ADD `ai_rules` integer;