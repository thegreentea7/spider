CREATE TABLE `spider_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`player_name` text NOT NULL,
	`difficulty` text NOT NULL,
	`game_kind` text NOT NULL,
	`board_key` text DEFAULT '' NOT NULL,
	`outcome` text NOT NULL,
	`category` text DEFAULT 'clean' NOT NULL,
	`moves` integer DEFAULT 0 NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`hints` integer DEFAULT 0 NOT NULL,
	`undos` integer DEFAULT 0 NOT NULL,
	`deals` integer DEFAULT 0 NOT NULL,
	`first_run_deal` integer DEFAULT -1 NOT NULL,
	`frame_id` text DEFAULT 'classic' NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `spider_attempts_board_idx` ON `spider_attempts` (`game_kind`,`difficulty`,`board_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `spider_attempts_user_idx` ON `spider_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `spider_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`player_name` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`frame_id` text DEFAULT 'classic' NOT NULL,
	`progress_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `spider_scores_player_board_unique`;--> statement-breakpoint
DROP INDEX `spider_scores_board_rank_idx`;--> statement-breakpoint
ALTER TABLE `spider_scores` ADD `category` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `spider_scores` ADD `frame_id` text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE `spider_scores` ADD `level` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `spider_scores_player_board_category_unique` ON `spider_scores` (`user_id`,`game_kind`,`difficulty`,`daily_date`,`category`);--> statement-breakpoint
CREATE INDEX `spider_scores_board_rank_v2_idx` ON `spider_scores` (`game_kind`,`difficulty`,`daily_date`,`category`,`moves`);