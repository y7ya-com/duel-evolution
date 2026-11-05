// The Missions window (rewards/missions.js) in headless Chrome over a stubbed /api/de/rewards: the tab it opens on, the
// tabs' counts and strips, the rows' states, a claim (the request id, the wallet counting up, the toast), Claim all (one
// claim after another, each with the id the last returned), an error's friendly toast, the login calendar, Esc closes
// and no key reaches the game. SHOTS=<dir>: PNGs of each tab, the claim and the error (BG=<png>: under them).
//   node client/web-shell/htmlui/rewards/missions_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 33000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ profile: process.env.HOME + '/.cache/de-scratch/rewardsui/test-missions-' + process.pid, port: 9830 + process.pid % 30, dpr: process.env.SHOTS ? 2 : 1 });
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS, BG = process.env.BG ? 'data:image/png;base64,' + readFileSync(process.env.BG).toString('base64') : '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async name => { if (SHOTS) writeFileSync(path.join(SHOTS, name + '.png'), await b.shot()); };
const until = async (js, ms = 4000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js); };
const q = (sel, f = 'textContent') => b.ev(`document.querySelector(${JSON.stringify(sel)})?.${f}`);

const cal = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, mp: [10, 20].includes(i + 1) ? 100 : 40 }));
const m = (id, kind, label, progress, target, mp, claimed = false) => ({ id, label, event: 'play', target, progress, mp, kind, claimed, claimable: !claimed && progress >= target });
const VIEW = {
  wallet: { total: 6040, bound: 5000, earned: 1040 }, day: '2026-11-05', week: '2026-11-02', stockpileCap: 9, nextRequestId: 'r1',
  login: { day: '2026-11-05', count: 12, streak: 3, cycleDay: 12, calendar: cal },
  missions: [
    m('daily:a', 'daily', 'Play a rewarded duel', 1, 1, 80), m('daily:b', 'daily', 'Play 2 rewarded duels', 2, 2, 80), m('daily:c', 'daily', 'Win a rewarded duel', 0, 1, 80),
    m('weekly:a', 'weekly', 'Play 4 rewarded duels', 2, 4, 600), m('weekly:b', 'weekly', 'Win 4 rewarded duels', 1, 4, 600), m('weekly:c', 'weekly', 'Play on 2 UTC days', 1, 2, 600),
    m('first:shop', 'first', 'Visit the shop', 1, 1, 1000, true), m('first:deck', 'first', 'Save a playable owned deck', 1, 1, 2000),
    m('first:packs', 'first', 'Open 5 packs', 2, 5, 2000), m('first:duel1', 'first', 'Finish your first rewarded duel', 0, 1, 2000),
    m('lifetime:play50', 'lifetime', 'Finish 50 rewarded duels', 7, 50, 500), m('lifetime:npc25', 'lifetime', 'Finish 25 rewarded NPC duels', 25, 25, 500),
  ],
};
await b.ev(`(async () => {
  document.body.innerHTML = '<div id="canvas" style="position:absolute;left:0;top:0;width:1024px;height:768px;background:#345 0 0/1024px 768px ${BG ? `url(${BG})` : ''}"></div>';
  window.__gameKeys = 0; addEventListener('keydown', () => __gameKeys++);
  window.Module = { yo2Lazy: { files: new Map(), files2: { has: () => false }, entry: async () => null } };
  // the server: the view, claims spending the request id and paying the mission (or the queued failure)
  let view = ${JSON.stringify(VIEW)}, n = 1;
  window.__calls = []; window.__fail = null;
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  window.fetch = async (url, o = {}) => {
    const body = o.body ? JSON.parse(o.body) : null;
    __calls.push({ url: String(url), body });
    if (String(url).includes('/cosmetics')) return reply(200, { wallet: view.wallet });
    if (!body) return reply(200, view);
    await new Promise(r => setTimeout(r, 60));
    if (__fail) { const f = __fail; __fail = null; return reply(409, { error: f }); }
    if (body.requestId !== view.nextRequestId) return reply(409, { error: 'stale-request' });
    const mm = view.missions.find(x => x.id === body.id);
    if (!mm || !mm.claimable) return reply(409, { error: 'not-claimable' });
    mm.claimed = true; mm.claimable = false;
    view = { ...view, wallet: { ...view.wallet, total: view.wallet.total + mm.mp, earned: view.wallet.earned + mm.mp }, nextRequestId: 'r' + (++n) };
    return reply(200, { ...view, grant: { id: mm.id, mp: mm.mp }, replayed: false });
  };
  const { openMissions, isMissionsOpen } = await import('/htmlui/rewards/missions.js');
  window.__open = openMissions; window.__isOpen = isMissionsOpen;
  openMissions();
})()`);

