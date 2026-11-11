// DUEL OPTIONS and Audio (the Main Menu's, the original's COptionDlg): main has no module for either, so both are built
// here in main's Legacy look, the Main Menu's list windows' frame (windows.ts listWindow, title-config.ts: the duel
// frame, the shadow-text title on 4, duel buttons), each option a row of main's text switches (checked = chosen).
// The rewrite's own options (fullscreen, language, motion, card names) sit in the same rows; game data, recording and
// the local audio files keep the rewrite's Options page, opened from "More Options". Pure: no DOM.
import { GAME_LANGUAGES, type GameLanguage } from '../../features/language';
import type { SettingsView } from '../contracts';
import type { AudioAction } from '../../features/audio';
import type { AudioPackPlan } from '../../features/audio-pack';
import { Ids, WindowBuilder } from './snapshot';
import type { WindowSpec } from './snapshot';

export interface OptionsUi { kind: 'options' | 'audio' }
export interface OptionsDeps {
  settings: SettingsView;
  fullscreen?: { active: boolean; supported: boolean; pending: boolean; toggle(): void };
  /** The audio manager's own volumes (extra/audio.ts) and whether it plays. */
  audio?: { music: number; sound: number; activated: boolean; slots: readonly { slot: number; label: string; files: readonly string[]; shuffle?: boolean; loop?: boolean; volume?: number }[] };
  languageReady?: boolean;
  busy?: boolean;
  set(settings: Partial<SettingsView>): void;
  audioAction?(action: AudioAction): void;
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
  const text = (value: string, x: number, w: number) => b.add('CWindowTaskShadowText', `t${row}`, { x, y: 36 + row * 32 + 4, w, h: 16 }, { text: value, align: 0, fontSize: 16, color: [1, 1, 1, 1] });
  const button = (name: string, x: number, w: number, text: string, key: string, run: (() => void) | null) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: h - 32, w, h: 24 }, { label: text, align: 1, state: run ? 'normal' : 'disabled', color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  return { b, label, text, sw, next, button };
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

/** The Audio window's own state: the slot page, a pack under review (nothing changes until it is used), a message. */
export interface AudioUi { page: number; review?: AudioPackPlan | null; message?: string }
export const AUDIO_PAGE = 10;
export interface AudioWindowDeps extends OptionsDeps {
  ui: AudioUi;
  /** Opens the browser's file picker for a pack (.zip, a folder's files); the plan comes back as ui.review. */
  pickPack?(): void;
  /** Opens the file picker for one slot's playlist (the pack builder). */
  pickSlotFiles?(slot: number): void;
  rerender(): void;
}
type SlotView = NonNullable<OptionsDeps['audio']>['slots'][number] & { shuffle?: boolean; loop?: boolean; volume?: number };

/** Main Menu > Audio (live's Audio page, web/audiopage.js, in the Legacy window look): volumes and playback, the 46
 * slots a page at a time (each: its files, picked here, the pack builder; Shuffle, Repeat, its volume, Play), and the
 * pack buttons: Open Pack (a .zip, reviewed before use), Save Pack (the setup as a .zip, live's format), Clear All. */
export function audioWindow(ids: Ids, d: AudioWindowDeps): WindowSpec {
  if (d.ui.review) return packReviewWindow(ids, d, d.ui.review);
  const a = d.audio, slots = (a?.slots ?? []) as readonly SlotView[], act = d.audioAction;
  const pages = Math.max(1, Math.ceil(slots.length / AUDIO_PAGE)), page = Math.max(0, Math.min(pages - 1, d.ui.page));
  const shown = slots.slice(page * AUDIO_PAGE, page * AUDIO_PAGE + AUDIO_PAGE);
  const f = frame(ids, 'audio', 'COptionDlg', 'Audio', 4 + AUDIO_PAGE + (d.ui.message ? 1 : 0));
  const vol = (v: { music?: number; sound?: number }) => { if (v.music !== undefined) d.set({ music: v.music }); if (v.sound !== undefined) d.set({ sound: v.sound }); act?.({ type: 'set-volumes', ...v }); };
  volumeRow(f, 'Background audio', 'au-bg', a?.music ?? d.settings.music, v => vol({ music: v }));
  volumeRow(f, 'Sound effects', 'au-sound', a?.sound ?? d.settings.sound, v => vol({ sound: v }));
  f.label('Playback'); f.sw('au-on', 220, 110, 'On', 'au-on', !!a?.activated, a && act ? () => act({ type: 'activate' }) : null);
  f.sw('au-off', 340, 110, 'Off', 'au-off', !!a && !a.activated, a?.activated && act ? () => act({ type: 'stop' }) : null); f.next();
  for (const slot of shown) {
    const n = slot.slot, files = slot.files.length, mode = act as ((x: AudioAction) => void) | undefined, volume = slot.volume ?? 1;
    f.text(slot.label, 20, 172);
    f.sw(`au-files-${n}`, 196, 78, files ? `${files} file${files > 1 ? 's' : ''}` : 'Add', `au-files-${n}`, files > 0, d.pickSlotFiles ? () => d.pickSlotFiles!(n) : null);
    f.sw(`au-clear-${n}`, 277, 20, 'x', `au-clear-${n}`, false, files && act ? () => act({ type: 'set-slot-files', slot: n, files: [] }) : null);
    f.sw(`au-shuffle-${n}`, 301, 62, 'Shuffle', `au-shuffle-${n}`, !!slot.shuffle, mode ? () => mode({ type: 'set-slot-mode', slot: n, shuffle: !slot.shuffle }) : null);
    f.sw(`au-loop-${n}`, 366, 62, 'Repeat', `au-loop-${n}`, slot.loop !== false, mode ? () => mode({ type: 'set-slot-mode', slot: n, loop: slot.loop === false }) : null);
    f.sw(`au-vol-down-${n}`, 431, 18, '-', `au-vol-down-${n}`, false, mode && volume > 0 ? () => mode({ type: 'set-slot-mode', slot: n, volume: step(volume, -0.1) }) : null);
    f.sw(`au-vol-${n}`, 450, 44, pct(volume), `au-vol-${n}`, true, null);
    f.sw(`au-vol-up-${n}`, 495, 18, '+', `au-vol-up-${n}`, false, mode && volume < 1 ? () => mode({ type: 'set-slot-mode', slot: n, volume: step(volume, 0.1) }) : null);
    f.sw(`au-play-${n}`, 517, 63, 'Play', `au-play-${n}`, false, act ? () => act({ type: 'play-slot', slot: n }) : null); f.next();
  }
  for (let i = shown.length; i < AUDIO_PAGE; i++) f.next();
  const turn = (p: number) => () => { d.ui.page = p; d.rerender(); };
  f.sw('au-page-prev', 196, 40, '<', 'au-page-prev', false, page > 0 ? turn(page - 1) : null);
  f.sw('au-page', 240, 120, `Page ${page + 1} / ${pages}`, 'au-page', true, null);
  f.sw('au-page-next', 364, 40, '>', 'au-page-next', false, page < pages - 1 ? turn(page + 1) : null); f.next();
  if (d.ui.message) { f.text(d.ui.message, 20, 560); f.next(); }
  const any = slots.some(s => s.files.length);
  f.button('pack-open', 20, 110, 'Open Pack', 'au-pack-open', d.pickPack ? () => d.pickPack!() : null);
  f.button('pack-save', 138, 110, 'Save Pack', 'au-pack-save', act ? () => act({ type: 'export-pack' }) : null);
  f.button('clear-all', 256, 100, 'Clear All', 'au-clear-all', any && act ? () => act({ type: 'clear-all' }) : null);
  f.button('more', 364, 120, 'Audio Files', 'au-more', () => d.more());
  f.button('close', 492, 88, 'Close', 'au-close', () => d.close());
  return f.b.spec();
}

/** A pack's review (live's: what it covers; nothing changes until "Use this pack"). */
function packReviewWindow(ids: Ids, d: AudioWindowDeps, plan: AudioPackPlan): WindowSpec {
  const labels = new Map((d.audio?.slots ?? []).map(s => [s.slot, s.label]));
  const set = Object.keys(plan.slots).map(Number).sort((x, y) => x - y);
  const names = set.map(s => `${labels.get(s) ?? `Slot ${s}`}${plan.slots[s]!.files.length ? ` (${plan.slots[s]!.files.length})` : ' (empty)'}`);
  const lines: string[] = [];
  for (let i = 0; i < names.length; i += 3) lines.push(names.slice(i, i + 3).join(', '));
  const parts = lines.slice(0, 8);
  if (lines.length > 8) parts.push(`and ${names.length - 24} more`);
  const info = [plan.name && `Name: ${plan.name}`, plan.author && `By: ${plan.author}`, plan.description && plan.description.slice(0, 80)].filter(Boolean) as string[];
  const notes = [...plan.notes.slice(0, 3), ...(plan.unused.length ? [`${plan.unused.length} file${plan.unused.length > 1 ? 's' : ''} in the pack match no part: left out`] : [])];
  const f = frame(ids, 'audio', 'COptionDlg', 'Audio Pack', info.length + 1 + parts.length + notes.length + (d.ui.message ? 1 : 0));
  for (const line of info) { f.text(line, 20, 560); f.next(); }
  f.text(set.length ? `This pack sets ${set.length} part${set.length > 1 ? 's' : ''}:` : 'This pack has no audio for any part of the game.', 20, 560); f.next();
  for (const line of parts) { f.text(line, 36, 544); f.next(); }
  for (const line of notes) { f.text(line, 20, 560); f.next(); }
  if (d.ui.message) { f.text(d.ui.message, 20, 560); f.next(); }
  const use = (replace: boolean) => set.length && d.audioAction ? () => {
    d.ui.review = null; d.audioAction!({ type: 'apply-pack', slots: plan.slots, replace, ...(plan.master !== undefined ? { master: plan.master } : {}) }); d.rerender();
  } : null;
  f.button('pack-use', 60, 160, 'Use this pack', 'au-pack-use', use(false));
  f.button('pack-replace', 230, 160, 'Use it alone', 'au-pack-replace', use(true));
  f.button('pack-cancel', 400, 120, 'Cancel', 'au-pack-cancel', () => { d.ui.review = null; d.ui.message = undefined; d.rerender(); });
  return f.b.spec();
}
