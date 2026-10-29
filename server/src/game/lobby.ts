// The lobby (5732) and room ports (5740-5750, 5800-5876): py yo2srv/lobby/lobby.py lobby_reply, the handlers of
// research/lobby/proposal.py (LP: rooms, PvP challenges, autoduel, watch, chat, friends, mail, teams, packs, trade),
// mundo/bloques.py (block lists) and mundo/avatar.py.
import type { Conn } from "../net/conn.ts";
import { cstr, W } from "../net/proto.ts";
import LD from "../../gamedata/lobby.json";
import { myName, myPid, mySlot } from "./accounts.ts";
import type { Game } from "./game.ts";
import { connBlockKey, roomOfPort } from "./gate.ts";
import { baseKey, keyPort, type BlockKey, type Session } from "./hub.ts";
import { npcEntry, npcListParts } from "./npcs.ts";
import * as PP from "./persist.ts";
import { ACAD_AREA, DOMINO_AREA, ROOM_KINDS } from "../config.ts";
import * as FREE from "./freemode.ts";

const u32 = (d: Uint8Array, at = 0) => (d.length >= at + 4 ? new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at) : 0);
const i32 = (d: Uint8Array, at = 0) => (d.length >= at + 4 ? new DataView(d.buffer, d.byteOffset, d.byteLength).getInt32(at) : 0);
const u16 = (d: Uint8Array, at = 0) => (d.length >= at + 2 ? (d[at] << 8) | d[at + 1] : 0);
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const pad = (b: Uint8Array | null | undefined, n: number) => { const o = new Uint8Array(n); o.set((b ?? new Uint8Array(0)).subarray(0, n)); return o; };
const hexb = (h: string) => new Uint8Array(Buffer.from(h, "hex"));
/** py proto.W().s with text.encode("latin1", "replace"). */
const S = (text: string, size: number) => new W().s([...String(text ?? "")].map((ch) => (ch.charCodeAt(0) > 255 ? "?" : ch)).join(""), size).bytes();
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export const FAKE_BASE = 100000;
const MAX_DATA = 1024;
const CHALLENGE_DELAY: number | null = null;   // py YO2_NPC_CHALLENGE off: no NPC challenges your room
const FRIEND_ACCEPT_DELAY = 1.5;
const NPC_ROOMS = 0;
const LIMIT_LIST = true, WATCH = true, ROOM_REOPEN = true, RESETAUTOWAIT = true, USB_AUTH_REFUSE = true;
const TPPRESENT = false, STARTUP_PRESENT = true, AUTODUEL = true, AUTODUEL_MATCH = true;
const AUTO_STATE = 0x66, R_AUTO = -602, AUTO_DUEL_STATE = 0x69, AUTODUEL_LV_DIFF = 5, AUTODUEL_MATCH_DELAY = 1.0;
const OFFER_TIMEOUT = 30;
const R_REJECTED = -618, R_NOANSWER = -616, R_GONE = -600, R_INDUEL = -608, R_NOROOM = -495, R_FULL = -492;
export const DEFAULT_PARTS = hexb("0000203040608090b820000000000000");
const ROOM_STATE = 100, DUEL_STATE = 0x67;
// ponytail: mail, friends and black list are one server-wide list each in the shared root state (py's single player),
// copied on every state load: bounded here so no player can grow them; per-account lists when they matter
/** admin sanction bits (0x3004, db/admin.ts): the client greys out chat and trade, the server holds them. */
export const SANCTION_CHAT = 0x20, SANCTION_TRADE = 0x40;
const MAIL_MAX = 1000, MAIL_PER_TO = 50, PID_LIST_MAX = 200;
const pushCapped = (l: number[], pid: number) => { l.push(pid); l.splice(0, Math.max(0, l.length - PID_LIST_MAX)); };
export const DEFAULT_COUNTRY = "ES";
const MYROOM_SELF_AVATAR = true;
const PIDNAME_PLAYERS = true;
const FRIEND_OK_KINDS = new Set([1, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 20]);
const MYROOM_WHERE = [0, 12, 0, 8, 0];
const STARTUP_PRESENT_BITS: Record<number, number> = { 0x30e: 30, 0x310: 40, 0x312: 50, 0x314: 60, 0x316: 10 };
const STARTUP_PRESENT_MAX = 80;
const EMPTY_LISTS = new Map<number, [number, number]>([[0x4214, [0x4215, 0x4217]], [0x4218, [0x4219, 0x421b]], [0x421c, [0x421d, 0x421f]],
  [0x4220, [0x4222, 0x4224]], [0x4221, [0x4222, 0x4224]], [0x4280, [0x4282, 0x4286]], [0x4610, [0x4611, 0x4613]]]);
const LIMITS = LD.limits as [number, number][];   // [passcode, copies] (the 2008 list)
const PLAYERINFO_SIZE = 137; // py: sum of PLAYERINFO_FMT

const TRADE: Record<number, [number, Uint8Array][]> = {
  0x7101: [[0x7133, new Uint8Array(0)]], 0x7102: [[0x7103, new W().u32(-493).bytes()]], 0x7105: [[0x7105, new W().u32(0).bytes()]],
  0x7108: [[0x7109, new Uint8Array(0)]], 0x7112: [[0x7112, new W().u32(0).bytes()]], 0x7113: [[0x7113, new W().u32(0).bytes()]],
  0x7114: [[0x7114, new W().u32(0).bytes()]], 0x7117: [[0x7117, Uint8Array.of(0)]], 0x7119: [[0x7120, Uint8Array.of(0)]],
  0x7122: [[0x7122, new Uint8Array(0)]],
};

interface Room { id: number; p1: number; p2: number; mstat: number; mstat0?: number; dstyle: number; wmode: number; pw: boolean;
  pwd?: Uint8Array; x: number[]; conn?: Conn; block?: BlockKey | null; npc?: number }
interface Challenge { room: number; from: Conn; to: Conn; a: Session; b: Session; done: boolean }
type Mail = { id: number; from: number; from_name: string; to: number; to_name: string; subject: string; body: string; t?: number; extra?: string; read?: boolean };

/** Where py's LP keeps its module state (MEM); mail, friends, black list and team persist in state.lobby. */
interface Mem { rooms: Map<number, Room>; next_room: number; offer: { room: number; npc: number } | null; mail: Mail[]; next_mail: number;
  friends: number[]; black: number[]; team: any; challenges: Map<number, Challenge>; friend_offers: Map<string, [Session, Conn]> }

export class Lobby {
  mem: Mem = { rooms: new Map(), next_room: 1000, offer: null, mail: [], next_mail: 1, friends: [], black: [], team: null,
    challenges: new Map(), friend_offers: new Map() };
  private loaded = false;
  private mailT = 0;
  readonly handlers: Map<number, (c: Conn, msgId: number, param: number, data: Uint8Array) => boolean>;

