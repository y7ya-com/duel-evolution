// live's reward scenes after an NPC duel (livetour 48-pack-pick, 49-card-get): the pack pick over the card get backdrop
// with the pack's cover, then the card get scene (the card, its detail, Back) once per card of the pack.
import { describe, expect, it } from 'vitest';
import { CardGetScene, CARD_GET_BACK, CARD_GET_CARD, isCardGet } from '../src/ui/htmlui/card-get';
import { cardGetBackdrop, npcPackSelect, npcPackUi, packSprites } from '../src/ui/htmlui/npc-pack';
import { Ids } from '../src/ui/htmlui/snapshot';
import type { CardView } from '../src/ui/contracts';
import type { NpcState } from '../src/features/npc';
// main's own reading of the backdrop sprites (what its packselect.js draws from)
import { offset, piece, stripHome } from '@htmlui/screens/packselect.js';

const card = (passcode: number, name: string): CardView => ({ id: passcode, passcode, name, kind: 'monster', level: 4, attack: 1800, defense: 1500 } as unknown as CardView);

describe('the reward pack scene', () => {
  it('gives main\'s packselect.js the checker backdrop at rest, every piece at its home', () => {
    const b = cardGetBackdrop();
    expect(b.shown).toBe(true); expect(b.movie).toBe('cardget_bg_a02');
    const keys = new Set<string>();
    for (const s of b.sprites) {
      const p = piece(s); expect(p).not.toBeNull(); keys.add(p!.key);
      expect(offset(s, p!)).toEqual({ dx: 0, dy: 0 });
      if (p!.kind === 'strip') expect(stripHome(p!.k, p!.flip)).toBe(p!.flip ? 768 - 64 * p!.k : 64 * (p!.k - 1));
    }
    expect(keys.size).toBe(16);   // 12 strips, the grid and the band top and bottom
  });
  it('places the picked pack\'s cover at 412, 160 in its frame, the others 270 apart', () => {
    const { packs, frame } = packSprites(['data/cardpack/a.png', 'data/cardpack/b.png'], 1);
    expect(packs.map(p => [p.wx, p.wy])).toEqual([[142, 160], [412, 160]]);
    expect(frame).toMatchObject({ wx: 396, wy: 144, shown: true });
  });
  it('puts the scene into the picker\'s snapshot', () => {
    const npc = { stage: 'after-duel', npc: { id: 60, name: 'A-lien' }, result: 2, settlementReceived: true, packs: [8], packStatus: 'idle' } as unknown as NpcState;
    const spec = npcPackSelect(npc, { ids: new Ids(), ui: npcPackUi(), packName: () => 'Pack 8', packImage: () => 'data/cardpack/P08.png', send: () => {}, rerender: () => {} })!;
    const ps = spec.snap!.packScene as { backdrop: unknown; packs: { tex: string }[]; frame: unknown };
    expect(ps.backdrop).toBeTruthy(); expect(ps.packs.map(p => p.tex)).toEqual(['data/cardpack/P08.png']); expect(ps.frame).toBeTruthy();
  });
});

describe('the card get scene', () => {
  it('shows each card of the pack in turn (the card, its detail, Back), then nothing', () => {
    const cards = [card(111, 'Mech Bass'), card(222, 'Armaill')];
    let renders = 0;
    const scene = new CardGetScene({ card: pc => cards.find(c => c.passcode === pc), rerender: () => { renders++; } });
    const ids = new Ids(), key = 'npc:60:2';
    expect(scene.pending(key, [111, 222])).toBe(true);
    let specs = scene.windows(ids, key, [111, 222]);
    expect(specs.map(s => s.win.cls)).toEqual(['CWindowPackSelect', 'CCardDetailViewDlg', 'CEnginePictures', 'CWindowResultNext']);
    expect(specs.every(s => isCardGet(s.win))).toBe(true);
    expect(specs[0]!.snap?.packScene).toBeTruthy();
    const pic = (specs[2]!.win.pics as { source: { card: number }; x: number; y: number }[])[0]!;
    expect(pic.source.card).toBe(111); expect([pic.x, pic.y]).toEqual([CARD_GET_CARD.x, CARD_GET_CARD.y]);
    expect([specs[3]!.win.x, specs[3]!.win.y]).toEqual([CARD_GET_BACK.x, CARD_GET_BACK.y]);
    expect(scene.detailView()).toMatchObject({ passcode: 111 });
    const back = () => [...scene.windows(ids, key, [111, 222])[3]!.handlers.values()].find(h => h.key === 'card-get-back')!.click!();
    back(); expect(renders).toBe(1);
    specs = scene.windows(ids, key, [111, 222]);
    expect((specs[2]!.win.pics as { source: { card: number } }[])[0]!.source.card).toBe(222);
    back();
    expect(scene.pending(key, [111, 222])).toBe(false); expect(scene.windows(ids, key, [111, 222])).toEqual([]);
    // a new receipt starts again
    expect(scene.pending('npc:60:3', [111])).toBe(true);
  });
});
