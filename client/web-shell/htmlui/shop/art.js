// The card shop's pictures, all from the game's own files at runtime (never in git):
//  - pack art: merge.dat data/cardpack/<p0x-x-xx>.png (the server names each pack's file: shopView `art`). lazyfs.js's
//    entry() reads only what its files2 lists (data/card and the duel's files), so the cardpack entries are added to it
//    from merge.dat's directory (cosmetics/art.js parseDirectory; the directory's chunks are pinned at every boot), then
//    read as any other picture (cosmetics/art.js pictureUrl, through lazyfs's chunk cache, off the game's frame);
//  - card faces: svelte/modern/deck/pictures.js (merge.dat data/card, by the card's YO2 id);
//  - the banners' glyph: the shop's pack category banner (data/shop/shop_pack_01_c01), as --sa-bnPack.
import { parseDirectory, pictureUrl } from '../cosmetics/art.js';
import { picture } from '../svelte/modern/deck/pictures.js';

const CHUNK = 1 << 20;   // lazyfs.js's chunk
const PACKS = 'data/cardpack/';
const lazy = () => globalThis.Module?.yo2Lazy;
const archiveOf = L => L?.files && [...L.files.keys()].find(u => /(^|\/)merge\.dat$/i.test(u));
// merge.dat [from, to): lazyfs's chunks where it holds them (pinned or in its LRU), else one HTTP range
async function bytes(L, url, from, to) {
  const out = new Uint8Array(to - from);
  let hole = null;
  for (let i = Math.floor(from / CHUNK); i * CHUNK < to; i++) {
    const k = url + '#' + i, c = L.pinned?.get(k)?.data || L.lru?.get(k);
    const a = Math.max(from, i * CHUNK), b = Math.min(to, (i + 1) * CHUNK);
    if (c && c.length >= b - i * CHUNK) out.set(c.subarray(a - i * CHUNK, b - i * CHUNK), a - from);
    else hole = hole ? [hole[0], b] : [a, b];
  }
  if (hole) {
    const r = await fetch(url + (L.files.get(url)?.ver || ''), { headers: { Range: `bytes=${hole[0]}-${hole[1] - 1}` } });
    if (r.status !== 206) { r.body?.cancel?.(); throw new Error('no range'); }
    out.set(new Uint8Array(await r.arrayBuffer()), hole[0] - from);
  }
  return out;
}
let listed = null;
/** Put merge.dat's data/cardpack entries into lazyfs's files2 (once a session; again after a failure). -> true if done */
export function listPacks(L = lazy()) {
  return listed ||= (async () => {
    const url = archiveOf(L);
    if (!url || !L.files2?.set) return false;
    for (const k of L.files2.keys()) if (k.startsWith(PACKS)) return true;   // listed already
    const head = await bytes(L, url, 0, 12), n = head[8] | head[9] << 8 | head[10] << 16 | (head[11] << 24 >>> 0);
    if (!n || n > 200000) return false;
    for (const [k, v] of parseDirectory(await bytes(L, url, 0, 12 + n * 268))) if (k.startsWith(PACKS) && !L.files2.has(k)) L.files2.set(k, v);
    return true;
  })().catch(() => false).then(ok => { if (!ok) listed = null; return ok; });
}
const packUrls = new Map();
/** The blob URL of a pack's art (its file name, e.g. "p07-1-b37.png"), or null. */
export async function packArtUrl(file) {
  if (!file) return null;
  if (packUrls.has(file)) return packUrls.get(file);
  if (!(await listPacks())) return null;
  const u = await pictureUrl(PACKS + file.toLowerCase());
  if (u) packUrls.set(file, u);
  return u;
}
/** Fill <img> el with a pack's art (kept empty, a soft sky placeholder, until it is read). */
export function packImg(el, file) {
  const u = packUrls.get(file);
  if (u) { el.src = u; return; }
  packArtUrl(file).then(x => { if (x && el.isConnected !== false) el.src = x; });
}
/** As a CSS background (the banners' blurred wash). */
export function packBg(el, file) {
  const set = u => { el.style.backgroundImage = `url(${u})`; };
  const u = packUrls.get(file);
  if (u) set(u); else packArtUrl(file).then(x => { if (x) set(x); });
}
/** A card face into <img> (by YO2 internal id): lazy, near the screen only. */
export const cardImg = (img, internalId) => (internalId == null ? null : picture(img, internalId));

let glyph = null;
/** --sa-bnPack: the pack category banner's art (376 x 112 of shop_pack_01_c01 at 24, 29), the banners' faint glyph. */
export function loadGlyph() {
  return glyph ||= (async () => {
    const u = await pictureUrl('data/shop/shop_pack_01_c01.png');
    if (!u) { glyph = null; return; }
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
    const c = document.createElement('canvas');
    c.width = 376; c.height = 112;
    c.getContext('2d').drawImage(img, 24, 29, 376, 112, 0, 0, 376, 112);
    const out = URL.createObjectURL(await new Promise(r => c.toBlob(r, 'image/png')));
    document.documentElement.style.setProperty('--sa-bnPack', `url(${out})`);
  })().catch(() => { glyph = null; });
}
/** Tests: forget what was read. */
export function _resetArt() { listed = null; glyph = null; packUrls.clear(); }
