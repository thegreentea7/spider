import { getRawDb } from "../../../db";
import { spiderAccount } from "../spider-auth";

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const GAME_KINDS = new Set(["random", "daily", "weekly"]);
const CATEGORIES = new Set(["clean", "assisted", "auto", "legacy"]);
type Board = { difficulty: string; gameKind: string; dailyDate: string };
function cleanPlayerName(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 24); }
function bounded(value: unknown, max = 1000000) { const n = Math.floor(Number(value) || 0); return Math.max(0, Math.min(max, n)); }
function parseBoard(values: URLSearchParams | Record<string, unknown>): Board | null {
  const read = (key: string) => values instanceof URLSearchParams ? values.get(key) : values[key];
  const difficulty = String(read("difficulty") ?? ""), gameKind = String(read("gameKind") ?? "");
  const dailyDate = ["daily", "weekly"].includes(gameKind) ? String(read("dailyDate") ?? "") : "";
  if (!DIFFICULTIES.has(difficulty) || !GAME_KINDS.has(gameKind)) return null;
  if (gameKind === "daily" && !/^\d{8}$/.test(dailyDate)) return null;
  if (gameKind === "weekly" && !/^\d{4}W\d{2}$/.test(dailyDate)) return null;
  return { difficulty, gameKind, dailyDate };
}

export async function GET(request: Request) {
  const url = new URL(request.url), board = parseBoard(url.searchParams);
  const category = CATEGORIES.has(url.searchParams.get("category") || "") ? String(url.searchParams.get("category")) : "clean";
  if (!board) return Response.json({ error: "Некорректный режим рейтинга" }, { status: 400 });
  try {
    const account = await spiderAccount(request);
    const [result, participant, attempts, personal] = await Promise.all([
      getRawDb().prepare(`SELECT user_id AS userId, player_name AS playerName, moves, frame_id AS frameId, level FROM spider_scores WHERE game_kind=? AND difficulty=? AND daily_date=? AND category=? ORDER BY moves ASC, updated_at ASC LIMIT 100`).bind(board.gameKind, board.difficulty, board.dailyDate, category).all(),
      getRawDb().prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM spider_attempts WHERE game_kind=? AND difficulty=? AND board_key=?`).bind(board.gameKind, board.difficulty, board.dailyDate).first(),
      account?.localId ? getRawDb().prepare(`SELECT outcome,category,moves,seconds,hints,undos,deals,first_run_deal AS firstRunDeal,created_at AS createdAt FROM spider_attempts WHERE user_id=? AND game_kind=? AND difficulty=? AND board_key=? ORDER BY created_at DESC LIMIT 12`).bind(account.localId, board.gameKind, board.difficulty, board.dailyDate).all() : Promise.resolve({ results: [] }),
      account?.localId ? getRawDb().prepare(`SELECT moves FROM spider_scores WHERE user_id=? AND game_kind=? AND difficulty=? AND daily_date=? AND category=?`).bind(account.localId, board.gameKind, board.difficulty, board.dailyDate, category).first() : Promise.resolve(null),
    ]);
    const entries = result.results ?? [];
    const rank = personal ? 1 + entries.filter((entry) => Number(entry.moves) < Number(personal.moves)).length : null;
    return Response.json({ entries, participants: Number(participant?.count) || 0, rank, attempts: attempts.results ?? [], category });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось загрузить рейтинг" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const account = await spiderAccount(request);
    if (!account?.localId) return Response.json({ error: "Требуется вход" }, { status: 401 });
    const payload = (await request.json()) as Record<string, unknown>, board = parseBoard(payload);
    if (!board) return Response.json({ error: "Некорректный режим рейтинга" }, { status: 400 });
    const moves = bounded(payload.moves), seconds = bounded(payload.seconds), hints = bounded(payload.hints,10000), undos = bounded(payload.undos,10000), deals = bounded(payload.deals,20);
    const category = Boolean(payload.autoCompleted) ? "auto" : (hints || undos ? "assisted" : "clean");
    const sessionId = String(payload.sessionId || "");
    const playerName = cleanPlayerName(payload.playerName) || cleanPlayerName(account.displayName);
    if (playerName.length < 2 || moves < 1) return Response.json({ error: "Некорректный результат" }, { status: 400 });
    const session = sessionId ? await getRawDb().prepare(`SELECT user_id AS userId,difficulty,game_kind AS gameKind,board_key AS boardKey,started_at AS startedAt,finished_at AS finishedAt FROM spider_game_sessions WHERE id=?`).bind(sessionId).first() : null;
    const elapsed = session ? Date.now() - Number(session.startedAt) : 0;
    if (!session || session.userId !== account.localId || session.difficulty !== board.difficulty || session.gameKind !== board.gameKind || session.boardKey !== board.dailyDate || session.finishedAt || elapsed < 5000 || seconds > Math.ceil(elapsed / 1000) + 20) {
      return Response.json({ error: "Результат не прошёл проверку партии" }, { status: 409 });
    }
    const profile = await getRawDb().prepare(`SELECT frame_id AS frameId,level FROM spider_profiles WHERE user_id=?`).bind(account.localId).first();
    const previous = await getRawDb().prepare(`SELECT moves FROM spider_scores WHERE user_id=? AND game_kind=? AND difficulty=? AND daily_date=? AND category=?`).bind(account.localId,board.gameKind,board.difficulty,board.dailyDate,category).first();
    const previousRankRow = previous ? await getRawDb().prepare(`SELECT COUNT(*) AS count FROM spider_scores WHERE game_kind=? AND difficulty=? AND daily_date=? AND category=? AND moves < ?`).bind(board.gameKind,board.difficulty,board.dailyDate,category,previous.moves).first() : null;
    const frameId = String(profile?.frameId || "classic"), level = bounded(profile?.level,999) || 1, now = Date.now();
    await getRawDb().batch([
      getRawDb().prepare(`INSERT INTO spider_scores (user_id,player_name,difficulty,game_kind,daily_date,seconds,moves,category,frame_id,level,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,game_kind,difficulty,daily_date,category) DO UPDATE SET player_name=excluded.player_name,moves=excluded.moves,seconds=excluded.seconds,frame_id=excluded.frame_id,level=excluded.level,updated_at=excluded.updated_at WHERE excluded.moves < spider_scores.moves`).bind(account.localId,playerName,board.difficulty,board.gameKind,board.dailyDate,seconds,moves,category,frameId,level,now),
      getRawDb().prepare(`INSERT INTO spider_attempts (user_id,player_name,difficulty,game_kind,board_key,outcome,category,moves,seconds,hints,undos,deals,first_run_deal,frame_id,level,created_at) VALUES (?,?,?,?,?,'win',?,?,?,?,?,?,?,?,?,?)`).bind(account.localId,playerName,board.difficulty,board.gameKind,board.dailyDate,category,moves,seconds,hints,undos,deals,bounded(payload.firstRunDeal,20),frameId,level,now),
      getRawDb().prepare(`UPDATE spider_game_sessions SET finished_at=? WHERE id=? AND finished_at IS NULL`).bind(now,sessionId),
    ]);
    const rankRow=await getRawDb().prepare(`SELECT COUNT(*) AS count FROM spider_scores WHERE game_kind=? AND difficulty=? AND daily_date=? AND category=? AND moves < ?`).bind(board.gameKind,board.difficulty,board.dailyDate,category,moves).first();
    return Response.json({ ok: true, category, rank:1+(Number(rankRow?.count)||0), previousRank:previousRankRow?1+Number(previousRankRow.count):null, personalBest:!previous||moves<Number(previous.moves) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить результат" }, { status: 500 }); }
}
