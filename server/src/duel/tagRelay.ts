// Casual 2v2 relay: each team shares its captain's deck, field and LP. The pilot changes on that team's next turn.
// Reuses the MR1 match engine, public spectator stream and server clocks; a partner never gets decision authority.
import type { Game } from "../game/game.ts";
import type { Session } from "../game/hub.ts";
import type { Conn } from "../net/conn.ts";
import { W } from "../net/proto.ts";
import * as PP from "../game/persist.ts";
import { isFree } from "../game/freemode.ts";
import * as DFM from "./duelfin.ts";
import { Matches, PvpMatch, watchOculta } from "./pvpMatch.ts";
import { Sender, type SItem } from "./ocgSession.ts";
import { X } from "./port.ts";

type Four<T> = [T, T, T, T];
const enc = new TextDecoder("latin1");
const hex = (b: Uint8Array) => [...b].map(v => v.toString(16).padStart(2, "0")).join("");
const services = new WeakMap<Game, TagRelays>();
const EMPTY = new Uint8Array();
const READY = 0x61fe;
const decision = (x: SItem) => {
  const m = x instanceof Uint8Array ? [0x6202, x] as const : Array.isArray(x) ? x : null;
  return !!m && ([0x6610, 0x6611, 0x6612].includes(m[0]) || (m[0] === 0x6202 && watchOculta(m[1])));
};
function notice(c: Conn | null, text: string) {
  c?.post(0x4402, new W().u8(0).u8(0).u32(0).u32(0).s("System", 16).raw(new TextEncoder().encode(`[Tag] ${text}\0`)).bytes());
}

