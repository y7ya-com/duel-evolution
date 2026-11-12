// The NPC card rules as data (rules.json, plus the live overlay an admin pushes: ruleSet.ts). A rule is the JSON form of
// a CardRule (cardRules.ts): per field, an expression over the board the player reads (RuleCtx), compiled here into the
// same functions. Validation is strict: an unknown field, name or operator, a wrong type, or a rule too big is an
// error and the whole set is refused, so a bad rule never reaches a duel. A compiled expression never throws.
//
// A rule (every field optional):
//   idleActivate, battleActivate, chainReact, yesNo, specialSummon, doomed: a condition (true / false: always / never)
//   idlePriority, chainPriority: a number;  keepInHand: true / false
//   summonScore, option: a number expression (option: the index of the card's option to take)
//   number: { "cover": <number expression>, "keep": <number> }: the smallest value offered at least `cover` that
//     leaves `keep` LP, else the largest that leaves it (else the first)
//
// An expression is a number, true / false, a name, or an operator object with one key:
//   names: the RuleCtx fields (myLp, oppLp, myMaxAtk, oppMaxAtk, myBackrow, oppBackrow, myGraveMaxAtk, oppGraveMaxAtk,
//     oppHand, myHand, myHandTributes, myRemoved, attackAtk: numbers; myTurn, oppEndPhase, attackLethal, attackOnDefense,
//     oppChained: true / false), and the helpers realThreat, worthwhileWipe, worthwhileStorm, lastWindow, outgunned
//     (true / false), oppTopAtk (the opponent's strongest face-up ATK, any position)
//     and the board facts of cardRules.ts EXT_NUM / EXT_BOOL (myDeck, chainLen, boardEdge, preBattle, oppChainThreat...)
//   inside a "where" / "of" (one monster): atk, def, level, faceDown, attackPos, fusion, chainHit, and the names above
//   pick: { "score": <number>, "min": <number> }: the card's picks (targets, costs, searches, revivals, discards): each
//     offered card scored (higher first; under min: not taken unless the prompt needs it). Inside score, the card:
//     the monster names above, plus mine, onField, inHand, inGrave, inDeck, inExtra, banished, isMonster, isSpell,
//     isTrap, copyInHand (another copy is in my hand) (true / false) and {"is": "card name"} (its name starts with this,
//     lowercase)
//   {"all": [...]} {"any": [...]} {"not": x}
//   {">=": [a, b]} {">": [a, b]} {"<=": [a, b]} {"<": [a, b]} {"==": [a, b]} {"!=": [a, b]}
//   {"+": [...]} {"*": [...]} {"-": [a, b]} {"/": [a, b]} (x / 0 = 0) {"max": [...]} {"min": [...]} {"floor": x}
//   {"if": [cond, a, b]}
//   {"count": "myMon" | "oppMon", "where": cond}   how many of those monsters (where: optional)
//   {"sum": "myMon" | "oppMon", "of": num, "where": cond}   {"maxOf": ...} the same (0 for none)
//   {"attacked": n}   an attack on me with ATK >= n, or one that ends the duel
//   {"canPay": n}     my LP is over n + 1000
//   {"named": "gaia the fierce knight"}   one of my face-up monsters' names starts with this (lowercase)
//   {"inMyHand": name} {"inMyDeck": name} {"onMyField": name} {"inMyGrave": name}   how many of my cards there have a
//     name starting with this (the deck: my deck list less every copy seen); {"fieldSpellIs": name} a face-up Field
//     Spell (either side) is it
//   inside pick.score also: canAttack, alreadyHave, copyOnField (true / false), worth (a number)
//   ownTurn: true   the card's chainReact is asked on my own turn too (not only as a negation)
//
// Example: { "premature burial": { "idleActivate": { "all": [{ ">=": ["myGraveMaxAtk", 1700] },
//   { ">=": ["myGraveMaxAtk", "oppMaxAtk"] }, { "canPay": 800 }] }, "idlePriority": 90 } }
import type { CardRule, RuleCard, RuleCtx, RuleMon } from "./cardRules.ts";
import { EXT_BOOL, EXT_NUM } from "./ruleCtxExt.ts";

