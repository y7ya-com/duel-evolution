// Moderation and admin (py yo2srv/admin/moderacion.py + gestion.py, the parts that reach the wire): login bans
// (0x3004 −246), GM accounts (research/mundo), sanction bits of 0x3004, shop prices, and the admin actions the
// WorldDO exposes on its token-protected HTTP API (src/do.ts /__admin/*).
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import * as PP from "./persist.ts";
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";

export const AUTH_BANNED = -246;
const REJECT_CLOSE_S = 1.5;

export interface AdminData {
  /** What a new character starts with (mp, trunk mode). */
  start: { mp?: number; baul?: string };
  bans: Map<string, { reason: string; since: string }>;
  gm: Map<string, { note: string; since: string }>;
  flags: Map<string, number>;
  prices: Record<string, number>;
}

export const emptyAdmin = (): AdminData => ({ start: {}, bans: new Map(), gm: new Map(), flags: new Map(), prices: {} });

/** Persists admin changes (D1 tables admin_bans/admin_gm/admin_flags/shop_prices); a no-op until D1 is wired. */
export type AdminSink = (table: "bans" | "gm" | "flags" | "prices" | "start", key: string, value: unknown | null) => void;

export class Admin {
  sink: AdminSink = () => {};
  constructor(private g: Game, readonly data: AdminData = emptyAdmin()) {}

  isBanned(acct: string | null) { return !!acct && this.data.bans.has(acct); }
  isGm(acct: string | null) { return !!acct && this.data.gm.has(String(acct)); }
  flagsOf(acct: string | null) { return (acct && this.data.flags.get(acct)) || 0; }

  /** py moderacion login hook: a banned account gets 0x3004 −246 and the connection closes 1.5 s later. */
  vetoLogin(c: Conn, acct: string): boolean {
    if (!this.isBanned(acct)) return false;
    this.g.log(`[AVISO] [admin] banned account ${acct.slice(0, 6)}… tries to log in (port ${c.port}): 0x3004 −246`);
    c.send(0x3004, new W().u32(AUTH_BANNED).u32(0).s("ESP", 4).bytes());
    void c.closeAfterFlush();
    setTimeout(() => this.g.world.close(c, "banned"), REJECT_CLOSE_S * 1000);
    return true;
  }

  // ---- admin actions (HTTP API)
  private now() { return this.g.clock.strftime().slice(0, 16); }

  ban(acct: string, reason = "") {
    const v = { reason, since: this.now() };
    this.data.bans.set(acct, v); this.sink("bans", acct, v);
    this.kick(acct, "banned");
  }
  unban(acct: string) { this.data.bans.delete(acct); this.sink("bans", acct, null); }
  setGm(acct: string, on: boolean, note = "") {
    if (on) { const v = { note, since: this.now() }; this.data.gm.set(acct, v); this.sink("gm", acct, v); }
    else { this.data.gm.delete(acct); this.sink("gm", acct, null); }
  }
  setFlags(acct: string, flags: number) { this.data.flags.set(acct, flags & 0x60); this.sink("flags", acct, flags & 0x60); }
  setPrice(key: string, mp: number | null) {
    if (mp === null) delete this.data.prices[key]; else this.data.prices[key] = mp;
    this.sink("prices", key, mp);
  }

  /** Closes every connection of that account's session. */
  kick(acct: string, why = "kicked from the admin"): number {
    const s = this.g.hub.sessions.get(acct);
    if (!s) return 0;
    const conns = new Set<Conn>([...s.conns.values(), ...(s.lobby ? [s.lobby] : [])]);
    for (const c of conns) this.g.world.close(c, why);
    return conns.size;
  }

  /** py LP.maintenance_notice: 0x4700 MAINTENOTICE (s32 seconds left) to every lobby connection. */
  maintenance(seconds: number): number {
    const data = new W().u32(Math.max(0, Math.floor(seconds))).bytes();
    let n = 0;
    for (const s of this.g.hub.sessions.values()) if (s.lobby && this.g.lp.post(s.lobby, 0x4700, data)) n++;
    return n;
  }

