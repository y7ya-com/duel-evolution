// The HTML trade panel's API (client/web-shell/htmlui/cosmetics/trade-cosmetics.js): cosmetics in the native card
// trade (trade.ts), one trade and one commit for both. The Worker checks the session (worker.ts gameFeature) and
// forwards /api/de/trade/cosmetics[/panel] here with x-de-user; the trade is always the caller's own, found from its
// game session, never named by the client.
//   GET  /api/de/trade/cosmetics                -> the panel's view (Trades.cosmeticsView)
//   POST /api/de/trade/cosmetics {give: [{id, count}]}   the caller's side becomes these lines (all of them: [] clears)
//   POST /api/de/trade/cosmetics/panel {on}     this game shows the panel (on mount; on: false on unmount)
// A failure is { error, status }: not-in-game, no-character, free-mode, server-restarting (503), not-trading,
// no-panel, partner-no-panel, ready-me, ready-partner, not-open, insufficient-duplicates, fresh, bad-request (400).
import type { Game } from "./game.ts";
import type { Session } from "./hub.ts";
import { isFree } from "./freemode.ts";
import { tradeLines } from "./cosmetics.ts";

type Fail = { error: string; status: number; [k: string]: unknown };
const fail = (error: string, status = 409, extra: Record<string, unknown> = {}): Fail => ({ error, status, ...extra });

function caller(g: Game, user: string): Session | Fail {
  const acct = g.store.accountOfUser(user);
  const s = acct ? g.hub.sessions.get(acct) : undefined;
  if (!s || s.pid === null) return fail("not-in-game");
  if (s.slot === null) return fail("no-character");
  if (g.restarting) return fail("server-restarting", 503);
  if (isFree(s)) return fail("free-mode");
  if (!g.tp) return fail("not-trading");
  return s;
}
const failed = (v: unknown): v is Fail => !!v && typeof v === "object" && "error" in v;

export function tradeCosmeticsInfo(g: Game, user: string) {
  const s = caller(g, user); if (failed(s)) return s;
  return g.tp!.cosmeticsView(s);
}
export function tradeCosmeticsSet(g: Game, user: string, body: unknown) {
  const s = caller(g, user); if (failed(s)) return s;
  const give = tradeLines((body as { give?: unknown } | null)?.give, s.acct, g);
  if (!give) return fail("bad-request", 400);
  const r = g.tp!.setCosmetics(s, give);
  if ("error" in r) { const { error, ...extra } = r; return fail(error, 409, extra); }
  return { ...g.tp!.cosmeticsView(s), replay: r.replay };
}
export function tradeCosmeticsPanel(g: Game, user: string, body: unknown) {
  const s = caller(g, user); if (failed(s)) return s;
  const r = g.tp!.tradePanel(s, (body as { on?: unknown } | null)?.on !== false);
  if (r) return fail(r.error);
  return g.tp!.cosmeticsView(s);
}
