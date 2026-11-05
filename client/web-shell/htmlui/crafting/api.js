// The crafting HTTP client (the deck editor's Craft / Dismantle, crafting/editor.js). Same origin, as cosmetics/api.js:
// the Worker (server/src/worker.ts) checks the session and forwards /api/de/craft[/...] to the Durable Object's
// /__de/craft handlers (server/src/do.ts; game/crafting.ts craftView / craftOperation). A success is the character's
// whole crafting view ({ shards, values: { craft, dismantle } per rarity, cards: { passcode: { owned, bound, crafted,
// craftable, dismantlable, rarity, inDecks } }, nextRequestId }), plus on a mutation { operation, changes, shardDelta,
// secret: { unlocked, freePacks }, replayed } or on a preview { operation, changes, shardDelta, preview: true }. A
// failure is { error } with an HTTP status; here every failure becomes { error, message } (message: player-facing) and
// is thrown.
//
// getView({ force }): the view, cached (CACHE_TTL) and coalesced while a request is in flight.
// make(pc, count) / dismantle(pc, count) / dismantleExtras(keep): one operation with a request id. The server keeps a
//   receipt per id, so a retry with the same id replays the same result instead of charging twice: a network failure
//   or a bare 503 is retried with the same id, and the id only advances when a success brings a new view. A stale id
//   (another tab used it) refreshes the view and asks the player to press again; a conflicting id (the lost request was
//   a different operation) refreshes and retries once with the fresh id.
// previewExtras(keep): what dismantleExtras(keep) would do; spends no id.
// onChange(cb): cb(view) after every success (and a forced refresh that changed it); -> unsubscribe.
export const CACHE_TTL = 30000;
export const RETRY_DELAYS = [400, 1200, 2500];

const BASE = () => (globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/craft';

let view = null, at = 0, inflight = null;
const listeners = new Set();
let sleep = ms => new Promise(r => setTimeout(r, ms));

/** Tests: drop the cache and listeners; `wait` replaces the retry delay. */
export function _reset({ wait } = {}) { view = null; at = 0; inflight = null; listeners.clear(); if (wait) sleep = wait; }
/** The cached view without asking (null before the first answer). */
export const peekView = () => view;

const fmt = n => Number(n).toLocaleString('en-US');
/** The player-facing text for a failure code (extra: the server's body, and what the caller knows: cost, shards). */
export function errorText(error, extra = {}) {
  switch (error) {
    case 'insufficient-shards': {
      const need = extra.cost != null && extra.shards != null ? ` This card costs ${fmt(extra.cost)} and you have ${fmt(extra.shards)}.` : '';
      return `Not enough Shards.${need} Dismantle extra copies to get more.`;
    }
    case 'copy-cap': return 'You already own 3 copies of this card, the most you can craft.';
    case 'not-dismantlable': return "Those copies can't be dismantled: they're bound (Structure Deck, Beginner's Pack, soulbound) or in a saved deck.";
    case 'uncraftable': return "This card can't be crafted or dismantled.";
    case 'invalid-craft': return "That card or amount isn't valid. Please refresh and try again.";
    case 'busy': return "You can't craft while a duel or trade is in progress. Finish it first.";
    case 'stale-request': case 'request-id-conflict':
      return 'Your collection was out of date, so it has been refreshed. Please press the button again.';
    case 'shard-overflow': return "That would take your Shards over the most you can hold. Craft something first.";
    case 'character-changed': return 'You switched characters while this was in progress. Nothing was changed.';
    case 'invalid-shard-wallet': case 'invalid-shard-config':
      return "Crafting is unavailable right now. Your cards and Shards are safe. Please try again later.";
    case 'deck-store-unavailable': return "Your saved decks couldn't be checked, so nothing was dismantled. Please try again in a moment.";
    case 'server-restarting': return 'The server is restarting. Please try again in a few seconds.';
    case 'temporarily-unavailable': return 'The server is busy right now. Please try again in a moment.';
    case 'network': return "Couldn't reach the server. Check your connection and try again.";
    case 'signed out': case 'not-in-game': return 'Your session has ended. Please sign in again.';
    case 'no-character': return 'Choose a character first.';
    case 'free-mode': return 'Crafting is not available in free mode.';
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
    // a bare 503 (restart) or the persistence failure: the receipt makes a retry with the same id safe
    throw Object.assign(failure(code, json || {}), { retry: !json || code === 'temporarily-unavailable' || code === 'server-restarting' });
  }
  if (!json) throw Object.assign(failure(r.status >= 500 ? 'temporarily-unavailable' : 'network'), { retry: r.status >= 500 });
  throw failure(json.error || 'unknown', json);
}

function store(next, notify) {
  // a success carries the whole view; the operation's extras stay off the cached copy
  const { operation: _o, changes: _c, shardDelta: _d, secret: _s, replayed: _r, preview: _p, ...state } = next;
  const changed = notify || (view && JSON.stringify(view) !== JSON.stringify(state));
  view = state; at = Date.now();
  if (changed) for (const cb of [...listeners]) { try { cb(state); } catch (e) { console.error('[crafting] onChange', e); } }
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

// one operation with the view's request id (see the header)
async function operate(path, body, explain) {
  const state = view || await getView();
  const once = async requestId => {
    try { return await withRetry(() => call(path, { ...body, requestId })); } catch (e) {
      throw explain ? explain(e) : e;
    }
  };
  let out;
  try { out = await once(String(state.nextRequestId)); } catch (e) {
    if (e.error === 'stale-request') { await getView({ force: true }).catch(() => {}); throw e; }
    if (e.error !== 'request-id-conflict') throw e;
    const fresh = await getView({ force: true });
    out = await once(String(fresh.nextRequestId));
  }
  const next = store(out, true);
  return { view: next, operation: out.operation, changes: out.changes || {}, shardDelta: out.shardDelta || 0,
    secret: out.secret || { unlocked: [], freePacks: [] }, replayed: !!out.replayed };
}
const priceOf = (pc, kind) => {
  const c = view?.cards?.[String(pc)];
  return c ? view.values?.[kind]?.[c.rarity] : undefined;
};

/** Craft count copies of passcode pc. -> { view, operation, changes, shardDelta, secret, replayed } */
export function make(pc, count = 1) {
  return operate('/make', { passcode: Number(pc), count }, e => e.error === 'insufficient-shards'
    ? failure(e.error, { cost: priceOf(pc, 'craft') * count, shards: view?.shards }) : e);
}
/** Dismantle count unlocked copies of passcode pc. */
export const dismantle = (pc, count = 1) => operate('/dismantle', { passcode: Number(pc), count });
/** Dismantle every copy past keep (3 or 1) of every card, as the preview showed. */
export const dismantleExtras = keep => operate('/dismantle-extras', { keep });
/** What dismantleExtras(keep) would do: the view plus { changes, shardDelta } (spends no request id). */
export async function previewExtras(keep) {
  const state = view || await getView();
  const out = await withRetry(() => call('/dismantle-extras', { keep, preview: true, requestId: String(state.nextRequestId) }));
  return { ...out, changes: out.changes || {}, shardDelta: out.shardDelta || 0 };
}

export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
