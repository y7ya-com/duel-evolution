// The full-screen card shop's DOM in headless Chrome (skin.html as the page, fetch stubbed with model_test.mjs's
// synthetic data): the band, the wallet, the tabs, the sub-nav's groups (empty ones hidden, Unlocked for You with its
// countdowns), Recommended's banners, Card Packs' sections, the pack page (rows, collection, buy buttons), the details
// sheet from its rows, buying ×1 / ×10 and the reveal (NEW, the summary, Buy again, Done), a stale request sent again,
// a refused purchase, a structure deck bought once ("Purchased", already-owned-deck), the Cosmetic Boxes tab (the
// boxes as the sub-nav, a banner per box, a box's page with the try-on and Reset, Contents & odds, opening one: the reveal
// with New and "Can't wear yet", too little MP that isn't starter MP), Back (the native Exit's callback), Esc, and the keyboard kept
// from the game. No game files here: the waist-ups fall back to the item art (their own test: cosmetics/waistup_test).
//   node client/web-shell/htmlui/shop/shop_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
import { VIEW, PACK } from './model_test.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 21000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ port: 9700 + process.pid % 40, profile: process.env.HOME + '/.cache/de-scratch/shopA/dom-chrome-' + process.pid });
await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`, 'document.readyState === "complete"');
// the cosmetics state (cosmetics/api.js GET /api/de/cosmetics): a box per tab, one item made for the female body only
const cv = (gender, number) => ({ gender, bit: 1, number, worlds: [0, 1] });
const citem = (id, rarity, extra = {}) => ({ id, name: 'Item ' + id, kind: 'hair', rarity, slot: 1, variants: [cv('male', 10), cv('female', 5)],
  bodies: ['male', 'female'], owned: false, copies: 0, compatible: true, baseChance: 10, ...extra });
const cbox = (id, name, price, pool) => ({ id, name, price, superAt: 8, ultraAt: 15, available: true,
  configuredOdds: { common: 55, rare: 30, super: 11, ultra: 4 }, baseOdds: { common: 55, rare: 30, super: 11, ultra: 4 },
  nextOdds: { common: 55, rare: 30, super: 11, ultra: 4 }, pity: { superMisses: 7, ultraMisses: 2, superAt: 8, ultraAt: 15 }, pool,
  poolByRarity: Object.fromEntries(['common', 'rare', 'super', 'ultra'].map(r => [r, { count: pool.filter(i => i.rarity === r).length }])) });
const LOOK = [0, 0, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90, 0xb0, 0x20, 0, 0, 0, 0, 0, 0];
const INFO = { available: true, wallet: { total: 5000, bound: 1000, earned: 4000 }, nextRequestId: '0',
  appearance: { gender: 'male', world: 0, parts: LOOK, looks: { 0: LOOK, 1: LOOK } },
  boxes: [cbox('head', 'Head & Hair Accessory Box', 500, [citem('c1', 'common', { owned: true, copies: 1 }), citem('r1', 'rare'), citem('u1', 'ultra'),
    citem('f1', 'rare', { name: 'Ponytail', bodies: ['female'], variants: [cv('female', 8)], compatible: false })]),
  cbox('outfit', 'Outfit Box', 1200, [citem('o1', 'common', { kind: 'outfit', slot: 6, variants: [cv('male', 0x77)] })]),
  cbox('dueldisk', 'Duel Disk Box', 1000, [citem('d1', 'common', { kind: 'dueldisk', slot: 8, variants: [cv('male', 0xb4), cv('female', 0xb4)] })])],
  catalog: [], inventory: [] };
const PURCHASED = Array.from({ length: 50 }, (_, i) => ({ itemId: 37, kind: 1, passcode: 1 + (i % 5), internalId: null, rarity: ['UR', 'SR', 'SR', 'R', 'N'][i % 5], isNew: i < 3 }));
await b.ev(`(async () => {
  document.body.innerHTML = '<canvas id="canvas" width="1024" height="768" style="position:absolute;left:0;top:0"></canvas><div id="htmlui-host" style="position:absolute;left:0;top:0;width:1024px;height:768px"></div>';
  window.INFO = ${JSON.stringify(INFO)}; window.REWARD = null;
  window.VIEW = ${JSON.stringify(VIEW)}; window.PACK = ${JSON.stringify(PACK)}; window.PURCHASED = ${JSON.stringify(PURCHASED)};
  window.calls = []; window.buyFails = [];
  let tok = 1;
  window.realFetch = window.fetch;
  window.fetch = async (u, o) => {
    const url = new URL(u, location.href), body = o?.body ? JSON.parse(o.body) : null;
    calls.push([url.pathname + url.search, body]);
    const j = (x, status = 200) => ({ ok: status === 200, status, json: async () => structuredClone(x) });
    if (url.pathname === '/api/de/cosmetics/open') {
      const b = INFO.boxes.find(x => x.id === body.boxId);
      if (body.requestId !== INFO.nextRequestId) return j({ error: 'stale-request' }, 409);
      INFO.wallet.earned -= b.price; INFO.wallet.total -= b.price; INFO.nextRequestId = String(+INFO.nextRequestId + 1);
      const it = b.pool.find(i => i.id === REWARD) || b.pool[0];
      it.owned = true;
      return j({ ...INFO, reward: { ...it, duplicate: false } });
    }
    if (url.pathname === '/api/de/cosmetics') return j(INFO);
    if (url.pathname === '/api/de/shop/pack') return j(PACK);
    if (url.pathname === '/api/de/shop/buy') {
      const f = buyFails.shift();
      if (f) return j({ error: f }, 409);
      if (body.requestId !== VIEW.nextRequestId) return j({ error: 'stale-request' }, 409);
      VIEW.wallet.total -= 200 * body.count; VIEW.nextRequestId = 'tok-' + ++tok;
      return j({ ...VIEW, purchased: PURCHASED.slice(0, body.count * 5), replayed: false });
    }
    return j(VIEW);
  };
  window.S = await import('/htmlui/shop/index.js');
  window.out = [];
  window.gameKeys = []; addEventListener('keydown', e => gameKeys.push(e.key));
  window.shop = S.mountCardShop(document.getElementById('htmlui-host'), { onBack: () => out.push('back') });
})()`);
const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
const q = js => b.ev(js);
const texts = sel => q(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => e.textContent.trim())`);
const key = async k => { const c = { Escape: 27, Tab: 9 }[k] || 0; for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: c, ...(k.length === 1 && type === 'keyDown' ? { text: k } : {}) }); };
await tick();

