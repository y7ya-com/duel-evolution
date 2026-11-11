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
  it('card lists, free numbers and declarations stay the duel screen panel', () => {
    expect(duelDialogCovers({ id: 'x', text: '', kind: 'cards', options: [], candidates: [{ id: 'c', label: 'C' }] })).toBe(false);
    expect(duelDialogCovers({ id: 'x', text: '', kind: 'number', options: [] })).toBe(false);
    expect(duelDialogCovers({ id: 'x', text: '', kind: 'announce', options: [] })).toBe(false);
  });
  it('duel speed cycles 1x, 1.5x, 2x', () => { expect([nextDuelSpeed(1), nextDuelSpeed(1.5), nextDuelSpeed(2)]).toEqual([1.5, 2, 1]); });
});
