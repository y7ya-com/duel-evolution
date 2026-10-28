// The NPC AI's view of the engine: a duelcore `select` event (brain mode, with `view`) as a typed prompt, the board
// the AI may see, and builders for duelcore's JSON responses. Indices in prompts and responses are the select's own
// list indices; players are protocol players (the engine handles the first-player swap).
import { declarable, toBigInt, type CardDB as BrainDB } from "../brain/cards.ts";
import { zoneOrder } from "../zones.ts";

export type Json = Record<string, unknown>;

export const LOCATION = { DECK: 0x01, HAND: 0x02, MZONE: 0x04, SZONE: 0x08, GRAVE: 0x10, REMOVED: 0x20, EXTRA: 0x40 } as const;
export const POS = {
  FACEUP_ATTACK: 0x1, FACEDOWN_ATTACK: 0x2, FACEUP_DEFENSE: 0x4, FACEDOWN_DEFENSE: 0x8,
  FACEUP: 0x5, FACEDOWN: 0xa, ATTACK: 0x3, DEFENSE: 0xc,
} as const;
export const PHASE = { DRAW: 0x1, STANDBY: 0x2, MAIN1: 0x4, BATTLE_START: 0x8, MAIN2: 0x100, END: 0x200 } as const;
export const isFaceDown = (pos: number): boolean => (pos & POS.FACEDOWN) !== 0;

/** A located card. `code` is 0 when hidden from the AI. */
export interface CardRef { code: number; controller: number; location: number; sequence: number; position?: number }
export interface Activatable extends CardRef { description: string }
export interface SumCard extends CardRef { param: number }
export interface PlaceRef { controller: number; location: number; sequence: number }

export type Prompt =
  | { kind: "selectIdleCmd"; player: number; summonable: CardRef[]; spSummonable: CardRef[]; repositionable: CardRef[]; monsterSet: CardRef[]; spellSet: CardRef[]; activatable: Activatable[]; canBattlePhase: boolean; canEndPhase: boolean }
  | { kind: "selectBattleCmd"; player: number; activatable: Activatable[]; attackable: (CardRef & { directAttackable: boolean })[]; canMain2: boolean; canEndPhase: boolean }
  | { kind: "selectEffectYN"; player: number; card: CardRef; description: string }
  | { kind: "selectYesNo"; player: number; description: string }
  | { kind: "selectOption"; player: number; options: unknown[] }
  | { kind: "selectCard"; player: number; min: number; max: number; cards: CardRef[] }
  | { kind: "selectUnselectCard"; player: number; finishable: boolean; min: number; max: number; selectable: CardRef[]; unselectable: CardRef[] }
  | { kind: "selectChain"; player: number; forced: boolean; chains: Activatable[] }
  | { kind: "selectPlace"; player: number; count: number; disabledFlag: number; isDisfield: boolean }
  | { kind: "selectPosition"; player: number; code: number; positions: number }
  | { kind: "selectTribute"; player: number; min: number; max: number; cards: (CardRef & { releaseParam: number })[] }
  | { kind: "selectSum"; player: number; mode: number; sumVal: number; min: number; max: number; must: SumCard[]; cards: SumCard[] }
  | { kind: "selectCounter"; player: number; count: number; cards: (CardRef & { counters: number })[] }
  | { kind: "announceRace" | "announceAttrib"; player: number; count: number; available: number }
  | { kind: "announceCard"; player: number; opcodes: unknown[] }
  | { kind: "announceNumber"; player: number; options: unknown[] }
  | { kind: "sortCard"; player: number }
  | { kind: "other"; player: number; type: string };

const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : d);
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

/** A select card. Honest play: the opponent's hidden cards (hand, deck, face-down) come through as code 0. */
function ref(c: Json, me: number, spy: boolean): CardRef {
  const controller = num(c.controller), location = num(c.location), position = c.position === undefined ? undefined : num(c.position);
  let code = num(c.code);
  const hidden = controller !== me && ((location & (LOCATION.HAND | LOCATION.DECK)) !== 0
    || ((location & (LOCATION.MZONE | LOCATION.SZONE)) !== 0 && position !== undefined && isFaceDown(position)));
  if (hidden && !spy) code = 0;
  return { code, controller, location, sequence: num(c.sequence), position };
}
const act = (c: Json, me: number, spy: boolean): Activatable => ({ ...ref(c, me, spy), description: String(c.description ?? 0) });

