import { describe, expect, it } from 'vitest';
import { DuelTextCatalog, describePrompt } from '../src/duel/text';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { encodeDuelResponse } from '../src/duel/responses';
import { projectDuel, interpretResponse, interpretAction } from '../src/presentation';
import { CardCatalog } from '../src/catalog';
import { engine, setcommand, listAdd, listItem, request_input, comid_field, mk, T_LIST_RESET, T_VIEW } from '../../../server/src/duel/translator/lockstep';
import { concat, packBIIII } from '../../../server/src/duel/translator/py';
import type { DuelPrompt, DuelState } from '../src/duel/types';

/** Prompt context the scenario duels exposed (tests/acceptance/duel-scenarios.test.ts): stale list/dialog data from an
 * earlier view, original dialog texts, card declarations by name and cancelling a board selection. Synthetic texts only. */
const data = () => ({ v: 1, legacyOptions: { 406: [{ card: 111, text: 'Synthetic gain' }, { card: 222, text: 'Synthetic other gain' }] }, legacyPrompts: {},
  cardNames: { 123: 'Synthetic card' }, dialogs: { 145: 'Declare 1 card name.', 197: 'You drew card(s).', 269: 'Activate the effect of a card?',
    250: 'Activate the effect of "%s"?', 406: 'Recover your Life Points.', 241: 'Select Type.', 326: 'Select card position.' } });
const texts = () => { const t = new DuelTextCatalog(); t.install(data()); return t; };
const base = (patch: Partial<DuelPrompt>): DuelPrompt => ({ id: 1, kind: 'yesno', title: 'Choose an action', cancelable: true, cancellationKnown: true,
  actions: [], buttons: [], items: [], text: [], min: 0, max: 1, options: [], dialogKind: 3, listMode: 0, detail: 0, hints: 0, ...patch });
const feed = (state: DuelState, messages: [number, Uint8Array][]) => messages.reduce((s, [id, d]) => reduceDuelMessage(s, { id, data: d }), state);
const list = (mode: number, items: [number, number, number][]) => [0x6610, concat(packBIIII(0, mode, 0, items.length, 0), ...items.map(([i, s, o]) => listItem(i, s, o)))] as [number, Uint8Array];
const dialog = (kind: number, text: number, p2 = 0) => [[0x6202, setcommand(T_LIST_RESET, 0, [1])], [0x6202, listAdd([text, 2])], [0x6202, setcommand(T_VIEW, 0x32, [kind, 0, p2])]] as [number, Uint8Array][];
const started = () => reduceDuelMessage(createDuelState(), { id: 0x6202, data: engine(1) });

