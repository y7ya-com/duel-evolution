// The rewards HTTP client (the Missions window, rewards/missions.js, and its menu-bar button, rewards/launcher.js).
// Same origin, as cosmetics/api.js: the Worker (server/src/worker.ts) checks the session and forwards /api/de/rewards[/...]
// to the Durable Object's /__de/rewards handlers (server/src/do.ts; game/rewards.ts rewardsView / rewardsClaim). A
// success is the character's whole rewards view ({ wallet: { total, bound, earned }, missions: [{ id, label, event,
// target, progress, mp, kind, claimed, claimable }], login: { day, count, streak, cycleDay, calendar }, nextRequestId,
// day, week, stockpileCap }), plus on a claim { grant: { id, mp }, replayed }. A failure is { error } with an HTTP
// status; here every failure becomes { error, message } (message: player-facing text) and is thrown.
//
// getView({ force }): the view, cached (CACHE_TTL) and coalesced while a request is in flight. Reading it can grant
//   the day's login bonus (the server does that once an account a UTC day).
// claim(id): one claim with the view's request id. The server keeps a receipt per id, so a retry with the same id
//   replays the same grant instead of paying twice: a network failure or a bare 503 is retried with the same id, and the
//   id only advances when a success brings a new view. A stale id (another tab claimed) refreshes the view and asks the
//   player to press again; a conflicting id (the lost request was another mission's claim) refreshes and retries once.
// claimAll(ids): the ids one after another (there is no claim-all endpoint), each with the id the last one returned;
//   stops at the first failure. -> { view, grants, mp, error }
// onChange(cb): cb(view) after every success (and a forced refresh that changed it); -> unsubscribe.
export const CACHE_TTL = 30000;
export const RETRY_DELAYS = [400, 1200, 2500];

const BASE = () => (globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/rewards';

let view = null, at = 0, inflight = null;
const listeners = new Set();
let sleep = ms => new Promise(r => setTimeout(r, ms));

/** Tests: drop the cache and listeners; `wait` replaces the retry delay. */
export function _reset({ wait } = {}) { view = null; at = 0; inflight = null; listeners.clear(); if (wait) sleep = wait; }
/** The cached view without asking (null before the first answer). */
export const peekView = () => view;

const fmt = n => Number(n).toLocaleString('en-US');
/** The player-facing text for a failure code (extra: the server's body, and what the caller knows: the mission). */
export function errorText(error, extra = {}) {
  switch (error) {
    case 'rewards-disabled': return 'Missions are switched off on this server right now. Please check back later.';
    case 'not-claimable': return extra.mission?.claimed ? 'You already claimed this reward.'
      : "This mission isn't complete yet, so there's nothing to claim. The list has been refreshed.";
    case 'reward-wallet-overflow': {
      const mp = extra.mission?.mp != null ? ` (${fmt(extra.mission.mp)} MP)` : '';
      return `Your wallet is too full to take this reward${mp}. Spend some MP, then claim it.`;
    }
    case 'busy': return "You can't claim rewards during a duel or a trade. Finish it first; your rewards will wait.";
    case 'stale-request': case 'request-id-conflict':
      return 'Your missions were out of date, so they have been refreshed. Please press Claim again.';
    case 'invalid-reward': return "That reward isn't valid any more. The list has been refreshed.";
    case 'server-restarting': return 'The server is restarting. Please try again in a few seconds.';
    case 'temporarily-unavailable': return 'The server is busy right now. Please try again in a moment.';
    case 'network': return "Couldn't reach the server. Check your connection and try again.";
    case 'signed out': case 'not-in-game': return 'Your session has ended. Please sign in again.';
    case 'no-character': return 'Choose a character first.';
    case 'free-mode': return 'Missions and rewards are not available in free mode.';
    case 'bad-request': case 'invalid JSON': return 'The game sent a request the server did not understand. Please reload the page.';
    default: return 'Something went wrong. Please try again.';
  }
}
const failure = (error, extra = {}) => {
  const { status: _s, error: _e, ...rest } = extra;
  return Object.assign(new Error(error), rest, { error, message: errorText(error, extra) });
};

// one request: -> the JSON body, or throws a failure ({ error, message, retry: whether the same request may be sent again })
async function call(path = '', body) {
  let r;
  try {
    r = await fetch(BASE() + path, body === undefined ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw Object.assign(failure('network'), { retry: true }); }
  let json = null;
  try { json = await r.json(); } catch { /* the DO's 503 "server restarting" is plain text */ }
  if (r.ok && json && typeof json === 'object' && !json.error) return json;
  if (r.status === 503) {
    const code = json?.error || 'server-restarting';
    // a bare 503 (restart) or the persistence failure: the receipt makes a retry with the same id safe; switched off is final
    throw Object.assign(failure(code, json || {}), { retry: code !== 'rewards-disabled' });
  }
  if (!json) throw Object.assign(failure(r.status >= 500 ? 'temporarily-unavailable' : 'network'), { retry: r.status >= 500 });
  throw failure(json.error || 'unknown', json);
}

function store(next, notify) {
  // a success carries the whole view; the claim's extras stay off the cached copy
  const { grant: _g, replayed: _r, ...state } = next;
  const changed = notify || (view && JSON.stringify(view) !== JSON.stringify(state));
  view = state; at = Date.now();
  if (changed) for (const cb of [...listeners]) { try { cb(state); } catch (e) { console.error('[rewards] onChange', e); } }
  return state;
}

export function getView({ force = false } = {}) {
  if (!force && view && Date.now() - at < CACHE_TTL) return Promise.resolve(view);
  if (inflight) return inflight;
  inflight = call().then(next => store(next, false)).finally(() => { inflight = null; });
  return inflight;
}

async function withRetry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (!e.retry || i >= RETRY_DELAYS.length) throw e;
      await sleep(RETRY_DELAYS[i]);
    }
  }
}

/** Claim one completed mission. -> { view, grant: { id, mp }, replayed } */
export async function claim(id) {
  const state = view || await getView();
  const mission = state.missions?.find(m => m.id === id);
  const once = async requestId => {
    try { return await withRetry(() => call('/claim', { id, requestId })); } catch (e) {
      throw e.error === 'not-claimable' || e.error === 'reward-wallet-overflow' ? failure(e.error, { mission }) : e;
    }
  };
  let out;
  try { out = await once(String(state.nextRequestId)); } catch (e) {
    if (e.error === 'stale-request' || e.error === 'not-claimable' || e.error === 'invalid-reward') {
      await getView({ force: true }).catch(() => {}); throw e;
    }
    if (e.error !== 'request-id-conflict') throw e;
    // the id was spent on another claim whose answer was lost: that grant is in the wallet already
    const fresh = await getView({ force: true });
    out = await once(String(fresh.nextRequestId));
  }
  return { view: store(out, true), grant: out.grant || { id, mp: 0 }, replayed: !!out.replayed };
}

/** Claim each id in turn. -> { view, grants, mp (paid by this call, replays included), error (the first failure, or null) } */
export async function claimAll(ids) {
  const grants = [];
  let error = null;
  for (const id of ids) {
    try { grants.push((await claim(id)).grant); } catch (e) { error = e; break; }
  }
  return { view, grants, mp: grants.reduce((n, g) => n + (g.mp || 0), 0), shards: grants.reduce((n, g) => n + (g.shards || 0), 0), error };
}

export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
