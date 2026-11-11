// Tournaments (SCENE_TOURNAMENT: JoinGunsling, the bracket, the end result) and the event state (EVENTINFO), decoded as
// server/src/game/tournaments.ts encodes them. The lobby carries them; the client asks with empty 0x51xx requests
// (STATUS and REQENTRY also enter the tournament while its entry is open: the server's AUTO_ENTRY). A pairing is the
// server's AUTODUELSTART 0x43a0 then DUELSERVER 0x4306: the normal duel offer (session.ts), so the duel flow is the PvP one.
import { BinaryReader, latin1 } from './codec';

export const TM = {
  EVENTINFO: 0x5000, INFO: 0x5100, START: 0x5101, END: 0x5102, LOTTERY: 0x5103, LOTRESULT: 0x5104, PHASE: 0x5105, ROUND: 0x5106,
  REQENTRY: 0x5107, ENTRY_START: 0x5108, ENTRY_DATA: 0x5109, ENTRY_END: 0x5110, LIST: 0x5111, ENDRESULT: 0x5112, TIMER: 0x5113,
  PCOUNTER: 0x5114, STATUS: 0x5115, CHKDUELSTART: 0x5120, AUTODUELSTART: 0x43a0,
} as const;
/** What the client asks for, in the order the original's JoinGunsling / bracket scene refreshes. */
export const TOURNAMENT_REQUESTS = [TM.STATUS, TM.INFO, TM.TIMER, TM.PCOUNTER, TM.REQENTRY, TM.LIST, TM.ENDRESULT] as const;
/** The server's tournament states (tournaments.ts ST). */
export const TOUR_STATE = { NONE: 0, STANDBY: 1, ENTRY: 4, MATCHING: 5, OPEN: 6, PHASE: 7, ROUND: 8, END: 9 } as const;
export const TOUR_STATE_TEXT: Record<number, string> = { 0: 'No tournament', 1: 'No tournament', 4: 'Entry open', 5: 'Drawing lots', 6: 'Opening',
  7: 'Starting', 8: 'In progress', 9: 'Finished' };
export const SUBTITLE_TEXT: Record<number, string> = { 0: '', 1: 'Round', 2: 'Quarterfinal', 3: 'Semifinal', 4: 'Final' };

export interface TournamentEntry { pid: number; name: string; wins: number; playing: boolean }
export interface BracketSeat { pid: number; wins: number; playing: boolean; alive: boolean }
export interface TournamentResult { serial: number; name: string; day: number; entries: number; rounds: number; champion: string; runnerUp: string }
export interface TournamentState {
  serial: number; name: string; day: number; maxPlayers: number; totalRounds: number;
  state: number; phase: number; round: number; subtitle: number;
  /** Seconds left on the server's clock when TIMER arrived, and when that was (ms). */
  seconds: number; timerAt: number;
  alive: number; entries: number; audience: number;
  entryList: TournamentEntry[];
  /** Bracket pages (8 seats each) in order, from LIST. */
  bracket: BracketSeat[];
  /** LOTRESULT: drawn in (true), not (false), unknown (null). */
  drawn: boolean | null;
  lottery: boolean; roundOn: boolean;
  /** A pairing's opponent (AUTODUELSTART while a tournament runs). */
  opponent: { pid: number; name: string } | null;
  /** CHKDUELSTART 1: the opponent did not come; this player goes through. */
  walkover: boolean;
  result: TournamentResult | null;
  /** START seen since END (the server is running one now). */
  running: boolean;
}
export interface EventInfo { serial: number; world: number; state: number }

export function emptyTournament(): TournamentState {
  return { serial: 0, name: '', day: 0, maxPlayers: 0, totalRounds: 0, state: 0, phase: 0, round: 0, subtitle: 0, seconds: 0, timerAt: 0,
    alive: 0, entries: 0, audience: 0, entryList: [], bracket: [], drawn: null, lottery: false, roundOn: false, opponent: null, walkover: false,
    result: null, running: false };
}
export function isTournamentMessage(id: number): boolean { return id >= TM.INFO && id <= TM.STATUS || id === TM.CHKDUELSTART; }

