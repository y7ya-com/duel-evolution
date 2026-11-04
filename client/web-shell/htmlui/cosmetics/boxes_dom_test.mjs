// The box shop's DOM in headless Chrome (skin.html as the page, fetch stubbed with synthetic data): the showcase (tabs,
// odds, pity, the price), paging, the insufficient-MP state, the reveal (its phases, skipping, a new / duplicate /
// single-body result, equip), reduced motion, the contents sheet, and screens/shop.js's strip() (the engine labels it
// drops while the boxes are open).   node client/web-shell/htmlui/cosmetics/boxes_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 20000 + process.pid % 10000;   // its own server: never another session's
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ port: 9650 + process.pid % 40 });   // off the tools' 9440-9579 (launch() clears its port first)
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);

const v = (gender, worlds) => ({ gender, bit: 1, number: 1, worlds });
const item = (id, rarity, extra = {}) => ({ id, name: 'Item ' + id, kind: 'hair', rarity, slot: 1, variants: [v('male', [0, 1]), v('female', [0, 1])],
  bodies: ['male', 'female'], owned: false, copies: 0, compatible: true, baseChance: 10, ...extra });
const box = (id, price, pool, pity = { superMisses: 2, ultraMisses: 5 }) => ({ id, name: `Box ${id}`, price, superAt: 8, ultraAt: 15, available: true,
  configuredOdds: { common: 55, rare: 30, super: 11, ultra: 4 }, baseOdds: { common: 55, rare: 30, super: 11, ultra: 4 },
  nextOdds: { common: 55, rare: 30, super: 11, ultra: 4 }, pity: { ...pity, superAt: 8, ultraAt: 15 }, pool,
  poolByRarity: Object.fromEntries(['common', 'rare', 'super', 'ultra'].map(r => [r, { count: pool.filter(i => i.rarity === r).length }])) });
const single = item('s1', 'super', { bodies: ['male'], notice: 'The female version of this item is still being made.', variants: [v('male', [0])] });
const INFO = { available: true, wallet: { total: 6200, bound: 5000, earned: 1200 }, nextRequestId: '0', appearance: { gender: 'male', world: 0 },
  boxes: [box('head', 500, [item('c1', 'common', { owned: true }), item('c2', 'common'), item('r1', 'rare'), single, item('u1', 'ultra')]),
    box('dueldisk', 1000, [item('d1', 'common'), item('d2', 'ultra')]), box('outfit', 1500, [item('o1', 'common'), item('o2', 'ultra')])],
  catalog: [], inventory: [] };

await b.ev(`(async () => {
  document.body.innerHTML = '<div id="root" style="position:absolute;left:264px;top:0;width:760px;height:600px"></div><div id="plate" style="position:absolute;left:795px;top:390px;width:229px;height:128px"></div>';
  window.__info = ${JSON.stringify(INFO)}; window.__reward = null; window.__calls = [];
  window.fetch = async (u, o) => {
    u = String(u); __calls.push([u.replace(/^.*\\/api\\/de/, ''), o?.body ? JSON.parse(o.body) : null]);
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (u.endsWith('/open')) {
      await new Promise(r => setTimeout(r, 50));
      const r = __reward;
      if (r.error) return { ok: false, status: 409, json: async () => r };
      __info = { ...__info, nextRequestId: String(+__info.nextRequestId + 1), wallet: { ...__info.wallet, total: __info.wallet.total - 500, earned: __info.wallet.earned - 500 } };
      return ok({ ...__info, requestId: JSON.parse(o.body).requestId, reward: r });
    }
    if (u.endsWith('/equip')) return ok({ ...__info, equipped: { id: JSON.parse(o.body).id, world: 0, parts: [] } });
    if (u.endsWith('/cosmetics')) return ok(__info);
    return { ok: false, status: 404, json: async () => ({}) };
  };
  window.__B = await import('/htmlui/cosmetics/boxes.js');
  window.__wallets = [];
  window.__ctl = __B.mountBoxes(document.getElementById('root'), { onWallet: w => { __wallets.push(w); __B.drawWallet(document.getElementById('plate'), w); } });
})()`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (sel, f = 'e => e.textContent') => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? (${f})(e) : null; })()`);
const qa = (sel, f = 'e => e.textContent') => b.ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(${f})`);
const click = sel => b.ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
await sleep(300);

