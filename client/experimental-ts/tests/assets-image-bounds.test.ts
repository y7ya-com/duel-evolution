import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_LIMITS, imageBudget } from '../src/assets/image-bounds';

function concat(...parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return bytes;
}
const text = (value: string) => Uint8Array.from([...value].map(c => c.charCodeAt(0)));
function png(width = 3, height = 2): Uint8Array {
  const bytes = new Uint8Array(45), v = new DataView(bytes.buffer);
  bytes.set(text('\x89PNG\r\n\x1a\n')); v.setUint32(8, 13); bytes.set(text('IHDR'), 12);
  v.setUint32(16, width); v.setUint32(20, height); bytes[24] = 8; bytes[25] = 6;
  crc(bytes); bytes.set(text('IDAT'), 37);
  return bytes;
}
function crc(bytes: Uint8Array): void {
  let value = 0xffffffff;
  for (let i = 12; i < 29; i++) {
    value ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(29, (value ^ 0xffffffff) >>> 0);
}
const segment = (marker: number, payload: number[]) => Uint8Array.of(255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload);
function jpeg(width = 3, height = 2, marker = 0xc0): Uint8Array {
  return concat(Uint8Array.of(255, 216),
    segment(marker, [8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]),
    segment(0xda, [1, 1, 0, 0, marker === 0xc2 ? 0 : 63, 0]));
}
function bmp(width = 3, signedHeight = 2, core = false): Uint8Array {
  const offset = core ? 26 : 54, row = Math.ceil(width * 24 / 32) * 4;
  const bytes = new Uint8Array(offset + row * Math.abs(signedHeight)), v = new DataView(bytes.buffer);
  bytes.set(text('BM')); v.setUint32(2, bytes.length, true); v.setUint32(10, offset, true); v.setUint32(14, core ? 12 : 40, true);
  if (core) { v.setUint16(18, width, true); v.setUint16(20, signedHeight, true); v.setUint16(22, 1, true); v.setUint16(24, 24, true); }
  else { v.setInt32(18, width, true); v.setInt32(22, signedHeight, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); }
  return bytes;
}
function chunk(name: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length + payload.length % 2);
  bytes.set(text(name)); new DataView(bytes.buffer).setUint32(4, payload.length, true); bytes.set(payload, 8); return bytes;
}
function riff(...chunks: Uint8Array[]): Uint8Array {
  const bytes = concat(text('RIFF\0\0\0\0WEBP'), ...chunks);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true); return bytes;
}
function vp8(width = 3, height = 2): Uint8Array {
  const payload = Uint8Array.of(0x10, 0, 0, 0x9d, 1, 0x2a, 0, 0, 0, 0);
  const v = new DataView(payload.buffer); v.setUint16(6, width, true); v.setUint16(8, height, true);
  return chunk('VP8 ', payload);
}
function vp8l(width = 3, height = 2): Uint8Array {
  const payload = Uint8Array.of(0x2f, 0, 0, 0, 0);
  new DataView(payload.buffer).setUint32(1, ((width - 1) | ((height - 1) << 14)) >>> 0, true);
  return chunk('VP8L', payload);
}
function vp8x(width = 3, height = 2, flags = 0): Uint8Array {
  const payload = new Uint8Array(10); payload[0] = flags;
  for (let i = 0; i < 3; i++) { payload[4 + i] = (width - 1) >>> (i * 8); payload[7 + i] = (height - 1) >>> (i * 8); }
  return chunk('VP8X', payload);
}
const fixtures: [string, () => Uint8Array][] = [
  ['image/png', png], ['image/jpeg', jpeg], ['image/bmp', bmp], ['image/webp', () => riff(vp8())],
];

