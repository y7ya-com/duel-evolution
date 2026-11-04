import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pack as serverPack, Reader as ServerReader, W, xor as serverXor } from '../../../server/src/net/proto';
import { BinaryReader, BinaryWriter, HEADER_SIZE, MAX_CLIENT_DATA, MAX_SERVER_DATA, PacketReader, concat, md5, pack, xor } from '../src/network/codec';

const bytes = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 73 + 191) & 255);

describe('browser MD5 against node:crypto', () => {
  it.each([0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1024, 65535])('hashes %i bytes, including padding/block boundaries', (length) => {
    const input = bytes(length), original = input.slice();
    expect(md5(input)).toEqual(new Uint8Array(createHash('md5').update(input).digest()));
    expect(input).toEqual(original);
  });
  it('honors a Uint8Array slice byte offset', () => {
    const input = bytes(300).subarray(17, 200);
    expect(md5(input)).toEqual(new Uint8Array(createHash('md5').update(input).digest()));
  });
});

describe('wire compatibility with actual server/src/net/proto.ts', () => {
  it.each([0, 1, 3, 4, 55, 56, 1024, 1025, 65535])('packs exactly the server bytes for payload length %i', (length) => {
    const data = bytes(length);
    expect(pack(0xabcd, data, 0xfedcba98)).toEqual(serverPack(0xabcd, data, 0xfedcba98));
    const [message] = new ServerReader().feed(pack(0xabcd, data, 0xfedcba98));
    expect(message).toEqual({ id:0xabcd, param:0xfedcba98, data, ok:true });
    expect(new PacketReader().feed(serverPack(0xabcd, data, 0xfedcba98))).toEqual([{ id:0xabcd, param:0xfedcba98, data }]);
  });
  it('uses unsigned big-endian sequence fields and the server XOR phase', () => {
    expect(pack(0xffff, bytes(5), -1)).toEqual(serverPack(0xffff, bytes(5), -1));
    for (const offset of [0, 1, 3, 4, 24, 25]) expect(xor(bytes(19), offset)).toEqual(serverXor(bytes(19), offset));
  });
  it('matches fixed latin1 fields and numeric truncation', () => {
    const expected = new W().u8(0x123).u16(0x12345).u32(-1).s('Aéÿ', 5).s('abcdef', 3).bytes();
    const actual = new BinaryWriter().u8(0x123).u16(0x12345).u32(-1).s('Aéÿ', 5).s('abcdef', 3).bytes();
    expect(actual).toEqual(expected);
    const r = new BinaryReader(concat(bytes(3), expected, bytes(4)).subarray(3, 3 + expected.length));
    expect([r.u8(), r.u16(), r.i32(), r.s(5), r.s(3), r.remaining]).toEqual([0x23, 0x2345, -1, 'Aéÿ', 'abc', 0]);
    expect(() => r.u8()).toThrow(RangeError);
    expect(r.remaining).toBe(0);
  });
  it('reads unsigned high-bit values and rejects truncated fields without consuming bytes', () => {
    const r = new BinaryReader(Uint8Array.of(0xff, 0xff, 0xff, 0xff, 7));
    expect(r.u32()).toBe(0xffffffff);
    for (const read of [() => r.u16(), () => r.u32(), () => r.bytes(-1), () => r.bytes(1.5)]) {
      expect(read).toThrow(RangeError); expect(r.remaining).toBe(1);
    }
    expect(r.u8()).toBe(7);
  });
});

describe('bounded streaming PacketReader', () => {
  const data = bytes(17), wire = serverPack(0x2003, data, 1);
  it('accepts every two-part split, including the header, digest, and body', () => {
    for (let split = 0; split <= wire.length; split++) {
      const reader = new PacketReader();
      const messages = [...reader.feed(wire.subarray(0, split)), ...reader.feed(wire.subarray(split))];
      expect(messages).toEqual([{ id:0x2003, param:1, data }]);
      expect(reader.bufferedBytes).toBe(0);
    }
  });
  it('accepts one-byte fragments and coalesced frames without sharing the input buffer', () => {
    const reader = new PacketReader(), messages = [];
    for (const byte of concat(wire, serverPack(0x2004, bytes(3), 2))) messages.push(...reader.feed(Uint8Array.of(byte)));
    expect(messages).toEqual([{ id:0x2003, param:1, data }, { id:0x2004, param:2, data:bytes(3) }]);
    const source = wire.slice();
    const [message] = reader.feed(source); source.fill(0);
    expect(message.data).toEqual(data);
  });
  it('retains only an incomplete tail and clear discards it', () => {
    const reader = new PacketReader(), next = serverPack(8, bytes(7), 2);
    expect(reader.feed(concat(wire, next.subarray(0, 13)))).toHaveLength(1);
    expect(reader.bufferedBytes).toBe(13);
    expect(reader.feed(next.subarray(13))).toEqual([{ id:8, param:2, data:bytes(7) }]);
    reader.feed(wire.subarray(0, 9)); reader.clear();
    expect(reader.bufferedBytes).toBe(0);
    expect(reader.feed(wire)).toHaveLength(1);
  });
  it.each([0, 4, 8, 23, 24, 40])('rejects corruption at wire byte %i', (offset) => {
    const corrupt = wire.slice(); corrupt[offset] ^= 0x80;
    expect(() => new PacketReader().feed(corrupt)).toThrow('integrity');
  });
  it('does not expose valid packets preceding a corrupt packet in the same feed', () => {
    const corrupt = wire.slice(); corrupt[8] ^= 1;
    expect(() => new PacketReader().feed(concat(wire, corrupt))).toThrow('integrity');
  });
  it('rejects declared oversized payloads from the header without waiting for a body', () => {
    const reader = new PacketReader(4096, MAX_CLIENT_DATA);
    expect(() => reader.feed(serverPack(1, bytes(1025)).subarray(0, HEADER_SIZE))).toThrow('payload limit');
    expect(new PacketReader(4096, MAX_CLIENT_DATA).feed(serverPack(1, bytes(1024)))).toHaveLength(1);
  });
  it('enforces the aggregate buffer limit before appending, allowing the exact limit', () => {
    const reader = new PacketReader(wire.length);
    reader.feed(wire.subarray(0, 10));
    expect(() => reader.feed(new Uint8Array(wire.length - 9))).toThrow('buffer limit');
    expect(reader.bufferedBytes).toBe(10);
    expect(reader.feed(wire.subarray(10))).toHaveLength(1);
  });
  it('rejects payload and id values that cannot fit on the wire', () => {
    expect(() => pack(1, bytes(MAX_SERVER_DATA + 1))).toThrow(RangeError);
    for (const id of [-1, 65536, 1.5, NaN, Infinity]) expect(() => pack(id)).toThrow(RangeError);
  });
});
