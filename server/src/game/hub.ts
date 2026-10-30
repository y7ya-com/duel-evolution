// Sessions per account and presence in a block (py pvp_hub.py). See that file's docstring for the message formats.
import { createHash } from "node:crypto";
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import { accountId, legacyId } from "../util/cifrado.ts";
import type { Game } from "./game.ts";
import { canUseAccount } from "../auth/binding.ts";
import { modeAgrees } from "./freemode.ts";

export const PID_BASE = 1000;
export const SESSION_RELEASE_S = 120;    // py YO2_SESION_LIBERAR_S
export const DUEL_STATE = 0x67;
const LIST_SELF = true;
export const NPC_DUEL_STATE = true;
export const RIVAL_CARD = true;
const PRESENT_STATE = 1;
const LIST1_STATE = true;
const LIST2_DUEL_23 = true;
export const AREA_BLOCKS = true;
export const WORLD_AREAS: Record<number, number[]> = { 0: [0, 1, 2, 3, 9], 1: [4, 5, 6, 7] };
/** One world (gate.ts): every block lists both worlds' areas, Domino's first (the block index of an area). */
const ALL_AREAS = [...WORLD_AREAS[0], ...WORLD_AREAS[1]];
export const AUTH_BAD_LOGIN = -240;
export const AUTH_SERVER_FULL = -200;
export const AUTH_IN_USE = -242;
const LOGIN_EN_USO = true;
const LOGIN_EN_USO_VIVA_S = 90;
const REJECT_CLOSE_S = 1.5;

/** Block key: (canonical room port, language). */
export type BlockKey = string;
export const blockKey = (port: number, lang: number): BlockKey => `${port}|${lang}`;
export const keyPort = (k: BlockKey) => Number(k.split("|")[0]);
/** Players per block. Past it a room opens another block ("<key>#2", ...): moves and block chat go to everyone in a
 *  block, so one crowded block costs O(players²) (load test 2026-10-29: 100 in one block = ~3500 messages/s).
 *  Global chat, whispers, name search and friends stay server-wide. */
export const BLOCK_CAP = 48;
/** The room a block belongs to ("5740|0#2" -> "5740|0"). */
export const baseKey = (k: BlockKey) => k.split("#")[0];

export const acctKey = (data: Uint8Array) => createHash("sha256").update(data.subarray(0, 32)).digest("hex").slice(0, 16);

/** (canonical id, today's id) of a 0x3003 body. */
export function loginIds(data: Uint8Array): [string, string] {
  const legacy = legacyId(data);
  try { return [accountId(data), legacy]; } catch { return [legacy, legacy]; }
}

export class Session {
  slot: number | null = null;
  pid: number | null = null;
  name = "";
  lang = 0;
  conns = new Map<number, Conn>();
  lobby: Conn | null = null;
  block: BlockKey | null = null;
  pos: Uint8Array | null = null;
  parts: Uint8Array = new Uint8Array(16);
  partsW = new Map<number, Uint8Array>();
  world = 1;
  comments: Uint8Array[] = [new Uint8Array(32), new Uint8Array(32)];
  state = 0;
  stateExtra: Uint8Array = new Uint8Array(0);
  ablock = 0;
  gone: number | null = null;
  npcPose = false;
  /** Free-form fields other modules hang on the session (py sets attributes freely). */
  ext: Record<string, unknown> = {};
  constructor(readonly acct: string, readonly idx: number, readonly owner: boolean) {}
}

const pad = (b: Uint8Array | null | undefined, n: number) => { const o = new Uint8Array(n); o.set((b ?? new Uint8Array(0)).subarray(0, n)); return o; };
const name16 = (t: string) => new W().s([...String(t ?? "")].map((ch) => (ch.charCodeAt(0) > 255 ? "?" : ch)).join("").slice(0, 15), 16).bytes();
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const u16at = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];

export class Hub {
  sessions = new Map<string, Session>();
  blocks = new Map<BlockKey, Map<number, Session>>();
  private sweepT: ReturnType<typeof setTimeout> | null = null;

  constructor(private g: Game) {}

