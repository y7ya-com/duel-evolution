// The box shop's view model (pure: no DOM; node-tested in boxes_test.mjs): what each screen shows, derived from the
// cosmetics state (cosmetics/api.js getInfo: GET /api/de/cosmetics; server/src/game/cosmetics.ts state()):
//   info.wallet { total, bound (starter MP, never spendable on boxes), earned }
//   info.boxes [{ id, name, kinds, price, superAt, ultraAt, configuredOdds, baseOdds, nextOdds, poolByRarity, pool, pity }]
//     pool [item + { baseChance, nextChance }] (an item: id, name, kind, rarity, slot, variants [{ gender, worlds }],
//     bodies, notice?, owned, copies, compatible); pity { superMisses, ultraMisses, superAt, ultraAt }
//   info.appearance { gender, world }
// Odds are percentages (cosmetics-catalog.ts oddsPercent). nextOdds already includes the player's pity.
import { RARITIES, RARITY, KIND_LABEL, WORLD_LABEL, BODY_LABEL, mp, mpDigits } from './theme.js';

/** The tabs, left to right (the server's ids; "hair" is the head box's former id). */
export const TABS = [
  { id: 'head', label: 'Head & Hair', short: 'Head & Hair' },
  { id: 'outfit', label: 'Outfit', short: 'Outfit' },
  { id: 'dueldisk', label: 'Duel Disk', short: 'Duel Disk' },
];
/** Each box's look: its category banner (cosmetics/shopart.js BANNER: the shop's own Avatar / Single Cards banners) and
 *  what its items are called. */
export const BOX_LOOK = {
  head: { banner: 'bnHead', unit: 'items', one: 'item' },
  outfit: { banner: 'bnOutfit', unit: 'outfits', one: 'outfit' },
  dueldisk: { banner: 'bnDisk', unit: 'disks', one: 'disk' },
};
/** Items per page of the showcase's strip (the native pack display's row). */
export const STRIP = 5;

/** "55%", "4%", "0.57%", "12.5%": whole numbers bare, under 1 two decimals, else one (trailing zeros dropped). */
export function pct(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0%';
  const s = Number.isInteger(v) ? String(v) : v < 1 ? v.toFixed(2) : v.toFixed(1);
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '%';
}

/** The pity bars, one per guarantee (the server's counters: getInfo's box.pity): `at` segments, `misses` of them filled
 *  (the opens in a row without that tier); the `at`th miss is guaranteed, so with at - 1 filled the next open lands it
 *  (next: the bar glows). [] if the box has none. */
export function pityMeters(box) {
  const p = box?.pity || {}, out = [];
  const meter = (key, at, misses) => {
    if (at == null) return;
    const done = Math.max(0, Math.min(at - 1, misses | 0)), left = at - done;
    out.push({ key, label: RARITY[key].label, at, misses: done, left, progress: done / at, next: left === 1, count: `${done}/${at}` });
  };
  meter('super', p.superAt ?? box?.superAt, p.superMisses);
  meter('ultra', p.ultraAt ?? box?.ultraAt, p.ultraMisses);
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
/** Who can wear it: "Both bodies", "Male body only for now", "Female body only for now". */
export function bodiesText(item) {
  const b = item?.bodies || [];
  if (b.length >= 2) return 'Both bodies';
  if (b.length === 1) return `${BODY_LABEL[b[0]] || b[0]} body only for now`;
  return '';
}
/** The short work-in-progress notice of an item made for one body so far: "Female version coming soon" ('' for both). */
export function wipNotice(item) {
  const b = item?.bodies || [];
  if (b.length !== 1) return '';
  return `${b[0] === 'male' ? 'Female' : 'Male'} version coming soon`;
}
/** A selected item's detail (the showcase's band): [name, "Ultra Rare outfit", the WIP notice or nothing]. */
export function itemLines(item) {
  if (!item) return [];
  const kind = (KIND_LABEL[item.kind] || item.kind || '').toLowerCase();
  return [item.name, `${RARITY[item.rarity]?.label || 'Common'} ${kind}`.trim(), wipNotice(item)].filter(Boolean);
}

/** The showcase's try-on of a box item on the player's waist-up bust (a preview only: nothing is saved). The player's
 *  look (the current world's, else the last saved) with the item's part put in its slot: the variant for this body,
 *  the current world's if it has one (a character has one look, worn in both worlds). An item this body can't wear:
 *  its art and the short body notice instead. -> { mode: 'bust', parts, gender, world } | { mode: 'art', notice } */
export function previewLook(info, item) {
  const a = info?.appearance || {}, gender = a.gender === 'female' || (!a.gender && a.parts?.[0] === 1) ? 'female' : 'male';
  const world = a.world === 1 ? 1 : 0;
  const vs = (item?.variants || []).filter(v => v.gender === gender);
  const v = vs.find(x => (x.worlds || []).includes(world)) || vs[0];
  if (!item || !v || item.compatible === false || item.slot == null) return { mode: 'art', notice: wipNotice(item) || `${BODY_LABEL[gender]} body can't wear it` };
  const saved = a.looks?.[String(world)] || a.parts;
  const parts = Array.isArray(saved) && saved.length >= 10 ? [...saved] : defaultParts(gender, world);
  parts[item.slot] = v.number;
  return { mode: 'bust', parts, gender, world };
}
// CAvatarData::setDefault (cosmetics/waistup.js DEFAULT_LOOK): the look of a character with none saved
const defaultParts = (gender, world) => [gender === 'female' ? 1 : 0, 0, 0x20, 0x30, 0x40, 0x60, world === 1 ? 0x80 : 0x70, 0x90,
  world === 1 ? 0xb8 : 0xb0, 0x20, 0, 0, 0, 0, 0, 0];

/** The strip's items: the whole pool, rarest first (the pool's own order within a rarity). */
export function stripItems(box) {
  const order = { ultra: 0, super: 1, rare: 2, common: 3 };
  return [...(box?.pool || [])].map((i, k) => [i, k]).sort((a, b) => (order[a[0].rarity] ?? 4) - (order[b[0].rarity] ?? 4) || a[1] - b[1]).map(x => x[0]);
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
  const disabled = box.available === false ? 'Closed for restocking'
    : short > 0 ? `Needs ${short.toLocaleString('en-US')} more earned MP` : '';
  const ultra = pool.find(i => i.rarity === 'ultra') || pool.find(i => i.rarity === 'super') || null;
  return { id, box, wallet, tab: TABS.find(t => t.id === id), look: BOX_LOOK[id] || BOX_LOOK.head,
    name: box.name, price: box.price, priceText: mp(box.price), priceDigits: mpDigits(box.price), affordable: !disabled, short, disabled,
    count: pool.length, owned, unit: (BOX_LOOK[id] || BOX_LOOK.head).unit,
    hero: ultra, featured: featured(box), items: stripItems(box), odds: oddsBar(box), pityOn: pityActive(box), pity: pityMeters(box),
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
    // copies: the spares after this one (the first duplicate makes 1): you hold copies + 1
    dupText: r.duplicate ? `Duplicate ×${copies + 1}` : '',
    // the short "other version coming soon" notice is for a body that can't wear it, not for the one that can
    notice: !(gender && (r.bodies || []).includes(gender)) ? wipNotice(r) : '', compatible: r.compatible !== false,
    // the reveal's pace: commons quick, ultras the long, special one (the gold frame and its one sheen)
    tempo: rarity === 'common' ? 'quick' : rarity === 'ultra' ? 'special' : 'normal',
    anticipation: rarity === 'common' ? 700 : rarity === 'ultra' ? 1500 : 1250,
  };
}