export type Expr = number | boolean | string | { [op: string]: unknown };
export type RuleJson = Partial<Record<keyof CardRule, unknown>>;
/** A whole rule set: the staples every NPC uses, and per-NPC rules (by NPC id): an NPC's rule for a card replaces the
 *  staple for that card whole. */
export interface RuleSetJson { staples?: Record<string, RuleJson | null>; npcs?: Record<string, Record<string, RuleJson | null>> }

type Val = number | boolean;
type Fn = (c: RuleCtx, m?: RuleMon) => Val;

const NUM_FIELDS = ["myLp", "oppLp", "myMaxAtk", "oppMaxAtk", "myBackrow", "oppBackrow", "myGraveMaxAtk", "oppGraveMaxAtk",
  "oppHand", "myHand", "myHandTributes", "myRemoved", "attackAtk"] as const;
const BOOL_FIELDS = ["myTurn", "oppEndPhase", "attackLethal", "attackOnDefense", "oppChained"] as const;
const MON_NUM = ["atk", "def", "level"] as const, MON_BOOL = ["faceDown", "attackPos", "fusion", "chainHit", "blocksLethal"] as const;
const CARD_BOOL = ["mine", "onField", "inHand", "inGrave", "inDeck", "inExtra", "banished", "isMonster", "isSpell", "isTrap", "copyInHand",
  "canAttack", "alreadyHave", "copyOnField"] as const;
const CARD_NUM = ["worth"] as const;

// the helpers of cardRules.ts, as names
const attackers = (m: RuleMon[]): number => m.filter((x) => x.attackPos).length;
const boardValue = (mon: RuleMon[]): number => mon.reduce((sum, m) => sum + 1000 + Math.max(m.atk, m.def) * 0.4, 0);
export const HELPERS = {
  realThreat: (c: RuleCtx): boolean => c.oppMaxAtk >= 1700 || attackers(c.oppMon) >= 2,
  worthwhileWipe: (c: RuleCtx): boolean => c.oppMon.length > 0 && boardValue(c.oppMon) > boardValue(c.myMon),
  worthwhileStorm: (c: RuleCtx): boolean => c.oppBackrow > c.myBackrow,
  lastWindow: (c: RuleCtx): boolean => c.attackAtk > 0 || c.oppEndPhase,
  outgunned: (c: RuleCtx): boolean => c.oppMaxAtk > 0 && c.oppMaxAtk >= c.myMaxAtk,
  oppTopAtk: (c: RuleCtx): number => c.oppMon.reduce((m, x) => (x.faceDown ? m : Math.max(m, x.atk)), 0),
};
const BOOL_HELPERS = ["realThreat", "worthwhileWipe", "worthwhileStorm", "lastWindow", "outgunned"] as const;

const COND_FIELDS = ["idleActivate", "battleActivate", "chainReact", "yesNo", "specialSummon", "doomed"] as const;
const NUM_RULE_FIELDS = ["summonScore", "option"] as const;
const MAX_NODES = 400;          // per expression
const MAX_RULES = 2000;         // per set
const MAX_NAME = 80;

export class RuleError extends Error {}

/** mon: inside a where / of (one monster); card: inside a pick's score (one offered card, a RuleCard). */
interface Scope { mon: boolean; card?: boolean }
type Kind = "num" | "bool";

