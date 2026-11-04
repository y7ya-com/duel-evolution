import { describe, expect, it } from 'vitest';
import { CardCatalog } from '../src/catalog';
import { projectDuel, interpretAction, interpretResponse, describeEvent } from '../src/presentation';
import { DuelTextCatalog } from '../src/duel/text';
import { createDuelState, reduceDuelMessage } from '../src/duel/model';
import { encodeDuelResponse } from '../src/duel/responses';
import { engine, set_card, setcommand, comid_field, comid_hand, request_input, listItem } from '../../../server/src/duel/translator/lockstep';
import { concat, packBIIII } from '../../../server/src/duel/translator/py';
import { CardMap } from '../../../server/src/duel/translator/cardmap';
import { norm, YO2Duel } from '../../../server/src/duel/translator/translator';
import type { DuelState } from '../src/duel/types';

const cat = new CardCatalog(); cat.install([{ passcode: 123, name: 'Reference card' }]);
const reduce = (s: DuelState, data: Uint8Array) => reduceDuelMessage(s, { id: 0x6202, data });
const initial = () => reduce(createDuelState(), engine(1));
const view = (s: DuelState) => projectDuel(s, cat, ['You', 'Rival']);
function translator() {
  return new YO2Duel([{}, {}], { cardmap: new CardMap({ wire: [123], wireHash: 0,
    cdb: { 123: [1, 0, 100, 100, 1, 1, 0, 1] }, scripts: {} }) });
}

