import { describe, expect, it } from 'vitest';
import { autoAnswer } from '../src/duel/auto-answer';
import { createDuelState } from '../src/duel/model';
import type { DuelPrompt, DuelState } from '../src/duel/types';
import { duelOptions } from '../src/ui/contracts';
import { duelConfigWindow, titleOptionsWindow, type OptionsUi } from '../src/ui/htmlui/options';
import { Ids } from '../src/ui/htmlui/snapshot';

const playing = (prompt: Partial<DuelPrompt>): DuelState => {
  const s = createDuelState();
  return { ...s, status: 'playing', acceptingInput: true, prompt: { id: 1, kind: 'yesno', title: '', cancelable: true, cancellationKnown: true, actions: [], buttons: [], items: [], text: [],
    min: 0, max: 0, options: [], dialogKind: 2, listMode: 0, detail: 0, hints: 0, ...prompt } };
};
const ask = (id: number) => playing({ kind: 'yesno', text: [{ kind: 2, value: id }] });
const opts = (activationMessage: 0 | 1 | 2, autoPlacing = true) => ({ autoTracking: true, autoPlacing, activationMessage });

describe('DUEL OPTIONS in the duel (duel/auto-answer.ts)', () => {
  it('the engine defaults: ON, ON, Semi Auto Cancel', () => {
    expect(duelOptions({})).toEqual({ autoTracking: true, autoPlacing: true, activationMessage: 1 });
    expect(duelOptions({ autoTracking: false, autoPlacing: false, activationMessage: 2 })).toEqual({ autoTracking: false, autoPlacing: false, activationMessage: 2 });
  });
  it('Activation Message: Auto Cancel answers NO to every activation question, Semi only to the generic chain ones, Manual to none', () => {
    const no = { type: 'yesno', yes: false };
    expect(autoAnswer(ask(250), opts(0))).toEqual(no);
    expect(autoAnswer(ask(7), opts(0))).toEqual(no);
    expect(autoAnswer(ask(7), opts(1))).toEqual(no);
    expect(autoAnswer(ask(250), opts(1))).toBeNull();
    expect(autoAnswer(ask(7), opts(2))).toBeNull();
    // a question that is no activation (surrender) is never answered for the player
    expect(autoAnswer(ask(6), opts(0))).toBeNull();
  });
  it('the mouse overrides it: right held answers NO, left held shows the message', () => {
    expect(autoAnswer(ask(250), opts(2), { left: false, right: true })).toEqual({ type: 'yesno', yes: false });
    expect(autoAnswer(ask(7), opts(0), { left: true, right: false })).toBeNull();
  });
  it('Auto Card Placing: a placement on the player\'s own empty zones takes the first one; OFF leaves it to the player', () => {
    const place = playing({ kind: 'field-selection', actions: [{ player: 0, zone: 2, index: 0, command: 11, label: '' }, { player: 0, zone: 3, index: 0, command: 11, label: '' }] });
    expect(autoAnswer(place, opts(1))).toEqual({ type: 'action', player: 0, zone: 2, index: 0, command: 11 });
    // live fills a row from its middle: 2, 1, 3, 0, 4
    const row = (zones: number[]) => playing({ kind: 'actions', actions: zones.map(zone => ({ player: 0 as const, zone, index: 0, command: 11, label: '' })) });
    expect(autoAnswer(row([0, 1, 2, 3, 4]), opts(1))).toMatchObject({ zone: 2 });
    expect(autoAnswer(row([5, 6, 8, 9]), opts(1))).toMatchObject({ zone: 6 });
    expect(autoAnswer(row([0, 3, 4]), opts(1))).toMatchObject({ zone: 3 });
    expect(autoAnswer(row([0, 4]), opts(1))).toMatchObject({ zone: 0 });
    expect(autoAnswer(place, opts(1, false))).toBeNull();
    // a choice among cards (an occupied zone) or the opponent's zones is no placement
    const occupied = structuredClone(place); occupied.sides[0].monster[2] = 9;
    expect(autoAnswer(occupied, opts(1))).toBeNull();
    const theirs = playing({ kind: 'field-selection', actions: [{ player: 1, zone: 2, index: 0, command: 11, label: '' }] });
    expect(autoAnswer(theirs, opts(1))).toBeNull();
    // the selection's other commands (a pile's Inspect, the deck's Surrender) do not make it another choice
    const withPiles = playing({ kind: 'field-selection', actions: [{ player: 0, zone: 7, index: 0, command: 11, label: '' }, { player: 0, zone: 12, index: 0, command: 1, label: '' }, { player: 0, zone: 13, index: 0, command: 10, label: '' }] });
    expect(autoAnswer(withPiles, opts(1))).toEqual({ type: 'action', player: 0, zone: 7, index: 0, command: 11 });
    // the place question after a Summon: an action list of zone Selects (command 11), with the piles' commands
    const summoned = playing({ kind: 'actions', actions: [{ player: 0, zone: 0, index: 0, command: 11, label: '' }, { player: 0, zone: 1, index: 0, command: 11, label: '' }, { player: 0, zone: 13, index: 0, command: 10, label: '' }] });
    expect(autoAnswer(summoned, opts(1))).toEqual({ type: 'action', player: 0, zone: 1, index: 0, command: 11 });
    // the idle commands (a card's Summon, its Activate) are no placement
    expect(autoAnswer(playing({ kind: 'actions', actions: [{ player: 0, zone: 2, index: 0, command: 0, label: '' }, { player: 0, zone: 13, index: 0, command: 10, label: '' }] }), opts(1))).toBeNull();
    // a choice of a card in a pile alone is no placement
    expect(autoAnswer(playing({ kind: 'field-selection', actions: [{ player: 0, zone: 12, index: 0, command: 11, label: '' }] }), opts(1))).toBeNull();
  });
  it('a spectator or a replay prompt is never answered', () => {
    expect(autoAnswer({ ...ask(7), observer: true }, opts(0))).toBeNull();
  });
});

