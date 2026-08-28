import { getRawDb } from "../../../db";

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function readBoard(values: URLSearchParams | Record<string, unknown>) {
  const read = (key: string) => values instanceof URLSearchParams ? values.get(key) : values[key];
  const dailyDate = String(read("dailyDate") ?? "");
  const difficulty = String(read("difficulty") ?? "");
  if (!/^\d{8}$/.test(dailyDate) || !DIFFICULTIES.has(difficulty)) return null;
  return { dailyDate, difficulty };
}

export async function GET(request: Request) {
  const board = readBoard(new URL(request.url).searchParams);
  if (!board) return Response.json({ error: "Некорректная ежедневная раскладка" }, { status: 400 });
  try {
    const [stats, scores, attempts] = await Promise.all([
      getRawDb().prepare(`
        SELECT plays, wins, total_moves AS totalMoves
        FROM spider_daily_stats
        WHERE daily_date = ? AND difficulty = ?
      `).bind(board.dailyDate, board.difficulty).first(),
      getRawDb().prepare(`
        SELECT user_id AS userId, player_name AS playerName, moves
        FROM spider_scores
        WHERE game_kind = 'daily' AND daily_date = ? AND difficulty = ? AND category = 'clean'
        ORDER BY moves ASC, updated_at ASC
        LIMIT 100
      `).bind(board.dailyDate, board.difficulty).all(),
      getRawDb().prepare(`
        SELECT moves, seconds, category
        FROM spider_attempts
        WHERE game_kind='daily' AND board_key=? AND difficulty=? AND outcome='win'
        ORDER BY moves ASC
        LIMIT 10000
      `).bind(board.dailyDate,board.difficulty).all(),
    ]);
    const plays = Number(stats?.plays) || 0;
    const wins = Number(stats?.wins) || 0;
    const totalMoves = Number(stats?.totalMoves) || 0;
    const rows=(attempts.results??[]) as Array<{moves:number;seconds:number;category:string}>;
    const medianMoves=rows.length?Number(rows[Math.floor((rows.length-1)/2)].moves):null;
    const cleanWins=rows.filter(row=>row.category==="clean").length;
    const averageSeconds=rows.length?Math.round(rows.reduce((sum,row)=>sum+Number(row.seconds||0),0)/rows.length):null;
    return Response.json({
      stats: { plays, wins, winRate: plays ? Math.round((wins / plays) * 100) : 0, averageMoves: wins ? Math.round(totalMoves / wins) : null, medianMoves, cleanWins, cleanRate:rows.length?Math.round(cleanWins/rows.length*100):0, averageSeconds },
      entries: scores.results ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось загрузить статистику";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const board = readBoard(payload);
    const event = String(payload.event ?? "");
    if (!board || !["start", "win"].includes(event)) return Response.json({ error: "Некорректные данные" }, { status: 400 });
    const moves = event === "win" ? Math.floor(Number(payload.moves)) : 0;
    if (event === "win" && (!Number.isFinite(moves) || moves < 1 || moves > 1000000)) return Response.json({ error: "Некорректное число ходов" }, { status: 400 });
    await getRawDb().prepare(`
      INSERT INTO spider_daily_stats (daily_date, difficulty, plays, wins, total_moves, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(daily_date, difficulty) DO UPDATE SET
        plays = spider_daily_stats.plays + excluded.plays,
        wins = spider_daily_stats.wins + excluded.wins,
        total_moves = spider_daily_stats.total_moves + excluded.total_moves,
        updated_at = excluded.updated_at
    `).bind(board.dailyDate, board.difficulty, event === "start" ? 1 : 0, event === "win" ? 1 : 0, moves, Date.now()).run();
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить статистику";
    return Response.json({ error: message }, { status: 500 });
  }
}
