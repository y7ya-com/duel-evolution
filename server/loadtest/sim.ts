// Load test client (loadtest/README.md): one simulated player on its own gateway WebSocket, the same flows as py
// fake_client.py (gate, account, lobby, NPC duel with auto play + surrender, PvP), timing what a player waits for.
// Transport-neutral: give it an open standard WebSocket (Node's global one, or a Worker's fetch-upgrade one).
import { pack, Reader, W } from "../src/net/proto.ts";

export const OFF = 1000; // the server's PORT_OFFSET
const VERSION = new TextEncoder().encode("Ver.080912.00");
const u32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => performance.now();

export interface Stats {
  lat: Record<string, number[]>;   // ms samples: move, chat, duelStart, pvpStart, login, prompt (NPC answer -> next prompt)
  errors: Record<string, number>;
  counts: Record<string, number>;
}
export const newStats = (): Stats => ({ lat: {}, errors: {}, counts: {} });
const add = (s: Stats, k: string, v: number) => (s.lat[k] ??= []).push(v);
export const bump = (s: Stats, k: string, n = 1) => { s.counts[k] = (s.counts[k] ?? 0) + n; };
export const fail = (s: Stats, k: string) => { s.errors[k] = (s.errors[k] ?? 0) + 1; };

interface WsLike { send(d: ArrayBuffer | Uint8Array | string): void; close(): void; addEventListener(t: string, f: (e: any) => void): void }
interface Waiter { mid: number; pred?: (d: Uint8Array) => boolean; res: (d: Uint8Array | null) => void }

class Link {
  rx = 0; tx = 0;
  waiters: Waiter[] = [];
  onMsg: ((mid: number, d: Uint8Array) => void) | null = null;
  onClose: (() => void) | null = null;
  private rd = new Reader();
  constructor(readonly c: Sim, readonly sock: number, readonly port: number) {}
  feed(b: Uint8Array) {
    for (const m of this.rd.feed(b)) {
      if (m.param !== this.rx + 1 || !m.ok) fail(this.c.st, "seq");
      this.rx = m.param;
      this.onMsg?.(m.id, m.data);
      for (const w of this.waiters) if (w.mid === m.id && (!w.pred || w.pred(m.data))) { w.res(m.data); this.waiters = this.waiters.filter((x) => x !== w); break; }
    }
  }
  send(mid: number, data: ArrayLike<number> = new Uint8Array(0)) {
    const p = pack(mid, Uint8Array.from(data), ++this.tx);
    const f = new Uint8Array(5 + p.length);
    f[0] = 1; new DataView(f.buffer).setUint32(1, this.sock); f.set(p, 5);
    this.c.ws.send(f);
  }
  /** The next mid (matching pred) from now on; null after ms. Register BEFORE sending what triggers it. */
  next(mid: number, ms = 15000, pred?: (d: Uint8Array) => boolean): Promise<Uint8Array | null> {
    return new Promise((res) => {
      const w: Waiter = { mid, pred, res: (d) => { clearTimeout(t); res(d); } };
      const t = setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); res(null); }, ms);
      this.waiters.push(w);
    });
  }
  async ask(mid: number, data: ArrayLike<number>, want: number, ms = 15000, pred?: (d: Uint8Array) => boolean) {
    const p = this.next(want, ms, pred); this.send(mid, data); return p;
  }
  close() { this.c.ws.send(JSON.stringify({ type: "close", id: this.sock })); this.c.links.delete(this.sock); }
}

export class Sim {
  links = new Map<number, Link>();
  private nsock = 0;
  pid = 0;
  room!: Link;
  gateRx = 0; gateTx = 0;
  closed = false;
  think: [number, number] = [500, 2500]; // ms a player takes over a prompt (uniform)
  constructor(readonly ws: WsLike, readonly name: string, readonly st: Stats) {
    ws.addEventListener("message", (e) => {
      if (typeof e.data === "string") return; // {"type":"open"/"close"/"ka"}
      const b = new Uint8Array(e.data as ArrayBuffer);
      if (b[0] !== 1) return;
      this.links.get(u32(b, 1))?.feed(b.subarray(5));
    });
    // the server dropped us: every pending wait and duel ends now (counted once as "wsClosed")
    const gone = () => {
      if (this.closed) return;
      this.closed = true; fail(this.st, "wsClosed");
      for (const l of this.links.values()) { for (const w of l.waiters) w.res(null); l.waiters = []; l.onClose?.(); }
    };
    ws.addEventListener("close", gone);
    ws.addEventListener("error", gone);
  }
  link(port: number): Link {
    const l = new Link(this, ++this.nsock, port);
    this.links.set(l.sock, l);
    this.ws.send(JSON.stringify({ type: "open", id: l.sock, host: "127.0.0.1", port: port + OFF }));
    return l;
  }

