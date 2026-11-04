/** Local Node transport around the real Worker + WorldDO HTTP handlers and Miniflare D1.
 * Runtime boundaries: DurableObject base class, DO construction, WS upgrade host, and cookie jar.
 * No auth handler, game HTTP handler, SQL implementation, or response payload is replaced.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
// Duel-engine boot is outside this account/deck HTTP suite (and imports raw WASM).
vi.mock('../../../server/src/duel/boot', () => ({ bootDuel: async () => {} }));
import worker from '../../../server/src/worker';
import { WorldDO } from '../../../server/src/do';
import { buildServer } from '../../../server/src/server';
import { configFrom } from '../../../server/src/config';
import { attach, loadState } from '../../../server/src/db/d1';
import { SCHEMA } from '../../../server/src/game/persist';
import { GameSession } from '../src/network/session';
import type { WebSocketLike } from '../src/network/gateway';
import { HttpClient } from '../src/services/http';
import { GameApi } from '../src/services/api';

const requireServer = createRequire(new URL('../../../server/package.json', import.meta.url));
const { getPlatformProxy } = requireServer('wrangler') as typeof import('../../../server/node_modules/wrangler');
const { WebSocket, WebSocketServer } = createRequire(requireServer.resolve('wrangler'))('ws');
const SERVER = resolve(import.meta.dirname, '../../../server');
export const HTTP_ORIGIN = 'https://http-client.test';

export async function httpWorkerFixture() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: resolve(SERVER, 'test/auth.wrangler.jsonc'), persist: false });
  const DB = proxy.env.DB;
  const pending = new Set<Promise<unknown>>();
  const ctx = { waitUntil(p: Promise<unknown>) { pending.add(p); void p.then(() => pending.delete(p), () => pending.delete(p)); }, passThroughOnException() {} };
  let server: ReturnType<typeof createServer> | undefined;
  let wss: any;
  let game: ReturnType<typeof buildServer> | undefined;
  let sink: ReturnType<typeof attach> | undefined;
  const sockets = new Set<any>(), sessions = new Set<GameSession>(), apis = new Set<GameApi>();
  const bindings: { user: string | null; path: string; sid: string | null }[] = [];
  const logs: string[] = [];
  let closed = false;
  async function close() {
    if (closed) return; closed = true;
    for (const api of apis) api.dispose();
    for (const session of sessions) session.dispose();
    for (const socket of sockets) socket.terminate();
    // Wait for close callbacks to enqueue world cleanup before draining it and D1.
    if (wss) await new Promise<void>(r => wss.close(() => r()));
    if (game) {
      game.game.stopping = true;
      await game.world.idle();
      const hub = game.game.hub as unknown as { sweepT: ReturnType<typeof setTimeout> | null };
      if (hub.sweepT) clearTimeout(hub.sweepT); hub.sweepT = null;
    }
    await sink?.flush();
    await Promise.allSettled([...pending]);
    if (server?.listening) { server.closeAllConnections(); await new Promise<void>(r => server!.close(() => r())); }
    await proxy.dispose();
  }
  try {
    for (const f of readdirSync(resolve(SERVER, 'migrations')).filter(f => f.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(SERVER, 'migrations', f), 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
      await DB.batch(sql.map(s => DB.prepare(s)));
    }
    const initial = await loadState(DB);
    game = buildServer(configFrom({ PARITY_SEED: '1', SEND_PACE: '0', OWNER_ACCT: '', PROGRESSION:'1' }), Object.keys(initial).length ? initial : { players: {}, schema: SCHEMA }, line => logs.push(line));
    sink = attach(game.game.store, DB, { baseline: initial });
    // Skip constructor bootDuel/R2 loading, but retain actual WorldDO.fetch and D1 sink.
    const resident = Object.create(WorldDO.prototype) as WorldDO;
    const upgrades = new Map<string, Request>();
    const env = {
      DB, PUBLIC_ORIGIN: HTTP_ORIGIN, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      DE_FORWARD_SECRET: randomBytes(32).toString('hex'), TEST_SIGNIN_SECRET: randomBytes(32).toString('hex'),
      DEPLOY_ENV: 'staging', DISCORD_INVITE_URL: 'https://discord.gg/fixture',
      WORLD: { idFromName: () => 'world', get: () => ({ fetch: async (request: Request) => {
        if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
          upgrades.set(request.headers.get('sec-websocket-key')!, request);
          // Node owns the actual 101 handshake; this sentinel never reaches an API assertion.
          return new Response(null, { status: 204 });
        }
        return resident.fetch(request);
      } }) },
    };
    Object.assign(resident, { env, srv: game, sink });
    const dispatch = (request: Request) => worker.fetch(request, env as any, ctx as any);
    wss = new WebSocketServer({ noServer: true });
    let transportOrigin = '', peerN = 0;
    server = createServer((req, res) => { void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value !== undefined && key !== 'host') headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      const request = new Request(HTTP_ORIGIN + req.url, { method: req.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      const response = await dispatch(request);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
      const cookies = response.headers.getSetCookie(); if (cookies.length) res.setHeader('set-cookie', cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    })().catch(error => { res.statusCode = 500; res.end(String(error)); }); });
    server.on('upgrade', (req, socket, head) => { void (async () => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
      const result = await dispatch(new Request(HTTP_ORIGIN + req.url, { headers }));
      const key = String(req.headers['sec-websocket-key']), forwarded = upgrades.get(key);
      upgrades.delete(key);
      if (result.status !== 204 || !forwarded) { socket.end(`HTTP/1.1 ${result.status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); return; }
      const user = forwarded.headers.get('x-de-user'), url = new URL(forwarded.url);
      bindings.push({ user, path: url.pathname, sid: url.searchParams.get('sid') });
      wss.handleUpgrade(req, socket, head, (ws: any) => {
        sockets.add(ws); const id = `http-worker-${++peerN}`;
        ws.on('message', (data: Buffer, binary: boolean) => binary ? game!.world.onBinary(id, new Uint8Array(data)) : game!.world.onText(id, data.toString()));
        ws.on('close', () => { sockets.delete(ws); game!.world.closePeer(id, false); });
        game!.world.openPeer(id, user, text => ws.send(text), bytes => { if (ws.readyState !== 1) return false; ws.send(bytes); return true; }, url.searchParams.get('sid'), false);
      });
    })().catch(() => socket.destroy()); });
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test address');
    transportOrigin = `http://127.0.0.1:${address.port}`;
    function browser() {
      const jar = new Map<string, string>();
      const fetcher: typeof fetch = async (input, init) => {
        const request = new Request(input, init), url = new URL(request.url);
        if (url.origin !== HTTP_ORIGIN) throw new Error('Fixture refuses external connections');
        const headers = new Headers(request.headers);
        headers.set('Origin', HTTP_ORIGIN); headers.set('cf-connecting-ip', '198.51.100.1');
        if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
        const response = await fetch(transportOrigin + url.pathname + url.search, { method: request.method, headers, redirect: 'error', signal: request.signal,
          ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: await request.text() } : {}) });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0]!, at = pair.indexOf('='), key = pair.slice(0, at), value = pair.slice(at + 1);
          if (/max-age=0/i.test(cookie) || !value) jar.delete(key); else jar.set(key, value);
        }
        return response;
      };
      const http = new HttpClient({ origin: HTTP_ORIGIN, fetch: fetcher });
      const api = new GameApi(http); apis.add(api);
      return { api, http, jar, fetch: fetcher, cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        session(forgedUser = 'attacker-supplied-user') {
          const session = new GameSession({ url: transportOrigin.replace('http:', 'ws:') + '/net', portOffset: 0,
            socketFactory: url => new WebSocket(url, { headers: { Origin: HTTP_ORIGIN, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'x-de-user': forgedUser } }) as WebSocketLike });
          sessions.add(session); return session;
        },
      };
    }
    async function verify(code: string, discordId: string) {
      const body = JSON.stringify({ ts: Date.now(), action: 'verify', code, discord: { id: discordId, username: 'test_discord' } });
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.DE_FORWARD_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).toString('hex');
      return fetch(transportOrigin + '/api/de/discord-forward', { method: 'POST', headers: { 'content-type': 'application/json', 'x-de-signature': signature }, body });
    }
    return { DB, game, sink, bindings, logs, browser, verify, close, testSecret: env.TEST_SIGNIN_SECRET };
  } catch (error) { await close(); throw error; }
}
