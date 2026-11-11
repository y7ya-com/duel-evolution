import { describe, expect, it } from 'vitest';
import { cursorSprites, busyFrame, rippleFrame, RIPPLE_MS, GameCursor } from '../src/ui/htmlui/cursor';
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
    expect(s.sprites.filter(p => p.shown).map(p => ({ tex: p.tex, src: p.src, wz: p.wz, mode: p.mode }))).toEqual(live.map((p: { tex: string; src: number[]; wz: number; mode: number }) => ({ tex: p.tex, src: p.src, wz: p.wz, mode: p.mode })));
  });
  it('holds n02_c01 while pressed anywhere (live\'s engine), turns while busy', () => {
    // live's title, sampled: a press on nothing and on a plate both show n02_s + n02_c01
    expect(shown(cursorSprites('normal', 10, 10, 0, [], true)).map(s => s[0])).toEqual(['mausuk_n02_s.png', 'mausuk_n02_c01.png']);
    const frames = new Set([0, 140, 280, 420, 560].map(t => shown(cursorSprites('busy', 10, 10, t))[1]![0]));
    expect(frames.size).toBeGreaterThan(3);
    expect([...frames].every(f => /^mausuk_t0[1-8]_c01\.png$/.test(String(f)))).toBe(true);
  });
  it('every state\'s art is named (hidden) in each snapshot, so cursor.js loads it all at the first frame', () => {
    const names = new Set(cursorSprites('normal', 0, 0, 0).sprites.map(s => s.tex.split('/').pop()));
    for (const n of ['mausuk_n01_c01.png', 'mausuk_n02_c01.png', 'mausuk_t01_s.png', 'mausuk_e01_c01.png', ...Array.from({ length: 8 }, (_, i) => `mausuk_t0${i + 1}_c01.png`)])
      expect(names.has(n), n).toBe(true);
    const loads: string[] = [], g = globalThis as { Image?: unknown };
    const had = g.Image; g.Image = class { onload: (() => void) | null = null; set src(v: string) { loads.push(v); } };
    try { cursorCss(cursorSprites('normal', 0, 0, 0), '/x/', 1, 1); } finally { g.Image = had; }
    expect(loads).toContain('/x/mausuk_t05_c01.png');
    expect(loads).toContain('/x/hd/mausuk_n02_c01.png');
  });
  it('a click ripples where it landed and fades; main cursor.js keeps the ripple out of the CSS cursor', () => {
    const at = cursorSprites('normal', 100, 100, 100, [{ x: 100, y: 100, at: 0 }]);
    const r = ripple(at) as { tex: string; a: number; wx: number; wsx: number; src: number[] }[];
    expect(r).toHaveLength(1);
    expect(r[0]!.tex).toMatch(/mausuk_e01_c01\.png$/);
    expect(r[0]!.src).toEqual([0, 0, 32, 32]);
    expect(r[0]!.a).toBeLessThan(1);
    expect(r[0]!.wx + 16 * r[0]!.wsx).toBeCloseTo(100);
    expect(ripple(cursorSprites('normal', 100, 100, 1000, [{ x: 100, y: 100, at: 0 }]))).toHaveLength(0);
    // no art loaded yet (no DOM): main's cursorCss says it cannot draw it (null), never a wrong cursor
    const g = globalThis as { Image?: unknown };
    const had = g.Image; g.Image = class { onload: (() => void) | null = null; src = ''; };
    try { expect(cursorCss(at, '/ui/', 1, 1)).toBeNull(); } finally { g.Image = had; }
  });
  it('the ripple\'s frames are live\'s engine\'s (sampled 2026-11-11 on original.ygoevolution.com)', () => {
    // [scale, alpha] of frames 1..13 as live's snapshot.cursor showed them; frames 0 and 14 draw nothing
    const live = [[0.44, 0.16], [0.58, 0.32], [0.72, 0.48], [0.86, 0.64], [1, 0.8], [1.11, 0.71], [1.22, 0.62], [1.33, 0.54], [1.44, 0.45], [1.56, 0.36], [1.67, 0.27], [1.78, 0.18], [1.89, 0.09]];
    live.forEach(([s, a], i) => { const f = rippleFrame(i + 1); expect(f.s).toBeCloseTo(s!, 1); expect(f.a).toBeCloseTo(a!, 1); });
    expect(rippleFrame(14).a).toBe(0);
    // live's 4th sample: wx 88.5 for a press at 100 (scale 0.72)
    const r = ripple(cursorSprites('normal', 100, 700, 3 * 1000 / 30 + 1, [{ x: 100, y: 700, at: 0 }])) as { wx: number; wy: number }[];
    expect(r[0]!.wx).toBeCloseTo(88.5, 0); expect(r[0]!.wy).toBeCloseTo(688.5, 0);
  });
});

