// New-style waist-up items in the HTML UI: the same rendering as the engine's (client/recomp/ovr/newstylewu.c,
// ovr/nwpak.h), from the same files, so the Wardrobe, the box reveal and every other HTML bust match the game.
//
// An outfit listed in data/avatar/wu/newstyle.txt ("<m|f> <clothes hex> <code> <clothes picture stem>", written by
// client/tools/custom_assets.py) is drawn from its pack data/avatar/wu/<wm|ww>_nw_<code>.pak
// (client/tools/newstyle_wu.py): per pose one picture of the whole figure below the head (body_<pose>.png, its skin
// in neutral greys: R = G = B = v), the disk arm's fist (hand_<pose>.png) and wu.txt (the skin ramp, the pictures'
// box, the neck offset, the head cut, the disk transform). In the part loop's layers (waistup.js waistUpLayers):
//   - the bare body keeps only its rows above the head cut; it and every head layer move by the neck offset;
//   - the clothes layer becomes the item's body, its greys in the player's skin tone (the ramp, 256 steps);
//   - the disk layer is drawn through the pose's transform (bilinear on premultiplied colour), then the front hand.
// Keyed on the layers' picture names, as the engine is: the clothes picture <stem>_<r|l>.png and the bare body
// <pre>_bo_01_c0<S>_<pose>.png (S the skin tone). A missing or broken pack (layout, CRC, a picture of the wrong size,
// a record missing or out of range: the engine's checks) leaves the layers as they were: the original look.
//
//   newstyleWaistUp(layers, sex, pose) -> Promise<Layer[]>: the layers to draw (the same array when not new-style)
//   parseNewstyleWu(text) / parseWuText(text) / rampLut(stops, colours) / newstyleLayers(layers, pack, pose) /
//   blendSkin(...) / blendDisk(...) / readPak(bytes): pure, for the tests
import { gameFile, WAISTUP } from './art.js';

export const NW_TABLE = WAISTUP + 'newstyle.txt';
export const nwPackName = (pre, code) => `${WAISTUP}${pre}_nw_${code}.pak`;

/** newstyle.txt -> [{ pre, code, stem, clothes }] (lines that don't parse are skipped, as the engine skips them). */
export function parseNewstyleWu(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*([mf])\s+([0-9a-f]{1,2})\s+(\d\d)\s+([a-z0-9_]+)\s*(#.*)?$/i.exec(line.replace(/\r$/, ''));
    if (!m || m[3] === '00') continue;
    const pre = m[1] === 'f' ? 'ww' : 'wm', stem = m[4].toLowerCase();
    if (!stem.startsWith(pre) || stem.length < 4 || stem.length > 47) continue;
    out.push({ pre, code: m[3], stem, clothes: parseInt(m[2], 16) });
  }
  return out;
}

/** wu.txt -> { stops, tones: {S: [[r,g,b]...]}, pose: { r: {box, neck, headcut, disk}, l } }; throws Error(why) on
 *  anything malformed (ovr/nwpak.h nwpak_parse_text's rules). */