  private log(s: string) { this.g.log(s); }

  private post(s: Session, mid: number, data: Uint8Array, pause = 0.02) {
    const c = s.lobby;
    if (!c || c.closed) return;
    c.post(mid, data, pause);
  }

  // ---- sessions (V02)
  login(c: Conn, data: Uint8Array): Session | null {
    if (data.length < 32) { this.reject(c, AUTH_BAD_LOGIN, ""); return null; }
    // The 2008 blob (Blowfish + MD5 of the password) is never identity. On a channel bound to a DE user, the game account
    // is that user's own and the blob is ignored: a replayed or forged 0x3003 can't reach anyone else's account, and a
    // typo can't create one. Without a user (only the DEV parity bridge), py's legacy blob login.
    const peerUser = c.userId;
    if (peerUser === null && !this.g.cfg.dev) { this.reject(c, AUTH_BAD_LOGIN, ""); return null; }
    const [acct, known] = peerUser !== null ? [this.acctOfUser(peerUser), true] : this.accountOf(data);
    if (this.g.admin.vetoLogin(c, acct)) return null; // py moderacion: the ban hook, on the account this login reaches
    if (canUseAccount(peerUser, this.g.store.ownerOf(acct, this.g.cfg.ownerAcct)) === "refuse") { this.reject(c, AUTH_BAD_LOGIN, acct); return null; }
    if (!known && this.g.cfg.loginStrict) { this.reject(c, AUTH_BAD_LOGIN, acct); return null; }
    let code: number | null = null, busy: Conn | null = null;
    if (!this.sessions.has(acct) && this.sessions.size >= this.g.cfg.maxSessions) this.sweep();
    let s = this.sessions.get(acct) ?? null;
    if (s && LOGIN_EN_USO) busy = this.inUseBy(s, c);
    if (s && !busy && !modeAgrees(s, c, Hub.liveElsewhere(s, c))) { // free mode vs MMO (game/freemode.ts): one at a time
      this.log(`[free] 0x3003 of ${acct.slice(0, 6)}… (port ${c.port}): the session is live in the other mode`);
      busy = c;
    }
    if (busy) { s = null; code = AUTH_IN_USE; }
    else if (!s) {
      if (this.sessions.size >= this.g.cfg.maxSessions) {
        this.log(`[hub] limit of ${this.g.cfg.maxSessions} sessions: 0x3003 of ${acct.slice(0, 6)}… refused (−200)`);
        code = AUTH_SERVER_FULL;
      } else {
        const [idx, owner] = this.g.registerAccount(acct, peerUser);
        if (idx === null) code = this.g.cfg.loginStrict ? AUTH_BAD_LOGIN : AUTH_SERVER_FULL;
        else {
          s = new Session(acct, idx, owner);
          s.ext.free = !!c.ext.free;
          this.sessions.set(acct, s);
          this.log(`[hub] account ${acct}: index ${idx}${owner ? " (owner)" : ""}`);
        }
      }
    }
    if (s) { s.conns.set(c.port, c); s.gone = null; }
    if (!s) {
      if (busy) this.log(`[cuentas] 0x3003 of ${acct.slice(0, 6)}… (port ${c.port}): account in use (port ${busy.port}): 0x3004 ${AUTH_IN_USE}`);
      this.reject(c, code ?? AUTH_SERVER_FULL, acct);
      return null;
    }
    c.sess = s;
    c.ext.adminFlags = this.g.admin.flagsOf(acct);
    return s;
  }

  /** The game account of a DE user (created as `u:<id>` on its first login). */
  acctOfUser(userId: string): string { return this.g.store.accountOfUser(userId) ?? `u:${userId}`; }

  inUseBy(s: Session, c: Conn, now = Date.now() / 1000): Conn | null {
    const seen = new Set<Conn>();
    for (const o of [...s.conns.values(), s.lobby]) {
      if (!o || o === c || seen.has(o)) continue;
      seen.add(o);
      if (o.closed || o.bye || o.port === this.g.ports.gate) continue;
      if (c.port !== this.g.ports.game && o.port !== c.port) continue;
      if (o.rxT === null || now - o.rxT > LOGIN_EN_USO_VIVA_S) continue;
      return o;
    }
    return null;
  }

