// The server namespace (py run.py globals / yo2srv Server): config, state, hub and the cross-module functions.
// Handlers are synchronous and run one at a time (World.run), so py's thread-local CTX.sess is a plain field here.
import type { Conn } from "../net/conn.ts";
import { ACAD_KINDS_SET, GAME_PORT, GATE_PORT, LOBBY_PORT, ROOM_KINDS, ROOM_PORT_BASE, DUEL_PORT, type Config } from "../config.ts";
import type { World } from "../world.ts";
import { Hub, type Session } from "./hub.ts";
import { ACCT_KEYS, HUB_KEYS, MAX_SAVED_ACCOUNTS, Store, type State } from "./store.ts";
import { PyRandom } from "../util/pyrandom.ts";
import type { Npc } from "./npcs.ts";
import type { Lobby } from "./lobby.ts";

/** What the lobby needs from the PvP matches (py pvp_match.Matches); ported with the PvP module. */
export interface PvpLike { byPid(pid: number): unknown; reserve(a: Session, b: Session): void; watchRequest(peer: string, pid: number): unknown }
export interface NpcWatchLike { watchRequest(peer: string, pid: number): unknown; forget(peer: string): void }
import { Clock } from "../util/clock.ts";
import AUTO from "../data/auto_replies.json";

type AutoRep = { id: string; name: string | null; n: number; hex?: string };

/** py SIN_SESION: a game connection without a session. load/save throw; my_pid() is 0. */
export const NO_SESSION = Symbol("no session");
export class NoSession extends Error {}
export type Ctx = Session | typeof NO_SESSION | null; // null = owner / console context (py: CTX.sess None outside net threads)

export class Game {
  readonly hub: Hub;
  readonly rng: PyRandom;
  readonly ports = { gate: GATE_PORT, game: GAME_PORT, lobby: LOBBY_PORT, roomBase: ROOM_PORT_BASE, duel: DUEL_PORT };
  readonly roomKinds = ROOM_KINDS;
  readonly acadKinds = ACAD_KINDS_SET;
  /** py CTX.sess: the session of the message being handled. */
  ctx: Ctx = null;
  readonly NO_SESSION: typeof NO_SESSION = NO_SESSION;
  readonly clock = new Clock();
  /** py PH (persistence handlers) and the id tables PH_GAME / PH_LOBBY that route to them. */
  ph: Record<string, (c: Conn, data: Uint8Array) => unknown> | null = null;
  phGame = new Map<number, string>([[0x3010, "h_playerlist"], [0x3100, "h_gettrunk"], [0x3114, "h_getpbin"]]);
  phLobby = new Map<number, string>([[0x4100, "h_pselect"], [0x4902, "h_pack_open"], [0x5400, "h_sd_get"],
    [0x5204, "h_itemget"], [0x4174, "h_title"], [0x4170, "h_avatar"]]);

  // ---- cross-module names (py namespace), wired by server.ts
  npcs: Npc[] = [];
  npcSex = new Map<number, string | null>();
  avState = { world: 1 };
  /** py LOBBY_ROOM: the lobby connection of the last NPC challenge (duelfin sends the results through it). */
  lobbyRoom: { c: Conn | null } = { c: null };
  lp!: Lobby;
  pvp: PvpLike | null = null;
  /** The duel port 5760 (src/duel/port.ts), set by installDuel. */
  duel: import("../duel/port.ts").DuelPort | null = null;
  nw: NpcWatchLike | null = null;
  eq: import("./teams.ts").Teams | null = null;
  tp: import("./trade.ts").Trades | null = null;
  to: import("./tournaments.ts").Tournaments | null = null;
  /** PvP hook for tournaments (py torneos._hook_match): onFinish(winner pid | "draw"), onClose(present pids). */
  pvpHookMatch: ((m: unknown, onFinish: (w: number | "draw") => void, onClose: (present: number[]) => void) => void) | null = null;
  pvpByPid: (pid: number) => boolean = (pid) => !!this.pvp?.byPid(pid);
  lpOnClose: ((c: Conn) => void) | null = null;
  blockPlayer!: (pid: number, name?: string | null, sess?: Session | null) => Uint8Array;
  gameReply!: (c: Conn, msgId: number, param: number, data: Uint8Array) => void;
  onConnClosed!: (c: Conn, why?: string) => void;
  duelBegin: (c: Conn, rival: number, mode: number) => void = (c) => { this.lobbyRoom.c = c; };
  duelParts!: (rival: number | null, world?: number) => Uint8Array;
  shopPurchase!: (kind: number, id: number, n: number) => [number, number][];
  shopCatalog!: () => Uint8Array[];
  shopBuy!: (c: Conn, data: Uint8Array) => void;
  selectpack: ((c: Conn, data: Uint8Array, base: () => boolean) => boolean) | null = null;
  lpCards!: (pack: number, n: number) => number[];
  admin!: import("./admin.ts").Admin;
  /** py research/mundo GM accounts. */
  isGm(acct: string | null): boolean { return this.admin.isGm(acct); }

  /** py research/mundo _acct_of: the account of the message being handled (the owner's without a session). */
  ctxAcct(): string | null {
    const s = this.ctx;
    return (s && s !== NO_SESSION ? s.acct : null) || this.cfg.ownerAcct;
  }

  /** Runs fn as session s (py: old = CTX.sess; CTX.sess = s; ...; finally CTX.sess = old). */
  withCtx<T>(s: Ctx, fn: () => T): T {
    const old = this.ctx;
    this.ctx = s;
    try { return fn(); } finally { this.ctx = old; }
  }

