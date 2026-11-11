// The scene-load veil (src/ui/htmlui/scene-loading.ts), as main's loader.js after f5e4ee6: the ring is CSS keyframes the
// compositor runs (not a canvas drawn per frame, which froze while the main thread was busy), the veil stands over every
// other layer, and the menu bar's Wardrobe / Missions launchers wait under it and come back as it starts to fade.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@htmlui/cosmetics/wardrobe-launcher.js', () => ({ wardrobeLauncherFrame: wardrobe }));
vi.mock('@htmlui/rewards/launcher.js', () => ({ missionsLauncherFrame: vi.fn() }));
vi.mock('@htmlui/cosmetics/trade-cosmetics.js', () => ({ tradeOverlayFrame: vi.fn() }));
vi.mock('@htmlui/rewards/api.js', () => ({ getView: vi.fn(async () => ({})), peekView: () => null }));
const { wardrobe } = vi.hoisted(() => ({ wardrobe: vi.fn() }));
import { RING_AT, ringLayers, sceneVeilUp, VEIL_Z } from '../src/ui/htmlui/scene-loading';
import { pageModules } from '../src/ui/htmlui/page-modules';
import { IDENTITY, NO_COLOR, type SwfMovie } from '../src/duel/swf-text';

const movie = (): SwfMovie => ({
  files: ['ring_0_?.png', 'ring_1_?.png'], frameRate: 30, frameCount: 3, bitmaps: new Map([[10, 0], [11, 1]]),
  characters: new Map([[1, { kind: 'shape', bitmap: 10, fill: IDENTITY, bounds: [0, 0, 9600, 9600] }], [2, { kind: 'shape', bitmap: 11, fill: IDENTITY, bounds: [0, 0, 9600, 9600] }]]),
  timeline: { labels: {}, frames: [
    [{ op: 'place', depth: 1, move: false, character: 1, matrix: { ...IDENTITY, tx: 200 } }],
    [{ op: 'place', depth: 1, move: true, matrix: { a: 0, b: 1, c: -1, d: 0, tx: 400, ty: 0 } }, { op: 'place', depth: 2, move: false, character: 2, matrix: IDENTITY, color: { mult: [1, 1, 1, 0.5], add: [0, 0, 0, 0] } }],
    [{ op: 'remove', depth: 2 }],
  ] },
});

describe('scene-load veil', () => {
  it('turns the ring movie into one keyframes list per bitmap layer, at the loader\'s place and 30 fps', () => {
    const { layers, seconds } = ringLayers(movie());
    expect(seconds).toBeCloseTo(0.1);
    expect(layers.map(l => l.bitmap)).toEqual([0, 1]);
    const [ring, glow] = layers;
    expect(ring!.keyframes).toHaveLength(4);   // 3 frames + the last again at 100 %
    expect(ring!.keyframes[0]).toBe(`0%{transform:matrix(0.05,0,0,0.05,${RING_AT.x + 10},${+RING_AT.y.toFixed(4)});opacity:1}`);
    expect(ring!.keyframes[1]).toContain(`matrix(0,0.05,-0.05,0,${RING_AT.x + 20},`);
    expect(ring!.keyframes[3]!.startsWith('100%{')).toBe(true);
    // the second layer: transparent before it is placed and after it is removed, its own alpha between
    expect(glow!.keyframes[0]).toBe('0%{opacity:0}');
    expect(glow!.keyframes[1]).toMatch(/opacity:0\.5}$/);
    expect(glow!.keyframes[2]).toBe('66.667%{opacity:0}');
    void NO_COLOR;
  });
  it('stands over the HTML layer (45), the starter (46) and the launchers (2147480000), under the cursor and the turn-sideways prompt', () => {
    expect(VEIL_Z).toBeGreaterThan(2147480000);
    expect(VEIL_Z).toBeLessThan(2147483000);
    expect(sceneVeilUp()).toBe(false);
  });
  it('keeps the Wardrobe launcher down while the veil is up, and brings it back on the next frame after', async () => {
    let veil = true;
    const mods = pageModules({ online: () => true, overworld: () => true, trade: () => false, veil: () => veil });
    const snap = { v: 1, frame: 1, scene: 0, mouse: null, focus: 0, windows: [], tasks: [], cursor: null } as never;
    mods.frame(snap); await new Promise(r => setTimeout(r, 50));
    mods.frame(snap);
    expect(wardrobe).toHaveBeenLastCalledWith(snap, true);
    veil = false; mods.frame(snap);
    expect(wardrobe).toHaveBeenLastCalledWith(snap, false);
    mods.dispose();
  });
});
