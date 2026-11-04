import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { WorldRuntime } from '../src/world/runtime';
import { BLACK_HIT_PIXEL, RED_HEIGHT_PIXEL, EXIT_HIT_PIXELS, footGeometry } from '../src/world/collision';
import { playerFootTransform } from '../src/avatars/transform';
import type { AssetLease } from '../src/assets';
import type { PixelMask } from '../src/world/collision';
import type { WorldMap, WorldPosition } from '../src/world/maps';

const WHITE = 0x00ffffff;
const position: WorldPosition = { x: 64, y: 64, direction: 0 };
const map: WorldMap = { id: 0, name: 'Map_test', width: 1024, height: 1024, grid: null, entries: [{ from: 1, x: 64, y: 64, direction: 0 }], exits: [], npcSpots: [] };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(pixel: (x: number, y: number) => number = () => WHITE, overrides: { maxTiles?: number; maxRetainedPixels?: number; decodeMask?: (bytes: Uint8Array, options?: any) => Promise<PixelMask> } = {}) {
  let active = 0, maxActive = 0; const reads: string[] = [], released: string[] = [];
  const table = `MapData::Start\nMap_test;MapName\ntest_bg;BaseMap\n128;BasePartsW\n128;BasePartsH\n8;BaseNumX\n8;BaseNumY\ntest_atari;HitMap\n0;ObjMapNum\n0;FrontObjMapNum\nMapData::End`;
  const makeMask = (bytes: Uint8Array): PixelMask => Object.freeze({ width: 128, height: 128, pixel(x: number, y: number) { return pixel(bytes[0] * 128 + x, bytes[1] * 128 + y); } });
  const readScene = vi.fn(async (path: string) => {
    reads.push(path); active++; maxActive = Math.max(maxActive, active); let live = true;
    const m = /_(\d+)_(\d+)\.png$/.exec(path);
    return { value: { bytes: m ? Uint8Array.of(Number(m[1]) - 1, Number(m[2]) - 1) : new TextEncoder().encode(table), url: `blob:${path}`, mimeType: m ? 'image/png' : 'application/octet-stream' },
      release() { if (live) { live = false; active--; released.push(path); } } } as AssetLease;
  });
  const runtime = new WorldRuntime({ assets: { readScene }, decodeMask: overrides.decodeMask ?? (async bytes => makeMask(bytes)), ...overrides });
  return { runtime, readScene, makeMask, reads, released, get active() { return active; }, get maxActive() { return maxActive; } };
}

describe('source player root/foot transform', () => {
  it('retains source six-pixel facing-dependent offset rather than centering collision on network position', () => {
    expect(footGeometry(playerFootTransform(position, 0)).center).toEqual({ x: 58, y: 64 });
    expect(footGeometry(playerFootTransform(position, 6)).center).toEqual({ x: 70, y: 64 });
    expect(footGeometry(playerFootTransform(position, 0)).probes[0]).toEqual({ x: 78, y: 64 });
    expect(footGeometry(playerFootTransform(position, 6)).probes[0]).toEqual({ x: 50, y: 64 });
  });
  it('composes a supplied parent matrix after root offset, mirroring and avatar translation', () => {
    const parent = { m00: 2, m01: 0, m10: 0, m11: 3, m30: 100, m31: -50 };
    expect(footGeometry(playerFootTransform(position, 6, { parentWorld: parent })).center).toEqual({ x: 240, y: 142 });
    expect(() => playerFootTransform(position, 8)).toThrow();
    expect(() => playerFootTransform(position, 0, { parentWorld: { ...parent, m30: NaN } })).toThrow();
  });
  it.skipIf(!existsSync('/tmp/de-startup-yo2.exe'))('confirms root/engine inheritance and source root translations by static operand reads', () => {
    const bytes = readFileSync('/tmp/de-startup-yo2.exe'), offset = (va: number) => va - 0x400000;
    expect(bytes.readUInt32LE(offset(0x670d5f))).toBe(0xc7); expect(bytes[offset(0x670d63)]).toBe(1);
    expect(bytes.readUInt32LE(offset(0x9ccdc7))).toBe(0xc7); expect(bytes[offset(0x9ccdcb)]).toBe(1);
    expect(bytes.readFloatLE(offset(0x9ccdf3))).toBe(-46); expect(bytes.readFloatLE(offset(0x9ccdfb))).toBe(-136);
    expect(bytes.readFloatLE(offset(0x9ccdde))).toBe(20);
    const target = (va: number) => va + 5 + bytes.readInt32LE(offset(va + 1));
    expect(target(0x6709db)).toBe(0x403a44); expect(target(0x403a44)).toBe(0x60e2c0); // root is CElement::newChild(engine,10000)
  });
});

