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
import { textBox, textWidth, FONT } from '../controls/basic.js';

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

// card faces: the thumbnails (data/MINI, deck and trunk), the big ones (data/CARD, trade and TP), pack art (the shop)
const isArt = e => /^data[\\/](mini|card|cardpack)[\\/]/i.test(e?.tex || '');
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
  if (win.parts) tree(win.parts, null);   // a task (the shop's) has its own raw children
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
    img(base() + 'clamp/' + name).catch(e => { if (!j) throw e; s.url = base() + j; return img(base() + 'clamp/' + j); }).then(async m => {
      const c = new OffscreenCanvas(m.width, m.height).getContext('2d', { willReadFrequently: true });
      c.drawImage(m, 0, 0);
      const d = c.getImageData(0, 0, m.width, m.height).data, alpha = new Uint8Array(d.length / 4);
      for (let i = 0; i < alpha.length; i++) alpha[i] = d[4 * i + 3];
      let px = null;   // CSS art: straight RGBA texels (the colour of transparent texels from the .rgb copy)
      if (CSS_ART.test(name)) {
        c.clearRect(0, 0, m.width, m.height);
        c.drawImage(await img(s.url.replace(/[^/]*$/, 'clamp/') + s.url.split('/').pop().replace('.png', '.rgb.png')), 0, 0);
        px = c.getImageData(0, 0, m.width, m.height).data;
        for (let i = 0; i < alpha.length; i++) px[4 * i + 3] = alpha[i];
      }
      Object.assign(s, { w: m.width - 1, h: m.height - 1, ready: true, alpha, px });
      const ids = [...s.waiting];
      s.waiting.clear();
      ids.forEach(id => draw(id, live.get(id)?.api));
    }, () => console.warn('htmlui deck: no art for', tex));
  }
  if (!s.ready) s.waiting.add(redraw);
  return s.ready ? s : null;
}

let redrawing = null;   // the id of the window being drawn: what a late atlas redraws (ids, so a Set dedups them)
function drawSprite(el, s, x, y) {
  const t = textArt(s);
  if (t) return drawTextArt(el, t, x, y, s.a ?? s.rgba?.[3] ?? 1);
  const sh = sheet(s.tex, redrawing);
  if (!sh) return;
  const [u, v, w, h] = s.src, rgba = s.rgba || [1, 1, 1, 1];   // a: the alpha it's drawn with (inherited), else its own
  const e = (sh.px ? cssSprite : ui.sprite)(el, sh, u, v, w, h, x, y, w * (s.sx ?? 1), h * (s.sy ?? 1), s.a ?? rgba[3]);
  const c = s.col || rgba;   // vertex colour as drawn (inherited: a back plane's 0.63 grey), else its own
  if (c[0] !== 1 || c[1] !== 1 || c[2] !== 1)   // the trunk dims a row's art to 0.5 grey
    e.style.filter = c[0] === c[1] && c[1] === c[2] ? `brightness(${c[0]})` : '';
}
// The owner's style rule: frame, bar, tab and button-bevel art is CSS, not a bitmap: gradients through the cell's own
// texels (sampled colours), stops at the texel centres where the GPU's bilinear filter puts them (ui.sprite's mapping:
// clamp texel u + t at (t - 0.5) k + 0.5, D3D's half pixel), so it is the engine's blend and crisp at any DPR. A cell
// whose rows (or columns) are all one colour is one gradient; a corner is a gradient per texel row, each masked by its
// bilinear tent and summed (plus-lighter). Pictures (icons, card art, art with baked text) stay ui.sprite bitmaps.
export const CSS_ART = /^(window_base|deck_carddai|deckbar|decktab|iconbar|swich)_/;
export function cssSprite(parent, sh, u, v, sw, shh, x, y, w, h, alpha = 1) {
  const W = sh.w + 1, px = sh.px, kx = w / sw, ky = h / shh;
  const at = (i, j) => 4 * (j * W + i);
  const rgb = (i, j) => { const o = at(i, j); return `rgb(${px[o]} ${px[o + 1]} ${px[o + 2]})`; };
  const a = (i, j) => `rgb(0 0 0 / ${+(px[at(i, j) + 3] / 255).toFixed(4)})`;
  const grad = (dir, n, k, c) => `linear-gradient(${dir}, ${Array.from({ length: n + 1 }, (_, t) => `${c(t)} ${+((t - 0.5) * k + 0.5).toFixed(3)}px`).join(', ')})`;
  const same = (p, q) => px[p] === px[q] && px[p + 1] === px[q + 1] && px[p + 2] === px[q + 2] && px[p + 3] === px[q + 3];
  const flat = (n, m, o) => { for (let i = 0; i <= n; i++) for (let j = 1; j <= m; j++) if (!same(o(i, 0), o(i, j))) return false; return true; };
  let opaque = true;
  for (let j = v; j <= v + shh; j++) for (let i = u; i <= u + sw; i++) opaque &&= px[at(i, j) + 3] === 255;
  // colour and alpha apart (a background and a mask), as D3D filters a straight-alpha texture: a CSS gradient blends
  // premultiplied, which darkens the transparent edges
  const paint = (el, dir, n, k, c, ca, more = []) => {
    const m = [...(opaque ? [] : [grad(dir, n, k, ca)]), ...more].join(', ');
    Object.assign(el.style, { background: grad(dir, n, k, c), maskImage: m, webkitMaskImage: m,
      maskComposite: 'intersect', webkitMaskComposite: 'source-in' });
  };
  const e = document.createElement('i');
  e.className = 'sp';
  Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', opacity: alpha === 1 ? '' : alpha });
  if (flat(shh, sw, (t, b) => at(u + b, v + t))) paint(e, 'to bottom', shh, ky, t => rgb(u, v + t), t => a(u, v + t));
  else if (flat(sw, shh, (t, b) => at(u + t, v + b))) paint(e, 'to right', sw, kx, t => rgb(u + t, v), t => a(u + t, v));
  else {
    e.style.isolation = 'isolate';
    for (let t = 0; t <= shh; t++) {
      const r = document.createElement('b'), c = (t - 0.5) * ky + 0.5;
      Object.assign(r.style, { width: '100%', height: '100%', transform: 'none', mixBlendMode: 'plus-lighter' });
      paint(r, 'to right', sw, kx, i => rgb(u + i, v + t), i => a(u + i, v + t),
        [`linear-gradient(to bottom, transparent ${+(c - ky).toFixed(3)}px, #000 ${+c.toFixed(3)}px, transparent ${+(c + ky).toFixed(3)}px)`]);
      e.append(r);
    }
  }
  parent.append(e);
  return e;
}

