// A cosmetic's REAL in-game art, read from the player's own game files at runtime (never bundled: Konami art stays out of
// git). Shared by the box shop (cosmetics/boxes*.js: the pool, the reveal) and the Wardrobe (cosmetics/wardrobe*.js).
//
//   renderItemArt(el, item, { body, size, lit })  draws `item` into `el`: a skeleton while it loads, then the art fitted
//     to a size x size game-px box (crisp at any DPR), else a graceful placeholder. -> { ready: Promise<bool>, destroy }
//   itemArtUrls(item, body)  -> Promise<string[]>: the art's layers as blob URLs, bottom first ([] when none can be read)
//   itemArtPaths(item, body) -> { paths, w, h, body, fallback, crop? }: the merge.dat names (pure; the mapping below)
//   artBody(item, body)      -> { body, fallback }: the body whose art is shown (a single-body item shows its own body's
//     art for the other body, fallback true: renderItemArt marks the box data-fallback, for its caller to dim)
// `item` is the server's API item (server/src/game/cosmetics.ts itemOut: { id, name, kind, slot, rarity, variants:
// [{ gender, bit, number, worlds }], bodies, notice }); a variant's `number` is the native part number the renderer uses.
//
// The naming is the decompiled renderer's (client/src):
//  - Game/Avatar/yo2ChibiAvatarElm.cpp clothesPart / applyMaleParts / applyFemaleParts: the chibi's PNGs, in
//    data/avatar/chibi/, "cm_" male / "cw_" female, the standing front pose "_n01_01.png" (128 x 128; glasses and face
//    marks 64 x 64):
//      outfit (slot 6)   c?_<clothesPart(number)>   Domino dc_* from 0x6f, Academy ac_* from 0x7f
//      hair (slot 1)     back c?_h2_..., front c?_h1_<number + 1>_c01 (the afro / bald / ponytail rules), one canvas
//      face mark (2)     c?_a1_<number - 0x20>_c01
//      glasses (9)       c?_a2_* from the number's letter ('P' 0x50 ...): the male and female switch tables differ
//  - MyRoom/yo2DuelDiscShelf.cpp displayDiskImage: a duel disk (slot 8) is its My Room shelf picture,
//    data/Map/Map_switch/Mapdisk_<kImages[i]>_01.png (160 x 107; _02 lit), i from the switch on number - 0xb0.
// Names are matched lower case (lazyfs.js tocEntries lowers merge.dat's directory).
//
// Reading: lazyfs.js (client/recomp/web, the --pre-js that mounts the game folder) exposes Module.yo2Lazy: entry(name)
// reads a merge.dat entry in the background through its chunk cache (LZSS unpacked), never on the game's frame, but it
// only indexes data/card and the duel's files (files2). The rest of the directory is read here once a session, from the
// directory chunks lazyfs already holds (pinned "toc" at every boot: no network), any missing chunk fetched as an HTTP
// range at the archive's ETag version; the entries asked for are added to files2 so entry() can read them (the chibi
// folder is usually in memory already: lazyfs pins data/avatar/chibi once the player is on a map). A runtime without
// entry() gets the entry as one HTTP range, unpacked here (svelte/modern/deck/pictures.js's fallback). Each picture is
// a blob URL kept for the session; a few reads at a time.

export const CHIBI = 'data/avatar/chibi/';
export const DISKS = 'data/map/map_switch/';
// the shop's own sprites and the card get's glow frame (cosmetics/shopart.js: the skin the boxes and the Wardrobe use)
export const SHOP = 'data/shop/', RESULT = 'data/y/result/';
const READ = [CHIBI, DISKS, SHOP, RESULT];
const two = n => String(n).padStart(2, '0');
const prefix = female => (female ? 'cw_' : 'cm_');
const chibi = (female, part) => `${CHIBI}${prefix(female)}${part}_n01_01.png`;

// ---- the mapping (pure)

/** yo2ChibiAvatarElm.cpp clothesPart: the duel clothes (Domino, 0x6f..) or academy clothes (0x7f..) part; null if none. */
export function clothesPart(number, female) {
  if (number >= 0x7f) return `ac_${two(number - 0x7f || 1)}_c01`;
  const k = number - 0x6f;
  if (k < 0) return null;
  if (!female) {
    if (k < 5) return `dc_01_c${two(k || 1)}`;
    if (k < 8) return `dc_02_c${two(number - 0x73)}`;
    return ['dc_03_c01', 'dc_99_c01', 'dc_04_c01', 'dc_05_c01', 'dc_06_c01', 'dc_98_c01'][k - 8] ?? null;
  }
  if (k <= 1) return 'dc_01_c01';
  if (k < 5) return `dc_02_c${two(number - 0x70)}`;
  return ['dc_03_c01', 'dc_99_c01', 'dc_04_c01', 'dc_98_c01'][k - 5] ?? null;
}

