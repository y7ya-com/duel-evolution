// The box shop's view model (pure: no DOM; node-tested in boxes_test.mjs): what each screen shows, derived from the
// cosmetics state (cosmetics/api.js getInfo: GET /api/de/cosmetics; server/src/game/cosmetics.ts state()):
//   info.wallet { total, bound (starter MP, never spendable on boxes), earned }
//   info.boxes [{ id, name, kinds, price, superAt, ultraAt, configuredOdds, baseOdds, nextOdds, poolByRarity, pool, pity }]
//     pool [item + { baseChance, nextChance }] (an item: id, name, kind, rarity, slot, variants [{ gender, worlds }],
//     bodies, notice?, owned, copies, compatible); pity { superMisses, ultraMisses, superAt, ultraAt }
//   info.appearance { gender, world }
// Odds are percentages (cosmetics-catalog.ts oddsPercent). nextOdds already includes the player's pity.
import { RARITIES, RARITY, KIND_LABEL, WORLD_LABEL, mp } from './theme.js';

/** The tabs, left to right (the server's ids; "hair" is the head box's former id). */
export const TABS = [
  { id: 'head', label: 'Head & Hair', short: 'Head & Hair' },
  { id: 'outfit', label: 'Outfit', short: 'Outfit' },
  { id: 'dueldisk', label: 'Duel Disk', short: 'Duel Disk' },
];
/** Each box's look: the box's colours (its body, lid, trim) and the word on its front. */
export const BOX_LOOK = {
  head: { word: 'HEAD & HAIR', body: ['#2a6fb0', '#3d95dc', '#1d4f86'], trim: '#9fe6ff', glow: '#7fdcff', unit: 'items' },
  outfit: { word: 'OUTFIT', body: ['#6a2fa6', '#8f4fd6', '#47207a'], trim: '#e2c8ff', glow: '#c9a2ff', unit: 'outfits' },
  dueldisk: { word: 'DUEL DISK', body: ['#a3361d', '#d9572c', '#6f2412'], trim: '#ffd2a8', glow: '#ffb37a', unit: 'disks' },
};

