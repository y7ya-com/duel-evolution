// Wires a World (transport) to a Game (py namespace) and the per-port handlers.
import { PORTS, type Config } from "./config.ts";
import { World } from "./world.ts";
import { W } from "./net/proto.ts";
import { Game } from "./game/game.ts";
import { Store, type State } from "./game/store.ts";
import { gateReply } from "./game/gate.ts";
import { gameReply } from "./game/accounts.ts";
import type { Session } from "./game/hub.ts";
import { makeHandlers } from "./game/persist.ts";
import * as PP from "./game/persist.ts";
import { blockPlayer, Lobby, lobbyReply } from "./game/lobby.ts";
import { avNpcParts, loadNpcs } from "./game/npcs.ts";
import { selectpack, shopBuy, shopCatalog, shopPurchase } from "./game/shop.ts";
import { Teams } from "./game/teams.ts";
import { Trades } from "./game/trade.ts";
import { Tournaments } from "./game/tournaments.ts";
import { Admin } from "./game/admin.ts";
import { duelServices, installDuel } from "./duel/install.ts";
import { modeFrame } from "./game/freemode.ts";

/** py arranque.cargar: the cross-module wiring of one Game. */
function wire(g: Game): Game {
  g.admin = new Admin(g);
  PP.setStartValues(() => g.admin.data.start);
  PP.setProgression(g.cfg.progression);
  g.ph = makeHandlers(g, {
    gameConn: () => {
      const s = g.curSess();
      const c = s && s !== g.NO_SESSION ? s.conns.get(g.ports.game) ?? null : null;
      return c && !c.stale() ? c : null;
    },
    pidOf: (slot) => g.hub.pidFor(g.curSess() as Session | null, slot),
    shopPurchase: (k, id, n) => g.shopPurchase(k, id, n),
  }) as unknown as Game["ph"];
  // 0x8101 (a 2008 code window the client no longer opens): "invalid code", from the one WIRE_UNUSED_DP place
  (g.ph as Record<string, unknown>).h_code = (c: { send(id: number, d: Uint8Array): void }) =>
    c.send(0x8102, new W().u32(PP.WIRE_UNUSED_DP.codeResult).u16(0).u8(0).u8(0).u16(0).bytes());
  g.phLobby.set(0x8101, "h_code");
  g.gameReply = (c, id, p, d) => gameReply(g, c, id, p, d);
  g.blockPlayer = (pid, name, sess) => blockPlayer(g, pid, name, sess ?? null);
  g.shopPurchase = (k, id, n) => shopPurchase(g, k, id, n);
  g.shopCatalog = () => shopCatalog(g);
  g.shopBuy = (c, d) => shopBuy(g, c, d);
  g.selectpack = (c, d, base) => selectpack(g, c, d, base);
  g.npcs = loadNpcs(g.npcSex);
  g.lp = new Lobby(g);
  // py: EQ.install (hub LIST5) + LP.HANDLERS.update(EQ.HANDLERS), then TP, then TO
  const eq = (g.eq = new Teams(g));
  g.hub.list5Body = (o) => eq.list5Body(o);
  for (const [id, h] of eq.handlers) g.lp.handlers.set(id, (c, _m, _p, d) => h(c, d));
  const tp = (g.tp = new Trades(g));
  g.lp.handlers.set(0x7000, (c, _m, _p, d) => tp.handle(c, d));
  const to = (g.to = new Tournaments(g));
  for (const [id, h] of to.handlers) g.lp.handlers.set(id, (c, m) => h(c, m));
  g.lpCards = (pack, n) => g.lp.cards(pack, n);
  g.lpOnClose = (c) => g.lp.onClose(c);
  /** py duel_parts: 16 B of avatar for the duel screens. */
  g.duelParts = (rival, world) => {
    const w = world ?? g.curWorld();
    if (rival === null) {
      try {
        const st = g.loadState();
        const a = PP.profile(st, PP.activeSlot(st))!.avatar ?? {};
        const h = a[w === 1 ? "b" : "a"] || a.a;
        if (h) { const b = new Uint8Array(16); b.set(Buffer.from(h, "hex").subarray(0, 16)); return b; }
      } catch { /* py: default */ }
      return new Uint8Array(Buffer.from("0000203040608090b820000000000000", "hex"));
    }
    if (!(rival >= 51 && rival <= 94)) return avNpcParts(rival, g.npcSex.get(rival) ?? null, w);
    return new Uint8Array(16);
  };
  /** py sesion_duelo.on_conn_closed (the duel part lands with the duel module). */
  g.onConnClosed = (c, why = "cerrada") => {
    if (why !== "0x0003") c.closed = true;
    try { g.hub.onClose(c, why); } catch (e) { g.log(`[hub] on_close: ${e}`); }
    try { g.lp.onClose(c); g.tp!.onClose(c); g.to!.onClose(c); } catch (e) { g.log(`[lobby] on_close: ${e}`); }
  };
  installDuel(g); // py: PVP, NW, duel port, LS, OCG, DFM (+ NR), DT, DK
  return g;
}

export interface Server { world: World; game: Game; reset(st: State): void }

export function buildServer(cfg: Config, initial: State | null, log: (s: string) => void): Server {
  const world = new World(cfg, log);
  const mk = (st: State | null) => wire(new Game(cfg, world, new Store(st), log));
  const srv: Server = { world, game: mk(initial), reset(st) { srv.game = mk(st); } };
  const duel = duelServices(() => srv.game);
  world.services = {
    ...duel,
    handlerFor(port) {
      const g = srv.game;
      const svc = PORTS.get(port);
      if (svc === "gate") return (c, id) => { g.enter(c); gateReply(g, c, id); };
      if (svc === "accounts") return (c, id, p, d) => { g.enter(c); gameReply(g, c, id, p, d); };
      if (svc === "lobby") return (c, id, p, d) => { g.enter(c); lobbyReply(g, c, id, p, d); };
      if (svc === "duel") return duel.duelHandler;
      return undefined;
    },
    // client control frames (0xCAxx, out of band): 0xCA10 = this connection is free mode (game/freemode.ts)
    onControl(c, id, d) { const g = srv.game; modeFrame(c, id, d, (s) => g.log(s)); },
    onConnClosed(c) {
      const g = srv.game;
      g.ctx = (c.sess as Session | null) ?? g.NO_SESSION;
      g.onConnClosed(c);
    },
  };
  return srv;
}
