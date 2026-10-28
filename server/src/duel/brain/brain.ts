// py research/ia/brain.py: Board and NpcBrain, the NPC duel AI («Konami-style» greedy rules over duelcore's brain mode).
// Same decisions as py for the same profile, seed and inputs: the brain's own random.Random(seed) is a PyRandom with
// the same call order, and every sort/max keeps py's tie-breaking.
//
//   const b = new NpcBrain(loadNpcProfile(npcId, profilesJson), 1, seed, db);
//   for each duelcore event ev with ev.ev === "msg": b.observe(ev)
//   on the NPC's select (not a retry): r = b.choose(sel)   // r === null -> the engine's bot (auto) decides
import { PyRandom } from "../../util/pyrandom.ts";
import {
  type Card, CardDB, HARMFUL_TAGS, HINTS_BUENO, HINTS_MALO, H_ATTACKTARGET, H_TOGRAVE, LOC_EXTRA, LOC_GRAVE, LOC_HAND,
  LOC_MZONE, LOC_REMOVED, LOC_SZONE, PH_BATTLE_START, PH_END, PH_M1, PH_M2, PH_STANDBY, POS_FD_ATK, POS_FD_DEF,
  POS_FU_ATK, POS_FU_DEF, TAGS_NO_BOOST, TYPE_EFFECT, TYPE_EQUIP, TYPE_FIELD, TYPE_QUICKPLAY, TYPE_RITUAL,
  declarable, tagMask, toBigInt,
} from "./cards.ts";
import { type NpcProfile, PERFILES } from "./profile.ts";
import { zoneOrder } from "../zones.ts";

type Obj = Record<string, any>;
export type BrainResponse = Record<string, unknown>;

/** py dict.get(k, d): a key present with null gives null (None), not the default. */
function g(o: any, k: string, d: any = null): any {
  return o != null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : d;
}

/** py truthiness of a JSON value. */
function truthy(v: any): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "" || v === 0n) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

/** py `x or y` */
const or = (x: any, y: any) => (truthy(x) ? x : y);

