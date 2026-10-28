// Teams between real players (py research/equipos/proposal.py, EQ). The registry is state.equipos; it replaces the
// lobby's team handlers and the hub's LIST5 body (py EQ.install / LP.HANDLERS.update(EQ.HANDLERS)).
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import { myName, myPid } from "./accounts.ts";
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import * as PP from "./persist.ts";

const MAX_MEMBERS = 100, NAME_LEN = 16;
const CREATE_OK = 0, CREATE_DUP = 1, CREATE_BADNAME = 4;
const AUTH_LEADER_BIT = 0x02, AUTH_INVITE_BIT = 0x04, AUTH_BANISH_BIT = 0x08;
const AUTH_LEADER = AUTH_LEADER_BIT | AUTH_INVITE_BIT | AUTH_BANISH_BIT, AUTH_MEMBER = 0;
const CREATE_IN_TEAM_CODE = CREATE_DUP, DISBAND_DENIED = 1, INVITE_TTL = 600, MAX_DATA = 1024;

type Team = { id: number; name: string; flag: string; leader: number; members: [number, string, number][]; created: number };
const cat = (...a: Uint8Array[]) => Buffer.concat(a);
const S = (t: string, n: number) => new W().s([...String(t ?? "")].map((ch) => (ch.charCodeAt(0) > 255 ? "?" : ch)).join(""), n).bytes();
const casefold = (s: string) => s.toLowerCase().replace(/ß/g, "ss");
const u32 = (d: Uint8Array, at = 0) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);

export class Teams {
  private pending = new Map<string, [number, number]>(); // "invited|team" -> (inviter, time)
  readonly handlers: Map<number, (c: Conn, data: Uint8Array) => boolean>;

  constructor(private g: Game) {
    this.handlers = new Map([[0x4550, (c, d) => this.create(c, d)], [0x4552, (c) => this.disband(c)], [0x4554, (c, d) => this.join(c, d)],
      [0x4556, (c, d) => this.banish(c, d)], [0x4558, (c) => this.list(c)], [0x4568, (c, d) => this.joinReply(c, d)], [0x4569, (c) => this.leave(c)]]);
  }

  private load(): [any, any] { const st = this.g.loadState(); return [st, (st.equipos ??= { next_id: 1, teams: {} })]; }
  private teams(): Record<string, Team> { try { return this.load()[1].teams ?? {}; } catch (e) { this.g.log(`[equipos] state: ${e}`); return {}; } }
  private teamOf(pid: number | null, teams = this.teams()): [string | null, Team | null] {
    for (const [tid, t] of Object.entries(teams)) for (const m of t.members ?? []) if (m[0] === pid) return [tid, t];
    return [null, null];
  }
  private member(t: Team | null, pid: number) { return t?.members.find((m) => m[0] === pid) ?? null; }
  private who(c: Conn): [Session | null, number, string] {
    const s = c.sess as Session | null;
    if (s && s.pid !== null) return [s, s.pid, s.name || "Duelista"];
    return [null, myPid(this.g), myName(this.g) || "Duelista"];
  }
  private flag(t: Team | null) { const b = new Uint8Array(16); try { if (t) b.set(Buffer.from(t.flag ?? "", "hex").subarray(0, 16)); } catch { /* py: FLAG16 */ } return b; }
  private online(pid: number) { return this.g.hub.byPid(pid); }
  private send(c: Conn, me: Session | null, s: Session | null, mid: number, data: Uint8Array) {
    if (s && s === me) c.send(mid, data);
    else if (s) { const lc = s.lobby; if (lc && !lc.closed) lc.post(mid, data); }
  }
  private membersOnline(t: Team | null) { return (t?.members ?? []).map((m) => this.online(m[0])).filter((o): o is Session => !!o); }

  private profileSet(s: Session | null, tid: number | null) {
    if (!s) return;
    try {
      this.g.withCtx(s, () => {
        const st = this.g.loadState();
        const p = PP.profile(st, s.slot ?? 0)!;
        if (p.team !== tid) { p.team = tid; this.g.saveState(st); }
      });
    } catch (e) { this.g.log(`[equipos] profile of ${s.acct} (team ${tid}): ${e}`); }
  }

