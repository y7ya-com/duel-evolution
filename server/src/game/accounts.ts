// The accounts port 5731 (py yo2srv/cuentas/personajes.py game_reply and the base 0x30xx handlers). With persistence
// loaded (always, here), PLAYERLIST / trunk / PBIN come from the saved profile (persist.ts, py PH_GAME).
import type { Conn } from "../net/conn.ts";
import { cstr, W } from "../net/proto.ts";
import type { Game } from "./game.ts";
import { AUTH_SERVER_FULL, type Session } from "./hub.ts";
import { WIRE_UNUSED_DP } from "./persist.ts";

export const PROFILES_ARCHIVE_MAX = 10;

/** py personajes.archive_profile: moves a slot's profile to state.profiles_borrados. */
export function archiveProfile(g: Game, st: any, slot: string, why: string): any {
  const p = st.profiles?.[slot];
  if (p === undefined) return null;
  delete st.profiles[slot];
  const arch: any[] = (st.profiles_borrados ??= []);
  arch.push({ slot: String(slot), motivo: why, fecha: g.clock.strftime(), perfil: p });
  arch.splice(0, Math.max(0, arch.length - PROFILES_ARCHIVE_MAX));
  g.log(`[perfil] slot ${slot} (${p.name || "-"}): profile archived (${why})`);
  return p;
}

/** Whether a character anywhere (any account, any slot but this account's `slot`) already has this name, ignoring
 *  case: new names are unique. Names given before this rule stay as they are (only creating one is checked). */
export function nameTaken(g: Game, name: string, acct: string | null, slot: string): boolean {
  const key = name.trim().toLowerCase();
  const raw = g.store.peek();
  const lists: [string | null, Record<string, string>][] = [[raw.owner_acct ?? g.cfg.ownerAcct, raw.players ?? {}],
    ...Object.entries(raw.accounts ?? {}).map(([a, v]: [string, any]) => [a, v?.players ?? {}] as [string, Record<string, string>])];
  return lists.some(([a, players]) => Object.entries(players).some(([k, n]) => !(a === acct && k === slot) && String(n ?? "").trim().toLowerCase() === key));
}
/** 0x3022 for a refused name: no 2008 text is mapped for it yet, so the client shows its generic error. */
export const REG_NAME_TAKEN = -1;

export function regplayer(g: Game, c: Conn, data: Uint8Array): void {
  const name = data.length > 1 ? cstr(data.subarray(1, 17)) : "";
  const st = g.loadState();
  const slot = data.length ? String(data[0]) : "0";
  const old = st.profiles?.[slot];
  if ((old?.name ?? st.players?.[slot]) !== name && (!name.trim() || nameTaken(g, name, st._acct ?? null, slot))) {
    g.log(`[cuentas] 0x3020 slot ${slot}: the name ${JSON.stringify(name)} is ${name.trim() ? "taken" : "empty"}: refused`);
    c.send(0x3022, new W().u32(REG_NAME_TAKEN).bytes());
    return;
  }
  if (old != null && old.name && old.name !== name) archiveProfile(g, st, slot, "crear");
  (st.players ??= {})[slot] = name;
  g.saveState(st);
  c.send(0x3022, new W().u32(0).bytes());
}

export function delplayer(g: Game, c: Conn, data: Uint8Array): void {
  if (!data.length) g.log(`[srv:${c.port}] 0x3030 without a slot: nothing deleted`);
  else {
    const st = g.loadState();
    const slot = String(data[0]);
    delete (st.players ??= {})[slot];
    archiveProfile(g, st, slot, "borrar");
    g.saveState(st);
  }
  c.send(0x3032, new W().u32(0).bytes());
}

/** py my_slot / my_pid / my_name: the active character of the current session. */
export function mySlot(g: Game, st?: any): number {
  try { st ??= g.loadState(); return (Number(st.active_slot ?? 0) | 0) & 3; } catch { return 0; }
}

export function myPid(g: Game, st?: any): number {
  const s = g.curSess();
  if (s === g.NO_SESSION) return 0;
  if (s !== null && s.pid !== null && st === undefined) return s.pid;
  return g.hub.pidFor(s as Session | null, mySlot(g, st));
}

export function myName(g: Game, st?: any): string {
  try {
    st ??= g.loadState();
    const slot = String(mySlot(g, st));
    return st.players?.[slot] || st.profiles?.[slot]?.name || "Duelista";
  } catch { return "Duelista"; }
}

/** py game_reply: the accounts server (5731). */
export function gameReply(g: Game, c: Conn, msgId: number, param: number, data: Uint8Array): void {
  if (msgId === 0x0005) { // heartbeat: the client cuts if nothing arrives in 120 s
    if (c.port === g.ports.game) c.send(0x3113);
    return;
  }
  if (msgId === 0x3001) c.send(0x3002);
  else if (msgId === 0x3003) {
    if (g.hub.login(c, data) === null) {
      if (!c.closed) g.hub.reject(c, AUTH_SERVER_FULL, "");
      return;
    }
    g.ctx = c.sess as Session;
    c.send(0x3004, new W().u32(0).u32(1 | ((Number(c.ext.adminFlags) || 0) & 0x60)).s("ESP", 4).bytes());
  } else if (g.ph && g.phGame.has(msgId)) {
    g.ph[g.phGame.get(msgId)!](c, data);
  } else if (msgId === 0x3010) {
    // without persistence (never here): PLAYERLIST from the players map
    g.log(`[srv:${c.port}] 0x3010 without persistence`);
  } else if (msgId === 0x3110) c.send(0x3111, new W().u32(WIRE_UNUSED_DP.passes).bytes());
  else if (msgId === 0x3020) regplayer(g, c, data);
  else if (msgId === 0x3030) delplayer(g, c, data);
  else if (msgId !== 0x0003 && msgId !== 0x0005 && !g.autoReply(c, msgId)) {
    g.log(`[srv:${c.port}] ** no answer yet: 0x${msgId.toString(16).padStart(4, "0")}`);
  }
  void param;
}