/** applyMaleParts / applyFemaleParts for the front hair (FRONT_HAIR byte `number`; the back-hair byte `back`, default
 *  0x90, matters only where the front leaves it; colour c01): { front, back } part names (back null: the player's
 *  own back hair shows, not part of the item), `bald` for the male shaved head (its h1_07 / h1_50 are empty pictures). */
export function hairParts(number, female, { back = 0x90, color = 1 } = {}) {
  const hair = number + 1, c = two(color);
  if (!female) {
    const afro = { 11: 1, 12: 2, 13: 3, 14: 4 }[hair] || 0;
    if (hair === 7) return { front: 'h1_07_c01', back: 'h1_50_c01', bald: true };
    return { front: `h1_${two(hair)}_c${c}`, back: afro ? `h2_${two(afro + 10)}_c${c}` : null, own: `h2_${two(back - 0x8f || 1)}_c${c}` };
  }
  const afro = { 6: 1, 7: 2, 8: 3, 10: 4 }[hair] || 0;
  const back2 = hair === 9 ? `h2_09_c${c}` : afro ? `h2_${two((afro === 4 ? 5 : afro) + 5)}_c${c}` : null;
  return { front: `h1_${two(hair)}_c${c}`, back: back2, own: `h2_${two(back - 0x8f || 1)}_c${c}` };
}

// the glasses' switch tables (applyMaleParts / applyFemaleParts, CAvatarData::ACCESSORY2): letter -> a2 part
const GLASSES = {
  male: { P: 'a2_01_c01', Q: 'a2_02_c01', R: 'a2_02_c02', S: 'a2_02_c03', T: 'a2_03_c01' },
  female: { P: 'a2_01_c01', Q: 'a2_02_c01', R: 'a2_02_c02', S: 'a2_02_c03', T: 'a2_02_c04', U: 'a2_02_c05', V: 'a2_03_c01' },
};
/** The glasses part of ACCESSORY2 byte `number` ('P' 0x50 ...), null for none (the renderer's a2_00_c01). */
export const glassesPart = (number, female) => GLASSES[female ? 'female' : 'male'][String.fromCharCode(number)] ?? null;
/** The face mark (ACCESSORY, slot 2): a1_<number - 0x20>_c01; 0x20 is none. */
export const faceMarkPart = number => (number > 0x20 ? `a1_${two(number - 0x20)}_c01` : null);

// yo2DuelDiscShelf.cpp displayDiskImage: the pictures in the exe's table order, and the switch on number - 0xb0
const DISK_IMAGES = ['da_01_c01', 'da_01_c02', 'da_01_c03', 'da_02_c01', 'da_02_c02', 'da_02_c03', 'da_02_c04', 'dd_01_c01',
  'dd_01_c02', 'dd_01_c03', 'dd_02_c01', 'dd_02_c02', 'dd_02_c03', 'dd_02_c04', 'da_01_c04', 'dd_01_c04', 'da_01_c05',
  'dd_01_c05', 'da_03_c01', 'da_03_c02', 'da_03_c03', 'da_03_c04', 'dd_03_c01', 'dd_03_c02', 'dd_03_c03', 'dd_03_c04',
  'da_01_c06', 'da_01_c08', 'da_01_c07'];
const DISK_INDEX = { 0: 7, 1: 8, 2: 9, 3: 10, 4: 11, 5: 12, 6: 13, 7: 22, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 18, 16: 23,
  17: 24, 18: 25, 19: 15, 20: 17, 0x20: 19, 0x21: 20, 0x22: 21, 0x23: 14, 0x24: 16, 0x25: 26, 0x26: 28, 0x27: 27 };
/** The shelf picture of duel disk part `number` (0xb0..): "dd_02_c02" (Battle City Alpha Gold, 0xb4). */
export const diskImage = number => DISK_IMAGES[DISK_INDEX[number - 0xb0] ?? 0];
export const diskPath = (number, lit = false) => `${DISKS}mapdisk_${diskImage(number)}_0${lit ? 2 : 1}.png`;

