import { describe, expect, it, vi } from 'vitest';
import { ArchiveReader, CacheApiPersistence, IdlePrefetcher } from '../src/assets';
import { SceneManifest } from '../src/assets/prefetch';
import { CACHE_PREFIX } from '../src/assets/persistent';
import { decodeDuelPrefetch, Preloader } from '../src/features/preload';
import { SceneLoadTracker } from '../src/ui/htmlui/scene-loading';

/** An in-memory CacheStorage: enough of the Cache API for the store. */
class FakeCaches {
  readonly caches = new Map<string, Map<string, ArrayBuffer>>();
  async keys(): Promise<string[]> { return [...this.caches.keys()]; }
  async delete(name: string): Promise<boolean> { return this.caches.delete(name); }
  async open(name: string): Promise<Cache> {
    let map = this.caches.get(name); if (!map) { map = new Map(); this.caches.set(name, map); }
    const m = map;
    return {
      match: async (url: string) => { const b = m.get(url); return b ? new Response(b.slice(0)) : undefined; },
      put: async (url: string, response: Response) => { m.set(url, await response.arrayBuffer()); },
      delete: async (url: string) => m.delete(url),
    } as unknown as Cache;
  }
}
function archive(items: { name: string; data: number[] }[]): Uint8Array {
  const size = 12 + items.length * 268 + items.reduce((n, e) => n + e.data.length, 0);
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('KCEJYUGI')); view.setUint32(8, items.length, true);
  let offset = 12 + items.length * 268;
  items.forEach((item, i) => {
    const at = 12 + i * 268;
    for (let k = 0; k < item.name.length; k++) { const b = item.name.charCodeAt(k); bytes[at + k] = ((b & 15) << 4) | (b >> 4); }
    view.setUint32(at + 256, offset, true); view.setUint32(at + 260, item.data.length, true); view.setUint32(at + 264, item.data.length, true);
    bytes.set(item.data, offset); offset += item.data.length;
  });
  return bytes;
}
function server(bytes: Uint8Array, etag: string | null = '"build-1"') {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!;
    const start = Number(match[1]), end = Number(match[2]);
    return new Response(bytes.slice(start, end + 1), { status: 206, headers: {
      'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1), ...(etag ? { ETag: etag } : {}),
    } });
  });
}
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); };

