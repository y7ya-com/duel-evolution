// parts(): what an owned window (the chat, the social windows; plain and Svelte) shows of its controls. A part its
// parent draws is left out, a MultiInput's Input is placed at the MultiInput, an input is cut to its window only when
// it runs past it, the input's text never changes its drawing's key, and each owned kind is named.   node svelte/chat_test.mjs
import assert from 'node:assert/strict';
const { parts } = await import('../screens/chat.js');

const ctl = (id, cls, extra = {}) => ({ id, cls, parent: 0, x: 0, y: 0, w: 10, h: 10, shown: true, ...extra });
const win = (w, ...controls) => ({ id: 1, cls: 'X', w, h: 200, controls });
const show = ps => ps.map(p => [p.c.id, p.n, p.own, p.c.x, p.c.y, p.c.w]);

assert.deepEqual(show(parts(win(336,
  ctl(2, 'CWindowTaskTextlist'), ctl(3, 'CWindowTaskText', { parent: 2 }),   // the list's own text: the list's
  ctl(4, 'CWindowTaskListbox'), ctl(5, 'CWindowTaskScroll'), ctl(6, 'CWindowTaskTab'),
  ctl(7, 'CWindowTaskMultiInput', { x: 16, y: 40 }), ctl(8, 'CWindowTaskInput', { parent: 7, x: 4, y: 6, w: 100 }),
  ctl(9, 'CWindowTaskInput', { x: 8, w: 320 }),    // Create Comment's field: ends at 328, inside its 336
  ctl(10, 'CWindowTaskInputDuel', { x: 73, w: 496 }), ctl(11, 'CWindowTaskMultiInput', { x: 0 })))),   // past it: cut
  [[2, 0, 'log', 0, 0, 10], [4, 2, 'list', 0, 0, 10], [5, 3, 'scroll', 0, 0, 10], [6, 4, null, 0, 0, 10],
    [7, 5, null, 16, 40, 10], [8, 6, 'input', 20, 46, 100], [9, 7, 'input', 8, 0, 320], [10, 8, 'input', 73, 0, 247],
    [11, 9, null, 0, 0, 10]]);
assert.equal(parts(win(336, ctl(8, 'CWindowTaskMultiInput'), ctl(9, 'CWindowTaskInput', { parent: 8 })))[1].c.inMulti, true);

// typing changes an input's value and caret, not its drawing; a tab's label does
const k = extra => parts(win(336, ctl(2, 'CWindowTaskInput', extra), ctl(3, 'CWindowTaskTab', { label: extra.value })));
assert.equal(k({ value: 'a', caret: { col: 1 }, focused: true })[0].k, k({ value: 'abc', caret: { col: 3 }, focused: false })[0].k);
assert.notEqual(k({ value: 'a' })[1].k, k({ value: 'b' })[1].k);
console.log('svelte chat_test ok');
