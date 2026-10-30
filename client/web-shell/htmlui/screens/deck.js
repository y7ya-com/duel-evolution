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
import { covers } from '../controls/basic.js';

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

const isArt = e => /^data[\\/]mini[\\/]/i.test(e?.tex || '');
// what the engine keeps drawing under the DOM: card faces, swf buttons (the bridge offers controls, extras, sprites, swfs)
export const passthrough = e => isArt(e) || e.cls === 'CSwfEngine' || !!e.swf;

// a sprite's screen rect: world position, src size times scale
export const spriteRect = s => ({ x: s.wx ?? s.x, y: s.wy ?? s.y, w: s.src[2] * (s.sx ?? 1), h: s.src[3] * (s.sy ?? 1) });
const meet = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// The drawing list of one window: [{ z, rect (screen), draw(el) }] plus its holes [{ z, rect }], back to front.
// Controls the generic renderers know (frames, text, buttons, lists, scrolls) are drawn by them at the control's depth.
export function plan(win, covers) {
  const items = [], holes = [], ox = win.x, oy = win.y;
  const hole = (z, rect) => holes.push({ z, rect });
  const add = (z, rect, draw) => items.push({ z, rect, draw, i: items.length });
  const tree = (owner, z0) => {
    for (const s of owner.sprites || []) {
      if (!s.shown) continue;
      const r = spriteRect(s), z = s.wz ?? z0;
      if (passthrough(s)) hole(z, r); else add(z, r, el => drawSprite(el, s, r.x - ox, r.y - oy));
    }
    for (const t of owner.labels || []) {
      if (!t.shown || !t.text) continue;
      const x = t.wx ?? t.x, y = t.wy ?? t.y, lines = t.text.split('\n');
      add(t.wz ?? z0, { x, y, w: Math.max(...lines.map(l => ui.measure(l.replace(/@(\d|>\d*\/?)/g, '')))), h: 16 * lines.length },
        el => drawLabel(el, t.text, x - ox, y - oy, t.rgba?.[3] ?? 1));
    }
    for (const f of owner.swfs || []) if (f.shown) hole(f.wz ?? z0, { x: f.wx ?? f.x, y: f.wy ?? f.y, w: f.w, h: f.h });
  };
  tree(win, -1);
  if (win.artHole) hole(win.artZ ?? 1e9, { x: ox + win.artHole.x, y: oy + win.artHole.y, w: win.artHole.w, h: win.artHole.h });
  for (const c of win.controls) {
    if (!c.shown || c.x >= 9999) continue;   // the detail panel parks hidden children at x 9999 / 99999
    const r = { x: ox + c.x, y: oy + c.y, w: c.w, h: c.h };
    if (passthrough(c)) hole(c.z, r);
    else if (c.texture) add(c.z, r, el => drawImage(el, c));
    else if (covers(c)) add(c.z, r, (el, api) => api.renderControl(c, el));
    tree(c, c.z);
  }
  items.sort((a, b) => a.z - b.z || a.i - b.i);
  return { items, holes };
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
// async, and the window redraws when the last one arrives. '?' in a game path is the language letter: 'e'.
const sheets = new Map();
const base = () => ui.SHEET.window.url.replace(/[^/]*$/, '');   // the art folder loadGlyphs() was given
export const artName = tex => tex.split(/[\\/]/).pop().replace('?', 'e').toLowerCase();
function sheet(tex, redraw) {
  const name = artName(tex);
  let s = sheets.get(name);
  if (!s) {
    s = { url: base() + name, w: 0, h: 0, ready: false, waiting: new Set() };
    sheets.set(name, s);
    const clamp = base() + 'clamp/' + name, img = u => new Promise((ok, no) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u;
    });
    img(clamp).then(m => {
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
  const [u, v, w, h] = s.src, rgba = s.rgba || [1, 1, 1, 1];
  const e = ui.sprite(el, sh, u, v, w, h, x, y, w * (s.sx ?? 1), h * (s.sy ?? 1), rgba[3]);
  if (rgba[0] !== 1 || rgba[1] !== 1 || rgba[2] !== 1)   // vertex colour: the trunk dims a row's art to 0.5 grey
    e.style.filter = rgba[0] === rgba[1] && rgba[1] === rgba[2] ? `brightness(${rgba[0]})` : '';
}
function drawImage(el, c) {   // v1 image family: { texture, src {u, v, w, h} } at the control's rect
  const { u, v, w, h } = c.src;
  drawSprite(el, { tex: c.texture, src: [u, v, w, h], sx: c.w / w, sy: c.h / h, rgba: [1, 1, 1, c.alpha ?? 1] }, c.x, c.y);
}
// tagged text: one glyph texture for the whole string (as CTextElm builds it), each run recoloured in place
function drawLabel(el, text, x, y, alpha) {
  text.split('\n').forEach((line, li) => {
    const rs = runs(line);
    if (!rs.length) return;
    let pen = 0;
    const cells = rs.map(r => { if (r.x !== null) pen = r.x; const a = pen; pen += ui.measure(r.s); return [r.s, x + a, y + 16 * li, r.rgb]; });
    const cv = ui.text(el, cells.map(([s, cx, cy]) => [s, cx, cy]));
    const g = cv.getContext('2d'), x0 = parseFloat(cv.style.left);
    g.globalCompositeOperation = 'source-atop';
    for (const [s, cx, , rgb] of cells) {
      if (!rgb) continue;
      g.fillStyle = '#' + rgb.toString(16).padStart(6, '0');
      g.fillRect(cx - x0, 0, ui.measure(s), cv.height);
    }
    if (alpha !== 1) cv.style.opacity = alpha;
  });
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
  const holes = [...live.values()].flatMap(L => L.plan.holes);
  for (const L of live.values())
    for (const it of L.plan.items) if (it.box) it.box.style.clipPath = clip(it, holes, L.win.x, L.win.y);
}

export default {
  classes: ['CWindowModelDeck', 'CWindowModelKaban', 'CWindowModelFileList', 'CCardDetailViewDlg',
    'CWindowModelListCard', 'CWindowModelListCardAttr', 'CWindowModelListCardType', 'CWindowModelListCardIcon',
    'CWindowModelListCardStar', 'CWindowModelListCardForbi'],
  mode: 'pass',
  passthrough,
  mount(win, root) {
    // the deck models sit at (0, 0) with a nominal 336 x 144 rect but lay out in screen pixels: no clipping
    root.style.overflow = 'visible';
    const inner = document.createElement('div');
    inner.className = 'layer';
    root.append(inner);
    return { inner };
  },
  update(win, prev, root, api, st) {
    root.style.overflow = 'visible';
    root.setAttribute('aria-label', win.cls);
    live.set(win.id, { win, root: st.inner, plan: plan(win, covers) });
    draw(win.id, api);
  },
  unmount(root, st) {
    for (const [id, L] of live) if (L.root === st.inner) live.delete(id);
    reclip();
  },
};
