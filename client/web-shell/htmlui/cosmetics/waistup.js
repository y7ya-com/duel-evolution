// The waist-up avatar ("wu"): the bust the game draws on Select Player, in the avatar editor and on the player card,
// composited in HTML from the game's own parts, read from the player's merge.dat at runtime (cosmetics/art.js
// gameFile / pictureUrl: never bundled). The Wardrobe tries items on it; the box reveal shows the reward on it.
//
//   renderWaistUp(el, parts16, { gender, world, pose, crop })  draws the bust of a 16-byte look into `el` (its canvas
//     kept across calls: the old bust stays until the new one is drawn) -> { ready: Promise<bool>, layers:
//     Promise<Layer[]>, destroy }. el.dataset.layers: the layers' picture names, bottom first (tests, the checks).
//   waistUpLayers(rows, parts16, { pose })  -> Layer[] { step, kind, number, image, path, x, y, w, h } (pure)
//   parseWaistUp(csvText)                    -> rows { kind, number, images[7], rect[4] } (pure)
//
// From the decompiled client (client/src; the parts loop is CWaistUpAvatar's, not rewritten yet: read from yo2.exe):
//  - Game/Avatar/yo2WaistUpAvatar.cpp CWADictionary::load: data/Avatar/wu/wm_data.csv (male) and ww_data.csv
//    (female); a row is kind, number, seven pictures (c01..c07; "****" none), and the rect x, y, w, h where the picture
//    goes on the 768 x 768 canvas. A lookup (0x009e2ba0) is the first row of that kind and number.
//  - CWaistUpAvatar's part loop (0x009e6e30): thirteen steps, step k the dictionary's kind k, each one layer of
//    Game/Avatar/yo2AvatarTexMaker.cpp (the picture's w x h from 0, 0 to the rect's x, y, blended in order; a name
//    starting '*' draws nothing: 0x009eae30). The steps, bottom first, with the CAvatarData byte (Game/Avatar/
//    yo2AvatarData.h) that picks the row and the colour that picks the picture:
//      0 back hair  h2   BACK_HAIR (7), hair colour     an afro's own back: FRONT_HAIR's row; none hooded or bald
//      1 body       bo   the pose (row 0 _r, 1 _l), skin
//      2 hair shade hs   FRONT_HAIR (1), skin           none hooded or bald
//      3 eye shade  es   EYES (4), skin
//      4 mouth      mo   MOUTH (5), skin
//      5 eyes       ey   EYES, eye colour
//      6 nose       no   NOSE (3), skin
//      7 eyebrows   eb   EYES, hair colour
//      8 face mark  a1   ACCESSORY (2), the pose's picture (column 0 _r, 1 _l)
//      9 glasses    a2   ACCESSORY2 (9; 0 or 0x20 none), the pose's
//     10 clothes    dc / ac  CLOTHES (6), the pose's
//     11 front hair h1   FRONT_HAIR, hair colour        hooded: CLOTHES's row (the hood); bald: none
//     12 duel disk  dd / da  DUEL_DISK (8; a number with no row: 0xb0), the pose's
//    The colours are bytes 13 (skin, c01..c03), 14 (hair) and 15 (eyes), c01..c07 (ChangeAvatar/yo2ChangeAvatar.cpp
//    kCategories). Hooded: clothes 0x78 / 0x7c (male), 0x75 / 0x77 (female); bald: the male FRONT_HAIR 6; an afro:
//    the male FRONT_HAIR 10..13, the female 5..9 (the exe's tests, in that order).
//  - The pose is waistUpAvatarNew's third argument: 0 in the avatar editor (ChangeAvatar/yo2ChangeAvatar.cpp, the
//    right arm up, the disk on it), 1 on Select Player (PlayerSelect/yo2PlayerSelect.cpp). Both draw it at 50 %.
//  - The blend is the TexMaker's (blendPixel): colour = dst * (1 - a) + src * a, alpha = the larger of the two.
// One deviation: a byte with no row (the exe's avatarValidate puts the whole look back to the default) takes the
// default part of its slot here (CAvatarData::setDefault), so one bad byte changes one part.
import { gameFile, pictureUrl, WAISTUP } from './art.js';

export const CANVAS = 768;
export const POSE = { editor: 0, select: 1 };
// the bust's box on the canvas (the widest figure, hair to the canvas's foot, the disk's far end): the default crop
export const BUST = [72, 0, 624, 768];
const CSV = ['wm_data.csv', 'ww_data.csv'];
// CAvatarData::setDefault (DM; GX wears 0x80 and 0xb8): the part a byte with no row falls back to, per kind
const DEF = { 0: 0x90, 2: 0, 3: 0x40, 4: 0x60, 5: 0x40, 6: 0x30, 7: 0x40, 8: 0x20, 10: 0x70, 11: 0, 12: 0xb0 };
export const DEFAULT_LOOK = (sex = 0, world = 0) => [sex ? 1 : 0, 0, 0x20, 0x30, 0x40, 0x60, world === 1 ? 0x80 : 0x70, 0x90,
  world === 1 ? 0xb8 : 0xb0, 0x20, 0, 0, 0, 0, 0, 0];
