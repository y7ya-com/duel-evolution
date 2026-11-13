import { describe, expect, it } from 'vitest';
import { WorldNavigator, WORLD_TICK_MS } from '../src/world/navigator';
import { WorldRuntime } from '../src/world/runtime';
import { BLACK_HIT_PIXEL, EXIT_HIT_PIXELS } from '../src/world/collision';
import { validateGrid } from '../src/world/maps';
import type { WorldMap, WorldPosition } from '../src/world/maps';
import type { AssetLease } from '../src/assets';

const spawn: WorldPosition = { x: 64, y: 64, direction: 0 };
const map: WorldMap = { id: 9, name: 'Map_test', width: null, height: null, grid: null,
  entries: [{ from: 1, x: 64, y: 64, direction: 0 }], exits: [], npcSpots: [] };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function physics(pixel: (x: number, y: number) => number = () => 0x00ffffff, decodeWait: () => Promise<void> = async () => {}) {
  const table = 'MapData::Start\nMap_test;MapName\ntest_bg;BaseMap\n128;BasePartsW\n128;BasePartsH\n4;BaseNumX\n4;BaseNumY\ntest_atari;HitMap\n0;ObjMapNum\n0;FrontObjMapNum\nMapData::End';
  return new WorldRuntime({ assets: { async readScene(path) {
    const m = /_(\d+)_(\d+)\.png$/.exec(path);
    return { value: { bytes: m ? Uint8Array.of(Number(m[1]) - 1, Number(m[2]) - 1) : new TextEncoder().encode(table), url: 'blob:synthetic', mimeType: m ? 'image/png' : 'text/plain' }, release() {} } as AssetLease;
  } }, decodeMask: async bytes => { await decodeWait(); return { width: 128, height: 128, pixel(x, y) { return pixel(bytes[0] * 128 + x, bytes[1] * 128 + y); } }; } });
}
async function tick(nav: WorldNavigator, count: number): Promise<void> { for (let i = 0; i < count; i++) { nav.update(WORLD_TICK_MS); if (i % 5 === 0) await flush(); } }

