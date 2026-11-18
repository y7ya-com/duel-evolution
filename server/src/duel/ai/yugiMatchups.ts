/** A matchup proposes different counters for the engine to try. It uses only
 * cards on the public board or in public piles, plus the hand Yugi's draw skill
 * is allowed to read. The opponent's full deck never enters classification. */
export interface MatchupEvidence {
  hand: readonly string[];
  monsters: readonly string[];
  backrow: readonly string[];
  grave: readonly string[];
  setMonsters: number;
  setBackrow: number;
  fusionOnBoard?: boolean;
}

export type YugiMatchup =
  | "lightsworn" | "dark-world" | "gladiator-beast" | "hero"
  | "crystal-beast" | "cyber-dragon" | "dark-gaia" | "apprentice-control";

interface CounterLine {
  cards: readonly string[];
  when?: (e: MatchupEvidence) => boolean;
}

interface Playbook {
  id: YugiMatchup;
  signature: RegExp;
  /** An especially distinctive card can identify a deck on its own. */
  anchor?: RegExp;
  lines: readonly CounterLine[];
}

const graveDenial = ["d.d. crow", "soul release", "kycoo the ghost destroyer", "banisher of the radiance", "dimensional fissure"];
const monsterInterruption = ["light-imprisoning mirror", "pulling the rug", "divine wrath"];
const battleDenial = ["dimensional prison", "compulsory evacuation device", "book of moon", "threatening roar"];
// Spell negation: Royal Oppression cannot stop a summon made by a card's effect (Polymerization, Miracle Fusion,
// Dark Calling, a Ritual Spell); it stays only where summons are inherent (Gladiator contact fusions, Cyber Dragon).
const fusionDenial = ["dark bribe", "magic jammer", "solemn judgment"];
const fusionAnswer = ["de-fusion", "compulsory evacuation device", "snatch steal", "raigeki"];
const bounceCrystals = ["giant trunade", "heavy storm", "spiritualism", "phoenix wing wind blast"];
const boardRemoval = ["raigeki", "dark hole", "snatch steal", "smashing ground"];
const row = (e: MatchupEvidence) => e.backrow.length + e.setBackrow;
const has = (names: readonly string[], pattern: RegExp) => names.some(n => pattern.test(n));
const hasFusion = (e: MatchupEvidence) => !!e.fusionOnBoard;

