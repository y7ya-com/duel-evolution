// Crafting's rules as the player sees them, pure (no DOM, no fetch): what a card's Craft / Dismantle buttons say and
// whether they work, its locked copies and why, the crafting list's filters, and the result lines (toasts, the Secret
// Pack unlock). Every number comes from the server's view (GET /api/de/craft, crafting/api.js): prices and yields are
// server config, never written here. The server checks everything again; this only explains it before the press.
export const RARITIES = ['N', 'R', 'SR', 'UR'];
export const RARITY_NAME = { N: 'Normal', R: 'Rare', SR: 'Super Rare', UR: 'Ultra Rare' };
export const MAX_COPIES = 3;   // crafting stops at 3 copies owned (the server's copy-cap)
/** Crafting or dismantling a card of these rarities asks first. */
export const confirmRarity = r => r === 'SR' || r === 'UR';

export const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;

// why copies can't be dismantled, in the order the server takes them out: bound (Structure Deck, Beginner's Pack and
// soulbound copies: the server keeps them in one ledger), then the copies a saved deck still needs. Crafted copies
// trade and dismantle like any other (server SHARDS.craftedDismantlable): never a lock here
export const LOCKS = {
  bound: { short: 'bound', tag: 'Bound', long: "Structure Deck, Beginner's Pack and soulbound copies can't be dismantled." },
  deck: { short: 'in a saved deck', tag: 'In a deck', long: "Copies a saved deck uses can't be dismantled. Take them out of the deck first." },
};

/**
 * One card's crafting state. view: the server's view; pc: the passcode (number or string).
 * -> null when the server doesn't list the card (a token), else { pc, rarity, owned, locked, locks: [{ key, n, short,
 * long }], craft: { cost, ok, why }, dismantle: { gain, ok, why, max }, craftable, confirm }
 */
export function cardState(view, pc) {
  const c = view?.cards?.[String(pc)];
  if (!c) return null;
  const rarity = RARITIES.includes(c.rarity) ? c.rarity : 'N';
  const cost = view.values?.craft?.[rarity] ?? null, gain = view.values?.dismantle?.[rarity] ?? null;
  const owned = c.owned | 0, bound = Math.min(c.bound | 0, owned);
  const free = Math.max(0, c.dismantlable | 0);
  // what the deck lock keeps: the rest of the copies the other two locks don't explain
  const deck = Math.max(0, owned - bound - free);
  const locks = [['bound', bound], ['deck', deck]].filter(([, n]) => n > 0)
    .map(([key, n]) => ({ key, n, ...LOCKS[key] }));
  const shards = view.shards ?? 0;
  const craft = { cost, ok: false, why: '' };
  if (!c.craftable) craft.why = "Can't be crafted";
  else if (owned >= MAX_COPIES) craft.why = `${MAX_COPIES} owned`;
  else if (cost == null) craft.why = 'Unavailable';
  else if (shards < cost) craft.why = `Need ${fmt(cost - shards)} more`;
  else craft.ok = true;
  const dismantle = { gain, ok: false, why: '', max: free };
  if (!c.craftable && !owned) dismantle.why = "Can't be dismantled";
  else if (!owned) dismantle.why = 'None owned';
  else if (!free) dismantle.why = locks.length === 1 ? locks[0].tag : 'All locked';
  else if (gain == null) dismantle.why = 'Unavailable';
  else dismantle.ok = true;
  return { pc: Number(pc), rarity, owned, locked: owned - free, locks, craft, dismantle, craftable: !!c.craftable, confirm: confirmRarity(rarity) };
}

/** "Owned 2/3" (the craft cap shown up to it; past it just the count) */
export const ownedCount = s => `Owned ${s.owned}${s.owned <= MAX_COPIES ? `/${MAX_COPIES}` : ''}`;
/** "Owned 2/3 · 1 locked" */
export const ownedLine = s => !s ? '' : ownedCount(s) + (s.locked ? ` · ${s.locked} locked` : '');
/** "Locked: 1 bound, 2 in a saved deck" (empty when nothing is locked) */
export const lockLine = s => s?.locks?.length ? 'Locked: ' + s.locks.map(l => `${l.n} ${l.short}`).join(', ') : '';
/** The long reasons, one per kind of lock (a tooltip / the detail panel). */
export const lockReasons = s => (s?.locks || []).map(l => l.long);

// ---------------------------------------------------------------- the trunk's card pool
// The deck editor's trunk lists the cards owned; "All cards" widens it to every collectible card (the ones not owned
// at x000, dimmed, as the engine draws a card with none left), and Missing / Craftable narrow it. The engine does the
// listing (ovr/decksearch.c f.pool): this names the cards. CWindowTaskKabanList's categories (KabanWindowList.cpp
// kabanCategoryHas), by the card's kind (CardDB word 1 >> 1 & 0x1f): 0 normal, 1 effect, 2 spell, 3 trap,
// 4 ritual, 5 fusion, 6 all.
export function categoryHas(cat, kind) {
  switch (cat) {
    case 0: return kind === 0 || kind === 10;
    case 1: return [1, 6, 7, 8, 9, 11].includes(kind);
    case 2: return kind === 13;
    case 3: return kind === 14;
    case 4: return kind === 4 || kind === 5;
    case 5: return kind === 2 || kind === 3;
    default: return true;
  }
}
export const SHOW = [['', 'Any'], ['missing', 'Missing'], ['craftable', 'Craftable']];
/**
 * f.pool for Module.yo2KabanFilter: { mode, ids } (YO2 ids, ascending). pool: 'owned' | 'all'; show: '' | 'missing'
 * (none owned) | 'craftable' (can be crafted now); cat: the category chip. table: crafting/cards.js's; kindOf(id).
 * rarity: some of 'N' 'R' 'SR' 'UR' (any of them; a single string works too). Owned with nothing else: mode 0 (the engine's own list). All: mode 1 (every
 * collectible card added). Missing / Craftable / a rarity: mode 2 (only those; with Owned, only the cards owned).
 */