// ---- home: the band, the wallet, the tabs, the sub-nav (no empty group), Recommended
assert.equal(await q(`document.querySelector('.ns .sa-title').textContent`), 'Card Shop');
assert.equal(await q(`document.querySelector('.ns .wallet').querySelector('.v').textContent`), '5000 MP');   // one MP number
assert.equal(await q(`document.querySelector('.ns .wallet').querySelector('.mpi .mpi-tip').textContent`), '5,000 MP total · 1,000 MP is starter MP: it buys card packs but not cosmetic boxes.');
assert.equal(await q(`document.querySelector('.ns .wallet').querySelectorAll('.k').length`), 1);
assert.deepEqual(await texts('.ns .tabs [role=tab]'), ['Recommended', 'Card Packs', 'Structure Decks', 'Cosmetic Boxes']);   // single cards retired
assert.equal(await q(`document.querySelectorAll('[data-k=tab-singles], .ns .tile').length`), 0);
assert.equal(await q(`document.querySelector('.ns .tabs [aria-selected=true]').textContent`), 'Recommended');
assert.deepEqual(await texts('.ns .side .bt'), ['Booster Packs4', 'Beginner Picks1']);
assert.equal(await q(`document.querySelectorAll('.ns .redot').length`), 0);
assert.deepEqual(await q(`[...document.querySelectorAll('.ns .banner')].map(b => +b.dataset.pack)`), [45, 1001, 43, 41, 37]);
assert.equal(await q(`document.querySelector('.ns .banner').querySelector('.tag:not(.cy)')?.textContent ?? ''`), '');   // the hero: no availability promise next to its kind
assert.equal(await q(`document.querySelector('.ns .banner[data-pack="1001"] .bt').textContent`), '1 Pack100 MP');
assert.ok(await q(`document.querySelector('.ns .wallet').getBoundingClientRect().right < document.querySelector('.ns .bt.nav').getBoundingClientRect().left`));
// the keyboard stays with the shop
await q(`document.querySelector('.ns .tabs [aria-selected=true]').focus()`);
await key('a');
assert.deepEqual(await q(`gameKeys`), []);

