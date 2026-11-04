import { afterEach, expect, it, vi } from 'vitest';
import { BrowserAudioManager } from '../src/features/audio';
import { renderAudioFeature } from '../src/ui/extra/audio';
import type { AudioAction } from '../src/features/audio';
import { TestDocument, findButton } from './ui-dom-fixture';
import type { TestNode } from './ui-dom-fixture';
afterEach(() => vi.unstubAllGlobals());
it('renders 46 local file inputs inertly and dispatches activation synchronously', () => {
  vi.stubGlobal('document', new TestDocument()); const contextFactory = vi.fn();
  const manager = new BrowserAudioManager({ contextFactory }); const dispatch = vi.fn();
  const root = renderAudioFeature(manager.getState(), dispatch) as unknown as TestNode;
  expect(contextFactory).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
  expect(root.querySelectorAll('input').filter(n => n.type === 'file')).toHaveLength(46);
  findButton(root, 'Enable audio').onclick!({}); expect(dispatch).toHaveBeenLastCalledWith({ type: 'activate' });
  findButton(root, 'Stop audio').onclick!({}); expect(dispatch).toHaveBeenLastCalledWith({ type: 'stop' });
  findButton(root, 'Play').onclick!({}); expect(dispatch).toHaveBeenLastCalledWith({ type: 'play-slot', slot: 0 }); manager.dispose();
});
it('dispatches local files and independent volumes and uses literal filenames', () => {
  vi.stubGlobal('document', new TestDocument()); const manager = new BrowserAudioManager(); const actions: AudioAction[] = [];
  manager.setSlotFiles(0, [new File(['x'], '<img src=x>.ogg')]);
  const root = renderAudioFeature(manager.getState(), a => { actions.push(a); }) as unknown as TestNode;
  expect(root.textContent).toContain('<img src=x>.ogg'); expect(root.querySelectorAll('img')).toHaveLength(0);
  const inputs = root.querySelectorAll('input'); const local = inputs.find(n => n.type === 'file')!;
  const files = [new File(['x'], 'next.mp3')]; (local as any).files = files; local.onchange!({});
  expect(actions[0]).toEqual({ type: 'set-slot-files', slot: 0, files }); expect(local.value).toBe('');
  const volume = inputs.find(n => n.type === 'range')!; volume.value = '.4'; volume.oninput!({});
  expect(actions[1]).toEqual({ type: 'set-volumes', music: .4 }); manager.dispose();
});
it('can discard/recreate manager controls without activating or adding global listeners', () => {
  vi.stubGlobal('document', new TestDocument()); const globalListener = vi.fn(); vi.stubGlobal('addEventListener', globalListener);
  const contextFactory = vi.fn(), manager = new BrowserAudioManager({ contextFactory });
  renderAudioFeature(manager).remove(); const root = renderAudioFeature(manager) as unknown as TestNode;
  expect(contextFactory).not.toHaveBeenCalled(); expect(globalListener).not.toHaveBeenCalled();
  const input = root.querySelectorAll('input').find(n => n.type === 'file')!;
  (input as any).files = [new File(['x'], 'kept.wav')]; input.onchange!({});
  expect(manager.getSlotFiles(0)[0].name).toBe('kept.wav'); expect(root.textContent).toContain('kept.wav'); manager.dispose();
});
