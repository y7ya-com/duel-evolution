// The card detail walked through the layer in headless Chrome (mock.html), plain screens/deck.js and the Svelte
// deck: monster -> spell -> monster -> the same monster with other stats -> none. At each step both show the same text,
// none of the last card's (the stale-stats bug), and the text box keeps the player's place while its text stays and
// goes back to the top for a new one.   npm run build && node svelte/deck_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8990 + process.pid % 9;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({});

const ctl = (id, cls, parts, extra = {}) => ({ id, cls, x: 0, y: 0, w: 0, h: 0, shown: true, parts, ...extra });
const detail = (power, text) => ({ v: 1, scene: 0x24, windows: [{ id: 70, cls: 'CCardDetailViewDlg', x: 0, y: 175, w: 248, h: 559, z: 1, wz: 1, shown: true, alpha: 1,
  extras: [], labels: [{ id: 71, text: power, wx: 60, wy: 712, wz: 51613, shown: !!power }], controls: [
    ctl(72, 'CWindowTaskText', { labels: [{ id: 73, text, wx: 8, wy: 497, wz: 51205, shown: true }] },
      { text, w: 216, fontSize: 16, pageLines: 3, firstLine: 0, align: 0 })] }] });
const mon = '@4Mystic Tomato\n@3[Plant/Effect/DARK]\n@0When this card is destroyed by battle and sent to the Graveyard, you can Special Summon 1 DARK monster from your Deck with 1500 or less ATK, in face-up Attack Position.';
const steps = [detail(' 4 ATK1400/DEF1100', mon), detail('', '@4Enemy Controller\n@0Activate 1 of these effects.'),
  detail(' 4 ATK1400/DEF1100', mon), detail(' 4 ATK2300/DEF   0', mon), { v: 1, scene: 0x24, windows: [] }];

const walk = async q => {
  await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=deck${q}`);
  const out = [];
  for (const [i, s] of steps.entries()) {
    out.push(await b.ev(`(() => {
      window.__render(${JSON.stringify(s)});
      const box = [...document.querySelectorAll('#htmlui div')].find(d => d.style.overflowY === 'auto');
      const scrolled = box?.scrollTop;
      if (box && ${i} === 2) box.scrollTop = 20;   // the player scrolls the monster's text
      return { text: document.getElementById('htmlui').innerText.replace(/\\s+/g, ' ').trim(), scrolled };
    })()`));
  }
  return out;
};
const plain = await walk(''), svelte = await walk('&svelte=deck');
// the file list (live Save Deck): its two items on striped rows, the rows take no clicks (they go on to the game's
// list: pass mode); the coordinator's preview was stuck because a scroll box over the rows took them
await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=filelist-save&svelte=deck`);
const files = await b.ev(`(() => {
  const h = document.getElementById('htmlui'), rows = [...h.querySelectorAll('div')].filter(d => d.className.includes('row'));
  const hit = [[400, 360], [400, 376], [700, 470]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return h.contains(e) ? e.outerHTML.slice(0, 80) : null; });
  return { text: h.innerText.replace(/\s+/g, ' ').trim(), rows: rows.length, hit };
})()`);
assert.ok(files.text.includes('deck') && files.text.includes('EQUIP TO BEAT DOWN') && files.text.includes('SAVE DECK'), files.text);
assert.equal(files.rows, 8);
assert.deepEqual(files.hit, [null, null, null]);
// past 8 rows: a native scroll box over the bar's column sets the game's bar (api.setValue); a row still takes no click
const many = JSON.parse(readFileSync(new URL('../mock/filelist-save.json', import.meta.url)));
{
  const w = many.windows[0], lb = w.controls.find(c => c.cls === 'CWindowTaskListbox');
  lb.items = Array.from({ length: 12 }, (_, i) => `Deck ${i}`);
  Object.assign(w.controls.find(c => c.parent === lb.id && c.cls === 'CWindowTaskScroll'), { shown: true, value: 0, max: 4, page: 8, length: 128 });
}
const scrolled = await b.ev(`(async () => {
  window.__render(${JSON.stringify(many)});
  const box = document.querySelector('#htmlui .yo2-scroll-list'), r = box.getBoundingClientRect();
  box.scrollTop = box.scrollHeight;
  await new Promise(ok => setTimeout(ok, 100));
  const e = document.elementFromPoint(400, 376);
  return { box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], row: document.getElementById('htmlui').contains(e) };
})()`);
assert.deepEqual(scrolled.box, [836, 352, 16, 128]);   // the bar's column: 172 + 664, the list's top
assert.equal(scrolled.row, false);
assert.ok(b.logs.some(l => /api\.setValue/.test(l) && / 4\b/.test(l)), 'scrolled to the end: setValue(bar, 4) ' + b.logs.slice(-3).join(' | '));
assert.ok(await b.ev(`performance.getEntriesByType('resource').some(r => r.name.includes('/gen/deck.js'))`), 'the Svelte build loaded');
assert.deepEqual(svelte.map(s => s.text), plain.map(s => s.text));
assert.ok(svelte[0].text.includes('ATK1400') && !svelte[1].text.includes('ATK') && svelte[3].text.includes('ATK2300') && !svelte[3].text.includes('ATK1400'));
assert.equal(svelte[4].text, '');
assert.equal(svelte[3].scrolled, 20);   // the same text, other stats: the player's place kept
assert.equal(svelte[1].scrolled, 0);    // a new text: from the top
if (b.logs.length) console.log(b.logs.join('\n'));
assert.ok(!b.logs.some(l => /error|svelte/i.test(l)), 'no page errors');
console.log('svelte deck_dom_test ok', JSON.stringify(svelte.map(s => s.scrolled)));
b.close();
process.exit(0);
