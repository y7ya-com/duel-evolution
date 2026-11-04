import { describe, expect, it, vi } from 'vitest';
import { Resource, GameplayService } from '../src/services/gameplay';
import { GameApi } from '../src/services/api';
import { HttpClient } from '../src/services/http';
import { DeckEditor } from '../src/services/deck-editor';
const deferred = <T>() => { let resolve!: (x: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status });
const shop = { available: true, wallet: { total: 5000, bound: 5000, earned: 0 }, items: [], nextRequestId: 'issued-token' };
function setup(fetch: typeof globalThis.fetch) { return new GameplayService(new GameApi(new HttpClient({ origin: 'https://game.test', fetch }))); }

describe('resource preservation and gameplay mutations', () => {
  it('keeps last good data on failure and publishes detached snapshots', async () => {
    const r = new Resource<{ n: number }>(); const seen: unknown[] = []; const unsubscribe = r.subscribe(s => seen.push(s));
    await r.load(async () => ({ n: 1 }));
    const snapshot = r.state; snapshot.data!.n = 100;
    await expect(r.load(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(r.state).toEqual({ data: { n: 1 }, error: 'offline', loading: false });
    expect(seen.length).toBeGreaterThan(3); unsubscribe(); r.dispose();
  });
  it('rejects stale responses even from a loader ignoring abort', async () => {
    const r = new Resource<number>(); const old = deferred<number>(), next = deferred<number>();
    const a = r.load(() => old.promise), check = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    const b = r.load(() => next.promise); next.resolve(2); await b; old.resolve(1); await check;
    expect(r.state).toEqual({ data: 2, loading: false, error: null }); r.dispose();
  });
  it('aborts external and disposed requests while preserving previous state', async () => {
    const r = new Resource<number>(); r.set(1); const pending = deferred<number>(); const abort = new AbortController();
    const p = r.load(() => pending.promise, { signal: abort.signal }), check = expect(p).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort(); pending.resolve(2); await check; expect(r.state.data).toBe(1); expect(r.state.error).toBeNull();
    r.dispose(); await expect(r.load(async () => 3)).rejects.toThrow('disposed');
  });
  it('retains uncertain purchases and explicitly retries the exact token/body once', async () => {
    const purchase = { ...shop, nextRequestId: 'new-token', wallet: { total: 4800, bound: 4800, earned: 0 }, purchased: [], replayed: true };
    const fetch = vi.fn().mockResolvedValueOnce(response(shop)).mockRejectedValueOnce(new TypeError('connection lost')).mockResolvedValueOnce(response(purchase));
    const g = setup(fetch); await g.refreshShop();
    await expect(g.buy(12, 1)).rejects.toThrow('connection lost');
    expect(g.shop.state.data).toEqual(shop); expect(g.pendingPurchase).toEqual({ itemId: 12, count: 1, requestId: 'issued-token' });
    await expect(g.buy(13, 1)).rejects.toThrow('pending purchase'); expect(fetch).toHaveBeenCalledTimes(2);
    await g.retryPurchase(); expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[2][1].body);
    expect(g.pendingPurchase).toBeNull(); expect(g.wallet.state.data?.total).toBe(4800); expect(g.shop.state.data?.nextRequestId).toBe('new-token'); g.dispose();
  });
  it('does not reuse a stale request token automatically or discard the last shop', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(shop)).mockResolvedValueOnce(response({ error: 'stale-request' }, 409));
    const g = setup(fetch); await g.refreshShop(); await expect(g.buy(1, 1)).rejects.toMatchObject({ status: 409, code: 'stale-request' });
    expect(fetch).toHaveBeenCalledTimes(2); expect(g.shop.state.data).toEqual(shop); expect(g.pendingPurchase?.requestId).toBe('issued-token');
    g.abandonPurchase(); expect(g.shop.state.data).toBeNull(); await expect(g.buy(1, 1)).rejects.toThrow('Refresh'); g.dispose();
  });
  it('serializes purchase calls and ignores a read completing after a purchase', async () => {
    const pending = deferred<Response>(), oldRead = deferred<Response>();
    const fetch = vi.fn().mockResolvedValueOnce(response(shop)).mockImplementationOnce(() => oldRead.promise).mockImplementationOnce(() => pending.promise);
    const g = setup(fetch); await g.refreshShop(); const read = g.refreshShop(), stale = expect(read).rejects.toMatchObject({ name: 'AbortError' });
    const buy = g.buy(1, 1); await expect(g.retryPurchase()).rejects.toThrow('already in progress');
    pending.resolve(response({ ...shop, nextRequestId: 'new', purchased: [], replayed: false })); await buy;
    oldRead.resolve(response(shop)); await stale; expect(g.shop.state.data?.nextRequestId).toBe('new'); g.dispose();
  });
  it('failed saves preserve editor and prior deck list; successful save keeps subsequent edits dirty', async () => {
    const save = deferred<Response>();
    const fetch = vi.fn().mockResolvedValueOnce(response({ error: 'bad cards' }, 400)).mockImplementationOnce(() => save.promise);
    const g = setup(fetch), e = new DeckEditor({ name: 'Deck', main: [1], side: [], extra: [] });
    e.move(2, 'collection', 'main');
    await expect(g.saveEditor(e)).rejects.toMatchObject({ status: 400 }); expect(e.dirty).toBe(true); expect(e.deck.main).toEqual([1, 2]);
    const p = g.saveEditor(e); e.move(3, 'collection', 'main'); save.resolve(response({ updated: 123 })); await p;
    expect(e.dirty).toBe(true); expect(e.deck.main).toEqual([1, 2, 3]); e.reset(); expect(e.deck.main).toEqual([1, 2]); g.dispose();
  });
  it('does not mark a newly loaded editor clean from an older save', async () => {
    const save = deferred<Response>(), g = setup(vi.fn().mockImplementation(() => save.promise));
    const e = new DeckEditor({ name: 'First', main: [1], side: [], extra: [] });
    const p = g.saveEditor(e); e.load({ name: 'Second', main: [2], side: [], extra: [] }); e.move(3, 'collection', 'main');
    save.resolve(response({ updated: 123 })); await p; e.reset(); expect(e.deck.name).toBe('Second'); expect(e.deck.main).toEqual([2]); g.dispose();
  });
  it('does not let an older save acknowledgment replace a newer saved baseline', async () => {
    const first = deferred<Response>(), second = deferred<Response>();
    const g = setup(vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise));
    const e = new DeckEditor({ name: 'Deck', main: [1], side: [], extra: [] });
    e.move(2, 'collection', 'main'); const a = g.saveEditor(e);
    e.move(3, 'collection', 'main'); const b = g.saveEditor(e);
    second.resolve(response({ updated: 2 })); await b; expect(e.dirty).toBe(false);
    first.resolve(response({ updated: 1 })); await a; expect(e.dirty).toBe(false); g.dispose();
  });
  it('does not clear local state on failed sign-out', async () => {
    const g = setup(vi.fn().mockResolvedValue(response({ message: 'unavailable' }, 503))); g.shop.set(shop);
    await expect(g.signOut()).rejects.toMatchObject({ status: 503 }); expect(g.shop.state.data).toEqual(shop); g.dispose();
  });
});