/** Compiles one expression to a total function, checking its type against `want`. */
function compile(e: unknown, want: Kind, at: string, scope: Scope, budget: { n: number }): Fn {
  if (--budget.n < 0) throw new RuleError(`${at}: expression too big (over ${MAX_NODES} parts)`);
  const kindErr = (got: Kind) => new RuleError(`${at}: a ${got === "num" ? "number" : "true/false"} where a ${want === "num" ? "number" : "true/false"} is needed`);
  if (typeof e === "number") {
    if (!Number.isFinite(e)) throw new RuleError(`${at}: not a finite number`);
    if (want !== "num") throw kindErr("num");
    return () => e;
  }
  if (typeof e === "boolean") {
    if (want !== "bool") throw kindErr("bool");
    return () => e;
  }
  if (typeof e === "string") {
    let kind: Kind, fn: Fn;
    if (scope.card && !scope.mon && (CARD_BOOL as readonly string[]).includes(e)) { kind = "bool"; fn = (_c, m) => (m ? (m as RuleCard)[e as (typeof CARD_BOOL)[number]] === true : false); }
    else if (scope.card && !scope.mon && (CARD_NUM as readonly string[]).includes(e)) { kind = "num"; fn = (_c, m) => (m ? (m as RuleCard)[e as (typeof CARD_NUM)[number]] ?? 0 : 0); }
    else if ((scope.mon || scope.card) && (MON_NUM as readonly string[]).includes(e)) { kind = "num"; fn = (_c, m) => (m ? m[e as "atk"] ?? 0 : 0); }
    else if ((scope.mon || scope.card) && (MON_BOOL as readonly string[]).includes(e)) { kind = "bool"; fn = (_c, m) => (m ? m[e as "faceDown"] === true : false); }
    else if ((EXT_NUM as readonly string[]).includes(e)) { kind = "num"; fn = (c) => c.ext?.[e as (typeof EXT_NUM)[number]] ?? 0; }
    else if ((EXT_BOOL as readonly string[]).includes(e)) { kind = "bool"; fn = (c) => c.ext?.[e as (typeof EXT_BOOL)[number]] === true; }
    else if ((NUM_FIELDS as readonly string[]).includes(e)) { kind = "num"; fn = (c) => c[e as "myLp"]; }
    else if ((BOOL_FIELDS as readonly string[]).includes(e)) { kind = "bool"; fn = (c) => c[e as "myTurn"]; }
    else if ((BOOL_HELPERS as readonly string[]).includes(e)) { kind = "bool"; const h = HELPERS[e as "realThreat"]; fn = (c) => h(c); }
    else if (e === "oppTopAtk") { kind = "num"; fn = (c) => HELPERS.oppTopAtk(c); }
    else throw new RuleError(`${at}: unknown name "${e}"${scope.mon ? "" : (MON_NUM as readonly string[]).concat(MON_BOOL).includes(e) ? " (a monster's own field: only inside where / of)" : ""}`);
    if (kind !== want) throw kindErr(kind);
    return fn;
  }
  if (!e || typeof e !== "object" || Array.isArray(e)) throw new RuleError(`${at}: not an expression`);
  const keys = Object.keys(e);
  const op = keys[0]!;
  const arg = (e as Record<string, unknown>)[op];
  const list = (min: number, max = Infinity): unknown[] => {
    if (!Array.isArray(arg) || arg.length < min || arg.length > max) throw new RuleError(`${at}: "${op}" takes a list of ${min}${max === Infinity ? " or more" : max === min ? "" : `-${max}`}`);
    return arg;
  };
  const only = (...allowed: string[]) => { for (const k of keys) if (!allowed.includes(k)) throw new RuleError(`${at}: "${op}" does not take "${k}"`); };
  const sub = (x: unknown, k: Kind, i: number | string, s = scope) => compile(x, k, `${at}.${op}[${i}]`, s, budget);
  const result = (kind: Kind, fn: Fn): Fn => { if (kind !== want) throw kindErr(kind); return fn; };
  switch (op) {
    case "all": case "any": {
      only(op);
      const fs = list(1).map((x, i) => sub(x, "bool", i));
      return result("bool", op === "all" ? (c, m) => fs.every((f) => f(c, m) === true) : (c, m) => fs.some((f) => f(c, m) === true));
    }
    case "not": { only(op); const f = sub(arg, "bool", 0); return result("bool", (c, m) => !f(c, m)); }
    case ">=": case ">": case "<=": case "<": case "==": case "!=": {
      only(op);
      const [a, b] = list(2, 2).map((x, i) => sub(x, "num", i)) as [Fn, Fn];
      const cmp: Record<string, (x: number, y: number) => boolean> = { ">=": (x, y) => x >= y, ">": (x, y) => x > y, "<=": (x, y) => x <= y, "<": (x, y) => x < y, "==": (x, y) => x === y, "!=": (x, y) => x !== y };
      const f = cmp[op]!;
      return result("bool", (c, m) => f(a(c, m) as number, b(c, m) as number));
    }
    case "+": case "*": case "max": case "min": {
      only(op);
      const fs = list(1).map((x, i) => sub(x, "num", i));
      const red: Record<string, (x: number, y: number) => number> = { "+": (x, y) => x + y, "*": (x, y) => x * y, max: (x, y) => Math.max(x, y), min: (x, y) => Math.min(x, y) };
      const r = red[op]!;
      return result("num", (c, m) => fs.map((f) => f(c, m) as number).reduce((x, y) => r(x, y)));
    }
    case "-": case "/": {
      only(op);
      const [a, b] = list(2, 2).map((x, i) => sub(x, "num", i)) as [Fn, Fn];
      return result("num", op === "-" ? (c, m) => (a(c, m) as number) - (b(c, m) as number)
        : (c, m) => { const d = b(c, m) as number; return d === 0 ? 0 : (a(c, m) as number) / d; });
    }
    case "floor": { only(op); const f = sub(arg, "num", 0); return result("num", (c, m) => Math.floor(f(c, m) as number)); }
    case "if": {
      only(op);
      const [x, y, z] = list(3, 3);
      const k = want;
      const cond = sub(x, "bool", 0), a = sub(y, k, 1), b = sub(z, k, 2);
      return (c, m) => (cond(c, m) ? a(c, m) : b(c, m));
    }
    case "count": case "sum": case "maxOf": {
      only(op, "where", "of");
      if (arg !== "myMon" && arg !== "oppMon") throw new RuleError(`${at}: "${op}" counts "myMon" or "oppMon"`);
      if (scope.mon) throw new RuleError(`${at}: "${op}" inside another where / of`);
      const inMon = { mon: true };
      const w = "where" in e ? compile((e as Record<string, unknown>).where, "bool", `${at}.where`, inMon, budget) : null;
      if (op === "count") {
        if ("of" in e) throw new RuleError(`${at}: "count" does not take "of"`);
        return result("num", (c) => c[arg].filter((mm) => !w || w(c, mm) === true).length);
      }
      if (!("of" in e)) throw new RuleError(`${at}: "${op}" needs "of" (what to add up)`);
      const of = compile((e as Record<string, unknown>).of, "num", `${at}.of`, inMon, budget);
      return result("num", (c) => {
        const vals = c[arg].filter((mm) => !w || w(c, mm) === true).map((mm) => of(c, mm) as number);
        return op === "sum" ? vals.reduce((s, v) => s + v, 0) : vals.reduce((s, v) => Math.max(s, v), 0);
      });
    }
    case "attacked": case "canPay": {
      only(op);
      const f = sub(arg, "num", 0);
      return result("bool", op === "attacked"
        ? (c, m) => c.attackAtk >= (f(c, m) as number) || c.attackLethal
        : (c, m) => c.myLp > (f(c, m) as number) + 1000);
    }
    case "is": {
      only(op);
      if (!scope.card || scope.mon) throw new RuleError(`${at}: "is" names the card a pick scores (only inside pick.score)`);
      if (typeof arg !== "string" || !arg || arg.length > MAX_NAME) throw new RuleError(`${at}: "is" takes a card name`);
      const name = arg.toLowerCase();
      return result("bool", (_c, m) => !!m && (m as RuleCard).name.startsWith(name));
    }
    case "inMyHand": case "inMyDeck": case "onMyField": case "inMyGrave": {
      only(op);
      if (typeof arg !== "string" || !arg || arg.length > MAX_NAME) throw new RuleError(`${at}: "${op}" takes a card name`);
      const name = arg.toLowerCase();
      const zone = ({ inMyHand: "hand", inMyDeck: "deck", onMyField: "field", inMyGrave: "grave" } as const)[op];
      return result("num", (c) => (c.zones?.[zone] ?? []).filter((n) => n.startsWith(name)).length);
    }
    case "fieldSpellIs": {
      only(op);
      if (typeof arg !== "string" || !arg || arg.length > MAX_NAME) throw new RuleError(`${at}: "fieldSpellIs" takes a card name`);
      const name = arg.toLowerCase();
      return result("bool", (c) => (c.zones?.fieldSpells ?? []).some((n) => n.startsWith(name)));
    }
    case "named": {
      only(op);
      if (typeof arg !== "string" || !arg || arg.length > MAX_NAME) throw new RuleError(`${at}: "named" takes a card name`);
      const name = arg.toLowerCase();
      return result("bool", (c) => c.myNames.some((n) => n.startsWith(name)));
    }
    default: throw new RuleError(`${at}: unknown operator "${op}"`);
  }
}

