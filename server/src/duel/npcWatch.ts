// py npc_watch.py (NW): NPC duels seen from outside. The «in a duel» pose for the others of the block when the NPC duel
// really starts (first 0x61fe), and «Watch» (spectator): 0x4320 -> 0x4321, then the 0x6700 of that peer gets 0x6006,
// 0x6701 and, at each 0x6702, the next batch of the 0x6202 the player received since the start (without the player's
// decisions). The player's duel connection gets its own c.send that records each 0x6202 after sending it.
// The server-side replay archive (REPLAY_ARCHIVE, rep_archivo.py: files on disk) is not ported.
import { Conn } from "../net/conn.ts";
import type { Game } from "../game/game.ts";
import { DUEL_STATE, NPC_DUEL_STATE, type Session } from "../game/hub.ts";
import { endDuelMsgs, isSurrender, surrenderConfirmMsgs, WHY_DISCONNECT } from "./duelfin.ts";
import { COUNTRY, WATCH_BATCH, WATCH_REQ_TTL, WATCH_SEND_PREP, WATCH_SIN_DECISIONES, watchOculta } from "./pvpMatch.ts";
import { X } from "./port.ts";
import type { OcgSession } from "./ocgSession.ts";

const NPC_WATCH = true;
const END_GRACE = 30.0, KEEP_DONE = 120.0, KEEP_DONE_IDLE = 10.0, TICK = 1.0, MAX_WATCHERS = 16, T_FINISH = 0x4d;
const now = () => Date.now() / 1000;
const isFinish = (d: Uint8Array) => d.length >= 8 && (new DataView(d.buffer, d.byteOffset).getUint32(0) & 0xff) === T_FINISH;
const hx = (b: Uint8Array) => Buffer.from(b).toString("hex");

interface Watcher { c: Conn; i: number; want: boolean; jseen: boolean; gone: boolean }

class NpcDuel {
  entries: Uint8Array[] = [];
  watchers: Watcher[] = [];
  t0 = now();
  endT: number | null = null;
  overT: number | null = null;
  ask = false;
  done = false;
  readonly pid: number;
  constructor(readonly c: Conn, readonly sess: Session, readonly rival: number, readonly name: string, readonly info: Uint8Array,
    readonly prep: Uint8Array | null, readonly hands: [number, number], readonly first: number) { this.pid = sess.pid!; }
  toString() { return `<duelo NPC '${this.name}' de pid ${this.pid}${this.done ? " acabado" : ""}>`; }
}

/** What stays in c.pvp of an NPC spectator's connection (on_conn_closed / the duel ticket treat it as a spectator). */
class Proxy {
  readonly name: string;
  constructor(readonly nw: NpcWatch, readonly duel: NpcDuel) { this.name = `npc-${duel.pid}`; }
  get done() { return this.duel.done; }
  on(c: Conn, msgId: number, _p: number, data: Uint8Array) { this.nw.watchMsg(this.duel, c, msgId, data); }
  onClose(c: Conn) { this.nw.watchClose(this.duel, c); }
}

export class NpcWatch {
  private duels = new Map<number, NpcDuel>();
  private reqs = new Map<string, [NpcDuel, number]>();
  private ticking = false;
  stats = { duelos: 0, espectadores: 0, cortados: 0 };
  constructor(private g: Game, private pause: number) {}

  private log(s: string) { this.g.log(s); }
  private post(c: Conn, mid: number, data: Uint8Array = new Uint8Array(0)) { c.post(mid, data, this.pause); }
  private confirm(): Set<string> { return new Set(surrenderConfirmMsgs().map(([, d]) => hx(d))); }

  /** true = a message of an NPC spectator (handled: duel_reply stops). Of the player it only records. Never throws. */
  onDuelMsg(c: Conn, msgId: number, data: Uint8Array): boolean {
    try {
      const d = c.ext.npcWatch as NpcDuel | undefined;
      if (d) { this.watchMsg(d, c, msgId, data); return true; }
      if (msgId === 0x6700) return this.attach(c);
      if (!NPC_WATCH || X(c).pvp || !c.sess || !X(c).ocg) return false;
      this.observe(c, msgId, data);
    } catch (e) {
      this.log(`[npcmirar] 0x${msgId.toString(16).padStart(4, "0")}: ${e}`);
      return !!c.ext.npcWatch;
    }
    return false;
  }

  private observe(c: Conn, msgId: number, data: Uint8Array): void {
    if (!c.ext.npcTap) this.installTap(c);
    if (msgId === 0x6101 && data.length) c.ext.npcHand0 = data[0] % 3;
    else if (msgId === 0x6350) {
      const d = c.ext.npcDuel as NpcDuel | undefined;
      if (d && isSurrender(data)) d.ask = true;
    } else if (msgId === 0x6423) {
      const d = c.ext.npcDuel as NpcDuel | undefined;
      if (d) d.ask = false;
    } else if (msgId === 0x61fe && !X(c).duelStarted && !c.ext.npcDuel) this.arm(c);
  }