// ---- the secret pack keys: "Unlocked for You" first, each banner's countdown, the dot on Card Packs
await q(`VIEW.unlocked = { 43: Math.floor(Date.now() / 1000) + 23.5 * 3600 }; shop.refresh()`);
await tick();
assert.deepEqual(await texts('.ns .side .bt'), ['Unlocked for You1', 'Booster Packs4', 'Beginner Picks1']);
assert.equal(await q(`document.querySelectorAll('.ns .redot').length`), 1);
assert.equal(await q(`document.querySelector('.ns .banner[data-pack="43"] .tag[data-k=unlocked]').textContent`), 'Unlocked · 23h left');

// ---- Card Packs: the sections, the first group selected; a group's button scrolls the feed to it
await q(`document.querySelector('[data-k=tab-packs]').click()`);
await tick();
assert.deepEqual(await texts('.ns .feed .sect [role=heading]'), ['Unlocked for You', 'Booster Packs', 'Beginner Picks']);
assert.equal(await q(`document.querySelector('.ns .side [aria-selected=true]').dataset.k`), 'grp-unlocked');
await q(`document.querySelector('[data-k=grp-beginner]').click()`);
await tick(400);
assert.ok(await q(`document.querySelector('.ns .feed').scrollTop > 0`));
// Structure Decks: one Buy each (×1 only); a deck this character bought says so and takes no click
await q(`document.querySelector('[data-k=tab-decks]').click()`);
await tick();
assert.deepEqual(await q(`[...document.querySelectorAll('.ns .banner')].map(b => +b.dataset.pack)`), [7001]);
assert.equal(await q(`document.querySelectorAll('.ns .side .bt').length`), 0);
assert.equal(await q(`document.querySelector('.ns .banner .bt').textContent`), '1 Deck1000 MP');
// the server says it's owned only when bought: already-owned-deck, its words, the shop asked again
await q(`buyFails.push('already-owned-deck'); document.querySelector('.ns .banner .bt').click()`);
await tick(400);
assert.equal(await q(`document.querySelectorAll('.ns .rv').length`), 0);
assert.equal(await q(`document.querySelector('.ns [role=status][aria-live]').textContent`), 'This character already owns this deck.');
await q(`VIEW.items.find(i => i.param === 7001).purchased = true; shop.refresh()`);
await tick();
assert.equal(await q(`document.querySelector('.ns .banner .bt').textContent`), 'Purchased');
assert.equal(await q(`document.querySelector('.ns .banner .bt').disabled`), true);
assert.equal(await q(`document.querySelector('.ns .banner .tag[data-k=bought]').textContent`), '✓ Purchased');
const nBuys = await q(`calls.filter(c => c[0] === '/api/de/shop/buy').length`);
await q(`document.querySelector('.ns .banner .bt').click()`);
assert.equal(await q(`calls.filter(c => c[0] === '/api/de/shop/buy').length`), nBuys);
await q(`VIEW.items.find(i => i.param === 7001).purchased = false; shop.refresh()`);
await tick();