/** The body whose art shows for `body`: its own if the item has a variant for it, else the item's other body (fallback). */
export function artBody(item, body = 'male') {
  const has = b => (item?.variants || []).some(v => v.gender === b);
  if (has(body)) return { body, fallback: false };
  const other = body === 'male' ? 'female' : 'male';
  return has(other) ? { body: other, fallback: true } : { body, fallback: false };
}
const KIND_SLOT = { outfit: 6, hair: 1, dueldisk: 8 };
/** The merge.dat names of `item`'s art for `body` (bottom first) and the picture's size; paths [] when it has none.
 *  crop: the box [x, y, w, h] to show (the shaved head: the bald body's head); otherwise the art's own extent. */
export function itemArtPaths(item, body = 'male', { lit = false } = {}) {
  const { body: shown, fallback } = artBody(item, body), female = shown === 'female';
  // the body's first variant is the item's own (Afro: Afro I's row; cosmetics.ts cosmeticEquip)
  const v = (item?.variants || []).find(x => x.gender === shown);
  const slot = item?.slot ?? KIND_SLOT[item?.kind];
  const out = { paths: [], w: 128, h: 128, body: shown, fallback };
  if (!v) return out;
  const n = v.number;
  if (slot === 6) { const p = clothesPart(n, female); if (p) out.paths = [chibi(female, p)]; }
  else if (slot === 1) {
    const h = hairParts(n, female);
    // the shaved head draws no hair: the bald head itself (the body's), cropped to it
    if (h.bald) Object.assign(out, { paths: [chibi(female, 'bo_01_c01')], crop: [36, 6, 56, 56] });
    else out.paths = [...h.back ? [chibi(female, h.back)] : [], chibi(female, h.front)];
  } else if (slot === 9) { const p = glassesPart(n, female); if (p) Object.assign(out, { paths: [chibi(female, p)], w: 64, h: 64 }); }
  else if (slot === 2) { const p = faceMarkPart(n); if (p) Object.assign(out, { paths: [chibi(female, p)], w: 64, h: 64 }); }
  else if (slot === 8) Object.assign(out, { paths: [diskPath(n, lit)], w: 160, h: 107 });
  return out;
}

// ---- reading the game's files

const CHUNK = 1 << 20;   // lazyfs.js's chunk
const lazy = () => globalThis.Module?.yo2Lazy;
const archiveOf = L => L?.files && [...L.files.keys()].find(u => /(^|\/)merge\.dat$/i.test(u));
function lzss(src, size) {   // lazyfs.js's: Okumura's LZSS, 4 KB ring from 0xFEE, flags LSB first (1 = byte)
  const ring = new Uint8Array(4096), out = new Uint8Array(size);
  let r = 0xfee, i = 0, o = 0;
  while (i < src.length && o < size) {
    const flags = src[i++];
    for (let bit = 0; bit < 8 && i < src.length && o < size; bit++)
      if (flags & (1 << bit)) { const c = src[i++]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xfff; }
      else {
        const b1 = src[i++], b2 = src[i++], off = b1 | ((b2 & 0xf0) << 4), len = (b2 & 0x0f) + 3;
        for (let k = 0; k < len && o < size; k++) { const c = ring[(off + k) & 0xfff]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xfff; }
      }
  }
  return out;
}
async function range(L, url, from, to) {   // [from, to) of the archive, never the whole of it
  const r = await fetch(url + (L.files.get(url)?.ver || ''), { headers: { Range: `bytes=${from}-${to - 1}` } });
  if (r.status !== 206) { r.body?.cancel?.(); throw new Error('no range'); }
  return new Uint8Array(await r.arrayBuffer());
}
// merge.dat bytes [from, to): lazyfs's chunks where it holds them (pinned or in its LRU), the rest as one range
async function bytes(L, url, from, to) {
  const out = new Uint8Array(to - from), missing = [];
  for (let i = Math.floor(from / CHUNK); i * CHUNK < to; i++) {
    const k = url + '#' + i, c = L.pinned?.get(k)?.data || L.lru?.get(k);
    const a = Math.max(from, i * CHUNK), b = Math.min(to, (i + 1) * CHUNK);
    if (c && c.length >= b - i * CHUNK) out.set(c.subarray(a - i * CHUNK, b - i * CHUNK), a - from);
    else missing.push([a, b]);
  }
  if (missing.length) {
    const a = missing[0][0], b = missing[missing.length - 1][1];
    out.set(await range(L, url, a, b), a - from);   // ponytail: one span over the holes (they are adjacent at a cold boot)
  }
  return out;
}
/** merge.dat's directory (KCEJYUGI: count at 8, then 268-byte entries: nibble-swapped name, offset, size, stored size)
 *  -> name (lower case, '/') -> [from, to, size]. Exported for the tests. */
