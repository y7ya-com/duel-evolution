// The card shop (scene 0x0e): its windows are CShop* tasks, not factory windows (the bridge's snapshot.tasks; their
// rects and state from read/shop.js), built from CSpriteElm plates, picture switches, texts and swf buttons. Every
// piece is drawn where the snapshot puts it (each sprite's world position, its texture naming the piece), its look
// recreated in CSS / SVG from the texture's own texels (controls/shop-skin.js: the owner's Skin rule, sharp at 2x),
// its text as DOM Arial (the Text rule). What the engine keeps drawing under the DOM, through holes cut in every
// shop layer in front of it: real pictures (the category banners' card / pack / avatar art, pack art, the card
// window's per-frame card faces, avatar parts and the sample avatar) and any texture this module has no recipe for.
// Layouts (exe, yo2shopEntry.cpp; disassembled for this module, addresses in read/shop.js and below):
//  - CShopCategoryWindow (onInit 0x00ae61c0): the panel shop_win_01_c01 at (280, 84, z 1011), the banner
//    shop_Introduction_01_? at (270, 70, 1013), three picture switches (shop_card / shop_pack / shop_*_avatar
//    _01 up, _02 hover, _03 down) at (319, 125 + 141 i, 1017) (0x00ae7a90), the Exit swf (shop_button_01.txt) at
//    (795, 540, 1016) with its ShadowText at (807, 556)
//  - CShopCardWindow / PackWindow / AvatarWindow (0x00aedd70 / 0x00af2040 / 0x00af75a0): the same panel, banners
//    02 / 04 / 03, the title band shop_win_00_01c at (280, 3, 1012) with its text, the Buy swf at (795, 480) and the
//    Back swf at (795, 540) with their ShadowTexts at (807, 496) / (807, 556), page arrows shop_arrow_04..06 at
//    (774, 332) and 10..12 at (264, 326), price plates, the no-trade mark icon_seigen_01; packs: the pack art
//    (data/cardpack/, scale 0.4); avatars: seven rows (picture switches shop_avatar_01..03, _04 when not for sale)
//    at (328, 194 + 49 i, 1018), their texts at (336, 206 + 49 i), 400 x 16
//  - CShopPricePlate, CShopMileagePlate, CShopConfirmWindow: src/shop/yo2ShopPlates.cpp, yo2ShopConfirm.cpp
//  - CShopNpcProfile: a factory window (CWindowTaskModel: a FrameThin "CWindowTaskFrameThin m_frame" and texts,
//    0x00ae4b40), drawn control by control
// Pass mode: the game takes the mouse (hover / pressed come from the snapshot: the picture switches' own state, the
// swf buttons' from the game's mouse over them). The confirm window's list is a native scroller (the owner's
// Scrolling rule), its scroll bar's value set through api.setValue.
import { textBox, textColor, spacing, fontCss } from '../controls/basic.js';
import { scrollList } from '../controls/scroll.js';
import { runs, clip, spriteRect } from './deck.js';
import * as skin from '../controls/shop-skin.js';
import { measure } from '../../ui.js';

// ---------------------------------------------------------------- what is whose
// the texture's file name, no folder, no extension, the language letter as English (the art this module knows)
export const texName = tex => (tex || '').split(/[\\/]/).pop().replace('?', 'e').replace(/\.png$/i, '').toLowerCase();
const isShopArt = tex => /^data[\\/]shop[\\/]/i.test(tex || '');
const INTRO = /^shop_introduction_0([1-4])_[a-z]+$/;
// a sprite this module draws (else the engine does)
export function recipe(name) {
  if (name === 'shop_win_01_c01') return 'panel';
  if (name === 'shop_win_00_01c') return 'band';
  if (name === 'shop_win_01_c00') return 'confirm';
  if (name === 'shop_money_01_c01') return 'mp';
  if (name === 'icon_seigen_01') return 'seigen';
  if (INTRO.test(name)) return 'banner';
  if (skin.TAGS[name]) return 'tag';
  if (skin.ROWS[name]) return 'row';
  if (skin.ARROWS[name]) return 'arrow';
  if (skin.KEYS[name]) return 'key';
  return null;
}
// a part the DOM draws (hidden in the engine): a sprite with a recipe, the game's scroll bar art (a native scroller
// stands in), a text, a swf button; every other part stays the engine's (a picture)
export const mine = p => {
  if ('text' in p) return true;
  if (!('tex' in p)) return !p.cls;   // a Swf part: { id, name, x, y, z, wx, wy, shown }
  const n = texName(p.tex);
  return !!recipe(n) || (isShopArt(p.tex) && /scroll/.test(n)) || /^data[\\/]common[\\/]/i.test(p.tex);
};
export const passthrough = (x, ctl) => !!ctl && !mine(x);