// ---- Cosmetic Boxes, in the shop's own look: the boxes as the sub-nav, a banner per box (its three rarest items, Open)
await q(`document.querySelector('[data-k=tab-boxes]').click()`);
await tick(300);
assert.equal(await q(`document.querySelector('.ns .tabs [aria-selected=true]').textContent`), 'Cosmetic Boxes');
assert.deepEqual(await texts('.ns .side .bt'), ['Head & Hair500 MP', 'Outfit1,200 MP', 'Duel Disk1,000 MP']);
assert.deepEqual(await q(`[...document.querySelectorAll('.ns .banner.bxb')].map(b => b.dataset.box)`), ['head', 'outfit', 'dueldisk']);
assert.equal(await q(`document.querySelectorAll('.ns .bxb[data-box=head] .rf').length`), 3);
assert.equal(await q(`document.querySelector('.ns .bxb[data-box=head] .tag[data-k=update]').textContent`), 'Super Rare guaranteed next');
assert.equal(await q(`document.querySelector('[data-k=open-outfit]').textContent`), 'Open1200 MP');
// a box's page: the try-on (the player's look), the items by rarity, the price, the guarantees, the odds
await q(`document.querySelector('[data-k=box-head]').click()`);
await tick(300);
assert.equal(await q(`document.querySelector('.ns .sa-title').textContent`), 'Head & Hair Box');
assert.deepEqual(await texts('.ns .bx-items .ghd .t'), ['Ultra Rare', 'Rare', 'Common']);
assert.deepEqual(await texts('.ns .bx-tile .nm'), ['Item u1', 'Item r1', 'Ponytail', 'Item c1']);
assert.equal(await q(`document.querySelector('[data-k=it-c1] .own').textContent`), '×2');
assert.equal(await q(`document.querySelector('[data-k=it-f1] .bx-only').textContent`), 'Female only');
assert.equal(await q(`document.querySelector('.ns .bx-chip').textContent`), 'Your look');
assert.equal(await q(`document.querySelector('[data-k=reset]').disabled`), true);
assert.deepEqual(await q(`[...document.querySelectorAll('.ns .bx-pity [role=meter]')].map(m => m.getAttribute('aria-label'))`), ['Super Rare 7/8', 'Ultra Rare 2/15']);
assert.deepEqual(await texts('.ns .bx-pity .t12[data-next]'), ['Super Rare on the next open']);
assert.equal(await q(`document.querySelector('#bx-note').textContent`), 'Opens with 500 MP.');
// trying on: the item on the waist-up, Reset; an item for the other body on that body, its note
await q(`document.querySelector('[data-k=it-u1]').click()`);
await tick();
assert.equal(await q(`document.querySelector('[data-k=it-u1]').getAttribute('aria-pressed')`), 'true');
assert.equal(await q(`document.querySelector('.ns .bx-chip').textContent`), 'Trying on');
assert.equal(await q(`document.querySelector('.ns .bx-try [role=img]').getAttribute('aria-label')`), 'Your look wearing Item u1');
assert.equal(await q(`document.querySelector('.ns .bx-try .de-wu').dataset.look.slice(2, 4)`), '0a');   // FRONT_HAIR: the male variant
assert.equal(await q(`document.querySelector('[data-k=reset]').disabled`), false);
await q(`document.querySelector('[data-k=it-f1]').click()`);
await tick();
assert.equal(await q(`document.querySelector('.ns .bx-chip').textContent`), 'Shown on the female body');
assert.equal(await q(`document.querySelector('.ns .bx-try .de-wu').dataset.look.slice(0, 4)`), '0108');   // the female default, her ponytail
assert.match(await q(`document.querySelector('.ns .page').textContent`), /Male version coming soon/);
await q(`document.querySelector('[data-k=reset]').click()`);
await tick();
assert.equal(await q(`document.querySelector('.ns .bx-chip').textContent`), 'Your look');
// Contents & odds: the odds per rarity, every item; Esc closes it
await q(`document.querySelector('[data-k=contents]').click()`);
await tick();
assert.deepEqual(await q(`[...document.querySelectorAll('.ns .sheet table.odds tr')].map(r => [...r.children].map(c => c.textContent))`),
  [['Rarity', 'Chance', 'Owned'], ['Ultra Rare', '4%', '0 / 1'], ['Rare', '30%', '0 / 2'], ['Common', '55%', '1 / 1']]);
