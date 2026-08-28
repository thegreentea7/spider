CREATE TABLE `spider_daily_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`daily_date` text NOT NULL,
	`difficulty` text NOT NULL,
	`plays` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`total_moves` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spider_daily_stats_board_unique` ON `spider_daily_stats` (`daily_date`,`difficulty`);--> statement-breakpoint
DROP INDEX `spider_scores_board_rank_idx`;--> statement-breakpoint
CREATE INDEX `spider_scores_board_rank_idx` ON `spider_scores` (`game_kind`,`difficulty`,`daily_date`,`moves`);