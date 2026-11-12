import { describe, expect, it } from 'vitest';
import { portraitLeft } from '../src/ui/duel-scene';

describe("a waist-up composed from parts (CWaistUpAvatar)", () => {
  it('stands at its side\'s home plus the look\'s offset, full size from the top (0x009ebd70, 0x009eb7b0)', () => {
    // live: the player (male) mirrored about 495, so its 768 px reach from -273 to 495
    expect(portraitLeft(0, false)).toBe(-273);
    expect(portraitLeft(0, true)).toBe(476 - 768);
    // live: Miss Shadow (a female NPC from parts) at 548; a male look at 529
    expect(portraitLeft(1, true)).toBe(548);
    expect(portraitLeft(1, false)).toBe(529);
  });
});
