// The name over an avatar's head, as the 2008 engine draws it (CPlChibiAvatar::onInit 0x009df9a0, client/src/Game/
// Avatar/yo2PlChibiAvatar.cpp): a CTextElm attached at (0, -130) from the feet, the nation flag at (-25, -130), both
// centred on that line; the text is "@<n>" + name, the window factory's tag styles (System/yo2TagConverter.cpp
// applyWindowTagStyles) giving the colour. On live the GDI stand-in draws it in DejaVu Sans at lfHeight 16
// (platform/win32/font.cpp: the "Arial" class falls back to dejavusans.ttf), each glyph in a cell gmCellIncX + 1
// wide (CD3DTextTexture::update), its coverage in GGO_GRAY8 levels. main's glyph table (ui/glyphs-dejavu16.json,
// html-ui/tools/glyphs) holds exactly those glyphs, so the tag is rebuilt texel for texel.

/** The label's line in the engine, from the chibi element's origin (attach(nameLabel, 0, -130)). */
export const ENGINE_LABEL_Y = -130;
/** Where that puts the tag on screen from the avatar's network point (this renderer's feet, AVATAR_FOOT_Y): the
 * element's origin is 9.5 px under it (live, 1:1 captures: the flag's top 136.5 px over the shoes' bottom, here 146 at
 * -130), so the text cell's top lands 129 px over the feet and the 15-px flag's top 128 px over them. */
export const NAME_TAG_TOP = -129, NAME_TAG_FLAG_TOP = -128;
/** The flag's left edge, from the feet (attach(nationFlag, -25, -130)); the name's left edge is on them. */
export const NAME_TAG_FLAG_X = -25;

export interface Glyph { readonly adv: number; readonly x0: number; readonly y0: number; readonly w: number; readonly h: number; readonly lv: readonly number[] }
/** main's glyph table: the cell's ascent and height and each code point's glyph (GGO_GRAY8 levels 0..64). */
export interface GlyphAtlas { readonly ascent: number; readonly height: number; readonly glyphs: Readonly<Record<string, Glyph>> }

/** The "@n" colours (applyWindowTagStyles): @0 black, @1 red, @2 blue, @3 green, @4 olive, @5 magenta, @6 cyan, @7 orange,
 * @8 the default white, @9 white. */
export const TAG_COLORS: readonly number[] = [0x000000, 0xff0000, 0x2222ff, 0x009f00, 0x6f6f00, 0xff00ff, 0x00ffff, 0xff9933, 0xffffff, 0xffffff];

/** A player's name colour code from their lobby state (0x0088d170, CPlChibiAvatar::setNameColor): 100 / 151 blue,
 * 101 orange, 102 green, 103..106 and 152 red (duelling: the states the server sends while a duel runs), else black. */
export function playerStateColor(state: number | undefined): number {
  switch (state) {
    case 100: case 151: return 2;
    case 101: return 7;
    case 102: return 3;
    case 103: case 104: case 105: case 106: case 152: return 1;
    default: return 0;
  }
}
export const nameTagColor = (state: number | undefined): number => TAG_COLORS[playerStateColor(state)]!;

const glyphOf = (atlas: GlyphAtlas, ch: string): Glyph | undefined => atlas.glyphs[String(ch.codePointAt(0))];
/** A character's cell: its rounded advance + 1 ('?' for one the table lacks, as main's ui.js). */
export function cellWidth(atlas: GlyphAtlas, ch: string): number { return ((glyphOf(atlas, ch) ?? glyphOf(atlas, '?'))?.adv ?? 0) + 1; }
export function nameTagWidth(atlas: GlyphAtlas, text: string): number { let w = 0; for (const ch of text) w += cellWidth(atlas, ch); return w; }

/** The tag's texels: RGBA, `width` x the atlas's cell height, the text in `rgb` with each glyph's coverage as alpha
 * (level * 255 / 64, truncated: CD3DTextTexture::update's levelScale). With `hi` (the same face at twice the size, main's
 * glyphs-dejavu32.json: the engine at render scale 2) the texels are twice as many each way, the glyphs `hi`'s on the
 * 16-pixel cells doubled, so the tag keeps its width and place. */
export function drawNameTag(atlas: GlyphAtlas, text: string, rgb: number, hi?: GlyphAtlas | null): { width: number; height: number; scale: number; data: Uint8ClampedArray } {
  const k = hi ? 2 : 1, face = hi ?? atlas;
  const width = Math.max(1, nameTagWidth(atlas, text)) * k, height = atlas.height * k, data = new Uint8ClampedArray(width * height * 4);
  const r = rgb >> 16 & 255, g = rgb >> 8 & 255, b = rgb & 255;
  let pen = 0;
  for (const ch of text) {
    const glyph = glyphOf(face, ch) ?? glyphOf(face, '?');
    if (glyph) for (let gy = 0; gy < glyph.h; gy++) for (let gx = 0; gx < glyph.w; gx++) {
      const level = glyph.lv[gy * glyph.w + gx] ?? 0, x = pen * k + glyph.x0 + gx, y = face.ascent + glyph.y0 + gy;
      if (!level || x < 0 || x >= width || y < 0 || y >= height) continue;
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.min(255, Math.trunc(level * 255 / 64));
    }
    pen += cellWidth(atlas, ch);
  }
  return { width, height, scale: k, data };
}
