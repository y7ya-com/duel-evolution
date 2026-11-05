// The shop's tags and badges ("Featured", "Leaving in 3 days", "Unlocked · 23h left", the clock tag, "Booster Pack", Purchased)
// are the topmost element at their centre and at the corners and ends on the home banners, the Recommended hero and the pack page hero: the pack art, the
// featured cards and the carousel never cover them (document.elementFromPoint, in headless Chrome as shop_dom_test.mjs).
// The banners' decoration is pointer-events: none, which elementFromPoint skips, so it is switched on for the probe.
// TAG_SHOTS=<dir>: a crop of every banner / hero.
//   node client/web-shell/htmlui/shop/tags_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
import { VIEW, PACK } from './model_test.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 21000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ port: 9750 + process.pid % 40, profile: process.env.HOME + '/.cache/de-scratch/shopA/tags-chrome-' + process.pid });
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
const FEAT = [{ name: 'Cyber Dragon', rarity: 'UR', internalId: 5 }, { name: 'Cyber End Dragon', rarity: 'SR', internalId: 6 }, { name: 'Steamroid', rarity: 'R', internalId: 7 }];
const topmost = async (where) => {
  await q(`(() => { const s = document.createElement('style'); s.id = 'probe'; s.textContent = '.ns *:not(.hit) { pointer-events: auto !important }'; document.head.append(s); })()`);
  const bad = await q(`(() => { const out = [], n = []; for (const t of document.querySelectorAll('.ns .tag')) {
    t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); n.push(t.textContent);
    // the centre and a point near each end (the polygon's slanted right edge starts 8 px in): a card or a pack can sit over an end
    for (const x of [r.left + 6, r.left + r.width / 2, r.right - 12]) for (const y of [r.top + 3, r.top + r.height / 2, r.bottom - 3]) {
      const top = document.elementFromPoint(x, y);
      if (!(top === t || t.contains(top))) out.push(t.textContent + ' @' + Math.round(x - r.left) + ',' + Math.round(y - r.top) + ' <- ' + (top && (top.className || top.tagName)));
    }
  } return { n: n.length, out }; })()`);
  if (process.env.TAG_SHOTS) {
    mkdirSync(process.env.TAG_SHOTS, { recursive: true });
    const boxes = await q(`[...document.querySelectorAll('.ns .banner, .ns .hero')].map(e => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })`);
    for (const [i, c] of boxes.entries()) { await q(`document.querySelectorAll('.ns .banner, .ns .hero')[${i}].scrollIntoView({ block: 'nearest' })`); writeFileSync(`${process.env.TAG_SHOTS}/${where}-${i}.png`, await b.shot({ x: c.x, y: Math.max(0, c.y), width: c.width, height: Math.min(c.height, 768 - Math.max(0, c.y)) })); }
  }
  await q(`document.getElementById('probe').remove()`);
  assert.ok(bad.n > 0, where + ': tags to check');
  assert.deepEqual(bad.out, [], where + ': a tag is covered');
};

// every kind of tag: Featured (the hero and a half banner), Leaving in 3 days, New this update, Unlocked, the clock tags, a deck
const iso = n => new Date(Date.now() + n * 86400e3).toISOString();
await q(`(() => { const by = p => VIEW.items.find(i => i.param === p);
  by(45).rotation = { group: 'update', highlighted: true, endsAt: ${JSON.stringify(iso(5))} }; by(45).featured = ${JSON.stringify(FEAT)}; by(45).title = 'Hero Pack With A Longer Title';
  by(43).rotation = { group: 'always', highlighted: true, endsAt: ${JSON.stringify(iso(2))} }; by(43).featured = ${JSON.stringify(FEAT.slice(0, 2))};
  by(41).rotation = { group: 'leaving', endsAt: ${JSON.stringify(iso(3))} }; by(41).featured = ${JSON.stringify(FEAT)};
  by(37).rotation = { group: 'update', endsAt: ${JSON.stringify(iso(9))} }; by(37).featured = ${JSON.stringify(FEAT)};
  VIEW.unlocked = { 41: Math.floor(Date.now() / 1000) + 23.5 * 3600 }; shop.refresh(); })()`);
await tick(400);
const tab = async id => { await q(`document.querySelector('[data-k=tab-${id}]').click()`); await tick(300); };
await topmost('home');
await tab('packs'); await topmost('packs');
await tab('decks'); await topmost('decks');
await tab('packs');
await q(`document.querySelector('.ns .banner[data-pack="37"] .hit').click()`);
await tick(400);
await topmost('page');
console.log('tags ok');
b.close(); process.exit(0);
