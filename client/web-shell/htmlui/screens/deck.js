// The deck editor (CDeckScene): the deck panel, the trunk, the load / save list, the card detail panel and the trunk's
// filter dialogs, drawn from the snapshot's deck family (htmlui-deck-fields.md in the shared notes, CONTRACT.md).
// Most of the editor is not factory controls but CSpriteElm / CTextElm trees under them (deck bar, counters, tabs,
// trunk rows): the bridge hands those over as `sprites` / `labels` (texture, src rect, world position, scale, colour),
// so they are drawn here cell for cell from the game's own atlases. The engine keeps drawing what this can't: card
// faces (data/MINI/*), the swf buttons, the detail panel's big card. The DOM is always over the canvas, so every item
// here is clipped around the passthrough rects in front of it (painter's order by world z, across all deck windows:
// a dragged card crosses from the deck panel to the trunk).
// Pass mode: the game takes the mouse, drag and drop included; saves go through CDeckManager::save as before
// (decksync.c's onYo2DeckSaved / Deleted / Current hooks see the same calls).
import * as ui from '../../ui.js';
import { textBox, textWidth } from '../controls/basic.js';

// AtConverter's styles as CApp sets them (src/System/yo2TagConverter.cpp applyWindowTagStyles); untagged = @0
export const TAG_RGB = { 0: 0x000000, 1: 0xff0000, 2: 0x2222ff, 3: 0x009f00, 4: 0x6f6f00, 5: 0xff00ff, 6: 0x00ffff,
  7: 0xff9933, 8: 0xffffff, 9: 0xffffff };

// "@9 42", "@>64/Name": runs of { s, rgb, x } (x: the pen, from @>N/, else null = carry on), AtConverter::convert
export function runs(text) {
  const out = [];
  let rgb = TAG_RGB[0], x = null, s = '';
  const flush = () => { if (s) { out.push({ s, rgb, x }); s = ''; x = null; } };
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c !== '@') { s += c; continue; }
    if (n >= '0' && n <= '9') { flush(); rgb = TAG_RGB[n] ?? 0xffffff; i++; }
    else if (n === '@') { s += '@'; i++; }
    else if (n === '>') {
      let j = i + 2, v = 0;
      while (text[j] >= '0' && text[j] <= '9') v = v * 10 + +text[j++];
      flush(); x = v; i = text[j] === '/' ? j : j - 1;
    } else s += '@';
  }
  flush();
  return out;
}

// card faces: the thumbnails (data/MINI, deck and trunk) and the big ones (data/CARD, trade and TP)
const isArt = e => /^data[\\/](mini|card)[\\/]/i.test(e?.tex || '');
const isSwf = e => !e.cls && !('tex' in e) && !('text' in e);   // a Swf part: { id, name, x, y, z, wx, wy, shown }
// What the engine keeps drawing under the DOM: card faces and swf buttons, plus (co-drawn) whatever this module also
// draws under them, so a hole shows exactly the engine's pixels (the DOM can't put a layer between two engine ones).
// The co-drawn set is last frame's plan: the bridge asks before it hands over the new snapshot.
const coPass = new Set();
export const passthrough = x => isArt(x) || isSwf(x) || coPass.has(x.id);

// a sprite's screen rect: world position, src size times scale
export const spriteRect = s => ({ x: s.wx ?? s.x, y: s.wy ?? s.y, w: s.src[2] * (s.sx ?? 1), h: s.src[3] * (s.sy ?? 1) });
const meet = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// a swf's size isn't readable (CSwfEngine's player isn't decompiled): the hole is a generous box, which is exact as
// long as everything under it is co-drawn
const SWF_BOX = 32;