describe('DUEL OPTIONS window (CWindowModelDuelConfig, main\'s capture)', () => {
  it('stands where live has it, checks the settings, keeps a choice only on OK', () => {
    const set: unknown[] = []; let closed = 0; const ui = { kind: 'options' as const };
    const spec = () => duelConfigWindow(new Ids(), ui, { settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true, activationMessage: 2 }, set: s => set.push(s), close: () => { closed++; }, rerender: () => {} });
    let s = spec();
    expect([s.win.x, s.win.y, s.win.w, s.win.h]).toEqual([266, 158, 492, 452]);
    const by = (key: string) => { const c = s.win.controls.find(c => s.handlers.get(c.id)?.key === key); if (!c) throw new Error(key); return { c, h: s.handlers.get(c.id)! }; };
    expect(by('duel-config:track-on').c.checked).toBe(true);
    expect(by('duel-config:act-2').c.checked).toBe(true);
    expect(by('duel-config:act-1').c.checked).toBe(false);
    expect(s.win.controls.find(c => c.name === '説明')!.text).toMatch(/Right Mouse/);
    by('duel-config:act-0').h.click!(); by('duel-config:place-off').h.click!();
    s = spec(); expect(by('duel-config:act-0').c.checked).toBe(true); expect(set).toEqual([]);
    by('duel-config:place-on').h.pointer!(true); s = spec(); expect(s.win.controls.find(c => c.name === '説明')!.text).toMatch(/place the card/);
    by('duel-config-ok').h.click!();
    expect(set).toEqual([{ autoTracking: true, autoPlacing: false, activationMessage: 0 }]); expect(closed).toBe(1);
  });
});

