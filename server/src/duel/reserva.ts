// py yo2srv/duelo/reserva.py + research/seguridad_duelo/tickets.py: the duel ticket. Sending 0x4306 DUELSERVERNOTICE
// over a session's connection issues a reservation {session, pid, peer, connection, duel, time}; the duel port's first
// 0x6001 is only valid with an unused reservation of that pid, < 90 s old, from the SAME peer. Mode (DUEL_RESERVA):
// "vigilar" (default: logs what it would refuse), "on" (refuses: 0x6007 s32 0 and the connection closes), "off".
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import type { Game } from "../game/game.ts";
import type { Session } from "../game/hub.ts";

const TTL_S = 90.0, INSIST_N = 5, INSIST_S = 300.0, REJECT_CLOSE_S = 1.5;
const MODES = ["off", "vigilar", "on"];
const SUSPECT = new Set(["sin_reserva", "ip", "espectador"]);

interface Ticket { sess: Session; pid: number; peer: string; kind: string; ref: { done?: boolean } | null; t: number; used: boolean; conn: Conn | null }
interface Result { ok: boolean; ticket: Ticket | null | undefined; why: string; cat: string; fails: number; alert: boolean }

export class DuelReserva {
  mode: string;
  private byPid = new Map<number, Ticket>();
  private fails = new Map<string, number[]>();
  private alerted = new Map<string, number>();
  constructor(private g: Game, mode: string) {
    const m = String(mode || "vigilar").trim().toLowerCase();
    if (!MODES.includes(m)) g.log(`[AVISO] [reserva] YO2_DUEL_RESERVA=${JSON.stringify(m)} no vale (off/vigilar/on): se usa «vigilar»`);
    this.mode = MODES.includes(m) ? m : "vigilar";
  }
  private now() { return Date.now() / 1000; }

  /** Conn.send of 0x4306 (beforeSend): a reservation for THIS session's 0x6001 from c's peer. Never throws. */
  issue(c: Conn): void {
    try {
      const s = c.sess as Session | null;
      if (!s || s.pid === null) { this.g.log(`[reserva] 0x4306 por una conexión sin sesión o sin personaje (${c.peer}): sin reserva`); return; }
      const pvp = this.g.pvp as { byPid(pid: number): ({ done: boolean; name: string } | null) } | null;
      const m = pvp ? pvp.byPid(s.pid) : null;
      let kind: string, ref: Ticket["ref"] = null;
      if (m && !m.done) { kind = String(m.name ?? "pvp"); ref = m; }
      else { const d = s.ext.duel as { lobby?: Conn } | undefined; kind = d && d.lobby === c ? "npc" : "duelo"; }
      if (!c.peer || c.peer === "?") return;
      const now = this.now();
      this.byPid.set(s.pid, { sess: s, pid: s.pid, peer: c.peer, kind, ref, t: now, used: false, conn: c });
      this.sweep(now);
      this.g.log(`[reserva] 0x4306 a pid=${s.pid} (${c.peer}, puerto ${c.port}): reserva ${kind} de ${TTL_S} s`);
    } catch (e) { this.g.log(`[reserva] no se pudo crear la reserva: ${e}`); }
  }

  private alive(t: Ticket): string | null {
    if (t.conn && t.conn.closed) return "se cerró la conexión de lobby/sala que recibió el 0x4306";
    if (this.g.hub.byPid(t.pid) !== t.sess) return "la sesión de ese pid ya no es la que pidió el duelo";
    if (t.ref) {
      const pvp = this.g.pvp as { byPid(pid: number): unknown } | null;
      if (t.ref.done || (pvp && pvp.byPid(t.pid) !== t.ref)) return `el duelo ${t.kind} se ha anulado`;
    }
    return null;
  }

  private check(pid: number, peer: string, spectator: boolean): Result {
    const now = this.now();
    const t = this.byPid.get(pid);
    let why: string | null, cat: string | null;
    if (spectator) [why, cat] = ["conexión de espectador (0x6700) que manda 0x6001", "espectador"];
    else if (!t) [why, cat] = ["sin reserva", "sin_reserva"];
    else if (t.peer !== peer) [why, cat] = [`IP distinta (la reserva es de ${t.peer})`, "ip"];
    else if (now - t.t > TTL_S) [why, cat] = [`reserva caducada (${Math.floor(now - t.t)} s > ${TTL_S} s)`, "caducada"];
    else if (t.used) [why, cat] = ["reserva ya usada (¿reconexión al mismo duelo?)", "reconexion"];
    else [why, cat] = [null, null];
    if (why === null && t) { const gone = this.alive(t); if (gone) [why, cat] = [gone, "anulada"]; }
    if (why === null && t) { t.used = true; return { ok: true, ticket: t, why: "ok", cat: "ok", fails: 0, alert: false }; }
    if (cat === "anulada" && this.byPid.get(pid) === t) this.byPid.delete(pid);
    let n = 0, alert = false;
    if (SUSPECT.has(cat!)) {
      const lst = [...(this.fails.get(peer) ?? []).filter((x) => now - x < INSIST_S), now];
      this.fails.set(peer, lst);
      n = lst.length;
      const last = this.alerted.get(peer);
      if (n >= INSIST_N && (last === undefined || now - last >= INSIST_S)) { this.alerted.set(peer, now); alert = true; }
    }
    return { ok: false, ticket: t, why: why!, cat: cat!, fails: n, alert };
  }

  dropConn(c: Conn): void {
    for (const [pid, t] of [...this.byPid]) if (t.conn === c && !t.used) this.byPid.delete(pid);
  }

  private sweep(now: number): void {
    for (const [pid, t] of [...this.byPid]) if (now - t.t > TTL_S) this.byPid.delete(pid);
    for (const [ip, lst] of [...this.fails]) if (!lst.length || now - lst[lst.length - 1] >= INSIST_S) this.fails.delete(ip);
    for (const [ip, x] of [...this.alerted]) if (now - x >= INSIST_S) this.alerted.delete(ip);
  }

  /** The first 0x6001 of a duel connection without a session, BEFORE HUB.attach. false = refused (0x6007 0, close). */
  duel6001(c: Conn, pid: number): boolean {
    const mode = this.mode;
    if (mode === "off") return true;
    const on = mode === "on";
    let r: Result | null = null;
    try { r = this.check(pid, c.peer, !!c.ext.pvp); } catch (e) { this.g.log(`[ERROR] [reserva] 0x6001 pid=${pid} desde ${c.peer}: ${e}`); }
    if (r && r.ok) { this.g.log(`[reserva] 0x6001 pid=${pid} desde ${c.peer}: reserva ${r.ticket!.kind} válida`); return true; }
    const why = r ? r.why : "error interno al comprobar la reserva";
    this.g.log(`[reserva] ${on ? "RECHAZADO" : "rechazaría"} 0x6001 pid=${pid} desde ${c.peer}: ${why}`
      + (r && r.fails ? ` (${r.fails} rechazos sospechosos de esa IP en ${INSIST_S / 60} min)` : "") + (on ? "" : ` -> se deja pasar (modo ${mode})`));
    if (r && r.alert) this.g.log(`[AVISO] [reserva] la IP ${c.peer} insiste: ${r.fails} intentos sospechosos de entrar en duelos ajenos (solo aviso: no se veta)`);
    if (!on) return true;
    c.ext.bookedFail = why;
    c.send(0x6007, new W().u32(0).bytes());
    void c.closeAfterFlush();
    setTimeout(() => this.g.world.close(c, "0x6001 refused"), REJECT_CLOSE_S * 1000);
    return false;
  }
}