  constructor(private g: Game) {
    try { this.load(); } catch (e) { g.log(`[lobby] state.json['lobby'] not read: ${e}`); }
    const L = this;
    this.handlers = new Map<number, (c: Conn, m: number, p: number, d: Uint8Array) => boolean>([
      [0x0003, (c) => L.onClose(c)],
      [0x4280, (c) => L.hRoomlist(c)], [0x4288, (c, _m, _p, d) => L.hCreateroom(c, d)], [0x4290, (c) => L.hDeleteroom(c)],
      [0x4300, (c, _m, _p, d) => L.hReqmatch(c, d)], [0x4303, (c, _m, _p, d) => L.hOfferreply(c, d)], [0x4304, (c) => L.hCancelmatch(c)],
      [0x4320, (c, _m, _p, d) => L.hWatch(c, d)], [0x4400, (c, _m, _p, d) => L.hChatGm(c, d)], [0x4500, (c, _m, _p, d) => L.hGetpid(c, d)],
      [0x4510, (c, _m, _p, d) => L.hReqfriend(c, d)], [0x4513, (c, _m, _p, d) => L.hFriendofferreply(c, d)],
      [0x4530, (c, m, _p, d) => L.hBlack(c, m, d)], [0x4540, (c, m, _p, d) => L.hBlack(c, m, d)], [0x3603, (c, _m, _p, d) => L.hOnline(c, d)],
      [0x4600, (c, _m, _p, d) => L.hSendmail(c, d)], [0x4610, (c) => L.hRcvmail(c)], [0x4620, (c) => L.hMailcount(c)],
      [0x4550, (c, _m, _p, d) => L.hTeamcreate(c, d)], [0x4552, (c) => L.hTeamdisband(c)], [0x4558, (c) => L.hTeamlist(c)],
      [0x4569, (c) => L.hTeamleave(c)], [0x4901, (c) => L.hPacklist(c)], [0x4802, (c, _m, _p, d) => L.hSelectpack(c, d)],
      [0x4910, (c) => L.hGiftcards(c)], [0x4915, (c) => L.hGiftcards(c)], [0x7000, (c, _m, _p, d) => L.hTrade(c, d)],
      [0x4150, (c, _m, _p, d) => L.hPlayerinfo(c, d)], [0x42a0, (c) => L.hResetautowait(c)], [0x8203, (c) => L.hUsbAuth(c)],
      [0x8301, (c) => L.hTppresentinfo(c)], [0x8401, (c, _m, _p, d) => L.hStartupPresent(c, d)],
    ]);
  }

  // ---- utilities
  private log(s: string) { this.g.log(s); }
  private load() {
    const lob = this.g.withCtx(null, () => this.g.loadState()).lobby ?? {};
    for (const k of ["mail", "next_mail", "friends", "black", "team"] as const) if (k in lob) (this.mem as any)[k] = lob[k];
    this.loaded = true;
  }
  private save() {
    if (!this.loaded) { this.log("[lobby] state.json['lobby'] was never read: not saved over"); return; }
    const st = this.g.loadState();
    const lob = (st.lobby ??= {});
    for (const k of ["mail", "next_mail", "friends", "black", "team"] as const) lob[k] = (this.mem as any)[k];
    this.g.saveState(st);
  }
  private slot(): number { return mySlot(this.g); }
  private pid(): number { return myPid(this.g); }
  private me(): string { return myName(this.g); }
  alive(c: Conn): boolean { return !(c.ext.lpClosed || c.closed) && !c.stale(); }
  private npcs() { return this.g.npcs; }
  npcByPid(pid: number): [number, string] | null {
    const nid = pid > FAKE_BASE ? pid - FAKE_BASE : pid >= 1 && pid <= 98 ? pid : null;
    if (nid !== null && nid === pid && pid === this.pid()) return null;
    for (const n of this.npcs()) if (n[0] === nid) return [n[0], n[1]];
    return null;
  }
  private nameOf(pid: number) {
    if (pid === this.pid()) return this.me();
    const n = this.npcByPid(pid);
    return n ? n[1] : `Jugador ${pid}`;
  }
  private later(delay: number | null, fn: () => void) {
    if (delay === null) return;
    if (delay <= 0) return fn();
    const sess = this.g.ctx;
    setTimeout(() => this.g.world.run(() => {
      this.g.ctx = sess;
      try { fn(); } catch (e) { this.log(`[lobby] timer error: ${e}`); }
    }), delay * 1000);
  }
  private chunks(entries: Uint8Array[], size: number, start = 0): Uint8Array[] {
    const per = Math.max(1, Math.floor((MAX_DATA - start) / size));
    const out: Uint8Array[] = [];
    for (let i = 0; i < entries.length; i += per) out.push(cat(...entries.slice(i, i + per)));
    return out;
  }
  private sess(c: Conn | null | undefined): Session | null { return (c?.sess as Session | null) ?? null; }

  // ---- duel rooms
  roomEntry(r: Room): Uint8Array {
    return new W().u32(r.id).u32(r.p1).u32(r.p2).u8(r.mstat).u8(r.dstyle).u8(r.wmode).u8(r.pw ? 1 : 0).u8(r.x[0]).u8(r.x[1]).u8(r.x[2]).bytes();
  }
  private npcRooms(): Room[] {
    return this.npcs().filter((n) => n[0] >= 51 && n[0] <= 94).slice(0, NPC_ROOMS)
      .map((n, i) => ({ id: 1 + i, p1: FAKE_BASE + n[0], p2: 0, mstat: 0, dstyle: 3, wmode: 0, pw: false, x: [1, 1, 1], npc: n[0] }));
  }
  private allRooms(): Room[] { return [...this.npcRooms(), ...this.mem.rooms.values()]; }

  hRoomlist(c: Conn): boolean {
    const free = FREE.isFree(this.sess(c));   // free mode and the MMO never see each other's rooms (freemode.ts)
    const rooms = c.port === this.g.ports.lobby ? [] : this.allRooms().filter((r) => FREE.isFree(r.conn ? this.sess(r.conn) : null) === free);
    c.send(0x4282, new W().u32(rooms.length).bytes());
    for (const ch of this.chunks(rooms.map((r) => this.roomEntry(r)), 19)) c.send(0x4284, ch);
    c.send(0x4286);
    return true;
  }

  static isNpcRival(rival: number) { return rival >= 1 && rival <= 98; }

  hCreateroom(c: Conn, data: Uint8Array): boolean {
    const rival = data.length >= 28 ? u32(data, 24) : 0;
    if (Lobby.isNpcRival(rival)) return false;
    const me = this.pid();
    const s = this.sess(c);
    const rid = this.mem.next_room++;
    const r: Room = { id: rid, p1: me, p2: 0, mstat: data.length > 2 ? data[2] : 0, mstat0: data.length > 2 ? data[2] : 0,
      dstyle: data.length ? data[0] : 3, wmode: data.length > 1 ? data[1] : 0, pw: data.length > 3 ? !!data[3] : false,
      pwd: pad(data.subarray(4, 20), 16), x: data.length >= 24 ? [...data.subarray(21, 24)] : [1, 1, 1], conn: c, block: s?.block ?? null };
    const old = [...this.mem.rooms.values()].filter((v) => v.p1 === me);
    for (const [k, v] of [...this.mem.rooms]) if (v.p1 === me) this.mem.rooms.delete(k);
    this.mem.rooms.set(rid, r);
    c.send(0x428a, new W().u32(0).bytes());
    c.send(0x3113, this.roomEntry(r));
    for (const v of old) this.blockPost(v.block ?? null, 0x3113, this.roomEntry({ ...v, p1: 0, p2: 0 }), s);
    this.blockPost(r.block ?? null, 0x3113, this.roomEntry(r), s);
    if (this.isAuto(r)) {
      this.roomState(s, AUTO_STATE);
      if (AUTODUEL_MATCH) this.later(AUTODUEL_MATCH_DELAY, () => this.autoTryMatch(c));
    } else this.roomState(s, ROOM_STATE);
    this.later(CHALLENGE_DELAY, () => this.npcChallenge(c, rid));
    return true;
  }

  private npcChallenge(c: Conn, rid: number) {
    const r = this.mem.rooms.get(rid);
    if (!r || r.p2 || !this.alive(c)) return;
    if (this.mem.challenges.get(rid) || this.blockHasOthers(c)) return;
    const famous = this.npcs().filter((n) => n[0] >= 51 && n[0] <= 94);
    const n = this.g.rng.choice(famous.length ? famous : this.npcs());
    this.mem.offer = { room: rid, npc: n[0] };
    const parts = n[3].some((b) => b) ? n[3] : DEFAULT_PARTS;
    c.send(0x4302, cat(new W().u32(FAKE_BASE + n[0]).bytes(), S(n[1], 16), new W().u8(0).u8(0).u16(0).u16(0).bytes(), pad(parts, 16)));
  }