  private installTap(c: Conn): void {
    c.ext.npcTap = true;
    c.send = (mid: number, data: Uint8Array = new Uint8Array(0), pause?: number) => {
      Conn.prototype.send.call(c, mid, data, pause);
      try { this.tap(c, mid, data); } catch (e) { this.log(`[npcmirar] grabación 0x${mid.toString(16).padStart(4, "0")}: ${e}`); }
    };
  }

  private tap(c: Conn, mid: number, data: Uint8Array): void {
    if (mid === 0x6101 && data.length >= 2) { c.ext.npcHand1 = data[1] % 3; return; }
    if (mid !== 0x6202) return;
    const d = c.ext.npcDuel as NpcDuel | undefined;
    if (!d || d.c !== c || d.endT !== null) return;
    if (d.ask && this.confirm().has(hx(data))) return;
    d.entries.push(data.slice());
    const end = isFinish(data);
    if (end) { d.endT = now(); d.done = true; }
    this.pump(d);
    if (end) {
      this.log(`[npcmirar] ${d}: fin (${d.entries.length} comandos, ${d.watchers.length} espectadores)`);
      this.unpose(d);
    }
  }

  private arm(c: Conn): void {
    const s = c.sess as Session;
    if (s.pid === null) return;
    const port = this.g.duel!;
    const rival = port.duelRival(s);
    const name = this.g.npcs.find((n) => n[0] === rival)?.[1] ?? `Rival ${rival}`;
    const info = this.watchInfo(c, s, rival, name);
    const prep = WATCH_SEND_PREP ? port.preparationResult() : null;
    const h0 = c.ext.npcHand0 as number | undefined, h1 = c.ext.npcHand1 as number | undefined;
    const hands: [number, number] = h0 !== undefined && h1 !== undefined ? [h0, h1] : [0, 1];
    const first = (Number((X(c).duelSt ?? {}).first ?? 0) || 0) & 1;
    const d = new NpcDuel(c, s, rival, name, info, prep, hands, first);
    const old = this.duels.get(s.pid);
    this.duels.set(s.pid, d);
    this.stats.duelos++;
    if (old && !old.done) this.cut(old, "el mismo jugador empieza otro duelo");
    c.ext.npcDuel = d;
    if (NPC_WATCH) this.pose(d);
    this.ticker();
    this.log(`[npcmirar] ${s.acct} empieza contra ${name} (${rival}): manos [${hands}], empieza ${first}`);
  }

  /** 0x6006 (147 B): player 0 = the human, 1 = the NPC (its official deck, name and parts as in 0x600c); mode 3. */
  private watchInfo(c: Conn, s: Session, rival: number, name: string): Uint8Array {
    const o = X(c).ocg as OcgSession | null | undefined;
    const pl = o?.player ?? { main: [], extra: [] }, npc = o?.npc ?? { main: [], extra: [] };
    const out: number[] = [];
    for (const [who, deck, nm] of [[null, pl, s.name || "Duelista"], [rival, npc, name]] as const) {
      const main = (deck.main?.length || 0) || (who !== null ? 40 : 0), extra = deck.extra?.length || 0;
      out.push(main >> 8, main & 0xff, extra >> 8, extra & 0xff, 0);
      const nb = [...String(nm)].map((ch) => (ch.charCodeAt(0) > 255 ? 0x3f : ch.charCodeAt(0))).slice(0, 15);
      out.push(...nb, ...Array(16 - nb.length).fill(0));
      const parts = [...this.g.duelParts(who, 0), ...this.g.duelParts(who, 1)].slice(0, 32);
      out.push(...parts, ...Array(32 - parts.length).fill(0), ...Array(16).fill(0), ...COUNTRY);
    }
    out.push(3);
    return Uint8Array.from(out);
  }

  private pose(d: NpcDuel): void {
    const s = d.sess;
    if (!NPC_DUEL_STATE || s.block === null || (s.state >= 0x67 && s.state <= 0x6a)) return;
    try { this.g.hub.setState(s, DUEL_STATE, d.name); s.npcPose = true; } catch (e) { this.log(`[npcmirar] pose: ${e}`); }
  }

  private unpose(d: NpcDuel): void {
    const s = d.sess;
    if (!s.npcPose) return;
    s.npcPose = false;
    if (!(s.state >= 0x67 && s.state <= 0x6a)) return;
    try { this.g.hub.setState(s, 0); } catch (e) { this.log(`[npcmirar] quitar la pose: ${e}`); }
  }

  /** lobby h_watch: the next 0x6700 from peer watches pid's NPC duel. null if there is none. */
  watchRequest(peer: string, pid: number): NpcDuel | null {
    if (!NPC_WATCH) return null;
    const d = this.duels.get(pid);
    if (!d || d.done || d.c.closed) return null;
    this.reqs.set(peer, [d, now()]);
    this.ticker();
    return d;
  }

  forget(peer: string): void { this.reqs.delete(peer); }

