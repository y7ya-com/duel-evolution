import { existsSync, openSync, readSync, closeSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeLzss } from '../src/assets/lzss';
import { parseSceneTable, pngDimensions, SCENE_TABLE_PATH } from '../src/world/scene-format';
import { avatarDepth, FRONT_OBJECT_DEPTH, objectDepth } from '../src/world/depth';
/** The original draws the avatar at foot `y` in front of `object` when its depth is at least the object's. */
const avatarInFront = (y: number, object: { readonly y: number; readonly height: number }) => y * 10 >= objectDepth(object);

describe('the field z-sort keys (CFieldMap::addObject / CChibiAvatarElm::onMain)', () => {
  it('keys an object by its bottom edge * 10, an avatar by its feet * 10; front objects at 30724', () => {
    expect(objectDepth({ y: 400, height: 220 })).toBe(6200);
    expect(avatarDepth(603)).toBe(6030); expect(avatarDepth(620.04)).toBe(6200); expect(avatarDepth(619.96)).toBe(6199);
    expect(avatarInFront(620, { y: 400, height: 220 })).toBe(true); expect(avatarInFront(619.9, { y: 400, height: 220 })).toBe(false);
    expect(FRONT_OBJECT_DEPTH).toBeGreaterThan(avatarDepth(3072));
  });
});

/** The original archive, read straight from disk (skipped without it). */
const MERGE = process.env.YO2_MERGE ?? `${process.env.HOME}/.cache/yo2-game/merge.dat`;
function archive(path: string) {
  const fd = openSync(path, 'r'), read = (at: number, n: number) => { const b = new Uint8Array(n); readSync(fd, b, 0, n, at); return b; };
  const count = new DataView(read(8, 4).buffer).getUint32(0, true), raw = read(12, count * 268), view = new DataView(raw.buffer), entries = new Map<string, [number, number, number]>();
  for (let i = 0; i < count; i++) {
    const at = i * 268, name: number[] = [];
    for (let k = 0; k < 256; k++) { const b = raw[at + k], c = ((b & 15) << 4) | (b >> 4); if (!c) break; name.push(c); }
    entries.set(new TextDecoder('shift_jis').decode(new Uint8Array(name)).replaceAll('\\', '/').toLowerCase(), [view.getUint32(at + 256, true), view.getUint32(at + 260, true), view.getUint32(at + 264, true)]);
  }
  return { get(name: string) { const e = entries.get(name.toLowerCase()); if (!e) throw new Error(`missing ${name}`); const bytes = read(e[0], e[2]); return e[1] === e[2] ? bytes : decodeLzss(bytes, e[1]); }, close() { closeSync(fd); } };
}
describe.skipIf(!existsSync(MERGE))('the original field maps', () => {
  const a = existsSync(MERGE) ? archive(MERGE) : null, table = a ? parseSceneTable(a.get(SCENE_TABLE_PATH)) : new Map();
  const sized = (name: string) => table.get(name)!.objects.map((o: { path: string; x: number; y: number }) => ({ ...o, ...pngDimensions(a!.get(o.path)) }));
  it('Store (Map_a02) by the stairs at (719, 603): the side panels whose bottom edge is below the feet cover the avatar, as live', () => {
    const near = sized('Map_a02').filter(o => o.x < 719 + 48 && o.x + o.width > 719 - 48 && o.y < 603 && o.y + o.height > 603 - 110);
    const front = near.filter(o => !avatarInFront(603, o)).map(o => o.path.slice(-12, -8)), back = near.filter(o => avatarInFront(603, o)).map(o => o.path.slice(-12, -8));
    expect(front).toEqual(['0301', '0302', '0303', '0304']); // bottoms 698, 683, 655, 628
    expect(back).toEqual(['0305']); // bottom 601
    expect(near.map(o => objectDepth(o))).toEqual([6980, 6830, 6550, 6280, 6010]);
  });
  it('every map: ObjMap keys stay below the front objects\' 30724, front objects are separate (FrontObjMap)', () => {
    const counts: Record<string, [number, number]> = {};
    for (const [name, d] of table) { counts[name] = [d.objects.length, d.frontObjects.length]; for (const o of sized(name)) expect(objectDepth(o)).toBeLessThan(FRONT_OBJECT_DEPTH); }
    expect(counts.Map_a02).toEqual([41, 15]); expect(counts.Map_a01).toEqual([30, 31]); expect(counts.Map_d01_01).toEqual([22, 49]);
  });
  it('Map_a01: a player walking down past the row of shelves at x 184..1008 goes behind each shelf until the feet pass its bottom edge', () => {
    const shelf = sized('Map_a01').find(o => o.path.endsWith('Map_a01_0303_obj.png'))!;
    expect([shelf.x, shelf.y, shelf.height, objectDepth(shelf)]).toEqual([464, 530, 128, 6580]);
    expect(avatarInFront(640, shelf)).toBe(false); expect(avatarInFront(658, shelf)).toBe(true);
  });
});
