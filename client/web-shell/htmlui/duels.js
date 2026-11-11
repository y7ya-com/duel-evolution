// Open duels (the chat's Duels tab, screens/chat.js; server: Lobby.openDuels / duelJoinCheck, /api/de/duels): the list
// of created duels anyone in the same world may join, Join, and the Discord deeplink's auto-join. Joining is the game's
// own duel request: the server only checks the join may happen (POST /api/de/duels/join {id}), then invite.js presses
// the creator's card's "Send Duel Request" (their open room puts it there), and the creator accepts or declines as for
// any request. Plain ESM, no bundler imports: the legacy screens load it unbundled.
import { requestOnCard } from './invite.js';

const base = () => globalThis.ENV?.YO2_DE_HTTP || '';
// SceneId (src/System/yo2SceneManager.h): SCENE_LOBBY, SCENE_AREA_MAP (seen live: a lobby area such as Duelist Academy
// Store reads 12): where the player list is
const LOBBY = 11, WORLD = new Set([11, 12]);

// --- The rows (pure). A duel's rules in short words: its mode, then what it has ('time limit', 'spectators',
// 'surrender'): "Single · time limit · spectators", "Match (best of 3)".
export function duelRules(d) {
  return [d.match ? 'Match (best of 3)' : 'Single', d.timeLimit && 'time limit', d.spectators && 'spectators', d.surrender && 'surrender']
    .filter(Boolean).join(' · ');
}
export const duelRows = duels => (duels || []).map(d => ({ id: d.id, name: d.name, lv: 'LV ' + (d.lv ?? '?'), rules: duelRules(d), mine: !!d.mine }));
// open duels of others not seen yet (the tab's "(n)"); seen: a Set of ids
export const unseen = (duels, seen) => (duels || []).filter(d => !d.mine && !seen.has(d.id)).length;

// --- The server
async function call(path, init) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(base() + path, { credentials: 'same-origin', signal: ctl.signal, ...init });
    return [r.status, await r.json().catch(() => ({}))];
  } catch { return [0, {}]; } finally { clearTimeout(t); }
}
// -> { you, duels } or null (not reachable)
export async function fetchDuels() {
  const [s, j] = await call('/api/de/duels');
  return s === 200 && Array.isArray(j.duels) ? { you: j.you ?? null, duels: j.duels } : null;
}
// Join open duel id: the server's check, then the game's own request to its creator.
// -> { ok: true, name } or { ok: false, error, message } (error: the server's code; 'absent': the creator isn't in
// the player list yet; 'net': no answer)
export async function joinDuel(api, id, onName) {
  const [s, j] = await call('/api/de/duels/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  if (s !== 200 || !j.ok) return { ok: false, error: j.error || 'net', message: j.message || 'The duel could not be joined. Try again.' };
  onName?.(j.name);
  const r = await requestOnCard(api, j.name);
  if (r.ok) return { ok: true, name: j.name };
  return { ok: false, error: r.absent ? 'absent' : 'request', message: r.absent ? `${j.name} is not in your player list yet.` : r.message };
}

// --- The deeplink (Discord's Accept: /?online=1&duel=<room id>): the id kept in sessionStorage from the page's first
// load (the sign-in and Select Player come first) for 10 minutes, joined once the player is in a lobby area, retried
// for a minute while the creator isn't there yet; dropped on success, on a final refusal, or when the minute is up.
// A done id is remembered, so a reload of the same URL (or a hot reload of these modules) never sends it again.
const KEY = 'yo2.duel.pending', DONE = 'yo2.duel.done', TTL = 10 * 60000, RETRY_FOR = 60000, RETRY_EVERY = 5000;
export const TERMINAL = new Set(['gone', 'self', 'own-room', 'refused']);
const store = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
const get = (s, k) => { try { return s?.getItem(k) ?? null; } catch { return null; } };
const put = (s, k, v) => { try { v == null ? s?.removeItem(k) : s?.setItem(k, v); } catch {} };

// the id from a query string, kept unless it was done already -> the id or null
export function capturePending(search, s = store(), now = Date.now()) {
  const id = parseInt(new URLSearchParams(search || '').get('duel'), 10);
  if (!(id > 0) || get(s, DONE) === String(id)) return null;
  put(s, KEY, JSON.stringify({ id, exp: now + TTL }));
  return id;
}
export function readPending(s = store(), now = Date.now()) {
  let p = null;
  try { p = JSON.parse(get(s, KEY)); } catch {}
  if (!p || !(p.id > 0)) return null;
  if (!(p.exp > now)) { put(s, KEY, null); return null; }
  return p.id;
}
export function finishPending(id, s = store()) { put(s, KEY, null); put(s, DONE, String(id)); }

// One step of the auto-join (pure but for its calls): ctx { scene, now, pending, run } with run the state between
// steps ({ t0, busy, next, done }). -> what to do: null (nothing now), { join: id } (try now).
export function autoStep({ scene, now, pending, run }) {
  if (!pending || run.busy || run.done === pending) return null;
  if (!WORLD.has(scene)) return null;   // My Room, a shop, a duel: the minute starts in a lobby area
  if (run.next && now < run.next) return null;
  return { join: pending };
}
// what a join's answer does to the pending id: 'done' (sent, or refused for good, or out of time), 'retry'
export function afterJoin(res, t0, now) {
  if (res.ok || TERMINAL.has(res.error)) return 'done';
  return now - t0 >= RETRY_FOR ? 'done' : 'retry';
}

// The page's own run of it: step({ scene, api, status }) from the chat screen on its updates (and its poll);
// status(text) shows what happened in the Duels tab.
const run = { t0: 0, busy: false, next: 0, done: null };
export function deeplinkStep({ scene, api, status, show }) {
  const pending = readPending(), now = Date.now();
  const d = autoStep({ scene, now, pending, run });
  if (!d) return pending;
  run.busy = true;
  run.t0 ||= now;
  show?.();
  status('Joining the duel from Discord…');
  joinDuel(api, d.join, name => status(`Sending a duel request to ${name}…`)).then(res => {
    run.busy = false;
    const what = afterJoin(res, run.t0, Date.now());
    if (what === 'done') {
      finishPending(d.join);
      run.done = d.join; run.t0 = 0; run.next = 0;
      status(res.ok ? `Duel request sent to ${res.name}. Waiting for their answer.` : res.message, res.ok ? 'info' : 'error');
    } else {
      run.next = Date.now() + RETRY_EVERY;
      status(`${res.message} Trying again…`);
    }
  });
  return pending;
}
export { LOBBY, RETRY_FOR };

// kept from the page's first load (bridge.js imports this module at start); the id taken off the address bar so a
// copied link doesn't carry it
if (globalThis.location?.search && capturePending(location.search) != null) {
  try { const u = new URL(location.href); u.searchParams.delete('duel'); history.replaceState(history.state, '', u); } catch {}
}
