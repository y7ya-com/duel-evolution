// lobby_icons.js's tracer on synthetic texels (no atlas): outlines, the smoothing rule, a traced glyph's layers.
//   node client/web-shell/htmlui/screens/lobby_icons_test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { outlines, smooth, traceGlyph, STRIP } from './lobby_icons.js';
// web-shell/ui.js is client/html-ui/ui.js (serve.mjs and the ship map it there): for lobby.js below
registerHooks({ resolve: (spec, ctx, next) => spec.endsWith('/ui.js')
  ? { ...next(new URL('../../../html-ui/ui.js', import.meta.url).href, ctx), format: 'module' } : next(spec, ctx) });

const mask = rows => ({ m: Uint8Array.from(rows.join('').split('').map(c => c === '#' ? 1 : 0)), w: rows[0].length, h: rows.length });

// a box: one loop, its four corners kept square
{
  const { m, w, h } = mask(['....', '.##.', '.##.', '....']);
  const L = outlines(m, w, h);
  assert.equal(L.length, 1);
  assert.equal(smooth(L[0]), 'M1 1L3 1L3 3L1 3Z');
}
// a ring: an outer and an inner loop (evenodd makes the hole)
{
  const { m, w, h } = mask(['#####', '#...#', '#...#', '#####']);
  assert.equal(outlines(m, w, h).length, 2);
}
// a 1-texel line keeps its square caps (not a diamond)
{
  const { m, w, h } = mask(['......', '.####.', '......']);
  assert.equal(smooth(outlines(m, w, h)[0]), 'M1 1L5 1L5 2L1 2Z');
}
// a staircase: its steps become one slope through the edges' midpoints
{
  const { m, w, h } = mask(['#...', '##..', '###.', '####']);
  const d = smooth(outlines(m, w, h)[0]);
  assert.ok(/0\.5|1\.5|2\.5/.test(d), d);
  assert.ok(!d.includes('L1 1L'), 'no square stair corner: ' + d);
}
// diagonal neighbours stay one shape
{
  const { m, w, h } = mask(['#.', '.#']);
  assert.equal(outlines(m, w, h).length, 1);
}
// a glyph on a plate: the plate texels are left out, the glyph's layers painted, outermost first
{
  const W = 8, H = 4, P = [250, 200, 60, 255], cell = [], plate = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    plate.push(P);
    const inner = x >= 3 && x <= 4 && y >= 1 && y <= 2, outer = x >= 2 && x <= 5;
    cell.push(inner ? [0, 104, 242, 255] : outer ? [255, 255, 255, 255] : P);
  }
  const svg = traceGlyph(cell, plate, W, H);
  const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(fills, ['#ffffff', '#0068f2']);
  assert.ok(!svg.includes('#fac83c'), 'no plate layer');
}
// the strip's bands cover its 32 rows once
assert.equal(STRIP.reduce((n, [, h]) => n + h, 0), 32);
STRIP.forEach(([y, h], i) => i && assert.equal(y, STRIP[i - 1][0] + STRIP[i - 1][1]));
// the menu bar's hole for its notice icons (lobby.js noticeHole): the live friend notice (a 32 x 32 plate and a 48 x 48
// glow at world (248, 736) in the bar at (0, 736)), 16 px left of them, 8 right; none without a shown notice
{
  const { noticeHole } = await import('./lobby.js');
  const spr = (w, h) => ({ shown: true, src: [0, 0, w, h], wx: 248, wy: 736, sx: 1, sy: 1 });
  const notice = (shown, sprites) => ({ cls: 'CNoticeIconFriend', x: 232, y: -16, w: 0, h: 0, shown, parts: { sprites } });
  const bar = controls => ({ x: 0, y: 736, controls: [{ cls: 'CWindowTaskMenubar', shown: true }, ...controls] });
  assert.deepEqual(noticeHole(bar([notice(true, [spr(32, 32), spr(48, 48)])])), { x: 232, w: 72 });
  assert.equal(noticeHole(bar([notice(false, [spr(32, 32)])])), null);
  assert.equal(noticeHole(bar([])), null);
  assert.deepEqual(noticeHole(bar([notice(true, [])])), { x: 216, w: 72 });   // no parts: its own place, 48 wide
}
// the message field (lobby.js fieldLeft): the art's x 391 until the page's own buttons (reserveBar) reach past it, then a
// plate's gap (8 px) after the last; its right edge stays at 1017
{
  const { fieldLeft } = await import('./lobby.js');
  const { reserveBar, barReserve, onBarReserve } = await import('./lobby_icons.js');
  const win = { x: 0 };
  assert.equal(fieldLeft(win, 0), 391);
  assert.equal(fieldLeft(win, 320), 391, 'My Room: Wardrobe and Missions end at 320, the field stays');
  assert.equal(fieldLeft(win, 400), 408, "a lobby's three buttons, then Wardrobe and Missions: 8 px after 400");
  assert.equal(fieldLeft(win, 480), 488, 'a notice slot more');
  let calls = 0;
  const off = onBarReserve(() => calls++);
  reserveBar('wardrobe', 320); reserveBar('missions', 400); reserveBar('missions', 400);
  assert.equal(barReserve(), 400); assert.equal(calls, 2, 'a change only');
  reserveBar('missions', 0);
  assert.equal(barReserve(), 320);
  reserveBar('wardrobe', 0); off();
  assert.equal(barReserve(), 0);
}
console.log('lobby_icons_test: ok');
