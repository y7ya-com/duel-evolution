import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineController, decodeCosmetics, decodeOnlineTag } from '../src/features/online';
import { HttpClient } from '../src/services/http';
import { configFrom } from '../../../server/src/config';
import { buildServer } from '../../../server/src/server';
import { Session } from '../../../server/src/game/hub';
import * as PP from '../../../server/src/game/persist';
import { cosmeticInfo, cosmeticOpen, cosmeticEquip, cosmeticTrade } from '../../../server/src/game/cosmetics';
import { tagApi } from '../../../server/src/duel/tagRelay';

function fixture() {
  PP.setProgression(true);
  const accounts = Object.fromEntries(['alice', 'bob', 'eve', 'dan'].map((name, i) => {
    const p = PP.blankProfile(name); p.prog = 1; p.rec.mp = 15000;
    return [name, { idx: i + 1, user_id: `user-${name}`, active_slot: 0, players: { '0': name }, profiles: { '0': p } }];
  }));
  const srv = buildServer(configFrom({ PROGRESSION: '1', PVP_TEST: '1', PARITY_SEED: '1' }), { accounts }, () => {});
  const sessions = ['alice', 'bob', 'eve', 'dan'].map((name, i) => {
    const s = new Session(name, i + 1, false); s.slot = 0; s.pid = 1000 + 4 * (i + 1); s.name = name; s.world = 0; s.state = 0; s.block = 1; s.ablock = 0;
    s.lobby = { closed: false, post() {}, sess: s, port: 5730 } as any;
    srv.game.hub.sessions.set(name, s); return s;
  });
  return { game: srv.game, a: sessions[0], b: sessions[1], sessions };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
function setup(fetch: typeof globalThis.fetch) { const http = new HttpClient({ origin: 'https://game.test', fetch, timeoutMs: 0 }); const onChange = vi.fn(); return { controller: new OnlineController({ http, onChange }), http, onChange }; }
afterEach(() => { PP.setProgression(false); vi.restoreAllMocks(); });

describe('online server contracts', () => {
  it('decodes actual server catalogue, open, replay, equip and trade receipts', () => {
    // The box roll is crypto-random and the pool holds female-only designs this male character cannot equip,
    // so pin the server's draw to the first design of the first tier: the same item every run.
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T) => { if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(0); return a; });
    const f = fixture();
    const info = decodeCosmetics(cosmeticInfo(f.game, f.a)); expect(info.boxes).toHaveLength(3); expect(info.catalog.length).toBeGreaterThan(20);
    const opened = decodeCosmetics(cosmeticOpen(f.game, f.a, { boxId: 'head', requestId: info.nextRequestId }));
    expect(opened.requestId).toBe('0'); expect(opened.nextRequestId).toBe('1'); expect(opened.reward?.owned).toBe(true); expect(opened.reward?.compatible).toBe(true);
    const replay = decodeCosmetics(cosmeticOpen(f.game, f.a, { boxId: 'head', requestId: '0' })); expect(replay.replay).toBe(true); expect(replay.wallet).toEqual(opened.wallet);
    expect(decodeCosmetics(cosmeticEquip(f.game, f.a, { id: opened.reward!.id })).equipped?.id).toBe(opened.reward!.id);
    const raw = f.game.store.loadRaw(); raw.accounts.alice.cosmetics.copies[opened.reward!.id] = 1; f.game.store.saveRaw(raw);
    expect(decodeCosmetics(cosmeticTrade(f.game, f.a, { targetPid: f.b.pid, give: [{ id: opened.reward!.id, count: 1 }], want: [], requestId: 'stable-trade-1' })).offer?.status).toBe('pending');
  });
  it('decodes actual tag invitations, consent and cancellation using epoch seconds', () => {
    const f = fixture();
    expect(decodeOnlineTag(tagApi(f.game, 'user-alice', 'GET')[1]).self.pid).toBe(f.a.pid);
    const invite = decodeOnlineTag(tagApi(f.game, 'user-alice', 'POST', 'invite', { teammatePid: f.sessions[1].pid, opponentPid: f.sessions[2].pid, opponentTeammatePid: f.sessions[3].pid })[1]);
    expect(invite.invitations).toHaveLength(1); expect(invite.invitations[0].expires).toBeLessThan(Date.now() / 1000 + 121);
    const id = invite.invitations[0].id;
    expect(decodeOnlineTag(tagApi(f.game, 'user-bob', 'POST', 'accept', { id })[1]).invitations[0].seats.find(s => s.pid === f.b.pid)?.accepted).toBe(true);
    expect(decodeOnlineTag(tagApi(f.game, 'user-alice', 'POST', 'cancel', { id })[1]).event?.kind).toBe('cancelled');
  });
  it('rejects wrong shapes, oversized collections, invalid tokens and malformed seats', () => {
    const f = fixture(), info = cosmeticInfo(f.game, f.a) as any;
    for (const patch of [{ nextRequestId: 'forged' }, { inventory: Array(2049).fill({}) }, { appearance: { parts: [] } }, { wallet: { total: -1, bound: 0, earned: 0 } }]) expect(() => decodeCosmetics({ ...info, ...patch })).toThrow();
    expect(() => decodeOnlineTag({ self: { pid: 1, name: 'a' }, active: false, available: true, players: [], invitations: [{ seats: [] }] })).toThrow();
  });
});