const expr = (e: unknown, want: Kind, at: string): Fn => compile(e, want, at, { mon: false }, { n: MAX_NODES });

/** One card's rule, compiled. */
export function compileRule(r: unknown, at: string): CardRule {
  if (!r || typeof r !== "object" || Array.isArray(r)) throw new RuleError(`${at}: a rule is an object`);
  const out: CardRule = {};
  for (const [k, v] of Object.entries(r)) {
    const where = `${at}.${k}`;
    if ((COND_FIELDS as readonly string[]).includes(k)) {
      const f = expr(v, "bool", where);
      out[k as (typeof COND_FIELDS)[number]] = (c: RuleCtx) => f(c) === true;
    } else if ((NUM_RULE_FIELDS as readonly string[]).includes(k)) {
      const f = expr(v, "num", where);
      out[k as (typeof NUM_RULE_FIELDS)[number]] = (c: RuleCtx) => f(c) as number;
    } else if (k === "idlePriority" || k === "chainPriority") {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new RuleError(`${where}: a number`);
      out[k] = v;
    } else if (k === "keepInHand" || k === "ownTurn") {
      if (typeof v !== "boolean") throw new RuleError(`${where}: true or false`);
      out[k] = v;
    } else if (k === "pick") {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new RuleError(`${where}: { "score": <number>, "min": <number> }`);
      for (const kk of Object.keys(v)) if (kk !== "score" && kk !== "min") throw new RuleError(`${where}: unknown "${kk}"`);
      const o = v as Record<string, unknown>;
      if (o.min !== undefined && (typeof o.min !== "number" || !Number.isFinite(o.min))) throw new RuleError(`${where}.min: a number`);
      const f = compile(o.score ?? 0, "num", `${where}.score`, { mon: false, card: true }, { n: MAX_NODES });
      out.pick = { score: (c: RuleCtx, card: RuleCard) => f(c, card) as number, ...(o.min !== undefined ? { min: o.min as number } : {}) };
    } else if (k === "number") {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new RuleError(`${where}: { "cover": <number>, "keep": <number> }`);
      for (const kk of Object.keys(v)) if (kk !== "cover" && kk !== "keep") throw new RuleError(`${where}: unknown "${kk}"`);
      const cover = expr((v as Record<string, unknown>).cover ?? 0, "num", `${where}.cover`);
      const keep = (v as Record<string, unknown>).keep ?? 0;
      if (typeof keep !== "number" || !Number.isFinite(keep)) throw new RuleError(`${where}.keep: a number`);
      out.number = (c: RuleCtx, values: number[]) => pickCover(values, cover(c) as number, c.myLp, keep);
    } else throw new RuleError(`${where}: unknown rule field "${k}"`);
  }
  return out;
}

