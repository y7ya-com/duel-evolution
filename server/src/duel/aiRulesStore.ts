// The NPC card rules' live overlay in D1 (npc_ai_rules, db/archive-schema.ts): loaded when the World DO starts, pushed
// and reverted through POST /__admin/ai-rules (do.ts; scripts/ai-rules.sh). A push is checked in full first
// (ai/ruleExpr.ts): a set that does not compile changes nothing. The next NPC duel plays by it; duels already running
// keep theirs.
import { activeRules, buildRules, setActiveRules, type RuleSet } from "./ai/ruleSet.ts";
import { RuleError, type RuleSetJson } from "./ai/ruleExpr.ts";

const MAX_BYTES = 256 * 1024;
const HISTORY = 20;

type Json = Record<string, unknown>;
interface Row { id: number; at: number; by: string; note: string | null; overlay: string }

/** The newest version, compiled over rules.json; rules.json alone without one, or when it no longer compiles over it
 *  (a deploy changed rules.json under it: logged, and the next push replaces it). */
export async function loadAiRules(db: D1Database, log: (s: string) => void = console.warn): Promise<RuleSet> {
  const r = await db.prepare("SELECT id, overlay FROM npc_ai_rules ORDER BY id DESC LIMIT 1").first<{ id: number; overlay: string }>();
  if (!r) return buildRules(null, 0);
  try {
    return buildRules(JSON.parse(r.overlay), r.id);
  } catch (e) {
    log(`[ai-rules] version ${r.id} does not compile over this server's rules.json, playing rules.json alone: ${e instanceof Error ? e.message : e}`);
    return buildRules(null, 0);
  }
}

/** What the overlay changes: per card ("npc 84 / card" for an NPC's own), the fields it sets or removes. */
export function overlayCards(o: RuleSetJson | null): string[] {
  if (!o) return [];
  const one = (t: Record<string, unknown> | undefined, pre: string) => Object.entries(t ?? {}).map(([n, r]) =>
    `${pre}${n}${r === null ? ": no rule" : r && typeof r === "object" ? ` (${Object.keys(r).join(", ")})` : ""}`);
  return [...one(o.staples, ""), ...Object.entries(o.npcs ?? {}).flatMap(([id, t]) => one(t ?? undefined, `npc ${id} / `))];
}

export async function aiRulesView(db: D1Database): Promise<Json> {
  const cur = activeRules();
  const rows = ((await db.prepare(`SELECT id, at, by, note, length(overlay) AS bytes FROM npc_ai_rules ORDER BY id DESC LIMIT ${HISTORY}`).all()).results ?? []);
  return { version: cur.version, overlay: cur.overlay ?? {}, cards: overlayCards(cur.overlay), rules: cur.compiled.count, history: rows };
}

/** POST /__admin/ai-rules: { overlay, note?, dryRun? } checks (and unless dryRun stores and plays) a new version;
 *  { revert: id } pushes version id's overlay again as a new version. */
export async function aiRulesPost(db: D1Database, by: string, body: Json): Promise<[number, Json]> {
  let overlay: unknown = body.overlay, note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
  if (body.revert !== undefined) {
    const id = Number(body.revert);
    const r = Number.isInteger(id) ? await db.prepare("SELECT id, at, by, note, overlay FROM npc_ai_rules WHERE id = ?").bind(id).first<Row>() : null;
    if (!r) return [404, { error: `no version ${body.revert}` }];
    overlay = JSON.parse(r.overlay);
    note = `revert to version ${id}${note ? `: ${note}` : ""}`;
  }
  if (overlay === undefined) return [400, { error: "overlay missing: { overlay: {...}, note, dryRun } or { revert: <version> }" }];
  const text = JSON.stringify(overlay);
  if (text.length > MAX_BYTES) return [413, { error: `overlay over ${MAX_BYTES} bytes` }];
  let set: RuleSet;
  try {
    set = buildRules(overlay, 0);
  } catch (e) {
    if (e instanceof RuleError) return [400, { error: e.message }];
    throw e;
  }
  const summary = { rules: set.compiled.count, cards: overlayCards(set.overlay) };
  if (body.dryRun === true) return [200, { ok: true, dryRun: true, ...summary }];
  const at = Math.floor(Date.now() / 1000);
  const row = await db.prepare("INSERT INTO npc_ai_rules (at, by, note, overlay) VALUES (?, ?, ?, ?) RETURNING id").bind(at, by, note, text).first<{ id: number }>();
  const version = row!.id;
  setActiveRules({ ...set, version });
  return [200, { ok: true, version, note, ...summary }];
}
