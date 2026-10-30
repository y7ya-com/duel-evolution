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
import { textBox, textWidth, FONT, fontCss } from '../controls/basic.js';
import { panel, titleBar, menuButton } from '../controls/skin.js';

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
      // a CWindowTaskText's element: its align over its width (CTextElm 0x74c / 0x3c4: the control's align and w), lines
      // wrapped at that width as the engine wraps them, the page it shows (firstLine, pageLines: the detail's text)
      const box = ctl && 'text' in ctl ? { align: ctl.align || 0, w: ctl.w } : { align: 0 };
      const text = box.w ? wrapLines(t.text, box.w).slice(ctl.firstLine || 0, (ctl.firstLine || 0) + (ctl.pageLines || 1e9)).join('\n') : t.text;
      add(t.id, t.wz ?? 0, { x: t.wx, y: t.wy, w: box.w || 256, h: 16 * text.split('\n').length },
        el => drawLabel(el, text, t.wx - ox, t.wy - oy, t.a ?? 1, box));
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
    img(base() + 'clamp/' + name).catch(e => { if (!j) throw e; s.url = base() + j; return img(base() + 'clamp/' + j); }).then(m => {
      const c = new OffscreenCanvas(m.width, m.height).getContext('2d', { willReadFrequently: true });
      c.drawImage(m, 0, 0);
      const d = c.getImageData(0, 0, m.width, m.height).data, alpha = new Uint8Array(d.length / 4);
      for (let i = 0; i < alpha.length; i++) alpha[i] = d[4 * i + 3];
      Object.assign(s, { w: m.width - 1, h: m.height - 1, ready: true, alpha });
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
  const e = ui.sprite(el, sh, u, v, w, h, x, y, w * (s.sx ?? 1), h * (s.sy ?? 1), s.a ?? rgba[3]);
  const c = s.col || rgba;   // vertex colour as drawn (inherited: a back plane's 0.63 grey), else its own
  if (c[0] !== 1 || c[1] !== 1 || c[2] !== 1)   // the trunk dims a row's art to 0.5 grey
    e.style.filter = c[0] === c[1] && c[1] === c[2] ? `brightness(${c[0]})` : '';
}
// The owner's rule for the glowing outline titles: real text in Audiowide (SIL OFL, with the art: the open font
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
    // self-hosted with the art (ui/fonts/, the private set: the repo takes no binaries, players' browsers no Google)
    const st = document.createElement('style');
    st.textContent = `@font-face { font-family: Audiowide; src: url(${base()}fonts/Audiowide-Regular.woff2) format('woff2'); }`;
    document.head.append(st);
  }
  const foot = y + y1 - ow, h = y1 - y0 - 2 * ow, px = h / (/[bdfhklt]/.test(text) ? 0.751 : 0.70);
  const svg = document.createElementNS(SVG, 'svg'), t = document.createElementNS(SVG, 'text');
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: alpha === 1 ? '' : alpha,
    filter: glow ? `drop-shadow(0 0 1px ${outline})` : '' });
  svg.setAttribute('width', 1); svg.setAttribute('height', 1);
  // italic: skewed about the baseline, so the art's lean starts at its foot
  t.setAttribute('transform', `translate(${x + x0 + ow} ${foot})${italic ? ' skewX(-12)' : ''}`);
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
function drawScene(el, sc) {
  deckBackdrop(el);
  if (sc.title?.shown) {
    const n = +(sc.title.tex.match(/deck_title_0(\d)/)?.[1] || 1);
    bevel(el, STRIP, sc.title.wx, sc.title.wy);
    drawTextArt(el, [TITLES[n - 1] || TITLES[0], '#1059ff', 6, 9, n === 3 ? 169 : 201, 32, 1, 0, 1], sc.title.wx, sc.title.wy, 1);
  }
  for (const b of sc.menu) {
    const t = SIDE_TEXT[b.name];
    if (!b.shown || !t) continue;
    const hover = inSide(b, sc.mouse);
    bevel(el, hover ? SIDE_HOVER : SIDE, b.wx, b.wy);
    const svg = drawTextArt(el, [t[0], hover ? '#ff9d10' : '#1059ff', t[1], 5, t[2], 23, 1, 0, 2], b.wx, b.wy, 1);
    if (hover) svg.firstChild.style.fill = '#fdff45';
  }
}
const inSide = (b, m) => !!m && m[0] >= b.wx && m[0] < b.wx + SIDE.w && m[1] >= b.wy && m[1] < b.wy + SIDE.h;

