// The pack picker (CWindowPackSelect over CCardGetPackScene, scene 0x17: "Here are your Cards from your last Duel.",
// then pick the pack the card comes from): the window, the packs and the scene's backdrop in HTML / CSS, sharp at any
// DPR (the owner's Skin rule). Pass mode: the game takes the mouse and the keys (its rows, its OK, its own hover and
// press, from the snapshot); the list is a native scroller (the Scrolling rule) whose rows click the game's.
//  - the window (CWindowPackSelect::onInit 0x00859cb0): data/card_get/cardget_win_01 (776 x 144 at 124, 576; its
//    sprite says alpha 0.7, but the picture has no alpha channel and the engine's frame shows it opaque) as CSS, from its texels: the frame's ramp, the sunk well (6..767, 5..103), its
//    field (8..751, 7..101: a ramp under 2-row white 11 % stripes), the scroll track (752..767); the selected row
//    cardget_select_01 (#ffce3c, white edge); the OK key (a CWindowTaskButtonDuel on cardget_btn_01_c01: three 24 px
//    looks, normal grey, hover peach, pressed yellow, each a 1 px outline round a bevel); the rows "@>64/<name>@>600/
//    @2<pct> %@0" (src/Pack/CardPack.cpp packCompletionLine): the name at 64, the completion at 600 in @2 blue
//  - the backdrop (read/packselect.js: the cardget_bg movie's sprites; hidden in the engine): twelve 1024 x 64 strips
//    (cardget_bg_01_01..06 at 2x, the bottom six flipped), the white grid (cardget_bg_03_01) over the top and bottom
//    248 px fading toward the centre, the magenta squares (cardget_bg_02_01, 152 px, alpha 0.5) scrolling right at the
//    top and left at the bottom. Measured from the textures: the strips' 192 row colours smoothed (the texture's
//    brushed streaks dropped) to the stops within one level of the curve, the squares one colour and alpha per row, the
//    grid's lines 1 px. Every piece follows its sprite (place, alpha: the in / out movies a01 / a03 play as the engine
//    plays them); the squares scroll in CSS (the movie moves them 1024 px per 29 frames, 3.31 px a frame on their 32 px
//    pattern: 99 px/s, here smooth), stopped in the out movie as there
//  - the packs: their art (merge.dat data/cardpack, shop/art.js) where the engine has them (its scroll between picks
//    included); the picked one's frame (data/etc/pack_select_01_c01: a cyan glow 16 px out and in, its ring black /
//    white / white / yellow / cyan from the art's edge) in CSS. The engine keeps drawing an art until the page has read it
const ui = await import('../../ui.js').catch(() => null);   // null under node
const basic = ui && await import('../controls/basic.js');
const scroll = ui && await import('../controls/scroll.js');
const art = ui && await import('../shop/art.js');

export const CLASSES = ['CWindowPackSelect'];

// ---------------------------------------------------------------- pure
// a list line's two columns: "@>64/Pack 10@>600/@20.0 %@0" -> [{ x: 64, s: 'Pack 10', blue: false }, { x: 600, s: '0.0 %', blue: true }]
export function columns(line) {
  const out = [];
  for (const m of String(line || '').matchAll(/@>(\d+)\/((?:(?!@>).)*)/g)) {
    const blue = /@2/.test(m[2]), s = m[2].replace(/[@＠]\d/g, '');
    if (s) out.push({ x: +m[1], s, blue });
  }
  if (!out.length && line) out.push({ x: 0, s: String(line).replace(/[@＠]\d/g, ''), blue: false });
  return out;
}
// a backdrop sprite's piece: { kind: 'strip' | 'grid' | 'band', key, flip, k (strip texture 1..6) } or null
export function piece(s) {
  const m = /cardget_bg_0(\d)_0(\d)/i.exec(s?.tex || '');
  if (!m) return null;
  const flip = (s.wsy ?? 1) < 0, side = flip ? 'b' : 't';
  if (m[1] === '1') return { kind: 'strip', key: 's' + m[2] + side, k: +m[2], flip };
  if (m[1] === '2') return { kind: 'band', key: 'band' + side, flip };
  if (m[1] === '3') return { kind: 'grid', key: 'grid' + side, flip };
  return null;
}
// where a piece sits in the loop (its CSS home): a strip k on top at 64 (k - 1), flipped from the bottom up
export const stripHome = (k, flip) => flip ? 768 - 64 * k : 64 * (k - 1);
// the drawn top of a sprite (a flipped one is drawn up from its place) and its home's: the move the CSS piece takes
export function offset(s, p) {
  const h = p.kind === 'strip' ? 64 : p.kind === 'band' ? 152 : 248;
  const top = p.flip ? s.wy - h : s.wy;
  const home = p.kind === 'strip' ? stripHome(p.k, p.flip) : p.flip ? 768 - h : 0;
  return { dx: p.kind === 'band' ? 0 : s.wx, dy: top - home };
}
// a pack sprite's file: data/cardpack/P05-2-N1.png -> p05-2-n1.png
export const packFile = tex => (tex || '').replace(/^.*[\\/]/, '').toLowerCase();

