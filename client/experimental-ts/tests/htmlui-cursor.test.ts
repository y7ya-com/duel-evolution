import { describe, expect, it } from 'vitest';
import { cursorSprites, busyFrame, RIPPLE_MS } from '../src/ui/htmlui/cursor';
import { cursorCss, ripple } from '@htmlui/cursor.js';
import { readFileSync } from 'node:fs';

const shown = (s: ReturnType<typeof cursorSprites>) => s.sprites.filter(p => p.shown).map(p => [p.tex.split('/').pop(), p.wx - s.mx, p.wy - s.my]);

describe('the HD game cursor (main cursor.js, as live draws it)', () => {
  it('the plain hand stands as the engine draws it: shadow and hand at -16,-16 of the point, 64 x 64, alpha-blend', () => {
    const s = cursorSprites('normal', 858, 359, 0);
    expect(shown(s)).toEqual([['mausuk_n01_s.png', -16, -16], ['mausuk_n01_c01.png', -16, -16]]);
    // the same sprites the engine hands main's bridge (its mock snapshot of the lobby)
    const mock = JSON.parse(readFileSync(new URL('../../web-shell/htmlui/mock/lobby-npc.json', import.meta.url), 'utf8')).cursor;
    const live = mock.sprites.filter((p: { shown: boolean }) => p.shown);
    expect(s.sprites.map(p => ({ tex: p.tex, src: p.src, wz: p.wz, mode: p.mode }))).toEqual(live.map((p: { tex: string; src: number[]; wz: number; mode: number }) => ({ tex: p.tex, src: p.src, wz: p.wz, mode: p.mode })));
  });
  it('points over a control and turns while busy', () => {
    // the original's pointing hand (a02): n02_c02 at rest, n02_c01 held; the plain hand held is n01_c02 (a01_c02)
    expect(shown(cursorSprites('hover', 10, 10, 0))[1]![0]).toBe('mausuk_n02_c02.png');
    expect(shown(cursorSprites('hover', 10, 10, 0, [], true))[1]![0]).toBe('mausuk_n02_c01.png');
    expect(shown(cursorSprites('normal', 10, 10, 0, [], true))[1]![0]).toBe('mausuk_n01_c02.png');
    const frames = new Set([0, 140, 280, 420, 560].map(t => shown(cursorSprites('busy', 10, 10, t))[1]![0]));
    expect(frames.size).toBeGreaterThan(3);
    expect([...frames].every(f => /^mausuk_t0[1-8]_c01\.png$/.test(String(f)))).toBe(true);
  });
  it('a click ripples where it landed and fades; main cursor.js keeps the ripple out of the CSS cursor', () => {
    const at = cursorSprites('normal', 100, 100, 100, [{ x: 100, y: 100, at: 0 }]);
    const r = ripple(at) as { tex: string; a: number; wx: number; wsx: number }[];
    expect(r).toHaveLength(1);
    expect(r[0]!.tex).toMatch(/mausuk_e01_c01\.png$/);
    expect(r[0]!.a).toBeLessThan(1);
    expect(r[0]!.wx + 32 * r[0]!.wsx).toBeCloseTo(100);
    expect(ripple(cursorSprites('normal', 100, 100, 1000, [{ x: 100, y: 100, at: 0 }]))).toHaveLength(0);
    // no art loaded yet (no DOM): main's cursorCss says it cannot draw it (null), never a wrong cursor
    const g = globalThis as { Image?: unknown };
    const had = g.Image; g.Image = class { onload: (() => void) | null = null; src = ''; };
    try { expect(cursorCss(at, '/ui/', 1, 1)).toBeNull(); } finally { g.Image = had; }
  });
});

describe('the hand\'s timing is the original swfs\' (mausuk_a07_c01: 32 frames at 30 fps; mausuk_ae1_c01: 15 frames)', () => {
  it('each busy image is held 4 frames (133 ms), the turn takes 32 frames; the ripple lasts 500 ms', () => {
    expect([0, 133, 134, 266, 267, 1066, 1067].map(busyFrame)).toEqual([1, 1, 2, 2, 3, 8, 1]);
    expect(RIPPLE_MS).toBe(500);
    expect(cursorSprites('normal', 0, 0, 450, [{ x: 0, y: 0, at: 0 }]).sprites.some(s => s.tex.endsWith('mausuk_e01_c01.png'))).toBe(true);
  });
});
