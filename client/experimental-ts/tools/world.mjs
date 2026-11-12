// Local source-to-private-asset build step. No grids are embedded in browser source.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function extractWorldMaps(sourceRoot = resolve(root, '../src/Game')) {
  const [data, walk, table] = await Promise.all(['yo2FieldWalkData.inc', 'yo2FieldWalk.cpp', 'yo2FieldMap.cpp'].map(name => readFile(resolve(sourceRoot, name), 'utf8')));
  const masks = new Map();
  for (const m of data.matchAll(/static const char\* const (kWalk_\w+)\[(\d+)\] = \{([\s\S]*?)\};/g)) {
    const rows = [...m[3].matchAll(/"([01]+)"/g)].map(v => v[1]);
    if (rows.length !== Number(m[2]) || rows.some(r => r.length !== rows[0].length)) throw new Error(`Invalid mask ${m[1]}`);
    masks.set(m[1], { width: rows[0].length, height: rows.length, rows });
  }
  const grids = new Map();
  for (const m of walk.matchAll(/FieldWalkGrid (g_walk\w+)\((\d+), (\d+), cellsOf\((kWalk_\w+)\)/g)) {
    const grid = masks.get(m[4]);
    if (!grid || grid.width !== Number(m[2]) || grid.height !== Number(m[3])) throw new Error(`Grid mismatch ${m[1]}`);
    grids.set(m[1], grid);
  }
  const maps = [];
  for (const m of table.matchAll(/\{"(Map_\w+)", (&g_walk\w+|nullptr), \{\{([\s\S]*?)\}\}\}/g)) {
    const grid = m[2] === 'nullptr' ? null : grids.get(m[2].slice(1));
    if (grid === undefined) throw new Error(`Missing grid ${m[1]}`);
    const entries = [];
    for (const e of m[3].matchAll(/(?:^|\},\s*\{)(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/g)) {
      if (Number(e[1]) === 12) break;
      entries.push({ from: Number(e[1]), x: Number(e[2]), y: Number(e[3]), direction: Number(e[4]) });
    }
    maps.push({ id: maps.length, name: m[1], width: grid ? grid.width * 20 : null, height: grid ? grid.height * 20 : null, grid, entries, exits: [], npcSpots: [] });
  }
  if (maps.length !== 10 || grids.size !== 8 || masks.size !== 8) throw new Error('Incomplete source map extraction');
  // Arrival tables support adjacency only; no trigger coordinates can be inferred.
  for (const map of maps) map.exits = [...new Set(maps.filter(other => other.id !== map.id && other.entries.some(e => e.from === map.id)).map(other => other.id))].map(to => ({ to }));
  return { version: 1, maps };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(root, process.argv[2] ?? 'public/world-maps.json');
  const data = await extractWorldMaps();
  // the NPC spots come from the user's own yo2.exe (YO2_EXE, or the decomp data checkout), when there is one
  const { defaultExe, extractNpcSpots, withNpcSpots } = await import('./npc-spots.mjs'), exe = defaultExe();
  if (exe) { withNpcSpots(data, extractNpcSpots(await readFile(exe)).spots); console.log(`NPC spots from ${exe}`); }
  else console.warn('No yo2.exe (YO2_EXE): the maps have no NPC spots, so no NPC stands on them');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(data));
  console.log(`Generated ${data.maps.length} maps (${data.maps.filter(m => m.grid).length} grids): ${output}`);
}
