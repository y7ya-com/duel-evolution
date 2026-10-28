// Shared driver for the notes-*.test.ts files: the whole server in Node (buildServer + World), fake clients that speak
// the gateway framing and check the per-connection seq like the real client (py fake_client.py Link/FakeClient).
// Fake timers: the 0.25 s send pauses, the 120 s session sweep and the −242 90 s window run instantly.
import { vi } from "vitest";
import { configFrom } from "../src/config.ts";
import { buildServer, type Server } from "../src/server.ts";
import { pack, Reader, xor, type Msg } from "../src/net/proto.ts";
import { encrypt } from "../src/util/cifrado.ts";
import type { State } from "../src/game/store.ts";

export const u32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
export const i32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getInt32(at);
export const u16 = (d: Uint8Array, at = 0) => (d[at] << 8) | d[at + 1];
export const be32 = (...v: number[]) => { const b = new Uint8Array(4 * v.length); v.forEach((x, i) => new DataView(b.buffer).setUint32(4 * i, x >>> 0)); return b; };
export const cat = (...a: ArrayLike<number>[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
export const str = (s: string, n: number) => { const o = new Uint8Array(n); for (let i = 0; i < Math.min(n, s.length); i++) o[i] = s.charCodeAt(i) & 0xff; return o; };
export const cstr = (b: Uint8Array) => { const e = b.indexOf(0); return String.fromCharCode(...b.subarray(0, e < 0 ? b.length : e)); };

export type Box = [number];

export class Link {
  msgs: Msg[] = [];
  errors: string[] = [];
  closedByServer = false;
  private rd = new Reader();
  constructor(readonly h: Harness, readonly cli: Client, readonly sock: number, readonly port: number,
              readonly rxBox: Box = [0], readonly txBox: Box = [0]) {}
  rx(b: Uint8Array) {
    for (const m of this.rd.feed(b)) {
      const want = this.rxBox[0] + 1;
      if (m.param !== want || !m.ok) this.errors.push(`${this.cli.name}:${this.port} 0x${m.id.toString(16)} #${m.param}, wanted #${want}`);
      this.rxBox[0] = m.param;
      this.msgs.push(m);
    }
  }
  /** Raw bytes as one gateway frame. */
  raw(bytes: Uint8Array) {
    const f = new Uint8Array(5 + bytes.length);
    f[0] = 1; new DataView(f.buffer).setUint32(1, this.sock); f.set(bytes, 5);
    this.h.srv.world.onBinary(this.cli.id, f);
  }
  send(mid: number, data: ArrayLike<number> = new Uint8Array(0), param?: number) {
    this.txBox[0] = param ?? this.txBox[0] + 1;
    this.raw(pack(mid, Uint8Array.from(data), this.txBox[0]));
  }
  mark() { return this.msgs.length; }
  all(mid: number, start = 0) { return this.msgs.slice(start).filter((m) => m.id === mid).map((m) => m.data); }
  ids(start = 0) { return this.msgs.slice(start).map((m) => m.id); }
  /** First mid since `start` (matching pred), advancing the fake clock; null if it does not come in `ms`. */
  async wait(mid: number, start = 0, pred?: (d: Uint8Array) => boolean, ms = 5000): Promise<Uint8Array | null> {
    for (let t = 0; t <= ms; t += 50) {
      const m = this.msgs.slice(start).find((x) => x.id === mid && (!pred || pred(x.data)));
      if (m) return m.data;
      await vi.advanceTimersByTimeAsync(50);
    }
    return null;
  }
  /** Client close (TCP FIN). */
  close() { this.h.srv.world.onText(this.cli.id, JSON.stringify({ type: "close", id: this.sock })); }
}

export class Client {
  links = new Map<number, Link>();
  gateRx: Box = [0];
  gateTx: Box = [0];
  private nsock = 0;
  pid: number | null = null;
  room: Link | null = null;
  openStatus = new Map<number, number>();
  constructor(readonly h: Harness, readonly name: string, readonly id: string, readonly key: Uint8Array) {}
  link(port: number, rxBox?: Box, txBox?: Box): Link {
    const sock = ++this.nsock;
    const l = new Link(this.h, this, sock, port, rxBox, txBox);
    this.links.set(sock, l);
    this.h.srv.world.onText(this.id, JSON.stringify({ type: "open", id: sock, host: "127.0.0.1", port: port + this.h.off }));
    return l;
  }
  errors() { return [...this.links.values()].flatMap((l) => l.errors); }
  async gate(): Promise<Uint8Array[] | null> {
    const g = this.link(5730, this.gateRx, this.gateTx);
    const n = g.mark();
    g.send(0x2005, new Uint8Array(4));
    const ok = await g.wait(0x2004, n);
    g.send(0x0003);
    await this.h.tick(400);                        // the goodbye is read after the last reply's pause
    g.close();
    await this.h.tick(10);
    return ok ? g.all(0x2003, n) : null;
  }
  /** py FakeClient.account: names {slot: name} of 0x3012; creates create_name in slot if missing. */
  async account(slot = 0, createName?: string): Promise<Record<number, string>> {
    const a = this.link(5731);
    a.send(0x3001); await a.wait(0x3002);
    a.send(0x3003, this.key); await a.wait(0x3004);
    let n = a.mark();
    a.send(0x3010);
    const pl = (await a.wait(0x3012, n)) ?? new Uint8Array(0);
    const names: Record<number, string> = {};
    for (let i = 0; i < Math.floor((pl.length - 4) / 76); i++) names[pl[4 + i * 76]] = cstr(pl.subarray(5 + i * 76, 21 + i * 76));
    if (!(slot in names) && createName) {
      n = a.mark();
      a.send(0x3020, cat([slot], str(createName, 16)));
      await a.wait(0x3022, n);
      names[slot] = createName;
    }
    n = a.mark(); a.send(0x3100, [slot]); await a.wait(0x3103, n, undefined, 8000);
    n = a.mark(); a.send(0x3114, [slot]); await a.wait(0x4234, n);
    a.send(0x0003);
    await this.h.tick(400);
    a.close();
    await this.h.tick(10);
    return names;
  }
  /** py FakeClient.enter_room: 0x3001/0x3003/0x4100/0x4200/0x4202/0x4170 on 5740 + kind index (or `port`). */
  async enterRoom(kindIndex = 0, lang = 5, slot = 0, parts?: Uint8Array, port?: number): Promise<number | null> {
    const r = (this.room = this.link(port ?? 5740 + kindIndex));
    r.send(0x3001); await r.wait(0x3002);
    r.send(0x3003, this.key); await r.wait(0x3004);
    let n = r.mark();
    r.send(0x4100, [lang, slot]);
    const res = (await r.wait(0x4101, n)) ?? new Uint8Array(0);
    this.pid = res.length >= 8 ? u32(res, 4) : null;
    n = r.mark(); r.send(0x4200); await r.wait(0x4201, n);
    n = r.mark(); r.send(0x4202, [0, 0]); await r.wait(0x4213, n);
    n = r.mark(); r.send(0x4170, cat(be32(1), parts ?? new Uint8Array(16), new Uint8Array(4))); await r.wait(0x4171, n);
    return this.pid;
  }
}

export class Harness {
  srv: Server;
  off = 0;
  private n = 0;
  log: string[] = [];
  constructor(state: State, env: Record<string, unknown> = {}) {
    this.srv = buildServer(configFrom({ DEV: "1", PARITY_SEED: "1", ...env }), state, (s) => this.log.push(s));
  }
  get game() { return this.srv.game; }
  /** A client on its own WebSocket; userId null = the DEV legacy login with the 32 B blob of (user, pw). */
  client(name: string, user = name, pw = "pw", userId: string | null = null): Client {
    const id = `ws${++this.n}`;
    const c = new Client(this, name, id, encrypt(user, pw));
    this.srv.world.openPeer(id, userId,
      (t) => {
        const m = JSON.parse(t);
        if (m.type === "open") c.openStatus.set(m.id, m.status);
        if (m.type === "close") { const l = c.links.get(m.id); if (l) l.closedByServer = true; }
      },
      (b) => { const sock = u32(b, 1); c.links.get(sock)?.rx(b.subarray(5)); return true; });
    return c;
  }
  async tick(ms = 50) { await vi.advanceTimersByTimeAsync(ms); }
  /** The raw state (py state.json). */
  state(): State { return this.srv.game.store.loadRaw(); }
}

export function harness(state: State = { players: {} }, env: Record<string, unknown> = {}): Harness {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  return new Harness(state, env);
}

export { xor, pack };
