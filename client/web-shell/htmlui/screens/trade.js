// Card Swap (CTradeScene, scene 0x26), the TP prize (CTpScene, 0x28) and the present (0x27): their windows in HTML.
// CWindowModelTrade (the two offer rows, src/Deck/TradeWindow.h), CWindowModelTp / CWindowModelPresent (a guide over a
// card area) and CWindowTaskCardArea (the framed area under a row: src/Deck/DeckParts.cpp create, 0x00917240).
// Their art is the window skin and nothing else: the area's 14-piece frame (window_base_01_cNN: mode 1 mine c02 green,
// 2 the partner's c04 pink, 3 / 4 present / TP c07 silver), its back plane (CWindowTaskBackPlane: c01's 8,8 piece, white
// at 0.7, yo2WindowControls.cpp 0x005a6d70), FrameThin / TextField pieces of the same atlases, and the two text switches
// (swich_01). The owner's Skin rule: those become CSS, sharp at any DPR. Each window_base piece is drawn where the
// snapshot puts it (world position, src rect, scale), from its own texels read once from the atlas: a piece that is the
// same along a row or a column (every stretched edge, the plane) is a CSS gradient of hard stops, one per texel band,
// so its bevel lines stay sharp at 2x however far it is stretched; a corner (8 x 8, never stretched) is an SVG of its
// texel runs (crispEdges). The switches are controls/basic.js's (skin plate, Arial caption, the snapshot's state).
// Text is DOM Arial (textBox, spacing). The engine keeps drawing what is a picture or Flash: card faces (data/CARD,
// data/MINI), the ready lamps (trade_icon101 / 102 / 202 swfs, 136 x 150) and any texture this module doesn't know
// (drawn exactly, never lost). Everything here is clipped around those holes (painter's order by world z, across these
// windows and the deck windows that share the scene: a card dragged out of the trunk crosses the areas, one of mine
// dragged back crosses the trunk), as screens/deck.js does; what lies under a hole is drawn by the engine too (co-drawn)
// so the hole shows exactly the engine's pixels.
// Pass mode: the game takes the mouse (drag and drop, the switches, the hover that opens the card detail).
import * as ui from '../../ui.js';
import deck, { spriteRect, clip, artName, runs, TAG_RGB, plan as deckPlan } from './deck.js';
import { textBox, textWidth, spacing } from '../controls/basic.js';

