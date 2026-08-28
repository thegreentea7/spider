import { getRawDb } from "../../../db";
import { spiderAccount } from "../spider-auth";

const FRAMES = new Set(["classic", "blossom", "crown", "weekly", "master"]);
function cleanName(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 24); }

export async function GET(request: Request) {
  const account = await spiderAccount(request);
  if (!account?.localId) return Response.json({ error: "Требуется вход" }, { status: 401 });
  const profile = await getRawDb().prepare(`SELECT player_name AS playerName, level, xp, frame_id AS frameId, progress_json AS progressJson FROM spider_profiles WHERE user_id = ?`).bind(account.localId).first();
  if (!profile) return Response.json({ profile: null });
  let progress = {};
  try { progress = JSON.parse(String(profile.progressJson || "{}")); } catch { /* empty */ }
  return Response.json({ profile: { ...profile, progress, progressJson: undefined } });
}

export async function PUT(request: Request) {
  const account = await spiderAccount(request);
  if (!account?.localId) return Response.json({ error: "Требуется вход" }, { status: 401 });
  const payload = (await request.json()) as Record<string, unknown>;
  const progress = payload.progress && typeof payload.progress === "object" ? payload.progress : {};
  const progressJson = JSON.stringify(progress);
  if (progressJson.length > 450000) return Response.json({ error: "Слишком большой прогресс" }, { status: 413 });
  const xp = Math.max(0, Math.min(10000000, Math.floor(Number(payload.xp) || 0)));
  const level = Math.max(1, Math.min(999, Math.floor(Number(payload.level) || 1)));
  const frameId = FRAMES.has(String(payload.frameId)) ? String(payload.frameId) : "classic";
  const playerName = cleanName(payload.playerName) || cleanName(account.displayName) || "Игрок";
  await getRawDb().prepare(`INSERT INTO spider_profiles (user_id, player_name, level, xp, frame_id, progress_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET player_name=excluded.player_name, level=excluded.level, xp=excluded.xp, frame_id=excluded.frame_id, progress_json=excluded.progress_json, updated_at=excluded.updated_at`).bind(account.localId, playerName, level, xp, frameId, progressJson, Date.now()).run();
  return Response.json({ ok: true });
}
