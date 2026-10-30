// The flip test: the live game reaches a window, its frame is captured as the ENGINE draws it, the window is switched
// to HTML (yo2Html.toggle) and the same state is captured again; the two are diffed over the window's rect.
// The pairs are the owner's before/after captures. Konami-derived output: keep it local (never in git).
//
//   python3.12 -I tools/stack.py 8799 &        (or let flip start it: --stack)
//   node tools/flip.mjs <outdir> <route> [--dpr=2] [--keep]
// route: a name from ROUTES below (the clicks that reach a screen and the window classes to flip there).
// Writes <outdir>/<cls>@<dpr>x-{engine,html,heat}.png and report.json ({cls: {identical, within2, max, px}}).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), sleep = ms => new Promise(r => setTimeout(r, ms));

// [action, ...] steps: click x y (game px), leave x y scene (click until the scene is no longer that one, up to 4
// tries), wait ms,
// scene id ms (until that scene), window cls ms (until shown)
export const ROUTES = {
  select: { steps: [['scene', 4, 90000], ['wait', 3000], ['leave', 512, 458, 4], ['scene', 7, 90000], ['wait', 2500]], flip: ['CWindowPlayerSelect'] },
};

const args = process.argv.slice(2), opt = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const [out, routeName] = args.filter(a => !a.startsWith('--'));
const route = ROUTES[routeName];
if (!out || !route) { console.error('flip.mjs <outdir> <route>; routes:', Object.keys(ROUTES).join(' ')); process.exit(2); }
const dpr = +(opt('dpr') || 1), GAME = 8942;
mkdirSync(out, { recursive: true });
const kids = [];
process.on('exit', () => kids.forEach(k => k.kill()));

let origin = opt('server'), cookie = opt('cookie');
if (!origin) {   // our own stack
  const st = spawn('python3.12', ['-I', path.join(here, 'stack.py'), '8799'], { stdio: ['ignore', 'pipe', 'inherit'] });
  kids.push(st);
  const line = await new Promise((ok, no) => { readline.createInterface({ input: st.stdout }).once('line', ok); st.once('exit', c => no(new Error('stack.py exited ' + c))); });
  ({ origin, cookie } = JSON.parse(line));
}
kids.push(spawn('node', [path.join(here, 'game.mjs'), String(GAME)], { env: { ...process.env, SERVER: origin, COOKIE: cookie }, stdio: 'inherit' }));
await sleep(500);

const b = await launch({ dpr });
await b.go(`http://127.0.0.1:${GAME}/?HTML_UI=0`, 'window.__htmlui && Module.yo2Presents > 30');
const snap = () => b.ev('JSON.stringify(window.__htmlui.snapshot())').then(JSON.parse);
const until = async (what, ms, test) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) if (await test()) return;
  writeFileSync(path.join(out, 'stuck.png'), await b.shot());
  writeFileSync(path.join(out, 'console.txt'), b.logs.join('\n'));
  throw new Error('timed out: ' + what + '\n' + b.logs.slice(-20).join('\n'));
};
const toClient = async (x, y) => b.ev(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return [r.left + ${x} * r.width / 1024, r.top + ${y} * r.height / 768]; })()`);
const mouse = (type, [x, y]) => b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });

const click = async (x, y) => { const p = await toClient(x, y); await mouse('mouseMoved', p); await sleep(500); await mouse('mousePressed', p); await sleep(200); await mouse('mouseReleased', p); await sleep(500); };
for (const [a, x, y, z] of route.steps) {
  if (a === 'wait') await sleep(x);
  if (a === 'click') await click(x, y);
  if (a === 'leave') for (let i = 0; i < 4; i++) {
    await click(x, y);
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && (await snap())?.scene === z) await sleep(250);
    if ((await snap())?.scene !== z) break;
  }
  if (a === 'scene') await until('scene ' + x, y, async () => (await snap())?.scene === x);
  if (a === 'window') await until('window ' + x, y, async () => { const s = await snap(); return s && (!x || s.windows.some(w => w.cls === x && w.shown)); });
}
await mouse('mouseMoved', [2, 2]);   // the pointer off the UI

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
for (const cls of route.flip) {
  const w = (await snap()).windows.find(v => v.cls === cls && v.shown);
  if (!w) { report[cls] = { error: 'not shown' }; continue; }
  const [x0, y0] = await toClient(w.x, w.y), [x1, y1] = await toClient(w.x + w.w, w.y + w.h);
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  // isolated: the window alone on an empty canvas in both captures (the backdrops animate, and the frame is 70 %)
  await b.ev(`window.__htmlui.isolate(${JSON.stringify(cls)})`);
  await sleep(600);   // a few frames: the hide table applies from the next Present
  const engine = await b.shot(clip);
  await b.ev(`window.__htmlui.toggle(${JSON.stringify(cls)}, true)`);
  await sleep(600);
  const html = await b.shot(clip);
  writeFileSync(path.join(out, `${cls}-dom.html`), await b.ev(`document.getElementById('htmlui-host').outerHTML`));
  await b.ev(`window.__htmlui.toggle(${JSON.stringify(cls)}, false); window.__htmlui.isolate(null)`);
  // the owner's before/after: the same state over the real backdrop (not diffed)
  await sleep(600);
  const before = await b.shot(clip);
  await b.ev(`window.__htmlui.toggle(${JSON.stringify(cls)}, true)`);
  await sleep(600);
  const after = await b.shot(clip);
  await b.ev(`window.__htmlui.toggle(${JSON.stringify(cls)}, false)`);
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
