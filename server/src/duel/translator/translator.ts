// Port of py research/traductor/translator.py (class YO2Duel): ocgcore/duelcore events -> the YO2 client's messages
// (0x6202 DUEL_SETCOMMAND, 0x6611/0x6612 masks, 0x6610 lists, 0x6461 timer) and the client's plays (0x6350, 0x6351,
// 0x002e, 0x6423, 0x6426, 0x6432) -> duelcore responses. Byte-for-byte with py (test/duel-translator.test.ts replays
// recorded py duels). Method and field names are py's, so both files read side by side; py NOTES.md has the evidence.
//
// Everything that goes to the client is a list of [message id, bytes] (internally a bare Uint8Array is a 0x6202, as in
// py; the public methods normalize). Towards duelcore: {cmd: "respond", response} | {cmd: "auto"} | null.
// Player 0 is always the human (this view's client).
import type { PyRandom } from "../../util/pyrandom.ts";
import type { CardMap } from "./cardmap.ts";
import * as K from "./consts.ts";
import type { PileName, Where } from "./consts.ts";
import {
  _declarable, _free_places, bit, hand_seed_for, monst_seed_for, sum_completable, sum_vals, sum_valido, type SumVals,
} from "./helpers.ts";
import {
  C_DRAW, C_DUEL_END, C_PHASE, C_SHUFFLE, C_SUMMON, C_TURN_CHANGE, CMD_ACTIVATE, CMD_ATTACK, CMD_FLIP, CMD_GENERIC,
  CMD_LOOK, CMD_SET, CMD_SET_ST, CMD_SPSUMMON, CMD_SUMMON, CMD_TO_ATK, CMD_TO_DEF, comid_field, comid_hand,
  duel_finish, engine, loc, mk, PH_BATTLE, PH_END, PH_MAIN2, request_input, set_card, setcommand, asIndex,
  asInternal, type Param, HIDDEN_MONSTER, HIDDEN_SPELL, HIDDEN_TRAP, HINT_ANNOUNCE, listAdd, listItem, T_LIST_RESET, T_VIEW, T_VIEW1C, timeup_warning, ZONE_BANISH, ZONE_DECK, ZONE_EXTRA, ZONE_GRAVE, ZONE_HAND,
  type Masks,
} from "./lockstep.ts";
import { concat, eqPair, get, int, isInt, low, packBIIII, popcount, pyRound, repr, shr, truthy, u32, unpackU32 } from "./py.ts";
import { placeOrderFrom } from "../zones.ts";

export type Msg = [number, Uint8Array];
type Out = Uint8Array | Msg;
/** A (value, kind) pair of a T_LIST_ADD list; kind 4 = a card (its value an asInternal card reference). */
type Pair = [Param, number];
export type Cmd = { cmd: "respond"; response: any } | { cmd: "auto" };
type Ev = any;
type St = any;

const M_6202 = 0x6202;
const tup = (m: Out): Msg => (m instanceof Uint8Array ? [M_6202, m] : m);
/** What the host puts on the wire: a bare bytes item is a 0x6202 (ocg_duel.Sender.put). */
export const norm = (lst: readonly Out[]): Msg[] => lst.map(tup);

const _respond = (t: string, kw: Record<string, any>): any => ({ type: t, ...kw });

/** aux.Stringid(code, n) of this ocgcore = code << 20 | n -> (passcode, n); a system text -> (0, desc). */
function _desc_card(desc: any): [number, number] {
  const d = int(desc || 0);
  if (shr(d, 20) && low(d, 20) < 16) return [shr(d, 20), low(d, 20)];
  return [0, d];
}

function _option_key(desc: number): number {
  const d = int(desc);
  if (shr(d, 20) && low(d, 20) < 16) return K._sid(shr(d, 20), low(d, 20));
  return d;
}

export class Card {
  face = false;
  defense = false;
  known: number | null = null;
  constructor(public uid: number, public owner: number, public code: any) {}
}

export class Side {
  deck: number[] = [];
  hand: number[] = [];
  grave: number[] = [];
  banish: number[] = [];
  extra: number[] = [];
  mz: (number | null)[] = [null, null, null, null, null];
  sz: (number | null)[] = [null, null, null, null, null, null];
  pile(name: Where): (number | null)[] { return (this as any)[name]; }
}

export interface Deck { main?: number[]; extra?: number[] | null }

export interface YO2DuelOptions {
  first?: number;
  /** py CardMap (gamedata/translator.json). */
  cardmap: CardMap;
  /** overrides of DEFAULT_CFG (PvP: {npc_phrases: false, turn_timer: 0}). */
  cfg?: Record<string, any> | null;
  log?: ((s: string) => void) | null;
  /** The server-wide PyRandom (py's module-level `random`): every call happens in py's order. */
  rng: PyRandom;
  /** Monotonic seconds (py time.monotonic) for the turn timer. */
  clock?: () => number;
}

export class YO2Duel {
  static readonly IDLE_LISTS: readonly [string, string, number | null][] = [
    ["summons", "SELECT_SUMMON", CMD_SUMMON], ["special_summons", "SELECT_SPECIAL_SUMMON", CMD_SPSUMMON],
    ["pos_changes", "SELECT_POS_CHANGE", null], ["monster_sets", "SELECT_MONSTER_SET", CMD_SET],
    ["spell_sets", "SELECT_SPELL_SET", CMD_SET_ST], ["activates", "SELECT_ACTIVATE", CMD_ACTIVATE]];
  static readonly DIALOG_MODES = ["position", "race", "attrib", "number", "option", "option_yn", "counter"];
  static readonly _LP_EVENTS = ["DAMAGE", "RECOVER", "PAY_LPCOST", "LPUPDATE"];
  static readonly _HAND_KEEP = ["CONFIRM_CARDS", "CONFIRM_DECKTOP", "HINT", "CARD_HINT", "RETRY"];
  static readonly _LP_KEEP = 50;
  static readonly _DISARM = ["CHAINING", "CHAIN_SOLVED", "CHAIN_END", "NEW_TURN", "NEW_PHASE", "SUMMONING", "SPSUMMONING", "SET"];
  static readonly _TRIGGERS = ["CHAINING", "SUMMONING", "SPSUMMONING", "FLIPSUMMONING"];
  static readonly _EV_KEEP = ["SUMMONING", "SUMMONED", "SPSUMMONING", "SPSUMMONED", "FLIPSUMMONING", "FLIPSUMMONED", "ATTACK",
    "DAMAGE_STEP_START", "DRAW", "NEW_PHASE"];
  static readonly _EV_DROP = ["NEW_TURN", "NEW_PHASE", "CHAIN_END", "CHAINING", "ATTACK", "DRAW", "SET", "DAMAGE_STEP_START",
    "BATTLE", "DAMAGE", "SUMMONING", "SUMMONED", "SPSUMMONING", "SPSUMMONED", "FLIPSUMMONING", "FLIPSUMMONED"];
  static readonly _BATTLE_CLOSE = ["MOVE", "CHAINING", "ATTACK", "ATTACK_DISABLED", "DAMAGE_STEP_END", "NEW_PHASE", "NEW_TURN", "WIN"];
  static readonly _TRIBUTE_STOP = ["CHAINING", "CHAINED", "CHAIN_SOLVING", "CHAIN_SOLVED", "CHAIN_END", "CHAIN_NEGATED",
    "CHAIN_DISABLED", "NEW_TURN", "NEW_PHASE", "SPSUMMONING", "FLIPSUMMONING", "ATTACK", "BATTLE", "DAMAGE", "RECOVER",
    "PAY_LPCOST", "LPUPDATE", "DRAW", "WIN"];
  static readonly _FUSION_STOP = ["SPSUMMONING", "SUMMONING", "SET", "CHAINING", "CHAIN_SOLVED", "CHAIN_END", "NEW_PHASE", "NEW_TURN"];

  readonly cm: CardMap;
  readonly cfg: Record<string, any>;
  log: (s: string) => void;
  readonly rng: PyRandom;
  clock: () => number;
  first: number;
  cards = new Map<number, Card>();
  side: [Side, Side] = [new Side(), new Side()];
  lp: [number, number];
  next_serial: [number, number] = [0, 0];
  turn_player: number | null = null;
  phase: number | null = null;
  in_battle = false;
  in_damage = false;
  chain: [number, number][] = [];
  pending: [number, Ev] | null = null;
  waiting: Ev | null = null;
  state: St | null = null;
  finished = false;
  stat_sent = new Map<number, [number, number] | null>();
  /** callable -> duelcore query; when set, each request is preceded by sync_board */
  query: (() => any) | null = null;
  _syncing = false;
  attacking = false;
  viewing = false;
  unknown: string[] = [];
  links: [number, number, number][] = [];
  summoning: [number, number][] = [];
  ritual_mats = new Set<number>();
  place_manual = false;
  attacker: [number, number] | null = null;
  trigger: number | null = null;
  chain_codes: any[] = [];
  solving: number | null = null;
  _batch: Ev[] | null = null;
  _bi: number | null = null;
  tribute_armed = false;
  retry_n = 0;
  field_shown: [number, number] | null = null;
  _field_seen = new Map<number, number>();
  /** "side+pile" already logged by _pile_drift (once per duel). */
  _drift = new Set<string>();
  fusion_armed = false;
  fusion_mats: number[] = [];
  fusion_started: number[] = [];
  battle_open = false;
  list_dirty = false;
  /** unselect_list: the cards still to give to the next SELECT_UNSELECT_CARD prompts of the run (ocg keys), and whether
   *  the list was closed as finished (then the run is finished when ocgcore allows it). */
  unsel_queue: { keys: string[]; done: boolean } | null = null;
  timer_deadline: number | null = null;
  ocg_phase: number | null = null;
  discard_open = false;
  hand_open: number | null = null;
  hud: [number, number, number][] | null = null;
  /** (duel id, view, session) for the [lp] warning; the host may set it (py _lp_tag reads the query closure) */
  lp_tag: [string, number, { turn?: number } | null] | null = null;
  lp_ctx = "";
  lp_card: any = null;
  turn_no = 0;
  lp_desync_n = 0;
  lp_desync: any[] = [];
  lp_anim = new Set<number>();
  ev_last: [string, any, any] | null = null;
  dmg_player: any = null;
  duel_id: string | null = null;

  /** decks = [{main: [passcodes], extra: [...]}, {...}] in protocol indices (0 = human), in the order they are imposed
   * on the client. Their sizes MUST match what the client knows (0x6601 and 0x6005). */
  constructor(decks: Deck[], opts: YO2DuelOptions) {
    this.cm = opts.cardmap;
    this.cfg = { ...K.DEFAULT_CFG, ...(opts.cfg ?? {}) };
    this.log = opts.log ?? (() => {});
    this.rng = opts.rng;
    this.clock = opts.clock ?? (() => performance.now() / 1000);
    this.first = opts.first ?? 0;
    this.lp = [this.cfg.lp, this.cfg.lp];
    for (const p of [0, 1]) {
      let serial = 0;
      for (const code of get(decks[p], "main", []) ?? []) {
        serial += 1;
        const c = this._new_card(p, serial, code);
        this.side[p].deck.push(c.uid);
      }
      for (const code of get(decks[p], "extra", []) || []) {
        serial += 1;
        const c = this._new_card(p, serial, code);
        this.side[p].extra.push(c.uid);
      }
      const base = this.cfg.token_serial_base;
      this.next_serial[p] = truthy(base) ? base - 1 : serial;
    }
  }

  // ================================================================================== state utilities ======
  _new_card(owner: number, serial: number, code: any): Card {
    const uid = owner + 2 * serial;
    const c = new Card(uid, owner, code);
    this.cards.set(uid, c);
    return c;
  }

  card(uid: number): Card {
    const c = this.cards.get(uid);
    if (!c) throw new Error(`KeyError: ${uid}`);
    return c;
  }

  _warn(s: string): void {
    this.unknown.push(s);
    this.log("[traductor] " + s);
  }

  /** The passcode the client's card table has for this card (an alternate art it lacks: its base card's), else a
   *  hidden monster's (the client's codec shows its placeholder). */
  _pc(code: any): number {
    const w = truthy(code) ? this.cm.wire(code) : null;
    if (w == null) {
      if (truthy(code)) this._warn(`passcode ${code} no está en la tabla del cliente: uso tapadera`);
      return HIDDEN_MONSTER;
    }
    return w;
  }

  /** Whether player 0 can't see card c: the other side's deck, hand and extra, and its face-down field cards (the
   *  engine's select events carry their real codes: a list prompt must not). */
  _hides(c: Card, where: Where, p: number): boolean {
    return this._hides_side(p) && (["deck", "hand", "extra"].includes(where) || (["mz", "sz"].includes(where) && !c.face));
  }

  /** Whose hidden cards this view hides: the other side's (hide_npc), or both (public_view: the spectators'). */
  _hides_side(p: number): boolean { return !!this.cfg.public_view || (!!this.cfg.hide_npc && p === 1); }

  /** Player p is this view's own player (the public view has none). */
  _own(p: number): boolean { return p === 0 && !this.cfg.public_view; }

  /** The card the client must have for card c in `where` (player 0's view): the NPC's hidden cards wear a cover. */
  _visible(c: Card, where: Where, p: number): number {
    if (this._hides(c, where, p)) {
      if (where === "sz") return this.cm.kind(c.code) === "spell" ? HIDDEN_SPELL : HIDDEN_TRAP;
      return HIDDEN_MONSTER;
    }
    return this._pc(c.code);
  }

  /** uid -> [player, container, index] */
  find(uid: number): [number, Where, number] | null {
    for (const p of [0, 1]) {
      const s = this.side[p];
      for (const name of ["hand", "deck", "grave", "banish", "extra", "mz", "sz"] as Where[]) {
        const i = s.pile(name).indexOf(uid);
        if (i >= 0) return [p, name, i];
      }
    }
    return null;
  }

  findx(uid: number): [number, Where, number] {
    const f = this.find(uid);
    if (!f) throw new Error(`TypeError: cannot unpack non-iterable NoneType (uid ${uid})`);
    return f;
  }

  /** (container, index) -> (YO2 zone, YO2 index). Field: zone = slot (0-4 monsters, 5-9 S/T, 10 field). */
  static yo2_zone(where: Where, i: number): [number, number] {
    if (where === "mz") return [i, 0];
    if (where === "sz") return [i < 5 ? 5 + i : 10, 0];
    return [K.PILE_ZONE[where], i];
  }

  yo2_zone(where: Where, i: number): [number, number] { return YO2Duel.yo2_zone(where, i); }

  /** ocgcore (controller, location, sequence) -> (player, container, mirror index). */
  ocg_slot(controller: number, location: number, sequence: number): [number, Where | null, number] {
    const p = controller;
    if (location === K.OCG_MZONE) return [p, "mz", sequence];
    if (location === K.OCG_SZONE) {
      if (sequence > 5) this._warn(`zona M/T ${sequence} (péndulo) no existe en YO2`);
      return [p, "sz", Math.min(sequence, 5)];
    }
    if (location === K.OCG_DECK) return [p, "deck", this.side[p].deck.length - 1 - sequence];
    if (K.OCG_PILE.has(location)) return [p, K.OCG_PILE.get(location)!, sequence];
    return [p, null, sequence];
  }

  uid_at(controller: number, location: number, sequence: number): number | null {
    const [p, where, i] = this.ocg_slot(controller, location, sequence);
    if (where === null) return null;
    const lst = this.side[p].pile(where);
    return i >= 0 && i < lst.length ? lst[i] : null;
  }

  _packed_src(uid: number): number {
    const [p, where, i] = this.findx(uid);
    const [z] = this.yo2_zone(where, i);
    return (p & 1) | ((z & 0x1f) << 1) | ((uid & 0xff) << 6);
  }

  /** If the client does not have the right identity for uid, writes it with 0x40 in its current slot. */
  _identity(uid: number, real = false): Out[] {
    const c = this.card(uid);
    const l = this.find(uid);
    if (!l) return [];
    const [p, where, i] = l;
    const want = real ? this._pc(c.code) : this._visible(c, where, p);
    if (c.known === want) return [];
    c.known = want;
    const serial = uid >> 1;
    if (where === "mz" || where === "sz") {
      const [slot] = this.yo2_zone(where, i);
      return [set_card(p, 0, slot, want, serial, c.owner), YO2Duel._refresh_view(uid, p, slot, 0)];
    }
    const out: Out[] = [set_card(p, K.PILE_ZONE[where], i, want, serial, c.owner)];
    if (where === "hand") out.push(YO2Duel._refresh_view(uid, p, ZONE_HAND, i));
    return out;
  }

  /** 0x6202 type 0x1c: refresh the view object's image of the card (hand/field). */
  static _refresh_view(uid: number, p: number, zone: number, idx: number): Uint8Array {
    return setcommand(T_VIEW1C, 0, [0, uid & 0xffff, p & 1, zone, idx, 0, 0]);
  }

  // ======================================================================================= start ============
  /** DUEL_START + both decks and extras imposed with 0x40 (mirror order, visible identities). */
  start(): Msg[] {
    const out: Uint8Array[] = [engine(0x01)];
    for (const p of [0, 1]) {
      for (const where of ["deck", "extra"] as PileName[]) {
        this.side[p].pile(where).forEach((uid, i) => {
          const c = this.card(uid!);
          c.known = this._visible(c, where, p);
          out.push(set_card(p, K.PILE_ZONE[where], i, c.known, uid! >> 1, c.owner));
        });
      }
    }
    return out.map((m) => [M_6202, m]);
  }

  // ==================================================================================== duelcore events =======
  /** A batch of events up to the next decision (kept so tributes/fusions/battle damage can look ahead). */
  feed_many(events: Ev[]): Msg[] {
    let out: Out[] = [];
    this._batch = events;
    this.lp_anim = new Set();
    try {
      events.forEach((ev, i) => {
        this._bi = i;
        out = out.concat(this._feed(ev));
      });
    } finally {
      this._batch = this._bi = null;
    }
    if (events.length) {
      const last = events[events.length - 1];
      if (!(last.ev === "select" && get(last, "player", 0) === 0)) out = out.concat(this._stat_boundary());
      out = out.concat(this._lp_watch([], [0, 1]));
    }
    return norm(out);
  }

  /** One duelcore event -> messages for the client. */
  feed(ev: Ev): Msg[] { return norm(this._feed(ev)); }

  _feed(ev: Ev): Out[] {
    const kind = ev.ev;
    let out: Out[] = [];
    if (this.hud === null) this._hud_init();
    if (kind === "msg") {
      const t = ev.type;
      if (this.pending !== null) out = out.concat(this._flush_pending(ev));
      this._track_trigger(ev);
      if (YO2Duel._BATTLE_CLOSE.includes(t)) this.battle_open = false;
      this._lp_note(ev, t);
      const fn = (this as any)["_m_" + String(t)];
      if (this.hand_open !== null && !YO2Duel._HAND_KEEP.includes(t)) out = out.concat(this._hand_close());
      if (typeof fn === "function") out = out.concat(fn.call(this, ev) || []);
      else if (!K.IGNORED.has(t)) this._warn(`mensaje ${t} sin traducción`);
      if (["CHAIN_SOLVED", "CHAIN_END", "NEW_PHASE", "NEW_TURN"].includes(t)) {
        if (this.ritual_mats.size) this.ritual_mats = new Set();
      }
      if (YO2Duel._DISARM.includes(t)) {
        this.tribute_armed = this.fusion_armed = false;
        this.fusion_mats = [];
        this.fusion_started = [];
      }
      if (this.pending === null) out = out.concat(this._field_check());
      out = out.concat(this._lp_watch(out, YO2Duel._LP_EVENTS.includes(t) ? [get(ev, "player", 0) & 1] : null));
    } else if (kind === "select") {
      out = out.concat(this._flush_pending(null));
      out = out.concat(this._field_check());
      out = out.concat(this._lp_watch(out, [0, 1], ev.lp));
      this.lp_anim = new Set();
      const sel = this._on_select(ev);
      if (this.hand_open !== null && (this.state ?? {}).kind !== K.KIND_OPP_HAND) out = out.concat(this._hand_close());
      this._hud_track(sel);
      return out.concat(sel);
    } else if (kind === "end") {
      out = out.concat(this._flush_pending(null));
      if (!this.finished) {
        const w = ev.winner;
        out = out.concat(this._finish(w == null ? 2 : w, ev.reason));
      }
      this._hud_track(out);
    }
    return out.map(tup);
  }

