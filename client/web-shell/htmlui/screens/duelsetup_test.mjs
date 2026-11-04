// screens/duelsetup.js's pure parts under node: the switch looks from their sprites, the Move frame's size, the search
// menu's row points, and prep (what a redraw depends on)
import assert from 'node:assert/strict';
import { tone, glow, moveFrame, rowPoint, prep } from './duelsetup.js';

const T = 'data/common/window/duel_btn_02_c01.png';
const s = (src, o = {}) => ({ tex: T, src, col: [1, 1, 1, 1], a: 1, shown: true, ...o });
assert.equal(tone(s([0, 0, 224, 32])), 'white');
assert.equal(tone(s([0, 32, 224, 32])), 'pink');
assert.equal(tone({ tex: 'data/common/window/duel_btn_02_c02.png', src: [0, 0, 224, 32] }), 'pink');
assert.equal(tone({ tex: 'data/common/window/duel_arrow_01_c01.png', src: [24, 0, 24, 16] }), 'down');
assert.equal(tone({ tex: 'data/common/window/other.png', src: [0, 0, 1, 1] }), null);
const art = { normal: s([0, 0, 224, 32], { col: [0.5, 0.5, 0.5, 1], a: 0.8 }), pressed: s([0, 32, 224, 32]), checked: s([0, 32, 224, 32]) };
assert.deepEqual(glow({ art, checked: false }), { rest: 'white', down: 'pink', rgb: [128, 128, 128], a: 0.8 });
assert.deepEqual(glow({ art, checked: true }), { rest: 'pink', down: 'pink', rgb: [255, 255, 255], a: 1 });

// CWindowModelMove::layout: frameW = close.x + 24; at least six rows high
const b = (y, w = 258) => ({ cls: 'CWindowTaskButtonDuel', parent: 0, x: 11, y, w, h: 24, shown: true });
assert.deepEqual(moveFrame({ w: 296, h: 188, controls: [{ cls: 'CWindowTaskIconHide', parent: 0, x: 272, y: 0 }, b(24)] }), { w: 296, h: 188 });
assert.deepEqual(moveFrame({ w: 296, h: 100, controls: [b(24, 300)] }), { w: 338, h: 186 });

assert.deepEqual(rowPoint({ x: 230, y: 300 }, { x: 8, y: 8, w: 240 }, 2), [358, 348]);

// prep: hover / press and world positions don't change a button's drawing; the frames take the window's size
const win = { cls: 'CWindowModelDuelConfig', x: 0, y: 0, w: 492, h: 452, controls: [
  { cls: 'CWindowTaskDuelConfigFrame', parent: 0, x: 0, y: 0, w: 80, h: 24 },
  { id: 2, cls: 'CWindowTaskButtonDuel', parent: 0, x: 53, y: 420, w: 140, h: 24, state: 'hover', wx: 9, focused: true, label: 'OK' },
  { id: 3, cls: 'CWindowTaskPictureSwitch', parent: 0, x: 22, y: 53, w: 224, h: 32, state: 'pressed', art, checked: false }] };
const p = prep(win), q = prep({ ...win, controls: win.controls.map(c => c.state ? { ...c, state: 'normal', wx: 0, focused: false } : c) });
assert.deepEqual(p, q);
assert.deepEqual([p.controls[0].w, p.controls[0].h], [492, 452]);
assert.equal(p.controls[1].disabled, false);
assert.equal(p.controls[2].glow.rest, 'white');
// CFindMenu's list: rows of buttons (not a native list), its rows' alpha the stripe's times the list's
const fm = prep({ cls: 'CFindMenu', x: 230, y: 300, w: 256, h: 128, controls: [{ id: 5, cls: 'CWindowTaskActiveListbox', parent: 0, alpha: 0.7, items: ['a'] },
  { id: 6, cls: 'CWindowTaskBackStripe', parent: 5, alpha: 0.7 }] });
assert.equal(fm.controls[0].cls, 'CWindowTaskFindRows');
assert.ok(Math.abs(fm.controls[0].rowAlpha - 0.49) < 1e-9);
console.log('duelsetup ok');
