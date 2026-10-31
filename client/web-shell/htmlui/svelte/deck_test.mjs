// The Svelte deck's plan (svelte/deck/art.js) against screens/deck.js's, item for item (id, z, rect), holes and
// co-drawn ids: on the mock deck and on a card detail walk (monster -> spell -> monster). Fails when deck.js's plan
// changes without the port following.   node svelte/deck_test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({ resolve: (spec, ctx, next) => spec.endsWith('/ui.js')
  ? { ...next(new URL('../../../html-ui/ui.js', import.meta.url).href, ctx), format: 'module' } : next(spec, ctx) });
const old = await import('../screens/deck.js'), port = await import('./deck/art.js');

const same = (win, editor) => {
  const a = old.plan(win, editor), b = port.plan(win, editor);
  assert.deepEqual(b.items.map(i => [i.id, i.z, i.rect]), a.items.map(i => [i.id, i.z, i.rect]), win.cls);
  assert.deepEqual(b.holes, a.holes, win.cls);
  assert.deepEqual(b.co, a.co, win.cls);
  return b;
};
const mock = JSON.parse(readFileSync(new URL('../mock/deck.json', import.meta.url)));
for (const w of mock.windows) for (const editor of [true, false]) same(w, editor);

const ctl = (id, cls, parts, extra = {}) => ({ id, cls, x: 0, y: 0, w: 0, h: 0, shown: true, parts, ...extra });
const detail = (power, text) => ({ id: 70, cls: 'CCardDetailViewDlg', x: 0, y: 175, w: 248, h: 559, extras: [],
  labels: [{ id: 71, text: power, wx: 60, wy: 712, wz: 51613, shown: !!power }], controls: [
    ctl(72, 'CWindowTaskText', { labels: [{ id: 73, text, wx: 8, wy: 497, wz: 51205, shown: true }] },
      { text, w: 216, fontSize: 16, pageLines: 9, firstLine: 0, align: 0 })] });
const mon = '@4Mystic Tomato\n@3[Plant/Effect/DARK]\n@0When this card is destroyed by battle and sent to the Graveyard, you can Special Summon 1 DARK monster.';
const kinds = w => same(w).items.map(i => [i.id, i.kind, i.text]);
assert.deepEqual(kinds(detail(' 4 ATK1400/DEF1100', mon)), [[73, 'flow', mon], [71, 'label', ' 4 ATK1400/DEF1100']]);
assert.deepEqual(kinds(detail('', '@4Enemy Controller')), [[73, 'flow', '@4Enemy Controller']]);   // no stale stats
assert.deepEqual(kinds(detail(' 4 ATK2300/DEF   0', mon)), [[73, 'flow', mon], [71, 'label', ' 4 ATK2300/DEF   0']]);
// a ShadowText's text half takes the control's colour; a dialog Title is white
const st = ctl(80, 'CWindowTaskShadowText', { labels: [{ id: 81, text: 'Exit Store', wx: 0, wy: 0, wz: 1, shown: true }] },
  { name: 'CWindowTaskShadowTextのテキスト', text: 'Exit Store', color: [1, 1, 1, 1], w: 100 });
assert.equal(same({ id: 79, cls: 'X', x: 0, y: 0, controls: [st] }).items[0].box.ink, 0xffffff);
console.log('svelte deck_test ok');
