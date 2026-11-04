// The dialogs (screens/dialog.js) in headless Chrome through mock.html (owned: its api logs each call): the focus starts on
// the switch the game focuses (No), Enter and a click press the game's switches, the pointer's hover lights a plate, a
// list row clicks the game's row at its place, the Error dialog's shield takes clicks off the rest of the screen.
//   node client/web-shell/htmlui/screens/dialog_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9000 + process.pid % 9;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({});
const mock = n => JSON.parse(readFileSync(new URL(`../mock/${n}.json`, import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = async n => {
  await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=${n}`);
  // mock.html's api logs 'api.<name>' and its arguments: kept here
  await b.ev(`(() => { window.__calls = []; const log = console.log; console.log = (...a) => { if (String(a[0]).startsWith('api.')) window.__calls.push(a); else log(...a); }; })()`);
  await sleep(400);   // the focus is put once the root can take it (tried every 50 ms)
};
const calls = () => b.ev('window.__calls');
const mouse = async (x, y, press = true) => {
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  if (!press) return;
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
};
const key = async k => {
  for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : 0, ...(type === 'keyDown' && k === 'Enter' ? { text: '\r' } : {}) });
};

// Yes / No: No has the focus (the game's setFocus(no_)), lit at rest; Enter presses it; a click on Yes presses Yes
{
  // the live game's snapshot (the deck editor's overwrite question): No is listed before Yes
  const w = mock('dialog-yesno').windows[0], sw = w.controls.filter(c => c.cls.endsWith('TextSwitch') && !c.parent);
  const yes = sw.find(c => c.label === 'Yes'), no = sw.find(c => c.label === 'No');
  const looks = `['Yes', 'No'].map(l => [...document.querySelectorAll('button.btn')].find(e => e.textContent === l).dataset.look).join()`;
  await open('dialog-yesno');
  assert.equal(await b.ev('document.activeElement.textContent'), 'No');
  assert.equal(await b.ev(looks), '0,1', 'No lit (focused), Yes not (the game\'s hover is its puppet mouse)');
  await key('Enter');
  await sleep(50);
  assert.deepEqual(await calls(), [['api.click', no.id]]);
  await mouse(w.x + yes.x + 40, w.y + yes.y + 12, false);
  await sleep(30);
  assert.equal((await b.ev(looks)).split(',')[0], '1', 'the pointer lights Yes');
  await mouse(w.x + yes.x + 40, w.y + yes.y + 12);
  await sleep(50);
  assert.deepEqual((await calls()).at(-1), ['api.click', yes.id]);
}

// the pick list: a row clicks the game's list at that row (16-pixel rows from the list's top, 40 in); the × closes
{
  const w = mock('dialog-list').windows[0], list = w.controls.find(c => c.cls.endsWith('Listbox')), x = w.controls.find(c => c.cls.endsWith('IconHide'));
  await open('dialog-list');
  assert.equal(await b.ev(`[...document.querySelectorAll('.dlg-row')].map(r => r.textContent).join()`), 'Alexis Rhodes,Kain,raMon,Duelist B,Chazz,Syrus,Bastion,Jaden');
  await mouse(w.x + list.x + 20, w.y + list.y + 2 * 16 + 5);
  await sleep(50);
  assert.deepEqual((await calls()).at(-1), ['api.click', list.id, [w.x + list.x + 40, w.y + list.y + 2 * 16 + 8]]);
  await mouse(w.x + x.x + 7, w.y + x.y + 10);
  await sleep(50);
  assert.deepEqual((await calls()).at(-1), ['api.click', x.id]);
}

// the Error dialog: its shield (a screen-sized BackPlane at alpha 0) takes a click anywhere else, and passes it to nothing
{
  await open('dialog-error');
  assert.equal(await b.ev('document.elementFromPoint(20, 20).className'), 'dlg-shield');
  await mouse(20, 20);
  await sleep(50);
  assert.deepEqual(await calls(), []);
  assert.equal(await b.ev('getComputedStyle(document.querySelector(".dlg-frame")).borderTopColor'), 'rgb(255, 255, 128)', 'style 0: the orange frame');
}

// the name prompt: its field is a real <input> committing through setText
{
  const w = mock('dialog-input1').windows[0], inp = w.controls.find(c => c.cls.endsWith('Input'));
  await open('dialog-input1');
  assert.equal(await b.ev('document.querySelector("input.chat-in").value'), 'Duelist');
  await mouse(w.x + inp.x + 100, w.y + inp.y + 16);
  await b.send('Input.insertText', { text: 'X' });
  await sleep(50);
  assert.ok((await calls()).some(c => c[0] === 'api.setText' && c[1] === inp.id && /X/.test(c[2])));
}

console.log('dialog_dom_test ok');
b.close();
process.exit(0);
