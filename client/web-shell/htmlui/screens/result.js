// The duel result windows (CResultScene; src/Result/yo2ResultWindow.cpp): a player's record (CWindowResult, one each
// side: 250 / 530, 64), the NPC duel's record (CWindowResultNpc) and the "next" button (CWindowResultNext, its
// CWindowTaskResultNext). Pass mode: the game takes the mouse (the button's hover / pressed come from the snapshot).
// The owner's Skin rule: the boards (result_dai_01_c01 blue / c02 pink header, npc_result_dai_01_c01; 244 / 512 x 442)
// and the button plate (result_btn_01) are CSS with their sampled colours (below), the texts Arial DOM text. The
// engine keeps drawing the titles (result_winner / _loser / _draw_01_?, npc_result_title_01_?: glowing lettering
// baked into the art, per language): passthrough, under holes. The record's scroll bar (CWindowResultScroll) is a
// native box when there is more than a page (13 lines) to scroll.
const ui = await import('../../ui.js').catch(() => null);   // null under node
const basic = ui && await import('../controls/basic.js');
const duel = ui && await import('./duel.js');

// ---------------------------------------------------------------- the board (pure numbers)
// Sampled from the atlases (texel = pixel: the boards are drawn 1:1):
//  - header rows 0..79: the window's lavender #7392f1 (pink: #f5a5ca), white at the top fading out by row 36
//    (#f8f8fb #dfe4f5 #b3c4f6 #7f98ea), the right edge's 4 columns #3b68d9 (pink #bd7bb5); rows 78..79 a #315fb4 line
//    (pink #ff287d). The plate (x0..x1, rows 4..73): a 4-px #2165bd border (pink #f961a3), its outer edge light on the
//    top / left (#6f9bd4, pink #fb99c2) and navy on the bottom / right (#08296e, pink #9d1941); 5 px in, the display's
//    frame (navy top / left, light #719cd4 bottom / right, pink #fc9ac3) round a 1-px cyan line (#46c0f6, pink
//    #fe72aa) round the display, #333435 > #142830 to the bottom right (pink #353334 > #331f27)
//  - body rows 80..441: brushed silver (#dde0f0 > #aec4ea, light / dark hairlines); the screen (scr) inset 4 px dark
//    on the top (#273249 #001337 #00265d #024398) and the left (column 10 #2b3a55, then 11..13 darkening the scan
//    lines by 80 / 49 / 8 % of #00143c: result_dai_01_c01 rows 100..425), a 3-px glow on the right (columns 214..216 the
//    scan lines 3 / 12 / 22 % whiter, column 217 a #c8d3ee line) and the bottom (#c0dcff #c6e0ff #d7e9ff); inside, scan lines: 2 rows #0351b3 >
//    #b1d4fe (linear, rows 97 > 421) and 2 rows of the same 12 % whiter (#2166bb > #bbd9ff), from row 95; the scroll
//    trough (tr, 16 wide from column 221, rows 90..427) #458adf, edged #122c72 #2d5dab / #5997e3 #71a6e7, top #122c72
//    #1c3d87, bottom #69a1e5 #9ac0ee; the right edge 4 px #3767b6 after a #6b8fd0 column (239), the bottom rows
//    438..441 #3f6eb9 #2457ae. (Checked against the live flip, 2026-11-04: the earlier glow / trough columns were off.)
// Per width: the left silver (L), the plate's columns, the screen's (glow included) and the trough's left
export const BOARDS = {
  // (244: the live engine draws the board's right part ~1 px further right than the atlas has it (its screen's glow, line
// and trough: columns 215..218 / 222 at x 250, the left edge on 10 as the atlas): the columns are the engine's)
  244: { plate: [8, 235], scr: [10, 219], tr: 222 },
  512: { plate: [14, 497], scr: [13, 483], tr: 488 },   // npc_result_dai_01_c01 (not seen live: its glow line is column 482)
};
const TINT = {
  blue: { head: '#7392f1', edge: '#3b68d9', line: '#315fb4', plate: '#2165bd', hi: '#6f9bd4', lo: '#08296e', lo2: '#719cd4',
    cyan: '#46c0f6', disp: ['#333435', '#142830'] },
  pink: { head: '#f5a5ca', edge: '#bd7bb5', line: '#ff287d', plate: '#f961a3', hi: '#fb99c2', lo: '#9d1941', lo2: '#fc9ac3',
    cyan: '#fe72aa', disp: ['#353334', '#331f27'] },
};
// a board texture's look: c02 is the pink header (the other side's record), everything else blue
export const tintOf = tex => /result_dai_01_c02/i.test(tex || '') ? 'pink' : 'blue';
const isBoard = s => /result_dai_01_c0\d/i.test(s?.tex || '');
const isTitle = s => /result_(winner|loser|draw|title)_01_/i.test(s?.tex || '');

