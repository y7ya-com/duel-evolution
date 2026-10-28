CREATE TABLE `account_players` (
	`acct` text NOT NULL,
	`slot` text NOT NULL,
	`name` text,
	PRIMARY KEY(`acct`, `slot`)
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`acct` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`is_owner` integer NOT NULL,
	`idx` integer,
	`active_slot` integer,
	`dp_inicio` integer,
	`dp_pases` integer,
	`wallet_mp` integer,
	`wallet_dpp` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `admin_bans` (
	`acct` text PRIMARY KEY NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`since` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_flags` (
	`acct` text PRIMARY KEY NOT NULL,
	`flags` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_gm` (
	`acct` text PRIMARY KEY NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`since` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_start` (
	`id` integer PRIMARY KEY NOT NULL,
	`mp` integer,
	`dpp` integer,
	`trunk` text
);
--> statement-breakpoint
CREATE TABLE `archived_characters` (
	`acct` text NOT NULL,
	`pos` integer NOT NULL,
	`slot` text,
	`reason` text,
	`archived_at` text,
	`char_id` text NOT NULL,
	PRIMARY KEY(`acct`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `character_friends` (
	`char_id` text NOT NULL,
	`pos` integer NOT NULL,
	`pid` integer,
	PRIMARY KEY(`char_id`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`acct` text NOT NULL,
	`slot` text,
	`name` text,
	`country` text,
	`avatar_a` text,
	`avatar_b` text,
	`team` integer,
	`dp_inicio_pend` integer,
	`pvp_n` integer,
	`last_npc` integer,
	`last_result` text,
	`last_present` integer,
	`player_id` integer,
	`lv` integer,
	`score` integer,
	`mp` integer,
	`unk_b0` integer,
	`wins` integer,
	`unk_b4` integer,
	`unk_b6` integer,
	`unk_b8` integer,
	`losses` integer,
	`match_wins` integer,
	`match_losses` integer,
	`single_wins` integer,
	`single_losses` integer,
	`duels` integer,
	`unk_c6` integer,
	`duels_won` integer,
	`duels_lost` integer,
	`duels_drawn` integer,
	`duels_void` integer,
	`turns` integer,
	`surrender_me` integer,
	`surrender_opp` integer,
	`lp_total` integer,
	`side_swaps` integer,
	`tribute1` integer,
	`tribute2` integer,
	`tribute3` integer,
	`fusions` integer,
	`ss_grave` integer,
	`ss_total` integer,
	`trap_me` integer,
	`trap_opp` integer,
	`spell_me` integer,
	`spell_opp` integer,
	`effect_me` integer,
	`effect_opp` integer,
	`comeback_wins` integer,
	`comeback_losses` integer,
	`unk_108` integer,
	`unk_10c` integer,
	`unk_110` integer,
	`title` integer,
	`unk_116` integer,
	`recovery_flags` integer,
	`champ_pending` integer,
	`tp` integer,
	`tp_rank` integer,
	`dpp` integer
);
--> statement-breakpoint
CREATE INDEX `characters_acct_idx` ON `characters` (`acct`,`slot`);--> statement-breakpoint
CREATE TABLE `claims` (
	`char_id` text NOT NULL,
	`pos` integer NOT NULL,
	`kind` text,
	`deck` integer,
	`bit` integer,
	PRIMARY KEY(`char_id`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `deck_history` (
	`char_id` text NOT NULL,
	`pos` integer NOT NULL,
	`hash` text,
	`first_at` integer,
	`duels` integer,
	`last_at` integer,
	`valid` integer,
	PRIMARY KEY(`char_id`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `deck_history_cards` (
	`char_id` text NOT NULL,
	`hist_pos` integer NOT NULL,
	`zone` text NOT NULL,
	`pos` integer NOT NULL,
	`card` integer,
	PRIMARY KEY(`char_id`, `hist_pos`, `zone`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `deck_history_problems` (
	`char_id` text NOT NULL,
	`hist_pos` integer NOT NULL,
	`pos` integer NOT NULL,
	`rule` text,
	`card` integer,
	`card_name` text,
	`uses` integer,
	`has` integer,
	`max` integer,
	`min` integer,
	`zone` text,
	`text` text,
	PRIMARY KEY(`char_id`, `hist_pos`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `duelpass_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created` text,
	`dpp` integer,
	`card` integer,
	`deck` integer,
	`note` text,
	`voided_at` text,
	`redeemed_acct` text,
	`redeemed_slot` integer,
	`redeemed_name` text,
	`redeemed_at` text
);
--> statement-breakpoint
CREATE TABLE `last_duel_bad_ids` (
	`char_id` text NOT NULL,
	`pos` integer NOT NULL,
	`card` integer,
	PRIMARY KEY(`char_id`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `last_duel_cards` (
	`char_id` text NOT NULL,
	`zone` text NOT NULL,
	`pos` integer NOT NULL,
	`card` integer,
	PRIMARY KEY(`char_id`, `zone`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `last_duel_decks` (
	`char_id` text PRIMARY KEY NOT NULL,
	`side_count` integer
);
--> statement-breakpoint
CREATE TABLE `last_duel_missing` (
	`char_id` text NOT NULL,
	`card` integer NOT NULL,
	`n` integer,
	PRIMARY KEY(`char_id`, `card`)
);
--> statement-breakpoint
CREATE TABLE `lobby_black` (
	`pos` integer PRIMARY KEY NOT NULL,
	`pid` integer
);
--> statement-breakpoint
CREATE TABLE `lobby_friends` (
	`pos` integer PRIMARY KEY NOT NULL,
	`pid` integer
);
--> statement-breakpoint
CREATE TABLE `lobby_team_members` (
	`pos` integer PRIMARY KEY NOT NULL,
	`pid` integer,
	`name` text
);
--> statement-breakpoint
CREATE TABLE `login_aliases` (
	`alias` text PRIMARY KEY NOT NULL,
	`acct` text
);
--> statement-breakpoint
CREATE TABLE `logins` (
	`acct` text PRIMARY KEY NOT NULL,
	`user` text
);
--> statement-breakpoint
CREATE TABLE `mail` (
	`pos` integer PRIMARY KEY NOT NULL,
	`id` integer,
	`from_pid` integer,
	`from_name` text,
	`to_pid` integer,
	`to_name` text,
	`subject` text,
	`body` text,
	`sent_at` integer,
	`extra` text,
	`read` integer
);
--> statement-breakpoint
CREATE TABLE `npc_card_dues` (
	`char_id` text NOT NULL,
	`pos` integer NOT NULL,
	`pack` integer,
	PRIMARY KEY(`char_id`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `npc_progress` (
	`char_id` text NOT NULL,
	`npc` integer NOT NULL,
	`b0` integer,
	`b1` integer,
	`b2` integer,
	`b3` integer,
	PRIMARY KEY(`char_id`, `npc`)
);
--> statement-breakpoint
CREATE TABLE `pending_item_bits` (
	`char_id` text NOT NULL,
	`item_pos` integer NOT NULL,
	`pos` integer NOT NULL,
	`bit` integer,
	PRIMARY KEY(`char_id`, `item_pos`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `pending_item_cards` (
	`char_id` text NOT NULL,
	`item_pos` integer NOT NULL,
	`pos` integer NOT NULL,
	`card` integer,
	PRIMARY KEY(`char_id`, `item_pos`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `pending_items` (
	`char_id` text NOT NULL,
	`pos` integer NOT NULL,
	`via` text,
	`src` text,
	PRIMARY KEY(`char_id`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `pvp_card_due_packs` (
	`char_id` text NOT NULL,
	`due_pos` integer NOT NULL,
	`pos` integer NOT NULL,
	`pack` integer,
	PRIMARY KEY(`char_id`, `due_pos`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `pvp_card_dues` (
	`char_id` text NOT NULL,
	`pos` integer NOT NULL,
	`n` integer,
	`t` integer,
	PRIMARY KEY(`char_id`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `shop_prices` (
	`key` text PRIMARY KEY NOT NULL,
	`mp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state_extras` (
	`path` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`path`, `key`)
);
--> statement-breakpoint
CREATE TABLE `state_shapes` (
	`path` text PRIMARY KEY NOT NULL,
	`keys` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_key` text NOT NULL,
	`pos` integer NOT NULL,
	`pid` integer,
	`name` text,
	`auth` integer,
	PRIMARY KEY(`team_key`, `pos`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`key` text PRIMARY KEY NOT NULL,
	`id` integer,
	`name` text,
	`flag` text,
	`leader` integer,
	`created` integer
);
--> statement-breakpoint
CREATE TABLE `titles` (
	`char_id` text NOT NULL,
	`bit` integer NOT NULL,
	PRIMARY KEY(`char_id`, `bit`)
);
--> statement-breakpoint
CREATE TABLE `trunk_cards` (
	`char_id` text NOT NULL,
	`card` integer NOT NULL,
	`qty` integer,
	PRIMARY KEY(`char_id`, `card`)
);
--> statement-breakpoint
CREATE TABLE `world` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_acct` text,
	`schema` integer,
	`lobby_next_mail` integer,
	`lobby_team` integer,
	`lobby_team_id` integer,
	`lobby_team_name` text,
	`equipos_next_id` integer
);