// The owner's rule for the glowing outline titles: real text in Audiowide (SIL OFL, Google Fonts: the open font
// closest to the art's rounded-square lettering, crossbarless A and all), the art's white fill and sampled outline,
// fitted to the art's ink box: an SVG <text> on its baseline (the box's bottom less the outline), as tall as the box
// (cap height 0.70 em, ascenders 0.751 em) and stretched to its width (textLength: the art's face is narrower).
// TEXT_ART: atlas -> its cells by (u, v) -> [text, outline colour, ink box x0 y0 x1 y1 in the cell, italic, glow]
const MOJI = [['Deck', '#179d33', 1, 4, 65, 26, 1], ['Number of Cards', '#4ddb7a', 1, 9, 127, 27, 1, 1],
  ['Side', '#4ddb7a', 1, 8, 45, 25, 1, 1], ['Trunk', '#be6e10', 1, 4, 80, 26, 1], ['Rearrange', '#ffb52f', 1, 10, 85, 27, 1, 1],
  ['Card Search', '#ffb52f', 0, 8, 78, 24, 1, 1], ['Cards Missing', '#4ddb7a', 0, 8, 128, 28, 1, 1]];
const TEXT_ART = {
  deck_moji_01: (u, v) => MOJI[v / 28],
  // the tabs, the front one (u 128) brighter
  deck_tabmoji_01: (u, v) => v === 0 ? ['Main', u ? '#ff4e46' : '#930101', 18, 4 + v, 60, 19 + u / 128, 0, 1]
    : ['Fusion', u ? '#ba17ef' : '#6f0293', 18, 5 + u / 128, 76, 19 + u / 128, 0, 1],
};
export const textArt = s => TEXT_ART[artName(s.tex).replace(/(_[ej])?\.png$/, '')]?.(s.src[0], s.src[1]);
const OUTLINE = 2, SVG = 'http://www.w3.org/2000/svg';
let fontReady = false;
function drawTextArt(el, [text, outline, x0, y0, x1, y1, italic, glow, ow = OUTLINE], x, y, alpha) {
  if (!fontReady) {
    fontReady = true;
    // ponytail: Google Fonts' copy (the repo takes no binaries); self-host it with the private art if that matters
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Audiowide&display=block';
    document.head.append(l);
  }
  const base = y + y1 - ow, h = y1 - y0 - 2 * ow, px = h / (/[bdfhklt]/.test(text) ? 0.751 : 0.70);
  const svg = document.createElementNS(SVG, 'svg'), t = document.createElementNS(SVG, 'text');
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: alpha === 1 ? '' : alpha,
    filter: glow ? `drop-shadow(0 0 1px ${outline})` : '' });
  svg.setAttribute('width', 1); svg.setAttribute('height', 1);
  // italic: skewed about the baseline, so the art's lean starts at its foot
  t.setAttribute('transform', `translate(${x + x0 + ow} ${base})${italic ? ' skewX(-12)' : ''}`);
  t.setAttribute('textLength', x1 - x0 - 2 * ow - (italic ? h * Math.tan(Math.PI / 15) : 0));
  t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  Object.assign(t.style, { font: `${px.toFixed(2)}px Audiowide, ${FONT}`, fill: '#fff', stroke: outline,
    strokeWidth: 2 * ow, strokeLinejoin: 'round', paintOrder: 'stroke fill' });
  t.textContent = text;
  svg.append(t);
  el.append(svg);
  return svg;
}