const CSS = () => `
.yo2r-board { position: absolute; overflow: hidden;
  background: repeating-linear-gradient(to bottom, rgba(255,255,255,.22) 0 1px, transparent 1px 2px, rgba(40,60,110,.08) 2px 3px, transparent 3px 5px),
    linear-gradient(to bottom, #dce1f3, #b0c4e9);
  box-shadow: inset -4px 0 #3767b6, inset -5px 0 #6b8fd0, inset 0 -3px #2457ae, inset 0 -4px #3f6eb9; }
.yo2r-board > i { position: absolute; display: block; box-sizing: border-box; }
.yo2r-board > .head { left: 0; top: 0; right: 0; height: 80px;
  background: linear-gradient(to bottom, #f8f8fb 0, #dfe4f5 8px, rgba(179,196,246,.7) 20px, rgba(127,152,234,.25) 32px, transparent 40px),
    linear-gradient(to right, transparent calc(100% - 9px), var(--edge) calc(100% - 4px)), var(--head);
  box-shadow: inset 0 -2px var(--line); }
.yo2r-board > .plate { top: 4px; height: 70px; background: var(--plate);
  box-shadow: inset 1px 1px var(--hi), inset -1px -1px var(--lo); }
.yo2r-board > .disp { top: 9px; height: 60px; border: 1px solid; border-color: var(--lo) var(--lo2) var(--lo2) var(--lo);
  background: linear-gradient(to bottom right, var(--d0), var(--d1)); box-shadow: inset 0 0 0 1px var(--cyan); }
.yo2r-board > .scr { top: 90px; height: 337px;
  background: repeating-linear-gradient(to bottom, rgba(255,255,255,.12) 0 2px, transparent 2px 4px) 0 1px,
    linear-gradient(to bottom, #0351b3 7px, #b1d4fe 331px);
  box-shadow: inset 1px 0 #2b3a55, inset 0 1px #273249, inset 2px 0 rgba(0,20,60,.61), inset 0 2px #001337,
    inset 3px 0 rgba(0,20,60,.446), inset 0 3px #00265d, inset 4px 0 rgba(0,20,60,.08), inset 0 4px #024398,
    inset -1px 0 #c8d3ee, inset -2px 0 rgba(255,255,255,.114), inset -3px 0 rgba(255,255,255,.093), inset -4px 0 rgba(255,255,255,.03),
    inset 0 -1px #d7e9ff, inset 0 -2px #c6e0ff, inset 0 -3px #c0dcff; }
.yo2r-board > .tr { top: 90px; width: 16px; height: 338px; background: #458adf;
  box-shadow: inset 1px 0 #122c72, inset 2px 0 #2d5dab, inset -1px 0 #71a6e7, inset -2px 0 #5997e3, inset 0 1px #122c72,
    inset 0 2px #1c3d87, inset 0 -1px #9ac0ee, inset 0 -2px #69a1e5; }
.yo2r-next { position: absolute; box-sizing: border-box; margin: 0; padding: 0; border: 0; cursor: inherit; color: #000;
  clip-path: polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px); }
.yo2r-next > .txt { position: absolute; }
${Object.entries(NEXT).map(([k, v]) => `.yo2r-next[data-state=${k}] { background: ${nextLook(v)}; }`).join('\n')}
.yo2r-next[data-state=disabled] { background: ${nextLook(NEXT.normal)}; filter: grayscale(.8); }`;
// result_btn_01.png (72 x 54: three 24-wide looks, normal / hover / pressed; CWindowTaskResultNext::loadImages, 8-px
// corners cut 4 px on the diagonal, the edges stretched): rows from the top, the body, rows to the bottom; columns
// from the left, columns to the right
const NEXT = {
  normal: { top: ['#fffff6', '#ffffc6', '#ffff75', '#ffff53'], body: '#fff04b', bottom: ['#ffe446', '#fcc636', '#f8a827', '#f79e22'],
    left: ['#ffff80', '#ffff7e', '#ffff6a', '#ffff53'], right: ['#ffe848', '#ffd63e', '#fcc636', '#fcc133'] },
  hover: { top: ['#ffffff', '#ffffff', '#ffffff', '#ffffd8'], body: '#fffec0', bottom: ['#fff2af', '#ffd27f', '#ffb24f', '#ffa63e'],
    left: ['#ffffff', '#ffffff', '#ffffff', '#ffffd6'], right: ['#fff7b6', '#ffe49a', '#ffd27f', '#ffcb74'] },
  pressed: { top: ['#ed9414', '#ee9e14', '#f2ba14', '#f6d614'], body: '#f8e014', bottom: ['#fce414', '#ffff14', '#ffff14', '#ffff14'],
    left: ['#f1b414', '#f2b914', '#f4c814', '#f6d914'], right: ['#fffd14', '#ffff14', '#ffff14', '#ffff14'] },
};
function nextLook({ top, body, bottom, left, right }) {
  const edge = (dir, near, mid, far) => `linear-gradient(to ${dir}, ${near.map((c, i) => `${c} ${i}px ${i + 1}px`).join(', ')},
    ${mid} ${near.length}px calc(100% - ${far.length}px), ${far.map((c, j) => `${c} calc(100% - ${far.length - j}px) calc(100% - ${far.length - j - 1}px)`).join(', ')})`;
  return `${edge('right', left, 'transparent', right)}, ${edge('bottom', top, body, bottom)}`;
}