describe('the hand\'s timing is the original swfs\' (mausuk_a07_c01: 32 frames at 30 fps; mausuk_ae1_c01: 15 frames)', () => {
  it('each busy image is held 4 frames (133 ms), the turn takes 32 frames; the ripple lasts 500 ms', () => {
    expect([0, 133, 134, 266, 267, 1066, 1067].map(busyFrame)).toEqual([1, 1, 2, 2, 3, 8, 1]);
    expect(RIPPLE_MS).toBe(500);
    expect(cursorSprites('normal', 0, 0, 450, [{ x: 0, y: 0, at: 0 }]).sprites.some(s => s.tex.endsWith('mausuk_e01_c01.png'))).toBe(true);
  });
});

describe('GameCursor\'s state machine (a stub page: no art, so the CSS cursor stays unset)', () => {
  it('hovering a control keeps the plain hand (live); held + ripple on any press -> rest; busy wins', () => {
    const el = (): Record<string, unknown> => { const o: Record<string, unknown> = { style: {}, dataset: {}, append(c: unknown) { o.firstChild ??= c; }, remove() {}, getAttribute() { return null; }, classList: { toggle() {} } }; return o; };
    const listeners = new Map<string, (e: unknown) => void>(), g = globalThis as Record<string, unknown>;
    const saved = ['document', 'addEventListener', 'removeEventListener', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLSelectElement', 'Element', 'Image'].map(k => [k, g[k]] as const);
    class Element { parentElement: Element | null = null; hasAttribute() { return false; } getAttribute() { return null; } id = ''; }
    class HTMLButtonElement extends Element { disabled = false; }
    Object.assign(g, { Element, HTMLButtonElement, HTMLAnchorElement: class extends Element {}, HTMLSelectElement: class extends Element {},
      Image: class { onload = null; src = ''; },
      document: { createElement: el, head: el(), body: el(), documentElement: { classList: { toggle() {} }, style: { setProperty() {} } } },
      addEventListener: (k: string, f: (e: unknown) => void) => listeners.set(k, f), removeEventListener() {} });
    let busy = false;
    try {
      const c = new GameCursor({ art: '/ui/', stage: () => null, busy: () => busy });
      const fx = (c as unknown as { fxEls: unknown[] }).fxEls;
      const plain = new Element(), button = new HTMLButtonElement();
      listeners.get('pointermove')!({ clientX: 10, clientY: 10, target: plain }); c.frame(0);
      expect(c.cursor.state).toBe('normal');
      listeners.get('pointermove')!({ clientX: 10, clientY: 10, target: button }); c.frame(10);
      expect(c.cursor.state).toBe('normal');
      // a press on the control: the held hand and a ripple (live ripples on plates too)
      listeners.get('pointerdown')!({ button: 0, clientX: 10, clientY: 10, target: button }); c.frame(performance.now() + 100);
      expect(fx).toHaveLength(1);
      listeners.get('pointerup')!({ button: 0 }); c.frame(performance.now() + 600);
      expect(fx).toHaveLength(0);
      busy = true; c.frame(performance.now()); expect(c.cursor.state).toBe('busy');
      c.dispose();
    } finally { for (const [k, v] of saved) g[k] = v; }
  });
});
