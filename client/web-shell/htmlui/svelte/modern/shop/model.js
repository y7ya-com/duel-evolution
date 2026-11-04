// Modern shop labels supplement the native shop geometry. They never route input,
// choose prices, or invent a second cart: the original controls keep those jobs.
export { SHOP_CLASSES } from '../../../shop-classes.js';
const clean = text => String(text || '').replace(/@>\d+\//g, ' ').replace(/@[0-9a-f]/gi, '').replace(/@n/g, '\n').trim();
const sprites = win => [...win.parts?.sprites || [], ...(win.controls || []).flatMap(c => c.parts?.sprites || [])]
  .filter(s => s.shown !== false && (s.a ?? 1) > 0 && s.tex);
const CATEGORY = [
  [/shop_card_0[123]_c01\.png$/i, 'Single Cards'],
  [/shop_pack_0[123]_c01\.png$/i, 'Booster Packs'],
  [/shop_(?:akademia|domino)_avatar_0[123]_c01\.png$/i, 'Avatar Parts'],
];
export function annotations(win, db = globalThis.yo2Deck) {
  const labels = [];
  if (win.cls === 'CShopCategoryWindow') {
    const seen = new Set();
    for (const s of sprites(win)) {
      const category = CATEGORY.find(([pattern]) => pattern.test(s.tex));
      if (!category || seen.has(category[1])) continue;
      seen.add(category[1]);
      // The original category picture has its visible112px-high banner at source24,29.
      const sx = s.sx ?? 1, sy = s.sy ?? 1;
      labels.push({ key: category[1], kind: 'category', text: category[1],
        x: (s.wx ?? s.x) + 36 * sx, y: (s.wy ?? s.y) + 105 * sy,
        w: 352 * sx, h: 29 * sy });
    }
  }
  if (['CShopCardWindow', 'CShopPackWindow'].includes(win.cls)) {
    for (const item of win.items || []) {
      const name = clean(item.name || (item.type === 0 ? db?.card?.(item.param)?.name : ''));
      if (!name) continue;
      // read/shop.js pins the original two rows of five, with80×116 artwork.
      // The name fits in the original gap beneath that artwork and above its price strip.
      const slot = item.slot;
      if (!Number.isInteger(slot) || slot < 0 || slot >= 10) continue;
      labels.push({ key: `item-${item.itemId}-${slot}`, kind: 'product', text: name,
        x: 297 + 98 * (slot % 5), y: 262 + 240 * Math.floor(slot / 5), w: 88, h: 54 });
    }
  }
  return labels;
}