  private duelNotice(c: Conn, npcId: number) {
    this.g.duelBegin(c, npcId, 0);
    c.send(0x4306, new W().s(this.g.cfg.publicIp, 15).u16(this.g.ports.duel + this.g.cfg.portOffset).bytes());
  }

  hOfferreply(c: Conn, data: Uint8Array): boolean {
    const ok = data.length >= 4 ? i32(data) : 0;
    const ch = this.challengeTo(c);
    if (ch) return this.challengeReply(c, ch, ok);
    const off = this.mem.offer; this.mem.offer = null;
    const r = off ? this.mem.rooms.get(off.room) : undefined;
    if (!off || !r) return true;
    if (ok) { r.p2 = FAKE_BASE + off.npc; r.mstat = 1; c.send(0x3113, this.roomEntry(r)); this.duelNotice(c, off.npc); }
    else this.later(CHALLENGE_DELAY, () => this.npcChallenge(c, r.id));
    return true;
  }

  hDeleteroom(c: Conn): boolean {
    const me = this.pid();
    const gone: Room[] = [];
    for (const [k, v] of [...this.mem.rooms]) if (v.p1 === me) { gone.push(v); this.mem.rooms.delete(k); }
    if (gone.length) this.roomState(this.sess(c), 0);
    this.mem.offer = null;
    const chs = gone.map((r) => { const ch = this.mem.challenges.get(r.id) ?? null; this.mem.challenges.delete(r.id); return ch; });
    c.send(0x4292, new W().u32(0).bytes());
    for (const r of gone) {
      c.send(0x3113, this.roomEntry({ ...r, p1: 0, p2: 0 }));
      this.blockPost(r.block ?? null, 0x3113, this.roomEntry({ ...r, p1: 0, p2: 0 }), this.sess(c));
    }
    for (const ch of chs) if (ch) { ch.done = true; this.post(ch.from, 0x4301, new W().u32(R_GONE).bytes()); }
    return true;
  }

  hReqmatch(c: Conn, data: Uint8Array): boolean {
    const rid = data.length >= 4 ? u32(data) : 0;
    const room = this.allRooms().find((r) => r.id === rid);
    if (room && this.humanRoom(room)) return this.challenge(c, room, data.subarray(4, 20));
    if (!room || !room.npc) { c.send(0x4301, new W().u32(1).bytes()); return true; }
    c.send(0x4301, new W().u32(0).bytes());
    this.duelNotice(c, room.npc);
    return true;
  }

  hCancelmatch(c: Conn): boolean {
    const ch = this.challengeFrom(c);
    if (ch) { this.mem.challenges.delete(ch.room); ch.done = true; this.post(ch.to, 0x4305, new Uint8Array(0)); }
    c.send(0x4309, new W().u32(0).bytes());
    return true;
  }

  // ---- PvP challenges

  roomState(s: Session | null, state: number, rival = "", rivalSess: Session | null = null) {
    const hub = this.g.hub;
    if (!s || s.pid === null) return;
    if (state === 0 && ![ROOM_STATE, 0x65, AUTO_STATE].includes(s.state || 0)) return;
    try {
      const card = rivalSess ? hub.rivalCard(rivalSess) : null;
      if (card) hub.setState(s, state, rival, card[0], [card[1], card[2], card[3]]);
      else hub.setState(s, state, rival);
    } catch (e) { this.log(`[lobby] state ${state}: ${e}`); }
  }

  blockPost(key: BlockKey | null, mid: number, data: Uint8Array, skip: Session | null = null) {
    if (key === null) return;
    for (const o of [...(this.g.hub.blocks.get(key)?.values() ?? [])]) if (o !== skip) { const lc = o.lobby; if (lc && !lc.closed) lc.post(mid, data); }
  }
  private blockHasOthers(c: Conn) { const s = this.sess(c); return !!s && this.g.hub.others(s).length > 0; }
  post(c: Conn | null | undefined, mid: number, data: Uint8Array): boolean {
    if (!c || !this.alive(c)) return false;
    c.post(mid, data);
    return true;
  }
  private humanRoom(r: Room) { return !r.npc && !!r.conn && this.sess(r.conn)?.pid != null; }
  private challengeTo(c: Conn) { const s = this.sess(c); return [...this.mem.challenges.values()].find((ch) => ch.to === c || (s && ch.b === s)) ?? null; }
  private challengeFrom(c: Conn) { const s = this.sess(c); return [...this.mem.challenges.values()].find((ch) => ch.from === c || (s && ch.a === s)) ?? null; }

  private challenge(c: Conn, room: Room, pw: Uint8Array): boolean {
    const fail = (code: number, why: string) => { this.log(`[lobby] challenge to room ${room.id} refused: ${why} (${code})`); c.send(0x4301, new W().u32(code).bytes()); return true; };
    const a = this.sess(c), owner = room.conn!;
    const b = this.sess(owner);
    if (!a || a.pid === null || !b || b === a) return fail(R_NOROOM, "no session or own room");
    if (FREE.isFree(a) !== FREE.isFree(b)) return fail(R_NOROOM, "free mode and the MMO don't duel each other");
    if (!this.alive(owner) || this.mem.rooms.get(room.id) !== room) return fail(R_NOROOM, "the room is gone");
    const pvp = this.g.pvp;
    if (pvp && (pvp.byPid(b.pid!) || pvp.byPid(a.pid))) return fail(R_INDUEL, "already in a duel");
    if (this.isAuto(room)) return fail(R_AUTO, "the owner looks for an autoduel");
    if (room.pw && !sameBytes(pad(pw, 16), room.pwd ?? new Uint8Array(16))) return fail(R_NOROOM, "password");
    const off = this.mem.offer;
    if (room.p2 || this.mem.challenges.has(room.id) || (off && off.room === room.id)) return fail(R_FULL, "room busy");
    const ch: Challenge = { room: room.id, from: c, to: owner, a, b, done: false };
    this.mem.challenges.set(room.id, ch);
    const parts = a.parts.subarray(0, 16).some((x) => x) ? a.parts.subarray(0, 16) : DEFAULT_PARTS;
    this.log(`[lobby] PvP challenge: ${a.acct} -> ${b.acct} (room ${room.id})`);
    let lv = 0, title = 0;
    try { const e = this.g.blockPlayer(a.pid, a.name, a); lv = e[20]; title = u16(e, 25); } catch (ex) { this.log(`[lobby] challenger LV/title: ${ex}`); }
    this.post(owner, 0x4302, cat(new W().u32(a.pid).bytes(), S(a.name || "Duelista", 16), new W().u8(0).u8(lv).u16(title).u16(0).bytes(), pad(parts, 16)));
    this.later(OFFER_TIMEOUT, () => this.challengeTimeout(ch));
    return true;
  }

  private challengeTimeout(ch: Challenge) {
    if (ch.done) return;
    ch.done = true;
    this.mem.challenges.delete(ch.room);
    this.post(ch.to, 0x4308, new Uint8Array(0));
    this.post(ch.from, 0x4301, new W().u32(R_NOANSWER).bytes());
  }

