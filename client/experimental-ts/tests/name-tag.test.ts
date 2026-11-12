import { describe, expect, it } from 'vitest';
import { drawNameTag, nameTagColor, nameTagWidth, playerStateColor, type GlyphAtlas } from '../src/world/name-tag';

// two glyphs: 'A' a 2 x 2 block (levels 64, 32 / 0, 16) one pixel in and two over the baseline, advance 3; '?' empty
const atlas: GlyphAtlas = { ascent: 3, height: 4, glyphs: {
  65: { adv: 3, x0: 1, y0: -2, w: 2, h: 2, lv: [64, 32, 0, 16] },
  63: { adv: 2, x0: 0, y0: 0, w: 0, h: 0, lv: [] },
} };

describe('the name tag', () => {
  it('colours a name by the lobby state as 0x0088d170 does', () => {
    expect([99, 100, 101, 102, 103, 106, 107, 151, 152, undefined].map(playerStateColor)).toEqual([0, 2, 7, 3, 1, 1, 0, 2, 1, 0]);
    expect(nameTagColor(0x67)).toBe(0xff0000);   // duelling: red
    expect(nameTagColor(undefined)).toBe(0x000000);
  });
  it('puts each glyph in a cell its advance + 1 wide, unknown ones as "?"', () => {
    expect(nameTagWidth(atlas, 'AA')).toBe(8);
    expect(nameTagWidth(atlas, 'Aé')).toBe(4 + 3);
  });
  it('draws the coverage levels as the text colour\'s alpha, from the cell top (ascent + y0)', () => {
    const tag = drawNameTag(atlas, 'AA', 0x123456), px = (x: number, y: number) => Array.from(tag.data.subarray((y * tag.width + x) * 4, (y * tag.width + x) * 4 + 4));
    expect([tag.width, tag.height]).toEqual([8, 4]);
    expect(px(1, 1)).toEqual([0x12, 0x34, 0x56, 255]);
    expect(px(2, 1)).toEqual([0x12, 0x34, 0x56, 127]);   // 32 * 255 / 64, truncated
    expect(px(1, 2)).toEqual([0, 0, 0, 0]);
    expect(px(2, 2)[3]).toBe(63);
    expect(px(5, 1)[3]).toBe(255);   // the second 'A', 4 px on
    expect(px(0, 0)[3]).toBe(0);
  });
});
