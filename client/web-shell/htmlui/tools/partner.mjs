// The second player for flip.mjs's two-player routes (another player's card, Card Swap): one local stack with two
// test users (stack.py --player / --player2), a second game page signed in as the second, walked into the same lobby as
// flip.mjs's TL_LOBBY and idle there saying yes (every second, a shown window with a Yes / OK / Accept button gets it
// clicked: a trade offer, the room's popup), and flip.mjs run on the route as the first user.
//   node tools/partner.mjs <outdir> <route> --player='Lobby Tester' --player2='Card Partner' --slot=1 [--dpr=2] [flip args]
// Ports: the slot's stack (8800 + 10 * slot) and flip.mjs's (8801 + 10 * slot, DevTools 9440 + slot); the partner's
// game.mjs 8805 + 10 * slot, DevTools 9450 + slot. Writes <outdir>/partner-*.png at each step it takes and
// partner-console.txt; flip.mjs writes the rest.
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), sleep = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2), opt = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const [out, route] = args.filter(a => !a.startsWith('--')), SLOT = +(opt('slot') ?? 1), MS = +(opt('ms') ?? 1500000);
if (!out || !route || !opt('player') || !opt('player2')) { console.error("partner.mjs <outdir> <route> --player=NAME --player2=NAME2 [--slot=N]"); process.exit(2); }
mkdirSync(out, { recursive: true });
const GAME = 8805 + 10 * SLOT, kids = [];
process.on('exit', () => kids.forEach(k => k.kill()));
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(1));
const st = spawn('python3.12', ['-I', path.join(here, 'stack.py'), String(8800 + 10 * SLOT), '--player', opt('player'), '--player2', opt('player2')],
  { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, FLIP_SLOT: String(SLOT) } });
