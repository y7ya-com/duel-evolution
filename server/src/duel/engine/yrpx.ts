// The EDOPro replay (.yrpX), recorded the way EDOPro's own server does (Project Ignis EDOPro, gframe/generic_duel.cpp
// Analyze / BeforeParsing / Sending / AfterParsing / Refresh*, gframe/replay.cpp, gframe/core_utils.cpp Query): our
// engine is EDOPro's ocgcore at the same version (11.0), so its raw message batches ARE what EDOPro's replay viewer
// reads. The stream keeps every message unmasked (the viewer hides what the side it shows cannot see) except the
// prompts (SELECT_*, SORT_*, rock-paper-scissors, ANNOUNCE_*, private hints), and adds EDOPro's field refreshes
// (MSG_UPDATE_DATA / MSG_UPDATE_CARD, from queries made right after each batch, as EDOPro's server makes them) where
// its server adds them. The file is written uncompressed (EDOPro reads both) and without the embedded .yrp of the
// seed and responses: EDOPro's "old mode" would replay those with its own card scripts, not this game's 2008 ones.

const YRPX = 0x58707279;                          // "yrpX"
const VERSION = 41 | (0 << 8) | (11 << 16) | (0 << 24); // EDOPro 41.0 on ocgcore 11.0 (config.h CLIENT_VERSION)
const REPLAY_LUA64 = 0x10, REPLAY_NEWREPLAY = 0x20, REPLAY_64BIT_DUELFLAG = 0x100, REPLAY_EXTENDED_HEADER = 0x200;
const HEADER = 72;                                // ExtendedReplayHeader: 32 B base + u64 version + 4 x u64 seed

export const MSG = {
  RETRY: 1, HINT: 2, START: 4, WIN: 5, UPDATE_DATA: 6, UPDATE_CARD: 7,
  SELECT_BATTLECMD: 10, SELECT_IDLECMD: 11, SELECT_CHAIN: 16,
  SHUFFLE_HAND: 33, SWAP_GRAVE_DECK: 35, SHUFFLE_SET_CARD: 36, REVERSE_DECK: 37, SHUFFLE_EXTRA: 39,
  NEW_TURN: 40, NEW_PHASE: 41, MOVE: 50, POS_CHANGE: 53, SWAP: 55, SUMMONED: 61, SPSUMMONED: 63, FLIPSUMMONING: 64,
  FLIPSUMMONED: 65, CHAINED: 71, CHAIN_SOLVED: 73, CHAIN_END: 74, DRAW: 90, DAMAGE_STEP_START: 113, DAMAGE_STEP_END: 114,
  TAG_SWAP: 161, RELOAD_FIELD: 162,
} as const;
/** Never in a replay: the decisions asked of a player (EDOPro's Sending sets record = false for these). */
const PROMPTS = new Set([MSG.RETRY, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 132, 140, 141, 142, 143]);
/** HINT types sent to one player only: not recorded. */
const PRIVATE_HINTS = new Set([1, 2, 3, 5]);

export const LOC = { DECK: 0x01, HAND: 0x02, MZONE: 0x04, SZONE: 0x08, GRAVE: 0x10, EXTRA: 0x40, OVERLAY: 0x80 } as const;
/** EDOPro's refresh query flags (generic_duel.h defaults). */
const Q = { MZONE: 0x3981fff, SZONE: 0x3f81fff, HAND: 0x3781fff, GRAVE: 0x381fff, EXTRA: 0x381fff, SINGLE: 0x3f81fff, DECK: 0x1181fff, SET_CARD: 0x3181fff } as const;
const QUERY_REASON_CARD = 0x2000, QUERY_EQUIP_CARD = 0x4000, QUERY_END = 0x80000000;
const POS_FACEUP = 0x5, POS_FACEDOWN = 0xa;

/** The engine's raw answers, as EDOPro's server gets them from OCG_DuelQueryLocation / OCG_DuelQuery. */
export interface ReplayQueries {
  /** u32 size + the location's card queries; null / empty = nothing. */
  location(player: number, location: number, flags: number): Uint8Array | null;
  /** One card's query (no size prefix); null / empty = no card there. */
  single(player: number, location: number, sequence: number, flags: number): Uint8Array | null;
  count(player: number, location: number): number;
}