export const STEP_NAMES = ['back hair', 'body', 'hair shade', 'eye shade', 'mouth', 'eyes', 'nose', 'eyebrows', 'face mark',
  'glasses', 'clothes', 'front hair', 'duel disk'];

const atoi = s => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : 0; };
/** CWADictionary::load: one row per line that is not empty or a // comment; strtok on ',' (empty fields vanish). */
export function parseWaistUp(text) {
  const rows = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line || line.startsWith('//')) continue;
    const t = line.split(',').filter(x => x !== '');
    if (t.length < 2) continue;
    rows.push({ kind: atoi(t[0]), number: atoi(t[1]) & 0xff, images: t.slice(2, 9), rect: [9, 10, 11, 12].map(i => atoi(t[i])) });
  }
  return rows;
}

const clamp7 = n => Math.max(0, Math.min(6, n | 0));
/** A 16-byte look as the bust reads it (null / short: the default look of that sex and world). */
export function lookBytes(parts, { gender, world = 0 } = {}) {
  const sex = gender === 'female' ? 1 : gender === 'male' ? 0 : parts?.[0] === 1 ? 1 : 0;
  const p = Array.isArray(parts) && parts.length >= 10 ? [...parts, ...Array(16).fill(0)].slice(0, 16).map(n => (n | 0) & 0xff) : DEFAULT_LOOK(sex, world);
  p[0] = sex;
  return p;
}

/** CWaistUpAvatar's part loop: the layers of look `parts` (16 bytes) from that sex's rows, bottom first. */
export function waistUpLayers(rows, parts, { pose = 0 } = {}) {
  const p = lookBytes(parts), sex = p[0], front = p[1], clothes = p[6];
  const col = { hair: clamp7(p[14]), skin: clamp7(p[13]), eye: clamp7(p[15]), pose: pose ? 1 : 0 };
  const hood = sex ? clothes === 0x75 || clothes === 0x77 : clothes === 0x78 || clothes === 0x7c;
  const bald = !hood && !sex && front === 6;
  const afro = !hood && !bald && (sex ? [5, 6, 7, 8, 9] : [10, 11, 12, 13]).includes(front);
  const find = (kind, number) => rows.find(r => r.kind === kind && r.number === number) || null;
  const out = [];
  const add = (step, number, colour) => {
    let r = find(step, number), fallback = false;
    if (!r && DEF[step] !== undefined) { r = find(step, step === 10 && sex ? 0x70 : DEF[step]); fallback = !!r; }
    if (!r) return;
    const image = r.images[col[colour]];
    if (!image || image[0] === '*') return;
    const name = image.toLowerCase();
    out.push({ step, kind: step, number: r.number, image: name, path: WAISTUP + name, x: r.rect[0], y: r.rect[1], w: r.rect[2], h: r.rect[3],
      ...(fallback && { fallback: true }) });
  };
  if (!hood && !bald) add(0, afro ? front : p[7], 'hair');
  add(1, col.pose, 'skin');
  if (!hood && !bald) add(2, front, 'skin');
  add(3, p[4], 'skin');
  add(4, p[5], 'skin');
  add(5, p[4], 'eye');
  add(6, p[3], 'skin');
  add(7, p[4], 'hair');
  add(8, p[2], 'pose');
  if (p[9] && p[9] !== 0x20) add(9, p[9], 'pose');
  add(10, clothes, 'pose');
  if (hood) add(11, clothes, 'hair');
  else if (!bald) add(11, front, 'hair');
  add(12, find(12, p[8]) ? p[8] : 0xb0, 'pose');
  return out;
}

// ---- reading: the tables and the pictures, from merge.dat (art.js), once a session

const dicts = [null, null];
/** The rows of sex 0 / 1 (Promise; null when the game's files can't be read). */
export function waistUpRows(sex) {
  sex = sex ? 1 : 0;
  return dicts[sex] ||= gameFile(WAISTUP + CSV[sex]).then(b => {
    if (!b?.length) throw new Error('no table');
    return parseWaistUp(new TextDecoder('latin1').decode(b));
  }).catch(() => { dicts[sex] = null; return null; });
}

