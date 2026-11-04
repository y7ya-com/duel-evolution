import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, request } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveReader } from '../src/assets';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createAssetMiddleware, parseByteRange, MAX_RANGE_BYTES, localProxyOptions, devOriginGate } from '../tools/dev-assets.mjs';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(),'duel-assets-')); cleanups.push(() => rm(root,{ recursive:true,force:true }));
  await mkdir(join(root,'merge/data'),{ recursive:true });
  const bytes = Uint8Array.from({ length:128 },(_,i) => i);
  await writeFile(join(root,'merge.dat'),bytes); await writeFile(join(root,'Sound.dat'),bytes);
  await writeFile(join(root,'merge/data/card.dat'),bytes); await writeFile(join(root,'secret.txt'),'private');
  return { root,bytes };
}
async function listen(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler); await new Promise<void>(r => server.listen(0,'127.0.0.1',r));
  cleanups.push(() => new Promise<void>(r => server.close(() => r())));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
  return { server,port:address.port };
}
async function get(port: number,path: string,headers: Record<string,string> = {},method = 'GET') {
  return new Promise<{ status:number; headers:Record<string,string|string[]|undefined>; body:Buffer }>((resolve,reject) => {
    const req = request({ hostname:'127.0.0.1',port,path,headers,method },res => {
      const chunks:Buffer[] = []; res.on('data',b => chunks.push(b)); res.on('end',() => resolve({ status:res.statusCode!,headers:res.headers,body:Buffer.concat(chunks) }));
    }); req.on('error',reject); req.end();
  });
}
async function serverFor(root?: string,cardsRoot?: string) {
  const middleware = createAssetMiddleware({ gameRoot:root,cardsRoot });
  return listen((req,res) => middleware(req,res,() => { res.writeHead(404); res.end('next'); }));
}