export function parseWuText(text) {
  const out = { stops: null, tones: {}, pose: { r: {}, l: {} }, bare: null };
  const bad = why => { throw new Error(why); };
  for (const raw of String(text).split('\n')) {
    const t = raw.split('#')[0].trim().split(/[ \t\r]+/).filter(Boolean);
    if (!t.length) continue;
    const [k, ...a] = t;
    if (k === 'bare') {
      const v = a.map(Number);
      if (v.length !== 2 || v.some(x => !Number.isInteger(x) || x < 0 || x >= 768)) bad('bare: out of range');
      out.bare = v;
    } else if (k === 'ramp') {
      const st = a.map(Number);
      if (st.length < 2 || st.length > 16 || st.some((v, i) => !Number.isInteger(v) || v < 0 || v > 255 || (i && v <= st[i - 1])) ||
        st[0] !== 0 || st.at(-1) !== 255) bad('bad ramp');
      out.stops = st;
    } else if (k === 'tone') {
      const s = +a[0], v = a.slice(1).map(Number);
      if (!out.stops || !(s >= 1 && s <= 8) || v.length !== 3 * out.stops.length || v.some(x => !Number.isInteger(x) || x < 0 || x > 255)) bad(`tone ${a[0]}: bad record`);
      out.tones[s] = out.stops.map((_, i) => v.slice(3 * i, 3 * i + 3));
    } else if (k === 'pose' || k === 'neck' || k === 'headcut' || k === 'disk') {
      const p = a[0];
      if (p !== 'r' && p !== 'l') bad(`${k}: bad pose`);
      const v = a.slice(1).map(Number), P = out.pose[p];
      if (k === 'pose') {
        if (v.length !== 4 || v.some(x => !Number.isInteger(x))) bad('pose: bad record');
        const [x, y, w, h] = v;
        if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 768 || y + h > 768) bad(`pose ${p}: bad box`);
        P.box = v;
      } else if (k === 'neck') {
        if (v.length !== 2 || v.some(x => !Number.isInteger(x) || Math.abs(x) > 128)) bad(`neck ${p}: out of range`);
        P.neck = v;
      } else if (k === 'headcut') {
        if (v.length !== 1 || !Number.isInteger(v[0]) || v[0] <= 0 || v[0] > 768) bad(`headcut ${p}: out of range`);
        P.headcut = v[0];
      } else {
        if (v.length !== 6) bad('disk: bad record');
        const [cx, cy, angle, scale, dx, dy] = v;
        if (!(scale >= 0.5 && scale <= 2) || !(Math.abs(angle) <= 90) || !(Math.abs(dx) <= 768) || !(Math.abs(dy) <= 768) ||
          !(Math.abs(cx) <= 1536) || !(Math.abs(cy) <= 1536)) bad(`disk ${p}: out of range`);
        P.disk = { cx, cy, angle, scale, dx, dy };
      }
    } else bad(`unknown record ${k}`);
  }
  if (!out.bare) bad('bare missing');
  if (!out.stops || !Object.keys(out.tones).length) bad('no ramp');
  const n = Math.max(...Object.keys(out.tones).map(Number));
  for (let s = 1; s <= n; s++) if (!out.tones[s]) bad(`tone ${s} missing`);
  for (const p of ['r', 'l']) for (const k of ['box', 'neck', 'headcut', 'disk']) if (out.pose[p][k] == null) bad(`${k} ${p} missing`);
  return out;
}

/** A tone's 256-step skin table (Uint8Array, r g b per grey): linear between the stops, rounded (nwpak_build_lut). */
export function rampLut(stops, colours) {
  const lut = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v++) {
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1]) k++;
    const span = stops[k + 1] - stops[k], f = span ? (v - stops[k]) / span : 0;
    for (let c = 0; c < 3; c++) lut[v * 3 + c] = Math.trunc(colours[k][c] * (1 - f) + colours[k + 1][c] * f + 0.5);
  }
  return lut;
}

let crcTable = null;
function crc32(b) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[i] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The pack's entries { name: Uint8Array }, every entry stored and its CRC right; throws Error(why) otherwise. */
export function readPak(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 12 || String.fromCharCode(...b.subarray(0, 8)) !== 'YO2NSPK1') throw new Error('not a pack');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), n = dv.getUint32(8, true);
  if (!n || n > 64) throw new Error(`${n} entries`);
  let at = 12, data = 0;
  const dir = [];
  for (let i = 0; i < n; i++) {
    if (at >= b.length) throw new Error('truncated directory');
    const ln = b[at];
    if (!ln || ln > 63 || at + 1 + ln + 13 > b.length) throw new Error('truncated directory');
    const name = String.fromCharCode(...b.subarray(at + 1, at + 1 + ln));
    const method = b[at + 1 + ln], stored = dv.getUint32(at + 2 + ln, true), size = dv.getUint32(at + 6 + ln, true), crc = dv.getUint32(at + 10 + ln, true);
    if (method !== 0 || stored !== size || size > 8 << 20) throw new Error(`${name}: bad sizes`);
    if (dir.some(d => d.name === name)) throw new Error(`${name} twice`);
    dir.push({ name, off: data, size, crc });
    data += stored;
    at += 1 + ln + 13;
  }
  if (at + data !== b.length) throw new Error(at + data > b.length ? 'truncated' : 'trailing bytes');
  const out = {};
  for (const d of dir) {
    const e = b.subarray(at + d.off, at + d.off + d.size);
    if (crc32(e) !== d.crc) throw new Error(`${d.name}: corrupt (CRC)`);
    out[d.name] = e;
  }
  return out;
}