// The drawing list of one window: items [{ z, rect (screen), id, draw(el) }] and holes [{ z, rect }], back to front,
// and `co`: the ids of the items under a hole (passed through as well). Every control is drawn from its parts (the
// engine's own sprites, its texts as DOM text): nested controls' x/y are parent-relative and their depth (0x34c) is 0
// in the deck, so the parts' world position and world z (the engine's sort key) are what places and orders them.
// A button-family control also gets a real <button> over its art (the owner's rule; pass mode: it doesn't take input).
const BUTTON = /Switch$|^CWindowTaskButton|ResultNext$/;
export function plan(win) {
  const items = [], holes = [], ox = win.x, oy = win.y;
  const hole = (z, rect) => holes.push({ z, rect });
  const add = (id, z, rect, draw) => items.push({ id, z, rect, draw, i: items.length });
  const tree = (P, ctl) => {
    const rs = [];
    for (const s of P.sprites || []) {
      if (!s.shown || !s.tex) continue;
      const r = spriteRect(s), z = s.wz ?? 0;
      rs.push({ r, z });
      if (isArt(s)) hole(z, r); else add(s.id, z, r, el => drawSprite(el, s, r.x - ox, r.y - oy));
    }
    for (const t of P.labels || []) {
      if (!t.shown || !t.text) continue;
      // a CWindowTaskText's element: its align over its width (CTextElm 0x74c / 0x3c4: the control's align and w)
      const box = ctl && 'text' in ctl ? { align: ctl.align || 0, w: ctl.w } : { align: 0 };
      add(t.id, t.wz ?? 0, { x: t.wx, y: t.wy, w: box.w || 256, h: 16 * t.text.split('\n').length },
        el => drawLabel(el, t.text, t.wx - ox, t.wy - oy, t.a ?? 1, box));
    }
    for (const f of P.swfs || []) if (f.shown) hole(f.wz ?? 0, { x: f.wx, y: f.wy, w: SWF_BOX, h: SWF_BOX });
    return rs;
  };
  tree({ sprites: (win.extras || []).filter(e => e.tex), labels: win.labels }, null);
  for (const r of win.holes || []) hole(1e9, { x: ox + r.x, y: oy + r.y, w: r.w, h: r.h });
  for (const c of win.controls) {
    if (!c.shown || c.x >= 9999) continue;   // the detail panel parks hidden children at x 9999 / 99999
    const rs = c.parts ? tree(c.parts, c) : [];
    if (BUTTON.test(c.cls) && rs.length) {
      const x0 = Math.min(...rs.map(o => o.r.x)), y0 = Math.min(...rs.map(o => o.r.y));
      const r = { x: x0, y: y0, w: Math.max(...rs.map(o => o.r.x + o.r.w)) - x0, h: Math.max(...rs.map(o => o.r.y + o.r.h)) - y0 };
      add(c.id, Math.max(...rs.map(o => o.z)) + 0.5, r, el => drawButton(el, c, r.x - ox, r.y - oy, r.w, r.h));
    }
  }
  items.sort((a, b) => a.z - b.z || a.i - b.i);
  const co = items.filter(it => holes.some(h => h.z > it.z && meet(h.rect, it.rect))).map(it => it.id);
  return { items, holes, co };
}

// clip-path for an item: the holes in front of it that it overlaps (local to the window root)
export function clip(item, holes, ox, oy) {
  const front = holes.filter(h => h.z > item.z && meet(h.rect, item.rect));
  if (!front.length) return '';
  const r = ({ x, y, w, h }) => `M${x - ox} ${y - oy}h${w}v${h}h${-w}z`;
  return `path(evenodd, "M${-ox} ${-oy}h2048v2048h-2048z${front.map(h => r(h.rect)).join('')}")`;
}

// ---------------------------------------------------------------- atlases (any game texture, by its file name)
// ui.js sprite() needs the atlas's alpha up front (opaque cells: one image; others: masked), so atlases load once,
// async, and the window redraws when the last one arrives. '?' in a game path is the language letter: 'e', else 'j'
// (the loader falls back to it: deck_cardcount_01 only exists as _j).
const sheets = new Map();
const base = () => ui.SHEET.window.url.replace(/[^/]*$/, '');   // the art folder loadGlyphs() was given
export const artName = tex => tex.split(/[\\/]/).pop().replace('?', 'e').toLowerCase();
function sheet(tex, redraw) {
  const name = artName(tex);
  let s = sheets.get(name);
  if (!s) {
    s = { url: base() + name, w: 0, h: 0, ready: false, waiting: new Set() };
    sheets.set(name, s);
    const img = u => new Promise((ok, no) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u;
    });
    const j = tex.includes('?') ? name.replace(/_e\.png$/, '_j.png') : null;
    img(base() + 'clamp/' + name).catch(e => { if (!j) throw e; s.url = base() + j; return img(base() + 'clamp/' + j); }).then(m => {
      const c = new OffscreenCanvas(m.width, m.height).getContext('2d');
      c.drawImage(m, 0, 0);
      Object.assign(s, { w: m.width - 1, h: m.height - 1, ready: true,
        alpha: c.getImageData(0, 0, m.width, m.height).data.filter((_, i) => i % 4 === 3) });
      s.waiting.forEach(f => f());
      s.waiting.clear();
    }, () => console.warn('htmlui deck: no art for', tex));
  }
  if (!s.ready) s.waiting.add(redraw);
  return s.ready ? s : null;
}