// ---------------------------------------------------------------- the swf buttons' state
// The swf (a DefineButton2) tracks the mouse itself; its hit shape is the down state's whole 256 x 64 bitmap. The
// game's mouse comes with the window (read/shop.js `mouse`: x, y, left down); the last button under it wins.
export function swfStates(swfs, mouse) {
  const st = swfs.map(() => 'normal');
  if (!mouse) return st;
  const [mx, my, l] = mouse;
  for (let i = swfs.length - 1; i >= 0; i--) {
    const f = swfs[i];
    if (mx >= f.wx && mx < f.wx + 256 && my >= f.wy && my < f.wy + 64) { st[i] = l ? 'pressed' : 'hover'; break; }
  }
  return st;
}

// ---------------------------------------------------------------- text
// A CTextElm as the game lays it out: its control's box (w, align, font size, line gap); its glyphs black (only the
// colour's alpha shows) unless it is one half of a CWindowTaskShadowText (white glyphs tinted: the plates' MP, the
// buttons' captions); "@n" colour tags and "@>N/" tab stops (the confirm list: x at N in the box) as AtConverter does
// (screens/deck.js runs()).
function shadowOf(ctl, win) {
  if (!ctl) return false;
  if (ctl.cls === 'CWindowTaskShadowText' || /^CWindowTaskShadowText/.test(ctl.name || '')) return true;
  return !!ctl.parent && win.controls.some(k => k.id === ctl.parent && k.cls === 'CWindowTaskShadowText');
}
// The web engine's glyphs sit lower in their line than Arial's baseline puts them (live flips, every shop text: 16-px
// lines 1.5 to 1.75 px lower, the plate's 24-px figures 0.5): the shop's texts move down as much
export const textDrop = px => px === 16 ? 1.5 : px === 24 ? 0.5 : 0;
export function drawText(el, s, { x, y, w, align = 0, px = 16, gap = 0, color, white = false, alpha = 1 }) {
  y += textDrop(px);
  const lines = s.split('\n');
  lines.forEach((line, i) => {
    const ty = y + i * (px + gap);
    const rs = runs(line);
    if (rs.length <= 1 && rs.every(r => r.x == null)) {
      const t = textBox(el, rs[0]?.s ?? line.replace(/@\d/g, ''), { x, y: ty, w, align, px, gap, color, white });
      // spacing() scales the 16-pixel table's cells, their +1 too; the engine's cell at another size is
      // round(advance) + 1 (the MP plate's 24-pixel figures came out 4 px too wide): that +1 unscaled
      if (px !== 16 && t.firstChild) { const ls = parseFloat(t.firstChild.style.letterSpacing) - (px / 16 - 1); Object.assign(t.firstChild.style, { letterSpacing: ls + 'px', marginRight: -ls + 'px' }); }
      if (rs[0] && rs[0].rgb && !white) t.style.color = '#' + rs[0].rgb.toString(16).padStart(6, '0');
      if (alpha < 1) t.style.opacity = alpha;
      return;
    }
    // tagged: each run at its pen (a tab stop or after the last run), in its colour
    const box = document.createElement('div');
    box.className = 'shop-txt';
    Object.assign(box.style, { left: x + 'px', top: ty + 'px', width: (w || 512) + 'px', height: px + gap + 'px', font: fontCss(px, px + gap),
      color: textColor(color, white), opacity: alpha < 1 ? alpha : '' });
    let pen = 0;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = fontCss(px);
    for (const r of rs) {
      if (r.x != null) pen = r.x;
      const sp = document.createElement('span'), ls = spacing(r.s, px);
      sp.textContent = r.s;
      Object.assign(sp.style, { position: 'absolute', left: pen + 'px', top: 0, letterSpacing: ls + 'px' });
      if (r.rgb && !white) sp.style.color = '#' + r.rgb.toString(16).padStart(6, '0');
      box.append(sp);
      pen += measure.measureText(r.s).width + ls * r.s.length;
    }
    el.append(box);
  });
}

