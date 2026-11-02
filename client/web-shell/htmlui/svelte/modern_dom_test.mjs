// Modern UI windows open in place (owner: "keeps opening from the bottom left and flickers"), headless (mock.html
// ?modern=1, live snapshots: mock/modern-room.json, dialog-yesno.json, playerselect-live.json). For each window, the
// frame it first appears in (render, then read before the browser runs a single animation frame):
// - its root is the game's rect;
// - nothing in it is animating, and its plate is opaque where it ends up (the game draws its own window for that first
//   frame: a plate fading or rising in showed it through);
// - nothing restarts when the layer is hidden through a scene load and shown again.
//   npm run build && node svelte/modern_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8980 + process.pid % 9;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({});
await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=modern-room&modern=1`);
// layout shifts (Chrome's layout-shift entries) of anything inside a window, the whole run long: a window appearing
// in place is not one; content moving inside it (a line put in above others on hover) is
await b.ev(`window.__shifts = []; new PerformanceObserver(l => { for (const e of l.getEntries()) for (const s of e.sources || [])
  if (s.node?.closest?.('.win')) window.__shifts.push([s.node.closest('.win').dataset.cls, s.node.tagName, Math.round(s.previousRect.y), Math.round(s.currentRect.y)]); }).observe({ type: 'layout-shift' })`);

const mock = n => JSON.parse(readFileSync(path.join(here, '../mock', n + '.json'), 'utf8')).windows;
const [bar, ...wins] = [...mock('modern-room'), ...mock('dialog-yesno'), ...mock('playerselect-live')];
assert.equal(bar.cls, 'CWindowModelMenu');
// the state of each window root as painted: its rect, the running animations in it, its first box's rect and opacity
const state = `[...document.querySelectorAll('#htmlui > .win')].map(r => {
  const p = r.querySelector('.mu-plate') || r.querySelector('.mu > *'), q = p?.getBoundingClientRect(), rr = r.getBoundingClientRect();
  return { cls: r.dataset.cls, root: [rr.x, rr.y, rr.width, rr.height], anim: r.getAnimations({ subtree: true }).filter(a => a.playState === 'running').map(a => a.animationName || a.transitionProperty),
    plate: q && [q.x, q.y, q.width, q.height].map(Math.round), opacity: p && +getComputedStyle(p).opacity };
})`;
const frame = 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))';
for (const w of wins) {
  await b.ev(`window.__render(${JSON.stringify({ v: 1, scene: 10, windows: [bar], tasks: [] })})`);
  await b.ev(frame);
  // the window's first frame: rendered and read in the same task
  const first = (await b.ev(`(() => { window.__render(${JSON.stringify({ v: 1, scene: 10, windows: [bar, w], tasks: [] })}); return ${state}; })()`))
    .find(s => s.cls === w.cls);
  assert.ok(first, w.cls + ' mounted');
  assert.deepEqual(first.root, [w.x, w.y, w.w, w.h], w.cls + ': its root is the game rect from its first frame');
  // a backdrop scrim may fade; the window's own plate never moves or fades in
  // (no arrival pass either: a glow after the window is there read as lag)
  assert.deepEqual(first.anim.filter(a => !/(^|-)(mu-)?fade$/.test(a)), [], w.cls + ': nothing in it animates as it opens');
  assert.equal(first.opacity, 1, w.cls + ': its plate is opaque from its first frame');
  await new Promise(r => setTimeout(r, 600));
  const later = (await b.ev(state)).find(s => s.cls === w.cls);
  assert.deepEqual(later.plate, first.plate, w.cls + ': its plate is where it was on its first frame');
  // hidden through a scene load, then shown: nothing starts again
  await b.ev(`document.getElementById('htmlui-host').hidden = true`); await b.ev(frame);
  await b.ev(`document.getElementById('htmlui-host').hidden = false`);
  const again = (await b.ev(state)).find(s => s.cls === w.cls);
  assert.deepEqual(again.anim, [], w.cls + ': nothing replays when the layer is shown again');
  assert.deepEqual(again.plate, first.plate, w.cls + ': in place after the layer is shown again');
  console.log('ok', w.cls, first.plate.join(','));
}
// Duel Options: its help keeps its place as the options are hovered (the hovered option's name went in above it)
{
  const w = wins.find(w => w.cls === 'CWindowModelDuelConfig');
  await b.ev(`window.__render(${JSON.stringify({ v: 1, scene: 10, windows: [bar, w], tasks: [] })})`);
  await b.ev(frame);
  const at = () => b.ev(`(() => { const p = document.querySelector('.win[data-cls=CWindowModelDuelConfig] .help p'), q = p.getBoundingClientRect(), r = p.closest('.mu-plate').getBoundingClientRect(); return [q.y, r.height]; })()`);
  const before = await at();
  for (let i = 0; i < 4; i++) {
    await b.ev(`[...document.querySelectorAll('.win[data-cls=CWindowModelDuelConfig] .opt')][${i}]?.dispatchEvent(new PointerEvent('pointerenter'))`);
    await b.ev(frame);
    assert.deepEqual(await at(), before, 'Duel Options: the help and the panel stay put on hover ' + i);
  }
}
await new Promise(r => setTimeout(r, 300));
assert.deepEqual(await b.ev('window.__shifts'), [], 'no layout shift inside any window');
b.close();
console.log('modern_dom_test: ok');
process.exit(0);
