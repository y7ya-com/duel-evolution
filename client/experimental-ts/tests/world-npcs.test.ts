import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultExe, extractNpcSpots, withNpcSpots } from '../tools/npc-spots.mjs';
import { parseWorldMaps } from '../src/world/maps';
import { npcsOnMap, npcStance } from '../src/world/npcs';

/** A tiny PE32: one section at VA 0x00401000 holding the two spot lookups (the exe's instruction shape) and two
 * synthetic tables, so the extractor is tested without any of the original exe's bytes. */
function syntheticPe(records: { famous: number[][]; area: number[][] }) {
  const sectionVa = 0x00401000, raw = 0x400, size = 0x00d10000 - sectionVa + 0x1000, exe = new Uint8Array(raw + size), dv = new DataView(exe.buffer);
  dv.setUint16(0, 0x5a4d, true); dv.setUint32(0x3c, 0x80, true); dv.setUint32(0x80, 0x4550, true);
  dv.setUint16(0x86, 1, true); dv.setUint16(0x94, 0xe0, true); dv.setUint32(0x80 + 52, 0x00400000, true);
  const s = 0x80 + 24 + 0xe0; dv.setUint32(s + 8, size, true); dv.setUint32(s + 12, sectionVa - 0x00400000, true); dv.setUint32(s + 16, size, true); dv.setUint32(s + 20, raw, true);
  const at = (va: number) => va - sectionVa + raw;
  const lookup = (va: number, countVa: number, table: number) => {
    exe.set([0x8b, 0x15, 0, 0, 0, 0, 0x33, 0xc0, 0x56, 0x85, 0xd2, 0x7e, 0x15, 0x8b, 0x74, 0x24, 0x08, 0xb9, 0, 0, 0, 0, 0x39, 0x31, 0x74, 0x0e, 0x40, 0x83, 0xc1, 0x14], at(va));
    dv.setUint32(at(va) + 2, countVa, true); dv.setUint32(at(va) + 18, table + 4, true);
  };
  const table = (va: number, countVa: number, rows: number[][]) => {
    dv.setInt32(at(countVa), rows.length, true);
    rows.forEach(([map, spot, x, y, dir, flags], i) => { const o = at(va) + i * 20; dv.setInt32(o, map!, true); dv.setInt32(o + 4, spot!, true); dv.setInt32(o + 8, x!, true); dv.setInt32(o + 12, y!, true); exe[o + 16] = dir!; exe[o + 17] = flags!; });
  };
  lookup(0x009dc4b0, 0x00bf0c50, 0x00d0f7a0); lookup(0x009dc460, 0x00bf0c4c, 0x00d0f688);
  table(0x00d0f7a0, 0x00bf0c50, records.area); table(0x00d0f688, 0x00bf0c4c, records.famous);
  return exe;
}

