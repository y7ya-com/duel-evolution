// Card Swap's cosmetics (cosmetics/trade-cosmetics.js) in headless Chrome: the overlay driven frame by frame as
// bridge.js drives it (tradeOverlayFrame with snapshots shaped like the reader's), fetch answered by a small
// server-shaped trade (server/src/game/trade.ts cosmeticsView). Checks: nothing outside Card Swap's trade window, the
// capability once it is up, the strips (rarity frame, digit counts, place on the grid), the partner's change
// (brackets, the band), the picker (spares, + / −, the saved request, the draft, Esc, keys kept from the game), the
// trade question's hole, a reset of both confirmations, a lock, a refusal (the partner's old game), the end, the window
// gone (capability off), alignment.
//   node client/web-shell/htmlui/cosmetics/trade-cosmetics_dom_test.mjs   [SHOTS=<dir>: a PNG per state; BG=<png>: under it]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 31000 + process.pid % 9000;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({ port: 9750 + process.pid % 40, dpr: process.env.SHOTS ? 2 : 1 });   // off the tools' and the other DOM tests' ports
await b.go(`http://127.0.0.1:${PORT}/htmlui/skin.html`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS, BG = process.env.BG ? 'data:image/png;base64,' + readFileSync(process.env.BG).toString('base64') : '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async name => { if (SHOTS) writeFileSync(path.join(SHOTS, name + '.png'), await b.shot()); };

const item = (id, name, rarity, kind = 'outfit') => ({ id, name, rarity, kind, slot: kind === 'dueldisk' ? 8 : 6, bodies: ['male', 'female'],
  variants: [{ gender: 'male', bit: 0x77, number: 0x77, worlds: [0] }, { gender: 'female', bit: 0x174, number: 0x74, worlds: [0] }] });
const SUIT = item('outfit:black-suit', 'Black Suit', 'rare'), JADEN = item('outfit:jaden', "Jaden's Costume", 'common'),
  GOLD = item('dueldisk:3417', 'Battle City Alpha Gold', 'ultra', 'dueldisk'), KAIBA = item('outfit:kaiba', "Kaiba's Coat", 'super');

await b.ev(`(async () => {
  document.body.innerHTML = '<div id="canvas" style="position:absolute;left:0;top:0;width:1024px;height:768px;background:#345 0 0/1024px 768px ${BG ? `url(${BG})` : ''}"></div>';
  window.__ups = 0; document.getElementById('canvas').addEventListener('mouseup', () => __ups++);
  // the trade, server-side: both sides' lines, my spares, the lamps, the question, who changed what
  window.__s = { trading: true, rev: 0, partner: { pid: 7, name: 'Rival' }, panel: { me: false, partner: true }, ready: { me: false, partner: false },
    asked: false, confirmed: { me: false, partner: false }, locked: null, changed: null, maxLines: 6, body: 'male',
    mine: [], theirs: [], spares: [{ ...${JSON.stringify(SUIT)}, copies: 2 }, { ...${JSON.stringify(JADEN)}, copies: 1 }, { ...${JSON.stringify(KAIBA)}, copies: 3 }] };
  window.__calls = []; window.__refuse = null; window.__gameKeys = 0;
  addEventListener('keydown', () => __gameKeys++);
  const spare = id => __s.spares.find(s => s.id === id);
  window.fetch = async (u, o) => {
    u = String(u).replace(/^.*\\/api\\/de/, ''); const body = o?.body ? JSON.parse(o.body) : null; __calls.push([o?.method || 'GET', u, body]);
    const ok = v => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(v)) });
    if (u === '/trade/cosmetics/panel') { __s.panel.me = body.on; return ok(__s); }
    if (u === '/trade/cosmetics' && body) {
      if (__refuse) return { ok: false, status: 409, json: async () => __refuse };
      __s.mine = body.give.map(l => ({ ...l, item: spare(l.id) })); __s.rev++; __s.changed = { rev: __s.rev, by: 'me', reset: false };
      return ok({ ...__s, replay: false });
    }
    return ok(__s);
  };
  window.Module = { yo2Lazy: { files: new Map(), files2: { has: () => false }, entry: async () => null } };
  const { tradeOverlayFrame, _panel } = await import('/htmlui/cosmetics/trade-cosmetics.js');
  window.__panel = _panel;
  // the reader's windows (z: each window 50 above the one before it); the bridge's frames, every 30 ms
  const W = (cls, x, y, w, h, z, extra = {}) => ({ cls, x, y, w, h, z, shown: true, controls: [], ...extra });
  window.__snap = { scene: 0x26, windows: [W('CWindowModelTrade', 248, 0, 488, 608, 100), W('CWindowTaskCardArea', 248, 0, 488, 288, 150, { mode: 2 }),
    W('CWindowTaskCardArea', 248, 320, 488, 288, 150, { mode: 1 }), W('CWindowModelKaban', 736, 0, 288, 608, 200), W('CChatWindow', 248, 608, 776, 128, 250)] };
  setInterval(() => tradeOverlayFrame(__snap, false), 30);
})()`);
const until = async (js, ms = 5000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(50)) if (await b.ev(js)) return true; throw new Error('timed out: ' + js); };
const ev = js => b.ev(js);
const calls = async (filter = '') => (await ev('__calls')).filter(([m, u]) => (m + ' ' + u).includes(filter));
const aligned = async (label, screen) => {
  const r = await ev(`import('/htmlui/cosmetics/align.js').then(m => m.checkAlign())`);
  assert.equal(r.screen, screen, label);
  const bad = r.checks.filter(c => !c.ok);
  assert.deepEqual(bad, [], label + ': ' + JSON.stringify(bad));
  return r.checks.length;
};