/** duelcore select event -> Prompt. */
export function toPrompt(sel: Json, me: number, spy = false): Prompt {
  const player = num(sel.player);
  const r = (c: Json) => ref(c, me, spy);
  switch (sel.type) {
    case "SELECT_IDLECMD":
      return {
        kind: "selectIdleCmd", player, summonable: arr(sel.summons).map(r), spSummonable: arr(sel.special_summons).map(r),
        repositionable: arr(sel.pos_changes).map(r), monsterSet: arr(sel.monster_sets).map(r), spellSet: arr(sel.spell_sets).map(r),
        activatable: arr(sel.activates).map((c) => act(c, me, spy)), canBattlePhase: !!sel.to_bp, canEndPhase: !!sel.to_ep,
      };
    case "SELECT_BATTLECMD":
      return {
        kind: "selectBattleCmd", player, activatable: arr(sel.chains).map((c) => act(c, me, spy)),
        attackable: arr(sel.attacks).map((c) => ({ ...r(c), directAttackable: !!c.can_direct })), canMain2: !!sel.to_m2, canEndPhase: !!sel.to_ep,
      };
    case "SELECT_EFFECTYN": return { kind: "selectEffectYN", player, card: r(sel), description: String(sel.description ?? 0) };
    case "SELECT_YESNO": return { kind: "selectYesNo", player, description: String(sel.description ?? 0) };
    case "SELECT_OPTION": return { kind: "selectOption", player, options: Array.isArray(sel.options) ? sel.options : [] };
    case "SELECT_CARD": return { kind: "selectCard", player, min: num(sel.min), max: num(sel.max), cards: arr(sel.selects).map(r) };
    case "SELECT_UNSELECT_CARD":
      return { kind: "selectUnselectCard", player, finishable: !!sel.can_finish, min: num(sel.min), max: num(sel.max), selectable: arr(sel.select_cards).map(r), unselectable: arr(sel.unselect_cards).map(r) };
    case "SELECT_CHAIN": return { kind: "selectChain", player, forced: !!sel.forced, chains: arr(sel.selects).map((c) => act(c, me, spy)) };
    case "SELECT_PLACE":
    case "SELECT_DISFIELD":
      return { kind: "selectPlace", player, count: num(sel.count, 1), disabledFlag: num(sel.field_mask), isDisfield: sel.type === "SELECT_DISFIELD" };
    case "SELECT_POSITION": return { kind: "selectPosition", player, code: num(sel.code), positions: num(sel.positions, POS.FACEUP_ATTACK) };
    case "SELECT_TRIBUTE":
      return { kind: "selectTribute", player, min: num(sel.min), max: num(sel.max), cards: arr(sel.selects).map((c) => ({ ...r(c), releaseParam: num(c.release_param) })) };
    case "SELECT_SUM":
      return {
        kind: "selectSum", player, mode: num(sel.select_max), sumVal: num(sel.amount), min: num(sel.min), max: num(sel.max),
        must: arr(sel.selects_must).map((c) => ({ ...r(c), param: num(c.amount) })), cards: arr(sel.selects).map((c) => ({ ...r(c), param: num(c.amount) })),
      };
    case "SELECT_COUNTER": return { kind: "selectCounter", player, count: num(sel.count), cards: arr(sel.cards).map((c) => ({ ...r(c), counters: num(c.count) })) };
    case "ANNOUNCE_RACE": return { kind: "announceRace", player, count: num(sel.count, 1), available: num(sel.available) };
    case "ANNOUNCE_ATTRIB": return { kind: "announceAttrib", player, count: num(sel.count, 1), available: num(sel.available) };
    case "ANNOUNCE_CARD": return { kind: "announceCard", player, opcodes: Array.isArray(sel.opcodes) ? sel.opcodes : [] };
    case "ANNOUNCE_NUMBER": return { kind: "announceNumber", player, options: Array.isArray(sel.options) ? sel.options : [] };
    case "SORT_CARD":
    case "SORT_CHAIN": return { kind: "sortCard", player };
    default: return { kind: "other", player, type: String(sel.type) };
  }
}

// ---- the board the AI sees ----------------------------------------------------------------------------------------
export interface BoardCard { code: number; controller: number; location: number; sequence: number; position: number; attack?: number; defense?: number; level?: number }
export interface PlayerBoard {
  lp: number;
  mzone: (BoardCard | null)[];
  szone: (BoardCard | null)[];
  /** Hand codes; 0 = a hidden card (only the count is known). */
  hand: number[];
  grave: number[];
  deckCount: number;
}
export interface DuelBoard { turn: number; turnPlayer: number; phase: number; players: [PlayerBoard, PlayerBoard] }

