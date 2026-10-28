// Position evaluation for the NPC AI: one scalar, higher = better for "me". A pure function of the board features
// the player already reads. Used two ways: the heuristic player scores PREDICTED boards (1-ply combat), and the elite
// tier scores the boards at the end of its lookahead rollouts (simSearch.ts).
//
// Weights follow the game's fundamentals, in priority order:
//   - Uncommitted resources (hand + set backrow): card advantage is king in the long game.
//   - Board power / presence: the bodies on the field (attackers at ATK, defenders at DEF).
//   - LP: a lighter resource, with hard win/lose overrides at the extremes.
// A committed body is discounted when the opponent has open backrow that could remove it: that is what stops the
// player dumping its whole board into one beater that walks into Mirror Force or a removal trap.
export interface EvalMon {
  atk: number; def: number; faceDown: boolean; attackPos: boolean;
  /** True when the stats are REAL (face-up, or read through spy vision) rather than a guess —
   *  lets combat prediction use exact face-down DEF instead of the ~1500 unknown-wall prior. */
  known?: boolean;
  /** Estimated value lost by turning this set monster face-up (FLIP removal/search, floaters, etc.). */
  flipRisk?: number;
}
export interface Position {
  myMon: EvalMon[];
  oppMon: EvalMon[];
  myLp: number;
  oppLp: number;
  /** Uncommitted cards still in my hand. */
  myHand: number;
  /** Set spell/trap cards (my answers held in reserve). */
  myBackrow: number;
  /** Opponent's set backrow — proxy for removal waiting on a committed body. */
  oppBackrow: number;
}

const CARD = 1000;     // an uncommitted card (hand / set backrow) ≈ this many eval points
const PRESENCE = 250;  // each monster body on the field (tempo / blocker value beyond raw stats)
const POWER = 0.4;     // weight on summed board ATK/DEF
const BEST = 0.3;      // extra weight on the single strongest body (what trades & pushes damage)

/** The strongest single body a side presents (ATK if it can attack, else its DEF wall). */
const bestBody = (mon: EvalMon[]): number => mon.reduce((m, c) => Math.max(m, c.attackPos ? c.atk : c.def), 0);
const power = (mon: EvalMon[]): number => mon.reduce((a, c) => a + (c.attackPos ? c.atk : c.def), 0);

export function evaluate(p: Position): number {
  if (p.oppLp <= 0) return 1e9;  // lethal — best possible
  if (p.myLp <= 0) return -1e9;  // dead — worst possible
  // How much to trust a committed body to stick: open opponent backrow likely hides removal.
  const stick = p.oppBackrow >= 2 ? 0.5 : p.oppBackrow === 1 ? 0.8 : 1;
  let s = (p.myHand + p.myBackrow) * CARD;
  s += power(p.myMon) * POWER * stick - power(p.oppMon) * POWER;
  s += bestBody(p.myMon) * stick * BEST - bestBody(p.oppMon) * BEST;
  s += (p.myMon.length - p.oppMon.length) * PRESENCE;
  s += (p.myLp - p.oppLp) * 0.05;
  return s;
}
