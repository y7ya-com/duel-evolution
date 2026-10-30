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
// the swfs whose size is known from their art: the trunk's count box (kabancnt_0..2: 72 x 21) holds the count text
const SWF_SIZE = { KabanCountBtn: [72, 21] };

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
    for (const f of P.swfs || []) {
      const [w, h] = SWF_SIZE[f.name] || [SWF_BOX, SWF_BOX];
      if (f.shown) hole(f.wz ?? 0, { x: f.wx, y: f.wy, w, h });
    }
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

// rects as disjoint ones covering the same area (vertical slabs between the x edges, y spans merged per slab): an
// evenodd path cuts each once (overlapping holes, the deck's fanned cards, would cancel out where they overlap)
export function union(rects) {
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b), out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const spans = rects.filter(r => r.x <= xs[i] && r.x + r.w >= xs[i + 1]).map(r => [r.y, r.y + r.h]).sort((a, b) => a[0] - b[0]);
    for (const [y0, y1] of spans) {
      const last = out.at(-1);
      if (last && last.x === xs[i] && y0 <= last.y + last.h) last.h = Math.max(last.h, y1 - last.y);
      else out.push({ x: xs[i], y: y0, w: xs[i + 1] - xs[i], h: y1 - y0 });
    }
  }
  return out;
}
// clip-path for an item: the holes in front of it that it overlaps (local to the window root)
export function clip(item, holes, ox, oy) {
  const front = holes.filter(h => h.z > item.z && meet(h.rect, item.rect));
  if (!front.length) return '';
  const r = ({ x, y, w, h }) => `M${x - ox} ${y - oy}h${w}v${h}h${-w}z`;
  return `path(evenodd, "M${-ox} ${-oy}h2048v2048h-2048z${union(front.map(h => h.rect)).map(r).join('')}")`;
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
  const g = /^deck_font_01_c0([12])/.exec(artName(s.tex));
  if (g) return drawDigit(el, s, g[1] === '2', x, y);
  const vec = vectorArt(s);
  if (vec) return drawVector(el, vec, x, y, s.src[2] * (s.sx ?? 1), s.src[3] * (s.sy ?? 1), s.a ?? s.rgba?.[3] ?? 1);
  const sh = sheet(s.tex, redrawing);
  if (!sh) return;
  const [u, v, w, h] = s.src, rgba = s.rgba || [1, 1, 1, 1];   // a: the alpha it's drawn with (inherited), else its own
  const e = ui.sprite(el, sh, u, v, w, h, x, y, w * (s.sx ?? 1), h * (s.sy ?? 1), s.a ?? rgba[3]);
  const c = s.col || rgba;   // vertex colour as drawn (inherited: a back plane's 0.63 grey), else its own
  if (c[0] !== 1 || c[1] !== 1 || c[2] !== 1)   // the trunk dims a row's art to 0.5 grey
    e.style.filter = c[0] === c[1] && c[1] === c[2] ? `brightness(${c[0]})` : '';
}
// deck_font_01 (the trunk's copy counts, "×000"): glyph cells, 8 x 12, digits 0-9 then a "×", white on a black box
// (c02: red). Blurry at 2x as a bitmap and glyph images besides (the owner's rules): the box is CSS, the digit Arial.
function drawDigit(el, s, red, x, y) {
  const i = s.src[0] / 8, d = document.createElement('div');
  d.textContent = i >= 10 ? '×' : String(i);
  Object.assign(d.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: '8px', height: '12px',
    background: i >= 10 ? 'none' : red ? '#ff0000' : '#000', color: '#fff', font: `bold ${fontCss(13, 12)}`,
    textAlign: 'center', opacity: (s.a ?? 1) === 1 ? '' : s.a,
    textShadow: i >= 10 ? '0 0 1px #000, 0 0 1px #000' : '' });
  el.append(d);
  return d;
}

