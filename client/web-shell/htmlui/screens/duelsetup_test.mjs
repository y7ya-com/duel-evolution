// screens/duelsetup.js's pure parts under node: the switch looks from their sprites, the Move frame's size, the search
// menu's row points, and prep (what a redraw depends on)
import assert from 'node:assert/strict';
import { tone, glow, moveFrame, rowPoint, prep, relayout } from './duelsetup.js';
import { readFileSync } from 'node:fs';

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
// relayout: the duel windows' own controls on a grid, relabelled (the live snapshots in mock/); the engine ids stay
const mock = n => JSON.parse(readFileSync(new URL(`../mock/duelsetup-${n}.json`, import.meta.url))).windows[0];
const shown = w => w.controls.filter(c => !c.parent && c.shown !== false);
const at = (w, id) => w.controls.find(c => c.id === id);
const texts = w => shown(w).filter(c => /ShadowText$/.test(c.cls) && c.text).map(c => c.text);
// Duel menu: the two switches side by side under their new captions, each count under its switch, "Duel (n.)" gone
const live = mock('menu');
for (const c of live.controls) if (c.cls === 'CWindowTaskShadowText' && c.x === 0 && c.y === 36) c.text = '12';
for (const c of live.controls) if (c.cls === 'CWindowTaskShadowText' && c.x === 0 && c.y === 60) c.text = '3';
const m = relayout(live);
assert.deepEqual([at(m, 482719752), at(m, 482875400)].map(s => [s.x, s.y, s.w, s.label]),
  [[22, 53, 224, 'Auto Duel (Ranked)'], [246, 53, 224, 'Create Duel (Unranked)']]);
assert.deepEqual(texts(m).sort(), ['Auto Duel (Ranked)', 'Create Duel (Unranked)', 'Duel Menu', 'Open rooms: 3', 'Players searching: 12',
  'Ranked duels change your rating. Created duels don\'t.'].sort());
// a caption's shadow moves with it (the same offset), and keeps its words in step
const cap = at(m, 482870280), sh = at(m, 482872328);
assert.deepEqual([sh.x - cap.x, sh.y - cap.y, sh.text, sh.w], [1, 1, 'Auto Duel (Ranked)', 224]);
assert.equal(at(m, 482707464).shown, false);   // "Duel (n.)"'s shadow
assert.equal(at(m, 167814408).x, 176);         // Cancel stays
// Auto Duel: Single | Match | Both on one row, Level limit On | Off under it; OK / Cancel, the window size, stay
const f = relayout(mock('find'));
assert.equal(at(f, 307430536).text, 'Auto Duel (Ranked)');
assert.deepEqual([307436296, 307576200, 307732104, 307870344, 308026888].map(id => [at(f, id).x, at(f, id).y]),
  [[21, 64], [171, 64], [321, 64], [21, 128], [246, 128]]);
assert.deepEqual([at(f, 307870344).checked, at(f, 307436296).checked], [true, true]);
assert.ok(texts(f).includes('Match (best of 3)') && texts(f).includes('On (similar level)') && texts(f).includes('Level limit'));
assert.deepEqual([f.w, f.h, at(f, 176334440).x, at(f, 208600936).x], [492, 216, 50, 299]);
// Create Duel: four labelled rows evenly down the well (20 px apart), no password (its field and label not drawn), the
// help under the rows saying where open duels are listed
const w = relayout(mock('wait'));
assert.equal(at(w, 180042184).text, 'Create Duel (Unranked)');
assert.deepEqual([178967240, 471074824, 471213064, 472029192, 472167432, 473633928, 473773960, 475242120].map(id => [at(w, id).x, at(w, id).y]),
  [[150, 53], [310, 53], [150, 105], [310, 105], [150, 157], [310, 157], [150, 209], [310, 209]]);
assert.equal(at(w, 172549320).shown, false);   // the password field
assert.equal(at(w, 475382024).shown, false);   // the game's own "Password"
assert.ok(['Duel mode', 'Time limit', 'Spectators', 'Surrender', 'Not allowed'].every(t => texts(w).includes(t)));
assert.ok(!texts(w).some(t => /password/i.test(t)), 'no password label');
const help = texts(w).find(t => /Duels tab/.test(t)), helpCtl = shown(w).find(c => c.text === help);
assert.equal(help.split('\n')[0], "Open duels show in the chat's Duels tab.");
assert.doesNotMatch(help, /Discord/, 'no Discord mention (owner)');
assert.match(help, /don't change your rating/);
// no hole: the help starts 21 px under the last row (209 + 32) and ends (two lines) 23 px above the well's end (317)
assert.deepEqual([helpCtl.y - (209 + 32), 317 - (helpCtl.y + 16 * help.split('\n').length)], [21, 23]);
// prep relays them out; other windows pass through
assert.equal(prep(mock('find')).controls.find(c => c.id === 307732104).x, 321);
{ const c = mock('config'); assert.equal(relayout(c), c); }
console.log('duelsetup ok');
