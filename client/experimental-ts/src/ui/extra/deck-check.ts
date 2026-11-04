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

/** The deck editor's Deck Check panel: a legal deck or each problem on its own line. */
export function renderDeckCheck(problems: readonly DeckProblem[]): HTMLElement {
  const root = document.createElement('section'); root.className = 'de-deck-check'; root.dataset.key = 'deck-check';
  root.setAttribute('aria-label', 'Deck check'); root.dataset.legal = String(!problems.length);
  const head = document.createElement('strong'); head.textContent = problems.length ? `Deck check: ${problems.length} problem${problems.length === 1 ? '' : 's'} · this deck cannot be used in a duel` : 'Deck check: legal for duels';
  root.append(head);
  if (problems.length) {
    const list = document.createElement('ul');
    for (const p of problems.slice(0, 40)) { const li = document.createElement('li'); li.textContent = p.message; li.dataset.rule = p.rule; list.append(li); }
    if (problems.length > 40) { const li = document.createElement('li'); li.textContent = `…and ${problems.length - 40} more.`; list.append(li); }
    root.append(list);
  }
  return root;
}

export const DECK_CHECK_CSS = `
.de-deck-check { padding:4px 10px; border:1px solid #75a8c5; border-left:6px solid #2f9a53; background:#effcff; font-size:13px; max-height:96px; overflow:auto; flex:none; }
.de-deck-check[data-legal=false] { border-left-color:#c8402f; background:#fff5ef; }
.de-deck-check ul { margin:2px 0 0; padding-left:18px; }
/* The collection grid keeps room for cards when the filters are open (they scroll instead). */
.de-collection { overflow:auto; }
.de-collection > .de-scroll { min-height:120px; }
.de-collection > .de-deck-filters[open] { max-height:130px; }
`;
