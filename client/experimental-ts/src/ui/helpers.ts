import type { CardView, DuelCardView, DuelPromptView, DuelResponse, DeckView, DeckZone } from './contracts';

/** All world and field coordinates are in the original game's 1024 × 768 space. */
export function gamePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, width = 1024, height = 768): { x: number; y: number } | null {
  if (!(rect.width > 0 && rect.height > 0) || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const x = (clientX - rect.left) * width / rect.width, y = (clientY - rect.top) * height / rect.height;
  if (x < 0 || x > width || y < 0 || y > height) return null;
  return { x: Math.round(x), y: Math.round(y) };
}
export function filterCollection(cards: readonly CardView[], query: string, type = 'all', ownedOnly = true): CardView[] {
  const q = query.trim().toLowerCase();
  return cards.filter(card => (!ownedOnly || (card.owned ?? 0) > 0)
    && (type === 'all' || card.type === type)
    && (!q || `${card.name} ${card.passcode ?? ''} ${card.description ?? ''}`.toLowerCase().includes(q)));
}
export type CollectionSort = 'collection' | 'name' | 'level' | 'attack' | 'defense' | 'passcode';
export function sortCollection(cards: readonly CardView[], mode: CollectionSort): CardView[] {
  const result = [...cards]; if (mode === 'collection') return result;
  const ordinal = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return result.sort((a, b) => {
    if (mode === 'name') return ordinal(a.name.toLowerCase(), b.name.toLowerCase()) || (a.passcode ?? 0) - (b.passcode ?? 0);
    if (mode === 'passcode') return (a.passcode ?? 0) - (b.passcode ?? 0);
    const av = a[mode], bv = b[mode];
    if (av === undefined || av < 0) return bv === undefined || bv < 0 ? (a.passcode ?? 0) - (b.passcode ?? 0) : 1;
    if (bv === undefined || bv < 0) return -1;
    return bv - av || (a.passcode ?? 0) - (b.passcode ?? 0);
  });
}
export function copiesInDeck(deck: DeckView, passcode: number): number {
  return (['main', 'side', 'extra'] as const).reduce((n, zone) => n + deck[zone].filter(id => id === passcode).length, 0);
}
/** Local feedback only: server remains authoritative for legality and inventory. */
export function deckPlacementReason(card: CardView, zone: DeckZone, deck: DeckView): string | null {
  if (card.passcode === undefined) return 'This card has no playable identifier.';
  if (zone === 'extra' && !card.extra) return 'This card belongs in the Main or Side Deck.';
  if (zone !== 'extra' && card.extra) return 'This card belongs in the Fusion Deck.';
  if (deck[zone].length >= (zone === 'main' ? 80 : zone === 'side' ? 15 : 30)) return 'This deck section is full.';
  const copies = copiesInDeck(deck, card.passcode);
  if (copies >= (card.owned ?? 0)) return 'Every owned copy is already in this deck.';
  if (copies >= Math.min(3, card.limit ?? 3)) return 'The copy limit for this card has been reached.';
  return null;
}
export function validatePromptResponse(prompt: DuelPromptView, response: DuelResponse): string | null {
  if ('cancel' in response) return prompt.cancelable ? null : 'This selection cannot be cancelled.';
  if ('optionId' in response) return prompt.options.some(o => o.id === response.optionId && !o.disabled) ? null : 'Choose an available option.';
  if ('optionIds' in response) {
    if (prompt.kind !== 'attributes') return 'This prompt does not accept multiple options.';
    if (new Set(response.optionIds).size !== response.optionIds.length) return 'A choice cannot be selected twice.';
    if (response.optionIds.length < (prompt.min ?? 1) || response.optionIds.length > (prompt.max ?? 1)) return 'Choose the required number of attributes.';
    return response.optionIds.every(id => prompt.options.some(o => o.id === id && !o.disabled)) ? null : 'One of these options is no longer available.';
  }
  if ('cardIds' in response) {
    if (!['cards', 'announce'].includes(prompt.kind)) return 'This prompt does not accept card selections.';
    if (new Set(response.cardIds).size !== response.cardIds.length) return 'A choice cannot be selected twice.';
    if (response.cardIds.length < (prompt.min ?? 0) || response.cardIds.length > (prompt.max ?? prompt.candidates?.length ?? 0)) return 'Choose the required number of cards.';
    return response.cardIds.every(id => prompt.candidates?.some(c => c.id === id && !c.disabled)) ? null : 'One of these choices is no longer available.';
  }
  if ('number' in response) return prompt.kind === 'number' && Number.isSafeInteger(response.number)
    && response.number >= (prompt.numberMin ?? 0) && response.number <= (prompt.numberMax ?? 0x7fffffff) ? null : 'Enter an available number.';
  if ('text' in response) return prompt.kind === 'announce' && response.text.trim() ? null : 'Enter a valid announcement.';
  return 'Unsupported response.';
}
export interface CardPosition { x: number; y: number; width: number; height: number; rotate: boolean; }
/** Field geometry is presentational; controller and zone come only from authoritative state. */
/** Zone centres on the original 1024x768 duel screen, measured on live (de-scratch/hand): the player's half of the zone
 * sheet is drawn at (256,282), the opponent's at (256,54) (4.5 px lower than its plain 50 + 232: live's red lines at
 * y 65 / 170 / 273, the blue at 320 / 422 / 524). Monster and spell cells are 76 wide from x 322 (the cards' centres 360 +
 * 76 n); a card sits at its cell's centre, the piles in the side columns. */
export const FIELD_LAYOUT = {
  cellX: (index: number) => 360 + 76 * index,
  rows: { monster: [370, 222], spell: [474, 118] } as const,
  piles: {
    deck: [[736, 489], [288, 103]], graveyard: [[736, 406], [288, 185]], banished: [[736, 324], [288, 267]],
    field: [[288, 406], [736, 185]], extra: [[288, 489], [736, 103]],
  } as const,
};
/** Live's hands (the 2008 duel screen, measured at 1024 x 768): the player's faces 94 x 138 with their tops at 531 (over the
 * chat), the opponent's backs 100 x 146 with their bottoms at 72 (cut by the screen's top edge). Each hand is centred on
 * x 525, its cards 16 px apart (110.67 / 116 centre to centre) until the outer cards' centres would be more than 412
 * apart, then closer (they overlap, the right one over the left): 4 of the player's 110.67 apart, 5 at 103, 6 at 82.4. */
export const HAND_LAYOUT = {
  centre: 525, span: 412,
  own: { width: 94, height: 138, y: 600, stride: 110.67 },
  opponent: { width: 100, height: 146, y: -1, stride: 116 },
} as const;
/** The field's cards (live: 48 x 70 in a monster or spell cell, 50 x 72 on a pile and in the field zone). */
export const FIELD_CARD = { width: 48, height: 70 } as const, PILE_CARD = { width: 50, height: 72 } as const;
export function fieldCardPosition(card: DuelCardView, handCount: number): CardPosition {
  const side = card.controller === 1 ? 1 : 0;
  let x: number, y: number, width: number = FIELD_CARD.width, height: number = FIELD_CARD.height;
  const pile = (zone: keyof typeof FIELD_LAYOUT.piles) => { [x, y] = FIELD_LAYOUT.piles[zone][side]; width = PILE_CARD.width; height = PILE_CARD.height; };
  switch (card.zone) {
    case 'hand': {
      const h = side ? HAND_LAYOUT.opponent : HAND_LAYOUT.own;
      const stride = handCount > 1 ? Math.min(h.stride, HAND_LAYOUT.span / (handCount - 1)) : 0;
      x = HAND_LAYOUT.centre + (card.index - (Math.max(1, handCount) - 1) / 2) * stride;
      y = h.y; width = h.width; height = h.height;
      break;
    }
    case 'monster': x = FIELD_LAYOUT.cellX(card.index); y = FIELD_LAYOUT.rows.monster[side]; break;
    case 'spell': if (card.index === 5) pile('field'); else { x = FIELD_LAYOUT.cellX(card.index); y = FIELD_LAYOUT.rows.spell[side]; } break;
    default: pile(card.zone);
  }
  // The opponent's indexed rows are mirrored, while their hand remains readable left-to-right.
  if (side && (card.zone === 'monster' || card.zone === 'spell' && card.index !== 5)) x = 1024 - x!;
  return { x: x!, y: y!, width, height, rotate: card.position === 'defense' && card.zone === 'monster' };
}
/** One engine frame (1/30 s) of a hand card rising to (or dropping back from) its lifted place: the distance still to go
 *  goes to three quarters, rounded down to a pixel (32 / 24 / 18 / 13 / 9 / 6 / 4 / 3 / 2 / 1 / 0: live's 10 frames, filmed
 *  both ways on a 6-card hand). */
export function handLiftTick(lift: number, goal: number): number {
  const left = Math.abs(goal - lift);
  return goal + Math.sign(lift - goal) * Math.floor(left * 0.75);
}
export function safeImageUrl(url: string | undefined): string | null {
  if (!url || /[\u0000-\u0020]/.test(url)) return null;
  // Asset URLs may be server-relative, https or locally served http; never executable/data HTML schemes.
  return /^(?:https?:\/\/|blob:https?:\/\/|\/[^/]|\.\.?\/)/i.test(url) ? url : null;
}