describe('NPC spots (tools/npc-spots.mjs)', () => {
  it('reads both spot tables through their lookups: map, spot, x, y, facing, the random-facing and wander flags', () => {
    const exe = syntheticPe({ famous: [[4, 209, 599, 439, 1, 0], [9, 206, 602, 484, 0, 0]], area: [[4, 1, 95, 583, 0, 3], [4, 8, 1911, 1287, 3, 0], [5, 9, 423, 319, 0, 3]] });
    const { spots, source } = extractNpcSpots(exe);
    expect(source.map(s => [s.table, s.count])).toEqual([[0x00d0f7a0, 3], [0x00d0f688, 2]]);
    expect(spots).toEqual([
      { spot: 1, map: 4, x: 95, y: 583, direction: 0, randomDirection: true, wander: true }, { spot: 8, map: 4, x: 1911, y: 1287, direction: 3, randomDirection: false, wander: false },
      { spot: 9, map: 5, x: 423, y: 319, direction: 0, randomDirection: true, wander: true }, { spot: 206, map: 9, x: 602, y: 484, direction: 0, randomDirection: false, wander: false },
      { spot: 209, map: 4, x: 599, y: 439, direction: 1, randomDirection: false, wander: false }]);
    const maps = { version: 1, maps: [4, 5].map(id => ({ id, name: `Map_t0${id}`, width: null, height: null, grid: null, entries: [], exits: [], npcSpots: [] })) };
    const parsed = parseWorldMaps(withNpcSpots(maps, spots));
    expect(parsed.maps[0]!.npcSpots.map(s => s.spot)).toEqual([1, 8, 209]);
    expect(parsed.maps[0]!.npcSpots[0]).toEqual({ spot: 1, x: 95, y: 583, direction: 0, randomDirection: true, wander: true });
    expect(parsed.maps[0]!.npcSpots[1]).toEqual({ spot: 8, x: 1911, y: 1287, direction: 3, wander: false });
  });
  it('refuses an exe whose lookups have another shape', () => {
    const exe = syntheticPe({ famous: [], area: [] }); exe[0x009dc4b0 - 0x00401000 + 0x400] = 0x90;
    expect(() => extractNpcSpots(exe)).toThrow(/No spot lookup/);
  });
  const exe = defaultExe();
  it.skipIf(!exe || !existsSync(exe))('the local yo2.exe has 64 area spots (8 on each world map) and 14 famous ones', () => {
    const { spots, source } = extractNpcSpots(readFileSync(exe!));
    expect(source.map(s => s.count)).toEqual([64, 14]);
    for (const [map, first] of [[4, 1], [5, 9], [6, 17], [7, 25], [0, 33], [1, 41], [2, 49], [3, 57]] as const)
      expect(spots.filter(s => s.spot >= first && s.spot < first + 8).every(s => s.map === map)).toBe(true);
    expect(spots.filter(s => s.spot > 200).map(s => [s.spot, s.map])).toEqual([[201, 5], [202, 6], [203, 7], [204, 0], [205, 1], [206, 9], [207, 7], [208, 6], [209, 4], [210, 2], [211, 2], [212, 0], [213, 4], [214, 2]]);
  });
});

describe('NPCs on the map (src/world/npcs.ts, 0x009ff2d0)', () => {
  const map = { npcSpots: [{ spot: 1, x: 10, y: 20, direction: 2 }, { spot: 201, x: 30, y: 40, direction: 0, randomDirection: true }] };
  it('places the NPCs whose spot is on this map', () => {
    const npcs = [{ id: 7, threshold: 0, spot: 1, previous: 0 }, { id: 8, threshold: 0, spot: 2, previous: 0 }];
    expect(npcsOnMap(map, npcs, () => 0).map(p => [p.npc.id, p.spot.x, p.spot.y])).toEqual([[7, 10, 20]]);
  });
  it('shows one level of a friendship chain: the next once the previous threshold is reached', () => {
    const chain = [{ id: 51, threshold: 3, spot: 201, previous: 0 }, { id: 52, threshold: 5, spot: 201, previous: 51 }, { id: 53, threshold: 8, spot: 201, previous: 52 }];
    const shown = (ranks: Record<number, number>) => npcsOnMap(map, chain, id => ranks[id] ?? 0).map(p => p.npc.id);
    expect(shown({})).toEqual([51]);
    expect(shown({ 51: 3 })).toEqual([52]);
    expect(shown({ 51: 3, 52: 5 })).toEqual([53]);
    expect(shown({ 51: 3, 52: 5, 53: 9 })).toEqual([53]);
  });
  it('faces the spot\'s way, or a random one of eight', () => {
    expect(npcStance(map.npcSpots[0]!)).toEqual({ x: 10, y: 20, direction: 2 });
    expect(npcStance(map.npcSpots[1]!, () => 0.99).direction).toBe(7);
    expect(npcStance(map.npcSpots[1]!, () => 0.3).direction).toBe(2);
  });
});
