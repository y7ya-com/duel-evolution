// The Missions window's limited-time event (rewards/missions.js, model.js) in headless Chrome over a stubbed
// /api/de/rewards: the window opens on the Event tab while the event is unclaimed, its five tabs fit the column, the
// row pays shards (not MP), the NPCs still to beat are listed under it, the time left, and a claim pays shards (the MP
// wallet doesn't move, the toast says shards). SHOTS=<dir>: PNGs of the tab in progress and claimed (BG=<png>: under them).
//   node client/web-shell/htmlui/rewards/event_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 34000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ profile: process.env.HOME + '/.cache/de-scratch/rewardsui/test-event-' + process.pid, port: 9870 + process.pid % 30, dpr: process.env.SHOTS ? 2 : 1 });
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS, BG = process.env.BG ? 'data:image/png;base64,' + readFileSync(process.env.BG).toString('base64') : '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async name => { if (SHOTS) writeFileSync(path.join(SHOTS, name + '.png'), await b.shot()); };
const until = async (js, ms = 4000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js); };
const q = (sel, f = 'textContent') => b.ev(`document.querySelector(${JSON.stringify(sel)})?.${f}`);

const NPCS = ['Yami Yugi', 'Seto Kaiba', 'Tea Gardner', 'Jaden Yuki', 'Chazz Princeton', 'Alexis Rhodes', 'Joey Wheeler', 'Jesse Andersen',
  'Yami Marik', 'Hell Kaiser', 'Yami Bakura', 'Aster Phoenix', 'missbomb', 'Miss Shadow', 'Robert', 'gouk', 'Reia', 'kanna', 'bankara', 'Miss Scout',
  'frogMaster', 'BeeBee', 'kyoko', 'Sakura', 'NiaNia', 'Brow', 'Abigail', 'A-lien', 'Kain', 'raMon', 'dancer', 'lalala', 'AoJ', 'Zuno', 'Queen Ryo', 'sabasaba'];
const ends = new Date(Date.now() + (13 * 24 + 5) * 3600e3 + 60e3).toISOString();
const ev = (progress, left) => ({ id: 'event:npc-sweep-2026-11', label: 'Beat all 36 NPCs on the map', event: 'npc', kind: 'event', target: 36, progress,
  mp: 0, shards: 24000, ends, claimed: false, claimable: progress >= 36, ...(left ? { left } : {}) });
const VIEW = {
  wallet: { total: 6040, bound: 5000, earned: 1040 }, shards: 500, day: '2026-11-11', week: '2026-11-09', stockpileCap: 9, nextRequestId: 'r1',
  login: { day: '2026-11-11', count: 2, streak: 2, cycleDay: 2, calendar: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, mp: 40 })) },
  missions: [ev(5, NPCS.slice(5)), { id: 'daily:a', label: 'Play a rewarded duel', event: 'play', target: 1, progress: 0, mp: 80, kind: 'daily', claimed: false, claimable: false }],
};
const load = async (view) => b.ev(`(async () => {
  document.body.innerHTML = '<div id="canvas" style="position:absolute;left:0;top:0;width:1024px;height:768px;background:#345 0 0/1024px 768px ${BG ? `url(${BG})` : ''}"></div>';
  window.Module = { yo2Lazy: { files: new Map(), files2: { has: () => false }, entry: async () => null } };
  let view = ${JSON.stringify(view)};
  window.__calls = [];
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  window.fetch = async (url, o = {}) => {
    const body = o.body ? JSON.parse(o.body) : null;
    __calls.push({ url: String(url), body });
    if (String(url).includes('/cosmetics')) return reply(200, { wallet: view.wallet });
    if (!body) return reply(200, view);
    const mm = view.missions.find(x => x.id === body.id);
    if (!mm || !mm.claimable || body.requestId !== view.nextRequestId) return reply(409, { error: 'not-claimable' });
    mm.claimed = true; mm.claimable = false; delete mm.left;
    view = { ...view, shards: view.shards + mm.shards, nextRequestId: 'r2' };
    return reply(200, { ...view, grant: { id: mm.id, mp: 0, shards: mm.shards }, replayed: false });
  };
  (await import('/htmlui/rewards/api.js'))._reset?.();
  const { openMissions } = await import('/htmlui/rewards/missions.js');
  openMissions();
})()`);

