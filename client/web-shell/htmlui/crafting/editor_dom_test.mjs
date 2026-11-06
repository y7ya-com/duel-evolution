// crafting/editor.js's DOM in headless Chrome (skin.html as the page; fetch stubbed with a server-shaped crafting view;
// the card table, names and art stubbed, no game files): the wallet bar, the detail strip (rarity, owned, locks with
// their reason, Craft / Dismantle with the reason they can't), the Craft Card / Dismantle Card modal (the stepper and its
// limits, Owned and Shards before > after, 0 left, the locked note, Esc), the toast with the Secret Pack line, counts and
// balance updated in place, a server refusal's text, Dismantle Extras (keep 3 / keep 1, the preview, Confirm), the
// trunk's pool (All / Missing / Craftable ids), and keys kept from the game.
//   node client/web-shell/htmlui/crafting/editor_dom_test.mjs [--shots=<dir>]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv.find(a => a.startsWith('--shots='))?.slice(8);
if (shots) mkdirSync(shots, { recursive: true });
const PORT = 31000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ dpr: shots ? 2 : 1, profile: process.env.HOME + '/.cache/de-scratch/craftui/test-' + process.pid, port: 9740 + process.pid % 30 });
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (js, ms = 4000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(40)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js + '\n' + b.logs.join('\n')); };
const shot = async name => { if (shots) await sleep(400), writeFileSync(path.join(shots, name + '.png'), await b.shot()); };

// YO2 ids 1..6 -> passcodes; names from the "card DB"
const CARDS = [[89631139, 'Blue-Eyes White Dragon', 'UR', 0], [46986414, 'Dark Magician', 'SR', 2], [83764718, 'Monster Reborn', 'R', 3],
  [40640057, 'Kuriboh', 'N', 5], [82432018, 'Mask of Brutality', 'N', 1], [10000000, 'Obelisk the Tormentor', 'UR', 0], [55144522, 'Pot of Greed', 'R', 1]];
