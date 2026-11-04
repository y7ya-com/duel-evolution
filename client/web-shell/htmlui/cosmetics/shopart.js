// The native shop's own sprites (merge.dat data/shop/, read at runtime by cosmetics/art.js: never in git), as the CSS the
// box shop (cosmetics/boxes*.js) and the Wardrobe (cosmetics/wardrobe.js) are built from. Each piece is cut from its
// texture once a session (the rects below, measured on the textures) and exposed as a CSS variable on <html>:
//   --sa-<key>: url(blob:...)   and   --sa-<key>-off: none   (so `background: var(--sa-<key>-off, <fallback>)` drops the
//   CSS fallback once the sprite is there; until then, or with no game files at all, the fallback is the sprite's
//   sampled colours, so nothing ever looks broken).
// Pixel art (plates, rows, brackets, frames, arrows, icons, the digit font) is drawn nearest-neighbour at its native size
// (9-sliced with border-image where it must stretch); pictures (the category banners, the result glow) are smooth.
//
//   loadShopArt()               starts the reads (idempotent); -> Promise (all settled)
//   digits(text, { scale })     the shop's digit font (shop_number_01: 0-9, %, M, P): "1200MP" -> <span class=sa-num>
//   BANNER[box]                 the category banner each box uses (box id -> texture stem)
//   SHOP_SKIN_CSS               the classes: .sa-plate, .sa-row, .sa-pill, .sa-btn2, .sa-frame, .sa-brackets, .sa-arrow,
//                               .sa-yellow, .sa-glass, .sa-band, .sa-banner, .sa-title (see the CSS's comments)
import { pictureUrl } from './art.js';

const SHOP = 'data/shop/';
// key -> [texture, u, v, w, h] (texel rects; the textures are 2^n canvases with the art in a corner)
export const PIECES = {
  // the pack display's price tag plates (96 x 48: gray, cyan = selected, light = under the pointer, dark = sold out)
  plate: ['shop_pricetag_01_c01', 0, 207, 96, 48], plateOn: ['shop_pricetag_02_c01', 0, 207, 96, 48],
  plateHi: ['shop_pricetag_03_c01', 0, 207, 96, 48], plateOff: ['shop_pricetag_06_c01', 0, 207, 96, 48],
  // and the corner brackets over the selected pack (yellow) and the one under the pointer (pale): 96 x 142
  brackets: ['shop_pricetag_04_c01', 2, 61, 96, 142], bracketsHi: ['shop_pricetag_05_c01', 2, 61, 96, 142],
  // the Avatar Parts list's row plates (400 x 40): gray, cyan = selected, light, dark = not available
  row: ['shop_avatar_01_c01', 0, 0, 400, 40], rowOn: ['shop_avatar_02_c01', 0, 0, 400, 40],
  rowHi: ['shop_avatar_03_c01', 2, 2, 400, 40], rowOff: ['shop_avatar_04_c01', 0, 0, 400, 40],
  // the side pills (223 x 50): deep cyan (Back), light cyan (Confirm / Buy), orange (the primary); their arrows
  pill: ['shop_btn1_02_c01', 0, 0, 223, 50], pillHi: ['shop_btn1_03_c01', 0, 0, 223, 50], pillGo: ['shop_btn1_04_c01', 2, 2, 223, 50],
  pillDown: ['shop_btn1_01_c01', 0, 0, 223, 50],
  pillL: ['shop_btn1_icon_01_c01', 0, 0, 11, 21], pillR: ['shop_btn1_icon_02_c01', 0, 0, 11, 21],
  // the confirm window's small buttons (115 x 35): normal, under the pointer, pressed
  btn2: ['shop_btn2_01_c01', 0, 0, 115, 35], btn2Hi: ['shop_btn2_02_c01', 0, 0, 115, 35], btn2Down: ['shop_btn2_03_c01', 0, 0, 115, 35],
  // the selection frame round a category banner (410 x 148 with its glow; the banner's place is 17, 18, 376 x 112)
  frame: ['shop_cardef_01_c01', 7, 11, 410, 148],
  // the paging arrows (32 x 64): left normal / under the pointer / pressed, right the same
  arrowL: ['shop_arrow_10_c01', 0, 0, 32, 64], arrowLHi: ['shop_arrow_11_c01', 0, 0, 32, 64], arrowLDown: ['shop_arrow_12_c01', 0, 0, 32, 64],
  arrowR: ['shop_arrow_04_c01', 0, 0, 32, 64], arrowRHi: ['shop_arrow_05_c01', 0, 0, 32, 64], arrowRDown: ['shop_arrow_06_c01', 0, 0, 32, 64],
  number: ['shop_number_01_c01', 0, 0, 128, 32],
  // the yellow list window (the cart, 480 x 256: a 16-px frame, the 48-px foot with its glyph pattern)
  yellow: ['shop_win_01_c00', 0, 0, 480, 256],
  // the gray glass window and the dark band over its top
  glass: ['shop_win_01_c01', 0, 0, 512, 512], band: ['shop_win_00_01c', 0, 0, 512, 91],
  // the category banners (376 x 112; the selected look is the picture in .sa-frame, as the category menu draws it)
  bnOutfit: ['shop_domino_avatar_01_c01', 24, 29, 376, 112], bnHead: ['shop_akademia_avatar_01_c01', 24, 29, 376, 112],
  bnDisk: ['shop_card_01_c01', 24, 29, 376, 112],
  // the card get's glowing card frame (data/y/result/light.tif: 380 x 500, its window 30, 36, 320 x 428)
  glow: ['data/y/result/light.tif.png', 0, 0, 380, 500],
};
/** Box id -> its category banner: Domino's avatar banner for outfits, the Academy's for the head, the cards' for disks. */
export const BANNER = { outfit: 'bnOutfit', head: 'bnHead', dueldisk: 'bnDisk' };

