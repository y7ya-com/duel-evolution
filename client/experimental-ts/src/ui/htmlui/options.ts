// The two option windows live has. DUEL OPTIONS (the Main Menu's, the engine's CWindowModelDuelConfig): main's
// capture of it (mock/duelsetup-config.json) drawn by main's generic renderer: Auto Tracking ON / OFF, Auto Card Placing
// ON / OFF, Activation Message Auto Cancel / Semi Auto Cancel / Manual (picture switches, the checked one is the
// setting), the help text the engine writes for the hovered choice (yo2text 0x1982..0x1989), OK keeps the choices and
// Cancel drops them (the engine keeps a choice only on OK). The title's OPTIONS (the engine's COptionDlg): language,
// screen mode and volume, OK / Cancel. Pure: no DOM.
import duelConfigMock from '@htmlui/mock/duelsetup-config.json';
import { GAME_LANGUAGES, type GameLanguage } from '../../features/language';
import { duelOptions, type ActivationMessage, type DuelOptions, type SettingsView } from '../contracts';
import { Ids, WindowBuilder } from './snapshot';
import type { HtmlControl, WindowSpec } from './snapshot';

/** Which window is open; `draft` holds DUEL OPTIONS' unsaved choices, `hover` the choice whose help shows; the title's
 * window remembers the settings it opened with (Cancel puts them back). */
export interface OptionsUi { kind: 'options' | 'title' | 'audio'; draft?: DuelOptions; hover?: string | null; before?: Partial<SettingsView>; beforeFullscreen?: boolean }
export interface OptionsDeps {
  settings: SettingsView;
  fullscreen?: { active: boolean; supported: boolean; pending: boolean; toggle(): void };
  languageReady?: boolean;
  busy?: boolean;
  /** The original's UI texts by id (yo2text_?: the help lines), once read. */
  text?: (id: number) => string | undefined;
  set(settings: Partial<SettingsView>): void;
  close(): void;
  rerender(): void;
}

// yo2text: each choice's help (0x1982..0x1988), the help shown first (0x1989); English as the engine has it
const HELP: Record<string, [number, string]> = {
  'track-on': [0x1982, 'The Mouse cursor will automatically track any card that can be targetted or activated.'],
  'track-off': [0x1983, 'Your cursor will be set to manual.'],
  'place-on': [0x1984, 'The game will place the card on any available position for you.'],
  'place-off': [0x1985, 'You decide which position the card will go.'],
  'act-0': [0x1986, 'The game will automatically answer "NO" to and close all messages asking you to confirm the activation or positioning of cards.'],
  'act-1': [0x1987, 'The game will automatically answer "NO" to and close  messages asking you to confirm the activation or positioning of cards which are judged to be of low priority.'],
  'act-2': [0x1988, 'The game will show all messages asking you to confirm the activation or positioning of cards.'],
};
const HELP_FIRST: [number, string] = [0x1989, 'To skip these messages, hold the Right Mouse button at the appropriate times.'];
export const DUEL_OPTIONS_TEXTS = [...Object.values(HELP).map(([id]) => id), HELP_FIRST[0]];

type Art = Record<string, { shown: boolean } | null>;
const showArt = (c: HtmlControl, checked: boolean) => { c.checked = checked; const art = c.art as Art | undefined; if (art) for (const [k, v] of Object.entries(art)) if (v) v.shown = k === (checked ? 'checked' : 'normal'); };

/** DUEL OPTIONS (CWindowModelDuelConfig) at live's place: 266, 158, 492 x 452. */
export function duelConfigWindow(ids: Ids, ui: OptionsUi, d: OptionsDeps): WindowSpec {
  const win = duelConfigMock.windows[0]!;
  const b = new WindowBuilder(ids, 'duel-config', win.cls, { x: win.x, y: win.y, w: win.w, h: win.h }, { z: 51403, modal: true, topmost: true });
  // with the ShadowTexts' own text and shadow children, as the renderer draws them
  const controls = b.fromTemplate(win as unknown as { controls: Record<string, unknown>[] }, true);
  const draft = ui.draft ??= duelOptions(d.settings);
  // the choices by their place in the capture (the switch at x, y and its caption ShadowText 8 px lower)
  const CHOICES: { key: string; x: number; y: number; on: boolean; set: () => void }[] = [
    { key: 'track-on', x: 22, y: 53, on: draft.autoTracking, set: () => { draft.autoTracking = true; } },
    { key: 'track-off', x: 246, y: 53, on: !draft.autoTracking, set: () => { draft.autoTracking = false; } },
    { key: 'place-on', x: 22, y: 105, on: draft.autoPlacing, set: () => { draft.autoPlacing = true; } },
    { key: 'place-off', x: 246, y: 105, on: !draft.autoPlacing, set: () => { draft.autoPlacing = false; } },
    ...([0, 1, 2] as ActivationMessage[]).map(v => ({ key: `act-${v}`, x: [22, 246, 134][v]!, y: [157, 157, 198][v]!, on: draft.activationMessage === v, set: () => { draft.activationMessage = v; } })),
  ];
  const help = (key: string | null | undefined) => { const h = key ? HELP[key] : undefined; const [id, en] = h ?? HELP_FIRST; return d.text?.(id)?.trim() || en; };
  for (const c of controls) {
    if (c.cls === 'CWindowTaskPictureSwitch' && c.w >= 64) {
      const choice = CHOICES.find(x => x.x === c.x && x.y === c.y); if (!choice) continue;
      showArt(c, choice.on);
      const caption = controls.find(t => t.cls === 'CWindowTaskShadowText' && t.x === c.x && t.y === c.y + 8);
      b.on(c, { key: `duel-config:${choice.key}`, label: String(caption?.text ?? choice.key), click: () => { choice.set(); d.rerender(); },
        pointer: over => { const next = over ? choice.key : ui.hover === choice.key ? null : ui.hover ?? null; if (next !== ui.hover) { ui.hover = next; d.rerender(); } } });
    } else if (c.cls === 'CWindowTaskShadowText' && c.name === '説明') { const t = help(ui.hover); c.text = t; for (const k of controls) if (k.parent === c.id) k.text = t; }
    else if (c.cls === 'CWindowTaskButtonDuel' && c.label === 'OK') b.on(c, { key: 'duel-config-ok', click: () => { d.set({ ...draft }); d.close(); } });
    else if (c.cls === 'CWindowTaskButtonDuel' && c.label === 'Cancel') b.on(c, { key: 'duel-config-cancel', click: () => d.close() });
  }
  return b.spec();
}

