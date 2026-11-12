// live's janken reveal (janken-scene.ts): whose hand wins decides which card stays in the middle
import { describe, expect, it } from 'vitest';
import { jankenWinner } from '../src/ui/janken-scene';

describe('janken reveal', () => {
  it('rock beats scissors, scissors beat paper, paper beats rock; a tie has no winner', () => {
    expect(jankenWinner(0, 1)).toBe(true); expect(jankenWinner(1, 2)).toBe(true); expect(jankenWinner(2, 0)).toBe(true);
    expect(jankenWinner(1, 0)).toBe(false); expect(jankenWinner(2, 1)).toBe(false); expect(jankenWinner(0, 2)).toBe(false);
    for (const h of [0, 1, 2]) expect(jankenWinner(h, h)).toBeNull();
  });
});
