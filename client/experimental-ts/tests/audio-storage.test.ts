import { describe, expect, it, vi } from 'vitest';
import { BrowserAudioManager } from '../src/features/audio';
import { AUDIO_FILE_LIMITS, validateStoredAudio, type AudioStorage, type StoredAudio } from '../src/features/audio-storage';
const file = (name = 'user.ogg') => new File(['user audio'], name, { type: 'audio/ogg' });
const stored = (): StoredAudio => ({ version: 1, music: .4, sound: .7, slots: [{ slot: 0, files: [file()], shuffle: true, loop: false, volume: .3 }] });
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
class Storage implements AudioStorage {
  value: unknown = stored();
  read = vi.fn(async (_signal: AbortSignal) => this.value);
  write = vi.fn(async (value: StoredAudio, _signal: AbortSignal) => { this.value = value; });
  close = vi.fn();
}
describe('bounded optional audio persistence', () => {
  it('restores explicitly without activating; retains File references and detached lists/modes', async () => {
    const storage = new Storage(), contextFactory = vi.fn(), manager = new BrowserAudioManager({ storage, contextFactory });
    expect(storage.read).not.toHaveBeenCalled(); expect(await manager.restore()).toBe(true);
    expect(contextFactory).not.toHaveBeenCalled(); expect(manager.isActivated).toBe(false);
    expect(manager.volumes).toEqual({ music: .4, sound: .7 });
    expect(manager.getState().slots[0]).toMatchObject({ files: ['user.ogg'], shuffle: true, loop: false, volume: .3 });
    const list = manager.getSlotFiles(0) as File[]; list.length = 0;
    expect(manager.getSlotFiles(0)).toHaveLength(1);
    await manager.restore(); expect(storage.read).toHaveBeenCalledTimes(1); manager.dispose();
  });
  it('atomically saves reassignment/deletion, modes and volumes; restores across manager lifetimes', async () => {
    const storage = new Storage(), manager = new BrowserAudioManager({ storage });
    await manager.restore(); manager.setSlotFiles(0, []); manager.setSlotFiles(45, [file('replacement.wav')]);
    manager.setSlotMode(45, { shuffle: true, loop: false, volume: .2 }); manager.setVolumes({ music: .6 });
    await manager.flushPersistence();
    expect(storage.write).toHaveBeenCalledTimes(1); const snapshot = storage.value as StoredAudio;
    expect(snapshot.slots[0].files).toEqual([]); expect(snapshot.slots[45].files[0].name).toBe('replacement.wav');
    manager.dispose();
    // A fresh adapter over the same persisted record.
    const secondStorage = new Storage(); secondStorage.value = snapshot;
    const second = new BrowserAudioManager({ storage: secondStorage }); await second.restore();
    expect(second.getState().slots[45]).toMatchObject({ shuffle: true, loop: false, volume: .2 });
    expect(second.getSlotFiles(0)).toEqual([]); expect(second.volumes.music).toBe(.6); second.dispose();
  });
  it('never applies delayed restoration over newer local edits or after disposal', async () => {
    const storage = new Storage(), read = deferred<unknown>(); storage.read.mockReturnValue(read.promise);
    const manager = new BrowserAudioManager({ storage }); const restoring = manager.restore();
    manager.setSlotFiles(0, [file('new.wav')]); await manager.flushPersistence(); read.resolve(stored());
    expect(await restoring).toBe(false); expect(manager.getSlotFiles(0)[0].name).toBe('new.wav'); manager.dispose();
    const storage2 = new Storage(), late = deferred<unknown>(); storage2.read.mockReturnValue(late.promise);
    const disposed = new BrowserAudioManager({ storage: storage2 }), result = disposed.restore(); disposed.dispose(); late.resolve(stored());
    expect(await result).toBe(false); expect(disposed.getSlotFiles(0)).toEqual([]); expect(storage2.close).toHaveBeenCalledTimes(1);
    expect(storage2.read.mock.calls[0][0].aborted).toBe(true);
  });
  it('protects edits made before a restore call from stale disk data', async () => {
    const storage = new Storage(), manager = new BrowserAudioManager({ storage });
    manager.setVolumes({ sound: .1 }); expect(await manager.restore()).toBe(false); expect(storage.read).not.toHaveBeenCalled();
    await manager.flushPersistence(); manager.dispose();
  });
  it('coalesces rapid edits behind one write and saves only the latest snapshot next', async () => {
    const storage = new Storage(), first = deferred<void>(); storage.write.mockImplementationOnce(async () => first.promise);
    const manager = new BrowserAudioManager({ storage }); manager.setSlotFiles(0, [file('first')]); await flush();
    for (let i = 0; i < 100; i++) manager.setSlotFiles(0, [file(`last-${i}`)]);
    expect(storage.write).toHaveBeenCalledTimes(1); first.resolve(); await manager.flushPersistence();
    expect(storage.write).toHaveBeenCalledTimes(2); expect((storage.value as StoredAudio).slots[0].files[0].name).toBe('last-99'); manager.dispose();
  });
  it('reports failures without undoing files, retries after another edit, and cancels pending writes on disposal', async () => {
    const storage = new Storage(), onError = vi.fn(); storage.write.mockRejectedValueOnce(new Error('quota'));
    const manager = new BrowserAudioManager({ storage, onError }); manager.setSlotFiles(0, [file()]); await manager.flushPersistence();
    expect(manager.getSlotFiles(0)).toHaveLength(1); expect(manager.getState().persistence).toEqual({ status: 'error', error: 'quota' });
    manager.setSlotFiles(0, []); await manager.flushPersistence(); expect(manager.getState().persistence?.status).toBe('ready');
    const pending = deferred<void>(); storage.write.mockReturnValueOnce(pending.promise); manager.setVolumes({ sound: .2 }); await flush();
    manager.dispose(); expect(storage.write.mock.calls.at(-1)![1].aborted).toBe(true); pending.resolve(); await manager.flushPersistence();
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed/oversized restored records atomically and permits retry', async () => {
    const storage = new Storage(); storage.value = { ...stored(), slots: [...stored().slots, ...stored().slots] };
    const manager = new BrowserAudioManager({ storage }); expect(await manager.restore()).toBe(false); expect(manager.volumes.music).toBe(1);
    storage.value = stored(); expect(await manager.restore()).toBe(true); manager.dispose();
    expect(() => validateStoredAudio({ ...stored(), slots: Array(47).fill(stored().slots[0]) }, 46)).toThrow();
    const large = file(); Object.defineProperty(large, 'size', { value: AUDIO_FILE_LIMITS.perFileBytes + 1 });
    expect(() => validateStoredAudio({ ...stored(), slots: [{ ...stored().slots[0], files: [large] }] }, 46)).toThrow();
    const nine = { ...stored(), slots: [{ ...stored().slots[0], files: Array(9).fill(file()) }] };
    expect(() => validateStoredAudio(nine, 46)).toThrow();
  });
  it('enforces aggregate count/bytes and per-file limits before mutating a playlist', () => {
    const manager = new BrowserAudioManager({ storage: false }), big = file(); Object.defineProperty(big, 'size', { value: 64 * 1024 * 1024 });
    manager.setSlotFiles(0, [big, big, big, big]); expect(() => manager.setSlotFiles(1, [file()])).toThrow('Total');
    expect(manager.getSlotFiles(1)).toEqual([]); manager.setSlotFiles(0, []);
    for (let i = 0; i < 32; i++) manager.setSlotFiles(i, Array(8).fill(file()));
    expect(() => manager.setSlotFiles(32, [file()])).toThrow('Total'); manager.dispose();
  });
});
