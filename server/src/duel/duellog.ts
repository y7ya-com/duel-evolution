// py research/repeticion/duellog.py: the duel record (replay) the server sends after a PvP: 0x6010 header, 0x6011 x k
// (the RLE blob in 1024-byte chunks), 0x6016 (u32 0), 0x6012, one after each 0x6013 of the client.
const MAGIC = 0x080a, VERSION = 0xd8;
export const MODE_SINGLE = 3, MODE_MATCH = 4;
const BGM_DEFAULT = 0x20000010, CHUNK = 1024;
const COUNTRY_DEFAULT = Uint8Array.from([0x45, 0x53, 0x50, 0]);
export const M_HEADER = 0x6010, M_COMMAND = 0x6011, M_FINISH = 0x6012, M_ACK = 0x6013, M_SEARCH_INIT = 0x6016;
const ROOM_KINDS_OK = new Set([1, 9, 10, 0xb, 0xe, 0x10, 0x11, 0x14, 7, 8, 0xd, 0xf, 0xc]);
const ROOM_KIND_DEFAULT = 0xc;

export function rleEncode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  const n = data.length;
  while (i < n) {
    const v = data[i];
    let j = i + 1;
    while (j < n && data[j] === v && j - i < 255) j++;
    out.push(v, j - i);
    i = j;
  }
  return Uint8Array.from(out);
}

class LE {
  b: number[] = [];
  u8(v: number) { this.b.push(v & 0xff); return this; }
  u16(v: number) { this.b.push(v & 0xff, (v >> 8) & 0xff); return this; }
  u32(v: number) { v >>>= 0; this.b.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24); return this; }
  raw(x: ArrayLike<number>) { for (let i = 0; i < x.length; i++) this.b.push(x[i]); return this; }
  zeros(n: number) { for (let i = 0; i < n; i++) this.b.push(0); return this; }
}
const pad = (b: ArrayLike<number> | null | undefined, n: number) => { const o = new Uint8Array(n); if (b) o.set(Array.from(b).slice(0, n)); return o; };
const latin1 = (s: string) => Uint8Array.from([...s].map((ch) => (ch.charCodeAt(0) > 255 ? 0x3f : ch.charCodeAt(0))));
const name16 = (s: string | null | undefined) => pad(latin1(String(s ?? "")).subarray(0, 15), 16);

/** 0x6202 (40 B BE) -> 44 B LE entry of the blob: u32 type, u32 B, u8 side, u8 0, u16 0, 8 x u32 P. */
function entryFrom6202(side: number, data: Uint8Array): number[] {
  const d = pad(data, 40);
  const dv = new DataView(d.buffer);
  const v = Array.from({ length: 10 }, (_, i) => dv.getUint32(4 * i));
  const w = new LE().u32(v[0]).u32(v[1]).u8(side).u8(0).u16(0);
  for (let i = 2; i < 10; i++) w.u32(v[i]);
  return w.b;
}

export interface LogPlayer { pid: number; listval: number; name: string; parts: Uint8Array[]; main: number; extra: number; country: Uint8Array; hand?: number | null }

function playerBlock(pl: LogPlayer, hand: number | null): number[] {
  const parts = [...(pl.parts ?? []).slice(0, 3), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)];
  let u8s = pad([], 4);
  if (hand !== null) u8s = Uint8Array.from([hand % 3, ...u8s.subarray(1)]);
  const w = new LE().u32(pl.pid ?? 0).u32(pl.listval ?? 0).raw(name16(pl.name)).u32(pl.main ?? 0).u32(pl.extra ?? 0).u32(BGM_DEFAULT)
    .raw(u8s).u32(0);
  for (const x of parts.slice(0, 3)) w.raw(pad(x, 32));
  return w.raw(pad(pl.country ?? COUNTRY_DEFAULT, 4)).zeros(28).b;
}

/** -> [hands (j0, j1), who starts, warnings] */
export function replayStart(hands: readonly (number | null | undefined)[] | null, first: number | null | undefined): [[number, number], number, string[]] {
  const avisos: string[] = [];
  let f = first === 0 || first === 1 ? first : null;
  let h: [number, number] | null = null;
  if (hands && hands.length === 2 && hands.every((x) => Number.isInteger(x) && x! >= 0 && x! <= 2)) h = [hands[0]!, hands[1]!];
  const mod3 = (x: number) => ((x % 3) + 3) % 3;
  const why = h === null ? "sin manos del piedra-papel-tijera"
    : mod3(h[1] - h[0]) === 0 ? `manos [${h[0]}, ${h[1]}] empatadas (la repetición se quedaría en bucle)` : null;
  if (why) {
    const w = f !== null ? f : 0;
    h = w === 0 ? [0, 1] : [1, 0];
    avisos.push(`${why}: van [${h[0]}, ${h[1]}] (gana el jugador ${w}, P)`);
  }
  if (f === null) {
    f = mod3(h![1] - h![0]) === 1 ? 0 : 1;
    avisos.push(`sin quién empieza: el ganador del piedra-papel-tijera, ${f} (P)`);
  }
  return [h!, f, avisos];
}

