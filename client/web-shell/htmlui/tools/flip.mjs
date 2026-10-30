// The flip test: the live game reaches a window, its frame is captured as the ENGINE draws it, the window is switched
// to HTML (yo2Html.toggle) and the same state is captured again; the two are diffed over the window's rect.
// The pairs are the owner's before/after captures. Konami-derived output: keep it local (never in git).
//
//   python3.12 -I tools/stack.py 8799 &        (or let flip start it: --stack)
//   node tools/flip.mjs <outdir> <route> [--dpr=2] [--keep] [--ship=<dir>] [--htmlui=on] [--boot] [--phone]
// --ship: the page as a DRY ship-client.sh made it (game.mjs SHIP); --htmlui=on: the R2 htmlui.json switch on.
// --boot: no flip; the route, then <outdir>/boot-<tag>.png, .json (snapshot, owned windows, console errors).
// --phone: an 844 x 390 touch phone at 3x.
// --cursor: no plain flip; the CSS cursor against the engine's in the route's CURSOR poses (hover a button, over text,
// a button held down, the click ripple: not diffed, its timing differs): <outdir>/<cls>-cursor-<pose>@<dpr>x-
// {engine,css,cursor,heat}.png, report-cursor@<dpr>x.json. --uicheck [--at=x,y]: only the cursor changes with it on.
// route: a name from ROUTES below (the clicks that reach a screen and the window classes to flip there).
// Writes <outdir>/<cls>@<dpr>x-{engine,html,heat}.png and report.json ({cls: {identical, within2, max, px}}).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), sleep = ms => new Promise(r => setTimeout(r, ms));

// A route with player: 'NAME' gets a test character in slot 0 with a starter deck (stack.py --player).
// [action, ...] steps: click x y (game px), rhold x y ms (the right button held ms), say x y text (typed into the
// chat line at x, y, then Enter), leave x y scene (click until the scene is no longer that one, up to 4
// tries), wait ms,
// scene id ms (until that scene), window cls ms (until shown)
export const ROUTES = {
  // signed out (--cookie= empty): ONLINE opens the login scene, where rt/session.cpp turns CWindowLogin into the sign-in panel
  signin: { signedOut: true, steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['window', 'CWindowLogin', 30000], ['wait', 2500]], flip: ['CWindowLogin'] },
  // past Select Player (--uicheck): the character picker (Create Player on the empty row 1), My Room (the test
  // character's row: into the game)
  create: { steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['click', 600, 384], ['wait', 6000]], flip: [] },
  myroom: { player: 'Duelist B', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500], ['leave', 600, 344, 7], ['wait', 15000]], flip: [] },
  // the game cursor poses (--cursor), game px: [name, x, y, held]. Empty slots: no click lands on a character
  select: { cursor: [['button-hover', 868, 508], ['text', 690, 272], ['row-hover', 600, 344], ['button-pressed', 868, 508, true], ['click-effect', 690, 272, 'click']],
    steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500]], flip: ['CWindowPlayerSelect'] },
  // a player with a character (htmlui-select): LV text, Delete, the waist-up avatar's passthrough
  'select-player': { player: 'Duelist B', cursor: [['button-hover', 868, 508], ['text', 690, 272], ['row-hover', 600, 344], ['button-pressed', 868, 508, true], ['click-effect', 690, 272, 'click']],
    steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500]], flip: ['CWindowPlayerSelect'] },
  // the lobby's chat: Chat Tester's My Room, the red door held with the right button (its room menu), Lobby, the NPC
  // popup's OK
  chat: { player: 'Chat Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 600, 344, 7], ['scene', 10, 90000], ['wait', 4000], ['rhold', 855, 300, 2000], ['wait', 3000], ['leave', 504, 240, 10],
    ['wait', 8000], ['click', 511, 670], ['wait', 3000], ['window', 'CChatWindow', 30000], ['wait', 2000],
    ['say', 636, 720, 'hello lobby'], ['say', 636, 720, 'a longer line to see how the log wraps a message that runs past the width of the chat window, then keeps going for a while'],
    ['wait', 2000]], flip: ['CChatWindow'],
    // the pointer on a tab, on the log, on the input line, then a tab held
    cursor: [['tab-hover', 400, 619], ['log', 500, 660], ['input', 636, 720], ['tab-pressed', 400, 619, true]] },
  // a player with a character: row 0 -> My Room (scene 10), the menu, Edit Deck (yo2-speed's recomp-menus.md coordinates)
  deck: { player: 'Deck Tester', steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500],
    ['leave', 560, 342, 7], ['scene', 10, 90000], ['wait', 3000], ['click', 43, 747], ['wait', 1500], ['click', 140, 422],
    ['window', 'CWindowModelKaban', 90000], ['wait', 4000]], flip: ['CWindowModelDeck', 'CWindowModelKaban', 'CCardDetailViewDlg'] },
};

