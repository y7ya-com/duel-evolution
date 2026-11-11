// The duel archive: every duel as it ends (ocgSession.ts: NPC and PvP), one row of duel_archive (db/archive-schema.ts)
// and its EDOPro replay (.yrpX, engine/yrpx.ts) in R2 for the players to download (GET /api/de/replays). The row also
// keeps the engine's `new` arguments and every command since: the engine is deterministic (the NPC AI's forks,
// ai/simSearch.ts, rely on it), so they give the duel back event for event, hidden hands included
// (test/npc-lab.test.ts NPC_LAB_REPLAY turns the rows into readable traces).
import type { Deck, NewOptions } from "./engine/core.ts";
import type { LoggedCmd } from "./ai/index.ts";

export const ARCHIVE_KEEP_DAYS = 90;
const DAY_S = 86400;
/** R2 prefix of the replay files (private/: never served as a site file, only through the replay API). */
export const REPLAY_PREFIX = "private/replays/";

export interface DuelCommands { v: 1; decks: Deck[]; opts: NewOptions; cmds: LoggedCmd[] }
export interface ArchiveSide { acct: string; slot: number | null; name: string | null }
export interface DuelArchiveEntry {
  at: number; kind: "npc" | "pvp";
  /** a = protocol player 0 (the human in an NPC duel); b = the PvP opponent, null against an NPC. */
  a: ArchiveSide; b: ArchiveSide | null;
  /** NPC duels: the NPC challenged, and the recipe it played (they differ under npcRules famous_decks), the AI. */
  rival: number | null; npc: number | null; tier: string | null; aiRev: number | null;
  game: number;
  /** Player a's result; abandon = the duel never ended (a closed connection, a new duel over it). */
  result: "win" | "lose" | "draw" | "abandon";
  reason: string;
  turns: number; secs: number; first: number;
  lp: [number, number] | null;
  decisions: number | null;
  /** The EDOPro replay, uncompressed. */
  yrpx: Uint8Array | null;
  commands: DuelCommands | null;
}

async function pipe(bytes: Uint8Array, through: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = through.writable.getWriter();
  void w.write(bytes); void w.close();
  return new Uint8Array(await new Response(through.readable).arrayBuffer());
}
const toB64 = (b: Uint8Array): string => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
export const gzip = (b: Uint8Array): Promise<Uint8Array> => pipe(b, new CompressionStream("gzip"));
export const gunzip = (b: Uint8Array): Promise<Uint8Array> => pipe(b, new DecompressionStream("gzip"));

/** gzip + base64 of the commands' JSON (a duel's commands repeat: about a tenth of the JSON). */
export const packCommands = async (r: DuelCommands): Promise<string> => toB64(await gzip(new TextEncoder().encode(JSON.stringify(r))));
export const unpackCommands = async (s: string): Promise<DuelCommands> => JSON.parse(new TextDecoder().decode(await gunzip(fromB64(s))));

/** The R2 key of a new replay: by month, unique. */
export function replayKey(e: Pick<DuelArchiveEntry, "at" | "kind">, rnd = crypto.randomUUID().slice(0, 8)): string {
  const d = new Date(e.at * 1000);
  return `${REPLAY_PREFIX}${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}/${e.kind}-${Math.floor(e.at)}-${rnd}.yrpX`;
}

