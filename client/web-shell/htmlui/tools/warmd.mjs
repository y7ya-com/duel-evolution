// The warm harness's daemon (warm.mjs start runs it detached; usage and the commands are in warm.mjs). It holds the
// stack (stack.py: wrangler dev + two test users with characters), one game.mjs per player (each forwards with its own
// session cookie) and ONE headless Chrome on the GPU with a window per player, and answers warm.mjs's commands on
// 127.0.0.1:<8805 + 10 * slot> (POST / {cmd, args}: progress lines, then one JSON line).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), sleep = ms => new Promise(r => setTimeout(r, ms));

export const SLOT = +(process.env.FLIP_SLOT ?? 4);
export const PORTS = { stack: 8800 + 10 * SLOT, A: 8801 + 10 * SLOT, B: 8802 + 10 * SLOT, ctl: 8805 + 10 * SLOT, devtools: 9440 + SLOT };
// state, logs, the Chrome profile and default shots on disk (~/.cache/de-scratch: /tmp is RAM-backed here)
export const DIR = path.join(process.env.HOME, '.cache/de-scratch', `htmlui-warm-${SLOT}`), STATE = path.join(DIR, 'state.json');
const PROFILE = path.join(DIR, `chrome-${process.pid}`);
const NAMES = { A: process.env.WARM_A || 'Warm Tester A', B: process.env.WARM_B || 'Warm Tester B' };
const DPR = 2;