assert.equal(await q(`document.querySelectorAll('.ns .sheet .gc').length`), 4);
await key('Escape');
await tick();
assert.equal(await q(`document.querySelectorAll('.ns .sheet').length`), 0);
// opening: the reveal (the item worn, New, its rarity), the wallet down by the earned MP, Equip; for the other body only
// "Can't wear yet" and the note
await q(`REWARD = 'r1'; document.querySelector('[data-k=open]').click()`);
await tick(500);
assert.deepEqual(await q(`calls.filter(c => c[0] === '/api/de/cosmetics/open').map(c => c[1])`), [{ boxId: 'head', requestId: '0' }]);
assert.equal(await q(`document.querySelector('.ns .rv').dataset.phase`), 'done');
assert.equal(await q(`document.querySelector('.ns .rv').getAttribute('aria-label')`), 'Rare: Item r1');
assert.equal(await q(`document.querySelector('.ns .rv .bxr').dataset.r`), 'R');
assert.equal(await q(`document.querySelector('.ns .rv .bxr .rf').dataset.r`), 'R');
assert.equal(await q(`document.querySelector('.ns .rv .bxinfo .own').textContent`), 'New');
assert.equal(await q(`document.querySelector('.ns .rv [data-k=equip]').textContent`), 'Equip');
assert.equal(await q(`document.querySelector('.ns .rv [data-k=again]').textContent`), 'Open another ·500 MP');
assert.equal(await q(`document.querySelector('.ns .wallet').querySelector('.v').textContent`), '4500 MP');
await q(`document.querySelector('.ns .rv [data-k=done]').click()`);
await q(`REWARD = 'f1'; document.querySelector('[data-k=open]').click()`);
await tick(500);
assert.equal(await q(`document.querySelector('.ns .rv [data-k=equip]').textContent`), "Can't wear yet");
assert.equal(await q(`document.querySelector('.ns .rv [data-k=equip]').disabled`), true);
assert.match(await q(`document.querySelector('.ns .rv .bxinfo').textContent`), /Male version coming soon$/);
await key('Escape');
await tick();
// too little earned MP: Open off, how much more is needed
await q(`INFO.wallet.earned = 100; shop.refresh(); document.querySelector('.ns .bt.nav').click()`);
await tick(300);
await q(`document.querySelector('[data-k=box-head]').click()`);
await tick(300);
assert.equal(await q(`document.querySelector('[data-k=open]').disabled`), true);
assert.equal(await q(`document.querySelector('#bx-note').textContent`), "Needs 400 more MP · starter MP can't open boxes");
// Back: the box page to the tab, the tab's Back is the native Exit
await q(`document.querySelector('.ns .bt.nav').click()`);
await tick();
assert.equal(await q(`document.querySelector('.ns .sa-title').textContent`), 'Card Shop');
await q(`document.querySelector('.ns .bt.nav').click()`);
assert.deepEqual(await q(`out`), ['back']);
assert.equal(await q(`document.querySelector('.ns .tabs [aria-selected=true]').textContent`), 'Cosmetic Boxes');