  async gate(): Promise<boolean> {
    const g = this.link(5730);
    g.rx = this.gateRx; g.tx = this.gateTx;
    const ok = await g.ask(0x2005, VERSION, 0x2004);
    g.send(0x0003); this.gateRx = g.rx; this.gateTx = g.tx;
    await sleep(100); g.close();
    return ok !== null;
  }

  /** py FakeClient.account: creates `name` in slot 0 if missing, then picks it. */
  async account(name: string): Promise<boolean> {
    const a = this.link(5731), key = new Uint8Array(32);
    if (!(await a.ask(0x3001, [], 0x3002)) || !(await a.ask(0x3003, key, 0x3004))) return false;
    const pl = (await a.ask(0x3010, [], 0x3012)) ?? new Uint8Array(0);
    if (pl.length < 4 + 73) {
      const nm = new W().u8(0).s(name, 16).bytes();
      if (!(await a.ask(0x3020, nm, 0x3022))) return false;
    }
    if (!(await a.ask(0x3100, [0], 0x3103, 20000)) || !(await a.ask(0x3114, [0], 0x4234))) return false;
    a.send(0x0003); await sleep(100); a.close();
    return true;
  }

  async enterRoom(): Promise<boolean> {
    const r = (this.room = this.link(5740)), key = new Uint8Array(32);
    if (!(await r.ask(0x3001, [], 0x3002)) || !(await r.ask(0x3003, key, 0x3004))) return false;
    const res = await r.ask(0x4100, [5, 0], 0x4101);
    if (!res || res.length < 8) return false;
    this.pid = u32(res, 4);
    if (!(await r.ask(0x4200, [], 0x4201)) || !(await r.ask(0x4202, [0, 0], 0x4213))) return false;
    return (await r.ask(0x4170, new W().u32(1).raw(new Uint8Array(20)).bytes(), 0x4171)) !== null;
  }

  /** a move whose own echo (0x5300) is timed */
  async move(x: number, y: number) {
    const t = now();
    const d = await this.room.ask(0x5300, new W().u32(this.pid).u16(x).u16(y).u8(0).u8(0).bytes(), 0x5300, 15000, (d) => u32(d) === this.pid);
    d ? add(this.st, "move", now() - t) : fail(this.st, "move");
  }

  /** block chat (0x4400 kind 0, fanned out to everyone in the block); the own 0x4402 is timed */
  async chat(text: string) {
    const t = now();
    const body = new W().u8(0).u8(0).u32(0).u32(0).u32(0).s(text, text.length + 1).bytes();
    const d = await this.room.ask(0x4400, body, 0x4402, 15000, (d) => u32(d, 2) === this.pid);
    d ? add(this.st, "chat", now() - t) : fail(this.st, "chat");
  }

  /** py duel_link: the duel port, 0x6001 (booked), the deck */
  private async duelLink(main: number[], extra: number[]): Promise<Link | null> {
    const d = this.link(5760);
    if (!(await d.ask(0x0005, [], 0x0004))) return null;
    if (!(await d.ask(0x6001, new W().u32(this.pid).bytes(), 0x6007))) return null;
    const ids = (a: number[]) => { const w = new W().u32(a.length); for (const x of a) w.u16(x); return w.bytes(); };
    d.send(0x6600, new W().u32(main.length).u32(0).u32(extra.length).bytes());
    d.send(0x6601, ids(main)); d.send(0x6603, ids(extra));
    return d;
  }