  _track_trigger(ev: Ev): void {
    const t = ev.type;
    const prev = this.ev_last;
    if (YO2Duel._EV_DROP.includes(t)) this.ev_last = null;
    if (YO2Duel._EV_KEEP.includes(t)) {
      let p = t === "DRAW" || t === "NEW_PHASE" ? ev.player : ev.controller;
      if (p == null && isDict(ev.card)) p = ev.card.controller;
      if (p == null && t.endsWith("SUMMONED")) p = prev && prev[0] === t.slice(0, -2) + "ING" ? prev[1] : this.trigger;
      this.ev_last = [t, p ?? null, ev.phase ?? null];
    } else if (t === "DAMAGE") {
      this.dmg_player = ev.player ?? null;
    }
    if (YO2Duel._TRIGGERS.includes(t)) {
      let p = ev.controller;
      if (p == null && isDict(ev.card)) p = ev.card.controller;
      this.trigger = p ?? null;
    } else if (t === "ATTACK" && isDict(ev.card)) {
      this.trigger = ev.card.controller ?? null;
    } else if (["NEW_TURN", "NEW_PHASE", "CHAIN_END"].includes(t)) {
      this.trigger = null;
    }
  }

  // --- §24: the client's LP display and reconciliation (lp_reconcile) ----------------------------------------
  _hud_init(): void {
    this.hud = this.lp.map((v) => [Math.min(Math.max(v, 0), 0xffff), 0, 0] as [number, number, number]);
    this.lp_desync = [];
    if (this.lp_tag === null) this.lp_tag = [this.duel_id ?? "?", 0, null];
  }

  _lp_note(ev: Ev, t: string): void {
    if (["CHAINING", "ATTACK", "BATTLE"].includes(t)) {
      const card = ev.card;
      const v = ev.code || (isDict(card) ? card.code : null) || this.lp_card;
      this.lp_card = v ?? null;
    } else if (t === "NEW_TURN") {
      this.turn_no += 1;
    } else if (YO2Duel._LP_EVENTS.includes(t)) {
      const n = t === "LPUPDATE" ? ev.lp : ev.amount;
      this.lp_ctx = `${t} j${ev.player} ${n}` + (truthy(this.lp_card) ? ` (carta ${this.lp_card})` : "");
    }
  }

  /** Applies to the LP display model the LP commands of msgs, as the client does. */
  _hud_track(msgs: readonly Out[]): void {
    const h = this.hud;
    if (h === null) return;
    for (let m of msgs) {
      if (!(m instanceof Uint8Array)) {
        if (m[0] !== M_6202) continue;
        m = m[1];
      }
      if (m.length < 20) continue;
      const [t, b, p0, p1, p2] = unpackU32(m, 5);
      if (t & 0xff) continue;
      const cmd = b & 0xfff, j = (b >>> 15) & 1;
      if (cmd === K.C_LP_DAMAGE || cmd === K.C_LP_GAIN) {
        this.lp_anim = new Set([...this.lp_anim, j]);
        const d = cmd === K.C_LP_DAMAGE ? -p0 : p0;
        if (!(h[0][2] || h[1][2])) this._hud_call(j, d, 1);
        this._hud_call(j, d, 0);
      } else if (cmd === K.C_LP_SET) {
        h[j][0] = p0;
      } else if (cmd === K.C_LP_RESET) {
        this.lp_anim = new Set();
        for (const x of h) x[1] = x[2] = 0;
      } else if (cmd === K.C_BATTLE_RUN) {
        [p0, p1].forEach((dmg, k) => {
          if (dmg) {
            const who = (shr(p2, 8 * k) & 8) ? k ^ 1 : k;
            this.lp_anim = new Set([...this.lp_anim, who]);
            this._hud_call(who, -dmg, 1);
          }
        });
      }
    }
  }

  _hud_call(j: number, d: number, w: number): void {
    const x = this.hud![j];
    if (x[2] && x[1] === d) x[2] = 0;
    else { x[1] = d; x[2] = w; }
    if (!x[2] && x[1]) {
      if (x[1] < 0 || x[0]) x[0] = Math.max(0, x[0] + x[1]);
      x[1] = 0;
    }
  }

  _lp_watch(msgs: readonly Out[], players: number[] | null = null, engine_lp: any = null): Out[] {
    this._hud_track(msgs);
    if (!players || !players.length || this.finished || this.hud === null || !this.cfg.lp_reconcile) return [];
    if (Array.isArray(engine_lp) && engine_lp.length === 2 && engine_lp.every((v) => isInt(v))) {
      for (const j of [0, 1]) {
        if (engine_lp[j] !== this.lp[j]) {
          this._warn(`LP del espejo ${this.lp[j]} != motor ${engine_lp[j]} (jugador ${j}): se toma el motor`);
          this.lp[j] = engine_lp[j];
        }
      }
    }
    const want = this.lp.map((v) => Math.min(Math.max(v, 0), 0xffff));
    const h = this.hud;
    const bad = players.filter((j) => h[j][2] || h[j][0] !== want[j]);
    if (!bad.length) return [];
    const tag = this.lp_tag ?? ["?", 0, null];
    const turn = tag[2]?.turn || this.turn_no;
    const now = Date.now() / 1000;
    const recs = bad.map((j) => {
      const x = h[j];
      this.log(`[lp] desfase duelo ${tag[0]} vista ${tag[1]} turno ${turn} jugador ${j}: cliente ${x[0]}`
        + (x[1] ? ` (${x[1] > 0 ? "+" : ""}${x[1]} ${x[2] ? "en espera" : "pendiente"})` : "")
        + ` / motor ${want[j]}; último: ${this.lp_ctx || "-"} -> 0x27 + 0x26`);
      return { ts: Math.round(now * 1000) / 1000, duelo: tag[0], vista: tag[1], turno: turn, jugador: j,
        jugador_abs: j ^ (tag[1] & 1), cliente: x[0], pendiente: x[1], espera: !!x[2], motor: want[j], evento: this.lp_ctx };
    });
    this.lp_desync_n += recs.length;
    this.lp_desync = [...this.lp_desync, ...recs].slice(-YO2Duel._LP_KEEP);
    const out: Out[] = [[M_6202, engine(K.C_LP_RESET, bad[0])], [M_6202, engine(K.C_LP_SET, 0, want[0])],
      [M_6202, engine(K.C_LP_SET, 1, want[1])]];
    this._hud_track(out);
    return out;
  }

  // --- turn and phase ----------------------------------------------------------------------------------------
  _m_NEW_TURN(ev: Ev): Out[] {
    const p = ev.player;
    let out: Out[] = [];
    if (this.turn_player !== null) {
      out = out.concat(this._stat_boundary());
      out.push(engine(C_TURN_CHANGE, this.turn_player));
      out = out.concat(this._lp_resync());
    } else if (p !== this.first) {
      this._warn(`el 1.er turno es de ${p} pero el cliente cree que empieza ${this.first} (0x6103)`);
    }
    this.turn_player = p;
    this.phase = null;
    this.in_battle = this.in_damage = false;
    const n = int(this.cfg.turn_timer || 0);
    if (n > 0) {
      if (p === 0) this.timer_deadline = this.clock() + n;
      else {
        this.timer_deadline = null;
        out.push([0x6461, timeup_warning(1, n, 1)]);
      }
    }
    return out;
  }

  _timer_msg(): Out[] {
    const n = int(this.cfg.turn_timer || 0);
    if (n <= 0) return [];
    let left = n;
    if (this.turn_player === 0 && this.timer_deadline !== null) left = Math.max(0, pyRound(this.timer_deadline - this.clock()));
    return [[0x6461, timeup_warning(0, left, 0)]];
  }

  _m_NEW_PHASE(ev: Ev): Out[] {
    this.ocg_phase = ev.phase;
    let out: Out[] = this.discard_open ? [this._discard_var(0)] : [];
    if (this.turn_player !== null) out = out.concat(this._stat_boundary());
    if (ev.phase === 512 && this.turn_player === 1 && this.cfg.npc_phrases) return out.concat([engine(K.C_NPC_TURN_END, 1)]);
    const ph = K.PHASE_MAP.get(ev.phase);
    if (ph === undefined || ph === this.phase) return out;
    this.phase = ph;
    return out.concat([engine(C_PHASE[ph], this.turn_player || 0)]);
  }

  // --- draw ----------------------------------------------------------------------------------------------------
  _m_DRAW(ev: Ev): Out[] {
    const p = ev.player;
    const s = this.side[p];
    const n = ev.drawn.length;
    const out: Out[] = [];
    for (let k = 0; k < ev.drawn.length; k++) {
      const d = ev.drawn[k];
      if (k >= s.deck.length) {
        this._warn("robo con el mazo del espejo vacío");
        break;
      }
      const uid = s.deck[k];
      const c = this.card(uid);
      if (truthy(d.code)) c.code = d.code;
      const want = !this._hides_side(p) ? this._pc(c.code) : HIDDEN_MONSTER;
      if (c.known !== want) {
        c.known = want;
        out.push(set_card(p, ZONE_DECK, k, want, uid >> 1, c.owner));
      }
    }
    const took = s.deck.splice(0, n);
    s.hand.push(...took);
    out.push(engine(C_DRAW, p, 0xffff, n));
    return out;
  }

  // --- moves ---------------------------------------------------------------------------------------------------
  _m_MOVE(ev: Ev): Out[] {
    const fr = ev.from, to = ev.to;
    if (fr.location & K.OCG_OVERLAY || to.location & K.OCG_OVERLAY) {
      this._warn("MOVE con materiales XYZ (no existe en YO2): ignorado");
      return [];
    }
    if (fr.location === 0) return this._token(ev);
    const uid = this.uid_at(fr.controller, fr.location, fr.sequence);
    if (uid === null) {
      this._warn(`MOVE sin carta en el espejo: ${repr(fr)}`);
      return [];
    }
    const c = this.card(uid);
    if (truthy(ev.card)) c.code = ev.card;
    if (to.location === 0) return this._leave(uid);
    if (fr.controller === to.controller && fr.location === to.location && fr.sequence === to.sequence) return [];
    const field = (l: number) => l === K.OCG_MZONE || l === K.OCG_SZONE;
    if (field(to.location) && !field(fr.location)) {
      this.pending = [uid, ev];
      return [];
    }
    if (field(to.location)) {
      if (this.cfg.field_move_3d) return this._field_move(uid, ev);
      return this._to_field(uid, ev, "move");
    }
    return this._to_pile(uid, ev);
  }

  _field_move(uid: number, ev: Ev): Out[] {
    const to = ev.to;
    const c = this.card(uid);
    const [p_from, w_from, i_from] = this.findx(uid);
    const [p, where, slot_i] = this.ocg_slot(to.controller, to.location, to.sequence) as [number, Where, number];
    const [src] = this.yo2_zone(w_from, i_from);
    const [dst] = this.yo2_zone(where, slot_i);
    const pos = to.position || K.POS_FU_ATK;
    const face = !!(pos & (K.POS_FU_ATK | K.POS_FU_DEF));
    const defense = where === "mz" ? !!(pos & (K.POS_FU_DEF | K.POS_FD_DEF)) : false;
    let out: Out[] = [];
    if (face && !c.face) out = out.concat(this._identity(uid, true));
    out.push(engine(K.C_FIELD_MOVE, p_from, (p_from & 1) | ((src & 0xff) << 8), (p & 1) | ((dst & 0xff) << 8), face ? 1 : 0));
    const sent = this.stat_sent.has(uid) ? this.stat_sent.get(uid)! : null;
    this.stat_sent.delete(uid);
    this._remove(uid);
    if (sent !== null) this.stat_sent.set(uid, sent);
    this.side[p].pile(where)[slot_i] = uid;
    const was_def = w_from === "mz" ? c.defense : false;
    c.face = face;
    if (where === "mz" && defense !== was_def) out.push(engine(K.C_POSITION, p, dst, 0, 0));
    c.defense = defense;
    out = out.concat(this._identity(uid));
    return out;
  }

  /** How to show a MOVE to the field depending on what comes next (MOVE then SUMMONING/SPSUMMONING/SET/CHAINING). */
  _flush_pending(nxt: Ev | null): Out[] {
    if (this.pending === null) return [];
    let [uid, ev] = this.pending;
    this.pending = null;
    const to = ev.to;
    let how = "move";
    if (nxt !== null && nxt.location === to.location && nxt.sequence === to.sequence && nxt.controller === to.controller) {
      how = ({ SUMMONING: "summon", SPSUMMONING: "spsummon", SET: "set", CHAINING: "activate" } as Record<string, string>)[nxt.type] ?? "move";
      if (how !== "move" && truthy(nxt.position)) ev = { ...ev, to: { ...to, position: nxt.position } };
    }
    return this._to_field(uid, ev, how);
  }

  _to_field(uid: number, ev: Ev, how: string): Out[] {
    const to = ev.to;
    const c = this.card(uid);
    const [p_from, w_from, i_from] = this.findx(uid);
    const [p, where, slot_i] = this.ocg_slot(to.controller, to.location, to.sequence) as [number, Where, number];
    const pos = to.position || K.POS_FU_ATK;
    const face = !!(pos & (K.POS_FU_ATK | K.POS_FU_DEF));
    const defense = !!(pos & (K.POS_FU_DEF | K.POS_FD_DEF));
    const [slot] = this.yo2_zone(where, slot_i);
    let out: Out[] = [];
    let mset = false;
    c.face = face;
    if (face) out = out.concat(this._identity(uid, true));
    else if (this._hides_side(p_from)) {
      c.known = null;
      const want = where === "mz" ? HIDDEN_MONSTER : this.cm.kind(c.code) === "spell" ? HIDDEN_SPELL : HIDDEN_TRAP;
      out.push(this._set_known(uid, want));
    }
    const from_hand = w_from === "hand" && p_from === p;
    let fx: Uint8Array | null = null;
    let cmd: Uint8Array;
    if (how === "summon" || how === "spsummon") {
      if (how === "summon" && p === 1 && this.cfg.npc_phrases) out.push(engine(K.C_NPC_ANNOUNCE, 1, 0x8000 | uid));
      if (how === "summon" && from_hand && where === "mz" && face && this.cfg.summon_kind_fx) {
        cmd = engine(K.C_SET_MONSTER, p, i_from, loc(p, slot, +face, +defense), (uid << 1) | 1);
        fx = engine(K.C_SUMMON_FX, p, 0, slot & 0x1f, K.SUMMON_FX_KIND);
      } else {
        cmd = engine(C_SUMMON, p, loc(p, slot, +face, +defense), uid, 0);
      }
    } else if (how === "set" && from_hand && where === "mz") {
      cmd = engine(K.C_SET_MONSTER, p, i_from, loc(p, slot, +face, +defense), (uid << 1) | 1);
      mset = true;
    } else if ((how === "set" || how === "activate") && from_hand && where === "sz") {
      cmd = engine(K.C_SET_SPELL, p, i_from, ((slot & 0x1f) << 1) | (+face << 14), uid);
    } else {
      cmd = engine(K.C_MOVE_FIELD, p_from, this._packed_src(uid), (p & 1) | ((slot & 0x1f) << 1), (+defense << 8) | +face);
    }
    if (how === "spsummon" && w_from === "extra" && this.fusion_mats.length && this.cfg.fusion_anim) {
      const mats = this.fusion_mats;
      if (this.cfg.fusion_official) {
        for (const m of mats) {
          if (!this.fusion_started.includes(m)) {
            const [pm, wm, im] = this.findx(m);
            out.push(engine(K.C_FUSION_MAT, pm, wm === "mz" ? this.yo2_zone(wm, im)[0] : K.PILE_ZONE[wm as PileName], mats.indexOf(m), m));
          }
        }
      }
      const body = concat(...mats.map((m) => listItem(this._pc(this.card(m).code), (m >> 1) & 0xff, this.card(m).owner & 1)));
      out.push([K.M_LIST, concat(packBIIII(0, K.LIST_FUSION, 0, mats.length, 0), body)]);
      out.push(engine(K.C_FUSION_RUN, p, 0, uid, mats.length & 0xff));
      this.fusion_mats = [];
      this.fusion_started = [];
      this.fusion_armed = false;
    }
    out.push(cmd);
    if (fx !== null) out.push(fx);
    if (mset && this.cfg.summon_done) out.push(engine(K.C_SUMMON_DONE, p, slot, K.SUMMON_DONE_SET, 0));
    this._remove(uid);
    this.side[p].pile(where)[slot_i] = uid;
    c.defense = defense;
    return out;
  }

  _set_known(uid: number, want: number): Uint8Array {
    const c = this.card(uid);
    c.known = want;
    const [p, where, i] = this.findx(uid);
    if (where === "mz" || where === "sz") return set_card(p, 0, this.yo2_zone(where, i)[0], want, uid >> 1, c.owner);
    return set_card(p, K.PILE_ZONE[where], i, want, uid >> 1, c.owner);
  }

  _to_pile(uid: number, ev: Ev): Out[] {
    const to = ev.to;
    const c = this.card(uid);
    const [p_from, w_from, i_from] = this.findx(uid);
    const [p, where0] = this.ocg_slot(to.controller, to.location, 0);
    const where = where0 as PileName;
    const pub = where === "grave" || where === "banish" || (where === "hand" && this._own(p));
    let out: Out[] = pub ? this._identity(uid, true) : [];
    const dst_pile = this.side[p].pile(where) as number[];
    let top = false, idx: number;
    if (where === "deck") {
      top = to.sequence >= dst_pile.length;
      idx = top ? 0 : 1;
    } else {
      idx = dst_pile.length;
    }
    const fmat = this._fusion_material(uid, p_from, w_from, i_from, where);
    out = out.concat(fmat);
    const plain = fmat.length > 0 && !!this.cfg.fusion_official;
    if (this.ritual_mats.has(uid) && where === "grave" && (w_from === "mz" || w_from === "hand")) {
      this.ritual_mats = new Set([...this.ritual_mats].filter((u) => u !== uid));
      const z = w_from === "mz" ? this.yo2_zone(w_from, i_from)[0] : ZONE_HAND;
      out.push(engine(K.C_TRIBUTE, p_from, z & 0xff, ZONE_GRAVE, uid));
    } else if (w_from === "mz" && where === "grave" && this.cfg.tribute_anim && this.tribute_armed && this._tribute_ahead()) {
      const [slot] = this.yo2_zone(w_from, i_from);
      if (this.cfg.tribute_mark) out.push(engine(K.C_TRIBUTE_MARK, p_from, slot & 0xff, 0, 0));
      out.push(engine(K.C_TRIBUTE, p_from, slot & 0xff, ZONE_GRAVE, uid));
    } else if (w_from === "mz" && where === "grave" && !plain) {
      const [slot] = this.yo2_zone(w_from, i_from);
      out.push(engine(K.C_TO_GRAVE, p_from, slot & 0xff, ZONE_GRAVE, uid));
    } else {
      out.push(engine(K.C_MOVE, p_from, this._packed_src(uid), (p & 1) | ((K.PILE_ZONE[where] & 0x1f) << 1) | ((idx & 0xff) << 6),
        plain && where === "grave" ? 0x20 : 0));
    }
    this._remove(uid);
    c.face = where === "grave" || where === "banish" || (where === "hand" && this._own(p));
    c.defense = false;
    if (where === "deck") {
      if (top) dst_pile.unshift(uid);
      else dst_pile.push(uid);
    } else {
      dst_pile.push(uid);
    }
    if (!pub && (where === "deck" || where === "extra" || where === "hand")) {
      const want = this._visible(c, where, p);
      if (want !== c.known) out.push(this._set_known(uid, want));
    }
    return out;
  }

