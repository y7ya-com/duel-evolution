// The duel engine in-process: a synchronous port of py's duelcore (YOLaucher-web tools/yo2emu/duelcore/duelcore.mts,
// a Node process speaking line-delimited JSON). Same commands (new / respond / auto / surrender / end / query /
// cardinfo / list / ping), and each command returns exactly the event lines duelcore writes to stdout for it: same
// JSON (field names and order, desc_text, the player swap for first=1, brain `view`, RETRY, auto_chain, rules MR1..MR5,
// the SELECT_SUM reader patch, bot.ts for bots and `auto`). Only `ms` (and `ready.load_ms`/`pid`) are timings.
//
// Runtime-agnostic: no fs, no sqlite. The host hands in the data (data.ts; node.ts reads gamedata/engine/) and, under
// workerd, the PRECOMPILED wasm module (workerd cannot compile wasm from bytes): see node.ts / workerd.ts.
import createCore, {
  OcgDuelMode,
  OcgLocation,
  OcgLogType,
  OcgMessageType,
  OcgPosition,
  OcgQueryFlags,
  OcgResponseType,
  SelectBattleCMDAction,
  SelectIdleCMDAction,
  type InitializerSync,
  type OcgCoreSync,
  type OcgMessage,
  type OcgResponse,
} from "ocgcore-wasm";
import { Bot } from "./bot.ts";
import { placeOrderFrom, type PlaceOrder } from "../zones.ts";
import { CardDB, ScriptPack, type CardsJson, type StringsJson } from "./data.ts";
import { applyToTrack, Duel, type DuelTrack, type SelectMessage } from "./duel.ts";
import { installSelectSumPatch, pickSum, type SelectSum } from "./patch.ts";

export type Json = Record<string, unknown>;

/** The rule py's server plays (ocg_duel.DUEL_RULE, "MR1" = 2008 rules). duelcore's own default stays "MR5". */
export const PY_DUEL_RULE = "MR1";

export interface EngineData {
  cards: CardsJson;
  strings: StringsJson;
  /** gamedata/engine/scripts.pack */
  scripts: Uint8Array;
}

export interface DuelCoreOptions {
  data: EngineData | { db: CardDB; scripts: ScriptPack };
  /** Precompiled ocgcore.sync.wasm (required under workerd). Without it the library instantiates its embedded copy. */
  wasm?: WebAssembly.Module;
}

// ---------------------------------------------------------------------------
// Compat CHAININFO (duelcore.mts): ocgcore-wasm 0.1.2 does not know CHAININFO_TRIGGERING_LINK/LSCALE/RSCALE (31-33),
// which CardScripts' chain.lua asks for around Duel.RegisterEffect; unknown flags answer nil. Loaded after
// constant.lua/utility.lua.
// ---------------------------------------------------------------------------
const COMPAT_CHAININFO_LUA = `
do
  local viejo=Duel.GetChainInfo
  local sin_soporte={[31]=true,[32]=true,[33]=true}
  Duel.GetChainInfo=function(ch,...)
    local n=select('#',...)
    local hay=false
    for i=1,n do if sin_soporte[(select(i,...))] then hay=true end end
    if not hay then return viejo(ch,...) end
    local r={}
    for i=1,n do
      local f=select(i,...)
      if not sin_soporte[f] then r[i]=viejo(ch,f) end
    end
    return table.unpack(r,1,n)
  end
end
`;

/** Message type name: DRAW, SELECT_IDLECMD... (enum with reverse mapping) */
const msgName = (t: number) => (OcgMessageType as unknown as Record<number, string>)[t] ?? `MSG_${t}`;

/** splitmix64: from a seed to the core's 4 xoshiro256** u64 words */
function seedWords(seed: bigint): [bigint, bigint, bigint, bigint] {
  const M = (1n << 64n) - 1n;
  let x = seed & M;
  const next = () => {
    x = (x + 0x9e3779b97f4a7c15n) & M;
    let z = x;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M;
    return (z ^ (z >> 31n)) & M;
  };
  const w = [next(), next(), next(), next()] as [bigint, bigint, bigint, bigint];
  if (w.every((v) => v === 0n)) w[0] = 1n;
  return w;
}

/** sfc32: small PRNG for the shuffle and the bot's Math.random (reproducible per duel) */
function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: T[], rnd: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function withRandom<T>(rnd: () => number, f: () => T): T {
  const old = Math.random;
  Math.random = rnd;
  try {
    return f();
  } finally {
    Math.random = old;
  }
}