  /** py list5_body: LIST5 / 0x3112 without pid (36 B). */
  list5Body(s: Session): Uint8Array {
    const [tid, t] = this.teamOf(s.pid);
    if (!t) return new Uint8Array(36);
    return cat(new W().u32(Number(tid)).bytes(), S(t.name, 16), this.flag(t));
  }

  teamChatTargets(s: Session): Session[] { const [, t] = this.teamOf(s.pid); return this.membersOnline(t).filter((o) => o !== s); }

  private announce(c: Conn, me: Session | null, who: Session | null, tid: number | string, t: Team | null) {
    if (!who) return;
    const data = cat(new W().u32(who.pid!).u32(Number(tid || 0)).bytes(), S(t ? t.name : "", 16), this.flag(t));
    this.send(c, me, who, 0x4571, data);
    for (const o of this.g.hub.others(who)) this.send(c, me, o, 0x4571, data);
  }

  private teamList(c: Conn, pid: number) {
    const [tid, t] = this.teamOf(pid);
    this.profileSet(c.sess as Session | null, tid !== null ? Number(tid) : null);
    if (!t) { c.send(0x4564, cat(new W().u32(0).u32(0).bytes(), new Uint8Array(32))); c.send(0x4565, new W().u32(0).bytes()); return; }
    c.send(0x4564, cat(new W().u32(t.members.length).u32(Number(tid)).bytes(), S(t.name, 16), this.flag(t)));
    let cur: Uint8Array[] = [], n = 0;
    for (const m of t.members) {
      const e = cat(new W().u32(m[0]).bytes(), S(m[1], 16), new W().u8(m[2] & 0xff).bytes());
      if (n + e.length > MAX_DATA) { c.send(0x4559, cat(...cur)); cur = []; n = 0; }
      cur.push(e); n += e.length;
    }
    if (cur.length) c.send(0x4559, cat(...cur));
    c.send(0x4565, new W().u32(0).bytes());
  }

  private list(c: Conn) { this.teamList(c, this.who(c)[1]); return true; }

  private create(c: Conn, data: Uint8Array) {
    const [s, pid, pname] = this.who(c);
    let name = Buffer.from(data.subarray(0, NAME_LEN)).toString("latin1"); name = name.split("\0")[0].trim();
    let code = CREATE_OK, tid = 0;
    const [st, reg] = this.load();
    const teams: Record<string, Team> = (reg.teams ??= {});
    if (this.teamOf(pid, teams)[1]) code = CREATE_IN_TEAM_CODE;
    else if (!name) code = CREATE_BADNAME;
    else if (Object.values(teams).some((t) => casefold(t.name) === casefold(name))) code = CREATE_DUP;
    if (code === CREATE_OK) {
      tid = PP.int(reg.next_id ?? 1);
      reg.next_id = tid + 1;
      teams[String(tid)] = { id: tid, name, flag: "00".repeat(16), leader: pid, members: [[pid, pname, AUTH_LEADER]], created: Math.floor(this.g.clock.time()) };
      this.g.saveState(st);
    }
    c.send(0x4551, new W().u32(code).bytes());
    c.send(0x4566, new W().u32(0).bytes());
    if (code === CREATE_OK) { this.profileSet(s, tid); this.announce(c, s, s, tid, teams[String(tid)]); }
    return true;
  }

  private disband(c: Conn) {
    const [s, pid] = this.who(c);
    const [st, reg] = this.load();
    const teams: Record<string, Team> = (reg.teams ??= {});
    const [tid, t] = this.teamOf(pid, teams);
    const m = t ? this.member(t, pid) : null;
    if (!t || !(m![2] & AUTH_LEADER_BIT)) { c.send(0x4553, new W().u32(DISBAND_DENIED).bytes()); return true; }
    delete teams[tid!];
    this.g.saveState(st);
    c.send(0x4553, new W().u32(0).bytes());
    const online = this.membersOnline(t);
    for (const o of online) this.send(c, s, o, 0x4560, new W().u32(Number(tid)).bytes());
    for (const o of online) { this.profileSet(o, null); this.announce(c, s, o, 0, null); }
    for (const k of [...this.pending.keys()]) if (k.split("|")[1] === String(Number(tid))) this.pending.delete(k);
    return true;
  }