describe('duel presentation adapter preserves server choices', () => {
  it('keeps legal opponent target actions and pile inspection available', () => {
    let s = initial();
    s = reduceDuelMessage(s, { id: 0x6611, data: comid_field(new Map([['1,2', 1 << 11], ['1,14', 1 << 1]])) });
    s = reduce(s, request_input(3));
    expect(view(s).actions?.map(a => a.id)).toContain('action:1:2:0:11');
    expect(view(s).actions?.map(a => a.id)).toContain('action:1:14:0:1');
    expect(interpretAction(s, 'action:1:2:0:11')).toEqual({ type: 'action', player: 1, zone: 2, index: 0, command: 11 });
  });
  it('keeps own deck identity hidden while allowing inspection of own face-down field cards', () => {
    let s = reduce(initial(), set_card(0, 13, 0, 123, 1));
    s = reduce(s, set_card(0, 0, 1, 123, 2));
    const cards = view(s).cards;
    expect(cards.find(c => c.id === '2')).toMatchObject({ name: 'Hidden card', faceUp: false });
    expect(cards.find(c => c.id === '2')?.passcode).toBeUndefined();
    expect(cards.find(c => c.id === '4')?.name).toBe('Reference card');
  });
  it('never projects cached opponent face-down identities, descriptions, stats or images', () => {
    const s = reduce(initial(), set_card(1, 0, 2, 123, 1));
    const card = view(s).cards.find(c => c.id === '3')!;
    expect(card).toMatchObject({ name: 'Hidden card', faceUp: false });
    expect(card.passcode).toBeUndefined(); expect(card.attack).toBeUndefined(); expect(card.description).toBeUndefined();
  });
  it.each([[1, 'Victory'], [2, 'Defeat'], [3, 'Draw']] as const)('uses server result constant %s', (result, text) => {
    expect(view(reduce(initial(), setcommand(0x4d, 0, [result, 0]))).ended).toBe(text);
  });
  it('maps real server multi-attribute prompt through UI selections to exact server response', () => {
    const d = translator(); let s = initial();
    for (const [id, data] of norm(d._on_select({ type: 'ANNOUNCE_ATTRIB', available: 0x30, count: 2 }))) s = reduceDuelMessage(s, { id, data });
    const p = view(s).prompt!;
    expect(p.kind).toBe('attributes'); expect([p.min, p.max]).toEqual([2, 2]);
    const response = interpretResponse(s, p.id, { optionIds: ['answer:2', 'answer:4'] });
    expect(response).toEqual({ type: 'answer', value: 6 });
    const packets = encodeDuelResponse(s, response);
    expect(d.on_client(packets[0].id, packets[0].data)[0]).toEqual({ cmd: 'respond', response: { type: 'ANNOUNCE_ATTRIB', attributes: [0x10, 0x20] } });
    expect(() => interpretResponse(s, p.id, { optionIds: ['answer:2'] })).toThrow(/exactly/);
    expect(() => interpretResponse(s, p.id, { optionIds: ['answer:2', 'answer:2'] })).toThrow();
  });
  it.each([13, 14, 0xff])('maps field dialog kind %s to one-at-a-time board actions', kind => {
    let s = reduce(initial(), setcommand(0x1b, 0x32, [kind, 0, 0]));
    s = reduceDuelMessage(s, { id: 0x6612, data: comid_hand([[0, 0, 1 << 11]]) });
    s = reduce(s, request_input(kind === 14 ? 8 : 3));
    const p = view(s).prompt!;
    expect(p.kind).toBe('place'); expect(p.candidates).toBeUndefined();
    expect(p.options[0].id).toBe('action:0:11:0:11');
    // Kind 13 is only the hand-limit discard, which the translator never lets the player cancel.
    expect(p.cancelable).toBe(kind !== 13);
    expect(() => interpretResponse(s, p.id, { cardIds: [] })).toThrow(/board action/);
    expect(interpretResponse(s, p.id, { optionId: p.options[0].id })).toEqual({ type: 'action', player: 0, zone: 11, index: 0, command: 11 });
  });
  it('assigns a fresh prompt token on every repeated board-selection request', () => {
    let s = reduce(initial(), setcommand(0x1b, 0x32, [14, 0, 0]));
    s = reduce(s, request_input(8)); const old = s.prompt!.id;
    s = reduce(s, request_input(8));
    expect(s.prompt!.id).toBeGreaterThan(old);
    expect(() => interpretResponse(s, String(old), { cancel: true })).toThrow(/no longer active/);
    expect(view(s).prompt?.cancelable).toBe(true);
  });
  it('clears a completed selection panel on authoritative gameplay progression', () => {
    let s = reduce(initial(), setcommand(0x1b, 0x32, [14, 0, 0]));
    s = reduce(s, request_input(8)); s = reduce(s, engine(0x0e, 0)); s = reduce(s, request_input(3));
    expect(s.prompt?.kind).toBe('actions');
  });
  it('blocks submitted prompt controls without changing the authoritative model', () => {
    const s = reduce(initial(), request_input(3)), before = structuredClone(s);
    const projected = projectDuel(s, cat, ['You', 'Rival'], s.prompt!.id);
    expect(projected.prompt).toBe(null); expect(projected.actions).toEqual([]);
    expect(projected.waiting).toMatch(/server/); expect(s).toEqual(before);
  });
  it('never exposes stale board/phase masks while a dialog is active', () => {
    let s = reduceDuelMessage(initial(), { id: 0x6611,
      data: comid_field(new Map([['0,2', 1 << 4]]), null, new Map([['0,5', 1]])) });
    s = reduce(s, request_input(3));
    expect(view(s).actions?.some(a => a.id === 'phase:5')).toBe(true);
    s = reduce(s, setcommand(0x1b, 0x32, [2, 0, 0]));
    expect(view(s).prompt?.kind).toBe('yes-no'); expect(view(s).actions).toEqual([]);
  });
  it('projects pile inspection as a read-only list with a working empty confirmation', () => {
    let s = reduceDuelMessage(initial(), { id: 0x6610, data: concat(packBIIII(0, 1, 0, 1, 0), listItem(123, 1, 0)) });
    s = reduce(s, setcommand(0x1b, 0x33, [0, 1, 0]));
    const p = view(s).prompt!;
    expect(p.readOnly).toBe(true);
    expect([p.min, p.max]).toEqual([0, 0]); expect(p.candidates?.[0].disabled).toBe(true);
    const response = interpretResponse(s, p.id, { cardIds: [] });
    expect(encodeDuelResponse(s, response)).toEqual([{ id: 0x6423, data: new Uint8Array(4) }]);
  });
  it('exposes public counter and turn badges without leaking face-down card state', () => {
    let s = reduce(initial(), set_card(0, 0, 0, 123, 1));
    s.cards[2].faceUp = true; s.cards[2].counters = { 0: 3, 2: 0 }; s.cards[2].turns = 2;
    expect(view(s).cards[0]).toMatchObject({ counters: [{ kind: 0, count: 3 }], turnCounter: 2 });
    s.cards[2].faceUp = false;
    expect(view(s).cards[0].counters).toBeUndefined(); expect(view(s).cards[0].turnCounter).toBeUndefined();
  });
  it('shows active public player effect turn counts using card names', () => {
    const s = initial(); s.sides[0].turnCounters = { 123: 2, 456: 0 };
    expect(view(s).players[0].turnCounters).toEqual([{ passcode: 123, name: 'Reference card', turns: 2 }]);
    expect(view(s).players[1].turnCounters).toEqual([]);
  });
});