// The small icons and the scroll bar, vector (the owner's rule: what is blurry or pixelated at 2x becomes CSS / SVG
// with the art's sampled colours): an SVG in the sprite's own 16 x 16 (or w x h) frame, scaled with it.
// Attribute discs (icon_zokusei_01 cells 0..8): [rim, top, bottom, kanji colour, kanji]; the kanji is the art's own.
const ATTR_SVG = [['#ffc850', '#fff6d0', '#e0a830', '#3f2610', '光'], ['#2f0847', '#c43ad8', '#730889', '#fff', '闇'],
  ['#002642', '#0f85ff', '#003e67', '#fff', '水'], ['#4b0310', '#ff3a33', '#b90100', '#fff', '炎'],
  ['#000', '#5a5a5a', '#000', '#fff', '地'], ['#011701', '#14be32', '#016a0c', '#fff', '風'],
  ['#f0f067', '#fffbe0', '#e8c040', '#3f2610', '神'], ['#011551', '#8ba7ff', '#0033b9', '#fff', '魔'],
  ['#010721', '#c03040', '#841c28', '#fff', '罠']];
// spell / trap icons (icon_mahouwana_01 cells 0..6): the white ring, the brown body, a white symbol
const ICON_PATH = ['M5 6.5a3.2 3.2 0 1 1 1 4.6M5 6.5V4.2M5 6.5h2.3',   // counter: an arrow turning back
  'M8 3.6 9.2 6.8 12.4 8 9.2 9.2 8 12.4 6.8 9.2 3.6 8 6.8 6.8Z',            // field: a four-point star
  'M8 4.2v7.6M4.2 8h7.6',                                                   // equip: a cross
  'M8 8c-1.2-1.6-3.6-1.6-3.6 0s2.4 1.6 3.6 0 3.6-1.6 3.6 0-2.4 1.6-3.6 0',     // continuous: infinity
  'M9 3.8 5.6 8.6h2.8L7 12.2l3.4-4.8H7.6Z',                                 // quick-play: a bolt
  'M8 3.8c1.6 2 2.8 3.2 2.8 5a2.8 2.8 0 0 1-5.6 0c0-.9.5-1.6 1-2.1.1 1 .6 1.5 1.1 1.6C7 6.8 7.4 5.4 8 3.8Z',   // ritual: a flame
  ''];                                                                      // normal: none
