import type { CardView, DeckView, DeckZone } from './contracts';

/** Original storage limits, independently checked again by the authenticated server. */
export const DECK_LIMITS: Readonly<Record<DeckZone, number>> = { main: 80, side: 15, extra: 30 };
export const MAX_DECK_IMPORT_BYTES = 64 * 1024;
export type DeckCardType = 'all' | 'monster' | 'normal' | 'effect' | 'fusion' | 'ritual' | 'spell' | 'trap';
export type DeckSort = 'type' | 'name' | 'level' | 'attack' | 'defense' | 'passcode' | 'collection';
export interface DeckFilters {
  query: string; type: DeckCardType; attributes: string[]; race: string; ownedOnly: boolean;
  level: [number, number]; attack: [string, string]; defense: [string, string]; sort: DeckSort;
}
export const defaultDeckFilters = (): DeckFilters => ({ query: '', type: 'all', attributes: [], race: '', ownedOnly: true, level: [0, 12], attack: ['', ''], defense: ['', ''], sort: 'type' });
const kinds: Readonly<Record<Exclude<DeckCardType, 'all' | 'monster'>, readonly number[]>> = { normal: [0, 10], effect: [1, 6, 7, 8, 9, 11, 12], fusion: [2, 3], ritual: [4, 5], spell: [13], trap: [14] };
export function cardKind(card: CardView): Exclude<DeckCardType, 'all' | 'monster'> | 'unknown' {
  if (card.kind !== undefined) return (Object.entries(kinds).find(([, ids]) => ids.includes(card.kind!))?.[0] as Exclude<DeckCardType, 'all' | 'monster'> | undefined) ?? 'unknown';
  const t = (card.type ?? '').toLowerCase();
  if (t.includes('spell')) return 'spell'; if (t.includes('trap')) return 'trap'; if (t.includes('fusion') || card.extra) return 'fusion';
  if (t.includes('ritual')) return 'ritual'; if (t.includes('normal')) return 'normal'; if (t.includes('monster') || t.includes('effect')) return 'effect';
  return 'unknown';
}
export function cardGroup(card: CardView): 'monster' | 'spell' | 'trap' | 'unknown' {
  const kind = cardKind(card); return kind === 'spell' || kind === 'trap' || kind === 'unknown' ? kind : 'monster';
}
const ordinal = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const normalizeCardSearch = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Search ranking mirrors the existing modern deck editor: exact/name matches before description matches. */
export function cardSearchRank(card: CardView, query: string): number {
  const q = normalizeCardSearch(query); if (!q) return 0;
  if (card.passcode !== undefined && String(card.passcode) === q) return 0;
  const name = normalizeCardSearch(card.name), words = q.split(' ');
  if (name === q) return 0; if (name.startsWith(q)) return 1; if (` ${name}`.includes(` ${q}`)) return 2;
  if (name.includes(q)) return 3; if (words.every(w => name.includes(w))) return 4;
  const flat = q.replace(/ /g, '');
  if (flat.length >= 2 && name.split(' ').map(w => w[0]).join('').startsWith(flat)) return 4.5;
  if (flat.length >= 3) {
    let i = 0, gaps = 0, last = -1;
    for (let k = 0; k < name.length && i < flat.length; k++) if (name[k] === flat[i]) { if (last >= 0 && k > last + 1) gaps++; last = k; i++; }
    if (i === flat.length && gaps <= flat.length / 2) return 5 + gaps / 100;
  }
  return words.every(w => normalizeCardSearch(card.description ?? '').includes(w)) ? 9 : -1;
}
const num = (value: string): number | null => value.trim() === '' ? null : Number(value);
const byName = (a: CardView, b: CardView) => ordinal(a.name, b.name) || (a.passcode ?? 0) - (b.passcode ?? 0);
export function compareDeckCards(a: CardView, b: CardView, sort: DeckSort): number {
  if (sort === 'name') return byName(a, b);
  if (sort === 'passcode') return (a.passcode ?? 0) - (b.passcode ?? 0);
  if (sort === 'type') { const order = { monster: 0, spell: 1, trap: 2, unknown: 3 }; return order[cardGroup(a)] - order[cardGroup(b)] || (cardGroup(a) === 'monster' ? (b.level ?? -1) - (a.level ?? -1) || (b.attack ?? -1) - (a.attack ?? -1) : 0) || byName(a, b); }
  if (sort === 'collection') return 0;
  return (b[sort] ?? -1) - (a[sort] ?? -1) || (sort === 'level' ? (b.attack ?? -1) - (a.attack ?? -1) : 0) || byName(a, b);
}
export function deckCollection(cards: readonly CardView[], filters: DeckFilters): CardView[] {
  const [alo, ahi, dlo, dhi] = [...filters.attack, ...filters.defense].map(num);
  if ([alo, ahi, dlo, dhi].some(n => n !== null && !Number.isFinite(n))) return [];
  const ranged = filters.level[0] > 0 || filters.level[1] < 12 || [alo, ahi, dlo, dhi].some(n => n !== null);
  const found: { card: CardView; rank: number; index: number }[] = [];
  cards.forEach((card, index) => {
    if (filters.ownedOnly && !(card.owned && card.owned > 0)) return;
    if (filters.type !== 'all' && (filters.type === 'monster' ? cardGroup(card) !== 'monster' : cardKind(card) !== filters.type)) return;
    if (filters.attributes.length && !filters.attributes.includes(String(card.attribute ?? ''))) return;
    if (filters.race && String(card.race ?? '') !== filters.race) return;
    if (ranged && (cardGroup(card) !== 'monster' || card.level === undefined || card.level < filters.level[0] || card.level > filters.level[1]
      || alo !== null && (card.attack === undefined || card.attack < alo) || ahi !== null && (card.attack === undefined || card.attack > ahi)
      || dlo !== null && (card.defense === undefined || card.defense < dlo) || dhi !== null && (card.defense === undefined || card.defense > dhi))) return;
    const rank = cardSearchRank(card, filters.query); if (rank >= 0) found.push({ card, rank, index });
  });
  found.sort((a, b) => (filters.query && filters.sort === 'type' ? a.rank - b.rank : 0) || compareDeckCards(a.card, b.card, filters.sort) || a.index - b.index);
  return found.map(v => v.card);
}
export function reorderDeckCards(cards: readonly number[], fromIndex: number, toIndex: number): number[] {
  if (![fromIndex, toIndex].every(n => Number.isSafeInteger(n) && n >= 0 && n < cards.length)) throw new Error('That card position is no longer available.');
  const next = [...cards], [card] = next.splice(fromIndex, 1); next.splice(toIndex, 0, card); return next;
}
const validName = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && [...value].length <= 40 && !/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(value);
export function validateImportedDeck(value: unknown): DeckView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a deck object.');
  const input = value as Record<string, unknown>; if (!validName(input.name)) throw new Error('Deck name must be nonempty and file-safe, at most 40 characters.');
  const result: DeckView = { name: input.name, main: [], side: [], extra: [] };
  for (const zone of ['main', 'side', 'extra'] as const) {
    const cards = input[zone] ?? []; if (!Array.isArray(cards) || cards.length > DECK_LIMITS[zone] || !cards.every(c => Number.isSafeInteger(c) && c > 0 && c < 0xffffff00)) throw new Error(`Invalid ${zone} deck card list or storage capacity.`);
    result[zone] = [...cards] as number[];
  }
  return result;
}
export function parseDeckImport(text: string, nameHint = 'Imported Deck'): DeckView {
  if (new TextEncoder().encode(text).length > MAX_DECK_IMPORT_BYTES) throw new Error('Deck file exceeds 64 KiB.');
  const normalized = text.replace(/^\uFEFF/, '').trim();
  if (normalized.startsWith('{')) { try { return validateImportedDeck(JSON.parse(normalized)); } catch (e) { throw new Error(e instanceof SyntaxError ? 'Invalid deck JSON.' : (e as Error).message); } }
  const deck: DeckView = { name: validName(nameHint) ? nameHint : 'Imported Deck', main: [], side: [], extra: [] };
  let section: DeckZone | null = null, seenMain = false;
  for (const line of normalized.split(/\r?\n/)) {
    const token = line.trim(); if (!token) continue;
    if (token === '#main') { section = 'main'; seenMain = true; continue; } if (token === '#extra') { section = 'extra'; continue; } if (token === '!side') { section = 'side'; continue; }
    if (token.startsWith('#created by') || token.startsWith('#name ')) continue;
    if (/^[#!]/.test(token)) throw new Error(`Unknown deck section: ${token.slice(0, 32)}`);
    if (!section || !/^\d{1,10}$/.test(token)) throw new Error('Expected a YDK card passcode after a section marker.');
    deck[section].push(Number(token)); if (deck[section].length > DECK_LIMITS[section]) throw new Error(`${section} deck exceeds storage capacity.`);
  }
  if (!seenMain) throw new Error('Expected YDK #main or a deck JSON object.'); return validateImportedDeck(deck);
}
export function serializeDeck(deck: DeckView, format: 'ydk' | 'json'): string {
  const checked = validateImportedDeck(deck); if (format === 'json') return JSON.stringify(checked, null, 2) + '\n';
  return ['#created by Duel Evolution', '#main', ...checked.main.map(String), '#extra', ...checked.extra.map(String), '!side', ...checked.side.map(String), ''].join('\n');
}

/** A sideboard edit never changes the match's original card pool or Fusion cards. */
export function sideboardDifference(deck: DeckView, original: DeckView): string | null {
  for (const zone of ['main', 'side', 'extra'] as const) if (deck[zone].length !== original[zone].length) return 'Restore the original Main, Side and Fusion counts before continuing.';
  const same = (a: readonly number[], b: readonly number[]) => { const counts = new Map<number, number>(); for (const id of a) counts.set(id, (counts.get(id) ?? 0) + 1); for (const id of b) { const n = counts.get(id); if (!n) return false; if (n === 1) counts.delete(id); else counts.set(id, n - 1); } return counts.size === 0; };
  if (!same(deck.extra, original.extra)) return 'Fusion cards cannot be changed between match games.';
  if (!same([...deck.main, ...deck.side], [...original.main, ...original.side])) return 'Only cards from the original Main and Side Decks may be exchanged.';
  return null;
}