describe('duel log', () => {
  it('describes server events in words, names only visible cards and drops bookkeeping', () => {
    const s = createDuelState();
    s.cards[7] = { ...(s.cards[7] ?? {}), uid: 7, passcode: 123, owner: 1, faceUp: true } as DuelState['cards'][number];
    s.cards[8] = { uid: 8, passcode: 123, owner: 1, faceUp: false } as DuelState['cards'][number];
    s.events = [
      { sequence: 1, type: 'engine:e', player: 0, params: [] },
      { sequence: 2, type: 'engine:55', player: 1, params: [0xffff, 2] },
      { sequence: 3, type: 'engine:2d', player: 1, params: [0x4000], card: 7 },
      { sequence: 4, type: 'engine:1a', player: 1, params: [0], card: 7 },
      { sequence: 5, type: 'engine:25', player: 0, params: [1200, 0, 0] },
      { sequence: 6, type: 'engine:12', player: 1, params: [0, 8, 1], card: 8 },
      { sequence: 7, type: 'engine:11', player: 0, params: [] },
      { sequence: 8, type: 'view:32', player: 0, params: [] },
    ];
    expect(projectDuel(s, cat, ['You', 'Rival']).log).toEqual([
      'You: Main Phase 1', 'Rival draws 2 cards.', 'Rival summons Reference card.', "Rival's Reference card attacks directly!",
      'You took 1200 damage', 'Rival activates a card.',
    ]);
  });
});

describe('LP changes in the duel log', () => {
  it('words a cost as a payment and damage as damage, as the original Duel Log does, with the LP before and after', () => {
    let s = initial();
    s = reduce(s, engine(0x25, 0, 4000, 2));   // Dark Magic Curtain: pay half your LP (the translator's PAY_LPCOST, type 2)
    s = reduce(s, engine(0x25, 1, 800, 0));    // effect damage
    s = reduce(s, engine(0x25, 1, 1200, 1));   // battle damage
    s = reduce(s, engine(0x24, 0, 500, 1));
    expect(view(s).log.slice(-4)).toEqual(['You paid 4000 LP (LP 8000 -> 4000)', 'Rival took 800 damage (LP 8000 -> 7200)',
      'Rival took 1200 damage (LP 7200 -> 6000)', 'You gained 500 LP (LP 4000 -> 4500)']);
    expect(s.events.filter(e => e.type === 'engine:25').map(e => e.lp)).toEqual([[8000, 4000], [8000, 7200], [7200, 6000]]);
  });
  it('logs an LP set only when it changes the LP', () => {
    let s = reduce(initial(), engine(0x26, 0, 7000));
    s = reduce(s, engine(0x26, 0, 7000));
    expect(view(s).log.filter(l => l.includes('LP set'))).toEqual(['You LP set (LP 8000 -> 7000)']);
  });
});