// ---- the pack page: a banner opens it
await q(`document.querySelector('[data-k=tab-recommended]').click()`);
await tick();
await q(`document.querySelector('.ns .banner[data-pack="37"] .hit').click()`);
await tick(400);
assert.equal(await q(`document.querySelector('.ns .sa-title').textContent`), 'Cybernetic Revolution');
assert.deepEqual(await texts('.ns .page .bt.list'), ['Details & Odds', 'Card List5 cards', 'Missing Cards3 missing', 'Your PullsNone yet']);
assert.deepEqual(await texts('.ns .rar .t'), ['Ultra Rare', '0 / 1', 'Super Rare', '1 / 2', 'Rare', '1 / 1', 'Normal', '0 / 1']);
assert.equal(await q(`document.querySelectorAll('.ns .hero .readout').length`), 0);   // no Collected chip on the hero
assert.equal(await q(`document.querySelector('.ns .page .note').textContent`), '10 packs: a 60% chance of Cyber Dragon · 50 cards');
assert.deepEqual(await texts('.ns .page .fcap'), ['Cyber Dragon', 'Cyber End Dragon', 'Steamroid']);
assert.deepEqual(await texts('.ns .page .rf .own'), ['New', '×1', 'New']);
assert.equal(await q(`document.querySelectorAll('.ns .page .tag:not(.cy)').length`), 0);   // no availability promise
assert.doesNotMatch(await q(`document.querySelector('.ns').textContent`), /always (available|in the shop)/i);

// ---- the details sheet from a row: Missing Cards opens with "Missing" on; Esc closes it, the page stays
await q(`document.querySelector('[data-k=row-missing]').click()`);
await tick();
assert.equal(await q(`document.querySelector('.ns .sheet [data-k=miss]').getAttribute('aria-pressed')`), 'true');
assert.deepEqual(await texts('.ns .sheet .gc .nm'), ['Cyber Dragon', 'Steamroid', 'Jetroid']);
assert.deepEqual(await texts('.ns .sheet table.odds tr:first-child th'), ['Slot', 'N', 'R', 'SR', 'UR', 'At least one', '1 pack', '10 packs']);
await key('Escape');
await tick();
assert.equal(await q(`document.querySelectorAll('.ns .sheet').length`), 0);
assert.equal(await q(`!!document.querySelector('.ns .page')`), true);

// ---- buying ×1: the reveal, NEW on the first copies, the summary, the wallet refreshed, Done
await q(`document.querySelector('[data-k=buy1]').click()`);
await tick(500);
assert.deepEqual(await q(`calls.filter(c => c[0] === '/api/de/shop/buy' && c[1].itemId === 37).map(c => c[1])`), [{ itemId: 37, count: 1, requestId: 'tok-1' }]);
assert.equal(await q(`document.querySelector('.ns .rv').dataset.phase`), 'done');
assert.equal(await q(`document.querySelectorAll('.ns .rv .slot').length`), 5);
assert.deepEqual(await q(`[...document.querySelectorAll('.ns .rv .slot')].map(s => s.querySelector('.own')?.textContent || '')`), ['New', 'New', 'New', '', '']);
assert.equal(await q(`document.querySelector('.ns .rv .head[role=status]').textContent`), '3 new · UR 1 · SR 2 · R 1');
assert.equal(await q(`document.querySelector('.ns .wallet').querySelector('.v').textContent`), '4800 MP');
assert.equal(await q(`document.querySelector('.ns .rv [data-k=again]').textContent`), 'Buy 1 more pack ·200 MP');
await key('Escape');
await tick();
assert.equal(await q(`document.querySelectorAll('.ns .rv').length`), 0);

// ---- ×10 with a stale request id: the shop is asked again and the purchase sent once more, with the new id
await q(`VIEW.nextRequestId = 'tok-new'; document.querySelector('[data-k=buy10]').click()`);
await tick(600);
assert.deepEqual(await q(`calls.filter(c => c[0] === '/api/de/shop/buy' && c[1].itemId === 37).slice(1).map(c => c[1])`),
  [{ itemId: 37, count: 10, requestId: 'tok-2' }, { itemId: 37, count: 10, requestId: 'tok-new' }]);
