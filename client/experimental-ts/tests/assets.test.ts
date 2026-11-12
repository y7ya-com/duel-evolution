import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArchiveReader, AssetManager, AssetNotFoundError, decodeLzss } from '../src/assets';
import { WorkQueue } from '../src/assets/async';

type Item = { name: string; data: number[]; size?: number };
// Structurally valid 3x2 JPEG headers; pixel decoding is a separate browser concern.
const jpeg = (width = 3, height = 2): number[] => [255,216,255,192,0,11,8,height >> 8,height & 255,width >> 8,width & 255,1,1,17,0,255,218,0,8,1,1,0,0,63,0];
const png = Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64'));
function archive(items: Item[]): Uint8Array {
  const size = 12 + items.length * 268 + items.reduce((n, e) => n + e.data.length, 0);
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('KCEJYUGI')); view.setUint32(8, items.length, true);
  let offset = 12 + items.length * 268;
  items.forEach((item, i) => {
    const at = 12 + i * 268;
    for (let k = 0; k < item.name.length; k++) {
      const b = item.name.charCodeAt(k); bytes[at + k] = ((b & 15) << 4) | (b >> 4);
    }
    view.setUint32(at + 256, offset, true); view.setUint32(at + 260, item.size ?? item.data.length, true);
    view.setUint32(at + 264, item.data.length, true); bytes.set(item.data, offset); offset += item.data.length;
  });
  return bytes;
}
function server(bytes: Uint8Array) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!;
    const start = Number(match[1]), end = Number(match[2]);
    return new Response(bytes.slice(start, end + 1), { status: 206, headers: {
      'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1), ETag: '"test"',
    } });
  });
}
const one = () => archive([{ name: '123.jpg', data: [1, 2, 3] }]);
afterEach(() => vi.restoreAllMocks());

describe('checked LZSS', () => {
  it('decodes literals, overlapping references and initialized ring bytes', () => {
    expect([...decodeLzss(Uint8Array.of(7, 65, 66, 67, 0xee, 0xf3), 9)]).toEqual([65,66,67,65,66,67,65,66,67]);
    expect([...decodeLzss(Uint8Array.of(0, 0, 0), 3)]).toEqual([0,0,0]);
  });
  it.each([[[], 1], [[1], 1], [[0, 2], 3], [[0, 0, 0], 2], [[1, 1, 9], 1]])('rejects truncated/overrun/trailing data %j', (data, size) => {
    expect(() => decodeLzss(Uint8Array.from(data as number[]), size as number)).toThrow();
  });
  it('checks output limits before allocation', () => expect(() => decodeLzss(new Uint8Array(), 10, 9)).toThrow('limit'));
});