// ---------------------------------------------------------------- one task's drawing list
// items [{ id, z, rect (screen), draw(el) }] back to front (the engine's world z, its sort key) and holes [{ z, rect }]
// (the pictures the engine draws: every item behind one is clipped around it). pills: the swf buttons (their state
// follows the mouse without a rebuild).
const meet = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// The engine draws every picture half a pixel right and down of its place (D3D's texel centres; at 2x a full device
// pixel): a hole cut at the place showed a 1-px seam of what is behind the picture along its top and left (live
// flips, the card faces). Holes sit where the picture really lands.
const HALF = 0.5;
const at = r => ({ x: r.x + HALF, y: r.y + HALF, w: r.w, h: r.h });
export function plan(win) {
  const items = [], holes = [], pills = [], ox = win.x, oy = win.y;
  const add = (id, z, rect, draw) => items.push({ id, z, rect, draw, i: items.length });
  const confirmList = win.cls === 'CShopConfirmWindow' && Array.isArray(win.lines);
  const sprite = (s, ctl) => {
    const name = texName(s.tex), r = spriteRect(s), z = s.wz ?? s.z ?? 0, x = r.x - ox, y = r.y - oy;
    const cat = skin.CATEGORY.exec(name);
    if (cat) {   // a category banner: the engine's picture; its hover / chosen frame here, over it
      const p = skin.CAT_PICTURE, k = s.sx ?? 1;
      holes.push({ z, rect: at({ x: r.x + p.x * k, y: r.y + p.y * k, w: p.w * k, h: p.h * k }) });
      if (cat[2] !== '1') add(s.id + 0.5, z + 0.1, { x: r.x, y: r.y, w: 420, h: 170 }, el => skin.categoryFrame(el, x, y));
      if (ctl) add(ctl.id, z + 0.2, { x: r.x + p.x, y: r.y + p.y, w: p.w, h: p.h }, el => button(el, ctl, x + p.x, y + p.y, p.w, p.h));
      return;
    }
    const kind = recipe(name);
    if (!kind) {
      if (!mine(s)) holes.push({ z, rect: at(r) });   // a picture: the engine's
      return;
    }
    const a = s.a ?? 1;
    const draw = el => {
      const host = ctl && /Switch$/.test(ctl.cls) ? button(el, ctl, x, y, r.w, r.h) : el;
      const bx = host === el ? x : 0, by = host === el ? y : 0;
      const pc = DRAW[kind](host, bx, by, name);
      if (a < 1 && pc) pc.style.opacity = a;
    };
    add(s.id, z, r, draw);
  };
  const label = (t, ctl) => {
    if (!t.text) return;
    if (confirmList && ctl?.name === '確認ウィンドウ商品名リスト') return;   // the list is the native scroller's
    const px = ctl?.fontSize || 16, w = ctl?.w || 0;
    const o = { x: t.wx - ox, y: t.wy - oy, w: w || undefined, align: ctl?.align || 0, px, gap: ctl?.lineGap || 0,
      color: ctl?.color, white: shadowOf(ctl, win), alpha: t.a ?? 1 };
    add(t.id, t.wz ?? 0, { x: t.wx, y: t.wy, w: w || 256, h: px * t.text.split('\n').length }, el => drawText(el, t.text, o));
  };
  const swf = f => {
    const p = { id: f.id, x: f.wx - ox, y: f.wy - oy, wx: f.wx, wy: f.wy, name: f.name };
    pills.push(p);
    add(f.id, f.wz ?? 0, { x: f.wx, y: f.wy, w: 230, h: 56 }, el => { p.el = el; pillDraw(p); });
  };
  const tree = (P, ctl) => {
    for (const s of P.sprites || []) if (s.shown && s.tex) sprite(s, ctl);
    for (const t of P.labels || []) if (t.shown) label(t, ctl);
    for (const f of P.swfs || []) if (f.shown) swf(f);
  };
  if (win.parts) tree(win.parts, null);
  for (const c of win.controls || []) if (c.shown && c.parts) tree(c.parts, c);
  // the card window's faces, drawn each frame (not elements): over the panel, under the confirm window
  for (const h of win.holes || []) holes.push({ z: 1020, rect: at({ x: ox + h.x, y: oy + h.y, w: h.w, h: h.h }) });
  const st = swfStates(pills, win.mouse);
  pills.forEach((p, i) => { p.state = st[i]; });
  if (confirmList) {
    const sc = win.controls.find(c => /Scroll/.test(c.cls));
    add('list', 51003.5, { x: ox + 24, y: oy + 48, w: 438, h: 160 }, (el, api, L) => confirmRows(el, win, sc, api, L));
  }
  items.sort((a, b) => a.z - b.z || a.i - b.i);
  return { items, holes, pills };
}

