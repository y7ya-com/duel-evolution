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
/** Zone centres on the original 1024x768 duel screen, measured from its zone sheet: the opponent's half is drawn at
 * (256,50), the player's at (256,282). Monster and spell cells are 76x104 from x=320; piles sit in the side columns. */
export const FIELD_LAYOUT = {
  cellX: (index: number) => 358 + 76 * index,
  rows: { monster: [368, 217], spell: [473, 113] } as const,
  piles: {
    deck: [[736, 488], [288, 98]], graveyard: [[736, 406], [288, 180]], banished: [[736, 324], [288, 262]],
    field: [[288, 406], [736, 180]], extra: [[288, 488], [736, 98]],
  } as const,
};
export function fieldCardPosition(card: DuelCardView, handCount: number): CardPosition {
  const side = card.controller === 1 ? 1 : 0;
  let x: number, y: number, width = 58, height = 84;
  const pile = (zone: keyof typeof FIELD_LAYOUT.piles) => { [x, y] = FIELD_LAYOUT.piles[zone][side]; width = 48; height = 70; };
  switch (card.zone) {
    case 'hand': {
      const span = Math.min(560, Math.max(0, handCount - 1) * 76);
      x = 512 - span / 2 + (handCount > 1 ? card.index * span / (handCount - 1) : 0);
      y = side ? 24 : 604; width = 72; height = 104;
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
export function safeImageUrl(url: string | undefined): string | null {
  if (!url || /[\u0000-\u0020]/.test(url)) return null;
  // Asset URLs may be server-relative, https or locally served http; never executable/data HTML schemes.
  return /^(?:https?:\/\/|blob:https?:\/\/|\/[^/]|\.\.?\/)/i.test(url) ? url : null;
}
