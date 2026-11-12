// Scenario tests for the NPC AI: a duel started from a set position (DuelSetup: cards placed on the field, in hand
// and in the graveyard before the duel starts) on the real engine, the NPC played by NpcAi (elite, with its engine
// forks), the player by a script. Each misplay seen in a real duel becomes one of these, so it cannot come back.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NpcAi, cardInfo, type LoggedCmd } from "../src/duel/ai/index.ts";
import { brainDb } from "../src/duel/data.ts";
import { DuelLog } from "../src/duel/duelText.ts";
import { PY_DUEL_RULE, type DuelCore, type DuelSetup, type Json, type NewOptions, type SetupCard } from "../src/duel/engine/core.ts";
import { ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";

let byName: Map<string, number> | null = null;
/** A card's passcode by its exact English name. */
export function code(name: string): number {
  if (!byName) {
    const texts = (JSON.parse(readFileSync(join(ENGINE_DATA_DIR, "cards.json"), "utf8")) as { texts: Record<string, string[]> }).texts;
    byName = new Map();
    for (const [pc, t] of Object.entries(texts)) if (t[0] && !byName.has(t[0])) byName.set(t[0], Number(pc));
  }
  const c = byName.get(name);
  if (!c) throw new Error(`no card named ${name}`);
  return c;
}

type MonsterPos = "atk" | "def" | "set";
export interface Side {
  lp?: number;
  hand?: string[];
  /** Monster zones in order (zone 0, 1, ...): a name (face-up attack) or [name, position]. */
  mzone?: (string | [string, MonsterPos])[];
  /** Spell/trap zones in order: a name (face-down) or [name, "up" | "set"]. */
  szone?: (string | [string, "up" | "set"])[];
  grave?: string[];
  /** The deck, drawn from the end of the list (default: Petit Moths, a 300 ATK vanilla). */
  deck?: string[];
}

export interface Scene {
  npcId: number;
  npc: Side;
  player: Side;
  /** Who takes the first turn (it has no Battle Phase and no draw). */
  first: "npc" | "player";
  /** The player's answer to a select (null = the engine's default answer). Default: pass everything, end the turn. */
  player_policy?: (sel: Json) => Json | null;
  /** Stop once this many turns have started (default 3). */
  turns?: number;
}

export interface Decision { turn: number; sel: Json; resp: Json | null }
export interface Played {
  /** Every NPC decision, in order. */
  npc: Decision[];
  /** Every engine message (ev: "msg"), in order. */
  msgs: Json[];
  /** The Duel Log, with each NPC decision (NPC_SCENE_TRACE=1 prints it). */
  log: string[];
  end: Json | null;
}

const NPC = 1, PLAYER = 0;
const FILLER = "Petit Moth";

function setupOf(scene: Scene): DuelSetup {
  const cards: SetupCard[] = [];
  const add = (player: 0 | 1, s: Side) => {
    for (const n of s.hand ?? []) cards.push({ player, code: code(n), location: "hand" });
    (s.mzone ?? []).forEach((m, sequence) => {
      const [n, pos] = typeof m === "string" ? [m, "atk" as MonsterPos] : m;
      cards.push({ player, code: code(n), location: "mzone", sequence, pos });
    });
    (s.szone ?? []).forEach((m, sequence) => {
      const [n, pos] = typeof m === "string" ? [m, "set" as const] : m;
      cards.push({ player, code: code(n), location: "szone", sequence, pos });
    });
    for (const n of s.grave ?? []) cards.push({ player, code: code(n), location: "grave" });
  };
  add(NPC, scene.npc);
  add(PLAYER, scene.player);
  return { cards, lp: [scene.player.lp ?? 8000, scene.npc.lp ?? 8000], draw: 0 };
}

/** The player's default: no chain, no optional effect, end the turn; anything else the engine's default answer. */
export function passive(sel: Json): Json | null {
  switch (sel.type) {
    case "SELECT_IDLECMD": return { type: "SELECT_IDLECMD", action: "TO_EP", index: null };
    case "SELECT_BATTLECMD": return { type: "SELECT_BATTLECMD", action: "TO_EP", index: null };
    case "SELECT_CHAIN": return sel.forced ? null : { type: "SELECT_CHAIN", index: null };
    case "SELECT_EFFECTYN": return { type: "SELECT_EFFECTYN", yes: false };
    default: return null;
  }
}

/** The player attacks with everything it can (the engine picks the targets), then ends the turn; no chains. */
export function attacker(sel: Json): Json | null {
  switch (sel.type) {
    case "SELECT_IDLECMD": return { type: "SELECT_IDLECMD", action: sel.to_bp ? "TO_BP" : "TO_EP", index: null };
    case "SELECT_BATTLECMD": return (sel.attacks as unknown[] | undefined)?.length
      ? { type: "SELECT_BATTLECMD", action: "SELECT_BATTLE", index: 0 } : { type: "SELECT_BATTLECMD", action: "TO_EP", index: null };
    default: return passive(sel);
  }
}

let seq = 0;
/** Play the scene on the real engine until the duel ends or `turns` turns have started. */
export function play(dc: DuelCore, scene: Scene): Played {
  const deckOf = (s: Side) => ({ main: (s.deck ?? Array(20).fill(FILLER)).map(code), extra: [] as number[] });
  const decks = [deckOf(scene.player), deckOf(scene.npc)];
  const opts: NewOptions = { first: scene.first === "npc" ? NPC : PLAYER, seed: 1, shuffle: false, rule: PY_DUEL_RULE, brain: [true, true], auto_chain: true, setup: setupOf(scene) };
  const id = `scene-${++seq}`;
  const log: LoggedCmd[] = [];
  const ai = new NpcAi({ npcId: scene.npcId, seat: NPC, seed: 1, cards: cardInfo(dc.cardDB, brainDb()), tier: "elite", link: () => ({ dc, decks, opts, log }), peek: () => dc.query(id) });
  const policy = scene.player_policy ?? passive;
  const out: Played = { npc: [], msgs: [], log: [], end: null };
  const text = new DuelLog(["Player", "NPC"], { name: (c) => (dc.cardDB.get(c) ? dc.cardDB.name(c) : ""), stats: (c) => ({ atk: dc.cardDB.get(c)?.attack ?? 0, def: dc.cardDB.get(c)?.defense ?? 0 }) });
  let turn = 0;
  let evs = dc.new(id, decks, opts);
  try {
    for (let n = 0; n < 2000; n++) {
      out.log.push(...text.feed(evs));
      for (const e of evs) {
        if (e.ev !== "msg") continue;
        out.msgs.push(e);
        ai.observe(e);
        if (e.type === "NEW_TURN") turn++;
      }
      const last = evs[evs.length - 1]!;
      if (last.ev === "end") { out.end = last; return out; }
      if (turn > (scene.turns ?? 3) || last.ev !== "select") return out;
      const p = Number(last.player);
      let r: Json | null = null;
      if (!last.retry) {
        r = p === NPC ? ai.choose(last) : policy(last);
        if (p === NPC) { out.npc.push({ turn, sel: last, resp: r }); out.log.push(`    npc> ${String(last.type)} -> ${JSON.stringify(r)}`); }
      }
      if (r) { log.push({ r, p }); evs = dc.respond(id, r, p); }
      else { log.push({}); evs = dc.auto(id); }
    }
    return out;
  } finally {
    if (!out.end) dc.end(id);
    if (process.env.NPC_SCENE_TRACE) console.log(out.log.join("\n"));
  }
}

/** A player script: activate the named card (idle or chain prompt) whenever it is offered, else `then`. */
export function activating(name: string, then: (sel: Json) => Json | null = passive): (sel: Json) => Json | null {
  const c = code(name);
  return (sel) => {
    const list = (sel.type === "SELECT_IDLECMD" ? sel.activates : sel.type === "SELECT_CHAIN" ? sel.selects : null) as Json[] | null;
    const i = list?.findIndex((x) => x.code === c) ?? -1;
    if (i >= 0 && sel.type === "SELECT_IDLECMD") return { type: "SELECT_IDLECMD", action: "SELECT_ACTIVATE", index: i };
    if (i >= 0) return { type: "SELECT_CHAIN", index: i };
    return then(sel);
  };
}

/** A player script: Normal Summon the first monster it can each turn, else `then`. */
export function summoning(then: (sel: Json) => Json | null = passive): (sel: Json) => Json | null {
  return (sel) => (sel.type === "SELECT_IDLECMD" && (sel.summons as unknown[] | undefined)?.length
    ? { type: "SELECT_IDLECMD", action: "SELECT_SUMMON", index: 0 } : then(sel));
}

const NPC_SEAT = 1;
/** The NPC activated this card (a CHAINING message of its own). */
export function npcActivated(p: Played, name: string): boolean {
  return msgs(p, "CHAINING", name).some((m) => Number(m.controller ?? (m.card as Json | undefined)?.controller) === NPC_SEAT);
}

/** The card went from the field to the graveyard or banishment (destroyed, tributed, ...). */
export function leftField(p: Played, name: string): boolean {
  const c = code(name);
  return p.msgs.some((m) => m.type === "MOVE" && (m.card === c || (m.card as Json | undefined)?.code === c || m.code === c)
    && (Number((m.from as Json | undefined)?.location) & 0x0c) !== 0 && (Number((m.to as Json | undefined)?.location) & 0x30) !== 0);
}

/** The NPC's decisions of one prompt type, as [turn, response]. */
export function npcChoices(p: Played, type: string): [number, Json | null][] {
  return p.npc.filter((d) => d.sel.type === type).map((d) => [d.turn, d.resp]);
}

/** The messages of one type, optionally only those about one card (by name). */
export function msgs(p: Played, type: string, name?: string): Json[] {
  const c = name ? code(name) : 0;
  return p.msgs.filter((m) => m.type === type && (!c || m.code === c || (m.card as Json | undefined)?.code === c));
}