kids.push(st);
const stack = JSON.parse(await new Promise((ok, no) => { readline.createInterface({ input: st.stdout }).once('line', ok); st.once('exit', c => no(new Error('stack.py exited ' + c))); }));
kids.push(spawn('node', [path.join(here, 'game.mjs'), String(GAME)], { env: { ...process.env, SERVER: stack.origin, COOKIE: stack.cookie2 }, stdio: 'ignore' }));
await sleep(500);
// flip.mjs as the first user, on the same stack (its own game page and browser)
const flipArgs = args.filter(a => a.startsWith('--') && !/^--(player2?|ms|friend|friend-wait)=/.test(a));
const flip = spawn('node', [path.join(here, 'flip.mjs'), out, route, `--server=${stack.origin}`, `--cookie=${stack.cookie}`, ...flipArgs], { stdio: 'inherit' });
kids.push(flip);
const flipDone = new Promise(r => flip.once('exit', r));
const b = await launch({ dpr: 1, port: 9450 + SLOT });
await b.go(`http://127.0.0.1:${GAME}/?HTML_UI=0`, 'window.yo2Html && Module.yo2Presents > 30');
const snap = () => b.ev('JSON.stringify(window.yo2Html.snapshot())').then(JSON.parse).catch(() => null);
const toClient = (x, y) => b.ev(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return [r.left + ${x} * r.width / 1024, r.top + ${y} * r.height / 768]; })()`);
const mouse = (type, [x, y], button = 'left') => b.send('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0, clickCount: 1 });
const click = async (x, y) => { const p = await toClient(x, y); await mouse('mouseMoved', p); await sleep(500); await mouse('mousePressed', p); await sleep(200); await mouse('mouseReleased', p); await sleep(500); };
const until = async (what, ms, test) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) if (await test()) return; throw new Error('partner: timed out: ' + what); };
let n = 0;
const shot = async tag => writeFileSync(path.join(out, `partner-${String(++n).padStart(2, '0')}-${tag}.png`), await b.shot());
const leave = async (x, y, z) => { for (let i = 0; i < 4; i++) { await click(x, y); const t0 = Date.now(); while (Date.now() - t0 < 8000 && (await snap())?.scene === z) await sleep(250); if ((await snap())?.scene !== z) break; } };
const rhold = async (x, y, ms) => { const p = await toClient(x, y); await mouse('mouseMoved', p); await sleep(500); await mouse('mousePressed', p, 'right'); await sleep(ms); await mouse('mouseReleased', p, 'right'); await sleep(500); };
try {
  // flip.mjs's TL_LOBBY: Select Player row 0, My Room, the red door's Lobby, the popup's OK
  await until('title', 90000, async () => (await snap())?.scene === 4); await sleep(3000); await leave(512, 458, 4);
  await until('select', 90000, async () => (await snap())?.scene === 7); await sleep(2500); await leave(600, 344, 7);
  await until('my room', 90000, async () => (await snap())?.scene === 10); await sleep(6000);
  // the red door held until its menu (CWindowModelMove) is up (the avatar may stand in front of it), then Lobby
  const menu = async () => (await snap())?.windows.some(w => w.cls === 'CWindowModelMove' && w.shown);
  for (let n = 0; n < 8 && (await snap())?.scene === 10; n++) {
    if (!await menu()) { await rhold(...[[855, 300], [845, 170], [880, 230], [830, 340]][n % 4], 2500); for (let t = 0; t < 10 && !await menu(); t++) await sleep(500); }
    if (await menu()) { await click(504, 240); for (let t = 0; t < 30 && (await snap())?.scene === 10; t++) await sleep(500); }
  }
  await sleep(8000); await click(511, 670); await sleep(3000);
  await until('lobby', 30000, async () => (await snap())?.windows.some(w => w.cls === 'CChatWindow' && w.shown));
  await shot('lobby');
  console.log('partner: in the lobby, scene', (await snap())?.scene);
  // --friend=NAME: that player's card (the player list's Show all, their row held as a hand clicks), Send Friend Request
  // (the first user's menu bar gets its friend notice icon: flip.mjs tl-notice)
  if (opt('friend')) {
    await sleep(Number(opt('friend-wait') ?? 0));
    await click(213, 620);
    await until('find menu', 20000, async () => (await snap())?.windows.some(w => w.cls === 'CFindMenu' && w.shown));
    await sleep(1500); await click(298, 732); await sleep(4000);
    console.log('partner: friend', await b.ev(`(async () => {
      const sl = ms => new Promise(r => setTimeout(r, ms)), name = ${JSON.stringify(opt('friend'))};
      const cv = document.getElementById('canvas'), r = cv.getBoundingClientRect(), k = r.width / 1024;
      const press = async (x, y) => { const p = { clientX: r.left + x * k, clientY: r.top + y * k, bubbles: true, button: 0 };
        cv.dispatchEvent(new MouseEvent('mousemove', { ...p, buttons: 0 })); await sl(600);
        cv.dispatchEvent(new MouseEvent('mousedown', { ...p, buttons: 1 })); await sl(400);
        cv.dispatchEvent(new MouseEvent('mouseup', { ...p, buttons: 0 })); };
      let pl, list, i = -1;
      for (let t = 0; t < 120 && i < 0; t++, await sl(1000)) {
        pl = yo2Html.snapshot().windows.find(w => w.cls === 'CPlayerListDlg' && w.shown);
        list = pl?.controls.find(c => /Listbox$/.test(c.cls) && c.shown);
        i = (list?.items || []).findIndex(s => s.replace(/@\\d/g, '').includes(name));
      }
      if (i < 0) return 'no row ' + name;
      const rows = list.rows || 6, top = Math.min(i, Math.max(0, list.items.length - rows)), bar = pl.controls.find(c => c.parent === list.id && /Scroll$/.test(c.cls));
      if (i >= rows && bar) { window.__htmlui?.api?.setValue?.(bar.id, top); await sl(1500); }
      const at = i < rows ? i : i - top;
      await press(pl.x + list.x + 40, pl.y + list.y + (list.h / rows) * (at + 0.5));
      let w, c;
      for (let t = 0; t < 30 && !c; t++, await sl(1000)) for (w of yo2Html.snapshot().windows) if (w.shown && (c = w.controls.find(q => q.shown && (q.label || '').trim() === 'Send Friend Request'))) break;
      if (!c) return 'no Send Friend Request';
      await press((c.wx ?? w.x + c.x) + c.w / 2, (c.wy ?? w.y + c.y) + c.h / 2);
      return 'sent to ' + name;
    })()`));
    await sleep(3000); await shot('friend');
  }
  // idle: say yes to whatever asks; the pointer parked between
  let done = false;
  flipDone.then(() => { done = true; });
  for (const t0 = Date.now(); !done && Date.now() - t0 < MS; await sleep(1000)) {
    const s = await snap();
    if (!s) continue;
    for (const w of s.windows) {
      if (!w.shown || /^(CChatWindow|CPlayerListDlg|CWindowModelMenu|CWindowModelPlace)$/.test(w.cls)) continue;
      const c = w.controls.find(c => c.shown && !c.parent && /^(Yes|OK|Accept)$/i.test((c.label || '').trim()));
      if (!c) continue;
      await shot('ask-' + w.cls);
      console.log('partner: yes to', w.cls, c.label, 'scene', s.scene);
      await click(w.x + c.x + c.w / 2, w.y + c.y + c.h / 2);
      await mouse('mouseMoved', await toClient(700, 300));
      await sleep(1500);
      await shot('after-' + w.cls);
      break;
    }
  }
} catch (e) {
  console.error(String(e));
} finally {
  writeFileSync(path.join(out, 'partner-console.txt'), b.logs.join('\n'));
  b.close();
  await flipDone;   // the flip ends the run (the stack and the partner's page go with it)
  process.exit(0);
}