export class TagRelayMatch extends PvpMatch {
  readonly seats: Four<Session>;
  readonly sockets: Four<Conn | null> = [null, null, null, null];
  readonly senders: Four<Sender | null> = [null, null, null, null];
  readonly relayReady = [false, false, false, false];
  readonly active = [0, 1];
  private turns = [0, 0];
  private observed: unknown = null;
  private identitySent = new WeakMap<Conn, string>();
  private readyData: Uint8Array[] = [EMPTY, EMPTY];
  private initial: SItem[][] = [[], []];
  constructor(hub: Matches, seats: Four<Session>, readonly dropRelay: () => void) {
    super(hub, seats[0], seats[1], "room");   // unranked (ranking.ts isRankedOrigin)
    this.seats = seats;
    this.matchStyle = null; // single casual game; no ranked rewards or match side decking
  }
  override attach(c: Conn): boolean {
    const seat = this.seats.indexOf(c.sess as Session);
    if (this.done || seat < 0 || this.sockets[seat]) return false;
    const team = seat % 2;
    this.sockets[seat] = c;
    this.senders[seat] = new Sender(c, this.g, this.hub.pause);
    if (seat < 2) super.attach(c);
    Object.assign(X(c), { pvp: this, pvpI: team });
    if (seat >= 2) this.senders[seat]!.put(this.initial[team]);
    // Both teammates receive the same team view. Only the pilot receives action menus and prompts.
    this.tx[team] = { put: (msgs: readonly SItem[]) => this.broadcast(team, msgs) } as any;
    return true;
  }
  private observeTurns() {
    const stats = this.ps?.stats;
    if (!stats || this.observed === stats) return;
    this.observed = stats;
    const feed = stats.feedMany.bind(stats);
    stats.feedMany = evs => {
      feed(evs);
      for (const e of evs) if (e.ev === "msg" && e.type === "NEW_TURN" && (e.player === 0 || e.player === 1)) {
        const team = e.player as number;
        this.active[team] = team + 2 * (this.turns[team]++ % 2);
        this.identities();
      }
    };
  }
  private broadcast(team: number, msgs: readonly SItem[]) {
    this.observeTurns();
    if (!this.ps?.started) this.initial[team].push(...msgs.filter(x => !(typeof x === "object" && "fn" in x)));
    this.rec().note(team, msgs);
    for (const seat of [team, team + 2]) {
      const out = this.ps?.started && !this.ps.over && this.active[team] !== seat ? msgs.filter(x => !decision(x)) : msgs;
      // Functions target lobbies or advance match state and must execute just once, even when a team has two clients.
      this.senders[seat]?.put(seat === team ? out : out.filter(x => !(typeof x === "object" && "fn" in x)));
    }
  }
  /** Server-only channel 10: byte-encoded identity records, consumed by the client relay hook. */
  override watchPump(): void { super.watchPump(); this.identities(true); }
  identities(watchersOnly = false) {
    const recipients = [
      ...(!watchersOnly ? this.seats.map((s, seat) => ({ lobby: s.lobby, team: seat % 2, self: seat < 2 ? 0 : 1 })) : []),
      ...this.watchers.map(w => ({ lobby: (w.c.sess as Session | null)?.lobby ?? null, team: 0, self: 255 })),
    ];
    for (const { lobby, team, self } of recipients) {
      if (!lobby || lobby.closed) continue;
      const order = [team, team + 2, 1 - team, 3 - team];
      const w = new W().u8(this.active[team] === team ? 0 : 1).u8(this.active[1 - team] === 1 - team ? 0 : 1).u8(self);
      for (const j of order) {
        const s = this.seats[j];
        w.u32(s.pid!).s(s.name, 16);
        this.g.withCtx(s, () => { w.raw(this.g.duelParts(null, 0)).raw(this.g.duelParts(null, 1)); });
      }
      const text = `TAG1:${hex(w.bytes())}\0`;
      if (this.identitySent.get(lobby) === text) continue;
      this.identitySent.set(lobby, text);
      lobby.post(0x4402, new W().u8(0).u8(10).u32(0).u32(0).s("", 16).raw(new TextEncoder().encode(text)).bytes());
    }
  }
  override on(c: Conn, mid: number, param: number, data: Uint8Array): void {
    if (X(c).pvpW) { super.on(c, mid, param, data); return; }
    const seat = this.sockets.indexOf(c);
    if (seat < 0 || this.done) return;
    const team = seat % 2;
    if (mid === 0x0005) { c.send(0x0004, new W().u32(0).bytes()); return; }
    if (seat >= 2 && mid === 0x6001) { c.send(0x6007, new W().u32(1).bytes()); return; }
    if (mid === READY) {
      if (this.relayReady[seat]) return;
      this.relayReady[seat] = true;
      if (seat < 2) this.readyData[seat] = data.slice();
      if (this.relayReady.every(Boolean)) {
        this.identities();
        for (const t of [0, 1]) super.on(this.c[t]!, mid, param, this.readyData[t]);
      }
      return;
    }
    if (!this.ps?.started) {
      if (seat < 2) super.on(c, mid, param, data);
      return;
    }
    if (this.active[team] !== seat) return;
    super.on(this.c[team]!, mid, param, data);
  }
  override onClose(c: Conn): void {
    if (X(c).pvpW) { super.onClose(c); return; }
    const seat = this.sockets.indexOf(c);
    if (seat < 0 || this.done) return;
    if (this.g.restarting) { this.voidForRestart(); return; }
    // Relay sockets cannot yet reattach as a normal two-player seat. Do not strand all four players in
    // the two-player reconnect grace added by main; finish this casual, reward-free relay consistently.
    if (this.ps?.started && !this.ps.over) {
      this.ps.end();
      this.gameEnd(1 - seat % 2, DFM.WHY_DISCONNECT, 0, {}, true);
    } else this.cancelRelay();
  }
  cancelRelay(): void {
    if (this.done) return;
    if (this.ps?.started) {
      this.ps.end();
      for (const team of [0, 1]) this.finish(team, null, DFM.WHY_ABORT);
    }
    this.closeMatch();
  }
  override closeMatch(): void {
    if (this.done) return;
    if (!this.ps?.started) for (const tx of this.senders) tx?.put([[0x649b, Uint8Array.of(1, 1)]]);
    super.closeMatch();
    this.dropRelay();
    for (const s of this.seats) { this.g.hub.setState(s, 0); notice(s.lobby, "Relay finished. This casual mode awards no MP, cards or ranked progress."); }
  }
  override finish(team: number, wv: number | null, why: string, _turns = 0, options: Parameters<PvpMatch["finish"]>[4] = {}): void {
    if (this.g.restarting) return;
    // A shared deck must not award normal ranked rewards (or four accounts could farm a captain's collection).
    this.broadcast(team, DFM.endDuelMsgs(wv, why));
    for (const seat of [team, team + 2]) {
      const s = this.seats[seat], lobby = s.lobby;
      if (!lobby || lobby.closed) continue;
      const pdu = this.g.withCtx(s, () => { const st = this.g.loadState(); return PP.playerDataUpdate(PP.profile(st, PP.activeSlot(st))!); });
      lobby.post(DFM.M_PDU, pdu);
      this.senders[seat]?.put([{ fn: () => lobby.post(DFM.M_CARDPACKLIST, DFM.cardpacklistNotice([])) }]);
    }
    void options;
  }
}