function buildBlob(players: LogPlayer[], entries: [number, Uint8Array][], mode: number, when: number, roomKind: number, games0: number[]): Uint8Array {
  const games = [...games0, 0xff, 0xff, 0xff];
  const hs = players.slice(0, 2).map((p) => p.hand);
  const [hands, g0] = replayStart(hs.some((x) => x === null || x === undefined) ? null : hs, games[0]);
  games[0] = g0;
  const w = new LE().zeros(64).u32(when).u8(0).u32(mode).u32(0);
  if (!ROOM_KINDS_OK.has(roomKind)) roomKind = ROOM_KIND_DEFAULT;
  w.raw([0, roomKind & 0xff, 0, 0]).u32(0).zeros(3);
  w.raw(games.slice(0, 3).map((x) => x & 0xff)).zeros(7 + 32);
  players.slice(0, 2).forEach((pl, k) => w.raw(playerBlock(pl, hands[k])));
  w.zeros(1).u32(entries.length).u32(0).u32(0).zeros(32);
  for (const [side, data] of entries) w.raw(entryFrom6202(side, data));
  w.u32(0).u32(0);       // fusion: n, m (empty)
  w.u32(0);              // search: n (empty)
  return Uint8Array.from(w.b);
}

/** strftime("pvp%Y%m%d%H%M%S", localtime(when)) */
export function pvpTitle(when: number): string {
  const d = new Date(when * 1000), p = (n: number) => String(n).padStart(2, "0");
  return `pvp${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const safeTitle = (t: string, when: number) => ([...String(t ?? "")].filter((ch) => /[A-Za-z0-9\-_]/.test(ch) || (ch.charCodeAt(0) > 127 && /\p{L}|\p{N}/u.test(ch))).join("") || pvpTitle(when)).slice(0, 31);

function header6010(title: string, nSent: number, nDecoded: number, mode: number, listvals: number[], names: string[], when: number): Uint8Array {
  const b: number[] = [];
  const u16 = (v: number) => b.push((v >> 8) & 0xff, v & 0xff);
  const u32 = (v: number) => { v >>>= 0; b.push(v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); };
  u16(MAGIC); u16(VERSION);
  b.push(...latin1(safeTitle(title, when)), 0);
  u32(nSent); u32(nDecoded); u32(mode); u32(listvals[0]); u32(listvals[1]);
  b.push(...name16(names[0]), ...name16(names[1]));
  u32(when); u32(0); u32(0);
  b.push(0, 0, 0);
  return Uint8Array.from(b);
}

/** [(id, data)] for ONE client: 0x6010, 0x6011 x k, 0x6016 (u32 0), 0x6012. */
export function messages(players: LogPlayer[], entries: [number, Uint8Array][], o: { mode?: number; when: number; roomKind: number; games: number[] }): [number, Uint8Array][] {
  const mode = o.mode ?? MODE_SINGLE;
  const blob = buildBlob(players, entries, mode, o.when, o.roomKind, o.games);
  const body = rleEncode(blob);
  const head = header6010(pvpTitle(o.when), body.length, blob.length, mode, players.map((p) => p.listval ?? 0), players.map((p) => p.name), o.when);
  const out: [number, Uint8Array][] = [[M_HEADER, head]];
  for (let k = 0; k < body.length; k += CHUNK) out.push([M_COMMAND, body.slice(k, k + CHUNK)]);
  out.push([M_SEARCH_INIT, Uint8Array.of(0, 0, 0, 0)]);
  out.push([M_FINISH, new Uint8Array(0)]);
  return out;
}

/** Notes the 0x6202 that go out to each side, in send order. */
export class Recorder {
  entries: [number, Uint8Array][] = [];
  note(side: number, msgs: readonly unknown[]): void {
    for (const m of msgs) {
      const [mid, data] = m instanceof Uint8Array ? [0x6202, m] : Array.isArray(m) ? (m as [number, Uint8Array]) : [null, null];
      if (mid === 0x6202 && data instanceof Uint8Array) this.entries.push([side, data.slice()]);
    }
  }
}
