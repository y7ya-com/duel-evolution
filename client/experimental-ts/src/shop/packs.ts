import type { AssetLease } from '../assets';

/** One card pack catalogue slot from the original data/cardpack/PACK_*.bin tables (PackInfo.cpp). */
export interface PackInfo { id: number; type: number; name: string; description: string; image: string; }
export interface PackTables { prop: Uint8Array; img: Uint8Array; indx2: Uint8Array; name: Uint8Array; indx: Uint8Array; desc: Uint8Array; }

const SLOTS = 0xc0;
const decoder = new TextDecoder('windows-1252');
function word(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) return 0;
  return (bytes[at]! | bytes[at + 1]! << 8 | bytes[at + 2]! << 16 | bytes[at + 3]! << 24) >>> 0;
}
// The exe reads past a bad offset; an out-of-range offset is an empty string here.
function text(blob: Uint8Array, at: number): string {
  if (at >= blob.length) return '';
  const end = blob.indexOf(0, at);
  return decoder.decode(blob.subarray(at, end < 0 ? blob.length : end)).trim();
}

/** Slots 1..0xc0 keyed by pack id. A slot whose id repeats overwrites the earlier record, as packTableFill does. */
export function parsePackTables(t: PackTables): Map<number, PackInfo> {
  const packs = new Map<number, PackInfo>();
  for (let i = 1; i <= SLOTS; i++) {
    const prop = word(t.prop, i * 4), id = (prop << 17) >> 17, type = (prop << 13) >> 28;
    if (id <= 0) continue;
    packs.set(id, { id, type, name: text(t.name, word(t.indx, i * 8)), description: text(t.desc, word(t.indx, i * 8 + 4)), image: text(t.img, word(t.indx2, i * 8)) });
  }
  return packs;
}

/** English tables (language 1, letter E). Leases are released once the bytes are parsed. */
export async function loadPackCatalog(assets: { readScene(path: string, signal?: AbortSignal): Promise<AssetLease> }, signal?: AbortSignal): Promise<Map<number, PackInfo>> {
  const names = { prop: 'PACK_Prop', img: 'PACK_Img', indx2: 'PACK_Indx2', name: 'PACK_Name_E', indx: 'PACK_Indx_E', desc: 'PACK_Desc_E' } as const;
  const entries = await Promise.all(Object.entries(names).map(async ([key, file]) => {
    const lease = await assets.readScene(`data/cardpack/${file}.bin`, signal);
    try { return [key, lease.value.bytes.slice()] as const; } finally { lease.release(); }
  }));
  return parsePackTables(Object.fromEntries(entries) as unknown as PackTables);
}

/** Pack art is a path relative to data/cardpack in the tables. */
export function packImagePath(image: string): string | null {
  const file = image.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!file || file.includes('..')) return null;
  return /^data\//i.test(file) ? file : `data/cardpack/${file}`;
}
