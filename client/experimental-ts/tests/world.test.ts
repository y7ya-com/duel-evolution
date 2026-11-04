import { describe, expect, it } from 'vitest';
import { CELL_SIZE, WORLD_TICK_MS, WorldNavigator, cellCenter, directionFromVector, findPath, isWalkable, loadWorldMaps, nearBlocked, parseWorldMaps, segmentWalkable, validateGrid } from '../src/world';
import type { Point, WorldMap, WorldPosition } from '../src/world';
function grid(rows: string[]) { return validateGrid({ width: rows[0].length, height: rows.length, rows }); }
function map(rows: string[]): WorldMap { const g = grid(rows); return { id: 0, name: 'Map_test', width: g.width * 20, height: g.height * 20, grid: g, entries: [], exits: [], npcSpots: [] }; }
function jsonMap(rows = ['111', '101', '111']) { return { version: 1, maps: [map(rows)] }; }
function ticks(nav: WorldNavigator, count: number) { for (let i = 0; i < count; i++) nav.update(WORLD_TICK_MS); }

describe('source walk grid invariants', () => {
  it('uses 20 px cells centered at +10 and blocks out of bounds', () => {
    const g = grid(['10', '11']); expect(CELL_SIZE).toBe(20); expect(cellCenter(1, 2)).toEqual({ x: 30, y: 50 });
    expect(isWalkable(g, { x: 19.999, y: 0 })).toBe(true); expect(isWalkable(g, { x: 20, y: 0 })).toBe(false);
    for (const p of [{ x: -1, y: 0 }, { x: 40, y: 21 }, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) expect(isWalkable(g, p)).toBe(false);
  });
  it('nearBlocked checks the 24 neighbors within two cells but not out of bounds or self', () => {
    const g = grid(['01111', '11111', '11111', '11111']);
    expect(nearBlocked(g, 2, 2)).toBe(true); expect(nearBlocked(g, 3, 3)).toBe(false);
    expect(nearBlocked(grid(['0']), 0, 0)).toBe(false); expect(nearBlocked(grid(['1']), 0, 0)).toBe(false);
  });
  it('reproduces avatar eight-way direction convention', () => {
    expect([[0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1]].map(([x, y]) => directionFromVector(x, y))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('bounded deterministic pathfinding', () => {
  it('routes around a wall without cutting corners, preserving exact target', () => {
    const g = grid(['11111', '10101', '11101', '10001', '11111']), a = { x: 11, y: 11 }, b = { x: 89, y: 89 };
    const path = findPath(g, a, b)!; expect(path.length).toBeGreaterThan(0); expect(path.at(-1)).toEqual(b); expect(findPath(g, a, b)).toEqual(path);
    let prev = a; for (const point of path) { expect(segmentWalkable(g, prev, point)).toBe(true); prev = point; }
  });
  it('returns null for blocked, invalid, disconnected and exhausted requests', () => {
    const g = grid(['101', '101', '101']);
    expect(findPath(g, { x: 10, y: 10 }, { x: 50, y: 10 })).toBeNull();
    expect(findPath(g, { x: 10, y: 10 }, { x: 30, y: 10 })).toBeNull();
    expect(findPath(g, { x: -1, y: 10 }, { x: 10, y: 10 })).toBeNull();
    expect(findPath(grid(['11111']), { x: 10, y: 10 }, { x: 90, y: 10 }, 1)).toBeNull();
  });
  it('checks whole segments including a blocked corner touch and long wall crossing', () => {
    expect(segmentWalkable(grid(['10', '01']), { x: 10, y: 10 }, { x: 30, y: 30 })).toBe(false);
    expect(segmentWalkable(grid(['101']), { x: 1, y: 1 }, { x: 59, y: 1 })).toBe(false);
    expect(segmentWalkable(grid(['11', '11']), { x: 20, y: 20 }, { x: 0, y: 0 })).toBe(true);
  });
  it('coalesces a straight corridor for full source-supported speed', () => {
    expect(findPath(grid(['111111']), { x: 10, y: 10 }, { x: 110, y: 10 })).toEqual([{ x: 110, y: 10 }]);
    expect(findPath(grid(['1']), { x: 1, y: 1 }, { x: 19, y: 19 })).toEqual([{ x: 19, y: 19 }]);
  });
});

describe('navigator lifecycle and source movement', () => {
  it('uses source 6 px step, 0.9 smoothing, 1.2 threshold and 30 Hz, not immediate teleport', () => {
    const sent: WorldPosition[] = [], nav = new WorldNavigator({ send: p => sent.push(p) });
    nav.reset(map(['1'.repeat(100)]), { x: 10, y: 10, direction: 0 }); expect(nav.moveTo({ x: 1900, y: 10 })).toBe(true);
    ticks(nav, 2); expect(nav.position?.x).toBe(10); ticks(nav, 1); expect(nav.position?.x).toBeCloseTo(11.626);
    ticks(nav, 27); expect(nav.position!.x).toBeGreaterThan(130); expect(nav.position!.x).toBeLessThan(190);
    const before = nav.position!.x; ticks(nav, 30); expect(nav.position!.x - before).toBeCloseTo(180, -1);
    expect(sent.every(p => Number.isInteger(p.x) && p.direction === 6)).toBe(true);
  });
  it('walks every emitted segment around a blocked obstacle and finishes exact target', () => {
    const m = map(['11111', '10111', '11111']), sent: WorldPosition[] = [];
    const nav = new WorldNavigator({ send: p => sent.push(p) }), initial = { x: 10, y: 10, direction: 0 };
    nav.reset(m, initial); nav.moveTo({ x: 90, y: 50 }); ticks(nav, 300);
    expect(nav.moving).toBe(false); expect(nav.position).toMatchObject({ x: 90, y: 50 });
    let previous: Point = initial; for (const p of sent) { expect(segmentWalkable(m.grid!, previous, p)).toBe(true); expect(Math.hypot(p.x - previous.x, p.y - previous.y)).toBeLessThan(8); previous = p; }
  });
  it('replaces targets, cancels invalid targets, resets scenes and disposes without later sends', () => {
    const sent: WorldPosition[] = [], nav = new WorldNavigator({ send: p => sent.push(p) }), m = map(['11111']);
    nav.reset(m, { x: 10, y: 10, direction: 0 }); nav.moveTo({ x: 90, y: 10 }); ticks(nav, 6);
    const now = nav.position!; expect(nav.moveTo({ x: 1, y: 10 })).toBe(true); ticks(nav, 100); expect(nav.position?.x).toBe(1);
    nav.moveTo({ x: 90, y: 10 }); expect(nav.moveTo({ x: -1, y: 10 })).toBe(false); expect(nav.moving).toBe(false);
    nav.reset(m, now); expect(nav.position).toEqual(now); nav.moveTo({ x: 90, y: 10 }); nav.cancel();
    const count = sent.length; ticks(nav, 50); expect(sent.length).toBe(count);
    nav.dispose(); nav.dispose(); nav.reset(m, now); expect(nav.moveTo({ x: 10, y: 10 })).toBe(false); ticks(nav, 50); expect(sent.length).toBe(count); expect(nav.position).toBeNull();
  });
  it('refuses gridless and blocked spawns, and bounds stalled-frame travel', () => {
    const nav = new WorldNavigator({ send() {} }), m = map(['101']);
    nav.reset(m, { x: 30, y: 10, direction: 0 }); expect(nav.moveTo({ x: 10, y: 10 })).toBe(false);
    nav.reset({ ...m, grid: null }, { x: 10, y: 10, direction: 0 }); expect(nav.moveTo({ x: 50, y: 10 })).toBe(false);
    nav.reset(map(['1'.repeat(100)]), { x: 10, y: 10, direction: 0 }); nav.moveTo({ x: 1900, y: 10 }); nav.update(100000);
    expect(nav.position!.x).toBeLessThan(58); const p = nav.position; nav.update(0); expect(nav.position).toEqual(p);
  });
  it('is deterministic across frame chunking below catch-up cap', () => {
    const a = new WorldNavigator({ send() {} }), b = new WorldNavigator({ send() {} });
    for (const n of [a,b]) { n.reset(map(['1'.repeat(100)]), { x: 10, y: 10, direction: 0 }); n.moveTo({ x: 1900, y: 10 }); }
    for (let i = 0; i < 120; i++) a.update(1000 / 120); ticks(b, 30); expect(a.position).toEqual(b.position);
  });
});

describe('bounded map parser and loader', () => {
  it('accepts synthetic maps, freezes rows and rejects corrupt/oversized grids', () => {
    const data = parseWorldMaps(jsonMap()); expect(data.maps[0].grid!.rows).toEqual(['111', '101', '111']); expect(Object.isFrozen(data.maps[0].grid!.rows)).toBe(true);
    for (const bad of [{ width: 257, height: 1, rows: ['1'] }, { width: 2, height: 1, rows: ['1'] }, { width: 1, height: 1, rows: ['x'] }, { width: 1, height: 2, rows: ['1'] }]) expect(() => validateGrid(bad)).toThrow();
    expect(() => parseWorldMaps({ version: 2, maps: [] })).toThrow(); expect(() => parseWorldMaps({ version: 1, maps: [map(['1']), map(['1'])] })).toThrow();
    const bad = jsonMap(); bad.maps[0].width = 1; expect(() => parseWorldMaps(bad)).toThrow();
  });
  it('loads bounded JSON and rejects HTTP, malformed and oversized streams', async () => {
    const fetcher = (body: string, status = 200) => (async () => new Response(body, { status })) as typeof fetch;
    expect((await loadWorldMaps('/test', { fetch: fetcher(JSON.stringify(jsonMap())) })).maps).toHaveLength(1);
    await expect(loadWorldMaps('/test', { fetch: fetcher('no', 404) })).rejects.toThrow('HTTP');
    await expect(loadWorldMaps('/test', { fetch: fetcher('{') })).rejects.toThrow();
    await expect(loadWorldMaps('/test', { fetch: fetcher(' '.repeat(1024 * 1024 + 1)) })).rejects.toThrow('too large');
  });
});

describe('collision boundary regressions', () => {
  it('never emits a coordinate rounded into an adjacent blocked cell', () => {
    const m = map(['10']), sent: WorldPosition[] = [];
    const nav = new WorldNavigator({ send: p => sent.push(p) });
    nav.reset(m, { x: 10, y: 10, direction: 0 }); nav.moveTo({ x: 19.99, y: 10 }); ticks(nav, 50);
    expect(nav.position?.x).toBe(19.99); expect(sent.every(p => isWalkable(m.grid!, p))).toBe(true);
  });
  it('does not leak a route after a scene reset from inside the send callback', () => {
    const m = map(['11111']); let calls = 0;
    const nav = new WorldNavigator({ send() { calls++; nav.reset(m, { x: 10, y: 10, direction: 0 }); } });
    nav.reset(m, { x: 10, y: 10, direction: 0 }); nav.moveTo({ x: 90, y: 10 }); ticks(nav, 50);
    expect(calls).toBe(1); expect(nav.position).toEqual({ x: 10, y: 10, direction: 0 }); expect(nav.moving).toBe(false);
  });
  it('handles exact negative-direction grid boundaries without stepping through a wall', () => {
    const g = grid(['101', '111']);
    expect(segmentWalkable(g, { x: 40, y: 30 }, { x: 10, y: 30 })).toBe(true);
    expect(segmentWalkable(g, { x: 40, y: 10 }, { x: 10, y: 10 })).toBe(false);
  });
});
