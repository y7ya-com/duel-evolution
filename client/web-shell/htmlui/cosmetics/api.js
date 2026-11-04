// The cosmetics HTTP client (shared: the box shop, cosmetics/boxes*.js, and the Wardrobe, cosmetics/wardrobe*.js).
// Same origin: the Worker (server/src/worker.ts gameFeature) checks the session and forwards /api/de/cosmetics[/...]
// to the Durable Object's /__de/cosmetics handlers (server/src/do.ts; game/cosmetics.ts cosmeticInfo / cosmeticOpen /
// cosmeticEquip). A success is the account's whole cosmetics state (wallet, boxes with pity and odds, inventory,
// catalog, appearance, nextRequestId), plus `reward` (open) or `equipped` (equip); a failure is { error, status, ... }
// with an HTTP status. Here every failure becomes { error, message } (message: player-facing text) and is thrown.
//
// getInfo({ force }): the state, cached (CACHE_TTL) and coalesced while a request is in flight.
// openBox(boxId): one open. The server takes a monotonic requestId (info.nextRequestId) and keeps a receipt per id, so
//   a retry with the same id replays the same reward instead of charging twice: a network failure or a 503 is retried
//   with the same id, and the id only advances when a success brings a new state. A stale id (another tab opened a
//   box) refreshes the state and asks the player to press again; a conflicting id (the lost request was another box's)
//   refreshes and retries once with the fresh id.
// equip(id, world): wear an owned item (world 0 Domino, 1 Academy; omitted = the world the character is in).
// setAppearance(world, parts): wear a whole look in one world (how the Wardrobe puts on a rank uniform).
// onChange(cb): cb(info) after every successful open, equip or appearance change (and a forced refresh that changed it); -> unsubscribe.
export const CACHE_TTL = 60000;
export const RETRY_DELAYS = [400, 1200, 2500];

const BASE = () => (globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/cosmetics';
const WORLD_NAME = { 0: 'Domino City', 1: 'Duel Academy' };

let info = null, at = 0, inflight = null;
const listeners = new Set();
let sleep = ms => new Promise(r => setTimeout(r, ms));

/** Tests: drop the cache and listeners; `wait` replaces the retry delay. */
export function _reset({ wait } = {}) { info = null; at = 0; inflight = null; listeners.clear(); if (wait) sleep = wait; }
/** The cached state without asking (null before the first answer). */
export const peekInfo = () => info;

/** The player-facing text for a failure code (`extra`: the server's body, and what the caller knows: box, wallet). */
export function errorText(error, extra = {}) {
  switch (error) {
    case 'insufficient-earned-mp': {
      const price = extra.box?.price, earned = extra.wallet?.earned;
      const need = price != null && earned != null ? ` This box costs ${fmt(price)} earned MP and you have ${fmt(earned)}.` : '';
      return `Not enough earned MP.${need} Starter MP can't be spent on boxes: win duels to earn more.`;
    }
    case 'in-duel': return "You can't do that during a duel. Finish the duel first.";
    case 'busy': return "You can't do that while a duel or trade is in progress.";
    case 'unavailable-pool': return 'This box is closed for now while its items are restocked. Please try another box.';
    case 'stale-request': return 'The shop was out of date, so it has been refreshed. Please press the button again.';
    case 'request-conflict': return 'The shop was out of date, so it has been refreshed. Please press the button again.';
    case 'no-compatible-variant':
      if (extra.reason === 'world' && Array.isArray(extra.worlds) && extra.worlds.length)
        return `This item can only be worn in ${extra.worlds.map(w => WORLD_NAME[w] || `world ${w}`).join(' and ')}.`;
      return extra.notice || "Your character's body can't wear this item yet.";
    case 'not-owned': return "You don't own this item yet.";
    case 'unowned-or-invalid-appearance': case 'invalid-appearance':
      return "You can't wear that look yet: a rank uniform needs its dorm reached first.";
    case 'server-restarting': return 'The server is restarting. Please try again in a few seconds.';
    case 'temporarily-unavailable': return 'The server is busy right now. Please try again in a moment.';
    case 'network': return "Couldn't reach the server. Check your connection and try again.";
    case 'signed out': case 'not-in-game': return 'Your session has ended. Please sign in again.';
    case 'no-character': return 'Choose a character first.';
    case 'free-mode': return 'Boxes and the wardrobe are not available in free mode.';
    case 'bad-request': case 'invalid JSON': return 'The game sent a request the server did not understand. Please reload the page.';
    default: return 'Something went wrong. Please try again.';
  }
}
const fmt = n => Number(n).toLocaleString('en-US');
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
    throw Object.assign(failure(code, json || {}), { retry: code === 'temporarily-unavailable' || !json });
  }
  if (!json) throw Object.assign(failure(r.status >= 500 ? 'temporarily-unavailable' : 'network'), { retry: r.status >= 500 });
  throw failure(json.error || 'unknown', json);
}

function store(next, notify) {
  // a success carries the whole state; keep the action's extras (reward, equipped) off the cached copy
  const { reward: _r, equipped: _e, replay: _p, requestId: _q, ...state } = next;
  const changed = notify || (info && JSON.stringify(info) !== JSON.stringify(state));
  info = state; at = Date.now();
  if (changed) for (const cb of [...listeners]) { try { cb(state); } catch (e) { console.error('[cosmetics] onChange', e); } }
  return state;
}

export function getInfo({ force = false } = {}) {
  if (!force && info && Date.now() - at < CACHE_TTL) return Promise.resolve(info);
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

/** -> { info, reward: item + { duplicate }, replay } */
export async function openBox(boxId) {
  const state = info || await getInfo();
  const box = state.boxes?.find(b => b.id === boxId);
  const once = async (requestId) => {
    try { return await withRetry(() => call('/open', { boxId, requestId })); } catch (e) {
      if (e.error === 'insufficient-earned-mp') throw failure(e.error, { box, wallet: info?.wallet || state.wallet });
      throw e;
    }
  };
  let out;
  try { out = await once(String(state.nextRequestId)); } catch (e) {
    if (e.error === 'stale-request') { await getInfo({ force: true }).catch(() => {}); throw e; }
    if (e.error !== 'request-conflict') throw e;
    // the id was spent on another box's open whose answer was lost: that reward is in the inventory already
    const fresh = await getInfo({ force: true });
    out = await once(String(fresh.nextRequestId));
  }
  const next = store(out, true);
  return { info: next, reward: out.reward, replay: !!out.replay };
}

/** -> { info, equipped: { id, world, parts } } */
export async function equip(id, world) {
  const out = await withRetry(() => call('/equip', world === undefined ? { id } : { id, world }));
  return { info: store(out, true), equipped: out.equipped };
}

/** A whole look for one world (the rank uniforms aren't catalog items, so they're worn as parts). -> { info, appearance } */
export async function setAppearance(world, parts) {
  const out = await withRetry(() => call('/appearance', { world, parts }));
  return { info: store(out, true), appearance: out.appearance };
}

export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