describe('board selection instructions', () => {
  const ask = (s: DuelState, entries: [string, number][]) => reduce(reduceDuelMessage(s, { id: 0x6611, data: comid_field(new Map(entries)) }), request_input(3));
  it('says what a selection made on the board asks, in the original dialog wording', () => {
    // A target among the opponent's cards (Mystical Space Typhoon): the translator's pick panel text 274.
    expect(view(ask(reduce(initial(), set_card(1, 5, 0, 123, 9)), [['1,5', 1 << 11]])).instruction).toBe('Select a target card from the Field.');
    // Empty zones: the original's zone names.
    expect(view(ask(initial(), [['0,1', 1 << 11], ['0,2', 1 << 11]])).instruction).toBe('Select a Monster Card Zone.');
    expect(view(ask(initial(), [['0,6', 1 << 11]])).instruction).toBe('Select a Spell & Trap Card Zone.');
    // An attack target (command 0 on the opponent's monsters).
    expect(view(ask(reduce(initial(), set_card(1, 0, 2, 123, 9)), [['1,2', 1 << 0]])).instruction).toBe('Select monster as target for attack.');
  });
  it('reads a choice among the player\'s monsters right after a summon from the hand as the Tribute', () => {
    const s = ask(reduce(initial(), set_card(0, 0, 0, 123, 4)), [['0,0', 1 << 11]]);
    const summon = { type: 'action', player: 0, zone: 11, index: 0, command: 4 } as const;
    expect(projectDuel(s, cat, ['You', 'Rival'], null, undefined, summon).instruction).toBe('Please select a monster as Tribute.');
    expect(projectDuel(s, cat, ['You', 'Rival'], null, undefined, null).instruction).toBe('Select a target card from the Field.');
  });
  it('uses the generated original text when installed, and none once the choice was sent', () => {
    const texts = new DuelTextCatalog(); texts.install({ v: 1, legacyOptions: {}, legacyPrompts: {}, cardNames: {}, dialogs: { 274: 'Original pick text.' } });
    const s = ask(reduce(initial(), set_card(1, 5, 0, 123, 9)), [['1,5', 1 << 11]]);
    expect(projectDuel(s, cat, ['You', 'Rival'], null, texts).instruction).toBe('Original pick text.');
    expect(projectDuel(s, cat, ['You', 'Rival'], s.prompt!.id, texts).instruction).toBeUndefined();
  });
});

describe('server information boxes', () => {
  it('become notices with the original dialog text when generated, never prompts', () => {
    let s = initial();
    s = reduce(s, setcommand(0x1b, 0x32, [0, 82, 0]));
    expect(s.prompt).toBeNull();
    const notice = s.events.find(e => e.type === 'notice')!;
    expect(notice.params).toEqual([82]);
    expect(describeEvent(s, cat, ['You', 'Rival'], notice)).toBe('You may surrender starting from the 10th turn.');
    const texts = new DuelTextCatalog(); texts.install({ v: 1, legacyOptions: {}, legacyPrompts: {}, cardNames: {}, dialogs: { 82: 'Original wording.' } });
    expect(describeEvent(s, cat, ['You', 'Rival'], notice, texts)).toBe('Original wording.');
  });
});

describe('duel log wording', () => {
  it('tells a summon from hand apart from a set by the face-up bit', () => {
    const s = initial(), at = (params: number[]) => ({ sequence: 1, type: 'engine:4f', player: 0 as const, params });
    expect(describeEvent(s, cat, ['You', 'Rival'], at([0, 0x4000 | 2 << 1, 0]))).toBe('You summons a monster.');
    expect(describeEvent(s, cat, ['You', 'Rival'], at([0, 0x8000 | 2 << 1, 0]))).toBe('You sets a monster.');
    expect(describeEvent(s, cat, ['You', 'Rival'], { ...at([0, 0x4000 | 6 << 1, 0]), type: 'engine:50' })).toBe('You plays a card.');
    expect(describeEvent(s, cat, ['You', 'Rival'], { ...at([0, 6 << 1, 0]), type: 'engine:50' })).toBe('You sets a card.');
  });
});
