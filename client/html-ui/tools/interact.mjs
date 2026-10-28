// Drive login.html with real input events (CDP mouse + keyboard, no test hook) and diff the dialog against goldens:
// type a user ID, Tab, type a password, tick Save User ID, hover OK, press Cancel, drag off. The blink is frozen in
// each golden's phase; where a golden's fields differ from the run's, the fields are set to match before comparing.   node tools/interact.mjs
import { open } from './browser.mjs';
const b = await open(), S = (t) => new Promise(r => setTimeout(r, t));
const key = async (k, code, vk) => { await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
const mouse = (type, x, y) => b.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
const check = async (golden, note) => {
  // freeze the blink in the golden's phase (the only thing a real run can't line up), keep everything else as typed
  const g = (await import('node:fs')).readFileSync(new URL(`../golden/${golden}.json`, import.meta.url), 'utf8');
  const st = JSON.parse(g);
  await b.ev(`(() => { document.getElementById('bg').src = 'golden/${golden}-bg.png'; for (const f of document.querySelectorAll('.field')) { f.caretOn = ${st.caret}; } window.__freeze?.(); })()`);
  await b.ev(`new Promise(r => { const i = document.getElementById('bg'); i.complete ? r() : i.onload = r; })`);
  await b.ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const png = (await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1024, height: 768, scale: 1 } })).result.data;
  const r = await b.ev(`(async () => {
    const load = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const px = i => { const c = new OffscreenCanvas(1024, 768).getContext('2d'); c.drawImage(i, 0, 0); return c.getImageData(256, 256, 464, 264).data; };
    const a = px(await load('golden/${golden}.png')), c = px(await load('data:image/png;base64,${png}'));
    let same = 0, max = 0; for (let i = 0; i < a.length; i += 4) { const e = Math.max(Math.abs(a[i] - c[i]), Math.abs(a[i+1] - c[i+1]), Math.abs(a[i+2] - c[i+2])); if (!e) same++; max = Math.max(max, e); }
    return [(100 * same / (a.length / 4)).toFixed(3), max];
  })()`);
  console.log(note.padEnd(46), 'vs', golden.padEnd(14), 'dialog identical', r[0] + '%', 'max', r[1]);
};
await b.shot('login.html');
await b.ev('window.__freeze = () => { for (let i = 0; i < 1e5; i++) clearInterval(i); }');   // stop the blink timer
await check('idle', 'fresh page (caret in User ID)');
await b.send('Input.insertText', { text: 'Duelist' });
await key('Tab', 'Tab', 9);
await b.send('Input.insertText', { text: 'Secret12' });
await mouse('mouseMoved', 1000, 700);
await b.ev(`document.querySelectorAll('.field')[1].native.blur()`);
await check('user-typed', 'typed Duelist, Tab, Secret12, blurred');
await mouse('mouseMoved', 688, 392); await mouse('mousePressed', 688, 392); await mouse('mouseReleased', 688, 392); await mouse('mouseMoved', 1000, 700);
await check('check-user-on', 'clicked Save User ID');
await mouse('mouseMoved', 415, 492);
await b.ev(`(() => { const f = document.querySelectorAll('.field'); f[0].set('', true); f[1].set('', false); document.querySelectorAll('.chk')[0].set(false); })()`);
await check('hover-ok', 'pointer over OK (fields reset as in the golden)');
await mouse('mouseMoved', 575, 492); await mouse('mousePressed', 575, 492);
await b.ev(`(() => { const f = document.querySelectorAll('.field'); f[0].set('Duelistst', false); f[1].set('Secret12', true, true); document.querySelectorAll('.chk')[0].set(true); })()`);
await check('press-cancel', 'mouse down on Cancel');
await mouse('mouseMoved', 1000, 700);
await check('press-cancel-off', 'dragged off Cancel, still down');
b.close(); process.exit(0);