const ready = new Set();
let started = null;
const path = tex => (tex.startsWith('data/') ? tex : SHOP + tex + '.png');
const loadImage = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
async function cut(key) {
  const [tex, u, v, w, h] = PIECES[key];
  const url = await pictureUrl(path(tex));
  if (!url) return;
  const img = await loadImage(url);
  let out = url;
  if (u || v || w !== img.naturalWidth || h !== img.naturalHeight) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, u, v, w, h, 0, 0, w, h);
    out = URL.createObjectURL(await new Promise(r => c.toBlob(r, 'image/png')));
  }
  const s = document.documentElement.style;
  s.setProperty(`--sa-${key}`, `url(${out})`);
  s.setProperty(`--sa-${key}-off`, 'none');
  if (key === 'number') { s.setProperty('--sa-num-on', 'inline-block'); s.setProperty('--sa-num-txt', 'none'); }
  ready.add(key);
}
/** Read every piece (once a session; a piece that can't be read now is asked again on the next call). */
export function loadShopArt() {
  if (!globalThis.document) return Promise.resolve();
  if (started && ready.size === Object.keys(PIECES).length) return started;
  started = Promise.allSettled(Object.keys(PIECES).filter(k => !ready.has(k)).map(k => cut(k).catch(() => {})));
  return started;
}
export const artReady = key => ready.has(key);

// ---- the digit font: 16-px cells, 0-7 on the top row, 8 9 "10" % M P "00" under them; black, outlined in white
const GLYPH = { '%': [48, 16, 14], M: [64, 16, 14], P: [80, 16, 13] };
for (let d = 0; d < 10; d++) GLYPH[d] = [(d % 8) * 16, d < 8 ? 0 : 16, 12];
/** The shop's digits for `text` (digits, %, M, P; anything else, a comma, is dropped). scale 2: twice the size, still
 *  whole pixels. The plain text stays beside the glyphs (shown until the sprite is read; screen readers use the label). */