// flip.mjs's ROUTES, taken from its source (importing flip.mjs runs a flip): the object literal and the step lists before it
export async function flipRoutes() {
  const src = readFileSync(path.join(here, 'flip.mjs'), 'utf8');
  const a = src.indexOf('const SHOP_STEPS'), b = src.indexOf('\n};\n', src.indexOf('export const ROUTES'));
  if (a < 0 || b < 0) throw new Error('warm: flip.mjs ROUTES not found (its layout changed: SHOP_STEPS ... export const ROUTES = {...};)');
  return (await import('data:text/javascript,' + encodeURIComponent(src.slice(a, b + 3)))).ROUTES;
}
const ROUTES = await flipRoutes();
// Every flip route through Beginner's Lobby A (the red door's first room, its NPC popup's OK) starts with the same walk:
// '@lobby' stands for it, so a player already there goes on from it with no reboot
const LOBBY = ROUTES.shop.steps;
const isLobbyEnd = (s, i, all) => s[0] === 'click' && s[1] === 511 && s[2] === 670 && all.slice(0, i).some(t => t[0] === 'leave' && t[1] === 504 && t[2] === 240 && t[3] === 10);
// Sadie's shop: from a spawn on the store's upper landing the runtime's walker finds no path to the mat under the stairs
// (flip.mjs SHOP_STEPS fails there): the right-hand stairs first, a point every spawn reaches
export const SHOP_WAYPOINT = ['rc', 'walkto 1730 600 900'];
export function normalize(steps) {
  const i = steps.findIndex(isLobbyEnd);
  if (i < 0) return steps;
  const rest = steps.slice(steps[i + 1]?.[0] === 'wait' ? i + 2 : i + 1);
  const w = rest.findIndex(s => same(s, ['rc', 'walkto 1200 880 1500']));
  if (w >= 0) rest.splice(w, 0, SHOP_WAYPOINT);
  return [['@lobby'], ...rest];
}
const routeSteps = name => {
  if (name === 'lobby') return [['@lobby']];
  const r = ROUTES[name];
  if (!r) throw new Error(`no route ${name}; routes: lobby ${Object.keys(ROUTES).join(' ')}`);
  if (r.signedOut) throw new Error(`${name} needs a signed-out player (flip.mjs ${name} --cookie=)`);
  return normalize(r.steps);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isPrefix = (p, s) => p.length <= s.length && p.every((x, i) => same(x, s[i]));

// ---- the page side ------------------------------------------------------------------------------------------------
// Before any page script: (1) every node an /htmlui/ module puts straight into <head>, <body> or the canvas's parent is
// remembered (the call's stack names the module), so reload-ui takes the old bridge's DOM out exactly; (2) every /net
// WebSocket is kept (seed closes them: the game's in-place reconnect)
const INIT = `(() => {
  const tagged = window.__htmluiNodes = new Set(), mine = () => /\\/htmlui(@[^/]*)?\\//.test(new Error().stack || '');
  const top = p => p && (p === document.head || p === document.body || p === document.getElementById('canvas')?.parentNode);
  const tag = ns => { for (const n of ns) if (n instanceof DocumentFragment) tag([...n.childNodes]); else if (n instanceof Node) tagged.add(n); };
  const wrap = (proto, k, parent, nodes) => { const f = proto[k]; proto[k] = function (...a) { if (top(parent(this)) && mine()) tag(nodes(a)); return f.apply(this, a); }; };
  wrap(Node.prototype, 'appendChild', t => t, a => [a[0]]);
  wrap(Node.prototype, 'insertBefore', t => t, a => [a[0]]);
  wrap(Element.prototype, 'append', t => t, a => a);
  wrap(Element.prototype, 'prepend', t => t, a => a);
  wrap(Element.prototype, 'before', t => t.parentNode, a => a);
  wrap(Element.prototype, 'after', t => t.parentNode, a => a);
  // requests in flight (fetch, XHR): a shot waits for a screen's data (the box shop's GET /api/de/cosmetics...)
  window.__inflight = 0;
  const F = window.fetch;
  window.fetch = function (...a) { window.__inflight++; const p = F.apply(this, a); p.finally(() => window.__inflight--).catch(() => {}); return p; };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...a) { window.__inflight++; this.addEventListener('loadend', () => window.__inflight--, { once: true }); return send.apply(this, a); };
  window.__ws = [];
  const W = window.WebSocket;
  window.WebSocket = class extends W { constructor(...a) { if (window.__noResume) a[0] = String(a[0]).replace(/([?&])resume=1&?/, '$1'); super(...a); if (/\\/net(\\?|$)/.test(String(a[0]))) window.__ws.push(this); } };
})()`;
// yo2Html's switches as the harness and the routes set them (yo2Html has no getter): set() and toggle() recorded in
// window.__htmlState, so reload-ui and shot put them back
const INSTRUMENT = `(() => {
  const h = window.yo2Html; if (!h || h.__warm) return !!h;
  const s = window.__htmlState ||= { spec: new URLSearchParams(location.search).get('HTML_UI'), forced: {} };
  const t = h.toggle, set = h.set;
  h.toggle = (c, v) => { const r = t(c, v); s.forced[c] = r; return r; };
  h.set = sp => { s.spec = sp; s.forced = {}; return set(sp); };
  h.__warm = 1; return true;
})()`;
const RESTORE = `(k => { const h = window.yo2Html; h.set(k.spec); for (const [c, v] of Object.entries(k.forced)) h.toggle(c, v); })`;
const FRAMES = `(n => new Promise(r => { const p0 = Module.yo2Presents, t0 = performance.now();
  const tick = () => Module.yo2Presents >= p0 + n || performance.now() - t0 > 3000 ? r() : setTimeout(tick, 8); tick(); }))`;
// a few frames, then every running CSS animation and transition done (the windows' entrances), every image in the
// layer loaded and the fonts ready (each capped)
const SETTLE = `(async (min, layer) => {
  await ${FRAMES}(4);
  const t0 = performance.now();
  // an HTML shot: the layer up first (its screens load on the first window it owns)
  while (layer && !document.getElementById('htmlui-host') && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 25));
  // no request in flight for 250 ms (capped at 5 s), then a few frames for the screen to draw what came back
  for (let quiet = 0; quiet < 250 && performance.now() - t0 < 5000; quiet = (window.__inflight || 0) ? 0 : quiet + 25) await new Promise(r => setTimeout(r, 25));
  await ${FRAMES}(3);
  await Promise.race([Promise.all([document.fonts.ready,
    ...[...document.querySelectorAll('#htmlui-host img, #mu-title img')].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; })),
    ...document.getAnimations().filter(a => a.playState === 'running' && isFinite(a.effect?.getComputedTiming?.().endTime)).map(a => a.finished.catch(() => {}))]),
    new Promise(r => setTimeout(r, 2500))]);
  const left = min - (performance.now() - t0); if (left > 0) await new Promise(r => setTimeout(r, left));
  await ${FRAMES}(2);
})`;
// hot reload: the old screens unmounted by the old bridge (nothing owned at its next frames), its frame hook stopped,
// its DOM taken out, then a new bridge from /htmlui@<gen>/ (Fetch below serves /htmlui/: a new URL for every module in
// the graph, so all of them evaluate again), started, its switches put back
const RELOAD = `(async (gen) => {
  const old = window.yo2Html, keep = JSON.parse(JSON.stringify(window.__htmlState || { spec: null, forced: {} }));
  if (old) { old.isolate(null); old.set('0'); await ${FRAMES}(3); }
  Module.onYo2Frame = () => {};
  let removed = 0;
  for (const n of window.__htmluiNodes) if (n.isConnected) { n.remove(); removed++; }
  window.__htmluiNodes.clear();
  for (const n of document.querySelectorAll('#htmlui-host, #htmlui-bars, #mu-title, #mu-titlebg, style[id^="htmlui-"]')) { n.remove(); removed++; }
  document.documentElement.classList.remove('yo2c');
  const { start } = await import('/htmlui@' + gen + '/bridge.js');
  window.__htmlui = await start(Module);
  window.__htmlState = keep;   // before the instrumentation: it records into this object
  ${INSTRUMENT};
  // the layer loads its screens on the first window it is to own (bridge.js init): every screen on until it is up, so
  // the reload pays the module loads, not the next shot
  const saved = JSON.parse(JSON.stringify(keep));
  window.yo2Html.set('all');
  for (const t0 = performance.now(); !document.getElementById('htmlui-host') && performance.now() - t0 < 8000;) await new Promise(r => setTimeout(r, 25));
  ${RESTORE}(saved);
  return { removed, layer: !!document.getElementById('htmlui-host') };
})`;
const GPU = `(() => { const gl = document.createElement('canvas').getContext('webgl'); if (!gl) return 'no webgl';
  const e = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); })()`;

// a CDP connection to one page: send, ev (an expression's value), shot, on (events), logs (its console)
async function page(ws) {
  const sock = new WebSocket(ws);
  await new Promise((ok, no) => { sock.onopen = ok; sock.onerror = no; });
  let id = 0;
  const pend = new Map(), subs = new Map(), logs = [];
  sock.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method) for (const f of subs.get(d.method) || []) f(d.params);
    if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0, 400));
    if (logs.length > 2000) logs.splice(0, 1000);
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async js => {
    const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  const shot = async clip => {
    const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    if (!r.result) throw new Error('screenshot: ' + JSON.stringify(r.error || r));
    return Buffer.from(r.result.data, 'base64');
  };
  return { send, ev, shot, logs, on: (m, f) => subs.set(m, [...subs.get(m) || [], f]), close: () => sock.close() };
}

