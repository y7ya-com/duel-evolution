import { describe, expect, it } from 'vitest';
import { npcbinSet, playerDataUpdate } from '../../../server/src/game/persist';
import { duelRewards, PDU_LENGTH, pduNpcRecord, signed } from '../src/duel/rewards';
import { duelResultWindows } from '../src/ui/htmlui/duel-result';
import type { DuelView } from '../src/ui/contracts';

describe('duel rewards from the server after a duel', () => {
  it('reads the NPC record from the real server 0x4140 PLAYERDATAUPDATE', () => {
    const p: Record<string, any> = { rec: { lv: 7, score: 1234, mp: 5600 } };
    npcbinSet(p, 51, [3, 2, 1, 0]);
    const pdu = playerDataUpdate(p, 51);
    expect(pdu.length).toBe(PDU_LENGTH);
    expect(pduNpcRecord(pdu)).toEqual({ npc: 51, wins: 3, losses: 2, draws: 1 });
    // The same update outside an NPC duel names no NPC.
    expect(pduNpcRecord(playerDataUpdate(p))).toBeNull();
    // Its head is what the session reads as the profile (lv u8, score u32, mp u32, big-endian).
    const v = new DataView(pdu.buffer, pdu.byteOffset); expect([pdu[0], v.getUint32(1), v.getUint32(5)]).toEqual([7, 1234, 5600]);
  });
  it('the rewards are the profile change since the duel began', () => {
    expect(duelRewards({ level: 7, score: 1200, mp: 5000 }, { level: 8, score: 1290, mp: 5150 })).toEqual({ mp: 150, score: 90, level: [7, 8] });
    expect(duelRewards({ level: 7, score: 1200, mp: 5000 }, { level: 7, score: 1200, mp: 5000 })).toBeNull();
    expect(duelRewards(null, { level: 7, score: 1, mp: 1 })).toBeNull();
    expect([signed(5), signed(-3), signed(0)]).toEqual(['+5', '-3', '0']);
  });
});

const ids = { of: (() => { const m = new Map<string, number>(); return (k: string) => { if (!m.has(k)) m.set(k, m.size + 1); return m.get(k)!; }; })() };
const duel = (extra: Partial<DuelView>): DuelView => ({ players: [{ name: 'Jaden', lp: 3200 }, { name: 'Chumley', lp: 0 }], cards: [], prompt: null,
  turn: 9, turnPlayer: 0, phase: 'Main', log: [], ended: 'Victory', ...extra });
const texts = (specs: ReturnType<typeof duelResultWindows>) => specs.flatMap(s => s.win.controls.map(c => c.text).filter(Boolean));
const numbers = (specs: ReturnType<typeof duelResultWindows>) => specs.flatMap(s => (s.win.nums ?? []).map(n => n.text));

describe('result board (main\'s result.js windows)', () => {
  it('an NPC duel shows the two records (WIN / LOSE / SCORE, the NPC\'s the other way round), the titles\' art and Next, as live', () => {
    const specs = duelResultWindows({ ids: ids as never, duel: duel({ npcRecord: { name: 'Chumley', wins: 3, losses: 2, draws: 1 }, rewards: { mp: 150, score: 90, level: [7, 8] } }), next: () => {} });
    expect(specs.map(s => s.win.cls)).toEqual(['CWindowResult', 'CWindowResult', 'CEnginePictures', 'CWindowResultNext']);
    // live's record: one 24 px ShadowText, the name and the captions a blank line apart; no MP or level row
    expect(texts(specs)).toEqual(expect.arrayContaining(['Jaden\n\nWIN\n\nLOSE\n\nSCORE', 'Chumley\n\nWIN\n\nLOSE\n\nSCORE']));
    expect([...specs[3]!.handlers.values()].map(h => [h.key, h.label])).toEqual([['duel-result-next', 'Next']]);
    expect(texts([specs[3]!])).toContain('Next');
    expect((specs[0]!.win.nums ?? []).map(n => n.text)).toEqual(['3', '2', '90']);
    expect((specs[1]!.win.nums ?? []).map(n => n.text)).toEqual(['2', '3', '0']);
    expect(((specs[2]!.win as unknown as { pics: { source: { archive: string } }[] }).pics).map(p => p.source.archive)).toEqual(expect.arrayContaining([expect.stringMatching(/result_(winner|loser|draw)_01_\?\.png$/)]));
  });
  it('the server\'s 0x4140 record wins over the one counted from the talk; the talk\'s is the fallback until it arrives', () => {
    const talk = { name: 'Chumley', record: { wins: 1, loses: 0, draws: 0 } };
    const counts = (d: DuelView) => (duelResultWindows({ ids: ids as never, duel: d, npc: talk, next: () => {} })[0]!.win.nums ?? []).slice(0, 2).map(n => n.text);
    expect(counts(duel({ npcRecord: { name: 'Chumley', wins: 3, losses: 2, draws: 1 } }))).toEqual(['3', '2']);
    expect(counts(duel({}))).toEqual(['1', '0']);
  });
  it('a PvP duel keeps one record per side and the player\'s score on their own board (no MP row: live shows none)', () => {
    const specs = duelResultWindows({ ids: ids as never, duel: duel({ rewards: { mp: 0, score: -20, level: [9, 9] } }), next: () => {} });
    expect(specs.map(s => s.win.cls).filter(c => c !== 'CEnginePictures')).toEqual(['CWindowResult', 'CWindowResult', 'CWindowResultNext']);
    expect((specs[0]!.win.nums ?? []).map(n => n.text)).toEqual(['3200', '9', '-20']);
    expect((specs[1]!.win.nums ?? []).map(n => n.text)).toEqual(['0', '9']);
  });
});