  /** py cur_world: the world (0 Domino, 1 Academia) of this session's last 0x4170. */
  curWorld(): number {
    const s = this.ctx;
    const w = s && s !== NO_SESSION ? s.world : null;
    return w ?? this.avState.world;
  }

  constructor(readonly cfg: Config, readonly world: World, readonly store: Store, readonly log: (s: string) => void) {
    this.hub = new Hub(this);
    this.rng = new PyRandom(cfg.paritySeed ?? undefined);
  }

  /** py: CTX.sess = c.sess or SIN_SESION before each handler. */
  enter(c: Conn): void { this.ctx = (c.sess as Session | null) ?? NO_SESSION; }

  curSess(): Ctx { return this.ctx; }

  private isOwnerCtx(s: Ctx = this.ctx): boolean {
    if (s === null) return true;
    if (s === NO_SESSION) return false;
    return s.owner;
  }

  // ---- py cuentas/sesion.py: the account view of the current session over state.json
  loadState(): State {
    const s = this.ctx;
    if (s === NO_SESSION) throw new NoSession("connection without a session: no profile is read");
    if (this.isOwnerCtx(s)) return this.store.loadRaw();
    // copies only the root and this account (not every registered one): store.ts commit
    const raw = this.store.peek();
    const a = raw.accounts?.[s!.acct] ?? { idx: s!.idx };
    const v: State = {};
    for (const [k, x] of Object.entries(raw)) if (!ACCT_KEYS.includes(k) && !HUB_KEYS.includes(k)) v[k] = x;
    for (const k of ACCT_KEYS) if (k in a) v[k] = a[k];
    const out: State = JSON.parse(JSON.stringify(v));
    out.players ??= {};
    out._acct = s!.acct;
    return out;
  }

  saveState(st: State): void {
    if (!st._acct && this.ctx === NO_SESSION) throw new NoSession("connection without a session: the root is not saved");
    const acct: string | undefined = st._acct;
    if (acct) {
      // copy-on-write: the root keys of the view (the owner's ACCT_KEYS and the HUB_KEYS stay as they are) and this
      // account's ACCT_KEYS; root keys the view dropped are deleted, as the whole-state save did
      const raw = this.store.peek();
      const root: Record<string, unknown> = {};
      for (const k of Object.keys(raw)) if (!ACCT_KEYS.includes(k) && !HUB_KEYS.includes(k) && !(k in st)) root[k] = undefined;
      for (const [k, x] of Object.entries(st)) if (k !== "_acct" && !HUB_KEYS.includes(k) && !ACCT_KEYS.includes(k)) root[k] = x;
      const entry: State = { ...(raw.accounts?.[acct] ?? {}) };
      for (const k of ACCT_KEYS) if (k in st) entry[k] = st[k];
      this.store.commit(root, { [acct]: entry });
      return;
    }
    const disk = this.store.loadRaw();
    const out: State = {};
    for (const [k, x] of Object.entries(st)) if (k !== "_acct" && !HUB_KEYS.includes(k)) out[k] = x;
    if (acct) {
      for (const k of ACCT_KEYS) { delete out[k]; if (k in disk) out[k] = disk[k]; }
      const accts = (disk.accounts ??= {});
      const entry = (accts[acct] ??= {});
      for (const k of ACCT_KEYS) if (k in st) entry[k] = st[k];
    }
    for (const k of HUB_KEYS) {
      if (k in disk) out[k] = disk[k];
      else if (k in st && !acct) out[k] = st[k];
    }
    this.store.saveRaw(out);
  }

  /** py red/auto.auto_reply: the default reply that unblocks a request (data zeroed), false if none is known. */
  autoReply(c: Conn, msgId: number): boolean {
    const reps = (AUTO as Record<string, AutoRep[]>)["0x" + msgId.toString(16).padStart(4, "0")];
    if (!reps || !reps.length) return false;
    for (const r of reps) {
      const body = r.hex ? new Uint8Array(Buffer.from(r.hex, "hex")) : new Uint8Array(r.n);
      this.log(`[srv:${c.port}] auto 0x${msgId.toString(16).padStart(4, "0")} -> ${r.id} ${r.name}`);
      c.send(parseInt(r.id, 16), body);
    }
    return true;
  }

  /** py register_account: (index, owner?) of an account; recorded the first time. */
  registerAccount(acct: string, userId: string | null = null): [number | null, boolean] {
    const st = this.store.peek();
    let owner: string | null = st.owner_acct ?? null;
    if (owner === null && acct === this.cfg.ownerAcct) owner = acct;
    if (acct === owner) {
      if (st.owner_acct !== acct) { this.store.commit({ owner_acct: acct }); this.log(`[cuentas] ${acct} is the owner's account`); }
      return [0, true];
    }
    const accts: State = st.accounts ?? {};
    if (acct in accts) return [Number(accts[acct].idx ?? 1), false];
    if (this.cfg.loginStrict && userId === null) { this.log(`[cuentas] account ${acct.slice(0, 6)}… does not exist (strict login)`); return [null, false]; }
    // py's state.json cap applies to legacy logins only; DE accounts live in D1
    if (userId === null && Object.keys(accts).length >= MAX_SAVED_ACCOUNTS) { this.log(`[cuentas] limit of ${MAX_SAVED_ACCOUNTS} accounts: ${acct} refused`); return [null, false]; }
    const idx = 1 + Math.max(0, ...Object.values(accts).map((a: any) => Number(a.idx ?? 0)));
    this.store.commit({}, { [acct]: { idx, players: {}, profiles: {}, active_slot: 0, ...(userId !== null ? { user_id: userId } : {}) } });
    this.log(`[cuentas] new account ${acct}: index ${idx}`);
    return [idx, false];
  }
}
