import { afterEach, describe, expect, it, vi } from 'vitest';
import { gaugeBand, lpDigits, lpPlate, LP_PLATE_CSS } from '../src/ui/duel-plate';
import { TestDocument, type TestNode } from './ui-dom-fixture';

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
  afterEach(() => { vi.unstubAllGlobals(); });
  it('draws both gauges (track and fill) on the plate, the fill as wide as the fraction left', () => {
    vi.stubGlobal('document', new TestDocument());
    const image = (path: string, className = '') => { const img = document.createElement('img'); img.className = className; img.dataset.path = path; return img as HTMLImageElement; };
    const plate = lpPlate({ side: 0, name: 'Ann', lp: 4000, time: null, image });
    const all = (n: TestNode): TestNode[] => [n, ...n.childNodes.flatMap(all)];
    const gauges = all(plate.root as unknown as TestNode).filter(n => n.className === 'de-lpp-gauge' && !!n.style.width);
    const paths = all(plate.root as unknown as TestNode).map(n => n.dataset?.path).filter(Boolean);
    expect(paths.some(p => /duel_gauge_02_c00/.test(p!))).toBe(true);
    expect(paths.some(p => /duel_gauge_01_c00/.test(p!))).toBe(true);
    expect(gauges.length).toBeGreaterThanOrEqual(2);
  });
});
