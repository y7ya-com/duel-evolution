import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { WorldRenderer } from '../src/ui/world';
import type { RenderScene, WorldHost, WorldTexture, WorldRendererOptions } from '../src/ui/world';
import type { PoseStrip } from '../src/ui/world-avatars';
import type { SceneFrame, SceneSprite } from '../src/world/scene';
import type { Viewport } from '../src/world/camera';
import type { LobbyAvatar } from '../src/ui/contracts';
import type { AvatarLoadOptions, AvatarResource } from '../src/avatars';
import { TestDocument, TestNode } from './ui-dom-fixture';

const disposals: (() => void)[] = [];
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); vi.unstubAllGlobals(); });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const sprite = (path: string, x = 0): SceneSprite => ({ path, x, y: 0, width: 200, height: 150, url: `blob:http://localhost/${path}` });
/** A texture the size of its picture, its release counted. */
function textures() {
  const released: string[] = [], loaded: string[] = [];
  const load = vi.fn(async (url: string): Promise<WorldTexture> => { loaded.push(url); const texture = new Texture({ source: new TextureSource({ width: 200, height: 150 }) }); return { texture, release: () => released.push(url) }; });
  return { load, released, loaded };
}
function fakeHost() {
  const stage = new Container(), ticks: ((dt: number) => void)[] = [], destroy = vi.fn();
  const host: WorldHost = { stage, add: t => ticks.push(t), destroy };
  return { host, stage, run: (dt = 1000 / 60, n = 1) => { for (let i = 0; i < n; i++) for (const t of ticks) t(dt); }, destroy };
}
function setup(options: Partial<WorldRendererOptions> & Pick<WorldRendererOptions, 'loadScene'>, now = { t: 0 }) {
  const document = new TestDocument(); vi.stubGlobal('document', document); const parent = document.createElement('div');
  const tex = textures(), host = fakeHost();
  const view = new WorldRenderer({ loadTexture: tex.load, createHost: async () => host.host, now: () => now.t, ...options }); parent.append(view.element as unknown as TestNode); disposals.push(() => view.dispose());
  return { view, parent, tex, host, now };
}
function scene(mapId = 0, size = { width: 4096, height: 3072 }) {
  const frames: { viewport: Viewport; signal?: AbortSignal; request: ReturnType<typeof deferred<SceneFrame>> }[] = [];
  const dispose = vi.fn(); const result: RenderScene = { mapId, definition: size as RenderScene['definition'], dispose,
    frame: (viewport, signal) => { const request = deferred<SceneFrame>(); frames.push({ viewport, signal, request }); return request.promise; } };
  const reply = (index: number, tiles: SceneSprite[] = [sprite(`tile${mapId}-${index}`)], objects: SceneSprite[] = [], frontObjects: SceneSprite[] = []) => {
    const release = vi.fn(); const frame: SceneFrame = { mapId, viewport: frames[index].viewport, tiles, objects, frontObjects, npcSpots: [], release };
    frames[index].request.resolve(frame); return { frame, release };
  };
  return { result, frames, dispose, reply };
}
const look = Uint8Array.from({ length: 16 }, (_, i) => i % 3);
const actor = (id: number, x: number, y: number, extra: Partial<LobbyAvatar> = {}): LobbyAvatar => ({ id, name: `P${id}`, x, y, parts: look, direction: 0, motion: 'stand', world: 0, ...extra });
/** A baked strip without a canvas: `frames` textures at `fps`, its release counted. */
function bakes(frames = 4, fps = 12) {
  const made: string[] = [], released: string[] = [];
  const bake = (key: string, resource: AvatarResource): PoseStrip => { made.push(key); void resource; return { key, fps, frames: Array.from({ length: key.includes('/walk/') ? frames : 1 }, () => new Texture({ source: new TextureSource({ width: 128, height: 160 }) })), release: () => released.push(key) }; };
  const loadAvatar = vi.fn(async (_parts?: Uint8Array, _options?: unknown) => ({ dispose: vi.fn() } as unknown as AvatarResource));
  return { bake, loadAvatar, made, released };
}

