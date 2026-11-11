import { describe, expect, it } from 'vitest';
import { extractWorldMaps } from '../tools/world.mjs';
import { parseWorldMaps } from '../src/world';
import { ASTAR_DIAGONAL, astarCells, cellOf, findRoute, nearBlocked } from '../src/world/pathfinding';
import type { WalkGrid } from '../src/world/maps';

const grid = (rows: string[]): WalkGrid => ({ width: rows[0].length, height: rows.length, rows });
const cell = (p: { x: number; y: number }) => ({ x: (p.x - 10) / 20, y: (p.y - 10) / 20 });
// path.c's own reference cost (straight 1, diagonal 1.41f, +50 entering a cell with a wall within two cells)
function cost(g: WalkGrid, path: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = cell(path[i - 1]), b = cell(path[i]);
    total = Math.fround(Math.fround((nearBlocked(g, b.x, b.y) ? 50 : 0) + (a.x !== b.x && a.y !== b.y ? ASTAR_DIAGONAL : 1)) + total);
  }
  return total;
}

describe('click route: the original A* (0x00a04a30)', () => {
  it('maps world pixels to 20 px cells with the 0.05f truncation', () => {
    expect(cellOf({ x: 0, y: 19.99 })).toEqual({ x: 0, y: 0 });
    expect(cellOf({ x: 20, y: 39 })).toEqual({ x: 1, y: 1 });
  });
  it('walks round a wall it cannot cross, diagonals allowed, start cell first', () => {
    const g = grid(['1111111', '1110111', '1110111', '1110111', '1111111']);
    const path = astarCells(g, { x: 1, y: 2 }, { x: 5, y: 2 })!;
    expect(path[0]).toEqual({ x: 30, y: 50 }); expect(path.at(-1)).toEqual({ x: 110, y: 50 });
    for (let i = 1; i < path.length; i++) {
      const a = cell(path[i - 1]), b = cell(path[i]);
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
      expect(g.rows[b.y][b.x]).toBe('1');
    }
    expect(path.some(p => cell(p).y !== 2)).toBe(true);
  });
  it('pops ties in push order (neighbour order -x first), so the same grid gives the same route', () => {
    const g = grid(['111', '111', '111']);
    expect(astarCells(g, { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([{ x: 10, y: 10 }, { x: 30, y: 30 }, { x: 50, y: 50 }]);
    expect(astarCells(g, { x: 2, y: 0 }, { x: 0, y: 0 })).toEqual([{ x: 50, y: 10 }, { x: 30, y: 10 }, { x: 10, y: 10 }]);
  });
  it('returns null when the goal is walled off; findRoute keeps the exact clicked point last', () => {
    const g = grid(['11011', '11011', '11011']);
    expect(astarCells(g, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
    expect(findRoute(g, { x: 10, y: 10 }, { x: 95, y: 15 })).toBeNull();
    const open = grid(['11111']);
    expect(findRoute(open, { x: 12, y: 10 }, { x: 93, y: 7 })).toEqual([{ x: 30, y: 10 }, { x: 50, y: 10 }, { x: 70, y: 10 }, { x: 93, y: 7 }]);
    expect(findRoute(open, { x: 12, y: 10 }, { x: 15, y: 3 })).toEqual([{ x: 15, y: 3 }]);
  });
  it('on every real walk grid: routes are 8-connected over walkable cells, optimal for the original cost, and stay off walls when they can', async () => {
    const data = parseWorldMaps(await extractWorldMaps());
    let routed = 0, aroundWalls = 0;
    for (const map of data.maps) {
      const g = map.grid; if (!g) continue;
      const open: { x: number; y: number }[] = [];
      for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (g.rows[y][x] === '1') open.push({ x, y });
      for (let i = 1; i <= 6; i++) {
        const a = open[Math.floor(open.length * i / 8)], b = open[Math.floor(open.length * (7 - i) / 8)];
        const path = astarCells(g, a, b);
        expect(astarCells(g, a, b)).toEqual(path);
        if (!path) continue;
        routed++;
        expect(cell(path[0])).toEqual(a); expect(cell(path.at(-1)!)).toEqual(b);
        for (let k = 1; k < path.length; k++) {
          const p = cell(path[k - 1]), q = cell(path[k]);
          expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y))).toBe(1);
          expect(g.rows[q.y][q.x]).toBe('1');
        }
        // a straight line would cross a wall: the route bends round it
        const steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        let blocked = false;
        for (let s = 1; s < steps; s++) { const x = Math.round(a.x + (b.x - a.x) * s / steps), y = Math.round(a.y + (b.y - a.y) * s / steps); if (g.rows[y][x] !== '1') blocked = true; }
        if (blocked) aroundWalls++;
        expect(cost(g, path)).toBeGreaterThanOrEqual(steps - 1e-3);
      }
    }
    expect(routed).toBeGreaterThan(10);
    expect(aroundWalls).toBeGreaterThan(0);
  });
});
