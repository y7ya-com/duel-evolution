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
// the three duel set-up pages (panelModel: the controls a page drives, from the live snapshots in mock/)
import { readFileSync } from 'node:fs';
import { panelModel, isPanel, searchingText, roomsText, rankLine, selfRank } from './duelsetup.js';
const mock = n => JSON.parse(readFileSync(new URL(`../mock/duelsetup-${n}.json`, import.meta.url))).windows[0];
assert.ok(isPanel('CWindowModelDuel') && isPanel('CWindowModelDuelFind') && isPanel('CWindowModelDuelWait'));
assert.ok(!isPanel('CWindowModelDuelConfig') && !isPanel('CWindowModelMove'));
// Duel menu: Auto Duel (left) and Create Duel (right) switches, Cancel; the counts in row order (Auto, Create, "Duel (n.)")
const m = panelModel(mock('menu'));
assert.equal(m.kind, 'menu');
assert.deepEqual(m.rows.map(r => r.map(s => s.id)), [[482719752, 482875400]]);
assert.deepEqual(m.counts, [0, 0, 0]);
assert.equal(m.cancel.id, 167814408);
assert.equal(m.ok, undefined);
const live = mock('menu');
for (const c of live.controls) if (c.cls === 'CWindowTaskShadowText' && c.x === 0 && c.y === 36) c.text = '12';
for (const c of live.controls) if (c.cls === 'CWindowTaskShadowText' && c.x === 0 && c.y === 60) c.text = '3';
assert.deepEqual(panelModel(live).counts, [12, 3, 0]);
// Auto Duel: Single / Match, Both, Level Limit ON / OFF by row and column; OK is the left button, Cancel the right
const f = panelModel(mock('find'));
assert.deepEqual(f.rows.map(r => r.length), [2, 1, 2]);
assert.deepEqual(f.rows.map(r => r.map(s => s.checked)), [[true, false], [false], [true, false]]);
assert.equal(f.rows[1][0].id, 307732104);
assert.equal(f.ok.id, 176334440);
assert.equal(f.cancel.id, 208600936);
// Create Duel: four ON / OFF rows (Single / Match, Time Limit, Watch, Surrender), the password input, OK, Cancel
const w = panelModel(mock('wait'));
assert.deepEqual(w.rows.map(r => r.length), [2, 2, 2, 2]);
assert.equal(w.rows[0][1].id, 471074824);
assert.deepEqual(w.input, { id: 172549320, value: '', maxLen: 8 });
assert.equal(w.ok.id, 168808232);
assert.equal(w.cancel.id, 167814408);
// a switch the engine disables stays off
const dis = mock('find');
dis.controls.find(c => c.id === 176334440).state = 'disabled';
assert.equal(panelModel(dis).ok.disabled, true);
// words: the counts, the standing
assert.equal(searchingText(0), 'No one yet');
assert.equal(searchingText(1), '1 player searching');
assert.equal(searchingText(12), '12 players searching');
assert.equal(searchingText(null), '');
assert.equal(roomsText(0), 'None yet');
assert.equal(roomsText(1), '1 open room');
assert.equal(roomsText(3), '3 open rooms');
assert.equal(rankLine({ known: true, placed: false, placement: { played: 2, of: 5 } }), 'Placement 2/5');
assert.equal(rankLine({ known: true, placed: false, placement: null }), 'Unranked');
assert.equal(rankLine({ known: true, placed: true, label: 'Ra Yellow II', rating: 1612 }), 'Ra Yellow II \u00b7 1612');
assert.equal(rankLine({ known: false }), '');
const a1 = { known: true, name: 'A' }, a2 = { known: true, name: 'B' };
assert.equal(selfRank([a1, { known: false }]), a1);
assert.equal(selfRank([a1, a2]), null);
console.log('duelsetup ok');
