import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseSwfText, SwfInstance } from '../src/duel/swf-text';
import { filterTitleMovie, titleImagePath, TITLE_DROP_DEPTHS } from '../src/ui/htmlui/title-scene';

const TAG = '\nSWF::Element::Tag::';
const place = (depth: number) => `${TAG}PlaceObject2->new(\n    Depth => ${depth},\n    CharacterID => 1,\n)`;

describe('title movie (rt/debrand.cpp filter_title)', () => {
  it('drops the KONAMI badge, the copyright line and QUIT, keeps the art and the other buttons', () => {
    const text = `PngFileTable = {\n)${place(1)}${place(21)}${place(23)}${place(9)}${TAG}RemoveObject2->new(\n    Depth => 40,\n)${place(40)}${TAG}ShowFrame->new(\n)`;
    const out = filterTitleMovie(text);
    for (const d of TITLE_DROP_DEPTHS) expect(out).not.toContain(`Depth => ${d},`);
    expect(out).toContain('Depth => 1,'); expect(out).toContain('Depth => 9,'); expect(out).toContain('Depth => 40,'); expect(out).toContain('ShowFrame');
  });
  it("reads the language's bitmaps from data/title", () => {
    expect(titleImagePath('title_title_01_?.png')).toBe('data/title/title_title_01_e.png');
    expect(titleImagePath('title_kyara_01.png')).toBe('data/title/title_kyara_01.png');
  });
  const original = `${process.env.HOME}/.cache/yo2-game/x/data/title/title_flash_01.txt`;
  it.skipIf(!existsSync(original))('the original movie plays once and ends with the logo and characters, no KONAMI or copyright', () => {
    const movie = parseSwfText(filterTitleMovie(readFileSync(original, 'latin1')));
    expect(movie.frameCount).toBe(73);
    const i = new SwfInstance(movie, movie.timeline, false);
    for (let n = 0; n < 200 && !i.ended && !i.stopped; n++) i.step();
    const items: Parameters<SwfInstance['draw']>[0] = []; i.draw(items);
    const files = new Set(items.map(it => movie.files[it.bitmap]));
    expect([...files].some(f => /title_title_0\d_\?/.test(f ?? ''))).toBe(true);
    expect([...files].some(f => /title_kyara/.test(f ?? ''))).toBe(true);
    expect([...files].some(f => /konami|copy|botton_05/.test(f ?? ''))).toBe(false);
    // the four buttons, up: ONLINE, OPTIONS, and rows 3 and 4 (DECK EDITOR, FREE DUEL); over when hovered
    for (const row of [1, 2, 3, 4]) expect(files).toContain(`title_botton_0${row}_01_?.png`);
    i.buttonState = depth => depth === 40 ? 2 : 1;
    const over: Parameters<SwfInstance['draw']>[0] = []; i.draw(over);
    expect(over.map(it => movie.files[it.bitmap])).toContain('title_botton_01_02_?.png');
  });
});