// ---- the processes ------------------------------------------------------------------------------------------------
const kids = [], st = { slot: SLOT, ports: PORTS, dir: DIR, names: NAMES, phase: 'starting', pids: { daemon: process.pid }, started: Date.now() };
const save = () => writeFileSync(STATE, JSON.stringify(st, null, 1));
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  st.phase = 'stopped'; save();
  for (const k of kids) try { k.kill('SIGTERM'); } catch {}   // stack.py stops its wrangler dev on SIGTERM
  setTimeout(() => process.exit(code), 1500);   // then exit: cdp.mjs's exit handler kills the Chrome
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => shutdown(0));
const procs = pat => readdirSync('/proc').filter(p => /^\d+$/.test(p)).filter(p => { try { return pat(readFileSync(`/proc/${p}/cmdline`, 'utf8').split(/[\0 ]/)); } catch { return false; } }).map(Number);

function cacheEnv() {   // this Linux box's local stack (game files under ~/.cache/yo2-game), unless set
  const H = process.env.HOME, c = H + '/.cache/yo2-game', e = {};
  const d = (k, v) => { if (!process.env[k] && existsSync(v)) e[k] = v; };
  d('BUILD', c + '/build'); d('GAME', c + '/web/game'); d('FONTS', c + '/web/fonts');
  d('CARDS', c + '/web/game/merge/data/card_passcode.bin'); d('YO2EMU', H + '/.cache/YOLaucher/tools/yo2emu');
  d('ART', path.join(here, '../../../html-ui/assets'));
  return { ...process.env, ...e };
}

async function startStack(env) {
  const vars = ['DEV:1', ...(process.env.STACK_VARS || '').split(',').filter(Boolean)].join(',');   // DEV:1: /__dev/state for seed
  const p = spawn('python3.12', ['-I', path.join(here, 'stack.py'), String(PORTS.stack), '--player', NAMES.A, '--player2', NAMES.B],
    { env: { ...env, FLIP_SLOT: String(SLOT), STACK_VARS: vars }, stdio: ['ignore', 'pipe', openSync(path.join(DIR, 'stack.err'), 'w')] });
  kids.push(p); st.pids.stack = p.pid;
  p.on('exit', c => { if (!shuttingDown) { log('stack.py exited', c); shutdown(1); } });
  const line = await new Promise((ok, no) => { readline.createInterface({ input: p.stdout }).once('line', ok); p.once('exit', c => no(new Error('stack.py exited ' + c + ' (' + path.join(DIR, 'stack.err') + ')'))); });
  const j = JSON.parse(line);
  // wrangler dev runs in its own session (stack.py stops it): its pid for stop's fallback
  st.pids.wrangler = procs(a => a.includes('dev') && a.includes(String(PORTS.stack)) && a.some(x => x.endsWith(`htmlui-${PORTS.stack}/wr`)) && a.some(x => /wrangler/.test(x)))[0];
  return j;
}
function startGame(T, env, origin, cookie) {
  const p = spawn('node', [path.join(here, 'game.mjs'), String(PORTS[T])], { env: { ...env, SERVER: origin, COOKIE: cookie },
    stdio: ['ignore', openSync(path.join(DIR, `game${T}.out`), 'w'), openSync(path.join(DIR, `game${T}.out`), 'a')] });
  kids.push(p); st.pids['game' + T] = p.pid;
  p.on('exit', c => { if (!shuttingDown) { log(`game.mjs ${T} exited`, c); shutdown(1); } });
}

