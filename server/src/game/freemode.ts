// Free mode, a Duel Evolution addition (not in the 2008 game): the title's DECK EDITOR and FREE DUEL, for players who
// only want to build decks and duel. Every card is there x3, the decks are the player's own (the client's deck files,
// shared with the MMO), and nothing touches the MMO's economy or progression.
//
// The mode is per connection: the client (client/recomp/rt/cardwire.cpp rc_cw_mode) opens each socket with one
// 0xCA10 FREEMODE frame (u8 1) when the player came in through the title's free entries. Only a connection's FIRST
// frame can set it. A session takes the mode of the connection that logs in and keeps it while any of its connections
// lives: a connection of the other mode is refused (hub.login / attach). So an MMO session can't turn free to skip
// the trunk check in its duels, and a free session can't reach the MMO.
//
// Security is segregation, not trust: a free session
//   - is served the every-card trunk (built here, never saved) and its PvP decks are checked against it, the
//     forbidden/limited list included (duel/deckCheck.ts);
//   - stands in its own blocks (hub/gate connBlockKey: "<port>|<lang>|f"), so it only meets and auto-duels free
//     players, and rooms are listed and challenged only within one mode (lobby.ts);
//   - is refused the MMO's economy messages below (shop, packs, presents, structure decks, items, trade, NPC duels),
//     and trunkAdd / mpReward refuse it underneath (persist.ts) whatever path gets there;
//   - finishes a PvP duel with no MP, no record, no stats, no card offer: only its own free record p.free {w, l}.
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";

export const FREEMODE_MSG = 0xca10;

export const isFree = (s: unknown): boolean => !!(s && typeof s === "object" && (s as Session).ext?.free);

/** world.ts, before anything else: true = the frame was the mode frame (consumed, never counted as the client's). */
export function modeFrame(c: Conn, msgId: number, data: Uint8Array, log: (s: string) => void): boolean {
  const first = !c.ext.rx;
  c.ext.rx = true;
  if (msgId !== FREEMODE_MSG) return false;
  if (first && data.length >= 1 && data[0] === 1) c.ext.free = true;
  log(`[free] ${c.port}: 0xCA10 ${first ? (c.ext.free ? "free mode" : "ignored (not 1)") : "ignored (not the first frame)"}`);
  return true;
}

/** hub.login / attach: the session's mode follows a connection only while none of its other connections lives. */
export function modeAgrees(s: Session, c: Conn, live: boolean): boolean {
  const want = !!c.ext.free;
  if (!!s.ext.free === want) return true;
  if (live) return false;
  s.ext.free = want;
  return true;
}

/** The Startup Present's rights (lobby.ts STARTUP_PRESENT_BITS): left out of a free session's PBIN, or the client
 *  opens the present (an MMO gift free mode refuses) when it comes back from a duel. The profile keeps them. */
export const PRESENT_RIGHTS = new Set([0x30e, 0x310, 0x312, 0x314, 0x316]);

let ALL: Record<string, number> | null = null;
/** Every card x3 (the 2008 editor's per-card limit), as a trunk. */
export function freeTrunk(valid: Iterable<number>): Record<string, number> {
  return (ALL ??= Object.fromEntries([...valid].sort((a, b) => a - b).map((i) => [String(i), 3])));
}

/** The free record, the only thing a free duel writes. */
export function freeRecord(p: Record<string, any>, won: boolean | null): void {
  const f = (p.free ??= { w: 0, l: 0 });
  if (won === true) f.w = (f.w | 0) + 1;
  else if (won === false) f.l = (f.l | 0) + 1;
}

const REQTRADE = 0x7102, REQTRADERESULT = 0x7103, REQ_FAIL = -493;
// Lobby messages a free session is refused: they buy, open, claim or trade cards, or start an NPC duel (prizes).
const REFUSED = new Set([0x5210, 0x4902, 0x5400, 0x5204, 0x8401, 0x8301, 0x4802, 0x4910, 0x4915, 0x7000]);

/** lobby.ts lobbyReply: true = refused here (with the client's own failure answer where it waits for one). */
export function refuse(g: Game, c: Conn, msgId: number, data: Uint8Array): boolean {
  if (!isFree(c.sess)) return false;
  const npcDuel = msgId === 0x4288 && data.length >= 28 && (() => { const r = new DataView(data.buffer, data.byteOffset).getUint32(24); return r >= 1 && r <= 98; })();
  if (!REFUSED.has(msgId) && !npcDuel) return false;
  g.log(`[free] 0x${msgId.toString(16)} refused: free mode stays out of the MMO`);
  if (msgId === 0x5210) { c.send(0x5212, new W().u32(1).bytes()); c.send(0x5211, new W().u32(1).bytes()); }
  else if (msgId === 0x7000 && data.length >= 2 && ((data[0] << 8) | data[1]) === REQTRADE) c.send(REQTRADERESULT, new W().u32(REQ_FAIL).bytes());
  else if (npcDuel) c.send(0x428a, new W().u32(1).bytes());
  return true;
}