describe('image header budgets', () => {
  it.each(fixtures)('estimates exactly one RGBA surface for %s', (mime, make) => {
    const bytes = make(), copy = bytes.slice();
    expect(imageBudget(bytes, mime)).toEqual({ format: mime.split('/')[1], width: 3, height: 2, pixels: 6, decodedBytes: 24 });
    expect(bytes).toEqual(copy);
    const padded = concat(Uint8Array.of(7, 8), bytes, Uint8Array.of(9));
    expect(imageBudget(padded.subarray(2, 2 + bytes.length), mime).decodedBytes).toBe(24);
  });
  it.each(fixtures)('rejects every truncated prefix of %s', (mime, make) => {
    const bytes = make();
    for (let end = 0; end < bytes.length; end++) expect(() => imageBudget(bytes.subarray(0, end), mime), `prefix ${end}`).toThrow('Invalid image');
  });
  it.each(fixtures)('enforces width, height, pixels and decoded bytes independently for %s', (mime, make) => {
    for (const limits of [{ maxWidth: 2 }, { maxHeight: 1 }, { maxPixels: 5 }, { maxDecodedBytes: 23 }]) {
      expect(() => imageBudget(make(), mime, limits)).toThrow('limit');
    }
    expect(imageBudget(make(), mime, { maxWidth: 3, maxHeight: 2, maxPixels: 6, maxDecodedBytes: 24 }).decodedBytes).toBe(24);
  });
  it('fails closed for unknown MIME types, aliases, parameters and signature mismatches', () => {
    for (const mime of ['image/gif', 'image/svg+xml', 'application/octet-stream', '', 'image/jpg', 'image/png; charset=utf-8']) {
      expect(() => imageBudget(png(), mime)).toThrow('unsupported image MIME');
    }
    expect(imageBudget(png(), ' IMAGE/PNG ').format).toBe('png');
    for (const [mime, make] of fixtures) {
      const bytes = make(); bytes[0] = 0;
      expect(() => imageBudget(bytes, mime)).toThrow();
    }
  });
  it('rejects unsafe/invalid configuration and freezes defaults', () => {
    for (const key of Object.keys(DEFAULT_IMAGE_LIMITS)) for (const value of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => imageBudget(png(), 'image/png', { [key]: value })).toThrow(RangeError);
    }
    expect(() => imageBudget(png(), 'image/png', { maxHeaderBytes: 16 * 1024 * 1024 + 1 })).toThrow(RangeError);
    expect(() => imageBudget(png(), 'image/png', { maxJpegMarkers: 65537 })).toThrow(RangeError);
    expect(Object.isFrozen(DEFAULT_IMAGE_LIMITS)).toBe(true);
  });
});

describe('PNG safety', () => {
  it('accepts legal IHDR color/depth combinations and interlacing', () => {
    for (const [color, depths] of [[0, [1, 2, 4, 8, 16]], [2, [8, 16]], [3, [1, 2, 4, 8]], [4, [8, 16]], [6, [8, 16]]] as const) {
      for (const depth of depths) {
        const bytes = png(); bytes[24] = depth; bytes[25] = color; bytes[28] = 1; crc(bytes);
        expect(imageBudget(bytes, 'image/png').decodedBytes).toBe(24);
      }
    }
  });
  it.each([[0, 1], [1, 0], [0xffffffff, 0xffffffff], [8193, 1], [8192, 8192]])('rejects bomb/zero dimensions %j', (w, h) => {
    expect(() => imageBudget(png(w, h), 'image/png')).toThrow();
  });
  it('rejects multiplication overflow even with relaxed limits', () => {
    const huge = { maxWidth: Number.MAX_SAFE_INTEGER, maxHeight: Number.MAX_SAFE_INTEGER, maxPixels: Number.MAX_SAFE_INTEGER, maxDecodedBytes: Number.MAX_SAFE_INTEGER };
    expect(() => imageBudget(png(0x7fffffff, 0x7fffffff), 'image/png', huge)).toThrow('overflow');
    // Pixel product is safe here, but multiplying by four is not.
    expect(() => imageBudget(png(0x4000000, 0x4000000), 'image/png', huge)).toThrow('overflow');
  });
  it('checks IHDR structure, fields, and CRC', () => {
    for (const [at, value] of [[8, 1], [12, 0], [24, 3], [25, 5], [26, 1], [27, 1], [28, 2]]) {
      const bytes = png(); bytes[at] = value; crc(bytes);
      expect(() => imageBudget(bytes, 'image/png')).toThrow();
    }
    const bytes = png(); bytes[16] ^= 1;
    expect(() => imageBudget(bytes, 'image/png')).toThrow('CRC');
  });
  it('bounds pre-IDAT traversal and rejects animations and oversized chunks', () => {
    expect(() => imageBudget(png(), 'image/png', { maxHeaderBytes: 40 })).toThrow('traversal');
    const animated = png(); animated.set(text('acTL'), 37);
    expect(() => imageBudget(animated, 'image/png')).toThrow('animated');
    const truncated = png(); new DataView(truncated.buffer).setUint32(33, 0xffffffff);
    expect(() => imageBudget(truncated, 'image/png')).toThrow('truncated');
    const extra = new Uint8Array(12); extra.set(text('tEXt'), 4);
    expect(imageBudget(concat(png().subarray(0, 33), extra, png().subarray(33)), 'image/png').pixels).toBe(6);
    for (const name of ['IHDR', 'IEND']) {
      const bytes = png(); bytes.set(text(name), 37);
      expect(() => imageBudget(bytes, 'image/png')).toThrow();
    }
  });
});

