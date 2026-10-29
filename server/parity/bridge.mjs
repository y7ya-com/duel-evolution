// Parity bridge: lets py's fake_client.py (plain TCP) talk to the TS server, which only speaks the gateway WebSocket.
// Listens on every game port + offset; each source IP gets ONE WebSocket (= one browser), and each TCP connection is
// a virtual socket on it ({"type":"open"} + [1][id][bytes] frames), exactly like the recomp client's net_ws.cpp.
//   node parity/bridge.mjs <offset> <ws url> [control port] [ip]
// "ip" = group the TCP connections by source IP (one native recompiled client = one peer, e2e runs).
// The card wire: fake_client speaks the 2008 exe's bytes, so each virtual socket runs through the client's own codec
// (client/recomp rt/cardwire.cpp as build/cardwire.mjs, `make cardwire_js`; CARDWIRE_JS=<file>), with the card table
// built from gamedata/cards.json. CARDWIRE=0: none (a native client, e2e, has its own), or ip mode.
import { readFileSync } from "node:fs";
import net from "node:net";

const offset = Number(process.argv[2] ?? 1900);
const url = process.argv[3] ?? "ws://127.0.0.1:8787/boxedwine-network";
// canonical ports (src/config.ts PORTS); the WS side gets them back with the offset, as the live client sends them
const ports = [5730, 5731, 5732, 5760, ...Array.from({ length: 11 }, (_, i) => 5740 + i), ...Array.from({ length: 77 }, (_, i) => 5800 + i)];

// BRIDGE_COOKIE / BRIDGE_ORIGIN: a signed-in session for a deployed server (its upgrade needs both);
// BRIDGE_COOKIES: JSON {client name: cookie}, one signed-in user per fake client (two-player checks);
// BRIDGE_WS_OFFSET: the server's PORT_OFFSET when it differs from the local listening offset.
const WS_OFFSET = Number(process.env.BRIDGE_WS_OFFSET ?? offset);
const COOKIES = JSON.parse(process.env.BRIDGE_COOKIES ?? "{}");
const wsHeaders = (client) => Object.fromEntries([["Cookie", COOKIES[client] ?? process.env.BRIDGE_COOKIE], ["Origin", process.env.BRIDGE_ORIGIN]].filter(([, v]) => v));
const peers = new Map(); // client -> { ws, ready: Promise, socks: Map<id, socket>, next }
// macOS has no 127.0.0.2/3, so fake clients cannot be told apart by IP: parity/run.py reports
// "<local port> <client name>" on the control port right after each connect. Unreported connections
// (raw sockets of the "basura" scenario) get a peer of their own.
const CTL = Number(process.argv[4] ?? 6999);
const owner = new Map();
net.createServer((s) => s.on("data", (d) => {
  for (const line of String(d).split("\n")) { const [p, n] = line.trim().split(" "); if (n) owner.set(Number(p), n); }
  s.end("ok\n");
})).listen(CTL, "127.0.0.1");
const BY_IP = process.argv[5] === "ip";