await b.ev(`(async () => {
  document.body.innerHTML = '<div id="canvas" style="position:absolute;left:0;top:0;width:1024px;height:768px;background:linear-gradient(#5d7fb5,#2a3f66)"></div>' +
    '<div id="deck" style="position:absolute;left:248px;top:0;width:472px;height:27px;background:linear-gradient(#f4f4f4,#d0d0d0)"></div>' +
    '<div id="detail" style="position:absolute;left:0;top:175px;width:248px;height:537px;background:linear-gradient(#dfe3f3,#b7bfdc)"></div>';
  window.__gameKeys = 0;
  addEventListener('keydown', () => __gameKeys++);
  const CARDS = ${JSON.stringify(CARDS)};
  // the card table: YO2 id i+1 -> CARDS[i]
  const tbl = new Uint8Array(24 + 6 * (CARDS.length + 1)), dv = new DataView(tbl.buffer);
  tbl.set([...'YO2CARDS'].map(c => c.charCodeAt(0))); dv.setUint32(8, CARDS.length + 1, true);
  CARDS.forEach(([pc], i) => dv.setUint32(24 + 6 * (i + 1), pc, true));
  window.yo2Deck = { cards: () => CARDS.map(([, name], i) => ({ id: i + 1, name })), card: id => ({ id, kind: [0, 0, 13, 1, 13, 2, 13][id - 1] ?? 0 }) };
  // a card's art: a little SVG card face
  const svg = n => new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="144" height="210"><rect width="144" height="210" fill="#c98f5a"/><rect x="10" y="40" width="124" height="110" fill="#3b5f8f"/><text x="12" y="28" font-size="14" font-family="Arial">' + n + '</text></svg>');
  window.Module = { yo2KabanPool: 1, yo2Lazy: { files: new Map([['game/merge/data/card_passcode.bin', { ver: '' }]]), cardArt: async id => svg(CARDS[id - 1]?.[1] || '?') } };
  // the server: the view, make / dismantle / extras with the request id ledger
  const values = { craft: { N: 5, R: 20, SR: 450, UR: 1500 }, dismantle: { N: 1, R: 2, SR: 150, UR: 500 } };
  window.__s = { shards: 1700, seq: 1, cards: {} };
  for (const [pc, , rarity, owned] of CARDS) __s.cards[pc] = { owned, bound: 0, crafted: 0, craftable: pc !== 10000000, dismantlable: owned, rarity, inDecks: 0 };
  Object.assign(__s.cards[46986414], { bound: 1, dismantlable: 1 });     // Dark Magician: 2 owned, 1 from a structure deck
  Object.assign(__s.cards[82432018], { bound: 1, dismantlable: 0 });     // Mask of Brutality: 1 owned, from a structure deck
  Object.assign(__s.cards[40640057], { inDecks: 1, dismantlable: 4 });   // Kuriboh: 5 owned, 1 in a saved deck
  const view = () => ({ shards: __s.shards, values, cards: JSON.parse(JSON.stringify(__s.cards)), nextRequestId: String(__s.seq) });
  window.__calls = []; window.__fail = null;
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  window.fetch = async (u, o) => {
    u = String(u);
    if (u.endsWith('card_passcode.bin')) return { ok: true, arrayBuffer: async () => tbl.buffer };
    const p = u.replace(/^.*\\/api\\/de\\/craft/, ''), body = o?.body ? JSON.parse(o.body) : null;
    __calls.push([p, body]);
    await new Promise(r => setTimeout(r, 30));
    if (!p) return reply(200, view());
    if (__fail) { const f = __fail; __fail = null; return reply(409, { error: f, status: 409 }); }
    if (body.requestId !== String(__s.seq)) return reply(409, { error: 'stale-request', status: 409 });
    const c = __s.cards[body.passcode];
    if (p === '/make') {
      const k = body.count; __s.shards -= k * values.craft[c.rarity]; c.owned += k; c.crafted += k; c.dismantlable += k; __s.seq++;
      const secret = c.rarity === 'UR' ? { unlocked: [37, 41], freePacks: [{ packId: 37, cards: [1, 2, 3, 4, 5] }] } : { unlocked: [], freePacks: [] };
      return reply(200, { ...view(), operation: 'make', changes: { [body.passcode]: k }, shardDelta: -k * values.craft[c.rarity], secret, replayed: false });
    }
    if (p === '/dismantle') {
      const k = body.count; __s.shards += k * values.dismantle[c.rarity]; c.owned -= k; c.dismantlable -= k; __s.seq++;
      return reply(200, { ...view(), operation: 'dismantle', changes: { [body.passcode]: k }, shardDelta: k * values.dismantle[c.rarity], secret: { unlocked: [], freePacks: [] }, replayed: false });
    }
    if (p === '/dismantle-extras') {
      const changes = {}; let delta = 0;
      for (const [pc, x] of Object.entries(__s.cards)) { const n = Math.min(x.dismantlable, Math.max(0, x.owned - body.keep)); if (n > 0) { changes[pc] = n; delta += n * values.dismantle[x.rarity]; } }
      if (body.preview) return reply(200, { ...view(), operation: 'dismantle-extras', changes, shardDelta: delta, preview: true });
      for (const [pc, n] of Object.entries(changes)) { __s.cards[pc].owned -= n; __s.cards[pc].dismantlable -= n; }
      __s.shards += delta; __s.seq++;
      return reply(200, { ...view(), operation: 'dismantle-extras', changes, shardDelta: delta, secret: { unlocked: [], freePacks: [] }, replayed: false });
    }
    return reply(404, { error: 'not found' });
  };
  const ui = await import('/htmlui/crafting/editor.js');
  window.__ui = ui;
  window.__bar = ui.mountBar(document.getElementById('deck'));
  __bar.place(72, 2, 392);
  window.__strip = ui.mountStrip(document.getElementById('detail'));
  // the trunk header (screens/deck.js searchPanel) in a stand-in Kaban window at the editor's place
  const kaban = document.createElement('div');
  Object.assign(kaban.style, { position: 'absolute', left: '736px', top: '0', width: '288px', height: '712px', background: '#8e8fad' });
  document.body.append(kaban);
  window.__filters = [];
  window.__search = (await import('/htmlui/screens/deck.js')).searchPanel(kaban, f => __filters.push(f));
  __search.setCount(3215);
  // a trunk row's rarity mark where the popup opens, in the editor's order (the marks layer before the search panel)
  const marks = document.createElement('div');
  marks.className = 'cr';
  marks.innerHTML = '<div class="cr-mark" data-r="UR" style="left:60px;top:150px">UR</div>';
  __search.el.before(marks);
})()`);
const q = js => b.ev(`(() => { const B = document.querySelector('.cr-bar'), T = document.querySelector('.cr-cardbar'); return ${js}; })()`);