describe('persistent archive cache', () => {
  it('a returning session reads the directory and entries from the store (hit), a new one from the network (miss)', async () => {
    const storage = new FakeCaches(), bytes = archive([{ name: 'a.png', data: [1, 2, 3] }, { name: 'b.png', data: [4, 5] }]);
    const first = server(bytes), r1 = new ArchiveReader('/merge.dat', first, {}, undefined, new CacheApiPersistence({ storage: storage as unknown as CacheStorage }));
    expect([...await r1.read('a.png')]).toEqual([1, 2, 3]);
    expect(first).toHaveBeenCalledTimes(3); expect(r1.stats).toEqual({ persisted: 0, network: 2 });
    await flush(); r1.dispose();
    const second = server(bytes), r2 = new ArchiveReader('/merge.dat', second, {}, undefined, new CacheApiPersistence({ storage: storage as unknown as CacheStorage }));
    expect([...await r2.read('a.png')]).toEqual([1, 2, 3]);
    expect(second).toHaveBeenCalledTimes(1); // the 12-byte header (the build check) only
    expect(r2.stats).toEqual({ persisted: 2, network: 0 });
    expect([...await r2.read('b.png')]).toEqual([4, 5]); // not stored yet: from the network
    expect(r2.stats.network).toBe(1);
  });
  it('a new asset build (ETag) never serves the old bytes and deletes the old cache', async () => {
    const storage = new FakeCaches(), persist = () => new CacheApiPersistence({ storage: storage as unknown as CacheStorage });
    const r1 = new ArchiveReader('/merge.dat', server(archive([{ name: 'a.png', data: [1, 2, 3] }])), {}, undefined, persist());
    await r1.read('a.png'); await flush();
    const oldNames = [...storage.caches.keys()];
    expect(oldNames).toHaveLength(1);
    const fetcher = server(archive([{ name: 'a.png', data: [9, 9, 9] }]), '"build-2"');
    const r2 = new ArchiveReader('/merge.dat', fetcher, {}, undefined, persist());
    expect([...await r2.read('a.png')]).toEqual([9, 9, 9]);
    expect(r2.stats).toEqual({ persisted: 0, network: 2 });
    expect(storage.caches.has(oldNames[0]!)).toBe(false);
    expect([...storage.caches.keys()].every(n => n.startsWith(CACHE_PREFIX))).toBe(true);
  });
  it('an archive without ETag or Last-Modified is not persisted (a same-length rebuild could not be told apart)', async () => {
    const storage = new FakeCaches();
    const r = new ArchiveReader('/merge.dat', server(archive([{ name: 'a.png', data: [1] }]), null), {}, undefined, new CacheApiPersistence({ storage: storage as unknown as CacheStorage }));
    await r.read('a.png'); await flush();
    expect(storage.caches.size).toBe(0);
  });
  it('keeps its disk byte budget (least recently used out) and treats a short entry as a miss', async () => {
    const storage = new FakeCaches(), store = (await new CacheApiPersistence({ storage: storage as unknown as CacheStorage, maxBytes: 10 }).open('/x', 'v'))!;
    await store.put('a', new Uint8Array(4)); await store.put('b', new Uint8Array(4));
    expect(await store.get('a')).not.toBeNull(); // a is now the most recent
    await store.put('c', new Uint8Array(4)); // evicts b
    expect(await store.get('b')).toBeNull(); expect(await store.get('a')).not.toBeNull(); expect(await store.get('c')).not.toBeNull();
    await store.put('huge', new Uint8Array(11));
    expect(await store.get('huge')).toBeNull();
  });
  it('no Cache API: opens nothing and reads go to the network', async () => {
    expect(await new CacheApiPersistence({ storage: undefined }).open('/x', 'v')).toBeNull();
  });
});

describe('idle prefetch scheduling', () => {
  const manualIdle = () => { const runs: (() => void)[] = []; return { idle: (run: () => void) => { runs.push(run); return () => { const i = runs.indexOf(run); if (i >= 0) runs.splice(i, 1); }; }, runs }; };
  it('starts one task per idle callback, never two at once, and runs a key once', async () => {
    const { idle, runs } = manualIdle(), p = new IdlePrefetcher(idle), order: string[] = [];
    let release!: () => void;
    p.schedule('a', async () => { order.push('a'); await new Promise<void>(r => { release = r; }); });
    p.schedule('b', async () => { order.push('b'); });
    expect(p.schedule('a', async () => {})).toBe(false);
    expect(order).toEqual([]); expect(runs).toHaveLength(1);
    runs.shift()!(); expect(order).toEqual(['a']); expect(runs).toHaveLength(0); // b waits for a
    release(); await flush();
    expect(runs).toHaveLength(1); runs.shift()!(); await flush();
    expect(order).toEqual(['a', 'b']); expect(p.done).toBe(2); expect(p.pending).toBe(0);
  });
  it('urgent tasks jump the queue; hold() pauses new starts; cancel drops by prefix; a failure may be retried', async () => {
    const { idle, runs } = manualIdle(), p = new IdlePrefetcher(idle), order: string[] = [];
    const release = p.hold();
    p.schedule('map:1', async () => { order.push('map:1'); });
    p.schedule('art:x', async () => { order.push('art:x'); });
    p.schedule('card:5', async () => { order.push('card:5'); }, { urgent: true });
    expect(runs).toHaveLength(0);
    p.cancel('map:'); expect(p.has('map:1')).toBe(false);
    release();
    while (runs.length) { runs.shift()!(); await flush(); }
    expect(order).toEqual(['card:5', 'art:x']);
    p.schedule('bad', async () => { throw new Error('offline'); });
    while (runs.length) { runs.shift()!(); await flush(); }
    expect(p.failed).toBe(1); expect(p.schedule('bad', async () => {})).toBe(true);
    p.dispose(); expect(p.schedule('later', async () => {})).toBe(false);
  });
});