describe('bounded streamed field physics runtime', () => {
  it('loads only nearby collision tiles, releases every encoded lease, and uses source smoothing/height scales', async () => {
    const f = fixture(); await f.runtime.load(map, position);
    expect(f.runtime.definition?.width).toBe(1024); expect(f.runtime.status.loadedTiles).toBeLessThan(64);
    expect(f.active).toBe(0); expect(f.runtime.status.retainedPixels).toBe(f.runtime.status.loadedTiles * 128 * 128);
    let p = position, step = { x: 0, y: 0 };
    for (let i = 0; i < 3; i++) { const result = f.runtime.step(p, { x: 100, y: 0 }, step); p = result.position; step = result.step; }
    expect(p.x).toBeCloseTo(65.626); expect(p.direction).toBe(6); expect(step.x).toBeCloseTo(1.626);
    const red = fixture(() => RED_HEIGHT_PIXEL); await red.runtime.load(map, position);
    let redStep = { x: 0, y: 0 }, rp = position;
    for (let i = 0; i < 3; i++) { const result = red.runtime.step(rp, { x: 100, y: 0 }, redStep); rp = result.position; redStep = result.step; }
    expect(rp.x).toBe(64); expect(redStep.x).toBeCloseTo(1.1382);
    f.runtime.dispose(); red.runtime.dispose(); expect(f.runtime.status.retainedPixels).toBe(0);
  });
  it('uses actual radial collision before applying the source three-pixel correction cap', async () => {
    const f = fixture(x => x >= 100 ? BLACK_HIT_PIXEL : WHITE); await f.runtime.load(map, position);
    const result = f.runtime.step({ x: 80, y: 64, direction: 6 }, { x: 1, y: 0 }, { x: 6, y: 0 });
    expect(result.wallHit).toBe(true); expect(Math.hypot(result.displacement.x, result.displacement.y)).toBeLessThanOrEqual(3.00001);
    expect(result.step.x).toBeCloseTo(6); // Smoothed momentum is retained before wall correction.
    expect(f.runtime.canPublish({ x: 80, y: 64, direction: 6 })).toBe(false);
    f.runtime.dispose();
  });
  it('derives exits from the solver-reported blocked color and actual map entry index', async () => {
    const f = fixture(x => x >= 94 && x <= 99 ? EXIT_HIT_PIXELS[0] : WHITE); await f.runtime.load(map, position);
    const result = f.runtime.step(position, { x: 1, y: 0 }, { x: 6, y: 0 });
    expect(result.exit).toMatchObject({ index: 0, destination: 1, source: 'mask' }); expect(result.wallHit).toBe(true);
    expect(result.position.x).toBeLessThanOrEqual(67); f.runtime.dispose();
  });
  it('cancels a shared translation between avatar world probes and field-local mask coordinates', async () => {
    const assets = fixture(x => x >= 100 ? BLACK_HIT_PIXEL : WHITE);
    const shifted = new WorldRuntime({ assets: { readScene: assets.readScene }, decodeMask: async bytes => assets.makeMask(bytes), fieldOrigin: { x: -300, y: 200 } });
    await assets.runtime.load(map, position); await shifted.load(map, position);
    const p = { x: 80, y: 64, direction: 6 }, input = { x: 1, y: 0 }, old = { x: 6, y: 0 };
    expect(shifted.step(p, input, old)).toEqual(assets.runtime.step(p, input, old));
    shifted.dispose(); assets.runtime.dispose();
  });
  it('bounds the retained tile window over movement across the whole synthetic scene', async () => {
    const f = fixture(() => WHITE, { maxTiles: 6, maxRetainedPixels: 6 * 128 * 128 }); await f.runtime.load(map, position);
    for (let column = 0; column < 8; column++) {
      await f.runtime.prepare({ x: column * 128 + 64, y: 64, direction: 0 });
      expect(f.runtime.status.loadedTiles).toBeLessThanOrEqual(6); expect(f.runtime.status.retainedPixels).toBeLessThanOrEqual(6 * 128 * 128);
    }
    expect(f.active).toBe(0); f.runtime.dispose();
  });
  it('returns an explicit waiting transaction while missing pixels load, preserving position and momentum', async () => {
    let blocked = false; const waiting: (() => void)[] = [];
    const f = fixture(() => WHITE, { decodeMask: async bytes => { if (blocked) await new Promise<void>(r => waiting.push(r)); return f.makeMask(bytes); } });
    await f.runtime.load(map, position); blocked = true;
    const p = { x: 500, y: 500, direction: 6 }, old = { x: 4, y: 1 };
    const result = f.runtime.step(p, { x: 100, y: 0 }, old);
    expect(result).toMatchObject({ waiting: true, position: p, step: old, moved: false, exit: null });
    await flush(); expect(waiting.length).toBeLessThanOrEqual(2);
    blocked = false; for (const done of waiting) done(); await f.runtime.prepare(p);
    expect(f.runtime.step(p, { x: 100, y: 0 }, old).waiting).toBe(false); f.runtime.dispose();
  });
  it('aborts map changes/disposal and prevents late decodes from repopulating the current scene', async () => {
    const waiting: (() => void)[] = []; let blocked = true;
    const f = fixture(() => WHITE, { decodeMask: async bytes => { if (blocked) await new Promise<void>(r => waiting.push(r)); return f.makeMask(bytes); } });
    const first = f.runtime.load(map, position).catch(error => error); await flush();
    const second = f.runtime.load(map, { x: 800, y: 800, direction: 0 }); await flush();
    expect(waiting.length).toBeLessThanOrEqual(2); blocked = false; for (const done of waiting) done();
    expect(await first).toMatchObject({ name: 'AbortError' }); await second;
    expect(f.runtime.status.loadedTiles).toBeLessThanOrEqual(4); expect(f.active).toBe(0);
    f.runtime.dispose(); expect(f.runtime.status.loadedTiles).toBe(0); expect(f.runtime.status.retainedPixels).toBe(0);
    await expect(f.runtime.load(map, position)).rejects.toThrow(/disposed/);
  });
  it('keeps decode failures explicit and retryable without retrying on every movement tick', async () => {
    let fail = true;
    const f = fixture(() => WHITE, { decodeMask: async bytes => { if (fail) throw new Error('Bad collision PNG'); return f.makeMask(bytes); } });
    await expect(f.runtime.load(map, position)).rejects.toThrow('Bad collision PNG'); const count = f.reads.length;
    for (let i = 0; i < 10; i++) f.runtime.step(position, { x: 10, y: 0 }, { x: 0, y: 0 }); await flush();
    expect(f.reads).toHaveLength(count); expect(f.runtime.status.error).toBe('Bad collision PNG'); expect(f.active).toBe(0);
    fail = false; f.runtime.retry(); await f.runtime.prepare(position); expect(f.runtime.status.error).toBe(null); f.runtime.dispose();
  });
  it('requires exact loaded probes for safe short arrival snaps', async () => {
    const f = fixture(x => x >= 100 ? BLACK_HIT_PIXEL : WHITE); await f.runtime.load(map, position);
    const free = f.runtime.step(position, { x: 2, y: 0 }, { x: 0, y: 0 }, { snap: true }); expect(free.position.x).toBe(66);
    const wall = f.runtime.step({ x: 80, y: 64, direction: 6 }, { x: 2, y: 0 }, { x: 0, y: 0 }, { snap: true });
    expect(wall.wallHit).toBe(true); expect(wall.position.x).not.toBe(82);
    expect(() => f.runtime.step(position, { x: 100, y: 0 }, { x: 0, y: 0 }, { snap: true })).toThrow(/threshold/); f.runtime.dispose();
  });
  it('honors connection cancellation after initial preparation, not only during the first load', async () => {
    const f = fixture(), scope = new AbortController(); await f.runtime.load(map, position, scope.signal);
    scope.abort(); expect(f.runtime.step(position, { x: 10, y: 0 }, { x: 3, y: 0 }).waiting).toBe(true);
    await expect(f.runtime.prepare(position)).rejects.toMatchObject({ name: 'AbortError' }); f.runtime.dispose();
  });
  it('uses the opt-in source crossing patch independently of walk masks', async () => {
    const f = fixture(), runtime = new WorldRuntime({ assets: { readScene: f.readScene }, decodeMask: async bytes => f.makeMask(bytes), crossings: true });
    const p = { x: 440, y: 1000, direction: 6 }; await runtime.load({ ...map, id: 2 }, p);
    expect(runtime.step(p, { x: 1, y: 0 }, { x: 6, y: 0 }).exit).toMatchObject({ destination: 7, source: 'crossing', index: 3 }); runtime.dispose(); f.runtime.dispose();
  });
});
