import { BrowserAudioManager } from '../../features/audio';
import type { AudioAction, AudioState } from '../../features/audio';
export type AudioDispatch = (action: AudioAction) => void | Promise<void>;
/** Pure state/dispatch form. Dispatch must run synchronously in the event handler. */
export function renderAudioFeature(state: AudioState, dispatch: AudioDispatch): HTMLElement;
/** Convenience form. Discarding this DOM tree needs no cleanup; app owns manager disposal. */
export function renderAudioFeature(manager: BrowserAudioManager): HTMLElement;
export function renderAudioFeature(source: AudioState | BrowserAudioManager, dispatch?: AudioDispatch): HTMLElement {
  const manager = source instanceof BrowserAudioManager ? source : undefined;
  const state = manager ? manager.getState() : source as AudioState;
  const send = dispatch ?? ((action: AudioAction) => manager!.dispatch(action));
  const root = document.createElement('section'); root.setAttribute('aria-label', 'Audio settings');
  const title = document.createElement('h2'); title.textContent = 'Audio'; root.append(title);
  const note = document.createElement('p');
  note.textContent = 'Choose local audio for each scene. Files stay on this device and must be selected again after reload. Up to 8 files per slot, played in order.';
  root.append(note);
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const act = (action: AudioAction): void => {
    try {
      // Call immediately, preserving browser user activation for AudioContext.resume().
      void Promise.resolve(send(action)).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); });
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
  };
  const button = (text: string, action: () => void): HTMLButtonElement => {
    const result = document.createElement('button'); result.type = 'button'; result.textContent = text; result.onclick = action; return result;
  };
  root.append(button('Enable audio', () => act({ type: 'activate' })), button('Stop audio', () => act({ type: 'stop' })));
  for (const kind of ['music', 'sound'] as const) {
    const label = document.createElement('label'); label.textContent = kind === 'music' ? 'Music volume ' : 'Sound effects volume ';
    const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.01'; input.value = String(state[kind]);
    input.oninput = () => act({ type: 'set-volumes', [kind]: Number(input.value) }); label.append(input); root.append(label);
  }
  for (const slot of state.slots) {
    const row = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = `${slot.slot}: ${slot.label}`;
    const label = document.createElement('label'); label.textContent = 'Local files ';
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'audio/*'; input.multiple = true;
    const names = document.createElement('span'); names.textContent = slot.files.join(', ') || 'No files selected';
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      act({ type: 'set-slot-files', slot: slot.slot, files });
      // State/dispatch callers rerender from authoritative state; imperative callers update locally.
      if (manager) names.textContent = manager.getSlotFiles(slot.slot).map(file => file.name).join(', ') || 'No files selected';
      input.value = '';
    };
    label.append(input); row.append(legend, label, names,
      button('Play', () => act({ type: 'play-slot', slot: slot.slot })),
      button('Clear', () => { act({ type: 'set-slot-files', slot: slot.slot, files: [] }); if (manager) names.textContent = 'No files selected'; }));
    root.append(row);
  }
  root.append(status); return root;
}
