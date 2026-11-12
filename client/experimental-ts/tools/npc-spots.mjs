// Where the map NPCs stand: the original client's two spot tables, read from the user's own yo2.exe at build time
// (nothing of the exe is committed; the result goes into the ignored public/world-maps.json like the walk grids).
//
// The server lists each NPC with a spot number (NPCINFOLIST row +0x38): 1..64 the areas' spots (8 per map), 201..214
// the famous characters' own. The lobby's map NPC builder (0x009ff2d0) looks each row's spot up with
// 0x009dc4b0 (thunk 0x00401c94) and, failing that, 0x009dc460 (thunk 0x00411d1a): linear searches over 20-byte records
//   { int32 map; int32 spot; int32 x; int32 y; uint8 direction; uint8 flags; uint8 pad[2] }
// whose counts and bases are immediates of those two functions (count 0x00bf0c50 = 64 at 0x00d0f7a0; count
// 0x00bf0c4c = 14 at 0x00d0f688). A record on another map than the scene's (+0x274) is skipped; on this map the NPC
// is placed at (float)x, (float)y facing `direction`, or rand() % 8 when flags & 2 (0x009ff533..0x009ff56c).
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const need = (v, m) => { if (!v) throw new Error(m); };

/** The PE's sections, to read a virtual address. */
function sections(exe) {
  const dv = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  need(exe.length > 0x400 && dv.getUint16(0, true) === 0x5a4d, 'Not a PE executable');
  const pe = dv.getUint32(0x3c, true); need(dv.getUint32(pe, true) === 0x4550, 'Not a PE executable');
  const count = dv.getUint16(pe + 6, true), optional = dv.getUint16(pe + 20, true), base = dv.getUint32(pe + 52, true), list = [];
  for (let i = 0; i < count; i++) {
    const s = pe + 24 + optional + i * 40;
    list.push({ va: base + dv.getUint32(s + 12, true), size: dv.getUint32(s + 16, true), raw: dv.getUint32(s + 20, true) });
  }
  return { dv, at(va, length = 4) { const s = list.find(s => va >= s.va && va + length <= s.va + s.size); need(s, `Address ${va.toString(16)} outside the image`); return va - s.va + s.raw; } };
}

/** One lookup function: `mov edx,[count]; xor eax,eax; push esi; test edx,edx; jle; mov esi,[esp+8]; mov ecx,table+4;
 * cmp [ecx],esi; je; inc eax; add ecx,0x14 ...` (0x009dc460 / 0x009dc4b0). Returns the table's base and count. */
function lookup(pe, va) {
  const o = pe.at(va, 32), b = i => pe.dv.getUint8(o + i);
  const shape = [[0, 0x8b], [1, 0x15], [6, 0x33], [7, 0xc0], [8, 0x56], [9, 0x85], [10, 0xd2], [13, 0x8b], [14, 0x74], [15, 0x24], [16, 0x08], [17, 0xb9], [22, 0x39], [23, 0x31], [26, 0x40], [27, 0x83], [28, 0xc1], [29, 0x14]];
  need(shape.every(([i, v]) => b(i) === v), `No spot lookup at ${va.toString(16)} (another exe build?)`);
  const countVa = pe.dv.getUint32(o + 2, true), table = pe.dv.getUint32(o + 18, true) - 4, count = pe.dv.getInt32(pe.at(countVa), true);
  need(count > 0 && count <= 256, 'Invalid spot count');
  return { table, count, countVa };
}

/** The spot tables of yo2.exe: [{spot, map, x, y, direction, randomDirection}] (famous ones first, as the exe searches). */
export function extractNpcSpots(exe) {
  const pe = sections(exe), spots = [], source = [];
  for (const va of [0x009dc4b0, 0x009dc460]) {
    const { table, count, countVa } = lookup(pe, va);
    source.push({ lookup: va, table, count, countVa });
    for (let i = 0; i < count; i++) {
      const o = pe.at(table + i * 20, 20), dv = pe.dv;
      const map = dv.getInt32(o, true), spot = dv.getInt32(o + 4, true), x = dv.getInt32(o + 8, true), y = dv.getInt32(o + 12, true);
      const direction = dv.getUint8(o + 16), flags = dv.getUint8(o + 17);
      need(map >= 0 && map <= 9 && spot > 0 && spot <= 65535 && x >= 0 && x <= 65535 && y >= 0 && y <= 65535 && direction <= 7, 'Invalid spot record');
      spots.push({ spot, map, x, y, direction, randomDirection: (flags & 2) !== 0 });
    }
  }
  // 0x009ff337 tries the famous table first, so a spot in both keeps the famous record
  const seen = new Set(), unique = [];
  for (const s of spots.reverse()) { if (!seen.has(s.spot)) { seen.add(s.spot); unique.push(s); } }
  return { spots: unique.sort((a, b) => a.spot - b.spot), source };
}

/** Puts each map's spots into a world-maps.json object (its npcSpots). */
export function withNpcSpots(worldMaps, spots) {
  for (const map of worldMaps.maps) map.npcSpots = spots.filter(s => s.map === map.id).map(({ spot, x, y, direction, randomDirection }) => ({ spot, x, y, direction, ...(randomDirection ? { randomDirection } : {}) }));
  return worldMaps;
}

export const defaultExe = () => process.env.YO2_EXE ?? [resolve(process.env.HOME ?? '', 'Documents/GitHub/yo2-decomp-data/yo2.exe')].find(p => existsSync(p));

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [exePath = defaultExe(), output = 'public/world-maps.json'] = process.argv.slice(2);
  need(exePath, 'Usage: node tools/npc-spots.mjs <yo2.exe> [public/world-maps.json] (or YO2_EXE)');
  const { spots, source } = extractNpcSpots(await readFile(resolve(exePath)));
  const file = resolve(root, output), maps = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify(withNpcSpots(maps, spots)));
  console.log(`${spots.length} NPC spots (${source.map(s => `${s.count} at 0x${s.table.toString(16)}`).join(', ')}) -> ${file}`);
}