let redrawing = null;   // the window being drawn: what a late atlas redraws
function drawSprite(el, s, x, y) {
  const sh = sheet(s.tex, redrawing);
  if (!sh) return;
  const [u, v, w, h] = s.src, rgba = s.rgba || [1, 1, 1, 1];   // a: the alpha it's drawn with (inherited), else its own
  const e = ui.sprite(el, sh, u, v, w, h, x, y, w * (s.sx ?? 1), h * (s.sy ?? 1), s.a ?? rgba[3]);
  if (rgba[0] !== 1 || rgba[1] !== 1 || rgba[2] !== 1)   // vertex colour: the trunk dims a row's art to 0.5 grey
    e.style.filter = rgba[0] === rgba[1] && rgba[1] === rgba[2] ? `brightness(${rgba[0]})` : '';
}
// tagged text as real DOM text (the owner's rule): one text box per colour run, at the pen; @1 is AtConverter's bold
// 18-pixel style. box: { align (0 left, 1 centre, 2 right), w } as the CTextElm lays its lines out.
function drawLabel(el, text, x, y, alpha, { align = 0, w = 0 } = {}) {
  text.split('\n').forEach((line, li) => {
    const rs = runs(line), px = r => r.rgb === TAG_RGB[1] ? 18 : 16;
    const lw = rs.reduce((n, r) => r.x !== null ? r.x + textWidth(r.s, px(r)) : n + textWidth(r.s, px(r)), 0);
    let pen = align === 1 ? Math.floor((w - lw) / 2) : align === 2 ? w - lw : 0;
    for (const r of rs) {
      if (r.x !== null) pen = r.x;
      const c = [r.rgb >> 16, r.rgb >> 8 & 255, r.rgb & 255].map(v => v / 255);
      const d = textBox(el, r.s, { x: x + pen, y: y + 16 * li, px: px(r), color: [...c, alpha], white: true });
      if (px(r) === 18) d.style.fontWeight = 'bold';
      pen += textWidth(r.s, px(r));
    }
  });
}
// a real <button> over a button's art (its look is the art drawn from its parts; the label is its accessible name)
function drawButton(el, c, x, y, w, h) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.disabled = !c.enabled;
  b.dataset.state = c.state || 'normal';
  b.setAttribute('aria-label', c.label || c.name || '');
  Object.assign(b.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px',
    background: 'none', border: 0, padding: 0, margin: 0 });
  el.append(b);
}

// ---------------------------------------------------------------- the module
// every live deck window: { win, root, plan }, so a hole from one (a dragged card) clips the others
const live = new Map();
function draw(id, api) {
  const L = live.get(id);
  if (!L) return;
  redrawing = () => draw(id, api);
  const items = L.plan.items;
  L.root.replaceChildren();   // ponytail: full rebuild per changed frame; keyed diff if it shows in a profile
  for (const it of items) {
    const box = document.createElement('div');
    box.className = 'layer';
    box.style.width = box.style.height = '100%';
    it.box = box;
    it.draw(box, api);
    if (box.childNodes.length) L.root.append(box);
  }
  redrawing = null;
  reclip();
}
function reclip() {
  coPass.clear();
  for (const L of live.values()) L.plan.co.forEach(id => coPass.add(id));
  const holes = [...live.values()].flatMap(L => L.plan.holes);
  for (const L of live.values())
    for (const it of L.plan.items) if (it.box) it.box.style.clipPath = clip(it, holes, L.win.x, L.win.y);
}

export default {
  classes: ['CWindowModelDeck', 'CWindowModelKaban', 'CWindowModelFileList', 'CCardDetailViewDlg',
    'CWindowModelListCard', 'CWindowModelListCardAttr', 'CWindowModelListCardType', 'CWindowModelListCardIcon',
    'CWindowModelListCardStar', 'CWindowModelListCardForbi'],
  mode: 'pass',
  parts: true,    // the controls' raw sprites / texts / swfs: most of the editor's art
  clip: false,    // the deck models lay out in screen pixels outside their nominal 336 x 144
  passthrough,
  mount(win, root) {
    const inner = document.createElement('div');
    inner.className = 'layer';
    root.append(inner);
    return { inner };
  },
  update(win, prev, root, api, st) {
    root.setAttribute('aria-label', win.cls);
    live.set(win.id, { win, root: st.inner, plan: plan(win) });
    draw(win.id, api);
  },
  unmount(root, st) {
    for (const [id, L] of live) if (L.root === st.inner) live.delete(id);
    reclip();
  },
};
