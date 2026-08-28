CREATE TABLE `spider_game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`difficulty` text NOT NULL,
	`game_kind` text NOT NULL,
	`board_key` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `spider_game_sessions_user_idx` ON `spider_game_sessions` (`user_id`,`started_at`);