// not Card Swap (TP: scene 0x28, the same window classes): nothing
await ev(`__snap.scene = 0x28`);
await sleep(300);
assert.deepEqual([await calls('panel'), await ev(`document.querySelectorAll('.de-tc').length`)], [[], 0], 'nothing outside Card Swap');
// Card Swap's trade window: the overlay, the capability, then the polls
await ev(`__snap.scene = 0x26`);
await until(`__calls.some(c => c[1] === '/trade/cosmetics/panel' && c[2].on === true)`);
await until(`__calls.filter(c => c[0] === 'GET').length >= 1`, 3000);
assert.deepEqual(await ev(`[...document.querySelectorAll('.de-tc')].map(l => l.dataset.side + ':' + l.parentNode.style.left + ',' + l.parentNode.style.top)`),
  ['trade:248px,0px', 'partner:248px,0px', 'mine:248px,320px'], 'each group at its window\'s origin');
assert.equal(await ev(`document.querySelector('.tc-band').textContent`), 'Cosmetics can be traded too: press Cosmetics to add your spares.');
assert.equal(await ev(`document.querySelector('.tc-btn').textContent + document.querySelector('.tc-btn').disabled`), 'Cosmeticsfalse');
await shot('01-empty');

// the partner adds two lines: its tiles under its cards, the brackets on what changed, the band says so
await ev(`__s.theirs = [{ id: '${GOLD.id}', count: 1, item: ${JSON.stringify(GOLD)} }, { id: '${JADEN.id}', count: 2, item: ${JSON.stringify(JADEN)} }];
  __s.rev++; __s.changed = { rev: __s.rev, by: 'partner', reset: false };`);
await until(`document.querySelectorAll('[data-side=partner] .tc-tile').length === 2`, 3000);
const ptiles = await ev(`[...document.querySelectorAll('[data-side=partner] .tc-tile')].map(e => [e.dataset.id, e.querySelector('.de-rf').dataset.rarity, e.dataset.count,
  !!e.querySelector('.sa-brackets'), !!e.querySelector('.sa-num'), e.getBoundingClientRect().left, e.getBoundingClientRect().top])`);
assert.deepEqual(ptiles, [[GOLD.id, 'ultra', '1', true, true, 264, 222], [JADEN.id, 'common', '2', true, true, 316, 222]]);
assert.equal(await ev(`document.querySelector('.tc-band').textContent`), 'Your partner changed their cosmetics: check them.');
assert.equal(await ev(`document.querySelector('.tc-band').hasAttribute('data-hi')`), true, 'a light plate for the change');
assert.equal(await ev(`document.querySelector('[data-side=partner] .tc-tile').title`), 'Battle City Alpha Gold');
await aligned('the strips', 'trade');
await shot('02-partner-added');