const PLAYER_KEYS = new Set(["player", "controller", "triggering_controller"]);

function swapHalves(m: number) {
  return (((m & 0xffff) << 16) | (m >>> 16)) >>> 0;
}

/** Expected response type for each selection message */
const RESPONSE_FOR: Record<number, number[]> = {
  [OcgMessageType.SELECT_BATTLECMD]: [OcgResponseType.SELECT_BATTLECMD],
  [OcgMessageType.SELECT_IDLECMD]: [OcgResponseType.SELECT_IDLECMD],
  [OcgMessageType.SELECT_EFFECTYN]: [OcgResponseType.SELECT_EFFECTYN],
  [OcgMessageType.SELECT_YESNO]: [OcgResponseType.SELECT_YESNO],
  [OcgMessageType.SELECT_OPTION]: [OcgResponseType.SELECT_OPTION],
  [OcgMessageType.SELECT_CARD]: [OcgResponseType.SELECT_CARD, OcgResponseType.SELECT_CARD_CODES],
  [OcgMessageType.SELECT_CHAIN]: [OcgResponseType.SELECT_CHAIN],
  [OcgMessageType.SELECT_PLACE]: [OcgResponseType.SELECT_PLACE],
  [OcgMessageType.SELECT_POSITION]: [OcgResponseType.SELECT_POSITION],
  [OcgMessageType.SELECT_TRIBUTE]: [OcgResponseType.SELECT_TRIBUTE],
  [OcgMessageType.SORT_CHAIN]: [OcgResponseType.SORT_CARD],
  [OcgMessageType.SELECT_COUNTER]: [OcgResponseType.SELECT_COUNTER],
  [OcgMessageType.SELECT_SUM]: [OcgResponseType.SELECT_SUM],
  [OcgMessageType.SELECT_DISFIELD]: [OcgResponseType.SELECT_DISFIELD],
  [OcgMessageType.SORT_CARD]: [OcgResponseType.SORT_CARD],
  [OcgMessageType.SELECT_UNSELECT_CARD]: [OcgResponseType.SELECT_UNSELECT_CARD],
  [OcgMessageType.ROCK_PAPER_SCISSORS]: [OcgResponseType.ROCK_PAPER_SCISSORS],
  [OcgMessageType.ANNOUNCE_RACE]: [OcgResponseType.ANNOUNCE_RACE],
  [OcgMessageType.ANNOUNCE_ATTRIB]: [OcgResponseType.ANNOUNCE_ATTRIB],
  [OcgMessageType.ANNOUNCE_CARD]: [OcgResponseType.ANNOUNCE_CARD],
  [OcgMessageType.ANNOUNCE_NUMBER]: [OcgResponseType.ANNOUNCE_NUMBER],
};

function enumValue(e: object, v: unknown, what: string): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = (e as Record<string, unknown>)[v.toUpperCase()];
    if (typeof n === "number") return n;
  }
  throw new Error(`${what} no válido: ${JSON.stringify(v)}`);
}

/**
 * SORT_CARD / SORT_CHAIN with an explicit order. ocgcore-wasm 0.1.2's response writer puts a count byte first, but the
 * core reads `order` raw (n bytes): an object whose `.length` is the first value and whose iterator yields the rest
 * makes the library write exactly the n raw bytes (duelcore.mts respuestaOrden).
 */
function rawOrder(order: number[]): number[] {
  const [first, ...rest] = order;
  return {
    get length() {
      return first;
    },
    *[Symbol.iterator]() {
      yield* rest;
    },
  } as unknown as number[];
}