describe('JPEG safety', () => {
  it.each([0xc0, 0xc1, 0xc2])('supports 8-bit frame marker %i', marker => {
    expect(imageBudget(jpeg(3, 2, marker), 'image/jpeg').pixels).toBe(6);
  });
  it('skips bounded APP/COM segments and marker fill bytes', () => {
    const bytes = concat(Uint8Array.of(255, 216, 255, 255, 255), segment(0xe1, [1, 2, 3]).subarray(1), segment(0xfe, []), jpeg().subarray(2));
    expect(imageBudget(bytes, 'image/jpeg').width).toBe(3);
    expect(() => imageBudget(bytes, 'image/jpeg', { maxHeaderBytes: 10 })).toThrow('traversal');
    expect(() => imageBudget(bytes, 'image/jpeg', { maxJpegMarkers: 2 })).toThrow('traversal');
    const fills = concat(Uint8Array.of(255, 216), new Uint8Array(100).fill(255));
    expect(() => imageBudget(fills, 'image/jpeg', { maxHeaderBytes: 16 })).toThrow('traversal');
  });
  it('rejects marker floods within the byte budget', () => {
    const bytes = concat(Uint8Array.of(255, 216), ...Array.from({ length: 1025 }, () => segment(0xe0, [])), jpeg().subarray(2));
    expect(() => imageBudget(bytes, 'image/jpeg')).toThrow('marker traversal');
  });
  it.each([[0, 2], [3, 0], [65535, 65535], [8193, 1]])('rejects zero/bomb JPEG dimensions %j', (w, h) => {
    expect(() => imageBudget(jpeg(w, h), 'image/jpeg')).toThrow();
  });
  it('rejects invalid segments, unsupported frames, duplicate frames and scan-before-frame', () => {
    const frame = jpeg().subarray(2, 15);
    for (const bytes of [
      Uint8Array.of(255, 216, 255, 224, 0, 1), Uint8Array.of(255, 216, 255, 224, 255, 255),
      Uint8Array.of(255, 216, 1, 2), Uint8Array.of(255, 216, 255, 0), Uint8Array.of(255, 216, 255, 217),
      jpeg(3, 2, 0xc3), concat(Uint8Array.of(255, 216), frame, jpeg().subarray(2)),
      concat(Uint8Array.of(255, 216), segment(0xda, [1, 1, 0, 0, 63, 0])),
    ]) expect(() => imageBudget(bytes, 'image/jpeg')).toThrow();
    for (const [at, value] of [[6, 12], [11, 2], [13, 0], [14, 4], [20, 9]]) {
      const bytes = jpeg(); bytes[at] = value;
      expect(() => imageBudget(bytes, 'image/jpeg')).toThrow();
    }
  });
});

