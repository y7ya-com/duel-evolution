import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, request } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRemoteAssetMiddleware, MAX_REMOTE_RANGE_BYTES, DEFAULT_REMOTE_ASSET_URL } from '../tools/remote-assets.mjs';
import { ArchiveReader } from '../src/assets';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const addr = server.address(); if (!addr || typeof addr === 'string') throw new Error('Missing port');
  return { port:addr.port, url:`http://127.0.0.1:${addr.port}/game/` };
}
async function get(port: number, path = '/game-assets/merge.dat', headers: Record<string, string | string[]> = { Range:'bytes=2-5' }, method = 'GET') {
  return new Promise<{ status:number; headers:IncomingMessage['headers']; body:Buffer }>((resolve, reject) => {
    const req = request({ hostname:'127.0.0.1', port, path, method, headers }, res => {
      const parts:Buffer[] = [];
      res.on('data', part => parts.push(part));
      res.on('end', () => resolve({ status:res.statusCode!, headers:res.headers, body:Buffer.concat(parts) }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}
async function proxy(options: Record<string, unknown> = {}) {
  const middleware = createRemoteAssetMiddleware(options);
  return listen((req, res) => middleware(req, res, () => { res.writeHead(418); res.end('next'); }));
}
const localPolicy = (url: URL) => url.protocol === 'http:' && url.hostname === '127.0.0.1';
const transport = (url: string, init: RequestInit) => fetch(url, init);
function response(body: BodyInit | null = '2345', headers: Record<string, string> = {}, status = 206) {
  return new Response(body, { status, headers:{ 'Content-Range':'bytes 2-5/128', 'Content-Length':'4', ...headers } });
}

describe('development remote asset configuration and request fence', () => {
  it('refuses production installation', () => {
    const previous = process.env.NODE_ENV;
    try { process.env.NODE_ENV = 'production'; expect(() => createRemoteAssetMiddleware()).toThrow('development-only'); }
    finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
  });
  it('requires opt-in; only a configured HTTPS directory or explicit original default is accepted', async () => {
    expect(DEFAULT_REMOTE_ASSET_URL).toBe('https://original.ygoevolution.com/game/');
    expect(() => createRemoteAssetMiddleware({ baseUrl:'http://127.0.0.1/game' })).toThrow('HTTPS');
    for (const baseUrl of ['file:///tmp/', 'https://u:p@example.test/', 'https://example.test/?url=x', 'https://example.test/#x']) {
      expect(() => createRemoteAssetMiddleware({ baseUrl })).toThrow();
    }
    expect(() => createRemoteAssetMiddleware({ baseUrl:'https://example.test/', originPolicy:() => false })).toThrow();
    for (const maxRangeBytes of [0, -1, Infinity, MAX_REMOTE_RANGE_BYTES + 1]) expect(() => createRemoteAssetMiddleware({ maxRangeBytes })).toThrow();
    for (const timeoutMs of [0, Infinity, 60001]) expect(() => createRemoteAssetMiddleware({ timeoutMs })).toThrow();
    const p = await proxy(); expect((await get(p.port)).status).toBe(503);
    const mocked = vi.fn(async () => response());
    const original = await proxy({ allowOriginalHost:true, fetch:mocked });
    expect((await get(original.port)).status).toBe(206);
    expect(mocked.mock.calls[0][0]).toBe(DEFAULT_REMOTE_ASSET_URL + 'merge.dat');
  });
  it('allows exactly four raw paths, never client-selected upstreams or query parameters', async () => {
    const mocked = vi.fn(async () => response());
    const p = await proxy({ baseUrl:'https://assets.example.test/game', fetch:mocked });
    for (const name of ['merge.dat', 'Sound.dat', 'merge/data/card.dat', 'merge/data/mini.dat']) {
      expect((await get(p.port, '/game-assets/' + name)).status).toBe(206);
      expect(mocked.mock.calls.at(-1)![0]).toBe('https://assets.example.test/game/' + name);
    }
    for (const name of ['', '../merge.dat', '%2e%2e/merge.dat', '%6derge.dat', 'merge.dat?url=https://evil.test/', 'merge.dat#x', '//evil.test/merge.dat', 'merge\\data\\card.dat', 'merge.dat%00', '%zz']) {
      expect((await get(p.port, '/game-assets/' + name)).status).toBe(404);
    }
    expect((await get(p.port, '/elsewhere')).status).toBe(418);
    expect((await get(p.port, undefined, undefined, 'HEAD')).status).toBe(405);
    expect((await get(p.port, undefined, undefined, 'POST')).status).toBe(405);
    expect(mocked).toHaveBeenCalledTimes(4);
  });
  it('requires exactly one finite safe bounded Range before fetching', async () => {
    const mocked = vi.fn(async () => response());
    const p = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:mocked, maxRangeBytes:4 });
    for (const range of ['', 'bytes=0-', 'bytes=-4', 'bytes=0-1,3-4', 'bytes=5-2', 'bytes=0-4', 'bytes=0-9007199254740992', 'bytes=9007199254740992-9007199254740993', 'items=0-1', 'bytes=0 - 1']) {
      expect((await get(p.port, undefined, range ? { Range:range } : {})).status).toBe(400);
    }
    expect((await get(p.port, undefined, { Range:['bytes=2-5', 'bytes=2-5'] })).status).toBe(400);
    expect(mocked).not.toHaveBeenCalled();
    expect((await get(p.port)).status).toBe(206);
  });
  it('strips incoming credentials and arbitrary headers, with explicit validator opt-in', async () => {
    const seen: { url:string; init:RequestInit }[] = [];
    const mocked = async (url:string, init:RequestInit) => { seen.push({ url, init }); return response('2345', { ETag:'"v1"', 'Set-Cookie':'secret=upstream', 'Access-Control-Allow-Origin':'*' }); };
    const headers = { Range:'bytes=2-5', Cookie:'secret=client', Authorization:'Bearer private', Origin:'https://evil.test', 'X-Remote-Url':'http://localhost/', 'If-Range':'"v1"', 'Accept-Encoding':'gzip' };
    const p = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:mocked });
    const a = await get(p.port, undefined, headers);
    expect(seen[0].init.headers).toEqual({ Range:'bytes=2-5', 'Accept-Encoding':'identity' });
    expect(seen[0].init).toMatchObject({ redirect:'manual', credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store' });
    expect(a.headers.etag).toBeUndefined(); expect(a.headers['set-cookie']).toBeUndefined(); expect(a.headers['access-control-allow-origin']).toBeUndefined();
    const q = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:mocked, forwardValidators:true });
    expect((await get(q.port, undefined, headers)).headers.etag).toBe('"v1"');
    expect(seen[1].init.headers).toEqual({ Range:'bytes=2-5', 'Accept-Encoding':'identity', 'If-Range':'"v1"' });
  });
});

describe('checked partial responses and bounded streaming', () => {
  it.each([200, 301, 302, 307, 308, 404, 412, 416, 500])('rejects status %s before reading its body', async status => {
    const pull = vi.fn(), cancel = vi.fn();
    const body = new ReadableStream({ pull, cancel }, { highWaterMark:0 });
    const p = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:async () => response(body, {}, status) });
    expect((await get(p.port)).status).toBe(status === 404 || status === 412 ? status : 502);
    expect(pull).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([
    { 'Content-Range':'bytes 1-5/128' }, { 'Content-Range':'bytes 2-4/128' }, { 'Content-Range':'bytes 2-5/*' },
    { 'Content-Range':'bytes 2-5/5' }, { 'Content-Range':'bytes 2-5/9007199254740992' },
    { 'Content-Length':'3' }, { 'Content-Length':'4, 4' }, { 'Content-Encoding':'gzip' },
  ])('refuses inconsistent metadata %j', async headers => {
    const p = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:async () => response('2345', headers) });
    expect((await get(p.port)).status).toBe(502);
  });
  it('accepts length-delimited HTTP/2 ranges without Content-Length while enforcing exact stream bytes', async () => {
    const p = await proxy({baseUrl:'https://assets.example.test/game/',fetch:async()=>new Response('2345',{status:206,headers:{'Content-Range':'bytes 2-5/128'}})});
    const result = await get(p.port); expect(result.status).toBe(206); expect(result.body.toString()).toBe('2345'); expect(result.headers['content-length']).toBe('4');
  });
  it('rejects missing bodies and a transport that followed a redirect', async () => {
    for (const upstream of [response(null), Object.defineProperty(response(), 'redirected', { value:true })]) {
      const p = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:async () => upstream });
      expect((await get(p.port)).status).toBe(502);
    }
  });
  it('streams all four archives through a local HTTP origin with exact headers and no cache', async () => {
    const seen:IncomingMessage[] = [];
    const upstream = await listen((req, res) => {
      seen.push(req); res.writeHead(206, { 'Content-Range':'bytes 2-5/128', 'Content-Length':'4', ETag:'"local"' });
      res.write(Buffer.from([2, 3])); res.end(Buffer.from([4, 5]));
    });
    const p = await proxy({ baseUrl:upstream.url, fetch:transport, originPolicy:localPolicy, forwardValidators:true });
    for (const name of ['merge.dat', 'Sound.dat', 'merge/data/card.dat', 'merge/data/mini.dat']) {
      const a = await get(p.port, '/game-assets/' + name, { Range:'bytes=2-5', Cookie:'private', Origin:'https://evil.test', 'If-Range':'"local"' });
      expect(a.status).toBe(206); expect(a.body).toEqual(Buffer.from([2, 3, 4, 5]));
      expect(a.headers['content-range']).toBe('bytes 2-5/128'); expect(a.headers['content-length']).toBe('4');
      expect(a.headers['cache-control']).toBe('no-store'); expect(a.headers.etag).toBe('"local"');
      expect(seen.at(-1)!.headers).toMatchObject({ range:'bytes=2-5', 'if-range':'"local"' });
      expect(seen.at(-1)!.headers['accept-encoding']!.split(',').every(x => x.trim() === 'identity')).toBe(true);
      expect(seen.at(-1)!.headers.cookie).toBeUndefined(); expect(seen.at(-1)!.headers.origin).toBeUndefined();
    }
    expect(seen.map(req => req.url)).toEqual(['/game/merge.dat', '/game/Sound.dat', '/game/merge/data/card.dat', '/game/merge/data/mini.dat']);
  });
  it('maps a failed fetch to a bounded generic error without leaking configuration', async () => {
    const p = await proxy({ baseUrl:'https://private.example.test/game/', fetch:async () => { throw new Error('private upstream details'); } });
    const result = await get(p.port);
    expect(result.status).toBe(502); expect(result.body.toString()).toBe('Remote asset read failed');
  });
  it('rejects an actual HTTP redirect without contacting the redirected destination', async () => {
    const destination = vi.fn((_req, res) => res.end('forbidden'));
    const other = await listen(destination);
    const upstream = await listen((_req, res) => { res.writeHead(302, { Location:other.url }); res.end(); });
    const p = await proxy({ baseUrl:upstream.url, fetch:transport, originPolicy:localPolicy });
    expect((await get(p.port)).status).toBe(502); expect(destination).not.toHaveBeenCalled();
  });
  it.each(['234', '23456'])('terminates a malformed streamed body (%s)', async body => {
    const p = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:async () => response(body) });
    await expect(get(p.port)).rejects.toThrow();
  });
  it('times out a local server before response headers and aborts its connection', async () => {
    let closed!: () => void; const disconnected = new Promise<void>(resolve => { closed = resolve; });
    const upstream = await listen((req, _res) => { req.once('close', closed); });
    const p = await proxy({ baseUrl:upstream.url, fetch:transport, originPolicy:localPolicy, timeoutMs:100 });
    expect((await get(p.port)).status).toBe(504); await disconnected;
  });
  it('cancels an in-progress upstream read when the downstream disconnects', async () => {
    let close!: () => void; const disconnected = new Promise<void>(resolve => { close = resolve; });
    const upstream = await listen((req, res) => {
      req.once('close', close); res.writeHead(206, { 'Content-Range':'bytes 2-5/128', 'Content-Length':'4' }); res.write('2');
    });
    const p = await proxy({ baseUrl:upstream.url, fetch:transport, originPolicy:localPolicy });
    await new Promise<void>((resolve, reject) => {
      const req = request({ hostname:'127.0.0.1', port:p.port, path:'/game-assets/merge.dat', headers:{ Range:'bytes=2-5' } }, res => {
        res.once('data', () => { res.destroy(); resolve(); }); res.on('error', () => {});
      }); req.on('error', reject); req.end();
    });
    await disconnected;
  });
  it('times out and cancels a stalled streaming response', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('2')); }, cancel });
    const p = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:async () => response(body), timeoutMs:50 });
    await expect(get(p.port)).rejects.toThrow(); expect(cancel).toHaveBeenCalledOnce();
  });
  it('applies downstream backpressure instead of draining an archive into memory', async () => {
    const size = 32 * 1024 * 1024, chunk = new Uint8Array(64 * 1024);
    let pulled = 0;
    const cancel = vi.fn();
    const body = new ReadableStream({ pull(c) { pulled += chunk.length; c.enqueue(chunk); if (pulled === size) c.close(); }, cancel });
    const p = await proxy({ baseUrl:'https://assets.example.test/game/', fetch:async () => response(body, { 'Content-Range':`bytes 0-${size - 1}/${size + 1}`, 'Content-Length':String(size) }) });
    await new Promise<void>((resolve, reject) => {
      const req = request({ hostname:'127.0.0.1', port:p.port, path:'/game-assets/merge.dat', headers:{ Range:`bytes=0-${size - 1}` } }, res => {
        res.pause(); setTimeout(() => {
          try { expect(pulled).toBeLessThan(size); resolve(); } catch (error) { reject(error); } finally { res.destroy(); }
        }, 100); res.on('error', () => {});
      }); req.on('error', reject); req.end();
    });
  });
  it('supports ArchiveReader extraction using only bounded synthetic archive reads', async () => {
    const name = 'data/example.bin', bytes = new Uint8Array(283), view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode('KCEJYUGI')); view.setUint32(8, 1, true);
    for (let i = 0; i < name.length; i++) bytes[12 + i] = (name.charCodeAt(i) & 15) << 4 | name.charCodeAt(i) >> 4;
    view.setUint32(268, 280, true); view.setUint32(272, 3, true); view.setUint32(276, 3, true); bytes.set([65, 66, 67], 280);
    const seen:string[] = [];
    const upstream = await listen((req, res) => {
      const range = req.headers.range!, match = /^bytes=(\d+)-(\d+)$/.exec(range)!;
      seen.push(range); const start = Number(match[1]), end = Number(match[2]);
      res.writeHead(206, { 'Content-Range':`bytes ${start}-${end}/${bytes.length}`, 'Content-Length':end - start + 1 }); res.end(bytes.slice(start, end + 1));
    });
    const p = await proxy({ baseUrl:upstream.url, fetch:transport, originPolicy:localPolicy });
    const reader = new ArchiveReader(`http://127.0.0.1:${p.port}/game-assets/merge.dat`);
    try { expect(new TextDecoder().decode(await reader.read(name))).toBe('ABC'); } finally { reader.dispose(); }
    expect(seen).toEqual(['bytes=0-11', 'bytes=12-279', 'bytes=280-282']);
  });
});
