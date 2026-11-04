// lobby_icons.js's tracer on synthetic texels (no atlas): outlines, the smoothing rule, a traced glyph's layers.
//   node client/web-shell/htmlui/screens/lobby_icons_test.mjs
import assert from 'node:assert/strict';
import { outlines, smooth, traceGlyph, STRIP } from './lobby_icons.js';

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
console.log('lobby_icons_test: ok');