// ---- a player's window --------------------------------------------------------------------------------------------
const tabs = {};
let browser, gpu, gen = 0, swaps = {};
async function openTab(T) {
  const { result } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const b = await page(`ws://127.0.0.1:${PORTS.devtools}/devtools/page/${result.targetId}`);
  await b.send('Runtime.enable');
  await b.send('Page.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: DPR, mobile: false });
  await b.send('Emulation.setFocusEmulationEnabled', { enabled: true });   // both windows act focused (no background throttling)
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  // /htmlui@<gen>/... is served from /htmlui/... (unseen by the page: the modules keep their @gen URLs): reload-ui's new graph
  // reload-ui --swap: one module from a file outside the tree instead (a trial edit), until the next reload-ui
  b.on('Fetch.requestPaused', ({ requestId, request }) => {
    const rel = /\/htmlui@[^/]+\/([^?#]*)/.exec(request.url)?.[1], f = rel && swaps[rel];
    if (f) return b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, body: readFileSync(f).toString('base64'),
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }] });
    return b.send('Fetch.continueRequest', { requestId, url: request.url.replace(/\/htmlui@[^/]+\//, '/htmlui/') });
  });
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/htmlui@*', requestStage: 'Request' }] });
  const t = tabs[T] = { T, b, trail: null, at: null, rcMouse: false, boots: 0 };
  return t;
}
// A reloaded page's old sockets are held 45 s for a resume (world.ts RESUME_HOLD_MS) and its account reads as in use
// (hub.ts: 0x3004 -242, the login refused): off the page, then every socket of that player's account cut on the server
// (wrangler dev DEV:1 /__dev/cut), then the new page
async function cutAll(T) {
  const acct = locate(await (await fetch(st.origin + '/__dev/state')).json(), NAMES[T])?.acct;
  if (!acct) return 0;
  const n = await Promise.all(Array.from({ length: 70 }, (_, i) => fetch(st.origin + '/__dev/cut', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acct, port: 5730 + i }) }).then(r => r.json()).then(j => j.cut || 0).catch(() => 0)));
  return n.reduce((a, b) => a + b, 0);
}
async function boot(t) {
  const t0 = Date.now();
  t.trail = null; t.at = null; t.rcMouse = false;
  if (t.boots) {
    await t.b.send('Page.navigate', { url: 'about:blank' });
    await sleep(500);
    log(t.T, 'cut', await cutAll(t.T), 'held sockets');
  }
  await t.b.send('Page.navigate', { url: `http://127.0.0.1:${PORTS[t.T]}/?HTML_UI=0&RC_INPUT_FILE=/rcin.txt` });
  await until(t, 'the game booted', 120000, () => t.b.ev('!!(window.yo2Html && Module.yo2Presents > 30)').catch(() => false));
  const r = await t.b.ev(GPU);
  if (!/Intel/.test(r) || !/Vulkan/.test(r) || /SwiftShader/i.test(r)) throw new Error(`${t.T}: not on the Intel GPU over Vulkan: ${r}`);
  await t.b.ev(INSTRUMENT);
  t.trail = []; t.boots++;
  log(t.T, 'booted in', Date.now() - t0, 'ms');
}

