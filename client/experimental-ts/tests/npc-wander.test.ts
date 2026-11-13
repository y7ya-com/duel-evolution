import { describe, expect, it } from 'vitest';
import { NpcWanderer, npcFirstIdle, npcIdleTime, npcWalkTime } from '../src/world/npc-wander';
import type { WalkGrid } from '../src/world/maps';

// an open 30 x 20 grid (600 x 400 px)
const grid: WalkGrid = { width: 30, height: 20, rows: Array.from({ length: 20 }, () => '1'.repeat(30)) };
const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };

describe('NPC wandering (CNpcChibiAvatar 0x009d9dc0 / 0x009d9f70)', () => {
  it('times its idle and walk spells as the exe: 10..60 s first, then 2..5 s walks between 30..60 s rests', () => {
    expect([npcFirstIdle(0), npcFirstIdle(32767)]).toEqual([300, 1800]);
    expect([npcWalkTime(0), npcWalkTime(32767)]).toEqual([60, 150]);
    expect([npcIdleTime(0), npcIdleTime(32767)]).toEqual([900, 1800]);
  });
  it('stands through its first idle time, then walks a path to a drawn spot', () => {
    // rand(): first idle 0 (300 frames), walk 0 (60 frames), idle 0, then the spot index 1
    const w = new NpcWanderer({ x: 50, y: 50, direction: 0 }, [{ x: 50, y: 50 }, { x: 410, y: 50 }], grid, { rand: seq(0, 0, 0, 1) });
    for (let i = 0; i < 300; i++) w.tick();
    expect([w.x, w.y, w.walking]).toEqual([50, 50, false]);
    w.tick();   // the idle time passes zero: the walk starts
    expect(w.walkTimer).toBe(60);
    let maxStep = 0;
    for (let i = 0; i < 60; i++) { const x = w.x; w.tick(); maxStep = Math.max(maxStep, w.x - x); }
    // the chibi pace, as live's NPCs (up to 6 px a frame): 60 frames reach the spot 360 px away
    expect(w.x).toBeGreaterThan(300); expect(maxStep).toBeLessThanOrEqual(6); expect(maxStep).toBeGreaterThan(5.5);
    expect(w.direction).toBe(6);   // walking right (avatarDirection(+x, 0))
    // the walk time out: it finishes its step and stands
    for (let i = 0; i < 30; i++) w.tick();
    expect(w.walking).toBe(false);
    const x = w.x; for (let i = 0; i < 100; i++) w.tick(); expect(w.x).toBe(x);
  });
  it('does not set out while busy (being talked to), nor without a grid or spots', () => {
    const busy = new NpcWanderer({ x: 50, y: 50, direction: 0 }, [{ x: 410, y: 50 }], grid, { rand: seq(0) }); busy.busy = true;
    const gridless = new NpcWanderer({ x: 50, y: 50, direction: 0 }, [{ x: 410, y: 50 }], null, { rand: seq(0) });
    for (let i = 0; i < 2000; i++) { busy.tick(); gridless.tick(); }
    expect([busy.x, gridless.x]).toEqual([50, 50]);
  });
  it('runs on real time in 30 fps frames', () => {
    const w = new NpcWanderer({ x: 50, y: 50, direction: 0 }, [{ x: 410, y: 50 }], grid, { rand: seq(0) });
    w.update(1000); expect(w.idleTimer).toBe(300 - 7);   // a long frame counts as 250 ms
    w.update(100); expect(w.idleTimer).toBe(300 - 10);
  });
  it('is drawn between its frames at the screen rate', () => {
    const w = new NpcWanderer({ x: 50, y: 50, direction: 0 }, [{ x: 50, y: 50 }, { x: 410, y: 50 }], grid, { rand: seq(0, 0, 0, 1) });
    for (let i = 0; i < 301 + 20; i++) w.tick();   // its first idle, then 20 frames into the walk
    const xs: number[] = []; for (let i = 0; i < 8; i++) { w.update(1000 / 60); xs.push(w.drawX); }
    expect(new Set(xs).size).toBe(8);   // a new point every 60 Hz frame
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    expect(w.drawX).toBeLessThanOrEqual(w.x);   // never ahead of the walk
  });
});
