import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldRenderer } from '../src/ui/world';
import type { RenderScene } from '../src/ui/world';
import type { SceneFrame, SceneSprite } from '../src/world/scene';
import type { Viewport } from '../src/world/camera';
import { TestDocument, TestNode } from './ui-dom-fixture';

const disposals: (() => void)[] = [];
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); vi.unstubAllGlobals(); });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const sprite = (path: string, x = 0): SceneSprite => ({ path, x, y: 0, width: 200, height: 150, url: `blob:http://localhost/${path}` });
function setup(options: ConstructorParameters<typeof WorldRenderer>[0]) {
  const document = new TestDocument(); vi.stubGlobal('document', document); const parent = document.createElement('div');
  const view = new WorldRenderer(options); parent.append(view.element as unknown as TestNode); disposals.push(() => view.dispose());
  return { view, parent, images: () => parent.querySelectorAll('img') as unknown as HTMLImageElement[] };
}
function scene(mapId = 0) {
  const frames: { viewport: Viewport; signal?: AbortSignal; request: ReturnType<typeof deferred<SceneFrame>> }[] = [];
  const dispose = vi.fn(); const result: RenderScene = { mapId, definition: { width: 4096, height: 3072 } as RenderScene['definition'], dispose,
    frame: (viewport, signal) => { const request = deferred<SceneFrame>(); frames.push({ viewport, signal, request }); return request.promise; } };
  const reply = (index: number, tiles: SceneSprite[] = [sprite(`tile${mapId}-${index}`)], objects: SceneSprite[] = [], frontObjects: SceneSprite[] = []) => {
    const release = vi.fn(); const frame: SceneFrame = { mapId, viewport: frames[index].viewport, tiles, objects, frontObjects, npcSpots: [], release };
    frames[index].request.resolve(frame); return { frame, release };
  };
  return { result, frames, dispose, reply };
}
describe('leased original map renderer', () => {
  it('clips natural-sized tiles, preserves layer order, and maps camera coordinates', async () => {
    const source = scene(), f = setup({ loadScene: async () => source.result, decodeImage: async () => {} });
    f.view.show(0, { x: 1500, y: 1000 }); await flush();
    source.reply(0, [{ ...sprite('tile', 1000), clipWidth: 100, clipHeight: 80 }], [sprite('object')], [sprite('front')]); await flush();
    expect(f.view.ready).toBe(true); expect(f.view.element.dataset.mapReady).toBe('true');
    const children = (f.view.element as unknown as TestNode).childNodes;
    expect(children.slice(0, 4).map(n => n.dataset.layer)).toEqual(['background', 'objects', 'avatars', 'front']);
    const tile = children[0].childNodes[0]; expect(tile.style.width).toBe(`${100 / 1024 * 100}%`); expect(tile.childNodes[0].style.width).toBe('200%');
    expect(f.view.worldToScreen({ x: 1500, y: 1000 })).toEqual({ x: 512, y: 384 });
    expect(f.view.screenToWorld({ x: 512, y: 384 })).toEqual({ x: 1500, y: 1000 });
  });
  it('z-sorts objects with avatars as the original: each object keyed by its bottom edge * 10, front objects at 30724', async () => {
    const source = scene(), f = setup({ loadScene: async () => source.result, decodeImage: async () => {} });
    f.view.show(0, { x: 1500, y: 1000 }); await flush();
    source.reply(0, undefined, [{ ...sprite('panel'), y: 570, height: 128 }, { ...sprite('back'), y: 473, height: 128 }], [sprite('front')]); await flush();
    const children = (f.view.element as unknown as TestNode).childNodes;
    expect(children[1].childNodes.map(n => n.style.zIndex)).toEqual(['6980', '6010']);
    expect(children[3].style.zIndex).toBe('30724'); expect(children[0].style.zIndex ?? '').toBe(''); expect(children[2].style.zIndex ?? '').toBe('');
  });
  it('deduplicates movement frames and retains old art until the replacement decodes', async () => {
    const source = scene(), decoding = deferred<void>(); let hold = false;
    const f = setup({ loadScene: async () => source.result, decodeImage: () => hold ? decoding.promise : Promise.resolve() });
    f.view.show(0, { x: 512, y: 384 }); await flush(); const first = source.reply(0); await flush(); const old = f.images()[0];
    for (let i = 0; i < 100; i++) f.view.show(0, { x: 520 + i / 10, y: 384 });
    expect(source.frames).toHaveLength(1);
    hold = true; f.view.show(0, { x: 1800, y: 1000 }); await flush(); source.reply(1); await flush();
    for (let i = 0; i < 100; i++) f.view.show(0, { x: 1800 + i / 10, y: 1000 });
    expect(source.frames).toHaveLength(2); expect(f.images()).toContain(old); expect(first.release).not.toHaveBeenCalled();
    decoding.resolve(); await flush(); expect(first.release).toHaveBeenCalledOnce(); expect(old.src).toBe(''); expect(f.images()).not.toContain(old);
  });
  it('detaches URL uses before releasing a displayed frame and ignores late metadata', async () => {
    const source = scene(), late = deferred<RenderScene>(), load = vi.fn((id: number) => id === 0 ? Promise.resolve(source.result) : late.promise);
    const f = setup({ loadScene: load, decodeImage: async () => {} }); f.view.show(0, { x: 512, y: 384 }); await flush();
    const first = source.reply(0); await flush(); const image = f.images()[0];
    const removeAttribute = image.removeAttribute.bind(image); image.removeAttribute = name => { if (name === 'src') expect(f.parent.contains(image as unknown as TestNode)).toBe(true); removeAttribute(name); };
    first.release.mockImplementation(() => { expect(image.src).toBe(''); expect((image as unknown as TestNode).parentNode).toBeNull(); });
    f.view.show(1, { x: 512, y: 384 }); f.view.hide(); expect(first.release).toHaveBeenCalledOnce(); expect(source.dispose).toHaveBeenCalledOnce();
    const obsolete = scene(1); late.resolve(obsolete.result); await flush(); expect(obsolete.dispose).toHaveBeenCalledOnce(); expect(obsolete.frames).toHaveLength(0); expect(f.images()).toHaveLength(0);
  });
  it('bounds decode concurrency and frees a canceled pending frame', async () => {
    const source = scene(), gates: ReturnType<typeof deferred<void>>[] = [];
    const f = setup({ loadScene: async () => source.result, decodeImage: () => { const gate = deferred<void>(); gates.push(gate); return gate.promise; } });
    f.view.show(0, { x: 512, y: 384 }); await flush(); const pending = source.reply(0, Array.from({ length: 20 }, (_, i) => sprite(`many${i}`))); await flush();
    for (const image of f.images()) { const removeAttribute = image.removeAttribute.bind(image); image.removeAttribute = name => { if (name === 'src') expect(f.parent.contains(image as unknown as TestNode)).toBe(true); removeAttribute(name); }; }
    expect(gates).toHaveLength(4); f.view.hide(); for (const gate of gates) gate.resolve(); await flush();
    expect(pending.release).toHaveBeenCalledOnce(); expect(f.images()).toHaveLength(0); expect(source.dispose).toHaveBeenCalledOnce();
  });
  it('does not retry failed art on every movement tick', async () => {
    const source = scene(), f = setup({ loadScene: async () => source.result, decodeImage: async () => { throw new Error('decode'); } });
    f.view.show(0, { x: 512, y: 384 }); await flush(); const failed = source.reply(0); await flush();
    for (let i = 0; i < 30; i++) f.view.show(0, { x: 512, y: 384 });
    expect(source.frames).toHaveLength(1); expect(f.view.ready).toBe(false); expect(failed.release).toHaveBeenCalledOnce(); expect(f.parent.textContent).toContain('Retry Map');
  });
});
