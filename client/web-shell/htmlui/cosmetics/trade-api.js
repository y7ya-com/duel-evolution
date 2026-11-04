// The trade panel's HTTP client (cosmetics/trade-cosmetics.js): cosmetics in the native card trade. Same origin: the
// Worker (server/src/worker.ts gameFeature) checks the session and forwards /api/de/trade/cosmetics[/panel] to the
// Durable Object (server/src/game/trade-cosmetics.ts). The trade is always the caller's own: the server finds it from
// the game session, the client never names it.
//   view()          GET: { trading, rev, partner, panel {me, partner}, ready, asked, confirmed, mine, theirs, spares,
//                   locked, changed, maxLines } or { trading: false, last } after the trade ended
//   setLines(give)  POST {give: [{id, count}]}: the caller's whole side (the same lines again are a no-op: replay)
//   panel(on)       POST /panel {on}: this game shows the panel (the capability both sides need before any line)
// A failure throws { error, message } (message: the player-facing text, tradeErrorText).
const BASE = () => (globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/trade/cosmetics';

/** The player-facing text for a refusal code (`extra`: the server's body). */
export function tradeErrorText(error, extra = {}) {
  switch (error) {
    case 'partner-no-panel': return "Your trade partner's game can't show cosmetics yet.";
    case 'no-panel': return "This game can't show cosmetics in a trade yet.";
    case 'ready-me': return 'You pressed Ready: cosmetics are locked until the trade question.';
    case 'ready-partner': return 'Your partner pressed Ready: cosmetics are locked until the trade question.';
    case 'not-open': return 'The trade has not started yet.';
    case 'not-trading': return 'The trade is over.';
    case 'insufficient-duplicates': return extra.spare ? `You have only ${extra.spare} spare ${extra.spare === 1 ? 'copy' : 'copies'} of that.`
      : "You have no spare copy of that: only spares can be traded, never your own first copy.";
    case 'fresh': return `A character can give cosmetics after ${extra.min || 20} rewarded duels.`;
    case 'free-mode': return 'Cosmetics are not traded in free mode.';
    case 'server-restarting': return 'The server is restarting. Please try again in a few seconds.';
    case 'temporarily-unavailable': return 'The server is busy right now. Please try again in a moment.';
    case 'network': return "Couldn't reach the server. Check your connection and try again.";
    case 'signed out': case 'not-in-game': return 'Your session has ended. Please sign in again.';
    case 'bad-request': return 'At most 6 different cosmetics per side, 99 copies each.';
    default: return 'Something went wrong. Please try again.';
  }
}
const failure = (error, extra = {}) => Object.assign(new Error(error), extra, { error, message: tradeErrorText(error, extra) });

async function call(path = '', body) {
  let r;
  try {
    r = await fetch(BASE() + path, body === undefined ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
  } catch { throw failure('network'); }
  let json = null;
  try { json = await r.json(); } catch { /* a plain-text 503 */ }
  if (r.ok && json && typeof json === 'object' && !json.error) return json;
  if (!json) throw failure(r.status === 503 ? 'server-restarting' : r.status === 401 ? 'signed out' : 'temporarily-unavailable');
  throw failure(json.error || 'unknown', json);
}

export const view = () => call();
export const setLines = give => call('', { give: give.filter(l => l.count > 0).map(({ id, count }) => ({ id, count })) });
export const panel = on => call('/panel', { on: !!on });