// a CTextElm's lines as the engine wraps them: by character, a line ends before the glyph that would pass w (the
// engine's own glyph advances, ui.js measure; @>N/ puts the pen at N); colour tags carry over to the next line
export function wrapLines(text, w) {
  const out = [];
  for (const line of text.split('\n')) {
    let cur = '', tag = '', width = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '@' && /[0-9@>]/.test(line[i + 1] || '')) {   // a tag: no width
        const m = line.slice(i).match(/^@(>\d+\/|\d|@)/);
        if (m) { cur += m[0]; if (/^@\d$/.test(m[0])) tag = m[0]; if (m[0] === '@@') width += ui.measure('@'); if (m[0][1] === '>') width = parseInt(m[0].slice(2)); i += m[0].length - 1; continue; }
      }
      const a = ui.measure(c);
      if (width + a > w && cur) { out.push(cur); cur = tag; width = 0; }
      cur += c; width += a;
    }
    out.push(cur);
  }
  return out;
}

// ---------------------------------------------------------------- the trunk's search (the owner: "modern, like EDOPro")
// EDOPro's deck editor searches from one panel over its results list: a live text box (name and card text), the
// category, attribute / type / level / ATK / DEF / limit filters and the sort, the hit count beside it. Here: the trunk's
// header row becomes that search box and the category chips (the game's own card-frame colours), its icon row the hit
// count and a Filters button opening the rest (the game's blue panel, the cards' own icon strips as chips). The
// filtering is the engine's (CWindowTaskKabanList: applyCategory, then search() narrowing per criterion), so the
// list, its drag and drop and the deck rules stay the game's: the panel hands the filter to the game (Module /
// api.kabanFilter, the recomp's hook) and reads the hit count back from the snapshot.
// Values are the strips' cells: attribute 0 Light .. 6 Divine; type 0 Dragon .. 20 Divine-Beast; spell / trap icon
// 0 counter, 1 field, 2 equip, 3 continuous, 4 quick-play, 5 ritual, 6 normal; limit = copies allowed (0..3).
// the category chips in the colours of the trunk's own "Rearrange" swatches (sampled from the engine's frame)
const CATS = [['All', 6, '#d8d8d8'], ['Normal', 0, '#f4dd3f'], ['Effect', 1, '#ffa127'], ['Fusion', 5, '#ba17ef'],
  ['Ritual', 4, '#2a98ff'], ['Spell', 2, '#31f15a'], ['Trap', 3, '#ff79c8']];
const ATTRS = ['Light', 'Dark', 'Water', 'Fire', 'Earth', 'Wind', 'Divine'];
const RACES = ['Dragon', 'Zombie', 'Fiend', 'Pyro', 'Sea Serpent', 'Rock', 'Machine', 'Fish', 'Dinosaur', 'Insect', 'Beast',
  'Beast-Warrior', 'Plant', 'Aqua', 'Warrior', 'Winged Beast', 'Fairy', 'Spellcaster', 'Thunder', 'Reptile', 'Divine-Beast'];
const ICONS = ['Counter', 'Field', 'Equip', 'Continuous', 'Quick-Play', 'Ritual', 'Normal'];
const LIMITS = [['Forbidden', 0], ['Limited', 1], ['Semi-limited', 2], ['Unlimited', 3]];
const SORTS = [['Default', ''], ['Name', 'name'], ['ATK ↓', 'atk-'], ['ATK ↑', 'atk+'], ['DEF ↓', 'def-'], ['DEF ↑', 'def+']];
export const emptyFilter = () => ({ cat: 6, text: '', attr: [], race: [], icon: [], level: [], limit: [], atk: [null, null], def: [null, null], sort: '' });
// how many criteria beyond the category and the text (the Filters button's badge)
export const filterCount = f => f.attr.length + f.race.length + f.icon.length + f.level.length + f.limit.length +
  (f.atk[0] != null || f.atk[1] != null) + (f.def[0] != null || f.def[1] != null) + !!f.sort;
