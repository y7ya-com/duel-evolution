// node client/web-shell/htmlui/screens/dialog_test.mjs: the dialogs' pure parts (screens/dialog.js): the frame's
// colours per style, the switch's look, the list's row point and top, what owned() is handed
import assert from 'node:assert/strict';
import { FRAME, mix, frameAlpha, frameVars, lookOf, rowPoint, topFor, view, CLASSES } from './dialog.js';

// nine styles (kFrameTextures: window_base_01_c00..c08), ten colours each; the blue (c01) the dialogs use
assert.equal(FRAME.length, 9);
assert.ok(FRAME.every(s => s.length === 10 && s.every(c => /^#[0-9a-f]{6}$/.test(c))));
// as the engine shows them: the 1-texel steps as the means of their two texels (pixel x = mean of texels x - 1, x)
assert.equal(mix('#a7ffff', '#79ffff'), '#90ffff');
assert.deepEqual(frameVars(1, 32), { '--t': '#a7ffff', '--r': '#41abef', '--b': '#329be5', '--l': '#76ffff',
  '--t1': '#90ffff', '--r1': '#47b2f3', '--b1': '#3ca6ec', '--l1': '#6ff4ff', '--t2': '#69e3ff', '--r2': '#53c0fb',
  '--b2': '#50bcf9', '--l2': '#61d7ff', '--body': '#59c6ff', '--ring': '#ffffff', '--ringm': '#ace3ff', '--band': '32px' });
assert.equal(frameVars(0)['--body'], '#ffbf44');       // the Error dialog's orange
assert.equal(frameVars(99)['--body'], '#59c6ff');      // an unknown style: the blue
assert.equal(frameVars(1, -4)['--band'], '0px');
assert.equal(frameAlpha(1), 178 / 255);
assert.equal(frameAlpha(5), 1);
assert.equal(frameAlpha(6), 1);

// the switch: the game's focus lights it at rest (No), until the DOM has the focus in the window; the pointer's hover
// and press are the DOM's; the game's own press and disabled still show
const no = { state: 'normal', focused: true, checked: false };
assert.equal(lookOf(no), 1);
assert.equal(lookOf(no, { focus: false }), 0);
assert.equal(lookOf({ ...no, focused: false }), 0);
assert.equal(lookOf({ ...no, focused: false }, { over: true }), 1);
assert.equal(lookOf({ ...no, focused: false }, { over: true, down: true }), 2);
assert.equal(lookOf({ ...no, focused: false }, { down: true }), 0, 'pressed then dragged off: not pressed');
assert.equal(lookOf({ state: 'hover', focused: false }), 0, "the game's hover is its puppet mouse's, not the player's");
assert.equal(lookOf({ state: 'pressed', focused: false }), 2);
assert.equal(lookOf({ state: 'disabled', focused: true }, { over: true, down: true }), 0);
assert.equal(lookOf({ state: 'normal', checked: true }), 3);
assert.equal(lookOf({ state: 'normal', checked: true }, { over: true }), 4);

// the list's rows: 16 high from the list's top, 40 in (or half its width); the top that shows item i
const win = { x: 420, y: 300 }, list = { x: 8, y: 24, w: 232, h: 96, top: 0 };
assert.deepEqual(rowPoint(win, list, 0), [468, 332]);
assert.deepEqual(rowPoint(win, list, 3), [468, 380]);
assert.deepEqual(rowPoint(win, { ...list, w: 40, top: 2 }, 3), [448, 348]);
assert.equal(topFor(3, 0, 6, 8), 0);   // in view: no scroll
assert.equal(topFor(7, 0, 6, 8), 2);   // below: as far as the end allows
assert.equal(topFor(1, 2, 6, 8), 1);   // above
assert.equal(topFor(0, 0, 6, 3), 0);

// owned() is handed no look-only fields (a hover rebuilt the button under the pointer), and the list past its ownList
const v = view({ id: 1, controls: [
  { id: 2, cls: 'CWindowTaskTextSwitch', label: 'Yes', state: 'hover', focused: true, x: 44 },
  { id: 3, cls: 'CWindowTaskActiveListbox', items: ['a'], selected: 0, top: 0, topLine: 0, rows: 6, marks: [], w: 232 },
  { id: 4, cls: 'CWindowTaskIconHide', pressed: true },
  { id: 5, cls: 'CWindowTaskTextField', text: 'Sure?' }] });
assert.deepEqual(v.controls[0], { id: 2, cls: 'CWindowTaskTextSwitch', label: 'Yes', x: 44 });
assert.deepEqual(v.controls[1], { id: 3, cls: 'CWindowTaskActiveListbox#dialog', orig: 'CWindowTaskActiveListbox', w: 232 });
assert.deepEqual(v.controls[2], { id: 4, cls: 'CWindowTaskIconHide' });
assert.equal(v.controls[3].text, 'Sure?');

// exact classes only: the converted subclasses (DialogOk's CWindowLogin, CWindowPlayerSelect, CWindowDialogAvatarSwitch)
// and the duel's CU* dialogs are not claimed here
assert.ok(!CLASSES.some(c => /Login|PlayerSelect|AvatarSwitch|^CU|Help/.test(c)));
console.log('dialog_test ok');
