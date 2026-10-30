// node client/web-shell/htmlui/screens/select_test.mjs: Select Player's layout rules (no DOM, no game data).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// web-shell/ui.js is client/html-ui/ui.js (serve.mjs and the ship put it there); it is an ES module whatever
// package.json sits above the checkout
const UI = new URL('../../../html-ui/ui.js', import.meta.url).href;
registerHooks({
  resolve: (spec, ctx, next) => spec === '../../ui.js' ? { url: UI, shortCircuit: true } : next(spec, ctx),
  load: (url, ctx, next) => ({ ...next(url, ctx), ...(url === UI && { format: 'module' }) }),
});
const { bottomThickPieces, switchColumn, textLines } = await import('./select.js');

// 480 x 272, band 208 (CWindowPlayerSelect::onInit): 14 pieces tiling the window edge to edge, nothing over the header
const P = bottomThickPieces(480, 272, 208);
assert.equal(P.length, 14);
const cov = new Uint8Array(480 * 272);
for (const [x, y, w, h] of P) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cov[j * 480 + i]++;
assert.ok(cov.every((n, k) => { const x = k % 480, y = (k / 480) | 0; return n === (x >= 8 && x < 472 && y >= 8 && y < 56 ? 0 : 1); }),
  'frame pieces cover the window once, except the header body (the text field back plane)');
assert.deepEqual(P[5], [0, 56, 8, 8, 72, 8]);   // the divider's left end at top - 8

// switch looks: atlas columns 0 normal, 1 hover, 2 pressed, 3 checked, 4 checked + hover
const col = (state, checked = false, focused = false) => switchColumn({ state, checked, focused });
assert.equal(col('normal'), 0);
assert.equal(col('hover'), 1);
assert.equal(col('pressed'), 2);
assert.equal(col('pressed', true), 2);
assert.equal(col('normal', true), 3);
assert.equal(col('hover', true), 4);
assert.equal(col('disabled'), 0);
assert.equal(col('normal', false, true), 1);

// left-aligned text: lines from firstLine, pageLines of them, a line step of fontSize + lineGap
assert.deepEqual(textLines({ text: 'a\nb\nc', align: 0, firstLine: 1, pageLines: 1, fontSize: 16, lineGap: 0 }, 100, 3, 5), [['b', 3, 5]]);
assert.deepEqual(textLines({ text: 'a\nb', align: 0, fontSize: 16, lineGap: 2 }, 100).map(l => l[2]), [0, 18]);
console.log('select.js: all checks pass');