// ---- the wallet bar: the balance in the editor's number box; Dismantle Extras (crafting is in the trunk)
await until(`document.querySelector('.cr-bar .nb')?.textContent === '1,700'`);
assert.deepEqual(await q(`[...B.querySelectorAll('button')].map(x => x.textContent + ':' + x.className)`), ['Dismantle Extras:dk-btn']);
const bal = () => b.ev(`document.querySelector('.cr-bar .nb').textContent`);

// ---- the detail bar row (on the panel's header bar): the rarity tag, owned, two small buttons; the why in the tooltip
assert.ok(await q('T.hidden'));
await b.ev('__strip.show(1, 0, 175)');
await until(`document.querySelector('.cr-cardbar .rb')?.textContent === 'UR'`);
const strip = () => q(`({ r: T.querySelector('.rb').hidden ? '' : T.querySelector('.rb').textContent, own: T.querySelector('.own').textContent, ownTip: T.querySelector('.own').title,
  lock: !!T.querySelector('.own svg'), craft: [T.querySelectorAll('.dk-btn')[0].textContent, T.querySelectorAll('.dk-btn')[0].title, T.querySelectorAll('.dk-btn')[0].disabled],
  dis: [T.querySelectorAll('.dk-btn')[1].textContent, T.querySelectorAll('.dk-btn')[1].title, T.querySelectorAll('.dk-btn')[1].disabled] })`);
let s = await strip();
assert.deepEqual(s, { r: 'UR', own: '0/3', ownTip: 'Owned 0/3', lock: false, craft: ['Craft', 'Craft: costs 1,500 Shards', false],
  dis: ['Dismantle', 'Dismantle: gain 500 Shards. None owned', true] });