/** JSON response -> OcgResponse (names or numbers; players back to core indices) */
function parseResponse(r: Json, swap: boolean): OcgResponse {
  if (!r || typeof r !== "object") throw new Error("response debe ser un objeto");
  const out: Json = { ...r };
  out.type = enumValue(OcgResponseType, r.type, "response.type");
  if (out.type === OcgResponseType.SELECT_IDLECMD) out.action = enumValue(SelectIdleCMDAction, r.action, "action");
  if (out.type === OcgResponseType.SELECT_BATTLECMD) out.action = enumValue(SelectBattleCMDAction, r.action, "action");
  if (out.type === OcgResponseType.SELECT_IDLECMD || out.type === OcgResponseType.SELECT_BATTLECMD || out.type === OcgResponseType.SELECT_CHAIN || out.type === OcgResponseType.SELECT_UNSELECT_CARD) {
    out.index = r.index ?? null;
  }
  if (out.type === OcgResponseType.SELECT_POSITION) out.position = enumValue(OcgPosition, r.position, "position");
  if (Array.isArray(r.places)) {
    out.places = (r.places as Json[]).map((p) => ({
      player: swap ? 1 - Number(p.player) : Number(p.player),
      location: enumValue(OcgLocation, p.location, "location"),
      sequence: Number(p.sequence),
    }));
  }
  if (out.type === OcgResponseType.SORT_CARD && Array.isArray(r.order) && r.order.length) out.order = rawOrder((r.order as unknown[]).map(Number));
  if (Array.isArray(r.races)) out.races = (r.races as unknown[]).map((x) => BigInt(x as number));
  if (Array.isArray(r.attributes)) out.attributes = (r.attributes as unknown[]).map(Number);
  return out as unknown as OcgResponse;
}

interface Session {
  id: unknown;
  duel: Duel;
  /** true = protocol player 1 is core player 0 (they go first) */
  swap: boolean;
  /** bots by CORE index */
  bots: (Bot | null)[];
  /** `new`'s place_order: the zone order of bot.ts and `auto` (src/duel/zones.ts) */
  placeOrder: PlaceOrder;
  track: DuelTrack;
  rnd: () => number;
  waiting: SelectMessage | null;
  /** players (PROTOCOL index) decided by an external brain: their select carries `view` */
  brain: [boolean, boolean];
  /** rejected responses (RETRY) per protocol player */
  retries: [number, number];
  humanRetries: number;
  decisions: number;
  autoChain: boolean;
  autoPassed: number;
}

const key = (id: unknown) => JSON.stringify(id);
const toProto = (s: Session, p: number) => (s.swap && (p === 0 || p === 1) ? 1 - p : p);
const lpProto = (s: Session) => (s.swap ? [s.track.lp[1], s.track.lp[0]] : [s.track.lp[0], s.track.lp[1]]);

/** Events of one command, serialized as they are emitted (duelcore's Out) */
class Out {
  lines: string[] = [];
  emit(ev: Json) {
    this.lines.push(JSON.stringify(ev));
  }
}

const BOT_LIMIT = 5000;

const LOCS: [string, number][] = [
  ["hand", OcgLocation.HAND],
  ["mzone", OcgLocation.MZONE],
  ["szone", OcgLocation.SZONE],
  ["grave", OcgLocation.GRAVE],
  ["removed", OcgLocation.REMOVED],
  ["extra", OcgLocation.EXTRA],
];

/** Face-down: neither bit 1 (face-up ATK) nor 4 (face-up DEF) */
const isFaceDown = (pos: unknown) => typeof pos === "number" && (pos & (OcgPosition.FACEUP_ATTACK | OcgPosition.FACEUP_DEFENSE)) === 0;

function randomSeed53(): bigint {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return ((BigInt(b[1]) << 32n) | BigInt(b[0])) & ((1n << 53n) - 1n);
}

export interface NewOptions {
  first?: 0 | 1;
  seed?: number | string;
  lp?: number;
  bot?: [boolean, boolean];
  auto_chain?: boolean;
  shuffle?: boolean;
  /** "MR5" (duelcore's default), "MR1".."MR4", "GOAT", "SPEED", "RUSH"; py's server passes PY_DUEL_RULE */
  rule?: string;
  brain?: string | boolean | [boolean, boolean];
  /** Zone order of bot.ts and `auto` (src/duel/zones.ts): the centre first; "py" = duelcore's 0..7 (parity runs) */
  place_order?: PlaceOrder;
}

export interface Deck {
  main: number[];
  extra?: number[];
}

export class DuelCore {
  private sessions = new Map<string, Session>();
  /** duelcore's `ready` event (`load_ms`/`pid` are host-specific) */
  readonly ready: Json;

  private constructor(
    private core: OcgCoreSync,
    private db: CardDB,
    private scripts: ScriptPack,
    loadMs: number,
  ) {
    this.ready = JSON.parse(JSON.stringify({ ev: "ready", cards: db.size, load_ms: loadMs, pid: (globalThis as { process?: { pid?: number } }).process?.pid ?? 0, parche_sum: true, compat_chaininfo: true, scripts_2008: scripts.scripts2008 }));
  }

