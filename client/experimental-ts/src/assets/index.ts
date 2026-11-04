import { BudgetCache } from '../core/cache';
import type { Lease } from '../core/cache';
import { ArchiveReader, AssetNotFoundError, normalizeAssetPath } from './archive';
import type { ArchiveLimits, AssetFetch } from './archive';
import { checkAbort, SharedJobs, WorkQueue } from './async';
export { ArchiveReader, AssetNotFoundError, DEFAULT_ARCHIVE_LIMITS } from './archive';
export type { ArchiveLimits, AssetFetch, ArchiveEntry } from './archive';
export { decodeLzss } from './lzss';
export interface Asset {
  /** Immutable by convention; shared by all leases. */
  readonly bytes: Uint8Array;
  readonly url: string;
  readonly mimeType: string;
}
export type AssetLease = Lease<Asset>;
export interface AssetManagerOptions {
  baseUrl: string;
  fetch?: AssetFetch;
  cacheBytes?: number;
  limits?: Partial<ArchiveLimits>;
  /** Explicit passcode -> merge.dat path; no inferred internal card IDs. */
  mergeCardPaths?: Readonly<Record<string, string>>;
}
function passcodeName(passcode: string | number): string {
  const text = String(passcode);
  if (!/^\d{1,8}$/.test(text)) throw new Error('Invalid card passcode');
  return String(Number(text));
}
function mimeType(path: string): string {
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg';
  if (/\.png$/i.test(path)) return 'image/png';
  if (/\.bmp$/i.test(path)) return 'image/bmp';
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
  private closed = false;
  constructor(options: AssetManagerOptions) {
    const base = options.baseUrl.replace(/\/+$/, '') + '/';
    const queue = new WorkQueue(options.limits?.concurrency ?? 4);
    this.merge = new ArchiveReader(base + 'merge.dat', options.fetch, options.limits, queue);
    this.card = new ArchiveReader(base + 'merge/data/card.dat', options.fetch, options.limits, queue);
    this.mini = new ArchiveReader(base + 'merge/data/mini.dat', options.fetch, options.limits, queue);
    this.fallback = { ...options.mergeCardPaths };
    this.cache = new BudgetCache(options.cacheBytes ?? 64 * 1024 * 1024, asset => URL.revokeObjectURL(asset.url));
  }
  get cacheBytes(): number { return this.cache.bytes; }
  private check(signal?: AbortSignal): void {
    checkAbort(signal);
    if (this.closed) throw new Error('Asset manager disposed');
  }
  private async load(key: string, work: (signal: AbortSignal) => Promise<{ bytes: Uint8Array; path: string }>, signal?: AbortSignal): Promise<AssetLease> {
    this.check(signal);
    const cached = this.cache.acquire(key);
    if (cached) return cached;
    const result = await this.jobs.run(key, work, signal);
    this.check(signal);
    const existing = this.cache.acquire(key);
    if (existing) return existing;
    // Retained source bytes plus Blob backing storage.
    if (result.bytes.byteLength * 2 > this.cache.budget) throw new Error('Asset exceeds cache byte budget');
    const type = mimeType(result.path);
    const url = URL.createObjectURL(new Blob([result.bytes.slice().buffer], { type }));
    const asset: Asset = Object.freeze({ bytes: result.bytes, url, mimeType: type });
    if (!this.cache.insert(key, asset, result.bytes.byteLength * 2)) {
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
    return this.load(`merge:${path}`, async s => ({ bytes: await this.merge.read(path, s), path }), signal);
  }
  /** Invalidates all leases/URLs immediately. Release UI leases before disposal. */
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.jobs.dispose();
    this.merge.dispose(); this.card.dispose(); this.mini.dispose(); this.cache.dispose();
  }
}
