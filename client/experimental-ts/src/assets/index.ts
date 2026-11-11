import { BudgetCache } from '../core/cache';
import type { Lease } from '../core/cache';
import { ArchiveReader, AssetNotFoundError, normalizeAssetPath } from './archive';
import type { ArchiveLimits, AssetFetch } from './archive';
import { checkAbort, SharedJobs, WorkQueue } from './async';
import { imageBudget } from './image-bounds';
import type { ImageLimits } from './image-bounds';
import type { PersistentProvider } from './persistent';
export { CacheApiPersistence } from './persistent';
export type { PersistentProvider, PersistentStore } from './persistent';
export { IdlePrefetcher } from './prefetch';
export { ArchiveReader, AssetNotFoundError, DEFAULT_ARCHIVE_LIMITS } from './archive';
export type { ArchiveLimits, AssetFetch, ArchiveEntry } from './archive';
export { decodeLzss } from './lzss';
export interface Asset {
  /** Immutable by convention; shared by all leases. */
  readonly bytes: Uint8Array;
  readonly url: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}
export type AssetLease = Lease<Asset>;
export interface AssetManagerOptions {
  baseUrl: string;
  fetch?: AssetFetch;
  cacheBytes?: number;
  limits?: Partial<ArchiveLimits>;
  imageLimits?: Partial<ImageLimits>;
  /** Explicit passcode -> merge.dat path; no inferred internal card IDs. */
  mergeCardPaths?: Readonly<Record<string, string>>;
  /** Archive chunks kept between sessions (Cache API), versioned by each archive's build. */
  persistent?: PersistentProvider;
  /** Every merge.dat path a caller loads (the prefetch manifest learns each scene's art from it). */
  onScene?: (path: string) => void;
}
function passcodeName(passcode: string | number): string {
  const text = String(passcode);
  if (!/^\d{1,10}$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) <= 0 || Number(text) >= 0xffffff00) throw new Error('Invalid card passcode');
  return String(Number(text));
}
function mimeType(path: string): string {
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg';
  if (/\.png$/i.test(path)) return 'image/png';
  if (/\.bmp$/i.test(path)) return 'image/bmp';
  if (/\.webp$/i.test(path)) return 'image/webp';
  if (/\.wav$/i.test(path)) return 'audio/wav';
  if (/\.ogg$/i.test(path)) return 'audio/ogg';
  return 'application/octet-stream';
}
export class AssetManager {
  private readonly merge: ArchiveReader;
  private readonly card: ArchiveReader;
  private readonly mini: ArchiveReader;
  private readonly cache: BudgetCache<string, Asset>;
  private readonly jobs = new SharedJobs<string, { bytes: Uint8Array; path: string }>();
  private readonly fallback: Readonly<Record<string, string>>;
  private readonly imageLimits: Partial<ImageLimits>;
  private closed = false;
  private readonly onScene: ((path: string) => void) | undefined;
  constructor(options: AssetManagerOptions) {
    const base = options.baseUrl.replace(/\/+$/, '') + '/';
    const queue = new WorkQueue(options.limits?.concurrency ?? 4);
    this.merge = new ArchiveReader(base + 'merge.dat', options.fetch, options.limits, queue, options.persistent);
    this.card = new ArchiveReader(base + 'merge/data/card.dat', options.fetch, options.limits, queue, options.persistent);
    this.mini = new ArchiveReader(base + 'merge/data/mini.dat', options.fetch, options.limits, queue, options.persistent);
    this.onScene = options.onScene;
    this.fallback = { ...options.mergeCardPaths };
    this.imageLimits = { ...options.imageLimits };
    this.cache = new BudgetCache(options.cacheBytes ?? 64 * 1024 * 1024, asset => URL.revokeObjectURL(asset.url));
  }
  get cacheBytes(): number { return this.cache.bytes; }
  private check(signal?: AbortSignal): void {
    checkAbort(signal);
    if (this.closed) throw new Error('Asset manager disposed');
  }
  /** Entries read from the persistent store vs the network, all archives (dev timing log). */
  get stats(): { persisted: number; network: number } {
    const all = [this.merge, this.card, this.mini];
    return { persisted: all.reduce((n, r) => n + r.stats.persisted, 0), network: all.reduce((n, r) => n + r.stats.network, 0) };
  }
  /** Background warm-up: fetches into the persistent store, and into memory only when the budget has room without
   * evicting anything a scene loaded. Never charges a lease. */
  private async warm(key: string, work: (signal: AbortSignal) => Promise<{ bytes: Uint8Array; path: string }>, signal?: AbortSignal): Promise<void> {
    this.check(signal);
    const cached = this.cache.acquire(key);
    if (cached) { cached.release(); return; }
    const result = await this.jobs.run(key, work, signal);
    this.check(signal);
    const type = mimeType(result.path);
    const image = type.startsWith('image/') ? imageBudget(result.bytes, type, this.imageLimits) : undefined;
    const charge = result.bytes.byteLength * 2 + (image?.decodedBytes ?? 0);
    if (!Number.isSafeInteger(charge) || this.cache.budget - this.cache.bytes < charge) return;
    const existing = this.cache.acquire(key);
    if (existing) { existing.release(); return; }
    const url = URL.createObjectURL(new Blob([result.bytes.slice().buffer], { type }));
    const asset: Asset = Object.freeze({ bytes: result.bytes, url, mimeType: type, ...(image ? { width: image.width, height: image.height } : {}) });
    if (!this.cache.insert(key, asset, charge)) URL.revokeObjectURL(url);
  }
  prefetchScene(path: string, signal?: AbortSignal): Promise<void> {
    path = normalizeAssetPath(path);
    return this.warm(`merge:${path}`, async s => ({ bytes: await this.merge.read(path, s), path }), signal);
  }
  prefetchCard(passcode: string | number, signal?: AbortSignal): Promise<void> {
    const pc = passcodeName(passcode);
    return this.warm(`card:${pc}`, async s => {
      const path = pc + '.jpg';
      try { return { bytes: await this.card.read(path, s), path }; }
      catch (error) {
        const fallback = this.fallback[pc];
        if (!(error instanceof AssetNotFoundError) || !fallback) throw error;
        return { bytes: await this.merge.read(fallback, s), path: fallback };
      }
    }, signal);
  }
  private async load(key: string, work: (signal: AbortSignal) => Promise<{ bytes: Uint8Array; path: string }>, signal?: AbortSignal): Promise<AssetLease> {
    this.check(signal);
    const cached = this.cache.acquire(key);
    if (cached) return cached;
    const result = await this.jobs.run(key, work, signal);
    this.check(signal);
    const existing = this.cache.acquire(key);
    if (existing) return existing;
    const type = mimeType(result.path);
    // Inspect dimensions before handing image bytes to a browser decoder. Binary scene
    // metadata remains opaque; only explicit supported image extensions are decoded.
    const image = type.startsWith('image/') ? imageBudget(result.bytes, type, this.imageLimits) : undefined;
    const charge = result.bytes.byteLength * 2 + (image?.decodedBytes ?? 0);
    if (!Number.isSafeInteger(charge) || charge > this.cache.budget) throw new Error('Asset exceeds cache byte budget');
    const url = URL.createObjectURL(new Blob([result.bytes.slice().buffer], { type }));
    const asset: Asset = Object.freeze({ bytes: result.bytes, url, mimeType: type, ...(image ? { width: image.width, height: image.height } : {}) });
    if (!this.cache.insert(key, asset, charge)) {
      URL.revokeObjectURL(url); throw new Error('Asset cache budget exhausted by live leases');
    }
    return this.cache.acquire(key)!;
  }
  loadCard(passcode: string | number, signal?: AbortSignal): Promise<AssetLease> {
    const pc = passcodeName(passcode);
    return this.load(`card:${pc}`, async s => {
      const path = pc + '.jpg';
      try { return { bytes: await this.card.read(path, s), path }; }
      catch (error) {
        const fallback = this.fallback[pc];
        if (!(error instanceof AssetNotFoundError) || !fallback) throw error;
        return { bytes: await this.merge.read(fallback, s), path: fallback };
      }
    }, signal);
  }
  loadMini(passcode: string | number, signal?: AbortSignal): Promise<AssetLease> {
    const pc = passcodeName(passcode), path = pc + '.jpg';
    return this.load(`mini:${pc}`, async s => ({ bytes: await this.mini.read(path, s), path }), signal);
  }
  readScene(path: string, signal?: AbortSignal): Promise<AssetLease> {
    path = normalizeAssetPath(path);
    try { this.onScene?.(path); } catch { /* the manifest is optional */ }
    return this.load(`merge:${path}`, async s => ({ bytes: await this.merge.read(path, s), path }), signal);
  }
  /** Invalidates all leases/URLs immediately. Release UI leases before disposal. */
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.jobs.dispose();
    this.merge.dispose(); this.card.dispose(); this.mini.dispose(); this.cache.dispose();
  }
}