describe('range archive reader', () => {
  it('reads normalized nibble-swapped names and compressed entries', async () => {
    const compressed = archive([{ name: 'DATA\\UI.PNG', data: [7, 65, 66, 67, 0xee, 0xf3], size: 9 }]);
    const read = new ArchiveReader('/merge.dat', server(compressed));
    expect(new TextDecoder().decode(await read.read('data/ui.png'))).toBe('ABCABCABC');
    read.dispose();
  });
  it('deduplicates directory and entry reads', async () => {
    const fetcher = server(one()), read = new ArchiveReader('/card', fetcher);
    const [a,b] = await Promise.all([read.read('123.jpg'), read.read('123.jpg')]);
    expect(a).toBe(b); expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(read.read('missing')).rejects.toBeInstanceOf(AssetNotFoundError);
    read.dispose();
  });
  it.each([
    { status: 200, headers: {} },
    { status: 206, headers: { 'Content-Range': 'bytes 1-12/283' } },
    { status: 206, headers: { 'Content-Range': 'bytes 0-11/*' } },
    { status: 206, headers: { 'Content-Range': 'bytes 0-11/283', 'Content-Length': '999' } },
    { status: 206, headers: { 'Content-Range': 'bytes 0-11/283', 'Content-Encoding': 'gzip' } },
  ])('rejects bad HTTP range metadata %j', async options => {
    const read = new ArchiveReader('/bad', vi.fn(async () => new Response(one().slice(0,12), options)));
    await expect(read.directory()).rejects.toThrow(); read.dispose();
  });
  it.each([11,13])('rejects a body of length %i for a 12-byte range', async length => {
    const read = new ArchiveReader('/bad', vi.fn(async () => new Response(new Uint8Array(length), { status: 206, headers: { 'Content-Range': 'bytes 0-11/283' } })));
    await expect(read.directory()).rejects.toThrow(/Truncated|Oversized/); read.dispose();
  });
  it.each(['magic','count','offset','size','name','duplicate'])('rejects malformed directory: %s', async type => {
    const bytes = archive([{ name:'a', data:[1] }, { name:'b', data:[2] }]), view = new DataView(bytes.buffer);
    if (type === 'magic') bytes[0] = 0;
    if (type === 'count') view.setUint32(8, 0xffffffff, true);
    if (type === 'offset') view.setUint32(12+256, 0, true);
    if (type === 'size') view.setUint32(12+260, 0xffffffff, true);
    if (type === 'name') bytes.fill(0x16,12,12+256);
    if (type === 'duplicate') bytes[12+268] = bytes[12];
    const read = new ArchiveReader('/bad', server(bytes));
    await expect(read.directory()).rejects.toThrow(); read.dispose();
  });
  it('cancels a response stream when aborted mid-range and can retry', async () => {
    const source = server(one()), cancelled = vi.fn();
    let opened!: () => void;
    const ready = new Promise<void>(r => { opened = r; });
    let first = true;
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      if (!first) return source(...args);
      first = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(one().slice(0,3)); opened(); }, cancel: cancelled,
      });
      return new Response(body,{status:206,headers:{'Content-Range':`bytes 0-11/${one().length}`}});
    });
    const reader = new ArchiveReader('/card',fetcher), controller = new AbortController();
    const pending = reader.read('123.jpg',controller.signal);
    const check = expect(pending).rejects.toMatchObject({name:'AbortError'});
    await ready; controller.abort(); await check;
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce());
    expect([...(await reader.read('123.jpg'))]).toEqual([1,2,3]); reader.dispose();
  });
  it('rejects a physically truncated archive directory and malformed compressed entry', async () => {
    const truncated = one().slice(0,100), read = new ArchiveReader('/truncated',server(truncated));
    await expect(read.directory()).rejects.toThrow('directory count'); read.dispose();
    const bad = new ArchiveReader('/bad',server(archive([{name:'a',data:[0,2],size:8}])));
    await expect(bad.read('a')).rejects.toThrow('Truncated LZSS reference'); bad.dispose();
  });
  it('checks configured bounds', async () => {
    const read = new ArchiveReader('/bad', server(one()), { maxStoredBytes: 2 });
    await expect(read.directory()).rejects.toThrow('Invalid archive entry'); read.dispose();
  });
  it('rejects changed totals and ETags', async () => {
    for (const header of ['Content-Range','ETag']) {
      const source = server(one());
      const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
        const response = await source(...args);
        if (source.mock.calls.length === 2) response.headers.set(header, header === 'ETag' ? '"new"' : 'bytes 12-279/999');
        return response;
      });
      const read = new ArchiveReader('/bad',fetcher);
      await expect(read.directory()).rejects.toThrow(/changed/); read.dispose();
    }
  });
});