// the picker: my spares over the trunk column, + twice on the suit, + on Kaiba's coat: one request with the last state
await ev(`document.querySelector('.tc-btn').click()`);
await until(`document.querySelectorAll('.de-tcp .tcp-row').length === 3`);
assert.equal(await ev(`document.querySelector('.tc-btn').textContent`), 'Done');
assert.deepEqual(await ev(`[...document.querySelectorAll('.tcp-row')].map(r => [r.dataset.id, r.querySelector('.sp').textContent, r.querySelector('.de-rf').dataset.rarity])`),
  [[SUIT.id, '×2 spare', 'rare'], [JADEN.id, '×1 spare', 'common'], [KAIBA.id, '×3 spare', 'super']]);
const r = await ev(`(() => { const w = document.querySelector('.tcp-win').getBoundingClientRect(); return [w.left, w.top, w.width, w.height]; })()`);
assert.deepEqual(r, [736, 0, 288, 608], 'over the trunk column');
await aligned('the picker', 'trade-picker');
const before = (await calls('POST /trade/cosmetics')).filter(c => c[1] === '/trade/cosmetics').length;
await ev(`const p = id => document.querySelector('[data-id="' + id + '"] .plus');
  p('${SUIT.id}').click(); p('${SUIT.id}').click(); p('${SUIT.id}').click(); p('${KAIBA.id}').click();`);
assert.equal(await ev(`document.querySelector('[data-id="${SUIT.id}"] .plus').disabled`), true, 'no more than the 2 spares');
assert.equal(await ev(`document.querySelectorAll('[data-side=mine] .tc-tile').length`), 2, 'the draft shows at once');
await until(`__s.mine.length === 2`, 3000);
const sets = (await calls('POST /trade/cosmetics')).filter(c => c[1] === '/trade/cosmetics');
assert.equal(sets.length - before, 1, 'one request for the four presses');
assert.deepEqual(sets.at(-1)[2], { give: [{ id: SUIT.id, count: 2 }, { id: KAIBA.id, count: 1 }] });
assert.ok(await ev(`document.querySelector('[data-id="${SUIT.id}"].tcp-row').hasAttribute('data-on')`), 'the cyan row: in my offer');
await until(`document.querySelector('.tcp-foot').textContent === '2 of 6 items in your offer'`);
// keys: Esc closes the picker, none reaches the game
const keys = await ev('__gameKeys');
await ev(`document.querySelector('[data-id="${KAIBA.id}"] .plus').focus()`);
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', text: 'a' });
assert.equal(await ev('__gameKeys'), keys, 'a key in the picker is not the game\'s');
await shot('03-picker');
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await until(`!document.querySelector('.de-tcp')`);
// a card released over the Cosmetics button still ends the game's press
const ups = await ev('__ups');
await ev(`document.querySelector('.tc-btn').dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 650, clientY: 520 }))`);
assert.equal(await ev('__ups'), ups + 1, 'the mouseup reaches the canvas');
assert.equal(await ev(`getComputedStyle(document.querySelector('.tc-tile')).pointerEvents`), 'none', 'tiles take no pointer');
const mt = await ev(`[...document.querySelectorAll('[data-side=mine] .tc-tile')].map(e => [e.dataset.id, e.dataset.count, e.getBoundingClientRect().left, e.getBoundingClientRect().top])`);
assert.deepEqual(mt, [[SUIT.id, '2', 264, 500], [KAIBA.id, '1', 316, 500]]);
assert.equal(await ev(`document.querySelector('.tc-btn').textContent`), 'Change');
await aligned('both strips', 'trade');
await shot('04-both-sides');

// a change at the question: both confirmations reset (the server says so), the band's cyan plate
await ev(`__s.asked = false; __s.ready = { me: false, partner: false }; __s.theirs = [{ id: '${GOLD.id}', count: 2, item: ${JSON.stringify(GOLD)} }];
  __s.rev++; __s.changed = { rev: __s.rev, by: 'partner', reset: true };`);
await until(`document.querySelector('.tc-band').dataset.tone === 'reset'`, 3000);
assert.equal(await ev(`document.querySelector('.tc-band').textContent`), 'Cosmetics changed: both confirmations were reset.');
assert.ok(await ev(`document.querySelector('.tc-band').hasAttribute('data-on')`));
assert.equal(await ev(`document.querySelectorAll('[data-side=partner] .tc-tile').length`), 1);
assert.ok(await ev(`!!document.querySelector('[data-side=partner] .tc-tile[data-count="2"] .sa-brackets')`), 'the changed line marked');
await shot('05-reset');