describe('online request lifecycle', () => {
  it('suppresses concurrent duplicate attempts and confirms only a valid receipt', async () => {
    const f = fixture(); let resolve!: (r: Response) => void;
    const fetch = vi.fn().mockImplementation((url: string) => url.endsWith('/open') ? new Promise<Response>(r => { resolve = r; }) : Promise.resolve(json(url.endsWith('/tag') ? tagApi(f.game, 'user-alice', 'GET')[1] : cosmeticInfo(f.game, f.a))));
    const { controller: c, http } = setup(fetch); await c.refresh();
    const opening = c.dispatch({ type: 'open-box', boxId: 'head' }); await c.dispatch({ type: 'open-box', boxId: 'head' });
    expect(fetch).toHaveBeenCalledTimes(3); expect(c.state.receipt).toBeNull();
    resolve(json(cosmeticOpen(f.game, f.a, { boxId: 'head', requestId: '0' }))); await opening;
    expect(c.state.receipt?.cosmetics?.requestId).toBe('0'); c.dispose(); http.dispose();
  });
  it('never silently retries, retains an ambiguous box token across refresh, and rejects missing receipts', async () => {
    const f = fixture(); let fail = true;
    const fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/open')) { if (fail) { fail = false; cosmeticOpen(f.game, f.a, JSON.parse(init.body as string)); return Promise.reject(new TypeError('connection lost')); } return Promise.resolve(json(cosmeticOpen(f.game, f.a, JSON.parse(init.body as string)))); }
      return Promise.resolve(json(url.endsWith('/tag') ? tagApi(f.game, 'user-alice', 'GET')[1] : cosmeticInfo(f.game, f.a)));
    });
    const { controller: c, http } = setup(fetch); await c.refresh(); await c.dispatch({ type: 'open-box', boxId: 'head' });
    expect(fetch).toHaveBeenCalledTimes(3); expect(c.state.retryAction).toMatchObject({ requestId: '0' }); expect(c.state.receipt).toBeNull();
    await c.refresh(); expect(c.state.cosmetics?.nextRequestId).toBe('1'); await c.dispatch({ type: 'open-box', boxId: 'head' });
    expect(JSON.parse(fetch.mock.calls.at(-1)![1].body).requestId).toBe('0'); expect(c.state.receipt?.cosmetics?.replay).toBe(true);
    fetch.mockResolvedValueOnce(json(cosmeticInfo(f.game, f.a))); await c.dispatch({ type: 'equip', id: 'hair:anything' }); expect(c.state.error).toBe('Missing equip receipt'); expect(c.state.receipt).toBeNull(); c.dispose(); http.dispose();
  });
  it('retries an ambiguous trade with the original token and payload even if caller mutates its action', async () => {
    const f = fixture(); let submitted: any;
    const fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/trade')) { submitted = JSON.parse(init.body as string); return Promise.reject(new Error('lost acknowledgement')); }
      return Promise.resolve(json(url.endsWith('/tag') ? tagApi(f.game, 'user-alice', 'GET')[1] : cosmeticInfo(f.game, f.a)));
    });
    const { controller: c, http } = setup(fetch);
    const action = { type: 'trade' as const, targetPid: f.b.pid!, give: [{ id: 'hair:skinhead', count: 1 }], want: [], requestId: 'stable-client-token' };
    const pending = c.dispatch(action); action.give[0].count = 99; await pending;
    expect(c.state.retryAction).toMatchObject({ requestId: 'stable-client-token', give: [{ count: 1 }] });
    await c.dispatch({ ...action, requestId: 'different-token' }); expect(fetch).toHaveBeenCalledOnce();
    await c.dispatch(c.state.retryAction!); expect(fetch).toHaveBeenCalledTimes(2); expect(submitted).toMatchObject({ requestId: 'stable-client-token', give: [{ count: 1 }] }); c.dispose(); http.dispose();
  });
  it('lets mutations supersede in-flight reads without stale read errors overwriting receipts', async () => {
    const f = fixture(), responses: ((r: Response) => void)[] = [];
    const fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/cancel')) return Promise.resolve(json(tagApi(f.game, 'user-alice', 'GET')[1]));
      return new Promise<Response>(resolve => responses.push(resolve));
    });
    const { controller: c, http } = setup(fetch); const reading = c.refresh();
    await c.dispatch({ type: 'tag-cancel', id: 'server-id' }); expect(c.state.receipt?.action).toBe('tag-cancel');
    responses[0](json({ error: 'old error' }, 409)); responses[1](json({})); await reading;
    expect(c.state.error).toBeNull(); expect(c.state.receipt?.action).toBe('tag-cancel'); c.dispose(); http.dispose();
  });
  it('surfaces server errors once and does not claim success', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ error: 'Please wait', retryAfter: 3 }, 429)); const { controller: c, http } = setup(fetch);
    await c.dispatch({ type: 'tag-invite', teammatePid: 2, opponentPid: 3, opponentTeammatePid: 4 }); expect(c.state.error).toBe('Please wait'); expect(c.state.receipt).toBeNull(); expect(fetch).toHaveBeenCalledOnce(); c.dispose(); http.dispose();
  });
  it('invalidates stale generations, aborts reset/dispose, and keeps all drafts until reset', async () => {
    const f = fixture(); const responses: ((r: Response) => void)[] = [], signals: AbortSignal[] = [];
    const fetch = vi.fn().mockImplementation((_url, init) => { signals.push(init.signal); return new Promise<Response>(r => responses.push(r)); });
    const { controller: c, http, onChange } = setup(fetch); c.state.drafts['tag-other'] = '3'; const first = c.refresh(); expect(c.state.drafts['tag-other']).toBe('3'); c.reset(); expect(signals.every(s => s.aborted)).toBe(true); expect(c.state.drafts).toEqual({});
    responses[0](json(cosmeticInfo(f.game, f.a))); responses[1](json(tagApi(f.game, 'user-alice', 'GET')[1])); await first; expect(c.state.cosmetics).toBeNull();
    const second = c.refresh(); c.dispose(); const count = onChange.mock.calls.length; responses[2](json({})); responses[3](json({})); await second; await c.dispatch({ type: 'tag-cancel', id: 'old' }); expect(onChange).toHaveBeenCalledTimes(count); http.dispose();
  });
});
