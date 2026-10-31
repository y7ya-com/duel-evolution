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
  // a window's own holes sit just in front of it (win.wz + 0.5), not at deck.js's 1e9
  assert.deepEqual(b.holes, a.holes.map(h => h.z === 1e9 ? { ...h, z: (win.wz ?? 1e9) + 0.5 } : h), win.cls);
  assert.deepEqual(b.co, a.co, win.cls);
  return b;
};
const mock = JSON.parse(readFileSync(new URL('../mock/deck.json', import.meta.url)));
for (const w of mock.windows) for (const editor of [true, false]) same(w, editor);

// the file list (a live Save Deck snapshot): where the port parts from deck.js on purpose. Its list is one 'list' item
// (rows, selection, items laid out as the row counter: centred over 664), never the row counter as a flow box (deck.js
// drew it, a scroll box over the rows that took their clicks: the coordinator's "stuck in SAVE DECK"); the rest as deck.js
const files = JSON.parse(readFileSync(new URL('../mock/filelist-save.json', import.meta.url))).windows[0];
const fp = port.plan(files), fo = old.plan(files), lb = files.controls.find(c => c.cls === 'CWindowTaskListbox');
const counter = files.controls.find(c => c.parent === lb.id && c.name?.includes('行数カウント'));
assert.ok(fo.items.some(i => i.id === counter.parts.labels[0].id), 'deck.js drew the row counter');
assert.ok(!fp.items.some(i => i.kind === 'flow'), 'no flow box over the rows');
assert.deepEqual(fp.items.filter(i => i.kind === 'list').map(i => [i.items, i.rows, i.selected, i.box.align, i.box.w]),
  [[['deck', 'EQUIP TO BEAT DOWN'], 8, -1, 1, 664]]);
const keep = i => !(i.kind === 'list' || i.id === counter.parts.labels[0].id);
assert.deepEqual(fp.items.filter(keep).map(i => i.id), fo.items.filter(keep).map(i => i.id));
// the detail's big card (a window hole) cuts the detail, never the file list opened over it
const det = { id: 70, cls: 'CCardDetailViewDlg', x: 0, y: 175, w: 248, h: 559, wz: 51105, extras: [], controls: [], holes: [{ x: 8, y: 24, w: 232, h: 290 }] };
const dh = port.plan(det).holes[0];
assert.equal(dh.z, 51105.5);
assert.ok(!port.plan(files).items.some(i => i.z < dh.z), 'the file list is in front of the detail card');
// Structure Deck: the row counter's '@>64/' pen, left-aligned; a hole at each row's recipe icon (the engine's)
const struct = { ...files, controls: [...files.controls.map(c => c.id === lb.id ? { ...c, items: ['@>64/EQUIP TO BEAT DOWN'], selected: 0 }
  : c.id === counter.id ? { ...c, align: 0 } : c), { id: 9, cls: 'CWindowTaskStructureIcon', parent: 0, x: 0, y: 0, w: 0, h: 0, shown: true }] };
const sp = port.plan(struct);
assert.deepEqual(sp.items.filter(i => i.kind === 'list').map(i => [i.items, i.selected, i.box.align]), [[['@>64/EQUIP TO BEAT DOWN'], 0, 0]]);
assert.deepEqual(sp.holes.filter(h => h.rect.w === 28).map(h => h.rect), [{ x: lb.wx + 20, y: lb.wy, w: 28, h: 16 }]);
assert.ok(sp.co.includes(lb.id), 'the list passes where its icons show through');

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