  private challengeReply(c: Conn, ch: Challenge, ok: number): boolean {
    if (ch.done) return true;
    ch.done = true;
    this.mem.challenges.delete(ch.room);
    const r = this.mem.rooms.get(ch.room);
    const aConn = ch.from;
    if (!ok) { this.post(aConn, 0x4301, new W().u32(R_REJECTED).bytes()); return true; }
    if (!r || !this.alive(aConn)) {
      c.send(0x4305);
      if (!r) this.post(aConn, 0x4301, new W().u32(R_GONE).bytes());
      return true;
    }
    const { a, b } = ch;
    const pvp = this.g.pvp;
    if (!pvp) { this.post(aConn, 0x4301, new W().u32(R_NOROOM).bytes()); return true; }
    pvp.reserve(a, b);
    this.roomState(a, DUEL_STATE, b.name, b);
    this.roomState(b, DUEL_STATE, a.name, a);
    r.p2 = a.pid!; r.mstat = 1;
    this.post(aConn, 0x4301, new W().u32(0).bytes());
    c.send(0x3113, this.roomEntry(r));
    this.blockPost(r.block ?? null, 0x3113, this.roomEntry(r), b);
    const port = this.g.ports.duel + this.g.cfg.portOffset, ip = this.g.cfg.publicIp;
    this.post(aConn, 0x4306, new W().s(ip, 15).u16(port).bytes());
    c.send(0x4306, new W().s(ip, 15).u16(port).bytes());
    return true;
  }

  // ---- autoduel
  isAuto(r: Room | undefined | null) { return !!(AUTODUEL && r && !r.npc && (r.mstat0 ?? r.mstat ?? 0) === 1); }
  private autoCard(s: Session): [number, number] { try { const e = this.g.hub.list1Entry(s); return [e[20], u16(e, 25)]; } catch { return [0, 0]; } }
  private autoStyle(ra: Room, rb: Room): number | null {
    const x = ra.dstyle ?? 3, y = rb.dstyle ?? 3;
    let st: number | null = x === y ? x : x === 6 ? y : y === 6 ? x : null;
    if (st === 6) st = 3;
    return st === 3 ? st : null;
  }

  autoTryMatch(c: Conn): boolean | null {
    if (!(AUTODUEL && AUTODUEL_MATCH)) return null;
    const pvp = this.g.pvp, s = this.sess(c);
    if (!pvp || !s || s.pid === null || !this.alive(c) || pvp.byPid(s.pid)) return null;
    const mine = [...this.mem.rooms.values()].find((r) => r.conn === c && this.isAuto(r) && !r.p2);
    if (!mine) return null;
    const cands = [...this.mem.rooms.values()].sort((a, b) => a.id - b.id).filter((r) => r !== mine && this.isAuto(r) && !r.p2 &&
      r.block === mine.block && this.humanRoom(r) && this.alive(r.conn!) && this.sess(r.conn) !== s && !this.mem.challenges.has(r.id) && this.autoStyle(mine, r) !== null);
    let pick: [Room, Session] | null = null;
    for (const r of cands) {
      const o = this.sess(r.conn)!;
      if (pvp.byPid(o.pid!)) continue;
      if ((mine.x[2] || r.x[2]) && Math.abs(this.autoCard(s)[0] - this.autoCard(o)[0]) > AUTODUEL_LV_DIFF) continue;
      pick = [r, o]; break;
    }
    if (!pick) return null;
    const [r, o] = pick;
    if (mine.p2 || r.p2 || this.mem.rooms.get(mine.id) !== mine || this.mem.rooms.get(r.id) !== r) return null;
    mine.p2 = o.pid!; r.p2 = s.pid;
    return this.autoPair(r.conn!, o, r, c, s, mine);
  }

  private autoPair(ca: Conn, a: Session, ra: Room, cb: Conn, b: Session, rb: Room): boolean {
    this.g.pvp!.reserve(a, b);
    this.roomState(a, AUTO_DUEL_STATE, b.name, b);
    this.roomState(b, AUTO_DUEL_STATE, a.name, a);
    for (const [r, cc, me] of [[ra, ca, a], [rb, cb, b]] as [Room, Conn, Session][]) {
      this.post(cc, 0x3113, this.roomEntry(r));
      this.blockPost(r.block ?? null, 0x3113, this.roomEntry(r), me);
    }
    const port = this.g.ports.duel + this.g.cfg.portOffset, ip = this.g.cfg.publicIp;
    for (const [cc, ot] of [[ca, b], [cb, a]] as [Conn, Session][]) {
      const [lv, title] = this.autoCard(ot);
      const parts = ot.parts.subarray(0, 16).some((x) => x) ? ot.parts.subarray(0, 16) : DEFAULT_PARTS;
      this.post(cc, 0x43a0, cat(new W().u32(ot.pid!).bytes(), S(ot.name || "Duelista", 16), new W().u8(lv).u16(title).u16(0).bytes(), pad(parts, 16), Uint8Array.of(0)));
      this.post(cc, 0x4306, new W().s(ip, 15).u16(port).bytes());
    }
    return true;
  }

  hWatch(c: Conn, data: Uint8Array): boolean {
    const pid = data.length >= 4 ? u32(data) : 0;
    const pvp = this.g.pvp, nw = this.g.nw;
    const ok = () => c.send(0x4321, new W().u32(0).s(this.g.cfg.publicIp, 15).u16(this.g.ports.duel + this.g.cfg.portOffset).bytes());
    if (WATCH && pvp && pvp.watchRequest(c.peer, pid, this.sess(c))) { nw?.forget(c.peer); ok(); return true; }
    if (WATCH && nw && nw.watchRequest(c.peer, pid)) { ok(); return true; }
    c.send(0x4321, new W().u32(1).s("", 15).u16(0).bytes());
    return true;
  }

  // ---- after the duel (ROOM_REOPEN)
  private roomReopen(c: Conn) {
    const s = this.sess(c);
    const me = s?.pid || this.pid();
    if (this.g.pvp?.byPid(me)) return;
    const rs = [...this.mem.rooms.values()].filter((r) => r.p1 === me && r.p2);
    const npc = rs.filter((r) => r.p2 >= FAKE_BASE);
    for (const r of rs) { r.p2 = 0; r.mstat = r.mstat0 ?? 0; }
    for (const r of rs) { c.send(0x3113, this.roomEntry(r)); this.blockPost(r.block ?? null, 0x3113, this.roomEntry(r), s); }
    if (rs.length) {
      const auto = AUTODUEL && rs.some((r) => this.isAuto(r));
      this.roomState(s, auto ? AUTO_STATE : ROOM_STATE);
      if (auto && AUTODUEL_MATCH) this.later(AUTODUEL_MATCH_DELAY, () => this.autoTryMatch(c));
    }
    for (const r of npc) this.later(CHALLENGE_DELAY, () => this.npcChallenge(c, r.id));
  }

  // ---- banned/limited list (LIMIT_LIST)
  limitationMsgs(): [number, Uint8Array][] {
    // the card's passcode in the card field, 0 in the Konami one: the client's codec fills both of its own
    const ent = LIMITS.map(([card, n], i) => new W().u32(i).u32(card).u32(0).u8(n).bytes());
    return this.chunks(ent, 13).map((ch) => [0x5600, ch]);
  }

  // ---- chat
  /** research/mundo wraps chat: a non-GM account loses its "@n" colour codes. */
  private hChatGm(c: Conn, data: Uint8Array): boolean {
    if (data.length > 14 && !this.g.isGm(this.sess(c)?.acct ?? null)) {
      const clean = stripColorCodes(data.subarray(14));
      if (!sameBytes(clean, data.subarray(14))) data = cat(data.subarray(0, 14), clean);
    }
    return this.hChat(c, data);
  }