export const CLASSES = ['CWindowModelTrade', 'CWindowModelTp', 'CWindowModelPresent', 'CWindowTaskCardArea'];
// card faces (the trade / TP / present rows: data/CARD; the trunk's thumbnails: data/MINI)
const isArt = e => /^data[\\/](mini|card|cardpack)[\\/]/i.test(e?.tex || '');
const isSwf = e => !e.cls && !('tex' in e) && !('text' in e);   // a Swf part: { id, name, x, y, z, wx, wy, shown }
// the skin atlases drawn as CSS (window_base_01_c00..c08: frames, planes, text field planes)
export const isSkin = tex => /^window_base_01_c0\d\.png$/.test(artName(tex || ''));
// a swf's size isn't readable (CSwfEngine's player isn't decompiled). The trade window's lamps are trade_icon*.txt
// swfs on a 2720 x 3000 twip stage: 136 x 150. Elsewhere deck.js's generous 32. Too big is harmless (what is under a
// hole is co-drawn: the engine's own pixels), too small would cut a lamp.
const SWF_BOX = 32, LAMP = [136, 150];
// the buttons controls/basic.js draws (skin plate, caption, state): the area's TradereadySwitch / TradecancelSwitch
const BUTTONS = new Set(['CWindowTaskTextSwitch', 'CWindowTaskSwitch', 'CWindowTaskButtonMain', 'CWindowTaskButtonDuel']);
const meet = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------------------------------------------------------------- skin pieces as CSS (texels read at runtime: the
// art stays on R2, only its colours reach the DOM)
const sheets = new Map();
const base = () => ui.SHEET.window.url.replace(/[^/]*$/, '');   // the art folder loadGlyphs() was given
function sheet(tex, waiter) {
  const name = artName(tex);
  let s = sheets.get(name);
  if (!s) {
    s = { ready: false, waiting: new Set() };
    sheets.set(name, s);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = new OffscreenCanvas(img.width, img.height).getContext('2d', { willReadFrequently: true });
      c.drawImage(img, 0, 0);
      Object.assign(s, { ready: true, w: img.width, h: img.height, px: c.getImageData(0, 0, img.width, img.height).data });
      const ids = [...s.waiting];
      s.waiting.clear();
      ids.forEach(id => { const L = live.get(id); if (L) draw(L); });
    };
    img.onerror = () => console.warn('htmlui trade: no art for', tex);
    img.src = base() + name;
  }
  if (!s.ready && waiter != null) s.waiting.add(waiter);
  return s.ready ? s : null;
}
// one piece's look: its texels (src rect) times the drawn colour, as a CSS background (w x h: its drawn size)
const hex = ([r, g, b, a]) => a >= 255 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${(a / 255).toFixed(3)})`;
export function pieceCss(sh, [u, v, w, h], col = [1, 1, 1, 1]) {
  const T = [], A = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const tx = Math.min(u + x, sh.w - 1), ty = Math.min(v + y, sh.h - 1), i = 4 * (ty * sh.w + tx), p = sh.px;
      row.push(hex([p[i] * col[0], p[i + 1] * col[1], p[i + 2] * col[2], p[i + 3]].map(Math.round)));
      (A[y] ||= []).push(p[i + 3]);
    }
    T.push(row);
  }
  const rowsFlat = T.every(r => r.every(c => c === r[0])), colsFlat = T.every(r => r.every((c, x) => c === T[0][x]));
  // hard stops: band k from k/n to (k + 1)/n of the drawn size, merged where neighbours match
  const bands = (cs, dir) => {
    if (cs.every(c => c === cs[0])) return cs[0];
    const n = cs.length, stops = [];
    for (let k = 0; k < n; k++) if (k === n - 1 || cs[k + 1] !== cs[k]) {
      const from = stops.length ? stops.at(-1).to : 0;
      stops.push({ c: cs[k], from, to: (k + 1) / n });
    }
    return `linear-gradient(to ${dir}, ${stops.map(s => `${s.c} ${(100 * s.from).toFixed(3)}% ${(100 * s.to).toFixed(3)}%`).join(', ')})`;
  };
  if (rowsFlat && colsFlat) return { bg: T[0][0] };
  if (rowsFlat) return { bg: bands(T.map(r => r[0]), 'bottom') };
  if (colsFlat) return { bg: bands(T[0], 'right') };
  // a corner: its texel runs as SVG rects, scaled with the piece (never stretched in practice: 1:1, doubled at 2x)
  let body = '';
  T.forEach((r, y) => {
    for (let x = 0; x < w;) {
      let e = x + 1;
      while (e < w && r[e] === r[x]) e++;
      if (!/\/ 0\.000\)$/.test(r[x])) body += `<rect x='${x}' y='${y}' width='${e - x}' height='1' fill='${r[x]}'/>`;
      x = e;
    }
  });
  return { bg: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none' shape-rendering='crispEdges'>${body}</svg>`)}") 0 0 / 100% 100% no-repeat`,
    clip: cornerClip(A, w, h) };
}
// A corner's cut-off (the frame's bottom-right bevel ends in a 45-degree staircase of transparent texels): a polygon
// through the middle of each row's last / first opaque texel, so the edge is a straight diagonal at any DPR, not
// pixel steps. '' when every row is opaque edge to edge. One opaque span a row (the skin's corners).
export function cornerClip(A, w, h) {
  const spans = A.map(r => { const s = r.findIndex(a => a >= 128); return s < 0 ? null : [s, r.length - [...r].reverse().findIndex(a => a >= 128)]; });
  if (spans.every(s => s && s[0] === 0 && s[1] === w) || spans.some(s => !s)) return '';
  const pt = (x, y) => `${(100 * x / w).toFixed(2)}% ${(100 * y / h).toFixed(2)}%`, right = [], left = [];
  spans.forEach(([s, e], y) => {
    const prevE = spans[y - 1]?.[1], nextE = spans[y + 1]?.[1], prevS = spans[y - 1]?.[0], nextS = spans[y + 1]?.[0];
    // a row whose end differs from a neighbour's is a step: its point mid-row; a run of equal ends keeps its corners
    right.push(...(prevE === e || y === 0 ? [pt(e, y)] : []), pt(e, y + 0.5), ...(nextE === e || y === h - 1 ? [pt(e, y + 1)] : []));
    left.unshift(...[...(prevS === s || y === 0 ? [pt(s, y)] : []), pt(s, y + 0.5), ...(nextS === s || y === h - 1 ? [pt(s, y + 1)] : [])].reverse());
  });
  return `polygon(${[...right, ...left].join(', ')})`;
}
function drawPiece(el, s, x, y, waiter) {
  const sh = sheet(s.tex, waiter);
  if (!sh) return null;
  const r = spriteRect(s), d = document.createElement('div');
  Object.assign(d.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: r.w + 'px', height: r.h + 'px',
    ...(({ bg, clip }) => ({ background: bg, clipPath: clip || '' }))(pieceCss(sh, s.src, s.col || s.rgba || [1, 1, 1, 1])) });
  const a = s.a ?? s.rgba?.[3] ?? 1;
  if (a !== 1) d.style.opacity = a;
  el.append(d);
  return d;
}