describe('asset lifetime', () => {
  it('shares art, pins live leases, serves art past the budget uncached, evicts released URLs, and disposes idempotently', async () => {
    const fetcher = server(archive([{ name:'123.jpg',data:jpeg() },{ name:'456.jpg',data:jpeg() }]));
    const revoke = vi.spyOn(URL,'revokeObjectURL');
    const charge = jpeg().length * 2 + 3 * 2 * 4;
    const manager = new AssetManager({ baseUrl:'/assets',fetch:fetcher,cacheBytes:charge });
    const [a,b] = await Promise.all([manager.loadCard('00000123'),manager.loadCard(123)]);
    expect(a.value).toBe(b.value); expect(a.value.mimeType).toBe('image/jpeg');
    expect(fetcher).toHaveBeenCalledTimes(3); expect(manager.cacheBytes).toBe(charge);
    expect(a.value).toMatchObject({ width:3,height:2 });
    // the budget all live leases: 456 is still served (a picture on screen never goes missing), outside the cache, up to
    // the budget again; past that a load is refused
    const over = await manager.loadCard(456);
    expect(over.value.url).not.toBe(a.value.url); expect(manager.cacheBytes).toBe(charge);
    await expect(manager.loadCard(456)).rejects.toThrow('live leases');
    over.release(); over.release(); expect(revoke).toHaveBeenCalledWith(over.value.url);
    a.release(); a.release();
    const again = await manager.loadCard(456); again.release();
    expect(revoke).toHaveBeenCalledWith(again.value.url); expect(revoke).not.toHaveBeenCalledWith(a.value.url);
    b.release();
    const c = await manager.loadCard(456);
    expect(revoke).toHaveBeenCalledWith(a.value.url);
    manager.dispose(); manager.dispose(); c.release();
    expect(manager.cacheBytes).toBe(0); expect(revoke).toHaveBeenCalledWith(c.value.url);
    await expect(manager.loadCard(123)).rejects.toThrow('disposed');
  });
  it('supports scene assets, mini art, and explicit merge fallback', async () => {
    const bytes = archive([{ name:'data/test.png',data:png },{ name:'123.jpg',data:jpeg() }]);
    const source = server(bytes);
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => String(args[0]).endsWith('card.dat') ? new Response(null,{status:404}) : source(...args));
    const manager = new AssetManager({baseUrl:'/base/',fetch:fetcher,mergeCardPaths:{123:'data/test.png'}});
    const art = await manager.loadCard(123), scene = await manager.readScene('DATA\\TEST.PNG'), mini = await manager.loadMini(123);
    expect(art.value.mimeType).toBe('image/png'); expect(scene.value.width).toBe(1); expect(mini.value.width).toBe(3);
    art.release(); scene.release(); mini.release(); manager.dispose();
  });
  it('reads the 2x card art from its own directory (live: cards/ beside game/), by passcode and by YO2 id', async () => {
    const enc = (t: string) => new TextEncoder().encode(t);
    const cards = server(archive([{ name:'123.jpg',data:jpeg() },{ name:'list_card.txt',data:enc('\r\n123.jpg\r\n') }]));
    const merge = server(archive([{ name:'data/card/list_card.txt',data:enc('\r\nold.png\r\nold2.png') },{ name:'data/card/old.png',data:png },{ name:'data/card/old2.png',data:png }]));
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => { const u = String(args[0]);
      return u.startsWith('/cards/merge/data/card.dat') ? cards(...args) : u.startsWith('/game/merge.dat') ? merge(...args) : new Response(null,{status:404}); });
    const manager = new AssetManager({baseUrl:'/game/',cardsBaseUrl:'/cards/',fetch:fetcher});
    const art = await manager.loadCard(123);
    expect(art.value.mimeType).toBe('image/jpeg'); art.release();
    expect([...(await manager.readCardArt(1))!.subarray(0, 2)]).toEqual([255, 216]);
    // an id card.dat does not list: merge.dat's own picture, as lazyfs falls back
    expect([...(await manager.readCardArt(2))!.subarray(0, 4)]).toEqual(png.slice(0, 4));
    manager.dispose();
  });
  it('rejects oversized cache allocations without creating object URLs', async () => {
    const create = vi.spyOn(URL,'createObjectURL'), manager = new AssetManager({baseUrl:'/',fetch:server(archive([{ name:'123.jpg',data:jpeg() }])),cacheBytes:jpeg().length * 2});
    await expect(manager.loadCard(123)).rejects.toThrow('budget'); expect(create).not.toHaveBeenCalled(); manager.dispose();
  });
  it('rejects malformed and oversized image headers before allocating URLs', async () => {
    const create = vi.spyOn(URL,'createObjectURL');
    for (const data of [[1,2,3],jpeg(9000,9000)]) {
      const manager = new AssetManager({baseUrl:'/',fetch:server(archive([{name:'123.jpg',data}]))});
      await expect(manager.loadCard(123)).rejects.toThrow(); expect(create).not.toHaveBeenCalled(); expect(manager.cacheBytes).toBe(0); manager.dispose();
    }
  });
  it('aborts one subscriber independently, and cancels the network after the last leaves', async () => {
    let networkSignal: AbortSignal | undefined;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      networkSignal = init!.signal!; started();
      return new Promise<Response>((_resolve,reject) => networkSignal!.addEventListener('abort', () => reject(new DOMException('abort','AbortError'))));
    });
    const manager = new AssetManager({baseUrl:'/',fetch:fetcher});
    const a = new AbortController(), b = new AbortController();
    const first = manager.loadCard(123,a.signal), second = manager.loadCard(123,b.signal);
    const firstCheck = expect(first).rejects.toMatchObject({name:'AbortError'});
    const secondCheck = expect(second).rejects.toMatchObject({name:'AbortError'});
    await ready; a.abort(); await firstCheck; expect(networkSignal!.aborted).toBe(false);
    b.abort(); await secondCheck;
    await vi.waitFor(() => expect(networkSignal!.aborted).toBe(true)); manager.dispose();
  });
  it('disposes pending callers promptly even with an uncooperative fetch', async () => {
    let started!: () => void;
    const ready = new Promise<void>(r => { started = r; });
    const manager = new AssetManager({baseUrl:'/',fetch:vi.fn(() => { started(); return new Promise<Response>(() => {}); })});
    const pending = manager.loadCard(123);
    const check = expect(pending).rejects.toMatchObject({name:'AbortError'});
    await ready; manager.dispose(); await check;
  });
  it('rejects pre-aborted loads before any fetch', async () => {
    const fetcher = server(one()), manager = new AssetManager({baseUrl:'/',fetch:fetcher}), controller = new AbortController();
    controller.abort(); await expect(manager.loadCard(123,controller.signal)).rejects.toMatchObject({name:'AbortError'});
    expect(fetcher).not.toHaveBeenCalled(); manager.dispose();
  });
});

describe('bounded scheduling', () => {
  it('caps concurrency and removes cancelled queued work', async () => {
    const queue = new WorkQueue(1,1), controller = new AbortController();
    let finish!: () => void;
    const first = queue.run(() => new Promise<void>(r => {finish=r;}),new AbortController().signal);
    const second = queue.run(async () => 2,controller.signal);
    const aborted = expect(second).rejects.toMatchObject({name:'AbortError'});
    await expect(queue.run(async () => 3,new AbortController().signal)).rejects.toThrow('queue full');
    controller.abort(); await aborted; finish(); await first;
    expect(await queue.run(async () => 4,new AbortController().signal)).toBe(4);
  });
});
