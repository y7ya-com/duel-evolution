// node client/web-shell/htmlui/cosmetics/trade-model_test.mjs: the trade panel's view model (cosmetics/trade-model.js)
// on views shaped like the server's (server/src/game/trade.ts cosmeticsView) and the API's error texts
// (cosmetics/trade-api.js): tiles round the partner's lamp, the draft's + / − limits, the picker rows, the band's
// priorities (refusal, reset, partner change, lock, contents), the button. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import * as M from './trade-model.js';
import { tradeErrorText } from './trade-api.js';

const item = (id, name, rarity) => ({ id, name, rarity, kind: 'outfit', slot: 6, variants: [], bodies: ['male'] });
const SUIT = item('outfit:black-suit', 'Black Suit', 'rare'), JADEN = item('outfit:jaden', "Jaden's Costume", 'common'),
  GOLD = item('dueldisk:3417', 'Alpha Gold', 'ultra');
const view = (o = {}) => ({ trading: true, rev: 1, partner: { pid: 7, name: 'Rival' }, panel: { me: true, partner: true },
  ready: { me: false, partner: false }, asked: false, confirmed: { me: false, partner: false }, locked: null, changed: null,
  mine: [], theirs: [], spares: [{ ...SUIT, copies: 2 }, { ...JADEN, copies: 1 }], maxLines: 6, ...o });

// tiles: the partner's in two groups round its lamp (432..532 in screen px is 184..284 area-local), mine in one row
const six = Array.from({ length: 7 }, (_, i) => ({ id: `x:${i}`, count: i + 1, item: item(`x:${i}`, `X${i}`, 'super') }));
const pt = M.stripTiles(six, 'partner', new Set(['x:1']));
assert.equal(pt.length, 6, 'at most six lines a side');
assert.ok(pt.every(t => t.x + t.w <= 184 || t.x >= 284), 'no partner tile under the lamp');
assert.ok(pt.every(t => t.y === M.PARTNER_ROW && t.y >= 204 && t.y + t.h <= 282), 'under the partner cards, in the white well');
assert.deepEqual(pt.map(t => t.flash), [false, true, false, false, false, false]);
assert.equal(pt[2].title, 'X2 ×3');
const mt = M.stripTiles(six.slice(0, 6), 'mine');
assert.ok(mt.every(t => t.y === M.MINE_ROW && 320 + t.y >= 492 && 320 + t.y + t.h <= 568), 'under my cards, above the Ready foot');
assert.ok(mt.at(-1).x + mt.at(-1).w < M.BUTTON.x, 'the button right of my last tile');
for (let i = 1; i < 6; i++) assert.ok(mt[i].x - mt[i - 1].x >= M.TILE, 'tiles never overlap');

// the draft: + up to the spares, − down to removal, never a seventh item
let d = M.draftStep([], SUIT.id, 1, view().spares);
assert.deepEqual(d, [{ id: SUIT.id, count: 1 }]);
d = M.draftStep(M.draftStep(d, SUIT.id, 1, view().spares), SUIT.id, 1, view().spares);
assert.deepEqual(d, [{ id: SUIT.id, count: 2 }], 'no more than the 2 spares');
assert.deepEqual(M.draftStep(d, SUIT.id, -2, view().spares), [], 'down to 0 removes the line');
assert.deepEqual(M.draftStep([], 'outfit:none', 1, view().spares), [], 'nothing without a spare');
const full = six.slice(0, 6).map(l => ({ id: l.id, count: 1 }));
assert.equal(M.draftStep(full, SUIT.id, 1, view().spares).length, 6, 'a seventh item is refused');

// picker rows: offered counts, + / − availability, locked
let rows = M.pickerRows(view(), [{ id: SUIT.id, count: 2 }]);
assert.deepEqual(rows.map(r => [r.id, r.spare, r.offered, r.canAdd, r.canRemove]), [[SUIT.id, 2, 2, false, true], [JADEN.id, 1, 0, true, false]]);
rows = M.pickerRows(view({ locked: 'ready-partner' }), []);
assert.ok(rows.every(r => !r.canAdd && !r.canRemove), 'locked: nothing pressable');
assert.deepEqual(M.draftLines([{ id: JADEN.id, count: 1 }], view()).map(l => l.item?.name), ["Jaden's Costume"]);

