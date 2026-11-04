import { describe, expect, it } from 'vitest';
import { engine, set_card } from '../../../server/src/duel/translator/lockstep';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { DuelCueQueue } from '../src/duel/cues';
import { parseSwfText, SwfInstance } from '../src/duel/swf-text';
import { parseWaistUpData, waistUpLayers } from '../src/ui/duel-portrait';
import { cardKindLine } from '../src/ui/duel-scene';
import type { DuelState } from '../src/duel/types';

const cmd = (s: DuelState, data: Uint8Array) => reduceDuelMessage(s, { id: 0x6202, data });
const initial = () => cmd(createDuelState(), engine(1));

// A synthetic movie in the SWF::Element text form of data/y/duel/effect/duel_ef_*.txt (no original data).
const MOVIE = `PngFileTable = {
	png => glow.png,
)

Header:
SIGNATURE = CWS
Frame rate = 30
Frame count = 3

SWF::Element::Tag::DefineBitsLossless->new(
    CharacterID => 1,
    FileName => 0,
    BitmapWidth => 64,
    BitmapHeight => 64,
)
SWF::Element::Tag::DefineShape->new(
    ShapeID => 2,
    ShapeBounds => SWF::Element::RECT->new( Xmin => -640, Ymin => -640, Xmax => 640, Ymax => 640, ),
    Shapes => SWF::Element::SHAPEWITHSTYLE1->new(
        FillStyles => SWF::Element::Array::FILLSTYLEARRAY1->new([
            SWF::Element::FILLSTYLE1->new( FillStyleType => 65, BitmapID => 65535, BitmapMatrix => SWF::Element::MATRIX->new( ScaleX => 20, ScaleY => 20, RotateSkew0 => 0, RotateSkew1 => 0, TranslateX => 0, TranslateY => 0, ), ),			# 0
            SWF::Element::FILLSTYLE1->new( FillStyleType => 65, BitmapID => 1, BitmapMatrix => SWF::Element::MATRIX->new( ScaleX => 20, ScaleY => 20, RotateSkew0 => 0, RotateSkew1 => 0, TranslateX => -640, TranslateY => -640, ), ),			# 1
        ]),
        ShapeRecords => SWF::Element::Array::SHAPERECORDARRAY1->new([
            SWF::Element::SHAPERECORD1::STYLECHANGERECORD->new( MoveDeltaX => -640, MoveDeltaY => -640, FillStyle1 => 2, ),
        ]),
    ),
)
SWF::Element::Tag::PlaceObject2->new(
    Flags => 14,
    Depth => 1,
    CharacterID => 2,
    Matrix => SWF::Element::MATRIX->new( ScaleX => 2, ScaleY => 2, RotateSkew0 => 0, RotateSkew1 => 0, TranslateX => 0, TranslateY => 0, ),
    ColorTransform => SWF::Element::CXFORMWITHALPHA->new( Flags => 2, RedMultTerm => 256, GreenMultTerm => 256, BlueMultTerm => 256, AlphaMultTerm => 128, ),
)
SWF::Element::Tag::ShowFrame->new(
)
SWF::Element::Tag::PlaceObject2->new(
    Flags => 13,
    Depth => 1,
    Matrix => SWF::Element::MATRIX->new( ScaleX => "1.5", ScaleY => 1.5, RotateSkew0 => 0, RotateSkew1 => 0, TranslateX => 20, TranslateY => 0, ),
    ColorTransform => SWF::Element::CXFORMWITHALPHA->new( Flags => 0, ),
)
SWF::Element::Tag::ShowFrame->new(
)
SWF::Element::Tag::RemoveObject2->new(
    Depth => 1,
)
SWF::Element::Tag::ShowFrame->new(
)
SWF::Element::Tag::End->new(
)`;

describe('original duel effect movies (SWF text)', () => {
  it('parses bitmaps, shapes and the display list and plays it frame by frame', () => {
    const movie = parseSwfText(MOVIE);
    expect(movie).toMatchObject({ files: ['glow.png'], frameRate: 30, frameCount: 3 });
    expect(movie.characters.get(2)).toMatchObject({ kind: 'shape', bitmap: 1, bounds: [-640, -640, 640, 640], fill: { a: 20, tx: -640 } });
    const play = new SwfInstance(movie, movie.timeline, false), frame = () => { const out: Parameters<SwfInstance['draw']>[0] = []; play.draw(out); return out; };
    play.step();
    expect(frame()).toMatchObject([{ bitmap: 0, matrix: { a: 40, tx: -1280 }, color: { mult: [1, 1, 1, 0.5] } }]);
    play.step();
    // A move keeps the character and replaces matrix and colour (an empty colour transform is the identity).
    expect(frame()).toMatchObject([{ matrix: { a: 30, tx: -940 }, color: { mult: [1, 1, 1, 1] } }]);
    play.step(); expect(frame()).toEqual([]);
    play.step(); expect(play.ended).toBe(true);
  });
});

