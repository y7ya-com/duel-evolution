CREATE TABLE `user_deck_current` (
	`char_key` text NOT NULL,
	`mode` text NOT NULL,
	`name` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`char_key`, `mode`)
);
--> statement-breakpoint
CREATE TABLE `user_decks` (
	`char_key` text NOT NULL,
	`name` text NOT NULL,
	`main` text NOT NULL,
	`side` text NOT NULL,
	`extra` text NOT NULL,
	`updated` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`char_key`, `name`)
);
