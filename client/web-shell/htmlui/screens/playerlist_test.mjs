// screens/playerlist.js's pure parts under node: a row's tags (AtConverter's pen moves), the row brought into the
// engine's view, the game point a row is pressed at, and prepList (what a redraw depends on)
import assert from 'node:assert/strict';
import { rowRuns, topFor, rowPoint, prepList, parts, listRows, discordOnline, discordPlayer, discordRowText, discordCardModel, ONLINE } from './playerlist.js';
import screen from './duelsetup.js';

// "@0Lv 1@>40/Card Partner" (the live list's row): the level at 0, the name at the pen's 40
assert.deepEqual(rowRuns('@0Lv 1@>40/Card Partner'), [{ x: 0, s: 'Lv 1' }, { x: 40, s: 'Card Partner' }]);
assert.deepEqual(rowRuns('@>64Name@1 red'), [{ x: 64, s: 'Name red' }]);   // the '/' is optional; a style joins its run
assert.deepEqual(rowRuns('a@@b'), [{ x: 0, s: 'a@b' }]);
assert.deepEqual(rowRuns(''), []);

// the engine's first row: unchanged while item i is in view, else i (clamped to the last page)
assert.equal(topFor(2, 0, 6, 10), 0);
assert.equal(topFor(7, 0, 6, 10), 4);
assert.equal(topFor(1, 3, 6, 10), 1);
assert.equal(topFor(9, 0, 6, 12), 6);

// the list at (8, 24) in the window at (0, 608): item 2 with item 1 first is the second row, 40 in
const list = { x: 8, y: 24, w: 232, h: 96, top: 1 };
assert.deepEqual(rowPoint({ x: 0, y: 608 }, list, 2), [48, 656]);
assert.deepEqual(rowPoint({ x: 0, y: 608 }, list, 0, 0), [48, 640]);

// prepList: the list is the screen's own (no redraw for a hover, a selection or a scroll); the switch keeps checked
const win = { cls: 'CPlayerListDlg', x: 0, y: 608, w: 248, h: 128, controls: [
  { id: 1, cls: 'CWindowTaskActiveListbox', parent: 0, x: 8, y: 24, w: 232, h: 96, shown: true, items: ['@0Lv 1@>40/A'], selected: -1, top: 0, rows: 6, wx: 8 },
  { id: 2, cls: 'CWindowTaskScroll', parent: 1, x: 216, y: 0, w: 16, h: 96, max: 0, value: 0 },
  { id: 3, cls: 'CWindowTaskPictureSwitch', parent: 0, x: 197, y: 0, w: 32, h: 24, state: 'hover', checked: false, art: { normal: {} }, wx: 197 }] };
const p = prepList(win), q = prepList({ ...win, controls: win.controls.map(c => c.id === 1 ? { ...c, selected: 0, top: 1, items: ['x'] }
  : c.id === 3 ? { ...c, state: 'normal', wx: 0 } : c) });
