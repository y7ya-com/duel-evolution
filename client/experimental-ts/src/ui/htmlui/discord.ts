// The Discord pieces of main's Legacy HTML UI, for the rewrite (main's htmlui/duels.js, screens/chat.js, playerlist.js;
// server truth: server/src/do.ts /__de/duels, /__de/duels/join, /__de/discord-online; game/lobby.ts OpenDuel;
// discord/bridge.ts DiscordDuelist).
// - The chat's Duels tab: the open duels of the viewer's world (GET /api/de/duels), Join (POST /api/de/duels/join {id},
//   the server's check; then the rewrite's own duelChallenge to the creator's pid).
// - ?duel=<id> (Discord #duels Accept): kept in sessionStorage from the first load for 10 minutes, joined once in a
//   lobby area, retried for a minute while the creator is not there yet.
// - The Players window's "(Discord)" rows: GET /api/de/discord-online.

/** lobby.ts OpenDuel, with the viewer's own marked (do.ts) */
export interface OpenDuelView { id: number; pid: number; name: string; lv: number; match: boolean; timeLimit: boolean; surrender: boolean; spectators: boolean; at?: number; free?: boolean; mine: boolean }
/** discord/bridge.ts DiscordDuelist: rank is rank-api.ts PublicRank, parts the 16-byte look */
export interface DiscordDuelist { pid: number; name: string; lv: number; rank: { label?: string; placed?: boolean; school?: string; division?: number } | null; parts: number[] }
export type FetchLike = (url: string, init?: RequestInit) => Promise<{ status: number; json(): Promise<unknown> }>;

// --- rows (pure)
export function duelRules(d: Pick<OpenDuelView, 'match' | 'timeLimit' | 'spectators' | 'surrender'>): string {
  return [d.match ? 'Match (best of 3)' : 'Single', d.timeLimit && 'time limit', d.spectators && 'spectators', d.surrender && 'surrender'].filter(Boolean).join(' · ');
}
export const duelRows = (duels: readonly OpenDuelView[] | null | undefined) =>
  (duels ?? []).map(d => ({ id: d.id, pid: d.pid, name: d.name, lv: `LV ${d.lv ?? '?'}`, rules: duelRules(d), mine: !!d.mine }));
/** open duels of others not seen yet (the tab's "(n)") */
export const unseen = (duels: readonly OpenDuelView[] | null | undefined, seen: ReadonlySet<number>) => (duels ?? []).filter(d => !d.mine && !seen.has(d.id)).length;
/** the Duels tab's lines, as the chat log's items (main's chat.js: name, LV, rules; the viewer's own says so) */
export const duelLines = (duels: readonly OpenDuelView[] | null | undefined): string[] => {
  const rows = duelRows(duels);
  if (!rows.length) return ['@0No open duels. Create Duel opens one anyone here may join.'];
  return rows.map(r => `@0${r.name}  ${r.lv}  ${r.rules}${r.mine ? '  (yours)' : '  [Join]'}`);
};

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export function parseDuels(j: unknown): { you: number | null; duels: OpenDuelView[] } | null {
  const o = j as { you?: unknown; duels?: unknown } | null;
  if (!o || !Array.isArray(o.duels)) return null;
  const duels = o.duels.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && num((d as { id?: unknown }).id) > 0).map(d => ({
    id: num(d.id), pid: num(d.pid), name: String(d.name ?? ''), lv: num(d.lv), match: !!d.match, timeLimit: !!d.timeLimit, surrender: !!d.surrender,
    spectators: !!d.spectators, at: num(d.at), free: !!d.free, mine: !!d.mine }));
  return { you: typeof o.you === 'number' ? o.you : null, duels };
}
export function parseDiscordOnline(j: unknown): DiscordDuelist[] {
  const ps = (j as { players?: unknown } | null)?.players;
  if (!Array.isArray(ps)) return [];
  return ps.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && num((p as { pid?: unknown }).pid) > 0).map(p => {
    const parts = Array.isArray(p.parts) ? (p.parts as unknown[]).slice(0, 16).map(x => num(x) & 255) : [];
    while (parts.length < 16) parts.push(0);
    return { pid: num(p.pid), name: String(p.name ?? ''), lv: num(p.lv), rank: (p.rank && typeof p.rank === 'object' ? p.rank : null) as DiscordDuelist['rank'], parts };
  });
}
/** the Discord duelists after the players here (the game's row, a Discord logo by the name); in-game names win */
export const DISCORD_LOGO = '\u{1F3AE}';
export function discordRows(players: readonly DiscordDuelist[], here: readonly { id: number; name: string }[]) {
  const ids = new Set(here.map(h => h.id)), names = new Set(here.map(h => h.name.toLowerCase()));
  return players.filter(p => !ids.has(p.pid) && !names.has(p.name.toLowerCase()))
    .map(p => ({ pid: p.pid, name: p.name, item: `@0@>40/${p.name} (Discord)`, lv: `LV ${p.lv}`, rank: p.rank?.label ?? '', parts: p.parts, discord: true as const }));
}