/** py Python-style sort: `key` ascending, stable (or descending with reverse, still stable). */
function cmp(a: any, b: any): number {
  if (Array.isArray(a)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
    return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
const tupleMax = <X extends any[]>(xs: X[]): X => xs.reduce((m, x) => (cmp(x, m) > 0 ? x : m));
const sortRev = <X extends any[]>(xs: X[]) => xs.sort((a, b) => cmp(b, a));   // tuples with a unique index: no ties
const sortBy = <X>(xs: X[], key: (x: X) => number) => xs.map((x) => [key(x), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const pyMin = (xs: number[]) => xs.reduce((m, x) => (x < m ? x : m));
const pyMax = (xs: number[]) => xs.reduce((m, x) => (x > m ? x : m));
const pyIndex = (xs: any[], v: any) => { const i = xs.indexOf(v); if (i < 0) throw new Error(`${v} is not in list`); return i; };

/** collections.Counter with py's insertion order (most_common: count desc, ties in insertion order). */
class Counter<K> {
  readonly m = new Map<K, number>();
  get(k: K) { return this.m.get(k) ?? 0; }
  add(k: K, n = 1) { this.m.set(k, this.get(k) + n); }
  mostCommon(): [K, number][] { return [...this.m.entries()].sort((a, b) => b[1] - a[1]); }
}
/** Counter with tuple keys (py hashes the tuple; here its JSON). */
class TupleCounter {
  private m = new Map<string, number>();
  get(k: any[]) { return this.m.get(JSON.stringify(k)) ?? 0; }
  add(k: any[], n = 1) { const s = JSON.stringify(k); this.m.set(s, (this.m.get(s) ?? 0) + n); }
}

/** py `NPC_RITUALES`: the NPC uses ritual spells (YO2_NPC_RITUALES / YO2_PARCHE_SUM unset or not "0"). */
export let NPC_RITUALES = true;
export function setNpcRituales(v: boolean) { NPC_RITUALES = v; }

export function face_up(pos: any): boolean { return ((or(pos, 0) as number) & (POS_FU_ATK | POS_FU_DEF)) !== 0; }
export function in_attack(pos: any): boolean { return ((or(pos, 0) as number) & (POS_FU_ATK | POS_FD_ATK)) !== 0; }

type Slot = [number, Obj];

// ======================================================================================
// Board (from duelcore's select.view)
// ======================================================================================
export class Board {
  me: number; op: number; db: CardDB;
  lp: number[]; turn_player: any; phase: any; my_turn: boolean;
  hand: any[]; op_hand_count: any;
  mz: any[][]; sz: any[][]; grave: any[][]; removed: any[][];
  my_m: Slot[]; op_m: Slot[]; my_st: Slot[]; op_st: Slot[];
  my_free_m: number; my_free_s: number; fd_guess: number;

  constructor(sel: Obj, me: number, db: CardDB, prof: NpcProfile) {
    const v = or(g(sel, "view"), {});
    const ps = or(g(v, "players"), [{}, {}]);
    this.me = me; this.op = 1 - me;
    this.db = db;
    this.lp = or(g(sel, "lp"), [8000, 8000]);
    this.turn_player = g(sel, "turn_player");
    this.phase = g(sel, "phase", 0);
    this.my_turn = this.turn_player === me;
    const mine = or(ps.at(me), {}), opp = or(ps.at(1 - me), {});
    this.hand = (g(mine, "hand", []) as any[]).filter(truthy);
    this.op_hand_count = g(opp, "hand_count", 0);
    this.mz = [g(mine, "mzone", []), g(opp, "mzone", [])];
    this.sz = [g(mine, "szone", []), g(opp, "szone", [])];
    this.grave = [g(mine, "grave", []), g(opp, "grave", [])];
    this.removed = [g(mine, "removed", []), g(opp, "removed", [])];
    this.my_m = this.mz[0].map((c, i) => [i, c] as Slot).filter(([, c]) => truthy(c));
    this.op_m = this.mz[1].map((c, i) => [i, c] as Slot).filter(([, c]) => truthy(c));
    this.my_st = this.sz[0].slice(0, 5).map((c, i) => [i, c] as Slot).filter(([, c]) => truthy(c));
    this.op_st = this.sz[1].map((c, i) => [i, c] as Slot).filter(([i, c]) => truthy(c) && i < 6);
    this.my_free_m = truthy(this.mz[0]) ? this.mz[0].slice(0, 5).filter((c) => !truthy(c)).length : 5;
    this.my_free_s = truthy(this.sz[0]) ? this.sz[0].slice(0, 5).filter((c) => !truthy(c)).length : 5;
    this.fd_guess = prof.defensa_boca_abajo;
  }

  mon_atk(c: any): number {
    if (!truthy(c)) return 0;
    if (!face_up(g(c, "position")) && !truthy(g(c, "code"))) return this.fd_guess;
    const a = g(c, "attack");
    if (a === null) { const ci = this.db.get(g(c, "code")); return ci ? ci.atk : 0; }
    return Math.max(0, a);
  }

  mon_def(c: any): number {
    if (!truthy(c)) return 0;
    if (!face_up(g(c, "position")) && !truthy(g(c, "code"))) return this.fd_guess;
    const d = g(c, "defense");
    if (d === null) { const ci = this.db.get(g(c, "code")); return ci ? ci.deff : 0; }
    return Math.max(0, d);
  }

  mon_value(c: any): number {
    if (this.borrowed(c)) return 0;
    return Math.max(300, this.mon_atk(c), Math.trunc(this.mon_def(c) * 0.8));
  }

  borrowed(c: any): boolean {
    return truthy(c) && g(c, "owner") !== null && g(c, "owner") !== this.me && this.mz[0].some((x) => x === c);
  }

  side(controller: any): number { return controller === this.me ? 0 : 1; }

  mon_at(controller: any, seq: number): any {
    const z = this.mz[this.side(controller)];
    return 0 <= seq && seq < z.length ? z[seq] : null;
  }

  get op_threat(): number {
    return this.op_m.reduce((m, [, c]) => Math.max(m, face_up(g(c, "position")) ? this.mon_atk(c) : this.fd_guess), 0);
  }

  get my_best(): number { return this.my_m.reduce((m, [, c]) => Math.max(m, this.mon_atk(c)), 0); }

  side_value(s: number): number {
    const ms = s === 0 ? this.my_m : this.op_m;
    return ms.reduce((t, [, c]) => t + this.mon_value(c), 0);
  }

  grave_best(both = true): number {
    let best = 0;
    for (const s of both ? [0, 1] : [0]) {
      for (const code of this.grave[s]) {
        const ci = this.db.get(code);
        if (ci && ci.is_monster && !ci.is_extra) best = Math.max(best, ci.atk);
        else if (ci && ci.is_monster) best = Math.max(best, ci.atk - 500);
      }
    }
    return best;
  }
}

// ======================================================================================
// Brain
// ======================================================================================
const R_IDLE = (action: string, index: number | null = null) => ({ type: "SELECT_IDLECMD", action, index });
const R_BATTLE = (action: string, index: number | null = null) => ({ type: "SELECT_BATTLECMD", action, index });

const M_NUKE = tagMask("nuke_opp", "nuke_all");
const M_ATK_SUM = tagMask("on_attack", "on_summon");
const M_DESTROY_BOUNCE = tagMask("destroy_monster", "bounce");
const M_BOOST_WEAKEN = tagMask("boost", "weaken");
const M_REACTIVE = tagMask("on_attack", "on_summon", "negate");
const M_BIG = tagMask("nuke_opp", "nuke_all", "storm_all", "storm_opp", "control");
const M_STORMS = tagMask("storm_all", "storm_opp", "destroy_st", "destroy_any");
const M_V2800 = tagMask("nuke_opp", "nuke_all", "storm_opp", "control");
const M_V2200 = tagMask("draw", "revive", "destroy_monster", "destroy_any", "negate");
const M_GOOD_INTENT = tagMask("boost", "revive", "search");
const M_GOOD_EXCEPT = tagMask("destroy_monster", "control", "weaken");
const M_BAD_INTENT = tagMask("nuke_opp", "nuke_all", "destroy_monster", "destroy_st", "destroy_any", "control", "weaken", "bounce", "stall");

const actKey = (c: Obj) => ["act", c.code, c.location, c.sequence, g(c, "description", 0)];

export class NpcBrain {
  p: NpcProfile;
  me: number;
  db: CardDB;
  rng: PyRandom;
  stats = new Counter<string | null>();
  turn: any = null;
  hint: any = 0;
  chain: [any, any, any][] = [];
  attack: [any, any] | null = null;
  opp_summon: [any, any, any] | null = null;
  last_activated: any = 0;
  seen_opp = new Counter<any>();
  attack_plan: [number, number | null] | null = null;
  idle_n = 0;
  attacks_n = 0;
  bp_done = false;
  used = new TupleCounter();

  /** py NpcBrain(profile, player=1, seed=None, db=None). seed: py's random.Random(seed) (int); none = entropy. */
  constructor(profile: NpcProfile | string = "normal", player = 1, seed?: number | bigint | null, db?: CardDB) {
    if (typeof profile === "string") {
      if (!Object.prototype.hasOwnProperty.call(PERFILES, profile)) throw new Error(`KeyError: '${profile}'`);
      this.p = PERFILES[profile];
    } else this.p = profile;
    this.me = player;
    this.db = db ?? CardDB.shared();
    this.rng = new PyRandom(seed ?? undefined);
    this._new_turn();
  }

  private _new_turn() {
    this.idle_n = 0;
    this.attacks_n = 0;
    this.bp_done = false;
    this.used = new TupleCounter();
  }

  /** Public duel messages (ev.ev === "msg"). It does not look at the opponent's draws or set cards. */
  observe(ev: Obj): void {
    if (g(ev, "ev") !== "msg") return;
    const t = g(ev, "type");
    if (t === "NEW_TURN") {
      this._new_turn();
      this.attack = null;
    } else if (t === "NEW_PHASE") {
      this.attack = null;
      this.opp_summon = null;
    } else if (t === "HINT") {
      if (g(ev, "hint_type") === 3 && g(ev, "player") === this.me) this.hint = g(ev, "hint", 0);
    } else if (t === "ATTACK") {
      this.attack = [g(ev, "card"), g(ev, "target")];
    } else if (t === "BATTLE" || t === "ATTACK_DISABLED" || t === "DAMAGE_STEP_END") {
      this.attack = null;
    } else if (t === "SUMMONING" || t === "SPSUMMONING" || t === "FLIPSUMMONING") {
      if (g(ev, "controller") !== this.me) {
        this.opp_summon = [g(ev, "code"), g(ev, "controller"), g(ev, "sequence")];
        this.seen_opp.add(g(ev, "code"));
      }
    } else if (t === "CHAINING") {
      this.chain.push([g(ev, "controller"), g(ev, "code"), g(ev, "location")]);
      if (g(ev, "controller") !== this.me) this.seen_opp.add(g(ev, "code"));
    } else if (t === "CHAIN_END") {
      this.chain = [];
    }
  }

  /** Response for a duelcore select event (brain mode, with `view`). null = no rule: let the bot decide (auto). */
  choose(sel: Obj): BrainResponse | null {
    if (g(sel, "turn") !== this.turn) {
      this.turn = g(sel, "turn");
      this._new_turn();
    }
    const t: any = g(sel, "type");
    const b = new Board(sel, this.me, this.db, this.p);
    this.stats.add(t);
    const fn = HANDLERS[String(or(t, "")).toLowerCase()];
    if (fn === undefined) {
      this.stats.add("sin_regla");
      return null;
    }
    return fn.call(this, sel, b);
  }

  private _blocked(code: any): boolean {
    if (NPC_RITUALES) return false;
    const ci = this.db.get(code);
    return !!(ci && ci.is_spell && (ci.type & TYPE_RITUAL || ci.has("ritual")));
  }

  private _torpe(k = 1.0): boolean {
    return this.p.torpeza > 0 && this.rng.random() < this.p.torpeza * k;
  }

  private _es_boost(ci: Card): boolean {
    return !ci.is_monster && !ci.any(TAGS_NO_BOOST) && (ci.has("boost") || (ci.type & TYPE_EQUIP) !== 0);
  }

  private _objetivo_propio(b: Board): boolean {
    return b.my_m.some(([, m]) => face_up(g(m, "position")) && !b.borrowed(m));
  }

  private _temporal_compensa(b: Board): boolean {
    if (!b.my_turn || (b.phase !== PH_M1 && b.phase !== PH_BATTLE_START)) return false;
    const mons = b.removed[0].filter(truthy).map((c) => this.db.get(c)).filter((ci): ci is Card => !!ci && ci.is_monster);
    const n = Math.min(mons.length, b.my_free_m);
    if (n < 2) return false;
    const atks = mons.map((ci) => ci.atk).sort((x, y) => y - x).slice(0, n);
    const lp = b.lp[this.me], cost = Math.floor((b.lp[this.me] + 1) / 2);
    if (!b.op_m.length) {
      const gain = atks.reduce((s, x) => s + x, 0);
      return gain >= b.lp[b.op] || (gain > cost && lp - cost > 1000);
    }
    let gain = 0;
    const left = [...atks];
    for (const [, t] of sortBy(b.op_m, (x) => -b.mon_value(x[1]))) {
      if (!face_up(g(t, "position"))) continue;
      const need = in_attack(g(t, "position")) ? b.mon_atk(t) : b.mon_def(t);
      const win = left.filter((a) => a > need);
      if (win.length) {
        left.splice(left.indexOf(pyMin(win)), 1);
        gain += b.mon_value(t);
      }
    }
    return gain > cost && lp - cost > 1000;
  }

  private _jugada_mala(ci: Card, b: Board): boolean {
    if (ci.is_monster) return false;
    if (this._es_boost(ci) && !this._objetivo_propio(b)) return true;
    if (ci.has("negate")) return false;
    if (ci.has("pay_half") && b.lp[this.me] < 2000) return true;
    if (ci.descTemporal) return !this._temporal_compensa(b);
    return false;
  }

  private _act_mala(c: Obj, b: Board): boolean {
    const ci = this.db.get(g(c, "code"));
    return !!(ci && this._jugada_mala(ci, b));
  }

  private _cap(key: any[], n = 1): boolean {
    if (this.used.get(key) >= n) return false;
    this.used.add(key);
    return true;
  }

  // ======================= main phase =======================
  _select_idlecmd(sel: Obj, b: Board): BrainResponse | null {
    this.idle_n += 1;
    this.attack_plan = null;
    this.opp_summon = null;
    const tired = this.idle_n > this.p.acciones_por_turno;
    const acts: Obj[] = g(sel, "activates", []);
    if (!tired) {
      if (this._torpe(0.5)) {
        const opts: [string, number][] = [];
        for (const i of range(g(sel, "summons", []).length)) opts.push(["SELECT_SUMMON", i]);
        for (const i of range(g(sel, "monster_sets", []).length)) opts.push(["SELECT_MONSTER_SET", i]);
        for (const i of range(g(sel, "spell_sets", []).length)) opts.push(["SELECT_SPELL_SET", i]);
        acts.forEach((c, i) => {
          if (g(c, "location") === LOC_HAND && !this._blocked(c.code) && !this._act_mala(c, b) && this.used.get(actKey(c)) < 1)
            opts.push(["SELECT_ACTIVATE", i]);
        });
        if (opts.length) {
          const [a, i] = this.rng.choice(opts);
          this.stats.add("torpeza");
          if (a === "SELECT_ACTIVATE") {
            const c = acts[i];
            this.used.add(actKey(c));
            this.last_activated = c.code;
          }
          return R_IDLE(a, i);
        }
      }
      let scored = acts.map((c, i) => [this._score_activation(c, b), i] as [number, number]);
      scored = sortRev(scored.filter(([s]) => s > 0));
      if (scored.length && scored[0][0] >= 100) return this._activate(acts, scored[0][1]);
      const sps: Obj[] = g(sel, "special_summons", []);
      for (let i = 0; i < sps.length; i++) {
        const c = sps[i];
        if (this._cap(["sp", c.code, c.location], 2)) return R_IDLE("SELECT_SPECIAL_SUMMON", i);
      }
      let r = this._summon_choice(sel, b);
      if (r) return r;
      if (scored.length) return this._activate(acts, scored[0][1]);
      r = this._pos_change(sel, b);
      if (r) return r;
      r = this._spell_set(sel, b);
      if (r) return r;
    }
    if (truthy(g(sel, "to_bp")) && !this.bp_done && b.phase === PH_M1 && b.my_m.some(([, c]) => this._could_attack(c, b)))
      return R_IDLE("TO_BP");
    if (truthy(g(sel, "to_ep"))) return R_IDLE("TO_EP");
    if (truthy(g(sel, "to_bp"))) return R_IDLE("TO_BP");
    for (const [a, k] of [["SELECT_SUMMON", "summons"], ["SELECT_MONSTER_SET", "monster_sets"], ["SELECT_ACTIVATE", "activates"],
      ["SELECT_SPELL_SET", "spell_sets"], ["SELECT_POS_CHANGE", "pos_changes"], ["SELECT_SPECIAL_SUMMON", "special_summons"]]) {
      if (truthy(g(sel, k))) return R_IDLE(a, 0);
    }
    return null;
  }

  private _activate(acts: Obj[], i: number) {
    const c = acts[i];
    this.used.add(actKey(c));
    this.last_activated = c.code;
    this.stats.add("activa");
    return R_IDLE("SELECT_ACTIVATE", i);
  }

  private _could_attack(c: Obj, _b: Board): boolean {
    return in_attack(g(c, "position")) && face_up(g(c, "position"));
  }

  private _score_activation(c: Obj, b: Board): number {
    if (this.used.get(actKey(c)) >= (c.location === LOC_HAND ? 2 : 1)) return 0;
    const ci = this.db.get(c.code);
    if (ci === undefined) return 10;
    return this._card_use_score(ci, c, b, false);
  }

  private _card_use_score(ci: Card, c: Obj, b: Board, chain: boolean): number {
    const p = this.p;
    const loc = g(c, "location", 0);
    const isMonsterEffect = ci.is_monster && [LOC_MZONE, LOC_HAND, LOC_GRAVE, LOC_REMOVED, LOC_EXTRA].includes(loc);
    const op_n = b.op_m.length, my_n = b.my_m.length;
    const need_kill = op_n > 0 && (b.op_threat >= b.my_best || op_n >= 2);
    if (isMonsterEffect) return 45;
    if (this._jugada_mala(ci, b)) return 0;
    if (ci.descTemporal) return chain ? 0 : 90;
    if (ci.is_spell && (ci.type & TYPE_RITUAL || ci.has("ritual"))) return chain || !NPC_RITUALES ? 0 : 95;
    if (ci.has("draw") && ci.is_spell && !ci.any(M_NUKE)) return b.hand.length <= 6 ? 200 : 0;
    if (ci.has("nuke_opp")) return op_n && (p.destruccion_inmediata || need_kill) ? 190 : 0;
    if (ci.has("nuke_all") && !ci.has("on_summon")) {
      const gain = b.side_value(1) - b.side_value(0);
      return op_n && gain > (p.destruccion_inmediata ? 0 : 800) ? 175 : 0;
    }
    if (ci.has("storm_opp")) return b.op_st.length ? 160 : 0;
    if (ci.has("storm_all")) {
      const mine = b.my_st.length - (loc === LOC_SZONE ? 1 : 0);
      return b.op_st.length > mine ? 150 : 0;
    }
    if (ci.has("control")) {
      if (ci.descSwitch) return op_n && my_n && b.op_threat > b.my_best ? 155 : 0;
      return op_n && b.my_free_m ? 160 : 0;
    }
    if (ci.has("revive")) {
      const gb = b.grave_best();
      return b.my_free_m && gb >= Math.max(1500, b.my_best) ? 140 : (b.my_free_m && gb >= 1000 ? 20 : 0);
    }
    if (ci.any(M_DESTROY_BOUNCE) && !ci.any(M_ATK_SUM) && !ci.is_monster) {
      if (ci.type & TYPE_EQUIP) return op_n ? 50 : 0;
      return op_n && (p.destruccion_inmediata || need_kill) ? 150 : 0;
    }
    if (ci.has("destroy_any"))
      return (op_n || b.op_st.length) && (p.destruccion_inmediata || need_kill || b.op_st.length >= 2) ? 140 : 0;
    if (ci.has("destroy_st") && !ci.any(M_ATK_SUM)) {
      if (!b.op_st.length) return 0;
      if (p.destruccion_inmediata || b.op_st.length >= 2 || (chain && !b.my_turn && b.phase === PH_END)) return 140;
      return 0;
    }
    if (ci.has("stall") && !ci.has("on_attack")) {
      if (op_n && b.op_threat > b.my_best) return 130;
      return !p.guarda_trampas ? 15 : 0;
    }
    if (ci.has("burn") && !ci.has("on_attack")) return 120;
    if (ci.has("heal")) return b.lp[this.me] < p.curar_por_debajo ? 110 : (b.hand.length >= 6 ? 25 : 0);
    if (ci.has("search")) return 105;
    if (ci.has("fusion") && ci.is_spell) return 95;
    if (ci.any(M_BOOST_WEAKEN) || ci.type & TYPE_EQUIP) {
      if (ci.has("weaken") && !ci.has("boost")) return op_n ? 60 : 0;
      return b.my_m.some(([, m]) => face_up(g(m, "position")) && !b.borrowed(m)) ? 60 : 0;
    }
    if (ci.any(M_REACTIVE)) return 0;
    if (ci.type & TYPE_FIELD) return 70;
    if (ci.is_trap) return p.guarda_trampas ? 0 : 30;
    return 30;
  }

  // --- summoning ---
  private _summon_choice(sel: Obj, b: Board): BrainResponse | null {
    let best: [number, string, number] | null = null;
    const weakest = b.my_m.map(([, c]) => b.mon_value(c)).sort((x, y) => x - y);
    const op_threat = b.op_threat;
    for (const [act, key] of [["SELECT_SUMMON", "summons"], ["SELECT_MONSTER_SET", "monster_sets"]]) {
      const list: Obj[] = g(sel, key, []);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const ci = this.db.get(c.code);
        if (ci === undefined) continue;
        const trib = g(c, "location") === LOC_HAND ? ci.tributes() : 0;
        if (trib > this.p.max_tributos) continue;
        const trib_val = trib <= weakest.length ? weakest.slice(0, trib).reduce((s, x) => s + x, 0) : 0;
        const atk = ci.atk, df = ci.deff;
        if (trib && atk <= trib_val + 300) continue;
        let score: number;
        if (act === "SELECT_SUMMON") {
          score = atk - trib_val;
          const kills = b.op_m.filter(([, t]) => face_up(g(t, "position")) &&
            ((in_attack(g(t, "position")) && atk > b.mon_atk(t)) || (!in_attack(g(t, "position")) && atk > b.mon_def(t))))
            .map(([, t]) => b.mon_value(t));
          const can_battle = b.phase === PH_M1 && truthy(g(sel, "to_bp"));
          if (!b.op_m.length || atk > op_threat) score += 500;
          else if (can_battle && kills.length) score += Math.floor(pyMax(kills) / 2) - 200;
          else if (atk < op_threat && this.p.coloca_boca_abajo) score -= 1200;
          if (ci.is_flip) score -= 1000;
        } else {
          if (!this.p.coloca_boca_abajo) {
            score = df * 0.3 - trib_val - 1500;
          } else {
            score = df - trib_val - 0.5 * Math.max(0, atk - df) - 200;
            if (df > op_threat) score += 400;
            if (ci.is_flip) score += 800;
            if (!b.op_m.length && atk >= 1000) score -= 700;
          }
        }
        if (best === null || score > best[0]) best = [score, act, i];
      }
    }
    if (best === null) return null;
    if (this._torpe(0.3)) {
      this.stats.add("torpeza");
      return null;
    }
    return R_IDLE(best[1], best[2]);
  }

  private _pos_change(sel: Obj, b: Board): BrainResponse | null {
    const before_battle = b.phase === PH_M1 && truthy(g(sel, "to_bp")) && !this.bp_done;
    const list: Obj[] = g(sel, "pos_changes", []);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const m = g(c, "location") === LOC_MZONE ? b.mon_at(this.me, g(c, "sequence", -1)) : null;
      if (!truthy(m)) continue;
      const pos = g(m, "position", 0);
      const ci = this.db.get(c.code);
      const atk = b.mon_atk(m);
      const df = b.mon_def(m);
      if (!this._cap(["pos", c.code, c.sequence])) continue;
      if (before_battle && !in_attack(pos)) {
        if ((!b.op_m.length && atk >= 500) || atk > b.op_threat || (ci && ci.is_flip && !face_up(pos))) return R_IDLE("SELECT_POS_CHANGE", i);
      } else if (!before_battle && in_attack(pos) && face_up(pos)) {
        if (b.op_m.length && atk < b.op_threat && df >= atk - 200) return R_IDLE("SELECT_POS_CHANGE", i);
      }
    }
    return null;
  }

  private _spell_set(sel: Obj, b: Board): BrainResponse | null {
    const list: Obj[] = g(sel, "spell_sets", []);
    for (let i = 0; i < list.length; i++) {
      const ci = this.db.get(list[i].code);
      if (ci === undefined) continue;
      if (ci.is_trap || (ci.type & TYPE_QUICKPLAY && this.p.guarda_trampas)) {
        if (b.my_free_s > (ci.type & TYPE_QUICKPLAY ? 1 : 0)) return R_IDLE("SELECT_SPELL_SET", i);
      } else if (b.phase === PH_M2 && b.hand.length > 6 && b.my_free_s > 1) {
        return R_IDLE("SELECT_SPELL_SET", i);
      }
    }
    return null;
  }

  // ======================= battle =======================
  _select_battlecmd(sel: Obj, b: Board): BrainResponse | null {
    this.bp_done = true;
    this.attacks_n += 1;
    const attacks: Obj[] = g(sel, "attacks", []);
    const leave = truthy(g(sel, "to_m2")) ? R_BATTLE("TO_M2") : R_BATTLE("TO_EP");
    if (!attacks.length || this.attacks_n > 10) return leave;
    if (this._torpe(0.6)) {
      this.stats.add("torpeza");
      this.attack_plan = [0, null];
      return R_BATTLE("SELECT_BATTLE", 0);
    }
    const plan = this._plan_attack(attacks, b);
    if (plan === null) return leave;
    this.attack_plan = plan;
    return R_BATTLE("SELECT_BATTLE", plan[0]);
  }

  private _plan_attack(attacks: Obj[], b: Board): [number, number | null] | null {
    const att: [number, number, Obj][] = [];
    attacks.forEach((a, i) => {
      const m = b.mon_at(this.me, g(a, "sequence", -1));
      const ci = this.db.get(a.code);
      att.push([truthy(m) ? b.mon_atk(m) : (ci ? ci.atk : 0), i, a]);
    });
    const thr = this.p.umbral_ataque, agg = this.p.agresividad;
    const key2 = (x: [number, number, Obj]) => [x[0], x[1]];
    const maxAtt = (xs: [number, number, Obj][]) => xs.reduce((m, x) => (cmp(key2(x), key2(m)) > 0 ? x : m));
    if (!b.op_m.length) {
      const direct = att.filter((x) => truthy(g(x[2], "can_direct")));
      if (direct.length) return [maxAtt(direct)[1], null];
      return [maxAtt(att)[1], null];
    }
    const targets = sortBy(b.op_m, (t) => -b.mon_value(t[1]));
    const attSorted = [...att].sort((x, y) => cmp(key2(x), key2(y)));
    let best: [number, number, number, number] | null = null;
    for (const [seq, t] of targets) {
      const pos = g(t, "position", 0);
      const fd = !face_up(pos);
      for (const [A, i] of attSorted) {
        let ok: boolean, gain: number;
        if (fd) {
          const need = !truthy(g(t, "code")) ? this.p.defensa_boca_abajo : b.mon_def(t);
          const margin = A - need;
          ok = margin > thr + (1 - agg) * 400;
          gain = ok ? 900 : 0;
        } else if (in_attack(pos)) {
          const margin = A - b.mon_atk(t);
          ok = margin > thr || (margin === 0 && agg >= 0.6 && A <= b.mon_atk(t));
          gain = b.mon_atk(t) + Math.max(margin, 0);
        } else {
          const margin = A - b.mon_def(t);
          ok = margin > thr;
          gain = b.mon_value(t);
        }
        if (ok) {
          const cand: [number, number, number, number] = [gain, -A, i, seq];
          if (best === null || cmp(cand, best) > 0) best = cand;
          break;
        }
      }
    }
    if (best) return [best[2], best[3]];
    const direct = att.filter((x) => truthy(g(x[2], "can_direct")));
    if (direct.length) return [maxAtt(direct)[1], null];
    return null;
  }

  // ======================= chains =======================
  _select_chain(sel: Obj, b: Board): BrainResponse | null {
    const selects: Obj[] = g(sel, "selects", []);
    if (!selects.length) return { type: "SELECT_CHAIN", index: null };
    if (truthy(g(sel, "forced"))) return { type: "SELECT_CHAIN", index: 0 };
    const chainKey = (c: Obj) => ["chain", g(c, "code"), g(c, "location"), g(c, "sequence"), g(c, "description", 0)];
    const scored: [number, number][] = [];
    selects.forEach((c, i) => {
      if (this.used.get(chainKey(c)) >= 1) return;
      const s = this._score_chain(c, b);
      if (s > 0) scored.push([s, i]);
    });
    if (this._torpe(0.5)) {
      this.stats.add("torpeza");
      if (scored.length) return { type: "SELECT_CHAIN", index: null };
      const ok = range(selects.length).filter((i) => !this._blocked(g(selects[i], "code")) && !this._act_mala(selects[i], b));
      if (!ok.length) return { type: "SELECT_CHAIN", index: null };
      const i = this.rng.choice(ok);
      this.used.add(chainKey(selects[i]));
      this.last_activated = g(selects[i], "code", 0);
      return { type: "SELECT_CHAIN", index: i };
    }
    if (!scored.length) return { type: "SELECT_CHAIN", index: null };
    const [, i] = tupleMax(scored);
    this.used.add(chainKey(selects[i]));
    this.last_activated = g(selects[i], "code", 0);
    this.stats.add("encadena");
    return { type: "SELECT_CHAIN", index: i };
  }

  private _attack_threat(b: Board): [boolean, number] {
    if (!this.attack) return [false, 0];
    const [card, target] = this.attack;
    if (!truthy(card) || g(card, "controller") === this.me) return [false, 0];
    const a = b.mon_at(g(card, "controller"), g(card, "sequence", -1));
    const A = truthy(a) ? b.mon_atk(a) : 0;
    if (!truthy(target)) return [A > 0, A];
    const m = b.mon_at(g(target, "controller"), g(target, "sequence", -1));
    if (!truthy(m)) return [true, A];
    if (in_attack(g(m, "position"))) return [A >= b.mon_atk(m), A];
    return [A > b.mon_def(m) || !face_up(g(m, "position")), A];
  }

  private _score_chain(c: Obj, b: Board): number {
    const ci = this.db.get(g(c, "code"));
    if (ci === undefined) return 0;
    const p = this.p;
    const last = this.chain.length ? this.chain[this.chain.length - 1] : null;
    if (last && last[0] === this.me) return 0;
    if (this._jugada_mala(ci, b)) return 0;
    const [threat] = this._attack_threat(b);
    const opp_link = last && last[0] !== this.me ? last : null;
    const loc = g(c, "location", 0);

    if (ci.has("negate")) {
      if (ci.has("pay_half") && b.lp[this.me] < 2000) return 0;
      if (opp_link) {
        const oc = this.db.get(opp_link[1]);
        if (oc && oc.any(HARMFUL_TAGS) && !oc.is_monster) {
          const big = oc.any(M_BIG);
          if (ci.has("pay_half") && !big && b.lp[this.me] < 6000) return 0;
          return 150;
        }
        return p.guarda_trampas ? 0 : 40;
      }
      if (this.opp_summon) {
        const sc = this.db.get(this.opp_summon[0]);
        const need = ci.has("pay_half") ? 2400 : 1900;
        if (ci.has("pay_half") && b.lp[this.me] < 3000) return 0;
        if (sc && (sc.atk >= Math.max(need, b.my_best + 1) || !p.guarda_trampas)) return 120;
      }
      return 0;
    }
    if (ci.has("on_attack")) {
      if (this.attack && truthy(this.attack[0]) && g(this.attack[0], "controller") !== this.me) {
        if (threat || !p.guarda_trampas) {
          const n_atk = b.op_m.filter(([, m]) => in_attack(g(m, "position")) && face_up(g(m, "position"))).length;
          return 140 + 10 * n_atk;
        }
      }
      return 0;
    }
    if (ci.has("on_summon")) {
      if (this.opp_summon) {
        const sc = this.db.get(this.opp_summon[0]);
        const strong = sc && (sc.atk >= Math.max(1500, b.my_best) || sc.atk >= 2000);
        if (ci.has("nuke_all")) return b.side_value(1) >= b.side_value(0) + (!p.guarda_trampas ? 0 : 500) ? 130 : 0;
        if (strong || !p.guarda_trampas) return 130;
      }
      return 0;
    }
    if (ci.is_monster) return 50;
    if (opp_link && loc === LOC_SZONE) {
      const oc = this.db.get(opp_link[1]);
      if (oc && oc.any(M_STORMS)) {
        if (ci.has("destroy_st") && b.op_st.length) return 140;
        if (!ci.any(M_REACTIVE)) {
          const base = this._card_use_score(ci, c, b, true);
          if (base > 0) return Math.max(base, 80);
        }
      }
    }
    if (ci.has("revive") && ci.is_trap) {
      const gb = b.grave_best();
      const good = b.my_free_m && gb >= Math.max(1500, b.my_best);
      const when = !p.guarda_trampas || (!b.my_turn && b.phase === PH_END) || threat || (b.my_turn && (b.phase === PH_M1 || b.phase === PH_STANDBY));
      return good && when ? 110 : 0;
    }
    if (ci.has("weaken") && threat) return 100;
    if (ci.has("stall") && threat) return 100;
    if (threat && ci.type & TYPE_QUICKPLAY && ci.descToken) return 90;
    const base = this._card_use_score(ci, c, b, true);
    if (base <= 0) {
      if (threat && ci.is_trap && !ci.has("boost")) return 60;
      return 0;
    }
    if (p.guarda_trampas && ci.is_trap && base < 100) return threat || (!b.my_turn && b.phase === PH_END) ? base : 0;
    if (b.my_turn && ci.type & TYPE_QUICKPLAY && loc === LOC_HAND && base < 100) return 0;
    return base;
  }

  // ======================= yes/no, options =======================
  _select_effectyn(sel: Obj, _b: Board) {
    return { type: "SELECT_EFFECTYN", yes: this._cap(["yn", g(sel, "code"), g(sel, "description", 0)], 6) };
  }

  _select_yesno(sel: Obj, _b: Board) {
    return { type: "SELECT_YESNO", yes: this._cap(["yesno", g(sel, "description", 0)], 6) };
  }

  _select_option(sel: Obj, _b: Board) {
    const texts = (g(sel, "options_text", []) as any[]).map((t) => String(or(t, "")).toLowerCase());
    const opts: any[] = g(sel, "options", []);
    const n = opts.length || texts.length || 1;
    for (const kw of ["destroy", "draw", "inflict", "special summon", "add", "gain"]) {
      for (let i = 0; i < texts.length; i++) if (texts[i].includes(kw) && i < n) return { type: "SELECT_OPTION", index: i };
    }
    return { type: "SELECT_OPTION", index: 0 };
  }

  // ======================= cards =======================
  private _card_value(s: Obj, b: Board): number {
    const code = g(s, "code", 0), loc = g(s, "location", 0);
    if (loc === LOC_MZONE) {
      const m = b.mon_at(g(s, "controller"), g(s, "sequence", -1));
      if (truthy(m)) return b.mon_value(m);
    }
    const ci = this.db.get(code);
    if (ci === undefined) return loc !== LOC_MZONE ? 1000 : b.fd_guess;
    if (ci.is_monster) {
      let v = Math.max(ci.atk, Math.trunc(ci.deff * 0.8), 300) + (ci.type & TYPE_EFFECT ? 150 : 0);
      if (loc === LOC_HAND && ci.tributes() > b.my_m.length) v -= 600;
      return v;
    }
    if (ci.any(M_V2800)) return 2800;
    if (ci.any(M_V2200)) return 2200;
    if (ci.is_trap) return 1500;
    return 1100;
  }

  private _intent_bad(selects: Obj[], _b: Board): boolean {
    const h = this.hint;
    if (HINTS_MALO.has(h)) return true;
    if (HINTS_BUENO.has(h)) return false;
    if (h === H_TOGRAVE) return selects.some((s) => [LOC_MZONE, LOC_SZONE, LOC_HAND].includes(g(s, "location")));
    const ci = this.db.get(this.last_activated);
    if (ci && (ci.any(M_GOOD_INTENT) || this._es_boost(ci)) && !ci.any(M_GOOD_EXCEPT)) return false;
    if (ci && ci.any(M_BAD_INTENT)) return true;
    return selects.some((s) => g(s, "controller") !== this.me);
  }

  private _rank(selects: Obj[], b: Board, bad: boolean): number[] {
    const out: [number, number][] = selects.map((s, i) => {
      const v = this._card_value(s, b);
      const mine = g(s, "controller") === this.me;
      return [bad ? (mine ? -v : v) : (mine ? v : -v), i];
    });
    return sortRev(out).map(([, i]) => i);
  }

  _select_card(sel: Obj, b: Board) {
    const selects: Obj[] = g(sel, "selects", []);
    if (!selects.length) return { type: "SELECT_CARD", indicies: null };
    const lo = g(sel, "min", 1), hi = g(sel, "max", 1);
    let n = Math.max(1, lo);
    n = Math.min(n, hi, selects.length);
    if (this.hint === H_ATTACKTARGET && this.attack_plan && this.attack_plan[1] !== null) {
      for (let i = 0; i < selects.length; i++) {
        const s = selects[i];
        if (g(s, "controller") !== this.me && g(s, "sequence") === this.attack_plan[1] && g(s, "location") === LOC_MZONE) {
          const order = [i, ...this._rank(selects, b, true).filter((j) => j !== i)];
          return { type: "SELECT_CARD", indicies: order.slice(0, n) };
        }
      }
    }
    if (this.hint === H_ATTACKTARGET) {
      const order = sortBy(range(selects.length), (i) => this._card_value(selects[i], b));
      return { type: "SELECT_CARD", indicies: order.slice(0, n) };
    }
    const order = this._rank(selects, b, this._intent_bad(selects, b));
    return { type: "SELECT_CARD", indicies: order.slice(0, n) };
  }

  _select_tribute(sel: Obj, b: Board) {
    const selects: Obj[] = g(sel, "selects", []);
    const lo = g(sel, "min", 1);
    const order = this._rank(selects, b, true);
    const out: number[] = [];
    let total = 0;
    for (const i of order) {
      if (total >= lo) break;
      out.push(i);
      total += or(g(selects[i], "release_param", 1), 1);
    }
    return { type: "SELECT_TRIBUTE", indicies: out };
  }

  _select_unselect_card(sel: Obj, b: Board) {
    const sc: Obj[] = g(sel, "select_cards", []);
    if (truthy(g(sel, "can_finish")) || !sc.length) {
      if (truthy(g(sel, "can_finish")) || !truthy(g(sel, "unselect_cards"))) return { type: "SELECT_UNSELECT_CARD", index: null };
      return { type: "SELECT_UNSELECT_CARD", index: sc.length };
    }
    const order = this._rank(sc, b, this._intent_bad(sc, b));
    return { type: "SELECT_UNSELECT_CARD", index: order[0] };
  }

  _select_sum(sel: Obj, b: Board) {
    const must: Obj[] = g(sel, "selects_must", []);
    const selects: Obj[] = g(sel, "selects", []);
    const target = g(sel, "amount", 0);
    const amt = (s: Obj) => g(s, "amount", 0);
    const vals = selects.map((s) => [amt(s) % 0x10000, Math.floor(amt(s) / 0x10000)].filter((v) => v > 0));
    let base = 0;
    for (const s of must) base += amt(s) % 0x10000;
    const order = sortBy(range(selects.length), (i) => (g(selects[i], "controller") === this.me ? this._card_value(selects[i], b) : -1));
    const at_least = truthy(g(sel, "select_max"));
    const path: number[] = [];
    const dfs = (k: number, total: number): boolean => {
      if (total === target && (path.length || must.length)) return true;
      if (at_least && total >= target && path.length) {
        const low = pyMin([...path.map((i) => vals[i][0]), ...must.map((s) => amt(s) % 0x10000)]);
        return total - low < target;
      }
      if (k >= order.length || (total > target && !at_least)) return false;
      const i = order[k];
      for (const v of vals[i]) {
        path.push(i);
        if (dfs(k + 1, total + v)) return true;
        path.pop();
      }
      return dfs(k + 1, total);
    };
    if (!dfs(0, base)) return null;
    return { type: "SELECT_SUM", indicies: [...range(must.length), ...path.map((i) => i + must.length)] };
  }

  _select_counter(sel: Obj, _b: Board) {
    let left = g(sel, "count", 0);
    const out: number[] = [];
    for (const c of g(sel, "cards", []) as Obj[]) {
      const take = Math.min(g(c, "count", 0), left);
      left -= take;
      out.push(take);
    }
    return { type: "SELECT_COUNTER", counters: out };
  }

  private _places(mask: number, count: number, rival_first: boolean) {
    const out: { player: number; location: number; sequence: number }[] = [];
    for (const side of rival_first ? [1, 0] : [0, 1]) {
      for (const [base, loc] of [[0, LOC_MZONE], [8, LOC_SZONE]]) {
        for (const seq of zoneOrder(8)) {               // centre first, like a player (src/duel/zones.ts)
          if (out.length >= count) return out;
          const bit = side * 16 + base + seq;
          if (Math.floor(mask / 2 ** bit) % 2 === 0) out.push({ player: side === 0 ? this.me : 1 - this.me, location: loc, sequence: seq });
        }
      }
    }
    return out;
  }

  _select_place(sel: Obj, _b: Board) {
    return { type: "SELECT_PLACE", places: this._places(g(sel, "field_mask", 0), g(sel, "count", 1), false) };
  }

  _select_disfield(sel: Obj, _b: Board) {
    return { type: "SELECT_DISFIELD", places: this._places(g(sel, "field_mask", 0), g(sel, "count", 1), true) };
  }

  _select_position(sel: Obj, b: Board) {
    const mask = g(sel, "positions", POS_FU_ATK);
    const ci = this.db.get(g(sel, "code"));
    const [atk, df] = ci ? [ci.atk, ci.deff] : [0, 0];
    let want_atk = !b.op_m.length || atk >= b.op_threat || atk >= 2000 || (atk >= df && atk > b.op_threat - 300);
    if (this._torpe(0.3)) want_atk = !want_atk;
    let order: number[];
    if (want_atk) order = [POS_FU_ATK, POS_FD_ATK, POS_FU_DEF, POS_FD_DEF];
    else if (ci && ci.is_flip && this.p.coloca_boca_abajo) order = [POS_FD_DEF, POS_FU_DEF, POS_FU_ATK, POS_FD_ATK];
    else order = [POS_FU_DEF, POS_FD_DEF, POS_FU_ATK, POS_FD_ATK];
    const pos = order.find((x) => (mask & x) !== 0) ?? POS_FU_ATK;
    return { type: "SELECT_POSITION", position: pos };
  }

  _sort_card(_sel: Obj, _b: Board) { return { type: "SORT_CARD", order: null }; }

  _rock_paper_scissors(_sel: Obj, _b: Board) { return { type: "ROCK_PAPER_SCISSORS", value: this.rng.randint(1, 3) }; }

  private _seen_cards(): Card[] {
    return this.seen_opp.mostCommon().map(([c]) => this.db.get(c)).filter((c): c is Card => !!c);
  }

  _announce_race(sel: Obj, _b: Board) {
    const avail = Math.trunc(Number(g(sel, "available", 0))), count = g(sel, "count", 1);
    const cnt = new Counter<number>();
    for (const c of this._seen_cards()) if (c.is_monster) cnt.add(c.race);
    const bits = range(32).filter((k) => Math.floor(avail / 2 ** k) % 2 === 1).map((k) => 2 ** k);
    return { type: "ANNOUNCE_RACE", races: sortBy(bits, (x) => -cnt.get(x)).slice(0, count) };
  }

  _announce_attrib(sel: Obj, _b: Board) {
    const avail = Math.trunc(Number(g(sel, "available", 0))), count = g(sel, "count", 1);
    const cnt = new Counter<number>();
    for (const c of this._seen_cards()) if (c.is_monster) cnt.add(c.attribute);
    const bits = range(16).filter((k) => Math.floor(avail / 2 ** k) % 2 === 1).map((k) => 2 ** k);
    return { type: "ANNOUNCE_ATTRIB", attributes: sortBy(bits, (x) => -cnt.get(x)).slice(0, count) };
  }

  _announce_number(sel: Obj, b: Board) {
    const opts = (g(sel, "options", []) as any[]).map((x) => Math.trunc(Number(x)));
    if (!opts.length) return { type: "ANNOUNCE_NUMBER", value: 0 };
    if (pyMax(opts) <= 12) {
      const lv = new Counter<number>();
      for (const c of this._seen_cards()) if (c.is_monster) lv.add(c.level);
      for (const [lvl] of lv.mostCommon()) if (opts.includes(lvl)) return { type: "ANNOUNCE_NUMBER", value: pyIndex(opts, lvl) };
    }
    if (pyMin(opts) >= 1000) {
      const need = b.op_threat;
      const ok = opts.filter((o) => o >= need && o < b.lp[this.me] - 1000);
      const pick = ok.length ? pyMin(ok) : pyMin(opts);
      return { type: "ANNOUNCE_NUMBER", value: pyIndex(opts, pick) };
    }
    return { type: "ANNOUNCE_NUMBER", value: 0 };
  }

  _announce_card(sel: Obj, _b: Board) {
    const ops = (g(sel, "opcodes", []) as any[]).map(toBigInt);
    for (const c of this._seen_cards()) if (declarable(c, ops)) return { type: "ANNOUNCE_CARD", card: c.code };
    for (const c of this.db.cards.values()) if (declarable(c, ops)) return { type: "ANNOUNCE_CARD", card: c.code };
    return null;
  }
}

type Handler = (this: NpcBrain, sel: Obj, b: Board) => BrainResponse | null;
const P = NpcBrain.prototype as unknown as Record<string, Handler>;
/** py getattr(self, "_" + type.lower()): the select types the brain answers. */
const HANDLERS: Record<string, Handler> = Object.assign(Object.create(null), {
  select_idlecmd: P._select_idlecmd, select_battlecmd: P._select_battlecmd, select_chain: P._select_chain,
  select_effectyn: P._select_effectyn, select_yesno: P._select_yesno, select_option: P._select_option,
  select_card: P._select_card, select_tribute: P._select_tribute, select_unselect_card: P._select_unselect_card,
  select_sum: P._select_sum, select_counter: P._select_counter, select_place: P._select_place,
  select_disfield: P._select_disfield, select_position: P._select_position, sort_card: P._sort_card,
  sort_chain: P._sort_card, rock_paper_scissors: P._rock_paper_scissors, announce_race: P._announce_race,
  announce_attrib: P._announce_attrib, announce_number: P._announce_number, announce_card: P._announce_card,
});
