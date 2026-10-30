// The gate 5730 and the room port table (py yo2srv/red/puerta.py) plus the block-key helpers of mundo/bloques.py.
import { ROOM_KINDS, ROOM_LANG_PORT_BASE, ROOM_LANGS, ROOM_PORT_BASE, WORLD_LANG } from "../config.ts";
import type { Conn } from "../net/conn.ts";
import { serverEntry, W } from "../net/proto.ts";
import type { Game } from "./game.ts";
import { blockKey, type BlockKey } from "./hub.ts";
import { isFree } from "./freemode.ts";

export const GATE_PAUSE = 0.03;
const SINGLE_ROOM: [number, number] = [WORLD_LANG, 14];
/** One world: every room port leads into ONE block holding every area (hub.ts WORLD_AREAS), so the doors only pick
 *  where a player starts. Announced: blue Domino City (13) and GUNSLINGER (7, 60 s turns for the duels its entrants
 *  start), red Duelist Academy (14); CHAMPIONSHIP (8, the client's tournament screens) only while a tournament runs.
 *  The other kinds' ports stay open (ROOM_KINDS' order fixes every port) and land in the same block. */
const ANNOUNCED_KINDS = [13, 7, 14];
export const WORLD_KIND = 13;
/** py ROOM_LANG_MERGE: every language shares the block (key language 0). */
export const ROOM_LANG_MERGE = true;

export const roomLang = (lang: number) => (ROOM_LANG_MERGE ? 0 : lang);
const franja = (lang: number) => (lang < WORLD_LANG ? lang : lang - 1);

export function roomPort(g: Game, lang: number, kind: number): number {
  const i = ROOM_KINDS.indexOf(kind as (typeof ROOM_KINDS)[number]);
  if (g.cfg.roomPerLang && lang !== WORLD_LANG && (ROOM_LANGS as readonly number[]).includes(lang))
    return ROOM_LANG_PORT_BASE + franja(lang) * ROOM_KINDS.length + i;
  return ROOM_PORT_BASE + i;
}

/** [room language or null, index in ROOM_KINDS] of a room port, or null. */
export function roomOfPort(g: Game, port: number): [number | null, number] | null {
  const n = ROOM_KINDS.length;
  if (port >= ROOM_PORT_BASE && port < ROOM_PORT_BASE + n) return [g.cfg.roomPerLang ? WORLD_LANG : null, port - ROOM_PORT_BASE];
  if (g.cfg.roomPerLang && port >= ROOM_LANG_PORT_BASE && port < ROOM_LANG_PORT_BASE + (ROOM_LANGS.length - 1) * n) {
    const f = Math.floor((port - ROOM_LANG_PORT_BASE) / n), i = (port - ROOM_LANG_PORT_BASE) % n;
    return [f < WORLD_LANG ? f : f + 1, i];
  }
  return null;
}

export function roomBlockKey(g: Game, port: number, clientLang = 0): BlockKey | null {
  const r = roomOfPort(g, port);
  if (!r) return null;
  const lang = r[0];
  return blockKey(ROOM_PORT_BASE + ROOM_KINDS.indexOf(WORLD_KIND), lang === null ? roomLang(clientLang) : lang);
}

/** The kind of the room a player entered by (its lobby port), 12 (My Room) outside one: the room's rules (GUNSLINGER's
 *  60 s turns) follow it, since every room shares one block. */
export function entryKind(g: Game, s: { lobby: Conn | null }): number {
  const r = s.lobby ? roomOfPort(g, s.lobby.port) : null;
  return r ? ROOM_KINDS[r[1]] : 12;
}

/** py bloques.block_key: the shared block of a connection; My Room is per player (null). Free mode has blocks of
 *  its own, "<port>|<lang>|f" (game/freemode.ts). */
export function connBlockKey(g: Game, c: Conn): BlockKey | null {
  if (c.port === g.ports.lobby) return null;
  const k = roomBlockKey(g, c.port, (c.ext.lang as number) ?? 0);
  return k !== null && isFree(c.sess) ? `${k}|f` : k;
}

/** py gate_reply: version OK + server list (accounts, My Room, rooms) + end of list. */
export function gateReply(g: Game, c: Conn, msgId: number): void {
  if (msgId !== 0x2005) return;
  c.send(0x2002, new W().u32(0).bytes(), GATE_PAUSE);
  const ip = g.cfg.publicIp, off = g.cfg.portOffset;
  const entries = [serverEntry(1, 1, "DuelCards", ip, g.ports.game + off),
                   serverEntry(2, 3, "MyRoom", ip, g.ports.lobby + off, 0, 0, 12, 0)];
  const rooms: [number, number][] = g.cfg.singleLobby ? [SINGLE_ROOM]
    : ROOM_LANGS.flatMap((lang) => [...ANNOUNCED_KINDS, ...(g.to?.running ? [8] : [])].map((kind) => [lang, kind] as [number, number]));
  for (const [lang, kind] of rooms) {
    const port = roomPort(g, lang, kind);
    const key = roomBlockKey(g, port, lang);
    const n = key === null ? 0 : g.hub.roomCount(key);
    entries.push(serverEntry(10 + entries.length, 3, `Sala ${lang}-${kind}`, ip, port + off, n, lang, kind, 0));
  }
  for (let i = 0; i < entries.length; i += 21) {
    const chunk = entries.slice(i, i + 21);
    const b = new Uint8Array(chunk.length * 48);
    chunk.forEach((e, j) => b.set(e, j * 48));
    c.send(0x2003, b, GATE_PAUSE);
  }
  c.send(0x2004);
}