  /** The owner's "reset everyone" for characters that haven't logged in since progression (still on the pre-progression
   *  trunk, prog < 1): what their next login does (persist progressionReset), done now so the WorldDO's cold boot
   *  doesn't carry their 3211-card trunks (2026-10-29: 64k of 65k trunk rows). Saved as one state, written to D1. */
  resetDormant(): number {
    const st = this.g.store.loadRaw();
    let n = 0;
    for (const a of Object.values(st.accounts ?? {}) as any[])
      for (const p of Object.values(a?.profiles ?? {}) as any[]) if (p && typeof p === "object" && PP.progressionReset(p)) n++;
    if (n) { this.g.store.saveRaw(st); this.g.log(`[economia] admin: ${n} dormant characters reset to the starting state (progression)`); }
    return n;
  }

  /** A server line in every lobby's chat (0x4402 kind 1, the server-wide chat) from "Duel Evolution": the deploy
   *  warning (scripts/deploy.sh). Returns the lobbies it reached. */
  announce(text: string): number {
    const t = text.slice(0, 120);
    const msg = new W().u8(0).u8(1).u32(0).u32(2).s("Duel Evolution", 16).s(t, t.length + 1).bytes();
    let n = 0;
    for (const s of this.g.hub.sessions.values()) if (s.lobby && this.g.lp.post(s.lobby, 0x4402, msg)) n++;
    return n;
  }

  /** A signed-in user claims an imported legacy account (src/auth claim flow). The DO is single-threaded, so the
   *  user_id-null check is the atomic guard. A user who already owns an account with characters can't claim another;
   *  an empty u:<userId> left by a first game login is dropped (its session closed). */
  claim(acct: string, userId: string): "ok" | "no_account" | "taken" | "has_account" {
    const st = this.g.store.loadRaw();
    const a = st.accounts?.[acct];
    if (!a) return "no_account";
    if (a.user_id) return a.user_id === userId ? "ok" : "taken";
    const mine = this.g.store.accountOfUser(userId);
    if (mine) {
      if (Object.keys(st.accounts[mine].players ?? {}).length) return "has_account";
      delete st.accounts[mine];
      this.kick(mine, "account replaced by a claimed one");
      this.g.hub.sessions.delete(mine);
    }
    a.user_id = userId;
    this.g.store.saveRaw(st);
    return "ok";
  }

  status() {
    const players = [...this.g.hub.sessions.values()].map((s: Session) => ({ acct: s.acct, pid: s.pid, name: s.name, block: s.block,
      online: [...s.conns.values(), s.lobby].some((c) => c && !c.closed) }));
    return { players, bans: this.data.bans.size, gm: this.data.gm.size, tournament: this.g.to?.tour ? this.g.to.tour.state : null };
  }

  /** The admin HTTP API (POST /__admin/<action> with a JSON body). */
  run(action: string, body: Record<string, any>): unknown {
    switch (action) {
      case "status": return this.status();
      case "ban": this.ban(String(body.acct), String(body.reason ?? "")); return { ok: true };
      case "unban": this.unban(String(body.acct)); return { ok: true };
      case "kick": return { closed: this.kick(String(body.acct)) };
      case "gm": this.setGm(String(body.acct), body.on !== false, String(body.note ?? "")); return { ok: true };
      case "flags": this.setFlags(String(body.acct), Number(body.flags) || 0); return { ok: true };
      case "price": this.setPrice(String(body.key), body.mp == null ? null : Number(body.mp)); return { ok: true };
      case "maintenance": return { sent: this.maintenance(Number(body.seconds) || 0) };
      case "announce": return { sent: this.announce(String(body.text ?? "")) };
      case "reset-dormant": return { reset: this.resetDormant() };
      case "online": return { online: this.status().players.filter((p) => p.online).length };
      case "tournament": { const t = this.g.to!.startTournament(body.serial ?? 1, body.day ?? 1, body.name ?? "CHAMPIONSHIP", body.max ?? 8); return { state: t.state }; }
      case "claim": return { result: this.claim(String(body.acct), String(body.userId)) };
      case "start": { this.data.start = body.start ?? {}; this.sink("start", "start", this.data.start); return { ok: true }; }
      case "event": return { sent: this.g.to!.pushEvent(body.state ?? null, body.world ?? 6, body.serial ?? 1) };
      default: throw new Error(`unknown admin action ${action}`);
    }
  }
}