function zone(list: unknown, controller: number, location: number, me: number, mask: boolean): (BoardCard | null)[] {
  return arr(list).map((c, sequence) => {
    if (!c || !num(c.code) && c.position === undefined) return null;
    const position = num(c.position);
    const hide = mask && controller !== me && isFaceDown(position);
    return hide
      ? { code: 0, controller, location, sequence, position }
      : { code: num(c.code), controller, location, sequence, position, attack: c.attack === undefined ? undefined : num(c.attack), defense: c.defense === undefined ? undefined : num(c.defense), level: c.level === undefined ? undefined : num(c.level) };
  });
}
const codes = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? num((x as Json).code) : num(x))) : []);

/** The board from a select's honest `view` (duelcore brain mode). */
export function boardFromView(sel: Json, me: number): DuelBoard | null {
  const view = sel.view as Json | undefined;
  if (!view || !Array.isArray(view.players)) return null;
  const lp = Array.isArray(sel.lp) ? (sel.lp as number[]) : [8000, 8000];
  const players = (view.players as Json[]).map((p, i): PlayerBoard => ({
    lp: num(lp[i], 8000),
    mzone: zone(p.mzone, i, LOCATION.MZONE, me, false),
    szone: zone(p.szone, i, LOCATION.SZONE, me, false),
    hand: i === me ? codes(p.hand) : new Array<number>(num(p.hand_count)).fill(0),
    grave: codes(p.grave),
    deckCount: num(p.deck_count),
  })) as [PlayerBoard, PlayerBoard];
  return { turn: num(sel.turn), turnPlayer: num(sel.turn_player), phase: num(sel.phase), players };
}

/** The board from a duelcore `state` (query: full information). `spy` keeps it whole; otherwise it is masked for `me`
 *  exactly like a `view` (the opponent's hand count only, their face-down cards without code or stats). */
export function boardFromState(state: Json, me: number, spy: boolean): DuelBoard | null {
  if (state.ev !== "state" || !Array.isArray(state.players)) return null;
  const lp = Array.isArray(state.lp) ? (state.lp as number[]) : [8000, 8000];
  const players = (state.players as Json[]).map((p, i): PlayerBoard => ({
    lp: num(lp[i], 8000),
    mzone: zone(p.mzone, i, LOCATION.MZONE, me, !spy),
    szone: zone(p.szone, i, LOCATION.SZONE, me, !spy),
    hand: i === me || spy ? codes(p.hand) : new Array<number>(arr(p.hand).length).fill(0),
    grave: codes(p.grave),
    deckCount: num(p.deck_count),
  })) as [PlayerBoard, PlayerBoard];
  return { turn: num(state.turn), turnPlayer: num(state.turn_player), phase: num(state.phase), players };
}

// ---- duelcore JSON responses ---------------------------------------------------------------------------------------
export type IdleAction = "SELECT_SUMMON" | "SELECT_SPECIAL_SUMMON" | "SELECT_POS_CHANGE" | "SELECT_MONSTER_SET" | "SELECT_SPELL_SET" | "SELECT_ACTIVATE" | "TO_BP" | "TO_EP";
export type BattleAction = "SELECT_CHAIN" | "SELECT_BATTLE" | "TO_M2" | "TO_EP";

export const respIdle = (action: IdleAction, index: number | null = null): Json => ({ type: "SELECT_IDLECMD", action, index });
export const respBattle = (action: BattleAction, index: number | null = null): Json => ({ type: "SELECT_BATTLECMD", action, index });
export const respChain = (index: number | null): Json => ({ type: "SELECT_CHAIN", index });
export const respEffectYN = (yes: boolean): Json => ({ type: "SELECT_EFFECTYN", yes });
export const respYesNo = (yes: boolean): Json => ({ type: "SELECT_YESNO", yes });
export const respOption = (index: number): Json => ({ type: "SELECT_OPTION", index });
export const respCards = (indicies: number[]): Json => ({ type: "SELECT_CARD", indicies });
export const respTribute = (indicies: number[]): Json => ({ type: "SELECT_TRIBUTE", indicies });
export const respUnselect = (index: number | null): Json => ({ type: "SELECT_UNSELECT_CARD", index });
export const respPosition = (position: number): Json => ({ type: "SELECT_POSITION", position });
export const respCounter = (counters: number[]): Json => ({ type: "SELECT_COUNTER", counters });
export const respSort = (): Json => ({ type: "SORT_CARD", order: null });
export function respPlaces(disfield: boolean, places: PlaceRef[]): Json {
  return { type: disfield ? "SELECT_DISFIELD" : "SELECT_PLACE", places: places.map((p) => ({ player: p.controller, location: p.location, sequence: p.sequence })) };
}