// the band, in priority order
const now = 1000;
assert.deepEqual(M.bandOf(view(), { error: 'Nope.', now }), { text: 'Nope.', tone: 'error' });
assert.equal(M.bandOf(view({ panel: { me: true, partner: false } }), { now }).text, "Your trade partner's game can't show cosmetics yet.");
const changed = view({ rev: 3, changed: { rev: 3, by: 'partner', reset: true } });
assert.deepEqual(M.bandOf(changed, { resetUntil: now + 1, now }), { text: 'Cosmetics changed: both confirmations were reset.', tone: 'reset' });
assert.equal(M.bandOf({ ...changed, changed: { rev: 3, by: 'me', reset: true } }, { resetUntil: now + 1, now }).tone, 'reset');
assert.equal(M.bandOf({ ...changed, changed: { ...changed.changed, reset: false } }, { changedUntil: now + 1, now }).tone, 'changed');
assert.equal(M.bandOf(changed, { resetUntil: now - 1, now }).tone, 'info', 'the reset line fades');
assert.equal(M.bandOf(view({ locked: 'ready-me' }), { now }).text, 'You pressed Ready: cosmetics are locked until the trade question.');
assert.equal(M.bandOf(view(), { now }).text, 'Cosmetics can be traded too: press Cosmetics to add your spares.');
assert.equal(M.bandOf(view({ spares: [] }), { now }).text, 'No cosmetics in this trade.');
assert.equal(M.bandOf(view({ theirs: [{ id: GOLD.id, count: 1 }], mine: [{ id: SUIT.id, count: 2 }] }), { now }).text,
  'Cosmetics: your partner gives 1, you give 2.');
assert.deepEqual(M.bandOf({ trading: false, last: { result: 'cos-missing', text: 'Trade cancelled: x' } }), { text: 'Trade cancelled: x', tone: 'error' });
assert.equal(M.bandOf({ trading: false, last: { result: 'done', text: 'Trade complete.' } }).tone, 'done');

// the button
assert.deepEqual(M.buttonOf(view(), []), { label: 'Cosmetics', disabled: false, title: 'Add your spare cosmetics to the trade' });
assert.equal(M.buttonOf(view(), [{ id: SUIT.id, count: 1 }]).label, 'Change');
assert.equal(M.buttonOf(view({ locked: 'ready-partner' }), []).disabled, true);
assert.equal(M.buttonOf(view({ spares: [] }), []).disabled, true);

// changed ids, order-free keys
assert.deepEqual([...M.changedIds([{ id: 'a', count: 1 }, { id: 'b', count: 1 }], [{ id: 'b', count: 2 }, { id: 'c', count: 1 }])].sort(), ['a', 'b', 'c']);
assert.equal(M.linesKey([{ id: 'a', count: 1 }, { id: 'b', count: 2 }]), M.linesKey([{ id: 'b', count: 2 }, { id: 'a', count: 1 }]));

// the API's texts
assert.equal(tradeErrorText('partner-no-panel'), "Your trade partner's game can't show cosmetics yet.");
assert.equal(tradeErrorText('insufficient-duplicates', { spare: 1 }), 'You have only 1 spare copy of that.');
assert.equal(tradeErrorText('fresh', { min: 20 }), 'A character can give cosmetics after 20 rewarded duels.');
console.log('trade-model_test: ok');

// the overlay's geometry from a snapshot (cosmetics/trade-cosmetics.js tradeGeometry: pure)
const { tradeGeometry } = await import('./trade-cosmetics.js');
const W = (cls, x, y, w, h, z, extra = {}) => ({ cls, x, y, w, h, z, shown: true, controls: [], ...extra });
const native = { scene: 0x26, windows: [W('CWindowModelTrade', 0, 0, 336, 144, 100), W('CWindowTaskCardArea', 0, 0, 0, 0, 150),
  W('CWindowModelKaban', 0, 0, 336, 144, 200), W('CChatWindow', 248, 608, 776, 128, 250)] };
assert.deepEqual(tradeGeometry(native), { trade: { x: 248, y: 0 }, partner: { x: 248, y: 0 }, mine: { x: 248, y: 320 }, width: 488, holes: [] },
  'no trade reader: the 2008 layout');
const read = { ...native, windows: [W('CWindowModelTrade', 248, 0, 488, 608, 100), W('CWindowTaskCardArea', 248, 0, 488, 288, 150, { mode: 2, drawn: { x: 256, y: 40, w: 760, h: 240 } }),
  W('CWindowTaskCardArea', 248, 320, 488, 288, 150, { mode: 1, drawn: { x: 256, y: 328, w: 760, h: 272 } }), W('CWindowModelDialogYesNo', 312, 280, 400, 200, 400, { drawn: { x: 320, y: 290, w: 384, h: 180 } })] };
assert.deepEqual(tradeGeometry(read), { trade: { x: 248, y: 0 }, partner: { x: 248, y: 0 }, mine: { x: 248, y: 320 }, width: 776,
  holes: [{ x: 320, y: 290, w: 384, h: 180 }] }, 'the reader\'s rects, the trunk away (wide), the question a hole');
assert.equal(tradeGeometry({ ...read, scene: 0x28 }), null, 'TP: not Card Swap');
assert.equal(tradeGeometry({ scene: 0x26, windows: [W('CWindowModelTrade', 0, 0, 1, 1, 1, { shown: false })] }), null, 'hidden: none');
const wide = M.stripTiles(six, 'partner', new Set(), M.AREA_W_WIDE);
assert.deepEqual(wide.map(t => t.x), [16, 68, 120, 612, 664, 716], 'wide: the right group follows the right edge');
console.log('trade-model_test (geometry): ok');
