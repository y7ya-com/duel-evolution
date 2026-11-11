// DUEL OPTIONS and Audio (the Main Menu's, the original's COptionDlg): main has no module for either, so both are built
// here in main's Legacy look, the Main Menu's list windows' frame (windows.ts listWindow, title-config.ts: the duel
// frame, the shadow-text title on 4, duel buttons), each option a row of main's text switches (checked = chosen).
// The rewrite's own options (fullscreen, language, motion, card names) sit in the same rows; game data, recording and
// the local audio files keep the rewrite's Options page, opened from "More Options". Pure: no DOM.
import { GAME_LANGUAGES, type GameLanguage } from '../../features/language';
import type { SettingsView } from '../contracts';
import { Ids, WindowBuilder } from './snapshot';
import type { WindowSpec } from './snapshot';

export interface OptionsUi { kind: 'options' | 'audio' }
export interface OptionsDeps {
  settings: SettingsView;
  fullscreen?: { active: boolean; supported: boolean; pending: boolean; toggle(): void };
  /** The audio manager's own volumes (extra/audio.ts) and whether it plays. */
  audio?: { music: number; sound: number; activated: boolean; slots: readonly { slot: number; label: string; files: readonly string[] }[] };
  languageReady?: boolean;
  busy?: boolean;
  set(settings: Partial<SettingsView>): void;
  audioAction?(action: { type: 'activate' } | { type: 'stop' } | { type: 'play-slot'; slot: number } | { type: 'set-volumes'; music?: number; sound?: number }): void;
  /** The rewrite's full Options page (game data, recording, local audio files). */
  more(): void;
  close(): void;
}
const W = 600, X = 212;
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const step = (v: number, d: number) => Math.round(Math.max(0, Math.min(1, v + d)) * 20) / 20;