  private join(c: Conn, data: Uint8Array) {
    const [s, pid, name] = this.who(c);
    const target = data.length >= 4 ? u32(data) : 0;
    const [tid, t] = this.teamOf(pid);
    const m = t ? this.member(t, pid) : null;
    const o = this.online(target);
    let why: string | null = null;
    if (!t) why = "no team";
    else if (!(m![2] & AUTH_INVITE_BIT)) why = "no invite right";
    else if (!o || o === s) why = "invitee not online";
    else if (this.teamOf(target)[1]) why = "invitee already in a team";
    else if (t.members.length >= MAX_MEMBERS) why = "team full";
    if (why) { this.g.log(`[equipos] invite of ${pid} to ${target} ignored: ${why}`); return true; }
    this.pending.set(`${target}|${Number(tid)}`, [pid, this.g.clock.time()]);
    const body = cat(new W().u32(pid).bytes(), S(name, 16), new W().u32(Number(tid)).bytes(), S(t!.name, 16));
    const lc = o!.lobby; if (lc && !lc.closed) lc.post(0x4567, body);
    return true;
  }

  private pendingFor(pid: number, a: number, b: number): [string | null, number | null] {
    const now = this.g.clock.time();
    for (const [k, v] of [...this.pending]) if (now - v[1] > INVITE_TTL) this.pending.delete(k);
    for (const [k, [by]] of this.pending) {
      const [inv, tid] = k.split("|").map(Number);
      if (inv === pid && ((a === tid && b === by) || (a === by && b === tid))) return [k, by];
    }
    return [null, null];
  }

  private joinReply(c: Conn, data: Uint8Array) {
    if (data.length < 12) return true;
    const yes = u32(data), a = u32(data, 4), b = u32(data, 8);
    const [s, pid, name] = this.who(c);
    const [key] = this.pendingFor(pid, a, b);
    if (key === null) return true;
    this.pending.delete(key);
    const tid = Number(key.split("|")[1]);
    if (yes !== 1) return true;
    const [st, reg] = this.load();
    const teams: Record<string, Team> = (reg.teams ??= {});
    const t = teams[String(tid)];
    if (!t || this.teamOf(pid, teams)[1] || t.members.length >= MAX_MEMBERS) return true;
    t.members.push([pid, name, AUTH_MEMBER]);
    this.g.saveState(st);
    this.profileSet(s, tid);
    this.announce(c, s, s, tid, t);
    const note = cat(new W().u32(tid).u32(pid).bytes(), S(name, 16));
    for (const o of this.membersOnline(t)) this.send(c, s, o, 0x4561, note);
    return true;
  }

  private remove(c: Conn, s: Session | null, pid: number, target: number, needBit: number, mid: number) {
    const [st, reg] = this.load();
    const teams: Record<string, Team> = (reg.teams ??= {});
    const [tid, t] = this.teamOf(pid, teams);
    const me = t ? this.member(t, pid) : null, tm = t ? this.member(t, target) : null;
    if (!t || (needBit && !(me![2] & needBit)) || !tm || tm[2] & AUTH_LEADER_BIT) return;
    t.members.splice(t.members.indexOf(tm), 1);
    this.g.saveState(st);
    const who = this.online(target);
    const note = cat(new W().u32(Number(tid)).u32(target).bytes(), S(tm[1], 16));
    for (const o of [...this.membersOnline(t), ...(who ? [who] : [])]) this.send(c, s, o, mid, note);
    if (who) { this.profileSet(who, null); this.announce(c, s, who, 0, null); }
  }

  private banish(c: Conn, data: Uint8Array) { const [s, pid] = this.who(c); this.remove(c, s, pid, data.length >= 4 ? u32(data) : 0, AUTH_BANISH_BIT, 0x4562); return true; }
  private leave(c: Conn) { const [s, pid] = this.who(c); this.remove(c, s, pid, pid, 0, 0x4570); return true; }
}