export function poolOf(view, table, kindOf, { pool = 'owned', show = '', cat = 6, rarity = [] } = {}) {
  const rar = [].concat(rarity || []);
  if (!view?.cards || !table || (pool !== 'all' && !show && !rar.length)) return { mode: 0, ids: [] };
  const ids = [];
  for (const pc of Object.keys(view.cards)) {
    const id = table.id(pc);
    if (!id || (cat !== 6 && !categoryHas(cat, kindOf(id)))) continue;
    const s = show || rar.length || pool !== 'all' ? cardState(view, pc) : null;
    if (rar.length && !rar.includes(s.rarity)) continue;
    if (show === 'missing' && s.owned > 0) continue;
    if (show === 'craftable' && !s.craft.ok) continue;
    if (pool !== 'all' && show !== 'missing' && !s.owned) continue;   // Owned: the cards owned only
    ids.push(id);
  }
  // only a list (mode 2) when something narrows it; All alone widens the engine's own (mode 1)
  return { mode: show || rar.length ? 2 : 1, ids: ids.sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- the Craft / Dismantle card modal
/**
 * How many copies the modal's stepper can take. kind 'make' | 'dismantle'; s: cardState; shards: the balance.
 * -> { max, limit } (limit: why it stops there: 'cap', 'shards', 'locked', 'owned')
 */
export function stepRange(kind, s, shards) {
  if (!s) return { max: 0, limit: '' };
  if (kind === 'dismantle') return { max: s.dismantle.ok ? s.dismantle.max : 0, limit: s.locked ? 'locked' : 'owned' };
  const room = Math.max(0, MAX_COPIES - s.owned), afford = s.craft.cost > 0 ? Math.floor((shards || 0) / s.craft.cost) : room;
  return s.craft.ok ? { max: Math.min(room, afford), limit: afford < room ? 'shards' : 'cap' } : { max: 0, limit: s.craft.why };
}
/** The modal's before / after for n copies: { owned: [a, b], shards: [a, b], delta } */
export function preview(kind, s, shards, n) {
  const make = kind === 'make', per = make ? s.craft.cost : s.dismantle.gain, delta = (make ? -1 : 1) * per * n;
  return { owned: [s.owned, s.owned + (make ? n : -n)], shards: [shards, shards + delta], delta };
}
/** The note under the stepper when it stops before the player might expect */
export function limitNote(kind, limit, max) {
  if (kind === 'make') return limit === 'shards' ? `You have Shards for ${max}.` : limit === 'cap' ? `You can own up to ${MAX_COPIES}.` : '';
  return limit === 'locked' ? `${max} can be dismantled.` : '';
}

// ---------------------------------------------------------------- results
/** "Unlocked 2 packs for 24h · 1 free pack added" ('' when a craft unlocked nothing). */
export function secretLine(secret) {
  const n = secret?.unlocked?.length || 0, free = secret?.freePacks?.length || 0;
  const parts = [];
  if (n) parts.push(`Unlocked ${plural(n, 'pack')} for 24h`);
  if (free) parts.push(`${plural(free, 'free pack')} added`);
  return parts.join(' · ');
}
/** The toast after a success: { title, detail, secret } (secret: the Secret Pack line, crafts only). name: the card's (make / dismantle). */
export function resultToast(out, name = '') {
  const delta = out?.shardDelta || 0, copies = Object.values(out?.changes || {}).reduce((a, b) => a + b, 0);
  const shards = `${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))} Shards`;
  if (out?.operation === 'make') return { title: `Crafted ${name || plural(copies, 'card')}`, detail: shards, secret: secretLine(out.secret) };
  if (out?.operation === 'dismantle') return { title: `Dismantled ${copies > 1 ? `${copies} × ` : ''}${name || 'card'}`, detail: shards };
  if (out?.operation === 'dismantle-extras') return { title: copies ? `Dismantled ${plural(copies, 'extra copy', 'extra copies')}` : 'Nothing to dismantle', detail: copies ? shards : '' };
  return { title: 'Done', detail: '' };
}

/** A dismantle-extras preview as rows: [{ pc, name, rarity, n, gain }] (most shards first) and the totals. */
export function extrasPreview(out, names) {
  const rows = Object.entries(out?.changes || {}).filter(([, n]) => n > 0).map(([pc, n]) => {
    const r = out.cards?.[pc]?.rarity, rarity = RARITIES.includes(r) ? r : 'N';
    return { pc: Number(pc), name: names.get(Number(pc)) || `Card #${pc}`, rarity, n, gain: n * (out.values?.dismantle?.[rarity] ?? 0) };
  }).sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name));
  return { rows, copies: rows.reduce((a, r) => a + r.n, 0), shards: out?.shardDelta ?? rows.reduce((a, r) => a + r.gain, 0),
    rare: rows.filter(r => confirmRarity(r.rarity)).length };
}