// in progress: the window opens on Event (nothing to claim elsewhere), five tabs inside the column
await load(VIEW);
await until(`document.querySelector('.de-rw [data-tab=event]')?.getAttribute('aria-selected') === 'true'`).catch(async (e) => { console.log('DBG', await b.ev(`[document.querySelector('.de-rw') ? 'open' : 'closed', [...document.querySelectorAll('.de-rw .rw-tab')].map(t => t.dataset.tab + ':' + t.getAttribute('aria-selected')).join(' '), document.querySelector('.de-rw .rw-meta')?.textContent].join(' / ')`), b.logs.slice(-8)); throw e; });
assert.deepEqual(await b.ev(`[...document.querySelectorAll('.de-rw .rw-tab .lb')].map(e => e.textContent)`), ['Event', 'Daily', 'Weekly', 'First Steps', 'Achievements']);
assert.deepEqual(await b.ev(`(() => { const c = document.querySelector('.de-rw .rw-tabs').getBoundingClientRect();
  return [...document.querySelectorAll('.de-rw .rw-tab')].filter(t => { const r = t.getBoundingClientRect(), l = t.querySelector('.lb').getBoundingClientRect();
    return r.right > c.right + 1 || l.width > r.width - 8; }).map(t => t.dataset.tab); })()`), [], 'every tab and its label inside the strip');
assert.equal(await q('.de-rw .rw-strip .a'), '5 of 36 NPCs beaten');
assert.equal(await q('.de-rw .rw-strip .b'), 'Ends in 13d 5h');
assert.equal(await q('.de-rw .rw-row .nm'), 'Beat all 36 NPCs on the map');
assert.equal(await q('.de-rw .rw-row .ct'), '5/36');
assert.equal(await q('.de-rw .rw-row .mp .lb'), 'Shards');
assert.equal(await q('.de-rw .rw-row .mp .sa-num', 'getAttribute("aria-label")'), '24000');
assert.equal(await q('.de-rw .rw-left .t'), 'Still to beat (31)');
assert.match(await q('.de-rw .rw-left .s'), /^Alexis Rhodes\u00a0· Joey Wheeler\u00a0· .*\u00a0· sabasaba$/);
await sleep(300);
await shot('event-open');

// complete: Claim pays shards; the MP wallet stays, the toast says shards
VIEW.missions[0] = ev(36);
await b.ev(`document.querySelector('.de-rw .rw-close').click()`);
await load(VIEW);
await until(`!!document.querySelector('.de-rw .rw-row[data-state=claimable] .rw-claim')`);
assert.equal(await q('.de-rw [data-tab=event] .rw-dot'), '1');
assert.equal(await q('.de-rw .rw-claim', 'getAttribute("aria-label")'), 'Claim 24,000 shards: Beat all 36 NPCs on the map');
await b.ev(`document.querySelector('.de-rw .rw-claim').click()`);
await until(`/Claimed: Beat all 36 NPCs on the map\\. \\+24,000 shards$/.test(document.querySelector('.de-rw .rw-toast')?.textContent || '')`);
assert.equal(await b.ev(`!!document.querySelector('.de-rw .rw-fly')`), false, 'no MP flies to the wallet');
assert.equal(await q('.de-rw .rw-wallet > .v', 'textContent.replace(/\\s+/g, "")'), '6040MP');
assert.equal(await q('.de-rw .rw-strip .a'), 'Event reward claimed');
assert.equal(await q('.de-rw .rw-strip .b'), '24,000 shards are in your wallet');
assert.equal(await b.ev(`document.querySelector('.de-rw .rw-row').dataset.state`), 'done');
assert.equal(await b.ev(`!!document.querySelector('.de-rw .rw-left')`), false);
await sleep(300);
await shot('event-claimed');
assert.deepEqual(b.logs.filter(l => /^(error|exception)/.test(l)), []);
console.log('rewards event_dom_test: ok');
b.close(); process.exit(0);