assert.equal(await q('T.getBoundingClientRect().height'), 24, 'one 24 px row: the bar, not the text');
await shot('bar-ur');
await b.ev('__strip.show(2, 0, 175)');
s = await strip();
assert.deepEqual([s.own, s.lock, s.dis[2]], ['2/3', true, false]);
assert.match(s.ownTip, /Owned 2\/3 · 1 locked\nStructure Deck, Beginner's Pack and soulbound copies/);
await b.ev('__strip.show(3, 0, 175)');
assert.deepEqual((await strip()).craft, ['Craft', 'Craft: costs 20 Shards. 3 owned', true]);
await b.ev('__strip.show(5, 0, 175)');
assert.deepEqual((await strip()).dis, ['Dismantle', 'Dismantle: gain 1 Shards. Bound', true]);
await b.ev('__strip.show(6, 0, 175)');
assert.match((await strip()).craft[1], /Can't be crafted/);

// ---- the card popup
const M = () => b.ev(`(() => { const R = document.querySelector('.cr-modal.card'); return R && { title: R.querySelector('svg text').textContent, sub: R.querySelector('.sub').textContent,
  count: R.querySelector('.count').textContent, minus: R.querySelectorAll('.step')[0].disabled, plus: R.querySelectorAll('.step')[1].disabled,
  owned: R.querySelector('.own .ba').textContent, ownTone: R.querySelector('.own .aft').dataset.tone || '', shards: R.querySelector('.shards .ba').textContent,
  delta: R.querySelector('.shards .delta').textContent, shardTone: R.querySelector('.shards .aft').dataset.tone, note: R.querySelector('.mid .note').textContent,
  locked: R.querySelector('.locked').hidden ? '' : R.querySelector('.locked').textContent, go: R.querySelector('.go').textContent, badge: R.querySelector('.art .rb').textContent,
  name: R.querySelector('.cn').textContent, frame: R.querySelector('.dk-pop, .dk-head') ? 'dk' : '' }; })()`);
// craft the UR: one affordable (1,700 / 1,500): + disabled, the note says why
await b.ev('__strip.show(1, 0, 175)');
await b.ev(`document.querySelectorAll('.cr-cardbar .dk-btn')[0].click()`);
await until(`!!document.querySelector('.cr-modal.card')`);
await until(`!!document.querySelector('.cr-modal.card .art img')?.src`);
let m = await M();
assert.deepEqual(m, { title: 'Craft Card', sub: 'Use Shards to craft a card', count: '1', minus: true, plus: true, owned: '01', ownTone: '',
  shards: '1,700200', delta: '−1,500', shardTone: 'spend', note: 'You have Shards for 1.', locked: '',
  go: 'Craft', badge: 'UR', name: 'Blue-Eyes White Dragon', frame: 'dk' });
await shot('modal-craft-ur');
// Esc cancels, no request, no key to the game
await b.ev(`document.querySelector('.cr-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await until(`!document.querySelector('.cr-modal')`);
assert.equal(await b.ev('__gameKeys'), 0);
assert.equal(await b.ev(`__calls.filter(c => c[0] === '/make').length`), 0, 'cancelled: no request');
// the close box cancels too
await b.ev(`document.querySelectorAll('.cr-cardbar .dk-btn')[0].click()`);
await until(`!!document.querySelector('.cr-modal.card')`);
await b.ev(`document.querySelector('.cr-modal .x').click()`);
await until(`!document.querySelector('.cr-modal')`);
await b.ev(`document.querySelectorAll('.cr-cardbar .dk-btn')[0].click()`);
await until(`!!document.querySelector('.cr-modal.card')`);
await b.ev(`document.querySelector('.cr-modal .go').click()`);
await until(`!!document.querySelector('.cr-toast .t1')`);
assert.equal(await b.ev(`document.querySelector('.cr-toast .t1').textContent`), 'Crafted Blue-Eyes White Dragon');
assert.deepEqual(await b.ev(`[...document.querySelectorAll('.cr-toast .t2')].map(e => e.textContent)`), ['−1,500 Shards', 'Unlocked 2 packs for 24h · 1 free pack added']);
assert.deepEqual(await b.ev(`__calls.find(c => c[0] === '/make')[1]`), { passcode: 89631139, count: 1, requestId: '1' });
await until(`document.querySelector('.cr-bar .nb').textContent === '200'`);
s = await strip();
assert.deepEqual([s.own, s.lock, s.craft[1], s.craft[2], s.dis[1], s.dis[2]], ['1/3', false, 'Craft: costs 1,500 Shards. Need 1,300 more', true, 'Dismantle: gain 500 Shards', false],
  'not enough Shards; the crafted copy is not locked and can be dismantled');
assert.equal(await q(`T.querySelector('.own').title`), 'Owned 1/3', 'no lock reason for a crafted copy');
await shot('crafted-toast');

// ---- dismantle Kuriboh (N, 5 owned, 1 in a saved deck): up to 4; three of them
await b.ev('__strip.show(4, 0, 175)');
assert.equal((await strip()).own, '5');
await b.ev(`document.querySelectorAll('.cr-cardbar .dk-btn')[1].click()`);
await until(`!!document.querySelector('.cr-modal.card')`);
m = await M();
assert.deepEqual([m.title, m.sub, m.count, m.minus, m.plus, m.owned, m.shards, m.delta, m.shardTone, m.go], ['Dismantle Card', 'Dismantle a card to obtain Shards', '1', true, false, '54', '200201', '+1', 'gain', 'Dismantle']);
assert.equal(m.locked, 'Locked: 1 in a saved deck: they stay in your collection.');
for (let i = 0; i < 4; i++) await b.ev(`document.querySelectorAll('.cr-modal .step')[1].click()`);
m = await M();
assert.deepEqual([m.count, m.plus, m.minus, m.owned, m.shards, m.note], ['4', true, false, '51', '200204', '4 can be dismantled.'], 'stops at the unlocked copies');
await b.ev(`document.querySelector('.cr-modal.card').dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }))`);
assert.equal((await M()).count, '3', '- on the keyboard');
await shot('modal-dismantle-n');
await b.ev(`document.querySelector('.cr-modal .go').click()`);
await until(`document.querySelector('.cr-bar .nb').textContent === '203'`);
assert.deepEqual(await b.ev(`__calls.filter(c => c[0] === '/dismantle').at(-1)[1].count`), 3);
assert.equal(await b.ev(`document.querySelector('.cr-toast .t1').textContent`), 'Dismantled 3 × Kuriboh');
assert.equal((await strip()).own, '2/3');
// the last copy: 1 > 0 in red
await b.ev('__strip.show(7, 0, 175)');
await b.ev(`document.querySelectorAll('.cr-cardbar .dk-btn')[1].click()`);
await until(`!!document.querySelector('.cr-modal.card')`);
m = await M();
assert.deepEqual([m.owned, m.ownTone, m.locked], ['10', 'zero', '']);
await shot('modal-dismantle-last');
await b.ev(`document.querySelector('.cr-modal .dk-btn.alt').click()`);
await until(`!document.querySelector('.cr-modal')`);
// a refusal: the friendly text in an error toast
await b.ev('__strip.show(4, 0, 175)');
await b.ev(`document.querySelectorAll('.cr-cardbar .dk-btn')[1].click()`);
await until(`!!document.querySelector('.cr-modal.card')`);
await b.ev(`__fail = 'busy'; document.querySelector('.cr-modal .go').click()`);
await until(`document.querySelector('.cr-toast .dk-pop')?.dataset.tone === 'error'`);
assert.match(await b.ev(`document.querySelector('.cr-toast .t1').textContent`), /duel or trade is in progress/);

// ---- the trunk's pool from the view: All, Missing, Craftable; by category (kinds stubbed: 2 Normal, 3 Spell, ...)
const pool = o => b.ev(`JSON.stringify(__ui.trunkPool(${JSON.stringify(o)}))`).then(JSON.parse);
// (the Filters popup's Show: owned | all | missing | craftable; Rarity: several)
assert.deepEqual(await pool({ show: 'owned', rarity: [], cat: 6 }), { mode: 0, ids: [] });
assert.deepEqual(await pool({ show: 'all', rarity: [], cat: 6 }), { mode: 1, ids: [1, 2, 3, 4, 5, 6, 7] });
assert.deepEqual(await pool({ show: 'all', rarity: [], cat: 2 }), { mode: 1, ids: [3, 5, 7] }, 'the Spell chip');
assert.deepEqual(await pool({ show: 'missing', rarity: [], cat: 6 }), { mode: 2, ids: [6] });
assert.deepEqual(await pool({ show: 'all', rarity: ['UR'], cat: 6 }), { mode: 2, ids: [1, 6] }, 'Rarity UR');
assert.deepEqual(await pool({ show: 'owned', rarity: ['UR'], cat: 6 }), { mode: 2, ids: [1] }, 'owned URs');
assert.deepEqual(await pool({ show: 'all', rarity: ['UR', 'SR'], cat: 6 }), { mode: 2, ids: [1, 2, 6] }, 'UR or SR');
assert.deepEqual(await pool({ show: 'craftable', rarity: [], cat: 6 }), { mode: 2, ids: [4, 5, 7] }, '203 Shards: the N and R under 3');

// ---- Dismantle Extras: keep 3 (nothing past 3: the empty state), keep 1 (the preview), Confirm
await b.ev(`document.querySelector('.cr-bar .dk-btn').click()`);
await until(`!!document.querySelector('.cr-modal.extras')`);
await until(`/No extra copies/.test(document.querySelector('.cr-modal .empty').textContent)`);
const ex = () => b.ev(`({ head: document.querySelector('.cr-modal svg text').textContent + ' / ' + document.querySelector('.cr-modal .sub').textContent,
  rows: [...document.querySelectorAll('.cr-modal .row')].map(r => r.textContent), sum: document.querySelector('.cr-modal .row1 .sum').textContent,
  shards: document.querySelector('.cr-modal .shards .ba').textContent + document.querySelector('.cr-modal .shards .delta').textContent, ok: [document.querySelector('.cr-modal .go').textContent, document.querySelector('.cr-modal .go').disabled],
  keep: [...document.querySelectorAll('.cr-modal [role=radio]')].map(r => r.getAttribute('aria-pressed')) })`);
let e = await ex();
assert.deepEqual(e, { head: 'Dismantle Extras / Turn spare copies into Shards', rows: [], sum: '', shards: '203203', ok: ['Dismantle', true], keep: ['true', 'false'] });
assert.deepEqual(await b.ev(`__calls.filter(c => c[0] === '/dismantle-extras').at(-1)[1]`), { keep: 3, preview: true, requestId: String(await b.ev('__s.seq')) });
await b.ev(`document.querySelectorAll('.cr-modal [role=radio]')[1].click()`);
await until(`document.querySelectorAll('.cr-modal .row').length === 3`);
await shot('extras-keep1');
e = await ex();
assert.deepEqual(e.rows, ['SRDark Magician×1+150', 'RMonster Reborn×2+4', 'NKuriboh×1+1'], 'most Shards first');
assert.deepEqual([e.sum, e.shards, e.ok], ['4 copies from 3 cards · 1 SR/UR', '203358+155', ['Dismantle', false]]);
await shot('extras-keep1');
const seq = await b.ev('__s.seq');
await b.ev(`document.querySelector('.cr-modal .go').click()`);
await until(`!document.querySelector('.cr-modal')`);
assert.deepEqual(await b.ev(`__calls.at(-1)[1]`), { keep: 1, requestId: String(seq) });
assert.equal(await b.ev(`document.querySelector('.cr-toast .t1').textContent`), 'Dismantled 4 extra copies');
await until(`document.querySelector('.cr-bar .nb').textContent === '358'`);
await b.ev(`document.querySelector('.cr-bar .dk-btn').click()`);
await until(`!!document.querySelector('.cr-modal.extras')`);
await b.ev(`document.querySelector('.cr-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await until(`!document.querySelector('.cr-modal')`);
assert.equal(await b.ev('__gameKeys'), 0);
// ---- the alignment, measured (crafting/align.js): every state above, again, with the checker
const align = async name => {
  const r = await b.ev(`import('/htmlui/crafting/align.js').then(m => m.checkAlign())`);
  const bad = r.checks.filter(c => !c.ok);
  assert.ok(r.checks.length > 5, name + ': measured');
  assert.deepEqual(bad, [], name + ': ' + JSON.stringify(bad));
  return r.checks.length;
};
await b.ev('__strip.show(1, 0, 175)');
let n = await align('detail bar + header + trunk header');
assert.ok((await b.ev(`import('/htmlui/crafting/align.js').then(m => m.checkAlign().checks.map(c => c.name))`)).some(x => /trunk header/.test(x)), 'the trunk header measured');
// the trunk header is the editor's own: the search box, Filters, the type chips; no crafting control in it
assert.deepEqual(await b.ev(`[...document.querySelector('.dk-search').children].filter(e => e.matches('button, input, div[role=group]')).map(e => e.textContent || e.placeholder)`),
  ['Search name or card text', '×', 'Filters']);
assert.equal(await b.ev(`document.querySelectorAll('.dk-search > div > .dk-chip').length`), 7, 'the type chips');
// Show and Rarity in the Filters popup: the filter, the badge's count
const filt = () => b.ev(`JSON.stringify({ show: __filters.at(-1)?.show, rarity: __filters.at(-1)?.rarity, badge: document.querySelector('.dk-search > .dk-btn .dk-badge')?.textContent || '' })`).then(JSON.parse);
await b.ev(`document.querySelector('.dk-search > .dk-btn').click()`);
await until(`!!document.querySelector('.dk-pop select[aria-label=Show]')`);
assert.deepEqual(await b.ev(`[...document.querySelectorAll('.dk-pop .dk-lbl')].map(l => l.textContent)`),
  ['Show', 'Rarity', 'Attribute', 'Type', 'Spell / Trap', 'Level / Rank', 'ATK', 'DEF', 'Limit', 'Sort by'], 'each control once');
assert.deepEqual(await b.ev(`[...document.querySelector('.dk-pop select[aria-label=Show]').options].map(o => o.textContent + ':' + o.value)`),
  ['Owned cards:owned', 'All cards:all', 'Missing:missing', 'Craftable now:craftable']);
await shot('filters-popup');
n += await align('Filters popup');
await b.ev(`[...document.querySelectorAll('.dk-pop .dk-rar')].find(x => x.textContent === 'UR').click()`);
await b.ev(`[...document.querySelectorAll('.dk-pop .dk-rar')].find(x => x.textContent === 'SR').click()`);
await b.ev(`(() => { const s = document.querySelector('.dk-pop select[aria-label=Show]'); s.value = 'craftable'; s.dispatchEvent(new Event('change')); })()`);
await until(`__filters.at(-1)?.show === 'craftable' && __filters.at(-1).rarity.length === 2`);
assert.deepEqual(await filt(), { show: 'craftable', rarity: ['UR', 'SR'], badge: '2' });
assert.deepEqual(await b.ev(`[...document.querySelectorAll('.dk-pop .dk-rar')].map(x => x.textContent + ':' + x.getAttribute('aria-pressed'))`),
  ['N:false', 'R:false', 'SR:true', 'UR:true']);
await shot('filters-popup-on');
n += await align('Filters popup, rows on');
// UR off again; Clear filters resets Show and Rarity; Done closes
await b.ev(`[...document.querySelectorAll('.dk-pop .dk-rar')].find(x => x.textContent === 'UR').click()`);
await until(`__filters.at(-1)?.rarity.join() === 'SR'`);
await b.ev(`[...document.querySelectorAll('.dk-pop .dk-btn')].find(x => x.textContent === 'Clear filters').click()`);
await until(`__filters.at(-1)?.show === 'owned' && !__filters.at(-1).rarity.length`);
assert.equal((await filt()).badge, '', 'no badge with nothing on');
await b.ev(`[...document.querySelectorAll('.dk-pop .dk-btn')].find(x => x.textContent === 'Done').click()`);
await b.ev(`(() => { document.querySelector('.dk-search > .dk-btn').click(); const s = document.querySelector('.dk-pop select[aria-label=Show]'); s.value = 'missing'; s.dispatchEvent(new Event('change')); })()`);
await until(`__filters.at(-1)?.show === 'missing'`);
assert.equal((await filt()).badge, '1');
await b.ev(`[...document.querySelectorAll('.dk-pop .dk-btn')].find(x => x.textContent === 'Done').click()`);
await shot('trunk-header');
n += await align('trunk header with the badge');
await b.ev('__strip.show(7, 0, 175)');   // Pot of Greed (R): affordable
await b.ev(`document.querySelectorAll('.cr-cardbar .dk-btn')[0].click()`);
await until(`!!document.querySelector('.cr-modal.card')`);
n += await align('craft popup');
await b.ev(`document.querySelector('.cr-modal .dk-btn.alt').click()`);
await b.ev(`Object.assign(__s.cards[55144522], { owned: 3, bound: 1, dismantlable: 2 }); __ui.refresh(true)`);   // a locked copy to show
await until(`document.querySelector('.cr-cardbar .own').textContent === '3/3'`);
await b.ev(`document.querySelectorAll('.cr-cardbar .dk-btn')[1].click()`);
await until(`!!document.querySelector('.cr-modal.card .locked:not([hidden])')`);
n += await align('dismantle popup, locked');
await b.ev(`document.querySelector('.cr-modal .dk-btn.alt').click()`);
await b.ev(`document.querySelector('.cr-bar .dk-btn').click()`);
await until(`!!document.querySelector('.cr-modal.extras .row1 [aria-pressed=true]')`);
n += await align('extras popup');
await b.ev(`document.querySelector('.cr-modal .dk-btn.alt').click()`);
console.log('alignment: ' + n + ' checks within 1 px');
assert.deepEqual(b.logs.filter(l => /exception|error/i.test(l)), []);
console.log('crafting/editor_dom_test: ok');
b.close();
process.exit(0);
