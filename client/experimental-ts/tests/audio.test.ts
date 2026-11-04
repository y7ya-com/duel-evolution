import { expect, it, vi } from 'vitest';
import { BrowserAudioManager } from '../src/features/audio';
function setup(random = () => 0, playErrors: string[] = []) {
  const media: { src: string; loop: boolean; volume: number; paused: boolean; onended: (() => void) | null; onerror: (() => void) | null; play: ReturnType<typeof vi.fn>; pause: () => void; removeAttribute: () => void; load: () => void }[] = [];
  const files: Blob[] = [], revoked: string[] = [];
  const context = { state: 'running', destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}), createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }) };
  const manager = new BrowserAudioManager({ storage: false, random, contextFactory: () => context as unknown as AudioContext,
    audioFactory: () => {
      const element = { src: '', loop: false, volume: 1, paused: true, onended: null, onerror: null, play: vi.fn(async () => { const error = playErrors.shift(); if (error) throw new DOMException('play rejected', error); element.paused = false; }), pause() { element.paused = true; }, removeAttribute() { element.src = ''; }, load() {} };
      media.push(element); return element as unknown as HTMLAudioElement;
    }, createObjectURL: blob => { files.push(blob); return `blob:${files.length}`; }, revokeObjectURL: url => { revoked.push(url); } });
  return { manager, media, files, revoked, context };
}
const files = () => ['a', 'b', 'c'].map(name => new File(['local'], name));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
it('shuffles a permutation per cycle, sequential mode preserves selection order, volume-only edits do not restart', async () => {
  const s = setup(), list = files(); s.manager.setSlotFiles(0, list); s.manager.setSlotMode(0, { shuffle: true });
  await s.manager.activate(); await s.manager.playSlot(0);
  for (let i = 0; i < 5; i++) { s.media.at(-1)!.onended!(); await flush(); }
  expect(s.files.slice(0, 3)).toEqual([list[1], list[2], list[0]]);
  expect(new Set(s.files.slice(3, 6)).size).toBe(3);
  const count = s.media.length; s.manager.setSlotMode(0, { volume: .25 }); s.manager.setVolumes({ music: .4 });
  expect(s.media).toHaveLength(count); expect(s.media.at(-1)!.volume).toBe(.1);
  s.manager.setSlotMode(0, { shuffle: false, loop: false });
  expect(s.files.at(-1)).toBe(list[0]);
  for (let i = 0; i < 3; i++) { s.media.at(-1)!.onended!(); await flush(); }
  expect(s.files.slice(-3)).toEqual(list); expect(s.media.at(-1)!.paused).toBe(true);
  s.manager.dispose(); expect(s.revoked).toHaveLength(s.files.length);
});
it('restarts live loop-mode changes, loops a single selected file and bounds all-codec failures', async () => {
  const s = setup(); s.manager.setSlotFiles(2, files().slice(0, 1)); s.manager.setSlotMode(2, { loop: true });
  await s.manager.activate(); await s.manager.playSlot(2); expect(s.media[0].loop).toBe(true);
  s.manager.setSlotMode(2, { loop: false }); expect(s.media[1].loop).toBe(false);
  s.media[1].onended!(); await flush(); expect(s.media).toHaveLength(2);
  s.manager.setSlotFiles(0, files()); s.manager.setSlotMode(0, { shuffle: true }); await s.manager.playSlot(0);
  for (let i = 0; i < 3; i++) { s.media.at(-1)!.onerror!(); await flush(); }
  expect(s.media).toHaveLength(5); expect(s.media.at(-1)!.paused).toBe(true); s.manager.dispose();
});
it('ignores stale activation rejection after a later gesture succeeds', async () => {
  const s = setup(); let reject!: (error: Error) => void;
  s.context.resume.mockImplementationOnce(() => new Promise<void>((_ok, bad) => { reject = bad; }));
  s.manager.setSlotFiles(0, files()); await s.manager.playSlot(0);
  const old = s.manager.activate(); expect(await s.manager.activate()).toBe(true); reject(new Error('old resume'));
  expect(await old).toBe(false); expect(s.manager.isActivated).toBe(true); expect(s.media[0].paused).toBe(false); s.manager.dispose();
});
it('mode validation is atomic and rejected edits do not restart playback', async () => {
  const s = setup(); s.manager.setSlotFiles(0, files()); await s.manager.activate(); await s.manager.playSlot(0);
  expect(() => s.manager.setSlotMode(0, { loop: false, volume: NaN })).toThrow(); expect(s.manager.getState().slots[0].loop).toBe(true);
  expect(s.media).toHaveLength(1); s.manager.dispose();
});

it('skips unsupported-codec rejections but stops autoplay denial until another gesture', async () => {
  const codec = setup(() => 0, ['NotSupportedError']); codec.manager.setSlotFiles(0, files()); await codec.manager.activate();
  expect(await codec.manager.playSlot(0)).toBe(true); expect(codec.files).toHaveLength(2); expect(codec.revoked).toHaveLength(1); codec.manager.dispose();
  const denied = setup(() => 0, ['NotAllowedError']); denied.manager.setSlotFiles(0, files()); await denied.manager.activate();
  expect(await denied.manager.playSlot(0)).toBe(false); expect(denied.files).toHaveLength(1);
  await denied.manager.activate(); expect(denied.files).toHaveLength(2); expect(denied.media.at(-1)!.paused).toBe(false); denied.manager.dispose();
});