export function parseDirectory(toc) {
  const n = toc[8] | toc[9] << 8 | toc[10] << 16 | (toc[11] << 24 >>> 0), end = Math.min(toc.length, 12 + n * 268), map = new Map();
  const u32 = o => toc[o] | toc[o + 1] << 8 | toc[o + 2] << 16 | (toc[o + 3] << 24 >>> 0);
  for (let e = 12; e + 268 <= end; e += 268) {
    let name = '';
    for (let k = 0; k < 256; k++) {
      const b = toc[e + k], c = ((b & 15) << 4) | (b >> 4);
      if (!c) break;
      name += String.fromCharCode(c === 92 ? 47 : c);
    }
    const off = u32(e + 256), size = u32(e + 260), stored = u32(e + 264);
    if (stored) map.set(name.toLowerCase(), [off, off + stored, size]);
  }
  return map;
}
let dirLoad = null, dirFor = null;
function directory(L) {
  if (dirFor !== L) { dirFor = L; dirLoad = null; }
  return dirLoad ||= (async () => {
    const url = archiveOf(L);
    if (!url) return null;
    const head = await bytes(L, url, 0, 12), n = head[8] | head[9] << 8 | head[10] << 16 | (head[11] << 24 >>> 0);
    if (!n || n > 200000) return null;
    const all = parseDirectory(await bytes(L, url, 0, 12 + n * 268)), keep = new Map();
    for (const [k, v] of all) if (READ.some(p => k.startsWith(p))) keep.set(k, v);   // what art.js reads
    return { url, entries: keep };
  })().catch(e => { dirLoad = null; throw e; });   // a dropped connection: asked again next time
}
/** One merge.dat file's bytes by its (lower-case) name, or null. Exported for the tests. */
export async function gameFile(name) {
  const L = lazy();
  if (!L) return null;
  name = name.toLowerCase();
  if (L.entry && L.files2?.has(name)) return L.entry(name);
  const d = await directory(L), e = d?.entries.get(name);
  if (!e) return null;
  if (L.entry && L.files2?.set) {   // lazyfs reads it through its chunk cache from here on
    if (!L.files2.has(name)) L.files2.set(name, e);
    const b = await L.entry(name);
    if (b) return b;
  }
  const raw = await range(L, d.url, e[0], e[1]);
  return e[2] === undefined || raw.length === e[2] ? raw : lzss(raw, e[2]);
}

const urls = new Map(), loads = new Map(), queue = [];
let active = 0;
const MAX = 6;
function pump() {
  while (active < MAX && queue.length) {
    const [name, done] = queue.shift();
    active++;
    Promise.resolve().then(() => gameFile(name)).catch(() => null)
      .then(b => { const u = b?.length ? URL.createObjectURL(new Blob([b], { type: 'image/png' })) : null; if (u) urls.set(name, u); done(u); })
      .finally(() => { active--; pump(); });
  }
}
/** The blob URL of one game picture (null: not readable now; asked again next time). */
export function pictureUrl(name) {
  name = name.toLowerCase();
  if (urls.has(name)) return Promise.resolve(urls.get(name));
  if (!loads.has(name)) loads.set(name, new Promise(done => { queue.push([name, done]); pump(); }).then(u => { if (!u) loads.delete(name); return u; }));
  return loads.get(name);
}

/** The item's art layers for `body` as blob URLs, bottom first; [] when the item has no art or it can't be read. */
export async function itemArtUrls(item, body = 'male', opts) {
  const { paths } = itemArtPaths(item, body, opts);
  if (!paths.length) return [];
  const got = await Promise.all(paths.map(pictureUrl));
  return got.every(Boolean) ? got : [];
}

// ---- drawing

