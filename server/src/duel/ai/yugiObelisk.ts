// Small resource planner for Yugi's legal, same-turn Obelisk setups. It only
// proposes a route; the native engine still supplies every action and tribute.
export const OBELISK = "obelisk the tormentor";
export const SANCTUARY = "fiend's sanctuary";
const VALKYRION = "valkyrion the magna warrior";
const TRICKY = "the tricky";
const REBORN = "monster reborn";
const MAGNETS = ["alpha the magnet warrior", "beta the magnet warrior", "gamma the magnet warrior"];
const DIMENSION = "dimension fusion";
export const OBELISK_PIECES = [OBELISK, SANCTUARY, VALKYRION, TRICKY, REBORN, DIMENSION, ...MAGNETS];
export interface ObeliskStep {
  action: "SELECT_ACTIVATE" | "SELECT_SPECIAL_SUMMON" | "SELECT_SUMMON";
  name: string;
  discard?: string;
  target?: string;
}
export interface ObeliskResources {
  hand: string[];
  field: string[];
  grave: string[];
  removed: string[];
  dimensionSafe: boolean;
  lp: number;
  normalLeft: boolean;
  /** Only unrestricted Normal Monsters: no unfulfilled revival procedures. */
  normalMonster: (name: string) => boolean;
  spellLocked: boolean;
  effectsNegated: boolean;
}

// These tokens cannot supply a same-turn Tribute Summon. Unknown tokens are
// conservatively excluded too; Metal Fiend Tokens explicitly allow it.
const tributeBody = (name: string) => !/token/.test(name) || name === "metal fiend token";
const take = (cards: string[], name: string): string[] => {
  const copy = [...cards]; copy.splice(copy.indexOf(name), 1); return copy;
};

export function obeliskPlan(input: ObeliskResources): ObeliskStep[] | null {
  if (!input.normalLeft || !input.hand.includes(OBELISK) || input.field.includes(OBELISK)) return null;
  type State = { hand: string[]; field: string[]; grave: string[]; steps: ObeliskStep[] };
  const queue: State[] = [{ ...input, steps: [] }], seen = new Set<string>();
  for (let i = 0; i < queue.length && i < 192; i++) {
    const s = queue[i]!;
    if (s.field.filter(tributeBody).length >= 3) return [...s.steps, { action: "SELECT_SUMMON", name: OBELISK }];
    if (s.steps.length >= 5) continue;
    const add = (hand: string[], field: string[], grave: string[], step: ObeliskStep) => {
      const key = [hand, field, grave].map(a => [...a].sort().join("|")).join(";");
      if (seen.has(key)) return;
      seen.add(key); queue.push({hand, field, grave, steps: [...s.steps, step]});
    };
    if (!input.effectsNegated && s.field.includes(VALKYRION) && s.field.length <= 3 && MAGNETS.every(n => s.grave.includes(n))) {
      let grave = s.grave;
      for (const name of MAGNETS) grave = take(grave, name);
      add(s.hand, [...take(s.field, VALKYRION), ...MAGNETS], [...grave, VALKYRION], { action: "SELECT_ACTIVATE", name: VALKYRION });
    }
    if (!input.spellLocked && s.field.length < 5 && s.hand.includes(SANCTUARY))
      add(take(s.hand, SANCTUARY), [...s.field, "metal fiend token"], s.grave, { action: "SELECT_ACTIVATE", name: SANCTUARY });
    if (!input.spellLocked && s.field.length < 5 && s.hand.includes(REBORN)) {
      const target = s.grave.find(input.normalMonster);
      if (target) add(take(s.hand, REBORN), [...s.field, target], take(s.grave, target), { action: "SELECT_ACTIVATE", name: REBORN, target });
    }
    // A single mass-return spell can replace several token makers, once real
    // monsters have been banished. Do not also rebuild the opposing army.
    const returned = input.removed.filter(input.normalMonster).slice(0, 5 - s.field.length);
    if (!input.spellLocked && input.dimensionSafe && input.lp > 2000 && s.hand.includes(DIMENSION)
      && s.field.filter(tributeBody).length + returned.length >= 3)
      add(take(s.hand, DIMENSION), [...s.field, ...returned], s.grave, { action: "SELECT_ACTIVATE", name: DIMENSION });
    if (s.field.length < 5 && s.hand.includes(TRICKY)) {
      // Preserve Obelisk and its other extenders. A normal monster is both a
      // discard and a subsequent Reborn target, rather than a wasted card.
      const discard = s.hand.find(n => !MAGNETS.includes(n) && input.normalMonster(n))
        ?? s.hand.find(n => input.normalMonster(n));
      if (discard) add(take(take(s.hand, TRICKY), discard), [...s.field, TRICKY], [...s.grave, discard],
        { action: "SELECT_SPECIAL_SUMMON", name: TRICKY, discard });
    }
    if (s.hand.includes(VALKYRION) && MAGNETS.every(n => s.hand.includes(n) || s.field.includes(n))) {
      let hand = take(s.hand, VALKYRION), field = [...s.field];
      for (const name of MAGNETS) {
        if (hand.includes(name)) hand = take(hand, name); else field = take(field, name);
      }
      if (field.length < 5) add(hand, [...field, VALKYRION], [...s.grave, ...MAGNETS], { action: "SELECT_SPECIAL_SUMMON", name: VALKYRION });
    }
  }
  return null;
}