  _remove(uid: number): void {
    this.stat_sent.delete(uid);
    if (this.summoning.length) this.summoning = this.summoning.filter((x) => x[0] !== uid);
    const [p, where, i] = this.findx(uid);
    const lst = this.side[p].pile(where);
    if (where === "mz" || where === "sz") lst[i] = null;
    else lst.splice(i, 1);
  }

  /** A card that leaves the game (a token leaving the field). */
  _leave(uid: number): Out[] {
    const vanish = this.cfg.token_vanish;
    if (!vanish) this._warn("carta a location 0 (ficha): se manda al cementerio del cliente");
    const [p, where, i] = this.findx(uid);
    const [slot] = this.yo2_zone(where, i);
    const out: Out[] = [];
    if (vanish && where === "mz" && this.cfg.tribute_anim && this.tribute_armed && this._tribute_ahead()) {
      if (this.cfg.tribute_mark) out.push(engine(K.C_TRIBUTE_MARK, p, slot & 0xff, 0, 0));
      out.push(engine(K.C_TRIBUTE, p, slot & 0xff, ZONE_GRAVE, uid));
    } else if (where === "mz" || where === "sz") {
      out.push(engine(K.C_TO_GRAVE, p, slot & 0xff, ZONE_GRAVE, uid));
    }
    this._remove(uid);
    this.cards.delete(uid);
    return out;
  }

  _token(ev: Ev): Out[] {
    const to = ev.to;
    const [p, where, slot_i] = this.ocg_slot(to.controller, to.location, to.sequence);
    if (where !== "mz") {
      this._warn("carta nueva fuera de la zona de monstruos: ignorada");
      return [];
    }
    this.next_serial[p] += 1;
    const c = this._new_card(p, this.next_serial[p], get(ev, "card", 0));
    const pos = to.position || K.POS_FU_ATK;
    c.face = !!(pos & 5);
    c.defense = !!(pos & 12);
    const y = this._pc(c.code);
    c.known = y;
    this.side[p].mz[slot_i] = c.uid;
    return [engine(K.C_TOKEN, p, loc(p, slot_i, +c.face, +c.defense), asInternal(y), 0)];
  }

  _m_HINT(ev: Ev): Out[] {
    if (ev.hint_type === 3) {
      if (ev.hint === K.HINTMSG_RELEASE) this.tribute_armed = true;
      else if (ev.hint === K.HINTMSG_FMATERIAL && !this.fusion_armed) {
        this.fusion_armed = true;
        this.fusion_mats = [];
        this.fusion_started = [];
      }
    }
    return [];
  }

  /** Are the field -> grave MOVEs in progress the tributes of a summon? (looks ahead in the batch) */
  _tribute_ahead(): boolean {
    if (!truthy(this._batch) || this._bi === null) return false;
    for (const ev of this._batch!.slice(this._bi + 1)) {
      const t = ev.type;
      if (ev.ev !== "msg") return false;
      if (t === "MOVE") {
        if (ev.from.location === K.OCG_HAND && ev.to.location === K.OCG_MZONE) return true;
        continue;
      }
      if (t === "HINT") {
        const h = ev.hint;
        if (ev.hint_type === 3 && truthy(h) && this.side.some((s) => s.hand.some((u) => this.card(u).code === h))) return true;
        continue;
      }
      if (t === "SUMMONING" || t === "SET") return true;
      if (YO2Duel._TRIBUTE_STOP.includes(t)) return false;
    }
    return false;
  }

  /** 0x4b + 0x4c of a material about to leave its place (fusion_anim, after HINT 511). */
  _fusion_material(uid: number, p_from: number, w_from: Where, i_from: number, where: Where): Out[] {
    const c = this.card(uid);
    if (!(this.cfg.fusion_anim && this.fusion_armed) || this.cm.kind(c.code) !== "monster"
      || !["mz", "hand", "grave", "deck"].includes(w_from) || !["grave", "banish", "deck"].includes(where)) return [];
    if (this.cfg.fusion_needs_summon && !this._fusion_summon_ahead()) return [];
    const zone = w_from === "mz" ? this.yo2_zone(w_from, i_from)[0] : K.PILE_ZONE[w_from as PileName];
    if (this.cfg.fusion_official) return this._fusion_material_oficial(uid, p_from, zone);
    const i = this.fusion_mats.length;
    this.fusion_mats = [...this.fusion_mats, uid];
    this.list_dirty = true;
    return [engine(K.C_FUSION_MARK, p_from, zone, i, uid), engine(K.C_FUSION_MAT, p_from, zone, i, uid)];
  }

  /** fusion_needs_summon: does this resolution go on to the Fusion Summon (extra deck -> monster zone), so that a 0x4d
   *  closes the 0x4b? The client's view 0x2c (0x4b) sets its "fusing" flag (DAT_012a59d8) and only view 0x36 (0x4d)
   *  clears it; while it is set every CARD_MOVE snaps its card into place (FUN_007624d0 -> FUN_007583d0) and the
   *  material markers stay. Future Fusion sends its materials with HINT 511 and the summon comes two turns later
   *  without one, so py (which shares the bug) left the client fusing for the rest of the duel. A decision ends the
   *  batch before the summon's zone is chosen: then it is not known, and the materials keep their markers, as before. */
  _fusion_summon_ahead(): boolean {
    if (!truthy(this._batch) || this._bi === null) return true;
    for (const ev of this._batch!.slice(this._bi + 1)) {
      if (ev.ev !== "msg") return true;
      if (ev.type === "MOVE" && get(ev.from, "location", 0) === K.OCG_EXTRA
        && get(ev.to, "location", 0) === K.OCG_MZONE) return true;
      if (YO2Duel._DISARM.includes(ev.type)) return false;
    }
    return true;
  }

  _fusion_material_oficial(uid: number, p_from: number, zone: number): Out[] {
    const out: Out[] = [];
    if (!this.fusion_mats.length) {
      const ahead = this._fusion_ahead();
      const uids = ahead.map((a) => a[0]);
      if (!uids.includes(uid)) uids.unshift(uid);
      this.fusion_mats = uids;
      this.fusion_started = [];
      uids.forEach((u, k) => {
        const [pu, wu, iu] = this.findx(u);
        out.push(engine(K.C_FUSION_MARK, pu, wu === "mz" ? this.yo2_zone(wu, iu)[0] : K.PILE_ZONE[wu as PileName], k, u));
      });
    } else if (!this.fusion_mats.includes(uid)) {
      out.push(engine(K.C_FUSION_MARK, p_from, zone, this.fusion_mats.length, uid));
      this.fusion_mats = [...this.fusion_mats, uid];
    }
    out.push(engine(K.C_FUSION_MAT, p_from, zone, this.fusion_mats.indexOf(uid), uid));
    this.fusion_started = [...this.fusion_started, uid];
    this.list_dirty = true;
    return out;
  }

  _fusion_ahead(): [number, number, Where, number][] {
    if (!truthy(this._batch) || this._bi === null) return [];
    const out: [number, number, Where, number][] = [];
    const used = new Set<number>();
    for (const ev of this._batch!.slice(this._bi)) {
      if (ev.ev !== "msg") break;
      const t = ev.type;
      if (t === "MOVE") {
        const f = ev.from, to = ev.to;
        if (f.location === K.OCG_EXTRA) break;
        if (![K.OCG_MZONE, K.OCG_HAND, K.OCG_GRAVE, K.OCG_DECK].includes(f.location)
          || ![K.OCG_GRAVE, K.OCG_REMOVED, K.OCG_DECK].includes(to.location)) continue;
        const [p, where, i] = this.ocg_slot(f.controller, f.location, f.sequence);
        const lst = where ? this.side[p].pile(where) : [];
        const cand = lst.filter((u): u is number => u !== null && !used.has(u) && this.card(u).code === ev.card);
        const uid = i >= 0 && i < lst.length && cand.includes(lst[i] as number) ? lst[i] : (cand.length ? cand[0] : null);
        if (uid != null && this.cm.kind(this.card(uid).code) === "monster") {
          used.add(uid);
          const [pu, wu, iu] = this.findx(uid);
          out.push([uid, pu, wu, iu]);
        }
      } else if (YO2Duel._FUSION_STOP.includes(t)) {
        break;
      }
    }
    return out;
  }

  _m_SUMMONING(ev: Ev): Out[] { this._summon_start(ev, K.SUMMON_DONE_BITS.SUMMONED); return []; }
  _m_SPSUMMONING(ev: Ev): Out[] { this._summon_start(ev, K.SUMMON_DONE_BITS.SPSUMMONED); return []; }
  _m_SET(_ev: Ev): Out[] { return []; }

  _m_FLIPSUMMONING(ev: Ev): Out[] {
    const out = this._m_POS_CHANGE({ ...ev, prev_position: null }, 1);
    this._summon_start(ev, K.SUMMON_DONE_BITS.FLIPSUMMONED);
    return out;
  }

  _summon_start(ev: Ev, bits: number): void {
    if (!this.cfg.summon_done || ev.location !== K.OCG_MZONE) return;
    const uid = this.uid_at(ev.controller, ev.location, ev.sequence);
    if (uid !== null && this.summoning.every(([u]) => u !== uid)) this.summoning.push([uid, bits]);
  }

  _summon_done(ev: Ev): Out[] {
    const bits = K.SUMMON_DONE_BITS[ev.type];
    const out: Out[] = [], keep: [number, number][] = [];
    for (const [uid, b] of this.summoning) {
      if (b !== bits) {
        keep.push([uid, b]);
        continue;
      }
      const w = this.find(uid);
      if (w && w[1] === "mz") out.push(engine(K.C_SUMMON_DONE, w[0], this.yo2_zone(w[1], w[2])[0], b, 0));
    }
    this.summoning = keep;
    return out;
  }

  _m_SUMMONED(ev: Ev): Out[] { return this._summon_done(ev); }
  _m_SPSUMMONED(ev: Ev): Out[] { return this._summon_done(ev); }
  _m_FLIPSUMMONED(ev: Ev): Out[] { return this._summon_done(ev); }

  _m_POS_CHANGE(ev: Ev, anim = 0): Out[] {
    const uid = this.uid_at(ev.controller, ev.location, ev.sequence);
    if (uid === null) {
      this._warn(`POS_CHANGE sin carta: ${repr(ev)}`);
      return [];
    }
    const c = this.card(uid);
    const [p, where, i] = this.findx(uid);
    const [slot] = this.yo2_zone(where, i);
    const pos = ev.position;
    const face0 = c.face, face1 = !!(pos & 5);
    const def0 = c.defense, def1 = !!(pos & 12);
    if (face0 === face1 && def0 === def1) return [];
    let out: Out[] = [];
    if (face1 && !face0) {
      c.face = true;
      out = out.concat(this._identity(uid, true));
    }
    if (where === "sz" || def0 === def1) {
      if (face0 !== face1) out.push(engine(K.C_FLIP, p, slot, 1, 0));
    } else {
      out.push(engine(K.C_POSITION, p, slot, face0 !== face1 ? 1 : 0, anim));
    }
    c.face = face1;
    c.defense = def1;
    if (!face1) this.stat_sent.delete(uid);
    if (!face1 && this._hides_side(p)) {
      const want = this._visible(c, where, p);
      if (want !== c.known) out.push(this._set_known(uid, want));
    }
    return out;
  }

  // --- chain ----------------------------------------------------------------------------------------------------
  _chain_reveal(pp: number, zone: number, where: Where, uid: number, c: Card): Uint8Array {
    const bits = where === "sz" ? 6 : where === "mz" ? 8 : 0xa;
    return engine(K.C_REVEAL, pp, zone | (bits << 8), asInternal(this._pc(c.code)), uid);
  }

  _m_CHAINING(ev: Ev): Out[] {
    let out: Out[] = [];
    const reveal = this.cfg.chain_reveal;
    const p = ev.controller;
    if (p === 1 && this.cfg.npc_phrases) out.push(engine(K.C_NPC_CHAIN, 1, 0));
    const uid = this.uid_at(p, ev.location, ev.sequence);
    let zone = 0, hidx = 0;
    if (uid !== null) {
      const c = this.card(uid);
      if (truthy(ev.code)) c.code = ev.code;
      const [pp, where, i] = this.findx(uid);
      [zone, hidx] = this.yo2_zone(where, i);
      if (where === "mz" || where === "sz") {
        if (!c.face) {
          c.face = true;
          out = out.concat(this._identity(uid, true));
          out.push(engine(K.C_FLIP, pp, zone, 1, 0));
        }
        if (reveal) out.push(this._chain_reveal(pp, zone, where, uid, c));
        else if (this.cfg.activate_flash) out.push(engine(K.C_FLASH, pp, asInternal(this._pc(c.code)), 0));
      } else {
        out = out.concat(this._identity(uid, true));
        if (reveal) out.push(this._chain_reveal(pp, zone, where, uid, c));
        else out.push(engine(K.C_HAPPEN, pp, asIndex(this._pc(c.code))));
      }
    }
    const n = get(ev, "chain_size", this.chain.length + 1);
    const p1 = reveal && uid !== null ? uid : zone === ZONE_HAND ? hidx : 0;
    out.push(engine(K.C_CHAIN_SET, p, zone, p1, n));
    this.chain.push([p, zone]);
    const code = ev.code || (uid !== null ? this.card(uid).code : null);
    this.chain_codes = [...this.chain_codes, code ?? null];
    return out;
  }

  _m_CHAIN_SOLVING(ev: Ev): Out[] {
    const n = get(ev, "chain_size", this.chain.length);
    if (n > 0 && n <= this.chain.length) {
      const [p, zone] = this.chain[n - 1];
      this.solving = n;
      return [engine(K.C_CHAIN_RUN, p, zone, 0, n)];
    }
    return [];
  }

  _m_CHAIN_END(_ev: Ev): Out[] {
    this.chain = [];
    this.solving = null;
    this.chain_codes = [];
    return this._live_stats();
  }

  // --- card -> card links (card_link / target_lockon) -----------------------------------------------------------
  _field_ref(d: any): [number, number, number] | null {
    if (!isDict(d) || (d.location !== K.OCG_MZONE && d.location !== K.OCG_SZONE)) return null;
    const uid = this.uid_at(get(d, "controller", 0), d.location, get(d, "sequence", 0));
    if (uid === null) return null;
    const [p, where, i] = this.findx(uid);
    return [uid, p, this.yo2_zone(where, i)[0]];
  }

  _uid_ref(uid: number): number | null {
    const f = this.cards.has(uid) ? this.find(uid) : null;
    if (!f || (f[1] !== "mz" && f[1] !== "sz")) return null;
    return (f[0] & 1) | (this.yo2_zone(f[1], f[2])[0] << 8);
  }

  _add_link(src: number, dst: number, kind: number, anim = true): Out[] {
    const a = this._uid_ref(src), b = this._uid_ref(dst);
    if (a === null || b === null) return [];
    this.links = [...this.links.filter((lk) => !(lk[0] === src && lk[1] === dst)), [src, dst, kind]];
    if (this.stat_sent.get(dst) != null) this.stat_sent.set(dst, K.LINK_STALE);
    if (anim) return [engine(K.C_LINK, a & 1, a, b, kind)];
    return [engine(K.C_EFFECT_ADD, b & 1, (b >> 8) | (kind << 8), a, 0)];
  }

  _del_link(lk: [number, number, number]): Out[] {
    this.links = this.links.filter((x) => !(x[0] === lk[0] && x[1] === lk[1] && x[2] === lk[2]));
    const a = this._uid_ref(lk[0]), b = this._uid_ref(lk[1]);
    if (a === null || b === null) return [];
    return [engine(K.C_EFFECT_DEL, b & 1, (b >> 8) | (lk[2] << 8), a, 0)];
  }

  _prune_links(): void {
    this.links = this.links.filter((lk) => this._uid_ref(lk[0]) !== null && this._uid_ref(lk[1]) !== null);
  }

  _m_EQUIP(ev: Ev): Out[] {
    if (!this.cfg.card_link) return [];
    this._prune_links();
    const s = this._field_ref(ev.card), t = this._field_ref(ev.target);
    if (!s || !t) {
      this._warn(`EQUIP fuera del campo: ${repr(ev.card)} -> ${repr(ev.target)}`);
      return [];
    }
    const kind = get(this.cfg, "link_kind_equip", 10);
    let out: Out[] = [];
    for (const lk of this.links) {
      if (lk[0] === s[0] && lk[2] >= 10 && lk[1] !== t[0]) out = out.concat(this._del_link(lk));
    }
    if (this.links.some((lk) => lk[0] === s[0] && lk[1] === t[0])) return out;
    return out.concat(this._add_link(s[0], t[0], kind));
  }

  _m_UNEQUIP(ev: Ev): Out[] {
    if (!this.cfg.card_link) {
      this._warn("mensaje UNEQUIP sin traducción");
      return [];
    }
    this._prune_links();
    const s = this._field_ref(ev.card);
    let out: Out[] = [];
    for (const lk of this.links) {
      if (s && lk[0] === s[0] && lk[2] >= 10) out = out.concat(this._del_link(lk));
    }
    return out;
  }

  _m_CARD_TARGET(ev: Ev): Out[] {
    if (!this.cfg.card_link) return [];
    this._prune_links();
    const s = this._field_ref(ev.card), t = this._field_ref(ev.target);
    if (!s || !t || this.links.some((lk) => lk[0] === s[0] && lk[1] === t[0])) return [];
    return this._add_link(s[0], t[0], get(this.cfg, "link_kind_target", 9), get(this.cfg, "link_target_anim", true));
  }

  _m_CANCEL_TARGET(ev: Ev): Out[] {
    if (!this.cfg.card_link) return [];
    this._prune_links();
    const s = this._field_ref(ev.card), t = this._field_ref(ev.target);
    let out: Out[] = [];
    for (const lk of this.links) {
      if (s && t && lk[0] === s[0] && lk[1] === t[0] && lk[2] < 10) out = out.concat(this._del_link(lk));
    }
    return out;
  }

  _m_BECOME_TARGET(ev: Ev): Out[] {
    if (!this.cfg.target_lockon) return [];
    const out: Out[] = [];
    for (const d of ev.cards || []) {
      if (!isDict(d)) continue;
      const uid = this.uid_at(get(d, "controller", 0), get(d, "location", 0), get(d, "sequence", 0));
      const f = uid !== null ? this.find(uid) : null;
      const pile = !!f && (f[1] === "grave" || f[1] === "banish") && !!this.cfg.lockon_pile;
      if (!f || (!["mz", "sz", "hand"].includes(f[1]) && !pile)) continue;
      const z = this.yo2_zone(f[1], f[2])[0];
      out.push(engine(K.C_LOCKON, f[0], z, uid!, 0));
    }
    return out;
  }

  // --- LP ----------------------------------------------------------------------------------------------------------
  _lp(p: number, delta: number): void { this.lp[p] = Math.max(0, this.lp[p] + delta); }

