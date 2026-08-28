CREATE TABLE `spider_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`player_name` text NOT NULL,
	`difficulty` text NOT NULL,
	`game_kind` text NOT NULL,
	`daily_date` text DEFAULT '' NOT NULL,
	`seconds` integer NOT NULL,
	`moves` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spider_scores_player_board_unique` ON `spider_scores` (`user_id`,`game_kind`,`difficulty`,`daily_date`);--> statement-breakpoint
CREATE INDEX `spider_scores_board_rank_idx` ON `spider_scores` (`game_kind`,`difficulty`,`daily_date`,`seconds`,`moves`);