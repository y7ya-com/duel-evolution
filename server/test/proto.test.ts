import { describe, expect, it } from "vitest";
import { hex, pack, Reader, serverEntry } from "../src/net/proto.ts";

// expected bytes from py yo2srv/red/proto.py
describe("proto", () => {
  it("packs like py", () => {
    expect(hex(pack(0x2003, serverEntry(1, 1, "DuelCards", "127.0.0.1", 6731), 7))).toBe(
      "7aa65a655aa55a52b04294a51f1ccbeca491cf9712a46fe45aa55a545aa55a541ed03f3919c4283129a55a555aa55a556b976d7b6a8b6a7b6ba55a555aa55a4f11a55a555aa55a55");
    expect(hex(pack(0x3002))).toBe("6aa75a555aa55a55d76094e14f0d84650e78f66e11340675");
  });
  it("reads split streams", () => {
    const a = pack(0x2005, new Uint8Array([1, 2, 3]), 1), b = pack(0x3002, undefined, 2);
    const all = new Uint8Array([...a, ...b]);
    const r = new Reader();
    expect(r.feed(all.subarray(0, 10))).toEqual([]);
    const got = [...r.feed(all.subarray(10, 30)), ...r.feed(all.subarray(30))];
    expect(got.map((m) => [m.id, m.param, [...m.data], m.ok])).toEqual([[0x2005, 1, [1, 2, 3], true], [0x3002, 2, [], true]]);
  });
});