  _m_DAMAGE(ev: Ev): Out[] {
    const p = ev.player, a = ev.amount;
    this._lp(p, -a);
    let kind: number;
    if (this.cfg.lp_type_oficial) {
      if (this.cfg.battle_damage_split) kind = this.battle_open ? 1 : 0;
      else kind = this.in_damage ? 1 : 0;
    } else kind = this.in_damage ? 0 : 1;
    return [engine(K.C_LP_DAMAGE, p, Math.min(a, 0xffff), kind, 0)];
  }

  _m_PAY_LPCOST(ev: Ev): Out[] {
    const p = ev.player, a = ev.amount;
    this._lp(p, -a);
    return [engine(K.C_LP_DAMAGE, p, Math.min(a, 0xffff), 2, 0)];
  }

  _m_RECOVER(ev: Ev): Out[] {
    const p = ev.player, a = ev.amount;
    this._lp(p, a);
    return [engine(K.C_LP_GAIN, p, Math.min(a, 0xffff), 1, 0)];
  }

  _m_LPUPDATE(ev: Ev): Out[] {
    const p = ev.player, lp = ev.lp;
    if (this.cfg.lp_set_direct && this.hud !== null) return this._lp_set_direct(p, lp);
    if (lp === this.lp[p]) return [];
    this.lp[p] = lp;
    return [engine(K.C_LP_SET, p, Math.min(lp, 0xffff))];
  }

  _lp_set_direct(p: number, lp0: number): Out[] {
    const lp = Math.max(0, lp0);
    this.lp[p] = lp;
    const want = Math.min(lp, 0xffff);
    const x = this.hud![p];
    if (x[0] === want && !x[1] && !x[2]) return [];
    if (x[1] || x[2] || this.lp_anim.has(p)) {
      const q = p ^ 1;
      return [engine(K.C_LP_RESET, p), engine(K.C_LP_SET, p, want), engine(K.C_LP_SET, q, Math.min(Math.max(this.lp[q], 0), 0xffff))];
    }
    return [engine(K.C_LP_SET, p, want)];
  }

  // --- battle ----------------------------------------------------------------------------------------------------
  _m_ATTACK(ev: Ev): Out[] {
    const a = ev.card, t = ev.target;
    this.in_battle = true;
    this.attacking = false;
    const pre = this._live_stats();
    if (!truthy(t) || !truthy(t.location)) return pre.concat([engine(K.C_DIRECT, a.controller, a.sequence)]);
    return pre.concat([engine(K.C_ATTACK, a.controller, a.sequence, ((t.sequence & 0xff) << 8) | (t.controller & 1))]);
  }

  _m_DAMAGE_STEP_START(_ev: Ev): Out[] {
    this.in_damage = true;
    return [];
  }

  _m_BATTLE(ev: Ev): Out[] {
    this.battle_open = true;
    const a = ev.card, t = ev.target || {};
    let dmg = [0, 0];
    let flags = 0;
    if (!truthy(t.location)) dmg[1 - a.controller] = a.attack;
    else if (t.position & 3) {
      const d = a.attack - t.attack;
      if (d > 0) dmg[t.controller] = d;
      else if (d < 0) dmg[a.controller] = -d;
    } else if (a.attack < t.defense) {
      dmg[a.controller] = t.defense - a.attack;
    }
    for (const side of [a, t]) {
      if (!truthy(side.location)) continue;
      let b = 0;
      if (get(side, "position", 0) & (K.POS_FU_DEF | K.POS_FD_DEF)) b |= 1;
      if (truthy(side.destroyed)) b |= 2;
      flags |= b << (8 * (side.controller & 1));
    }
    const ahead = this.cfg.battle_damage_real ? this._battle_damage_ahead() : null;
    if (ahead !== null) dmg = ahead;
    return [engine(K.C_BATTLE_RUN, a.controller, Math.min(dmg[0], 0xffff), Math.min(dmg[1], 0xffff), flags)];
  }

  _battle_damage_ahead(): number[] | null {
    if (!truthy(this._batch) || this._bi === null) return null;
    const dmg = [0, 0];
    const stop = ["DAMAGE_STEP_END", "BATTLE", "ATTACK", "ATTACK_DISABLED", "CHAINING", "NEW_PHASE", "NEW_TURN", "WIN"];
    if (this.cfg.battle_damage_split) stop.push("MOVE");
    for (const ev of this._batch!.slice(this._bi + 1)) {
      if (ev.ev !== "msg") break;
      const t = ev.type;
      if (t === "DAMAGE") dmg[ev.player & 1] += ev.amount;
      else if (stop.includes(t)) break;
    }
    return dmg;
  }

  _lp_resync(): Out[] {
    if (!this.cfg.lp_resync) return [];
    return [0, 1].map((p) => engine(K.C_LP_SET, p, Math.min(Math.max(this.lp[p], 0), 0xffff)));
  }

  _end_attack(ev: Ev): Out[] {
    if (ev.type === "ATTACK_DISABLED") this.log("[traductor] ocgcore: ATTACK_DISABLED (el ataque se anula; no hay cálculo de daño)");
    if (!this.in_battle) return [];
    this.in_battle = this.in_damage = false;
    return [engine(K.C_ATTACK_END, this.turn_player || 0, 0, 0)];
  }

  _m_DAMAGE_STEP_END(ev: Ev): Out[] { return this._end_attack(ev); }
  _m_ATTACK_DISABLED(ev: Ev): Out[] { return this._end_attack(ev); }

  // --- shuffle / reveal -------------------------------------------------------------------------------------------
  _reimpose(p: number, where: PileName): Out[] {
    const out: Out[] = [];
    this.side[p].pile(where).forEach((uid, i) => {
      const c = this.card(uid!);
      c.known = this._visible(c, where, p);
      out.push(set_card(p, K.PILE_ZONE[where], i, c.known, uid! >> 1, c.owner));
      if (where === "hand") out.push(YO2Duel._refresh_view(uid!, p, ZONE_HAND, i));
    });
    return out;
  }

  _m_SHUFFLE_DECK(ev: Ev): Out[] {
    const p = ev.player;
    this.rng.shuffle(this.side[p].deck);
    const seed = this.rng.getrandbits(32);
    return ([engine(C_SHUFFLE, p, seed & 0xffff, seed >>> 16)] as Out[]).concat(this._reimpose(p, "deck"));
  }

  _m_SHUFFLE_HAND(ev: Ev): Out[] {
    const p = ev.player;
    const s = this.side[p];
    const codes: any[] = [...(ev.cards || [])];
    const old = [...s.hand];
    let found: [number, number[]] | null = null;
    if (codes.length && codes.length === old.length) {
      found = hand_seed_for(old.map((u) => this.card(u).code), codes, this.rng);
      if (found) s.hand = found[1].map((k) => old[k]);
      else {
        const pool = [...old], nw: number[] = [];
        for (const code of codes) {
          let j = pool.findIndex((u) => this.card(u).code === code);
          if (j < 0) j = 0;
          nw.push(pool.splice(j, 1)[0]);
        }
        s.hand = nw;
      }
    }
    let seed: number;
    if (found) seed = found[0];
    else {
      seed = this.rng.getrandbits(32);
      if (old.length > 1) {
        this.log(`[traductor] SHUFFLE_HAND J${p}: sin semilla exacta para ${old.length} cartas; se reimpone la mano y se refresca la imagen de cada índice`);
      }
    }
    return ([engine(K.C_HAND_SHUFFLE, p, seed & 0xffff, seed >>> 16)] as Out[]).concat(this._reimpose(p, "hand"));
  }

  _m_SHUFFLE_SET_CARD(ev: Ev): Out[] {
    if (!this.cfg.monst_shuffle) return [];
    const groups = new Map<number, any[]>();
    for (const c of ev.cards || []) {
      const f = c.from || {};
      if (f.location !== K.OCG_MZONE) {
        this._warn(`SHUFFLE_SET_CARD fuera de la zona de monstruos ${repr(f)}: se ignora`);
        return [];
      }
      const k = f.controller & 1;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(c);
    }
    const out: Out[] = [];
    for (const [p, cs] of [...groups].sort((a, b) => a[0] - b[0])) {
      const slots = cs.map((c) => c.from.sequence as number).sort((a, b) => a - b);
      const mz = this.side[p].mz;
      if (new Set(slots).size !== slots.length || slots.some((s) => !(s >= 0 && s < 5) || mz[s] === null)) {
        this._warn(`SHUFFLE_SET_CARD J${p} ${repr(slots)}: ranuras repetidas o vacías en el espejo; se ignora`);
        continue;
      }
      if (slots.length < 2) continue;
      const mv = this._shuffle_dest(p, cs, slots);
      if (mv === null) continue;
      const want = slots.map((s) => slots.indexOf(mv.get(s)!));
      const seed = monst_seed_for(want, this.rng);
      const old = slots.map((s) => mz[s]);
      slots.forEach((s, k) => { mz[mv.get(s)!] = old[k]; });
      const mask = slots.reduce((m, s) => m + (1 << s), 0);
      out.push(engine(K.C_MONST_SHUFFLE, p, seed & 0xffff, seed >>> 16, mask));
    }
    return out;
  }

  _shuffle_dest(p: number, cs: any[], slots: number[]): Map<number, number> | null {
    const mz = this.side[p].mz;
    const to = cs.map((c) => c.to || {});
    if (to.every((t) => t.location === K.OCG_MZONE && (get(t, "controller", p) & 1) === p)) {
      const mv = new Map<number, number>();
      cs.forEach((c, k) => mv.set(c.from.sequence, to[k].sequence));
      const vals = [...mv.values()].sort((a, b) => a - b);
      if (vals.length === slots.length && vals.every((v, k) => v === slots[k])) return mv;
    }
    const now = new Map<number, any>(slots.map((s) => [s, this.card(mz[s]!).code]));
    const target = new Map<number, any>();
    let state: any = null;
    for (const s of slots) {
      let code: any = null;
      const rest = truthy(this._batch) && this._bi !== null ? this._batch!.slice(this._bi + 1) : [];
      for (const e of rest) {
        const f = e.from || {};
        if (e.ev === "msg" && e.type === "MOVE" && f.controller === p && f.location === K.OCG_MZONE && f.sequence === s) {
          code = e.card ?? null;
          break;
        }
      }
      if (!truthy(code)) {
        if (state === null && this.query !== null) {
          try {
            state = this.query() || {};
          } catch (ex) {
            this._warn(`query falló: ${String(ex)}`);
            state = {};
          }
        }
        const pl = (state || {}).players || [];
        const zone = p < pl.length ? pl[p].mzone || [] : [];
        const cd = s < zone.length ? zone[s] : null;
        code = truthy(cd) ? cd.code ?? null : null;
      }
      target.set(s, code);
    }
    const srt = (m: Map<number, any>) => [...m.values()].map((v) => v ?? null).sort((a, b) => (pyStr(a) < pyStr(b) ? -1 : pyStr(a) > pyStr(b) ? 1 : 0));
    const a = srt(target), b = srt(now);
    if (a.length !== b.length || a.some((v, k) => v !== b[k])) {
      this._warn(`SHUFFLE_SET_CARD J${p} ${repr(slots)}: no sé dónde ha quedado cada carta (espejo ${repr([...now.values()])}, ocgcore ${repr([...target.values()])}); no se manda 0x49`);
      return null;
    }
    const mv = new Map<number, number>(), used = new Set<number>();
    for (const s of slots) {
      if (target.get(s) === now.get(s)) {
        mv.set(s, s);
        used.add(s);
      }
    }
    for (const s of slots) {
      if (!mv.has(s)) {
        const t = slots.find((t) => !used.has(t) && target.get(t) === now.get(s));
        if (t === undefined) throw new Error("StopIteration");
        mv.set(s, t);
        used.add(t);
      }
    }
    return mv;
  }

  _m_CONFIRM_CARDS(ev: Ev): Out[] {
    let out: Out[] = [];
    const cards = get(ev, "cards", []);
    const whole = this._whole_hand(cards);
    for (const cd of cards) {
      const uid = this.uid_at(cd.controller, cd.location, cd.sequence);
      if (uid === null) continue;
      this.card(uid).code = cd.code || this.card(uid).code;
      out = out.concat(this._identity(uid, true));
      if (cd.location === K.OCG_HAND && whole === null) out.push(engine(K.C_HAND_SHOW, cd.controller, uid));
    }
    if (whole !== null) {
      out = out.concat(this._hand_close());
      out.push(engine(K.C_HAND_OPEN, whole, 1));
      this.hand_open = whole;
    }
    return out;
  }

  _m_CONFIRM_DECKTOP(ev: Ev): Out[] { return this._m_CONFIRM_CARDS(ev); }

  _whole_hand(cards: any[]): number | null {
    if (!this.cfg.hand_open || cards.length < 2) return null;
    const who = new Set(cards.filter((cd) => cd.location === K.OCG_HAND).map((cd) => cd.controller));
    if (who.size !== 1 || cards.some((cd) => cd.location !== K.OCG_HAND)) return null;
    const p = [...who][0];
    if (!(p === 0 || p === 1) || this.side[p].hand.length !== cards.length || new Set(cards.map((cd) => cd.sequence)).size !== cards.length) return null;
    return p;
  }

  _opp_hand_done(st: St): Msg[] {
    const out: Msg[] = [];
    for (const [p, zone, idx, i] of st.cands) {
      if (st.chosen.includes(i) && zone === ZONE_HAND && idx >= 0 && idx < this.side[p & 1].hand.length) {
        const uid = this.side[p & 1].hand[idx];
        if (uid != null) out.push([M_6202, engine(K.C_LOCKON, p & 1, ZONE_HAND, uid, 0)]);
      }
    }
    return out.concat(this._hand_close().map((m) => [M_6202, m] as Msg));
  }

  _hand_close(): Uint8Array[] {
    const p = this.hand_open;
    this.hand_open = null;
    return p === null ? [] : [engine(K.C_HAND_OPEN, p, 0)];
  }

  _m_TOSS_DICE(ev: Ev): Out[] {
    // the client draws the die at (command player, zone): both name the card that rolls, not the roller and someone
    // else's chain link (an Archfiend rolling on the opponent's Megamorph showed its die on the wrong side of the field)
    const [j, zone] = this.cfg.toss_anim ? this._toss_zone(ev.player) : [ev.player, 0];
    const cp = this.cfg.toss_on_card ? j : ev.player;   // py: the roller, whoever's zone it is
    return (get(ev, "results", []) as number[]).slice(0, 2).map((r) => engine(K.C_DICE, cp, zone, r));
  }

  /** (player, zone) of the card that tosses: the one a HINT_CARD right before names (a continuous effect such as an
   *  Archfiend's, which rolls while the opponent's link resolves), else the resolving chain link. */
  _toss_zone(p: number): [number, number] {
    const prev = this._batch && this._bi ? this._batch[this._bi - 1] : null;
    if (this.cfg.toss_on_card && prev && prev.type === "HINT" && prev.hint_type === K.HINT_CARD) {
      const s = this.side[p];
      for (const where of ["mz", "sz"] as const) {
        const i = s[where].findIndex((u) => u != null && this.card(u).code === prev.hint);
        if (i >= 0) return [p, this.yo2_zone(where, i)[0]];
      }
    }
    const n = this.solving || this.chain.length;
    if (n > 0 && n <= this.chain.length) return this.chain[n - 1];
    return [p, 0];
  }

  _m_TOSS_COIN(ev: Ev): Out[] {
    if (!this.cfg.toss_anim) return [];
    const res = (get(ev, "results", []) as any[]).map((r) => truthy(r)).slice(0, 16);
    if (!res.length) return [];
    const [j, zone] = this._toss_zone(ev.player);
    const bits = res.reduce((m, r, i) => (r ? m + 2 ** i : m), 0);
    const p0 = (j & 1) | ((zone & 0x1f) << 1) | ((res.length & 0xff) << 6) | ((get(this.cfg, "coin_call", 1) & 1) << 14);
    return [engine(K.C_COIN, ev.player, p0, 0, bits)];
  }

  // --- counters / swap -------------------------------------------------------------------------------------------
  _counter(ev: Ev, sign: number): Out[] {
    if (!this.cfg.counters) return [];
    if (ev.location !== K.OCG_MZONE && ev.location !== K.OCG_SZONE) return [];
    const t = get(ev, "counter_type", 0) & 0xfff;
    const kind = K.COUNTER_MAP.get(t);
    if (kind === undefined) {
      this._warn(`contador 0x${get(ev, "counter_type", 0).toString(16)} sin tipo en el cliente: no se ve`);
      return [];
    }
    const [p, where, i] = this.ocg_slot(ev.controller, ev.location, ev.sequence) as [number, Where, number];
    if (this.side[p].pile(where)[i] == null) return [];
    const [slot] = this.yo2_zone(where, i);
    const n = Math.min(int(get(ev, "count", 1)), 0x7fff);
    return [engine(K.C_COUNTER, p, slot, (sign * n) & 0xffff, kind)];
  }

  _m_ADD_COUNTER(ev: Ev): Out[] { return this._counter(ev, 1); }
  _m_REMOVE_COUNTER(ev: Ev): Out[] { return this._counter(ev, -1); }

  // --- MSG_CARD_HINT (§22) ---------------------------------------------------------------------------------------
  _m_CARD_HINT(ev: Ev): Out[] {
    const kind = ev.card_hint;
    let key: string;
    if (kind === K.CHINT_TURN) key = "turn_counter";
    else if (kind === K.CHINT_RACE || kind === K.CHINT_ATTRIBUTE || kind === K.CHINT_CARD) key = "declare_hint";
    else return [];
    if (!this.cfg[key]) return [];
    if (kind === K.CHINT_TURN) {
      const neg = this._hint_player_count(ev);
      if (neg !== null) return neg;
    }
    const at = this._hint_slot(ev);
    if (at === null) return [];
    const [p, slot, internal] = at;
    let v = u32(int(ev.description || 0));
    if (kind === K.CHINT_TURN) {
      if (!K.TURN_CARDS.has(internal)) return [];
      if (v === 0) return [engine(K.C_TURN_COUNT, p, slot, 0, 0)];
      v = Math.min(v, 0xffff);
      return [engine(K.C_SLOT_VALUE, p, slot, v - 1, 0), engine(K.C_TURN_COUNT, p, slot, 1, 0)];
    }
    let val: number;
    if (kind === K.CHINT_RACE && K.DECL_RACE.has(internal)) {
      val = [...K.YO2_RACE].sort((a, b) => a[0] - b[0]).find(([, b]) => bit(v, Math.log2(b)))?.[0] ?? 0;
    } else if (kind === K.CHINT_ATTRIBUTE && K.DECL_ATTR.has(internal)) {
      val = [...K.YO2_ATTR].sort((a, b) => a[0] - b[0]).find(([, b]) => bit(v, Math.log2(b)))?.[0] ?? 0;
    } else if (kind === K.CHINT_ATTRIBUTE && K.DECL_ATTR_BITS.has(internal)) {
      val = [...K.YO2_ATTR].reduce((m, [i, b]) => (bit(v, Math.log2(b)) ? m + (1 << i) : m), 0);
    } else if (kind === K.CHINT_CARD && K.DECL_CARD.has(internal)) {
      val = v ? this.cm.wire(v) ?? 0 : 0;   // the declared card: its internal id in the client (its codec)
      if (val) return [engine(K.C_SLOT_VALUE, p, slot, asInternal(val), 0)];
    } else return [];
    if (!val) {
      this._warn(`CARD_HINT ${kind} = 0x${v.toString(16)} sin equivalente en el cliente: no se pinta`);
      return [];
    }
    return [engine(K.C_SLOT_VALUE, p, slot, val & 0xffff, val >> 16)];
  }