  /** A connection of s other than c that still holds its mode: open and not said goodbye (0x0003). The 2008 client
   *  leaves its account connection open after Return to Title, but says goodbye on it. */
  static liveElsewhere(s: Session, c: Conn): boolean {
    return [...s.conns.values(), s.lobby].some((o) => o && o !== c && !o.closed && !o.bye);
  }

  static live(s: Session): boolean {
    return [...s.conns.values(), s.lobby].some((c) => c && !c.closed);
  }

  sweep(now = Date.now() / 1000): number {
    const cand: Session[] = [], out: Session[] = [];
    let pending = 0;
    for (const s of this.sessions.values()) {
      if (Hub.live(s)) { s.gone = null; continue; }
      if (s.gone === null) s.gone = now;
      if (now - s.gone < SESSION_RELEASE_S) pending++; else cand.push(s);
    }
    for (const s of cand) {
      const busy = s.pid !== null && this.g.pvpByPid(s.pid);
      if (busy || this.sessions.get(s.acct) !== s || Hub.live(s)) { pending += busy ? 1 : 0; continue; }
      this.sessions.delete(s.acct);
      out.push(s);
    }
    for (const s of out) {
      if (s.block !== null) this.leave(s, "session released");
      this.log(`[hub] session of ${s.acct.slice(0, 6)}… released`);
    }
    return pending;
  }

  private scheduleSweep(delay?: number) {
    if (this.sweepT) return;
    this.sweepT = setTimeout(() => {
      this.sweepT = null;
      this.g.world.run(() => { if (this.sweep()) this.scheduleSweep(); });
    }, ((delay ?? SESSION_RELEASE_S + 1) * 1000));
  }

  accountOf(data: Uint8Array): [string, boolean] {
    const [canon, legacy] = loginIds(data);
    return this.g.store.resolveAccount(canon, legacy, this.g.cfg.ownerAcct);
  }

  reject(c: Conn, code: number, acct = "") {
    this.log(`[cuentas] 0x3003 refused (account ${acct.slice(0, 6)}…, port ${c.port}): 0x3004 ${code}, closing`);
    c.send(0x3004, new W().u32(code).u32(0).s("ESP", 4).bytes());
    void c.closeAfterFlush(); // py: c.closed = True after the send; the socket closes 1.5 s later
    setTimeout(() => this.g.world.close(c, "login refused"), REJECT_CLOSE_S * 1000);
  }

  pidFor(s: Session | null, slot: number | null): number {
    return PID_BASE + 4 * (s ? s.idx : 0) + ((slot ?? 0) & 3);
  }

  select(c: Conn, slot: number, lang: number, name: string): Session | null {
    const s = c.sess as Session | null;
    if (!s) return null;
    const old = s.lobby;
    if (old && old !== c) this.supersede(s, old);
    s.slot = slot & 3;
    s.pid = this.pidFor(s, s.slot);
    s.name = name || "Duelista";
    s.lang = lang;
    s.lobby = c;
    return s;
  }

  private supersede(s: Session, old: Conn) {
    try { this.g.lpOnClose?.(old); } catch (e) { this.log(`[hub] old lobby connection of ${s.acct}: ${e}`); }
    if (s.block !== null) this.leave(s, "new lobby connection");
  }

  byPid(pid: number): Session | null {
    for (const s of this.sessions.values()) if (s.pid === pid) return s;
    return null;
  }

  attach(c: Conn, pid: number): Session | null {
    const s = this.byPid(pid);
    if (s && !modeAgrees(s, c, true)) { this.log(`[free] duel connection for ${pid} in the other mode: refused`); return null; }
    if (s) { c.sess = s; s.conns.set(c.port, c); }
    return s;
  }

  // ---- presence (V04)
  others(s: Session | null): Session[] {
    if (!s || s.block === null) return [];
    return [...(this.blocks.get(s.block)?.values() ?? [])].filter((o) => o !== s);
  }

