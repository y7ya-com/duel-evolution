import { checkAbort, SharedJobs, WorkQueue } from './async';
import { decodeLzss } from './lzss';
import type { PersistentProvider, PersistentStore } from './persistent';

export type AssetFetch = typeof globalThis.fetch;
export interface ArchiveLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxStoredBytes: number;
  concurrency: number;
}
export const DEFAULT_ARCHIVE_LIMITS: Readonly<ArchiveLimits> = {
  maxEntries: 100_000, maxEntryBytes: 16 * 1024 * 1024,
  maxStoredBytes: 16 * 1024 * 1024, concurrency: 4,
};
export class AssetNotFoundError extends Error {
  constructor(name: string) { super(`Asset not found: ${name}`); this.name = 'AssetNotFoundError'; }
}
export interface ArchiveEntry { readonly name: string; readonly offset: number; readonly size: number; readonly stored: number; }
export function normalizeAssetPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some(p => !p || p === '.' || p === '..') || /[\x00-\x1f\x7f:]/.test(normalized)) {
    throw new Error('Invalid archive path');
  }
  return normalized;
}

/** Independent async HTTP archive reader; no guest runtime or manifest required. */
export class ArchiveReader {
  private readonly limits: ArchiveLimits;
  private readonly queue: WorkQueue;
  private readonly jobs = new SharedJobs<string, Uint8Array>();
  private readonly directories = new SharedJobs<string, ReadonlyMap<string, ArchiveEntry>>();
  private entries?: ReadonlyMap<string, ArchiveEntry>;
  private total?: number;
  private etag?: string;
  private lastModified?: string;
  private store: PersistentStore | null = null;
  private closed = false;
  /** Entries served from the persistent store / from the network this session (dev timing log). */
  readonly stats = { persisted: 0, network: 0 };
  constructor(readonly url: string, private fetcher: AssetFetch = globalThis.fetch.bind(globalThis), limits: Partial<ArchiveLimits> = {}, queue?: WorkQueue, private readonly persist?: PersistentProvider) {
    this.limits = { ...DEFAULT_ARCHIVE_LIMITS, ...limits };
    for (const [key, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`Invalid ${key}`);
    }
    if (this.limits.maxEntries > 1_000_000 || this.limits.maxEntryBytes > 256 * 1024 * 1024 || this.limits.maxStoredBytes > 256 * 1024 * 1024) throw new RangeError('Archive limits too large');
    this.queue = queue ?? new WorkQueue(this.limits.concurrency);
  }
  private check(signal?: AbortSignal): void {
    checkAbort(signal);
    if (this.closed) throw new Error('Archive reader disposed');
  }
  private async range(start: number, length: number, signal: AbortSignal): Promise<Uint8Array> {
    this.check(signal);
    const end = start + length - 1;
    if (!Number.isSafeInteger(end) || length < 1) throw new RangeError('Invalid archive range');
    const response = await this.fetcher(this.url, {
      headers: { Range: `bytes=${start}-${end}`, ...(this.etag ? { 'If-Range': this.etag } : {}) }, signal,
    });
    try {
      if (response.status === 404) throw new AssetNotFoundError(this.url);
      if (response.status !== 206) throw new Error(`Archive requires HTTP 206 (received ${response.status})`);
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '');
      if (!match || Number(match[1]) !== start || Number(match[2]) !== end) throw new Error('Invalid Content-Range');
      const total = Number(match[3]);
      if (!Number.isSafeInteger(total) || total <= end || (this.total !== undefined && this.total !== total)) throw new Error('Archive length changed or invalid');
      const encoding = response.headers.get('Content-Encoding');
      if (encoding && encoding !== 'identity') throw new Error('Encoded archive range unsupported');
      const declared = response.headers.get('Content-Length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== length)) throw new Error('Invalid Content-Length');
      const etag = response.headers.get('ETag');
      if (this.etag !== undefined && etag !== this.etag) throw new Error('Archive ETag changed');
      this.total = total;
      if (etag && !etag.startsWith('W/')) this.etag = etag;
      this.lastModified ??= response.headers.get('Last-Modified') ?? undefined;
      if (!response.body) throw new Error('Missing archive body');
      const reader = response.body.getReader(), bytes = new Uint8Array(length);
      let written = 0;
      const onAbort = (): void => { void reader.cancel().catch(() => {}); };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        for (;;) {
          checkAbort(signal);
          const part = await reader.read();
          checkAbort(signal);
          if (part.done) break;
          if (written + part.value.length > length) throw new Error('Oversized archive range');
          bytes.set(part.value, written); written += part.value.length;
        }
        if (written !== length) throw new Error('Truncated archive range');
        return bytes;
      } finally {
        signal.removeEventListener('abort', onAbort);
        await reader.cancel().catch(() => {}); reader.releaseLock();
      }
    } catch (error) {
      if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
      throw error;
    }
  }
  async directory(signal?: AbortSignal): Promise<ReadonlyMap<string, ArchiveEntry>> {
    this.check(signal);
    if (this.entries) return this.entries;
    return this.directories.run('directory', s => this.queue.run(async () => {
      const header = await this.range(0, 12, s);
      if (new TextDecoder().decode(header.subarray(0, 8)) !== 'KCEJYUGI') throw new Error('Invalid archive magic');
      const count = new DataView(header.buffer).getUint32(8, true), end = 12 + count * 268;
      if (count > this.limits.maxEntries || end > this.total!) throw new Error('Invalid archive directory count');
      // The archive build: a strong ETag, else Last-Modified, with the length. Without either nothing persists (a
      // same-length rebuild could not be told apart).
      const stamp = this.etag ?? this.lastModified;
      this.store = stamp && this.persist ? await this.persist.open(this.url, `${this.total}:${stamp}`).catch(() => null) : null;
      this.check(s);
      const raw = count ? await this.persisted('dir', count * 268, () => this.range(12, count * 268, s)) : new Uint8Array();
      const view = new DataView(raw.buffer), decoder = new TextDecoder('shift_jis', { fatal: true });
      const entries = new Map<string, ArchiveEntry>();
      for (let i = 0; i < count; i++) {
        const at = i * 268, nameBytes = new Uint8Array(256);
        let length = 0;
        for (; length < 256; length++) {
          const b = raw[at + length], c = ((b & 15) << 4) | (b >> 4);
          if (!c) break;
          nameBytes[length] = c;
        }
        if (length === 256) throw new Error('Unterminated archive name');
        const name = normalizeAssetPath(decoder.decode(nameBytes.subarray(0, length)));
        const offset = view.getUint32(at + 256, true), size = view.getUint32(at + 260, true), stored = view.getUint32(at + 264, true);
        if (entries.has(name)) throw new Error('Duplicate archive name');
        if (offset < end || offset + stored > this.total! || size > this.limits.maxEntryBytes || stored > this.limits.maxStoredBytes || (size === 0) !== (stored === 0)) throw new Error(`Invalid archive entry: ${name}`);
        entries.set(name, Object.freeze({ name, offset, size, stored }));
      }
      this.check(s);
      this.entries = entries;
      return entries;
    }, s), signal);
  }
  async read(path: string, signal?: AbortSignal): Promise<Uint8Array> {
    this.check(signal);
    const name = normalizeAssetPath(path), entries = await this.directory(signal);
    this.check(signal);
    const entry = entries.get(name);
    if (!entry) throw new AssetNotFoundError(name);
    return this.jobs.run(name, s => this.queue.run(async () => {
      const bytes = entry.stored ? await this.persisted('e:' + name, entry.stored, () => this.range(entry.offset, entry.stored, s)) : new Uint8Array();
      this.check(s);
      return entry.size === entry.stored ? bytes : decodeLzss(bytes, entry.size, this.limits.maxEntryBytes);
    }, s), signal);
  }
  /** The stored bytes from the persistent store (exact length), else from the network and kept there. */
  private async persisted(key: string, length: number, fetchBytes: () => Promise<Uint8Array>): Promise<Uint8Array> {
    const store = this.store;
    const kept = store ? await store.get(key).catch(() => null) : null;
    if (kept && kept.byteLength === length) { this.stats.persisted++; return kept; }
    const bytes = await fetchBytes();
    this.stats.network++;
    if (store) void store.put(key, bytes).catch(() => {});
    return bytes;
  }
  dispose(): void { this.closed = true; this.jobs.dispose(); this.directories.dispose(); this.entries = undefined; }
}