assert.equal(await q(`document.querySelectorAll('.ns .rv .slot').length`), 50);
assert.equal(await q(`document.querySelector('.ns .rv .head .t').textContent`), '10 packs · 50 cards');
await q(`document.querySelector('.ns .rv [data-k=done]').click()`);
// a refused purchase: no reveal left, the reason said
await q(`buyFails.push('purchase-rejected'); document.querySelector('[data-k=buy1]').click()`);
await tick(400);
assert.equal(await q(`document.querySelectorAll('.ns .rv').length`), 0);
assert.match(await q(`document.querySelector('.ns [role=status][aria-live]').textContent`), /enough MP/);
// not enough for ten: Buy 10 off, the need said
await q(`VIEW.wallet.total = 500; shop.refresh()`);
await tick();
assert.equal(await q(`document.querySelector('[data-k=buy10]').disabled`), true);
assert.equal(await q(`document.querySelector('[data-k=buy1]').disabled`), false);

// ---- Esc on the page: back to the shop; Back there is the native Exit
await q(`document.querySelector('[data-k=buy1]').focus()`);
await key('Escape');
await tick();
assert.equal(await q(`!!document.querySelector('.ns .page')`), false);
assert.equal(await q(`document.querySelector('.ns .sa-title').textContent`), 'Card Shop');
// hidden while a native category is open; destroyed with the menu
await q(`shop.show(false)`);
assert.equal(await q(`document.querySelector('.ns').hidden`), true);
await q(`shop.destroy()`);
assert.equal(await q(`document.querySelectorAll('.ns').length`), 0);
assert.deepEqual(await q(`gameKeys`), []);

// ---- screens/shop.js over the category menu: mounted with it, hidden while no menu is shown, and the old (locked) menu the
// game keeps beside a new one after a category round trip doesn't hide it or take Back's click (live: Back did nothing)
await q(`(async () => {
  window.calls = []; VIEW.wallet.total = 5000;
  const menu = await (await realFetch('/htmlui/mock/shop-menu.json')).json();
  window.MENU = menu.windows.find(w => w.cls === 'CShopCategoryWindow');
  window.SH = (await import('/htmlui/screens/shop.js')).default;
  const host = document.getElementById('htmlui-host');
  const root = id => { const r = document.createElement('div'); r.className = 'win'; host.append(r); return r; };
  window.R = { a: root(), b: root() };
  window.ST = {};
  window.canvasEv = []; document.getElementById('canvas').addEventListener('mousedown', e => canvasEv.push(['down', e.clientX, e.clientY]));
  document.getElementById('canvas').addEventListener('mouseup', e => canvasEv.push(['up', e.clientX, e.clientY]));
  const api = {};
  window.upd = (k, id, shown) => { const w = { ...MENU, id, shown }; ST[k] ||= SH.mount(w, R[k], api); SH.update(w, null, R[k], api, ST[k]); };
})()`);
await q(`upd('a', 1, true)`);
await tick();
assert.equal(await q(`document.querySelectorAll('.ns').length`), 1);
assert.equal(await q(`document.querySelector('.ns').hidden`), false);
await q(`upd('a', 1, false)`);   // a category opened: the menu hidden
assert.equal(await q(`document.querySelector('.ns').hidden`), true);
await q(`upd('b', 2, true); upd('a', 1, false)`);   // back: a new menu shown, the old one still there, hidden
assert.equal(await q(`document.querySelector('.ns').hidden`), false);
await q(`document.querySelector('.ns .bt.nav').click()`);
await tick(1700);
assert.deepEqual(await q(`canvasEv`), [['down', 906, 566], ['up', 906, 566]]);   // the Exit swf's middle (1024 x 768 page, scale 1)
await q(`SH.unmount(R.a, ST.a)`);
assert.equal(await q(`document.querySelectorAll('.ns').length`), 1);   // the old menu gone: the shop stays with the new
await q(`SH.unmount(R.b, ST.b)`);
assert.equal(await q(`document.querySelectorAll('.ns').length`), 0);
if (b.logs.some(l => l.startsWith('exception'))) { console.log(b.logs.join('\n')); process.exitCode = 1; }
console.log('shop dom ok');
b.close();
process.exit(process.exitCode || 0);