const DRAW = {
  panel: (el, x, y) => skin.panel(el, x, y),
  band: (el, x, y) => skin.band(el, x, y),
  confirm: (el, x, y) => skin.confirmFrame(el, x, y),
  mp: (el, x, y) => skin.mpPlate(el, x, y),
  seigen: (el, x, y) => skin.noTrade(el, x, y),
  banner: (el, x, y, name) => skin.banner(el, x, y, skin.BANNER[+INTRO.exec(name)[1]]),
  tag: (el, x, y, name) => skin.priceTag(el, x, y, name),
  row: (el, x, y, name) => skin.itemRow(el, x, y, name),
  arrow: (el, x, y, name) => skin.arrow(el, x, y, name),
  key: (el, x, y, name) => skin.key(el, x, y, name),
};
// a real <button> (the owner's Buttons rule) carrying the control's state; pass mode: the game takes the click
function button(el, ctl, x, y, w, h) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'shop-btn';
  b.tabIndex = -1;
  b.disabled = ctl.state === 'disabled';
  b.dataset.state = ctl.state || 'normal';
  if (ctl.checked) b.dataset.checked = '';
  b.setAttribute('aria-label', ctl.label || ctl.name || '');
  Object.assign(b.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  el.append(b);
  return b;
}
function pillDraw(p) {
  if (!p.el) return;
  p.el.replaceChildren();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'shop-btn';
  b.tabIndex = -1;
  b.dataset.state = p.state;
  b.setAttribute('aria-label', p.name || 'button');
  Object.assign(b.style, { left: p.x + 'px', top: p.y + 'px', width: '223px', height: '50px' });
  skin.pill(b, 0, 0, p.state);
  p.el.append(b);
}

// ---------------------------------------------------------------- the confirm window's list (native)
// Every cart line (read/shop.js `lines`, the window's own "<name>@>320/x<n>@>360/<MP>MP" strings) as a 16-pixel row
// at (24, 48 + 16 i), the window's 10 in view; the scroll bar (CWindowTaskScroll at (448, 17), 190 long) is the
// browser's: scrolling sets the game's bar (api.setValue: the window shows the same ten), the game's value moves it.
// The scroller lives in a layer of its own over the window's (never rebuilt: a rebuild per scrolled frame would cut the
// browser's momentum short).
function confirmRows(el, win, sc, api, L) {
  if (!L.list) {
    const host = document.createElement('div');
    host.className = 'layer';
    L.inner.after(host);
    L.list = scrollList(host, { x: 17, y: 48, w: 445, h: 160, rowH: 16 });   // the well's width (17..461), text at 24
  }
  const list = L.list;
  // each row carries its stripe (the frame's #e7e7e7 / #c2c2c2 rows, #7a7a7a under every second), so the stripes
  // scroll with the lines; the frame's own (static) stripes sit under them
  list.set(win.lines, (s, i) => {
    const r = document.createElement('div');
    r.style.background = i % 2 ? 'linear-gradient(#c2c2c2 15px, #7a7a7a 15px)' : '#e7e7e7';
    r.style.width = '430px';   // the rows end at the list's edge (x 447): the scroll column (448..462) stays the frame's
    drawText(r, s, { x: 7, y: 0, w: 424, px: 16 });
    return r;
  }, (s, i) => i + '\u0000' + s);
  list.onTop = i => { if (sc) api.setValue?.(sc.id, Math.max(0, Math.min(i, sc.max ?? i))); };
  if (sc && Math.round(list.el.scrollTop / 16) !== (sc.value || 0)) list.top(sc.value || 0);
}

