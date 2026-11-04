import { afterEach, describe, expect, it, vi } from "vitest";
import { configFrom, DUEL_PORT } from "../src/config.ts";
import { buildServer } from "../src/server.ts";
import { Conn } from "../src/net/conn.ts";
import { Session } from "../src/game/hub.ts";
import { TAG_INVITE_COOLDOWN, TAG_INVITE_TTL, tagApi, type TagRelayMatch } from "../src/duel/tagRelay.ts";

function setup() {
  const names = ["Alfa", "Beta", "Gamma", "Delta", "Elsewhere"];
  const state = { accounts: Object.fromEntries(names.map((name, i) => [`acct${i}`, { idx: i + 1, user_id: `user${i}`, players: { "0": name }, profiles: {}, active_slot: 0 }])) };
  const srv = buildServer(configFrom({ PARITY_SEED: "1", SEND_PACE: "0", DUEL_PAUSE: "0" }), state, () => {});
  const sessions = names.map((name, i) => {
    const s = new Session(`acct${i}`, i + 1, false);
    s.slot = 0; s.pid = srv.game.hub.pidFor(s, 0); s.name = name; s.block = "5740|0";
    srv.game.hub.sessions.set(s.acct, s);
    const c = new Conn(srv.world, srv.world.seqTable, 5740, `peer${i}`, () => true, DUEL_PORT);
    c.sess = s; s.lobby = c; s.conns.set(5740, c);
    return s;
  });
  const api = (who = 0, action = "", body: unknown = null, method = action ? "POST" : "GET") => tagApi(srv.game, `user${who}`, method, action, body);
  const invite = () => api(0, "invite", { teammatePid: sessions[2].pid, opponentPid: sessions[1].pid, opponentTeammatePid: sessions[3].pid });
  const info = (who = 0) => api(who)[1] as any;
  return { srv, sessions, api, invite, info };
}
afterEach(() => vi.restoreAllMocks());