export function digits(text, { scale = 1 } = {}) {
  const s = String(text).replace(/,/g, '').replace(/\s+/g, ''), el = document.createElement('span');
  el.className = 'sa-num';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', s.replace(/MP$/, ' MP'));
  if (scale !== 1) el.style.setProperty('--k', scale);
  for (const ch of s) {
    const g = GLYPH[ch];
    if (!g) continue;
    const i = document.createElement('i');
    i.style.setProperty('--u', -g[0] - 1 + 'px'); i.style.setProperty('--v', -g[1] - 1 + 'px'); i.style.setProperty('--w', g[2] + 'px');
    el.append(i);
  }
  const t = document.createElement('b');
  t.textContent = s.replace(/MP$/, ' MP');
  el.append(t);
  return el;
}
/** A digit string's width in game px at scale 1 (layout). */
export const digitsWidth = text => [...String(text).replace(/[,\s]/g, '')].reduce((w, c) => w + (GLYPH[c]?.[2] || 0), 0) + 1;

const FONT = `Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif`;
const px = n => `${+(n / 1.117).toFixed(2)}px`;   // a 16-px GDI cell is 14.3 CSS px of Arial (ui.js fontCss)
// a 9-slice of a piece: border-image at the art's own size (1 game px = 1 texel), so its bevels stay whole pixels
const nine = (key, t, r = t, b = t, l = r, fill = 'fill') => `border-style: solid; border-color: transparent;
  border-width: ${t}px ${r}px ${b}px ${l}px; border-image: var(--sa-${key}) ${t} ${r} ${b} ${l} ${fill} / ${t}px ${r}px ${b}px ${l}px stretch;`;
// the sampled fallbacks (the sprites' own colours, measured on the textures)
const F = {
  plate: 'linear-gradient(#f4f4f4, #d6d6d6 45%, #a9a9a9)', plateOn: 'linear-gradient(#7ffeff, #66dcff 45%, #5bbcff)',
  plateHi: 'linear-gradient(#e2ffff, #bdfdff 50%, #a5ffff)', plateOff: 'linear-gradient(#a0a0a0, #7c7c7c 50%, #5f5f5f)',
  row: 'linear-gradient(#f8f8f8, #dedede 32%, #b6b6b6 68%, #9c9c9c)', rowOn: 'linear-gradient(#7ffeff, #6ce7ff 32%, #5bc8ff 68%, #5bbcff)',
  rowHi: 'linear-gradient(#daffff, #cbffff 32%, #abffff 80%, #a5ffff)', rowOff: 'linear-gradient(#a6a6a6, #8a8a8a 45%, #5c5c5c)',
  pill: 'linear-gradient(#8fd8f3, #3fbde9 45%, #1fa6d8 55%, #46c9ef)', pillHi: 'linear-gradient(#b4fbff, #52eefa 45%, #2ee8f8 55%, #6ff4fb)',
  pillGo: 'linear-gradient(#ffe7a0, #ffb21c 45%, #ff9800 55%, #ffd200)', btn2: 'linear-gradient(#f2f2f2, #d9d9d9 60%, #c8c8c8)',
};
// a piece's look on an element's ::before (the element's own box stays whole for its contents): a 9-slice of the piece,
// or its sampled fallback until it is read
const skin = (sel, key, slice, fb, extra = '') => `${sel} { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 0;
  background: none; ${extra} }
${sel} > * { position: relative; }
${sel}::before { content: ''; position: absolute; inset: 0; pointer-events: none; image-rendering: pixelated; ${nine(key, ...slice)}
  background: var(--sa-${key}-off, ${fb}); background-clip: border-box; }`;