// opens on the first tab with something to claim (Daily), its rows claimable first
await until(`document.querySelectorAll('.de-rw .rw-row').length === 3`);
assert.equal(await q('.de-rw .sa-title'), 'Missions');
assert.equal(await q('.de-rw [data-tab=daily]', 'getAttribute("aria-selected")'), 'true');
assert.deepEqual(await b.ev(`[...document.querySelectorAll('.de-rw .rw-tab .rw-dot')].map(d => d.hidden ? 0 : +d.textContent)`), [2, 0, 1, 1]);
assert.deepEqual(await b.ev(`[...document.querySelectorAll('.de-rw .rw-row')].map(r => r.dataset.state)`), ['claimable', 'claimable', 'open']);
assert.equal(await q('.de-rw .rw-row[data-state=open] .ct'), '0/1');
assert.match(await q('.de-rw .rw-strip .a'), /^3 of 9 held$/);
assert.match(await q('.de-rw .rw-strip .b'), /^New missions in \d+h \d+m$|^New missions in \d+m$/);
assert.equal(await q('.de-rw .rw-all span'), 'Claim all (2)');
assert.equal(await q('.de-rw .rw-meta'), '4 rewards ready to claim');
// the wallet readout and the calendar: 12 received, today the 12th, the 10th and 20th milestones
assert.equal(await q('.de-rw .rw-wallet', 'getAttribute("aria-label")'), 'Your MP');
assert.equal(await b.ev(`document.querySelectorAll('.de-rw .rw-day[data-got]').length`), 12);
assert.equal(await q('.de-rw .rw-day[data-today] .d'), '12');
assert.deepEqual(await b.ev(`[...document.querySelectorAll('.de-rw .rw-day[data-milestone] .d')].map(e => +e.textContent)`), [10, 20]);
assert.match(await q('.de-rw .rw-next'), /Day 20 bonus100 MP in 8 logins/);
// every visible element inside the 904x576 window
assert.deepEqual(await b.ev(`(() => { const w = document.querySelector('.rw-win').getBoundingClientRect();
  return [...document.querySelectorAll('.rw-win *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < w.left - 1 || r.right > w.right + 1 || r.top < w.top - 12 || r.bottom > w.bottom + 1); }).map(e => e.className); })()`), []);
await sleep(300);
await shot('missions-daily');

// one claim: the view's id, the wallet counts up, the toast, the row claimed and sorted last
await b.ev(`document.querySelector('.de-rw .rw-row[data-id="daily:a"] .rw-claim').click()`);
await until(`!!document.querySelector('.de-rw .rw-fly')`);
await shot('missions-claim-fly');
await until(`!document.querySelector('.de-rw .rw-fly')`, 3000);
await sleep(700);
assert.deepEqual(await b.ev(`__calls.filter(c => c.body).map(c => c.body)`), [{ id: 'daily:a', requestId: 'r1' }]);
assert.equal(await q('.de-rw .rw-toast', 'hidden'), false);
assert.match(await q('.de-rw .rw-toast'), /Claimed: Play a rewarded duel\. \+80 MP/);
assert.equal(await q('.de-rw .rw-wallet > .v', 'textContent.replace(/\\s+/g, "")'), '6120MP');
assert.equal(await q('.de-rw .rw-wallet .mpi-tip'), '6,120 MP total · 5,000 MP is starter MP: it buys card packs but not cosmetic boxes.');
assert.deepEqual(await b.ev(`[...document.querySelectorAll('.de-rw .rw-row')].map(r => r.dataset.id + ':' + r.dataset.state)`),
  ['daily:b:claimable', 'daily:c:open', 'daily:a:done']);
