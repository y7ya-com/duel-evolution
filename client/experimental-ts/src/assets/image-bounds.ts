/** Header checks only: successful inspection does not prove that pixels will decode. */
export interface ImageLimits {
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  maxDecodedBytes: number;
  /** Maximum prefix traversed before PNG IDAT / JPEG SOS. */
  maxHeaderBytes: number;
  /** Also caps WebP chunks. */
  maxJpegMarkers: number;
}
export const DEFAULT_IMAGE_LIMITS: Readonly<ImageLimits> = Object.freeze({
  maxWidth: 8192, maxHeight: 8192, maxPixels: 16_777_216,
  maxDecodedBytes: 64 * 1024 * 1024, maxHeaderBytes: 1024 * 1024, maxJpegMarkers: 1024,
});
export interface ImageBudget {
  readonly format: 'png' | 'jpeg' | 'bmp' | 'webp';
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
  /** One width * height * 4 RGBA surface; not measured browser/GPU usage. */
  readonly decodedBytes: number;
}
function invalid(message: string): never { throw new Error(`Invalid image: ${message}`); }
function product(a: number, b: number): number {
  const n = a * b;
  if (!Number.isSafeInteger(n)) invalid('unsafe integer overflow');
  return n;
}
class Header {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  need(at: number, size: number): void {
    if (!Number.isSafeInteger(at + size) || at < 0 || size < 0 || at + size > this.bytes.length) invalid('truncated header or chunk');
  }
  u8(at: number): number { this.need(at, 1); return this.view.getUint8(at); }
  u16(at: number, le = false): number { this.need(at, 2); return this.view.getUint16(at, le); }
  u32(at: number, le = false): number { this.need(at, 4); return this.view.getUint32(at, le); }
  i32(at: number): number { this.need(at, 4); return this.view.getInt32(at, true); }
  text(at: number, text: string): boolean {
    this.need(at, text.length);
    return [...text].every((c, i) => this.bytes[at + i] === c.charCodeAt(0));
  }
}
function prefix(end: number, limits: ImageLimits): void {
  if (end > limits.maxHeaderBytes) invalid('header traversal limit');
}
function png(h: Header, limits: ImageLimits): [number, number] {
  if (!h.text(0, '\x89PNG\r\n\x1a\n') || h.u32(8) !== 13 || !h.text(12, 'IHDR')) invalid('PNG signature or IHDR');
  h.need(0, 33);
  if (h.u32(16) > 0x7fffffff || h.u32(20) > 0x7fffffff) invalid('PNG dimensions exceed format range');
  const depth = h.u8(24), color = h.u8(25);
  const depths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!depths[color]?.includes(depth) || h.u8(26) !== 0 || h.u8(27) !== 0 || h.u8(28) > 1) invalid('PNG IHDR fields');
  // IHDR CRC protects the dimensions; no pixel-data CRC/decompression is attempted.
  let crc = 0xffffffff;
  for (let i = 12; i < 29; i++) {
    crc ^= h.u8(i);
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  if (((crc ^ 0xffffffff) >>> 0) !== h.u32(29)) invalid('PNG IHDR CRC');
  let at = 33;
  while (true) {
    prefix(at + 8, limits);
    const size = h.u32(at);
    h.need(at, size + 12);
    if (h.text(at + 4, 'acTL')) invalid('animated PNG unsupported');
    if (h.text(at + 4, 'IHDR') || h.text(at + 4, 'IEND')) invalid('PNG missing IDAT or duplicate IHDR');
    if (h.text(at + 4, 'IDAT')) return [h.u32(16), h.u32(20)];
    at += size + 12;
  }
}
function jpeg(h: Header, limits: ImageLimits): [number, number] {
  if (h.u16(0) !== 0xffd8) invalid('JPEG SOI');
  let at = 2, frame: [number, number] | undefined, progressive = false;
  let componentIds: number[] = [];
  for (let count = 0; count < limits.maxJpegMarkers; count++) {
    prefix(at + 2, limits);
    if (h.u8(at++) !== 0xff) invalid('JPEG marker prefix');
    while (h.u8(at) === 0xff) { at++; prefix(at + 1, limits); }
    const marker = h.u8(at++);
    if (marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) invalid('unexpected JPEG marker');
    const size = h.u16(at);
    if (size < 2) invalid('JPEG segment length');
    prefix(at + size, limits); h.need(at, size);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (frame || ![0xc0, 0xc1, 0xc2].includes(marker)) invalid('duplicate or unsupported JPEG frame');
      if (size < 8 || h.u8(at + 2) !== 8) invalid('JPEG frame precision or length');
      const components = h.u8(at + 7);
      if (![1, 3, 4].includes(components) || size !== 8 + 3 * components) invalid('JPEG frame components');
      componentIds = [];
      progressive = marker === 0xc2;
      for (let i = 0; i < components; i++) {
        const p = at + 8 + i * 3, id = h.u8(p), sampling = h.u8(p + 1);
        if (componentIds.includes(id) || (sampling >> 4) < 1 || (sampling >> 4) > 4 || (sampling & 15) < 1 || (sampling & 15) > 4 || h.u8(p + 2) > 3) invalid('JPEG frame component');
        componentIds.push(id);
      }
      frame = [h.u16(at + 5), h.u16(at + 3)];
    }
    if (marker === 0xda) {
      if (!frame || size < 6) invalid('JPEG scan before frame');
      const components = h.u8(at + 2), seen = new Set<number>();
      if (components < 1 || components > componentIds.length || size !== 6 + components * 2) invalid('JPEG scan length');
      for (let i = 0; i < components; i++) {
        const id = h.u8(at + 3 + i * 2), tables = h.u8(at + 4 + i * 2);
        if (!componentIds.includes(id) || seen.has(id) || (tables >> 4) > 3 || (tables & 15) > 3) invalid('JPEG scan component');
        seen.add(id);
      }
      const end = at + size, startBand = h.u8(end - 3), endBand = h.u8(end - 2), successive = h.u8(end - 1);
      if (progressive) {
        if (startBand > endBand || endBand > 63 || (startBand === 0 && endBand !== 0) || (startBand > 0 && components !== 1) || (successive >> 4) > 13 || (successive & 15) > 13) invalid('JPEG progressive scan fields');
      } else if (startBand !== 0 || endBand !== 63 || successive !== 0) invalid('JPEG sequential scan fields');
      return frame;
    }
    at += size;
  }
  return invalid('JPEG marker traversal limit');
}
function bmp(h: Header): [number, number] {
  if (!h.text(0, 'BM') || h.u32(2, true) !== h.bytes.length || h.u32(6, true) !== 0) invalid('BMP file header');
  const offset = h.u32(10, true), dib = h.u32(14, true);
  if (![12, 40, 52, 56, 108, 124].includes(dib)) invalid('unsupported BMP DIB');
  h.need(14, dib);
  if (offset < 14 + dib || offset >= h.bytes.length) invalid('BMP pixel offset');
  let width: number, height: number, bpp: number;
  if (dib === 12) {
    width = h.u16(18, true); height = h.u16(20, true); bpp = h.u16(24, true);
    if (h.u16(22, true) !== 1 || ![1, 4, 8, 24].includes(bpp)) invalid('BMP core fields');
  } else {
    width = h.i32(18); height = Math.abs(h.i32(22)); bpp = h.u16(28, true);
    const compression = h.u32(30, true);
    if (h.u16(26, true) !== 1 || ![1, 4, 8, 16, 24, 32].includes(bpp) || ![0, 3, 6].includes(compression) || (compression !== 0 && ![16, 32].includes(bpp))) invalid('unsupported BMP encoding');
    if (compression !== 0 && dib === 40 && offset < 54 + (compression === 6 ? 16 : 12)) invalid('BMP missing bit masks');
    if (compression === 6 && dib === 52) invalid('BMP missing alpha mask');
    if (compression !== 0) {
      const masks = [h.u32(54, true), h.u32(58, true), h.u32(62, true)];
      if (compression === 6) masks.push(h.u32(66, true));
      for (let i = 0; i < masks.length; i++) {
        if (!masks[i] || (bpp === 16 && masks[i] > 0xffff) || masks.slice(0, i).some(mask => (mask & masks[i]) !== 0)) invalid('BMP bit masks');
      }
    }
  }
  if (width < 1 || height < 1) invalid('BMP dimensions');
  const row = product(Math.ceil(product(width, bpp) / 32), 4);
  if (product(row, height) > h.bytes.length - offset) invalid('truncated BMP pixels');
  return [width, height];
}
function webp(h: Header, limits: ImageLimits): [number, number] {
  if (!h.text(0, 'RIFF') || !h.text(8, 'WEBP') || h.u32(4, true) + 8 !== h.bytes.length) invalid('WebP RIFF header');
  let at = 12, chunks = 0, canvas: [number, number] | undefined, frame: [number, number] | undefined;
  const u24 = (p: number): number => h.u8(p) + h.u8(p + 1) * 256 + h.u8(p + 2) * 65536;
  while (at < h.bytes.length) {
    // Reuse the marker count bound to cap all chunk work, even for empty chunks.
    if (++chunks > limits.maxJpegMarkers) invalid('WebP chunk traversal limit');
    h.need(at, 8);
    const size = h.u32(at + 4, true), p = at + 8;
    h.need(p, size + (size % 2));
    if (size % 2 && h.u8(p + size) !== 0) invalid('WebP chunk padding');
    if (h.text(at, 'ANIM') || h.text(at, 'ANMF')) invalid('animated WebP unsupported');
    if (h.text(at, 'VP8X')) {
      if (at !== 12 || canvas || size !== 10 || (h.u8(p) & 0xc1) !== 0 || h.u8(p + 1) || h.u8(p + 2) || h.u8(p + 3)) invalid('WebP extended header');
      if (h.u8(p) & 2) invalid('animated WebP unsupported');
      canvas = [u24(p + 4) + 1, u24(p + 7) + 1];
    } else if (h.text(at, 'VP8 ') || h.text(at, 'VP8L')) {
      if (frame) invalid('duplicate WebP image');
      if (h.text(at, 'VP8 ')) {
        if (size < 10 || (h.u8(p) & 1) || ((h.u8(p) >> 1) & 7) > 3 || !(h.u8(p) & 0x10) || !h.text(p + 3, '\x9d\x01\x2a')) invalid('WebP VP8 key frame');
        frame = [h.u16(p + 6, true) & 0x3fff, h.u16(p + 8, true) & 0x3fff];
      } else {
        if (size < 5 || h.u8(p) !== 0x2f || (h.u8(p + 4) >> 5) !== 0) invalid('WebP lossless header');
        const bits = h.u32(p + 1, true);
        frame = [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
      }
    }
    at = p + size + (size % 2);
  }
  if (!frame || (canvas && (canvas[0] !== frame[0] || canvas[1] !== frame[1]))) invalid('WebP missing image or conflicting dimensions');
  return frame;
}
/** Fail closed for unsupported MIME types and signature mismatches. No browser APIs. */
export function imageBudget(bytes: Uint8Array, mime: string, overrides: Partial<ImageLimits> = {}): ImageBudget {
  const limits = { ...DEFAULT_IMAGE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`Invalid image limit: ${name}`);
  }
  // Configurable work bounds must remain bounded even with accidental huge settings.
  if (limits.maxHeaderBytes > 16 * 1024 * 1024 || limits.maxJpegMarkers > 65536) throw new RangeError('Image traversal limits too large');
  const h = new Header(bytes);
  let dimensions: [number, number], format: ImageBudget['format'];
  switch (mime.trim().toLowerCase()) {
    case 'image/png': format = 'png'; dimensions = png(h, limits); break;
    case 'image/jpeg': format = 'jpeg'; dimensions = jpeg(h, limits); break;
    case 'image/bmp': format = 'bmp'; dimensions = bmp(h); break;
    case 'image/webp': format = 'webp'; dimensions = webp(h, limits); break;
    default: return invalid('unsupported image MIME type');
  }
  const [width, height] = dimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) invalid('dimensions must be positive safe integers');
  const pixels = product(width, height), decodedBytes = product(pixels, 4);
  if (width > limits.maxWidth || height > limits.maxHeight || pixels > limits.maxPixels || decodedBytes > limits.maxDecodedBytes) invalid('dimension or decoded byte limit');
  return Object.freeze({ format, width, height, pixels, decodedBytes });
}
