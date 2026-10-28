// Combo plans: the multi-turn planning layer the greedy heuristic lacks. A greedy player cannot pilot a combo deck: it
// chumps away the pieces and spends the assembler before the payoff lines up. A ComboPlan declares the payoff and its
// pieces; while the combo can still be assembled the player (1) HOLDS the pieces instead of summoning them, (2) DUMPS
// the grave-enabler when something asks it to discard, (3) picks the goal fusion when the assembler resolves and
// (4) holds the deck's after-payoff cards until the payoff is out. Everything is by lowercase card name (cards.cdb).
//
// One entry per NPC (this game's NPC ids) whose deck has a real assembled payoff; NPCs without an entry play the plain
// heuristic. Empty for now: to be tuned per deck.
export interface ComboPlan {
  /** The Extra Deck fusion the plan assembles. */
  fusion: string;
  /** Monster pieces to gather and HOLD in hand for the fusion. */
  pieces: string[];
  /** How many pieces (hand + field) the fusion needs. */
  need: number;
  /** The spell that performs the assembly. */
  assembler: string;
  /** Optional: a card whose "sent to the GY" effect fetches the pieces, discarded first to enable the combo. */
  graveEnabler?: string;
  /** Optional: a field spell that only pays off once the fusion is out (and hurts the deck before), held until then. */
  enableField?: string;
  /** Cards that complete/protect the combo once the payoff is live: held until then, and never left to the search. */
  afterPayoff?: string[];
}

export const COMBO_PLANS: Record<number, ComboPlan> = {};
