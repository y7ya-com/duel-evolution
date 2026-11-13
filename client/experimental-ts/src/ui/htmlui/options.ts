// The two option windows live has. DUEL OPTIONS (the Main Menu's, the engine's CWindowModelDuelConfig): main's
// capture of it (mock/duelsetup-config.json) drawn by main's generic renderer: Auto Tracking ON / OFF, Auto Card Placing
// ON / OFF, Activation Message Auto Cancel / Semi Auto Cancel / Manual (picture switches, the checked one is the
// setting), the help text the engine writes for the hovered choice (yo2text 0x1982..0x1989), OK keeps the choices and
// Cancel drops them (the engine keeps a choice only on OK). The title's OPTIONS (the engine's COptionDlg, below): language
// flags, screen pictures and the volume slider, OK / Cancel. Pure: no DOM.
import duelConfigMock from './templates/duelsetup-config.json';
import { GAME_LANGUAGES, type GameLanguage } from '../../features/language';
import { duelOptions, type ActivationMessage, type DuelOptions, type SettingsView } from '../contracts';
import { Ids, WindowBuilder } from './snapshot';
import type { HtmlControl, WindowSpec } from './snapshot';

/** Which window is open; `draft` holds DUEL OPTIONS' unsaved choices, `hover` the choice whose help shows; the title's
 * window remembers the settings it opened with (Cancel puts them back). */
export interface OptionsUi { kind: 'options' | 'title' | 'audio'; draft?: DuelOptions; hover?: string | null; before?: Partial<SettingsView>; beforeFullscreen?: boolean;
  /** The title's OPTIONS: the flag and monitor chosen, kept on OK. */
  title?: { language: GameLanguage; fullscreen: boolean } }
export interface OptionsDeps {
  settings: SettingsView;
  fullscreen?: { active: boolean; supported: boolean; pending: boolean; toggle(): void };
  languageReady?: boolean;
  /** A language chosen and still loading (the last OPTIONS' OK): the choice the window shows and keeps. */
  pendingLanguage?: GameLanguage | null;
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
const HELP_SEE: [number, string] = [0x198a, 'To see these messages, hold the Left Mouse button at the appropriate times.'];
/** What live's engine adds under an Activation Message choice's help, a blank line apart: how to see the messages it
 * skips (Left button) and to skip the ones it shows (Right button). */
const HELP_MORE: Record<string, [number, string][]> = { 'act-0': [HELP_SEE], 'act-1': [HELP_FIRST, HELP_SEE], 'act-2': [HELP_FIRST] };
export const DUEL_OPTIONS_TEXTS = [...Object.values(HELP).map(([id]) => id), HELP_FIRST[0], HELP_SEE[0]];

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
  const line = ([id, en]: [number, string]) => d.text?.(id)?.trim() || en;
  const help = (key: string | null | undefined) => { const h = key ? HELP[key] : undefined; return [h ?? HELP_FIRST, ...(key && h ? HELP_MORE[key] ?? [] : [])].map(line).join('\n\n'); };
  for (const c of controls) {
    if (c.cls === 'CWindowTaskPictureSwitch' && c.w >= 64) {
      const choice = CHOICES.find(x => x.x === c.x && x.y === c.y); if (!choice) continue;
      showArt(c, choice.on);
      const caption = controls.find(t => t.cls === 'CWindowTaskShadowText' && t.x === c.x && t.y === c.y + 8);
      b.on(c, { key: `duel-config:${choice.key}`, label: String(caption?.text ?? choice.key), click: () => { choice.set(); d.rerender(); },
        // the help follows the choice the pointer comes over and stays when it leaves (live)
        pointer: over => { if (over && ui.hover !== choice.key) { ui.hover = choice.key; d.rerender(); } } });
    } else if (c.cls === 'CWindowTaskShadowText' && c.name === '説明') { const t = help(ui.hover); c.text = t; for (const k of controls) if (k.parent === c.id) k.text = t; }
    else if (c.cls === 'CWindowTaskButtonDuel' && c.label === 'OK') b.on(c, { key: 'duel-config-ok', click: () => { d.set({ ...draft }); d.close(); } });
    else if (c.cls === 'CWindowTaskButtonDuel' && c.label === 'Cancel') b.on(c, { key: 'duel-config-cancel', click: () => d.close() });
  }
  const spec = b.spec(), box = controls.find(c => c.cls === 'CWindowTaskShadowText' && c.name === '説明');
  // the help wraps inside its blue box (live lets the line run out of the window: its bug, not copied) and scrolls there
  // when it is longer than the box (live's pink arrow under it: more lines)
  if (box) spec.after = root => {
    for (const el of root.querySelectorAll<HTMLElement>('.txt')) if (el.style.left === `${box.x}px` && el.style.top === `${box.y}px` && el.style.whiteSpace !== 'pre-wrap')
      Object.assign(el.style, { whiteSpace: 'pre-wrap', wordBreak: 'normal', overflowWrap: 'anywhere', width: `${box.w}px`, height: `${box.h}px`, overflowY: 'auto', overflowX: 'hidden', pointerEvents: 'auto', scrollbarWidth: 'thin' });
  };
  return spec;
}

