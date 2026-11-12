import { describe, expect, it } from 'vitest';
import { autoAnswer } from '../src/duel/auto-answer';
import { createDuelState } from '../src/duel/model';
import type { DuelPrompt, DuelState } from '../src/duel/types';
import { duelOptions } from '../src/ui/contracts';
import { duelConfigWindow, titleOptionsWindow } from '../src/ui/htmlui/options';
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
    expect(autoAnswer(place, opts(1, false))).toBeNull();
    // a choice among cards (an occupied zone) or the opponent's zones is no placement
    const occupied = structuredClone(place); occupied.sides[0].monster[2] = 9;
    expect(autoAnswer(occupied, opts(1))).toBeNull();
    const theirs = playing({ kind: 'field-selection', actions: [{ player: 1, zone: 2, index: 0, command: 11, label: '' }] });
    expect(autoAnswer(theirs, opts(1))).toBeNull();
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
  it('turns fullscreen on and off from its Screen row and Cancel puts the screen mode and volume back', () => {
    const set: unknown[] = []; let closed = 0, toggles = 0; const ui = { kind: 'title' as const };
    const fs = { active: false, supported: true, pending: false, toggle: () => { toggles++; fs.active = !fs.active; } };
    const settings = { sound: 0.5, music: 1, reducedMotion: false, showCardNames: true };
    const spec = () => titleOptionsWindow(new Ids(), ui, { settings, fullscreen: fs, languageReady: true, set: s => set.push(s), close: () => { closed++; }, rerender: () => {} });
    let s = spec();
    const by = (key: string) => { const c = s.win.controls.find(c => s.handlers.get(c.id)?.key === key); if (!c) throw new Error(key); return { c, h: s.handlers.get(c.id)! }; };
    expect(by('opt-windowed').c.checked).toBe(true); expect(by('opt-windowed').c.state).toBe('disabled');
    by('opt-fullscreen').h.click!(); expect(toggles).toBe(1);
    s = spec(); expect(by('opt-fullscreen').c.checked).toBe(true); expect(by('opt-fullscreen').c.state).toBe('disabled');
    by('opt-sound-up').h.click!(); expect(set).toEqual([{ sound: 0.6 }]); settings.sound = 0.6;
    s = spec(); by('opt-cancel').h.click!();
    expect(set).toEqual([{ sound: 0.6 }, { sound: 0.5 }]); expect(toggles).toBe(2); expect(fs.active).toBe(false); expect(closed).toBe(1);
  });
});