  _hint_player_count(ev: Ev): Out[] | null {
    const uid = this.uid_at(get(ev, "controller", 0), get(ev, "location", 0), get(ev, "sequence", 0));
    const c = uid !== null ? this.cards.get(uid) ?? null : null;
    if (c === null) return null;
    const internal = this.cm.wire(c.code) != null ? this.cm.rulesKey(c.code) : null;   // (the rule tables' key)
    if (internal === null || !K.TURN_CARDS_NEG.has(internal)) return null;
    if (!this.cfg.turn_counter_player) return [];
    const v = u32(int(ev.description || 0));
    if (v <= 0) return [];
    const p = internal === K.FINAL_COUNTDOWN ? c.owner : this.turn_player || 0;
    return [engine(K.C_TURN_COUNT, p, asInternal(this.cm.wire(c.code)!), 1, Math.min(v, 0xffff))];
  }

  _hint_slot(ev: Ev): [number, number, number] | null {
    if (ev.location !== K.OCG_MZONE && ev.location !== K.OCG_SZONE) return null;
    const [p, where, i] = this.ocg_slot(get(ev, "controller", 0), ev.location, get(ev, "sequence", 0)) as [number, Where, number];
    const lst = this.side[p].pile(where);
    const u = i >= 0 && i < lst.length ? lst[i] : null;
    if (u == null || !this.card(u).face) return null;
    const internal = this.cm.wire(this.card(u).code) != null ? this.cm.rulesKey(this.card(u).code) : null;   // (rule key)
    if (!internal) return null;
    const [slot] = this.yo2_zone(where, i);
    return [p, slot, internal];
  }

  _m_SWAP(ev: Ev): Out[] {
    if (!this.cfg.swap_cmd) return [];
    const a = ev.card1 || {}, b = ev.card2 || {};
    const ua = this.uid_at(get(a, "controller", 0), get(a, "location", 0), get(a, "sequence", 0));
    const ub = this.uid_at(get(b, "controller", 0), get(b, "location", 0), get(b, "sequence", 0));
    if (ua === null || ub === null) {
      this._warn(`SWAP sin carta en el espejo: ${repr(a)} / ${repr(b)}`);
      return [];
    }
    const [pa, wa, ia] = this.findx(ua);
    const [pb, wb, ib] = this.findx(ub);
    if ((wa !== "mz" && wa !== "sz") || (wb !== "mz" && wb !== "sz")) return [];
    const [sa] = this.yo2_zone(wa, ia);
    const [sb] = this.yo2_zone(wb, ib);
    this.side[pa].pile(wa)[ia] = ub;
    this.side[pb].pile(wb)[ib] = ua;
    let out: Out[] = [engine(K.C_SWAP, pa, (pa & 1) | ((sa & 0xff) << 8), (pb & 1) | ((sb & 0xff) << 8), 0)];
    for (const u of [ua, ub]) out = out.concat(this._identity(u));
    return out;
  }

  _m_WIN(ev: Ev): Out[] { return this._finish(ev.player, ev.reason); }

  /** B23 (field_change): if the face-up field spell changed, engine 0x14 FIELD_CHANGE. */
  _field_check(): Out[] {
    if (!this.cfg.field_change || this.finished) return [];
    const cur = new Map<number, number>();
    for (const p of [0, 1]) {
      const uid = this.side[p].sz[5];
      const c = uid !== null ? this.cards.get(uid) ?? null : null;
      if (c !== null && c.face) cur.set(p, uid!);
    }
    const nw = [...cur].filter(([p, uid]) => this._field_seen.get(p) !== uid).map(([p]) => p);
    this._field_seen = new Map(cur);
    const shown = this.field_shown;
    let target: [number, number] | null;
    if (nw.length) target = [nw[nw.length - 1], cur.get(nw[nw.length - 1])!];
    else if (shown !== null && cur.get(shown[0]) === shown[1]) target = shown;
    else if (cur.size) {
      const p = cur.keys().next().value!;
      target = [p, cur.get(p)!];
    } else target = null;
    if (eqPair(target, shown)) return [];
    this.field_shown = target;
    if (target === null) return [engine(K.C_FIELD_CHANGE, 0, 0)];
    const fieldPc = this.cm.wire(this.card(target[1]).code);
    if (!fieldPc) this._warn(`magia de campo que el cliente no tiene: ${this.card(target[1]).code}`);
    return [engine(K.C_FIELD_CHANGE, target[0], fieldPc ? asInternal(fieldPc) : 0)];
  }

  /** DUEL_END (0x05) + end of scene (type 0x4d). Result: 1 = player 0 wins, 2 = player 1, 0 = draw. */
  _finish(winner: any, _reason: any): Out[] {
    if (this.finished) return [];
    this.finished = true;
    const res = winner === 0 ? 1 : winner === 1 ? 2 : 0;
    return [engine(C_DUEL_END, 0, res, 0, 0), duel_finish(res || 3, this.cfg.finish_mode)];
  }

  // ================================================================================== ATK/DEF ==================
  /** Corrects the client with ocgcore's REAL board (duelcore query): face/position and ATK/DEF. */
  sync_board(state: any, resend = true): Msg[] { return this._sync_board(state, resend); }

  _sync_board(state: any, resend = true): Msg[] {
    if (!truthy(state) || this._syncing) return [];
    this._pile_drift(state);
    let out: Msg[] = [];
    ((state.players || []) as any[]).slice(0, 2).forEach((pl, p) => {
      for (const [key, loc_] of [["mzone", K.OCG_MZONE], ["szone", K.OCG_SZONE]] as [string, number][]) {
        ((pl[key] || []) as any[]).slice(0, 5).forEach((cd, i) => {
          const uid = this.uid_at(p, loc_, i);
          if (uid === null || !truthy(cd) || !truthy(cd.position)) return;
          const c = this.card(uid);
          const pos = cd.position;
          if (c.face !== !!(pos & 5) || (key === "mzone" && c.defense !== !!(pos & 12))) {
            this._warn(`desfase de posición j${p} ${key}[${i}]: cliente cara=${pyBool(c.face)} def=${pyBool(c.defense)}, ocgcore pos=${pos}: se corrige`);
            if (truthy(cd.code)) c.code = cd.code;
            out = out.concat(norm(this._m_POS_CHANGE({ controller: p, location: loc_, sequence: i, position: pos })));
          }
        });
      }
    });
    out = out.concat(this._stat_cmds(state));
    if (out.length && resend && this.waiting !== null && ![undefined, null, "auto"].includes((this.state ?? {}).mode)) {
      this._syncing = true;
      try {
        out = out.concat(norm(this._resend()));
      } finally {
        this._syncing = false;
      }
    }
    return out;
  }

  /** The client's piles follow this mirror, and its engine moves cards by index: a mirror pile of another size than
   *  ocgcore's means the client is about to be told a move out of a slot it does not have (a client crash in the hand
   *  vector, 2026-10-30). Logged once per side and pile, to reach Workers Logs ([AVISO]). */
  _pile_drift(state: any): void {
    ((state.players || []) as any[]).slice(0, 2).forEach((pl, p) => {
      const s = this.side[p];
      const n: [PileName, unknown][] = [["hand", pl.hand], ["grave", pl.grave], ["banish", pl.removed]];
      if (isInt(pl.deck_count)) n.push(["deck", Array(pl.deck_count)]);
      for (const [where, cards] of n) {
        if (!Array.isArray(cards) || cards.length === s.pile(where).length || this._drift.has(`${p}${where}`)) continue;
        this._drift.add(`${p}${where}`);
        this.log(`[AVISO] [traductor] desfase de ${where} j${p}: espejo ${s.pile(where).length}, ocgcore ${cards.length} (turno ${this.turn_no})`);
      }
    });
  }

  /** ocg_duel calls sync_stats after feed_many (= sync_board). */
  sync_stats(state: any): Msg[] { return this._sync_board(state); }

  _live_stats(): Out[] {
    if (this.query === null || !this.cfg.stat_sync || this._syncing) return [];
    try {
      return this._stat_cmds(this.query());
    } catch (e) {
      this._warn(`query falló: ${String(e)}`);
      return [];
    }
  }

  _stat_boundary(): Out[] {
    if (!this.cfg.stat_sync_turn) return [];
    return this._live_stats();
  }

  _stat_cmds(state: any): Msg[] {
    if (!this.cfg.stat_sync || !truthy(state)) return [];
    const out: Uint8Array[] = [];
    ((state.players || []) as any[]).slice(0, 2).forEach((pl, p) => {
      ((pl.mzone || []) as any[]).slice(0, 5).forEach((cd, i) => {
        const uid = this.side[p].mz[i];
        if (uid === null || !truthy(cd) || !(get(cd, "position", 0) & 5)) return;
        const atk = cd.attack, df = cd.defense;
        if (!isInt(atk) || !isInt(df) || atk < 0 || df < 0) return;
        const c = this.card(uid);
        if (truthy(cd.code) && truthy(c.code) && cd.code !== c.code) return;
        const base = this.cm.stats(c.code);
        let want: [number, number] | null = base && base[0] === atk && base[1] === df ? null : [atk, df];
        if (want === null && this.links.length && this.cfg.card_link && this.links.some((lk) => lk[1] === uid)) want = [atk, df];
        const prev = this.stat_sent.get(uid) ?? null;
        if (eqPair(want, prev)) return;
        if (prev !== null) out.push(engine(K.C_EFFECT_DEL, p, i, K.EFFECT_SET_STATS, 1));
        if (want !== null) {
          out.push(engine(K.C_EFFECT_ADD, p, i | 0x300, K.EFFECT_SET_STATS, Math.min(atk, 0xffff)));
          out.push(engine(K.C_EFFECT_ADD, p, i | 0x300, K.EFFECT_SET_STATS, Math.min(df, 0xffff)));
        }
        this.stat_sent.set(uid, want);
      });
    });
    return out.map((m) => [M_6202, m]);
  }

  // ===================================================================================== decisions ===========
  _loc_yo2(d: any): [number, number, number] | null {
    const [p, where, i] = this.ocg_slot(d.controller, d.location, d.sequence);
    if (where === null) return null;
    const [z, idx] = this.yo2_zone(where, i);
    return [p, z, idx];
  }