function frame(ids: Ids, key: string, cls: string, title: string, rows: number) {
  const h = 72 + rows * 32, y = Math.round((768 - h) / 2);
  const b = new WindowBuilder(ids, key, cls, { x: X, y, w: W, h }, { z: 51453, modal: true });
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: W, h: 16 }, { text: title, align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  let row = 0;
  const label = (text: string) => b.add('CWindowTaskShadowText', `l${row}`, { x: 20, y: 36 + row * 32 + 4, w: 180, h: 16 }, { text, align: 0, fontSize: 16, color: [1, 1, 1, 1] });
  const sw = (name: string, x: number, w: number, text: string, key: string, checked: boolean, run: (() => void) | null) =>
    b.add('CWindowTaskTextSwitch', name, { x, y: 36 + row * 32, w, h: 24 }, { label: text, align: 1, state: run ? 'normal' : 'disabled', checked, color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const next = () => { row++; };
  const button = (name: string, x: number, w: number, text: string, key: string, run: (() => void) | null) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: h - 32, w, h: 24 }, { label: text, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  return { b, label, sw, next, button };
}

/** A volume row: Down / the level / Up, main's text switches. */
function volumeRow(f: ReturnType<typeof frame>, name: string, key: string, value: number, set: ((v: number) => void) | null): void {
  f.label(name);
  f.sw(`${key}-down`, 220, 60, '-', `${key}-down`, false, set && value > 0 ? () => set(step(value, -0.1)) : null);
  f.sw(`${key}-level`, 290, 80, pct(value), `${key}-level`, true, null);
  f.sw(`${key}-up`, 380, 60, '+', `${key}-up`, false, set && value < 1 ? () => set(step(value, 0.1)) : null);
  f.next();
}

export function optionsWindow(ids: Ids, d: OptionsDeps): WindowSpec {
  const f = frame(ids, 'options', 'COptionDlg', 'DUEL OPTIONS', 6);
  const s = d.settings, on = (key: 'reducedMotion' | 'showCardNames', value: boolean) => () => d.set({ [key]: value });
  volumeRow(f, 'Sound effects', 'opt-sound', s.sound, v => d.set({ sound: v }));
  volumeRow(f, 'Background audio', 'opt-bg', s.music, v => d.set({ music: v }));
  f.label('Animation'); f.sw('motion-full', 220, 110, 'Full', 'opt-motion-full', !s.reducedMotion, on('reducedMotion', false)); f.sw('motion-reduced', 340, 110, 'Reduced', 'opt-motion-reduced', s.reducedMotion, on('reducedMotion', true)); f.next();
  f.label('Card names'); f.sw('names-on', 220, 110, 'Show', 'opt-names-on', s.showCardNames, on('showCardNames', true)); f.sw('names-off', 340, 110, 'Hide', 'opt-names-off', !s.showCardNames, on('showCardNames', false)); f.next();
  const fs = d.fullscreen;
  f.label('Display'); f.sw('fs-off', 220, 110, 'Windowed', 'opt-windowed', !!fs && !fs.active, fs?.supported && !fs.pending && fs.active ? () => fs.toggle() : null);
  f.sw('fs-on', 340, 110, 'Fullscreen', 'opt-fullscreen', !!fs?.active, fs?.supported && !fs.pending && !fs.active ? () => fs.toggle() : null); f.next();
  const current = s.language ?? 'E', at = GAME_LANGUAGES.findIndex(l => l.code === current), lang = GAME_LANGUAGES[Math.max(0, at)]!;
  const cycle = (dir: number) => () => { const n = GAME_LANGUAGES[(Math.max(0, at) + dir + GAME_LANGUAGES.length) % GAME_LANGUAGES.length]!; d.set({ language: n.code as GameLanguage }); };
  f.label('Language'); f.sw('lang-prev', 220, 40, '<', 'opt-lang-prev', false, d.languageReady && !d.busy ? cycle(-1) : null);
  f.sw('lang', 270, 140, lang.name, 'opt-lang', true, null); f.sw('lang-next', 420, 40, '>', 'opt-lang-next', false, d.languageReady && !d.busy ? cycle(1) : null); f.next();
  f.button('more', 150, 140, 'More Options', 'opt-more', () => d.more());
  f.button('close', 350, 100, 'Close', 'opt-close', () => d.close());
  return f.b.spec();
}

export function audioWindow(ids: Ids, d: OptionsDeps): WindowSpec {
  const a = d.audio, slots = a?.slots ?? [];
  const f = frame(ids, 'audio', 'COptionDlg', 'Audio', 3 + slots.length);
  const vol = (v: { music?: number; sound?: number }) => { if (v.music !== undefined) d.set({ music: v.music }); if (v.sound !== undefined) d.set({ sound: v.sound }); d.audioAction?.({ type: 'set-volumes', ...v }); };
  volumeRow(f, 'Background audio', 'au-bg', a?.music ?? d.settings.music, v => vol({ music: v }));
  volumeRow(f, 'Sound effects', 'au-sound', a?.sound ?? d.settings.sound, v => vol({ sound: v }));
  f.label('Playback'); f.sw('au-on', 220, 110, 'On', 'au-on', !!a?.activated, a && d.audioAction ? () => d.audioAction!({ type: 'activate' }) : null);
  f.sw('au-off', 340, 110, 'Off', 'au-off', !!a && !a.activated, a?.activated && d.audioAction ? () => d.audioAction!({ type: 'stop' }) : null); f.next();
  for (const slot of slots) {
    f.label(slot.label); f.sw(`au-files-${slot.slot}`, 220, 230, slot.files.length ? `${slot.files.length} file${slot.files.length > 1 ? 's' : ''}` : 'Game audio', `au-files-${slot.slot}`, slot.files.length > 0, null);
    f.sw(`au-play-${slot.slot}`, 460, 80, 'Play', `au-play-${slot.slot}`, false, d.audioAction ? () => d.audioAction!({ type: 'play-slot', slot: slot.slot }) : null); f.next();
  }
  f.button('more', 150, 140, 'Audio Files', 'au-more', () => d.more());
  f.button('close', 350, 100, 'Close', 'au-close', () => d.close());
  return f.b.spec();
}
