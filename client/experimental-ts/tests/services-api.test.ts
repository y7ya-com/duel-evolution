import { describe, expect, it, vi } from 'vitest';
import { GameApi, expandStarterDeck, toShopView, toSocialView } from '../src/services/api';
import { HttpClient } from '../src/services/http';
// Fixtures mirror server/src/game/{decks,starter,shop-api,chat}.ts and Lobby.friendsInfo.
export const shopFixture = {
  available: true, wallet: { total: 5000, bound: 5000, earned: 0 }, nextRequestId: 'server-issued-token',
  items: [{ id: 1, itemId: 1, kind: 1, param: 1, price: 200, internalId: null, rarity: null, category: 'packs', name: '', owned: false }],
};
export const decksFixture = { current: { world: 'Old', free: null }, decks: [{ name: 'Old', main: [46986414], side: [], extra: [], updated: 123 }], deleted: [{ name: 'Removed', updated: 100 }] };
export function setup(...responses: unknown[]) {
  const fetch = vi.fn(); for (const r of responses) fetch.mockResolvedValueOnce(new Response(JSON.stringify(r)));
  return { fetch, api: new GameApi(new HttpClient({ origin: 'https://game.test', fetch })) };
}
describe('actual HTTP route payloads', () => {
  it('reads signed-out and full signed-in session envelopes', async () => {
    const signedIn = { signedIn: true, userId: 'account-1', name: null, roles: ['admin'], discord: true, password: false };
    const { api } = setup({ signedIn: false }, signedIn);
    expect(await api.session()).toEqual({ signedIn: false }); expect(await api.session()).toEqual(signedIn); api.dispose();
  });
  it('uses better-auth username/sign-out paths and bodies', async () => {
    const { api, fetch } = setup({ token: 'secret', user: { id: 'u' } }, { success: true });
    await api.signIn('Alice', 'password'); await api.signOut();
    expect(fetch.mock.calls.map(c => [new URL(c[0]).pathname, c[1].body])).toEqual([
      ['/api/auth/sign-in/username', '{"username":"Alice","password":"password"}'], ['/api/auth/sign-out', '{}'],
    ]); api.dispose();
  });
  it('reads tombstones, saves passcode arrays, selects per mode, and encodes Unicode names', async () => {
    const { api, fetch } = setup(decksFixture, { updated: 124 }, { updated: 125 }, { updated: 126 });
    const decks = await api.decks(); expect(decks).toEqual(decksFixture);
    await api.saveDeck(decks.decks[0], 'world'); await api.selectDeck('Old', 'free'); await api.deleteDeck('魔法 #1');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ main: [46986414], current: true, mode: 'world' });
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ name: 'Old', mode: 'free' });
    expect(fetch.mock.calls[3][0]).toBe('https://game.test/api/de/decks/%E9%AD%94%E6%B3%95%20%231'); api.dispose();
  });
  it('decodes wallet and shop purchase replay including server token rotation', async () => {
    const purchased = { itemId: 1, kind: 0, passcode: 46986414, internalId: 100, rarity: 'rare' };
    const response = { ...shopFixture, nextRequestId: 'next-token', purchased: [purchased], replayed: true };
    const { api, fetch } = setup(shopFixture, shopFixture.wallet, response);
    expect(toShopView(await api.shop())).toMatchObject({ mp: 5000, earnedMp: 0, items: [{ name: 'Item 1' }] });
    expect(await api.wallet()).toEqual(shopFixture.wallet);
    expect(await api.purchase({ itemId: 1, count: 1, requestId: 'server-issued-token' })).toEqual(response);
    expect(fetch.mock.calls[2][0]).toBe('https://game.test/api/de/shop/buy'); api.dispose();
  });
  it('distinguishes unavailable, claimed and claimable starter payloads with counted card pairs', async () => {
    const deck = { id: 7001, name: 'E-HERO EVOLUTION DECK', main: [[46986414, 2]], extra: [[35809262, 1]] };
    const { api } = setup({ claimable: false, reason: 'no-character' }, { claimable: false, reason: 'claimed', claimed: deck },
      { claimable: true, decks: [{ id: 7001, name: deck.name, cover: 35809262, blurb: 'Fuse HERO monsters.', cards: [{ id: 35809262, name: 'Flame Wingman', n: 1, type: 'extra' }] }] },
      { ok: true, id: 7001, cards: 3, deck });
    expect(await api.starter()).toEqual({ claimable: false, reason: 'no-character' });
    expect(await api.starter()).toMatchObject({ claimed: deck });
    expect(await api.starter()).toMatchObject({ claimable: true });
    expect(expandStarterDeck((await api.claimStarter(7001)).deck)).toEqual({ name: deck.name, main: [46986414, 46986414], side: [], extra: [35809262] }); api.dispose();
  });
  it('maps friend pid/place and decodes nested chat ok envelopes', async () => {
    const msg = { id: 1, at: 1000, channel: 'whisper', pid: 50, name: 'Alice', text: 'Hello', targetPid: 51 };
    const { api, fetch } = setup({ friends: [{ pid: 51, name: 'Bob', online: true, place: 'Duel' }] },
      { ok: { cursor: 1, reset: false, pid: 50, name: 'Alice', players: [{ pid: 51, name: 'Bob' }], messages: [msg] } }, { ok: msg });
    expect(toSocialView(await api.friends()).friends[0]).toEqual({ id: 51, name: 'Bob', online: true, status: 'Duel' });
    expect((await api.chat(0)).ok.messages).toEqual([msg]);
    expect(await api.sendChat({ channel: 'whisper', text: 'Hello', targetPid: 51, requestId: 'message-0001' })).toEqual({ ok: msg });
    expect(fetch.mock.calls[2][1].method).toBe('POST'); api.dispose();
  });
  it('rejects fabricated UI-shaped responses instead of accepting them as server data', async () => {
    const { api } = setup({ mp: 1000, items: [] }, { signedIn: true, name: 'Alice' }, { current: 'Old', decks: [] });
    await expect(api.shop()).rejects.toThrow('response shape'); await expect(api.session()).rejects.toThrow('response shape'); await expect(api.decks()).rejects.toThrow('response shape'); api.dispose();
  });
});