// ---------------------------------------------------------------- text
// a CTextElm's lines as DOM text: one textBox per colour run (@n tags, AtConverter: deck.js runs), at the pen; @1 is the
// bold 18-pixel style. box: the CWindowTaskText's align over its width and its fontSize. ink: white glyphs' colour (a
// ShadowText's text half takes its control's colour, the rest are black glyphs whose colour shows only its alpha)
function drawText(el, text, x, y, alpha, { align = 0, w = 0, px: size = 16, ink = null } = {}) {
  text.split('\n').forEach((line, li) => {
    const rs = runs(line), px = r => r.rgb === TAG_RGB[1] ? 18 : size;
    const rw = r => textWidth(r.s, px(r)) + spacing(r.s, px(r)) * [...r.s].length;
    const lw = rs.reduce((n, r) => r.x !== null ? r.x + rw(r) : n + rw(r), 0);
    let pen = align === 1 ? Math.floor((w - lw) / 2) : align === 2 ? w - lw : 0;
    for (const r of rs) {
      if (r.x !== null) pen = r.x;
      const rgb = ink !== null && r.rgb === TAG_RGB[0] ? ink : r.rgb;
      const d = textBox(el, r.s, { x: x + pen, y: y + size * li, px: px(r), color: [rgb >> 16, rgb >> 8 & 255, rgb & 255].map(v => v / 255).concat(alpha), white: true });
      if (px(r) === 18) d.style.fontWeight = 'bold';
      pen += rw(r);
    }
  });
}

