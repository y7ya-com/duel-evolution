import type { CardView, DeckView } from '../contracts';

/** The 2008 deck editor's duel rules, as the server checks them before a duel (server/src/duel/deckCheck.ts):
 * Main 40-80, Fusion at most 30, Side at most 15 (storage), three copies of a card (alternate arts together), the
 * forbidden/limited list, cards that never go in decks (gods, tokens), the right zone and owned copies. The server
 * remains authoritative; this report only tells the player before they enter a duel. */
export const DECK_RULES = { mainMin: 40, mainMax: 80, extraMax: 30, sideMax: 15, copies: 3 } as const;
export type DeckRule = 'size' | 'zone' | 'forbidden' | 'limited' | 'copies' | 'not-deckable' | 'owned' | 'unknown';
export interface DeckProblem { rule: DeckRule; message: string; passcode?: number; }
export type DeckCard = CardView & { deckAllowed?: boolean };

export function deckProblems(deck: DeckView, lookup: (passcode: number) => DeckCard | undefined, options: { ownership?: boolean } = {}): DeckProblem[] {
  const out: DeckProblem[] = [], { mainMin, mainMax, extraMax, sideMax, copies } = DECK_RULES;
  if (deck.main.length < mainMin || deck.main.length > mainMax) out.push({ rule: 'size', message: `Main Deck has ${deck.main.length} cards (${mainMin} to ${mainMax} allowed).` });
  if (deck.extra.length > extraMax) out.push({ rule: 'size', message: `Fusion Deck has ${deck.extra.length} cards (at most ${extraMax}).` });
  if (deck.side.length > sideMax) out.push({ rule: 'size', message: `Side Deck has ${deck.side.length} cards (at most ${sideMax}).` });
  const all = [...deck.main, ...deck.extra, ...deck.side], uses = new Map<number, number>();
  for (const pc of all) uses.set(pc, (uses.get(pc) ?? 0) + 1);
  const name = (pc: number) => lookup(pc)?.name ?? `Card ${pc}`;
  for (const pc of uses.keys()) if (!lookup(pc)) out.push({ rule: 'unknown', passcode: pc, message: `Card ${pc} is not a known card.` });
  for (const [zone, list, extra] of [['Main', deck.main, false], ['Fusion', deck.extra, true]] as const) {
    for (const pc of new Set(list)) {
      const card = lookup(pc); if (card?.extra === undefined || card.extra === extra) continue;
      out.push({ rule: 'zone', passcode: pc, message: extra ? `${card.name} is not a Fusion monster and cannot be in the Fusion Deck.` : `${card.name} is a Fusion monster and belongs in the Fusion Deck.` });
    }
  }
  // Alternate arts share a name and count together, as the original grouped them by card.
  const groups = new Map<string, { passcode: number; count: number; limit?: number; allowed: boolean }>();
  for (const [pc, n] of uses) {
    const card = lookup(pc); if (!card) continue;
    const group = groups.get(card.name) ?? { passcode: pc, count: 0, allowed: true };
    group.count += n; group.allowed &&= card.deckAllowed !== false;
    if (card.limit !== undefined) group.limit = Math.min(group.limit ?? 3, card.limit);
    groups.set(card.name, group);
  }
  for (const [cardName, g] of groups) {
    if (!g.allowed) out.push({ rule: 'not-deckable', passcode: g.passcode, message: `${cardName} cannot be used in a deck.` });
    else if (g.limit === 0) out.push({ rule: 'forbidden', passcode: g.passcode, message: `${cardName} is Forbidden.` });
    else if (g.limit !== undefined && g.limit < copies && g.count > g.limit) out.push({ rule: 'limited', passcode: g.passcode, message: `${cardName} is ${g.limit === 1 ? 'Limited' : 'Semi-Limited'}: ${g.count} copies, at most ${g.limit}.` });
    else if (g.count > copies) out.push({ rule: 'copies', passcode: g.passcode, message: `${cardName}: ${g.count} copies, at most ${copies}.` });
  }
  if (options.ownership !== false) for (const [pc, n] of uses) {
    const owned = lookup(pc)?.owned;
    if (owned !== undefined && n > owned) out.push({ rule: 'owned', passcode: pc, message: `${name(pc)}: ${n} in the deck, ${owned} owned.` });
  }
  return out;
}
