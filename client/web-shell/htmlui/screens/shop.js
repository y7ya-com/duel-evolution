// The original shop in crisp HTML. Geometry, captions, selection and input remain the native game's;
// only its raster window furniture is replaced. Real pack/category/card pictures remain engine drawn.
// Samples are the original data/shop PNGs (not repository assets): shop_win_01_c01's white/silver bevel,
// shop_money_01_c01's turquoise plate, shop_btn1_01's cyan key and shop_pricetag_01/04/05's price strip.
import { textBox, fontCss } from '../controls/basic.js';
import { clip, runs } from './deck.js';

import { SHOP_CLASSES, shopPlan, filename, picture, swf, visible, elements } from './shop-plan.js';
export { SHOP_CLASSES, shopPlan } from './shop-plan.js';
const kept = new Map();

const CSS = `
.yo2-shop-legacy { position:absolute;inset:0;pointer-events:none;font-family:Arial,sans-serif; }
.yo2-shop-legacy .shop-piece { position:absolute;box-sizing:border-box;pointer-events:none; }
.yo2-shop-legacy .shop-frame { border:4px solid #fafdf9;background:rgba(213,228,230,.73);box-shadow:inset 3px 3px 2px #9faeb0,inset -3px -3px 2px #c4ceca,1px 1px 1px #7f8b85; }
.yo2-shop-legacy .shop-title { height:36px;border:1px solid #184137;box-shadow:inset 0 0 0 1px #63faff,inset 0 -4px #0d939d,inset 0 -7px #91f8fd;background:linear-gradient(#56ddf6 0%,#3fc2e7 35%,#33a7c9 52%,#45d8ee 55%,#3bb6d9 77%,#61ddf7 80%,#47b8cf);color:#fff;font:bold 27px/34px Arial,sans-serif;text-align:center;text-shadow:-2px -2px #101b1f,2px -2px #101b1f,-2px 2px #101b1f,2px 2px #101b1f; }
.yo2-shop-legacy .shop-money { border:2px solid #d7f7ff;outline:1px solid #244142;border-radius:10px 10px 8px 8px;background:linear-gradient(#63dffa,#41cbea 25%,#3fc4e1 45%,#a8ffff 47%,#30aac3 50%,#3cc3df 58%,#068da8 86%,#157b8c);box-shadow:inset 0 0 0 1px #2e7078,inset 0 2px 5px #fff8; }
.yo2-shop-legacy .shop-key { border:1px solid #0c797e;border-radius:14px;background:linear-gradient(#91f5ff,#36c9e8 26%,#37c5e5 65%,#00a0bb);box-shadow:inset 0 2px 5px #fff8,inset 0 -2px 4px #006d7d,0 2px 1px #021f2b; }
.yo2-shop-legacy .shop-key[data-state=hover] { filter:brightness(1.17); }.yo2-shop-legacy .shop-key[data-state=pressed] { filter:brightness(.85); }
.yo2-shop-legacy .shop-small-key { background:#d8d8d8;border:1px solid #aaa;border-radius:3px;box-shadow:inset 1px 1px #fff,inset -2px -2px #b0b0b0,3px 3px #777; }
.yo2-shop-legacy .shop-small-key[data-state=hover] { background:#edffff; }.yo2-shop-legacy .shop-small-key[data-state=pressed] { box-shadow:inset 2px 2px #9b9b9b; }
.yo2-shop-legacy .shop-price,.yo2-shop-legacy .shop-row { background:linear-gradient(#e5e9e9,#b8bfc0 50%,#999fa0);border:1px solid #9ba4a8;box-shadow:inset 1px 1px #f5ffff,inset -2px -2px #7c8587;clip-path:polygon(5px 0,calc(100% - 5px) 0,100% 5px,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0 calc(100% - 5px),0 5px); }
.yo2-shop-legacy .shop-price[data-state=hover],.yo2-shop-legacy .shop-row[data-state=hover] { background:linear-gradient(#bdffff,#73e9ff 50%,#4aaee8); }
.yo2-shop-legacy .shop-price[data-state=pressed],.yo2-shop-legacy .shop-row[data-state=pressed] { background:#b1fff7; }
.yo2-shop-legacy .shop-selection { background:linear-gradient(#fff99c,#fff99c) left top/28px 5px no-repeat,linear-gradient(#fff99c,#fff99c) left top/5px 28px no-repeat,linear-gradient(#fff99c,#fff99c) right top/28px 5px no-repeat,linear-gradient(#fff99c,#fff99c) right top/5px 28px no-repeat,linear-gradient(#fff99c,#fff99c) left bottom/28px 5px no-repeat,linear-gradient(#fff99c,#fff99c) left bottom/5px 28px no-repeat,linear-gradient(#fff99c,#fff99c) right bottom/28px 5px no-repeat,linear-gradient(#fff99c,#fff99c) right bottom/5px 28px no-repeat; }
.yo2-shop-legacy .shop-arrow { background:linear-gradient(#ffe58b,#ffb529 35%,#ff9e00 70%,#ffd77b);clip-path:polygon(7% 12%,93% 12%,50% 88%); }
.yo2-shop-legacy .shop-arrow[data-direction=right] { rotate:-90deg; }.yo2-shop-legacy .shop-arrow[data-direction=up] { rotate:180deg; }.yo2-shop-legacy .shop-arrow[data-direction=left] { rotate:90deg; }
.yo2-shop-legacy .shop-arrow[data-pale=true] { background:linear-gradient(#fff,#a5f2ff); }
.yo2-shop-legacy .txt { pointer-events:none; }
`;
function inject() {
  if (document.getElementById('yo2-shop-legacy-css')) return;
  const s = document.createElement('style'); s.id = 'yo2-shop-legacy-css'; s.textContent = CSS; document.head.append(s);
}
function drawText(box, item) {
  // Preserve native @>column/ and colour directives as DOM spans (the cart aligns count and price this way).
  for (const run of runs(item.text || '')) {
    const t = textBox(box, run.s, { x: run.x ?? 0, y: 0, w: run.x == null ? item.rect.w : undefined,
      h: item.rect.h, align: item.align || 0, px: item.px || 16,
      color: item.ink === '#fff' ? [1, 1, 1, item.alpha ?? 1] : [0, 0, 0, item.alpha ?? 1], white: item.ink === '#fff' });
    if (run.x != null) t.style.font = fontCss(item.px || 16);
  }
}
export default {
  classes: SHOP_CLASSES, mode: 'pass', parts: true, clip: false,
  passthrough: x => !!x.tex && (picture(x) || !/^shop_|^scroll/.test(filename(x))) || swf(x) || [...kept.values()].some(ids => ids.has(x.id)),
  hide: elements,
  mount(win, root) { inject(); const layer = document.createElement('div'); layer.className = 'yo2-shop-legacy'; root.append(layer); return { id: win.id, layer, nodes: new Map() }; },
  update(win, prev, root, api, st) {
    root.setAttribute('aria-label', win.cls === 'CShopCategoryWindow' ? 'Item Selection' : win.cls);
    const p = shopPlan(win), live = new Set();
    const allSprites = [...win.parts?.sprites || [], ...(win.controls || []).flatMap(c => c.parts?.sprites || [])];
    kept.set(win.id, new Set(allSprites.filter(s => visible(s) && !p.items.some(i => i.id === s.id)).map(s => s.id)));
    for (const item of p.items) {
      live.add(item.id); let node = st.nodes.get(item.id);
      if (!node || node.dataset.kind !== item.kind) {
        node?.remove(); node = document.createElement(/key|price/.test(item.kind) ? 'button' : 'div');
        node.className = `shop-piece shop-${item.kind}`; node.dataset.kind = item.kind;
        if (node.tagName === 'BUTTON') { node.type = 'button'; node.tabIndex = -1; }
        st.nodes.set(item.id, node); st.layer.append(node);
      }
      const r = item.rect;
      Object.assign(node.style, { left: `${r.x - win.x}px`, top: `${r.y - win.y}px`, width: `${r.w}px`, height: `${r.h}px`, zIndex: String(Math.round(item.z)), clipPath: clip(item, p.holes, r.x, r.y) });
      node.dataset.state = item.state || ''; node.dataset.direction = item.direction || ''; node.dataset.pale = String(!!item.pale);
      const key = JSON.stringify([item.text, item.px, item.ink, item.align, item.alpha, r.w, r.h]);
      if (node.dataset.textKey !== key) { node.replaceChildren(); if (item.kind === 'label') drawText(node, item); else if (item.text) node.textContent = item.text; node.dataset.textKey = key; }
    }
    for (const [id, node] of st.nodes) if (!live.has(id)) { node.remove(); st.nodes.delete(id); }
  },
  unmount(root, st) { kept.delete(st.id); st.nodes.clear(); root.replaceChildren(); },
};