// the trade question (a window in front): a hole in the overlay where it is, gone with it
await ev(`__snap.windows.push({ cls: 'CWindowModelDialogYesNo', x: 312, y: 280, w: 400, h: 200, z: 400, shown: true, controls: [] })`);
await until(`/M ?312 280 ?h ?400 ?v ?200/.test(document.querySelector('.de-tcs').style.clipPath)`, 2000).catch(async e => {
  console.error('clip-path:', await ev(`document.querySelector('.de-tcs').style.clipPath`)); throw e; });
await ev(`__snap.windows.pop()`);
await until(`['', 'none'].includes(document.querySelector('.de-tcs').style.clipPath)`, 2000);
// the trunk put away (the question): the wells run on to 1016, the right group and the button with their right edge
await ev(`__snap.windows.filter(w => w.cls === 'CWindowTaskCardArea').forEach(w => { w.drawn = { x: 256, y: w.y + 40, w: 760, h: 240 }; })`);
await until(`document.querySelector('.tc-btn').style.left === '650px'`, 2000);
assert.equal(await ev(`document.querySelector('[data-side=partner]').dataset.w`), '776');
await aligned('the strips, the trunk away', 'trade');
await ev(`__snap.windows.filter(w => w.cls === 'CWindowTaskCardArea').forEach(w => { w.drawn = { x: 256, y: w.y + 40, w: 472, h: 240 }; })`);
await until(`document.querySelector('.tc-btn').style.left === '362px'`, 2000);
// a lock: the partner pressed Ready (the server refuses changes until the question): the button off, the picker shut
await ev(`__s.changed = null; __s.locked = 'ready-partner'; __s.ready.partner = true;`);
await until(`document.querySelector('.tc-btn').disabled`, 3000);
await ev(`document.querySelector('.tc-btn').click()`);
assert.equal(await ev(`!!document.querySelector('.de-tcp')`), false);
await until(`document.querySelector('.tc-band').textContent === 'Your partner pressed Ready: cosmetics are locked until the trade question.'`, 3000);

// a refusal: the partner's old game (its panel gone): the band says why, my draft goes back to what the server holds
await ev(`__s.locked = null; __s.ready.partner = false; __refuse = { error: 'partner-no-panel' };`);
await until(`!document.querySelector('.tc-btn').disabled`, 3000);
await ev(`document.querySelector('.tc-btn').click()`);
await until(`!!document.querySelector('.de-tcp .tcp-row')`);
await ev(`document.querySelector('[data-id="${JADEN.id}"] .plus').click()`);
await until(`document.querySelector('.tc-band').textContent === "Your trade partner's game can't show cosmetics yet."`, 3000);
assert.equal(await ev(`document.querySelector('.tc-band').dataset.tone`), 'error');
assert.deepEqual(await ev(`[...document.querySelectorAll('[data-side=mine] .tc-tile')].map(e => e.dataset.id)`), [SUIT.id, KAIBA.id], 'back to the server\'s lines');
await shot('06-refused');
await ev(`__refuse = null; document.querySelector('.tcp-done').click()`);

// the end: the server's last word in the band, the button gone
await ev(`Object.assign(__s, { trading: false, last: { result: 'done', text: 'Trade complete.', cosmetics: true } })`);
await until(`document.querySelector('.tc-band').textContent === 'Trade complete.'`, 3000);
assert.equal(await ev(`document.querySelector('.tc-btn').hidden`), true);
assert.equal(await ev(`document.querySelectorAll('.tc-tile').length`), 0);

// the trade window gone (back to the lobby): the capability off (best effort), every layer gone, no more polls
await ev(`__s.trading = true; delete __s.last;`);
await until(`!document.querySelector('.tc-btn').hidden`, 3000);
await ev(`__snap.windows.shift()`);
await until(`__calls.some(c => c[1] === '/trade/cosmetics/panel' && c[2].on === false)`);
assert.equal(await ev(`document.querySelectorAll('.de-tc, .de-tcp, .de-tcs').length`), 0);
assert.equal(await ev(`__panel()`), null);
const n = (await calls('GET')).length;
await sleep(1500);
assert.equal((await calls('GET')).length, n, 'no poll after unmount');
console.log('trade-cosmetics_dom_test: ok');
b.close(); process.exit(0);