// ---- the title's OPTIONS (COptionDlg, optionDlg.cpp): the engine's own window, as live's snapshot of it reads (a
// CWindowModelThinImg on data/title/option_dai_01_c01.png, 360 x 372 centred): [Language] and the chosen one's name over
// seven flag picture switches, [Screen] and Full / Window over two monitor pictures, [Sound volume] and a slider between
// two speaker switches, OK / Cancel (option_btn_01_c01.png). The flags and monitors choose; OK keeps the choices, Cancel
// drops them and puts the volume back (the slider and speakers change it at once). Drawn by option-dlg.ts.
export const OPTION_ICONS = 'data/title/option_icon_01_c00.png', OPTION_BACK = 'data/title/option_dai_01_c01.png', OPTION_BUTTON = 'data/title/option_btn_01_c01.png';
/** The engine's volume steps: 16 (0..15), each speaker click one. */
export const VOLUME_STEPS = 15;
// the flags in COptionDlg's order (option_icon rows 32 + 32 i; columns 0 normal, 48 hover, 96 checked, 144 pressed)
const FLAGS: { code: GameLanguage; x: number; y: number }[] = [
  { code: 'J', x: 32, y: 52 }, { code: 'E', x: 112, y: 52 }, { code: 'G', x: 192, y: 52 }, { code: 'F', x: 272, y: 52 },
  { code: 'I', x: 72, y: 92 }, { code: 'S', x: 152, y: 92 }, { code: 'K', x: 232, y: 92 }];
type Sprite = { tex: string; src: [number, number, number, number]; shown: boolean };
const sprites = (tex: string, normal: number[], hover: number[], pressed: number[], checked: number[]) =>
  Object.fromEntries(([['normal', normal], ['hover', hover], ['pressed', pressed], ['checked', checked]] as const).map(([k, src]) =>
    [k, { tex, src: src as Sprite['src'], shown: k === 'normal' } satisfies Sprite]));
