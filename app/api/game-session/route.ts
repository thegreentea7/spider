import { getRawDb } from "../../../db";
import { spiderAccount } from "../spider-auth";

const DIFFICULTIES = new Set(["easy","medium","hard"]);
const KINDS = new Set(["random","daily","weekly"]);
export async function POST(request: Request) {
  const account = await spiderAccount(request);
  if (!account?.localId) return Response.json({error:"Требуется вход"},{status:401});
  const p=(await request.json()) as Record<string,unknown>;
  const difficulty=String(p.difficulty||""),gameKind=String(p.gameKind||""),boardKey=["daily","weekly"].includes(gameKind)?String(p.dailyDateKey||""):"";
  if(!DIFFICULTIES.has(difficulty)||!KINDS.has(gameKind))return Response.json({error:"Некорректная партия"},{status:400});
  if(gameKind==="daily"&&!/^\d{8}$/.test(boardKey))return Response.json({error:"Некорректная дата"},{status:400});
  if(gameKind==="weekly"&&!/^\d{4}W\d{2}$/.test(boardKey))return Response.json({error:"Некорректная неделя"},{status:400});
  const id=crypto.randomUUID(),startedAt=Date.now();
  await getRawDb().prepare(`INSERT INTO spider_game_sessions (id,user_id,difficulty,game_kind,board_key,started_at) VALUES (?,?,?,?,?,?)`).bind(id,account.localId,difficulty,gameKind,boardKey,startedAt).run();
  return Response.json({sessionId:id,startedAt});
}