describe('bounded single byte ranges',() => {
  it.each([
    ['bytes=0-4',10,{ start:0,end:4,length:5 }],['bytes=5-',10,{ start:5,end:9,length:5 }],
    ['bytes=-3',10,{ start:7,end:9,length:3 }],['bytes=-20',10,{ start:0,end:9,length:10 }],
    ['bytes=2-99',10,{ start:2,end:9,length:8 }],
  ])('parses %s',(value,size,expected) => expect(parseByteRange(value,size)).toEqual(expected));
  it.each(['bytes=','bytes=-','bytes=-0','bytes=2-1','bytes=10-','bytes=0-1,3-4','bytes=0-9007199254740992','bytes=a-b','items=0-1','bytes=0 - 1'])('rejects %s',value => expect(parseByteRange(value,10)).toBeNull());
  it('rejects a whole large archive and unsafe sizes',() => {
    expect(parseByteRange('bytes=0-',MAX_RANGE_BYTES + 1)).toBeNull();
    expect(parseByteRange('bytes=0-1',Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(parseByteRange('bytes=0-0',0)).toBeNull();
  });
});

describe('read-only local archive middleware',() => {
  it('streams exact ranges, HEAD metadata, suffixes and open-ended reads',async () => {
    const f = await fixture(), { port } = await serverFor(f.root);
    const a = await get(port,'/game-assets/merge.dat',{ Range:'bytes=5-9' });
    expect(a.status).toBe(206); expect(a.body).toEqual(Buffer.from(f.bytes.slice(5,10)));
    expect(a.headers['content-range']).toBe('bytes 5-9/128'); expect(a.headers['content-length']).toBe('5');
    expect(a.headers['content-encoding']).toBeUndefined(); expect(a.headers['cache-control']).toBe('no-store');
    const head = await get(port,'/game-assets/merge.dat',{},'HEAD'); expect(head.status).toBe(200); expect(head.body.length).toBe(0); expect(head.headers['content-length']).toBe('128');
    const rangeHead = await get(port,'/game-assets/Sound.dat',{ Range:'bytes=0-3' },'HEAD'); expect(rangeHead.status).toBe(206); expect(rangeHead.body.length).toBe(0);
    expect((await get(port,'/game-assets/merge.dat',{ Range:'bytes=-4' })).body).toEqual(Buffer.from(f.bytes.slice(-4)));
    expect((await get(port,'/game-assets/merge.dat',{ Range:'bytes=120-' })).body).toEqual(Buffer.from(f.bytes.slice(120)));
  });
  it('serves a real archive-reader round trip through checked Range HTTP without fetching the whole archive',async () => {
    const f = await fixture(), payload = Uint8Array.of(7,65,66,67,0xee,0xf3), name = 'data/example.bin';
    const bytes = new Uint8Array(12 + 268 + payload.length), view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode('KCEJYUGI')); view.setUint32(8,1,true);
    for (let i = 0; i < name.length; i++) bytes[12+i] = (name.charCodeAt(i) & 15) << 4 | name.charCodeAt(i) >> 4;
    view.setUint32(12+256,280,true); view.setUint32(12+260,9,true); view.setUint32(12+264,payload.length,true); bytes.set(payload,280);
    await writeFile(join(f.root,'merge.dat'),bytes);
    const middleware = createAssetMiddleware({ gameRoot:f.root }), requested:string[] = [];
    const { port } = await listen((req,res) => { requested.push(String(req.headers.range)); middleware(req,res,() => { res.writeHead(404); res.end(); }); });
    const reader = new ArchiveReader(`http://127.0.0.1:${port}/game-assets/merge.dat`);
    try { expect(new TextDecoder().decode(await reader.read(name))).toBe('ABCABCABC'); }
    finally { reader.dispose(); }
    expect(requested).toEqual(['bytes=0-11','bytes=12-279','bytes=280-285']);
  });
  it('never falls back to a whole archive when Range is absent, oversized or invalid',async () => {
    const f = await fixture(), { port } = await serverFor(f.root);
    expect((await get(port,'/game-assets/merge.dat')).status).toBe(400);
    expect((await get(port,'/game-assets/merge.dat',{ Range:'bytes=900-' })).status).toBe(416);
    const handle = await open(join(f.root,'Sound.dat'),'r+'); await handle.truncate(MAX_RANGE_BYTES + 1024); await handle.close();
    expect((await get(port,'/game-assets/Sound.dat',{ Range:'bytes=0-' })).status).toBe(416);
    const small = await get(port,'/game-assets/Sound.dat',{ Range:'bytes=0-11' }); expect(small.status).toBe(206); expect(small.body.length).toBe(12);
  });
  it('checks If-Range, refuses changed archives, and never serves a full fallback',async () => {
    const f = await fixture(), { port } = await serverFor(f.root);
    const first = await get(port,'/game-assets/merge.dat',{ Range:'bytes=0-11' }), etag = String(first.headers.etag);
    expect((await get(port,'/game-assets/merge.dat',{ Range:'bytes=12-15','If-Range':etag })).status).toBe(206);
    await writeFile(join(f.root,'merge.dat'),new Uint8Array(129));
    const changed = await get(port,'/game-assets/merge.dat',{ Range:'bytes=12-15','If-Range':etag }); expect(changed.status).toBe(412); expect(changed.body.length).toBeLessThan(100);
  });
  it('blocks traversal, arbitrary files, malformed encodings, symlinks and writes',async () => {
    const f = await fixture(), { port } = await serverFor(f.root);
    for (const path of ['secret.txt','../secret.txt','%2e%2e/secret.txt','merge/data/../../secret.txt','merge.dat%00','%2fetc%2fpasswd','%255fsecret'])
      expect((await get(port,'/game-assets/'+path,{ Range:'bytes=0-3' })).status).toBe(404);
    expect((await get(port,'/game-assets/%zz',{ Range:'bytes=0-3' })).status).toBe(400);
    expect((await get(port,'/game-assets/merge.dat',{},'POST')).status).toBe(405);
    await rm(join(f.root,'Sound.dat')); await symlink(join(f.root,'secret.txt'),join(f.root,'Sound.dat'));
    expect((await get(port,'/game-assets/Sound.dat',{ Range:'bytes=0-3' })).status).toBe(404);
    expect((await get(port,'/game-assets/')).status).toBe(404);
  });
  it('uses optional card archives separately and reports missing configuration without filesystem disclosure',async () => {
    const game = await fixture(), cards = await fixture(); await writeFile(join(cards.root,'merge/data/card.dat'),'cards');
    const { port } = await serverFor(game.root,cards.root);
    expect((await get(port,'/game-assets/merge/data/card.dat',{ Range:'bytes=0-4' })).body.toString()).toBe('cards');
    const missing = await serverFor(); const response = await get(missing.port,'/game-assets/merge.dat',{ Range:'bytes=0-1' });
    expect(response.status).toBe(503); expect(response.body.toString()).not.toContain(game.root);
  });
});

describe('loopback-only development Origin proxy',() => {
  it('rewrites only accepted local browser Origins for HTTP and WS, preserving all cookie attributes',() => {
    const proxy = new EventEmitter(), options = localProxyOptions({ target:'http://127.0.0.1:8787',publicOrigin:'http://localhost:8787' });
    options.configure(proxy); const setHeader = vi.fn(), destroy = vi.fn();
    proxy.emit('proxyReq',{ setHeader,destroy },{ headers:{ origin:'http://localhost:5174',cookie:'__Secure-de.session_token=test' } });
    expect(setHeader).toHaveBeenCalledWith('Origin','http://localhost:8787');
    expect(setHeader.mock.calls).toHaveLength(1);
    setHeader.mockClear(); proxy.emit('proxyReqWs',{ setHeader,destroy },{ headers:{ origin:'http://127.0.0.1:5174' } });
    expect(setHeader).toHaveBeenCalledWith('Origin','http://localhost:8787');
    setHeader.mockClear(); proxy.emit('proxyReq',{ setHeader,destroy },{ headers:{ origin:'https://evil.example' } }); expect(setHeader).not.toHaveBeenCalled();
    proxy.emit('proxyReqWs',{ setHeader,destroy },{ headers:{} }); expect(destroy).toHaveBeenCalledOnce();
    expect(() => localProxyOptions({ target:'https://original.ygoevolution.com' })).toThrow('loopback');
  });
  it('rejects foreign/missing mutation Origins before proxying but permits safe reads',async () => {
    const middlewares: Function[] = [], httpServer = new EventEmitter();
    devOriginGate().configureServer({ middlewares:{ use:(f:Function) => middlewares.push(f) },httpServer });
    const { port } = await listen((req,res) => middlewares[0](req,res,() => { res.writeHead(204); res.end(); }));
    expect((await get(port,'/api/de/shop/buy',{},'POST')).status).toBe(403);
    expect((await get(port,'/api/de/shop/buy',{ Origin:'https://evil.example' },'POST')).status).toBe(403);
    expect((await get(port,'/api/de/shop/buy',{ Origin:'http://localhost:5174' },'POST')).status).toBe(204);
    expect((await get(port,'/api/de/session')).status).toBe(204);
    const socket = { end:vi.fn(),destroy:vi.fn() };
    httpServer.emit('upgrade',{ url:'/net',headers:{ origin:'https://evil.example' } },socket);
    expect(socket.end).toHaveBeenCalledWith(expect.stringContaining('403')); expect(socket.destroy).toHaveBeenCalledOnce();
  });
  it('proxies actual Vite HTTP and WebSocket traffic with trusted local Origin and intact session cookies',async () => {
    let viteEntry:string | undefined;
    for (const base of [new URL('../package.json',import.meta.url),new URL('../../web-shell/htmlui/package.json',import.meta.url)]) {
      try { viteEntry = createRequire(base).resolve('vite'); break; } catch { /* repository tool fallback */ }
    }
    if (!viteEntry) throw new Error('Install the declared Vite dependency before this integration check');
    const { createServer:createVite } = await import(pathToFileURL(viteEntry).href);
    const seen: { origin:string|undefined; cookie:string|undefined }[] = [];
    const upstream = await listen((req,res) => {
      seen.push({ origin:req.headers.origin,cookie:req.headers.cookie });
      res.setHeader('Set-Cookie','__Secure-de.session_token=fixture; Path=/; HttpOnly; Secure; SameSite=Lax');
      res.writeHead(200,{ 'Content-Type':'application/json' }); res.end(JSON.stringify(seen.at(-1)));
    });
    const upgraded = new Set<import('node:net').Socket>();
    cleanups.push(async () => { for (const socket of upgraded) socket.destroy(); });
    upstream.server.on('upgrade',(req,socket) => {
      upgraded.add(socket); socket.once('close',() => upgraded.delete(socket));
      seen.push({ origin:req.headers.origin,cookie:req.headers.cookie });
      const accept = createHash('sha1').update(String(req.headers['sec-websocket-key'])+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    });
    const f = await fixture(), target = `http://127.0.0.1:${upstream.port}`;
    const vite = await createVite({ configFile:false,root:f.root,logLevel:'silent',appType:'custom',plugins:[devOriginGate()],server:{ host:'127.0.0.1',port:0,
      proxy:{ '/api':localProxyOptions({ target }),'/net':{ ...localProxyOptions({ target }),ws:true } } } });
    cleanups.push(async () => { for (const socket of upgraded) socket.destroy(); await vite.close(); });
    await vite.listen(); const address = vite.httpServer.address(), port = address.port;
    const response = await get(port,'/api/check',{ Origin:'http://localhost:5174',Cookie:'__Secure-de.session_token=fixture' },'POST');
    expect(JSON.parse(response.body.toString())).toEqual({ origin:'http://localhost:8787',cookie:'__Secure-de.session_token=fixture' });
    expect(response.headers['set-cookie']).toEqual(['__Secure-de.session_token=fixture; Path=/; HttpOnly; Secure; SameSite=Lax']);
    const count = seen.length; expect((await get(port,'/api/check',{ Origin:'https://evil.example' },'POST')).status).toBe(403); expect(seen.length).toBe(count);
    await new Promise<void>((resolve,reject) => {
      const req = request({ hostname:'127.0.0.1',port,path:'/net',headers:{ Origin:'http://localhost:5174',Cookie:'__Secure-de.session_token=fixture',
        Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':Buffer.alloc(16, 1).toString('base64') } });
      req.on('upgrade',(res,socket) => { expect(res.statusCode).toBe(101); socket.destroy(); resolve(); });
      req.on('response',res => { res.resume(); reject(new Error(`Upgrade failed (${res.statusCode})`)); }); req.on('error',reject); req.end();
    });
    expect(seen.at(-1)).toEqual({ origin:'http://localhost:8787',cookie:'__Secure-de.session_token=fixture' });
  });

});