assert.deepEqual(p, q);
assert.equal(p.controls[0].cls, 'CWindowTaskPlayerRows');
assert.equal(p.controls[2].cls, 'CWindowTaskSearchSwitch');
assert.equal(p.controls[2].art, undefined);
assert.equal(parts(win).bar.id, 2);
assert.ok(screen.classes.includes('CPlayerListDlg'));
// the search menu (a child task of the list) stays the engine's while no HTML draws it
assert.equal(screen.passthrough({ id: 9, cls: 'CFindMenu' }), true);
assert.equal(screen.passthrough({ id: 9, cls: 'CDupSprite' }), false);   // only the list's own (seen by rows())
// the scroller's rows: the game's items keep their engine indexes, the Discord duelists after them (the first marked),
// then striped fill to the box's last row; no Discord duelists: exactly the game's rows as before
const yugi = { pid: 1005, name: 'Yugi', lv: 12, rank: null }, kaiba = { pid: 1009, name: 'Kaiba', lv: 3, rank: null };
{
  const items = ['@0Lv 1@>40/A', '@0Lv 3@>40/B', '@0Lv 2@>40/C'];
  const r = listRows(items, [yugi, kaiba], 6);
  assert.deepEqual(r.filter(x => x.kind === 'player').map(x => [x.i, x.s]), items.map((s, i) => [i, s]), 'real rows: index i is item i');
  assert.deepEqual(r.map(x => x.kind), ['player', 'player', 'player', 'discord', 'discord', 'fill']);
  assert.deepEqual(r.filter(x => x.kind === 'discord').map(x => [x.p.name, x.first]), [['Yugi', true], ['Kaiba', false]]);
  assert.deepEqual(listRows(items, [], 6).map(x => x.kind), ['player', 'player', 'player', 'fill', 'fill', 'fill']);
  assert.equal(listRows(items, [yugi, kaiba, yugi, kaiba], 6).length, 7, 'more rows than the box: no fill');
  assert.deepEqual(listRows([], [yugi], 2).map(x => x.kind), ['discord', 'fill']);
  // the game's own rows are pressed by their engine index whatever follows (rowPoint / topFor take n = items only)
  assert.equal(topFor(2, 0, 6, items.length), 0);
}
// a Discord row reads as the game's ("@0Lv 1@>40/Name": the level at 0, the name at 40)
{
  const game = rowRuns('@0Lv 12@>40/Yugi'), t = discordRowText(yugi);
  assert.deepEqual([{ x: t.lvX, s: t.lv }, { x: t.nameX, s: t.name }], game);
}
// the server's duelists: name required, LV at least 1, rank kept when it is an object
{
  assert.deepEqual(discordPlayer({ pid: 1005, name: ' Yugi ', lv: 12, rank: { known: true } }), { pid: 1005, name: 'Yugi', lv: 12, rank: { known: true } });
  assert.deepEqual(discordPlayer({ name: 'Joey', lv: 'x' }), { pid: 0, name: 'Joey', lv: 1, rank: null });
  assert.equal(discordPlayer({ name: '' }), null);
  assert.equal(discordPlayer(null), null);
}
// the card: "LV12  Name" as the game's card header, the rank's words, "Online on Discord, not in the game"
{
  const placed = { pid: 1005, name: 'Yugi', known: true, placed: true, school: 'ra', division: 2, label: 'Ra Yellow II', rating: 1612, placement: null };
  const fresh = { pid: 1009, name: 'Kaiba', known: true, placed: false, school: 'beginner', division: 0, label: 'Unranked', rating: null, placement: { played: 2, of: 5 } };
  assert.deepEqual(discordCardModel({ ...yugi, rank: placed }), { head: 'LV12  Yugi', rank: placed, rankText: 'Ra Yellow II (1612)', label: 'Status', status: ONLINE });
  assert.equal(discordCardModel({ ...kaiba, rank: fresh }).rankText, 'Unranked · Placement 2/5');
  assert.equal(discordCardModel({ ...kaiba, lv: 100 }).head, 'LV100  Kaiba');
  assert.equal(discordCardModel(kaiba).rankText, 'Unranked', 'no rank: Unranked');
  assert.equal(ONLINE, 'Online on Discord, not in the game');
}
// the fetch: duelists from { players: [{ pid, name, lv, rank }] }; any failure: none, quietly
{
  const was = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ players: [{ pid: 1, name: 'Joey Wheeler', lv: 4 }, { name: '' }, {}, { pid: 2, name: 'Yugi', lv: 12, rank: { known: true } }] }) });
    assert.deepEqual(await discordOnline(), [{ pid: 1, name: 'Joey Wheeler', lv: 4, rank: null }, { pid: 2, name: 'Yugi', lv: 12, rank: { known: true } }]);
    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    assert.deepEqual(await discordOnline(), []);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(await discordOnline(), []);
    globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('bad json'); } });
    assert.deepEqual(await discordOnline(), []);
  } finally { globalThis.fetch = was; }
}
console.log('playerlist ok');
