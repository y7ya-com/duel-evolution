import { describe, expect, it, vi } from 'vitest';
import { AvatarLoader } from '../src/avatars';
import type { AvatarAssets } from '../src/avatars';
import { npcArtKind, npcBlinkDelay, npcChibiSet, npcPose, npcStarCells, npcStars, resolveNpcPngs, NPC_FRAME_MS } from '../src/avatars/npc';
// Synthetic fixtures only: the movie below is built here in the original dump format, no archive bytes are embedded.
const ctor = (kind: string, fields = '') => `SWF::Element::${kind}->new(\n${fields}\n)`;
const bmp = (id: number, file: number) => ctor('Tag::DefineBitsLossless', `CharacterID => ${id},\nFileName => ${file},\nBitmapWidth => 1,\nBitmapHeight => 1,`);
const shape = (id: number, bitmap: number) => ctor('Tag::DefineShape', `ShapeID => ${id},\nShapeBounds => ${ctor('RECT', 'Xmin => 0,\nYmin => 0,\nXmax => 20,\nYmax => 20,')},\nShapes => ${ctor('SHAPEWITHSTYLE1', `FillStyles => ${ctor('Array::FILLSTYLEARRAY1', `[${ctor('FILLSTYLE1', `FillStyleType => 65,\nBitmapID => ${bitmap},\nBitmapMatrix => ${ctor('MATRIX', 'ScaleX => 20,\nScaleY => 20,')},`)}]`)},`)},`);
const place = (depth: number, character: number) => ctor('Tag::PlaceObject2', `Flags => 6,\nDepth => ${depth},\nCharacterID => ${character},\nMatrix => ${ctor('MATRIX', 'TranslateX => 0,\nTranslateY => 0,')},`);
/** cn_n01's shape: the shadow, the body and the eyes, the body and eyes named for the d01 set. */
const cnDump = `PngFileTable = {\n png => cn_sh_01.png,\n png => cn_d01_bo_n01_01.png,\n png => cn_d01_ey_n01_01.png,\n)\nHeader:\nFrame rate = 30\nFrame count = 1\n`
  + [0, 1, 2].map(i => bmp(10 + i, i) + '\n' + shape(20 + i, 10 + i) + '\n' + place(1 + i * 2, 20 + i)).join('\n') + '\n' + ctor('Tag::ShowFrame');
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64'));

