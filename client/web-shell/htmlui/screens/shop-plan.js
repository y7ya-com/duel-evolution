// Pure original-shop geometry; separated from DOM drawing so tests require no browser or art.
export { SHOP_CLASSES } from '../shop-classes.js';
export const filename = s => (s.tex || '').split(/[\\/]/).pop().toLowerCase();
export const picture = s => /^data[\\/](?:cardpack|card|mini|avatar)[\\/]/i.test(s.tex || '')
  || /^shop_(?:card|pack|(?:akademia_|domino_)?avatar)_0[123]_c01\.png$/.test(filename(s)) && !/^shop_avatar_/.test(filename(s));
export const swf = s => !s.cls && !('tex' in s) && !('text' in s);
const rect = s => ({ x: s.wx ?? s.x ?? 0, y: s.wy ?? s.y ?? 0,
  w: (s.src?.[2] || s.w || 32) * (s.sx ?? 1), h: (s.src?.[3] || s.h || 32) * (s.sy ?? 1) });
export const visible = s => s.shown !== false && (s.a ?? 1) > 0;
const TITLES = ['Item Selection', 'Single Cards', 'Avatar Parts', 'Booster Packs'];
export const elements = win => win.hideIds?.length ? win.hideIds : [...(win.controls || []).map(c => c.id),
  ...['sprites', 'labels', 'swfs'].flatMap(k => (win.parts?.[k] || []).map(e => e.id))];