describe("Tag Duel authenticated invitation service", () => {
  it("serializes epoch seconds consumed correctly by the actual lobby controller countdown and expiry filter", async () => {
    // @ts-expect-error The browser controller is plain JavaScript and deliberately has no TypeScript declaration.
    const { tagLobbyController } = await import("../../client/web-shell/htmlui/tag-lobby.js");
    const h = setup();
    let nowMs = 1700000000000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    expect(h.invite()[0]).toBe(200);
    const request = vi.fn(async () => JSON.parse(JSON.stringify(h.api(1)[1])));
    const controller = tagLobbyController({ request, now: () => nowMs / 1000 });
    await controller.refresh();
    expect(controller.invitations()).toHaveLength(1);
    const invitation = controller.invitations()[0];
    expect(invitation.expires).toBe(1700000120);
    expect(Math.ceil(invitation.expires - nowMs / 1000)).toBe(120);
    nowMs += TAG_INVITE_TTL - 1;
    expect(controller.invitations()).toHaveLength(1);
    nowMs += 1;
    expect(controller.invitations()).toHaveLength(0);
    expect(await controller.act("accept", invitation.id)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1); // expired UI cannot send an acceptance
    await controller.refresh();
    expect(controller.model.state.event).toMatchObject({ id: invitation.id, kind: "expired", at: 1700000120 });
    expect(controller.model.notice).toMatch(/expired/);
    expect(nowMs / 1000 - controller.model.state.event.at).toBe(0);
  });
  it("resolves only the account's online character and lists available same-location players without private game data", () => {
    const h = setup();
    expect(tagApi(h.srv.game, "unknown", "GET")).toEqual([409, { error: "not-in-game" }]);
    h.sessions[4].ablock = 1;
    expect(h.info().self).toEqual({ pid: h.sessions[0].pid, name: "Alfa" });
    expect(h.info().players.map((p: any) => p.name)).toEqual(["Beta", "Gamma", "Delta"]);
    h.sessions[3].ext.free = true;
    expect(h.info().players.map((p: any) => p.name)).toEqual(["Beta", "Gamma"]);
    h.sessions[2].state = 0x67;
    expect(h.info().players.map((p: any) => p.name)).toEqual(["Beta"]);
    const json = JSON.stringify(h.info());
    expect(json).not.toMatch(/acct|user_id|deck|trunk|hand/);
    h.sessions[0].block = null;
    expect(h.info()).toMatchObject({ available: false, reason: "not-in-location", players: [] });
  });
  it("uses opaque invitation ids, tracks every acceptance, and launches four native clients only after all accept", () => {
    const h = setup(), posts = h.sessions.slice(0, 4).map(s => vi.spyOn(s.lobby!, "post"));
    const [status, out] = h.invite(); expect(status).toBe(200);
    const inv = (out as any).invitations[0];
    expect(inv.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(inv.outbound).toBe(true);
    expect(inv.seats.map((p: any) => [p.name, p.accepted, p.role])).toEqual([
      ["Alfa", true, "captain"], ["Beta", false, "opponent"], ["Gamma", false, "teammate"], ["Delta", false, "opponent-teammate"],
    ]);
    expect(h.info(1).invitations[0]).toMatchObject({ id: inv.id, outbound: false });
    expect(h.api(4, "accept", { id: inv.id })[0]).toBe(403);
    expect(h.api(1, "cancel", { id: inv.id })[0]).toBe(403);
    expect(h.api(0, "decline", { id: inv.id })[0]).toBe(403);
    for (const who of [1, 2]) expect(h.api(who, "accept", { id: inv.id })[0]).toBe(200);
    expect(h.info(3).invitations[0].seats.map((p: any) => p.accepted)).toEqual([true, true, true, false]);
    expect(posts.every(p => !p.mock.calls.some(([id]) => id === 0x4306))).toBe(true);
    expect(h.api(3, "accept", { id: inv.id })).toMatchObject([200, { started: true, active: true, invitations: [] }]);
    expect(posts.every(p => p.mock.calls.some(([id]) => id === 0x4306))).toBe(true);
    (h.srv.game.pvp!.byPid(h.sessions[0].pid!) as TagRelayMatch).cancelRelay();
  });
  it("allows one pending invitation per participant, enforces a host cooldown, and rejects stale-dialog accepts", () => {
    const h = setup(), now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    h.invite(); const old = h.info().invitations[0].id;
    expect(h.invite()[0]).toBe(409);
    expect(h.api(4, "invite", { teammatePid: h.sessions[1].pid, opponentPid: h.sessions[2].pid, opponentTeammatePid: h.sessions[3].pid })[0]).toBe(409);
    expect(h.api(2, "decline", { id: old })[0]).toBe(200);
    expect(h.info(1)).toMatchObject({ invitations: [], event: { id: old, kind: "declined", name: "Gamma" } });
    expect(h.invite()[0]).toBe(429);
    clock.mockReturnValue(now + TAG_INVITE_COOLDOWN);
    expect(h.invite()[0]).toBe(200);
    const next = h.info().invitations[0].id; expect(next).not.toBe(old);
    expect(h.api(1, "accept", { id: old })[0]).toBe(409);
    expect(h.info(1).invitations[0].seats[1].accepted).toBe(false);
    expect(h.api(0, "cancel", { id: next })[0]).toBe(200);
    expect(h.info(3)).toMatchObject({ invitations: [], event: { kind: "cancelled" } });
  });
  it("expires invitations and invalidates them when a player moves, switches characters or becomes busy", () => {
    for (const kind of ["expiry", "location", "character", "trade", "ignore"] as const) {
      const h = setup(), now = Date.now(), clock = vi.spyOn(Date, "now").mockReturnValue(now);
      h.invite(); const id = h.info().invitations[0].id;
      if (kind === "expiry") clock.mockReturnValue(now + TAG_INVITE_TTL);
      if (kind === "location") h.sessions[2].ablock = 1;
      if (kind === "character") h.sessions[2].slot = 1;
      if (kind === "trade") vi.spyOn(h.srv.game.tp!, "isTrading").mockImplementation(s => s === h.sessions[2]);
      if (kind === "ignore") h.srv.game.lp.mem.black.push(h.sessions[2].pid!);
      expect(h.api(1, "accept", { id })[0]).toBe(409);
      expect(h.info()).toMatchObject({ invitations: [], event: { kind: kind === "expiry" ? "expired" : "unavailable" } });
      vi.restoreAllMocks();
    }
  });
  it("validates ids and request methods before creating an invitation", () => {
    const h = setup();
    expect(h.api(0, "invite", { teammatePid: "2", opponentPid: 3, opponentTeammatePid: 4 })[0]).toBe(400);
    expect(h.api(0, "invite", { teammatePid: h.sessions[1].pid, opponentPid: h.sessions[1].pid, opponentTeammatePid: h.sessions[3].pid })[0]).toBe(400);
    expect(h.api(0, "invite", []) [0]).toBe(400);
    expect(h.api(0, "invite", {}, "DELETE")[0]).toBe(405);
    expect(h.info().invitations).toEqual([]);
  });
});