/** The file in R2 (gzip; served with Content-Encoding: gzip, so what the browser saves is the plain .yrpX), then the row. */
export async function recordDuel(db: D1Database, bucket: R2Bucket | undefined, e: DuelArchiveEntry): Promise<void> {
  let file: string | null = null;
  if (e.yrpx && bucket) {
    file = replayKey(e);
    await bucket.put(file, await gzip(e.yrpx), { httpMetadata: { contentType: "application/octet-stream", contentEncoding: "gzip" } });
  }
  await db.prepare(`INSERT INTO duel_archive (at, kind, a_acct, a_slot, a_name, b_acct, b_slot, b_name, rival, npc, tier, ai_rev, game, result, reason,
    turns, secs, first, lp_a, lp_b, decisions, file, file_bytes, commands) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(Math.floor(e.at), e.kind, e.a.acct, e.a.slot, e.a.name, e.b?.acct ?? null, e.b?.slot ?? null, e.b?.name ?? null, e.rival, e.npc, e.tier, e.aiRev,
      e.game, e.result, e.reason, e.turns, e.secs, e.first, e.lp?.[0] ?? null, e.lp?.[1] ?? null, e.decisions, file, file ? e.yrpx!.length : null,
      e.commands ? await packCommands(e.commands) : null).run();
}

/** The cron's prune (worker.ts scheduled): the old rows and their files. */
export async function pruneArchive(db: D1Database, bucket: R2Bucket | undefined, now = Date.now()): Promise<number> {
  const cut = Math.floor(now / 1000) - ARCHIVE_KEEP_DAYS * DAY_S;
  const old = ((await db.prepare("SELECT file FROM duel_archive WHERE at < ? AND file IS NOT NULL").bind(cut).all()).results ?? []) as { file: string }[];
  for (let i = 0; bucket && i < old.length; i += 1000) await bucket.delete(old.slice(i, i + 1000).map((r) => r.file));
  await db.prepare("DELETE FROM duel_archive WHERE at < ?").bind(cut).run();
  return old.length;
}

/** One row of a player's replay list (GET /api/de/replays): from their side, the opponent named. */
export interface ReplayItem { id: number; at: number; kind: string; me: string | null; opponent: string | null; npc: number | null; game: number;
  result: string; reason: string | null; turns: number; secs: number; bytes: number | null }

/** The account's duels with a replay file, newest first (both sides of a PvP duel). */
export async function listReplays(db: D1Database, acct: string, npcName: (id: number) => string, limit = 100): Promise<ReplayItem[]> {
  const rows = ((await db.prepare(`SELECT id, at, kind, a_acct, a_name, b_acct, b_name, rival, game, result, reason, turns, secs, file_bytes
    FROM duel_archive WHERE (a_acct = ? OR b_acct = ?) AND file IS NOT NULL ORDER BY at DESC LIMIT ?`).bind(acct, acct, limit).all()).results ?? []) as Record<string, any>[];
  const flip: Record<string, string> = { win: "lose", lose: "win" };
  return rows.map((r) => {
    const mine = r.a_acct === acct;
    return { id: r.id, at: r.at, kind: r.kind, me: mine ? r.a_name : r.b_name, opponent: r.kind === "npc" ? npcName(r.rival) : mine ? r.b_name : r.a_name,
      npc: r.kind === "npc" ? r.rival : null, game: r.game, result: mine ? r.result : flip[r.result] ?? r.result, reason: r.reason, turns: r.turns,
      secs: r.secs, bytes: r.file_bytes };
  });
}

/** A replay file the account may download (a player of that duel): its R2 key and a file name for the download. */
export async function replayFile(db: D1Database, acct: string, id: number, npcName: (id: number) => string): Promise<{ key: string; name: string } | null> {
  const r = await db.prepare("SELECT at, kind, a_acct, a_name, b_acct, b_name, rival, game, file FROM duel_archive WHERE id = ?").bind(id).first() as Record<string, any> | null;
  if (!r || !r.file || (r.a_acct !== acct && r.b_acct !== acct)) return null;
  const safe = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9 ._-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 24) || "Player";
  const d = new Date(r.at * 1000).toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const b = r.kind === "npc" ? npcName(r.rival) : r.b_name;
  return { key: r.file, name: `${d}_${safe(r.a_name)}-vs-${safe(b)}${r.game > 1 ? `_game${r.game}` : ""}.yrpX` };
}

/** Player a's result of a duel that ended with this winner (protocol player: 0 = a, 1 = b / the NPC). */
export const resultOf = (winner: number | null): "win" | "lose" | "draw" => (winner === 0 ? "win" : winner === 1 ? "lose" : "draw");