  private hChat(c: Conn, data: Uint8Array): boolean {
    if (data.length < 14) return true;
    const kind = data[1], target = u32(data, 6);
    let text = data.subarray(14);
    const z = text.indexOf(0);
    text = text.subarray(0, z < 0 ? text.length : z).subarray(0, MAX_DATA - 27);
    const head = cat(new W().u8(0).u8(kind).u32(this.pid()).u32(2).bytes(), S(this.me(), 16));
    const msg = cat(head, text, Uint8Array.of(0));
    c.send(0x4402, msg);
    const s = this.sess(c), hub = this.g.hub;
    if (s && this.g.admin.flagsOf(s.acct) & SANCTION_CHAT) { this.log(`[AVISO] [admin] ${s.acct.slice(0, 6)}…: chat sanctioned, not sent`); return true; }
    if (s && s.pid !== null) {
      const tell = (o: Session) => { const lc = o.lobby; if (lc && !lc.closed) lc.post(0x4402, msg); };
      if (kind === 0 && s.block !== null) for (const o of hub.others(s)) tell(o);
      else if (kind === 1 || kind === 2) for (const o of [...hub.sessions.values()].filter((o) => o !== s)) tell(o);
      else if (kind === 3) { const o = hub.byPid(target); if (o && o !== s) tell(o); }
      else if (kind === 5 && this.g.eq) for (const o of this.g.eq.teamChatTargets(s)) tell(o);
    }
    const n = kind === 3 ? this.npcByPid(target) : null;
    if (n) c.send(0x4402, cat(new W().u8(0).u8(3).u32(FAKE_BASE + n[0]).u32(0).bytes(), S(n[1], 16), new W().s("Nos vemos en la sala de duelo.", 30).bytes(), Uint8Array.of(0)));
    return true;
  }

  // ---- friends, black list, search
  private hGetpid(c: Conn, data: Uint8Array): boolean {
    const name = cstr(data.subarray(0, 16)).trim().toLowerCase();
    let pid = 0;
    if (name && name === this.me().toLowerCase()) pid = this.pid();
    for (const n of this.npcs()) if (n[1].toLowerCase() === name) pid = FAKE_BASE + n[0];
    if (!pid && name && PIDNAME_PLAYERS) pid = this.pidOfPlayerName(name);
    c.send(0x4501, pid ? new W().u32(0).u32(pid).bytes() : new W().u32(1).u32(0).bytes());
    return true;
  }

  private pidOfPlayerName(name0: string): number {
    const name = String(name0 || "").trim().toLowerCase();
    for (const o of this.g.hub.sessions.values()) if (o.pid !== null && String(o.name || "").trim().toLowerCase() === name) return o.pid;
    let st: any;
    try { st = this.g.loadState(); } catch (e) { this.log(`[lobby] 0x4500 state: ${e}`); return 0; }
    if (!st) return 0;
    const accts: [number, any][] = [[0, st], ...Object.values(st.accounts ?? {}).filter((a) => a && typeof a === "object").map((a: any) => [PP.int((a.idx ?? 0) || 0), a] as [number, any])];
    for (const [idx, a] of accts) {
      const names = new Map<string, string>();
      for (const [k, v] of Object.entries(a.players ?? {})) names.set(String(k), v as string);
      for (const [k, v] of Object.entries(a.profiles ?? {})) if (v && typeof v === "object" && (v as any).name) names.set(String(k), (v as any).name);
      for (const [slot, n] of names) if (String(n || "").trim().toLowerCase() === name && /^\d+$/.test(slot)) return 1000 + 4 * idx + (Number(slot) & 3);
    }
    return 0;
  }

  private lvOf(s: Session): number { try { return this.g.blockPlayer(s.pid!, s.name, s)[20]; } catch { return 0; } }

  private hReqfriend(c: Conn, data: Uint8Array): boolean {
    const pid = data.length >= 4 ? u32(data) : 0;
    const n = this.npcByPid(pid);
    const hub = this.g.hub, me = this.sess(c);
    const o = !n ? hub.byPid(pid) : null;
    if (o && me && o !== me && me.pid !== null) {
      this.mem.friend_offers.set(`${me.pid}|${o.pid}`, [me, c]);
      c.send(0x4511, new W().u32(0).bytes());
      const lc = o.lobby;
      if (lc && !lc.closed) lc.post(0x4512, cat(new W().u32(me.pid).bytes(), S(me.name || "Duelista", 16), new W().u8(this.lvOf(me)).bytes()));
      return true;
    }
    c.send(0x4511, new W().u32(n || pid === this.pid() ? 0 : 1).bytes());
    if (n) this.later(FRIEND_ACCEPT_DELAY, () => {
      if (!this.mem.friends.includes(pid)) { this.mem.friends.push(pid); this.save(); }
      if (this.alive(c)) c.send(0x4515, cat(new W().u32(1).u32(pid).bytes(), S(n[1], 16)));
    });
    return true;
  }

  private hFriendofferreply(c: Conn, data: Uint8Array): boolean {
    const [pid, ok] = data.length >= 8 ? [u32(data), i32(data, 4)] : [0, 0];
    const me = this.sess(c);
    const key = `${pid}|${me?.pid ?? null}`;
    const off = this.mem.friend_offers.get(key);
    this.mem.friend_offers.delete(key);
    if (off) {
      const [asker] = off;
      const lc = asker.lobby;
      if (lc && !lc.closed) lc.post(0x4515, cat(new W().u32(ok === 1 ? 1 : 0).u32(me!.pid!).bytes(), S(me!.name || "Duelista", 16)));
      if (ok === 1) { this.friendAdd(me!, asker.pid!); this.friendAdd(asker, me!.pid!); }
      return true;
    }
    if (ok && pid && !this.mem.friends.includes(pid)) { pushCapped(this.mem.friends, pid); this.save(); }
    return true;
  }

  private friendAdd(s: Session, pid: number) {
    try {
      this.g.withCtx(s, () => {
        const st = this.g.loadState();
        const slot = s.slot !== null ? s.slot : mySlot(this.g, st);
        const p = PP.profile(st, slot)!;
        const fl: number[] = (p.friends ??= []);
        if (!fl.includes(pid)) { fl.push(pid); this.g.saveState(st); }
      });
    } catch (e) { this.log(`[lobby] friend ${pid}: ${e}`); }
  }

  private hBlack(c: Conn, msgId: number, data: Uint8Array): boolean {
    const pid = data.length >= 4 ? u32(data) : 0;
    if (msgId === 0x4530 && !this.mem.black.includes(pid)) pushCapped(this.mem.black, pid);
    if (msgId === 0x4540 && this.mem.black.includes(pid)) this.mem.black.splice(this.mem.black.indexOf(pid), 1);
    this.save();
    c.send(msgId + 1, new W().u32(0).bytes());
    return true;
  }

  private roomWhere(port: number | null, lang: number, s: Session | null = null): number[] | null {
    const base = this.g.ports.roomBase;
    if (port === null || !(port >= base && port < base + ROOM_KINDS.length)) return null;
    const kind = ROOM_KINDS[port - base];
    let area = this.g.acadKinds.has(kind) ? ACAD_AREA : DOMINO_AREA;
    if (s && s.block) {
      const areas = this.g.hub.areaList(s.block);
      const ab = s.ablock || 0;
      if (areas && ab >= 0 && ab < areas.length) area = areas[ab];
    }
    lang = PP.int(lang || 0);
    return [lang >= 0 && lang <= 7 ? lang : 0, kind, 0, area, 0];
  }
  private connWhere(port: number | null, lang: number, s: Session | null = null) {
    const r = port === null ? null : roomOfPort(this.g, port);
    if (r) { const [rl, i] = r; port = this.g.ports.roomBase + i; lang = rl === null ? lang : rl; }
    return this.roomWhere(port, lang, s);
  }
  private friendWhere(s: Session | null): number[] | null {
    const lobby = s?.lobby ?? null;
    if (!s || s.pid === null || !lobby || lobby.closed) return null;
    if (s.block) { const [p, l] = baseKey(s.block).split("|").map(Number); return this.roomWhere(p, l, s); }
    if (lobby.port === this.g.ports.lobby) return MYROOM_WHERE;
    return this.connWhere(lobby.port, (lobby.ext.lang as number) ?? s.lang ?? 0, s);
  }
  private npcWhere(c: Conn): number[] {
    let w = this.connWhere(c.port, (c.ext.lang as number) ?? 0);
    if (!w) { const lang = PP.int((c.ext.lang as number) || 0); w = [lang >= 0 && lang <= 7 ? lang : 0, 13, 0, DOMINO_AREA, 0]; }
    return w;
  }

