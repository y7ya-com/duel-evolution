// Wires the duel port into a Game (py arranque.cargar: PVP, NW, the duel part of DUEL/LOBBY_ROOM/DF, LS, OCG, DFM +
// NR.install, DT and DK) and into the World's services (HANDLERS[DUEL_PORT] = duel_reply, the 0x6001 ticket check +
// HUB.attach, the 0x4306 ticket, on_conn_accepted / on_conn_closed).
import type { Conn } from "../net/conn.ts";
import type { Game } from "../game/game.ts";
import type { Services } from "../world.ts";
import { DuelPort } from "./port.ts";
import { Matches, type PvpMatch } from "./pvpMatch.ts";
import { NpcWatch } from "./npcWatch.ts";

export function installDuel(g: Game): DuelPort {
  const c = g.cfg;
  const port = (g.duel = new DuelPort(g, { pause: c.duelPause, test: c.pvpTest, reserva: c.duelReserva, deckCheck: c.deckCheck }));
  g.pvp = new Matches(g, c.duelPause, c.pvpTest);
  g.nw = new NpcWatch(g, c.duelPause);
  g.duelBegin = (cc, rival, mode) => port.duelBegin(cc, rival, mode);
  /** py torneos._hook_match: wraps _finish (each client's result) and _close_match (end) of ONE match. */
  g.pvpHookMatch = (m0, onFinish, onClose) => {
    const m = m0 as PvpMatch;
    const fin = m.finish.bind(m), close = m.closeMatch.bind(m);
    m.finish = (k, wv, ...a) => {
      try { if (wv === 0) onFinish(m.sess[k].pid!); else if (wv === null) onFinish("draw"); } catch { /* py: pass */ }
      return fin(k, wv, ...a);
    };
    m.closeMatch = () => {
      try { return close(); } finally { onClose([0, 1].filter((k) => m.c[k] !== null).map((k) => m.sess[k].pid!)); }
    };
  };
  const base = g.onConnClosed;
  g.onConnClosed = (cc, why = "cerrada") => port.onConnClosed(cc, why, () => base(cc, why));
  return port;
}

/** The World services of the duel port; game() = the current Game (srv.reset replaces it). */
export function duelServices(game: () => Game): Pick<Services, "duelAttach" | "beforeSend" | "onConnAccepted"> & { duelHandler(c: Conn, id: number, p: number, d: Uint8Array): void } {
  return {
    duelHandler(c, id, p, d) { const g = game(); g.enter(c); g.duel!.duelReply(c, id, p, d); },
    duelAttach(c, pid) {
      const g = game();
      g.enter(c);
      if (!g.duel!.dt.duel6001(c, pid)) return false;
      g.hub.attach(c, pid);
      return true;
    },
    beforeSend(c, msgId) { if (msgId === 0x4306) game().duel?.dt.issue(c); },
    onConnAccepted(c, old) { game().duel?.onConnAccepted(c, old); },
  };
}