const args = process.argv.slice(2), opt = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const [out, routeName] = args.filter(a => !a.startsWith('--'));
const route = ROUTES[routeName];
if (!out || !route) { console.error('flip.mjs <outdir> <route>; routes:', Object.keys(ROUTES).join(' ')); process.exit(2); }
const phone = args.includes('--phone'), boot = args.includes('--boot');
// --slot=N / FLIP_SLOT=N (0-3): one of several flips side by side, each with its own ports: stack.py 8800+10N (and its
// bridge, see stack.py), game.mjs 8801+10N, the browser's DevTools 9440+N. Without a slot: 8799 / 8942 / pid-based.
const SLOT = opt('slot') ?? process.env.FLIP_SLOT;
const dpr = +(opt('dpr') || (phone ? 3 : 1)), GAME = +(process.env.GAME_PORT || (SLOT != null ? 8801 + 10 * SLOT : 8942));
mkdirSync(out, { recursive: true });
const kids = [];
process.on('exit', () => kids.forEach(k => k.kill()));

let origin = opt('server'), cookie = opt('cookie');
if (!origin) {   // our own stack
  const st = spawn('python3.12', ['-I', path.join(here, 'stack.py'), String(SLOT != null ? 8800 + 10 * SLOT : 8799), ...(route.player ? ['--player', route.player] : [])],
    { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...(SLOT != null && { FLIP_SLOT: String(SLOT) }) } });
  kids.push(st);
  const line = await new Promise((ok, no) => { readline.createInterface({ input: st.stdout }).once('line', ok); st.once('exit', c => no(new Error('stack.py exited ' + c))); });
  ({ origin, cookie } = JSON.parse(line));
}
if (route.signedOut) cookie = '';   // the sign-in panel shows only to a signed-out player
kids.push(spawn('node', [path.join(here, 'game.mjs'), String(GAME)], { env: { ...process.env, SERVER: origin, COOKIE: cookie,
  ...(opt('ship') && { SHIP: path.resolve(opt('ship')) }), ...(opt('htmlui') && { HTMLUI: opt('htmlui') }) }, stdio: 'inherit' }));
await sleep(500);