// ---- the step language (flip.mjs's) -------------------------------------------------------------------------------
const snap = t => t.b.ev('JSON.stringify(window.yo2Html?.snapshot() ?? null)').then(JSON.parse);
async function until(t, what, ms, test) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) if (await test()) return;
  writeFileSync(path.join(DIR, `stuck-${t.T}.png`), await t.b.shot());
  throw new Error(`${t.T}: timed out: ${what} (${path.join(DIR, `stuck-${t.T}.png`)})\n` + t.b.logs.slice(-15).join('\n'));
}
const toClient = (t, x, y) => t.b.ev(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return [r.left + ${x} * r.width / 1024, r.top + ${y} * r.height / 768]; })()`);
const mouse = (t, type, [x, y], button = 'left') => t.b.send('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0, clickCount: 1 });
const rc = (t, cmd) => {
  if (/^(move|click|down|up|dblclick|rdown|rup|walkto|clicknpc)\b/.test(cmd)) t.rcMouse = true;
  return t.b.ev(`(() => { let s = ''; try { s = FS.readFile('/rcin.txt', { encoding: 'utf8' }); } catch {} FS.writeFile('/rcin.txt', s + ${JSON.stringify(cmd)} + '\\n'); })()`);
};
// a click: the page's mouse, or once the runtime's scripted input has moved the mouse (it holds it from then on:
// rt/user32.cpp), the same click as scripted input (move first: a switch takes a click only once hovered)
async function click(t, x, y) {
  if (t.rcMouse) { await rc(t, `move ${x} ${y}`); await sleep(500); await rc(t, `click ${x} ${y}`); await sleep(700); return; }
  const p = await toClient(t, x, y);
  await mouse(t, 'mouseMoved', p); await sleep(500); await mouse(t, 'mousePressed', p); await sleep(200); await mouse(t, 'mouseReleased', p); await sleep(500);
}
async function keys(t, text) {
  for (const ch of text) { await t.b.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await t.b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(40); }
}
async function runSteps(t, steps, out = process.cwd(), say = log) {
  for (const s of steps) {
    const [a, x, y, z] = s;
    say(t.T, JSON.stringify(s).slice(0, 120));
    if (a === '@lobby') await runSteps(t, LOBBY, out, () => {});
    else if (a === 'wait') await sleep(x);
    else if (a === 'click') await click(t, x, y);
    else if (a === 'say' || a === 'type') {
      await click(t, x, y); await keys(t, z);
      if (a === 'say') {
        await t.b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await t.b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(1500);
      } else await sleep(800);
    } else if (a === 'on') { await t.b.ev(`window.yo2Html.toggle(${JSON.stringify(x)}, true)`); await sleep(1000); }
    else if (a === 'off') { await t.b.ev(`window.yo2Html.toggle(${JSON.stringify(x)}, false)`); await sleep(600); }
    else if (a === 'shot') { mkdirSync(out, { recursive: true }); writeFileSync(path.join(out, x + '.png'), await t.b.shot()); }
    else if (a === 'snap') { mkdirSync(out, { recursive: true }); writeFileSync(path.join(out, x + '.json'), JSON.stringify(await snap(t), null, 1)); }
    else if (a === 'wheel') { const p = await toClient(t, x, y); await t.b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p[0], y: p[1], deltaX: 0, deltaY: z }); await sleep(600); }
    else if (a === 'rwalk') {
      let p = await toClient(t, ...x[0]);
      await mouse(t, 'mouseMoved', p); await sleep(300); await mouse(t, 'mousePressed', p, 'right'); await sleep(x[0][2]);
      for (const [px, py, ms] of x.slice(1)) { p = await toClient(t, px, py); await mouse(t, 'mouseMoved', p, 'right'); await sleep(ms); }
      await mouse(t, 'mouseReleased', p, 'right'); await sleep(1000);
    } else if (a === 'js') await t.b.ev(x);
    else if (a === 'cut') {
      const acct = [...readFileSync(st.stack.log, 'utf8').matchAll(/u:[A-Za-z0-9_-]{20,}/g)].pop()?.[0];
      const r = await fetch(st.origin + '/__dev/cut', { method: 'POST', headers: { 'content-type': 'application/json', origin: st.origin }, body: JSON.stringify({ acct, port: x }) });
      say(t.T, 'cut', acct, x, r.status, await r.text());
    } else if (a === 'log') { mkdirSync(out, { recursive: true }); writeFileSync(path.join(out, x + '.txt'), t.b.logs.join('\n')); }
    else if (a === 'rc') await rc(t, x);
    else if (a === 'task') await until(t, 'task ' + x, y, async () => (await snap(t))?.tasks?.some(k => k.cls === x && k.shown));
    else if (a === 'rhold') {
      if (t.rcMouse) { await rc(t, `move ${x} ${y}`); await sleep(500); await rc(t, `rdown ${x} ${y}`); await sleep(z); await rc(t, `rup ${x} ${y}`); await sleep(500); continue; }
      const p = await toClient(t, x, y); await mouse(t, 'mouseMoved', p); await sleep(500); await mouse(t, 'mousePressed', p, 'right'); await sleep(z); await mouse(t, 'mouseReleased', p, 'right'); await sleep(500);
    } else if (a === 'leave') for (let i = 0; i < 4; i++) {
      await click(t, x, y);
      const t0 = Date.now();
      while (Date.now() - t0 < 8000 && (await snap(t))?.scene === z) await sleep(250);
      if ((await snap(t))?.scene !== z) break;
    } else if (a === 'scene') await until(t, 'scene ' + x, y, async () => (await snap(t))?.scene === x);
    else if (a === 'window') await until(t, 'window ' + x, y, async () => { const s = await snap(t); return s && (!x || s.windows.some(w => w.cls === x && w.shown)); });
    else throw new Error('unknown step ' + JSON.stringify(s));
  }
}

// ---- the commands -------------------------------------------------------------------------------------------------
const pick = w => w === 'both' ? ['A', 'B'] : w === 'A' || w === 'B' ? [w] : (() => { throw new Error(`A, B or both, not ${w}`); })();
// every player picked, side by side; one failing doesn't stop the other (the error names each that failed)
const both = async (w, f) => {
  const rs = await Promise.allSettled(pick(w).map(T => f(tabs[T])));
  const bad = rs.filter(r => r.status === 'rejected');
  if (bad.length) throw new Error(bad.map(r => r.reason?.message || r.reason).join('\n'));
  return rs.map(r => r.value);
};

async function goto(t, name, { fresh = false, say = log } = {}) {
  const steps = routeSteps(name), t0 = Date.now();
  let how = 'continued';
  if (fresh || !t.trail || !isPrefix(t.trail, steps)) { say(t.T, 'reboot for', name); await boot(t); how = 'rebooted'; }
  try { await runSteps(t, steps.slice(t.trail.length), undefined, say); }
  catch (e) { t.trail = [...t.trail, ['?failed', name]]; t.at = null; throw e; }   // somewhere unknown: the next goto reboots
  t.trail = steps; t.at = name;
  return { [t.T]: { route: name, how, ms: Date.now() - t0 } };
}

async function shot(t, out, { native = true, html = true, win, classes, dir }) {
  const files = [], keep = await t.b.ev('JSON.stringify(window.__htmlState)').then(JSON.parse);
  let clip;
  if (win) {
    const s = await snap(t), w = [...s.windows, ...s.tasks || []].find(v => v.cls === win && v.shown);
    if (!w) throw new Error(`${t.T}: ${win} is not shown`);
    const [x0, y0] = await toClient(t, w.x, w.y), [x1, y1] = await toClient(t, w.x + w.w, w.y + w.h);
    clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  const name = m => dir ? path.join(out, `${t.T}-${m}.png`) : out.endsWith('.png') && (native !== html) ? out.replace(/\.png$/, `-${t.T}.png`) : `${out}-${t.T}-${m}.png`;
  const take = async (m, spec, min) => {
    await t.b.ev(`window.yo2Html.set(${JSON.stringify(spec)})`);
    if (classes && m === 'html') await t.b.ev(`${JSON.stringify(classes)}.forEach(c => window.yo2Html.toggle(c, true))`);
    await t.b.ev(`${SETTLE}(${min}, ${m === 'html'})`);
    const f = name(m); mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, await t.b.shot(clip)); files.push(f);
  };
  try {
    if (native) await take('native', '0', 250);
    if (html) await take('html', classes ? '0' : 'all', 400);
  } finally { await t.b.ev(`${RESTORE}(${JSON.stringify(keep)})`); }
  return files;
}

async function reloadUi(t) {
  const t0 = Date.now(), r = await t.b.ev(`${RELOAD}(${gen})`);
  await t.b.ev(`${SETTLE}(200)`);
  const errs = t.b.logs.slice(-30).filter(l => /^(error|exception|warning: htmlui)/.test(l) && /htmlui/.test(l));
  return { [t.T]: { gen, ms: Date.now() - t0, ...r, errors: errs } };
}

// seed: the state from /__dev/state with the change applied, posted back. The server builds a new game from it and
// forgets every live session (server.ts reset), so each player's /net is closed with resume off: the game's in-place
// reconnect (ovr/lobbyretry.c, as after a deploy) logs in again and goes back to the same area or My Room. A player
// it can't bring back (not in the lobby or My Room, or still away after 60 s) is rebooted and its trail replayed.
export function locate(state, name) {
  for (const [acct, a] of Object.entries(state.accounts || {})) for (const [slot, p] of Object.entries(a.profiles || {})) if (p?.name === name) return { acct, slot, account: a, profile: p };
  return null;
}
const merge = (to, from) => { for (const [k, v] of Object.entries(from)) if (v && typeof v === 'object' && !Array.isArray(v) && to[k] && typeof to[k] === 'object' && !Array.isArray(to[k])) merge(to[k], v); else to[k] = v; return to; };
async function applySeed(spec, say) {
  const state = await (await fetch(st.origin + '/__dev/state')).json();
  const ctx = { A: locate(state, NAMES.A), B: locate(state, NAMES.B), names: NAMES };
  let next = state;
  if (spec.module) {
    const m = await import(spec.module + '?t=' + Date.now());
    next = (await m.default(state, ctx)) || state;
  } else if (spec.json.accounts) next = spec.json;   // a whole state
  else {
    const j = spec.json;
    for (const T of ['A', 'B']) if (j[T]) {
      if (!ctx[T]) throw new Error(`seed: no character ${NAMES[T]} in the state`);
      if (j[T].profile) merge(ctx[T].profile, j[T].profile);
      if (j[T].account) merge(ctx[T].account, j[T].account);
    }
    if (j.state) merge(state, j.state);
  }
  const r = await fetch(st.origin + '/__dev/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
  if (!r.ok) throw new Error('seed: /__dev/state answered ' + r.status + ' ' + await r.text());
  say('seeded', JSON.stringify({ A: ctx.A && [ctx.A.acct, ctx.A.slot], B: ctx.B && [ctx.B.acct, ctx.B.slot] }));
}
async function comeBack(t, say) {
  const t0 = Date.now(), scene0 = (await snap(t))?.scene;
  if (!t.trail) return { [t.T]: 'not booted' };
  if (scene0 === 10 || scene0 === 12) {   // My Room, a lobby area: lobbyretry.c's in-place reconnect
    await t.b.ev(`window.__noResume = true; window.__ws.forEach(w => w.close()); window.__ws.length`);
    await sleep(3000);
    try {
      await until(t, 'the reconnect', 60000, async () => {
        const s = await snap(t), n = await t.b.ev('window.yo2Net ?? null');
        return s?.scene === scene0 && !n?.reconnecting && !(await t.b.ev(`document.getElementById('loading')?.style.display !== 'none' && !!document.getElementById('loading')`));
      });
      await t.b.ev('window.__noResume = false');
      await sleep(2000);
      return { [t.T]: { how: 'reconnected', scene: scene0, ms: Date.now() - t0 } };
    } catch (e) { say(t.T, 'no in-place reconnect:', e.message.split('\n')[0]); }
  }
  const trail = t.trail, at = t.at;
  await boot(t);
  await runSteps(t, trail, undefined, say);
  t.trail = trail; t.at = at;
  return { [t.T]: { how: 'rebooted', ms: Date.now() - t0 } };
}

// trade-start: both players in Beginner's Lobby A; in A's player list (CPlayerListDlg, bottom left: the other players
// in the area, B the only one) B's row, its menu's Send Trade Request (CPlayerListMenu), B's Yes on the request
// (CWindowModelDialogYesNo); both in the trade scene (0x26, Card Swap). The runtime's clicknpc finds NPCs only, not
// another player's avatar. Menu entries and buttons are found by their labels in the snapshot
const shown = async t => (await snap(t))?.windows.filter(w => w.shown) || [];
const labelled = async (t, cls, re) => {
  for (const w of await shown(t)) if (w.cls === cls) for (const c of w.controls) if (c.label && re.test(c.label) && c.w > 0 && (c.x || c.y))
    return { w, c, at: [Math.round(w.x + c.x + c.w / 2), Math.round(w.y + c.y + c.h / 2)] };
  return null;
};
const describe = async t => (await shown(t)).map(w => `${w.cls}[${w.controls.filter(c => c.label).map(c => c.label).join('|')}]`).join(' ');
const find = async (t, what, cls, re, ms) => {
  let e = null;
  await until(t, what, ms, async () => !!(e = await labelled(t, cls, re))).catch(async x => { throw new Error(x.message.split('\n')[0] + '; shown: ' + await describe(t)); });
  return e;
};
async function tradeStart(say) {
  await both('both', t => same(t.trail, [['@lobby']]) ? null : goto(t, 'lobby', { say }));
  const A = tabs.A, B = tabs.B, t0 = Date.now();
  await click(A, 90, 637);   // the list's first row
  const e = await find(A, 'Send Trade Request in the player menu', 'CPlayerListMenu', /^Send Trade Request$/, 15000);
  say('A', 'Send Trade Request at', e.at.join(','));
  await click(A, ...e.at);
  const y = await find(B, "the request's Yes", 'CWindowModelDialogYesNo', /^Yes$/, 30000);
  say('B', 'Yes at', y.at.join(','));
  await click(B, ...y.at);
  await both('both', t => until(t, 'the trade scene', 60000, async () => (await snap(t))?.scene === 0x26));
  await sleep(3000);
  for (const t of [A, B]) { t.trail = [...t.trail, ['?trade']]; t.at = 'trade'; }
  return { ms: Date.now() - t0, A: await describe(A), B: await describe(B) };
}

async function status() {
  const out = { phase: st.phase, slot: SLOT, ports: PORTS, pids: st.pids, gpu, origin: st.origin, uptime: Math.round((Date.now() - st.started) / 1000), gen };
  for (const T of ['A', 'B']) {
    const t = tabs[T];
    if (!t) continue;
    out[T] = await t.b.ev(`(async () => { const p0 = Module?.yo2Presents ?? 0; await new Promise(r => setTimeout(r, 500)); const s = window.yo2Html?.snapshot();
      return { scene: s?.scene, windows: s?.windows.filter(w => w.shown).map(w => w.cls), fps: ((Module?.yo2Presents ?? 0) - p0) * 2, net: window.yo2Net ?? null, html: window.__htmlState }; })()`).catch(e => ({ error: e.message.slice(0, 200) }));
    Object.assign(out[T], { name: NAMES[T], at: t.at, trail: t.trail?.length, rcMouse: t.rcMouse, boots: t.boots });
  }
  return out;
}

const COMMANDS = {
  status: () => status(),
  async goto([w, route, ...o], say) { return Object.assign({}, ...await both(w, t => goto(t, route, { fresh: o.includes('--fresh'), say }))); },
  async steps([w, json, out], say) {
    const steps = JSON.parse(existsSync(json) ? readFileSync(json, 'utf8') : json);
    await both(w, async t => { if (!t.trail) await boot(t); t.at = null;
      try { await runSteps(t, steps, out, say); } finally { t.trail = [...t.trail, ...steps]; } });
    return { trail: Object.fromEntries(pick(w).map(T => [T, tabs[T].trail.length])) };
  },
  async shot([w, out, ...o]) {
    const opt = k => o.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
    const native = !o.includes('--html') || o.includes('--native'), html = !o.includes('--native') || o.includes('--html');
    const dir = out.endsWith('/') || (existsSync(out) && statSync(out).isDirectory());
    const files = (await both(w, t => shot(t, out, { native, html, win: opt('win'), classes: opt('classes')?.split(','), dir }))).flat();
    return { files };
  },
  async 'reload-ui'(args) {
    const w = args.find(a => !a.startsWith('--')) || 'both';
    swaps = Object.fromEntries(args.filter(a => a.startsWith('--swap=')).map(a => a.slice(7).split('=')).map(([rel, f]) => {
      if (!existsSync(f)) throw new Error('--swap: no file ' + f);
      return [rel.replace(/^\/?(htmlui\/)?/, ''), f];
    }));
    gen++;
    return { swaps, ...Object.assign({}, ...await both(w, reloadUi)) };
  },
  async seed([arg], say) {
    const spec = /\.m?js$/.test(arg) ? { module: path.resolve(arg) } : { json: JSON.parse(existsSync(arg) ? readFileSync(arg, 'utf8') : arg) };
    await applySeed(spec, say);
    return Object.assign({}, ...await Promise.all(['A', 'B'].map(T => comeBack(tabs[T], say))));
  },
  async eval([w, js]) { return Object.fromEntries(await Promise.all(pick(w).map(async T => [T, await tabs[T].b.ev(js)]))); },
  'trade-start': (_, say) => tradeStart(say),
  routes: () => ({ routes: ['lobby', ...Object.keys(ROUTES).filter(n => !ROUTES[n].signedOut)] }),
  async logs([w, n = 40]) { return Object.fromEntries(pick(w).map(T => [T, tabs[T].b.logs.slice(-n)])); },
  stop: () => { setTimeout(() => shutdown(0), 100); return { stopping: true }; },
};

// one command at a time (status any time): each answer streams its progress lines, then one JSON line
let queue = Promise.resolve();
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', async () => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    let cmd, args;
    try { ({ cmd, args = [] } = JSON.parse(body || '{}')); } catch { res.end(JSON.stringify({ ok: false, error: 'bad request' }) + '\n'); return; }
    const say = (...a) => { res.write('# ' + a.join(' ') + '\n'); log(...a); };
    const run = async () => {
      const t0 = Date.now();
      try {
        if (!COMMANDS[cmd]) throw new Error(`no command ${cmd}: ${Object.keys(COMMANDS).join(' ')}`);
        if (st.phase !== 'ready' && !['status', 'stop'].includes(cmd)) throw new Error('not ready: ' + st.phase);
        const r = await COMMANDS[cmd](args, say);
        res.end(JSON.stringify({ ok: true, ms: Date.now() - t0, ...r }) + '\n');
      } catch (e) { log(cmd, 'failed', e.stack); res.end(JSON.stringify({ ok: false, ms: Date.now() - t0, error: String(e.message || e) }) + '\n'); }
    };
    if (cmd === 'status' || cmd === 'stop') run(); else queue = queue.then(run);
  });
});

async function main() {
  mkdirSync(DIR, { recursive: true });
  await new Promise((ok, no) => { srv.once('error', no); srv.listen(PORTS.ctl, '127.0.0.1', ok); });
  save();
  const t0 = Date.now(), env = cacheEnv();
  // Chrome while the stack starts: the GPU checked first (never SwiftShader)
  const chrome = (async () => {
    const b0 = await launch({ port: PORTS.devtools, dpr: DPR, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], profile: PROFILE });
    gpu = await b0.ev(GPU);
    if (!/Intel/.test(gpu) || !/Vulkan/.test(gpu) || /SwiftShader/i.test(gpu)) throw new Error('Chrome is not on the Intel GPU over Vulkan: ' + gpu + ' (YO2_GPU_FLAGS?)');
    st.pids.chrome = procs(a => a.includes(`--remote-debugging-port=${PORTS.devtools}`) && a.includes(`--user-data-dir=${PROFILE}`) && !a.some(x => x.startsWith('--type=')))[0];
    const v = await (await fetch(`http://127.0.0.1:${PORTS.devtools}/json/version`)).json();
    browser = await page(v.webSocketDebuggerUrl);
    await openTab('A'); await openTab('B');
    log('chrome up', Date.now() - t0, 'ms, gpu', gpu);
  })();
  chrome.catch(() => {});   // awaited below: a refusal there (the GPU, memory) fails the start, not the process
  st.phase = 'stack'; save();
  const stack = await startStack(env);
  log('stack up', Date.now() - t0, 'ms');
  st.stack = stack; st.origin = stack.origin; st.cookies = { A: stack.cookie, B: stack.cookie2 };
  // --seed=<file>: applied before anyone signs in (no session to bring back)
  if (process.env.WARM_SEED) await applySeed(/\.m?js$/.test(process.env.WARM_SEED) ? { module: process.env.WARM_SEED } : { json: JSON.parse(readFileSync(process.env.WARM_SEED, 'utf8')) }, log);
  startGame('A', env, stack.origin, stack.cookie);
  startGame('B', env, stack.origin, stack.cookie2);
  await chrome;
  st.phase = 'boot'; save();
  await Promise.all(['A', 'B'].map(async T => { await sleep(200); await boot(tabs[T]); }));
  st.phase = 'lobby'; save();
  await Promise.all(['A', 'B'].map(T => goto(tabs[T], 'lobby')));
  st.timings = { coldStartMs: Date.now() - t0 };
  st.phase = 'ready'; save();
  log('ready in', Date.now() - t0, 'ms');
}
main().catch(e => { log('start failed:', e.stack); st.error = String(e.message || e); st.phase = 'failed'; save(); shutdown(1); });