// Pure drawing plan, also used by the regression test. All rects are screen coordinates.
export function shopPlan(win) {
  const items = [], holes = [], seen = new Set();
  const add = (id, kind, r, z, data = {}) => {
    if (seen.has(id)) return; seen.add(id); items.push({ id, kind, rect: r, z, ...data });
  };
  const tree = (parts, ctl = null) => {
    for (const s of parts?.sprites || []) {
      if (!visible(s) || !s.tex) continue;
      const n = filename(s), r = rect(s), z = s.wz ?? 0;
      if (picture(s)) {
        // Category canvases are 512x256 with their painted rectangle at24,29,376,112. Their transparent padding must
        // not punch a512x256 hole through the new window. Pack/card artwork uses its complete source rectangle.
        const category = /^shop_(?:card|pack|(?:akademia_|domino_)avatar)_/.test(n);
        const kx = s.sx ?? 1, ky = s.sy ?? 1;
        holes.push({ z, rect: category ? { x: r.x + 24 * kx, y: r.y + 29 * ky, w: 376 * kx, h: 112 * ky } : r });
        continue;
      }
      if (/^shop_win_/.test(n)) add(s.id, 'frame', r, z);
      else if (/^shop_introduction_0[1-4]_[a-z]\.png$/.test(n)) add(s.id, 'title', { ...r, w: Math.min(r.w, 256), h: Math.min(r.h, 36) }, z, { text: TITLES[Number(n.match(/_0([1-4])_/)[1]) - 1] });
      else if (/^shop_money_/.test(n)) add(s.id, 'money', { ...r, w: Math.min(r.w, 224), h: Math.min(r.h, 82) }, z);
      else if (/^shop_pricetag_/.test(n)) {
        const variant = Number(n.match(/pricetag_(\d+)/)?.[1]);
        const state = ctl?.checked || [3, 5].includes(variant) ? 'pressed' : [2, 4].includes(variant) ? 'hover' : ctl?.state || 'normal';
        add(s.id, 'price', { ...r, y: r.y + 212 * (s.sy ?? 1), h: 42 * (s.sy ?? 1) }, z, { state });
        if (state === 'hover' || state === 'pressed') add(`${s.id}-corners`, 'selection',
          { ...r, y: r.y + 60 * (s.sy ?? 1), h: 144 * (s.sy ?? 1) }, z + .1);
      }
      else if (/^shop_btn1_0[1-4]_/.test(n)) add(s.id, 'key', { ...r, w: Math.min(r.w, 224), h: Math.min(r.h, 49) }, z, { state: ctl?.state || 'normal' });
      else if (/^shop_btn2_0[1-3]_/.test(n)) add(s.id, 'small-key', { ...r, w: Math.min(r.w, 110), h: Math.min(r.h, 28) }, z, { state: ctl?.state || 'normal' });
      else if (/^shop_avatar_0[1-4]_/.test(n)) add(s.id, 'row', { ...r, w: Math.min(r.w, 400), h: Math.min(r.h, 40) }, z, { state: /_0[23]_/.test(n) ? 'hover' : /_04_/.test(n) ? 'pressed' : 'normal' });
      else if (/^shop_arrow_\d+_/.test(n)) add(s.id, 'arrow', r, z, { direction: ['down', 'right', 'up', 'left'][Math.floor((Number(n.match(/arrow_(\d+)/)[1]) - 1) / 3)] });
      else if (/^shop_btn1_icon_0[12]_/.test(n)) add(s.id, 'arrow', r, z, { direction: n.includes('_01_') ? 'right' : 'left', pale: true });
      else if (n === 'shop_number_01_c01.png') {
        const glyph = Math.floor((s.src?.[1] || 0) / 16) * 8 + Math.floor((s.src?.[0] || 0) / 16);
        add(s.id, 'label', r, z, { text: '0123456789%MP@'[glyph] || '', px: 16, ink: '#000' });
      } else if (!/^shop_(?:scroll|flame|icon)|^scroll/.test(n)) {
        // Unexpected artwork keeps drawing until it has an explicit CSS equivalent. A missing UI atlas must never
        // turn a real product picture into an empty product slot.
        holes.push({ z, rect: r });
      }
    }
    for (const t of parts?.labels || []) {
      if (!visible(t) || !t.text) continue;
      const shadow = ctl?.name === 'CWindowTaskShadowTextのテキスト' || /ShadowText/.test(ctl?.cls || '');
      add(t.id, 'label', { x: t.wx ?? t.x, y: t.wy ?? t.y, w: ctl?.w || 512, h: ctl?.h || 32 }, t.wz ?? 0,
        { text: t.text, px: ctl?.fontSize || 16, align: ctl?.align || 0, ink: shadow ? '#fff' : '#000', alpha: t.a ?? 1 });
    }
    for (const f of parts?.swfs || []) if (visible(f)) holes.push({ z: f.wz ?? 0, rect: rect(f) });
  };
  tree(win.parts);
  for (const c of win.controls || []) {
    if (!visible(c)) continue;
    tree(c.parts, c);
    // ShadowText controls own another text control; only render their leaf's labels. A normal text control without
    // parts still has a complete semantic value and drawn world position in the base reader.
    if (c.text && !c.parts?.labels?.some(t => t.shown !== false && t.text) && !/ShadowText/.test(c.cls)) {
      add(c.id, 'label', { x: c.wx || win.x + c.x, y: c.wy || win.y + c.y, w: c.w || 512, h: c.h || 32 }, c.wz ?? 0,
        { text: c.text, px: c.fontSize || 16, align: c.align || 0, ink: c.name === 'CWindowTaskShadowTextのテキスト' ? '#fff' : '#000' });
    }
  }
  // The card art renderer isn't a child element: its exact native holes are explicitly supplied by read/shop.js.
  for (const h of win.holes || []) holes.push({ z: 1e9, rect: { ...h, x: win.x + h.x, y: win.y + h.y } });
  // The native mileage labels can disappear during their first drawn frame; the numeric state is authoritative.
  if (win.cls === 'CShopMileagePlate' && !items.some(i => i.kind === 'label')) {
    for (const [index, value] of [win.mp, win.total].entries()) if (Number.isFinite(value)) add(`mp-${index}`, 'label',
      { x: win.x + 12, y: win.y + (index ? 48 : 7), w: 200, h: 24 }, 1e8,
      { text: `${value}MP`, px: 24, align: 2, ink: '#fff' });
  }
  return { items: items.sort((a, b) => a.z - b.z), holes };
}