const loadImage = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
const pixels = new Map();   // picture path -> ImageData (the last few)
async function picture(path) {
  if (pixels.has(path)) { const d = pixels.get(path); pixels.delete(path); pixels.set(path, d); return d; }
  const url = await pictureUrl(path);
  if (!url) return null;
  const img = await loadImage(url);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  pixels.set(path, d);
  while (pixels.size > 28) pixels.delete(pixels.keys().next().value);
  return d;
}
/** AvatarTexMaker::blendLayer + blendPixel: layer L's picture onto the canvas's RGBA bytes. */
export function blendInto(dst, size, src, L) {
  const s = src.data, sw = src.width, sh = src.height;
  for (let y = 0; y < L.h && y < sh; y++) {
    const dy = L.y + y;
    if (dy < 0 || dy >= size) continue;
    for (let x = 0; x < L.w && x < sw; x++) {
      const dx = L.x + x;
      if (dx < 0 || dx >= size) continue;
      const si = (y * sw + x) * 4, a = s[si + 3];
      if (!a) continue;
      const di = (dy * size + dx) * 4, k = a / 255, inv = 1 - k;
      dst[di] = dst[di] * inv + s[si] * k;
      dst[di + 1] = dst[di + 1] * inv + s[si + 1] * k;
      dst[di + 2] = dst[di + 2] * inv + s[si + 2] * k;
      if (a > dst[di + 3]) dst[di + 3] = a;
    }
  }
}
const busts = new Map();   // the layers' key -> the composed 768 x 768 canvas (the last few)
async function compose(layers) {
  const key = layers.map(l => `${l.path}@${l.x},${l.y}`).join('|');
  if (busts.has(key)) return busts.get(key);
  const pics = await Promise.all(layers.map(l => picture(l.path).catch(() => null)));
  if (!pics.some(Boolean)) return null;
  const c = document.createElement('canvas');
  c.width = c.height = CANVAS;
  const g = c.getContext('2d');
  const img = g.createImageData(CANVAS, CANVAS);
  layers.forEach((l, i) => { if (pics[i]) blendInto(img.data, CANVAS, pics[i], l); });
  g.putImageData(img, 0, 0);
  busts.set(key, c);
  while (busts.size > 10) busts.delete(busts.keys().next().value);
  return c;
}

// ---- drawing

const WU_CSS = `
.de-wu { position: relative; display: block; overflow: hidden; }
.de-wu > canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .2s ease-out; }
.de-wu[data-drawn] > canvas { opacity: 1; }
.de-wu > .de-wu-skel { position: absolute; left: 30%; right: 30%; top: 12%; bottom: 0; border-radius: 45% 45% 0 0; }
.de-wu[data-drawn] > .de-wu-skel, .de-wu[data-state=none] > .de-wu-skel { display: none; }
@media (prefers-reduced-motion: reduce) { .de-wu > canvas { transition: none; } }
`;
function injectCss(doc) {
  if (!doc || doc.getElementById('de-wu-css')) return;
  const s = doc.createElement('style');
  s.id = 'de-wu-css'; s.textContent = WU_CSS;
  doc.head.append(s);
}

/** Draw the bust of `parts16` into `el` (game px: the el's size; `crop` the canvas box shown, fitted and centred).
 *  Called again on the same el: the new look replaces the old once it is drawn (no flash). -> { ready, layers, destroy } */
export function renderWaistUp(el, parts16, { gender, world = 0, pose = 0, crop = BUST, scale } = {}) {
  const doc = el.ownerDocument || document;
  injectCss(doc);
  el.classList.add('de-wu');
  let canvas = el.querySelector(':scope > canvas');
  if (!canvas) {
    const skel = doc.createElement('div');
    skel.className = 'de-wu-skel de-skel';
    canvas = doc.createElement('canvas');
    el.replaceChildren(skel, canvas);
  }
  const p = lookBytes(parts16, { gender, world });
  const look = p.map(n => n.toString(16).padStart(2, '0')).join('');
  const token = (el.__wuToken = (el.__wuToken || 0) + 1);
  const live = () => el.__wuToken === token && !dead;
  el.dataset.look = look;
  el.dataset.state = 'loading';
  let dead = false;
  const layers = waistUpRows(p[0]).then(rows => (rows ? waistUpLayers(rows, p, { pose }) : []));
  const ready = layers.then(async L => {
    if (!live()) return false;
    el.dataset.layers = L.map(l => l.image.replace(/\.png$/, '')).join(' ');
    if (!L.length) { el.dataset.state = 'none'; return false; }
    const bust = await compose(L);
    if (!live()) return false;
    if (!bust) { el.dataset.state = 'none'; return false; }
    // the backing store at the device's pixels: the element's CSS size x the stage's scale x the DPR, measured
    const r = el.getBoundingClientRect(), w = el.clientWidth || r.width || 160, h = el.clientHeight || r.height || 200;
    const k = scale || Math.min(4, Math.max(1, (r.width && w ? r.width / w : 1) * (globalThis.devicePixelRatio || 1)));
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const f = Math.min(canvas.width / crop[2], canvas.height / crop[3]);
    const dw = crop[2] * f, dh = crop[3] * f;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bust, crop[0], crop[1], crop[2], crop[3], (canvas.width - dw) / 2, canvas.height - dh, dw, dh);
    el.dataset.state = 'ready';
    el.toggleAttribute('data-drawn', true);
    return true;
  }).catch(() => { if (live()) el.dataset.state = 'none'; return false; });
  return { ready, layers, destroy() { dead = true; } };
}

/** Tests: forget the tables and the pictures read so far. */
export function _resetWaistUp() { dicts[0] = dicts[1] = null; pixels.clear(); busts.clear(); }
