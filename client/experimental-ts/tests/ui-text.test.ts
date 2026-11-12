import { describe, expect, it, vi } from 'vitest';
import { UiText, decodeDialogTable, decodeStringTable, localizeSpecs, REWRITE_TEXT } from '../src/features/ui-text';
import { Ids } from '../src/ui/htmlui/snapshot';
import { htmlUiLocal, htmlWindows } from '../src/ui/htmlui/windows';
import type { BuildContext } from '../src/ui/htmlui/windows';
import type { ClientView } from '../src/ui/contracts';
import { DuelTextCatalog } from '../src/duel/text';
import { NpcDialogueCatalog } from '../src/npcs/dialogue';

/** A CStringDB pair (u32 offsets, NUL-terminated strings) in the given single-byte encoding. */
function stringDb(strings: string[]): { idx: Uint8Array; bin: Uint8Array } {
  const parts: number[] = [], idx = new Uint8Array(strings.length * 4), view = new DataView(idx.buffer);
  strings.forEach((s, i) => { view.setUint32(i * 4, parts.length, true); for (const ch of s) parts.push(ch.charCodeAt(0)); parts.push(0); });
  return { idx, bin: Uint8Array.from(parts) };
}
// made-up tables (the original's are private game data): the same ids name the same words in each language
const ENGLISH = ['', 'Create Player', 'Trade', 'OK', 'Cancel'];
const GERMAN = ['', 'Spieler erstellen', 'Handel', 'OK', 'Abbrechen'];
const view = (patch: Partial<ClientView>): ClientView => ({ scene: 'title', connection: 'online', status: '', player: null, characters: [], lobby: null, deckEditor: null, shop: null, duel: null, social: null,
  settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true }, ...patch });
const windows = (text: UiText) => {
  const ctx: BuildContext = { state: view({ scene: 'characters', characters: [{ slot: 1, name: 'Alice', level: 3 }] }), ui: htmlUiLocal(), ids: new Ids(), send: () => {}, rerender: vi.fn() };
  const specs = htmlWindows(ctx); localizeSpecs(specs, text);
  return specs[0]!.win.controls.filter(c => c.name === 'プレイヤ選択ボタン').sort((a, b) => a.y - b.y).map(c => c.label);
};

describe('the UI follows the chosen language through the original text tables', () => {
  it('decodes CStringDB tables and the duel dialog table', () => {
    const { idx, bin } = stringDb(['', 'Caf\xe9  ', 'x']);
    expect(decodeStringTable(idx, bin, 'windows-1252')).toEqual(['', 'Café', 'x']);
    const text = new Uint8Array(Buffer.from('@1Hallo\0\0', 'utf16le')), index = new Uint8Array(4);
    expect([...decodeDialogTable(index, text)]).toEqual([[0, 'Hallo']]);
  });
  it('a label is looked up by its English id; unknown words, spacing and capitals are kept', () => {
    const t = new UiText(); t.install(ENGLISH, GERMAN, 'G');
    expect(t.t('Trade')).toBe('Handel');
    expect(t.t('TRADE')).toBe('HANDEL');
    expect(t.t(' Cancel ')).toBe(' Abbrechen ');
    expect(t.t('OK\nCancel')).toBe('OK\nAbbrechen');
    expect(t.t('Searching for an opponent')).toBe('Searching for an opponent');
    expect(t.rewrite('waitingOpponent')).toBe(REWRITE_TEXT.waitingOpponent);
    t.install(ENGLISH, GERMAN, 'E'); expect(t.t('Trade')).toBe('Trade');
  });
  it('switching the language changes the labels in the windows; English stays as built', () => {
    const t = new UiText();
    expect(windows(t)).toEqual(['Create Player', 'Alice', 'Create Player', 'Create Player']);
    t.install(ENGLISH, GERMAN, 'G');
    expect(windows(t)).toEqual(['Spieler erstellen', 'Alice', 'Spieler erstellen', 'Spieler erstellen']);
    t.install(ENGLISH, null, 'E');
    expect(windows(t)).toEqual(['Create Player', 'Alice', 'Create Player', 'Create Player']);
  });
  it('what a player types is never translated', () => {
    const t = new UiText(); t.install(ENGLISH, GERMAN, 'G');
    const specs = [{ win: { title: 'Trade', controls: [{ cls: 'CWindowTaskInput', text: 'Trade' }, { cls: 'CWindowTaskText', text: 'Trade' }] }, handlers: new Map() }] as never;
    localizeSpecs(specs, t);
    expect((specs as { win: { title: string; controls: { text: string }[] } }[])[0]!.win).toMatchObject({ title: 'Handel', controls: [{ text: 'Trade' }, { text: 'Handel' }] });
  });
  it('duel dialog texts follow the language, falling back to English per text', () => {
    const texts = new DuelTextCatalog(); texts.install({ v: 1, legacyOptions: {}, legacyPrompts: {}, cardNames: {}, dialogs: { 145: 'Declare 1 card name.', 82: 'Surrender later.' } });
    texts.localizeDialogs(new Map([[145, 'Nenne 1 Kartennamen.']]));
    expect([texts.dialog(145), texts.dialog(82)]).toEqual(['Nenne 1 Kartennamen.', 'Surrender later.']);
    texts.localizeDialogs(null); expect(texts.dialog(145)).toBe('Declare 1 card name.');
  });
  it('an NPC line keeps its text id, so its words can be read from the chosen language', () => {
    const npc = new NpcDialogueCatalog(); npc.install({ version: 1, lines: { 7: { 0: { text: 'Hello', textId: 300, style: 0 } } } });
    expect(npc.textId(7, 0)).toBe(300); expect(npc.textId(7, 1)).toBeUndefined();
  });
});

describe('ui-text by context: a word the original table holds with another meaning', () => {
  it('translates the title OPTIONS window\'s words, and a control\'s own text id wins over the word', async () => {
    const { titleOptionsWindow } = await import('../src/ui/htmlui/options');
    const english = ['', 'Full', 'Cancel', '[Sound volume]', '', 'Full'], german = ['', 'Vollbild', 'Abbrechen', '[Lautstärke]', '', 'Voll'];
    const text = new UiText(); text.install(english, german, 'G');
    const spec = titleOptionsWindow(new Ids(), { kind: 'title' }, { settings: { sound: 1, music: 1, reducedMotion: false, showCardNames: true }, set: () => {}, close: () => {}, rerender: () => {} });
    localizeSpecs([spec], text);
    const control = (name: string) => spec.win.controls.find(c => c.name === name)!;
    expect(control('cancel').label).toBe('Abbrechen');
    expect(control('COptionDlg::m_textVolume').text).toBe('[Lautstärke]');
    expect(text.t('Full')).toBe('Vollbild');
    const other = { win: { cls: 'CSomeDlg', title: 'x', controls: [{ cls: 'CWindowTaskText', text: 'Full', textId: 5 }, { cls: 'CWindowTaskText', text: 'Full', textId: false }] } };
    localizeSpecs([other as never], text);
    expect(other.win.controls.map(c => c.text)).toEqual(['Voll', 'Full']);
  });
});