  /** py _npc_turns + _npc_surrender, or with `auto` 0x7ffe (the engine plays; PvP in a PVP_TEST instance only): a play prompt (0x1a) -> 0x002e 5 "end
   *  phase", a dialog (0x1b) -> 0x6423 0 "no", 80 ms after the last message; after `prompts` answers (or at a prompt we
   *  can't answer, 0x6610), surrender: 0x6350 (0, 0xd, 0, 10) then 0x6423 1, again 10 answers later if refused. Resolves at 0x4d. */
  private play(d: Link, prompts: number, surrender: boolean, auto = false, ms = 600_000): Promise<boolean> {
    return new Promise((res) => {
      let pend = 0, n = 0, surr = 0, last = now(), answered = 0, prev = 0x1a, think = 0;
      const tick = setInterval(() => {
        // refused (PvP allows it from turn 10): no new prompt comes, so answer the one we had and retry later
        if (surr === 2 && !pend && now() - last > 1500) { surr = 0; n = prompts - 10; pend = prev; }
        if (!pend || now() - last < 80 + think) return;
        const kind = (prev = pend);
        pend = 0;
        if (answered) add(this.st, "prompt", last - answered);
        answered = now();
        if (surr === 1) { d.send(0x6423, new W().u32(1).bytes()); surr = 2; return; }
        if (surr === 2) { surr = 0; n = prompts - 10; }
        if ((surrender && n >= prompts) || kind === 0x6610) { d.send(0x6350, new W().u32(0).u32(0xd).u32(0).u32(10).bytes()); surr = 1; }
        else if (auto) { n++; d.send(0x7ffe); }
        else { n++; kind === 0x1a ? d.send(0x002e, new W().u32(5).bytes()) : d.send(0x6423, new W().u32(0).bytes()); }
      }, 20);
      const done = (ok: boolean) => { clearInterval(tick); clearTimeout(to); d.onMsg = d.onClose = null; res(ok); };
      d.onClose = () => done(false);
      const to = setTimeout(() => done(false), ms);
      d.onMsg = (mid, x) => {
        last = now();
        const t = x.length >= 8 ? u32(x) & 0xff : -1, b = x.length >= 8 ? u32(x, 4) : -1;
        const was = pend;
        if (mid === 0x6610) pend = 0x6610;
        else if (mid === 0x6202 && (t === 0x1a || (t === 0x1b && (b === 0x32 || b === 0x33)))) pend = t;
        if (!was && pend) think = this.think[0] + Math.random() * (this.think[1] - this.think[0]);
        if (mid === 0x6202 && t === 0x4d) done(true);
      };
    });
  }

  /** NPC duel: challenge, link, rock-paper-scissors, play `prompts` prompts, surrender, back to the lobby (0x4140). */
  async npcDuel(npc: number, main: number[], extra: number[], prompts: number): Promise<boolean> {
    const t0 = now();
    const room = this.room;
    if (!(await room.ask(0x4288, new Uint8Array([3, 0, 0, 0, ...new Uint8Array(16), 1, 1, 1, 0, ...new W().u32(npc).bytes()]), 0x43a0))) return false;
    const d = await this.duelLink(main, extra);
    if (!d) return false;
    const booked = await d.ask(0x600b, [], 0x600c);
    if (!booked) { d.close(); return false; }
    for (const [mid, data] of [[0x6100, []], [0x6101, [0]], [0x6102, []]] as [number, number[]][]) {
      if (!(await d.ask(mid, data, mid))) { fail(this.st, `npc:${mid.toString(16)}`); d.close(); return false; }
    }
    await d.ask(0x6103, [0], 0x6103, 3000); // no echo when the NPC won and chose (py _npc_start doesn't check either)
    const first = d.next(0x6202, 60000);
    const lobby = room.next(0x4140, 600_000);
    const played = this.play(d, prompts, true);
    d.send(0x61fe, [1]);
    (await first) ? add(this.st, "duelStart", now() - t0) : fail(this.st, "duelStart");
    const ok = await played;
    if (ok) bump(this.st, "npcDuels");
    (await Promise.race([lobby, sleep(30000).then(() => null)])) ? null : fail(this.st, "npcLobbyBack");
    d.send(0x0003); await sleep(100); d.close();
    return ok;
  }

