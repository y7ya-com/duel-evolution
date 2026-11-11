import { describe, expect, it, vi } from 'vitest';
import { PendingWork, sceneKey, watchSceneChanges } from '../src/ui/htmlui/scene-loading';

describe('scene veil on every scene change (main loader.js: each scene "begin")', () => {
  it('names the scenes the original loads: the duel result and the trade are scenes of their own', () => {
    expect(sceneKey({ scene: 'title' })).toBe('title');
    expect(sceneKey({ scene: 'duel', duel: {} })).toBe('duel');
    expect(sceneKey({ scene: 'duel', duel: { ended: 'Victory' } })).toBe('result');
    expect(sceneKey({ scene: 'duel', duel: { ended: 'Victory' }, sideboarding: {} })).toBe('duel');
    expect(sceneKey({ scene: 'lobby', trade: true })).toBe('trade');
    expect(sceneKey({ scene: 'characters', trade: true })).toBe('characters');
  });
  it('begins a load on a change, never on the first screen, and ends it once the scene has settled: no fixed wait', async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [], frames: (() => void)[] = [], pending = new PendingWork();
      const tracker = { begin: (name: string) => { events.push(`begin ${name}`); return () => events.push(`end ${name}`); } };
      const w = watchSceneChanges({ tracker, pending, roots: () => [], frame: fn => frames.push(fn), now: () => Date.now() });
      w.observe('title'); w.observe('title');
      expect(events).toEqual([]);
      let release!: () => void; void pending.track(new Promise<void>(r => { release = r; }));
      w.observe('characters');
      expect(events).toEqual(['begin scene:characters']);
      frames.shift()!(); frames.shift()!();
      vi.advanceTimersByTime(500);
      expect(events).toEqual(['begin scene:characters']);   // a picture still coming holds it
      release(); await Promise.resolve(); await Promise.resolve();
      {
        vi.advanceTimersByTime(100);
        expect(events).toEqual(['begin scene:characters', 'end scene:characters']);
        // a quick scene ends two polls after its second frame
        w.observe('lobby'); frames.shift()!(); frames.shift()!(); vi.advanceTimersByTime(50);
        expect(events.at(-1)).toBe('end scene:lobby');
        w.dispose();
      }
    } finally { vi.useRealTimers(); }
  });
});
