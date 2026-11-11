// What the Missions window (rewards/missions.js) shows, from the server's rewards view (rewards/api.js): the tabs (Event
// only while the server has a limited-time event: its reward is shards, not MP)
// and their claimable counts, each tab's rows and its strip (the daily stockpile and reset, the weekly reset, the first
// steps' overall progress, the achievements done), and the login calendar's 30 days. Pure: no DOM, no fetch.
// Every day boundary is the server's: 00:00 UTC, weeks from Monday 00:00 UTC (server/src/game/missions.ts).
export const TABS = [
  { key: 'event', label: 'Event' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'first', label: 'First Steps' },
  { key: 'lifetime', label: 'Achievements' },
];
const DAY = 86400000;

export const fmt = n => Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
/** "2d 5h", "5h 12m", "12m", "<1m": the time left until a reset. */
export function duration(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), r = m % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${r}m`;
  return m ? `${m}m` : '<1m';
}
/** The next 00:00 UTC after `now` (ms). */
export const nextDay = now => (Math.floor(now / DAY) + 1) * DAY;
/** The next Monday 00:00 UTC after `now` (ms). */
export function nextWeek(now) {
  const day = Math.floor(now / DAY), dow = (new Date(day * DAY).getUTCDay() + 6) % 7;   // 0 = Monday
  return (day - dow + 7) * DAY;
}

/** A mission's state: claimable (complete, not claimed), done (claimed), or open (in progress). */
export const missionState = m => m.claimed ? 'done' : m.claimable || m.progress >= m.target ? 'claimable' : 'open';
const ORDER = { claimable: 0, open: 1, done: 2 };

/** The rows of one tab: the claimable first, then those in progress, the claimed last (each in the server's order). */
export function rowsOf(view, tab) {
  const ms = (view?.missions || []).filter(m => m.kind === tab);
  return ms.map((m, i) => ({ m, i })).sort((a, b) => ORDER[missionState(a.m)] - ORDER[missionState(b.m)] || a.i - b.i)
    .map(({ m }) => ({ id: m.id, label: m.label, mp: m.mp, shards: m.shards || 0, left: m.left || null, target: m.target, state: missionState(m),
      progress: Math.min(m.target, Math.max(0, m.progress)), pct: m.target > 0 ? Math.min(1, Math.max(0, m.progress / m.target)) : 0 }));
}

/** The claimable mission ids, all tabs or one. */
export const claimableIds = (view, tab) => (view?.missions || []).filter(m => (!tab || m.kind === tab) && missionState(m) === 'claimable').map(m => m.id);

/** The tab strip: each tab's label and claimable count (Event only while there is one). */
export const tabsOf = view => TABS.filter(t => t.key !== 'event' || (view?.missions || []).some(m => m.kind === 'event'))
  .map(t => ({ ...t, count: claimableIds(view, t.key).length }));
/** An unclaimed limited-time event: the tab the window opens on. */
export const openEvent = view => (view?.missions || []).find(m => m.kind === 'event' && !m.claimed) || null;

/** The strip under the tabs for `tab` at `now` (ms): { text, sub, bar?: { done, total, pct } }. */
export function stripOf(view, tab, now = Date.now()) {
  const ms = (view?.missions || []).filter(m => m.kind === tab);
  const done = ms.filter(m => m.claimed).length;
  if (tab === 'daily') {
    const held = ms.filter(m => !m.claimed).length, cap = view?.stockpileCap || 9;
    return { text: `${held} of ${cap} held`, sub: `New missions in ${duration(nextDay(now) - now)}`,
      note: held >= cap ? 'Your stockpile is full: finish some to make room for tomorrow’s.' : '' };
  }
  if (tab === 'weekly') return { text: `${done} of ${ms.length} claimed`, sub: `Resets in ${duration(nextWeek(now) - now)}` };
  if (tab === 'event') {
    const m = ms[0];
    if (!m) return { text: 'No event right now', sub: '' };
    if (m.claimed) return { text: 'Event reward claimed', sub: `${fmt(m.shards)} shards are in your wallet` };
    return { text: `${fmt(m.progress)} of ${fmt(m.target)} NPCs beaten`, sub: `Ends in ${duration(Date.parse(m.ends) - now)}`, clock: true };
  }
  if (tab === 'first') {
    const total = ms.reduce((n, m) => n + m.mp, 0), got = ms.filter(m => m.claimed).reduce((n, m) => n + m.mp, 0);
    return { text: `${done} of ${ms.length} complete`, sub: `${fmt(got)} / ${fmt(total)} MP earned`,
      bar: { done, total: ms.length, pct: total ? got / total : 0 } };
  }
  return { text: `${done} of ${ms.length} complete`, sub: 'Lifetime goals for this character' };
}

/** The login calendar: 30 days, the received ones, today, the milestones, the next milestone. */
export function calendarOf(view) {
  const login = view?.login || {}, cycle = login.calendar?.length || 30, at = login.cycleDay || 0;
  const today = !!at && login.day && login.day === view?.day;
  const base = Math.min(...(login.calendar || [{ mp: 40 }]).map(c => c.mp));
  const days = (login.calendar || Array.from({ length: cycle }, (_, i) => ({ day: i + 1, mp: base }))).map(c => ({
    day: c.day, mp: c.mp, milestone: c.mp > base, received: c.day <= at, today: today && c.day === at }));
  const next = days.find(d => d.milestone && d.day > at);
  const todayCell = today ? days.find(d => d.day === at) : null;
  const tomorrow = days[at % cycle];
  return { days, cycleDay: at, streak: login.streak || 0, count: login.count || 0, today: todayCell,
    tomorrow, nextMilestone: next ? { day: next.day, mp: next.mp, in: next.day - at } : null };
}