export function titleOptionsWindow(ids: Ids, ui: OptionsUi, d: OptionsDeps): WindowSpec {
  const s = d.settings, fs = d.fullscreen, W = 360, H = 372;
  // the language as chosen: one still loading is the choice (OPTIONS opened again before it applied keeps it on OK)
  const chosen: GameLanguage = d.pendingLanguage ?? s.language ?? 'E';
  ui.before ??= { sound: s.sound, language: chosen }; ui.beforeFullscreen ??= !!fs?.active;
  const draft = ui.title ??= { language: chosen, fullscreen: !!fs?.active };
  const b = new WindowBuilder(ids, 'options', 'COptionDlg', { x: (1024 - W) / 2, y: (768 - H) / 2, w: W, h: H }, { z: 51453, modal: true, back: OPTION_BACK });
  const text = (name: string, y: number, t: string) => b.add('CWindowTaskText', name, { x: 8, y, w: 344, h: 16 }, { text: t, align: 1, fontSize: 16, color: [1, 1, 1, 1] });
  const lang = GAME_LANGUAGES.find(l => l.code === draft.language) ?? GAME_LANGUAGES[1]!;
  text('COptionDlg::m_textLang', 16, '[Language]'); text('COptionDlg::m_textSelectedLang', 32, lang.english);
  text('COptionDlg::m_textScreen', 137, '[Screen]'); text('COptionDlg::m_textSelectedScreen', 153, draft.fullscreen ? 'Full' : 'Window');
  text('COptionDlg::m_textVolume', 258, '[Sound volume]');
  const pick = (name: string, rect: { x: number; y: number; w: number; h: number }, art: Record<string, Sprite>, checked: boolean, key: string, label: string, run: (() => void) | null, fields: Record<string, unknown> = {}) =>
    b.add('CWindowTaskPictureSwitch', name, rect, { label: '', state: run ? 'normal' : 'disabled', enabled: !!run, checked, art, ...fields }, { key, label, click: () => run?.() });
  const langOk = !!d.languageReady && !d.busy;
  FLAGS.forEach((f, i) => { const v = 32 + 32 * i, l = GAME_LANGUAGES.find(g => g.code === f.code)!;
    pick(`flag-${f.code}`, { x: f.x, y: f.y, w: 48, h: 32 }, sprites(OPTION_ICONS, [0, v, 48, 32], [48, v, 48, 32], [144, v, 48, 32], [96, v, 48, 32]), draft.language === f.code,
      `opt-lang-${f.code}`, l.english, langOk || draft.language === f.code ? () => { draft.language = f.code; d.rerender(); } : null); });
  const canFs = !!fs?.supported && !fs.pending;
  pick('screen-full', { x: 67, y: 175, w: 80, h: 68 }, sprites(OPTION_ICONS, [192, 8, 80, 68], [192, 144, 80, 68], [272, 144, 80, 68], [272, 8, 80, 68]), draft.fullscreen,
    'opt-fullscreen', 'Full screen', canFs ? () => { draft.fullscreen = true; d.rerender(); } : null);
  pick('screen-window', { x: 213, y: 175, w: 80, h: 68 }, sprites(OPTION_ICONS, [192, 76, 80, 68], [192, 212, 80, 68], [272, 212, 80, 68], [272, 76, 80, 68]), !draft.fullscreen,
    'opt-windowed', 'Window', canFs || !draft.fullscreen ? () => { draft.fullscreen = false; d.rerender(); } : null);
  const level = Math.round(Math.max(0, Math.min(1, s.sound)) * VOLUME_STEPS), setLevel = (n: number) => { const v = Math.max(0, Math.min(VOLUME_STEPS, Math.round(n))); if (v !== level) d.set({ sound: v / VOLUME_STEPS }); };
  pick('volume-down', { x: 20, y: 298, w: 24, h: 24 }, sprites(OPTION_ICONS, [0, 8, 24, 24], [24, 8, 24, 24], [48, 8, 24, 24], [48, 8, 24, 24]), false, 'opt-sound-down', 'Volume down', () => setLevel(level - 1));
  pick('volume-up', { x: 316, y: 298, w: 24, h: 24 }, sprites(OPTION_ICONS, [72, 8, 24, 24], [96, 8, 24, 24], [120, 8, 24, 24], [120, 8, 24, 24]), false, 'opt-sound-up', 'Volume up', () => setLevel(level + 1));
  // the slider: its rail (option_icon 0, 2, 273 x 4) 11 down, its thumb (16 x 24: 144 normal, 160 hover, 176 pressed)
  // 268 / 15 px a step from x 40
  const slider = b.add('CWindowTaskSlider', 'COptionDlg::m_slider', { x: 40, y: 298, w: 284, h: 24 }, { value: level, max: VOLUME_STEPS, travel: 268, tex: OPTION_ICONS,
    rail: [0, 2, 273, 4], railY: 11, thumb: [[144, 8, 16, 24], [160, 8, 16, 24], [176, 8, 16, 24]] });
  b.on(slider, { key: 'opt-sound-level', label: `Sound volume ${level} / ${VOLUME_STEPS}`, value: setLevel });
  const button = (name: string, x: number, label: string, key: string, run: () => void) =>
    pick(name, { x, y: 339, w: 158, h: 24 }, sprites(OPTION_BUTTON, [0, 0, 158, 24], [158, 0, 158, 24], [316, 0, 158, 24], [316, 0, 158, 24]), false, key, label, run, { label });
  button('ok', 15, 'OK', 'opt-ok', () => {
    if (draft.language !== chosen) d.set({ language: draft.language as GameLanguage });
    if (fs && draft.fullscreen !== fs.active && fs.supported && !fs.pending) fs.toggle();
    d.close();
  });
  button('cancel', 187, 'Cancel', 'opt-cancel', () => {
    const before = ui.before!;
    if (before.sound !== s.sound) d.set({ sound: before.sound! });
    d.close();
  });
  return b.spec();
}