  private hOnline(c: Conn, data: Uint8Array): boolean {
    const n = data.length >= 4 ? u32(data) : 0;
    const pids = Array.from({ length: Math.min(n, Math.floor((data.length - 4) / 4)) }, (_, i) => u32(data, 4 + 4 * i));
    const on: [number, number[]][] = [];
    for (const p of pids) {
      const s = this.g.hub.byPid(p);
      const where = s ? this.friendWhere(s) : this.npcByPid(p) ? this.npcWhere(c) : null;
      if (!where || !FRIEND_OK_KINDS.has(where[1]) || !(where[2] >= 0 && where[2] <= 7)) continue;
      on.push([p, where]);
    }
    const w = new W().u32(0).u32(on.length);
    for (const [p, where] of on) { w.u32(p); for (const b of where) w.u8(b & 0xff); }
    c.send(0x3604, w.bytes());
    return true;
  }

  // ---- mail
  private mailTime(): number { this.mailT = Math.max(Math.floor(this.g.clock.time()), this.mailT + 1); return this.mailT; }
  private mailEntry(m: Mail): Uint8Array {
    if (!m.t) m.t = this.mailTime();
    return cat(new W().u32(m.from).bytes(), S(m.from_name, 16), new W().u32(m.to).bytes(), S(m.to_name, 16), new W().u32(m.t).bytes(),
      S(m.subject, 32), S(m.body, 512), S(m.extra ?? "", 64), new W().u8(m.read ? 1 : 0).bytes());
  }
  private hSendmail(c: Conn, data: Uint8Array): boolean {
    const to = data.length >= 4 ? u32(data) : 0;
    const subject = cstr(data.subarray(4, 36)), body = cstr(data.subarray(36, 548));
    const me = this.pid(), myN = this.me(), toName = this.nameOf(to), n = this.npcByPid(to);
    this.mem.mail.push({ id: this.mem.next_mail, from: me, from_name: myN, to, to_name: toName, subject, body, t: this.mailTime() });
    this.mem.next_mail++;
    if (n) {
      this.mem.mail.push({ id: this.mem.next_mail, from: to, from_name: n[1], to: me, to_name: myN, subject: ("Re: " + subject).slice(0, 31),
        body: "Gracias por tu carta. Te espero en la sala de duelo.", t: this.mailTime() });
      this.mem.next_mail++;
    }
    const m = this.mem.mail, per = new Map<number, number>();   // the newest MAIL_PER_TO per recipient, MAIL_MAX in all
    for (let i = m.length - 1; i >= 0; i--) { const k = (per.get(m[i].to) ?? 0) + 1; per.set(m[i].to, k); if (k > MAIL_PER_TO) m.splice(i, 1); }
    m.splice(0, Math.max(0, m.length - MAIL_MAX));
    this.save();
    c.send(0x4601, new W().u32(0).bytes());
    if (n) c.send(0x4603);
    return true;
  }
  private hRcvmail(c: Conn): boolean {
    c.send(0x4611, new W().u32(0).bytes());
    const me = this.pid();
    for (const m of this.mem.mail.filter((m) => m.to === me).slice(-50)) c.send(0x4612, this.mailEntry(m));
    c.send(0x4613);
    return true;
  }
  private hMailcount(c: Conn): boolean { c.send(0x4621, new W().u32(0).bytes()); return true; }

  // ---- teams (overridden by the teams module when it is ported, as py's EQ.HANDLERS)
  private teamList(c: Conn) {
    const t = this.mem.team;
    if (!t) c.send(0x4564, cat(new W().u32(0).u32(0).bytes(), S("", 16), S("", 16)));
    else {
      c.send(0x4564, cat(new W().u32(t.members.length).u32(t.id).bytes(), S(t.name, 16), S(this.me(), 16)));
      const ents = t.members.map(([p, nm]: [number, string]) => cat(new W().u32(p).bytes(), S(nm, 16), new W().u8(0).bytes()));
      for (const ch of this.chunks(ents, 21)) c.send(0x4559, ch);
    }
    c.send(0x4565, new W().u32(0).bytes());
  }
  private hTeamlist(c: Conn) { this.teamList(c); return true; }
  private hTeamcreate(c: Conn, data: Uint8Array) {
    const name = cstr(data.subarray(0, 16)) || "Equipo";
    this.mem.team = { id: 1, name, members: [[this.pid(), this.me()]] }; this.save();
    c.send(0x4551, new W().u32(0).bytes()); c.send(0x4566, new W().u32(0).bytes());
    return true;
  }
  private hTeamdisband(c: Conn) {
    const t = this.mem.team; this.mem.team = null; this.save();
    c.send(0x4553, new W().u32(0).bytes());
    if (t) c.send(0x4560, new W().u32(t.id).bytes());
    return true;
  }
  private hTeamleave(c: Conn) {
    const t = this.mem.team; this.mem.team = null; this.save();
    c.send(0x4570, cat(new W().u32(t ? t.id : 0).u32(this.pid()).bytes(), S(this.me(), 16)));
    return true;
  }

  // ---- packs and gift cards
  cards(pack = 1, n = 5): number[] {
    let cards: number[] = [];
    try { cards = this.g.shopPurchase(1, pack, 1).map(([, cid]) => cid).filter((cid) => PP.cardOk(cid)).slice(0, n); }
    catch (e) { this.log(`[lobby] shop_purchase(1, ${pack}): ${e}`); cards = []; }
    if (cards.length) return cards;
    const valid = [...PP.validCardIds()];
    return Array.from({ length: n }, () => this.g.rng.choice(valid));
  }
  private trunkStore(cards: number[]): number[] {
    const st = this.g.loadState();
    const p = PP.profile(st, mySlot(this.g, st))!;
    const trunk = p.trunk ?? {};
    const seen = new Set<number>(), flags: number[] = [];
    for (const cid of cards) { flags.push((trunk[String(cid)] ?? 0) === 0 && !seen.has(cid) ? 1 : 0); seen.add(cid); }
    PP.trunkAdd(this.g, p, cards, 1, "lobby pack");
    this.g.saveState(st);
    return flags;
  }
  cardsResult(c: Conn, cards: number[]) {
    let flags: number[];
    try { flags = this.trunkStore(cards); } catch (e) { this.log(`[lobby] 0x4803: ${cards} not saved: ${e}`); flags = cards.map(() => 1); }
    const w = new W().u32(0);
    cards.forEach((cid, i) => w.u32(cid).u8(flags[i]));
    c.send(0x4803, w.bytes());
  }
  private hPacklist(c: Conn) { c.send(0x4800, cat(...Array.from({ length: 10 }, (_, i) => new W().u16(i + 1).bytes()))); return true; }
  /** py's free pack and gift cards: off with PROGRESSION (cards come from the shop, prizes, trades), s32 1 = none. */
  private noPack(c: Conn, mid: number) { this.log(`[AVISO] [lobby] 0x${mid.toString(16)}: no free cards with progression`); c.send(0x4803, new W().u32(1).bytes()); return true; }
  hSelectpackBase(c: Conn, data: Uint8Array) {
    if (PP.progression()) return this.noPack(c, 0x4802);
    this.cardsResult(c, this.cards(data.length >= 2 ? u16(data) : 1)); return true;
  }
  private hSelectpack(c: Conn, data: Uint8Array) { return this.g.selectpack ? this.g.selectpack(c, data, () => this.hSelectpackBase(c, data)) : this.hSelectpackBase(c, data); }
  private hGiftcards(c: Conn) { if (PP.progression()) return this.noPack(c, 0x4910); this.cardsResult(c, this.cards(1)); return true; }