describe('duel prompt context', () => {
  it('titles a dialog with every original text line and fills in its card', () => {
    const chain = base({ text: [{ value: 197, kind: 2 }, { value: 0xffff, kind: 3 }, { value: 269, kind: 3 }] });
    expect(describePrompt(chain, texts(), 123).title).toBe('Synthetic card: You drew card(s). Activate the effect of a card?');
    const named = base({ text: [{ value: 123, kind: 4 }, { value: 250, kind: 2 }] });
    expect(describePrompt(named, texts()).title).toBe('Activate the effect of "Synthetic card"?');
  });
  it('names an option with the original dialog text when its card-specific alternative is ambiguous', () => {
    const option = base({ kind: 'option', items: [{ passcode: null, rawId: 406, serial: 0, owner: 2 }], options: [{ value: 0, label: 'Option 1' }] });
    expect(describePrompt(option, texts()).optionLabels.get(0)).toBe('Recover your Life Points.');
    expect(describePrompt(option, texts(), 111).optionLabels.get(0)).toBe('Synthetic gain');
  });
  it('does not show an option dialog’s texts as cards', () => {
    let s = feed(started(), [list(0, [[406, 0, 2], [407, 0, 2]]), ...dialog(4, 259)]);
    s = { ...s, acceptingInput: true };
    const view = projectDuel(s, new CardCatalog(), ['You', 'Rival'], null, texts());
    expect(view.prompt?.options.map(o => o.id)).toEqual(['answer:0', 'answer:1']);
    expect(view.prompt?.candidates).toBeUndefined();
  });
  it('gives a card declaration no stale list or dialog, a name field and the original title', () => {
    let s = feed(started(), [list(0xff, [[5318639, 0, 0]]), ...dialog(3, 269)]);
    s = feed(s, [[0x6202, setcommand(T_VIEW, 0x33, [0, 0x4b, 0], 1)]]);
    expect(s.prompt).toMatchObject({ kind: 'announce-card', items: [], text: [] });
    const catalog = new CardCatalog(); catalog.install([{ passcode: 45986603, name: 'Snatch Steal' }, { passcode: 4031928, name: 'Change of Heart' }]);
    const view = projectDuel(s, catalog, ['You', 'Rival'], null, texts());
    expect(view.prompt).toMatchObject({ kind: 'announce', text: 'Declare 1 card name.' });
    expect(view.prompt?.candidates).toBeUndefined();
    expect(view.prompt?.suggestions).toEqual(['Change of Heart', 'Snatch Steal']);
    const id = String(s.prompt!.id), named = (text: string) => catalog.named(text);
    expect(interpretResponse(s, id, { text: '  snatch   STEAL ' }, named)).toEqual({ type: 'announce-card', passcode: 45986603 });
    expect(interpretResponse(s, id, { text: '4031928' }, named)).toEqual({ type: 'announce-card', passcode: 4031928 });
    expect(() => interpretResponse(s, id, { text: 'No such card' }, named)).toThrow('No card is named');
  });
  it('keeps a list view’s cards and its own dialog out of the dialogs that follow it', () => {
    // A Graveyard list, then (no new list) the summon position question: no Graveyard cards under the question.
    let s = feed(started(), [list(6, [[33184167, 6, 0], [85087012, 3, 1]]), [0x6202, setcommand(T_VIEW, 0x33, [0, 6, 0])]]);
    expect(s.prompt?.items).toHaveLength(2);
    s = feed(s, dialog(8, 326, 7));
    expect(s.prompt).toMatchObject({ kind: 'position', items: [], listMode: 0 });
    // A list view answering no dialog of its own does not take the previous dialog's text as its title.
    s = feed(s, dialog(6, 241, 1 << 14));
    s = feed(s, [list(6, [[33184167, 6, 0]]), [0x6202, setcommand(T_VIEW, 0x33, [0, 6, 0])]]);
    expect(s.prompt).toMatchObject({ kind: 'cards', text: [] });
    // Dialog pictures (LIST_DIALOG) stay with the next dialog, as the original's list buffer does.
    s = feed(s, [list(0xff, [[85087012, 0, 0]]), ...dialog(3, 269), ...dialog(11, 330, 1 | 1 << 16 | 3 << 24)]);
    expect(s.prompt).toMatchObject({ kind: 'number', listMode: 0xff, items: [{ passcode: 85087012 }] });
  });
  it('offers Cancel on a card selection on the board, never on a zone placement, and sends the cancel request', () => {
    const masks = new Map([[mk(0, 2), 1 << 11]]);
    let s = feed(started(), [[0x6611, comid_field(masks)], [0x6202, request_input(0)]]);
    s.sides[0].monster[2] = 9; s.cards[9] = { uid: 9, player: 0, zone: 'monster', index: 2, owner: 0, serial: 1, passcode: 71413901, hiddenKind: null, faceUp: true, defense: false, token: false, attack: 1900, defence: 1000, counters: {}, value: 0, turns: 0 };
    const view = projectDuel(s, new CardCatalog(), ['You', 'Rival']);
    expect(view.actions?.map(a => a.id)).toContain('cancel');
    expect(interpretAction(s, 'cancel')).toEqual({ type: 'cancel' });
    expect(encodeDuelResponse(s, { type: 'cancel' }).map(m => m.id)).toEqual([0x6351]);
    s.sides[0].monster[2] = null; delete s.cards[9];
    expect(projectDuel(s, new CardCatalog(), ['You', 'Rival']).actions?.map(a => a.id)).not.toContain('cancel');
    expect(() => interpretAction(s, 'cancel')).toThrow();
  });
  it('treats the hand-limit discard as forced', () => {
    const s = feed(started(), [[0x6202, setcommand(0x1e, 0, [1, 1])], ...dialog(13, 235)]);
    expect(s.prompt).toMatchObject({ kind: 'discard', min: 1, max: 1, cancelable: false, cancellationKnown: true });
  });
});
