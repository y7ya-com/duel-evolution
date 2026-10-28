ALTER TABLE `user` ADD `username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `display_username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `name_changed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);