// ---------------------------------------------------------------- the shop's live tasks (holes cut across all of them)
// Each task is its own root; a picture of one (a card face) clips the others' layers behind it. The roots stack by
// the engine's depth, which the bridge's order (windows, then tasks as listed) doesn't follow: z-index per class
// (the windows' panels 1011.., the mileage plate 1015.., the price plates 1018..1021, the confirm window 51003).
const RANK = { CShopCategoryWindow: 1, CShopCardWindow: 1, CShopPackWindow: 1, CShopAvatarWindow: 1, CShopMileagePlate: 2,
  CShopPricePlate: 3, CShopConfirmWindow: 4 };
const live = new Map();
// Lent items: a window's piece the engine draws over a price plate (the card window's no-trade marks, z 1023, on the
// tags, z 1021) is drawn in that plate's root, whose rank is above the window's (a root is one stacking context: no
// z inside the window's could put it over a later root). Each live task's list: its own pieces not lent away, then
// those lent to it (placed from their owner's origin).
const LEND_Z = 1020;
function lend() {
  const plates = [...live.values()].filter(L => L.win.cls === 'CShopPricePlate' && L.win.shown);
  for (const L of live.values()) {
    const items = /^CShop(Card|Pack|Avatar)Window$/.test(L.win.cls);   // the item windows' marks only (the confirm
    for (const it of L.plan.items) {                                     // window, 51003, is over everything anyway)
      const r = it.rect, inside = P => r.x >= P.win.x && r.y >= P.win.y && r.x + r.w <= P.win.x + P.win.w && r.y + r.h <= P.win.y + P.win.h;
      it.to = items && it.z > LEND_Z && it.z < 2000 && plates.find(inside)?.win.id || 0;
    }
  }
  for (const L of live.values()) {
    const own = L.plan.items.filter(it => !it.to).map(it => ({ it, from: L }));
    const lent = [...live.values()].flatMap(O => O === L ? [] : O.plan.items.filter(it => it.to === L.win.id).map(it => ({ it, from: O })));
    L.next = [...own, ...lent].sort((a, b) => a.it.z - b.it.z || a.it.i - b.it.i);
  }
}
const sig = L => L.next.map(e => e.from.win.id + ':' + e.it.id).join();
function reclip() {
  const holes = [...live.values()].flatMap(L => L.plan.holes);
  for (const L of live.values())
    for (const { it, from, box } of L.layers || []) if (box) box.style.clipPath = clip(it, holes.filter(h => meet(h.rect, it.rect)), from.win.x, from.win.y);
}
// ponytail: a full rebuild per changed frame (the mouse alone redraws only the swf buttons; the confirm list's
// scroller is not rebuilt)
function draw(L) {
  L.inner.replaceChildren();
  L.layers = L.next;
  L.drawn = sig(L);
  for (const e of L.layers) {
    const box = document.createElement('div');
    box.className = 'layer';
    box.style.width = box.style.height = '100%';
    if (e.from !== L) box.style.transform = `translate(${e.from.win.x - L.win.x}px, ${e.from.win.y - L.win.y}px)`;
    e.box = box;
    e.it.draw(box, e.from.api, e.from);
    if (box.childNodes.length) L.inner.append(box);
  }
}

