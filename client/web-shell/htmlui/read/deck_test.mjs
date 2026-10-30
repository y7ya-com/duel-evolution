// read/deck.js on a synthetic memory image (no game data): a CWindowModelDeck at (0, 0) whose CWindowTaskDeck panel
// holds one main-grid card, the shared drag record, a card detail panel in its picture mode.
//   node client/web-shell/htmlui/read/deck_test.mjs
import assert from 'node:assert/strict';
import { read, extend, FACTORY } from '../read.js';
import VT from '../vtables.js';
import deck from './deck.js';

extend(deck);
const vt = (cls, off = 0) => +Object.keys(VT).find(k => VT[k][0] === cls && VT[k][1] === off);
const dv = new DataView(new ArrayBuffer(0x1300000));
let heap = 0x100000;
const alloc = n => { const a = heap; heap += (n + 15) & ~15; return a; };
const w32 = (a, v) => dv.setUint32(a, v >>> 0, true), wf = (a, v) => dv.setFloat32(a, v, true), w8 = (a, v) => dv.setUint8(a, v);
const elem = (cls, size) => { const o = alloc(size); w32(o, vt(cls)); w8(o + 0xc4, 1); wf(o + 0x174, 1); return o; };
const vec = (a, items) => { const p = alloc(4 * items.length); items.forEach((v, i) => w32(p + 4 * i, v)); w32(a + 4, p); w32(a + 8, p + 4 * items.length); };
const list = (a, items) => {   // vc6::list: circular through a sentinel
  const head = alloc(12), nodes = items.map(() => alloc(12));
  [head, ...nodes].forEach((n, i, all) => { w32(n, all[(i + 1) % all.length]); w32(n + 4, all[(i + all.length - 1) % all.length]); });
  nodes.forEach((n, i) => w32(n + 8, items[i]));
  w32(a + 4, head); w32(a + 8, items.length);
};

const vstr = (a, t) => { const p = alloc(t.length + 1); [...t].forEach((c, i) => w8(p + i, c.charCodeAt(0))); w32(a + 4, p); w32(a + 8, t.length); };
// the scene root "deckScene": the background sprite, a side button, the deck window
const root = elem('CElement', 0x340), bgSpr = elem('CSpriteElm', 0x5088), load = elem('CSwfEngine', 0x460);
vstr(root + 0x4c, 'deckScene'); vstr(bgSpr + 0x358, 'data/deck/deck_bg_01.png'); vstr(load + 0x4c, 'LoadBtn');
wf(load + 0xc8, 0); wf(load + 0xcc, 40);
const win = elem('CWindowModelDeck', 0x3f8);
list(root + 0x0c, [bgSpr, load, win]);
w32(win + 8, root);
w32(win + 0x340, vt('CWindowModelDeck', 0x340));
wf(win + 0x388, 336); wf(win + 0x38c, 144);
const panel = elem('CWindowTaskDeck', 0x498), tab0 = elem('CWindowTaskDeckTab', 0x3b8), card = elem('CWindowTaskDeckCard', 0x3b0);
w32(win + 0x398 + 4, panel);
w32(panel + 0x344, win + 0x340);
w32(panel + 0x368, vt('CWindowTaskDeck', 0x368));   // its own IWindowTaskMediator: the card's owner
w32(card + 0x344, panel + 0x368);
const bar = elem('CWindowTaskDeckBar', 0x4b8), side = elem('CWindowTaskFrameThin', 0x3e0);
w32(panel + 0x36c + 4, bar); w32(panel + 0x384 + 0xc + 4, side);
wf(bar + 0x494, 248); wf(bar + 0x49c, 488); wf(side + 0x3cc, 608); wf(side + 0x3d4, 104);   // bar x, width; side frame y, h
w32(panel + 0x3e4 + 4, tab0); w32(panel + 0x3fc, tab0);   // Main in front
vec(panel + 0x400, [card]);
[40, 3, 6, 0].forEach((n, i) => dv.setInt32(panel + 0x480 + 4 * i, n, true));
w32(card + 0x3a0, 4007); wf(card + 0x388, 50); wf(card + 0x38c, 72);