const SVGNS = 'http://www.w3.org/2000/svg';
export const vectorArt = s => {
  const n = artName(s.tex), [u, v, w, h] = s.src;
  if (n === 'icon_zokusei_01.png' && ATTR_SVG[u / 16]) return { kind: 'attr', i: u / 16 };
  if (n === 'icon_mahouwana_01.png' && u / 16 < 7) return { kind: 'icon', i: u / 16 };
  if (n === 'icon_star_01.png') return { kind: 'star' };
  if (n === 'font_k_star.png') return { kind: 'level', i: u / 14 + 1 };
  if (n === 'scroll_01_c00.png') return { kind: 'scroll', u, v, w, h };
  if (n === 'icon_syuzoku_01.png') return { kind: 'pixel', n, u, v };
  return null;
};
function drawVector(el, a, x, y, w, h, alpha) {
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px',
    opacity: alpha === 1 ? '' : alpha });
  el.append(box);
  if (a.kind === 'level') {   // the level beside the star: a glyph strip (italic serif, brown in cream) as Arial text
    box.textContent = a.i;
    Object.assign(box.style, { font: `italic bold ${fontCss(14, h)}`, color: '#4f0d00', textAlign: 'center',
      textShadow: '0 0 1px #e0bb7e, 0 0 1px #e0bb7e, 0 0 2px #e0bb7e' });
    return box;
  }
  if (a.kind === 'scroll') return scrollPart(box, a, w, h);
  if (a.kind === 'pixel') {   // the 21 monster-type pictures stay pixel art (owner): the cell, nearest-neighbour, crisp
    Object.assign(box.style, { backgroundImage: `url(${base()}${a.n})`, backgroundPosition: `${-a.u}px ${-a.v}px`,
      backgroundRepeat: 'no-repeat', imageRendering: 'pixelated' });
    return box;
  }
  const id = 'dk' + Math.random().toString(36).slice(2, 8);
  let body;
  if (a.kind === 'attr') {
    const [rim, top, bot, ink, kanji] = ATTR_SVG[a.i];
    body = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>
      <circle cx="8" cy="8" r="7.6" fill="${rim}"/><circle cx="8" cy="8" r="6.4" fill="url(#${id})"/>
      <text x="8" y="11.6" text-anchor="middle" font-size="10" font-weight="bold" fill="${ink}"
        font-family="'Hiragino Sans','Yu Gothic','Noto Sans CJK JP','Microsoft YaHei',sans-serif">${kanji}</text>`;
  } else if (a.kind === 'icon') {
    body = `<defs><radialGradient id="${id}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#e3b289"/><stop offset=".6" stop-color="#b06e37"/><stop offset="1" stop-color="#7c3904"/></radialGradient></defs>
      <circle cx="8" cy="8" r="7.6" fill="#490e00"/><circle cx="8" cy="8" r="6.9" fill="#fffffd"/>
      <circle cx="8" cy="8" r="5.8" fill="${a.i === 6 ? '#490e00' : `url(#${id})`}"/>
      ${ICON_PATH[a.i] ? `<path d="${ICON_PATH[a.i]}" fill="${a.i === 2 || a.i === 0 || a.i === 3 ? 'none' : '#fffffd'}" stroke="#fffffd" stroke-width="${a.i === 2 ? 1.8 : a.i === 1 || a.i === 4 || a.i === 5 ? 0.4 : 1.4}" stroke-linecap="round" stroke-linejoin="round"/>` : ''}`;
  } else {   // the level star (icon_star_01, 19 x 16): a fiery disc, a yellow star, a white x
    body = `<defs><radialGradient id="${id}" cx=".45" cy=".45" r=".6"><stop offset="0" stop-color="#e5f41e"/><stop offset=".55" stop-color="#e8701c"/><stop offset=".85" stop-color="#9e2728"/><stop offset="1" stop-color="#3f0607"/></radialGradient></defs>
      <circle cx="7.5" cy="7.5" r="7.2" fill="url(#${id})"/>
      <path d="M7.5 2.6 8.9 6 12.4 6.1 9.6 8.3 10.6 11.8 7.5 9.8 4.4 11.8 5.4 8.3 2.6 6.1 6.1 6Z" fill="#f4f87a"/>
      <path d="M12.6 10.6 17.4 15.4M17.4 10.6 12.6 15.4" stroke="#3f0607" stroke-width="3" stroke-linecap="round"/>
      <path d="M12.6 10.6 17.4 15.4M17.4 10.6 12.6 15.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  box.innerHTML = `<svg xmlns="${SVGNS}" viewBox="0 0 ${a.kind === 'star' ? 19 : 16} 16" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
  return box;
}
// scroll_01_c00's cells as CSS (#92979a lines on white, the track #d4e2e4): the arrow buttons (columns 0 / 16 / 32:
// normal, disabled, pressed), the thumb's top / middle / bottom slices, the track
function scrollPart(box, { u, v, w, h }, W, H) {
  const col = u / 16, line = ['#92979a', '#b1b7bb', '#070707'][col] || '#92979a', face = col === 2 ? '#92979a' : '#fff';
  const ink = ['#92979a', '#e2e9ed', '#fff'][col] || '#92979a';
  if (u >= 48) { box.style.background = '#d4e2e4'; return box; }   // the track
  if (v >= 32 && v < 56) {   // the thumb, 12 wide in its 16: the top slice has the top edge, the bottom one the bottom
    Object.assign(box.style, { boxSizing: 'border-box', left: parseFloat(box.style.left) + 2 * W / 16 + 'px', width: 12 * W / 16 + 'px',
      background: '#fff', borderLeft: `1px solid ${line}`, borderRight: `1px solid ${line}`,
      borderTop: v === 32 ? `1px solid ${line}` : '', borderBottom: v === 48 ? `1px solid ${line}` : '' });
    return box;
  }
  // an arrow button: a 14 x 14 square in its 16, the arrow a pentagon (up / down / left / right by the row)
  const dir = [0, 1, , , 2, 3][v / 16 | 0] ?? 0, P = ['50% 22%,82% 54%,82% 78%,18% 78%,18% 54%', '18% 22%,82% 22%,82% 46%,50% 78%,18% 46%',
    '78% 18%,78% 82%,46% 82%,22% 50%,46% 18%', '22% 18%,54% 18%,78% 50%,54% 82%,22% 82%'][dir];
  Object.assign(box.style, { boxSizing: 'border-box', border: `1px solid ${line}`, background: face, margin: '1px',
    width: W - 2 + 'px', height: H - 2 + 'px' });
  const tri = document.createElement('div');
  Object.assign(tri.style, { position: 'absolute', inset: '1px', background: ink, clipPath: `polygon(${P})` });
  box.append(tri);
  return box;
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
// Values are the cards' icon strip cells (the game's own order, checked against live rows): attribute 0 Light ..
// 6 Divine; type 0 Dragon .. 20 Divine-Beast; spell / trap 0 counter, 1 field, 2 equip, 3 continuous, 4 quick-play,
// 5 ritual, 6 normal; limit = copies allowed (0..3). The game hook turns them into the engine's values.
// the category chips in the colours of the trunk's own "Rearrange" swatches (sampled from the engine's frame)
const CATS = [['All', 6, '#8a8a8a'], ['Normal', 0, '#f4dd3f'], ['Effect', 1, '#ffa127'], ['Fusion', 5, '#ba17ef'],
  ['Ritual', 4, '#2a98ff'], ['Spell', 2, '#31f15a'], ['Trap', 3, '#ff79c8']];
const ATTRS = ['Light', 'Dark', 'Water', 'Fire', 'Earth', 'Wind', 'Divine'];
const RACES = ['Dragon', 'Zombie', 'Fiend', 'Pyro', 'Sea Serpent', 'Rock', 'Machine', 'Fish', 'Dinosaur', 'Insect', 'Beast',
  'Beast-Warrior', 'Plant', 'Aqua', 'Warrior', 'Winged Beast', 'Fairy', 'Spellcaster', 'Thunder', 'Reptile', 'Divine-Beast'];
const ICONS = ['Counter', 'Field', 'Equip', 'Continuous', 'Quick-Play', 'Ritual', 'Normal'];
const LIMITS = [['Forbidden', 0], ['Limited', 1], ['Semi-limited', 2], ['Unlimited', 3]];
const SORTS = [['Default', ''], ['Name', 'name'], ['ATK, high to low', 'atk-'], ['ATK, low to high', 'atk+'], ['DEF, high to low', 'def-'], ['DEF, low to high', 'def+']];
export const emptyFilter = () => ({ cat: 6, text: '', attr: [], race: [], icon: [], level: [], limit: [], atk: [null, null], def: [null, null], sort: '' });
// how many criteria beyond the category and the text (the Filters button's badge)
export const filterCount = f => f.attr.length + f.race.length + f.icon.length + f.level.length + f.limit.length +
  (f.atk[0] != null || f.atk[1] != null) + (f.def[0] != null || f.def[1] != null) + !!f.sort;
// The look is the deck editor's own (sampled from the engine's frame): silver chips with the card-colour stripe the
// trunk's rows carry, the side menu's blue bevel for buttons, and a popup built like the Deck / Trunk panels: the
// silver bevel frame (#dadfe8 .. #b6bbc5 in, #8d919f .. #bcc0cb out), the trunk's lavender header bar (#c6c7d6, #8e8fad
// to #757f9d) with its glowing title, grey body (#a1a1a1), and light rows like the Side bar (#e0e1dc over #cccccb).
const BEVEL = 'linear-gradient(to bottom, #fff 0 1px, rgb(105 255 255) 1px, rgb(80 228 255) 18%, rgb(62 178 255) 30%, rgb(37 120 254) 72%, rgb(6 94 254) 80%, rgb(0 0 254) 96%, #fff 96%)';
const BEVEL_HOVER = 'linear-gradient(to bottom, #fff 0 1px, rgb(207 255 255) 1px, rgb(152 255 255) 20%, rgb(134 237 255) 28%, rgb(118 221 255) 72%, rgb(81 209 255) 82%, rgb(12 188 255) 96%, #fff 96%)';
const SEARCH_CSS = `
.dk-search { position: absolute; pointer-events: auto; color: #000; }
.dk-field { position: absolute; box-sizing: border-box; height: 22px; margin: 0; padding: 0 20px 0 6px; border: 1px solid;
  border-color: #808080 #e8e8e8 #e8e8e8 #808080; border-radius: 0; background: #fff; box-shadow: inset 1px 1px 0 #c0c0c0;
  font: ${fontCss(14, 20)}; color: #000; outline: none; }
.dk-field:focus { border-color: #1059ff #8fb0ff #8fb0ff #1059ff; }
.dk-field::placeholder { color: #8a8a8a; }
.dk-sel { padding: 0 2px; }
.dk-x { position: absolute; width: 16px; height: 16px; border: 0; padding: 0; background: none; color: #666; font: bold 13px/16px ${FONT}; }
.dk-chip { position: absolute; box-sizing: border-box; height: 20px; margin: 0; padding: 0 4px 0 8px; border: 1px solid #8a8a8a;
  border-radius: 2px; background: linear-gradient(#f6f7f9, #d3d6dc); box-shadow: inset 4px 0 0 var(--c);
  font: ${fontCss(12, 18)}; color: #222; white-space: nowrap; }
.dk-chip:hover { background: linear-gradient(#fff, #e4e7ec); }
.dk-chip[aria-pressed=true] { background: #fff; border-color: #2b3a5c; color: #000; font-weight: bold;
  box-shadow: inset 4px 0 0 var(--c), 0 0 0 1px #2b3a5c; }
.dk-btn { position: absolute; box-sizing: border-box; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 3px;
  background: ${BEVEL}; color: #fff; font: bold ${fontCss(14, 24)}; white-space: nowrap; letter-spacing: 0.3px;
  text-shadow: -1px 0 #1059ff, 1px 0 #1059ff, 0 -1px #1059ff, 0 1px #1059ff, 0 0 2px #0013fe; box-shadow: 0 0 0 1px #fff, 0 1px 2px rgb(0 0 60 / 0.5); }
.dk-btn:hover { background: ${BEVEL_HOVER}; color: #fdff45;
  text-shadow: -1px 0 #ff9d10, 1px 0 #ff9d10, 0 -1px #ff9d10, 0 1px #ff9d10, 0 0 2px #c06000; }
.dk-btn:active { filter: brightness(0.92); }
.dk-pop { position: absolute; box-sizing: border-box; background: #a1a1a1; border: 1px solid #6e7486;
  box-shadow: inset 3px 3px 0 #dadfe8, inset 5px 5px 0 #c0c5cf, inset 7px 7px 0 #b6bbc5,
    inset -3px -3px 0 #8d919f, inset -5px -5px 0 #a5a9b7, inset -7px -7px 0 #bcc0cb, 0 4px 12px rgb(0 0 40 / 0.45); }
.dk-head { position: absolute; left: 7px; right: 7px; top: 7px; height: 28px;
  background: linear-gradient(to bottom, #fff 0 1px, #c6c7d6 1px 2px, #8e8fad 2px, #757f9d 27px, #8a8fab 27px); }
.dk-strip { position: absolute; left: 7px; right: 7px; height: 26px; background: #cccccb; border-top: 1px solid #e0e1dc;
  border-bottom: 1px solid #a1a1a1; }
.dk-lbl { position: absolute; left: 8px; color: #000; font: ${fontCss(14, 24)}; }
.dk-dash { position: absolute; color: #000; font: ${fontCss(14, 24)}; }
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
  const filters = btn(el, 'dk-btn', 'Filters', 204, 30, false, () => { popup ? close() : open(); }, 80);
  filters.setAttribute('aria-expanded', 'false');
  const chips = document.createElement('div'), count = document.createElement('div');
  el.append(chips, count);
  Object.assign(chips.style, { position: 'absolute', left: '8px', top: '60px', width: '274px', display: 'flex', gap: '2px' });
  count.className = 'dk-count';
  Object.assign(count.style, { left: '104px', top: '4px' });   // beside the "Trunk" title
  function render() {
    clear.hidden = !f.text;
    const n = filterCount(f);
    filters.textContent = n ? `Filters (${n})` : 'Filters';
    chips.replaceChildren();
    for (const [name, v, c] of CATS) {
      const b = btn(chips, 'dk-chip', name, 0, 0, f.cat === v, () => { f.cat = v; changed(true); });
      Object.assign(b.style, { position: 'static', flex: '1 1 auto', padding: '0 0 0 4px' });
      b.style.setProperty('--c', c);
    }
    if (popup) fillPopup();
  }
  // the Filters popup (EDOPro's search panel): the game's blue panel and title bar over the list
  function open() {
    popup = document.createElement('div');
    popup.className = 'dk-pop';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Card Search');
    Object.assign(popup.style, { left: '4px', top: '86px', width: '280px' });
    el.append(popup);
    filters.setAttribute('aria-expanded', 'true');
    fillPopup();
  }
  function close() { popup?.remove(); popup = null; filters.setAttribute('aria-expanded', 'false'); }
  // EDOPro's search panel, in text (the owner: words, not icons): one dropdown per field, the ATK / DEF ranges
  function fillPopup() {
    popup.replaceChildren();
    // the header bar, its title glowing like the trunk's ("Card Search" is the art's own word), the close box
    const head = document.createElement('div');
    head.className = 'dk-head';
    popup.append(head);
    drawTextArt(popup, MOJI[5], 12, 9, 1);
    const x = btn(popup, 'dk-btn', '×', 280 - 2 - 7 - 26, 9, false, close, 22);
    Object.assign(x.style, { height: '20px', lineHeight: '20px', fontSize: '16px' });
    x.setAttribute('aria-label', 'Close');
    let y = 40;
    const row = title => {
      const strip = document.createElement('div');
      strip.className = 'dk-strip';
      strip.style.top = y - 2 + 'px';
      popup.append(strip);
      const l = document.createElement('div');
      l.className = 'dk-lbl';
      l.textContent = title;
      l.style.top = y - 1 + 'px';
      l.style.left = '14px';
      popup.append(l);
      y += 28;
      return y - 28;
    };
    const select = (title, key, opts) => {
      const top = row(title), sel = document.createElement('select');
      sel.className = 'dk-field dk-sel';
      sel.setAttribute('aria-label', title);
      Object.assign(sel.style, { left: '96px', top: top + 'px', width: '172px' });
      for (const [n, v] of [[key === 'sort' ? 'Default' : 'Any', ''], ...opts]) sel.append(new Option(n, v));
      const cur = Array.isArray(f[key]) ? f[key][0] : f[key];
      sel.value = cur == null ? '' : String(cur);
      sel.onchange = () => {
        const v = sel.value === '' ? null : key === 'sort' ? sel.value : +sel.value;
        if (Array.isArray(f[key])) f[key] = v == null ? [] : [v]; else f[key] = v ?? '';
        changed(true);
      };
      popup.append(sel);
    };
    const range = (title, key) => {
      const top = row(title);
      [0, 1].forEach(k => {
        const i = document.createElement('input');
        i.className = 'dk-field';
        i.inputMode = 'numeric';
        i.placeholder = k ? 'max' : 'min';
        i.setAttribute('aria-label', `${title} ${k ? 'at most' : 'at least'}`);
        Object.assign(i.style, { left: 96 + 94 * k + 'px', top: top + 'px', width: '78px', paddingRight: '4px' });
        i.value = f[key][k] ?? '';
        i.onchange = () => { const v = parseInt(i.value); f[key][k] = Number.isFinite(v) ? v : null; changed(true); };
        popup.append(i);
      });
      const d = document.createElement('div');
      d.className = 'dk-dash';
      Object.assign(d.style, { left: '179px', top: top - 1 + 'px' });
      d.textContent = '–';
      popup.append(d);
    };
    select('Attribute', 'attr', ATTRS.map((n, i) => [n, i]));
    select('Type', 'race', RACES.map((n, i) => [n, i]));
    select('Spell / Trap', 'icon', ICONS.map((n, i) => [n, i]));
    select('Level / Rank', 'level', Array.from({ length: 12 }, (_, i) => [`Level ${i + 1}`, i + 1]));
    range('ATK', 'atk');
    range('DEF', 'def');
    select('Limit', 'limit', LIMITS);
    select('Sort by', 'sort', SORTS.slice(1));
    y += 6;
    btn(popup, 'dk-btn', 'Clear filters', 14, y, false, () => { Object.assign(f, emptyFilter(), { text: f.text, cat: f.cat }); changed(true); }, 120);
    btn(popup, 'dk-btn', 'Done', 146, y, false, close, 120);
    popup.style.height = y + 24 + 14 + 'px';
  }
  render();
  // the hits (the engine's own count box beside them is the deck's size)
  return { el, setCount: n => { count.textContent = n == null ? '' : `${n} shown`; } };
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

// ---------------------------------------------------------------- click to add / remove (owner, after EDOPro)
// Right-click or double-click (double-tap on a touch screen) moves one copy: a trunk card into the deck (Main; a
// Fusion into Extra), a deck card back to the trunk. Drag and drop stays as it is. The move IS the game's own drag,
// replayed as canvas mouse events: a press on the card (KabanListBtn / DeckCard onMessage pick it up), a release over
// the drop zone (CDeckScene::main's dropFromTrunk / dropFromDeck), so the copy limits, the deck sizes, the banlist,
// the dirty flag and the server save are all the game's. Drop zones (DeckEntryMain.cpp deckDropTarget / inTrunkZone):
// the grids x 256..728, y 88..480 (Extra: ..600); the trunk x 744..956, y 88..600.
export const DROP_DECK = [490, 300], DROP_TRUNK = [850, 300], FUSION_TAB = [540, 70];
const KLB_FUSION = 6;   // KabanWindowList.h: a trunk row's frame colour for a Fusion monster
const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
// what a right-click / double-click at game (x, y) moves, from the deck windows' latest snapshot: { press, drop,
// card, fusion } (press: where the game must see the button go down: on the card's picture), or null
export function quickMove(wins, x, y) {
  const pic = c => c.parts?.sprites?.find(q => q.shown && isArt(q));
  const kaban = wins.find(w => w.cls === 'CWindowModelKaban'), deck = wins.find(w => w.cls === 'CWindowModelDeck');
  for (const c of kaban?.controls || []) {
    if (c.cls !== 'CWindowTaskKabanListBtn' || !c.shown || !(c.card > 0)) continue;
    const p = pic(c), row = { x: c.wx, y: c.wy, w: c.w, h: c.h };
    if (!p || !inside(row, x, y)) continue;
    const r = spriteRect(p);   // anywhere on the row; the press lands on its picture
    return { press: inside(r, x, y) ? [x, y] : [r.x + r.w / 2, r.y + r.h / 2], drop: DROP_DECK, card: c.card, fusion: c.color === KLB_FUSION };
  }
  // the deck's cards fan out over each other: the one drawn on top at (x, y), as the game picks it
  let top = null;
  for (const c of deck?.controls || []) {
    const p = c.cls === 'CWindowTaskDeckCard' && c.shown && c.card > 0 && pic(c);
    if (p && inside(spriteRect(p), x, y) && (!top || p.wz > top.z)) top = { c, z: p.wz };
  }
  return top && { press: [x, y], drop: DROP_TRUNK, card: top.c.card, fusion: false };
}
let quickBusy = Promise.resolve(), quickOn = false;
function quickInstall() {
  const canvas = document.getElementById('canvas');
  if (quickOn || !canvas) return;
  quickOn = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const game = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * 1024 / r.width, (e.clientY - r.top) * 1024 / r.width]; };
  const client = ([x, y]) => { const r = canvas.getBoundingClientRect(), k = r.width / 1024; return [r.left + x * k, r.top + y * k]; };
  const fire = (type, p) => { const [x, y] = client(p); canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true,
    clientX: x, clientY: y, button: 0, buttons: type === 'mousedown' ? 1 : 0 })); };
  // the game reads the mouse once a frame: each step held ~3 frames
  const press = async p => { fire('mousemove', p); await sleep(50); fire('mousedown', p); await sleep(50); };
  const release = async p => { fire('mousemove', p); await sleep(50); fire('mouseup', p); await sleep(50); };
  const act = e => {
    if (!live.size) return;
    const at = game(e), wins = [...live.values()].map(L => L.win), m = quickMove(wins, ...at);
    if (!m) return;
    e.preventDefault?.();
    quickBusy = quickBusy.then(async () => {
      const deck = wins.find(w => w.cls === 'CWindowModelDeck'), view = deck?.controls.find(c => c.cls === 'CWindowTaskDeck')?.view;
      if (m.fusion && view !== 'extra') { await press(FUSION_TAB); await release(FUSION_TAB); await sleep(100); }
      await press(m.press);
      await release(m.drop);
      fire('mousemove', at);   // the pointer back where the player has it
    });
  };
  canvas.addEventListener('contextmenu', act, true);
  canvas.addEventListener('dblclick', act, true);
  // a double-tap (a long press still opens the card detail: the game's)
  let tap = null;
  canvas.addEventListener('touchend', e => {
    const t = e.changedTouches[0], now = performance.now();
    if (tap && now - tap.t < 350 && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) < 24) { tap = null; act(t); }
    else tap = { t: now, x: t.clientX, y: t.clientY };
  }, { capture: true, passive: true });
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
    quickInstall();
    const inner = document.createElement('div');
    inner.className = 'layer';
    root.append(inner);
    // the trunk's search: the game's filter hook (the recomp's Module.yo2KabanFilter) when it has one
    // the trunk's search: the game's filter (ovr/decksearch.c's Module.yo2KabanFilter, on the trunk list the snapshot
    // names; absent in an older runtime: no search)
    const st = { inner, search: null, list: 0 };
    if (win.cls === 'CWindowModelKaban') st.search = searchPanel(root, f => globalThis.Module?.yo2KabanFilter?.(st.list, f));
    return st;
  },
  update(win, prev, root, api, st) {
    root.setAttribute('aria-label', win.cls);
    live.set(win.id, { win, root: st.inner, plan: plan(win), api });
    const list = st.search && win.controls.find(c => c.cls === 'CWindowTaskKabanList');
    if (list) { st.list = list.id; st.search.setCount(list.hits); }
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