/** "55%", "4%", "0.57%", "12.5%": whole numbers bare, under 1 two decimals, else one (trailing zeros dropped). */
export function pct(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0%';
  const s = Number.isInteger(v) ? String(v) : v < 1 ? v.toFixed(2) : v.toFixed(1);
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '%';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** The two pity meters: how many opens until the guarantee (the Nth miss is guaranteed). [] if the box has none. */
export function pityMeters(box) {
  const p = box?.pity || {}, out = [];
  const meter = (key, at, misses, label) => {
    if (at == null) return;
    const done = Math.max(0, Math.min(at - 1, misses | 0)), left = at - done;
    out.push({ key, label, at, misses: done, left, progress: done / (at - 1 || 1), next: left === 1,
      text: left === 1 ? 'next open!' : `in ${plural(left, 'open', 'opens')}` });
  };
  meter('super', p.superAt ?? box?.superAt, p.superMisses, 'Super Rare or better');
  meter('ultra', p.ultraAt ?? box?.ultraAt, p.ultraMisses, 'Ultra Rare guaranteed');
  return out;
}

/** The drop-rate bar: one segment per rarity with a chance, next-open odds (pity included) beside the base ones. */
export function oddsBar(box) {
  const base = box?.baseOdds || box?.configuredOdds || {}, next = box?.nextOdds || base;
  return RARITIES.map(r => ({ rarity: r, label: RARITY[r].label, base: base[r] || 0, next: next[r] || 0,
    count: box?.poolByRarity?.[r]?.count ?? (box?.pool || []).filter(i => i.rarity === r).length }))
    .filter(s => s.base > 0 || s.next > 0);
}
/** Whether pity changes the next open (then the bar shows nextOdds). */
export const pityActive = box => RARITIES.some(r => Math.abs((box?.nextOdds?.[r] ?? 0) - (box?.baseOdds?.[r] ?? 0)) > 1e-9);

/** Where an item can be worn, for the body that can wear it (the player's if they can): "Domino City", "both worlds". */
export function worldsText(item, gender) {
  const vs = (item?.variants || []).filter(v => !gender || v.gender === gender);
  const ws = [...new Set((vs.length ? vs : item?.variants || []).flatMap(v => v.worlds || []))].sort();
  if (ws.length >= 2) return 'both worlds';
  return ws.length ? WORLD_LABEL[ws[0]] || `world ${ws[0]}` : '';
}
/** The world to equip an item in: the character's own if the item is worn there, else the one it is worn in (an
 *  outfit for Domino City put on from the Academy). -> { world, here } or null (this body can't wear it anywhere). */
export function wearWorld(item, gender, world) {
  const ws = [...new Set((item?.variants || []).filter(v => !gender || v.gender === gender).flatMap(v => v.worlds || []))].sort();
  if (!ws.length) return null;
  return ws.includes(world) ? { world, here: true } : { world: ws[0], here: false };
}
/** Who can wear it: "both bodies", "♂ only for now", "♀ only for now". */
export function bodiesText(item) {
  const b = item?.bodies || [];
  if (b.length >= 2) return 'both bodies';
  if (b.length === 1) return `${b[0] === 'male' ? '♂ male' : '♀ female'} only for now`;
  return '';
}

/** The featured items (the hero's sides): the ultras first, then the supers, up to n. */
export function featured(box, n = 4) {
  const pool = box?.pool || [];
  const pick = r => pool.filter(i => i.rarity === r);
  return [...pick('ultra'), ...pick('super')].slice(0, n);
}

/** The pool grouped by rarity, rarest first, each item with its chance and ownership. */
export function contents(box) {
  const pool = box?.pool || [];
  return [...RARITIES].reverse().map(r => {
    const items = pool.filter(i => i.rarity === r);
    const odds = box?.baseOdds?.[r] ?? box?.poolByRarity?.[r]?.odds ?? 0;
    return { rarity: r, label: RARITY[r].label, odds, each: items.length ? odds / items.length : 0,
      owned: items.filter(i => i.owned).length,
      items: items.map(i => ({ ...i, chance: i.baseChance ?? (items.length ? odds / items.length : 0) })) };
  }).filter(g => g.items.length);
}

/** Box screen 1: everything the showcase shows for box `id`. */
export function boxView(info, id) {
  const box = info?.boxes?.find(b => b.id === id) || null;
  const wallet = info?.wallet || { total: 0, bound: 0, earned: 0 };
  if (!box) return { id, box: null, wallet, tab: TABS.find(t => t.id === id), look: BOX_LOOK[id] || BOX_LOOK.head };
  const pool = box.pool || [], owned = pool.filter(i => i.owned).length;
  const short = Math.max(0, box.price - (wallet.earned || 0));
  const disabled = box.available === false ? 'This box is closed for now while its items are restocked.'
    : short > 0 ? `You need ${short.toLocaleString('en-US')} more earned MP. Starter MP can't be spent on boxes: win duels to earn more.` : '';
  const ultra = pool.find(i => i.rarity === 'ultra') || pool.find(i => i.rarity === 'super') || null;
  return { id, box, wallet, tab: TABS.find(t => t.id === id), look: BOX_LOOK[id] || BOX_LOOK.head,
    name: box.name, price: box.price, priceText: mp(box.price), affordable: !disabled, short, disabled,
    count: pool.length, owned, unit: (BOX_LOOK[id] || BOX_LOOK.head).unit,
    hero: ultra, featured: featured(box), odds: oddsBar(box), pityOn: pityActive(box), pity: pityMeters(box),
    notice: box.notice || '' };
}

/** The reveal's result card: the reward as the server returns it (item + { duplicate }, owned, copies, compatible). */
export function revealView(reward, gender) {
  const r = reward || {};
  const rarity = RARITIES.includes(r.rarity) ? r.rarity : 'common';
  const copies = r.copies | 0;
  return {
    item: r, id: r.id, name: r.name || 'Mystery item', rarity, label: RARITY[rarity].label,
    kind: KIND_LABEL[r.kind] || r.kind || '', bodies: r.bodies || [], bodiesText: bodiesText(r),
    worlds: worldsText(r, r.compatible === false ? null : gender),
    isNew: !r.duplicate, duplicate: !!r.duplicate, copies,
    dupText: r.duplicate ? `Duplicate: +1 tradable copy (you now have ${copies})` : '',
    // the "other version is still being made" notice is for a body that can't wear it, not for the one that can
    notice: r.notice && !(gender && (r.bodies || []).includes(gender)) ? r.notice : '', compatible: r.compatible !== false,
    // the reveal's pace: commons quick, ultras the long, special one (sparkles, gold frame)
    tempo: rarity === 'common' ? 'quick' : rarity === 'ultra' ? 'special' : 'normal',
    anticipation: rarity === 'common' ? 700 : rarity === 'ultra' ? 1500 : 1250,
  };
}