describe('preloader', () => {
  const setup = () => {
    const runs: (() => void)[] = [], p = new IdlePrefetcher(run => { runs.push(run); return () => {}; });
    const scenes: string[] = [], cards: number[] = [];
    const assets = { prefetchScene: async (path: string) => { scenes.push(path); }, prefetchCard: async (pc: number) => { cards.push(pc); } };
    const drain = async () => { while (runs.length) { runs.shift()!(); await flush(); } };
    return { runs, p, scenes, cards, assets, drain };
  };
  it('the lobby warms its neighbouring maps, the deck editor and the shop art', async () => {
    const { p, scenes, assets, drain } = setup();
    const manifest = new SceneManifest('k', null); manifest.record('map:2', 'data/map/learned.png');
    const pre = new Preloader({ assets, prefetcher: p, manifest, neighbours: id => id === 4 ? [2] : [], mapPaths: async id => [`data/map/m${id}_tile.png`] }, 'E');
    pre.observe('lobby', 4, 'lobby');
    await drain();
    expect(scenes).toContain('data/map/learned.png'); expect(scenes).toContain('data/map/m2_tile.png');
    expect(scenes).toContain('data/deck/deck_bg_01.png'); expect(scenes).toContain('data/deck/deck_moji_01_e.png');
    expect(scenes).toContain('data/shop/shop_win_01_c01.png');
    const count = scenes.length; pre.observe('lobby', 4, 'lobby'); await drain(); expect(scenes.length).toBe(count);
  });
  it('a duel about to start fetches the NPC deck once and prefetches its art first', async () => {
    const { p, cards, assets, drain } = setup();
    const duelDeck = vi.fn(async () => decodeDuelPrefetch({ npc: 3, cards: [89631139, 46986414, -1], fields: [], ids: 'passcode' }));
    const pre = new Preloader({ assets, prefetcher: p, duelDeck });
    pre.observe('duel', 4, 'preparing-duel'); pre.observe('duel', 4, 'rock-paper-scissors');
    await drain();
    expect(duelDeck).toHaveBeenCalledTimes(1); expect(cards).toEqual([89631139, 46986414]);
    expect(decodeDuelPrefetch(null)).toBeNull(); expect(decodeDuelPrefetch({ cards: [1] })).toBeNull();
  });
  it('the manifest learns the paths each scene loads and survives a reload', () => {
    const backing = new Map<string, string>(), storage = { getItem: (k: string) => backing.get(k) ?? null, setItem: (k: string, v: string) => { backing.set(k, v); } };
    const a = new SceneManifest('m', storage); a.record('deck', 'data/deck/x.png'); a.record('deck', 'data/deck/x.png'); a.save();
    expect(new SceneManifest('m', storage).paths('deck')).toEqual(['data/deck/x.png']);
  });
});

describe('scene load tracking', () => {
  it('reports the first begin and the last end, and logs each load time', () => {
    let t = 0; const changes: (string | null)[] = [], log: [string, number][] = [];
    const tracker = new SceneLoadTracker(l => changes.push(l), (n, ms) => log.push([n, ms]), () => t);
    const endA = tracker.begin('map:1'); t = 5; const endB = tracker.begin('world:1');
    t = 20; endA(); endA(); expect(changes).toEqual(['map:1']);
    t = 30; endB(); expect(changes).toEqual(['map:1', null]);
    expect(log).toEqual([['map:1', 20], ['world:1', 25]]);
  });
});