  /** entries: [player, zone, index, bit] -> 0x6611 + 0x6612 + 0x6202 type 0x1a. */
  _request(entries: readonly (readonly number[])[], tail_buttons: readonly number[] = [], kind = 3, clear = 1): Out[] {
    const masks: Masks = new Map();
    const hand = new Map<string, [number, number, number]>();
    for (const [p, z, idx, b] of entries) {
      if (z === ZONE_HAND) {
        const k = mk(p, idx);
        hand.set(k, [p, idx, (hand.get(k)?.[2] ?? 0) | (1 << b)]);
      } else {
        masks.set(mk(p, z), (masks.get(mk(p, z)) ?? 0) | (1 << b));
      }
    }
    if (this.cfg.pile_look) {
      for (const p of [0, 1]) {
        const s = this.side[p];
        for (const name of (p === 0 ? ["grave", "banish", "extra"] : ["grave", "banish"]) as PileName[]) {
          if (s.pile(name).length) {
            const z = K.PILE_ZONE[name];
            masks.set(mk(p, z), (masks.get(mk(p, z)) ?? 0) | (1 << CMD_LOOK));
          }
        }
      }
    }
    const tail: Masks = new Map(tail_buttons.map((b) => [mk(0, b), 1]));
    const hand_list = [...hand.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const extra: Masks = new Map();
    for (const p of [0, 1]) for (let z = 0; z < 16; z++) if (z !== ZONE_HAND) extra.set(mk(p, z), K.REASON_NONE);
    const lists = [0, 1].map((p) => [p, new Array(this.side[p].hand.length).fill(K.REASON_NONE)] as [number, number[]]);
    return this._timer_msg().concat([[0x6611, comid_field(masks, extra, tail)], [0x6612, comid_hand(hand_list, lists)],
      [M_6202, request_input(kind, clear)]]);
  }

  _on_select(ev: Ev): Out[] {
    if (get(ev, "player", 0) !== 0) return [];
    const fresh = ev !== this.waiting;
    if (fresh) {
      this.retry_n = truthy(ev.retry) ? this.retry_n + 1 : 0;
      if (truthy(ev.retry)) this._warn(`RETRY de ${ev.type}: la respuesta anterior no era legal (seguidos: ${this.retry_n})`);
    }
    this.waiting = ev;
    const t = ev.type;
    const cap = this.cfg.retry_auto || 0;
    if (fresh && cap && this.retry_n >= cap) {
      this._warn(`RETRY n.º ${this.retry_n} de ${t}: decide bot.ts`);
      this.state = { mode: "auto" };
      return [];
    }
    const fn = (this as any)["_s_" + t];
    if (typeof fn !== "function") {
      this.state = { mode: "auto" };
      return [];
    }
    let pre: Out[] = [];
    if (this.query !== null && !this._syncing) {
      try {
        pre = this._sync_board(this.query(), false);
      } catch (e) {
        this._warn(`query falló: ${String(e)}`);
      }
    }
    return pre.concat(fn.call(this, ev));
  }

  /** True if the pending decision is not asked to the client: the host must send auto_response(). */
  needs_auto(): boolean {
    return this.waiting !== null && (this.state ?? {}).mode === "auto";
  }

  /** Automatic response for the pending decision (or {cmd: "auto"} so bot.ts decides). */
  auto_response(): Cmd | null {
    const ev = this.waiting;
    if (ev === null) return null;
    const t = ev.type;
    this.waiting = null;
    if (this.retry_n && (this.cfg.retry_auto || 0)) return { cmd: "auto" };
    if ((this.state ?? {}).response) return { cmd: "respond", response: this.state.response };
    if (t === "SELECT_PLACE" || t === "SELECT_DISFIELD") {
      return { cmd: "respond", response: _respond(t, { places: _free_places(ev.field_mask, get(ev, "count", 1), placeOrderFrom(this.cfg.place_order)) }) };
    }
    if (t === "SELECT_POSITION") {
      const m = ev.positions;
      const pos = truthy(m) ? [K.POS_FU_ATK, K.POS_FU_DEF, K.POS_FD_DEF, K.POS_FD_ATK].find((b) => m & b) : K.POS_FU_ATK;
      if (pos === undefined) throw new Error("StopIteration");
      return { cmd: "respond", response: _respond(t, { position: pos }) };
    }
    if (t === "SELECT_CHAIN" && truthy(ev.forced) && this.cfg.forced_auto_single && get(ev, "selects", []).length === 1) {
      return { cmd: "respond", response: _respond(t, { index: 0 }) };
    }
    if (t === "SELECT_CHAIN" && !truthy(ev.forced) && this.cfg.chain_dialog === "pass") {
      return { cmd: "respond", response: _respond(t, { index: null }) };
    }
    if (t === "SELECT_CHAIN" && !truthy(ev.forced) && !truthy(ev.selects)) {
      return { cmd: "respond", response: _respond(t, { index: null }) };
    }
    if (t === "SELECT_OPTION" && get(ev, "options", []).length === 1) {
      return { cmd: "respond", response: _respond(t, { index: 0 }) };
    }
    const st = this.state ?? {};
    if (t === "SELECT_COUNTER" && st.counters != null) {
      return { cmd: "respond", response: _respond(t, { counters: [...st.counters] }) };
    }
    return { cmd: "auto" };
  }

  // --- SELECT_IDLECMD / SELECT_BATTLECMD -------------------------------------------------------------------------
  _s_SELECT_IDLECMD(ev: Ev): Out[] {
    const options: any[] = [];
    for (const [key, action, b0] of YO2Duel.IDLE_LISTS) {
      (get(ev, key, []) as any[]).forEach((d, i) => {
        const l3 = this._loc_yo2(d);
        if (!l3) return;
        let b = b0;
        if (b === null) {
          const u = this.uid_at(d.controller, d.location, d.sequence);
          const c = u !== null ? this.cards.get(u) ?? null : null;
          b = c && !c.face ? CMD_FLIP : c && !c.defense ? CMD_TO_DEF : CMD_TO_ATK;
        }
        options.push([...l3, b, action, i]);
      });
    }
    const buttons = [...(truthy(ev.to_bp) ? [PH_BATTLE] : []), ...(truthy(ev.to_ep) ? [PH_END] : [])];
    const all = new Map<number, string>([[PH_BATTLE, "TO_BP"], [PH_END, "TO_EP"]]);
    this.state = { mode: "idle", options, buttons: new Map([...all].filter(([b]) => buttons.includes(b))) };
    return this._request(options.map((o) => o.slice(0, 4)), buttons, this.cfg.kind_main);
  }

  _s_SELECT_BATTLECMD(ev: Ev): Out[] {
    const options: any[] = [];
    (get(ev, "attacks", []) as any[]).forEach((d, i) => {
      const l3 = this._loc_yo2(d);
      if (l3) options.push([...l3, CMD_ATTACK, "SELECT_BATTLE", i]);
    });
    (get(ev, "chains", []) as any[]).forEach((d, i) => {
      const l3 = this._loc_yo2(d);
      if (l3) options.push([...l3, CMD_ACTIVATE, "SELECT_CHAIN", i]);
    });
    const buttons = new Map<number, string>();
    if (truthy(ev.to_m2)) buttons.set(PH_MAIN2, "TO_M2");
    if (truthy(ev.to_ep)) buttons.set(PH_END, "TO_EP");
    this.state = { mode: "battle", options, buttons };
    return this._request(options.map((o) => o.slice(0, 4)), [...buttons.keys()], this.cfg.kind_battle);
  }

  // --- SELECT_CHAIN ----------------------------------------------------------------------------------------------
  _s_SELECT_CHAIN(ev: Ev): Out[] {
    const options: any[] = [];
    (get(ev, "selects", []) as any[]).forEach((d, i) => {
      const l3 = this._loc_yo2(d);
      if (l3) options.push([...l3, CMD_ACTIVATE, null, i]);
    });
    if (!options.length && !truthy(ev.forced)) {
      if (!truthy(ev.selects) && this.cfg.chain_dialog === 3 && this.cfg.chain_none_prompt) return this._chain_none();
      this.state = { mode: "auto" };
      return [];
    }
    if (truthy(ev.forced) && this.cfg.forced_auto_single && get(ev, "selects", []).length === 1) {
      this.state = { mode: "auto" };
      return [];
    }
    this.state = { mode: "chain", options, forced: ev.forced ?? null };
    const how = this.cfg.chain_dialog;
    if (truthy(ev.forced) || !options.length || !truthy(how)) {
      return this._request(options.map((o) => o.slice(0, 4)), [], this.cfg.kind_select);
    }
    if (how === "pass") {
      this.state = { mode: "auto" };
      return [];
    }
    this.state.mode = "chain_ask";
    let p2 = how === 3 ? get(this.cfg, "chain_importance", 2) : 0;
    if (how === 3 && truthy(this.cfg.chain_priority)) p2 = this._chain_priority(ev, this.cfg.chain_priority);
    else if (how === 3 && this.cfg.chain_importance_auto) p2 = this.trigger === 1 ? 2 : 1;
    let pairs: Pair[] = [[K.DLG_CHAIN, 2]];
    const sel: any[] = get(ev, "selects", []);
    let one = this.cfg.chain_one_name ? this._chain_one_pairs(sel) : null;
    const text = this.cfg.chain_event_text;
    const evt = text && !this.chain.length ? this._chain_event(ev)[0] : null;
    if (truthy(evt)) pairs = [[evt!, 2], [K.CHAIN_SEP, 3], [K.DLG_CHAIN, 3]];
    else if (one) pairs = one;
    else if (this.cfg.chain_card_name && sel.length) {
      const d = sel[0];
      const uid = this.uid_at(d.controller, d.location, d.sequence);
      const code = d.code || (uid !== null ? this.card(uid).code : null);
      const internal = truthy(code) ? this.cm.wire(code) : null;   // (a card pair: listAdd)
      if (internal) pairs = [[asInternal(internal), 4], [0xffff, 3], [K.DLG_CHAIN, 3]];
    }
    const link = this.cfg.chain_link_text ? this._chain_link_pairs() : null;
    let detail: Out[] = [];
    if (link) {
      pairs = text ? [...link, [link[0][0], 0]] : link;
      one = null;
      if (this.cfg.chain_link_detail) detail = this._chain_link_detail();
    }
    const flat = pairs.flat();
    const out = [setcommand(T_LIST_RESET, 0, [pairs.length]), listAdd(flat),
      setcommand(T_VIEW, 0x32, [how === 3 ? 3 : 2, 0, p2])];
    const pic = one ? sel.slice(0, 1) : sel;
    return (this._dialog_cards(pic.map((d) => [d.code, get(d, "controller", 0)])) as Out[]).concat(detail,
      out.map((m) => [M_6202, m] as Msg));
  }

  _chain_none(): Out[] {
    this.state = { mode: "chain_none" };
    const pairs = [[this.chain.length ? K.CHAIN_NONE[1] : K.CHAIN_NONE[0], 2], [K.CHAIN_SEP, 3], [K.CHAIN_NONE[2], 3]];
    const out = [setcommand(T_LIST_RESET, 0, [pairs.length]), listAdd(pairs.flat()),
      setcommand(T_VIEW, 0x32, [3, 0, K.CHAIN_NONE_P2])];
    return (this._dialog_cards([]) as Out[]).concat(out.map((m) => [M_6202, m] as Msg));
  }

  _chain_link_detail(): Out[] {
    if (!this.chain.length || !this.chain_codes.length) return [];
    const [p, zone] = this.chain[this.chain.length - 1];
    if (!(zone >= 0 && zone <= 10)) return [];
    const uid = zone < 5 ? this.side[p].mz[zone] : this.side[p].sz[zone < 10 ? zone - 5 : 5];
    const c = uid !== null ? this.cards.get(uid) ?? null : null;
    if (c === null || !c.face || c.code !== this.chain_codes[this.chain_codes.length - 1] || !this._pc(c.code)) return [];
    return [[M_6202, setcommand(T_VIEW, K.T_VIEW_DETAIL, [uid!, 0, 0])]];
  }

  _chain_one_pairs(sel: any[]): Pair[] | null {
    if (!sel.length || new Set(sel.map((d) => `${get(d, "controller", 0)},${d.location},${d.sequence}`)).size !== 1) return null;
    const d = sel[0];
    let code = d.code;
    if (!truthy(code)) {
      const uid = this.uid_at(get(d, "controller", 0), d.location, d.sequence);
      code = uid !== null ? this.card(uid).code : null;
    }
    const internal = truthy(code) ? this.cm.wire(code) ?? 0 : 0;   // (a card pair: listAdd)
    if (!internal) return null;
    const dlg = d.location === K.OCG_HAND ? K.DLG_EFFECT_YN_HAND : d.location === K.OCG_GRAVE ? K.DLG_EFFECT_YN_GRAVE : K.DLG_EFFECT_YN;
    return [[asInternal(internal), 4], [dlg, 0]];
  }

  /** §23: 0x6610 list mode 0xff with the cards [code, player] the CUYesNoDialog draws (before its 0x32). */
  _dialog_cards(cards: [any, number][]): Msg[] {
    if (!this.cfg.yesno_card) return [];
    const items = cards.filter(([c]) => truthy(c)).map(([c, p]) => listItem(this._pc(c), 0, p & 1)).slice(0, 5);
    if (!items.length || this.list_dirty) return [[K.M_LIST, packBIIII(0, 0, 0, 0, 0)]];
    return [[K.M_LIST, concat(packBIIII(0, K.LIST_DIALOG, 0, items.length, 0), ...items)]];
  }

  _chain_priority(ev: Ev, mode: any): number {
    const me = get(ev, "player", 0);
    const last = this.chain.length ? this.chain[this.chain.length - 1][0] : null;
    const hand = this.cfg.chain_priority_hand && this._hand_priority(ev, last === me);
    if (mode === "oficial") {
      if (last !== null) return last !== me || hand ? 2 : 1;
      if (this.cfg.chain_priority_hand && this._hand_priority(ev, true)) return 2;
      const p2 = this._chain_event(ev)[1];
      if (p2 < 2 && get(this.cfg, "chain_event_p2", true)) {
        for (const d of get(ev, "selects", [])) {
          const [, effs] = this._opt_effects(d);
          if (effs.length && effs.every((e) => e.code !== null && e.code !== K.EVENT_FREE_CHAIN)) return 2;
        }
      }
      return p2;
    }
    if (mode === "spe") return (get(ev, "spe_count", 0) > 0 && last !== me) || hand ? 2 : 1;
    if (last !== null) return last !== me || hand ? 2 : 1;
    if (hand) return 2;
    const attack = get(ev, "hint_timing_other", 0) & K.TIMING_ATTACK;
    for (const d of get(ev, "selects", [])) {
      const [, effs] = this._opt_effects(d);
      if (effs.length && effs.every((e) => e.code !== null && e.code !== K.EVENT_FREE_CHAIN)) return 2;
      if (attack && effs.some((e) => e.hint[1] & K.TIMING_ATTACK)) return 2;
    }
    return 1;
  }

  _chain_event(ev: Ev): [number | null, number] {
    const me = get(ev, "player", 0);
    let mine = ev.hint_timing || 0, opp = ev.hint_timing_other || 0;
    const last = this.ev_last;
    if ((mine | opp) & 0x2000 && !((mine | opp) & 0x4000) && last && last[0] === "DAMAGE_STEP_START") return [266, 2];
    if (!(mine || opp) && last) {
      let [t, p, ph] = last;
      let b = ({ ATTACK: 0x1000, DAMAGE_STEP_START: 0x2000, DRAW: 0x10000 } as Record<string, number>)[t] ?? 0;
      if (t === "NEW_PHASE") {
        b = ({ 1: 0x1, 2: 0x2, 0x200: 0x20 } as Record<number, number>)[ph] ?? 0;
        p = this.turn_player;
      } else if (t === "DAMAGE_STEP_START") p = this.turn_player;
      else if (K.CHAIN_SUMMONS.has(t)) b = K.CHAIN_SUMMONS.get(t)![0];
      if (p === me) mine = b;
      else opp = b;
    }
    const both = mine | opp;
    if (last && K.CHAIN_SUMMONS.has(last[0])) {
      const [b, dm, d_o, pm, po] = K.CHAIN_SUMMONS.get(last[0])!;
      if (both & b || !both) {
        const own = last[1] === me;
        return [own ? dm : d_o, own ? pm : po];
      }
    }
    for (const [b, dm, d_o, pm, po] of K.CHAIN_EVENTS) {
      if (both & b) {
        const own = !!(mine & b);
        return [(own ? dm : d_o) || null, own ? pm : po];
      }
    }
    if (both & 0x20000 && this.dmg_player != null) return [K.CHAIN_DAMAGE[this.dmg_player === me ? 0 : 1], K.CHAIN_DAMAGE[2]];
    return [null, 1];
  }

  _opt_effects(d: any): [any, { type: number | null; code: number | null; hint: [number, number]; desc: number | null }[]] {
    let code = d.code;
    if (!truthy(code)) {
      const uid = this.uid_at(d.controller, d.location, d.sequence);
      code = uid !== null ? this.card(uid).code : null;
    }
    let info = truthy(code) ? this.cm.script_info(code) : null;
    const alias = truthy(code) ? this.cm.cdb_alias.get(code) ?? null : null;
    if (info === null && truthy(alias)) info = this.cm.script_info(alias!);
    let effs = info ? info.effects : [];
    const desc = d.description || 0;
    const inCA = (v: number) => v === code || v === alias;
    const n = shr(desc, 20) && inCA(shr(desc, 20)) ? low(desc, 20) : shr(desc, 4) && inCA(shr(desc, 4)) ? low(desc, 4) : null;
    if (n !== null) {
      const f = effs.filter((e) => e.desc === n);
      if (f.length) effs = f;
    }
    return [code, effs];
  }

  _hand_priority(ev: Ev, own_last: boolean): boolean {
    const battle = this.in_battle || this.in_damage || ((get(ev, "hint_timing", 0) | get(ev, "hint_timing_other", 0)) & K.TIMINGS_BATTLE);
    for (const d of get(ev, "selects", [])) {
      if (d.location !== K.LOCATION_HAND) continue;
      const [code, effs] = this._opt_effects(d);
      if (!truthy(code) || this.cm.kind(code) !== "monster") continue;
      for (const e of effs) {
        if (battle && e.code === K.EVENT_FREE_CHAIN && (e.hint[0] | e.hint[1]) & K.TIMINGS_BATTLE) return true;
        if (own_last && (e.type || 0) & K._ET_TRIGGER_O) return true;
      }
    }
    return false;
  }

  _chain_link_pairs(): Pair[] | null {
    const codes = this.chain_codes;
    if (!this.chain.length || codes.length !== this.chain.length || !truthy(codes[codes.length - 1])) return null;
    const internal = this.cm.wire(codes[codes.length - 1]) ?? 0;   // (a card pair: listAdd)
    if (!internal) return null;
    return [[asInternal(internal), 4], [this.cm.kind(codes[codes.length - 1]) === "monster" ? K.DLG_LINK_EFFECT : K.DLG_LINK_CARD, 0]];
  }

  // --- YES/NO ----------------------------------------------------------------------------------------------------
  _yesno(ev: Ev): Out[] {
    if (this.cfg.yesno !== "dialog") {
      this.state = { mode: "auto" };
      return [];
    }
    this.state = { mode: "yesno" };
    let code = ev.code;
    const desc = ev.description || 0;
    const texts = this.cfg.yesno_texts;
    const card = this.cfg.yesno_card;
    let spec: [number, null | "self" | number, number | null] | null = null;
    if (texts) {
      const [dcode, dn] = _desc_card(desc);
      if (ev.type === "SELECT_EFFECTYN" && truthy(code) && K.YESNO_SYS_CARD.has(desc)) {
        spec = [K.YESNO_SYS_CARD.get(desc)!, "self", null];
      } else if (!truthy(code) && dcode) {
        spec = K.YESNO_DLG.get(`${dcode},${dn}`) ?? null;
        if (spec && this.cm.wire(dcode)) code = dcode;
      }
    } else if (!truthy(code) && desc >= 2 ** 20 && this.cm.wire(shr(desc, 4))) {
      code = shr(desc, 4);
    }
    if (!(truthy(code) && this.cm.wire(code))) code = null;
    const pairs = spec ? this._yesno_pairs(spec, code) : null;
    let out: Uint8Array[];
    if (pairs) {
      out = [setcommand(T_LIST_RESET, 0, [pairs.length])];
      const flat = pairs.flat();
      for (let k = 0; k < flat.length; k += 8) out.push(listAdd(flat.slice(k, k + 8)));
    } else if (!truthy(code)) {
      let text = K.DLG_CHAIN;
      if (this.cfg.yesno_sys_text) text = K.YESNO_SYS_DLG.get(desc) ?? K.DLG_CHAIN;
      out = [setcommand(T_LIST_RESET, 0, [1]), listAdd([text, 2])];
    } else if (card && ev.type === "SELECT_EFFECTYN") {
      const dlg = ev.location === K.OCG_HAND ? K.DLG_EFFECT_YN_HAND : ev.location === K.OCG_GRAVE ? K.DLG_EFFECT_YN_GRAVE : K.DLG_EFFECT_YN;
      out = [setcommand(T_LIST_RESET, 0, [2]), listAdd([asInternal(this.cm.wire(code) ?? 0), 4, dlg, 0])];
    } else {
      out = [setcommand(T_LIST_RESET, 0, [1]), listAdd([asInternal(this.cm.wire(code) ?? 0), 4])];
    }
    out.push(setcommand(T_VIEW, 0x32, [2, 0, 0]));
    const pic = this._dialog_cards(truthy(code) ? [[code, get(ev, "controller", get(ev, "player", 0))]] : []);
    return (pic as Out[]).concat(out.map((m) => [M_6202, m] as Msg));
  }

  _s_SELECT_EFFECTYN(ev: Ev): Out[] { return this._yesno(ev); }
  _s_SELECT_YESNO(ev: Ev): Out[] { return this._yesno(ev); }

  _yesno_pairs(spec: [number, null | "self" | number, number | null], own_code: any): Pair[] | null {
    const [dlg, who, num] = spec;
    if (who === null && num === null) return [[dlg, 2]];
    const pairs: Pair[] = [];
    if (who !== null) {
      const code = who === "self" ? own_code : who;
      const internal = truthy(code) ? this.cm.wire(code) ?? 0 : 0;   // (a card pair: listAdd)
      if (!internal) return null;
      pairs.push([asInternal(internal), 4]);
    }
    pairs.push([dlg, 0]);
    if (num !== null) pairs.push([int(num), 1]);
    return pairs;
  }

  // --- picking cards ------------------------------------------------------------------------------------------
  _pick(ev: Ev, cands_key: string, mode: string): Out[] {
    const cands: number[][] = [];
    const opp_hand = mode === "card" && !!this.cfg.opp_hand_pick;
    const lst: any[] = get(ev, cands_key, []);
    for (let i = 0; i < lst.length; i++) {
      const l3 = this._loc_yo2(lst[i]);
      if (l3 === null || (l3[1] === ZONE_HAND && l3[0] !== 0 && !opp_hand)) {
        this.state = { mode: "auto" };
        return [];
      }
      cands.push([...l3, i]);
    }
    if (mode === "card" && this.cfg.list_picks && cands.some((c) => K.LIST_ZONES.includes(c[1]))) return this._list_pick(ev, cands);
    const target = (this.attacking || this.phase === 3) && cands.every((c) => c[0] === 1 && c[1] < 5);
    const att = this.attacker;
    const aim = !!(target && this.attacking && this.cfg.attack_aim && att && att[1] >= 0 && att[1] < 5);
    this.attacking = false;
    let b = target ? this.cfg.target_bit : this.cfg.select_bit;
    if (aim) b = get(this.cfg, "aim_target_bit", b);
    this.state = { mode, cands, chosen: [], bit: b, aim, min: get(ev, "min", 1), max: get(ev, "max", 1), can_cancel: ev.can_cancel ?? null };
    if (!aim && !target && this._ritual_monster_pick(ev, cands_key, mode, cands)) {
      Object.assign(this.state, { kind: K.KIND_RITUAL, clear: 0 });
      return ([[M_6202, setcommand(T_LIST_RESET, 0, [1])], [M_6202, listAdd([K.DLG_RITUAL_MONSTER, 2])],
        [M_6202, setcommand(T_VIEW, 0x32, [0xff, K.DLG_RITUAL_MONSTER, 1])]] as Out[]).concat(this._pick_request());
    }
    if (!aim && cands.length && cands.every((c) => c[0] === 1 && c[1] === ZONE_HAND) && opp_hand) {
      Object.assign(this.state, { kind: K.KIND_OPP_HAND, clear: 1 });
      let panel: Out[] = [];
      if (this.state.max === 1) {
        panel = [[M_6202, setcommand(T_LIST_RESET, 0, [1])], [M_6202, listAdd([K.DLG_PICK_OPP_HAND, 2])],
          [M_6202, setcommand(T_VIEW, 0x32, [0xff, K.DLG_PICK_OPP_HAND, 1])]];
      }
      return panel.concat(this._pick_request());
    }
    if (!aim) {
      let panel: Out[] = [];
      if (this.cfg.pick_panel && !target && (mode === "card" || mode === "tribute")) {
        const dlg = mode === "tribute" ? K.DLG_PICK_TRIBUTE : K.DLG_PICK_FIELD;
        panel = [[M_6202, setcommand(T_LIST_RESET, 0, [1])], [M_6202, listAdd([dlg, 2])],
          [M_6202, setcommand(T_VIEW, 0x32, [0xff, 0, 0])]];
      }
      return panel.concat(this._pick_request());
    }
    return ([[M_6202, setcommand(T_VIEW, K.VIEW_ATTACKER, [(att![0] & 1) | ((att![1] & 0xff) << 8), 1, 0xffffffff])],
      [M_6202, setcommand(T_VIEW, K.VIEW_BATTLE_SELECT, [])]] as Out[]).concat(this._pick_request());
  }

  _pick_request(): Out[] {
    const st = this.state;
    const left = (st.cands as number[][]).filter((c) => !st.chosen.includes(c[3]));
    const pre: Out[] = truthy(st.discard) ? [this._discard_var(st.discard - st.chosen.length)] : [];
    return pre.concat(this._request(left.map(([p, z, idx]) => [p, z, idx, st.bit]), [],
      get(st, "kind", this.cfg.kind_select), get(st, "clear", 1)));
  }

  _ritual_monster_pick(ev: Ev, cands_key: string, mode: string, cands: number[][]): boolean {
    if (mode !== "card" || !cands.length || !this.cfg.ritual_sum) return false;
    if (this._last_hint3() !== K.HINTMSG_SPSUMMON || cands.some((c) => c[0] !== 0 || c[1] !== ZONE_HAND)) return false;
    return (get(ev, cands_key, []) as any[]).every((d) => ((this.cm.cdb_type.get(d.code) ?? 0) & 0x81) === 0x81);
  }

  // --- §20: hand-limit discard (CUDiscardDialog) ----------------------------------------------------------------
  _discard_var(n: number): Msg {
    this.discard_open = n > 0;
    return [M_6202, setcommand(K.T_SETVAR16, 0, [K.VAR_DISCARD, Math.max(0, n)])];
  }

  _last_hint3(): any {
    if (!truthy(this._batch) || this._bi === null) return null;
    for (const e of this._batch!.slice(0, this._bi).reverse()) {
      if (e.ev !== "msg") return null;
      if (e.type === "HINT" && e.hint_type === 3) return e.hint ?? null;
      if (e.type !== "HINT" && e.type !== "RETRY") return null;
    }
    return null;
  }

  _hand_limit(ev: Ev): boolean {
    const sel: any[] = ev.selects || [], hand = this.side[0].hand, n = ev.min;
    if (this.ocg_phase !== K.OCG_PHASE_END || this.turn_player !== 0 || this.chain.length || truthy(ev.can_cancel)) return false;
    if (!truthy(n) || ev.max !== n || sel.length !== hand.length || n !== hand.length - K.HAND_LIMIT) return false;
    if (sel.some((d) => d.controller !== 0 || d.location !== K.OCG_HAND)) return false;
    return this._last_hint3() === K.HINTMSG_DISCARD;
  }

  _discard_pick(ev: Ev): Out[] {
    const cands: number[][] = [];
    const lst: any[] = get(ev, "selects", []);
    for (let i = 0; i < lst.length; i++) {
      const l3 = this._loc_yo2(lst[i]);
      if (l3 === null || l3[0] !== 0 || l3[1] !== ZONE_HAND) return this._pick(ev, "selects", "card");
      cands.push([...l3, i]);
    }
    const n = ev.min;
    this.attacking = false;
    this.state = { mode: "card", cands, chosen: [], bit: this.cfg.select_bit, aim: false, min: n, max: n, can_cancel: false, discard: n };
    return ([[M_6202, setcommand(T_LIST_RESET, 0, [1])], [M_6202, listAdd([K.DLG_DISCARD, 2])],
      this._discard_var(n), [M_6202, setcommand(T_VIEW, 0x32, [K.DLGT_DISCARD, 0, 0])]] as Out[]).concat(this._pick_request());
  }

  // --- lists (deck, grave, banished, extra; mixes with the field) ---------------------------------------------------
  _list_pick(ev: Ev, cands: number[][]): Out[] {
    this.attacking = false;
    const items: number[][] = [];
    for (const d of get(ev, "selects", []) as any[]) {
      const uid = this.uid_at(d.controller, d.location, d.sequence);
      const found = uid !== null ? this.find(uid) : null;
      if (found === null) {
        this._warn(`lista: candidata sin carta en el espejo ${repr(d)}`);
        this.state = { mode: "auto" };
        return [];
      }
      const [p, where] = found;
      const c = this.card(uid!);
      const code = d.code || c.code;
      const y = this._hides(c, where, p) ? this._visible(c, where, p) : this._pc(code);
      items.push([y, (uid! >> 1) & 0xff, c.owner & 1]);
    }
    const n = items.length;
    let mx = Math.max(1, Math.min(get(ev, "max", 1), n));
    const mn = Math.max(0, Math.min(get(ev, "min", 1), mx));
    let lmode: number;
    if (mx === 1) lmode = K.LIST_ONE;
    else if (mn === mx && mx <= 0x20) lmode = K.LIST_EXACT0 + mx;
    else {
      mx = Math.min(mx, 0x21);
      lmode = K.LIST_UPTO0 + mx;
    }
    this.state = { mode: "list", cands, items, lmode, min: mn, max: mx, marks: new Map(), single: null, can_cancel: ev.can_cancel ?? null };
    return this._list_request();
  }

  _list_request(): Out[] {
    const st = this.state;
    const body = concat(...(st.items as number[][]).map(([i, s, f]) => listItem(i, s, f)));
    st.marks = new Map();
    st.single = null;
    return [[K.M_LIST, concat(packBIIII(0, st.lmode, 0, st.items.length, 0), body)],
      [M_6202, setcommand(T_VIEW, K.T_VIEW_LIST, [0, st.lmode, 0])]];
  }

  _list_msg(msg_id: number, data: Uint8Array): [Cmd | null, Out[]] {
    const st = this.state;
    const n = st.items.length;
    if (msg_id === 0x6426 && data.length >= 4) {
      const [i] = unpackU32(data, 1);
      if (i < n) st.single = i;
      return [null, []];
    }
    if (msg_id === 0x6432 && data.length >= 8) {
      const [i, order] = unpackU32(data, 2);
      if (i < n) {
        if (order) st.marks.set(i, order);
        else st.marks.delete(i);
      }
      return [null, []];
    }
    let chosen = sortedByValue(st.marks);
    if (truthy(st.sort)) {
      if (chosen.length === st.items.length) {
        return this._answer(_respond("SORT_CARD", { order: chosen.map((_, i) => chosen.indexOf(i)) }));
      }
      this.log(`[traductor] ordenar: lista cerrada con ${repr(chosen)}: se vuelve a abrir`);
      return [null, this._list_request()];
    }
    if (!chosen.length && st.single !== null) chosen = [st.single];
    if (st.unselect && chosen.length && chosen.length <= st.max) {
      this.unsel_queue = { keys: chosen.slice(1).map((i) => st.keys[i]), done: st.lmode === K.LIST_ANY };
      return this._answer(_respond(this.waiting.type, { index: chosen[0] }));
    }
    if (st.unselect && !chosen.length && truthy(st.can_cancel)) return this._answer(_respond(this.waiting.type, { index: null }));
    if (!st.unselect && chosen.length && st.min <= chosen.length && chosen.length <= st.max) {
      return this._answer(_respond(this.waiting.type, { indicies: chosen }));
    }
    if (!chosen.length && truthy(st.can_cancel)) return this._answer(_respond(this.waiting.type, { indicies: null }));
    this.log(`[traductor] lista cerrada con ${repr(chosen)} (min ${st.min}, max ${st.max}): se vuelve a abrir`);
    return [null, this._list_request()];
  }

  _s_SELECT_CARD(ev: Ev): Out[] {
    if (this.cfg.hand_limit_dialog && this._hand_limit(ev)) return this._discard_pick(ev);
    return this._pick(ev, "selects", "card");
  }

  _s_SELECT_TRIBUTE(ev: Ev): Out[] { return this._pick(ev, "selects", "tribute"); }

  _s_SELECT_UNSELECT_CARD(ev: Ev): Out[] {
    const listed = this.cfg.unselect_list ? this._unselect_list(ev) : null;
    if (listed !== null) return listed;
    const ev2 = { ...ev, min: 1, max: 1 };
    const out = this._pick({ ...ev2, selects: get(ev, "select_cards", []) }, "selects", "unselect");
    if (this.state.mode === "unselect") this.state.can_cancel = ev.can_finish || ev.can_cancel;
    return out;
  }

  /** unselect_list (ours; py shares the bug, DESIGN.md "Deliberate changes from 2008"): a SELECT_UNSELECT_CARD with
   *  candidates in the deck, graveyard, banished or extra deck (Chaos Sorcerer, Dark Necrofear, Future Fusion…) opens
   *  the client's card list (CWindowDeckList, 0x6610 + 0x1b B=0x33) as SELECT_CARD does, instead of a bare mask on
   *  the pile that shows no card. ocgcore asks one card per prompt: a prompt that can be finished or cancelled gets the
   *  list kind LIST_ANY (several in order; right click closes it, also with none) and the next prompts of the run take
   *  the other marked cards in order, then finish, without opening the list again; any other prompt gets LIST_ONE.
   *  null: not for a list (the pile mask, as py). */
  _unselect_list(ev: Ev): Out[] | null {
    const sel: any[] = get(ev, "select_cards", []);
    const key = (d: any) => `${d.controller}:${d.location}:${d.sequence}`;
    const q = this.unsel_queue;
    this.unsel_queue = null;
    if (q && truthy(ev.unselect_cards)) {
      const i = q.keys.length ? sel.findIndex((d) => key(d) === q.keys[0]) : -1;
      if (i >= 0) {
        this.unsel_queue = { keys: q.keys.slice(1), done: q.done };
        this.state = { mode: "auto", response: _respond(ev.type, { index: i }) };
        return [];
      }
      if (!q.keys.length && q.done && truthy(ev.can_finish)) {
        this.state = { mode: "auto", response: _respond(ev.type, { index: null }) };
        return [];
      }
    }
    const cands: number[][] = [];
    for (let i = 0; i < sel.length; i++) {
      const l3 = this._loc_yo2(sel[i]);
      if (l3 === null || (l3[1] === ZONE_HAND && l3[0] !== 0)) return null;
      cands.push([...l3, i]);
    }
    if (!cands.some((c) => K.LIST_ZONES.includes(c[1]))) return null;
    const open = truthy(ev.can_finish) || truthy(ev.can_cancel);
    const out = this._list_pick({ ...ev, selects: sel, min: 1, max: 1 }, cands);
    if (this.state.mode !== "list") return out;
    Object.assign(this.state, { unselect: true, keys: sel.map(key), can_cancel: open });
    if (!open) return out;
    Object.assign(this.state, { lmode: K.LIST_ANY, min: 0, max: sel.length });
    return this._list_request();
  }

  // --- §33: SELECT_SUM (Ritual Summon) --------------------------------------------------------------------------
  _s_SELECT_SUM(ev: Ev): Out[] {
    if (!this.cfg.ritual_sum) return this._auto();
    const must: any[] = ev.selects_must || [], sel: any[] = ev.selects || [];
    const target = int(ev.amount || 0) & 0xffff;
    const exact = !truthy(ev.select_max);
    const lo = int(ev.min || 0), hi = int(ev.max || 0);
    const cands: any[] = [];
    for (let i = 0; i < sel.length; i++) {
      const d = sel[i];
      const l3 = this._loc_yo2(d);
      const uid = this.uid_at(d.controller, d.location, d.sequence);
      if (l3 === null || uid === null || (l3[1] === ZONE_HAND && l3[0] !== 0)) {
        this._warn(`SELECT_SUM: candidata rara ${repr(d)}: decide bot.ts`);
        return this._auto();
      }
      cands.push({ i, loc: l3, uid, vals: sum_vals(int(d.amount || 0)), code: d.code ?? null });
    }
    const mvals = must.map((d) => sum_vals(int(d.amount || 0)));
    if (!target || (!cands.length && !must.length)) return this._auto();
    const listing = cands.some((c) => K.LIST_ZONES.includes(c.loc[1]));
    this.state = { mode: listing ? "sum_list" : "sum", cands, chosen: [], must: mvals, nmust: must.length, target, exact, lo, hi,
      kind: K.KIND_RITUAL, clear: 0 };
    if (!this._sum_open().length) {
      this._warn("SELECT_SUM sin ninguna selección válida posible: decide bot.ts");
      return this._auto();
    }
    if (listing) return this._sum_list_request();
    const left = this._sum_left();
    return ([[M_6202, setcommand(K.T_STARS, 0, [left, K.STARS_NONE])],
      [M_6202, setcommand(T_LIST_RESET, 0, [1])], [M_6202, listAdd([K.DLG_RITUAL_STARS, 2])],
      [M_6202, setcommand(T_VIEW, 0x32, [K.DLGT_RITUAL, K.DLG_RITUAL_STARS, target])]] as Out[]).concat(this._sum_request());
  }

  _sum_chosen_vals(): SumVals[] {
    const st = this.state;
    return [...st.must, ...st.cands.filter((c: any) => st.chosen.includes(c.i)).map((c: any) => c.vals)];
  }

  _sum_open(): number[] {
    const st = this.state;
    const chosen = this._sum_chosen_vals();
    const free = st.cands.filter((c: any) => !st.chosen.includes(c.i));
    const out: number[] = [];
    for (const c of free) {
      const rest = free.filter((o: any) => o !== c).map((o: any) => o.vals);
      if (sum_completable([...chosen, c.vals], rest, st.target, st.exact, st.lo, st.hi)) out.push(c.i);
    }
    return out;
  }

  _sum_left(): number {
    const st = this.state;
    const got = this._sum_chosen_vals().reduce((s, v) => s + v[0], 0);
    return Math.max(0, Math.min(0xfe, st.target - got));
  }

  _sum_done(): boolean {
    const st = this.state;
    return sum_valido(this._sum_chosen_vals(), st.target, st.exact, st.lo, st.hi);
  }

  _sum_answer(): [Cmd | null, Out[]] {
    const st = this.state;
    const n = st.nmust;
    return this._answer(_respond("SELECT_SUM", { indicies: [...Array.from({ length: n }, (_, i) => i), ...st.chosen.map((i: number) => i + n)] }));
  }

  _sum_request(): Out[] {
    const st = this.state;
    const ok = new Set(this._sum_open());
    return this._request(st.cands.filter((c: any) => ok.has(c.i)).map((c: any) => [...c.loc, this.cfg.select_bit]), [], K.KIND_RITUAL, 0);
  }

  _sum_pick(c: any): [Cmd | null, Out[]] {
    const st = this.state;
    st.chosen.push(c.i);
    let out: Out[] = [];
    if (st.mode === "sum") {
      const [p, z] = c.loc;
      out = [[M_6202, setcommand(T_VIEW, K.VIEW_SET_MATERIAL, [p, z, c.uid])],
        [M_6202, setcommand(K.T_STARS, 0, [this._sum_left(), c.vals[0] & 0xffff])]];
    }
    if (c.loc[1] === ZONE_HAND || c.loc[1] < 5) this.ritual_mats = new Set([...this.ritual_mats, c.uid]);
    if (this._sum_done()) {
      const [cmd, back] = this._sum_answer();
      return [cmd, out.concat(back)];
    }
    return [null, out.concat(st.mode === "sum" ? this._sum_request() : this._sum_list_request())];
  }

  _sum_click(p: number, zone: number, idx: number): [Cmd | null, Out[]] {
    const st = this.state;
    const ok = new Set(this._sum_open());
    const c = st.cands.find((c: any) => ok.has(c.i) && c.loc[0] === p && c.loc[1] === zone && (zone >= 0xc || c.loc[2] === idx));
    if (c === undefined) return [null, this._sum_request()];
    return this._sum_pick(c);
  }

  _sum_list_request(): Out[] {
    const st = this.state;
    const ok = new Set(this._sum_open());
    const items: number[][] = [], order: number[] = [];
    for (const c of st.cands) {
      if (!ok.has(c.i)) continue;
      const u = c.uid;
      const card = this.card(u);
      const [p, where] = this.findx(u);
      const y = this._hides(card, where, p) ? this._visible(card, where, p) : this._pc(c.code || card.code);
      items.push([y, (u >> 1) & 0xff, card.owner & 1]);
      order.push(c.i);
    }
    st.list_order = order;
    st.single = null;
    st.marks = new Map();
    const body = concat(...items.map(([i, s, f]) => listItem(i, s, f)));
    return [[M_6202, setcommand(T_LIST_RESET, 0, [1])], [M_6202, listAdd([K.DLG_RITUAL_DECK, 2])],
      [M_6202, setcommand(T_VIEW, 0x32, [0xfe, K.DLG_RITUAL_DECK, 0])],
      [K.M_LIST, concat(packBIIII(0, K.LIST_ONE, 0, items.length, 0), body)],
      [M_6202, setcommand(T_VIEW, K.T_VIEW_LIST, [0, K.LIST_ONE, 0])]];
  }

  _sum_list_msg(msg_id: number, data: Uint8Array): [Cmd | null, Out[]] {
    const st = this.state;
    const n = (st.list_order || []).length;
    if (msg_id === 0x6426 && data.length >= 4) {
      const [i] = unpackU32(data, 1);
      if (i < n) st.single = i;
      return [null, []];
    }
    if (msg_id === 0x6432 && data.length >= 8) {
      const [i, order] = unpackU32(data, 2);
      if (i < n) {
        if (order) st.marks.set(i, order);
        else st.marks.delete(i);
      }
      return [null, []];
    }
    let marked = sortedByValue(st.marks);
    if (!marked.length) marked = st.single !== null ? [st.single] : [];
    if (!marked.length) {
      this.log("[traductor] SELECT_SUM: lista cerrada sin carta: se vuelve a abrir");
      return [null, this._sum_list_request()];
    }
    const i = st.list_order[marked[0]];
    const c = st.cands.find((c: any) => c.i === i);
    if (c === undefined) throw new Error("StopIteration");
    return this._sum_pick(c);
  }

  _place_cands(ev: Ev): Map<string, { player: number; location: number; sequence: number }> {
    const mask = get(ev, "field_mask", 0xffffffff);
    const out = new Map<string, { player: number; location: number; sequence: number }>();
    for (const side of [0, 1]) {
      for (const [base, location, first] of [[0, K.OCG_MZONE, 0], [8, K.OCG_SZONE, 5]]) {
        for (let seq = 0; seq < 5; seq++) {
          if (!bit(mask, side * 16 + base + seq)) out.set(mk(side, first + seq), { player: side, location, sequence: seq });
        }
      }
    }
    return out;
  }

  _s_SELECT_PLACE(ev: Ev): Out[] {
    if (this.cfg.place_manual && this.place_manual && ev.type === "SELECT_PLACE" && get(ev, "count", 1) === 1) {
      const cands = this._place_cands(ev);
      if (cands.size > 1) {
        this.state = { mode: "place", cands };
        const keys = [...cands.keys()].map((k) => k.split(",").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return this._request(keys.map(([p, z]) => [p, z, 0, CMD_GENERIC]), [], this.cfg.kind_select);
      }
    }
    this.state = { mode: "auto" };
    return [];
  }

  _s_SELECT_DISFIELD(ev: Ev): Out[] { return this._s_SELECT_PLACE(ev); }

  _place_click(p: number, zone: number, idx: number, cmd: number): [Cmd | null, Out[]] {
    const slot = zone < 0xb ? zone + idx : zone;
    const c = cmd === CMD_GENERIC ? this.state.cands.get(mk(p, slot)) ?? null : null;
    if (c === null) {
      this.log(`[traductor] colocación: clic fuera de las zonas libres j=${p} zona=0x${zone.toString(16)} índice=${idx} cmd=${cmd}: se vuelve a pedir`);
      return [null, this._resend()];
    }
    return this._answer(_respond(this.waiting.type, { places: [{ ...c }] }));
  }

  // --- B42: client windows (§18) ---------------------------------------------------------------------------------
  _dialog(kind: number, text: number, p2 = 0, mode: string | null = null, st: Record<string, any> = {}): Out[] {
    this.state = { ...st, mode };
    return [[M_6202, setcommand(T_LIST_RESET, 0, [1])], [M_6202, listAdd([text, 2])],
      [M_6202, setcommand(T_VIEW, 0x32, [kind, 0, p2 >>> 0])]];
  }

  _dialog_pairs(kind: number, pairs: Pair[], p2 = 0, mode: string | null = null, st: Record<string, any> = {}): Out[] {
    this.state = { ...st, mode };
    const out: Out[] = [[M_6202, setcommand(T_LIST_RESET, 0, [pairs.length])]];
    const flat = pairs.flat();
    for (let k = 0; k < flat.length; k += 8) out.push([M_6202, listAdd(flat.slice(k, k + 8))]);
    out.push([M_6202, setcommand(T_VIEW, 0x32, [kind, 0, p2 >>> 0])]);
    return out;
  }

  _auto(): Out[] {
    this.state = { mode: "auto" };
    return [];
  }

  _uid_for_code(code: any): [number | null, Out[]] {
    const alias = this.cm.cdb_alias.get(code) ?? null;
    for (const p of [0, 1]) {
      for (const name of ["hand", "grave", "banish", "extra", "deck", "mz", "sz"] as Where[]) {
        for (const uid of this.side[p].pile(name)) {
          const c = uid !== null ? this.cards.get(uid) ?? null : null;
          if (c !== null && (c.code === code || (truthy(alias) && c.code === alias))) {
            let pre: Out[] = [];
            if (this._own(p) && (name === "deck" || name === "extra")) pre = this._identity(uid!, true);
            return [uid, pre];
          }
        }
      }
    }
    return [null, []];
  }

  _s_SELECT_POSITION(ev: Ev): Out[] {
    const m = get(ev, "positions", 0);
    if (!this.cfg.position_dialog || !(m & K.POS_FU_ATK) || !(m & (K.POS_FU_DEF | K.POS_FD_DEF)) || m & K.POS_FD_ATK) return this._auto();
    const [uid, pre] = this._uid_for_code(ev.code ?? null);
    if (uid === null) return this._auto();
    const face_def = !!(m & K.POS_FU_DEF);
    return (norm(pre) as Out[]).concat(this._dialog(K.DLGT_STAND, K.DLG_SEL_POS, (uid & 0xffff) | (+face_def << 16), "position",
      { def_pos: face_def ? K.POS_FU_DEF : K.POS_FD_DEF }));
  }

  _s_ANNOUNCE_RACE(ev: Ev): Out[] {
    const avail = int(get(ev, "available", 0)), n = get(ev, "count", 1);
    const mask = [...K.YO2_RACE].reduce((s, [i, b]) => (bit(avail, Math.log2(b)) ? s + (1 << i) : s), 0);
    if (!this.cfg.announce_dialogs || n !== 1 || !mask) return this._auto();
    return this._dialog(K.DLGT_RACE, K.DLG_SEL_RACE, mask, "race");
  }

  _s_ANNOUNCE_ATTRIB(ev: Ev): Out[] {
    const avail = int(get(ev, "available", 0)), n = get(ev, "count", 1);
    const mask = [...K.YO2_ATTR].reduce((s, [i, b]) => (bit(avail, Math.log2(b)) ? s + (1 << i) : s), 0);
    if (!this.cfg.announce_dialogs || !(n >= 1 && n <= popcount(mask)) || n > 0xffff) return this._auto();
    return this._dialog(K.DLGT_ATTR, K.DLG_SEL_ATTR, n | (mask << 16), "attrib", { count: n });
  }

  static _num_plan(opts: number[]): [number, number, number, number, number] | null {
    if (!opts.length || Math.min(...opts) < 0) return null;
    let text: number, label: number, k: number;
    if (opts.every((v) => v && v % 1000 === 0)) [text, label, k] = [K.DLG_NUM_LP, K.LBL_LP1000, 1000];
    else if (opts.every((v) => v && v % 100 === 0)) [text, label, k] = [K.DLG_NUM_LP, K.LBL_LP100, 100];
    else if (Math.max(...opts) <= 12 && Math.min(...opts) >= 1 && opts.length >= 5) [text, label, k] = [K.DLG_NUM_LEVEL, K.LBL_LEVEL, 1];
    else [text, label, k] = [K.DLG_NUM_QTY, K.LBL_NUM, 1];
    const lo = Math.floor(Math.min(...opts) / k), hi = Math.floor(Math.max(...opts) / k);
    if (lo > 0xf || hi > 0xff) return null;
    return [text, label, k, lo, hi];
  }

  _s_ANNOUNCE_NUMBER(ev: Ev): Out[] {
    const opts = (get(ev, "options", []) as any[]).map(int);
    const plan = this.cfg.announce_dialogs ? YO2Duel._num_plan(opts) : null;
    if (plan === null) return this._auto();
    let [text, label] = plan;
    const [, , k, lo, hi] = plan;
    if (k === 1 && this.chain_codes.length && this.cfg.number_texts) {
      const nt = K.NUMBER_TEXTS.get(this.chain_codes[this.chain_codes.length - 1]);
      if (nt) [text, label] = nt;
    }
    return this._dialog(K.DLGT_NUM, text, (label | (lo << 16) | (hi << 24)) >>> 0, "number", { opts, scale: k });
  }

  _s_ANNOUNCE_CARD(_ev: Ev): Out[] {
    if (!this.cfg.announce_dialogs) return this._auto();
    this.state = { mode: "announce", card: null };
    return this._announce_request();
  }

  _announce_request(): Out[] {
    this.state.card = null;
    return [[M_6202, setcommand(T_VIEW, K.T_VIEW_LIST, [0, K.LIST_ANNOUNCE, 0], HINT_ANNOUNCE)]];
  }

  _announce_msg(msg_id: number, data: Uint8Array): [Cmd | null, Out[]] {
    const st = this.state;
    if (msg_id !== 0x6423 || data.length < 4) return [null, []];
    const [v] = unpackU32(data, 1);
    if (v > 1) {
      st.card = v;
      return [null, []];
    }
    if (st.card == null) return [null, this._announce_request()];
    const code = st.card;   // a passcode: the client's codec sends the declared card's
    if (!code || !_declarable(this.cm, code, get(this.waiting, "opcodes", []))) {
      this.log(`[traductor] anunciar: interno ${st.card} -> ${code} no vale para ${repr(this.waiting.opcodes)}`);
      return [null, this._announce_request()];
    }
    return this._answer(_respond("ANNOUNCE_CARD", { card: code }));
  }

  _s_SELECT_OPTION(ev: Ev): Out[] {
    const opts = (get(ev, "options", []) as any[]).map(int);
    if (opts.length <= 1 || !this.cfg.option_dialog) return this._auto();
    if (opts.length === 2 && this.cfg.option_yn) {
      const [c0, n0] = _desc_card(opts[0]), [c1, n1] = _desc_card(opts[1]);
      const spec = c0 && c0 === c1 ? K.OPTION_YN.get(`${c0},${n0},${n1}`) ?? null : null;
      const pairs = spec ? this._yesno_pairs(spec, c0) : null;
      if (pairs) return (this._dialog_cards([]) as Out[]).concat(this._dialog_pairs(2, pairs, 0, "option_yn", { yes: 0, no: 1 }));
    }
    const sortedOpts = [...opts].sort((a, b) => a - b);
    if (sortedOpts.length === 2 && sortedOpts[0] === K.OPT_YES && sortedOpts[1] === K.OPT_NO) {
      const text = this.chain_codes.includes(59344077) ? K.DLG_MAGIC_DRAIN : K.DLG_CHAIN;
      return (this._dialog_cards([]) as Out[]).concat(
        this._dialog(2, text, 0, "option_yn", { yes: opts.indexOf(K.OPT_YES), no: opts.indexOf(K.OPT_NO) }));
    }
    const over = this.cfg.option_texts || {};
    const ids = opts.map((o) => over[o] || K.OPTION_DLG.get(o) || K.OPTION_DLG.get(_option_key(o)) || null);
    if (opts.length > 4 || !ids.every((x) => truthy(x))) {
      this.log(`[traductor] SELECT_OPTION ${repr(opts)} sin texto del cliente para todas: decide bot.ts`);
      return this._auto();
    }
    const body = concat(...ids.map((i) => listItem(i!, 0, 2)));
    const text = opts.every((o) => o === 70 || o === 71 || o === 72) ? K.DLG_SEL_CARDTYPE : K.DLG_SEL_EFFECT;
    return ([[K.M_LIST, concat(packBIIII(0, 0, 0, ids.length, 0), body)]] as Out[]).concat(
      this._dialog(K.DLGT_SELECT, text, 0, "option", { n: opts.length }));
  }

  _s_SORT_CARD(ev: Ev): Out[] {
    const cards: any[] = get(ev, "cards", []);
    if (!this.cfg.sort_list || !(cards.length >= 2 && cards.length <= 0x20)) return this._auto();
    const items: number[][] = [];
    for (const d of cards) {
      const uid = this.uid_at(d.controller, d.location, d.sequence);
      const code = d.code || (uid !== null ? this.card(uid).code : 0);
      const y = truthy(code) ? this._pc(code) : HIDDEN_MONSTER;
      items.push([y, uid !== null ? (uid >> 1) & 0xff : 0, d.controller & 1]);
    }
    const n = items.length;
    this.state = { mode: "list", sort: true, cands: [], items, lmode: K.LIST_EXACT0 + n, min: n, max: n, marks: new Map(), single: null, can_cancel: false };
    return this._list_request();
  }

  _s_SORT_CHAIN(ev: Ev): Out[] { return this._s_SORT_CARD(ev); }

  _s_SELECT_COUNTER(ev: Ev): Out[] {
    const caps = (get(ev, "cards", []) as any[]).map((c) => int(get(c, "count", 0)));
    const need = int(get(ev, "count", 0));
    if (!this.cfg.counter_dialog || !caps.length || caps.reduce((a, b) => a + b, 0) < need) return this._auto();
    this.state = { mode: "counter", caps, need, got: [], cards: get(ev, "cards", []) };
    const out = this._counter_next();
    if (truthy(this.state.done)) this.state = { mode: "auto", counters: [...this.state.got] };
    return out;
  }

  _counter_next(): Out[] {
    const st = this.state;
    while (st.got.length < st.caps.length) {
      const k = st.got.length;
      const left = st.need - st.got.reduce((a: number, b: number) => a + b, 0);
      const lo = Math.max(0, left - st.caps.slice(k + 1).reduce((a: number, b: number) => a + b, 0));
      const hi = Math.min(st.caps[k], left);
      if (lo === hi) {
        st.got.push(lo);
        continue;
      }
      if (lo > 0xf || hi > 0xff) {
        this.state = { mode: "auto" };
        return [];
      }
      const d = st.cards[k];
      const uid = this.uid_at(d.controller, d.location, d.sequence);
      const code = d.code || (uid !== null ? this.card(uid).code : 0);
      const internal = truthy(code) ? this.cm.wire(code) ?? 0 : 0;   // (a card pair: listAdd)
      st.lo = lo;
      st.hi = hi;
      return [[M_6202, setcommand(T_LIST_RESET, 0, [1])],
        [M_6202, listAdd(internal ? [asInternal(internal), 4] : [K.DLG_NUM_COUNTERS, 2])],
        [M_6202, setcommand(T_VIEW, 0x32, [K.DLGT_NUM, 0, (K.LBL_COUNTERS | (lo << 16) | (hi << 24)) >>> 0])]];
    }
    st.done = true;
    return [];
  }

  /** 0x6423 of a B42 window -> response for ocgcore. */
  _dialog_msg(v: number): [Cmd | null, Out[]] {
    const st = this.state, t = this.waiting.type;
    const mode = st.mode;
    const ev = this.waiting;
    if (mode === "position") return this._answer(_respond(t, { position: v === 0 ? K.POS_FU_ATK : st.def_pos }));
    if (mode === "race") {
      const b = K.YO2_RACE.get(v) ?? 0;
      if (b & int(get(ev, "available", 0))) return this._answer(_respond(t, { races: [b] }));
    } else if (mode === "attrib") {
      const avail = int(get(ev, "available", 0));
      const bits = [...K.YO2_ATTR].sort((a, b) => a[0] - b[0]).filter(([i, b]) => ((v >>> i) & 1) && b & avail).map(([, b]) => b);
      if (bits.length === st.count) return this._answer(_respond(t, { attributes: bits }));
    } else if (mode === "number") {
      const want = v * st.scale;
      if (st.opts.includes(want)) return this._answer(_respond(t, { value: st.opts.indexOf(want) }));
      this.log(`[traductor] número ${want} fuera de ${repr(st.opts)}: se vuelve a preguntar`);
      return [null, this._resend()];
    } else if (mode === "option") {
      if (v < st.n) return this._answer(_respond(t, { index: v }));
    } else if (mode === "option_yn") {
      return this._answer(_respond(t, { index: v === 1 ? st.yes : st.no }));
    } else if (mode === "counter") {
      if (st.lo <= v && v <= st.hi) {
        st.got.push(v);
        const out = this._counter_next();
        if (truthy(st.done)) return this._answer(_respond(t, { counters: [...st.got] }));
        if (this.state.mode === "auto") {
          this.waiting = null;
          this.state = null;
          return [{ cmd: "auto" }, []];
        }
        return [null, out];
      }
      return [null, this._resend()];
    }
    this.log(`[traductor] 0x6423 ${v} no vale en el diálogo ${mode}: decide bot.ts`);
    this.waiting = null;
    this.state = null;
    return [{ cmd: "auto" }, []];
  }

  // ======================================================================================= client -> core =====
  /** A client message -> [command for duelcore or null, messages for the client]. */
  on_client(msg_id: number, data: Uint8Array = new Uint8Array(0)): [Cmd | null, Msg[]] {
    const [cmd, out] = this._on_client(msg_id, data);
    return [cmd, norm(out)];
  }

  _on_client(msg_id: number, data: Uint8Array): [Cmd | null, Out[]] {
    const st = this.state ?? {};
    const mode = st.mode ?? null;
    if (this.waiting === null || mode === null || mode === "auto") {
      this.log(`[traductor] 0x${hex4(msg_id)} sin decisión pendiente: ignorado`);
      return [null, []];
    }
    this.list_dirty = false;
    if (mode === "chain_none") {
      if (msg_id === 0x6423 && data.length >= 4) return this._answer(_respond(this.waiting.type, { index: null }));
      this.log(`[traductor] 0x${hex4(msg_id)} no esperado en modo chain_none`);
      return [null, []];
    }
    const listMsg = msg_id === 0x6426 || msg_id === 0x6432 || msg_id === 0x6423;
    if (mode === "list" && listMsg) return this._list_msg(msg_id, data);
    if (mode === "sum_list" && listMsg) return this._sum_list_msg(msg_id, data);
    if (mode === "announce" && listMsg) return this._announce_msg(msg_id, data);
    if (YO2Duel.DIALOG_MODES.includes(mode) && msg_id === 0x6423 && data.length >= 4) return this._dialog_msg(unpackU32(data, 1)[0]);
    if (msg_id === 0x6350 && data.length >= 16) {
      const [p, zone, idx, c] = unpackU32(data, 4);
      return this._click(p, zone, idx, c === 0xffffffff ? -1 : c);
    }
    if (msg_id === 0x002e && data.length >= 4) {
      const [b] = unpackU32(data, 1);
      const action = (st.buttons as Map<number, string> | undefined)?.get(b);
      if (action) return this._answer(_respond(this.waiting.type, { action, index: null }));
      return [null, this._resend()];
    }
    if (msg_id === 0x6351) return this._cancel();
    if (msg_id === 0x6423 && this.viewing) {
      this.viewing = false;
      return [null, this._resend()];
    }
    if (msg_id === 0x6423 && data.length >= 4 && (mode === "yesno" || mode === "chain_ask")) {
      const yes = unpackU32(data, 1)[0] === 1;
      const t = this.waiting.type;
      if (mode === "chain_ask") {
        if (!yes) return this._answer(_respond(t, { index: null }));
        if (this.cfg.chain_yes_direct && st.options.length === 1) return this._answer(_respond(t, { index: st.options[0][5] }));
        this.state = { ...st, mode: "chain", asked: true };
        return [null, this._request(st.options.map((o: any[]) => o.slice(0, 4)), [], this.cfg.kind_select)];
      }
      return this._answer(_respond(t, { yes }));
    }
    this.log(`[traductor] 0x${hex4(msg_id)} no esperado en modo ${mode}`);
    return [null, []];
  }

  _answer(resp: any): [Cmd, Out[]] {
    const out: Out[] = this.discard_open ? [this._discard_var(0)] : [];
    this.waiting = null;
    this.state = null;
    return [{ cmd: "respond", response: resp }, out];
  }

  /** The pending request again (B02: the host calls it when on_client throws, or after «¿Te rindes?» NO). */
  resend(): Msg[] { return norm(this._resend()); }

  _resend(): Out[] {
    const ev = this.waiting;
    if (ev === null) return [];
    const mode = (this.state ?? {}).mode;
    if (mode === "card" || mode === "tribute" || mode === "unselect") return this._pick_request();
    if (mode === "list") return this._list_request();
    if (mode === "sum") return this._sum_request();
    if (mode === "sum_list") return this._sum_list_request();
    if (mode === "chain" && truthy(this.state.asked)) {
      return this._request(this.state.options.map((o: any[]) => o.slice(0, 4)), [], this.cfg.kind_select);
    }
    return this._on_select(ev);
  }

  _click(p: number, zone: number, idx: number, cmd: number): [Cmd | null, Out[]] {
    const st = this.state;
    const mode = st.mode;
    if (cmd === CMD_LOOK && (zone === ZONE_GRAVE || zone === ZONE_BANISH || zone === ZONE_EXTRA) && this.cfg.pile_look) {
      return [null, this._look(p & 1, zone)];
    }
    if (cmd === -1) return [null, this._resend()];
    if (mode === "place") return this._place_click(p, zone, idx, cmd);
    if (mode === "idle" || mode === "battle" || mode === "chain") {
      const same = st.options.filter((o: any[]) => o[0] === p && o[1] === zone && (zone >= 0xc || o[2] === idx));
      const pick = same.find((o: any[]) => o[3] === cmd);
      if (pick === undefined) {
        this.log(`[traductor] jugada sin opción: j=${p} zona=0x${zone.toString(16)} índice=${idx} cmd=${cmd}`);
        return [null, this._resend()];
      }
      const t = this.waiting.type;
      if (mode === "chain") return this._answer(_respond(t, { index: pick[5] }));
      this.attacking = mode === "battle" && pick[4] === "SELECT_BATTLE";
      this.attacker = this.attacking && pick[1] < 5 ? [pick[0], pick[1]] : null;
      return this._answer(_respond(t, { action: pick[4], index: pick[5] }));
    }
    if (mode === "sum") return this._sum_click(p, zone, idx);
    if (mode === "card" || mode === "tribute" || mode === "unselect") {
      const c = st.cands.find((c: number[]) => !st.chosen.includes(c[3]) && c[0] === p && c[1] === zone && (zone >= 0xc || c[2] === idx));
      if (c === undefined) return [null, this._pick_request()];
      if (mode === "unselect") return this._answer(_respond("SELECT_UNSELECT_CARD", { index: c[3] }));
      st.chosen.push(c[3]);
      if (st.chosen.length >= st.max) {
        const [cm, out] = this._answer(_respond(this.waiting.type, { indicies: [...st.chosen] }));
        return [cm, st.kind === K.KIND_OPP_HAND && this.hand_open !== null ? out.concat(this._opp_hand_done(st)) : out];
      }
      return [null, this._pick_request()];
    }
    return [null, []];
  }

  /** «Ver Detalles» on a pile: 0x6610 with its cards + 0x6202 type 0x1b B=0x33. */
  _look(p: number, zone: number): Out[] {
    const name = ({ [ZONE_GRAVE]: "grave", [ZONE_BANISH]: "banish", [ZONE_EXTRA]: "extra" } as Record<number, PileName>)[zone];
    if (p === 1 && name === "extra") return this._resend();
    const lm = this.cfg.look_modes;
    const mode = lm != null && Object.prototype.hasOwnProperty.call(lm, zone) ? lm[zone] : 1;
    const pile = this.side[p].pile(name) as number[];
    const body = concat(...pile.map((u) => listItem(this._visible(this.card(u), name, p), (u >> 1) & 0xff, this.card(u).owner & 1)));
    this.viewing = true;
    return [[K.M_LIST, concat(packBIIII(0, mode, 0, pile.length, 0), body)],
      [M_6202, setcommand(T_VIEW, K.T_VIEW_LIST, [p, mode, 0])]];
  }

  _cancel(): [Cmd | null, Out[]] {
    const st = this.state;
    const mode = st.mode;
    const t = this.waiting.type;
    if (mode === "chain") {
      if (!truthy(st.forced)) return this._answer(_respond(t, { index: null }));
    } else if (mode === "card" || mode === "tribute") {
      if (st.chosen.length >= st.min && st.chosen.length) {
        const [cm, out] = this._answer(_respond(t, { indicies: [...st.chosen] }));
        return [cm, st.kind === K.KIND_OPP_HAND && this.hand_open !== null ? out.concat(this._opp_hand_done(st)) : out];
      }
      if (truthy(st.can_cancel)) {
        const [cm, out] = this._answer(_respond(t, { indicies: null }));
        return [cm, truthy(st.aim) ? out.concat([[M_6202, setcommand(T_VIEW, K.VIEW_BATTLE_INIT, [this.turn_player || 0])]]) : out];
      }
    } else if (mode === "sum_list") {
      return [null, []];
    } else if (mode === "list") {
      return [null, []];
    } else if (mode === "unselect") {
      if (truthy(st.can_cancel)) return this._answer(_respond(t, { index: null }));
    } else if (mode === "yesno") {
      return this._answer(_respond(t, { yes: false }));
    } else if (mode === "chain_ask") {
      return this._answer(_respond(t, { index: null }));
    } else if (YO2Duel.DIALOG_MODES.includes(mode) || mode === "announce") {
      return [null, []];
    }
    return [null, this._resend()];
  }
}

// --- small helpers
function isDict(v: unknown): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
const hex4 = (n: number): string => n.toString(16).padStart(4, "0");
const pyBool = (b: boolean): string => (b ? "True" : "False");
/** str() for the codes compared in _shuffle_dest (ints and None). */
const pyStr = (v: any): string => (v == null ? "None" : String(v));
/** sorted(d, key=d.get) over a Map (stable: insertion order on ties). */
function sortedByValue(m: Map<number, number>): number[] {
  return [...m.keys()].sort((a, b) => m.get(a)! - m.get(b)!);
}