type TagResult = [number, Record<string, unknown>];
interface Invitation { id: string; seats: Four<Session>; identities: string[]; pids: number[]; accepted: Set<number>; expires: number }
export const TAG_INVITE_TTL = 120000, TAG_INVITE_COOLDOWN = 20000;
const ROLES = ["captain", "opponent", "teammate", "opponent-teammate"] as const;
class TagRelays {
  readonly matches = new Map<number, TagRelayMatch>();
  private invites = new Map<string, Invitation>();
  private lastInvite = new Map<string, number>();
  private events = new Map<number, { id: string; kind: string; at: number; name?: string }>();
  constructor(readonly g: Game, readonly hub: Matches) {}
  private identity(s: Session) { return `${s.acct}:${s.pid}:${s.slot}:${isFree(s)}`; }
  private occupied(s: Session) { return [...this.invites.values()].some(i => i.seats.includes(s)); }
  private ignored(p: Session) { return this.g.lp.mem.black.includes(p.pid!); }
  private unavailable(p: Session, host: Session) {
    return p.pid === null || p.slot === null || p.block === null || !p.lobby || p.lobby.closed || this.g.hub.byPid(p.pid) !== p ||
      p.block !== host.block || p.ablock !== host.ablock || isFree(p) !== isFree(host) ||
      (p.state >= 0x67 && p.state <= 0x6a) || this.g.tp?.isTrading(p) || this.g.pvpByPid(p.pid);
  }
  private remove(inv: Invitation, kind: string, actor?: Session) {
    this.invites.delete(inv.id);
    for (const pid of inv.pids) this.events.set(pid, { id: inv.id, kind, at: Date.now(), ...(actor ? { name: actor.name } : {}) });
  }
  private sweep() {
    const now = Date.now();
    for (const inv of this.invites.values()) {
      if (inv.expires <= now) this.remove(inv, "expired");
      else if (inv.seats.some((s, j) => this.identity(s) !== inv.identities[j] || this.unavailable(s, inv.seats[0]) || this.ignored(s))) this.remove(inv, "unavailable");
    }
    for (const [acct, t] of this.lastInvite) if (now - t >= TAG_INVITE_COOLDOWN) this.lastInvite.delete(acct);
    for (const [pid, e] of this.events) if (now - e.at > TAG_INVITE_TTL) this.events.delete(pid);
  }
  /** API timestamps are epoch seconds; invitation storage and TTL/cooldown arithmetic stay in milliseconds. */
  state(s: Session): Record<string, unknown> {
    this.sweep();
    const active = this.matches.has(s.pid!);
    const available = !this.unavailable(s, s) && !this.ignored(s) && !this.occupied(s);
    return {
      self: { pid: s.pid, name: s.name }, active, available,
      ...(!available ? { reason: active ? "in-duel" : s.block === null ? "not-in-location" : this.occupied(s) ? "invitation-pending" : "unavailable" } : {}),
      players: !this.unavailable(s, s) ? [...this.g.hub.sessions.values()].filter(p => p !== s && !this.unavailable(p, s) && !this.occupied(p) && !this.ignored(p)).map(p => ({ pid: p.pid, name: p.name })) : [],
      invitations: [...this.invites.values()].filter(i => i.seats.includes(s)).map(i => ({
        id: i.id, hostPid: i.pids[0], expires: Math.floor(i.expires / 1000), outbound: i.seats[0] === s,
        seats: i.seats.map((p, j) => ({ pid: i.pids[j], name: p.name, role: ROLES[j], accepted: i.accepted.has(i.pids[j]) })),
      })),
      ...(this.events.has(s.pid!) ? { event: { ...this.events.get(s.pid!)!, at: Math.floor(this.events.get(s.pid!)!.at / 1000) } } : {}),
    };
  }
  invite(s: Session, body: Record<string, unknown>): TagResult {
    this.sweep();
    const ids = [body.teammatePid, body.opponentPid, body.opponentTeammatePid];
    if (ids.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) || new Set([s.pid, ...ids]).size !== 4) return [400, { error: "Choose three different online duelists." }];
    const others = ids.map(id => this.g.hub.byPid(id as number));
    if (others.some(p => !p)) return [409, { error: "A selected player is no longer online." }];
    const seats = [s, others[1]!, others[0]!, others[2]!] as Four<Session>;
    if (seats.some(p => this.unavailable(p, s) || this.ignored(p))) return [409, { error: "All four duelists must be available in the same location and play mode." }];
    if (seats.some(p => this.occupied(p))) return [409, { error: "A selected player already has a pending invitation." }];
    const last = this.lastInvite.get(s.acct);
    if (last !== undefined && Date.now() - last < TAG_INVITE_COOLDOWN) return [429, { error: "Please wait before sending another invitation.", retryAfter: Math.ceil((TAG_INVITE_COOLDOWN - Date.now() + last) / 1000) }];
    const inv: Invitation = { id: crypto.randomUUID(), seats, pids: seats.map(p => p.pid!), identities: seats.map(p => this.identity(p)), accepted: new Set([s.pid!]), expires: Date.now() + TAG_INVITE_TTL };
    this.lastInvite.set(s.acct, Date.now()); this.invites.set(inv.id, inv);
    for (const p of seats) {
      this.events.delete(p.pid!);
      notice(p.lobby, `${s.name} invited you to Tag Duel: ${seats[0].name} + ${seats[2].name} vs ${seats[1].name} + ${seats[3].name}. Open Tag Duel to respond. Shared captain decks and LP; no ranked rewards.`);
    }
    return [200, this.state(s)];
  }
  respond(s: Session, action: "accept" | "decline" | "cancel", id: unknown): TagResult {
    this.sweep();
    if (typeof id !== "string" || !id || id.length > 100) return [400, { error: "Invalid invitation." }];
    const inv = this.invites.get(id);
    if (!inv) return [409, { error: "This invitation is no longer available.", ...this.state(s) }];
    if (!inv.seats.includes(s)) return [403, { error: "This invitation belongs to other players." }];
    const host = inv.seats[0] === s;
    if ((action === "cancel") !== host && action !== "accept") return [403, { error: host ? "Cancel your invitation instead." : "Only the captain can cancel this invitation." }];
    if (action !== "accept") { this.remove(inv, action === "decline" ? "declined" : "cancelled", s); return [200, this.state(s)]; }
    inv.accepted.add(s.pid!);
    if (inv.accepted.size !== 4) return [200, this.state(s)];
    this.remove(inv, "started");
    const m = new TagRelayMatch(this.hub, inv.seats, () => { for (const pid of inv.pids) if (this.matches.get(pid) === m) this.matches.delete(pid); });
    for (const pid of inv.pids) this.matches.set(pid, m);
    for (const p of inv.seats) {
      this.g.hub.sala(p, "tag relay"); this.g.hub.setState(p, 0x67, "Tag Duel");
      p.lobby!.post(0x4306, new W().s(this.g.cfg.publicIp, 15).u16(this.g.ports.duel + this.g.cfg.portOffset).bytes());
    }
    return [200, { ...this.state(s), started: true }];
  }
  // Compatibility for old clients; all invitation rules and responses use the same service as the in-game panel.
  chat(s: Session, c: Conn, text: string): boolean {
    if (!/^\/tag(?:\s|$)/i.test(text)) return false;
    if (c !== s.lobby) return true;
    const cmd = text.slice(4).trim();
    let result: TagResult | null = null;
    if (/^invite\s/i.test(cmd)) {
      const names = cmd.slice(7).split(",").map(v => v.trim().toLowerCase());
      const players = [...this.g.hub.sessions.values()];
      const pids = names.map(name => players.find(p => p.name.toLowerCase() === name)?.pid);
      result = this.invite(s, { teammatePid: pids[0], opponentPid: pids[1], opponentTeammatePid: pids[2] });
    } else if (/^accept(?:\s|$)/i.test(cmd)) {
      this.sweep();
      const name = cmd.slice(6).trim().toLowerCase();
      const found = [...this.invites.values()].filter(i => i.seats.includes(s) && (!name || i.seats[0].name.toLowerCase() === name));
      if (found.length === 1) result = this.respond(s, "accept", found[0].id);
    }
    if (result && result[0] !== 200) notice(c, String(result[1].error));
    else if (!result) notice(c, "Open Tag Duel in the player list to choose teams or respond to an invitation.");
    return true;
  }
}