// ---- the showcase
assert.equal(await q('.bx-title'), 'Cosmetic Boxes');
assert.deepEqual(await qa('.bx-tab .nm'), ['Head & Hair', 'Outfit', 'Duel Disk']);
assert.equal(await q('.bx-tab[data-on] .nm'), 'Head & Hair');
assert.deepEqual(await qa('.bx-seg'), ['Common55%', 'Rare30%', 'Super Rare11%', 'Ultra Rare4%']);
assert.deepEqual(await qa('.bx-meter .hd'), ['Super Rare or betterin 6 opens', 'Ultra Rare guaranteedin 10 opens']);
assert.equal(await q('.bx-price .v'), '500 MP');
assert.equal(await q('.bx-price .s'), 'Earned MP only');
assert.equal(await q('.bx-open', 'e => [e.textContent, e.disabled]').then(JSON.stringify), '["OPEN BOX",false]');
assert.match(await q('#plate .bx-wallet'), /6,200 MP.*Earned 1,200.*Starter 5,000/);
assert.match(await q('.bx-hero .bx-count'), /You own 1 \/ 5/);
assert.equal(await qa('.bx-mini').then(x => x.length), 2, 'the ultra and the super featured');
// paging: the arrows and the keyboard wrap round the three boxes; a box beyond the earned MP is disabled with the reason
await click('.bx-next');
assert.equal(await q('.bx-tab[data-on] .nm'), 'Outfit');
assert.equal(await q('.bx-open', 'e => e.disabled'), true);
assert.match(await q('.bx-why'), /You need 300 more earned MP/);
await b.ev(`document.querySelector('.bx-tab[data-on]').focus(); document.querySelector('.bx-tab[data-on]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
assert.equal(await q('.bx-tab[data-on] .nm'), 'Duel Disk');
assert.equal(await b.ev('document.activeElement.classList.contains("bx-tab")'), true, 'focus follows the tab');
await click('.bx-next');
assert.equal(await q('.bx-tab[data-on] .nm'), 'Head & Hair');

// ---- the reveal: a new ultra. Anticipation (shake), then the card, then the result with its buttons
await b.ev(`__reward = ${JSON.stringify({ ...INFO.boxes[0].pool[4], duplicate: false, owned: true })}`);
await click('.bx-open');
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'shake');
assert.equal(await q('.bx-open', 'e => e.textContent'), 'OPENING…');
await sleep(400);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'shake', 'still anticipating (about 1.5 s for an ultra)');
assert.equal(await q('.bx-rv', 'e => e.dataset.tempo'), 'special');
await sleep(1400);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'card');
await sleep(1500);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'done');
assert.equal(await q('.bx-card .rl'), 'Ultra Rare');
assert.equal(await q('.bx-new'), 'NEW!');
assert.equal(await q('.bx-card .nm'), 'Item u1');
assert.match(await q('.bx-card'), /fits both bodies/);
assert.match(await q('.bx-card'), /both worlds/);
assert.equal(await qa('.bx-rv .pt').then(x => x.length) > 12, true, 'an ultra bursts with sparkles');
assert.deepEqual(await qa('.bx-rv button', 'e => e.textContent'), ['EQUIP NOW', 'Open another · 500 MP', 'Done', 'View it in your Wardrobe']);
assert.deepEqual(__lastOpen(await b.ev('__calls')), ['/cosmetics/open', { boxId: 'head', requestId: '0' }]);
assert.match(await q('#plate .bx-wallet'), /5,700 MP.*Earned 700/, 'the wallet follows the open');
// equip: the server's answer, then the note that others see it
await click('.bx-rv .equip');
await sleep(100);
assert.equal(await q('.bx-rv .equip'), 'EQUIPPED ✓');
assert.match(await q('.bx-rv .status'), /Other players see your new look/);
assert.deepEqual((await b.ev('__calls')).at(-1), ['/cosmetics/equip', { id: 'u1', world: 0 }]);
await click('.bx-rv .done');
assert.equal(await q('.bx-rv'), null);

// a duplicate common, skipped with a click: straight to the result, the duplicate line, no NEW!
await b.ev(`__reward = ${JSON.stringify({ ...INFO.boxes[0].pool[0], duplicate: true, owned: true, copies: 2 })}`);
await click('.bx-open');
await sleep(120);
await click('.bx-rv');
await sleep(50);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'done');
assert.equal(await q('.bx-rv', 'e => e.dataset.tempo'), 'quick');
assert.equal(await q('.bx-new'), null);
assert.equal(await q('.bx-card .dup'), 'Duplicate: +1 tradable copy (you now have 2)');
assert.equal(await q('.bx-rv .again', 'e => e.disabled'), true, 'two opens left 200 earned MP: no third');
assert.match(await q('.bx-rv .after'), /You need 300 more earned MP/);
// Escape closes it
await b.ev(`document.querySelector('.bx-rv').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
assert.equal(await q('.bx-rv'), null);

// a single-body item the player can't wear, with reduced motion: no anticipation, the notice, equip disabled
await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await b.ev(`__info = { ...__info, appearance: { gender: 'female', world: 0 }, wallet: { total: 6200, bound: 5000, earned: 1200 } }; __reward = ${JSON.stringify({ ...single, duplicate: false, owned: true, compatible: false })}`);   // a female body: a male-only item
await b.ev('__ctl.refresh()'); await sleep(100);
await click('.bx-open');
await sleep(150);
assert.equal(await q('.bx-rv', 'e => e.dataset.phase'), 'done');
assert.equal(await q('.bx-rv .notice'), 'The female version of this item is still being made.');
assert.equal(await q('.bx-rv .equip', 'e => [e.disabled, e.textContent].join()'), "true,CAN'T WEAR YET");
assert.match(await q('.bx-card'), /♂ male only for now/);
assert.match(await q('.bx-card'), /Domino City/);
await click('.bx-rv .done');
await b.send('Emulation.setEmulatedMedia', { features: [] });

// an error from the server: the reveal goes, the reason in the game's style
await b.ev(`__reward = { error: 'in-duel', status: 409 }`);
await click('.bx-open');
await sleep(200);
assert.equal(await q('.bx-rv'), null);
assert.match(await q('.bx-why .de-msg'), /during a duel/);

// ---- contents & odds
await click('.bx-link');
assert.equal(await q('.bx-title'), 'Box Contents');
assert.deepEqual(await qa('.bx-grp .gh .r'), ['Ultra Rare · 4%', 'Super Rare · 11%', 'Rare · 30%', 'Common · 55%']);
assert.equal(await qa('.bx-tile').then(x => x.length), 5);
assert.equal(await qa('.bx-tile[data-owned] .bx-own').then(x => x.length), 1);
assert.match(await q('.bx-tile[data-rarity=super] .fn'), /for now/);
assert.match(await q('.bx-rules'), /8th open in a row/);
assert.equal(await q('.bx-list', 'e => getComputedStyle(e).overflowY'), 'auto');
assert.equal(await qa('.bx-sidebtn').then(x => x.join('|')), 'Wardrobe|Back to box');
await b.ev(`document.querySelector('.bx-list').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
assert.equal(await q('.bx-title'), 'Cosmetic Boxes');

// ---- nothing of it outside its window's frame: every piece inside the 1024 x 600 the root may use
const out = await b.ev(`[...document.querySelectorAll('.bx-main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > 1024.5 || r.bottom > 600.5 || r.left < 263.5); }).map(e => e.className)`);
assert.deepEqual(out, []);

// ---- screens/shop.js strip(): the Confirm label goes (Wardrobe is drawn there), Back's only on the contents sheet
const stripped = await b.ev(`import('/htmlui/screens/shop.js').then(m => {
  const t = (id, x, y, text) => ({ id, cls: 'CWindowTaskText', x, y, wx: x, wy: y, text });
  const win = { cls: 'CShopAvatarWindow', controls: [t(1, 807, 496, 'Confirm'), t(2, 807, 556, 'Back'), { id: 3, cls: 'CWindowTaskShadowText', x: 807, y: 496, wx: 0, wy: 0 }] };
  const ids = w => w.controls.map(c => c.id).join();
  return [ids(m.strip(win, true, 'showcase')), ids(m.strip(win, true, 'contents')), ids(m.strip(win, false)),
    m.strip({ cls: 'CShopMileagePlate', controls: [t(4, 807, 397, '8400MP')] }, true).controls.length];
})`);
assert.deepEqual(stripped, ['2', '', '1,2,3', 0]);

console.log('cosmetics/boxes dom ok');
if (b.logs.some(l => /^exception/.test(l))) { console.log(b.logs.join('\n')); process.exitCode = 1; }
b.close();
process.exit();

function __lastOpen(calls) { return calls.filter(c => c[0].endsWith('/open')).at(-1); }
