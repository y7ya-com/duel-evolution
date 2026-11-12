import { describe, expect, it, vi } from 'vitest';
import { ActorMotion, drawnAvatars, MAX_DRAWN_AVATARS, MAX_STRIP_FRAMES, REMOTE_SNAP_PX, stripFrame } from '../src/world/actors';
import { bakeStrip } from '../src/ui/world-avatars';
import type { AvatarResource } from '../src/avatars';

describe('world actors (pure rules of the PixiJS world)', () => {
  it('walks toward the server position 3 px per 30 fps step, any frame rate', () => {
    const m = new ActorMotion({ x: 0, y: 0 }, 0); m.retarget({ x: 0, y: 30 }, 4);
    for (let i = 0; i < 4; i++) m.step(1000 / 120);
    expect(m.y).toBeCloseTo(3); expect(m.walking).toBe(true); expect(m.direction).toBe(0);   // walking down: direction 0
    for (let i = 0; i < 40; i++) m.step(1000 / 60);
    expect(m.y).toBe(30); expect(m.walking).toBe(false); expect(m.direction).toBe(4);       // arrived: the server's facing
  });
  it('faces each of the eight directions as the exe (5 to 7 are the mirrored right side)', () => {
    const dir = (dx: number, dy: number) => { const m = new ActorMotion({ x: 100, y: 100 }); m.retarget({ x: 100 + dx, y: 100 + dy }, undefined); m.step(1); return m.direction; };
    expect([dir(0, 50), dir(-50, 50), dir(-50, 0), dir(-50, -50), dir(0, -50), dir(50, -50), dir(50, 0), dir(50, 50)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('snaps a far jump or the player\'s own position', () => {
    const m = new ActorMotion({ x: 0, y: 0 }); m.retarget({ x: REMOTE_SNAP_PX + 1, y: 0 }, 2); expect(m.x).toBe(REMOTE_SNAP_PX + 1); expect(m.direction).toBe(2);
    m.retarget({ x: 10, y: 0 }, 2, true); expect(m.x).toBe(10); expect(m.walking).toBe(false);
  });
  it('picks the strip frame from the movie rate, looping', () => {
    expect(stripFrame(0, 12, 4)).toBe(0); expect(stripFrame(84, 12, 4)).toBe(1); expect(stripFrame(1000, 12, 4)).toBe(0); expect(stripFrame(500, 12, 1)).toBe(0);
  });
  it('draws original art for the nearest 24 in or near the view, self first', () => {
    const avatars = Array.from({ length: 40 }, (_, i) => ({ id: i, x: 500 + i * 10, y: 400, parts: new Uint8Array(16), self: i === 39 }));
    const drawn = drawnAvatars(avatars, { x: 0, y: 0, width: 1024, height: 768 });
    expect(drawn.size).toBe(MAX_DRAWN_AVATARS); expect(drawn.has(39)).toBe(true); expect(drawn.has(0)).toBe(false);
    expect(drawnAvatars([{ id: 1, x: 5000, y: 5000, parts: new Uint8Array(16) }], { x: 0, y: 0, width: 1024, height: 768 }).size).toBe(0);
  });
  it('bakes each movie frame into its own clipped 128 x 160 cell with the feet at (64, 144)', () => {
    const calls: string[] = [];
    const ctx = { save: () => calls.push('save'), restore: () => calls.push('restore'), beginPath: () => {}, clip: () => calls.push('clip'), rect: (x: number, y: number, w: number, h: number) => calls.push(`rect ${x},${y},${w},${h}`) };
    const canvas = { width: 0, height: 0, getContext: () => ctx };
    const draw = vi.fn((_c: unknown, o: { x: number; y: number; frame: number }) => calls.push(`draw ${o.x},${o.y},${o.frame}`));
    const resource = { movie: { frameCount: 3, fps: 15 }, pose: { offset: [-46, -116], foot: [40, 116], mirrored: false }, draw } as unknown as AvatarResource;
    const strip = bakeStrip('k', resource, (w, h) => Object.assign(canvas, { width: w, height: h }) as unknown as HTMLCanvasElement);
    expect(canvas.width).toBe(384); expect(canvas.height).toBe(160);
    expect(calls.filter(c => c.startsWith('draw'))).toEqual(['draw 64,144,0', 'draw 192,144,1', 'draw 320,144,2']);
    expect(calls.filter(c => c.startsWith('rect'))).toEqual(['rect 0,0,128,160', 'rect 128,0,128,160', 'rect 256,0,128,160']);
    expect(strip.frames.map(t => t.frame.x)).toEqual([0, 128, 256]); expect(strip.fps).toBe(15);
    strip.release(); expect(canvas.width).toBe(0);
    // a long movie is sampled into at most MAX_STRIP_FRAMES cells, its rate scaled to keep the cycle's length
    const long = { ...resource, movie: { frameCount: MAX_STRIP_FRAMES * 2, fps: 30 }, draw: vi.fn() } as unknown as AvatarResource;
    const sampled = bakeStrip('l', long, (w, h) => ({ width: w, height: h, getContext: () => ctx }) as unknown as HTMLCanvasElement);
    expect(sampled.frames).toHaveLength(MAX_STRIP_FRAMES); expect(sampled.fps).toBe(15);
  });
});