/** One card query: its fields as [flag, data], or null for an empty zone (a u16 0). */
type CardQuery = [number, Uint8Array][] | null;

function readQuery(b: Uint8Array, at: number): [CardQuery, number] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const fields: [number, Uint8Array][] = [];
  for (;;) {
    const size = dv.getUint16(at, true);
    at += 2;
    if (size === 0) return [null, at];
    const flag = dv.getUint32(at, true);
    fields.push([flag, b.subarray(at + 4, at + size)]);
    at += size;
    if (flag === QUERY_END) return [fields, at];
  }
}

/** Query::GenerateBuffer(is_for_public_buffer = false, check_hidden = false): the fields in flag order, without a
 *  reason / equip card that has no location. */
function writeQuery(q: CardQuery, out: number[]): void {
  if (q === null) { out.push(0, 0); return; }
  const sorted = [...q].sort((a, b) => a[0] - b[0]);
  for (const [flag, data] of sorted) {
    if ((flag === QUERY_REASON_CARD || flag === QUERY_EQUIP_CARD) && (data[1] ?? 0) === 0) continue;
    const size = data.length + 4;
    out.push(size & 0xff, size >> 8, flag & 0xff, (flag >>> 8) & 0xff, (flag >>> 16) & 0xff, flag >>> 24, ...data);
  }
}

const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24];
const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
/** ReadLocInfo (core 11 layout): u8 controller, u8 location, u32 sequence, u32 position. */
const locInfo = (d: Uint8Array, at: number) => {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return { controller: d[at]!, location: d[at + 1]!, sequence: dv.getUint32(at + 2, true), position: dv.getUint32(at + 6, true) };
};

export class YrpxRecorder {
  /** [u8 message][u32 length][data] each, in order. */
  readonly packets: Uint8Array[] = [];
  /** The duel's WIN is in the stream (nothing is recorded after it). */
  won = false;
  private out: Uint8Array[] = [];

  constructor(private q: ReplayQueries) {}

  private pack(message: number, data: ArrayLike<number>): Uint8Array {
    const p = new Uint8Array(5 + data.length);
    p[0] = message;
    p.set(u32(data.length), 1);
    p.set(data, 5);
    return p;
  }

  private refresh(player: number, location: number, flags: number): void {
    const raw = this.q.location(player, location, flags);
    if (!raw || raw.length < 4) return;
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const size = dv.getUint32(0, true);
    const body: number[] = [];
    for (let at = 4; at < 4 + size;) { const [q, next] = readQuery(raw, at); writeQuery(q, body); at = next; }
    this.out.push(this.pack(MSG.UPDATE_DATA, [player, location, ...u32(body.length), ...body]));
  }

  private refreshDeck(player: number): void {
    const raw = this.q.location(player, LOC.DECK, Q.DECK);
    if (!raw || raw.length === 0) return;
    this.out.push(this.pack(MSG.UPDATE_DATA, [player, LOC.DECK, ...raw]));
  }

  private refreshSingle(player: number, location: number, sequence: number): void {
    const raw = this.q.single(player, location, sequence, Q.SINGLE);
    if (!raw || raw.length === 0) return;
    const body: number[] = [];
    writeQuery(readQuery(raw, 0)[0], body);
    this.out.push(this.pack(MSG.UPDATE_CARD, [player, location, sequence & 0xff, ...body]));
  }

  private both(location: number, flags: number): void { this.refresh(0, location, flags); this.refresh(1, location, flags); }

  /** MSG_START and the opening refreshes (GenericDuel::TPResult). */
  start(lp: number): void {
    this.out = [];
    const counts = [0, 1].flatMap((p) => [...u16(this.q.count(p, LOC.DECK)), ...u16(this.q.count(p, LOC.EXTRA))]);
    this.out.push(this.pack(MSG.START, [0, ...u32(lp), ...u32(lp), ...counts]));
    this.refreshDeck(0); this.refreshDeck(1);
    this.refresh(0, LOC.EXTRA, Q.EXTRA); this.refresh(1, LOC.EXTRA, Q.EXTRA);
    this.packets.push(...this.out);
  }

