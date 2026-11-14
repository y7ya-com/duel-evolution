// live's janken scene motions (janken-scene.ts): the moments index.ts holds the scene for and wakes its renders on
import { describe, expect, it } from 'vitest';
import { JANKEN_DEAL_MS, jankenMoments } from '../src/ui/janken-scene';

const F = 1000 / 30;
describe('janken moments', () => {
  const scene = 10_000, deal = { at: scene + JANKEN_DEAL_MS, from: 'deck' as const };
  it('the first deal ends about half a second after it starts (53 px a frame, then quarters; pairs 2 frames apart)', () => {
    const m = jankenMoments({ scene, deal });
    expect(m.dealt - deal.at).toBeGreaterThan(12 * F); expect(m.dealt - deal.at).toBeLessThan(24 * F);
    expect(m.approach).toBeUndefined(); expect(m.plates).toBeUndefined();
  });
  it('a won round: the gather, 4 frames, 16 to meet, 8 for the outcome, then the winner holds before the plates', () => {
    const pick = { hand: 0, at: 20_000, raised: true }, reveal = { at: 20_050, mine: 0, theirs: 1 };
    const m = jankenMoments({ scene, deal, pick, reveal });
    // rock's card slides 260 px to the middle at 24.5 px a frame; the opponent's backs as far, from the hands' moment
    expect(m.approach).toBeCloseTo(reveal.at + 260 / 24.5 * F + 4 * F, 3);
    expect(m.met! - m.approach!).toBeCloseTo(16 * F, 3);
    expect(m.mineWins).toBe(true); expect(m.tie).toBe(false);
    expect(m.settled! - m.met!).toBeCloseTo(8 * F, 3);
    expect(m.plates! - m.settled!).toBe(1050);
    expect(m.redeal).toBeUndefined();
  });
  it('a tie: the two meet, back off, hold and go home, then the hands are dealt again', () => {
    const m = jankenMoments({ scene, deal, pick: { hand: 1, at: 20_000, raised: false }, reveal: { at: 20_000, mine: 2, theirs: 2 } });
    expect(m.tie).toBe(true); expect(m.plates).toBeUndefined();
    expect(m.redeal! - m.met!).toBeCloseTo(32 * F, 3);
    const again = jankenMoments({ scene, deal: { at: m.redeal!, from: 'stacks' } });
    expect(again.dealt).toBeGreaterThan(m.redeal!);
  });
  it('a plate chosen: the other fades, the chosen one goes to the middle about a second later (fade 15 frames, move 16)', () => {
    const m = jankenMoments({ scene, deal, choice: { first: true, at: 30_000 } });
    expect(m.chosen! - 30_000).toBeCloseTo(15 * F + 16 * F, 3);
  });
});