// --- the server
async function call(f: FetchLike, url: string, init?: RequestInit): Promise<[number, unknown]> {
  try { const r = await f(url, { credentials: 'same-origin', ...init }); return [r.status, await r.json().catch(() => ({}))]; } catch { return [0, {}]; }
}
export async function fetchDuels(f: FetchLike, base = '') { const [s, j] = await call(f, `${base}/api/de/duels`); return s === 200 ? parseDuels(j) : null; }
export async function fetchDiscordOnline(f: FetchLike, base = '') { const [s, j] = await call(f, `${base}/api/de/discord-online`); return s === 200 ? parseDiscordOnline(j) : null; }
export type JoinResult = { ok: true; name: string } | { ok: false; error: string; message: string };
/** the server's check, then challenge(pid of the creator): the rewrite's duelChallenge */
export async function joinDuel(f: FetchLike, id: number, pidOf: (name: string) => number | null, challenge: (pid: number) => void, base = ''): Promise<JoinResult> {
  const [s, j] = await call(f, `${base}/api/de/duels/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  const o = (j ?? {}) as { ok?: boolean; error?: string; message?: string; name?: string };
  if (s !== 200 || !o.ok) return { ok: false, error: o.error || 'net', message: o.message || 'The duel could not be joined. Try again.' };
  const name = String(o.name ?? ''), pid = pidOf(name);
  if (!pid) return { ok: false, error: 'absent', message: `${name} is not in your player list yet.` };
  challenge(pid);
  return { ok: true, name };
}

// --- the deeplink (main's duels.js, same keys so both clients agree)
const KEY = 'yo2.duel.pending', DONE = 'yo2.duel.done', TTL = 10 * 60000;
export const RETRY_FOR = 60000, RETRY_EVERY = 5000;
export const TERMINAL: ReadonlySet<string> = new Set(['gone', 'self', 'own-room', 'refused']);
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
const store = (): Store => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };
const get = (s: Store, k: string) => { try { return s?.getItem(k) ?? null; } catch { return null; } };
const put = (s: Store, k: string, v: string | null) => { try { if (v == null) s?.removeItem(k); else s?.setItem(k, v); } catch { /* storage off */ } };
export function capturePending(search: string, s: Store = store(), now = Date.now()): number | null {
  const id = parseInt(new URLSearchParams(search || '').get('duel') ?? '', 10);
  if (!(id > 0) || get(s, DONE) === String(id)) return null;
  put(s, KEY, JSON.stringify({ id, exp: now + TTL }));
  return id;
}
export function readPending(s: Store = store(), now = Date.now()): number | null {
  let p: { id?: number; exp?: number } | null = null;
  try { p = JSON.parse(get(s, KEY) ?? 'null'); } catch { p = null; }
  if (!p || !((p.id ?? 0) > 0)) return null;
  if (!((p.exp ?? 0) > now)) { put(s, KEY, null); return null; }
  return p.id!;
}
export function finishPending(id: number, s: Store = store()): void { put(s, KEY, null); put(s, DONE, String(id)); }
export interface AutoRun { t0?: number; busy?: boolean; next?: number; done?: number }
/** one step of the auto-join: in the world (a lobby is shown), not busy, not done, not before the next retry */
export function autoStep(o: { inWorld: boolean; now: number; pending: number | null; run: AutoRun }): { join: number } | null {
  const { inWorld, now, pending, run } = o;
  if (!pending || run.busy || run.done === pending || !inWorld) return null;
  if (run.next && now < run.next) return null;
  return { join: pending };
}
/** after a try: what the run becomes (done on success, a final refusal or the minute up; else retry in 5 s) */
export function afterTry(run: AutoRun, id: number, r: JoinResult, now: number, s: Store = store()): AutoRun {
  const t0 = run.t0 ?? now;
  if (r.ok || TERMINAL.has(r.error) || now - t0 >= RETRY_FOR) { finishPending(id, s); return { t0, done: id }; }
  return { t0, next: now + RETRY_EVERY };
}

/** The auto-join loop for the rewrite: call tick() each frame / state change. */
export function deeplinkJoiner(deps: { fetch: FetchLike; base?: string; inWorld: () => boolean; pidOf: (name: string) => number | null;
  challenge: (pid: number) => void; say?: (message: string) => void; now?: () => number; store?: Store }) {
  const s = deps.store === undefined ? store() : deps.store, now = deps.now ?? Date.now;
  let run: AutoRun = {};
  return {
    tick(): void {
      const step = autoStep({ inWorld: deps.inWorld(), now: now(), pending: readPending(s, now()), run });
      if (!step) return;
      run = { ...run, busy: true, t0: run.t0 ?? now() };
      void joinDuel(deps.fetch, step.join, deps.pidOf, deps.challenge, deps.base).then(r => {
        run = afterTry(run, step.join, r, now(), s);
        if (!r.ok && run.done === step.join) deps.say?.(r.message);
      });
    },
    get run() { return run; },
  };
}
