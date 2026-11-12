import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvatarView } from '../src/ui/avatar';
import type { AvatarLoadOptions, AvatarResource } from '../src/avatars';
import { defaultAvatar } from '../src/avatars/appearance';
import { TestDocument } from './ui-dom-fixture';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture() {
  const document = new TestDocument(), contexts: any[] = []; let pictures = 0;
  const create = document.createElement.bind(document);
  document.createElement = tag => {
    const node = create(tag);
    if (tag === 'canvas') {
      const ctx = { clearRect: vi.fn(), drawImage: vi.fn() }; contexts.push(ctx);
      node.getContext = () => ctx as never;
      (node as unknown as { toDataURL(): string }).toDataURL = () => `data:image/png;base64,${++pictures}`;
    }
    return node;
  };
  vi.stubGlobal('document', document);
  const loads: { parts: Uint8Array; options: AvatarLoadOptions; resolve(resource: AvatarResource): void; reject(error: unknown): void }[] = [];
  const loadAvatar = vi.fn((parts: Uint8Array, options: AvatarLoadOptions) => new Promise<AvatarResource>((resolve, reject) => loads.push({ parts, options, resolve, reject })));
  let time = 0, serial = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestFrame = vi.fn((cb: FrameRequestCallback) => { callbacks.set(++serial, cb); return serial; });
  const cancelFrame = vi.fn((id: number) => { callbacks.delete(id); });
  const options = { loadAvatar, now: () => time, requestFrame, cancelFrame };
  const step = (ms: number) => { time = ms; const current = [...callbacks]; callbacks.clear(); for (const [, cb] of current) cb(ms); };
  return { document, contexts, loads, options, callbacks, step, loadAvatar, requestFrame, cancelFrame };
}
function resource(mirrored = false, frameCount = 20) {
  const draw = vi.fn(), dispose = vi.fn();
  return { draw, dispose, pose: { mirrored, offset: [-46, -116], foot: [40, 116] }, movie: { fps: 30, frameCount } } as unknown as AvatarResource & { draw: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('persistent layered avatar view', () => {
  it('paints source foot geometry at a fixed anchor in both mirror directions', async () => {
    const f = fixture(), view = new AvatarView(f.options), a = resource(), b = resource(true);
    view.show(defaultAvatar(), 0, 'stand', 0); f.loads[0].resolve(a); await flush();
    expect([view.element.width, view.element.height]).toEqual([128, 160]); expect(view.element.tagName).toBe('IMG');
    expect(f.contexts).toHaveLength(1); expect((view.element as unknown as { src: string }).src).toMatch(/^data:image\/png/);
    expect(a.draw).toHaveBeenCalledWith(f.contexts[0], { x: 70, y: 144, frame: 0 });
    expect(view.element.dataset.avatarReady).toBe('true'); expect(f.callbacks.size).toBe(0);
    view.show(defaultAvatar(), 0, 'stand', 5); f.loads[1].resolve(b); await flush();
    expect(b.draw).toHaveBeenCalledWith(f.contexts[0], { x: 58, y: 144, frame: 0 });
    expect(a.dispose).toHaveBeenCalledOnce(); expect(view.element.dataset.footY).toBe('144'); view.dispose();
  });
  it('retains the original world origin and its direction-dependent foot offset', async () => {
    const f = fixture(), view = new AvatarView({ ...f.options, sourceOrigin: true }), normal = resource(), mirrored = resource(true);
    view.show(defaultAvatar(), 0, 'stand', 0); f.loads[0].resolve(normal); await flush();
    expect(normal.draw).toHaveBeenCalledWith(f.contexts[0], { x: 64, y: 144, frame: 0 }); expect(64 + normal.pose.offset[0] + normal.pose.foot[0]).toBe(58);
    expect(view.element.dataset.footX).toBe('58');
    view.show(defaultAvatar(), 0, 'stand', 5); f.loads[1].resolve(mirrored); await flush();
    expect(mirrored.draw).toHaveBeenCalledWith(f.contexts[0], { x: 64, y: 144, frame: 0 }); expect(64 - mirrored.pose.offset[0] - mirrored.pose.foot[0]).toBe(70); expect(view.element.dataset.footX).toBe('70'); view.dispose();
  });
  it('snapshots appearances, avoids duplicate loads and coalesces arbitrary rapid updates into one latest request', async () => {
    const f = fixture(), view = new AvatarView(f.options), parts = defaultAvatar();
    const first = parts.slice(); view.show(parts, 0, 'walk', 0); parts[13] = 2;
    expect(f.loads[0].parts).toEqual(first);
    for (let i = 0; i < 100; i++) view.show(parts, 1, i % 2 ? 'walk' : 'stand', i % 8);
    expect(f.loadAvatar).toHaveBeenCalledOnce(); expect(f.loads[0].options.signal?.aborted).toBe(true);
    const stale = resource(); f.loads[0].resolve(stale); await flush();
    expect(stale.dispose).toHaveBeenCalledOnce(); expect(stale.draw).not.toHaveBeenCalled(); expect(f.loads).toHaveLength(2);
    expect(f.loads[1].options).toMatchObject({ world: 1, motion: 'walk', direction: 3 });
    const latest = resource(); f.loads[1].resolve(latest); await flush();
    view.show(parts, 1, 'walk', 3); expect(f.loads).toHaveLength(2); expect(view.element.dataset.avatarReady).toBe('true');
    view.dispose(); expect(latest.dispose).toHaveBeenCalledOnce();
  });
  it('holds the decoded old resource through failed replacements and releases it after a successful visible draw', async () => {
    const f = fixture(), view = new AvatarView(f.options), old = resource();
    view.show(defaultAvatar(), 0, 'stand', 0); f.loads[0].resolve(old); await flush();
    view.show(defaultAvatar(), 1, 'stand', 0); expect(old.dispose).not.toHaveBeenCalled(); expect(view.element.dataset.avatarReady).toBe('false'); expect(view.element.dataset.avatarPainted).toBe('true');
    f.loads[1].reject(new Error('Missing source bitmap')); await flush();
    expect(view.element.dataset.avatarError).toBe('Missing source bitmap'); expect(old.dispose).not.toHaveBeenCalled();
    const shown = (view.element as unknown as { src: string }).src;
    view.show(defaultAvatar(), 1, 'stand', 1); const bad = resource(); bad.draw.mockImplementation(() => { throw new Error('Unsupported paint'); });
    f.loads[2].resolve(bad); await flush();
    expect(bad.dispose).toHaveBeenCalledOnce(); expect(old.dispose).not.toHaveBeenCalled();
    expect((view.element as unknown as { src: string }).src).toBe(shown); expect(view.element.dataset.avatarReady).toBe('false');
    view.show(defaultAvatar(), 1, 'stand', 2); const good = resource();
    good.draw.mockImplementation(() => { expect(old.dispose).not.toHaveBeenCalled(); });
    f.loads[3].resolve(good); await flush();
    expect(old.dispose).toHaveBeenCalledOnce(); expect(view.element.dataset.avatarError).toBeUndefined(); view.dispose();
  });
  it('uses source walk frames, avoids redundant repaint and stops all idle/reduced-motion animation work', async () => {
    const f = fixture(); let reduced = false;
    const view = new AvatarView({ ...f.options, reducedMotion: () => reduced }), a = resource();
    view.show(defaultAvatar(), 0, 'walk', 0); expect(f.callbacks.size).toBe(0);
    f.loads[0].resolve(a); await flush(); expect(f.callbacks.size).toBe(1);
    f.step(10); expect(a.draw).toHaveBeenCalledTimes(1);
    f.step(40); expect(a.draw.mock.calls.at(-1)?.[1]).toMatchObject({ frame: 1 });
    f.step(1000); expect(a.draw.mock.calls.at(-1)?.[1]).toMatchObject({ frame: 10 });
    reduced = true; view.show(defaultAvatar(), 0, 'walk', 0); expect(f.callbacks.size).toBe(0);
    reduced = false; view.show(defaultAvatar(), 0, 'walk', 0); expect(f.callbacks.size).toBe(1);
    view.show(defaultAvatar(), 0, 'stand', 0); expect(f.callbacks.size).toBe(0);
    const still = resource(); f.loads[1].resolve(still); await flush(); expect(f.callbacks.size).toBe(0); view.dispose();
  });
  it('disposes late loads, active leases, surfaces and frame callbacks exactly once', async () => {
    const f = fixture(), view = new AvatarView(f.options), a = resource();
    view.show(defaultAvatar(), 0, 'walk', 0); f.loads[0].resolve(a); await flush();
    view.show(defaultAvatar(), 0, 'walk', 1); view.dispose(); view.dispose();
    expect(f.loads[1].options.signal?.aborted).toBe(true); expect(a.dispose).toHaveBeenCalledOnce(); expect(f.callbacks.size).toBe(0);
    const late = resource(); f.loads[1].resolve(late); await flush();
    expect(late.dispose).toHaveBeenCalledOnce(); expect(late.draw).not.toHaveBeenCalled();
    expect((view.element as unknown as { src: string }).src ?? '').toBe('');
    view.show(defaultAvatar(), 0, 'walk', 2); expect(f.loads).toHaveLength(2);
  });
  it('rejects already cancelled frame callbacks and keeps very long walk sessions within evaluator bounds', async () => {
    const f = fixture(), view = new AvatarView(f.options), a = resource();
    view.show(defaultAvatar(), 0, 'walk', 0); f.loads[0].resolve(a); await flush();
    const stale = [...f.callbacks.values()][0]; view.show(defaultAvatar(), 0, 'stand', 0);
    stale(1000); expect(a.draw).toHaveBeenCalledOnce(); expect(f.callbacks.size).toBe(0);
    const still = resource(); f.loads[1].resolve(still); await flush();
    const walking = resource(); view.show(defaultAvatar(), 0, 'walk', 0); f.loads[2].resolve(walking); await flush();
    f.step(1e12); expect(walking.draw.mock.calls.at(-1)?.[1].frame).toBeLessThan(20); view.dispose();
  });
  it('keeps failures explicit and does not retry on each repeated world render', async () => {
    const f = fixture(), view = new AvatarView(f.options);
    view.show(defaultAvatar(), 0, 'stand', 0); f.loads[0].reject(new Error('No image')); await flush();
    for (let i = 0; i < 100; i++) view.show(defaultAvatar(), 0, 'stand', 0);
    expect(f.loads).toHaveLength(1); expect(view.element.dataset.avatarError).toBe('No image'); expect(f.callbacks.size).toBe(0); view.dispose();
  });
  it('rejects malformed appearances and unsupported poses without starting asset work', () => {
    const f = fixture(), view = new AvatarView(f.options);
    expect(() => view.show(new Uint8Array(15), 0, 'stand', 0)).toThrow();
    expect(() => view.show(defaultAvatar(), 0, 'walk', -1)).toThrow();
    expect(f.loads).toHaveLength(0); view.dispose();
  });
  it('reports a missing drawing context without loading or substituting an image', () => {
    const f = fixture(); vi.stubGlobal('document', new TestDocument());
    const view = new AvatarView(f.options); view.show(defaultAvatar(), 0, 'stand', 0);
    expect(view.element.dataset.avatarError).toContain('unavailable'); expect(view.element.dataset.avatarReady).toBe('false');
    expect(f.loads).toHaveLength(0); expect(f.callbacks.size).toBe(0); view.dispose();
  });
});
