import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DuelTextCatalog, describePrompt } from '../src/duel/text';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { projectDuel } from '../src/presentation';
import { CardCatalog } from '../src/catalog';
import { CardMap } from '../../../server/src/duel/translator/cardmap';
import { norm, YO2Duel } from '../../../server/src/duel/translator/translator';
import { engine, setcommand } from '../../../server/src/duel/translator/lockstep';
import type { DuelPrompt } from '../src/duel/types';

const prompt = (): DuelPrompt => ({ id: 1, kind: 'option', title: 'Choose an action', cancelable: false,
  cancellationKnown: true, actions: [], buttons: [], items: [{ passcode: null, rawId: 440, serial: 0, owner: 2 }],
  text: [{ value: 260, kind: 2 }], min: 0, max: 1, options: [{ value: 0, label: 'Option 1' }], dialogKind: 4, listMode: 0, detail: 0, hints: 0 });
const data = () => ({ v: 1, legacyOptions: { 440: [{ card: 0, text: 'Synthetic monster choice' }] }, legacyPrompts: {}, cardNames: { 123: 'Synthetic card' } });

describe('duel text display catalog', () => {
  it('resolves explicit legacy options and source-backed prompt meanings', () => {
    const texts = new DuelTextCatalog(); texts.install(data());
    const described = describePrompt(prompt(), texts);
    expect(described.title).toBe('Choose a card type.'); expect(described.optionLabels.get(0)).toBe('Synthetic monster choice');
  });
  it('selects a card-specific alternative only with matching public context', () => {
    const texts = new DuelTextCatalog(); texts.install({ ...data(), legacyOptions: { 440: [
      { card: 123, text: 'Synthetic first effect' }, { card: 456, text: 'Synthetic second effect' },
    ] } });
    expect(texts.option(440)).toBe(null); expect(texts.option(440, 123)).toBe('Synthetic first effect');
    expect(describePrompt(prompt(), texts).optionLabels.get(0)).toContain('unavailable');
  });
  it('does not guess an unrelated system text with a numerically equal legacy identifier', () => {
    const texts = new DuelTextCatalog(); texts.install(data());
    expect(texts.option(70)).toBe(null); expect(texts.prompt(440)).toBe(null);
  });
  it('keeps unknown text explicit while retaining the exact response values', () => {
    const texts = new DuelTextCatalog(), p = prompt(); p.items[0].rawId = 99999;
    expect(describePrompt(p, texts).optionLabels.get(0)).toBe('Option 1 — text 99999 unavailable');
    expect(p.options[0].value).toBe(0);
  });
  it('uses only an authorized dialog card identity for yes/no context', () => {
    const texts = new DuelTextCatalog(); texts.install(data());
    const p = prompt(); p.kind = 'yesno'; p.text = [{ value: 123, kind: 4 }, { value: 250, kind: 0 }];
    expect(describePrompt(p, texts).title).toBe('Synthetic card: Activate this card’s effect?');
  });
  it('installs transactionally and rejects malformed, excessive and unsafe tables', () => {
    const texts = new DuelTextCatalog(); texts.install(data());
    for (const bad of [null, [], { ...data(), v: 2 }, { ...data(), legacyOptions: [] },
      { ...data(), cardNames: { nope: 'Bad key' } }, { ...data(), legacyOptions: { 440: [{ card: -1, text: 'Bad card' }] } },
      { ...data(), cardNames: { 123: 'x'.repeat(513) } }]) expect(() => texts.install(bad)).toThrow();
    expect(texts.option(440)).toBe('Synthetic monster choice');
  });
  it('adds readable option labels without changing command IDs or prompt lifecycle', () => {
    const texts = new DuelTextCatalog(); texts.install(data());
    let s = reduceDuelMessage(createDuelState(), { id: 0x6202, data: engine(1) });
    s.promptSequence = 1; s.prompt = prompt(); s.acceptingInput = true;
    const v = projectDuel(s, new CardCatalog(), ['You', 'Rival'], null, texts);
    expect(v.prompt?.options).toEqual([{ id: 'answer:0', label: 'Synthetic monster choice' }]);
    expect(v.prompt?.id).toBe('1'); expect(s.prompt.options[0].label).toBe('Option 1');
  });
  it('does not attribute a new yes/no question to an already resolved cached chain', () => {
    const texts = new DuelTextCatalog(); texts.install(data());
    let s = reduceDuelMessage(createDuelState(), { id: 0x6202, data: engine(1) });
    s.cards[2] = { uid: 2, passcode: 123 } as typeof s.cards[number];
    s.chain = [{ player: 0, zone: 0, uid: 2, link: 1, resolving: true }];
    s.prompt = { ...prompt(), kind: 'yesno', text: [{ value: 250, kind: 0 }], items: [] };
    expect(projectDuel(s, new CardCatalog(), ['You', 'Rival'], null, texts).prompt?.text).toBe('Activate this card’s effect?');
    s.prompt.listMode = 0xff; s.prompt.items = [{ passcode: 123, rawId: 123, owner: 0, serial: 0 }];
    expect(projectDuel(s, new CardCatalog(), ['You', 'Rival'], null, texts).prompt?.text).toBe('Synthetic card: Activate this card’s effect?');
  });
});

const gd = resolve(import.meta.dirname, '../../../server/gamedata');
const generated = resolve(import.meta.dirname, '../public/duel-texts.json');
describe.skipIf(!existsSync(generated) || !existsSync(resolve(gd, 'translator.json')))('private generated option labels', () => {
  it('matches actual engine card text and real translator option IDs without embedding that data', () => {
    const texts = new DuelTextCatalog(); texts.install(JSON.parse(readFileSync(generated, 'utf8')));
    const engineData = JSON.parse(readFileSync(resolve(gd, 'engine/cards.json'), 'utf8'));
    const map = new CardMap(JSON.parse(readFileSync(resolve(gd, 'translator.json'), 'utf8')));
    const d = new YO2Duel([{}, {}], { cardmap: map });
    let s = reduceDuelMessage(createDuelState(), { id: 0x6202, data: engine(1) });
    const code = 967928; // authored OPTION_DLG has explicit _sid(code,0/1) mappings
    for (const [id, data] of norm(d._on_select({ type: 'SELECT_OPTION', player: 0, options: [code * 2 ** 20, code * 2 ** 20 + 1] }))) s = reduceDuelMessage(s, { id, data });
    const view = projectDuel(s, new CardCatalog(), ['You', 'Rival'], null, texts);
    expect(view.prompt?.options.map(o => o.label)).toEqual(engineData.texts[code].slice(1, 3));
    expect(view.prompt?.options.map(o => o.id)).toEqual(['answer:0', 'answer:1']);
  });
});
