// Older lazy runtimes index card/duel files only. Add requested shop pictures from
// merge.dat's verified directory sidecar, then use the existing chunk cache/LZSS reader.
// Format: client/tools/mergedir.py and client/recomp/web/lazyfs.js dirSidecar/tocEntries.
const directories = new WeakMap();
const picturePath = name => /^data\/(cardpack|shop|avatar)\/.+\.(png|jpe?g)$/i.test(name);
export function parseShopDirectory(bytes, archiveSize) {
  if (bytes.length < 28 || new TextDecoder().decode(bytes.subarray(0, 8)) !== 'YO2DIR1\0') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (Number(view.getBigUint64(8, true)) !== archiveSize) return null;
  const count = view.getUint32(24, true);
  if (count > 100000 || bytes.length !== 28 + count * 268) return null;
  if (new TextDecoder().decode(bytes.subarray(16, 24)) !== 'KCEJYUGI') return null;
  const entries = new Map();
  for (let at = 28; at < bytes.length; at += 268) {
    let name = '';
    for (let i = 0; i < 256; i++) {
      const byte = bytes[at + i], character = (byte & 15) << 4 | byte >> 4;
      if (!character) break;
      name += String.fromCharCode(character === 92 ? 47 : character);
    }
    name = name.toLowerCase();
    if (!picturePath(name)) continue;
    const offset = view.getUint32(at + 256, true), size = view.getUint32(at + 260, true), stored = view.getUint32(at + 264, true);
    if (offset < 12 + count * 268 || stored === 0 || size === 0 || size > 16 * 1024 * 1024 || offset + stored > archiveSize) continue;
    entries.set(name, [offset, offset + stored, size]);
  }
  return entries;
}
async function directory(loader, fetcher) {
  const match = [...loader.files || []].find(([name]) => /(?:^|\/)merge\.dat$/i.test(name));
  if (!match) return null;
  const [archive, metadata] = match;
  const response = await fetcher(archive + '.dir.gz', { cache: 'no-cache' });
  if (response.status !== 200) return null;
  const packed = await response.arrayBuffer();
  if (packed.byteLength > 2 * 1024 * 1024) return null;
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return parseShopDirectory(bytes, metadata.size);
}
export async function shopAssetBytes(path, { loader = globalThis.Module?.yo2Lazy, fetcher = globalThis.fetch } = {}) {
  const name = String(path || '').replaceAll('\\', '/').toLowerCase();
  if (!picturePath(name) || !loader?.entry) return null;
  const existing = await loader.entry(name);
  if (existing?.length) return existing;
  if (!loader.files2?.set || !loader.files || !fetcher) return null;
  if (!directories.has(loader)) directories.set(loader, directory(loader, fetcher).catch(() => null));
  const entry = (await directories.get(loader))?.get(name);
  if (!entry) return null;
  loader.files2.set(name, entry);
  return loader.entry(name);
}