const detail = elem('CCardDetailViewDlg', 0x4b8);
w32(detail + 0x340, vt('CCardDetailViewDlg', 0x340));
wf(detail + 0x384, 608); wf(detail + 0x430, 608 - (346 - 126));
dv.setInt32(detail + 0x3f8, 3, true); dv.setInt32(detail + 0x3fc + 12, 346, true); dv.setInt32(detail + 0x43c, 4007, true);

const fac = alloc(0x2b4);
w32(FACTORY, fac);
vec(fac, [card, panel]);
list(fac + 0x10, [detail, win]);
const drag = alloc(0x18);
w32(0x012b3230, drag); dv.setInt32(drag + 4, 2, true); dv.setInt32(drag + 0x10, 4007, true);

// the card table (*(0x12a1140 + 0x18), 8 bytes a card): attribute (w1 >> 6) & 0xf, < 8 a monster
const table = alloc(8 * 4100);
w32(0x12a1140 + 0x18, table);
const attr = (id, a) => w32(table + id * 8 + 4, a << 6);
attr(221, 2); attr(15, 8); attr(282, 9); attr(248, 0); attr(4007, 5);
const s = read(dv, 1, 0x24);
const W = s.windows.find(w => w.cls === 'CWindowModelDeck');
assert.deepEqual([W.x, W.y, W.w, W.h], [248, 0, 488, 712]);   // from the header bar to the side frame's bottom
assert.deepEqual([W.scene.bg.id, W.scene.title, W.scene.menu.map(m => [m.name, m.wy])], [bgSpr, null, [['LoadBtn', 40]]]);
const P = W.controls.find(c => c.cls === 'CWindowTaskDeck'), C = W.controls.find(c => c.cls === 'CWindowTaskDeckCard');
assert.deepEqual([P.view, P.counts, P.grids.main, P.grids.side], ['main', { main: 40, side: 3, extra: 6, missing: 0 }, [4007], []]);
assert.deepEqual([C.card, C.dragging, C.w, C.h, C.parent], [4007, false, 50, 72, panel]);
const D = s.windows.find(w => w.cls === 'CCardDetailViewDlg');
assert.deepEqual([D.y, D.h, D.mode, D.card, D.holes[0]], [388, 346, 3, 4007, { x: 8, y: 24, w: 232, h: 290 }]);
assert.deepEqual(D.holes[1], { x: 8, y: 712 - 388, w: 16, h: 16 });
assert.deepEqual(s.deckDrag, { state: 2, from: 0, grid: 0, card: 4007, index: 0 });
w32(0x012b3230, 0);
assert.equal(read(dv).deckDrag, null);

// the power strip follows the card shown now, never the last monster's (owner, live: a spell under "1 ATK 100/DEF
// 100"): the engine's text element keeps its text and shown flag through a spell or trap, the card table says which
// card is a monster (attribute (w1 >> 6) & 0xf < 8). monster -> spell -> trap -> monster -> spell -> none
const power = elem('CTextElm', 0x430), wtext = t => { const q = alloc(2 * t.length + 2); [...t].forEach((c, i) => dv.setUint16(q + 2 * i, c.charCodeAt(0), true)); w32(power + 0x410 + 4, q); w32(power + 0x410 + 8, t.length); };
w32(detail + 0x494 + 4, power);
const strip = (id, text) => {
  dv.setInt32(detail + 0x43c, id, true);
  if (text) wtext(text);   // the engine writes it for a monster only
  const d = read(dv, 1, 0x24).windows.find(w => w.cls === 'CCardDetailViewDlg');
  return [d.monster, d.labels.map(l => l.text), d.holes.length];
};
assert.deepEqual(strip(221, ' 4 ATK1400/DEF1100'), [true, [' 4 ATK1400/DEF1100'], 4]);
assert.deepEqual(strip(15), [false, [], 1]);    // a spell: no stats, no icons, the big card only
assert.deepEqual(strip(282), [false, [], 1]);   // a trap
assert.deepEqual(strip(248, ' 3 ATK1000/DEF 600'), [true, [' 3 ATK1000/DEF 600'], 4]);
assert.deepEqual(strip(15), [false, [], 1]);
assert.deepEqual(strip(-1), [false, [], 0]);    // nothing shown
console.log('read/deck_test: ok');