function inject() {
  if (document.getElementById('htmlui-result-css')) return;
  const st = document.createElement('style');
  st.id = 'htmlui-result-css';
  st.textContent = CSS();
  document.head.append(st);
}
const place = (el, x, y, w, h) => Object.assign(el.style, { left: x + 'px', top: y + 'px', ...(w != null && { width: w + 'px' }), ...(h != null && { height: h + 'px' }) });

// A board, w x 442 at x, y (window-local), tint 'blue' | 'pink'
export function board(parent, { x, y, w, h = 442, tint = 'blue' }) {
  inject();
  const B = BOARDS[w] || BOARDS[w > 300 ? 512 : 244], T = TINT[tint], d = document.createElement('div');
  d.className = 'yo2r-board';
  place(d, x, y, w, h);
  // custom properties: setProperty (Object.assign on style drops them)
  for (const [k, v] of Object.entries({ head: T.head, edge: T.edge, line: T.line, plate: T.plate, hi: T.hi, lo: T.lo,
    lo2: T.lo2, cyan: T.cyan, d0: T.disp[0], d1: T.disp[1] })) d.style.setProperty('--' + k, v);
  // a fixed board (244 or 512) keeps its columns; another width scales the right-hand ones with it
  const dx = BOARDS[w] ? 0 : w - (w > 300 ? 512 : 244);
  const part = (cls, x0, x1) => { const i = document.createElement('i'); i.className = cls; place(i, x0, null, x1 - x0); d.append(i); return i; };
  part('head', 0, w);
  part('plate', B.plate[0], B.plate[1] + 1 + dx);
  part('disp', B.plate[0] + 5, B.plate[1] - 4 + dx);
  part('scr', B.scr[0], B.scr[1] + dx);
  part('tr', B.tr + dx, B.tr + 16 + dx);
  parent.append(d);
  return d;
}

// a sprite's rect in the window (world position, less the window's)
const rectOf = (s, win) => ({ x: (s.wx ?? s.x) - win.x, y: (s.wy ?? s.y) - win.y, w: s.src[2] * (s.sx || 1), h: s.src[3] * (s.sy || 1) });