  /** One raw batch from duelGetMessage ([u32 length][u8 message][data]...), right after it was read. */
  batch(raw: Uint8Array): void {
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let at = 0; at + 4 <= raw.length && !this.won;) {
      const len = dv.getUint32(at, true);
      if (len < 1 || at + 4 + len > raw.length) break;
      this.analyze(raw[at + 4]!, raw.subarray(at + 5, at + 4 + len));
      at += 4 + len;
    }
  }

  /** GenericDuel::Analyze for one message. */
  private analyze(message: number, d: Uint8Array): void {
    this.out = [];
    let record = !PROMPTS.has(message), last = false;
    // BeforeParsing
    switch (message) {
      case MSG.SELECT_BATTLECMD: case MSG.SELECT_IDLECMD:
        this.both(LOC.MZONE, Q.MZONE); this.both(LOC.SZONE, Q.SZONE); this.both(LOC.HAND, Q.HAND); last = true; break;
      case MSG.SELECT_CHAIN: case MSG.NEW_TURN:
        this.both(LOC.MZONE, Q.MZONE); this.both(LOC.SZONE, Q.SZONE); last = true; break;
      case MSG.FLIPSUMMONING: { const l = locInfo(d, 4); this.refreshSingle(l.controller, l.location, l.sequence); last = true; break; }
    }
    // Sending: only what is recorded
    if (message === MSG.HINT && PRIVATE_HINTS.has(d[0]!)) record = false;
    // AfterParsing
    switch (message) {
      case MSG.SHUFFLE_HAND: case MSG.DRAW: this.refresh(d[0]!, LOC.HAND, Q.HAND); break;
      case MSG.SHUFFLE_EXTRA: this.refresh(d[0]!, LOC.EXTRA, Q.EXTRA); break;
      case MSG.SWAP_GRAVE_DECK: this.refresh(d[0]!, LOC.GRAVE, Q.GRAVE); break;
      case MSG.REVERSE_DECK: this.refreshDeck(0); this.refreshDeck(1); break;
      case MSG.SHUFFLE_SET_CARD: this.refresh(0, d[0]!, Q.SET_CARD); this.refresh(1, d[0]!, Q.SET_CARD); break;
      case MSG.DAMAGE_STEP_START: case MSG.DAMAGE_STEP_END: case MSG.SUMMONED: case MSG.SPSUMMONED: case MSG.FLIPSUMMONED:
      case MSG.NEW_PHASE: case MSG.CHAINED: case MSG.CHAIN_SOLVED: case MSG.CHAIN_END:
        if (message === MSG.CHAIN_END) { this.refreshDeck(0); this.refreshDeck(1); }
        this.both(LOC.MZONE, Q.MZONE);
        if (message !== MSG.DAMAGE_STEP_START && message !== MSG.DAMAGE_STEP_END) this.both(LOC.SZONE, Q.SZONE);
        if (message === MSG.NEW_PHASE || message === MSG.CHAINED || message === MSG.CHAIN_END) this.both(LOC.HAND, Q.HAND);
        break;
      case MSG.MOVE: {
        const prev = locInfo(d, 4), cur = locInfo(d, 14);
        if (cur.location !== 0 && (cur.location & LOC.OVERLAY) === 0 && (cur.location !== prev.location || prev.controller !== cur.controller))
          this.refreshSingle(cur.controller, cur.location, cur.sequence);
        break;
      }
      case MSG.POS_CHANGE:
        if ((d[7]! & POS_FACEDOWN) && (d[8]! & POS_FACEUP)) this.refreshSingle(d[4]!, d[5]!, d[6]!);
        break;
      case MSG.SWAP: {
        const a = locInfo(d, 4), b = locInfo(d, 18);
        this.refreshSingle(a.controller, a.location, a.sequence);
        this.refreshSingle(b.controller, b.location, b.sequence);
        break;
      }
      case MSG.RELOAD_FIELD: this.refresh(0, LOC.EXTRA, Q.EXTRA); this.refresh(1, LOC.EXTRA, Q.EXTRA); break;
    }
    if (record) { const p = this.pack(message, d); if (last) this.out.push(p); else this.out.unshift(p); }
    this.packets.push(...this.out);
    if (message === MSG.WIN) this.won = true;
  }

  /** The end of a duel the engine did not decide (a surrender, a timeout, a player gone): EDOPro's MSG_WIN
   *  (winner by core player, 2 = none; reason 0 surrender, 3 time, 4 disconnection). */
  end(winner: number, reason: number): void {
    if (this.won) return;
    this.packets.push(this.pack(MSG.WIN, [winner & 0xff, reason & 0xff]));
    this.won = true;
  }

  /** The .yrpX file. names by CORE player (0 = who went first); seed = the four words the duel was created with. */
  file(o: { names: [string, string]; seed: readonly bigint[]; flags: bigint; at: number }): Uint8Array {
    const body: number[] = [];
    for (const name of o.names) {
      body.push(...u32(1));
      const units = [...String(name || "Player")].slice(0, 19).map((ch) => (ch.codePointAt(0)! > 0xffff ? 0x3f : ch.codePointAt(0)!));
      for (let i = 0; i < 20; i++) body.push(...u16(units[i] ?? 0));
    }
    const flags = BigInt.asUintN(64, o.flags);
    body.push(...u32(Number(flags & 0xffffffffn)), ...u32(Number(flags >> 32n)));
    const size = body.length + this.packets.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(HEADER + size);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, YRPX, true);
    dv.setUint32(4, VERSION, true);
    dv.setUint32(8, REPLAY_LUA64 | REPLAY_NEWREPLAY | REPLAY_64BIT_DUELFLAG | REPLAY_EXTENDED_HEADER, true);
    dv.setUint32(12, Math.floor(o.at) >>> 0, true);
    dv.setUint32(16, size, true);
    // hash (20) and the LZMA props (24..31) stay 0: not compressed
    dv.setBigUint64(32, 1n, true);
    for (let i = 0; i < 4; i++) dv.setBigUint64(40 + 8 * i, BigInt.asUintN(64, o.seed[i] ?? 0n), true);
    out.set(body, HEADER);
    let at = HEADER + body.length;
    for (const p of this.packets) { out.set(p, at); at += p.length; }
    return out;
  }
}