const PLAYBOOKS: readonly Playbook[] = [
  {
    id: "lightsworn",
    signature: /lightsworn|^solar recharge$|^charge of the light brigade$|^judgment dragon$/,
    anchor: /^judgment dragon$|^solar recharge$|^charge of the light brigade$/,
    lines: [
      // Stop the next graveyard payoff or the removal effect before battle.
      { cards: graveDenial, when: e => e.grave.length >= 2 || has(e.hand, /lumina|judgment dragon|solar recharge/) },
      { cards: monsterInterruption, when: e => has([...e.hand, ...e.monsters], /celestia|lyla|ryko|judgment dragon|lumina/) || e.setMonsters > 0 },
      { cards: boardRemoval, when: e => e.monsters.length > 0 },
    ],
  },
  {
    id: "dark-world",
    // Dark World Dealings is common in other decks. Count the actual engine monsters.
    signature: /, .* of dark world$|^gateway to dark world$|^dark world lightning$/,
    anchor: /^(goldd|sillva|broww|brron|beiige),/,
    lines: [
      { cards: ["shadow-imprisoning mirror", "banisher of the radiance", "dimensional fissure"] },
      { cards: ["d.d. crow", "soul release", "royal oppression"], when: e => e.grave.length > 0 },
      { cards: ["dimensional prison", "bottomless trap hole", "snatch steal"], when: e => e.monsters.length > 0 },
    ],
  },
  {
    id: "gladiator-beast",
    signature: /^gladiator beast |^gladiator proving ground$|^test (tiger|ape)$/,
    anchor: /^gladiator beast (bestiari|gyzarus|heraklinos)$|^gladiator proving ground$/,
    lines: [
      // Deny safe battle/tag-out windows and remove bodies before contact fusion.
      { cards: battleDenial },
      { cards: ["royal oppression", "solemn judgment", "bottomless trap hole"],
        when: e => e.monsters.length > 0 || has(e.hand, /bestiari|test tiger|rescue cat/) },
      { cards: ["de-fusion", "compulsory evacuation device", "snatch steal"], when: hasFusion },
    ],
  },
  {
    id: "hero",
    // Prisma is a Gladiator staple. Only actual HERO support or other HERO names count.
    signature: /^(?!elemental hero prisma$)(elemental|destiny|evil) hero |^e - emergency call$|^miracle fusion$|^hero signal$/,
    anchor: /^e - emergency call$|^miracle fusion$/,
    lines: [
      { cards: fusionDenial, when: e => has(e.hand, /fusion|polymerization/) || e.monsters.length > 0 },
      { cards: graveDenial, when: e => has(e.hand, /miracle fusion|dark calling/) || has(e.grave, /^(elemental|destiny|evil) hero /) },
      { cards: fusionAnswer, when: hasFusion },
    ],
  },
  {
    id: "crystal-beast",
    signature: /^crystal beast |^ancient city - rainbow ruins$|^crystal (beacon|abundance|promise|blessing)$|^rare value$/,
    anchor: /^ancient city - rainbow ruins$|^crystal (beacon|abundance)$/,
    lines: [
      { cards: bounceCrystals, when: e => row(e) > 0 },
      { cards: ["snatch steal", "compulsory evacuation device", "dimensional prison"], when: e => e.monsters.length > 0 },
      { cards: ["pulling the rug", "divine wrath", "royal oppression"], when: e => has(e.hand, /sapphire pegasus|crystal (beacon|abundance)|ruby carbuncle/) },
    ],
  },
  {
    id: "cyber-dragon",
    // A splash Cyber Dragon alone is not a Machine deck.
    signature: /^(proto-)?cyber dragon$|^cyber (phoenix|twin dragon|end dragon)$|^chimeratech |^overload fusion$|^power bond$|^limiter removal$/,
    anchor: /^power bond$|^overload fusion$|^chimeratech /,
    lines: [
      { cards: ["system down", "acid rain"], when: e => has([...e.monsters, ...e.grave], /cyber|chimeratech|drillroid|reflect bounder/) },
      { cards: fusionDenial, when: e => has(e.hand, /power bond|overload fusion|limiter removal|future fusion/) },
      { cards: fusionAnswer, when: hasFusion },
    ],
  },
  {
    id: "dark-gaia",
    signature: /^evil hero dark gaia$|^dark calling$|^gaia plate the earth giant$|^dark master - zorc$|^dark fusion$|^contract with the abyss$|^demise, king of armageddon$/,
    anchor: /^evil hero dark gaia$|^dark calling$/,
    lines: [
      { cards: fusionDenial },
      { cards: graveDenial, when: e => e.grave.length >= 2 },
      { cards: ["divine wrath", "book of moon", "compulsory evacuation device", "de-fusion"], when: e => e.monsters.length > 0 },
    ],
  },
  {
    id: "apprentice-control",
    signature: /^apprentice magician$|^old vindictive magician$|^mystic tomato$|^skilled dark magician$|^(caius|raiza|mobius|zaborg|granmarg|thestalos) the .* monarch$/,
    // Avoid labelling every Apprentice paired with a random Tomato as this deck.
    lines: [
      { cards: ["nobleman of crossout", "shield crush"], when: e => e.setMonsters > 0 },
      { cards: ["pulling the rug", "mask of restrict", "divine wrath"], when: e => has(e.hand, / monarch$/) && e.monsters.length > 0 },
      { cards: ["royal decree", "giant trunade", "heavy storm", "jinzo"], when: e => e.setBackrow >= 2 },
    ],
  },
];

/** Distinct signatures beat duplicate copies. A confirmed archetype can beat a
 * splash anchor, and ties go to the more distinctive shared strategy. */
export function yugiPlaybook(e: MatchupEvidence): { id: YugiMatchup; lines: readonly (readonly string[])[] } | null {
  const seen = [...new Set([...e.hand, ...e.monsters, ...e.backrow, ...e.grave])];
  let best: Playbook | undefined;
  let bestScore = 0;
  for (const book of PLAYBOOKS) {
    const hits = seen.filter(n => book.signature.test(n)).length;
    const anchor = !!book.anchor && has(seen, book.anchor);
    if (hits < 2 && !anchor) continue;
    const score = hits * 2 + (anchor ? 1 : 0);
    if (score > bestScore) { best = book; bestScore = score; }
  }
  if (!best) return null;
  return { id: best.id, lines: best.lines.filter(l => !l.when || l.when(e)).map(l => l.cards) };
}