const ART_CSS = `
.de-art { position: relative; display: block; overflow: visible; }
.de-art > canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .25s ease-out; }
.de-art[data-state=ready] > canvas { opacity: 1; }
.de-art > .de-art-skel { position: absolute; inset: 14%; border-radius: 50%; }
.de-art[data-state=ready] > .de-art-skel, .de-art[data-state=none] > .de-art-skel { display: none; }
.de-art > .de-art-none { position: absolute; inset: 0; display: none; place-items: center; }
.de-art[data-state=none] > .de-art-none { display: grid; }
.de-art-none > i { width: 46%; aspect-ratio: 1; border-radius: 50%; border: 2px dashed rgba(70,90,105,.45);
  display: grid; place-items: center; color: rgba(70,90,105,.6); font: bold 15px/1 Arial, sans-serif; font-style: normal; }
`;
function injectArtCss(doc) {
  if (!doc || doc.getElementById('de-art-css')) return;
  const s = doc.createElement('style');
  s.id = 'de-art-css'; s.textContent = ART_CSS;
  doc.head.appendChild(s);
}
const loadImage = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
// the extent of the drawn pixels of a layer stack (alpha > 8), so the art fills the box whatever its place on the 128 canvas
const boxes = new Map();
function extent(imgs, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (const i of imgs) g.drawImage(i, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/** Draw `item`'s art into `el` (its contents replaced): fitted into a size x size box (game px; default el's width),
 *  centred, a little padding; a skeleton until it loads and a placeholder if it can't. opts.fit 'extent' (default:
 *  the drawn pixels fill the box) or 'canvas' (the native canvas as it is, e.g. two hairs side by side).
 *  opts.max: at most that many game px per texel (small art stays near its size). The other body's art (a single-body
 *  item) marks el data-fallback. -> { ready: Promise<boolean>, destroy() } */
export function renderItemArt(el, item, { body = 'male', size, lit = false, fit = 'extent', pad = 0.08, scale, max = 4 } = {}) {
  const doc = el.ownerDocument || document;
  injectArtCss(doc);
  const info = itemArtPaths(item, body, { lit });
  const box = size || el.clientWidth || 96;
  el.classList.add('de-art');
  el.dataset.state = 'loading';
  el.dataset.kind = item?.kind || '';
  Object.assign(el.style, { width: box + 'px', height: box + 'px' });
  const canvas = doc.createElement('canvas'), skel = doc.createElement('div'), none = doc.createElement('div');
  skel.className = 'de-art-skel de-skel';
  none.className = 'de-art-none';
  none.innerHTML = '<i>?</i>';
  el.replaceChildren(skel, canvas, none);
  el.toggleAttribute('data-fallback', !!info.fallback);
  let dead = false;
  const ready = (async () => {
    const layers = await itemArtUrls(item, body, { lit });
    if (dead) return false;
    if (!layers.length) { el.dataset.state = 'none'; return false; }
    const imgs = await Promise.all(layers.map(loadImage)).catch(() => null);
    if (dead) return false;
    if (!imgs) { el.dataset.state = 'none'; return false; }
    const w = imgs[0].naturalWidth || info.w, h = imgs[0].naturalHeight || info.h;
    const key = layers.join('|') + fit;
    let src = info.crop || (fit === 'canvas' ? [0, 0, w, h] : boxes.get(key));
    if (!src) { src = extent(imgs, w, h) || [0, 0, w, h]; boxes.set(key, src); }
    // the backing store at the device's pixels: the layer's CSS scale (the stage) x the DPR, measured
    const r = el.getBoundingClientRect(), k = scale || Math.min(4, Math.max(1, (r.width ? r.width / box : 1) * (globalThis.devicePixelRatio || 1)));
    const px = Math.round(box * k);
    canvas.width = px; canvas.height = px;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const room = px * (1 - 2 * pad), f = Math.min(room / src[2], room / src[3], fit === 'canvas' ? Infinity : max * k);
    const dw = src[2] * f, dh = src[3] * f, dx = (px - dw) / 2, dy = (px - dh) / 2;
    for (const i of imgs) g.drawImage(i, src[0], src[1], src[2], src[3], dx, dy, dw, dh);
    el.dataset.state = 'ready';
    return true;
  })().catch(() => { if (!dead) el.dataset.state = 'none'; return false; });
  return { ready, destroy() { dead = true; } };
}

/** Tests: forget the directory and the pictures read so far. */
export function _reset() { dirLoad = null; dirFor = null; urls.clear(); loads.clear(); queue.length = 0; boxes.clear(); }