// ---------------------------------------------------------------- measured (data/card_get, 2x on screen)
// the strips' colour, top to centre (y px: rgb), the bottom half mirrored (cardget_bg_01_01..06, 192 rows, smoothed)
const ROWS = [[1, 52, 58, 139], [45, 54, 64, 146], [101, 62, 80, 164], [139, 70, 95, 182], [187, 82, 116, 205],
  [215, 92, 129, 215], [241, 102, 139, 220], [269, 116, 154, 223], [309, 143, 183, 229], [347, 168, 207, 232],
  [363, 174, 213, 233], [383, 179, 215, 233]];
// the squares' rows (cardget_bg_02_01, rows 4 + 16n .. 11 + 16n): rgb, alpha
const BAND = [[255, 111, 254, 246], [252, 129, 255, 213], [248, 150, 255, 144], [243, 172, 255, 64], [236, 190, 255, 15]];
// the grid's strength per line (cardget_bg_03_01 column 0, texel row 4 + 8k, over the first)
const FADE = [1, 1, 1, 1, 1, .974, .974, .923, .872, .769, .615, .462, .308, .179, .103];

const rgba = (c, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const BASE = `linear-gradient(180deg, ${[...ROWS.map(([y, ...c]) => `${rgba(c)} ${y}px`),
  ...ROWS.map(([y, ...c]) => `${rgba(c)} ${767 - y}px`).reverse()].join(', ')})`;
const GRID_FADE = `linear-gradient(180deg, ${FADE.map((a, k) => `rgba(0, 0, 0, ${a}) ${9 + 16 * k}px`).join(', ')}, transparent 248px)`;
const SQUARES = `linear-gradient(180deg, ${BAND.map((c, n) => {
  const y = 8 + 32 * n;
  return `${rgba(c, 0)} ${y}px, ${rgba(c, c[3] / 255)} ${y}px ${y + 16}px, ${rgba(c, 0)} ${y + 16}px`;
}).join(', ')})`;
const LINES = d => `repeating-linear-gradient(${d}, transparent 0 7px, rgba(255, 255, 255, .06) 7px 8px, rgba(255, 255, 255, .2) 8px 9px, transparent 9px 16px)`;
const COLS = 'repeating-linear-gradient(90deg, transparent 0 8px, #000 8px 24px, transparent 24px 32px)';

const CSS = `
.yo2ps-bg { position: absolute; left: 0; top: 0; width: 1024px; height: 768px; overflow: hidden; pointer-events: none; }
.yo2ps-bg > * { position: absolute; left: 0; will-change: transform, opacity; }
/* a strip reaches 1 px into each neighbour: at a fractional scale their edges would leave a seam */
.yo2ps-strip { width: 1024px; height: 66px; background: ${BASE} no-repeat; background-size: 1024px 768px; }
.yo2ps-grid { top: 0; width: 1024px; height: 248px; background: ${LINES('90deg')}, ${LINES('180deg')};
  -webkit-mask-image: ${GRID_FADE}; mask-image: ${GRID_FADE}; }
.yo2ps-grid.b { top: 520px; transform-origin: 0 124px; }
.yo2ps-bandw { top: 0; width: 1024px; height: 152px; overflow: hidden; opacity: .5; }
.yo2ps-bandw.b { top: 616px; }
.yo2ps-band { position: absolute; left: -32px; top: 0; width: 1088px; height: 152px; background: ${SQUARES};
  -webkit-mask-image: ${COLS}; mask-image: ${COLS}; animation: yo2ps-band .32226s linear infinite; }
.yo2ps-bandw.b > .yo2ps-band { transform-origin: 0 76px; animation-name: yo2ps-band-b; }
@keyframes yo2ps-band { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(32px, 0, 0); } }
@keyframes yo2ps-band-b { from { transform: translate3d(32px, 0, 0) scaleY(-1); } to { transform: translate3d(0, 0, 0) scaleY(-1); } }
.yo2ps-bg.still .yo2ps-band { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .yo2ps-band { animation: none; } }
.yo2ps-pack { top: 0; width: 200px; height: 400px; display: block; object-fit: fill; }
.yo2ps-pack:not([src]) { visibility: hidden; }
.yo2ps-pick { top: 0; width: 200px; height: 400px; box-sizing: border-box;
  box-shadow: 0 0 1px 0 #000, 0 0 13px 3px rgba(199, 255, 254, .7), inset 0 0 0 1px #000, inset 0 0 0 3px #fff,
    inset 0 0 0 4px #fcff00, inset 0 0 0 5px #00eaff, inset 0 0 12px 6px rgba(199, 255, 254, .7); }

/* the window: cardget_win_01's texels (opaque, as the engine shows it) */
.yo2ps-win { position: absolute; left: 0; top: 0; width: 776px; height: 144px; pointer-events: none; }
.yo2ps-win > .art { position: absolute; inset: 0;
  background: linear-gradient(180deg, rgb(216, 236, 254) 0 1px, rgb(192, 224, 255) 1px 2px, rgb(167, 213, 255) 2px 3px,
    rgb(164, 211, 255) 4.5px, rgb(159, 208, 255) 8.5px, rgb(153, 205, 255) 12.5px, rgb(146, 202, 255) 16.5px,
    rgb(139, 198, 255) 20.5px, rgb(131, 195, 255) 24.5px, rgb(125, 191, 255) 28.5px, rgb(119, 188, 255) 32.5px,
    rgb(116, 187, 255) 36.5px, rgb(113, 185, 255) 44.5px, rgb(110, 184, 255) 52.5px, rgb(103, 180, 255) 76.5px,
    rgb(95, 176, 255) 104.5px, rgb(90, 174, 255) 124.5px, rgb(88, 173, 255) 140.5px, rgb(86, 170, 254) 141px 142px,
    rgb(58, 136, 233) 142px 143px, rgb(24, 92, 201) 143px);
  box-shadow: inset 1px 0 rgba(255, 255, 255, .22), inset 2px 0 rgba(255, 255, 255, .1),
    inset -1px 0 rgb(51, 122, 220), inset -2px 0 rgba(30, 90, 200, .35); }
.yo2ps-win > .art > i { position: absolute; display: block; }
.yo2ps-win .well { left: 6px; top: 5px; width: 762px; height: 99px;
  box-shadow: inset 0 1px rgb(101, 135, 172), inset 0 2px rgb(50, 74, 105), inset 1px 0 rgb(76, 131, 187),
    inset 2px 0 rgb(53, 95, 142), inset 0 -1px rgb(121, 189, 255), inset 0 -2px rgb(162, 209, 255); }
.yo2ps-win .field { left: 8px; top: 7px; width: 744px; height: 95px;
  background: repeating-linear-gradient(180deg, rgba(255, 255, 255, .11) 0 2px, transparent 2px 4px) 0 2px / 100% 91px no-repeat,
    linear-gradient(180deg, rgb(66, 114, 199) 0 1px, rgb(82, 140, 247) 1px 2px, rgb(84, 145, 255) 4.5px,
    rgb(102, 157, 255) 24.5px, rgb(126, 175, 255) 44.5px, rgb(151, 193, 255) 64.5px, rgb(172, 208, 255) 84.5px,
    rgb(178, 212, 255) 92.5px 93px, rgb(187, 218, 255) 93px 94px, rgb(196, 226, 255) 94px); }
.yo2ps-win .track { left: 752px; top: 7px; width: 16px; height: 96px;
  background: linear-gradient(180deg, rgb(73, 91, 134) 0 1px, rgb(165, 180, 195) 1px 2px, rgb(212, 226, 228) 2px 94px,
    rgb(220, 232, 233) 94px 95px, rgb(225, 235, 240) 95px);
  box-shadow: inset 1px 0 rgb(126, 141, 167), inset 2px 0 rgb(184, 199, 208), inset -2px 0 rgb(219, 231, 233); }
.yo2ps-list .yo2-rows > .yo2ps-row { display: block; right: auto; width: 744px; margin: 0; padding: 0; border: 0; background: none; color: #000;
  cursor: inherit; text-align: left; white-space: pre; }
.yo2ps-row > span { position: absolute; top: 0; }
.yo2ps-row > span.blue { color: rgb(48, 48, 255); }
.yo2ps-list .yo2-rows > .yo2ps-row.sel { background: rgb(255, 206, 60);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .93), inset 0 2px rgb(255, 209, 74), inset 0 -2px rgb(255, 209, 74); }
/* cardget_btn_01_c01: 1 px outline, 2 px white top / left, the face, a 3-row bevel at the bottom */
.yo2ps-ok { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 1px solid rgb(50, 50, 50);
  border-radius: 4px; cursor: inherit; color: #000;
  background: linear-gradient(180deg, #fff 0 2px, #e6e6e6 2px 3px, #c9c9c9 3px 18px, #bababa 18px 19px, #929292 19px 20px, #6c6c6c 20px);
  box-shadow: inset 2px 0 #fff, inset -1px 0 #bababa; }
.yo2ps-ok[data-state=hover] { border-color: rgb(227, 111, 8);
  background: linear-gradient(180deg, #fff 0 2px, rgb(255, 255, 196) 2px 3px, rgb(250, 234, 172) 3px 18px, rgb(248, 223, 156) 18px 19px,
    rgb(244, 194, 113) 19px 20px, rgb(240, 168, 74) 20px); box-shadow: inset 2px 0 #fff, inset -1px 0 rgb(248, 223, 156); }
.yo2ps-ok[data-state=pressed] { border-color: rgb(227, 111, 8);
  background: linear-gradient(180deg, rgb(246, 182, 63) 0 1px, rgb(250, 212, 97) 1px 2px, rgb(254, 243, 133) 2px 3px,
    rgb(255, 255, 147) 3px 18px, rgb(255, 255, 168) 18px 19px, rgb(255, 255, 253) 19px 20px, #fff 20px);
  box-shadow: inset 2px 0 rgb(250, 216, 102); }
.yo2ps-ok[data-state=disabled] { filter: grayscale(1) opacity(.7); }
.yo2ps-ok > .txt { position: absolute; }`;

function inject() {
  if (document.getElementById('htmlui-packselect-css')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-packselect-css';
  st.textContent = CSS;
  document.head.append(st);
}
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; parent?.append(e); return e; };
const place = (e, x, y, w, h) => Object.assign(e.style, { left: x + 'px', top: y + 'px', ...(w != null && { width: w + 'px' }), ...(h != null && { height: h + 'px' }) });
const setIf = (e, k, v) => { if (e.style[k] !== v) e.style[k] = v; };

// ---------------------------------------------------------------- the scene (the bridge's backdrop layer)
// the arts the page has read: the engine keeps drawing a pack until then (hide)
const loaded = new Set();
// the layer it drew into: taken out when the window goes (the bridge clears the layer only when no owned window has a
// backdrop; the card reveal after OK has one, CCardDetailViewDlg's, which would keep this one, frozen, over the scene)
let drawnIn = null;
function scene(layer, snap) {
  drawnIn = layer;
  const ps = snap?.packScene;
  let st = layer.__yo2ps;
  if (!st || !layer.contains(st.bg)) {
    inject();
    const bg = el('div', 'yo2ps-bg', layer), parts = new Map();
    for (let k = 1; k <= 6; k++) for (const flip of [false, true]) {
      const s = el('i', 'yo2ps-strip', bg), y = stripHome(k, flip);
      s.style.top = y - 1 + 'px';
      s.style.backgroundPosition = `0 ${1 - y}px`;
      parts.set('s' + k + (flip ? 'b' : 't'), s);
    }
    parts.set('gridb', el('i', 'yo2ps-grid b', bg));
    parts.set('gridt', el('i', 'yo2ps-grid t', bg));
    for (const side of ['b', 't']) { const w = el('i', 'yo2ps-bandw ' + side, bg); el('i', 'yo2ps-band', w); parts.set('band' + side, w); }
    st = layer.__yo2ps = { bg, parts, packs: new Map(), pick: el('i', 'yo2ps-pick', bg), sig: '' };
  }
  const b = ps?.backdrop, on = !!(b && b.shown);
  st.bg.classList.toggle('still', !on || b.movie === 'cardget_bg_a03');
  // every piece from its sprite (one band copy a side: the other is the same picture 1024 px along)
  const seen = new Set();
  for (const s of on ? b.sprites : []) {
    const p = piece(s);
    if (!p || seen.has(p.key)) continue;
    seen.add(p.key);
    const e = st.parts.get(p.key), { dx, dy } = offset(s, p);
    const flip = p.kind === 'grid' && p.flip ? ' scaleY(-1)' : '';
    setIf(e, 'transform', `translate(${+dx.toFixed(2)}px, ${+dy.toFixed(2)}px)${flip}`);
    setIf(e, 'opacity', String(s.shown ? +(s.a ?? 1).toFixed(3) : 0));
  }
  for (const [k, e] of st.parts) if (!seen.has(k)) setIf(e, 'opacity', '0');
  // the packs where the engine has them
  const want = new Set();
  for (const s of ps?.packs || []) {
    const f = packFile(s.tex);
    want.add(s.id);
    let img = st.packs.get(s.id);
    if (!img || img.dataset.file !== f) {
      img?.remove();
      img = el('img', 'yo2ps-pack');
      img.alt = '';
      img.dataset.file = f;
      img.addEventListener('load', () => loaded.add(f));
      st.bg.insertBefore(img, st.pick);
      st.packs.set(s.id, img);
      art.packImg(img, f);
    }
    setIf(img, 'transform', `translate(${s.wx}px, ${s.wy}px)`);
    setIf(img, 'opacity', String(s.shown && s.wx < 1024 && s.wx > -200 ? +(s.a ?? 1).toFixed(3) : 0));
  }
  for (const [id, img] of st.packs) if (!want.has(id)) { img.remove(); st.packs.delete(id); }
  const fr = ps?.frame;
  setIf(st.pick, 'transform', fr ? `translate(${fr.wx + 16}px, ${fr.wy + 16}px)` : 'none');
  setIf(st.pick, 'opacity', String(fr?.shown ? +(fr.a ?? 1).toFixed(3) : 0));
}

// ---------------------------------------------------------------- the window
const rowPoint = (win, list, i, top) => [win.x + list.x + Math.min(40, list.w / 2), win.y + list.y + 16 * (i - top) + 8];
const topFor = (i, top, rows, n) => i >= top && i < top + rows ? top : Math.max(0, Math.min(i, n - rows));

function mount(win, root, api) {
  inject();
  const w = el('div', 'yo2ps-win', root), a = el('div', 'art', w);
  for (const c of ['well', 'field', 'track']) el('i', c, a);
  const st = { w, a, win, api, list: null, ok: null, shown: '', top: -1 };
  st.list = scroll.scrollList(w, { x: 8, y: 8, w: 760, h: 96, rowH: 16 });
  st.list.el.classList.add('yo2ps-list');
  st.list.el.setAttribute('role', 'listbox');
  // the player scrolled the box: the game's bar there (its list follows)
  st.list.onTop = i => { const bar = barOf(st.win); if (bar && api.setValue) api.setValue(bar.id, Math.max(0, Math.min(i, bar.max ?? i))); };
  update(win, null, root, api, st);
  return st;
}
const listOf = win => win.controls.find(c => /NoBackList$|Listbox$/.test(c.cls) && c.items);
const barOf = win => { const l = listOf(win); return l && win.controls.find(c => c.parent === l.id && c.thumb !== undefined); };

function update(win, prev, root, api, st) {
  st.win = win; st.api = api;
  const frame = (win.extras || []).find(e => /cardget_win_01/i.test(e.tex || ''));
  setIf(st.a, 'visibility', frame && !frame.shown ? 'hidden' : '');
  const L = listOf(win);
  if (L) {
    const lines = L.items || [], key = JSON.stringify(lines);
    if (key !== st.shown) {
      st.shown = key;
      st.list.set(lines, (line, i) => {
        const r = el('button', 'yo2ps-row');
        r.type = 'button';
        r.tabIndex = -1;   // the game keeps the focus (its keys)
        r.setAttribute('role', 'option');
        r.style.font = basic.fontCss(16);
        for (const col of columns(line)) {
          const s = el('span', col.blue ? 'blue' : '', r);
          s.textContent = col.s;
          s.style.left = col.x + 'px';
          s.style.letterSpacing = basic.spacing(col.s) + 'px';
        }
        r.addEventListener('pointerdown', e => e.preventDefault());   // no DOM focus: the arrows stay the game's
        r.addEventListener('click', () => pick(st, i));
        return r;
      }, (line, i) => i + '\n' + line);
    }
    const rows = st.list.rows.children;
    for (let i = 0; i < rows.length; i++) {
      const on = i === L.selected;
      if (rows[i].classList.contains('sel') !== on) { rows[i].classList.toggle('sel', on); rows[i].setAttribute('aria-selected', on); }
    }
    if (L.top !== st.top) { st.top = L.top; st.list.top(L.top || 0); }
  }
  const b = win.controls.find(c => /ButtonDuel$|TextSwitch$/.test(c.cls) && c.shown);
  if (b) {
    if (!st.ok) {
      st.ok = el('button', 'yo2ps-ok', st.w);
      st.ok.type = 'button';
      st.ok.tabIndex = -1;
      place(st.ok, b.x, b.y, b.w, b.h);
      basic.textBox(st.ok, b.label || 'OK', { x: -1, y: Math.floor((b.h - 16) / 2) - 1, w: b.w - 2, align: 1 });
    }
    if (st.ok.dataset.state !== (b.state || 'normal')) st.ok.dataset.state = b.state || 'normal';
  }
  if (st.ok) st.ok.hidden = !b;
}

// a row: the game's bar to it first when it is out of view (a press lands on the row the game shows), then its press
async function pick(st, i) {
  const L = listOf(st.win);
  if (!L) return;
  const rows = Math.max(1, L.rows || 6), n = (L.items || []).length, bar = barOf(st.win);
  let top = L.top || 0;
  const want = topFor(i, top, rows, n);
  if (want !== top && bar && st.api.setValue) {
    st.api.setValue(bar.id, want);
    top = want;
    await new Promise(r => setTimeout(r, 120));
  }
  st.api.click(L.id, rowPoint(st.win, L, i, top));
}

export default {
  classes: CLASSES,
  mode: 'pass',
  clip: false,   // the frame (776 x 144) is wider than the window's rect (400 x 200)
  mount: ui ? mount : () => ({}),
  update: ui ? update : () => {},
  unmount(root) {
    root.replaceChildren();
    drawnIn?.__yo2ps?.bg.remove();
    if (drawnIn) delete drawnIn.__yo2ps;
    drawnIn = null;
  },
  // the scene's backdrop movie and the packs: the page draws them (a pack once its art is read)
  hide(win, snap) {
    const ps = snap?.packScene;
    if (!ps || !win.shown) return [];   // the window stays, hidden, under the card reveal: the engine's scene again
    return [ps.backdrop?.id, ps.frame?.id, ...(ps.packs || []).filter(s => loaded.has(packFile(s.tex))).map(s => s.id)].filter(Boolean);
  },
  backdrop(win, layer, api, state, snap) {
    if (!ui) return;
    if (win.shown) scene(layer, snap);
    else if (layer.__yo2ps) { layer.__yo2ps.bg.remove(); delete layer.__yo2ps; }
  },
};