const state = (sel, key, fb) => `${sel}::before { border-image-source: var(--sa-${key}); background: var(--sa-${key}-off, ${fb}); background-clip: border-box; }`;
export const SHOP_SKIN_CSS = `
/* text: Arial as GDI draws it (16-px cells = 14.3 px; 24-px cells for a dialog's big line); never bold, black on the
   light plates, white on the dark band and over the dimmed screen */
.sa-t { font: ${px(16)}/16px ${FONT}; font-weight: normal; color: #000; white-space: nowrap; }
.sa-t24 { font: ${px(24)}/24px ${FONT}; font-weight: normal; }
.sa-w { color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,.6); }

/* the price tag plates (any size, 9-sliced): gray, data-on cyan, data-hi light, data-off dark */
${skin('.sa-plate', 'plate', [12], F.plate, 'color: #000;')}
${state('.sa-plate[data-on]', 'plateOn', F.plateOn)}
${state('.sa-plate[data-hi]', 'plateHi', F.plateHi)}
${state('.sa-plate[data-off]', 'plateOff', F.plateOff)}
${state('button.sa-plate:not([data-on]):not([data-off]):hover', 'plateHi', F.plateHi)}
button.sa-plate { cursor: inherit; font: inherit; }
button.sa-plate:active:not([data-off]) { filter: brightness(.94); }

/* the corner brackets round a selected picture (yellow), and the pale ones under the pointer */
.sa-brackets { position: absolute; box-sizing: border-box; pointer-events: none; image-rendering: pixelated; ${nine('brackets', 28, 28, 28, 28, '')} }
.sa-brackets[data-hi] { border-image-source: var(--sa-bracketsHi); }

/* list rows: the Avatar Parts plates (gray, data-on cyan = selected, data-hi light, data-off dark) */
${skin('.sa-row', 'row', [10], F.row, 'color: #000;')}
${state('.sa-row[data-on]', 'rowOn', F.rowOn)}
${state('.sa-row[data-hi]', 'rowHi', F.rowHi)}
${state('.sa-row[data-off]', 'rowOff', F.rowOff)}
${state('button.sa-row:not([data-on]):hover', 'rowHi', F.rowHi)}
button.sa-row { cursor: inherit; font: inherit; text-align: left; }

/* the side pills (50 tall): deep cyan; data-tone=hi light cyan; data-tone=go the orange primary (its arrows its own) */
${skin('.sa-pill', 'pill', [24, 26, 24, 26], F.pill, `height: 50px; cursor: inherit; color: #fff; font: ${px(16)}/50px ${FONT}; text-align: center;
  white-space: nowrap; text-shadow: 1px 1px 0 rgba(0,40,70,.55);`)}
.sa-pill::after { content: ''; position: absolute; inset: 0; pointer-events: none; image-rendering: pixelated;
  background: var(--sa-pillL) 10px 50% / 11px 21px no-repeat, var(--sa-pillR) calc(100% - 10px) 50% / 11px 21px no-repeat; }
.sa-pill > span { display: block; padding: 0 28px; overflow: hidden; text-overflow: ellipsis; }
${state('.sa-pill[data-tone=hi]', 'pillHi', F.pillHi)}
${state('.sa-pill[data-tone=go]', 'pillGo', F.pillGo)}
.sa-pill[data-tone=go] { text-shadow: 1px 1px 0 rgba(140,50,0,.6); }
.sa-pill[data-tone=go]::after { content: none; }
.sa-pill::before { border-radius: var(--sa-pill-off, 25px); }
.sa-pill:hover:not(:disabled) { filter: brightness(1.1); }
${state('.sa-pill:not([data-tone=go]):active:not(:disabled)', 'pillDown', F.pill)}
.sa-pill:active:not(:disabled) { filter: none; }
.sa-pill[data-tone=go]:active:not(:disabled) { filter: brightness(.9); }
.sa-pill:disabled { filter: grayscale(1) brightness(.9); color: #e4e8ea; }

/* the confirm window's small buttons */
${skin('.sa-btn2', 'btn2', [6, 8, 8, 6], F.btn2, `height: 35px; cursor: inherit; color: #000; text-align: center; font: ${px(16)}/33px ${FONT};`)}
${state('.sa-btn2:hover:not(:disabled)', 'btn2Hi', F.btn2)}
${state('.sa-btn2:active:not(:disabled)', 'btn2Down', F.btn2)}
.sa-btn2:disabled { color: #808080; }

/* the selection frame (the banner's): any size; place it 17 px left of and 18 px above the picture it frames */
.sa-frame { position: absolute; box-sizing: border-box; pointer-events: none; ${nine('frame', 34, 34, 34, 34, '')} }

/* the paging arrows */
.sa-arrow { position: absolute; width: 32px; height: 64px; margin: 0; padding: 0; border: 0; cursor: inherit; image-rendering: pixelated;
  background: var(--sa-arrowL) 0 0 / 32px 64px no-repeat; }
.sa-arrow[data-dir=next] { background-image: var(--sa-arrowR); }
.sa-arrow:hover:not(:disabled) { background-image: var(--sa-arrowLHi); } .sa-arrow[data-dir=next]:hover:not(:disabled) { background-image: var(--sa-arrowRHi); }
.sa-arrow:active:not(:disabled) { background-image: var(--sa-arrowLDown); } .sa-arrow[data-dir=next]:active:not(:disabled) { background-image: var(--sa-arrowRDown); }
.sa-arrow:disabled { visibility: hidden; }

/* the digit font (whole pixels: nearest-neighbour; --k 2 doubles it) */
.sa-num { display: inline-flex; vertical-align: top; --k: 1; height: calc(14px * var(--k)); }
.sa-num > i { display: var(--sa-num-on, none); width: calc(var(--w) * var(--k)); height: calc(14px * var(--k)); flex: none;
  background: var(--sa-number) calc(var(--u) * var(--k)) calc(var(--v) * var(--k)) / calc(128px * var(--k)) calc(32px * var(--k)) no-repeat;
  image-rendering: pixelated; }
.sa-num > b { display: var(--sa-num-txt, inline); font: ${px(16)}/14px ${FONT}; font-weight: normal; color: inherit; }

/* the yellow list window (its frame: the rows are drawn inside, at 16, 16) */
${skin('.sa-yellow', 'yellow', [16, 17, 48, 16], '#ffc22e')}

/* the gray glass window and its dark band */
${skin('.sa-glass', 'glass', [24], 'linear-gradient(#e9eef0, #dfe6ea)')}
${skin('.sa-band', 'band', [8], 'linear-gradient(#85979f, #4e626d)')}

/* a picture: a banner (smooth: painted art) */
.sa-banner { position: absolute; background: 0 0 / 100% 100% no-repeat; }

/* the cyan title plate (its art has the native caption baked in: the plate is its sampled colours) with the caption in
   the titles' rounded square face (Audiowide, as deck.js's titles), white, outlined black */
.sa-title { position: absolute; height: 36px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  pointer-events: none; color: #fff; font: 21px/1 Audiowide, ${FONT}; letter-spacing: .3px; white-space: nowrap;
  text-shadow: 1.5px 0 #000, -1.5px 0 #000, 0 1.5px #000, 0 -1.5px #000, 1px 1px #000, -1px -1px #000, 1px -1px #000, -1px 1px #000;
  background: linear-gradient(to bottom, #062a3a 0 1px, #24b1ed 1px, #3dc6f3 5px, #4ccbf3 9px, #5dcff4 13px, #6cd0f0 17px, #72d0ec 20px,
    #5cffff 22px, #5afeff 26px, #82ffff 31px, #8fffff 33px, #08292f 33px, #08292f 34px, #d9fbff 34px);
  box-shadow: 0 0 0 1px #0b4f6d; }
`;

let fontDone = false;
/** The skin's CSS (and the titles' face, self-hosted with the art as deck.js has it) in the document once; starts the reads. */
export function injectShopSkin(doc = globalThis.document) {
  if (!doc) return;
  if (!doc.getElementById('de-shop-skin')) {
    const s = doc.createElement('style');
    s.id = 'de-shop-skin'; s.textContent = SHOP_SKIN_CSS;
    doc.head.append(s);
  }
  if (!fontDone) {
    fontDone = true;
    const f = doc.createElement('style');
    f.textContent = `@font-face { font-family: Audiowide; font-display: swap; src: url(ui/fonts/Audiowide-Regular.woff2) format('woff2'); }`;
    doc.head.append(f);
  }
  loadShopArt();
}
/** Tests: forget what was read. */
export function _resetShopArt() { ready.clear(); started = null; }
