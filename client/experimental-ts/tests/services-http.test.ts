import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, HttpClient, ResponseError } from '../src/services/http';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const client = (fetch: typeof globalThis.fetch, extra = {}) => new HttpClient({ origin: 'https://game.test', fetch, ...extra });
afterEach(() => vi.useRealTimers());
describe('same-origin bounded JSON transport', () => {
  it('sends authenticated JSON once with browser origin and no redirect following', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ updated: 1 }));
    const http = client(fetch);
    await expect(http.request('PUT', '/api/de/decks', x => x, { name: 'Test' })).resolves.toEqual({ updated: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe('https://game.test/api/de/decks');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', body: '{"name":"Test"}', headers: { 'Content-Type': 'application/json' } });
    expect(fetch.mock.calls[0][1].headers.Origin).toBeUndefined();
    http.dispose();
  });
  it('rejects cross-origin and non-API paths before fetching', async () => {
    const fetch = vi.fn(); const http = client(fetch);
    for (const path of ['https://evil.test/api/de/session', '//evil.test/api/de/session', '/api/../../secret', '/api/de/session#fragment']) {
      await expect(http.request('GET', path, x => x)).rejects.toThrow('same-origin');
    }
    expect(fetch).not.toHaveBeenCalled(); http.dispose();
  });
  it('retains server status, code, and message without retrying a mutation', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ error: 'stale-request' }, 409));
    const http = client(fetch);
    await expect(http.request('POST', '/api/de/shop/buy', x => x, {})).rejects.toMatchObject({ name: 'ApiError', status: 409, code: 'stale-request', message: 'stale-request' });
    expect(fetch).toHaveBeenCalledOnce(); http.dispose();
  });
  it('bounds streamed bytes without trusting content-length and cancels unread data', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('"éééé"')); }, cancel });
    const http = client(vi.fn().mockResolvedValue(new Response(body)), { maxResponseBytes: 8 });
    await expect(http.request('GET', '/api/de/session', x => x)).rejects.toThrow('byte limit');
    expect(cancel).toHaveBeenCalledOnce(); http.dispose();
  });
  it('rejects advertised oversize bodies and malformed successful JSON', async () => {
    const http = client(vi.fn().mockResolvedValueOnce(new Response('{}', { headers: { 'content-length': '999' } })).mockResolvedValueOnce(new Response('broken')), { maxResponseBytes: 8 });
    await expect(http.request('GET', '/api/de/session', x => x)).rejects.toBeInstanceOf(ResponseError);
    await expect(http.request('GET', '/api/de/session', x => x)).rejects.toThrow('Invalid JSON'); http.dispose();
  });
  it('preserves HTTP status for non-JSON failures', async () => {
    const http = client(vi.fn().mockResolvedValue(new Response('<html>unavailable</html>', { status: 503 })));
    await expect(http.request('GET', '/api/de/session', x => x)).rejects.toMatchObject({ status: 503 }); http.dispose();
  });
  it('honors pre-aborted signals without fetching', async () => {
    const fetch = vi.fn(); const http = client(fetch); const abort = new AbortController(); abort.abort();
    await expect(http.request('GET', '/api/de/session', x => x, undefined, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled(); http.dispose();
  });
  it('aborts a stalled body on timeout and disposal, removing timers', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    const http = client(vi.fn().mockImplementation(() => Promise.resolve(new Response(new ReadableStream({ cancel })))) , { timeoutMs: 100 });
    const result = http.request('GET', '/api/de/session', x => x); const check = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(100); await check;
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    const next = http.request('GET', '/api/de/session', x => x); const disposed = expect(next).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); http.dispose(); await disposed;
    expect(vi.getTimerCount()).toBe(0);
    await expect(http.request('GET', '/api/de/session', x => x)).rejects.toThrow('disposed');
  });
});
