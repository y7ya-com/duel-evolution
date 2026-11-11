import { describe, expect, it } from 'vitest';
import { gaugeBand, lpDigits, LP_PLATE_CSS } from '../src/ui/duel-plate';

describe('duel LP plate', () => {
  it('draws LP as a whole, non-negative number', () => {
    expect(lpDigits(8000)).toBe('8000');
    expect(lpDigits(-300)).toBe('0');
    expect(lpDigits(1234.9)).toBe('1234');
    expect(lpDigits(Number.NaN)).toBe('0');
    expect(lpDigits(250000)).toBe('99999');
  });
  it('picks the gauge colour band by the fraction left', () => {
    expect(gaugeBand(1)).toBe(0);
    expect(gaugeBand(0.4)).toBe(2);
    expect(gaugeBand(0.1)).toBe(3);
  });
  it('scopes its styles', () => {
    for (const rule of LP_PLATE_CSS.trim().split('\n')) expect(rule.startsWith('.de-lpp')).toBe(true);
  });
});