assert.equal(await q('.de-rw [data-tab=daily] .rw-dot'), '1');
assert.ok(await b.ev(`__calls.some(c => c.url.endsWith('/api/de/cosmetics'))`) === false, 'the box shop not asked: it never read');
await shot('missions-claimed');

// an error: the friendly text in a red toast, nothing claimed
await b.ev(`__fail = 'busy'; document.querySelector('.de-rw .rw-row[data-id="daily:b"] .rw-claim').click()`);
await until(`document.querySelector('.de-rw .rw-toast')?.dataset.tone === 'error'`);
assert.match(await q('.de-rw .rw-toast'), /during a duel or a trade/);
assert.equal(await b.ev(`document.querySelector('.de-rw .rw-row[data-id="daily:b"]').dataset.state`), 'claimable');
await shot('missions-error');

// the other tabs: Weekly's reset, First Steps' overall bar, Achievements; arrow keys move along the tab strip
await b.ev(`document.querySelector('.de-rw [data-tab=weekly]').click()`);
assert.match(await q('.de-rw .rw-strip .b'), /^Resets in \d+d \d+h$|^Resets in \d+h \d+m$/);
assert.equal(await q('.de-rw .rw-all', 'disabled'), true);
await shot('missions-weekly');
await b.ev(`document.querySelector('.de-rw [data-tab=weekly]').focus()`);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await until(`document.querySelector('.de-rw [data-tab=first]').getAttribute('aria-selected') === 'true'`);
assert.equal(await q('.de-rw .rw-strip .a'), '1 of 4 complete');
assert.equal(await q('.de-rw .rw-strip .rw-bar', 'getAttribute("aria-valuenow")'), '14');
await shot('missions-first');

// Claim all on Achievements (one) then on Daily: each claim with the id the last one returned
await b.ev(`document.querySelector('.de-rw [data-tab=lifetime]').click()`);
await b.ev(`document.querySelector('.de-rw .rw-all').click()`);
await until(`/Claimed 1 reward\\. \\+500 MP/.test(document.querySelector('.de-rw .rw-toast').textContent)`);
await shot('missions-lifetime');
await b.ev(`document.querySelector('.de-rw [data-tab=first]').click()`);
await b.ev(`document.querySelector('.de-rw .rw-all').click()`);
await until(`/Claimed 1 reward\\. \\+2,000 MP/.test(document.querySelector('.de-rw .rw-toast').textContent)`);
assert.deepEqual(await b.ev(`__calls.filter(c => c.body).map(c => c.body.id + '@' + c.body.requestId)`),
  ['daily:a@r1', 'daily:b@r2', 'lifetime:npc25@r2', 'first:deck@r3']);
assert.equal(await q('.de-rw .rw-meta'), '1 reward ready to claim');

// keys stay in the window; Esc closes it
await sleep(1200);
const keys = await b.ev('__gameKeys');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', text: 'a' });
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await until(`!document.querySelector('.de-rw')`);
assert.equal(await b.ev('__gameKeys'), keys, 'no key reached the game');
assert.equal(await b.ev('__isOpen()'), false);

// switched off on the server: the window says so, no retry button
await b.ev(`(async () => { window.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'rewards-disabled' }) });
  (await import('/htmlui/rewards/api.js'))._reset(); __open(); })()`);
await until(`!!document.querySelector('.de-rw .rw-empty')`);
assert.match(await q('.de-rw .rw-empty'), /switched off/);
assert.equal(await b.ev(`!!document.querySelector('.de-rw .rw-empty .sa-pill')`), false);
await b.ev(`document.querySelector('.de-rw .rw-close').click()`);
assert.deepEqual(b.logs.filter(l => /^(error|exception)/.test(l)), []);
console.log('rewards missions_dom_test: ok');
b.close(); process.exit(0);
