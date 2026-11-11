import { describe, expect, it } from 'vitest';
import { BinaryWriter } from '../src/network/codec';
import { decodeLimitList, reduceLimitList, LIMIT_ENTRY_SIZE } from '../src/network/banlist';
import { CardCatalog } from '../src/catalog';
import { deckProblems } from '../src/ui/extra/deck-check';
import LD from '../../../server/gamedata/lobby.json';
import { setup, drive } from './network-server-fixture';

// the server's own encoding (server/src/game/lobby.ts limitationMsgs): u32 index, u32 passcode, u32 0, u8 copies
const chunk = (entries: [number, number, number][]) => { const w = new BinaryWriter(); for (const [i, pc, n] of entries) w.u32(i).u32(pc).u32(0).u8(n); return w.bytes(); };

describe('LIMIT_LIST 0x5600: the server forbidden/limited list', () => {
  it('decodes the 13-byte entries and joins chunks; index 0 starts a new list', () => {
    const a = chunk([[0, 111, 0], [1, 222, 1]]), b = chunk([[2, 333, 2]]);
    expect(a.length).toBe(2 * LIMIT_ENTRY_SIZE);
    expect(decodeLimitList(a)).toEqual([{ index: 0, passcode: 111, copies: 0 }, { index: 1, passcode: 222, copies: 1 }]);
    const list = reduceLimitList(reduceLimitList(null, a), b);
    expect([...list]).toEqual([[111, 0], [222, 1], [333, 2]]);
    expect([...reduceLimitList(list, chunk([[0, 444, 1]]))]).toEqual([[444, 1]]);
    expect(() => decodeLimitList(new Uint8Array(5))).toThrow();
  });

  it('replaces the catalogue static limits: marks, copy limits and the deck check follow the server', () => {
    const catalog = new CardCatalog();
    catalog.install([{ passcode: 1, name: 'Pot', limit: 0 }, { passcode: 2, name: 'Raigeki', limit: 1 }, { passcode: 3, name: 'Kuriboh' }]);
    expect(catalog.card(1).limit).toBe(0);
    catalog.installLimits(new Map([[3, 1]]));
    expect(catalog.card(1).limit).toBeUndefined();
    expect(catalog.card(3).limit).toBe(1);
    expect(catalog.allCards().find(c => c.passcode === 3)?.limit).toBe(1);
    const filler = Array.from({ length: 38 }, () => 1);
    const problems = deckProblems({ name: 'd', main: [...filler, 3, 3], extra: [], side: [] }, pc => catalog.card(pc));
    expect(problems.some(p => p.rule === 'limited' && p.passcode === 3)).toBe(true);
    expect(problems.some(p => p.rule === 'forbidden')).toBe(false);
    catalog.installLimits(null);
    expect(catalog.card(1).limit).toBe(0);
  });

  it('the real server sends its list after character selection and the session keeps it', async () => {
    const { session } = setup();
    expect(await drive(session.start())).toEqual([]);
    await drive(session.createCharacter(0, 'Limit Duelist'));
    await drive(session.selectCharacter(0));
    const limits = session.state.limits!;
    const expected = (LD as { limits: [number, number][] }).limits.filter(([, n]) => n < 3);
    expect(limits.size).toBe(expected.length);
    for (const [pc, n] of expected) expect(limits.get(pc)).toBe(n);
  }, 60000);
});
