/** Only user-selected local files are stored. Blobs go straight to structured clone,
 * never through arrayBuffer/base64 or a second Blob copy. */
export const AUDIO_FILE_LIMITS = Object.freeze({ perSlot: 8, perFileBytes: 64 * 1024 * 1024, totalFiles: 256, totalBytes: 256 * 1024 * 1024 });
export interface AudioSlotMode { shuffle: boolean; loop: boolean; volume: number; }
export interface StoredAudioSlot extends AudioSlotMode { slot: number; files: File[]; }
export interface StoredAudio { version: 1; music: number; sound: number; slots: StoredAudioSlot[]; }
export interface AudioStorage {
  read(signal: AbortSignal): Promise<unknown>;
  write(state: StoredAudio, signal: AbortSignal): Promise<void>;
  close(): void;
}
/** Each manager owns its adapter. An injected factory permits isolated databases/tests. */
export class IndexedDBAudioStorage implements AudioStorage {
  private db?: IDBDatabase;
  private opening?: Promise<IDBDatabase>;
  private closed = false;
  private readonly transactions = new Set<IDBTransaction>();
  constructor(private readonly factory: IDBFactory = globalThis.indexedDB, private readonly name = 'duel-evolution-local-audio-v1') {}
  private open(): Promise<IDBDatabase> {
    if (this.closed) return Promise.reject(new Error('Audio storage closed'));
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) { reject(new Error('IndexedDB unavailable')); return; }
      let abandoned = false;
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('audio'); };
      request.onerror = () => reject(request.error ?? new Error('Cannot open audio storage'));
      request.onblocked = () => { abandoned = true; reject(new Error('Audio storage upgrade blocked')); };
      request.onsuccess = () => {
        const db = request.result;
        if (this.closed || abandoned) { db.close(); reject(new Error('Audio storage closed')); return; }
        this.db = db; db.onversionchange = () => { db.close(); if (this.db === db) this.db = undefined; };
        resolve(db);
      };
    });
    this.opening = opening;
    void opening.finally(() => { if (this.opening === opening) this.opening = undefined; }).catch(() => {});
    return opening;
  }
  private async transaction(write: boolean, state: StoredAudio | undefined, signal: AbortSignal): Promise<unknown> {
    const db = await this.open();
    if (signal.aborted || this.closed) throw new Error('Audio storage operation cancelled');
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audio', write ? 'readwrite' : 'readonly'); this.transactions.add(tx);
      const cancel = () => { try { tx.abort(); } catch { /* Already complete. */ } };
      signal.addEventListener('abort', cancel, { once: true });
      let value: unknown;
      const cleanup = () => { signal.removeEventListener('abort', cancel); this.transactions.delete(tx); };
      tx.oncomplete = () => { cleanup(); resolve(value); };
      tx.onabort = tx.onerror = () => { cleanup(); reject(tx.error ?? new Error('Audio storage transaction failed')); };
      try {
        const store = tx.objectStore('audio');
        const request = write ? store.put(state, 'state') : store.get('state');
        request.onsuccess = () => { value = request.result; };
      } catch (error) { cancel(); cleanup(); reject(error); }
    });
  }
  read(signal: AbortSignal): Promise<unknown> { return this.transaction(false, undefined, signal); }
  async write(state: StoredAudio, signal: AbortSignal): Promise<void> { await this.transaction(true, state, signal); }
  close(): void {
    this.closed = true;
    for (const tx of this.transactions) { try { tx.abort(); } catch { /* Already complete. */ } }
    this.transactions.clear(); this.db?.close(); this.db = undefined;
  }
}

export function validateStoredAudio(value: unknown, slotCount: number): StoredAudio | undefined {
  if (value === undefined) return undefined;
  const state = value as StoredAudio;
  const volume = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
  if (!state || state.version !== 1 || !volume(state.music) || !volume(state.sound) || !Array.isArray(state.slots) || state.slots.length > slotCount) throw new Error('Invalid stored audio settings');
  let count = 0, bytes = 0;
  const seen = new Set<number>();
  const slots = state.slots.map(slot => {
    if (!slot || !Number.isInteger(slot.slot) || slot.slot < 0 || slot.slot >= slotCount || seen.has(slot.slot)
      || typeof slot.shuffle !== 'boolean' || typeof slot.loop !== 'boolean' || !volume(slot.volume)
      || !Array.isArray(slot.files) || slot.files.length > AUDIO_FILE_LIMITS.perSlot) throw new Error('Invalid stored audio slot');
    seen.add(slot.slot);
    for (const file of slot.files) {
      if (!(file instanceof Blob) || typeof file.name !== 'string' || file.name.length > 4096 || !Number.isSafeInteger(file.size) || file.size > AUDIO_FILE_LIMITS.perFileBytes) throw new Error('Invalid stored audio file');
      count++; bytes += file.size;
    }
    return { ...slot, files: [...slot.files] };
  });
  if (count > AUDIO_FILE_LIMITS.totalFiles || bytes > AUDIO_FILE_LIMITS.totalBytes) throw new Error('Stored audio exceeds limits');
  return { version: 1, music: state.music, sound: state.sound, slots };
}
