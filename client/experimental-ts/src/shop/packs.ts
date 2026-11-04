import type { AssetLease } from '../assets';

/** One card pack catalogue slot from the original data/cardpack/PACK_*.bin tables (PackInfo.cpp). */
export interface PackInfo { id: number; type: number; name: string; description: string; image: string; }
export interface PackTables { prop: Uint8Array; img: Uint8Array; indx2: Uint8Array; name: Uint8Array; indx: Uint8Array; desc: Uint8Array; }

const SLOTS = 0xc0;
const decoders = new Map<string, TextDecoder>();
function word(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) return 0;
  return (bytes[at]! | bytes[at + 1]! << 8 | bytes[at + 2]! << 16 | bytes[at + 3]! << 24) >>> 0;
}
// The exe reads past a bad offset; an out-of-range offset is an empty string here.
function text(blob: Uint8Array, at: number, decoder: TextDecoder): string {
  if (at >= blob.length) return '';
  const end = blob.indexOf(0, at);
  return decoder.decode(blob.subarray(at, end < 0 ? blob.length : end)).trim();
}

/** Slots 1..0xc0 keyed by pack id. A slot whose id repeats overwrites the earlier record, as packTableFill does. */
export function parsePackTables(t: PackTables, encoding = 'windows-1252'): Map<number, PackInfo> {
  let decoder = decoders.get(encoding); if (!decoder) decoders.set(encoding, decoder = new TextDecoder(encoding));
  const packs = new Map<number, PackInfo>();
  for (let i = 1; i <= SLOTS; i++) {
    const prop = word(t.prop, i * 4), id = (prop << 17) >> 17, type = (prop << 13) >> 28;
    if (id <= 0) continue;
    packs.set(id, { id, type, name: text(t.name, word(t.indx, i * 8), decoder), description: text(t.desc, word(t.indx, i * 8 + 4), decoder), image: text(t.img, word(t.indx2, i * 8), decoder) });
  }
  return packs;
}

/** One language's tables (default English, language 1, letter E), decoded with that language's code page.
 * Leases are released once the bytes are parsed. */
export async function loadPackCatalog(assets: { readScene(path: string, signal?: AbortSignal): Promise<AssetLease> }, signal?: AbortSignal, letter = 'E', encoding = 'windows-1252'): Promise<Map<number, PackInfo>> {
  if (!/^[A-Z]$/.test(letter)) throw new Error('Invalid language letter');
  const names = { prop: 'PACK_Prop', img: 'PACK_Img', indx2: 'PACK_Indx2', name: `PACK_Name_${letter}`, indx: `PACK_Indx_${letter}`, desc: `PACK_Desc_${letter}` } as const;
  const entries = await Promise.all(Object.entries(names).map(async ([key, file]) => {
    const lease = await assets.readScene(`data/cardpack/${file}.bin`, signal);
    try { return [key, lease.value.bytes.slice()] as const; } finally { lease.release(); }
  }));
  return parsePackTables(Object.fromEntries(entries) as unknown as PackTables, encoding);
}

/** Pack art is a path relative to data/cardpack in the tables. */
export function packImagePath(image: string): string | null {
  const file = image.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!file || file.includes('..')) return null;
  return /^data\//i.test(file) ? file : `data/cardpack/${file}`;
}