describe('the PixiJS world renderer', () => {
  it('mounts on the host stage, clips natural-sized tiles, and places the world at -camera', async () => {
    const source = scene(), f = setup({ loadScene: async () => source.result });
    f.view.show(0, { x: 1500, y: 1000 }); await flush();
    expect(f.host.stage.children).toContain(f.view.root);
    source.reply(0, [{ ...sprite('tile', 1000), clipWidth: 100, clipHeight: 80 }], [sprite('object')], [sprite('front')]); await flush();
    expect(f.view.ready).toBe(true); expect(f.view.element.dataset.mapReady).toBe('true'); expect(f.view.element.dataset.sceneImages).toBe('3');
    expect(f.view.world.children).toEqual([f.view.tiles, f.view.sorted]);
    const tile = f.view.tiles.children[0] as Sprite; expect(tile.texture.frame.width).toBe(100); expect(tile.texture.frame.height).toBe(80); expect(tile.x).toBe(1000);
    expect(f.view.worldToScreen({ x: 1500, y: 1000 })).toEqual({ x: 512, y: 384 });
    expect(f.view.screenToWorld({ x: 512, y: 384 })).toEqual({ x: 1500, y: 1000 });
    expect(f.view.world.position.x).toBe(-988); expect(f.view.world.position.y).toBe(-616);
    // nothing drawn as DOM: the element holds the hit targets' layer and the status line only
    expect((f.view.element as unknown as TestNode).querySelectorAll('img')).toHaveLength(0);
  });
  it('keeps the camera dead zone: no scroll inside the margins, the overshoot past them', async () => {
    const source = scene(), f = setup({ loadScene: async () => source.result });
    f.view.show(0, { x: 1500, y: 1000 }); await flush(); source.reply(0); await flush();
    const start = f.view.viewport!;
    f.view.show(0, { x: 1500 + 200, y: 1000 }); expect(f.view.viewport).toEqual(start);
    f.view.show(0, { x: 1500 + 230, y: 1000 }); expect(f.view.viewport!.x).toBe(start.x + 18);   // 512 + 230 - (1024 - 300)
    expect(f.view.world.position.x).toBe(-(start.x + 18));
    f.view.show(0, { x: 1730, y: 1000 + 34 + 1 }); expect(f.view.viewport!.y).toBe(start.y + 1);    // bottom margin 350
  });
  it('z-sorts objects with avatars as the original: objects at bottom * 10, avatars at feet * 10, front objects at 30724', async () => {
    const source = scene(), f = setup({ loadScene: async () => source.result });
    f.view.show(0, { x: 1500, y: 1000 }); await flush();
    source.reply(0, undefined, [{ ...sprite('panel'), y: 570, height: 128 }, { ...sprite('back'), y: 473, height: 128 }], [sprite('front')]); await flush();
    f.view.setAvatars([actor(1, 600, 650, { self: true }), actor(2, 620, 700)]); f.host.run();
    const order = f.view.sorted.children.map(c => c.label);
    expect(f.view.sorted.children.map(c => c.zIndex)).toEqual([...f.view.sorted.children.map(c => c.zIndex)].sort((a, b) => a - b));
    // back (6010) < avatar 1 (6500) < panel (6980) < avatar 2 (7000) < front (30724)
    expect(order).toEqual(['back', 'avatar:1', 'panel', 'avatar:2', 'front']);
    expect(f.view.front.zIndex).toBe(30724); expect(f.view.front.children.map(c => c.label)).toEqual(['front']);
    // walking below the panel's bottom edge puts the avatar in front of it (z follows the feet each frame)
    f.view.setAvatars([actor(1, 600, 699, { self: true }), actor(2, 620, 700)]); f.host.run();
    expect(f.view.sorted.children.map(c => c.label)).toEqual(['back', 'panel', 'avatar:1', 'avatar:2', 'front']);
  });
  it('reuses textures across movement frames, keeps old art until the replacement loads, releases the unused', async () => {
    const source = scene(), f = setup({ loadScene: async () => source.result });
    f.view.show(0, { x: 512, y: 384 }); await flush(); const first = source.reply(0, [sprite('a'), sprite('b')]); await flush();
    for (let i = 0; i < 100; i++) f.view.show(0, { x: 520 + i / 10, y: 384 });
    expect(source.frames).toHaveLength(1);
    const gate = deferred<WorldTexture>(); f.tex.load.mockImplementationOnce(() => gate.promise);
    f.view.show(0, { x: 1800, y: 1000 }); await flush(); source.reply(1, [sprite('b'), sprite('c')]); await flush();
    expect(source.frames).toHaveLength(2); expect(first.release).not.toHaveBeenCalled(); expect(f.view.tiles.children.map(c => c.label)).toEqual(['a', 'b']);
    gate.resolve({ texture: new Texture({ source: new TextureSource({ width: 200, height: 150 }) }), release: () => f.tex.released.push('blob:http://localhost/c') }); await flush();
    expect(first.release).toHaveBeenCalledOnce(); expect(f.view.tiles.children.map(c => c.label)).toEqual(['b', 'c']);
    expect(f.tex.loaded.filter(u => u.endsWith('/b'))).toHaveLength(1);             // b decoded once, shared
    expect(f.tex.released).toEqual(['blob:http://localhost/a']);
  });
  it('a map change or leaving releases every lease, texture and pose strip; late metadata is dropped', async () => {
    const source = scene(), late = deferred<RenderScene>(), load = vi.fn((id: number) => id === 0 ? Promise.resolve(source.result) : late.promise), b = bakes();
    const f = setup({ loadScene: load, loadAvatar: b.loadAvatar, bake: b.bake });
    f.view.show(0, { x: 512, y: 384 }); await flush(); const first = source.reply(0, [sprite('a'), sprite('b')]); await flush();
    f.view.setAvatars([actor(1, 512, 384, { self: true })]); await flush(); expect(b.made).toHaveLength(2);   // standing and its blink
    f.view.show(1, { x: 512, y: 384 });
    expect(first.release).toHaveBeenCalledOnce(); expect(f.tex.released.sort()).toEqual(['blob:http://localhost/a', 'blob:http://localhost/b']); expect(b.released).toEqual(b.made);
    expect(f.view.tiles.children).toHaveLength(0); expect(f.view.actors.size).toBe(0);
    f.view.hide(); expect(source.dispose).toHaveBeenCalledOnce();
    const obsolete = scene(1); late.resolve(obsolete.result); await flush(); expect(obsolete.dispose).toHaveBeenCalledOnce(); expect(obsolete.frames).toHaveLength(0);
  });
  it('bounds decode concurrency to four and frees a canceled pending frame', async () => {
    const source = scene(), gates: ReturnType<typeof deferred<WorldTexture>>[] = [];
    const f = setup({ loadScene: async () => source.result, loadTexture: () => { const gate = deferred<WorldTexture>(); gates.push(gate); return gate.promise; } });
    f.view.show(0, { x: 512, y: 384 }); await flush(); const pending = source.reply(0, Array.from({ length: 20 }, (_, i) => sprite(`many${i}`))); await flush();
    expect(gates).toHaveLength(4); f.view.hide();
    const released: number[] = []; gates.forEach((gate, i) => gate.resolve({ texture: Texture.EMPTY, release: () => released.push(i) })); await flush();
    expect(pending.release).toHaveBeenCalledOnce(); expect(released).toHaveLength(4); expect(source.dispose).toHaveBeenCalledOnce();
  });
  it('does not retry failed art on every movement tick', async () => {
    const source = scene(), f = setup({ loadScene: async () => source.result, loadTexture: async () => { throw new Error('decode'); } });
    f.view.show(0, { x: 512, y: 384 }); await flush(); const failed = source.reply(0); await flush();
    for (let i = 0; i < 30; i++) f.view.show(0, { x: 512, y: 384 });
    expect(source.frames).toHaveLength(1); expect(f.view.ready).toBe(false); expect(failed.release).toHaveBeenCalledOnce(); expect(f.parent.textContent).toContain('Retry Map');
  });
  it('animates the walk cycle by swapping strip frames, one load per pose shared by every avatar wearing it', async () => {
    const source = scene(), b = bakes(4, 12), now = { t: 0 }, f = setup({ loadScene: async () => source.result, loadAvatar: b.loadAvatar, bake: b.bake }, now);
    f.view.show(0, { x: 512, y: 384 }); await flush(); source.reply(0); await flush();
    f.view.setAvatars([actor(1, 512, 384, { self: true, motion: 'walk', direction: 6 }), actor(2, 600, 384, { motion: 'stand' })]);
    const self = f.view.actors.get(1)!; expect(self.placeholder.visible).toBe(true); expect(self.body.visible).toBe(false);
    await flush(); expect(self.body.visible).toBe(true); expect(self.placeholder.visible).toBe(false);
    // a standing chibi also takes its blink (cm_t, CChibiAvatarElm's idle motion), a walking one does not
    expect(b.made).toEqual([`0/walk/6/${look.join(',')}`, `0/stand/0/${look.join(',')}`, `0/blink/0/${look.join(',')}`]);
    expect(b.loadAvatar.mock.calls.at(-1)?.[1]).toMatchObject({ motion: 'turn', direction: 0 });
    expect(f.view.actors.get(2)!.blink?.key).toBe(`0/blink/0/${look.join(',')}`);
    const strip = self.strip!; expect(strip.frames).toHaveLength(4);
    const seen = new Set<number>(); for (let i = 0; i < 24; i++) { now.t += 1000 / 60; f.host.run(); seen.add(self.frame); expect(self.body.texture).toBe(strip.frames[self.frame]); }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);             // 12 fps over 400 ms: every frame of the cycle
    // a third avatar in the same look and pose takes the same strip: no new load
    f.view.setAvatars([actor(1, 512, 384, { self: true, motion: 'walk', direction: 6 }), actor(2, 600, 384), actor(3, 650, 384)]); await flush();
    expect(b.loadAvatar).toHaveBeenCalledTimes(3);   // walk, stand and its blink expect(f.view.actors.get(3)!.strip).toBe(f.view.actors.get(2)!.strip);
  });
  it('walks the other players to each server position at the original pace, turning as they go', async () => {
    const source = scene(), b = bakes(), now = { t: 0 }, f = setup({ loadScene: async () => source.result, loadAvatar: b.loadAvatar, bake: b.bake }, now);
    f.view.show(0, { x: 512, y: 384 }); await flush(); source.reply(0); await flush();
    f.view.setAvatars([actor(1, 512, 384, { self: true }), actor(2, 300, 300, { direction: 0 })]); await flush();
    f.view.setAvatars([actor(1, 512, 384, { self: true }), actor(2, 330, 300, { direction: 2 })]);
    const shown = () => f.view.inspect().avatars.find(a => a.id === 2)!;
    f.host.run(1000 / 30); expect(shown()).toMatchObject({ x: 300, y: 300, walking: true, direction: 6 });   // under way, facing right (drawn a frame behind)
    await flush(); expect(f.view.actors.get(2)!.wanted).toContain('/walk/6/');
    // the chibi's eased steps (0, 0, 1.63, 2.07, 2.46 ... px a 30 fps frame), drawn between frames
    f.host.run(1000 / 30, 3); expect(shown().x).toBeCloseTo(301.626, 2);
    f.host.run(1000 / 60); expect(shown().x).toBeCloseTo(301.626 + 2.0638 / 2, 2);
    f.host.run(1000 / 30, 12); expect(shown()).toMatchObject({ x: 330, walking: false, direction: 2 });   // arrived: the server's facing
    // a far jump (a teleport) snaps
    f.view.setAvatars([actor(1, 512, 384, { self: true }), actor(2, 1300, 900)]); expect(shown()).toMatchObject({ x: 1300, y: 900 });
    // self is the runtime's: never smoothed
    f.view.setAvatars([actor(1, 540, 390, { self: true, motion: 'walk', direction: 7 }), actor(2, 1300, 900)]);
    expect(f.view.inspect().avatars.find(a => a.id === 1)).toMatchObject({ x: 540, y: 390, walking: true, direction: 7 });
  });
  it('writes the DOM hit targets every sixth frame and only when they moved; chat anchors stand over the heads', async () => {
    const source = scene(), b = bakes(), f = setup({ loadScene: async () => source.result, loadAvatar: b.loadAvatar, bake: b.bake });
    f.view.show(0, { x: 512, y: 384 }); await flush(); source.reply(0); await flush();
    const doc = (globalThis as unknown as { document: TestDocument }).document, button = doc.createElement('button'); button.className = 'de-avatar';
    f.view.setAvatars([actor(1, 512, 384, { self: true })]); f.view.bindHits(new Map([[1, button as unknown as HTMLElement]])); await flush();
    expect(button.style.left).toBe('50%'); expect(button.style.top).toBe('50%');
    let writes = 0; const style = button.style; button.style = new Proxy(style, { set(t, k, v) { writes++; (t as Record<string, string>)[k as string] = v; return true; } });
    f.host.run(1000 / 60, 12); expect(writes).toBeLessThanOrEqual(1);   // has-original toggles once at most; no position writes
    f.view.setAvatars([actor(1, 600, 384, { self: true })]); f.host.run(1000 / 60, 5); expect(style.left).toBe('50%');
    f.host.run(); expect(style.left).toBe(`${600 / 1024 * 100}%`); expect(button.className).toContain('has-original');
    expect(f.view.chatAnchors()).toEqual([{ id: 1, x: 600, y: 384 - 144 }]);
  });
  it('draws a famous NPC with its own art (its cn_ set), blinks it on the idle counter, and places its level stars', async () => {
    const source = scene(), now = { t: 0 }, made: string[] = [], loads: AvatarLoadOptions[] = [];
    const bake = (key: string): PoseStrip => { made.push(key); return { key, fps: 30, frames: Array.from({ length: key.includes('/blink/') ? 12 : 1 }, () => new Texture({ source: new TextureSource({ width: 128, height: 160 }) })), release: () => {} }; };
    const loadAvatar = vi.fn(async (_parts: Uint8Array, options: AvatarLoadOptions) => { loads.push(options); return { dispose: vi.fn() } as unknown as AvatarResource; });
    const star = (w: number): WorldTexture => ({ texture: new Texture({ source: new TextureSource({ width: w, height: w }) }), release: vi.fn() });
    const f = setup({ loadScene: async () => source.result, loadAvatar, bake, random: () => 0, loadStarArt: async () => ({ big: star(16), small: star(8) }) }, now);
    f.view.show(0, { x: 512, y: 384 }); await flush(); source.reply(0); await flush();
    const alexis = actor(-66, 600, 400, { name: 'Alexis Rhodes', npc: true, parts: new Uint8Array(16), npcArt: 'a03', stars: { big: 1, small: 2 }, direction: 2 });
    f.view.setAvatars([actor(1, 512, 384, { self: true }), alexis]); await flush(); f.view.setAvatars([actor(1, 512, 384, { self: true }), alexis]); await flush();
    expect(made).toContain('npc/a03/stand/2'); expect(made).toContain('npc/a03/blink/2');
    expect(loads.filter(o => o.npc)).toEqual([expect.objectContaining({ npc: { set: 'a03' }, direction: 2 }), expect.objectContaining({ npc: { set: 'a03', blink: true }, direction: 2 })]);
    const npc = f.view.actors.get(-66)!, shown = () => f.view.inspect().avatars.find(a => a.id === -66)!;
    expect(shown()).toMatchObject({ drawn: true, look: 'npc/a03/stand/2', blink: 'npc/a03/blink/2', blinking: false, stars: '1/2' });
    // the stars: one 16 px then two 8 px, the row at (-25, -114) from the feet
    expect(npc.stars.visible).toBe(true); expect(npc.stars.position.x).toBe(-25); expect(npc.stars.position.y).toBe(-114);
    expect(npc.stars.children.map(c => [c.x, c.y, (c as Sprite).texture.width])).toEqual([[0, 0, 16], [16, 0, 8], [24, 0, 8]]);
    // the first blink after rand() % 30 + 60 frames (2 s here), 12 frames at 30 fps, then standing again
    const stand = npc.strip!.frames[0];
    now.t = 1990; f.host.run(); expect(npc.body.texture).toBe(stand); expect(shown().blinking).toBe(false);
    now.t = 2001; f.host.run(); expect(shown().blinking).toBe(true); expect(npc.body.texture).toBe(npc.blink!.frames[0]);
    now.t = 2001 + 200; f.host.run(); expect(npc.body.texture).toBe(npc.blink!.frames[6]);
    now.t = 2001 + 401; f.host.run(); expect(shown().blinking).toBe(false); expect(npc.body.texture).toBe(stand);
    now.t = 2001 + 401 + 1990; f.host.run(); expect(shown().blinking).toBe(false);   // next one after rand() % 60 + 60 frames
    now.t = 2001 + 401 + 2010; f.host.run(); expect(shown().blinking).toBe(true);
  });
  it('a missing NPC art file never leaves the NPC unseen: the default look stands in, with a warning', async () => {
    const source = scene(), b = bakes(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loadAvatar = vi.fn(async (_parts: Uint8Array, options: AvatarLoadOptions) => { if (options.npc) throw new Error('Asset not found: data/avatar/chibi/cn_a03_bo_n03_01.png'); return { dispose: vi.fn() } as unknown as AvatarResource; });
    const f = setup({ loadScene: async () => source.result, loadAvatar, bake: b.bake });
    f.view.show(0, { x: 512, y: 384 }); await flush(); source.reply(0); await flush();
    const alexis = actor(-66, 600, 400, { name: 'Alexis Rhodes', npc: true, parts: new Uint8Array(16), npcArt: 'a03', direction: 2, world: 1 });
    f.view.setAvatars([alexis]); await flush(); await flush();
    const shown = f.view.inspect().avatars[0]!;
    expect(shown.drawn).toBe(true); expect(shown.look).toBe(`1/stand/2/${[0, 0, 0x20, 0x30, 0x40, 0x60, 0x80, 0x90, 0xb8, 0x20, 0, 0, 0, 0, 0, 0].join(',')}`);
    expect(f.view.actors.get(-66)!.placeholder.visible).toBe(false);
    expect(warn.mock.calls.map(c => String(c[0]))).toEqual(expect.arrayContaining(['avatar art', 'npc art: drawing']));
    // a player whose art fails keeps the placeholder (no default look stands in for a person's own)
    loadAvatar.mockImplementation(async () => { throw new Error('missing'); }); f.view.setAvatars([alexis, actor(5, 640, 400, { parts: new Uint8Array(16) })]); await flush();
    expect(f.view.inspect().avatars.find(a => a.id === 5)!.drawn).toBe(false);
    warn.mockRestore();
  });
});