describe('navigator with streamed source foot physics', () => {
  it('walks a gridless map using exact pixels, finishes the target, and never teleports', async () => {
    const runtime = physics(), sent: WorldPosition[] = []; await runtime.load(map, spawn);
    const nav = new WorldNavigator({ send: p => sent.push(p), physics: runtime }); nav.reset(map, spawn);
    expect(nav.moveTo({ x: 280, y: 64 })).toBe(true); await tick(nav, 1); expect(nav.position?.x).toBe(64); expect(nav.walking).toBe(false);
    await tick(nav, 2); expect(nav.position?.x).toBeCloseTo(65.626);
    expect(sent.find(p => p.x > 64)?.x).toBe(65); // Source float→int32 wire conversion truncates.
    await tick(nav, 148); expect(nav.position).toMatchObject({ x: 280, y: 64, direction: 6 }); expect(nav.moving).toBe(false);
    let previous = spawn; for (const p of sent) { expect(Math.hypot(p.x - previous.x, p.y - previous.y)).toBeLessThan(8); previous = p; }
    expect(sent.length).toBeGreaterThan(10); nav.dispose(); runtime.dispose();
  });
  it('walks 6 px a 30 Hz frame (180 px/s) once under way, re-aimed every 50 ms or not (the step clock goes on across a re-aim)', async () => {
    const run = async (reaimMs: number | null) => {
      const runtime = physics(); await runtime.load(map, spawn);
      const nav = new WorldNavigator({ send() {}, physics: runtime }); nav.reset(map, spawn); nav.moveTo({ x: 500, y: 64 });
      let t = 0, next = reaimMs ?? Infinity; const at: number[] = [];
      for (let frame = 0; frame < 120; frame++) {   // 2 s at 60 Hz
        nav.update(1000 / 60); t += 1000 / 60; if (frame % 5 === 0) await flush();
        if (t >= next) { nav.moveTo({ x: 500, y: 64 }); next += reaimMs!; }
        at.push(nav.position!.x);
      }
      nav.dispose(); runtime.dispose(); return at;
    };
    const once = await run(null), steered = await run(50);
    expect(steered[119]).toBeCloseTo(once[119]!, 0);
    expect(once[119]! - once[89]!).toBeGreaterThan(88); expect(once[119]! - once[89]!).toBeLessThanOrEqual(90.01);   // the last half second: 6 px x 15
  });
  it('is drawn between its 30 Hz steps at the screen rate, never ahead of the walk, and settles on the last step', async () => {
    const runtime = physics(); await runtime.load(map, spawn);
    const nav = new WorldNavigator({ send() {}, physics: runtime }); nav.reset(map, spawn); nav.moveTo({ x: 400, y: 64 });
    await tick(nav, 30);
    const drawn: number[] = [];
    for (let i = 0; i < 8; i++) { nav.update(1000 / 120); drawn.push(nav.drawn!.x); expect(nav.drawn!.x).toBeLessThanOrEqual(nav.position!.x); }
    expect(new Set(drawn).size).toBe(8);   // a new point every 120 Hz frame
    for (let i = 1; i < drawn.length; i++) expect(drawn[i]!).toBeGreaterThan(drawn[i - 1]!);
    for (let i = 0; i < 200 && nav.moving; i++) { nav.update(1000 / 60); await flush(); }
    expect(nav.moving).toBe(false); expect(nav.position!.x).toBe(400);
    expect(nav.settling).toBe(true); expect(nav.drawn!.x).toBeLessThan(400);
    nav.update(WORLD_TICK_MS); expect(nav.settling).toBe(false); expect(nav.drawn!.x).toBe(400);
    nav.dispose(); runtime.dispose();
  });
  it('retains the route and momentum while collision loading pauses movement, then resumes without a new click', async () => {
    let release!: () => void; const wait = new Promise<void>(r => { release = r; });
    const runtime = physics(() => 0x00ffffff, () => wait), sent: WorldPosition[] = [];
    const loading = runtime.load(map, spawn), nav = new WorldNavigator({ send: p => sent.push(p), physics: runtime }); nav.reset(map, spawn);
    expect(nav.moveTo({ x: 180, y: 64 })).toBe(true); await tick(nav, 30);
    expect(nav.position).toEqual(spawn); expect(nav.waiting).toBe(true); expect(nav.moving).toBe(true); expect(nav.walking).toBe(false); expect(sent).toHaveLength(0);
    release(); await loading; await tick(nav, 100);
    expect(nav.position?.x).toBe(180); expect(nav.moving).toBe(false); expect(nav.waiting).toBe(false); nav.dispose(); runtime.dispose();
  });
  it('lets pixel walls govern movement even when the coarse source grid suggests a route', async () => {
    const runtime = physics(x => x >= 130 ? BLACK_HIT_PIXEL : 0x00ffffff), sent: WorldPosition[] = [];
    const grid = validateGrid({ width: 25, height: 25, rows: Array<string>(25).fill('1'.repeat(25)) });
    const coarse = { ...map, width: 500, height: 500, grid }; await runtime.load(coarse, spawn);
    const nav = new WorldNavigator({ send: p => sent.push(p), physics: runtime }); nav.reset(coarse, spawn); nav.moveTo({ x: 300, y: 64 }); await tick(nav, 120);
    expect(nav.position!.x).toBeLessThan(110); expect(nav.moving).toBe(true); expect(nav.waiting).toBe(false); expect(nav.walking).toBe(false);
    expect(sent.every(p => runtime.canPublish(p))).toBe(true); nav.cancel(); nav.dispose(); runtime.dispose();
  });
  it('can approach native pixels when a missing/coarse blocked grid cannot find a route', async () => {
    const runtime = physics(), grid = validateGrid({ width: 25, height: 25, rows: Array<string>(25).fill('0'.repeat(25)) });
    const coarse = { ...map, width: 500, height: 500, grid }; await runtime.load(coarse, spawn);
    const nav = new WorldNavigator({ send() {}, physics: runtime }); nav.reset(coarse, spawn);
    expect(nav.moveTo({ x: 180, y: 64 })).toBe(true); await tick(nav, 100); expect(nav.position?.x).toBe(180); nav.dispose(); runtime.dispose();
  });
  it('cancels the route before reporting a verified exit and survives a reset inside that callback', async () => {
    const runtime = physics(x => x >= 94 && x <= 99 ? EXIT_HIT_PIXELS[0] : 0x00ffffff); await runtime.load(map, spawn);
    const exits: number[] = [], sent: WorldPosition[] = [];
    const nav = new WorldNavigator({ send: p => sent.push(p), physics: runtime, onExit(exit, p) {
      expect(nav.moving).toBe(false); expect(p).toEqual(nav.position); exits.push(exit.destination);
      nav.reset({ ...map, id: 1 }, spawn);
    } });
    nav.reset(map, spawn); nav.moveTo({ x: 300, y: 64 }); await tick(nav, 100);
    expect(exits).toEqual([1]); expect(nav.position).toEqual(spawn); expect(nav.moving).toBe(false);
    const count = sent.length; await tick(nav, 100); expect(sent).toHaveLength(count); nav.dispose(); runtime.dispose();
  });
  it('resets or disposes during send without continuing a stale route or sending another position', async () => {
    const runtime = physics(); await runtime.load(map, spawn); let count = 0;
    const nav = new WorldNavigator({ physics: runtime, send() { count++; nav.reset(map, spawn); } });
    nav.reset(map, spawn); nav.moveTo({ x: 280, y: 64 }); await tick(nav, 50);
    expect(count).toBe(1); expect(nav.position).toEqual(spawn); expect(nav.moving).toBe(false);
    nav.dispose(); await tick(nav, 100); expect(count).toBe(1); runtime.dispose();
  });
  it('walks toward an out-of-scene target (to the edge), rejects a non-number one, and bounds background-frame travel with physics enabled', async () => {
    const runtime = physics(); await runtime.load(map, spawn);
    const nav = new WorldNavigator({ send() {}, physics: runtime }); nav.reset(map, spawn);
    expect(nav.moveTo({ x: 600, y: 64 })).toBe(true); expect(nav.moveTo({ x: NaN, y: 64 })).toBe(false);
    nav.moveTo({ x: 480, y: 64 }); nav.update(1e9); expect(nav.position!.x).toBeLessThan(110);
    nav.dispose(); runtime.dispose();
  });
});
