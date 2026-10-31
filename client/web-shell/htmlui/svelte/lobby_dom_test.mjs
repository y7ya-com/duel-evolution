// The lobby's windows (Main Menu, place banner, menu bar) and character creation walked through the layer in headless
// Chrome (mock.html), plain screens/lobby.js + avatar.js and the Svelte groups, through states that change in place: a
// button hovered then pressed then gone, the close box pressed, the message and the banner's text replaced, a category
// chosen then another, an arrow hovered then pressed, every window closed. At each step both draw the same boxes (rect,
// background, text, state), none left over from the last.   npm run build && node svelte/lobby_dom_test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from '../tools/cdp.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8990 + process.pid % 9;
const srv = spawn('node', [path.join(here, '../serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => srv.kill());
await new Promise(ok => srv.stdout.once('data', ok));
const b = await launch({});

const ctl = (id, cls, extra = {}) => ({ id, cls, parent: 0, x: 0, y: 0, w: 0, h: 0, shown: true, alpha: 1, state: 'normal', ...extra });
const win = (id, cls, extra, controls) => ({ id, cls, x: 0, y: 0, w: 0, h: 0, z: id, wz: id, shown: true, alpha: 1, controls, ...extra });
const art = (tex, u, w, h) => ({ normal: { tex, src: [u, 0, w, h], shown: true } });
const lobby = (b1, b2, closed, msg, area) => [
  win(10, 'CMainMenu', { x: 20, y: 300, w: 240, h: 200 }, [
    ctl(11, 'CWindowTaskShadowText', { text: 'Main Menu', x: 8, y: 4, w: 200 }),
    ctl(12, 'CWindowTaskIconHide', { x: 214, y: 2, w: 20, h: 20, pressed: closed }),
    ctl(13, 'CWindowTaskButtonMain', { label: 'Duel', x: 12, y: 40, w: 216, h: 24, state: b1 }),
    ...b2 ? [ctl(14, 'CWindowTaskButtonMain', { label: 'Deck Edit', x: 12, y: 70, w: 216, h: 24, state: b2 })] : []]),
  win(20, 'CWindowModelPlace', {}, [ctl(21, 'CWindowTaskFramePlace', { x: 8, y: 8, w: 300, h: 52 }),
    ctl(22, 'CWindowTaskShadowText', { text: area, x: 20, y: 24, w: 260 })]),
  win(30, 'CWindowModelMenu', { y: 736, w: 384, h: 32 }, [ctl(31, 'CWindowTaskMenubar'),
    ctl(32, 'CWindowTaskText', { text: msg, x: 400, y: 9 })])];
const avatar = (chosen, arrow, col) => [win(40, 'CWindowDialogAvatarSwitch', { w: 336, h: 550 }, [
  ...[0, 1, 2].map(i => ctl(41 + i, 'CWindowTaskPictureSwitch', { x: 340, y: 60 + 48 * i, w: 324, h: 44, checked: i === chosen,
    art: art('x/abmake_btn_01_c01.png', 324 * (i === chosen ? 2 : col), 324, 44) })),
  ctl(45, 'CWindowTaskPictureSwitch', { x: 960, y: 600, w: 32, h: 64, art: art(`x/shop_arrow_${arrow}_c01.png`, 0, 32, 64) }),
  ctl(46, 'CWindowTaskText', { text: 'Hair', x: 340, y: 66, w: 324, align: 1, fontSize: 32 })])];
const snap = windows => ({ v: 1, scene: 0x19, windows, tasks: [] });
const steps = [snap(lobby('hover', 'normal', false, 'Welcome', 'Duelist Academy')),
  snap(lobby('pressed', null, true, 'Saved', 'Pier')), snap(avatar(-1, '04', 0)), snap(avatar(0, '05', 1)),
  snap(avatar(2, '06', 0)), snap([])];

// every drawn box (an element with a size, or with text of its own), as rect, background, text and state, sorted
const walk = async q => {
  await b.go(`http://127.0.0.1:${PORT}/htmlui/mock.html?s=playerselect${q}`);
  const out = [];
  for (const s of steps) out.push(await b.ev(`(async () => {
    window.__render(${JSON.stringify(s)});
    await new Promise(r => setTimeout(r, 300));   // plain lobby.js draws the bar once its icon sheet has loaded
    return [...document.querySelectorAll('#htmlui *')].map(e => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e), own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join('').trim();   // (Svelte keeps whitespace between elements)
      if (!(r.width && r.height) && !own) return null;
      return [r.x, r.y, r.width, r.height].map(v => v.toFixed(1)).join() + ' ' + cs.backgroundColor + ' ' + cs.backgroundImage.slice(0, 60) +
        ' ' + cs.borderTopColor + ' ' + own + ' ' + (e.dataset.state || '') + (e.dataset.look || '');
    }).filter(Boolean).sort();
  })()`));
  return out;
};
const plain = await walk(''), svelte = await walk('&svelte=lobby,avatar');
assert.ok(await b.ev(`['lobby', 'avatar'].every(g => performance.getEntriesByType('resource').some(r => r.name.endsWith('/gen/' + g + '.js')))`), 'the Svelte builds loaded');
steps.forEach((_, i) => assert.deepEqual(svelte[i], plain[i], 'step ' + i));
const has = (i, s) => svelte[i].some(l => l.includes(s));
assert.ok(has(0, 'Welcome') && has(0, 'Deck Edit') && has(0, 'hover') && !has(1, 'Deck Edit') && !has(1, 'Welcome') && has(1, 'Pier'));
assert.ok(has(3, 'hover') && has(4, 'pressed') && !has(4, 'hover'));
assert.equal(svelte[5].length, 0);
// the Move list (Svelte only): a long place name's row (336 wide) widens the frame to the row + 38, the × and the
// bar's gutter at its edge - 24, the row ending left of the gutter (live on phase3: it ran into the gutter)
const move = snap([win(50, 'CWindowModelMove', { x: 364, y: 178, w: 296, h: 188 }, [ctl(51, 'CWindowTaskFrameMove', { alpha: 0.9 }),
  ctl(52, 'CWindowTaskButtonDuel', { label: 'Domino City Clock Square[14]  0/32', x: 11, y: 24, w: 336, h: 24, color: [1, 1, 1, 1] }),
  ctl(53, 'CWindowTaskButtonDuel', { label: 'Store[2]  0/32', x: 11, y: 50, w: 323, h: 24, color: [1, 1, 1, 1] }),
  ctl(54, 'CWindowTaskIconHide', { x: 350, y: 0, w: 16, h: 24 })])]);
const m = await b.ev(`(() => {
  window.__render(${JSON.stringify(move)});
  const r = s => document.querySelector(s)?.getBoundingClientRect();
  const frame = [...document.querySelectorAll('#htmlui div')].find(d => getComputedStyle(d).opacity === '0.9')?.getBoundingClientRect();
  return { frame: frame && [frame.x, frame.width], rows: [...document.querySelectorAll('.yo2-dbtn')].map(e => e.getBoundingClientRect().right), close: r('.yo2-close')?.x };
})()`);
assert.deepEqual(m.frame, [364, 374], 'the frame: the widest row + 38');
assert.equal(m.close, 364 + 350);
assert.ok(m.rows.length === 2 && m.rows.every(x => x <= 364 + 374 - 24), 'every row left of the gutter: ' + m.rows);
if (b.logs.length) console.log(b.logs.join('\n'));
assert.ok(!b.logs.some(l => /error|svelte/i.test(l)), 'no page errors');
console.log('svelte lobby_dom_test ok', svelte.map(s => s.length).join());
b.close();
process.exit(0);