// the NPC's profile (a factory window, CWindowTaskModel, up on entering the shop: Sadie's name and blurb): its FrameThin
// "m_frame" (style 2, green, at its alpha 0.9) as dialog.js's frame colours (shop-skin's thinFrame), the two
// CWindowTaskHelps' back planes (white, 0.9) and texts (16 px, the blurb char-wrapped at its box's width by the
// engine's own glyph advances, as CTextElm wraps), each at its world place, in the engine's z order
export function wrapEngine(text, w) {
  let adv;
  try { measure('a'); adv = ch => measure(ch); } catch { return text; }   // no glyph table (node): as is
  return text.split('\n').map(line => {
    const out = []; let cur = '', cw = 0;
    for (const ch of line) {
      const a = adv(ch);
      if (cur && cw + a > w) { out.push(cur); cur = ''; cw = 0; }
      cur += ch; cw += a;
    }
    out.push(cur);
    return out.join('\n');
  }).join('\n');
}
function npcProfile(win, root) {
  root.replaceChildren();
  const ox = win.x, oy = win.y;
  for (const c of win.controls.filter(c => c.shown).sort((a, b) => (a.wz || 0) - (b.wz || 0))) {
    const x = (c.wx ?? 0) - ox, y = (c.wy ?? 0) - oy;
    if (c.cls === 'CWindowTaskFrameThin') skin.thinFrame(root, { x, y, w: c.w, h: c.h, style: c.style, alpha: c.alpha });
    else if (c.cls === 'CWindowTaskBackPlane') skin.backPlane(root, { x, y, w: c.w, h: c.h, alpha: c.alpha });
    else if (c.cls === 'CWindowTaskText' && c.text)
      textBox(root, wrapEngine(c.text.replace(/[@＠]\d/g, ''), c.w), { x, y: y + textDrop(c.fontSize || 16), w: c.w, align: c.align || 0, px: c.fontSize || 16, gap: c.lineGap || 0, color: c.color });
  }
}

export default {
  classes: ['CShopCategoryWindow', 'CShopCardWindow', 'CShopPackWindow', 'CShopAvatarWindow', 'CShopPricePlate',
    'CShopMileagePlate', 'CShopConfirmWindow', 'CShopNpcProfile'],
  mode: 'pass',
  parts: true,    // the tasks' and controls' sprites / texts / swfs: the whole shop is made of them
  clip: false,    // a task's parts sit where the engine puts them, not in a box of its own
  passthrough,
  mount(win, root) {
    skin.inject();
    const inner = document.createElement('div');
    inner.className = 'layer';
    root.append(inner);
    return { inner, key: '', mouse: '' };
  },
  update(win, prev, root, api, st) {
    root.setAttribute('aria-label', win.cls);
    if (win.cls === 'CShopNpcProfile') {
      const key = JSON.stringify(win);
      if (key !== st.key) { st.key = key; npcProfile(win, st.inner); }
      return;
    }
    root.style.zIndex = RANK[win.cls] || 1;
    // the mouse changes every frame it moves: only the swf buttons follow it
    const key = JSON.stringify(win, (k, v) => k === 'mouse' ? undefined : v);
    let L = live.get(win.id);
    if (L && key === st.key) {
      const s = swfStates(L.plan.pills, win.mouse);
      L.plan.pills.forEach((p, i) => { if (p.state !== s[i]) { p.state = s[i]; pillDraw(p); } });
      return;
    }
    st.key = key;
    L = live.get(win.id) || { inner: st.inner };
    Object.assign(L, { win, plan: plan(win), api });
    live.set(win.id, L);
    lend();
    for (const K of live.values()) if (K === L || sig(K) !== K.drawn) draw(K);
    reclip();
  },
  // A CEasyTask lists its sprites as children but isn't their CTask parent_, so the bridge's hide by the task (htmlui.c
  // walks parent_) misses them: hide() names the elements themselves: every control (its parts follow it; the
  // pictures among them pass, passthrough()) and the task's own parts this module draws (its pictures stay the
  // engine's)
  hide: win => win.cls === 'CShopNpcProfile' ? [] : [...(win.controls || []).map(c => c.id),
    ...['sprites', 'labels', 'swfs'].flatMap(k => (win.parts?.[k] || []).filter(mine).map(e => e.id))],
  unmount(root, st) {
    for (const [id, L] of live) if (L.inner === st.inner) live.delete(id);
    lend();
    for (const K of live.values()) if (sig(K) !== K.drawn) draw(K);
    reclip();
  },
};