// ---------------------------------------------------------------- the drawing list of one window
// items [{ id, z, rect (screen), draw(el) }] and holes [{ z, rect }], back to front by world z; kept: what the engine
// draws (unknown textures, extras that aren't sprites); co: the items under a hole in front of them
// skip: sprite ids another window draws (a card area's frame pieces are its model's parts too: the model draws them,
// under its title, in its own world-z order)
export function plan(win, skip = new Set()) {
  const items = [], holes = [], kept = new Set(), ox = win.x, oy = win.y;
  const add = (id, z, rect, draw) => items.push({ id, z, rect, draw, i: items.length });
  const tree = (P, ctl) => {
    for (const s of P.sprites || []) {
      if (!s.shown || !s.tex || skip.has(s.id)) continue;
      const r = spriteRect(s), z = s.wz ?? 0;
      if (isSkin(s.tex) && s.src[2] <= 64 && s.src[3] <= 64) add(s.id, z, r, (el, w) => drawPiece(el, s, r.x - ox, r.y - oy, w));
      else { if (!isArt(s)) kept.add(s.id); holes.push({ z, rect: r }); }   // a card face, or art this doesn't know
    }
    for (const t of P.labels || []) {
      if (!t.shown || !t.text) continue;
      // a ShadowText's text half takes its control's colour; so does the partner's name over the pink band (live: white,
      // CWindowTaskText 'TradeOtherName' colour (1, 1, 1))
      const shadow = (ctl?.name === 'CWindowTaskShadowTextのテキスト' || ctl?.name === 'TradeOtherName') && ctl.color;
      const ink = shadow ? ctl.color.slice(0, 3).reduce((v, x) => v << 8 | Math.round(x * 255), 0) : null;
      const box = ctl && 'text' in ctl ? { align: ctl.align || 0, w: ctl.cls === 'CWindowTaskTextField' ? ctl.w - 16 : ctl.w,
        px: ctl.fontSize || 16, ink } : { ink };
      const lines = t.text.split('\n').length;
      add(t.id, t.wz ?? 0, { x: t.wx, y: t.wy, w: box.w || 256, h: (box.px || 16) * lines },
        el => drawText(el, t.text, t.wx - ox, t.wy - oy, t.a ?? 1, box));
    }
    for (const f of P.swfs || []) {
      const [w, h] = ctl?.cls === 'CWindowTaskTrade' ? LAMP : [SWF_BOX, SWF_BOX];
      if (f.shown) holes.push({ z: f.wz ?? 0, rect: { x: f.wx, y: f.wy, w, h } });
    }
  };
  // the area's frame pieces are the window's own sprites (extras); an extra that isn't a sprite stays the engine's
  for (const e of win.extras || []) if (!e.tex && !isSwf(e)) kept.add(e.id);
  tree({ sprites: (win.extras || []).filter(e => e.tex), swfs: (win.extras || []).filter(isSwf), labels: win.labels }, null);
  const byId = new Map(win.controls.map(c => [c.id, c])), drawn = new Set();
  const under = c => { for (let p = byId.get(c.parent); p; p = byId.get(p.parent)) if (drawn.has(p.id)) return true; return false; };
  for (const c of win.controls) {
    if (!c.shown || c.x >= 9999 || under(c)) continue;
    if (BUTTONS.has(c.cls)) {   // the plate and caption as one <button> (its parts and its caption control are in it)
      drawn.add(c.id);
      const x = c.wx ?? ox + c.x, y = c.wy ?? oy + c.y, zs = (c.parts?.sprites || []).filter(s => s.shown).map(s => s.wz ?? 0);
      const z = (zs.length ? Math.max(...zs) : c.wz ?? 0) + 0.5;
      add(c.id, z, { x, y, w: c.w, h: c.h }, (el, w, api) => api?.renderControl?.({ ...c, x: x - ox, y: y - oy }, el));
      continue;
    }
    if (c.parts) tree(c.parts, c);
  }
  items.sort((a, b) => a.z - b.z || a.i - b.i);
  return { items, holes, kept };
}

