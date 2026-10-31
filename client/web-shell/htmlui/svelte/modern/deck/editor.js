// The modern deck editor's logic (Editor.svelte), no DOM: the cards' kinds, the trunk's filters and fuzzy search, the
// deck's sections and copy counts. A card is read/deck.js's yo2Deck entry ({ id, name, atk, def, kind, attr, level,
// race, limit }: CardDB.h's fields; atk / def -1 for "?").

// card kinds (CardDB.h kind; the trunk's categories, KabanWindowList.cpp kabanCategoryHas)
const KINDS = { normal: [0, 10], effect: [1, 6, 7, 8, 9, 11, 12], ritual: [4, 5], fusion: [2, 3], spell: [13], trap: [14] };
const kindOf = c => Object.keys(KINDS).find(k => KINDS[k].includes(c.kind)) || 'effect';
export const group = c => (c.kind === 13 ? 'spell' : c.kind === 14 ? 'trap' : 'monster');
export const isFusion = c => KINDS.fusion.includes(c.kind);
// the deck section a card goes to by default: Fusion monsters to the Fusion Deck, the rest to the Main Deck
export const home = c => (isFusion(c) ? 'extra' : 'main');
export const typeLine = c => group(c) === 'monster'
  ? ({ normal: 'Normal', effect: 'Effect', ritual: 'Ritual', fusion: 'Fusion' })[kindOf(c)] + ' Monster'
  : group(c) === 'spell' ? 'Spell' : 'Trap';

// the type filter's choices (text, never icons: the owner's rule)
export const TYPES = [['all', 'All'], ['monster', 'Monsters'], ['spell', 'Spells'], ['trap', 'Traps'], ['fusion', 'Fusion'], ['ritual', 'Ritual']];
const typeOk = (c, t) => t === 'all' || (t === 'monster' ? group(c) === 'monster' : t === 'spell' || t === 'trap' ? group(c) === t : kindOf(c) === t);

export const SORTS = [['type', 'Type'], ['name', 'Name'], ['atk', 'ATK'], ['def', 'DEF'], ['level', 'Level']];
const ORDER = { monster: 0, spell: 1, trap: 2 };
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const SORT = {
  type: (a, b) => ORDER[group(a)] - ORDER[group(b)] || (group(a) === 'monster' ? b.level - a.level || b.atk - a.atk : 0) || byName(a, b),
  name: byName,
  atk: (a, b) => b.atk - a.atk || byName(a, b),
  def: (a, b) => b.def - a.def || byName(a, b),
  level: (a, b) => b.level - a.level || b.atk - a.atk || byName(a, b),
};

// ---- fuzzy search over the names (and, past them, the card text): a rank per card, lower is better, -1 no match.
// Exact, then prefix, word prefix, substring, every word somewhere in the name, the words' initials, the letters in
// order (3+ letters, few gaps),
// and last the card text holding every word
export const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function rank(name, q, desc) {
  if (!q) return 0;
  const n = norm(name), words = q.split(' ');
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if ((' ' + n).includes(' ' + q)) return 2;
  if (n.includes(q)) return 3;
  if (words.every(w => n.includes(w))) return 4;
  const flat = q.replace(/ /g, '');
  if (flat.length >= 2 && n.split(' ').map(w => w[0]).join('').startsWith(flat)) return 4.5;   // initials: "bewd"
  if (flat.length >= 3) {
    let i = 0, gaps = 0, last = -1;
    for (let k = 0; k < n.length && i < flat.length; k++) if (n[k] === flat[i]) { if (last >= 0 && k > last + 1) gaps++; last = k; i++; }
    if (i === flat.length && gaps <= flat.length / 2) return 5 + gaps / 100;
  }
  if (desc) { const d = norm(desc()); if (words.every(w => d.includes(w))) return 9; }
  return -1;
}

// the trunk's view: filters (f: { q, type, attr: [], level: [lo, hi], atk: [lo, hi], def: [lo, hi], sort, owned })
// over the cards; have(id) the copies the player can still add (the trunk's count)
export const NO_FILTER = { q: '', type: 'all', attr: [], level: [0, 12], atk: ['', ''], def: ['', ''], sort: 'type', owned: true };
const num = v => (v === '' || v == null ? null : +v);
export function view(cards, f, have, desc) {
  const q = norm(f.q), lo = num(f.atk[0]), hi = num(f.atk[1]), dlo = num(f.def[0]), dhi = num(f.def[1]);
  const ranged = f.level[0] > 0 || f.level[1] < 12 || lo != null || hi != null || dlo != null || dhi != null;
  const out = [];
  for (const c of cards || []) {
    if (f.owned && !(have(c.id) > 0)) continue;
    if (!typeOk(c, f.type)) continue;
    if (f.attr.length && !f.attr.includes(c.attr)) continue;
    if (ranged) {   // the ranges are the monsters'
      if (group(c) !== 'monster' || c.level < f.level[0] || c.level > f.level[1]) continue;
      if ((lo != null && c.atk < lo) || (hi != null && c.atk > hi) || (dlo != null && c.def < dlo) || (dhi != null && c.def > dhi)) continue;
    }
    const r = rank(c.name, q, desc && (() => desc(c.id)));
    if (r < 0) continue;
    out.push([r, c]);
  }
  const s = SORT[f.sort] || SORT.type;
  out.sort((a, b) => (q && f.sort === 'type' ? a[0] - b[0] : 0) || s(a[1], b[1]));
  return out.map(x => x[1]);
}

// ---- the deck: the CWindowTaskDeck's grids (read/deck.js) as sections, and each card's copies across them
// [key, title, the engine's cap (DeckEntry.h DECK_*_MAX: a drop needs fewer)]
export const SECTIONS = [['main', 'Main Deck', 80], ['extra', 'Fusion Deck', 30], ['side', 'Side Deck', 15]];
export function copies(grids) {
  const n = new Map();
  for (const k of ['main', 'extra', 'side']) for (const id of grids?.[k] || []) n.set(id, (n.get(id) || 0) + 1);
  return n;
}
// why a card can't go in now ('' when it can): the copy limit (CardDB limit lists: 0 forbidden), none left to add,
// a full section
export function blocked(c, to, { inDeck = 0, left = 0, counts = {} }) {
  if (!c) return 'unknown';
  if (c.limit === 0) return 'Forbidden';
  if (inDeck >= c.limit) return c.limit === 3 ? 'Already 3 copies' : `Limited to ${c.limit}`;
  if (left <= 0) return 'No copies left';
  // DeckEntry.h deckDropAllowed: a Fusion monster only in the Fusion Deck, nothing else there
  if (to === 'extra' && !isFusion(c)) return 'Only Fusion monsters go here';
  if (to !== 'extra' && isFusion(c)) return 'Fusion monsters go to the Fusion Deck';
  const max = SECTIONS.find(s => s[0] === to)?.[2] ?? 80;
  if ((counts[to] || 0) >= max) return 'Section is full';
  return '';
}