const SEARCH_CSS = `
.dk-search { position: absolute; pointer-events: auto; font: ${fontCss(14)} ; color: #000; }
.dk-field { position: absolute; box-sizing: border-box; height: 22px; border: 1px solid #5b8fd0; border-radius: 2px;
  background: linear-gradient(#e9f1fb, #fff 4px); box-shadow: inset 1px 1px 0 #b9cde8; padding: 0 20px 0 6px;
  font: ${fontCss(14, 20)}; color: #000; outline: none; }
.dk-field:focus { border-color: #2f6fd8; box-shadow: inset 1px 1px 0 #b9cde8, 0 0 0 1px #9fd0ff; }
.dk-field::placeholder { color: #7a8796; }
.dk-x { position: absolute; width: 16px; height: 16px; border: 0; padding: 0; background: none; color: #557; font: bold 13px/16px ${FONT}; }
.dk-chip { position: absolute; box-sizing: border-box; height: 20px; padding: 0 3px; border: 1px solid #6a6a6a; border-radius: 3px;
  font: ${fontCss(12, 18)}; color: #111; background: linear-gradient(#fff, var(--c) 70%); white-space: nowrap; }
.dk-chip[aria-pressed=true] { border-color: #1a3fbf; box-shadow: 0 0 0 1px #fff, 0 0 0 2px #1a3fbf; }
.dk-icon { position: relative; width: 20px; height: 20px; padding: 1px; border: 1px solid transparent; border-radius: 3px; background: none; }
.dk-icon > i { display: block; width: 16px; height: 16px; background-repeat: no-repeat; image-rendering: auto; }
.dk-icon[aria-pressed=true] { border-color: #1a3fbf; background: #fffbd0; }
.dk-row { position: absolute; left: 12px; right: 12px; display: flex; flex-wrap: wrap; gap: 2px; align-items: center; }
.dk-lbl { position: absolute; left: 12px; color: #fff; font: ${fontCss(13, 16)}; text-shadow: 0 0 2px #035, 0 0 1px #035; }
.dk-num { position: static; width: 52px; height: 20px; padding: 0 4px; }
.dk-solid::before { opacity: 1 !important; }
.dk-count { position: absolute; color: #fff; white-space: nowrap; font: ${fontCss(13, 20)}; text-shadow: 0 0 2px #000, 0 0 1px #000; }
`;
let searchCssDone = false;
// the trunk's search panel in the Kaban window's root (x, y: the window's corner), kept between frames (its input
// keeps focus and caret); f: the filter, apply(f) hands it to the game
export function searchPanel(root, apply) {
  if (!searchCssDone) {
    searchCssDone = true;
    const st = document.createElement('style');
    st.textContent = SEARCH_CSS;
    document.head.append(st);
  }
  const f = emptyFilter(), el = document.createElement('div');
  el.className = 'dk-search';
  root.append(el);
  let timer = 0, popup = null;
  const changed = (now = false) => { clearTimeout(timer); timer = setTimeout(() => apply(structuredClone(f)), now ? 0 : 150); render(); };
  const btn = (parent, cls, text, x, y, on, click, w) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    b.setAttribute('aria-pressed', on);
    Object.assign(b.style, { left: x + 'px', top: y + 'px' }, w && { width: w + 'px' });
    b.onclick = click;
    parent.append(b);
    return b;
  };
  // the header: the search box over the "Rearrange" row, the category chips and the count over the icon row, on the
  // header's plate (#b0b0c3, sampled)
  const plate = document.createElement('div');
  Object.assign(plate.style, { position: 'absolute', left: '2px', top: '28px', width: '284px', height: '58px', background: '#b0b0c3' });
  el.append(plate);
  const input = document.createElement('input');
  input.className = 'dk-field';
  input.type = 'search';
  input.placeholder = 'Search name or card text';
  input.setAttribute('aria-label', 'Search the trunk');
  Object.assign(input.style, { left: '8px', top: '31px', width: '192px' });
  input.oninput = () => { f.text = input.value; changed(); };
  el.append(input);
  const clear = btn(el, 'dk-x', '×', 180, 34, false, () => { input.value = f.text = ''; changed(true); input.focus(); });
  clear.setAttribute('aria-label', 'Clear the search');
  const filters = menuButton(el, { x: 204, y: 30, w: 80, h: 24, label: 'Filters', state: null });
  filters.onclick = () => { popup ? close() : open(); };
  const chips = document.createElement('div'), count = document.createElement('div');
  el.append(chips, count);
  count.className = 'dk-count';
  Object.assign(count.style, { left: '104px', top: '4px' });   // beside the "Trunk" title
  function render() {
    clear.hidden = !f.text;
    const n = filterCount(f);
    filters.set({ label: n ? `Filters (${n})` : 'Filters' });
    chips.replaceChildren();
    let x = 8;
    for (const [name, v, c] of CATS) {
      const b = btn(chips, 'dk-chip', name, x, 60, f.cat === v, () => { f.cat = v; changed(true); });
      b.style.setProperty('--c', c);
      x += Math.ceil(textWidth(name, 12)) + 8 + 2;
    }
    if (popup) fillPopup();
  }
  // the Filters popup (EDOPro's search panel): the game's blue panel and title bar over the list
  // the game's panel is see-through (alpha 178); over a busy list the popup reads better opaque (dk-solid)
  function open() { popup = panel(el, { x: 4, y: 88, w: 280, h: 420 }); popup.classList.add('dk-solid'); fillPopup(); }
  function close() { popup?.remove(); popup = null; }
  function fillPopup() {
    popup.replaceChildren();
    const bar = titleBar(popup, { x: 0, y: 0, w: 280, title: 'Card Search' });
    bar.close.onclick = close;
    let y = 28;
    const section = (title, h) => { const l = document.createElement('div'); l.className = 'dk-lbl'; l.textContent = title; l.style.top = y + 'px'; popup.append(l); const r = document.createElement('div'); r.className = 'dk-row'; r.style.top = y + 16 + 'px'; popup.append(r); y += 16 + h + 6; return r; };
    const toggle = (arr, v) => () => { const i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1); changed(true); };
    const icons = (row, strip, names, arr) => names.forEach((n, i) => {
      const b = btn(row, 'dk-icon', '', 0, 0, arr.includes(i), toggle(arr, i));
      Object.assign(b.style, { position: 'relative', left: 0, top: 0 });
      b.title = n; b.setAttribute('aria-label', n);
      const ic = document.createElement('i');
      ic.style.backgroundImage = `url(${base()}${strip})`;
      ic.style.backgroundPosition = `${-16 * i}px 0`;
      b.append(ic);
    });
    icons(section('Attribute', 20), 'icon_zokusei_01.png', ATTRS, f.attr);
    icons(section('Type', 42), 'icon_syuzoku_01.png', RACES, f.race);
    icons(section('Spell / Trap', 20), 'icon_mahouwana_01.png', ICONS, f.icon);
    const lv = section('Level / Rank', 20);
    for (let i = 1; i <= 12; i++) { const b = btn(lv, 'dk-chip', String(i), 0, 0, f.level.includes(i), toggle(f.level, i)); Object.assign(b.style, { position: 'relative', left: 0, top: 0, width: '19px', padding: 0, textAlign: 'center' }); b.style.setProperty('--c', '#e8e8e8'); }
    const range = (title, key) => {
      const r = section(title, 20);
      [0, 1].forEach(k => {
        const i = document.createElement('input');
        i.className = 'dk-field dk-num';
        i.inputMode = 'numeric';
        i.placeholder = k ? 'max' : 'min';
        i.setAttribute('aria-label', `${title} ${k ? 'at most' : 'at least'}`);
        i.value = f[key][k] ?? '';
        i.onchange = () => { const v = parseInt(i.value); f[key][k] = Number.isFinite(v) ? v : null; changed(true); };
        r.append(i);
        if (!k) { const d = document.createElement('span'); d.textContent = '–'; d.style.color = '#fff'; r.append(d); }
      });
    };
    range('ATK', 'atk');
    range('DEF', 'def');
    const lim = section('Limit', 20);
    for (const [n, v] of LIMITS) { const b = btn(lim, 'dk-chip', n, 0, 0, f.limit.includes(v), toggle(f.limit, v)); Object.assign(b.style, { position: 'relative', left: 0, top: 0 }); b.style.setProperty('--c', '#e8e8e8'); }
    const so = section('Sort', 20);
    for (const [n, v] of SORTS) { const b = btn(so, 'dk-chip', n, 0, 0, f.sort === v, () => { f.sort = v; changed(true); }); Object.assign(b.style, { position: 'relative', left: 0, top: 0 }); b.style.setProperty('--c', '#e8e8e8'); }
    const reset = menuButton(popup, { x: 12, y: 420 - 34, w: 120, label: 'Clear filters', state: null });
    reset.onclick = () => { Object.assign(f, emptyFilter(), { text: f.text }); changed(true); };
    const done = menuButton(popup, { x: 148, y: 420 - 34, w: 120, label: 'Done', state: null });
    done.onclick = close;
  }
  render();
  // the hits; the engine's own count box beside it shows the total
  return { el, setCount: (n, total) => { count.textContent = n == null ? '' : `${n} / ${total} shown`; } };
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
const live = new Map(), scene = { el: null, key: '' };   // scene: the backdrop's last drawing
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
  if (scene.el) scene.el.style.clipPath = clip({ z: -Infinity, rect: { x: 0, y: 0, w: 1024, h: 712 } }, holes, 0, 0);
}

