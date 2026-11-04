import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractWorldMaps } from '../tools/world.mjs';
import { cellCenter, findPath, isWalkable, nearBlocked, parseWorldMaps, segmentWalkable } from '../src/world';

// Read repository source directly: no proprietary row fixtures copied into tracked tests.
const source = new URL('../../src/Game/', import.meta.url);
describe('C++ source comparison', () => {
  it('extracts all eight masks, ten map records, bounded entries and source dimensions', async () => {
    const data = parseWorldMaps(await extractWorldMaps());
    expect(data.maps).toHaveLength(10);
    expect(data.maps.map(m => m.grid && [m.grid.width, m.grid.height])).toEqual([[128,90], [102,77], [102,90], [102,77], [102,77], [102,77], [102,77], [102,77], null, null]);
    expect(data.maps.map(m => m.entries.length)).toEqual([10,7,8,10,10,10,10,10,1,9]);
    // END=12 terminates; from=11 remains reserved rather than becoming a fake exit.
    expect(data.maps[1].entries.some(e => e.from === 11)).toBe(true);
    expect(data.maps.flatMap(m => m.entries).some(e => e.from === 12)).toBe(false);
    expect(data.maps[0].entries[0]).toEqual({ from: 2, x: 1700, y: 230, direction: 1 });
    expect(data.maps[8].entries).toEqual([{ from: 8, x: 680, y: 400, direction: 0 }]);
    expect(data.maps[0].exits).toEqual([{ to: 1 }, { to: 2 }, { to: 3 }]);
  });
  it('matches source cell centers, row-major walkability and 24-neighbor flags on every source cell', async () => {
    const data = parseWorldMaps(await extractWorldMaps());
    const cpp = await readFile(new URL('yo2FieldWalk.cpp', source), 'utf8');
    expect(cpp).toContain('x * 20 + 10'); expect(cpp).toContain('y * 20 + 10'); expect(cpp).toContain('dy = -2; dy <= 2'); expect(cpp).toContain('dx = -2; dx <= 2');
    let mismatch: string | null = null;
    for (const map of data.maps) {
      const g = map.grid; if (!g) continue;
      for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
        const p = cellCenter(x,y);
        if (isWalkable(g,p) !== (g.rows[y][x] === '1')) mismatch = `${map.name} walk ${x},${y}`;
        let expected = false;
        for (let yy = Math.max(0,y-2); yy <= Math.min(g.height-1,y+2); yy++) for (let xx = Math.max(0,x-2); xx <= Math.min(g.width-1,x+2); xx++) {
          if ((xx !== x || yy !== y) && g.rows[yy][xx] === '0') expected = true;
        }
        if (nearBlocked(g,x,y) !== expected) mismatch = `${map.name} neighbor ${x},${y}`;
      }
    }
    expect(mismatch).toBeNull();
  });
  it('keeps deterministic paths collision-safe on extracted maps, with explicit unreachable outcomes', async () => {
    const data = parseWorldMaps(await extractWorldMaps());
    for (const map of data.maps) {
      const g = map.grid; if (!g) continue;
      const open = []; for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (g.rows[y][x] === '1') open.push(cellCenter(x,y));
      let found = 0;
      for (let i = 1; i <= 8; i++) {
        const a = open[Math.floor(open.length * i / 10)], b = open[Math.floor(open.length * (9-i) / 10)];
        const path = findPath(g,a,b); expect(findPath(g,a,b)).toEqual(path);
        if (!path) continue;
        found++; let previous = a;
        for (const point of path) { expect(segmentWalkable(g,previous,point)).toBe(true); previous = point; }
      }
      expect(found).toBeGreaterThan(0);
    }
  });
  it('pins the source-supported movement constants and cadence used by the browser', async () => {
    const avatar = await readFile(new URL('Avatar/yo2ChibiAvatarElm.cpp', source), 'utf8');
    const app = await readFile(new URL('../System/yo2App.cpp', source), 'utf8');
    expect(avatar).toContain('v.setLength(6.0f)'); expect(avatar).toContain('const float keep = 0.9f');
    expect(avatar).toContain('v.length() > 6.0f * 0.2f'); expect(avatar).toContain('d.length() < 6.0f');
    expect(app).toContain('yo2FpsTimerSetFps(30)');
  });
});