/** The smallest value at least `need` that leaves `keep` LP; short of that the largest that leaves it; else the first. */
export function pickCover(values: number[], need: number, lp: number, keep: number): number {
  const ok = (v: number) => lp - v >= keep;
  let pick = -1;
  values.forEach((v, i) => { if (v >= need && ok(v) && (pick < 0 || v < values[pick]!)) pick = i; });
  if (pick < 0) values.forEach((v, i) => { if (ok(v) && (pick < 0 || v > values[pick]!)) pick = i; });
  return Math.max(0, pick);
}

export interface CompiledSet { staples: Record<string, CardRule>; npcs: Record<number, Record<string, CardRule>>; count: number }

const cardName = (n: string, at: string): string => {
  if (!n || n.length > MAX_NAME || n !== n.toLowerCase() || n !== n.trim()) throw new RuleError(`${at}: card names are cards.cdb's English names, lowercase ("${n}")`);
  return n;
};

/** A whole set (rules.json, or the bundled set with an overlay merged in), compiled; null rules are dropped. */
export function compileSet(json: unknown, at = "rules"): CompiledSet {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new RuleError(`${at}: a rule set is an object`);
  for (const k of Object.keys(json)) if (k !== "staples" && k !== "npcs" && k !== "note") throw new RuleError(`${at}: unknown "${k}" (staples, npcs, note)`);
  const s = json as RuleSetJson;
  let count = 0;
  const table = (o: unknown, where: string): Record<string, CardRule> => {
    if (o === undefined) return {};
    if (!o || typeof o !== "object" || Array.isArray(o)) throw new RuleError(`${where}: card name -> rule`);
    const out: Record<string, CardRule> = {};
    for (const [n, r] of Object.entries(o)) {
      const name = cardName(n, `${where}`);
      if (r === null) continue;
      if (++count > MAX_RULES) throw new RuleError(`${at}: over ${MAX_RULES} rules`);
      out[name] = compileRule(r, `${where}["${name}"]`);
    }
    return out;
  };
  const staples = table(s.staples, `${at}.staples`);
  const npcs: Record<number, Record<string, CardRule>> = {};
  if (s.npcs !== undefined) {
    if (!s.npcs || typeof s.npcs !== "object" || Array.isArray(s.npcs)) throw new RuleError(`${at}.npcs: NPC id -> card name -> rule`);
    for (const [id, t] of Object.entries(s.npcs)) {
      if (!/^[1-9][0-9]{0,3}$/.test(id)) throw new RuleError(`${at}.npcs: "${id}" is not an NPC id`);
      npcs[Number(id)] = table(t, `${at}.npcs["${id}"]`);
    }
  }
  return { staples, npcs, count };
}

/** The bundled set with an overlay on top: per card, the overlay's fields replace the bundled ones (a field set to
 *  null removes it, a card set to null removes its rule). Plain JSON in, plain JSON out (compileSet() validates). */
export function mergeSets(base: RuleSetJson, overlay: RuleSetJson | null): RuleSetJson {
  if (!overlay) return base;
  const mergeTable = (b: Record<string, RuleJson | null> = {}, o: Record<string, RuleJson | null> = {}) => {
    const out: Record<string, RuleJson | null> = { ...b };
    for (const [name, r] of Object.entries(o)) {
      if (r === null || typeof r !== "object" || Array.isArray(r)) { out[name] = r as null; continue; }
      const merged: Record<string, unknown> = { ...(out[name] ?? {}) };
      for (const [k, v] of Object.entries(r)) { if (v === null) delete merged[k]; else merged[k] = v; }
      out[name] = merged as RuleJson;
    }
    return out;
  };
  const npcs: Record<string, Record<string, RuleJson | null>> = { ...(base.npcs ?? {}) };
  for (const [id, t] of Object.entries(overlay.npcs ?? {})) npcs[id] = mergeTable(npcs[id], t ?? {});
  return { staples: mergeTable(base.staples, overlay.staples), npcs };
}
