import { describe, expect, it } from 'vitest';
import { npcWaistUpSet, npcWaistUpTiles, parseNpcWaistUpCsv } from '../src/ui/npc-waistup';
import { npcChibiSet } from '../src/avatars/npc';

// The csv headers and tile names as the archive has them (data/avatar/npc/<set>.csv); the expected places are live's,
// read from the engine's sprites (CWaistUpNpc::m_pBaseElm and its tiles) in the talk, janken, duel and result.
const csv = (x: number, y: number, changing: number, tiles: string[], frames: string[]) => ['8000', x, y, changing, ...tiles, ...frames].join('\r\n');
const D01 = csv(184, 0, 4, ['npc_d01_bo_01.png', 'npc_d01_bo_02.png', '****', 'npc_d01_bo_04_01.png', 'npc_d01_bo_05.png', 'npc_d01_bo_06.png', 'npc_d01_bo_07.png', 'npc_d01_bo_08.png', '****'],
  [2, 3, 4, 5, 6, 7].map(f => `npc_d01_bo_04_0${f}.png`));
const D07 = csv(312, 28, 2, ['npc_d07_bo_01.png', 'npc_d07_bo_02_01.png', '****', 'npc_d07_bo_04.png', 'npc_d07_bo_05.png', '****', 'npc_d07_bo_07.png', 'npc_d07_bo_08.png', '****'],
  [2, 3, 4, 5, 6, 7].map(f => `npc_d07_bo_02_0${f}.png`));
const A04 = csv(435, 73, 2, ['npc_a04_bo_01.png', 'npc_a04_bo_02_01.png', 'npc_a04_bo_03.png', 'npc_a04_bo_04.png', 'npc_a04_bo_05.png', 'npc_a04_bo_06.png', '****', 'npc_a04_bo_08.png', 'npc_a04_bo_09.png'],
  [2, 3, 4, 5, 6, 7].map(f => `npc_a04_bo_02_0${f}.png`));
const D08 = csv(366, 51, 2, ['npc_d08_bo_01.png', 'npc_d08_bo_02_01.png', 'npc_d08_bo_03.png', 'npc_d08_bo_04.png', 'npc_d08_bo_05.png', 'npc_d08_bo_06.png', 'npc_d08_bo_07.png', 'npc_d08_bo_08.png', 'npc_d08_bo_09.png'],
  [2, 3, 4, 5, 6, 7].map(f => `npc_d08_bo_02_0${f}.png`));
const at = (tiles: { name: string; x: number; y: number }[]) => Object.fromEntries(tiles.map(t => [t.name, [t.x, t.y]]));

describe("a famous NPC's waist-up picture (CWaistUpNpc)", () => {
  it('picks the csv as yo2DuelAvater (0x007801c0) and 0x009efd80: three ids per character, 0x33..0x5f', () => {
    expect([51, 52, 53].map(npcWaistUpSet)).toEqual(['d01', 'd01', 'd01']);   // Yami Yugi
    expect([54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 95].map(npcWaistUpSet))
      .toEqual(['d04', 'd06', 'a01', 'a04', 'a03', 'd07', 'a05', 'd08', 'a06', 'd09', 'a07', 'd10', 'a08', 'a09', 'a09']);
    // the chibi differs only for Jaden's second look (its waist-up has a set of its own)
    expect(npcChibiSet(93)).toBe('a01');
    expect([50, 96, 0, -1, 1.5].map(npcWaistUpSet)).toEqual([null, null, null, null, null]);
  });
  it('puts the base at 874 - x, 0 and the tiles from the csv y down, at full size', () => {
    // Yami Yugi (live: base 690, 0; bo_06 at 1202, 256)
    expect(at(npcWaistUpTiles('d01', parseNpcWaistUpCsv(D01)))).toEqual({
      'npc_d01_bo_01.png': [690, 0], 'npc_d01_bo_02.png': [946, 0], 'npc_d01_bo_04_01.png': [690, 256], 'npc_d01_bo_05.png': [946, 256],
      'npc_d01_bo_06.png': [1202, 256], 'npc_d01_bo_07.png': [690, 512], 'npc_d01_bo_08.png': [946, 512] });
    // Joey Wheeler (live: base 562; bo_01 at 562, 28)
    const joey = at(npcWaistUpTiles('d07', parseNpcWaistUpCsv(D07)));
    expect(joey['npc_d07_bo_01.png']).toEqual([562, 28]);
    expect(joey['npc_d07_bo_08.png']).toEqual([818, 540]);
  });
  it('swaps the changing tile for its frames (the blink 1..3, the beaten face 4..6) in place', () => {
    const yugi = parseNpcWaistUpCsv(D01);
    expect(at(npcWaistUpTiles('d01', yugi, 3))['npc_d01_bo_04_03.png']).toEqual([690, 256]);
    expect(at(npcWaistUpTiles('d01', yugi, 5))['npc_d01_bo_04_05.png']).toEqual([690, 256]);
    expect(npcWaistUpTiles('d01', yugi, 5).some(t => t.name === 'npc_d01_bo_04_01.png')).toBe(false);
  });
  it("Chazz Princeton's first tile above the middle column, Yami Marik's extra tile there", () => {
    // live: Chazz's bo_01 at 695, -183 (base 439), nothing at 439, 73
    const chazz = npcWaistUpTiles('a04', parseNpcWaistUpCsv(A04));
    expect(at(chazz)['npc_a04_bo_01.png']).toEqual([695, -183]);
    expect(chazz.filter(t => t.name === 'npc_a04_bo_01.png')).toHaveLength(1);
    expect(at(chazz)['npc_a04_bo_02_01.png']).toEqual([695, 73]);
    // 0x009efd80 (kind 12): npc_d08_bo_10.png at (256, y - 256) in the base, over the nine
    const marik = at(npcWaistUpTiles('d08', parseNpcWaistUpCsv(D08)));
    expect(marik['npc_d08_bo_10.png']).toEqual([508 + 256, 51 - 256]);
    expect(marik['npc_d08_bo_01.png']).toEqual([508, 51]);
  });
});
