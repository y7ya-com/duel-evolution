import { describe, expect, it } from 'vitest';
import { decodeSanctions, SANCTION_CHAT, SANCTION_TRADE } from '../src/network/session';
import { BinaryWriter } from '../src/network/codec';
import { chatWindow, playerCard, CHAT_SANCTION_NOTICE, TRADE_SANCTION_NOTICE, type BuildContext, type HtmlUiLocal } from '../src/ui/htmlui/windows';
import { Ids } from '../src/ui/htmlui/snapshot';
import type { ClientView } from '../src/ui/contracts';

// server/src/game/accounts.ts: 0x3004 = u32 0, u32 (1 | adminFlags & 0x60), 4 B region
const auth = (flags: number) => new BinaryWriter().u32(0).u32(flags).bytes();

describe('account sanctions (0x3004 AUTHRESULT flags, server lobby.ts SANCTION_CHAT / SANCTION_TRADE)', () => {
  it('decodes the chat and trade bits; a short result has none', () => {
    expect([SANCTION_CHAT, SANCTION_TRADE]).toEqual([0x20, 0x40]);
    expect(decodeSanctions(auth(1))).toEqual({ chat: false, trade: false });
    expect(decodeSanctions(auth(1 | 0x20))).toEqual({ chat: true, trade: false });
    expect(decodeSanctions(auth(1 | 0x40))).toEqual({ chat: false, trade: true });
    expect(decodeSanctions(auth(0x61))).toEqual({ chat: true, trade: true });
    expect(decodeSanctions(new Uint8Array(4))).toEqual({ chat: false, trade: false });
  });

  const ctx = (sanctions?: { chat: boolean; trade: boolean }): BuildContext => {
    const state = { scene: 'lobby', busy: false, sanctions,
      lobby: { connected: true, chat: [], avatars: [] },
      profileDetail: { selfPid: 1, selectedPid: 2, summary: { name: 'Ann', level: 3, wins: 1, losses: 0 }, details: null, comments: ['', ''], pending: null } } as unknown as ClientView;
    return { state, ui: { chatTab: 0, chatDraft: '' } as unknown as HtmlUiLocal, ids: new Ids(), send: () => {}, rerender: () => {} };
  };

  it('chat: the input is greyed out with the notice, nothing to type into', () => {
    const open = chatWindow(ctx())!, barred = chatWindow(ctx({ chat: true, trade: false }))!;
    expect(open.win.controls.some(c => c.cls === 'CWindowTaskInput')).toBe(true);
    expect(barred.win.controls.some(c => c.cls === 'CWindowTaskInput')).toBe(false);
    const note = barred.win.controls.find(c => c.cls === 'CWindowTaskText' && c.text === CHAT_SANCTION_NOTICE);
    expect(note?.color).toEqual([0.5, 0.5, 0.5, 1]);
    expect([...barred.handlers.values()].some(h => h.key === 'chat')).toBe(false);
  });

  it('trade: the player card\'s Card Swap is greyed out and does nothing', () => {
    let traded = 0;
    const actions = { trade: () => { traded++; }, friend: () => {} };
    const open = playerCard(ctx(), actions)!, barred = playerCard(ctx({ chat: false, trade: true }), actions)!;
    const key = (s: typeof open, k: string) => [...s.handlers.entries()].find(([, h]) => h.key === k);
    const [oid, oh] = key(open, 'card-trade')!; oh.click?.();
    expect(traded).toBe(1);
    expect(open.win.controls.find(c => c.id === oid)?.state).toBe('normal');
    const [bid, bh] = key(barred, 'card-trade')!;
    expect(bh.click).toBeUndefined();
    expect(bh.label).toBe(TRADE_SANCTION_NOTICE);
    expect(barred.win.controls.find(c => c.id === bid)?.state).toBe('disabled');
    expect(barred.win.controls.find(c => c.id === key(barred, 'card-friend')![0])?.state).toBe('normal');
  });
});
