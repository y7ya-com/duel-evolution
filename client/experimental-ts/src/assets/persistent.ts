// Persistent archive chunks (live: client/recomp/web/lazyfs.js keeps fetched chunks in the Cache API so a returning
// player starts with them). The rewrite stores the archive's stored (still compressed) entry bytes and its directory,
// keyed by the archive's build: its ETag (or Last-Modified) and length from the 12-byte header read every session. A new
// asset build opens a new cache and deletes the old one, so a stale entry is never served. The disk store has its own
// byte budget (LRU); bytes read back still go through the AssetManager's memory BudgetCache like a network read.
export interface PersistentStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
}
export interface PersistentProvider {
  /** scope: the archive URL; version: the archive build. Null when storage is unavailable. */
  open(scope: string, version: string): Promise<PersistentStore | null>;
}
export interface CachePersistenceOptions {
  storage?: CacheStorage | undefined;
  /** The client's own build (bumps every cache when the stored format changes). */
  build?: string;
  maxBytes?: number;
  maxEntryBytes?: number;
}
export const CACHE_PREFIX = 'de-assets:';
const INDEX = '__index';
const keyUrl = (key: string): string => 'https://de-assets.invalid/' + encodeURIComponent(key);

class CacheApiStore implements PersistentStore {
  private index = new Map<string, number>();
  private used = 0;
  private indexSave: Promise<void> | null = null;
  constructor(private readonly cache: Cache, private readonly maxBytes: number, private readonly maxEntryBytes: number) {}
  async load(): Promise<void> {
    const response = await this.cache.match(keyUrl(INDEX));
    const raw: unknown = response ? await response.json().catch(() => null) : null;
    if (Array.isArray(raw)) for (const row of raw) {
      if (Array.isArray(row) && typeof row[0] === 'string' && Number.isSafeInteger(row[1]) && row[1] >= 0) { this.index.set(row[0], row[1]); this.used += row[1]; }
    }
  }
  async get(key: string): Promise<Uint8Array | null> {
    const size = this.index.get(key);
    if (size === undefined) return null;
    try {
      const response = await this.cache.match(keyUrl(key));
      const bytes = response ? new Uint8Array(await response.arrayBuffer()) : null;
      if (!bytes || bytes.byteLength !== size) { await this.drop(key); return null; }
      this.index.delete(key); this.index.set(key, size); // most recently used last
      return bytes;
    } catch { return null; }
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > this.maxEntryBytes || bytes.byteLength > this.maxBytes || this.index.has(key)) return;
    const evict: string[] = [];
    let used = this.used;
    for (const [k, n] of this.index) { if (used + bytes.byteLength <= this.maxBytes) break; evict.push(k); used -= n; }
    for (const k of evict) await this.drop(k);
    await this.cache.put(keyUrl(key), new Response(bytes.slice().buffer, { headers: { 'Content-Type': 'application/octet-stream' } }));
    this.index.set(key, bytes.byteLength); this.used += bytes.byteLength;
    this.saveIndexSoon();
  }
  get bytes(): number { return this.used; }
  private async drop(key: string): Promise<void> {
    const n = this.index.get(key); if (n === undefined) return;
    this.index.delete(key); this.used -= n;
    await this.cache.delete(keyUrl(key)).catch(() => false);
    this.saveIndexSoon();
  }
  /** Coalesces the puts of one task into one index write; written promptly so a closed tab keeps what it stored. */
  private saveIndexSoon(): void {
    this.indexSave ??= Promise.resolve().then(() => { this.indexSave = null; return this.saveIndex(); });
  }
  async saveIndex(): Promise<void> {
    await this.cache.put(keyUrl(INDEX), new Response(JSON.stringify([...this.index]), { headers: { 'Content-Type': 'application/json' } })).catch(() => {});
  }
}

/** Cache API persistence; every failure (private mode, quota, no `caches`) degrades to network reads. */
export class CacheApiPersistence implements PersistentProvider {
  private readonly storage: CacheStorage | undefined;
  private readonly build: string;
  private readonly maxBytes: number;
  private readonly maxEntryBytes: number;
  private readonly opened = new Map<string, Promise<PersistentStore | null>>();
  constructor(options: CachePersistenceOptions = {}) {
    this.storage = 'storage' in options ? options.storage : globalThis.caches;
    this.build = options.build ?? '1';
    this.maxBytes = options.maxBytes ?? 192 * 1024 * 1024;
    this.maxEntryBytes = options.maxEntryBytes ?? 32 * 1024 * 1024;
  }
  static cacheName(scope: string, build: string, version: string): string { return `${CACHE_PREFIX}${scope}|${build}|${version}`; }
  open(scope: string, version: string): Promise<PersistentStore | null> {
    const name = CacheApiPersistence.cacheName(scope, this.build, version);
    let task = this.opened.get(name);
    if (!task) { task = this.openNow(scope, name).catch(() => null); this.opened.set(name, task); }
    return task;
  }
  private async openNow(scope: string, name: string): Promise<PersistentStore | null> {
    const storage = this.storage; if (!storage) return null;
    // Another build of this archive (or of the client): never read again, so free its space now.
    for (const old of await storage.keys()) if (old !== name && old.startsWith(`${CACHE_PREFIX}${scope}|`)) await storage.delete(old).catch(() => false);
    const store = new CacheApiStore(await storage.open(name), this.maxBytes, this.maxEntryBytes);
    await store.load();
    return store;
  }
}