// ---------------------------------------------------------------- the scene around the windows (CDeckScene)
// The owner's rule: no background photo, no text in art. The brushed-metal background (deck_bg_01) is its sampled
// colours (a left and a right column gradient, blended across) under SVG fractal noise stretched along x, light and
// dark: the brushing. The title strip and the five side buttons are CSS bevels (the art's sampled gradients, white
// rim, slanted end) with Audiowide text.
const col = cs => `linear-gradient(to bottom, ${cs.map((c, i) => `rgb(${c}) ${(100 * i / (cs.length - 1)).toFixed(1)}%`).join(', ')})`;
const grain = (seed, rgb) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='768'><filter id='n' x='0' y='0' width='1' height='1'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.5' numOctaves='2' seed='${seed}'/><feColorMatrix values='0 0 0 0 ${rgb[0]} 0 0 0 0 ${rgb[1]} 0 0 0 0 ${rgb[2]} 0.4 0 0 0 -0.15'/></filter><rect width='1024' height='768' filter='url(#n)'/></svg>`)}")`;
export function deckBackdrop(el) {
  const d = document.createElement('div'), r = document.createElement('div'), mask = 'linear-gradient(to right, transparent 35%, rgb(0 0 0 / 0.75))';
  Object.assign(d.style, { position: 'absolute', inset: 0, background: `${grain(3, [1, 1, 1])}, ${grain(11, [0.2, 0.22, 0.4])}, ` +
    col(['160 163 191', '156 159 187', '136 153 182', '126 143 175', '115 133 171', '114 131 171', '105 124 171', '100 117 167', '101 118 172']) });
  Object.assign(r.style, { position: 'absolute', inset: 0, maskImage: mask, webkitMaskImage: mask,
    background: col(['143 159 191', '135 152 187', '125 143 181', '114 131 173', '103 120 168', '97 112 162', '92 104 154', '90 101 146', '95 105 154']) });
  d.append(r);
  el.append(d);
  return d;
}
// a bevel: [w, h, slant start, gradient stops [rgb, y]...] (deck_title_01: 248 x 40, deck_bottonN_0s: 176 x 27); its
// white rim is the outer box, the gradient the box inset 1 px (the slant 1.4)
const STRIP = { w: 248, h: 40, cut: 8, stops: [['105 255 255', 2.5], ['83 231 255', 5.5], ['66 185 255', 8.5], ['36 115 254', 30.5], ['0 67 254', 34.5], ['0 0 254', 37.5]] };
const SIDE = { w: 176, h: 27, cut: 6, stops: [['105 255 255', 1.5], ['80 228 255', 4.5], ['62 178 255', 7.5], ['37 120 254', 19.5], ['6 94 254', 21.5], ['0 0 254', 25.5]] };
const SIDE_HOVER = { ...SIDE, stops: [['207 255 255', 1.5], ['152 255 255', 5.5], ['134 237 255', 7.5], ['118 221 255', 19.5], ['81 209 255', 22.5], ['12 188 255', 25.5]] };
function bevel(el, { w, h, cut, stops }, x, y) {
  const poly = i => `polygon(0 ${i}px, ${w - 3 - i}px ${i}px, ${w - i}px ${3 + i}px, ${w - i}px ${cut}px, ${w - i * 1.4 - (h - cut)}px ${h - i}px, 0 ${h - i}px)`;
  const o = document.createElement('div'), g = document.createElement('div');
  Object.assign(o.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', background: '#fff', clipPath: poly(0) });
  Object.assign(g.style, { position: 'absolute', inset: 0, clipPath: poly(1),
    background: `linear-gradient(to bottom, ${stops.map(([c, at]) => `rgb(${c}) ${at}px`).join(', ')})` });
  o.append(g);
  el.append(o);
}
// the strip's text: deck_title_0N (its white fill box, outline 1); the buttons' (by instance name): the normal look's
// blue outline, the hover look's yellow fill in orange (the art's ink boxes)
const TITLES = ['EDIT DECK', 'CARD SWAP', 'TRADE'];
const SIDE_TEXT = { LoadBtn: ['LOAD DECK', 9, 134], SaveBtn: ['SAVE DECK', 7, 133], RecipeBtn: ['STRUCTURE DECK', 8, 150],
  ClearBtn: ['CLEAR DECK', 8, 144], ExitBtn: ['EXIT', 8, 61] };
function drawScene(el, sc, mouse) {
  deckBackdrop(el);
  if (sc.title?.shown) {
    const n = +(sc.title.tex.match(/deck_title_0(\d)/)?.[1] || 1);
    bevel(el, STRIP, sc.title.wx, sc.title.wy);
    drawTextArt(el, [TITLES[n - 1] || TITLES[0], '#1059ff', 6, 9, n === 3 ? 169 : 201, 32, 1, 0, 1], sc.title.wx, sc.title.wy, 1);
  }
  for (const b of sc.menu) {
    const t = SIDE_TEXT[b.name];
    if (!b.shown || !t) continue;
    const hover = inSide(b, mouse);
    bevel(el, hover ? SIDE_HOVER : SIDE, b.wx, b.wy);
    const svg = drawTextArt(el, [t[0], hover ? '#ff9d10' : '#1059ff', t[1], 5, t[2], 23, 1, 0, 2], b.wx, b.wy, 1);
    if (hover) svg.firstChild.style.fill = '#fdff45';
  }
}
// one backdrop for the whole editor, under every window root (the bridge's #htmlui layer): drawn from the deck
// window's scene, clipped around the engine's holes (card faces, swfs) like any item. The game's mouse for the side
// buttons' hover look: the page's own pointer in game px (pass mode: the canvas has it, the DOM only watches)
// ponytail: it sits in the bridge's host beside its layer; a bridge backdrop hook when another screen wants one
const sceneSt = { el: null, sc: null, mouse: null };
function sceneMount(root) {
  if (sceneSt.el) return;
  const layer = root.closest('#htmlui');
  if (!layer) return;
  sceneSt.el = document.createElement('div');
  Object.assign(sceneSt.el.style, { position: 'absolute', left: 0, top: 0, width: '1024px', height: '712px', pointerEvents: 'none' });
  layer.before(sceneSt.el);
  sceneSt.move = e => {
    const r = sceneSt.el.getBoundingClientRect(), k = 1024 / r.width;
    const m = [Math.floor((e.clientX - r.left) * k), Math.floor((e.clientY - r.top) * k)];
    const was = sceneSt.mouse;
    sceneSt.mouse = m;
    if (sceneSt.sc && sceneSt.sc.menu.some(b => inSide(b, m) !== inSide(b, was))) sceneDraw();
  };
  addEventListener('pointermove', sceneSt.move, { passive: true });
}
const inSide = (b, m) => !!m && m[0] >= b.wx && m[0] < b.wx + SIDE.w && m[1] >= b.wy && m[1] < b.wy + SIDE.h;
function sceneDraw() {
  if (!sceneSt.el) return;
  sceneSt.el.replaceChildren();
  if (sceneSt.sc) drawScene(sceneSt.el, sceneSt.sc, sceneSt.mouse);
}
function sceneUnmount() {
  sceneSt.el?.remove();
  removeEventListener('pointermove', sceneSt.move);
  Object.assign(sceneSt, { el: null, sc: null, move: null });
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
  redrawing = id;
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
  if (sceneSt.el) sceneSt.el.style.clipPath = clip({ z: -Infinity, rect: { x: 0, y: 0, w: 1024, h: 712 } }, holes, 0, 0);
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
    live.set(win.id, { win, root: st.inner, plan: plan(win), api });
    if (win.scene) {
      sceneMount(root);
      if (JSON.stringify(win.scene) !== JSON.stringify(sceneSt.sc)) { sceneSt.sc = win.scene; sceneDraw(); }
    }
    draw(win.id, api);
  },
  unmount(root, st) {
    for (const [id, L] of live) if (L.root === st.inner) live.delete(id);
    if (![...live.values()].some(L => L.win.scene)) sceneUnmount();
    reclip();
  },
};
