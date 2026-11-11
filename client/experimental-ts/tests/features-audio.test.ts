import { describe, expect, it, vi } from 'vitest';
import { AUDIO_SLOTS, BrowserAudioManager } from '../src/features/audio';
class Media {
  src = ''; preload = ''; loop = false; volume = 1; paused = true;
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  play = vi.fn(async () => { this.paused = false; }); pause = vi.fn(() => { this.paused = true; });
  load = vi.fn(); removeAttribute = vi.fn(() => { this.src = ''; });
}
class Source {
  buffer: AudioBuffer | null = null; onended: (() => void) | null = null;
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
function setup(budget = 1024, configureMedia?: (media: Media) => void) {
  const media: Media[] = [], sources: Source[] = [];
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = { state: 'suspended', destination: {},
    resume: vi.fn(async () => { context.state = 'running'; }), close: vi.fn(async () => { context.state = 'closed'; }),
    createGain: vi.fn(() => gain), createBufferSource: vi.fn(() => { const s = new Source(); sources.push(s); return s; }),
    decodeAudioData: vi.fn(async () => ({ length: 16, numberOfChannels: 1 }) as AudioBuffer),
  };
  const read = vi.fn(async (_path: string, _signal?: AbortSignal) => new Uint8Array([1, 2, 3]));
  const create = vi.fn(() => `blob:audio-${media.length}`), revoke = vi.fn(), onError = vi.fn();
  const contextFactory = vi.fn(() => context as unknown as AudioContext);
  const manager = new BrowserAudioManager({ maxDecodedBytes: budget, archive: { read }, contextFactory,
    audioFactory: () => { const a = new Media(); configureMedia?.(a); media.push(a); return a as unknown as HTMLAudioElement; },
    createObjectURL: create, revokeObjectURL: revoke, onError });
  return { manager, media, sources, gain, context, contextFactory, read, create, revoke, onError };
}
const file = (name = 'local.ogg'): File => new File(['music'], name, { type: 'audio/ogg' });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
describe('scene music lifecycle', () => {
  it('has 46 immutable original slots', () => {
    expect(AUDIO_SLOTS).toHaveLength(46); expect(AUDIO_SLOTS[22].loop).toBe(true); expect(AUDIO_SLOTS[28].loop).toBe(false);
    expect(AUDIO_SLOTS[45].id).toBe('field_other'); expect(Object.isFrozen(AUDIO_SLOTS[0])).toBe(true);
  });
  it('does no work before activation and remembers only the latest scene', async () => {
    const s = setup(); s.manager.setSlotFiles(0, [file()]); s.manager.setSlotFiles(3, [file('login.ogg')]);
    expect(await s.manager.playSlot(0)).toBe(false); await s.manager.playSlot(3); expect(await s.manager.playEffect('se/click.wav')).toBe(false);
    expect(s.contextFactory).not.toHaveBeenCalled(); expect(s.create).not.toHaveBeenCalled(); expect(s.read).not.toHaveBeenCalled();
    await s.manager.activate(); expect(s.media).toHaveLength(1); expect(s.manager.currentSlot).toBe(3); expect(s.media[0].loop).toBe(true); s.manager.dispose();
  });
  it('preserves duel base for empty layers and leaves empty jingles alone', async () => {
    const s = setup(); s.manager.setSlotFiles(11, [file()]); await s.manager.activate(); await s.manager.playSlot(11);
    await s.manager.playSlot(24); await s.manager.playSlot(30); await s.manager.playSlot(21);
    expect(s.media).toHaveLength(1); expect(s.manager.currentSlot).toBe(30);
    await s.manager.playSlot(0); expect(s.revoke).toHaveBeenCalledTimes(1); expect(s.media[0].paused).toBe(true); s.manager.dispose();
  });
  it('replaces files, revokes URLs and avoids restart on repeated scene requests', async () => {
    const s = setup(); s.manager.setSlotFiles(1, [file()]); await s.manager.activate(); await s.manager.playSlot(1);
    s.manager.setSlotFiles(1, [file('new.ogg')]); await flush(); expect(s.revoke).toHaveBeenCalledTimes(1); expect(s.media).toHaveLength(2);
    await s.manager.playSlot(1); expect(s.media).toHaveLength(2); s.manager.setSlotFiles(1, []); expect(s.revoke).toHaveBeenCalledTimes(2);
    expect(s.media[1].onended).toBeNull(); expect(s.media[1].load).toHaveBeenCalled(); s.manager.dispose();
  });
  it('advances ordered nonlooping playlists then releases the final URL', async () => {
    const s = setup(); s.manager.setSlotFiles(2, [file('a'), file('b')]); await s.manager.activate(); await s.manager.playSlot(2);
    expect(s.media[0].loop).toBe(false); s.media[0].onended!(); await flush(); expect(s.media).toHaveLength(2);
    s.media[1].onended!(); await flush(); expect(s.media).toHaveLength(2); expect(s.revoke).toHaveBeenCalledTimes(2); s.manager.dispose();
  });
  it('wraps looping playlists and bounds skips on errors', async () => {
    const s = setup(); s.manager.setSlotFiles(0, [file('a'), file('b')]); await s.manager.activate(); await s.manager.playSlot(0);
    s.media[0].onended!(); await flush(); s.media[1].onended!(); await flush(); expect(s.media).toHaveLength(3);
    s.media[2].onerror!(); await flush(); s.media[3].onerror!(); await flush();
    expect(s.media).toHaveLength(4); expect(s.revoke).toHaveBeenCalledTimes(4); s.manager.dispose();
  });
  it('validates limits atomically and returns detached state', () => {
    const s = setup(), a = file(); s.manager.setSlotFiles(0, [a]);
    expect(() => s.manager.setSlotFiles(0, Array(65).fill(a))).toThrow(); expect(() => s.manager.setSlotFiles(46, [])).toThrow();
    expect(() => s.manager.setVolumes({ music: .5, sound: NaN })).toThrow(); expect(s.manager.volumes.music).toBe(1);
    const state = s.manager.getState(); (state.slots[0].files as string[]).push('bad'); expect(s.manager.getState().slots[0].files).toEqual([a.name]); s.manager.dispose();
  });
  it('starts media within the activation gesture before resume resolves', async () => {
    const s = setup(); let resume!: () => void;
    s.context.resume.mockImplementationOnce(() => new Promise<void>(ok => { resume = () => { s.context.state = 'running'; ok(); }; }));
    s.manager.setSlotFiles(0, [file()]); await s.manager.playSlot(0);
    const activation = s.manager.activate();
    expect(s.media[0].play).toHaveBeenCalledTimes(1); resume(); expect(await activation).toBe(true); s.manager.dispose();
  });
  it('ignores a stale media play rejection after a scene transition', async () => {
    let reject!: (error: Error) => void, count = 0;
    const s = setup(1024, media => { if (++count === 1) media.play.mockImplementationOnce(() => new Promise<void>((_ok, bad) => { reject = bad; })); });
    s.manager.setSlotFiles(0, [file()]); s.manager.setSlotFiles(1, [file()]); await s.manager.activate();
    const old = s.manager.playSlot(0); await s.manager.playSlot(1); reject(new Error('stale'));
    expect(await old).toBe(false); expect(s.media[1].paused).toBe(false); expect(s.onError).not.toHaveBeenCalled(); s.manager.dispose();
  });
  it('does not restart a completed jingle when the same scene repeats', async () => {
    const s = setup(); s.manager.setSlotFiles(2, [file()]); await s.manager.activate(); await s.manager.playSlot(2);
    s.media[0].onended!(); await flush(); expect(await s.manager.playSlot(2)).toBe(false); expect(s.media).toHaveLength(1); s.manager.dispose();
  });
});
describe('effect resources', () => {
  it('normalizes original effect paths, shares decoded buffers and ducks music', async () => {
    const s = setup(); s.manager.setSlotFiles(0, [file()]); await s.manager.activate(); await s.manager.playSlot(0);
    expect(await s.manager.playEffect('SE\\CLICK.WAV')).toBe(true); expect(await s.manager.playEffect('se/click.wav')).toBe(true);
    expect(s.read).toHaveBeenCalledTimes(1); expect(s.read.mock.calls[0][0]).toBe('se/click.wav'); expect(s.media[0].volume).toBe(.35);
    s.manager.setVolumes({ music: .5, sound: .2 }); expect(s.gain.gain.value).toBe(.2); expect(s.media[0].volume).toBe(.175);
    s.sources[0].onended!(); expect(s.media[0].volume).toBe(.175); s.sources[1].onended!(); expect(s.media[0].volume).toBe(.5);
    expect(s.sources[0].buffer).toBeNull(); s.manager.dispose();
  });
  it('evicts idle buffers within budget while protecting active buffers', async () => {
    const s = setup(64); await s.manager.activate(); expect(await s.manager.playEffect('se/a.wav')).toBe(true);
    expect(await s.manager.playEffect('se/b.wav')).toBe(false); expect(s.manager.decodedBytes).toBe(64);
    s.sources[0].onended!(); expect(await s.manager.playEffect('se/b.wav')).toBe(true); expect(s.manager.decodedBytes).toBe(64);
    s.sources[1].onended!(); await s.manager.playEffect('se/a.wav'); expect(s.read).toHaveBeenCalledTimes(4); s.manager.dispose();
  });
  it('caps active voices and skips muted work', async () => {
    const s = setup(); await s.manager.activate(); s.manager.setVolumes({ sound: 0 }); expect(await s.manager.playEffect('se/a.wav')).toBe(false); expect(s.read).not.toHaveBeenCalled();
    s.manager.setVolumes({ sound: 1 }); for (let i = 0; i < 16; i++) expect(await s.manager.playEffect('se/a.wav')).toBe(true);
    expect(await s.manager.playEffect('se/a.wav')).toBe(false); expect(s.sources).toHaveLength(16); s.manager.stop();
    expect(s.sources.every(source => source.stop.mock.calls.length === 1 && source.buffer === null)).toBe(true); s.manager.dispose();
  });
  it('serializes decoding, shares in-flight duplicates and bounds pending requests', async () => {
    const s = setup(); await s.manager.activate(); let complete!: (b: AudioBuffer) => void;
    s.context.decodeAudioData.mockImplementationOnce(() => new Promise(ok => { complete = ok; }));
    const a = s.manager.playEffect('se/a.wav'), duplicate = s.manager.playEffect('se/a.wav');
    const b = s.manager.playEffect('se/b.wav'), c = s.manager.playEffect('se/c.wav'), d = s.manager.playEffect('se/d.wav');
    expect(await s.manager.playEffect('se/e.wav')).toBe(false); await flush(); expect(s.read).toHaveBeenCalledTimes(1);
    complete({ length: 16, numberOfChannels: 1 } as AudioBuffer); expect(await Promise.all([a, duplicate, b, c, d])).toEqual([true, true, true, true, true]);
    expect(s.read).toHaveBeenCalledTimes(4); s.manager.dispose();
  });
  it('cancels delayed playback on stop and disposes resources idempotently', async () => {
    const s = setup(); await s.manager.activate(); let complete!: (b: AudioBuffer) => void;
    s.context.decodeAudioData.mockImplementationOnce(() => new Promise(ok => { complete = ok; }));
    const effect = s.manager.playEffect('se/a.wav'); await flush(); s.manager.stop(); complete({ length: 16, numberOfChannels: 1 } as AudioBuffer);
    expect(await effect).toBe(false); expect(s.sources).toHaveLength(0); expect(await s.manager.playEffect('se/a.wav')).toBe(true);
    const signal = s.read.mock.calls[0][1] as AbortSignal; s.manager.dispose(); s.manager.dispose();
    expect(signal.aborted).toBe(true); expect(s.context.close).toHaveBeenCalledTimes(1); expect(s.manager.decodedBytes).toBe(0);
    expect(s.gain.disconnect).toHaveBeenCalledTimes(1); await expect(s.manager.playEffect('se/a.wav')).rejects.toThrow('disposed');
  });
  it('rejects unsafe/non-effect paths, retries decode errors and rejects oversized buffers', async () => {
    const s = setup(); await s.manager.activate(); await expect(s.manager.playEffect('../se/a.wav')).rejects.toThrow(); await expect(s.manager.playEffect('bgm/a.wav')).rejects.toThrow();
    s.context.decodeAudioData.mockRejectedValueOnce(new Error('codec')); expect(await s.manager.playEffect('se/a.wav')).toBe(false); expect(await s.manager.playEffect('se/a.wav')).toBe(true); s.manager.dispose();
    const small = setup(32); await small.manager.activate(); expect(await small.manager.playEffect('se/a.wav')).toBe(false); expect(small.manager.decodedBytes).toBe(0); small.manager.dispose();
  });
});
it('reads an actual Sound.dat range directory through ArchiveReader without owning an injected reader', async () => {
  const { ArchiveReader } = await import('../src/assets/archive');
  const bytes = new Uint8Array(283), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('KCEJYUGI')); view.setUint32(8, 1, true);
  for (const [i, ch] of [...'SE\\CLICK.WAV'].entries()) { const b = ch.charCodeAt(0); bytes[12 + i] = ((b & 15) << 4) | (b >> 4); }
  view.setUint32(268, 280, true); view.setUint32(272, 3, true); view.setUint32(276, 3, true); bytes.set([1, 2, 3], 280);
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!;
    return new Response(bytes.slice(Number(a), Number(b) + 1), { status: 206, headers: {
      'Content-Range': `bytes ${a}-${b}/${bytes.length}`, 'Content-Length': String(Number(b) - Number(a) + 1),
    } });
  });
  const archive = new ArchiveReader('/supplied/Sound.dat', fetcher), dispose = vi.spyOn(archive, 'dispose');
  const s = setup(); const manager = new BrowserAudioManager({ archive, contextFactory: () => s.context as unknown as AudioContext });
  await manager.activate(); expect(await manager.playEffect('se/click.wav')).toBe(true); expect(fetcher).toHaveBeenCalledTimes(3);
  manager.dispose(); expect(dispose).not.toHaveBeenCalled(); archive.dispose(); s.manager.dispose();
});
it('does not retain or play decoded results that complete after disposal', async () => {
  const s = setup(); await s.manager.activate(); let complete!: (b: AudioBuffer) => void;
  s.context.decodeAudioData.mockImplementationOnce(() => new Promise(ok => { complete = ok; }));
  const effect = s.manager.playEffect('se/a.wav'); await flush(); s.manager.dispose();
  complete({ length: 16, numberOfChannels: 1 } as AudioBuffer);
  expect(await effect).toBe(false); expect(s.manager.decodedBytes).toBe(0); expect(s.sources).toHaveLength(0);
});
