/** Real game authority and wire transport; fixture-only auth and in-memory HTTP deck persistence.
 * This intentionally does not claim better-auth/D1/Cloudflare cookie or production deployment coverage.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { createRequire } from 'node:module';
import { buildServer } from '../../../server/src/server';
import { configFrom } from '../../../server/src/config';
import { createNodeDuelCore } from '../../../server/src/duel/engine/node';
import { NPC_DECKS, setDuelCore } from '../../../server/src/duel/data';
import { starterInfo, starterClaim, walletInfo } from '../../../server/src/game/starter';
import { deckOwner, deckIn } from '../../../server/src/game/decks';
import { shopView, shopPurchaseApi } from '../../../server/src/game/shop-api';
import { chatGet, chatSend } from '../../../server/src/game/chat';
import { createRemoteAssetMiddleware } from '../tools/remote-assets.mjs';

const requireServer = createRequire(new URL('../../../server/package.json',import.meta.url));
const requireWrangler = createRequire(requireServer.resolve('wrangler'));
const { WebSocketServer } = requireWrangler('ws');
const DIST = resolve(import.meta.dirname,'../dist');
const json = (res:ServerResponse,value:unknown,status = 200) => {
  const body = Buffer.from(JSON.stringify(value)); res.writeHead(status,{ 'Content-Type':'application/json','Content-Length':body.length,'Cache-Control':'no-store' }); res.end(body);
};
async function body(req:IncomingMessage):Promise<unknown> {
  const chunks:Buffer[] = []; let total = 0;
  for await (const part of req) { total += part.length; if (total > 65536) throw new Error('Fixture request too large'); chunks.push(part); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
export interface BrowserFixtureOptions {
  /** Explicit opt-in only. Ordinary browser gameplay tests never request original media. */
  assetBaseUrl?:string;
  /** Bounded editor-only preview workload; default remains the full NPC51 gameplay deck. */
  initialDeck?:{main:readonly number[];side?:readonly number[];extra:readonly number[]};
}
export interface BrowserAssetRequest { path:string; range:string|null; status:number; bytes:number }
export async function browserServerFixture(options:BrowserFixtureOptions = {}) {
  const core = await createNodeDuelCore(); setDuelCore(core);
  const assetRequests:BrowserAssetRequest[] = [];
  let activeAssetRequests = 0, lastAssetActivity = Date.now();
  const remoteAssets = options.assetBaseUrl ? createRemoteAssetMiddleware({baseUrl:options.assetBaseUrl,forwardValidators:true}) : null;
  const logs:string[] = [], packets:{ id:string; bytes:number }[] = [], user = 'browser-fixture-user';
  const gameServer = buildServer(configFrom({ DEV:'1',PARITY_SEED:'1',SEND_PACE:'0',DUEL_PAUSE:'0.001',OWNER_ACCT:'' }),{ players:{} },line => {
    logs.push(line); if (logs.length > 5000) logs.shift();
  });
  const decks = new Map<string,{ name:string; main:number[]; side:number[]; extra:number[]; updated:number }>();
  const initialDeck = options.initialDeck ?? NPC_DECKS['51'];
  decks.set('Fixture Deck',{ name:'Fixture Deck',main:[...initialDeck.main],side:[...('side' in initialDeck ? initialDeck.side ?? [] : [])],extra:[...initialDeck.extra],updated:1 });
  const current:{ world:string|null; free:string|null } = { world:'Fixture Deck',free:null };
  let origin = '', peerN = 0;
  const peers = new Set<string>(), websockets = new Set<any>();
  const wss = new WebSocketServer({ noServer:true,maxPayload:1024 * 1024 });
  const server = createServer((req,res) => {
    if (remoteAssets && (req.url ?? '').startsWith('/game-assets/')) {
      activeAssetRequests++; lastAssetActivity = Date.now(); let released = false;
      const release = () => { if (!released) { released = true; activeAssetRequests--; lastAssetActivity = Date.now(); } };
      res.once('close',release); res.once('finish',release);
      res.once('finish',() => {
        const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
        // The middleware validates and finishes exactly this range; writeHead headers are not getHeader values.
        const bytes = res.statusCode === 206 && range ? Number(range[2])-Number(range[1])+1 : Number(res.getHeader('Content-Length') ?? 0);
        assetRequests.push({path:req.url!,range:req.headers.range ?? null,status:res.statusCode,bytes});
        if (assetRequests.length > 10000) assetRequests.shift();
      });
      remoteAssets(req,res,() => json(res,{error:'Asset not found'},404)); return;
    }
    void (async () => {
    const url = new URL(req.url ?? '/',origin || 'http://localhost');
    if (url.pathname === '/api/de/session') {
      res.setHeader('Set-Cookie','de_browser_fixture=1; Path=/; HttpOnly; SameSite=Lax');
      return json(res,{ signedIn:true,userId:user,name:'Browser Fixture',roles:[],discord:false,password:true });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!req.headers.cookie?.includes('de_browser_fixture=1')) return json(res,{ error:'fixture-sign-in-required' },401);
      if (req.method !== 'GET' && req.headers.origin !== origin) return json(res,{ error:'fixture-origin' },403);
      let result:unknown;
      await gameServer.world.run(() => {
        if (url.pathname === '/api/de/starter' && req.method === 'GET') result = starterInfo(gameServer.game,user);
        else if (url.pathname === '/api/de/wallet') result = walletInfo(gameServer.game,user);
        else if (url.pathname === '/api/de/shop' && req.method === 'GET') result = shopView(gameServer.game,user);
        else if (url.pathname === '/api/de/chat' && req.method === 'GET') result = chatGet(gameServer.game,user,Number(url.searchParams.get('after') ?? 0));
        else if (url.pathname === '/api/de/friends' && req.method === 'GET') { const [status,out] = gameServer.game.lp.friendsInfo(user); result = status === 200 ? out : { __status:status,...out }; }
      });
      if (result && typeof result === 'object' && '__status' in result) { const { __status,...out } = result as { __status:number }; return json(res,out,__status); }
      if (result !== undefined) return json(res,result);
      if (url.pathname === '/api/de/starter/claim') {
        const data = await body(req) as { id:number }; let response:[number,Record<string,unknown>] | undefined;
        await gameServer.world.run(() => { response = starterClaim(gameServer.game,user,data.id); });
        return json(res,response![1],response![0]);
      }
      if (url.pathname.startsWith('/api/de/decks')) {
        const owner = deckOwner(gameServer.game,user); if (Array.isArray(owner)) return json(res,owner[1],owner[0]);
        if (req.method === 'GET') return json(res,{ current,decks:[...decks.values()],deleted:[] });
        const data = await body(req) as Record<string,unknown>;
        if (url.pathname.endsWith('/current')) { const name = String(data.name); if (!decks.has(name)) return json(res,{ error:'no such deck' },404); current[data.mode === 'free' ? 'free' : 'world'] = name; return json(res,{ updated:Date.now() }); }
        const checked = deckIn(data); if (typeof checked === 'string') return json(res,{ error:checked },400);
        decks.set(checked.name,{ ...checked,updated:Date.now() }); if (data.current === true) current[data.mode === 'free' ? 'free' : 'world'] = checked.name;
        return json(res,{ updated:Date.now() });
      }
      if (url.pathname === '/api/de/chat' && req.method === 'POST') {
        const data = await body(req); await gameServer.world.run(() => { result = chatSend(gameServer.game,user,data); }); return json(res,result);
      }
      if (url.pathname === '/api/de/shop/buy') {
        const data = await body(req); await gameServer.world.run(() => { result = shopPurchaseApi(gameServer.game,user,data); }); return json(res,result);
      }
      return json(res,{ error:'Fixture endpoint not implemented' },404);
    }
    const path = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(DIST,path), rel = relative(DIST,file);
    if (rel.startsWith('..') || !['index.html','card-catalog.json','world-maps.json','duel-texts.json','card-details.json','card-texts.json','npc-data.json'].includes(path) && !path.startsWith('assets/')) { res.writeHead(404); res.end(); return; }
    const info = await stat(file);
    res.writeHead(200,{ 'Content-Type':({ '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json' } as Record<string,string>)[extname(file)] ?? 'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store' });
    createReadStream(file).pipe(res);
  })().catch(error => { if (!res.headersSent) json(res,{ error:error instanceof Error ? error.message : String(error) },500); else res.destroy(); }); });
  server.on('upgrade',(req,socket,head) => {
    const url = new URL(req.url ?? '/',origin);
    if (url.pathname !== '/net' || req.headers.origin !== origin || !req.headers.cookie?.includes('de_browser_fixture=1')) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return; }
    wss.handleUpgrade(req,socket,head,(ws:any) => {
      const id = `browser-${++peerN}`; peers.add(id); websockets.add(ws);
      gameServer.world.openPeer(id,user,text => ws.send(text),bytes => {
        packets.push({ id,bytes:bytes.length });
        if (packets.length > 10000) packets.shift();
        if (ws.readyState !== 1 || ws.bufferedAmount > 1024 * 1024) return false; ws.send(bytes); return true;
      },url.searchParams.get('sid'),url.searchParams.get('resume') === '1');
      ws.on('message',(data:Buffer,isBinary:boolean) => { if (isBinary) gameServer.world.onBinary(id,new Uint8Array(data)); else gameServer.world.onText(id,data.toString()); });
      ws.on('close',() => { websockets.delete(ws); gameServer.world.closePeer(id); });
    });
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port');
  origin = `http://127.0.0.1:${address.port}`;
  let closed = false;
  return { origin,gameServer,logs,packets,assetRequests,get activeAssetRequests(){return activeAssetRequests;},get lastAssetActivity(){return lastAssetActivity;},npcName:gameServer.game.npcs.find(n => n[0] === 51)![1],
    async close() {
      if (closed) return; closed = true;
      gameServer.game.stopping = true;
      for (const peer of peers) gameServer.world.closePeer(peer,false);
      for (const ws of websockets) ws.terminate();
      await gameServer.world.idle();
      // This test host has no process lifecycle owner like workerd; release its idle-session sweep.
      const hub = gameServer.game.hub as unknown as { sweepT:ReturnType<typeof setTimeout>|null };
      if (hub.sweepT) clearTimeout(hub.sweepT); hub.sweepT = null;
      await new Promise<void>(r => wss.close(() => r()));
      await new Promise<void>(r => server.close(() => r())); setDuelCore(null);
    },
  };
}