/** Lowest `n` set bits of a mask, one bit per entry (ANNOUNCE_RACE / ANNOUNCE_ATTRIB). */
export function lowestBits(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let bit = 0; out.length < n && bit < 53; bit++) {
    const m = 2 ** bit;
    if (Math.floor(mask / m) % 2 === 1) out.push(m);
  }
  return out;
}

/**
 * SELECT_PLACE: `count` legal zones from the disabled-zone mask (bit set = forbidden), relative to the selecting
 * player: bits 0-6 own monster zones, 8-12 own spell/trap zones, 16-22 / 24-28 the opponent's. Own zones first,
 * each region centre-first (src/duel/zones.ts).
 */
export function freePlaces(player: number, count: number, flag: number): PlaceRef[] {
  const opp = 1 - player;
  const regions = [
    { base: 0, controller: player, location: LOCATION.MZONE, zones: 7 },
    { base: 8, controller: player, location: LOCATION.SZONE, zones: 5 },
    { base: 16, controller: opp, location: LOCATION.MZONE, zones: 7 },
    { base: 24, controller: opp, location: LOCATION.SZONE, zones: 5 },
  ];
  const free: PlaceRef[] = [];
  for (const r of regions) for (const s of zoneOrder(r.zones)) if ((flag & (1 << (r.base + s))) === 0) free.push({ controller: r.controller, location: r.location, sequence: s });
  const out: PlaceRef[] = [];
  for (let i = 0; i < Math.max(1, count); i++) out.push(free[i] ?? free[0] ?? { controller: player, location: LOCATION.MZONE, sequence: 0 });
  return out;
}

// ---- declare prompts ----------------------------------------------------------------------------------------------
type SelectSum = Extract<Prompt, { kind: "selectSum" }>;

/**
 * SELECT_SUM: pick cards whose values total the target. Each card's param packs two values (lo = param & 0xffff,
 * hi = param >> 16; a card may count as either). Must-cards are mandatory. Mode 0: the total is EXACTLY the target;
 * mode 1 (rituals): AT LEAST the target and minimal (no picked card is redundant). Response indices count the
 * must-cards first.
 */
export function solveSum(ev: SelectSum): Json | null {
  const lo = (p: number) => p & 0xffff;
  const hi = (p: number) => (p >>> 16) & 0xffff;
  let mustSums = [0];
  for (const m of ev.must) {
    const vs = [lo(m.param), hi(m.param)].filter((v) => v > 0);
    mustSums = [...new Set(mustSums.flatMap((s) => vs.map((v) => s + v)))];
  }
  const sel = ev.cards;
  const exact = ev.mode === 0;
  const minCount = Math.max(0, ev.min - ev.must.length);
  const maxCount = ev.max > 0 ? ev.max : sel.length;
  const dfs = (i: number, need: number, count: number, minUsed: number, picked: number[]): number[] | null => {
    if (exact) { if (need === 0 && count >= minCount) return picked; }
    else if (need <= 0 && -need < minUsed && count >= minCount) return picked;
    if (i >= sel.length || count >= maxCount) return null;
    if (exact && need < 0) return null;
    const skip = dfs(i + 1, need, count, minUsed, picked);
    if (skip) return skip;
    for (const v of [lo(sel[i]!.param), hi(sel[i]!.param)]) {
      if (v <= 0) continue;
      if (exact && v > need) continue;
      const r = dfs(i + 1, need - v, count + 1, Math.min(minUsed, v), [...picked, i]);
      if (r) return r;
    }
    return null;
  };
  for (const ms of mustSums) {
    const picked = dfs(0, ev.sumVal - ms, 0, Infinity, []);
    if (picked && (picked.length || ev.must.length)) {
      return { type: "SELECT_SUM", indicies: [...ev.must.map((_, i) => i), ...picked.map((i) => i + ev.must.length)] };
    }
  }
  return null;
}

/** ANNOUNCE_CARD: declare the first card (cards.cdb order) whose attributes pass the prompt's opcode filter. */
export function solveAnnounceCard(opcodes: unknown[], db: BrainDB): Json | null {
  const ops = opcodes.map((o) => toBigInt(o));
  for (const c of db.cards.values()) if (declarable(c, ops)) return { type: "ANNOUNCE_CARD", card: c.code };
  return null;
}
