import { describe, expect, it } from 'vitest';
import { duelDialog, duelDialogCovers, nextDuelSpeed } from '../src/ui/htmlui/duel-dialogs';
import { Ids } from '../src/ui/htmlui/snapshot';
import type { DuelPromptView, DuelResponse } from '../src/ui/contracts';

const run = (p: DuelPromptView, local = { selected: new Set<string>(), hover: null as string | null }) => {
  const sent: DuelResponse[] = []; const spec = duelDialog({ ids: new Ids(), busy: false, local, respond: r => sent.push(r), rerender: () => {} }, p)!;
  const press = (key: string) => { for (const h of spec.handlers.values()) if (h.key === key) { h.click?.(); return true; } return false; };
  return { spec, sent, press };
};
describe("main's duel dialogs from the prompt model", () => {
  it('Yes / No is a CUYesNoDialog whose buttons answer', () => {
    const { spec, sent, press } = run({ id: 'p1', text: 'Activate?', kind: 'yes-no', options: [{ id: 'y', label: 'Yes' }, { id: 'n', label: 'No' }] });
    expect(spec.win.cls).toBe('CUYesNoDialog');
    expect(press('prompt-option:p1:n')).toBe(true); expect(sent).toEqual([{ optionId: 'n' }]);
  });
  it('a longer choice is a CUSelectDialog list, its rows and Cancel answer', () => {
    const { spec, sent, press } = run({ id: 'p2', text: 'Choose an effect', kind: 'choice', cancelable: true, options: ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase() })) });
    expect(spec.win.cls).toBe('CUSelectDialog');
    expect(spec.win.controls.filter(c => c.name.startsWith('row:')).map(c => [c.cls, c.label])).toEqual(['A', 'B', 'C', 'Cancel'].map(l => ['CWindowTaskTextSwitch', l]));
    press('prompt-option:p2:b'); press('prompt-cancel:p2'); expect(sent).toEqual([{ optionId: 'b' }, { cancel: true }]);
  });
  it('attributes mark rows and OK sends them once the count is right', () => {
    const local = { selected: new Set<string>(), hover: null };
    const p: DuelPromptView = { id: 'p3', text: 'Declare an attribute', kind: 'attributes', min: 1, max: 1, options: ['light', 'dark', 'fire'].map(id => ({ id, label: id })) };
    run(p, local).press('prompt-option:p3:dark');
    const { sent, press } = run(p, local); press('prompt-confirm:p3'); expect(sent).toEqual([{ optionIds: ['dark'] }]);
  });
  it('an option prompt listing the cards it is about, and board places, stay the duel screen panel', () => {
    expect(duelDialogCovers({ id: 'x', text: '', kind: 'choice', options: [{ id: 'a', label: 'A' }], candidates: [{ id: 'c', label: 'C' }] })).toBe(false);
    expect(duelDialogCovers({ id: 'x', text: '', kind: 'place', options: [] })).toBe(false);
    expect(duelDialogCovers({ id: 'x', text: '', kind: 'cards', options: [], candidates: [{ id: 'c', label: 'C' }] })).toBe(true);
    expect(duelDialogCovers({ id: 'x', text: '', kind: 'number', options: [] })).toBe(true);
    expect(duelDialogCovers({ id: 'x', text: '', kind: 'announce', options: [] })).toBe(true);
  });
  // A dialog rebuilt after each edit, as index.ts does (rerender), with its per-prompt drafts in `local`.
  const live = (p: DuelPromptView) => {
    const local: { selected: Set<string>; hover: string | null; draft?: string; page?: number } = { selected: new Set(), hover: null };
    const sent: DuelResponse[] = [], inspected: string[] = [];
    let spec = duelDialog({ ids: new Ids(), busy: false, local, respond: r => sent.push(r), rerender: () => {}, inspect: id => inspected.push(id) }, p)!;
    const ids = new Ids(), build = () => { spec = duelDialog({ ids, busy: false, local, respond: r => sent.push(r), rerender: () => {}, inspect: id => inspected.push(id) }, p)!; };
    build();
    const handler = (key: string) => [...spec.handlers.entries()].find(([, h]) => h.key === key);
    const control = (key: string) => { const e = handler(key); return e ? spec.win.controls.find(c => c.id === e[0]) : undefined; };
    return { get spec() { return spec; }, sent, inspected, local, control,
      press(key: string) { const e = handler(key); if (!e) throw new Error(`no ${key}`); e[1].click?.(); build(); },
      type(key: string, v: string) { handler(key)![1].text?.(v); build(); },
      enter(key: string) { handler(key)![1].enter?.(); build(); } };
  };
  it('a card list is a CUSelectDialog of TextSwitch rows, marked in pick order, OK at the server count, paged by ten', () => {
    const candidates = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, label: `Card ${i}`, ...(i === 1 ? { disabled: true } : {}) }));
    const d = live({ id: 'l', text: 'Choose 2 cards', kind: 'cards', options: [], candidates, min: 2, max: 2, cancelable: true });
    expect(d.spec.win.cls).toBe('CUSelectDialog');
    expect(d.spec.win.controls.filter(c => c.name.startsWith('row:')).map(c => c.label)).toEqual(candidates.slice(0, 10).map(c => c.label));
    expect(d.control('prompt-candidate:l:c1')?.enabled).toBe(false);
    expect(d.control('prompt-confirm:l')?.enabled).toBe(false);
    d.press('prompt-candidate:l:c3'); d.press('prompt-page:l-next');
    expect(d.spec.win.controls.filter(c => c.name.startsWith('row:')).map(c => c.label)).toEqual(['Card 10', 'Card 11']);
    d.press('prompt-candidate:l:c11'); d.press('prompt-candidate:l:c10');   // the count is full: the third does not mark
    expect(d.control('prompt-candidate:l:c11')?.label).toBe('Card 11  [2]');
    d.press('prompt-confirm:l'); expect(d.sent).toEqual([{ cardIds: ['c3', 'c11'] }]);
    d.press('prompt-cancel:l'); expect(d.sent.at(-1)).toEqual({ cancel: true });
  });
  it('a read-only pile opens a card\'s details from its row and closes with an empty answer', () => {
    const d = live({ id: 'r', text: 'Graveyard', kind: 'cards', readOnly: true, options: [], candidates: [{ id: 'g', label: 'Kuriboh', card: { id: 'g', name: 'Kuriboh' } as never }] });
    d.press('prompt-candidate:r:g'); expect(d.inspected).toEqual(['g']);
    d.press('prompt-confirm:r'); expect(d.sent).toEqual([{ cardIds: [] }]);
  });
  it('free number entry is main\'s CWindowModelInput1: its own input, OK only in range, Enter answers', () => {
    const d = live({ id: 'n', text: 'How many counters?', kind: 'number', options: [], numberMin: 1, numberMax: 5 });
    expect(d.spec.win.cls).toBe('CWindowModelInput1');
    expect(d.control('prompt-number:n')).toMatchObject({ cls: 'CWindowTaskInput', value: '1', focused: true });
    d.type('prompt-number:n', '9'); expect(d.control('prompt-confirm:n')?.state).toBe('disabled');
    d.enter('prompt-number:n'); expect(d.sent).toEqual([]);
    d.type('prompt-number:n', '4'); d.enter('prompt-number:n'); expect(d.sent).toEqual([{ number: 4 }]);
  });
  it('a card declaration narrows the declarable names as it is typed; a row or Enter declares', () => {
    const declarable = [{ id: '40640057', label: 'Kuriboh' }, { id: '89631139', label: 'Blue-Eyes White Dragon' }, { id: '46986414', label: 'Dark Magician' }];
    const d = live({ id: 'a', text: 'Declare a card', kind: 'announce', options: [], declarable });
    expect(d.spec.win.cls).toBe('CWindowModelInput1');
    expect(d.control('prompt-announcement:a')).toMatchObject({ cls: 'CWindowTaskInput', focused: true });
    expect(d.spec.win.controls.filter(c => c.name.startsWith('row:')).length).toBe(3);
    d.type('prompt-announcement:a', 'dragon');
    expect(d.spec.win.controls.filter(c => c.name.startsWith('row:')).map(c => c.label)).toEqual(['Blue-Eyes White Dragon']);
    d.enter('prompt-announcement:a'); expect(d.sent).toEqual([{ text: '89631139' }]);
    d.type('prompt-announcement:a', 'magi'); d.press('prompt-declare:a:46986414'); expect(d.sent.at(-1)).toEqual({ text: '46986414' });
  });
  it('duel speed cycles 1x, 1.5x, 2x', () => { expect([nextDuelSpeed(1), nextDuelSpeed(1.5), nextDuelSpeed(2)]).toEqual([1.5, 2, 1]); });
});
