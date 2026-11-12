// Costs and discards the way Master Duel's CPU pays them (md-ai/port/D-costs.md): which hand card goes when a card
// says "discard 1 card", and whether a cost can be paid at all.
//
// Its picker takes, in order: a card that wants the graveyard (Sangan, a self-reviving monster), a card it lists as a
// preferred discard (aiCategories.json discardFirst: dead in hand like the Spirit Messages, or better in the
// graveyard like the LV monsters), then plain cards, and only then the cards it keeps (importance 3, 2, then 1).
// Among plain cards Master Duel takes the lowest printed ATK, so every spell and trap went before any monster: production
// threw away Scapegoat at 1100 LP, Snatch Steal over a Mystical Elf and Brain Control over a 500 ATK Union. Here the
// plain cards go by our own worth of the card (#worth: a dead or duplicate card low, a live answer high), ATK breaks
// ties. A Spirit Message is dead only once its Destiny Board is gone: with the Board still to come the deck's only
// copy is kept (production discarded "L" to Dark World Dealings over a second Nightmare's Steelcage). A "safe" payment, the one Raigeki Break and the cost checks
// make while the CPU is not behind, refuses a card it keeps instead of paying with it; behind, anything goes.
// The first port read the discard-first list as "never discard" (+3000), and a Spirit Message rule as "keep in
// hand": the NPC then had no card to pay Raigeki Break with and died holding it (duel 300).
import CATEGORIES from "./aiCategories.json";
import LOST_FOREVER_JSON from "./lostForever.json";

const DISCARD_FIRST = new Set<number>(CATEGORIES.codes.discardFirst);
const POWER = new Set<number>(CATEGORIES.codes.power);
const POWER_ONCE = new Set<number>(CATEGORIES.codes.powerOnce);
const WANTS_GRAVE = new Set<number>([...CATEGORIES.codes.selfRevive, ...CATEGORIES.codes.graveSearch]);
const HAND_TRAP = new Set<number>(CATEGORIES.codes.handTrap);
const LOST_FOREVER = new Set<number>(LOST_FOREVER_JSON.codes);
/** Spirit Message "I" / "N" / "A" / "L": an NPC deck holds one of each, so the one in hand is the last copy. */
const SPIRIT_MESSAGES = new Set<number>([31893528, 67287533, 94772232, 30170981]);

/** What the picker knows about the player paying. */
export interface CostView {
  /** Hand codes (0 = unknown, never ours). */
  hand: number[];
  /** Codes on my field (face-up or set). */
  field: number[];
  isMonster: (code: number) => boolean;
  /** Printed ATK (0 for a spell/trap). */
  atk: (code: number) => number;
  /** This monster could be Normal Summoned by me now (my Main Phase, Normal Summon unused). */
  canNormalSummon: (code: number) => boolean;
  /** A piece of the deck's plan its card rule keeps in hand (Exodia): given up last of all. */
  keep?: (code: number) => boolean;
  /** Our own worth of a hand card: orders the plain cards (Master Duel's ATK order threw away every spell first). */
  worth?: (code: number) => number;
  /** A Destiny Board is still in my hand, on my field or in my Deck: its Spirit Messages are not dead cards. */
  destinyLive?: boolean;
}

/** 0 = expendable; 1 / 2 / 3 = kept, 1 the strongest (D-costs.md §1.2). */
export function importance(code: number, v: CostView): 0 | 1 | 2 | 3 {
  const copies = v.hand.filter((c) => c === code).length;
  if (v.isMonster(code)) {
    // my only monster in hand while I can still Normal Summon it
    const monsters = v.hand.filter((c) => c && v.isMonster(c)).length;
    if (monsters === 1 && v.canNormalSummon(code)) return 1;
  }
  if (copies < 2) {
    if (SPIRIT_MESSAGES.has(code) && v.destinyLive) return 1;
    // a monster that cannot come back once it leaves, with no copy of it on my field
    if (LOST_FOREVER.has(code) && !v.field.includes(code)) return 2;
  }
  if (POWER.has(code) || HAND_TRAP.has(code)) return 2;
  if (POWER_ONCE.has(code) && copies <= 1) return 2;
  return 0;
}

/** A card the picker takes before any other: it wants the graveyard (2) or it is a preferred discard (1). */
export function discardBenefit(code: number, v?: Pick<CostView, "destinyLive">): number {
  if (SPIRIT_MESSAGES.has(code) && v?.destinyLive) return 0;
  return WANTS_GRAVE.has(code) ? 2 : DISCARD_FIRST.has(code) ? 1 : 0;
}

/** A card never set on its own (the Spirit Messages, the Sarcophagi: dead in the Spell & Trap Zone). */
export function neverSet(code: number): boolean {
  return DISCARD_FIRST.has(code);
}

/**
 * The hand indices in the order the picker gives them up (first = the discard), leaving out `exclude` (the card being
 * activated from the hand). `safe`: refuse a kept card instead of paying with it (null when the first pick is kept,
 * as Master Duel does: it does not fall back to another card).
 */
export function costOrder(v: CostView, o: { exclude?: number; safe?: boolean } = {}): number[] | null {
  const idx = v.hand.map((c, i) => i).filter((i) => i !== o.exclude && v.hand[i]);
  const key = (i: number): [number, number, number, number, number] => {
    const c = v.hand[i]!;
    const imp = importance(c, v);
    const worth = v.worth?.(c) ?? 0;
    // benefit first; then plain cards; then kept ones, the weakest keep (3) before 2 before 1; a plan piece last
    if (v.keep?.(c)) return [0, 9, worth, v.atk(c), i];
    return [-discardBenefit(c, v), imp === 0 ? 0 : 4 - imp, worth, v.atk(c), i];
  };
  idx.sort((a, b) => {
    const x = key(a), y = key(b);
    for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k]! - y[k]!;
    return 0;
  });
  if (o.safe && idx.length > 0 && (importance(v.hand[idx[0]!]!, v) !== 0 || v.keep?.(v.hand[idx[0]!]!))) return null;
  return idx;
}

/** A card can pay this cost: a safe payment needs an expendable first pick, an unsafe one any card. */
export function canPay(v: CostView, o: { exclude?: number; safe: boolean }): boolean {
  const order = costOrder(v, o);
  return !!order && order.length > 0;
}

/** How many hand cards the picker would give up without touching a kept one. */
export function expendable(v: CostView, exclude?: number): number {
  return v.hand.filter((c, i) => i !== exclude && c && !v.keep?.(c) && (discardBenefit(c, v) > 0 || importance(c, v) === 0)).length;
}