// ---------------------------------------------------------------- the live windows, clipped around every hole
const live = new Map();   // window id -> { win, root, plan, api, deck: the hole stand-in deck.js knows }
// the sprite ids the live models (Trade / Tp / Present) draw
const modelDrawn = () => new Set([...live.values()].filter(L => L.win.cls !== 'CWindowTaskCardArea').flatMap(L => L.plan.items.map(it => it.id)));
const co = new Set(), kept = new Set();
let foreign = [], foreignKey = '';
function draw(L) {
  L.root.replaceChildren();   // full rebuild per changed frame (as deck.js); the pieces' CSS is cached by the browser
  for (const it of L.plan.items) {
    const box = document.createElement('div');
    box.className = 'layer';
    box.style.width = box.style.height = '100%';
    it.box = box;
    it.draw(box, L.win.id, L.api);
    if (box.childNodes.length) L.root.append(box);
  }
  reclip();
}
function reclip() {
  const holes = [...[...live.values()].flatMap(L => L.plan.holes), ...foreign];
  co.clear();
  kept.clear();
  for (const L of live.values()) {
    L.plan.kept.forEach(id => kept.add(id));
    for (const it of L.plan.items) {
      if (holes.some(h => h.z > it.z && meet(h.rect, it.rect))) co.add(it.id);
      if (it.box) it.box.style.clipPath = clip(it, holes, L.win.x, L.win.y);
    }
  }
}
// The deck windows' holes (the trunk's thumbnails, a card dragged from it) from the frame's snapshot: they don't make
// this window's snapshot change, so they are looked at every animation frame (the game's: yo2Html.snapshot)
let ticking = false;
function tick() {
  if (!live.size) { ticking = false; return; }
  requestAnimationFrame(tick);
  const snap = globalThis.yo2Html?.snapshot?.();
  if (!snap) return;
  const hs = (snap.windows || []).filter(w => deck.classes.includes(w.cls) && w.shown).flatMap(w => deckPlan(w, false).holes);
  // any other window in front (its drawn depth): what lies under its drawn box is co-drawn too. The bridge cuts that box
  // out of these windows, and a box can be wider than what the window paints (live: the card detail's reaches x 256,
  // 8 px over the areas' left edge, which it leaves bare): there the engine's own pieces show, not the backdrop
  for (const w of snap.windows || []) if (w.shown && w.drawn && w.wz > 0 && !CLASSES.includes(w.cls)) hs.push({ z: w.wz, rect: w.drawn });
  const key = JSON.stringify(hs);
  if (key !== foreignKey) { foreignKey = key; foreign = hs; reclip(); }
}
// and the other way: deck.js clips its windows around this one's holes (a trade card dragged over the trunk) when it
// knows them. It knows its own windows only, so it is handed a stand-in: this window with nothing but its holes, each
// a card face where the hole is (deck.js's plan makes a card face a hole at its world z). deck.js's own API, unchanged.
function tellDeck(L, api) {
  const fake = { id: L.win.id, cls: L.win.cls, x: L.win.x, y: L.win.y, w: L.win.w, h: L.win.h, shown: true, extras: [], labels: [],
    controls: [{ id: 0, cls: 'CWindowTaskTradeHoles', shown: true, x: 0, y: 0, parts: { sprites: L.plan.holes.map(h =>
      ({ id: 0, tex: 'data/CARD/hole', src: [0, 0, h.rect.w, h.rect.h], wx: h.rect.x, wy: h.rect.y, wz: h.z, sx: 1, sy: 1, shown: true })) } }] };
  if (!L.deck) { const r = document.createElement('div'); L.deck = { root: r, st: deck.mount(fake, r, api) }; }
  deck.update(fake, null, L.deck.root, api, L.deck.st);
}

export default {
  classes: CLASSES,
  mode: 'pass',
  parts: true,    // the controls' raw sprites / texts / swfs: the frames, planes, card faces, lamps
  clip: false,    // the models lay out in screen pixels outside their nominal rect (read/trade.js gives the true ones)
  // what the engine keeps drawing: card faces, swfs, art this module doesn't know, and what lies under them
  passthrough: x => isArt(x) || isSwf(x) || kept.has(x.id) || co.has(x.id),
  mount(win, root, api) {
    const inner = document.createElement('div');
    inner.className = 'layer';
    root.append(inner);
    if (!ticking && typeof requestAnimationFrame === 'function') { ticking = true; requestAnimationFrame(tick); }
    return { inner };
  },
  update(win, prev, root, api, st) {
    root.setAttribute('aria-label', win.cls);
    const L = live.get(win.id) || { root: st.inner };
    const area = win.cls === 'CWindowTaskCardArea';
    Object.assign(L, { win, plan: plan(win, area ? modelDrawn() : undefined), api });
    live.set(win.id, L);
    draw(L);
    tellDeck(L, api);
    // a model (re)drawn: the areas leave its pieces to it (their roots stand in front of the model's: drawn there, the
    // pieces would cover its title)
    if (!area) for (const A of live.values()) if (A.win.cls === 'CWindowTaskCardArea') { A.plan = plan(A.win, modelDrawn()); draw(A); }
  },
  unmount(root, st) {
    for (const [id, L] of live) if (L.root === st.inner) { if (L.deck) deck.unmount(L.deck.root, L.deck.st); live.delete(id); }
    for (const A of live.values()) if (A.win.cls === 'CWindowTaskCardArea') { A.plan = plan(A.win, modelDrawn()); draw(A); }   // the pieces back
    reclip();
  },
};