/** The packets of a .yrpX (for tests and tools): EDOPro's ParseReplayHeader / ParseNames / ParseParams / ParseStream
 *  for an uncompressed, extended-header, NEWREPLAY file. */
export function readYrpx(file: Uint8Array): { names: string[]; flags: bigint; seed: bigint[]; at: number; packets: { message: number; data: Uint8Array }[] } {
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (dv.getUint32(0, true) !== YRPX) throw new Error("not a .yrpX");
  const flag = dv.getUint32(8, true);
  if (!(flag & REPLAY_EXTENDED_HEADER) || !(flag & REPLAY_NEWREPLAY) || (flag & 1)) throw new Error(`unsupported flags 0x${flag.toString(16)}`);
  const size = dv.getUint32(16, true);
  if (HEADER + size !== file.length) throw new Error(`size ${size} + header != ${file.length}`);
  const seed = [0, 1, 2, 3].map((i) => dv.getBigUint64(40 + 8 * i, true));
  let at = HEADER;
  const names: string[] = [];
  for (let side = 0; side < 2; side++) {
    const n = dv.getUint32(at, true);
    at += 4;
    for (let i = 0; i < n; i++) {
      let s = "";
      for (let k = 0; k < 20; k++) { const c = dv.getUint16(at + 2 * k, true); if (!c) break; s += String.fromCharCode(c); }
      names.push(s);
      at += 40;
    }
  }
  const flags = dv.getBigUint64(at, true);
  at += 8;
  const packets: { message: number; data: Uint8Array }[] = [];
  while (at < file.length) {
    const message = file[at]!, len = dv.getUint32(at + 1, true);
    if (at + 5 + len > file.length) throw new Error(`packet ${packets.length} runs past the end`);
    packets.push({ message, data: file.subarray(at + 5, at + 5 + len) });
    at += 5 + len;
  }
  return { names, flags, seed, at: dv.getUint32(12, true), packets };
}
