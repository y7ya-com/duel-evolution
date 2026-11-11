// npm run build && node svelte/deck_limits_dom_test.mjs
// Check the actual rendered marks, not just vectorArt's classification: the Svelte port used to draw stars.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launch } from '../tools/cdp.mjs';

const port = 8990 + process.pid % 9;
const srv = spawn('node', [new URL('../serve.mjs', import.meta.url).pathname, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({});
const cards = [0, 1, 2, 3].map(limit => ({ id: limit + 1, name: `Card ${limit}`, limit, kind: 1, attr: 1, race: 1, level: 4, atk: 1000, def: 1000 }));
const sprite = (id, tex, x, z, src) => ({ id, tex, src, wx: x, wy: 100, wz: z, sx: 1, sy: 1, shown: true });
const win = { id: 1, cls: 'CWindowModelDeck', x: 248, y: 0, w: 488, h: 712, z: 1, wz: 1, shown: true, alpha: 1, extras: [], controls: cards.map(c => ({
  id: 10 + c.id, cls: 'CWindowTaskDeckCard', card: c.id, x: 0, y: 0, shown: true, parts: { sprites: [
    sprite(100 + c.id, `data/MINI/${c.id}.png`, 260 + c.id * 60, 10, [0, 0, 50, 72]),
    { ...sprite(200 + c.id, 'data/common/icon/icon_seigen_01.png', 260 + c.id * 60, 11, [c.limit * 16, 0, 16, 16]), shown: c.limit < 3 },
  ] },
})) };
const snap = { v: 1, scene: 0x25, windows: [win], tasks: [] };
const marks = `([...document.querySelectorAll('#htmlui svg')].filter(s => s.querySelector('circle[fill="#d80000"]')).map(s => ({
  digit: s.querySelector('text')?.textContent || '', forbidden: !!s.querySelector('circle[stroke="#fff"]'),
  width: s.getBoundingClientRect().width, height: s.getBoundingClientRect().height,
})))`;
const expected = [0, 1, 2].map(i => ({ digit: i ? String(i) : '', forbidden: i === 0, width: 16, height: 16 }));
try {
  for (const query of ['', '&svelte=deck', '&modern=1']) {
    await b.go(`http://127.0.0.1:${port}/htmlui/mock.html?s=deck${query}`);
    await b.ev(`window.__render(${JSON.stringify(snap)})`);
    assert.deepEqual(await b.ev(marks), expected, `all restriction marks in renderer ${query || 'plain'}`);
  }
  // The owned modern editor uses card metadata, rather than the engine's sprite tree.
  const editor = { ...snap, scene: 0x24, windows: [{ ...win, controls: [{ id: 2, cls: 'CWindowTaskDeck', x: 0, y: 0, shown: true,
    grids: { main: [1, 2, 3, 4], side: [1, 2, 3], extra: [2] }, counts: { main: 4, side: 3, extra: 1, missing: 0 } }] }] };
  await b.ev(`(() => {
    window.__render({v: 1, windows: [], tasks: []});
    const cards = ${JSON.stringify(cards)};
    window.yo2Deck = { v: 1, cards: () => cards, card: id => cards.find(c => c.id === id), trunk: cards.map(c => [c.id, 3]), desc: () => '', dlg: () => '' };
    window.yo2Html = { snapshot: () => (${JSON.stringify(editor)}) };
    window.__render(${JSON.stringify(editor)});
  })()`);
  const badges = await b.ev(`[...document.querySelectorAll('.restriction')].map(e => ({ label: e.getAttribute('aria-label'), digit: e.querySelector('text')?.textContent || '' }))`);
  const labels = ['Forbidden', 'Limited', 'Semi-limited'];
  assert.deepEqual(badges, [0, 1, 2, 1, 0, 1, 2, 0, 1, 2].map(i => ({ label: labels[i], digit: i ? String(i) : '' })), 'Main, Fusion, Side and trunk badges; unlimited cards have none');
  assert.deepEqual(await b.ev(marks), [0, 1, 2, 1, 0, 1, 2, 0, 1, 2].map(i => expected[i]), 'modern badges have visible 16px SVGs');
  assert.ok(!b.logs.some(l => /exception|error|svelte/i.test(l)), b.logs.join('\n'));
  console.log('deck_limits_dom_test ok: plain, Svelte, modern swap, modern editor');
} finally {
  b.close();
  srv.kill();
}