  list1Entry(o: Session): Uint8Array {
    const b = this.g.blockPlayer(o.pid!, o.name, o);
    const st = (o.state || 0) & 0xff;
    if (LIST1_STATE && st && b.length === 36) { const x = b.slice(); x[34] = st; return x; }
    return b;
  }

  /** The world (0 Domino, 1 Academy) of the area a player is in, whose look is shown (0x4170 registers one per world). */
  areaWorld(o: Session): number | null {
    const area = o.block !== null ? this.areaList(o.block)?.[o.ablock || 0] : undefined;
    return area === undefined ? null : WORLD_AREAS[1].includes(area) ? 1 : 0;
  }

  list2Body(o: Session, world?: number | null): Uint8Array {
    if (world === undefined) world = this.areaWorld(o);
    const parts = world !== null ? (o.partsW.get(world) ?? o.parts) : o.parts;
    let x = 0, y = 0, d = 0;
    if (o.pos && o.pos.length >= 9) { x = u16at(o.pos, 4); y = u16at(o.pos, 6); d = o.pos[8]; }
    let b = cat(Uint8Array.of((o.state || PRESENT_STATE) & 0xff), pad(parts, 16), new W().u16(x).u16(y).u8(d).bytes());
    if (o.state >= 0x67 && o.state <= 0x6a) b = cat(b, pad(o.stateExtra, LIST2_DUEL_23 ? 23 : 25));
    return b;
  }

  rivalCard(o: Session | null): [number, number, number, number] | null {
    if (!RIVAL_CARD || !o || o.pid === null) return null;
    try {
      const e = this.list1Entry(o);
      return [e[20], u16at(e, 21), u16at(e, 23), u16at(e, 25)];
    } catch (ex) { this.log(`[hub] rival data of ${o.acct}: ${ex}`); return null; }
  }

  list5Body(_o: Session): Uint8Array { return new Uint8Array(36); }

  joinMsg(o: Session): Uint8Array {
    return cat(new W().u32(o.pid!).u8(1).u8(this.ablockOf(o)).bytes(), this.list1Entry(o), this.list2Body(o), this.list5Body(o));
  }

  // ---- areas = blocks (AREA_BLOCKS)
  areaList(key: BlockKey | null): number[] | null {
    if (!AREA_BLOCKS || key === null) return null;
    return ALL_AREAS;
  }

  blocklist(key: BlockKey | null, kind: number): Uint8Array | null {
    const areas = this.areaList(key);
    if (!areas || !areas.length) return null;
    const w = new W().u16(Math.max(8, areas.length));   // the max: more entries than it is the exe's YG_BLOCK_MAX error
    // an area of the other world carries that world's main kind (Domino City 13, Duelist Academy 14)
    const acad = this.g.acadKinds.has(kind);
    areas.forEach((a, i) => w.u16(0).u8(a).u8((WORLD_AREAS[1].includes(a) === acad ? kind : acad ? 13 : 14) & 0xff).u8(i));
    return w.bytes();
  }

  areaBlock(s: Session | null, key: BlockKey | null, data: Uint8Array, area: number): number {
    const areas = this.areaList(key);
    if (!areas || !areas.length || !s) return 0;
    if (data.length >= 2 && data[1] !== 0) return data[0] < areas.length ? data[0] : s.ablock;
    const i = areas.indexOf(area);
    return i >= 0 ? i : 0;
  }

  ablockOf(s: Session | null): number { return AREA_BLOCKS && s ? (s.ablock || 0) & 0xff : 0; }

  /** Players in a room, all its blocks (the gate's server list). */
  roomCount(key: BlockKey): number {
    let n = 0;
    for (const [k, m] of this.blocks) if (baseKey(k) === key) n += m.size;
    return n;
  }