let cw = null;   // { M, table }
if (!BY_IP && process.env.CARDWIRE !== "0") {
  const M = await (await import(process.env.CARDWIRE_JS ?? new URL("../../client/recomp/build/cardwire.mjs", import.meta.url).pathname)).default();
  const cards = JSON.parse(readFileSync(new URL("../gamedata/cards.json", import.meta.url), "utf8"));
  const n = Math.max(...cards.map((c) => c.i)) + 1;   // tools/cardart.py `table`: the same bytes, the same hash
  const b = Buffer.alloc(24 + 6 * n);
  b.write("YO2CARDS"), b.writeUInt32LE(n, 8), b.writeUInt32LE(1, 12), b.writeUInt32LE(19, 16), b.writeUInt32LE(16, 20);
  for (const c of cards) b.writeUInt32LE(c.pc, 24 + 6 * c.i), b.writeUInt16LE(c.internal, 28 + 6 * c.i);
  const p = M._malloc(b.length);
  M.HEAPU8.set(b, p);
  cw = { M, table: M._cw_table(p, b.length) };
  M._free(p);
  const want = JSON.parse(readFileSync(new URL("../gamedata/translator.json", import.meta.url), "utf8")).wireHash;
  const got = M._cw_hash(cw.table) >>> 0;
  console.log(`bridge: card wire, table ${got.toString(16)}` + (got === want ? "" : ` (the server's is ${want?.toString(16)}: no v2)`));
}
/** A connection's bytes through its codec: dir 0 from the server, 1 from the client -> [to the client, to the server]. */
function codec(st, dir, d) {
  const { M } = cw, p = M._malloc(d.length);
  M.HEAPU8.set(d, p);
  M._cw_feed(st, dir, p, d.length);
  M._free(p);
  return [0, 1].map((w) => { const out = Buffer.from(M.HEAPU8.subarray(M._cw_out(st, w), M._cw_out(st, w) + M._cw_len(st, w))); M._cw_clear(st, w); return out; });
}
const toWs = (p, id, d) => {
  const f = Buffer.alloc(5 + d.length);
  f[0] = 1; f.writeUInt32BE(id, 1); d.copy(f, 5);
  if (p.ws.readyState === 1) p.ws.send(f);
};
async function clientOf(sock) {
  if (BY_IP) return sock.remoteAddress ?? "?";
  for (let i = 0; i < 200; i++) {
    const n = owner.get(sock.remotePort);
    if (n) { owner.delete(sock.remotePort); return n; }
    await new Promise((r) => setTimeout(r, 10));
  }
  return `raw:${sock.remotePort}`;
}

function peerFor(ip) {
  let p = peers.get(ip);
  if (p) return p;
  const h = wsHeaders(ip);
  const ws = Object.keys(h).length ? new WebSocket(url, { headers: h }) : new WebSocket(url);
  ws.binaryType = "arraybuffer";
  p = { ws, socks: new Map(), next: 1 };
  p.ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    if (typeof e.data === "string") {
      const m = JSON.parse(e.data);
      if (m.type === "ka") { console.log(`keepalive ${ip}`); return; } // the server's 30 s WebSocket keepalive
      const s = p.socks.get(m.id);
      if (!s) return;
      if (m.type === "open") { if (m.status === 0) s.resume(); else s.destroy(); }
      else if (m.type === "close" || m.type === "error") { p.socks.delete(m.id); s.destroy(); }
      return;
    }
    const b = Buffer.from(e.data);
    if (b[0] !== 1) return;
    const id = b.readUInt32BE(1), s = p.socks.get(id);
    if (!s || s.destroyed) return;
    if (!s.cw) { s.write(b.subarray(5)); return; }
    const [toClient, toServer] = codec(s.cw, 0, b.subarray(5));
    if (toClient.length) s.write(toClient);
    if (toServer.length) toWs(p, id, toServer);
  };
  ws.onclose = () => { peers.delete(ip); for (const s of p.socks.values()) s.destroy(); };
  peers.set(ip, p);
  return p;
}

for (const port of ports) {
  net.createServer({ allowHalfOpen: false }, async (sock) => {
    sock.pause();
    const p = peerFor(await clientOf(sock));
    const id = p.next++;
    p.socks.set(id, sock);
    if (cw) sock.cw = cw.M._cw_new(cw.table);
    try { await p.ready; } catch { sock.destroy(); return; }
    p.ws.send(JSON.stringify({ type: "open", id, host: "127.0.0.1", port: port + WS_OFFSET }));
    sock.on("data", (d) => {
      if (!sock.cw) return toWs(p, id, d);
      const [toClient, toServer] = codec(sock.cw, 1, d);
      if (toServer.length) toWs(p, id, toServer);
      if (toClient.length) sock.write(toClient);
    });
    const bye = () => {
      if (sock.cw) cw.M._cw_free(sock.cw), sock.cw = 0;
      if (p.socks.delete(id) && p.ws.readyState === 1) p.ws.send(JSON.stringify({ type: "close", id }));
    };
    sock.on("close", bye);
    sock.on("error", bye);
  }).listen(port + offset, "127.0.0.1");
}
console.log(`bridge: ${ports.length} ports +${offset} -> ${url}`);
