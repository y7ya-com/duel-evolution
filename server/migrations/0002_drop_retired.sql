DROP TABLE `duelpass_codes`;--> statement-breakpoint
ALTER TABLE `accounts` DROP COLUMN `dp_inicio`;--> statement-breakpoint
ALTER TABLE `accounts` DROP COLUMN `dp_pases`;--> statement-breakpoint
ALTER TABLE `accounts` DROP COLUMN `wallet_dpp`;--> statement-breakpoint
ALTER TABLE `admin_start` DROP COLUMN `dpp`;--> statement-breakpoint
ALTER TABLE `characters` DROP COLUMN `dp_inicio_pend`;--> statement-breakpoint
ALTER TABLE `characters` DROP COLUMN `dpp`;