// ---- the title's OPTIONS (COptionDlg): language, screen mode, volume; OK keeps them, Cancel puts back what was there
const W = 600, X = 212;
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const step = (v: number, dv: number) => Math.round(Math.max(0, Math.min(1, v + dv)) * 20) / 20;
export function titleOptionsWindow(ids: Ids, ui: OptionsUi, d: OptionsDeps): WindowSpec {
  const s = d.settings, fs = d.fullscreen;
  ui.before ??= { sound: s.sound, language: s.language ?? 'E' }; ui.beforeFullscreen ??= !!fs?.active;
  const h = 72 + 3 * 32, y = Math.round((768 - h) / 2);
  const b = new WindowBuilder(ids, 'options', 'COptionDlg', { x: X, y, w: W, h }, { z: 51453, modal: true });
  b.add('CWindowTaskFrameDuel', 'frame', { x: 0, y: 0, w: 0, h: 0 });
  b.add('CWindowTaskShadowText', 'title', { x: 0, y: 4, w: W, h: 16 }, { text: 'OPTIONS', align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  let row = 0;
  const label = (text: string) => b.add('CWindowTaskShadowText', `l${row}`, { x: 20, y: 40 + row * 32, w: 180, h: 16 }, { text, align: 0, fontSize: 16, color: [1, 1, 1, 1] });
  const sw = (name: string, x: number, w: number, text: string, key: string, checked: boolean, run: (() => void) | null) =>
    b.add('CWindowTaskTextSwitch', name, { x, y: 36 + row * 32, w, h: 24 }, { label: text, align: 1, state: run ? 'normal' : 'disabled', checked, color: [0, 0, 0, 1] }, { key, click: () => run?.() });
  const current = s.language ?? 'E', at = GAME_LANGUAGES.findIndex(l => l.code === current), lang = GAME_LANGUAGES[Math.max(0, at)]!;
  const cycle = (dir: number) => () => { const n = GAME_LANGUAGES[(Math.max(0, at) + dir + GAME_LANGUAGES.length) % GAME_LANGUAGES.length]!; d.set({ language: n.code as GameLanguage }); };
  label('Language'); sw('lang-prev', 220, 40, '<', 'opt-lang-prev', false, d.languageReady && !d.busy ? cycle(-1) : null);
  sw('lang', 270, 140, lang.name, 'opt-lang', true, null); sw('lang-next', 420, 40, '>', 'opt-lang-next', false, d.languageReady && !d.busy ? cycle(1) : null); row++;
  label('Screen'); sw('fs-on', 220, 110, 'Full screen', 'opt-fullscreen', !!fs?.active, fs?.supported && !fs.pending && !fs.active ? () => fs.toggle() : null);
  sw('fs-off', 340, 110, 'Window', 'opt-windowed', !!fs && !fs.active, fs?.supported && !fs.pending && fs.active ? () => fs.toggle() : null); row++;
  label('Volume'); sw('vol-down', 220, 60, '-', 'opt-sound-down', false, s.sound > 0 ? () => d.set({ sound: step(s.sound, -0.1) }) : null);
  sw('vol-level', 290, 80, pct(s.sound), 'opt-sound-level', true, null);
  sw('vol-up', 380, 60, '+', 'opt-sound-up', false, s.sound < 1 ? () => d.set({ sound: step(s.sound, 0.1) }) : null); row++;
  const button = (name: string, x: number, text: string, key: string, run: () => void) =>
    b.add('CWindowTaskButtonDuel', name, { x, y: h - 32, w: 140, h: 24 }, { label: text, align: 1, state: 'normal', color: [0, 0, 0, 1] }, { key, click: run });
  button('ok', 130, 'OK', 'opt-ok', () => d.close());
  button('cancel', 330, 'Cancel', 'opt-cancel', () => {
    const before = ui.before!, back: Partial<SettingsView> = {};
    if (before.sound !== s.sound) back.sound = before.sound!;
    if ((before.language ?? 'E') !== current) back.language = before.language!;
    if (Object.keys(back).length) d.set(back);
    if (fs && fs.active !== ui.beforeFullscreen && fs.supported && !fs.pending) fs.toggle();
    d.close();
  });
  return b.spec();
}