const STEP = { BODY: 1, CLOTHES: 10, FRONT: 11, DISK: 12 };
/** The layers to draw for pack `pack` ({ wu, pics: { body_r, hand_r, body_l, hand_l } ImageData-like }) in pose
 *  index `pose` (0 r, 1 l) and skin tone `skin` (1..): see the header. Pure. */
export function newstyleLayers(layers, pack, pose, skin) {
  const P = pack.wu.pose[pose ? 'l' : 'r'], key = pose ? 'l' : 'r';
  const lut = rampLut(pack.wu.stops, pack.wu.tones[skin]);
  // the caller's shift of the whole bust (the bare body's layer against its place in the pack): none in the part loop
  const bodyL = layers.find(l => l.step === STEP.BODY), ox = bodyL ? bodyL.x - pack.wu.bare[0] : 0, oy = bodyL ? bodyL.y - pack.wu.bare[1] : 0;
  const bx = P.box[0] + ox, by = P.box[1] + oy, [nx, ny] = P.neck;
  const disk = { ...P.disk, cx: P.disk.cx + ox, cy: P.disk.cy + oy };
  const out = [];
  for (const l of layers) {
    if (l.step === STEP.CLOTHES) out.push({ ...l, nw: 'body', image: `nw_body_${key}.png`, pixels: pack.pics[`body_${key}`], lut, x: bx, y: by,
      w: P.box[2], h: P.box[3], tone: skin });
    else if (l.step === STEP.DISK) {
      out.push({ ...l, nw: 'disk', disk });
      out.push({ step: 13, kind: 13, nw: 'hand', image: `nw_hand_${key}.png`, path: l.path + '#hand', pixels: pack.pics[`hand_${key}`], lut,
        x: bx, y: by, w: P.box[2], h: P.box[3], tone: skin });
    } else if (l.step === STEP.BODY) out.push({ ...l, x: l.x + nx, y: l.y + ny, h: Math.max(0, Math.min(l.h, P.headcut + oy - l.y)) });
    else out.push({ ...l, x: l.x + nx, y: l.y + ny });
  }
  return out;
}

/** blendInto's blend with the skin greys of src (R = G = B) through lut. */
export function blendSkin(dst, size, src, x, y, lut) {
  const s = src.data, sw = src.width, sh = src.height;
  for (let j = 0; j < sh; j++) {
    const Y = y + j;
    if (Y < 0 || Y >= size) continue;
    for (let i = 0; i < sw; i++) {
      const X = x + i;
      if (X < 0 || X >= size) continue;
      const si = (j * sw + i) * 4, a = s[si + 3];
      if (!a) continue;
      let r = s[si], g = s[si + 1], b = s[si + 2];
      if (r === g && g === b) { const v = r * 3; r = lut[v]; g = lut[v + 1]; b = lut[v + 2]; }
      const di = (Y * size + X) * 4, k = a / 255, inv = 1 - k;
      dst[di] = dst[di] * inv + r * k; dst[di + 1] = dst[di + 1] * inv + g * k; dst[di + 2] = dst[di + 2] * inv + b * k;
      if (a > dst[di + 3]) dst[di + 3] = a;
    }
  }
}

/** A disk strip (ImageData-like, its w x h drawn at canvas sx, sy) through the transform: rotated (degrees, clockwise
 *  on screen) and scaled about (cx, cy), then moved (dx, dy). Bilinear on premultiplied colour (nw_blend_disk). */
