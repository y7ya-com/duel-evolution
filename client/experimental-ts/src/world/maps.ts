export const CELL_SIZE = 20;
export interface Point { readonly x: number; readonly y: number }
export interface WorldPosition extends Point { readonly direction: number }
export interface WalkGrid { readonly width: number; readonly height: number; readonly rows: readonly string[] }
export interface MapEntry extends WorldPosition { readonly from: number }
export interface MapExit { readonly to: number }
/** Where an NPC with this spot number stands (the exe's spot tables; tools/npc-spots.mjs). `randomDirection`: it faces a
 * random way each time the map is built (record flag bit 1); `wander`: it walks among the map's spots (bit 0,
 * world/npc-wander.ts; absent in an older world-maps.json, where randomDirection says the same: the exe sets both or
 * neither). */
export interface NpcSpot extends WorldPosition { readonly spot: number; readonly randomDirection?: boolean; readonly wander?: boolean }
export interface WorldMap { readonly id: number; readonly name: string; readonly width: number | null; readonly height: number | null; readonly grid: WalkGrid | null; readonly entries: readonly MapEntry[]; readonly exits: readonly MapExit[]; readonly npcSpots: readonly NpcSpot[] }
export interface WorldMaps { readonly version: 1; readonly maps: readonly WorldMap[] }
const MAX_BYTES = 1024 * 1024;
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError('Expected world map object'); return v as Record<string, unknown>; }
function integer(v: unknown, min: number, max: number): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) throw new RangeError('Invalid world map integer'); return v; }
function array(v: unknown, max: number): unknown[] { if (!Array.isArray(v) || v.length > max) throw new RangeError('Invalid world map array'); return v; }
function position(v: unknown): WorldPosition { const p = object(v); return { x: integer(p.x, 0, 65535), y: integer(p.y, 0, 65535), direction: integer(p.direction, 0, 7) }; }
export function validateGrid(value: unknown): WalkGrid {
  const g = object(value), width = integer(g.width, 1, 256), height = integer(g.height, 1, 256);
  const rows = array(g.rows, 256).map(r => { if (typeof r !== 'string' || r.length !== width || !/^[01]+$/.test(r)) throw new RangeError('Invalid walk row'); return r; });
  if (rows.length !== height) throw new RangeError('Walk row count mismatch');
  return Object.freeze({ width, height, rows: Object.freeze(rows) });
}
export function parseWorldMaps(value: unknown): WorldMaps {
  const root = object(value); if (root.version !== 1) throw new RangeError('Unknown world map version');
  const ids = new Set<number>();
  const maps = array(root.maps, 10).map(value => {
    const m = object(value), id = integer(m.id, 0, 9);
    if (ids.has(id)) throw new RangeError('Duplicate map id'); ids.add(id);
    if (typeof m.name !== 'string' || !/^Map_[a-z0-9_]{1,32}$/.test(m.name)) throw new RangeError('Invalid map name');
    const grid = m.grid === null ? null : validateGrid(m.grid);
    const width = m.width === null ? null : integer(m.width, 1, 5120), height = m.height === null ? null : integer(m.height, 1, 5120);
    if (grid && (width !== grid.width * CELL_SIZE || height !== grid.height * CELL_SIZE)) throw new RangeError('Map dimensions mismatch');
    const entries = array(m.entries, 10).map(v => { const e = object(v); return Object.freeze({ ...position(e), from: integer(e.from, 0, 11) }); });
    const exits = array(m.exits, 10).map(v => Object.freeze({ to: integer(object(v).to, 0, 9) }));
    const npcSpots = array(m.npcSpots, 256).map(v => { const s = object(v); for (const k of ['randomDirection', 'wander']) if (s[k] !== undefined && typeof s[k] !== 'boolean') throw new TypeError('Invalid NPC spot'); return Object.freeze({ ...position(s), spot: integer(s.spot, 0, 65535), ...(s.randomDirection ? { randomDirection: true } : {}), ...(s.wander !== undefined ? { wander: s.wander as boolean } : {}) }); });
    return Object.freeze({ id, name: m.name, width, height, grid, entries: Object.freeze(entries), exits: Object.freeze(exits), npcSpots: Object.freeze(npcSpots) });
  });
  return Object.freeze({ version: 1, maps: Object.freeze(maps) });
}
export async function loadWorldMaps(url = '/world-maps.json', options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {}): Promise<WorldMaps> {
  const response = await (options.fetch ?? globalThis.fetch)(url, { signal: options.signal });
  if (!response.ok) throw new Error(`World maps HTTP ${response.status}`);
  const length = response.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new RangeError('World maps too large');
  if (!response.body) throw new Error('Missing world map body');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) throw new RangeError('World maps too large'); chunks.push(value); } }
  catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return parseWorldMaps(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