  /** Instantiates the WASM core (async once); every command after that is synchronous. */
  static async create(opts: DuelCoreOptions): Promise<DuelCore> {
    const t0 = Date.now();
    const init: Record<string, unknown> = { sync: true };
    const wasm = opts.wasm;
    if (wasm) {
      // locateFile only skips the library's own wasm import; instantiateWasm supersedes it (no compile from bytes)
      init.locateFile = () => "ocgcore.sync.wasm";
      init.instantiateWasm = (imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) => {
        done(new WebAssembly.Instance(wasm, imports), wasm);
        return {};
      };
    }
    const core = await createCore(init as unknown as InitializerSync);
    installSelectSumPatch(core as unknown as { duelGetMessage(handle: unknown): { type: number }[] });
    const d = opts.data;
    const db = "db" in d ? d.db : new CardDB(d.cards, d.strings);
    const scripts = d.scripts instanceof ScriptPack ? d.scripts : new ScriptPack(d.scripts);
    return new DuelCore(core, db, scripts, Date.now() - t0);
  }

  get cardDB() {
    return this.db;
  }

  // ---- commands --------------------------------------------------------------------------------------------------

  /** One protocol command -> the exact JSON lines duelcore would write for it (in order). */
  commandLines(cmd: Json): string[] {
    const out = new Out();
    const t0 = Date.now();
    let c: Json = {};
    try {
      // what duelcore gets is JSON.parse(line): same normalization (undefined fields gone, etc.)
      c = JSON.parse(JSON.stringify(cmd));
      switch (c.cmd) {
        case "new":
          this.cmdNew(c, out, t0);
          break;
        case "respond":
          this.cmdRespond(c, out, t0);
          break;
        case "auto":
          this.cmdRespond(c, out, t0, true);
          break;
        case "surrender": {
          const s = this.getSession(c.id);
          const loser = Number(c.player ?? 0);
          this.endSession(s, out, { winner: 1 - loser, reason: "surrender", ms: Date.now() - t0 });
          break;
        }
        case "end": {
          const s = this.getSession(c.id);
          this.endSession(s, out, { winner: null, reason: "ended", ms: Date.now() - t0 });
          break;
        }
        case "query":
          this.cmdQuery(c, out);
          break;
        case "cardinfo":
          this.cmdCardInfo(c, out);
          break;
        case "list":
          out.emit({ ev: "list", ids: [...this.sessions.values()].map((s) => s.id) });
          break;
        case "ping":
          out.emit({ ev: "pong", duels: this.sessions.size });
          break;
        default:
          throw new Error(`comando desconocido: ${JSON.stringify(c.cmd)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.emit({ ev: "error", id: c.id ?? null, cmd: c.cmd ?? null, error: msg });
      // If the core broke mid-way (not a response format error), the duel does not go on
      const s = c.id !== undefined ? this.sessions.get(key(c.id)) : undefined;
      if (s && !s.waiting && (c.cmd === "new" || c.cmd === "respond" || c.cmd === "auto")) {
        this.endSession(s, out, { winner: null, reason: "error", error: msg });
      }
    }
    if (c.req !== undefined) for (let i = 0; i < out.lines.length; i++) out.lines[i] = out.lines[i].replace(/^\{/, `{"req":${JSON.stringify(c.req)},`);
    return out.lines;
  }

  /** One protocol command -> its events (duelcore's stdout lines, parsed). The last is a select/end/error/state/... */
  command(cmd: Json): Json[] {
    return this.commandLines(cmd).map((l) => JSON.parse(l) as Json);
  }

  // duelcore.py-shaped helpers (same fields as the Python client sends)
  new(id: unknown, decks: Deck[], o: NewOptions = {}): Json[] {
    const c: Json = { cmd: "new", id, decks, first: o.first ?? 0, lp: o.lp ?? 8000, bot: o.bot ?? [false, true], auto_chain: o.auto_chain ?? true, shuffle: o.shuffle ?? true, rule: o.rule ?? "MR5" };
    if (o.seed !== undefined && o.seed !== null) c.seed = o.seed;
    if (o.brain !== undefined && o.brain !== null) c.brain = o.brain;
    if (o.place_order !== undefined) c.place_order = o.place_order;
    return this.command(c);
  }

  respond(id: unknown, response: Json, player?: number): Json[] {
    const c: Json = { cmd: "respond", id, response };
    if (player !== undefined && player !== null) c.player = player;
    return this.command(c);
  }

  auto(id: unknown, player?: number): Json[] {
    const c: Json = { cmd: "auto", id };
    if (player !== undefined && player !== null) c.player = player;
    return this.command(c);
  }

  surrender(id: unknown, player = 0): Json[] {
    return this.command({ cmd: "surrender", id, player });
  }

  end(id: unknown): Json[] {
    return this.command({ cmd: "end", id });
  }

  /** `state` event (or `error`) */
  query(id: unknown): Json {
    return this.command({ cmd: "query", id })[0];
  }

  cardinfo(codes: number[]): Json[] {
    const ev = this.command({ cmd: "cardinfo", codes })[0];
    if (ev.ev !== "cardinfo") throw new Error(String(ev.error));
    return ev.cards as Json[];
  }

  /** Destroys every duel (duelcore on stdin close). */
  close() {
    for (const s of this.sessions.values()) {
      try {
        s.duel.destroy();
      } catch {
        /* nothing */
      }
    }
    this.sessions.clear();
  }

  // ---- duelcore.mts internals ------------------------------------------------------------------------------------

  /**
   * Core object -> plain JSON. bigint -> number (or string if it does not fit). With swap the player indices are
   * swapped (the human is always 0 outside). Adds desc_text to everything with a `description`.
   */
  private plain(v: unknown, swap: boolean, k = ""): unknown {
    if (typeof v === "bigint") return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
    if (Array.isArray(v)) {
      const arr = v.map((x) => this.plain(x, swap));
      if (swap && arr.length === 2 && (k === "players" || k === "results")) arr.reverse();
      return arr;
    }
    if (v && typeof v === "object") {
      const o: Json = {};
      const src = v as Json;
      for (const [kk, x] of Object.entries(src)) {
        if (swap && PLAYER_KEYS.has(kk) && (x === 0 || x === 1)) o[kk] = 1 - (x as number);
        else o[kk] = this.plain(x, swap, kk);
        if (kk === "description" && (typeof x === "bigint" || typeof x === "number") && Number(x) !== 0) {
          o.desc_text = this.db.describe(x, typeof src.code === "number" ? src.code : undefined);
        }
      }
      return o;
    }
    return v;
  }

  /** Core message -> JSON event body (type = name, type_id = number) */
  private messageJson(m: OcgMessage, swap: boolean): Json {
    const o = this.plain(m, swap) as Json;
    o.type_id = m.type;
    o.type = msgName(m.type);
    // FIELD_DISABLED carries the absolute mask (bits 0-15 = player 0); SELECT_PLACE/DISFIELD's is relative: untouched
    if (swap && m.type === OcgMessageType.FIELD_DISABLED && typeof o.field_mask === "number") {
      o.field_mask = swapHalves(o.field_mask);
    }
    if (m.type === OcgMessageType.SELECT_OPTION) {
      o.options_text = (m as unknown as { options: bigint[] }).options.map((d) => this.db.describe(d));
    }
    if (m.type === OcgMessageType.HINT) {
      const h = m as unknown as { hint_type: number; hint: bigint };
      if (h.hint_type === 2 || h.hint_type === 3 || h.hint_type === 5) o.hint_text = this.db.describe(h.hint);
    }
    return o;
  }

  private createDuel(decks: { main: number[]; extra: number[] }[], swap: boolean, seed: bigint, lp: number, shuffle: boolean, rnd: () => number, flags: bigint): Duel {
    const core = this.core;
    const db = this.db;
    const scripts = this.scripts;
    const team = { startingLP: lp, startingDrawCount: 5, drawCountPerTurn: 1 };
    const errors: string[] = [];
    const handle = core.createDuel({
      flags,
      seed: seedWords(seed),
      team1: team,
      team2: team,
      cardReader: (code) => db.get(code),
      scriptReader: (name) => scripts.read2008(name),
      errorHandler: (type, text) => {
        // As engine.ts: normal monsters have no script and that is not an error
        if (type === OcgLogType.ERROR && /c\d+\.lua/.test(text) && /not found|cannot open/i.test(text)) return;
        errors.push(`[${type}] ${text}`);
      },
    } as Parameters<OcgCoreSync["createDuel"]>[0]);
    if (!handle) throw new Error("ocgcore no pudo crear el duelo");
    const duel = new Duel(core, handle);
    duel.errors = errors;
    for (const s of ["constant.lua", "utility.lua"]) {
      const src = scripts.read(s);
      if (!src || !core.loadScript(handle, s, src)) throw new Error(`no se pudo cargar ${s}`);
    }
    if (!core.loadScript(handle, "yo2_compat.lua", COMPAT_CHAININFO_LUA)) throw new Error("no se pudo cargar yo2_compat.lua");
    // Core player 0 always goes first
    const coreDecks = swap ? [decks[1], decks[0]] : [decks[0], decks[1]];
    coreDecks.forEach((deck, t) => {
      const main = shuffle ? shuffled(deck.main, rnd) : [...deck.main];
      for (const code of main) {
        core.duelNewCard(handle, { team: t as 0 | 1, duelist: 0, code, controller: t as 0 | 1, location: OcgLocation.DECK, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE });
      }
      for (const code of deck.extra ?? []) {
        core.duelNewCard(handle, { team: t as 0 | 1, duelist: 0, code, controller: t as 0 | 1, location: OcgLocation.EXTRA, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE });
      }
    });
    core.startDuel(handle);
    return duel;
  }

  private endSession(s: Session, out: Out, ev: Json) {
    out.emit({ ev: "end", id: s.id, ...ev, turns: s.track.turn, lp: lpProto(s), decisions: s.decisions, human_retries: s.humanRetries, retries: s.retries, auto_passed: s.autoPassed, core_errors: s.duel.errors.slice(0, 10) });
    try {
      s.duel.destroy();
    } catch {
      /* already destroyed */
    }
    this.sessions.delete(key(s.id));
  }

  /** bot.ts decides, except SELECT_SUM with the patch: its pickSum only looks for exact sums */
  private decideBot(bot: Bot, w: SelectMessage): OcgResponse {
    if (w.type === OcgMessageType.SELECT_SUM) {
      const idx = pickSum(w as unknown as SelectSum);
      if (idx) return { type: OcgResponseType.SELECT_SUM, indicies: idx } as OcgResponse;
    }
    return bot.choose(w);
  }

  /** Runs the core: emits the messages, lets the bots play and stops at the first human (or brain) decision */
  private advance(s: Session, out: Out, t0: number) {
    let botSteps = 0;
    let botRetries = 0;
    for (;;) {
      const r = s.duel.step();
      applyToTrack(s.track, r.messages);
      for (const b of s.bots) b?.observe(r.messages);
      let retry = false;
      for (const m of r.messages) {
        if (m.type === OcgMessageType.RETRY) {
          retry = true;
          continue;
        }
        if (r.waiting && m === r.waiting) continue;
        out.emit({ ev: "msg", id: s.id, ...this.messageJson(m, s.swap) });
      }
      if (r.ended) {
        const w = r.winner;
        const win = r.messages.find((m) => m.type === OcgMessageType.WIN) as { reason?: number } | undefined;
        this.endSession(s, out, { winner: w === undefined ? null : toProto(s, w), reason: win?.reason ?? null, ms: Date.now() - t0 });
        return;
      }
      const w = r.waiting;
      if (!w) throw new Error("el core espera respuesta pero no hay mensaje de selección");
      const bot = s.bots[w.player];
      if (bot) {
        if (retry && ++botRetries > 50) throw new Error(`el bot no da una respuesta válida a ${msgName(w.type)}`);
        if (++botSteps > BOT_LIMIT) throw new Error("el bot no termina (más de 5000 decisiones seguidas)");
        s.decisions++;
        s.duel.respond(withRandom(s.rnd, () => this.decideBot(bot, w)));
        continue;
      }
      // Empty chain windows (every phase of the opponent): passed automatically unless auto_chain=false
      if (s.autoChain && !retry && w.type === OcgMessageType.SELECT_CHAIN) {
        const ch = w as unknown as { forced: boolean; selects: unknown[] };
        if (!ch.forced && ch.selects.length === 0) {
          s.autoPassed++;
          s.duel.respond({ type: OcgResponseType.SELECT_CHAIN, index: null });
          continue;
        }
      }
      s.waiting = w;
      const who = toProto(s, w.player);
      if (retry) {
        s.humanRetries++;
        if (who === 0 || who === 1) s.retries[who]++;
      }
      const ev: Json = {
        ev: "select",
        id: s.id,
        ...this.messageJson(w, s.swap),
        retry,
        turn: s.track.turn,
        turn_player: toProto(s, s.track.turnPlayer),
        phase: s.track.phase,
        lp: lpProto(s),
        ms: Date.now() - t0,
      };
      if ((who === 0 || who === 1) && s.brain[who]) ev.view = this.viewFor(s, who);
      out.emit(ev);
      return;
    }
  }

  private getSession(id: unknown): Session {
    const s = this.sessions.get(key(id));
    if (!s) throw new Error(`no hay duelo con id ${JSON.stringify(id)}`);
    return s;
  }

  private parseSeed(v: unknown): bigint {
    if (v === undefined || v === null) return randomSeed53();
    if (typeof v === "number" || typeof v === "string") return BigInt(v);
    throw new Error("seed debe ser número o cadena");
  }

  private cmdNew(c: Json, out: Out, t0: number) {
    if (c.id === undefined) throw new Error("falta id");
    if (this.sessions.has(key(c.id))) throw new Error(`ya existe un duelo con id ${JSON.stringify(c.id)}`);
    const decks = c.decks as { main: number[]; extra?: number[] }[];
    if (!Array.isArray(decks) || decks.length !== 2) throw new Error("decks debe tener dos mazos");
    const norm = decks.map((d, i) => {
      const main = (d?.main ?? []).map(Number);
      const extra = (d?.extra ?? []).map(Number);
      if (!main.length) throw new Error(`el mazo ${i} está vacío`);
      const unknown = [...main, ...extra].filter((code) => !this.db.get(code));
      if (unknown.length) throw new Error(`mazo ${i}: passcodes que no están en cards.cdb: ${[...new Set(unknown)].join(", ")}`);
      return { main, extra };
    });
    const first = Number(c.first ?? 0);
    if (first !== 0 && first !== 1) throw new Error("first debe ser 0 o 1");
    const swap = first === 1;
    const seed = this.parseSeed(c.seed);
    const lp = Number(c.lp ?? 8000);
    const botFlags = [...((c.bot as boolean[] | undefined) ?? [false, true])];
    // brain: "python" (= player 1) or [p0, p1]. That player is not played by bot.ts: it gets select with `view`
    const brainRaw = c.brain;
    let brain: [boolean, boolean] = [false, false];
    if (brainRaw === undefined || brainRaw === null || brainRaw === false) brain = [false, false];
    else if (typeof brainRaw === "string" || brainRaw === true) brain = [false, true];
    else if (Array.isArray(brainRaw) && brainRaw.length === 2) brain = [Boolean(brainRaw[0]), Boolean(brainRaw[1])];
    else throw new Error('brain debe ser "python" o [j0, j1]');
    brain.forEach((b, p) => {
      if (b) botFlags[p] = false;
    });
    const words = seedWords(seed ^ 0x5eed5eedn);
    const rnd = sfc32(Number(words[0] & 0xffffffffn), Number(words[0] >> 32n), Number(words[1] & 0xffffffffn), Number(words[1] >> 32n));
    const rule = String(c.rule ?? "MR5").toUpperCase();
    const flags = (OcgDuelMode as unknown as Record<string, bigint>)[`MODE_${rule}`];
    if (typeof flags !== "bigint") throw new Error(`rule no válida: ${rule} (MR1..MR5, GOAT, SPEED, RUSH)`);
    const duel = this.createDuel(norm, swap, seed, lp, c.shuffle !== false, rnd, flags);
    const placeOrder = placeOrderFrom(c.place_order);
    const bots: (Bot | null)[] = [0, 1].map((coreP) => {
      const protoP = swap ? 1 - coreP : coreP;
      return botFlags[protoP] ? new Bot((code) => this.db.get(code), placeOrder) : null;
    });
    const s: Session = { id: c.id, duel, swap, bots, placeOrder, track: { lp: [lp, lp], turn: 0, turnPlayer: 0, phase: 0 }, rnd, waiting: null, brain, retries: [0, 0], humanRetries: 0, decisions: 0, autoChain: c.auto_chain !== false, autoPassed: 0 };
    this.sessions.set(key(c.id), s);
    out.emit({ ev: "created", id: c.id, first, seed: seed.toString(), lp, bot: [Boolean(botFlags[0]), Boolean(botFlags[1])], brain, auto_chain: s.autoChain, rule });
    this.advance(s, out, t0);
  }

  private cmdRespond(c: Json, out: Out, t0: number, auto = false) {
    const s = this.getSession(c.id);
    const w = s.waiting;
    if (!w) throw new Error("el duelo no está esperando ninguna respuesta");
    if (c.player !== undefined && c.player !== null && Number(c.player) !== toProto(s, w.player)) {
      throw new Error(`la decisión pendiente es del jugador ${toProto(s, w.player)}, no del ${c.player}`);
    }
    let resp: OcgResponse;
    if (auto) {
      resp = withRandom(s.rnd, () => this.decideBot(new Bot((code) => this.db.get(code), s.placeOrder), w));
    } else {
      resp = parseResponse(c.response as Json, s.swap);
      const ok = RESPONSE_FOR[w.type];
      if (ok && !ok.includes(resp.type)) {
        const rt = OcgResponseType as unknown as Record<number, string>;
        throw new Error(`respuesta de tipo ${rt[resp.type]} para ${msgName(w.type)}; se espera ${ok.map((t) => rt[t]).join(" o ")}`);
      }
    }
    s.waiting = null;
    s.decisions++;
    try {
      s.duel.respond(resp);
    } catch (e) {
      // The library could not encode it (missing fields): the same decision is still pending
      s.waiting = w;
      throw e;
    }
    this.advance(s, out, t0);
  }

  /** The board as protocol player `me` sees it (honest information), for an external brain. */
  private viewFor(s: Session, me: number): Json {
    const core = this.core;
    const { handle } = s.duel.raw;
    const flags = OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE | OcgQueryFlags.LEVEL | OcgQueryFlags.OWNER;
    const players = [0, 1].map((protoP) => {
      const coreP = s.swap ? 1 - protoP : protoP;
      const mine = protoP === me;
      const q = (loc: number) =>
        core.duelQueryLocation(handle, { flags: flags as never, controller: coreP as 0 | 1, location: loc as never }).map((x) => {
          if (!x || !x.code) return null;
          const o = this.plain(x, false) as Json;
          if (typeof o.owner === "number") o.owner = toProto(s, o.owner);
          return o;
        });
      const hide = (cards: (Json | null)[]) => cards.map((x) => (x && !mine && isFaceDown(x.position) ? { code: 0, position: x.position } : x));
      const hand = q(OcgLocation.HAND);
      return {
        deck_count: core.duelQueryCount(handle, coreP as 0 | 1, OcgLocation.DECK),
        hand_count: hand.length,
        hand: mine ? hand.map((x) => x?.code ?? 0) : [],
        mzone: hide(q(OcgLocation.MZONE)),
        szone: hide(q(OcgLocation.SZONE)),
        grave: q(OcgLocation.GRAVE).map((x) => x?.code ?? 0),
        removed: q(OcgLocation.REMOVED).map((x) => (x && (mine || !isFaceDown(x.position)) ? x.code : 0)),
        extra: mine ? q(OcgLocation.EXTRA).map((x) => x?.code ?? 0) : [],
        extra_count: core.duelQueryCount(handle, coreP as 0 | 1, OcgLocation.EXTRA),
      };
    });
    return { me, players };
  }

  private cmdQuery(c: Json, out: Out) {
    const core = this.core;
    const s = this.getSession(c.id);
    const { handle } = s.duel.raw;
    const flags = OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE | OcgQueryFlags.LEVEL;
    const players = [0, 1].map((coreP) => {
      const o: Json = { deck_count: core.duelQueryCount(handle, coreP as 0 | 1, OcgLocation.DECK) };
      for (const [name, loc] of LOCS) {
        const cards = core.duelQueryLocation(handle, { flags: flags as never, controller: coreP as 0 | 1, location: loc as never });
        o[name] = cards.map((x) => (x && x.code ? this.plain(x, false) : null));
      }
      return o;
    });
    if (s.swap) players.reverse();
    out.emit({
      ev: "state",
      id: s.id,
      turn: s.track.turn,
      turn_player: toProto(s, s.track.turnPlayer),
      phase: s.track.phase,
      lp: lpProto(s),
      waiting: s.waiting ? msgName(s.waiting.type) : null,
      players,
    });
  }

  private cmdCardInfo(c: Json, out: Out) {
    const codes = (c.codes as number[]) ?? [];
    const cards = codes.map((code) => {
      const d = this.db.get(Number(code));
      return d ? { ...(this.plain(d, false) as Json), name: this.db.name(d.code) } : { code, unknown: true };
    });
    out.emit({ ev: "cardinfo", cards });
  }
}
