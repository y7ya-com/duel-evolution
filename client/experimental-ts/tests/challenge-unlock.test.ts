import { describe, expect, it, vi } from 'vitest';
import { challengeUnlockUi, challengeUnlockWindows, ITEMGET_FRAME } from '../src/ui/htmlui/challenge-unlock';
import { Ids } from '../src/ui/htmlui/snapshot';

describe('the challenge-right unlock picture (CWindowModelItemGet after ITEMGET(1))', () => {
  it('shows each challenge right in turn, with its NPC\'s picture and line, and nothing for other bits', () => {
    const ui = challengeUnlockUi(), rerender = vi.fn(), receipt = {}, d = { ids: new Ids(), ui, rerender, text: (id: number) => id === 0xd91 ? ' Now, you can challenge Yami Marik to a Duel!' : undefined };
    let specs = challengeUnlockWindows(receipt, [159, 594, 592], d);
    expect(specs).toHaveLength(2);
    const pics = (specs[0]!.win as unknown as { pics: { key: string; source: Record<string, string> }[] }).pics;
    expect(pics.map(p => p.key)).toEqual(['frame', 'npc', 'line', 'ok']);
    expect(pics[0]!.source).toEqual({ archive: ITEMGET_FRAME });
    expect(pics[1]!.source).toEqual({ canvas: 'clerk:d08' });   // Yami Marik's picture
    expect(decodeURIComponent(pics[2]!.source.canvas!.slice('itemline:'.length))).toContain('Yami Marik');
    // OK: the next one (Seto Kaiba), then nothing
    const ok = specs[1]!.win.controls.find(c => c.name === 'ok')!; specs[1]!.handlers.get(ok.id)!.click!();
    expect(rerender).toHaveBeenCalled();
    specs = challengeUnlockWindows(receipt, [159, 594, 592], d);
    expect((specs[0]!.win as unknown as { pics: { source: Record<string, string> }[] }).pics[1]!.source).toEqual({ canvas: 'clerk:d04' });
    specs[1]!.handlers.get(specs[1]!.win.controls.find(c => c.name === 'ok')!.id)!.click!();
    expect(challengeUnlockWindows(receipt, [159, 594, 592], d)).toEqual([]);
    expect(challengeUnlockWindows({}, [159], d)).toEqual([]);
  });
});