const b = await launch({ dpr, mobile: phone, ...(phone && { width: 844, height: 390 }), ...(SLOT != null && { port: 9440 + +SLOT }) });
if (opt('throttle')) await b.send('Emulation.setCPUThrottlingRate', { rate: +opt('throttle') });   // --throttle=4: a slow machine
const q = args.includes('--nocursor') ? 'HTML_CURSOR=0' : '';   // --nocursor: the engine's cursor
await b.go(opt('ship') ? `http://127.0.0.1:${GAME}/?${q}` : `http://127.0.0.1:${GAME}/?HTML_UI=0&${q}`, 'window.yo2Html && Module.yo2Presents > 30');
const snap = () => b.ev('JSON.stringify(window.yo2Html.snapshot())').then(JSON.parse);
const until = async (what, ms, test) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) if (await test()) return;
  writeFileSync(path.join(out, 'stuck.png'), await b.shot());
  writeFileSync(path.join(out, 'console.txt'), b.logs.join('\n'));
  throw new Error('timed out: ' + what + '\n' + b.logs.slice(-20).join('\n'));
};
const toClient = async (x, y) => b.ev(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return [r.left + ${x} * r.width / 1024, r.top + ${y} * r.height / 768]; })()`);
const mouse = (type, [x, y], button = 'left') => b.send('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0, clickCount: 1 });

const click = async (x, y) => { const p = await toClient(x, y); await mouse('mouseMoved', p); await sleep(500); await mouse('mousePressed', p); await sleep(200); await mouse('mouseReleased', p); await sleep(500); };
for (const [a, x, y, z] of route.steps) {
  if (a === 'wait') await sleep(x);
  if (a === 'click') await click(x, y);
  if (a === 'say') {   // the chat line at x, y takes the text z and Enter, typed as key events (the game's own input)
    await click(x, y);
    for (const ch of z) { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(40); }
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(1500);
  }
  if (a === 'rhold') { const p = await toClient(x, y); await mouse('mouseMoved', p); await sleep(500); await mouse('mousePressed', p, 'right'); await sleep(z); await mouse('mouseReleased', p, 'right'); await sleep(500); }
  if (a === 'leave') for (let i = 0; i < 4; i++) {
    await click(x, y);
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && (await snap())?.scene === z) await sleep(250);
    if ((await snap())?.scene !== z) break;
  }
  if (a === 'scene') await until('scene ' + x, y, async () => (await snap())?.scene === x);
  if (a === 'window') await until('window ' + x, y, async () => { const s = await snap(); return s && (!x || s.windows.some(w => w.cls === x && w.shown)); });
}
await mouse('mouseMoved', opt('pointer') ? await toClient(...opt('pointer').split(',').map(Number)) : [2, 2]);   // the pointer off the UI (--pointer=x,y: there, e.g. on a tab with --nocursor)

if (boot) {   // the shipped page through the route: what it shows and what the bridge owns, no flip
  await sleep(1500);
  const tag = `${phone ? 'phone' : 'desktop'}-${opt('htmlui') || 'off'}`;
  writeFileSync(path.join(out, `boot-${tag}.png`), await b.shot());
  const s = await snap(), wins = await b.ev(`[...document.querySelectorAll('#htmlui-host .win')].length`);
  const cursor = (await b.ev(`getComputedStyle(document.getElementById('canvas')).cursor`)).replace(/base64,[^"]+/, 'base64,...');
  // what the page fetched for the HTML UI (atlases, glyphs, screen modules: none with htmlui.json off) and its long tasks
  const loads = await b.ev(`performance.getEntriesByType('resource').map(e => e.name).filter(n => /\\/(ui\\/(clamp\\/|glyphs)|htmlui\\/(screens|read)\\/)/.test(n)).length`);
  // the bridge's own cost per frame (the whole Module.onYo2Frame: read, cursor, tables), over 3 s
  const frameMs = await b.ev(`(async () => {
    const f = Module.onYo2Frame, ts = [];
    Module.onYo2Frame = (a, h) => { const t = performance.now(); f(a, h); ts.push(performance.now() - t); };
    await new Promise(r => setTimeout(r, 3000));
    Module.onYo2Frame = f;
    ts.sort((a, b) => a - b);
    return { n: ts.length, median: +ts[ts.length >> 1]?.toFixed(3), p99: +ts[Math.floor(ts.length * 0.99)]?.toFixed(3), max: +ts[ts.length - 1]?.toFixed(3) };
  })()`);
  const longTasks = await b.ev(`new Promise(ok => new PerformanceObserver((l, o) => { o.disconnect(); ok(l.getEntries().map(e => Math.round(e.duration)).sort((a, b) => b - a).slice(0, 6)); }).observe({ type: 'longtask', buffered: true }))`);
  const errors = b.logs.filter(l => /^(error|exception)/.test(l) || /htmlui/.test(l));
  writeFileSync(path.join(out, `boot-${tag}.json`), JSON.stringify({ scene: s?.scene, windows: s?.windows.map(w => w.cls), htmlWindows: wins, cursor, htmluiLoads: loads, longTasks, frameMs, errors }, null, 1));
  console.log(tag, JSON.stringify({ scene: s?.scene, htmlWindows: wins, htmluiLoads: loads, longTasks, frameMs, cursor: cursor.slice(0, 24), errors: errors.length }));
  b.close(); process.exit(0);
}
// the diff runs in the page: both captures decoded, compared over the rect, a heat map drawn (grey same, yellow
// within 2, red more)
const DIFF = `async (a, b, w, h) => {
  const load = async u => { const i = await createImageBitmap(await (await fetch(u)).blob()); const c = new OffscreenCanvas(w, h).getContext('2d'); c.drawImage(i, 0, 0); return c.getImageData(0, 0, w, h).data; };
  const [A, B] = await Promise.all([load(a), load(b)]), heat = new ImageData(w, h);
  let same = 0, near = 0, max = 0;
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
    max = Math.max(max, d); if (!d) same++; if (d <= 2) near++;
    const g = (A[i] + A[i + 1] + A[i + 2]) / 6 | 0;
    heat.data.set(!d ? [g, g, g, 255] : d <= 2 ? [255, 220, 0, 255] : [255, 0, 0, 255], i);
  }
  const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(heat, 0, 0);
  const blob = await c.convertToBlob(), buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const n = A.length / 4;
  return { identical: +(100 * same / n).toFixed(2), within2: +(100 * near / n).toFixed(2), max, px: n - same, heat: btoa(s) };
}`;
const report = {};
// --cursor: the CSS cursor (cursor.js) against the engine's, per pose. A headless capture never shows the OS cursor,
// so: the engine's cursor captured (yo2Html.cursor(false)), then the CSS one's image and hotspot read back from the
// computed style and drawn over a capture without it (where the OS puts it: hotspot at the mouse, 1 image px per
// device px); both isolated (the backdrop animates), the window drawn in HTML, diffed.
const CURSOR_IMG = String.raw`async (css, px, py, w, h, bare, dpr) => {
  const m = /url\("?((?:data|blob):[^")]+)"?\)(?: ([\d.]+)(?:x|dppx))?\)? ([\d.]+) ([\d.]+)/.exec(css);
  if (!m) return { error: 'no image cursor: ' + css.slice(0, 80) };
  const res = +(m[2] || 1), hx = +m[3], hy = +m[4];
  const img = await createImageBitmap(await (await fetch(m[1])).blob());
  const base = await createImageBitmap(await (await fetch(bare)).blob());
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  g.drawImage(img, Math.round(px * dpr) - Math.floor(hx * res), Math.round(py * dpr) - Math.floor(hy * res), img.width * dpr / res, img.height * dpr / res);
  const blob = await c.convertToBlob(), buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const cb = new Uint8Array(await (await fetch(m[1])).arrayBuffer());
  let cs = ''; for (let i = 0; i < cb.length; i += 0x8000) cs += String.fromCharCode(...cb.subarray(i, i + 0x8000));
  return { png: btoa(s), res, hx, hy, iw: img.width, ih: img.height, cursorPng: btoa(cs) };
}`;
if (args.includes('--cursor')) {
  const btn = (type, p, held) => b.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: held ? 1 : 0, clickCount: 1 });
  const cssOf = sel => b.ev(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).cursor`);
  for (const cls of route.flip) for (const [pose, x, y, held] of route.cursor || []) {
    const w = (await snap()).windows.find(v => v.cls === cls && v.shown);
    if (!w) { report[pose] = { error: 'not shown' }; continue; }
    const [x0, y0] = await toClient(w.x, w.y), [x1, y1] = await toClient(w.x + w.w + 48, w.y + w.h + 48);
    const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, p = await toClient(x, y);
    const tog = v => b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, ${v})`);
    await tog(false); await b.ev(`window.yo2Html.isolate(${JSON.stringify(cls)})`);
    await btn('mouseMoved', p); await sleep(500);
    if (held === 'click') { await btn('mousePressed', p, true); await sleep(60); await btn('mouseReleased', p); await sleep(100); }
    else if (held) { await btn('mousePressed', p, true); await sleep(400); }
    const wait = held === 'click' ? 0 : 600;
    // engine window + engine cursor; engine window + CSS cursor; HTML window + CSS cursor
    await b.ev('window.yo2Html.cursor(false)'); await sleep(wait);
    const engine = await b.shot(clip);
    await b.ev('window.yo2Html.cursor(true)'); await sleep(wait);
    const bare = await b.shot(clip);
    await tog(true); await sleep(wait);
    const bareHtml = await b.shot(clip);
    // the CSS cursor wherever the pointer is: the canvas, an HTML window's control, the page
    const css = { canvas: await cssOf('#canvas'), html: await cssOf('#htmlui-host .win *'), body: await cssOf('body') };
    const s = await snap();
    if (held) { const off = await toClient(2, 2); await btn('mouseMoved', off, true); await sleep(300); await btn('mouseReleased', off); await sleep(300); }
    await b.ev('window.yo2Html.isolate(null)'); await tog(false);
    const pw = Math.round(clip.width * dpr), ph = Math.round(clip.height * dpr);
    const put = png => b.ev(`(${CURSOR_IMG})(${JSON.stringify(css.canvas)}, ${p[0] - clip.x}, ${p[1] - clip.y}, ${pw}, ${ph}, 'data:image/png;base64,${png.toString('base64')}', ${dpr})`);
    const c = await put(bare), ch = await put(bareHtml);
    const base = path.join(out, `${cls}-cursor-${pose}@${dpr}x`);
    if (c.error) { report[pose] = { error: c.error, css }; console.log(pose, c.error); continue; }
    writeFileSync(base + '-engine.png', engine);
    writeFileSync(base + '-bare.png', bare);
    writeFileSync(base + '-css.png', Buffer.from(c.png, 'base64'));
    writeFileSync(base + '-css-html.png', Buffer.from(ch.png, 'base64'));
    writeFileSync(base + '-cursor.png', Buffer.from(c.cursorPng, 'base64'));
    const r = held === 'click' ? {} : await b.ev(`(${DIFF})('data:image/png;base64,${engine.toString('base64')}', 'data:image/png;base64,${c.png}', ${pw}, ${ph})`);
    if (r.heat) writeFileSync(base + '-heat.png', Buffer.from(r.heat, 'base64'));
    delete r.heat;
    report[pose] = { ...r, at: [x, y], held: held || false, same: css.canvas === css.html && css.html === css.body,
      hot: [c.hx, c.hy], res: c.res, size: [c.iw, c.ih], cursor: s.cursor && { mx: s.cursor.mx, my: s.cursor.my } };
    console.log(pose, JSON.stringify({ identical: r.identical, within2: r.within2, max: r.max, px: r.px, same: report[pose].same, hot: [c.hx, c.hy], res: c.res }));
  }
  writeFileSync(path.join(out, `report-cursor@${dpr}x.json`), JSON.stringify(report, null, 1));
  b.close(); process.exit(0);
}
// --anim [--at=x,y]: does the CSS cursor follow the game's cursor animation? The pointer parked (the hand's idle
// animation), then a click (the ripple): every ~30 ms the game's cursor state (the sprites it draws) and the CSS
// cursor, for 8 s + 2 s. Reports the states seen, whether each got its own CSS cursor and how many frames the CSS one
// lagged; anim@<dpr>x.png: the distinct cursor images in order, anim@<dpr>x.json: the timeline.
if (args.includes('--anim')) {
  const [ax, ay] = (opt('at') || '690,272').split(',').map(Number), p = await toClient(ax, ay);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
  await sleep(1000);
  const sample = ms => b.ev(`(async () => {
    const out = [], t0 = performance.now();
    while (performance.now() - t0 < ${ms}) {
      const c = window.yo2Html.snapshot()?.cursor, st = c ? c.sprites.filter(q => q.shown && q.a > 0).map(q => q.tex.slice(q.tex.lastIndexOf('/') + 1) + '@' + (q.wx - c.mx) + ',' + (q.wy - c.my) + '/' + q.a.toFixed(2) + '/' + q.wsx.toFixed(2)).join(' ') : '';
      out.push([Math.round(performance.now() - t0), st, window.yo2Html.cursorCss()]);
      await new Promise(r => setTimeout(r, 30));
    }
    return out;
  })()`);
  const idle = await sample(8000);
  const clickAndSample = async () => {
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: 1 });
    await sleep(60);
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: 1 });
    return sample(2000);
  };
  const click = await clickAndSample(), click2 = await clickAndSample();   // the second: every state already built
  const tl = [...idle, ...click.map(([t, st, css]) => [t + 8060, st, css]), ...click2.map(([t, st, css]) => [t + 10120, st, css])];
  // per state: the CSS value it settled on (its last); a sample lags when its CSS is not its state's own yet
  const own = new Map(); for (const [, st, css] of tl) own.set(st, css);   // by the end every state has its own
  const lagging = part => part.filter(([, st, css]) => css !== own.get(st)).length;
  const states = [...new Set(tl.map(x => x[1]))], csss = [...new Set(tl.map(x => x[2]))];
  const urls = csss.map(v => /url\("?([^")]+)"?\)/.exec(v || '')?.[1]).filter(Boolean);
  const strip = await b.ev(`(async () => {
    const im = await Promise.all(${JSON.stringify(urls)}.map(async u => createImageBitmap(await (await fetch(u)).blob())));
    const W = Math.max(1, ...im.map(i => i.width)), H = Math.max(1, ...im.map(i => i.height)), c = new OffscreenCanvas(W * Math.max(1, im.length), H), g = c.getContext('2d');
    g.fillStyle = '#4a90b8'; g.fillRect(0, 0, c.width, c.height); im.forEach((i, n) => g.drawImage(i, n * W, 0));
    const buf = new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  })()`);
  writeFileSync(path.join(out, `anim@${dpr}x.png`), Buffer.from(strip, 'base64'));
  writeFileSync(path.join(out, `anim@${dpr}x.json`), JSON.stringify(tl.map(([t, st, css]) => [t, st, csss.indexOf(css)]), null, 0));
  const changes = (k) => tl.filter((x, i) => i && x[k] !== tl[i - 1][k]).length;
  console.log('anim', JSON.stringify({ samples: tl.length, states: states.length, cssValues: csss.length, stateChanges: changes(1), cssChanges: changes(2),
    lagging1stClick: lagging(click), lagging2ndClick: lagging(click2), clickSamples: click.length, statesWithoutOwnCss: states.filter(st => !own.get(st)).length, idleStates: new Set(idle.map(x => x[1])).size, clickStates: new Set(click.map(x => x[1])).size }));
  b.close(); process.exit(0);
}
// --uicheck: nothing but the cursor changes with the CSS cursor on (the engine's hidden by its element, never by
// texture): the whole screen with the engine's cursor and with the CSS one, the pointer at UICHECK x,y; every window
// engine-drawn. Expected: only the cursor's box differs.
if (args.includes('--uicheck')) {
  const [ux, uy] = (opt('at') || '700,600').split(',').map(Number), p = await toClient(ux, uy);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
  await b.ev('window.yo2Html.set("0")'); await sleep(800);
  const ui = async () => { await b.ev('window.yo2Html.isolate(null)'); return b.shot(); };
  await b.ev('window.yo2Html.cursor(false)'); await sleep(600);
  const engine = await ui();
  await b.ev('window.yo2Html.cursor(true)'); await sleep(600);
  const css = await ui(), s = await snap();
  const W = Math.round(1024 * dpr), H = Math.round(768 * dpr);
  writeFileSync(path.join(out, `uicheck-${routeName}@${dpr}x-engine.png`), engine);
  writeFileSync(path.join(out, `uicheck-${routeName}@${dpr}x-css.png`), css);
  const r = await b.ev(`(${DIFF})('data:image/png;base64,${engine.toString('base64')}', 'data:image/png;base64,${css.toString('base64')}', ${W}, ${H})`);
  writeFileSync(path.join(out, `uicheck-${routeName}@${dpr}x-heat.png`), Buffer.from(r.heat, 'base64'));
  delete r.heat;
  console.log('uicheck', routeName, 'scene', s.scene, JSON.stringify(r), 'windows', s.windows.filter(w => w.shown).map(w => w.cls).join(' '));
  b.close(); process.exit(0);
}
for (const cls of route.flip) {
  const w = (await snap()).windows.find(v => v.cls === cls && v.shown);
  if (!w) { report[cls] = { error: 'not shown' }; continue; }
  const [x0, y0] = await toClient(w.x, w.y), [x1, y1] = await toClient(w.x + w.w, w.y + w.h);
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  // isolated: the window alone on an empty canvas in both captures (the backdrops animate, and the frame is 70 %)
  await b.ev(`window.yo2Html.isolate(${JSON.stringify(cls)})`);
  await sleep(600);   // a few frames: the hide table applies from the next Present
  const engine = await b.shot(clip);
  await b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, true)`);
  await sleep(600);
  const html = await b.shot(clip);
  const hostStyle = await b.ev(`document.getElementById('htmlui-host')?.getAttribute('style')`);
  if (/hidden/.test(hostStyle || '')) console.log('flip: the HTML layer is hidden:', hostStyle);
  writeFileSync(path.join(out, `${cls}-dom.html`), await b.ev(`document.getElementById('htmlui-host').outerHTML`));
  await b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, false); window.yo2Html.isolate(null)`);
  // the owner's before/after: the same state over the real backdrop (not diffed)
  await sleep(600);
  const before = await b.shot(clip);
  await b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, true)`);
  await sleep(600);
  const after = await b.shot(clip);
  await b.ev(`window.yo2Html.toggle(${JSON.stringify(cls)}, false)`);
  const base = path.join(out, `${cls}@${dpr}x`);
  writeFileSync(base + '-engine.png', engine);
  writeFileSync(base + '-html.png', html);
  writeFileSync(base + '-before.png', before);
  writeFileSync(base + '-after.png', after);
  const pw = Math.round(clip.width * dpr), ph = Math.round(clip.height * dpr);
  const r = await b.ev(`(${DIFF})('data:image/png;base64,${engine.toString('base64')}', 'data:image/png;base64,${html.toString('base64')}', ${pw}, ${ph})`);
  writeFileSync(base + '-heat.png', Buffer.from(r.heat, 'base64'));
  delete r.heat;
  report[cls] = { ...r, rect: [w.x, w.y, w.w, w.h], snapshot: w };
  console.log(cls, JSON.stringify({ identical: r.identical, within2: r.within2, max: r.max, px: r.px }));
}
writeFileSync(path.join(out, `report@${dpr}x.json`), JSON.stringify(report, null, 1));
writeFileSync(path.join(out, `full@${dpr}x.png`), await b.shot());
if (!args.includes('--keep')) { b.close(); process.exit(0); }
console.log('kept open: Ctrl-C to stop');