  private attach(c: Conn): boolean {
    const req = this.reqs.get(c.peer);
    this.reqs.delete(c.peer);
    if (!req) return false;
    const [d, t] = req;
    if (now() - t > WATCH_REQ_TTL || d.watchers.length >= MAX_WATCHERS || (d.done && now() - (d.endT ?? 0) > KEEP_DONE_IDLE)) {
      this.log(`[npcmirar] 0x6700 de ${c.peer}: ${d} ya no se puede mirar`);
      return false;
    }
    c.ext.npcWatch = d;
    Object.assign(X(c), { pvp: new Proxy(this, d), pvpI: null, pvpW: true });
    d.watchers.push({ c, i: 0, want: false, jseen: false, gone: false });
    this.stats.espectadores++;
    this.log(`[npcmirar] espectador ${c.peer} mira ${d} (${d.watchers.length}; ${d.entries.length} comandos ya pasados)`);
    if (d.prep) this.post(c, 0x600c, d.prep);
    this.post(c, 0x6006, d.info);
    this.pump(d);
    return true;
  }

  watchMsg(d: NpcDuel, c: Conn, mid: number, _data: Uint8Array): void {
    const w = d.watchers.find((x) => x.c === c);
    if (mid === 0x0005) return this.post(c, 0x0004, Uint8Array.of(0, 0, 0, 0));
    if (!w) return;
    if (mid === 0x6702) { w.want = true; return this.pump(d); }
    if (mid === 0x0003) { w.gone = true; return; }
    if (mid === 0x6700 || mid === 0x6703) return;
    this.log(`[npcmirar] espectador de ${d}: 0x${mid.toString(16).padStart(4, "0")} ignorado (no puede actuar)`);
  }

  watchClose(d: NpcDuel, c: Conn): void {
    d.watchers = d.watchers.filter((w) => w.c !== c);
    this.log(`[npcmirar] espectador ${c.peer} sale de ${d} (${d.watchers.length} quedan)`);
  }

  private pump(d: NpcDuel): void {
    if (!d.watchers.length) return;
    for (const w of [...d.watchers]) {
      const c = w.c;
      if (w.gone || c.closed) { d.watchers.splice(d.watchers.indexOf(w), 1); continue; }
      if (!w.jseen) { w.jseen = true; this.post(c, 0x6701, Uint8Array.of(d.hands[0] & 0xff, d.hands[1] & 0xff, d.first & 0xff)); continue; }
      if (!w.want) continue;
      const batch: Uint8Array[] = [];
      let i = w.i;
      while (i < d.entries.length && batch.length < WATCH_BATCH) {
        const x = d.entries[i++];
        if (!(WATCH_SIN_DECISIONES && watchOculta(x))) batch.push(x);
      }
      w.i = i;
      if (batch.length) { w.want = false; for (const x of batch) this.post(c, 0x6202, x); }
    }
  }

  private cut(d: NpcDuel, why: string): void {
    let msgs = endDuelMsgs(1, WHY_DISCONNECT).filter(([m]) => m === 0x6202).map(([, x]) => x);
    if (!msgs.length) msgs = [Uint8Array.of(0, 0, 0, T_FINISH, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0)];
    if (d.done) return;
    d.entries.push(...msgs);
    d.done = true; d.endT = now();
    this.stats.cortados++;
    this.log(`[npcmirar] ${d} cortado: ${why} (${d.watchers.length} espectadores reciben el fin)`);
    this.pump(d);
    this.unpose(d);
  }

  private ticker(): void {
    if (this.ticking) return;
    this.ticking = true;
    const loop = () => setTimeout(() => void this.g.world.run(() => {
      let more = false;
      try { more = this.tick(); } catch (e) { this.log(`[npcmirar] vigilante: ${e}`); more = true; }
      if (more || this.duels.size || this.reqs.size) loop(); else this.ticking = false;
    }), TICK * 1000);
    loop();
  }

  tick(t = now()): boolean {
    for (const [k, [, at]] of [...this.reqs]) if (t - at > WATCH_REQ_TTL) this.reqs.delete(k);
    for (const d of [...this.duels.values()]) {
      if (!d.done) {
        const c = d.c, o = X(c).ocg;
        let why: string | null = null;
        if (c.closed) why = "se ha cerrado la conexión de duelo del jugador";
        else if (c.stale()) why = "el jugador ya usa otra conexión de duelo";
        else if (o && o.over) {
          d.overT = d.overT ?? t;
          if (t - d.overT > END_GRACE) why = `el duelo acabó sin 0x4d en ${END_GRACE} s`;
        }
        if (why) this.cut(d, why);
        continue;
      }
      d.watchers = d.watchers.filter((w) => !w.gone && !w.c.closed);
      const idle = !d.watchers.length;
      if (t - (d.endT ?? t) > (idle ? KEEP_DONE_IDLE : KEEP_DONE) && this.duels.get(d.pid) === d) this.duels.delete(d.pid);
    }
    return this.duels.size > 0 || this.reqs.size > 0;
  }
}