  /** PvP (predeploy pvp_duel): B opens a room, A challenges, B accepts; both auto-play (PVP_TEST), A surrenders after `prompts`. */
  static async pvp(A: Sim, B: Sim, deckA: [number[], number[]], deckB: [number[], number[]], prompts: number): Promise<boolean> {
    const t0 = now();
    const ticketA = A.room.next(0x3113, 15000, (d) => d.length >= 12 && u32(d, 4) === B.pid);
    if (!(await B.room.ask(0x4288, new Uint8Array([3, 0, 0, 0, ...new Uint8Array(16), 1, 1, 1, 0, 0xff, 0xff, 0xff, 0xff]), 0x428a))) return false;
    const ra = await ticketA;
    if (!ra) { fail(A.st, "pvpRoom"); return false; }
    const offer = B.room.next(0x4302);
    A.room.send(0x4300, cat(new W().u32(u32(ra)).bytes(), new Uint8Array(16)));
    if (!(await offer)) { fail(A.st, "pvpOffer"); return false; }
    const ta = A.room.next(0x4306), tb = B.room.next(0x4306);
    B.room.send(0x4303, new W().u32(1).bytes());
    if (!(await ta) || !(await tb)) { fail(A.st, "pvpTicket"); return false; }
    const [da, db] = await Promise.all([A.duelLink(...deckA), B.duelLink(...deckB)]);
    if (!da || !db) { fail(A.st, "pvpLink"); return false; }
    const [pa, pb] = await Promise.all([da.ask(0x600b, [], 0x600c), db.ask(0x600b, [], 0x600c)]);
    if (!pa || !pb) { fail(A.st, "pvpBooked"); return false; }
    const step = async (mid: number, a: number[], b: number[] | null) => {
      const r = await Promise.all([da.ask(mid, a, mid), b ? db.ask(mid, b, mid) : Promise.resolve(new Uint8Array(1))]);
      return r.every((x) => x !== null);
    };
    // rock-paper-scissors: A 0 vs B 1, A wins and starts (py pvp_start_duel without the tie)
    if (!(await step(0x6100, [], [])) || !(await step(0x6101, [0], [1])) || !(await step(0x6102, [], []))) { fail(A.st, "pvpRps"); return false; }
    const fb = db.next(0x6103); da.send(0x6103, [0]); await fb;
    const first = da.next(0x6202, 60000);
    const la = A.room.next(0x4140, 600_000), lb = B.room.next(0x4140, 600_000);
    const pA = A.play(da, prompts, true, true), pB = B.play(db, 1e9, false, true);
    da.send(0x61fe, [1]); db.send(0x61fe, [1]);
    (await first) ? add(A.st, "pvpStart", now() - t0) : fail(A.st, "pvpStart");
    const ok = (await pA) && (await pB);
    if (ok) bump(A.st, "pvpDuels");
    await Promise.race([Promise.all([la, lb]), sleep(30000)]);
    for (const d of [da, db]) { d.send(0x0003); d.close(); }
    return ok;
  }

  /** gate + account + room; timed */
  async login(name: string): Promise<boolean> {
    const t = now();
    const step = !(await this.gate()) ? "gate" : !(await this.account(name)) ? "account" : !(await this.enterRoom()) ? "room" : null;
    step ? fail(this.st, `login:${step}`) : add(this.st, "login", now() - t);
    return !step;
  }
}

const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

/** p50/p95/max/n of each latency series */
export function summary(s: Stats) {
  const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const lat: Record<string, { n: number; p50: number; p95: number; max: number }> = {};
  for (const [k, v] of Object.entries(s.lat)) {
    const a = [...v].sort((x, y) => x - y);
    lat[k] = { n: a.length, p50: Math.round(q(a, 0.5)), p95: Math.round(q(a, 0.95)), max: Math.round(a[a.length - 1]) };
  }
  return { lat, errors: s.errors, counts: s.counts };
}

export function merge(all: Stats[]): Stats {
  const o = newStats();
  for (const s of all) {
    for (const [k, v] of Object.entries(s.lat)) (o.lat[k] ??= []).push(...v);
    for (const [k, v] of Object.entries(s.errors)) o.errors[k] = (o.errors[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.counts)) o.counts[k] = (o.counts[k] ?? 0) + v;
  }
  return o;
}

export type Deck = [number[], number[]];
export interface Plan { secs: number; npc: number; deck: Deck; prompts: number; pvpPrompts: number }

/** A walker: a move every 1.5-2.5 s, a block chat every 5th. */
export async function walker(s: Sim, p: Plan) {
  const end = now() + p.secs * 1000;
  let x = 100 + Math.floor(Math.random() * 400), y = 100 + Math.floor(Math.random() * 300), i = 0;
  while (now() < end && !s.closed) {
    x += Math.floor(Math.random() * 21) - 10; y += Math.floor(Math.random() * 21) - 10;
    await s.move(x, y);
    if (++i % 5 === 0) await s.chat(`hola ${s.name} ${i}`);
    await sleep(1500 + Math.random() * 1000);
  }
}

/** An NPC dueler: one NPC duel after another until `secs`. */
export async function npcDueler(s: Sim, p: Plan) {
  const end = now() + p.secs * 1000;
  while (now() < end && !s.closed) if (!(await s.npcDuel(p.npc, ...p.deck, p.prompts))) await sleep(3000);
}

/** A PvP pair: one match after another until `secs`. */
export async function pvpPair(a: Sim, b: Sim, p: Plan) {
  const end = now() + p.secs * 1000;
  while (now() < end && !a.closed && !b.closed) if (!(await Sim.pvp(a, b, p.deck, p.deck, p.pvpPrompts))) await sleep(3000);
}