describe('the title\'s OPTIONS window (COptionDlg)', () => {
  it('is live\'s window: its picture, the flags, the monitors, the slider and OK / Cancel where the engine has them', () => {
    const s = titleOptionsWindow(new Ids(), { kind: 'title' }, { settings: { sound: 8 / 15, music: 1, reducedMotion: false, showCardNames: true, language: 'E' }, languageReady: true, set: () => {}, close: () => {}, rerender: () => {} });
    expect(s.win).toMatchObject({ cls: 'COptionDlg', x: 332, y: 198, w: 360, h: 372, back: 'data/title/option_dai_01_c01.png' });
    const named = (n: string) => s.win.controls.find(c => c.name === n)!;
    expect(named('COptionDlg::m_textLang').text).toBe('[Language]'); expect(named('COptionDlg::m_textSelectedLang').text).toBe('English');
    expect(named('COptionDlg::m_textSelectedScreen').text).toBe('Window'); expect(named('COptionDlg::m_textVolume').text).toBe('[Sound volume]');
    const uk = s.win.controls.find(c => s.handlers.get(c.id)?.key === 'opt-lang-E')!;
    expect(uk).toMatchObject({ x: 112, y: 52, w: 48, h: 32, checked: true }); expect((uk.art as Record<string, { src: number[] }>).checked!.src).toEqual([96, 64, 48, 32]);
    expect(named('COptionDlg::m_slider')).toMatchObject({ x: 40, y: 298, value: 8, max: 15 });
    expect(named('ok')).toMatchObject({ x: 15, y: 339, w: 158, h: 24, label: 'OK' }); expect(named('cancel')).toMatchObject({ x: 187, y: 339, label: 'Cancel' });
  });
  it('a flag and a monitor choose, OK keeps them; the volume changes at once and Cancel puts it back', () => {
    const set: unknown[] = []; let closed = 0, toggles = 0; const ui: OptionsUi = { kind: 'title' };
    const fs = { active: false, supported: true, pending: false, toggle: () => { toggles++; fs.active = !fs.active; } };
    const settings = { sound: 0.6, music: 1, reducedMotion: false, showCardNames: true, language: 'E' as const };
    const spec = () => titleOptionsWindow(new Ids(), ui, { settings, fullscreen: fs, languageReady: true, set: s => set.push(s), close: () => { closed++; }, rerender: () => {} });
    let s = spec();
    const by = (key: string) => { const c = s.win.controls.find(c => s.handlers.get(c.id)?.key === key); if (!c) throw new Error(key); return { c, h: s.handlers.get(c.id)! }; };
    expect(by('opt-windowed').c.checked).toBe(true);
    by('opt-fullscreen').h.click!(); by('opt-lang-G').h.click!(); expect(toggles).toBe(0); expect(set).toEqual([]);
    s = spec(); expect(by('opt-fullscreen').c.checked).toBe(true); expect(s.win.controls.find(c => c.name === 'COptionDlg::m_textSelectedLang')!.text).toBe('German');
    by('opt-sound-up').h.click!(); expect(set).toEqual([{ sound: 10 / 15 }]); settings.sound = 10 / 15;
    s = spec(); by('opt-sound-level').h.value!(3); expect(set).toEqual([{ sound: 10 / 15 }, { sound: 3 / 15 }]); settings.sound = 3 / 15;
    s = spec(); by('opt-cancel').h.click!();
    expect(set).toEqual([{ sound: 10 / 15 }, { sound: 3 / 15 }, { sound: 0.6 }]); expect(toggles).toBe(0); expect(closed).toBe(1);
    const ui2: OptionsUi = { kind: 'title' }; set.length = 0;
    s = titleOptionsWindow(new Ids(), ui2, { settings, fullscreen: fs, languageReady: true, set: v => set.push(v), close: () => { closed++; }, rerender: () => {} });
    by('opt-lang-G').h.click!(); by('opt-fullscreen').h.click!(); by('opt-ok').h.click!();
    expect(set).toEqual([{ language: 'G' }]); expect(toggles).toBe(1); expect(closed).toBe(2);
  });
  it('opened again while the chosen language loads, it shows that choice and its OK keeps it', () => {
    const set: unknown[] = []; const ui: OptionsUi = { kind: 'title' };
    const settings = { sound: 0.6, music: 1, reducedMotion: false, showCardNames: true, language: 'G' as const };
    const s = titleOptionsWindow(new Ids(), ui, { settings, pendingLanguage: 'J', languageReady: false, set: v => set.push(v), close: () => {}, rerender: () => {} });
    const by = (key: string) => s.win.controls.find(c => s.handlers.get(c.id)?.key === key)!;
    expect(by('opt-lang-J').checked).toBe(true); expect(by('opt-lang-G').checked).toBe(false);
    s.handlers.get(by('opt-ok').id)!.click!(); expect(set).toEqual([]);
  });
});
