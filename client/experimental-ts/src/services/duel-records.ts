// The duel records the server sent at each duel's end (duel/record.ts), kept in this browser as live's client keeps
// its duellogs\ folder: the Duel Log's Play replays them. IndexedDB when there is one, else this page's memory.
import type { DuelRecord } from '../duel/record';
import { recordName } from '../duel/record';

export interface StoredRecord { key: string; when: number; names: [string, string]; record: DuelRecord }
export interface DuelRecordStore { save(record: DuelRecord): Promise<StoredRecord>; list(): Promise<StoredRecord[]> }
/** Live's Duel Record keeps the newest; the archive (server) keeps 90 days. */
export const RECORDS_KEEP = 200;

export const recordKey = (r: DuelRecord): string => `${r.when}:${r.players[0].pid}:${r.players[1].pid}:${r.title}`;
const stored = (record: DuelRecord): StoredRecord => ({ key: recordKey(record), when: record.when, names: [recordName(record.players[0].name), recordName(record.players[1].name)], record });

export function memoryRecordStore(): DuelRecordStore {
  const all = new Map<string, StoredRecord>();
  return {
    async save(record) { const s = stored(record); all.set(s.key, s); const keep = [...all.values()].sort((a, b) => b.when - a.when).slice(RECORDS_KEEP).map(r => r.key); for (const k of keep) all.delete(k); return s; },
    async list() { return [...all.values()].sort((a, b) => b.when - a.when); },
  };
}

export function idbRecordStore(factory: IDBFactory | undefined = globalThis.indexedDB, name = 'duel-evolution-duel-records-v1'): DuelRecordStore {
  if (!factory) return memoryRecordStore();
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('records', { keyPath: 'key' }); };
    req.onerror = () => { opening = null; reject(req.error ?? new Error('Cannot open the duel records')); };
    req.onsuccess = () => resolve(req.result);
  });
  const run = <T>(write: boolean, f: (s: IDBObjectStore) => IDBRequest<T>) => open().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction('records', write ? 'readwrite' : 'readonly'), req = f(tx.objectStore('records'));
    tx.oncomplete = () => resolve(req.result); tx.onerror = () => reject(tx.error ?? req.error); tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  }));
  const list = async () => ((await run(false, s => s.getAll())) as StoredRecord[]).sort((a, b) => b.when - a.when);
  return {
    async save(record) {
      const s = stored(record); await run(true, st => st.put(s));
      const old = (await list()).slice(RECORDS_KEEP);
      for (const o of old) await run(true, st => st.delete(o.key));
      return s;
    },
    list,
  };
}

const norm = (s: string | null | undefined) => String(s ?? '').replace(/_/g, ' ').trim().toLowerCase();
/** The local record of an archive row (GET /api/de/replays): the same opponent, its end within five minutes. */
export function matchRecord<T extends { when: number; names: readonly string[] }>(row: { at: number; opponent: string | null }, records: readonly T[]): T | null {
  let best: T | null = null, gap = 301;
  for (const r of records) {
    const d = Math.abs(r.when - row.at);
    if (d < gap && r.names.some(n => norm(n) === norm(row.opponent))) { best = r; gap = d; }
  }
  return best;
}