  private hTrade(c: Conn, data: Uint8Array): boolean {
    const sub = data.length >= 2 ? u16(data) : 0;
    for (const [rid, payload] of TRADE[sub] ?? []) c.send(rid, payload);
    if (!(sub in TRADE)) this.log(`[lobby] trade 0x${sub.toString(16)} without answer`);
    return true;
  }

  private hPlayerinfo(c: Conn, data: Uint8Array): boolean {
    const pid = data.length >= 4 ? u32(data) : this.pid();
    const head = cat(new W().u32(0).u32(pid).bytes(), S(this.nameOf(pid), 16));
    c.send(0x4160, cat(head, new Uint8Array(PLAYERINFO_SIZE - head.length)));
    return true;
  }

  private hResetautowait(c: Conn): boolean {
    if (!RESETAUTOWAIT) return false;
    c.send(0x42a2, new W().u32(0).bytes());
    if (AUTODUEL) {
      try {
        const s = this.sess(c);
        const me = s?.pid || this.pid();
        const mine = [...this.mem.rooms.values()].filter((r) => r.p1 === me && this.isAuto(r) && !r.p2);
        if (mine.length && !this.g.pvp?.byPid(me)) {
          if ((s?.state ?? 0) !== AUTO_STATE) this.roomState(s, AUTO_STATE);
          if (AUTODUEL_MATCH) this.later(AUTODUEL_MATCH_DELAY, () => this.autoTryMatch(c));
        }
      } catch (e) { this.log(`[lobby] autoduel after 0x42a0: ${e}`); }
    }
    return true;
  }
  private hUsbAuth(c: Conn): boolean { if (!USB_AUTH_REFUSE) return false; c.send(0x8204, new W().u32(1).bytes()); return true; }
  private hTppresentinfo(_c: Conn): boolean { return TPPRESENT; }

  private startupPresentResult(data: Uint8Array, p: any): [number, number[]] {
    if (!data.length) return [1, []];
    const n = data[0];
    if (n === 0 || n > STARTUP_PRESENT_MAX || data.length < 1 + 4 * n) return [1, []];
    const cards = Array.from({ length: n }, (_, i) => new DataView(data.buffer, data.byteOffset).getUint32(1 + 4 * i));   // passcodes
    const valid = PP.validCardIds();
    if (cards.some((cid) => !valid.has(cid))) return [1, []];
    if (p) {
      const right = Object.keys(STARTUP_PRESENT_BITS).map(Number).sort((a, b) => a - b).filter((b) => PP.pbinTest(p, b));
      if (!right.length) return [1, []];
      const bit = right[right.length - 1];
      if (PP.pbinTest(p, bit + 1) || n > STARTUP_PRESENT_BITS[bit]) return [1, []];
      PP.pbinSet(p, bit + 1);
    }
    return [0, cards];
  }
  private hStartupPresent(c: Conn, data: Uint8Array): boolean {
    if (!STARTUP_PRESENT) return false;
    if (PP.progression()) {
      // retired with progression: the starter deck (starter.ts) replaces the pick, and this took ANY valid card id
      this.log(`[lobby] 0x8401 Startup Present refused (retired: the starter deck replaces it)`);
      c.send(0x8402, new W().u32(1).u8(0).bytes());
      return true;
    }
    const st = this.g.loadState();
    const p = PP.profile(st, mySlot(this.g, st));
    const [r, cards] = this.startupPresentResult(data, p);
    if (r === 0) { PP.trunkAdd(this.g, p!, cards, 1, "0x8402 Startup Present"); this.g.saveState(st); }
    const w = new W().u32(r).u8(cards.length);
    for (const cid of cards) w.u32(cid);
    c.send(0x8402, w.bytes());
    return true;
  }

  // ---- connection closed
  onClose(c: Conn): boolean {
    c.ext.lpClosed = true;
    const gone: Room[] = [];
    for (const [k, v] of [...this.mem.rooms]) if (v.conn === c) { gone.push(v); this.mem.rooms.delete(k); }
    const goneIds = new Set(gone.map((r) => r.id));
    const off = this.mem.offer;
    if (off && (goneIds.has(off.room) || !this.mem.rooms.has(off.room))) this.mem.offer = null;
    const mine = [...this.mem.challenges].filter(([k, ch]) => goneIds.has(k) || ch.from === c || ch.to === c).map(([, ch]) => ch);
    for (const ch of mine) { this.mem.challenges.delete(ch.room); ch.done = true; }
    if (gone.length) this.roomState(this.sess(c), 0);
    for (const r of gone) this.blockPost(r.block ?? null, 0x3113, this.roomEntry({ ...r, p1: 0, p2: 0 }), this.sess(c));
    for (const ch of mine) {
      if (ch.from === c) this.post(ch.to, 0x4305, new Uint8Array(0));
      else this.post(ch.from, 0x4301, new W().u32(R_GONE).bytes());
    }
    if (this.g.lobbyRoom.c === c) this.g.lobbyRoom.c = null;
    return true;
  }

  /** py LP.handle: true = answered here. A handler that throws after sending counts as answered (B60). */
  handle(c: Conn, msgId: number, param: number, data: Uint8Array): boolean {
    if (LIMIT_LIST && msgId === 0x4100) for (const [mid, d] of this.limitationMsgs()) c.send(mid, d);
    if (ROOM_REOPEN && msgId === 0x4210) { try { this.roomReopen(c); } catch (e) { this.log(`[lobby] room after the duel: ${e}`); } }
    const h = this.handlers.get(msgId);
    if (!h) return false;
    let sent = 0;
    const orig = c.send;
    c.send = (...a: Parameters<Conn["send"]>) => { sent++; return orig.apply(c, a); };
    try { return h(c, msgId, param, data) !== false; }
    catch (e) {
      this.log(`[lobby] error in 0x${msgId.toString(16)}${sent ? ` after ${sent} message(s)` : ""}: ${e}`);
      return sent > 0;
    } finally { delete (c as any).send; }
  }
}

