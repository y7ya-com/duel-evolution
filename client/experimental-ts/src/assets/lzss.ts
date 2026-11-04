/** Okumura LZSS: zero-filled 4 KiB ring, initial cursor 0xFEE, LSB-first flags. */
export function decodeLzss(source: Uint8Array, size: number, maxOutput = 16 * 1024 * 1024): Uint8Array {
  if (!Number.isSafeInteger(size) || size < 0 || size > maxOutput) throw new RangeError('LZSS output limit');
  const output = new Uint8Array(size), ring = new Uint8Array(4096);
  let input = 0, written = 0, cursor = 0xfee;
  const emit = (byte: number): void => {
    output[written++] = byte; ring[cursor] = byte; cursor = (cursor + 1) & 0xfff;
  };
  while (written < size) {
    if (input >= source.length) throw new Error('Truncated LZSS flags');
    const flags = source[input++];
    for (let bit = 0; bit < 8 && written < size; bit++) {
      if (flags & (1 << bit)) {
        if (input >= source.length) throw new Error('Truncated LZSS literal');
        emit(source[input++]);
      } else {
        if (input + 2 > source.length) throw new Error('Truncated LZSS reference');
        const low = source[input++], high = source[input++];
        const offset = low | ((high & 0xf0) << 4), length = (high & 15) + 3;
        if (written + length > size) throw new Error('LZSS output overrun');
        for (let i = 0; i < length; i++) emit(ring[(offset + i) & 0xfff]);
      }
    }
  }
  if (input !== source.length) throw new Error('Trailing LZSS bytes');
  return output;
}