describe('famous NPC art (CNpcChibiAvatar)', () => {
  it('picks the set as 0x00a55cd0 and the 0x009ccfc0 switch: three ids per character, ids 51..94 only', () => {
    expect([51, 52, 53].map(npcChibiSet)).toEqual(['d01', 'd01', 'd01']);   // Yami Yugi
    expect([54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93].map(npcChibiSet))
      .toEqual(['d04', 'd06', 'a01', 'a04', 'a03', 'd07', 'a05', 'd08', 'a06', 'd09', 'a07', 'd10', 'a08', 'a01']);
    expect([66, 67, 68].map(npcChibiSet)).toEqual(['a03', 'a03', 'a03']);   // Alexis Rhodes, every tier
    expect(npcArtKind(68)).toEqual({ kind: 8, tier: 2 });
    // 95 has a kind (0x00a55cd0 takes 51..95) but CNpcChibiAvatar draws only 0x33..0x5e with NPC art
    expect(npcArtKind(95)).toEqual({ kind: 18, tier: 2 }); expect(npcChibiSet(95)).toBeNull();
    for (const id of [0, 35, 38, 44, 50, 96, 1.5]) expect(npcChibiSet(id)).toBeNull();
  });
  it('faces as the player movies (1,2,3,4,5,4,3,2, 5..7 mirrored) and swaps the first d01 of each bitmap', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(d => npcPose('stand', d).path.slice(-7))).toEqual(['n01.txt', 'n02.txt', 'n03.txt', 'n04.txt', 'n05.txt', 'n04.txt', 'n03.txt', 'n02.txt']);
    expect(npcPose('stand', 6)).toMatchObject({ path: 'data/Avatar/chibi/cn_n03.txt', mirrored: true, offset: [-46, -116], foot: [40, 116], loop: true });
    expect(npcPose('blink', 2)).toMatchObject({ path: 'data/Avatar/chibi/cn_t03.txt', mirrored: false, loop: false });
    expect(resolveNpcPngs(['cn_sh_01.png', 'cn_d01_bo_n01_01.png', 'cn_d01_ey_n04_03.png'], 'a03')).toEqual(['cn_sh_01.png', 'cn_a03_bo_n01_01.png', 'cn_a03_ey_n04_03.png']);
    expect(() => resolveNpcPngs([], '../x')).toThrow();
  });
  it('blinks after rand() % 30 + 60 frames, then every rand() % 60 + 60 frames (30 fps)', () => {
    expect(npcBlinkDelay(() => 0, true)).toBeCloseTo(60 * NPC_FRAME_MS); expect(npcBlinkDelay(() => 0.999, true)).toBeCloseTo(89 * NPC_FRAME_MS);
    expect(npcBlinkDelay(() => 0)).toBeCloseTo(2000); expect(npcBlinkDelay(() => 0.999)).toBeCloseTo(119 * NPC_FRAME_MS);
    expect(npcBlinkDelay(() => 1)).toBeCloseTo(119 * NPC_FRAME_MS);
  });
  it('counts the level stars as 0x009d83f0: a 16 px star per level passed, rank * 5 / threshold + 1 small ones toward the next', () => {
    const list = [{ id: 7, threshold: 5, previous: 0 }, { id: 8, threshold: 5, previous: 7 }, { id: 9, threshold: 0, previous: 8 }];
    const bin = (rank: Record<number, number>) => { const b = new Uint8Array(512); for (const [id, r] of Object.entries(rank)) b[+id * 4 + 3] = r; return b; };
    expect(npcStars(list[0]!, list, bin({}))).toEqual({ big: 0, small: 1 });
    expect(npcStars(list[0]!, list, bin({ 7: 3 }))).toEqual({ big: 0, small: 4 });
    expect(npcStars(list[0]!, list, bin({ 7: 5 }))).toEqual({ big: 1, small: 0 });   // the threshold reached: a full star
    expect(npcStars(list[1]!, list, bin({ 8: 2 }))).toEqual({ big: 1, small: 3 });    // one level behind it in the chain
    expect(npcStars(list[2]!, list, bin({}))).toEqual({ big: 3, small: 0 });          // no threshold: always full
    // Alexis Rhodes (art kind 8) shows none without the challenge right (PBIN bit 0x251)
    const alexis = { id: 66, threshold: 5, previous: 0 }, pbin = new Uint8Array(128);
    expect(npcStars(alexis, [alexis], bin({ 66: 2 }), pbin)).toEqual({ big: 0, small: 0 });
    expect(npcStars(alexis, [alexis], bin({ 66: 2 }))).toEqual({ big: 0, small: 0 });
    pbin[0x251 >> 3] |= 1 << (0x251 & 7);
    expect(npcStars(alexis, [alexis], bin({ 66: 2 }), pbin)).toEqual({ big: 0, small: 3 });
    // the others need no right
    expect(npcStars({ id: 69, threshold: 5, previous: 0 }, [], bin({}), new Uint8Array(128))).toEqual({ big: 0, small: 1 });
    expect(npcStarCells({ big: 2, small: 3 })).toEqual([{ x: 0, y: 0, big: true }, { x: 16, y: 0, big: true }, { x: 32, y: 0, big: false }, { x: 40, y: 0, big: false }, { x: 48, y: 0, big: false }]);
  });
  it('loads the cn_ movie and the set\'s own bitmaps through the loader (parts unread)', async () => {
    const read: string[] = [];
    const source: AvatarAssets = { readScene: vi.fn(async (path: string) => { read.push(path); const image = path.endsWith('.png');
      return { value: { bytes: image ? png : new TextEncoder().encode(cnDump), url: 'blob:test', mimeType: image ? 'image/png' : 'application/octet-stream' }, release() {} }; }) };
    const close = vi.fn(), loader = new AvatarLoader(source, { decode: async () => ({ width: 1, height: 1, close }) });
    const resource = await loader.load(new Uint8Array(16), { npc: { set: 'a03' }, direction: 7 });
    expect(read).toEqual(['data/Avatar/chibi/cn_n02.txt', 'data/Avatar/chibi/cn_sh_01.png', 'data/Avatar/chibi/cn_a03_bo_n01_01.png', 'data/Avatar/chibi/cn_a03_ey_n01_01.png']);
    expect(resource.pose).toMatchObject({ mirrored: true, loop: true }); expect(resource.layers(0)).toHaveLength(3);
    const blink = await loader.load(new Uint8Array(16), { npc: { set: 'a03', blink: true }, direction: 0 });
    expect(read).toContain('data/Avatar/chibi/cn_t01.txt'); expect(blink.pose.loop).toBe(false);
    await expect(loader.load(new Uint8Array(16), { npc: { set: 'cm_x' } })).rejects.toThrow('Invalid NPC chibi set');
    resource.dispose(); blink.dispose(); expect(close).toHaveBeenCalled();
  });
});