/** research/mundo strip_color_codes: drops "@0".."@9" and keeps "@@". */
function stripColorCodes(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < b.length;) {
    if (b[i] === 0x40 && i + 1 < b.length) {
      const n = b[i + 1];
      if (n === 0x40) { out.push(0x40, 0x40); i += 2; continue; }
      if (n >= 0x30 && n <= 0x39) { i += 2; continue; }
    }
    out.push(b[i]); i++;
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------- mundo/bloques.py, mundo/avatar.py, cartera.py
/** py block_player: LIST1 entry (0x4212), 36 B, with that session's LV/wins/losses/title and country. */
export function blockPlayer(g: Game, pid: number, name?: string | null, sess: Session | null = null): Uint8Array {
  name = name || myName(g);
  let lv = 0, wins = 0, losses = 0, title = 0, country = DEFAULT_COUNTRY;
  const old = g.ctx;
  try {
    if (sess) g.ctx = sess;
    const st = g.loadState();
    const slot = sess && sess.slot !== null ? sess.slot : mySlot(g, st);
    const p = PP.profile(st, slot, false);
    const v = PP.recValues(p ?? {});
    [lv, wins, losses, title] = ["lv", "wins", "losses", "title"].map((k) => PP.int((v[k] ?? 0) || 0));
    country = String(p?.country || country);
  } catch (e) { g.log(`[lista] LIST1 data of ${pid}: ${e}`); }
  finally { g.ctx = old; }
  return new W().u32(pid).s(name, 16).u8(Math.min(Math.max(lv, 0), 255)).u16(wins & 0xffff).u16(losses & 0xffff).u16(title & 0xffff)
    .u16(0).u8(0).s(country.slice(0, 3), 4).u8(0).u8(g.hub.ablockOf(sess ?? (old && old !== g.NO_SESSION ? old : null))).bytes();
}

function blockOthers(g: Game, c: Conn): Session[] {
  const s = c.sess as Session | null;
  const key = connBlockKey(g, c);
  if (!s || key === null || s.block === null || baseKey(s.block) !== key || s.lobby !== c) return [];
  return g.hub.others(s);
}

function sendBlockList(g: Game, c: Conn) {
  const hub = g.hub;
  const entries = [blockPlayer(g, myPid(g))];
  const view = new Map<number, string>();
  for (const o of blockOthers(g, c)) { view.set(o.pid!, hub.viewOf(o)); entries.push(hub.list1Entry(o)); }
  c.send(0x4211, new W().u32(1).bytes());
  for (let i = 0; i < entries.length; i += 28) c.send(0x4212, cat(...entries.slice(i, i + 28)));
  c.send(0x4213);
  const s = c.sess as Session | null, key = connBlockKey(g, c);
  if (s && key !== null && s.block !== null && baseKey(s.block) === key && s.lobby === c) for (const [mid, d] of hub.reconcile(s, view)) c.send(mid, d, 0.02);
}

function blockType(g: Game, c: Conn): [number, number] {
  if (c.port === g.ports.lobby) return [0, 12];
  const r = roomOfPort(g, c.port);
  const lang = (c.ext.lang as number) ?? 0;
  if (!r) return [lang, ROOM_KINDS[c.port - g.ports.roomBase]];
  return [r[0] === null ? lang : r[0], ROOM_KINDS[r[1]]];
}

function avatarInfo(g: Game, pid: number): Uint8Array {
  const other = pid !== myPid(g) ? g.hub.avatarOf(pid) : null;
  if (other) { const [name, x, y, d] = other; return new W().u32(0).u32(pid).s(name, 16).u16(x).u16(y).u8(d).bytes(); }
  return new W().u32(0).u32(pid).s(myName(g), 16).u16(400).u16(300).u8(0).bytes();
}

function myroomSelfAvatar(g: Game, c: Conn, data: Uint8Array) {
  if (!MYROOM_SELF_AVATAR || c.port !== g.ports.lobby || data.length < 20) return;
  const world = u32(data);
  if (world === 0 || world === 1) c.send(0x4181, cat(new W().u32(myPid(g)).u32(world).bytes(), data.slice(4, 20)));
}

// ---------------------------------------------------------------- lobby_reply
export function lobbyReply(g: Game, c: Conn, msgId: number, param: number, data: Uint8Array): void {
  if (msgId === 0x3001 || msgId === 0x3003) return g.gameReply(c, msgId, param, data);
  if (FREE.refuse(g, c, msgId, data)) return;
  try {
    if (msgId === 0x4100 && c.sess) {
      c.ext.lang = data.length ? data[0] : 0;
      const slot = data.length > 1 ? data[1] & 3 : mySlot(g);
      g.hub.select(c, slot, c.ext.lang as number, (g.loadState().players ?? {})[String(slot)]);
    }
    g.hub.onLobbyMsg(c, msgId, data);
  } catch (e) { g.log(`[hub] 0x${msgId.toString(16)}: ${e}`); }
  if (g.lp.handle(c, msgId, param, data)) return;
  if (msgId === 0x4170 && data.length >= 4) g.avState.world = u32(data);
  if (g.ph && g.phLobby.has(msgId)) {
    const r = g.ph[g.phLobby.get(msgId)!](c, data);
    if (msgId === 0x4170) myroomSelfAvatar(g, c, data);
    return void r;
  }
  if (msgId === 0x0003) { g.onConnClosed(c, "0x0003"); return; }
  if (msgId === 0x0005) c.send(0x0004, new W().u32(0).bytes());
  else if (msgId === 0x4200) {
    const [b1, b2] = blockType(g, c);
    const bl = g.hub.blocklist(connBlockKey(g, c), b2);
    c.send(0x4201, bl ?? new W().u16(8).u16(0).u8(b1).u8(b2).u8(0).bytes());
  } else if (msgId === 0x4202) {
    const [, b2] = blockType(g, c);
    let area = c.port === g.ports.lobby || (b2 >= 0 && b2 <= 9) ? b2 : 0;
    if (c.port !== g.ports.lobby && data.length >= 2 && data[1] === 0) area = g.acadKinds.has(b2) ? ACAD_AREA : DOMINO_AREA;
    const key = connBlockKey(g, c);
    const blk = g.hub.areaBlock(c.sess as Session | null, key, data, area);
    c.send(0x4203, new W().u32(0).u8(blk).u8(area).u8(0).bytes());
    g.hub.enter(c.sess as Session | null, key, blk);
    sendBlockList(g, c);
  } else if (msgId === 0x4558) { c.send(0x4564, new W().u32(0).bytes()); c.send(0x4565, new W().u32(0).bytes()); }
  else if (msgId === 0x5320) c.send(0x5340, avatarInfo(g, (data.length >= 4 ? u32(data) : 0) || myPid(g)));
  else if (msgId === 0x4210) {
    sendBlockList(g, c);
    if (c.ext.pos) c.send(0x5300, c.ext.pos as Uint8Array, 0.02);
    for (const o of blockOthers(g, c)) if (o.pos) c.send(0x5300, o.pos, 0.02);
  } else if (msgId === 0x4230) {
    c.send(0x4231, new W().u32(0).bytes());
    for (let i = 0; i < g.npcs.length; i += 16) c.send(0x4232, cat(...g.npcs.slice(i, i + 16).map((n) => npcEntry(g, npcListParts(g, n)))));
    c.send(0x4233);
  } else if (msgId === 0x4288) {
    const rival = data.length >= 28 ? u32(data, 24) : 0;
    const npcU8 = 0; // NPC_RULES_2008 npc_window is off
    g.duelBegin(c, rival, npcU8);
    c.send(0x428a, new W().u32(0).bytes());
    const name = g.npcs.find((n) => n[0] === rival)?.[1] ?? `Rival ${rival}`;
    c.send(0x43a0, cat(new W().u32(rival).s(name, 16).u8(0).u16(0).u16(0).bytes(), g.duelParts(rival), Uint8Array.of(npcU8)));
    c.send(0x4306, new W().s(g.cfg.publicIp, 15).u16(g.ports.duel + g.cfg.portOffset).bytes());
  } else if (EMPTY_LISTS.has(msgId)) {
    const [start, end] = EMPTY_LISTS.get(msgId)!;
    c.send(start, new W().u32(0).bytes());
    for (const ch of g.hub.listChunks(c, msgId)) c.send(start + 1, ch);
    c.send(end);
  } else if (msgId === 0x4172) c.send(0x4173, new W().u32(0).bytes());
  else if (msgId === 0x5208) {
    c.send(0x5213);
    const items = g.shopCatalog();
    for (let i = 0; i < items.length; i += 60) c.send(0x5209, cat(...items.slice(i, i + 60)));
    c.send(0x5214);
  } else if (msgId === 0x5210) g.shopBuy(c, data);
  else if (msgId === 0x5300 || msgId === 0x5310) {
    if (msgId === 0x5300) c.ext.pos = data;
    c.send(msgId, data, 0.02);
  } else if (!g.autoReply(c, msgId)) g.log(`[srv:${c.port}] no answer for 0x${msgId.toString(16).padStart(4, "0")}`);
}

export { blockOthers, keyPort };