  /** The block of room `key` a player enters: the one it is in, else the open block with most of its friends (the
   *  character's friend list), else the first with room, else a new one. */
  private blockFor(s: Session, key: BlockKey): BlockKey {
    if (s.block !== null && baseKey(s.block) === key) return s.block;
    let friends = new Set<number>();
    try { friends = new Set(this.g.withCtx(s, () => (this.g.loadState().profiles?.[String(s.slot ?? 0)]?.friends ?? []) as number[])); }
    catch (e) { this.log(`[hub] friends of ${s.acct}: ${e}`); }
    let best: BlockKey | null = null, most = -1;
    for (const [k, m] of this.blocks) {
      if (baseKey(k) !== key || m.size >= BLOCK_CAP) continue;
      let f = 0;
      for (const pid of m.keys()) if (friends.has(pid)) f++;
      if (f > most) { best = k; most = f; }
    }
    if (best !== null) return best;
    for (let i = 1; ; i++) { const k = i === 1 ? key : `${key}#${i}`; if (!this.blocks.has(k)) return k; }
  }

  enter(s: Session | null, key: BlockKey | null, ablock: number | null = null): Session[] {
    if (s && ablock !== null && key === null) s.ablock = 0;
    if (!s || s.pid === null || key === null) return s ? [s] : [];
    key = this.blockFor(s, key);
    const moved = AREA_BLOCKS && ablock !== null && ablock !== s.ablock;
    if (ablock !== null) s.ablock = ablock;
    const fresh = !(s.block === key && this.blocks.get(key)?.get(s.pid) === s);
    if (fresh) {
      if (s.block !== null) this.leave(s, "changes block");
      s.block = key; s.pos = null; s.state = 0; s.stateExtra = new Uint8Array(0);
      if (!this.blocks.has(key)) this.blocks.set(key, new Map());
      this.blocks.get(key)!.set(s.pid, s);
    }
    const rest = this.others(s);
    if (fresh || moved) {
      const msg = this.joinMsg(s);
      for (const o of rest) this.post(o, 0x3112, msg);
      this.log(`[hub] ${s.acct} ${fresh ? "enters" : "changes area in"} block ${key}: ${rest.length} more`);
    }
    return [s, ...rest];
  }

  leave(s: Session | null, why = "") {
    const key = s?.block ?? null;
    if (!s || key === null) return;
    const members = this.blocks.get(key) ?? new Map();
    if (members.get(s.pid!) === s) members.delete(s.pid!);
    if (!members.size) this.blocks.delete(key);
    s.block = null;
    const rest = [...members.values()];
    for (const o of rest) this.post(o, 0x3112, new W().u32(s.pid!).u8(0).u8(0).bytes());
    this.log(`[hub] ${s.acct} leaves block ${key} (${why}): ${rest.length} left`);
  }

  onClose(c: Conn, why = "") {
    const s = c.sess as Session | null;
    if (!s) return;
    if (s.conns.get(c.port) === c && why !== "0x0003") s.conns.delete(c.port);
    const mine = s.lobby === c;
    const gone = why !== "0x0003" && !Hub.live(s);
    if (gone && s.gone === null) s.gone = Date.now() / 1000;
    if (mine) this.leave(s, why || "closed");
    if (gone) this.scheduleSweep();
  }

  setState(s: Session | null, state: number, rivalName = "", b = 0, u: [number, number, number] = [0, 0, 0]) {
    if (!s || s.pid === null) return;
    s.state = state & 0xff;
    s.stateExtra = s.state >= 0x67 && s.state <= 0x6a
      ? cat(name16(rivalName), new W().u8(b & 0xff).u16(u[0] & 0xffff).u16(u[1] & 0xffff).u16(u[2] & 0xffff).bytes())
      : new Uint8Array(0);
    const rest = this.others(s);
    const msg = this.stateMsg(s);
    for (const o of rest) this.post(o, 0x3112, msg);
  }

  stateMsg(s: Session, known = true): Uint8Array {
    if (known && s.state >= 0x67 && s.state <= 0x6a) return cat(new W().u32(s.pid!).u8(s.state).u8(this.ablockOf(s)).bytes(), s.stateExtra);
    return this.joinMsg(s);
  }

  viewOf(o: Session): string { return `${(o.state || 0) & 0xff}|${this.ablockOf(o)}|${Buffer.from(o.stateExtra).toString("hex")}`; }