// ---------------------------------------------------------------- the window
// what the window shows, back to front: [{ key, sig, draw() -> el }] and the holes (window-local rects)
function plan(win) {
  const items = [], holes = [], byId = new Map(win.controls.map(c => [c.id, c]));
  const add = (key, sig, draw) => items.push({ key, sig: JSON.stringify(sig), draw });
  const sprite = s => {
    if (!s?.shown || !s.tex) return;
    const r = rectOf(s, win);
    if (isBoard(s)) add(s.id, [r, s.tex], () => board(document.createDocumentFragment(), { ...r, tint: tintOf(s.tex) }));
    else if (isTitle(s)) holes.push(r);
  };
  for (const e of win.extras || []) if (e.tex) sprite(e);   // the NPC record's board_ / title_ (CSpriteElm members)
  const p = c => duel.loc(c, byId, win);
  // CWindowTaskResultBase's board and title first: the engine draws them under the record's texts (the caption's
  // ShadowText comes before the base in the control list, so in list order the board would cover it)
  for (const c of win.controls) if (c.shown) for (const s of c.parts?.sprites || []) sprite(s);
  for (const c of win.controls) {
    if (!c.shown) continue;
    if (c.parent && byId.get(c.parent)?.cls.endsWith('ShadowText')) continue;   // its text / shadow halves: below
    if (/ShadowText$/.test(c.cls)) {
      // CWindowTaskShadowText: the white glyphs tinted (its colour), a shadow where its shadow half shows, offset as
      // that half sits (setShadowOffset: the NPC record's 1, 1, black); placed at its container plus its text offset
      const sh = win.controls.find(k => k.parent === c.id && k.shown && (k.x !== c.x || k.y !== c.y) && k.text === c.text);
      const at = c.wz > 0 ? { x: c.wx - win.x + c.x, y: c.wy - win.y + c.y } : { x: c.x, y: c.y };
      add(c.id, [c.text, c.align, c.w, c.fontSize, c.firstLine, c.pageLines, c.color, at, sh && [sh.x - c.x, sh.y - c.y, sh.color]], () => {
        const d = document.createElement('div');
        place(d, at.x, at.y, c.w || null);
        d.style.position = 'absolute';
        const t = basic.textBox(d, basic.shownLines(c), { w: c.w || undefined, align: c.align, px: c.fontSize || 16, gap: c.lineGap, color: c.color, white: true });
        if (sh) t.style.textShadow = `${sh.x - c.x}px ${sh.y - c.y}px 0 ${basic.textColor(sh.color, true)}`;
        return d;
      });
    } else if (/ResultNext$|TextSwitch$/.test(c.cls)) {
      const q = p(c);
      add(c.id, [q, c.w, c.h, c.label, c.state, c.align], () => nextButton(q, c));
    } else if (c.thumb !== undefined && c.max > 0) add(c.id, ['bar'], null);   // a native box (sync keeps it)
  }
  // CWindowResult's numbers: CTextElms ("@9" white, 24 px), right-aligned at the window's x + 210 (placeNumber), at
  // their own row
  for (const n of win.nums || []) {
    if (!n.shown || !n.text) continue;
    const s = basic.untag(n.text), y = n.wy - win.y;
    add(n.id, [s, y], () => {
      const d = document.createElement('div');
      Object.assign(d.style, { position: 'absolute', left: 0, top: y + 'px', width: '210px' });
      basic.textBox(d, s, { w: 210, align: 2, px: 24, color: [1, 1, 1, 1], white: true });
      return d;
    });
  }
  return { items, holes };
}

function nextButton(q, c) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'yo2r-next';
  b.tabIndex = -1;   // pass mode: the game has the focus and the keys
  b.dataset.state = c.state || 'normal';
  b.disabled = c.state === 'disabled';
  place(b, q.x, q.y, c.w, c.h);
  if (c.label) basic.textBox(b, c.label, { y: Math.floor((c.h - 16) / 2), w: c.w, align: 1, color: c.color, white: !!c.color });
  return b;
}

function sync(win, st, api) {
  const { items, holes } = plan(win), seen = new Set(), order = [];
  for (const it of items) {
    seen.add(it.key);
    if (!it.draw) {   // the record's scroll bar: duel.js's native box
      const c = win.controls.find(k => k.id === it.key), q = duel.loc(c, new Map(win.controls.map(k => [k.id, k])), win);
      let b = st.bars.get(it.key);
      if (!b) { b = duel.nativeBar(c, q, api); st.bars.set(it.key, b); } else b.update(c, q);
      order.push(b.el);
      continue;
    }
    let n = st.els.get(it.key);
    if (!n || n.sig !== it.sig) {
      let el = it.draw();
      if (el instanceof DocumentFragment) el = el.firstChild;
      n ? n.el.replaceWith(el) : st.box.append(el);
      n = { el, sig: it.sig };
      st.els.set(it.key, n);
    }
    order.push(n.el);
  }
  for (const m of [st.els, st.bars]) for (const [k, n] of m) if (!seen.has(k)) { n.el.remove(); m.delete(k); }
  if (order.some((e, i) => st.box.children[i] !== e)) st.box.append(...order);
  const clip = duel.holePath(holes);
  if (st.box.style.clipPath !== clip) st.box.style.clipPath = clip;
}

export default {
  classes: ['CWindowResult', 'CWindowResultNpc', 'CWindowResultNext'],
  mode: 'pass',
  parts: true,   // CWindowTaskResultBase's sprites: the board and the title
  clip: false,   // the NPC record never sets its size (its rect is its texts' extent, narrower than its 512 board)
  passthrough: x => isTitle(x),
  mount(win, root) {
    inject();
    const box = document.createElement('div');
    box.className = 'yo2d-box';
    Object.assign(box.style, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', transform: duel.nudge(devicePixelRatio) });
    root.append(box);
    return { box, els: new Map(), bars: new Map() };
  },
  update(win, prev, root, api, st) { sync(win, st, api); },
  unmount(root) { root.replaceChildren(); },
};