export default {
  classes: ['CWindowModelDeck', 'CWindowModelKaban', 'CWindowModelFileList', 'CCardDetailViewDlg',
    'CWindowModelListCard', 'CWindowModelListCardAttr', 'CWindowModelListCardType', 'CWindowModelListCardIcon',
    'CWindowModelListCardStar', 'CWindowModelListCardForbi'],
  mode: 'pass',
  parts: true,    // the controls' raw sprites / texts / swfs: most of the editor's art
  clip: false,    // the deck models lay out in screen pixels outside their nominal 336 x 144
  passthrough,
  mount(win, root, api) {
    const inner = document.createElement('div');
    inner.className = 'layer';
    root.append(inner);
    // the trunk's search: the game's filter hook (the recomp's Module.yo2KabanFilter) when it has one
    const search = win.cls === 'CWindowModelKaban'
      ? searchPanel(root, f => (globalThis.Module?.yo2KabanFilter || api?.kabanFilter)?.(f)) : null;
    return { inner, search };
  },
  update(win, prev, root, api, st) {
    root.setAttribute('aria-label', win.cls);
    live.set(win.id, { win, root: st.inner, plan: plan(win), api });
    const list = st.search && win.controls.find(c => c.cls === 'CWindowTaskKabanList');
    if (list) st.search.setCount(list.hits, list.total);
    draw(win.id, api);
  },
  // the scene (the Deck window's `scene`): the engine's background, title strip and side buttons are hidden, the
  // backdrop layer under every window root draws them; redrawn when they or the hovered button change, clipped around
  // every deck hole (card faces, swfs: the engine draws those)
  hide: win => win.scene ? [win.scene.bg, win.scene.title, ...win.scene.menu].filter(Boolean).map(e => e.id) : [],
  backdrop(win, el) {
    const sc = win.scene;
    if (!sc) return;
    const key = JSON.stringify([sc.title, sc.menu, sc.menu.map(b => inSide(b, sc.mouse))]);
    if (scene.el !== el.firstChild || key !== scene.key) {
      const d = document.createElement('div');
      // the layer has no box; down to the deck windows' foot (712): below is the game's menu bar, engine-drawn
      Object.assign(d.style, { position: 'absolute', left: 0, top: 0, width: '1024px', height: '712px', overflow: 'hidden' });
      drawScene(d, sc);
      el.replaceChildren(d);
      Object.assign(scene, { el: d, key });
      reclip();
    }
  },
  unmount(root, st) {
    for (const [id, L] of live) if (L.root === st.inner) live.delete(id);
    reclip();
  },
};
