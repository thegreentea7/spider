import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const spiderScores = sqliteTable(
  "spider_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    playerName: text("player_name").notNull(),
    difficulty: text("difficulty").notNull(),
    gameKind: text("game_kind").notNull(),
    dailyDate: text("daily_date").notNull().default(""),
    seconds: integer("seconds").notNull(),
    moves: integer("moves").notNull(),
    category: text("category").notNull().default("legacy"),
    frameId: text("frame_id").notNull().default("classic"),
    level: integer("level").notNull().default(1),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("spider_scores_player_board_category_unique").on(table.userId, table.gameKind, table.difficulty, table.dailyDate, table.category),
    index("spider_scores_board_rank_v2_idx").on(table.gameKind, table.difficulty, table.dailyDate, table.category, table.moves),
  ],
);

export const spiderProfiles = sqliteTable("spider_profiles", {
  userId: text("user_id").primaryKey(),
  playerName: text("player_name").notNull(),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  frameId: text("frame_id").notNull().default("classic"),
  progressJson: text("progress_json").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});

export const spiderAttempts = sqliteTable(
  "spider_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    playerName: text("player_name").notNull(),
    difficulty: text("difficulty").notNull(),
    gameKind: text("game_kind").notNull(),
    boardKey: text("board_key").notNull().default(""),
    outcome: text("outcome").notNull(),
    category: text("category").notNull().default("clean"),
    moves: integer("moves").notNull().default(0),
    seconds: integer("seconds").notNull().default(0),
    hints: integer("hints").notNull().default(0),
    undos: integer("undos").notNull().default(0),
    deals: integer("deals").notNull().default(0),
    firstRunDeal: integer("first_run_deal").notNull().default(-1),
    frameId: text("frame_id").notNull().default("classic"),
    level: integer("level").notNull().default(1),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("spider_attempts_board_idx").on(table.gameKind, table.difficulty, table.boardKey, table.createdAt),
    index("spider_attempts_user_idx").on(table.userId, table.createdAt),
  ],
);

export const spiderGameSessions = sqliteTable(
  "spider_game_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    difficulty: text("difficulty").notNull(),
    gameKind: text("game_kind").notNull(),
    boardKey: text("board_key").notNull().default(""),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    index("spider_game_sessions_user_idx").on(table.userId, table.startedAt),
  ],
);

export const spiderDailyStats = sqliteTable(
  "spider_daily_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dailyDate: text("daily_date").notNull(),
    difficulty: text("difficulty").notNull(),
    plays: integer("plays").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    totalMoves: integer("total_moves").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("spider_daily_stats_board_unique").on(table.dailyDate, table.difficulty),
  ],
);