  reconcile(s: Session, view: Map<number, string>): [number, Uint8Array][] {
    const out: [number, Uint8Array][] = [];
    const now = new Map(this.others(s).map((o) => [o.pid!, [o, this.viewOf(o)] as const]));
    for (const [pid, [o, v]] of now) {
      const old = view.get(pid);
      if (old === undefined) out.push([0x3112, this.stateMsg(o, false)]);
      else if (old !== v) out.push([0x3112, this.stateMsg(o)]);
    }
    for (const pid of view.keys()) if (!now.has(pid)) out.push([0x3112, new W().u32(pid).u8(0).u8(0).bytes()]);
    return out;
  }

  onLobbyMsg(c: Conn, msgId: number, data: Uint8Array) {
    const s = c.sess as Session | null;
    if (!s) return;
    const inblock = s.block !== null && s.lobby === c;
    if (msgId === 0x0003) { if (s.lobby === c) this.leave(s, "0x0003"); return; }
    if (msgId === 0x4170 && data.length >= 20) {
      s.world = new DataView(data.buffer, data.byteOffset).getUint32(0) & 0xff;
      s.parts = data.slice(4, 20);
      s.partsW.set(s.world, s.parts);
      if (inblock) for (const o of this.others(s)) this.post(o, 0x4181, cat(new W().u32(s.pid!).u32(s.world).bytes(), s.parts));
    } else if (msgId === 0x4172 && data.length >= 33) {
      const i = data[0] & 1;
      s.comments[i] = data.slice(1, 33);
      if (inblock) for (const o of this.others(s)) this.post(o, 0x4180, cat(new W().u32(s.pid!).u8(i).bytes(), s.comments[i]));
    } else if ((msgId === 0x5300 || msgId === 0x5310) && inblock && s.pid !== null) {
      let fwd: Uint8Array;
      if (msgId === 0x5300) {
        if (data.length !== 10) return;
        s.pos = cat(new W().u32(s.pid).bytes(), data.slice(4, 10));
        fwd = s.pos;
      } else {
        if (data.length < 6 || data.length > 64) return;
        fwd = cat(new W().u32(s.pid).bytes(), data.slice(4));
      }
      for (const o of this.others(s)) this.post(o, msgId, fwd);
    } else if ((msgId === 0x4202 || msgId === 0x4210 || (msgId === 0x5204 && s.npcPose)) && s.state >= 0x67 && s.state <= 0x6a) {
      s.npcPose = false;
      this.setState(s, 0);
    }
  }

  listChunks(c: Conn, req: number): Uint8Array[] {
    const s = c.sess as Session | null;
    const inb = !!s && s.lobby === c && s.block !== null;
    let rest = inb ? this.others(s) : [];
    if (inb && LIST_SELF) rest = [s!, ...rest];
    if (!rest.length) return [];
    let entries: Uint8Array[];
    // the client files LIST2 parts under ITS OWN world (FUN_006b8eb0), so the asker's
    if (req === 0x4214) { const w = this.areaWorld(s!); entries = rest.map((o) => cat(new W().u32(o.pid!).bytes(), this.list2Body(o, w))); }
    else if (req === 0x4218 || req === 0x421c) { const i = req === 0x4218 ? 0 : 1; entries = rest.map((o) => cat(new W().u32(o.pid!).bytes(), pad(o.comments[i], 32))); }
    else if (req === 0x4220 || req === 0x4221) entries = rest.map((o) => cat(new W().u32(o.pid!).bytes(), this.list5Body(o)));
    else return [];
    const out: Uint8Array[] = [];
    let cur: Uint8Array[] = [], n = 0;
    for (const e of entries) {
      if (n + e.length > 1024) { out.push(cat(...cur)); cur = []; n = 0; }
      cur.push(e); n += e.length;
    }
    if (cur.length) out.push(cat(...cur));
    return out;
  }

  avatarOf(pid: number): [string, number, number, number] | null {
    const s = this.byPid(pid);
    if (!s) return null;
    return s.pos ? [s.name, u16at(s.pos, 4), u16at(s.pos, 6), s.pos[8]] : [s.name, 400, 300, 0];
  }
}