export function installTagRelays(g: Game, hub: Matches) {
  const relay = new TagRelays(g, hub); services.set(g, relay);
  const byPid = hub.byPid.bind(hub), route = hub.route.bind(hub), reserve = hub.reserve.bind(hub), watchRequest = hub.watchRequest.bind(hub);
  hub.watchRequest = (peer, pid, who = null) => { const m = relay.matches.get(pid); return m && who && m.seats.includes(who) ? null : watchRequest(peer, pid, who); };
  const prepareRestart = hub.prepareRestart.bind(hub);
  hub.prepareRestart = () => {
    for (const m of new Set(relay.matches.values())) m.voidForRestart();
    prepareRestart();
  };
  hub.byPid = pid => relay.matches.get(pid!) ?? byPid(pid);
  hub.route = (c, mid) => {
    const s = c.sess as Session | null, m = s?.pid ? relay.matches.get(s.pid) : null;
    if (m && !X(c).pvp && mid === 0x6001) m.attach(c);
    return route(c, mid);
  };
  hub.reserve = (a, b, origin) => { for (const s of [a, b]) { const m = relay.matches.get(s.pid!); if (m) m.cancelRelay(); } return reserve(a, b, origin); };
}
export const tagChat = (g: Game, s: Session | null, c: Conn, bytes: Uint8Array) => !!s && !!services.get(g)?.chat(s, c, enc.decode(bytes));

/** Internal DO API: userId comes only from the Worker's verified session, never a client-selected account/pid. */
export function tagApi(g: Game, userId: string, method: string, action = "", body: unknown = null): TagResult {
  if (g.restarting) return [503, { error: "Server restarting. Please reconnect shortly." }];
  const acct = g.store.accountOfUser(userId), s = acct ? g.hub.sessions.get(acct) : null;
  if (!s || s.slot === null || s.pid === null || !s.lobby || s.lobby.closed) return [409, { error: "not-in-game" }];
  const relay = services.get(g);
  if (!relay) return [503, { error: "Tag Duels are unavailable." }];
  if (method === "GET" && !action) return [200, relay.state(s)];
  if (method !== "POST") return [405, { error: "method not allowed" }];
  if (!body || typeof body !== "object" || Array.isArray(body)) return [400, { error: "Expected an invitation request." }];
  const data = body as Record<string, unknown>;
  if (action === "invite") return relay.invite(s, data);
  if (action === "accept" || action === "decline" || action === "cancel") return relay.respond(s, action, data.id);
  return [404, { error: "not found" }];
}