export function blendDisk(dst, size, src, sx, sy, w, h, { cx, cy, angle, scale, dx, dy }) {
  const t = angle * Math.PI / 180, c = Math.cos(t) * scale, s = Math.sin(t) * scale;
  const m = [c, -s, cx - c * cx + s * cy + dx, s, c, cy - s * cx - c * cy + dy];
  const det = m[0] * m[4] - m[1] * m[3];
  if (Math.abs(det) < 1e-9) return;
  const i0 = m[4] / det, i1 = -m[1] / det, i3 = -m[3] / det, i4 = m[0] / det;
  w = Math.min(w, src.width); h = Math.min(h, src.height);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < 4; k++) {
    const X = sx + (k & 1 ? w : 0), Y = sy + (k & 2 ? h : 0);
    const u = m[0] * X + m[1] * Y + m[2], v = m[3] * X + m[4] * Y + m[5];
    x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v);
  }
  const ax = Math.max(0, Math.floor(x0) - 1), ay = Math.max(0, Math.floor(y0) - 1), bx = Math.min(size, Math.ceil(x1) + 1), by = Math.min(size, Math.ceil(y1) + 1);
  const d = src.data, sw = src.width;
  for (let Y = ay; Y < by; Y++) for (let X = ax; X < bx; X++) {
    const qx = X - m[2], qy = Y - m[5], u = i0 * qx + i1 * qy - sx, v = i3 * qx + i4 * qy - sy;
    if (u <= -1 || v <= -1 || u >= w || v >= h) continue;
    const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
    let r = 0, g = 0, b = 0, a = 0;
    for (let k = 0; k < 4; k++) {
      const uu = u0 + (k & 1), vv = v0 + (k >> 1);
      if (uu < 0 || vv < 0 || uu >= w || vv >= h) continue;
      const wt = (k & 1 ? fu : 1 - fu) * (k >> 1 ? fv : 1 - fv), si = (vv * sw + uu) * 4, al = d[si + 3] * wt;
      r += d[si] * al; g += d[si + 1] * al; b += d[si + 2] * al; a += al;
    }
    if (a < 0.5) continue;
    const A = Math.min(255, Math.trunc(a + 0.5)), k = A / 255, inv = 1 - k, di = (Y * size + X) * 4;
    dst[di] = dst[di] * inv + Math.trunc(r / a + 0.5) * k; dst[di + 1] = dst[di + 1] * inv + Math.trunc(g / a + 0.5) * k;
    dst[di + 2] = dst[di + 2] * inv + Math.trunc(b / a + 0.5) * k;
    if (A > dst[di + 3]) dst[di + 3] = A;
  }
}

// ---- reading (once a session)

let table = null;
const packs = new Map();
function nwTable() {
  return table ||= gameFile(NW_TABLE).then(b => parseNewstyleWu(b ? new TextDecoder().decode(b) : '')).catch(() => { table = null; return []; });
}
async function decodePng(bytes) {
  const blob = new Blob([bytes], { type: 'image/png' });
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
/** A style's checked pack { wu, pics } (Promise), or null (logged once) when it is missing or broken. */
export function loadPack(style, { read = gameFile, decode = decodePng } = {}) {
  const name = nwPackName(style.pre, style.code);
  if (!packs.has(name)) packs.set(name, (async () => {
    const bytes = await read(name);
    if (!bytes?.length) throw new Error('missing');
    const e = readPak(bytes);
    if (!e['wu.txt']) throw new Error('wu.txt missing');
    const wu = parseWuText(new TextDecoder().decode(e['wu.txt']));
    const pics = {};
    for (const p of ['r', 'l']) for (const k of ['body', 'hand']) {
      const n = `${k}_${p}.png`;
      if (!e[n]) throw new Error(`${n} missing`);
      const img = await decode(e[n]);
      if (img.width !== wu.pose[p].box[2] || img.height !== wu.pose[p].box[3]) throw new Error(`${n}: not ${wu.pose[p].box[2]} x ${wu.pose[p].box[3]}`);
      pics[`${k}_${p}`] = img;
    }
    return { wu, pics };
  })().catch(err => { console.warn(`waist-up: ${name}: ${err.message}; ${style.stem} stays original`); return null; }));
  return packs.get(name);
}

const base = img => String(img || '').toLowerCase().split('/').pop();
/** The part loop's layers, new-style when they draw a listed outfit with a good pack (else the same array). */
export async function newstyleWaistUp(layers, { tableOf = nwTable, load = loadPack } = {}) {
  const styles = await tableOf().catch(() => []);
  if (!styles?.length) return layers;
  let style = null, pose = -1;
  for (const l of layers) {
    if (l.step !== STEP.CLOTHES) continue;
    const n = base(l.image);
    style = styles.find(s => n === `${s.stem}_r.png` || n === `${s.stem}_l.png`) || null;
    if (style) pose = n.endsWith('_l.png') ? 1 : 0;
  }
  if (!style) return layers;
  const body = layers.find(l => l.step === STEP.BODY && new RegExp(`^${style.pre}_bo_01_c0([1-8])_${'rl'[pose]}\\.png$`).test(base(l.image)));
  if (!body) return layers;
  const skin = +base(body.image)[11];
  const pack = await load(style);
  if (!pack || !pack.wu.tones[skin]) return layers;
  return newstyleLayers(layers, pack, pose, skin);
}

/** Tests: forget the table and the packs. */
export function _resetNewstyleWu() { table = null; packs.clear(); }