export function decodeEventInfo(data: Uint8Array): EventInfo {
  const r = new BinaryReader(data); return { serial: r.u32(), world: r.u32(), state: r.u32() };
}
export function decodeEntries(data: Uint8Array): TournamentEntry[] {
  const out: TournamentEntry[] = [];
  for (let at = 0; at + 42 <= data.length; at += 42) {
    const r = new BinaryReader(data.subarray(at, at + 42)), pid = r.u32(), name = r.s(16), wins = r.u8(), status = r.u8();
    out.push({ pid, name, wins, playing: status === 1 });
  }
  return out;
}
/** One LIST chunk: its header, then pages of a count, a pad and 8 seats (pid, bits: wins & 0x3f, 0x40 playing, 0x80 alive). */
export function decodeList(data: Uint8Array): { phase: number; chunk: number; seats: BracketSeat[] } {
  const r = new BinaryReader(data); r.u32(); r.u32(); r.u32(); const phase = r.u32(), chunk = r.u8(), seats: BracketSeat[] = [];
  while (r.remaining >= 50) {
    const count = r.u8(); r.u8();
    for (let i = 0; i < 8; i++) { const pid = r.u32(), bits = r.u16(); if (i < count) seats.push({ pid, wins: bits & 0x3f, playing: !!(bits & 0x40), alive: !!(bits & 0x80) }); }
  }
  return { phase, chunk, seats };
}
export function decodeResult(data: Uint8Array): TournamentResult {
  const r = new BinaryReader(data), serial = r.u32(), name = latin1(r.bytes(100)), day = r.u32(), entries = r.u32(), rounds = r.u32(), champion = r.s(16); r.u32();
  return { serial, name, day, entries, rounds, champion, runnerUp: r.s(16) };
}

/** Folds one tournament message into the state (a new object when it changed). LIST chunks 1..3 add to chunk 0's seats. */
export function reduceTournament(prev: TournamentState, id: number, data: Uint8Array, now = Date.now()): TournamentState {
  const t = { ...prev }, r = new BinaryReader(data);
  switch (id) {
    case TM.INFO: t.serial = r.u32(); t.name = latin1(r.bytes(100)); t.day = r.u32(); r.u32(); r.u32(); t.maxPlayers = r.u32(); t.totalRounds = r.u32(); break;
    case TM.START: return { ...emptyTournament(), running: true };
    case TM.END: t.running = false; t.opponent = null; break;
    case TM.LOTTERY: r.u32(); t.lottery = r.u8() === 1; break;
    case TM.LOTRESULT: t.drawn = r.u8() === 1; break;
    case TM.PHASE: t.phase = r.u32(); break;
    case TM.ROUND: t.phase = r.u32(); t.round = r.u32(); t.roundOn = r.u8() === 1; if (!t.roundOn) { t.opponent = null; t.walkover = false; } break;
    case TM.ENTRY_START: t.entryList = []; break;
    case TM.ENTRY_DATA: t.entryList = [...t.entryList, ...decodeEntries(data)]; break;
    case TM.ENTRY_END: break;
    case TM.LIST: { const l = decodeList(data); t.phase = l.phase; t.bracket = l.chunk === 0 ? l.seats : [...t.bracket, ...l.seats]; break; }
    case TM.ENDRESULT: t.result = decodeResult(data); break;
    case TM.TIMER: t.seconds = r.u32(); t.timerAt = now; break;
    case TM.PCOUNTER: r.u32(); r.u32(); t.alive = r.u32(); t.entries = r.u32(); t.audience = r.u32(); break;
    case TM.STATUS: { const serial = r.u32(); t.day = r.u32(); t.state = r.u32(); t.phase = r.u32(); r.u32(); t.round = r.u32(); t.subtitle = r.u8();
      if (serial) t.serial = serial; t.running = t.state >= TOUR_STATE.ENTRY && t.state < TOUR_STATE.END; break; }
    case TM.CHKDUELSTART: t.walkover = r.u8() === 1; break;
    default: return prev;
  }
  return t;
}
/** AUTODUELSTART (42 bytes: pid, name 16, level u8, title u16, u16, parts 16, mode): the pairing's opponent. */
export function decodeAutoDuel(data: Uint8Array): { pid: number; name: string; mode: number } {
  const r = new BinaryReader(data), pid = r.u32(), name = r.s(16); r.u8(); r.u16(); r.u16(); r.bytes(16);
  return { pid, name, mode: r.u8() };
}
/** Seconds left now, from the last TIMER. */
export function secondsLeft(t: TournamentState, now = Date.now()): number {
  return Math.max(0, t.seconds - Math.floor((now - t.timerAt) / 1000));
}