describe('BMP safety', () => {
  it('accepts core headers and signed top-down heights', () => {
    expect(imageBudget(bmp(3, 2, true), 'image/bmp').height).toBe(2);
    expect(imageBudget(bmp(3, -2), 'image/bmp').height).toBe(2);
  });
  it('accepts supported extended DIB sizes and disjoint RGB/alpha masks', () => {
    for (const dib of [40, 52, 56, 108, 124]) for (const compression of [0, 3, 6]) {
      if (dib === 52 && compression === 6) continue;
      const source = bmp(), offset = 14 + dib + (dib === 40 && compression ? (compression === 6 ? 16 : 12) : 0);
      const bytes = new Uint8Array(offset + 3 * 2 * 4), v = new DataView(bytes.buffer);
      bytes.set(source.subarray(0, 54)); v.setUint32(2, bytes.length, true); v.setUint32(10, offset, true);
      v.setUint32(14, dib, true); v.setUint16(28, 32, true); v.setUint32(30, compression, true);
      if (compression) {
        v.setUint32(54, 0xff0000, true); v.setUint32(58, 0xff00, true); v.setUint32(62, 0xff, true);
        if (compression === 6) v.setUint32(66, 0xff000000, true);
      }
      expect(imageBudget(bytes, 'image/bmp').decodedBytes).toBe(24);
      if (compression) {
        v.setUint32(58, 0xff0000, true);
        expect(() => imageBudget(bytes, 'image/bmp')).toThrow('bit masks');
      }
    }
  });
  it('rejects malformed DIB/planes/depth/compression/offsets and dimension bombs', () => {
    for (const mutate of [
      (v: DataView) => v.setUint32(14, 39, true), (v: DataView) => v.setUint16(26, 2, true),
      (v: DataView) => v.setUint16(28, 0, true), (v: DataView) => v.setUint32(30, 1, true),
      (v: DataView) => v.setUint32(10, 12, true), (v: DataView) => v.setUint32(10, 0xffffffff, true),
      (v: DataView) => v.setInt32(18, 0, true), (v: DataView) => v.setInt32(18, -3, true),
      (v: DataView) => v.setInt32(22, 0, true), (v: DataView) => v.setInt32(22, -2147483648, true),
      (v: DataView) => { v.setInt32(18, 2147483647, true); v.setInt32(22, 2147483647, true); },
    ]) {
      const bytes = bmp(); mutate(new DataView(bytes.buffer));
      expect(() => imageBudget(bytes, 'image/bmp')).toThrow();
    }
  });
});

describe('WebP safety', () => {
  it('accepts lossy, lossless and matching extended canvas headers', () => {
    for (const bytes of [riff(vp8()), riff(vp8l()), riff(vp8x(), vp8()), riff(vp8x(), vp8l())]) {
      expect(imageBudget(bytes, 'image/webp').decodedBytes).toBe(24);
    }
  });
  it('rejects animations, malformed chunks, conflicting dimensions and bombs', () => {
    for (const bytes of [
      riff(vp8x(3, 2, 2), vp8()), riff(chunk('ANIM', new Uint8Array()), vp8()),
      riff(chunk('ANMF', new Uint8Array()), vp8()), riff(vp8x(4, 2), vp8()), riff(vp8(), vp8()),
      riff(vp8x()), riff(vp8(0, 2)), riff(vp8(16383, 16383)), riff(vp8l(16384, 16384)),
      riff(vp8x(16777216, 16777216), vp8()), riff(chunk('VP8L', Uint8Array.of(0x2f))),
    ]) expect(() => imageBudget(bytes, 'image/webp')).toThrow();
    const truncated = riff(vp8()); new DataView(truncated.buffer).setUint32(16, 0xffffffff, true);
    expect(() => imageBudget(truncated, 'image/webp')).toThrow('truncated');
    const badVersion = riff(vp8l()); badVersion[24] |= 0x80;
    expect(() => imageBudget(badVersion, 'image/webp')).toThrow('lossless');
    expect(() => imageBudget(riff(chunk('JUNK', new Uint8Array()), vp8()), 'image/webp', { maxJpegMarkers: 1 })).toThrow('traversal');
  });
  it('rejects invalid VP8/VP8X fields and nonzero chunk padding', () => {
    for (const [at, value] of [[20, 1], [20, 0], [20, 0x1e], [23, 0], [24, 0], [25, 0]]) {
      const bytes = riff(vp8()); bytes[at] = value;
      expect(() => imageBudget(bytes, 'image/webp')).toThrow('key frame');
    }
    for (const [at, value] of [[20, 0x80], [20, 1], [21, 1], [22, 1], [23, 1]]) {
      const bytes = riff(vp8x(), vp8()); bytes[at] = value;
      expect(() => imageBudget(bytes, 'image/webp')).toThrow('extended');
    }
    expect(() => imageBudget(riff(vp8x(3, 2, 2), vp8()), 'image/webp')).toThrow('animated');
    const bytes = riff(vp8l()); bytes[bytes.length - 1] = 1;
    expect(() => imageBudget(bytes, 'image/webp')).toThrow('padding');
  });
});
