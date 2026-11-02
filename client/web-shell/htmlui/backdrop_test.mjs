// backdrop.js on a stub page (node backdrop_test.mjs): the layer goes in under the canvas, the canvas is lifted, the
// runtime's flags are on every frame, the veil scrolls only while the engine's backdrop sprites show, the layer follows
// the canvas's rect at the game's scale
import assert from 'node:assert/strict';

const el = (tag) => {
  const classes = new Set();
  return { tag, style: { cssText: '' }, hidden: true, ariaHidden: null, children: [], innerHTML: '', textContent: '',
    classList: { toggle(c, on) { on ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c) },
    get firstElementChild() { return this._first ||= el('div'); } };
};
const head = [];
const parent = { inserted: [], insertBefore(n, ref) { this.inserted.push([n, ref]); } };
const canvas = { style: {}, parentElement: parent, getBoundingClientRect: () => ({ left: 10, top: 20, width: 2048, height: 1536 }) };
globalThis.document = { createElement: el, head: { append: n => head.push(n) } };
globalThis.Module = {};

const { backdrop } = await import('./backdrop.js');
const bd = backdrop(canvas);
const [layer, ref] = parent.inserted[0];
assert.equal(ref, canvas, 'the layer goes in just before the canvas (under it)');
assert.equal(layer.id, 'mu-titlebg');
assert.equal(layer.hidden, false, 'always there: the runtime clears the canvas a frame late, both ways');
assert.deepEqual([canvas.style.position, canvas.style.zIndex], ['relative', '1'], 'the canvas lifted above it, under the HTML layers (4, 5)');
assert.ok(head[0]?.textContent.includes('#mu-titlebg'), 'its CSS in the head');

bd.frame({ backdrop: { shown: true } });
assert.equal(Module.yo2CssBackdrop, true);
assert.equal(Module.yo2TransparentTitle, true);
assert.equal(layer.classList.contains('still'), false, 'the veil scrolls while the engine\'s backdrop sprites show');
assert.equal(layer.style.cssText, 'left:10px;top:20px;width:2048px;height:1536px', 'at the canvas\'s rect');
assert.equal(layer.firstElementChild.style.transform, 'scale(2)', 'at the game\'s scale');

bd.frame({ backdrop: null });
assert.equal(Module.yo2TransparentTitle, true, 'the flags stay on: elsewhere the canvas is opaque over the layer');
assert.equal(layer.classList.contains('still'), true, 'paused where the engine draws no backdrop');
bd.frame({ backdrop: { shown: false } });
assert.equal(layer.classList.contains('still'), true, 'paused while it is hidden');
bd.frame(null);
assert.equal(layer.hidden, false);
console.log('backdrop_test: ok');