describe('duel presentation cues', () => {
  it('reads phase, LP, attack, destruction, chain, coin and die commands and releases them with the timeline', () => {
    const q = new DuelCueQueue({ cardKind: () => 'monster' });
    let s = initial();
    s = cmd(s, set_card(0, 0, 0, 123, 1)); s = cmd(s, set_card(1, 0, 2, 456, 1));
    const steps = [engine(0x0e, 0), engine(0x25, 1, 1200), engine(0x24, 0, 500), engine(0x19, 0, 0, (2 << 8) | 1), engine(0x1a, 0, 0),
      engine(0x31, 1, 2, 14, 3), engine(0x5c, 0, 0 | (2 << 6), 0, 0b10), engine(0x5d, 1, 0, 4), engine(0x13, 0, 0, 0, 1), engine(0x04, 0)];
    for (const step of steps) { const next = cmd(s, step); q.collect(s, next); s = next; }
    expect(q.release(0)).toEqual([]);
    const cues = q.release(s.sequence);
    expect(cues.map(c => c.kind)).toEqual(['phase', 'damage', 'recover', 'attack', 'attack', 'destroy', 'coin', 'dice', 'chain-run', 'turn']);
    expect(cues[0]).toMatchObject({ phase: 'main1', player: 0 });
    expect(cues[1]).toMatchObject({ player: 1, value: 1200 });
    expect(cues[3]).toMatchObject({ at: { controller: 0, zone: 'monster', index: 0 }, target: { controller: 1, zone: 'monster', index: 2 } });
    expect(cues[4]).toMatchObject({ direct: true });
    expect(cues[5]).toMatchObject({ at: { controller: 1, zone: 'monster', index: 2 }, cardKind: 'monster' });
    expect(cues[6]).toMatchObject({ values: [0, 1], at: { controller: 0, zone: 'monster', index: 0 } });
    expect(cues[7]).toMatchObject({ value: 4 });
    expect(cues[9]).toMatchObject({ player: 1 });
    // Ids only grow, also across duels.
    expect(new Set(cues.map(c => c.id)).size).toBe(cues.length);
    q.reset(); const again = cmd(s, engine(0x0c, 0)); q.collect(s, again);
    expect(q.release(again.sequence)[0]!.id).toBeGreaterThan(cues[cues.length - 1]!.id);
  });
});

describe('waist-up portraits', () => {
  const data = parseWaistUpData([
    '// comment', '0,144,wm_h2_01_c01.png,wm_h2_01_c02.png,****,****,****,****,****,0,160,768,160',
    '1,0,wm_bo_01_c01_r.png,wm_bo_01_c02_r.png,wm_bo_01_c03_r.png,****,****,****,****,0,112,768,656',
    '1,1,wm_bo_01_c01_l.png,wm_bo_01_c02_l.png,wm_bo_01_c03_l.png,****,****,****,****,0,112,768,656',
    '5,64,wm_ey_01_01_c01.png,wm_ey_01_01_c02.png,wm_ey_01_01_c03.png,****,****,****,****,0,184,768,88',
    '10,112,wm_dc_01_c01_r.png,wm_dc_01_c01_l.png,****,****,****,****,****,0,248,768,520',
    '11,0,wm_h1_01_c01.png,wm_h1_01_c02.png,****,****,****,****,****,0,32,768,264',
    '11,120,wm_h1_99_c01.png,wm_h1_99_c01.png,****,****,****,****,****,0,72,768,208',
  ].join('\r\n'));
  const parts = (over: Record<number, number> = {}) => Uint8Array.from({ length: 16 }, (_, i) => over[i] ?? [0, 0, 0x20, 0x30, 0x40, 0x60, 0x70, 0x90, 0xb0, 0x50, 0, 0, 0, 1, 1, 2][i]!);
  it('picks each part by its avatar byte, colours by hair/skin/eye colour and per-side images by side', () => {
    expect(waistUpLayers(parts({ 6: 112 }), 0, data).map(l => l.path.replace('data/avatar/wu/', ''))).toEqual(
      ['wm_h2_01_c02.png', 'wm_bo_01_c02_r.png', 'wm_ey_01_01_c03.png', 'wm_dc_01_c01_r.png', 'wm_h1_01_c02.png']);
    expect(waistUpLayers(parts({ 6: 112 }), 1, data).map(l => l.path)).toContain('data/avatar/wu/wm_dc_01_c01_l.png');
    // A hood replaces the front hair and drops the back hair.
    const hooded = waistUpLayers(parts({ 6: 120 }), 0, data).map(l => l.path);
    expect(hooded).toContain('data/avatar/wu/wm_h1_99_c01.png'); expect(hooded.some(p => p.includes('h2_'))).toBe(false);
  });
  it('describes monsters the way the original card box does', () => {
    expect(cardKindLine({ id: '1', name: 'Gearfried', type: 'Monster / Effect', race: 'Warrior', attribute: 'Earth', attack: 1800 })).toBe('[Warrior/Effect/EARTH]');
    expect(cardKindLine({ id: '2', name: 'Flint', type: 'Spell / Equip' })).toBe('');
  });
});
