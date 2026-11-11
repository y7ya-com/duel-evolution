import { REWARDS } from "./rewards-config.ts";
export type RewardEvent = "play" | "win" | "npc" | "pvp" | "extra" | "deck" | "pack" | "shop" | "days";
export type Mission = { id: string; label: string; event: RewardEvent; target: number; progress: number; mp: number; kind: "daily" | "weekly" | "first" | "lifetime" | "event"; claimed: boolean;
  /** A limited-time event's reward in shards (mp 0) and its end (ISO, UTC). */
  shards?: number; ends?: string };
export type RewardState = {
  version: 1; started: string; day: string; week: string; issued: string[]; weeklyIssued: string[];
  login: { day: string; count: number; streak: number }; playedDay: string;
  missions: Mission[]; totals: Partial<Record<RewardEvent, number>>;
  token: string; receipts: Record<string, { id: string; mp: number; shards?: number }>;
  audit: { at: number; id: string; mp: number; earned: true; balance: number; requestId?: string; shards?: number }[];
  /** Limited-time NPC events: the map NPCs this character beat while each was on, by event key. */
  beaten?: Record<string, number[]>;
};
/** A limited-time event (rewards-config.ts REWARDS.events): beat every map NPC once between from and until (UTC days,
 *  until excluded); wins before it opened don't count. */
export type NpcEvent = { key: string; label: string; from: string; until: string; shards: number };
export const utcDay = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
export function utcWeek(seconds: number) {
  const d = new Date(seconds * 1000); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export function newRewardState(now: number): RewardState {
  const day = utcDay(now);
  const missions: Mission[] = [];
  for (const kind of ["first", "lifetime"] as const) for (const d of REWARDS[kind])
    missions.push({ ...d, event: d.event as RewardEvent, id: `${kind}:${d.key}`, kind, progress: 0, claimed: false });
  return { version: 1, started: day, day: "", week: "", issued: [], weeklyIssued: [],
    login: { day: "", count: 0, streak: 0 }, playedDay: "", missions, totals: {}, token: crypto.randomUUID(), receipts: {}, audit: [] };
}
/** Called once per observed day; no retroactive issues for missed logins, matching Master Duel. */
export function rollover(r: RewardState, now: number, peers: RewardState[] = []) {
  const day = utcDay(now), week = utcWeek(now);
  if (r.week !== week) { r.missions = r.missions.filter(m => m.kind !== "weekly"); r.week = week; }
  if (!peers.some(p => p.weeklyIssued.includes(week)) && !r.weeklyIssued.includes(week)) {
    for (const d of REWARDS.weekly) r.missions.push({ ...d, event: d.event as RewardEvent,
      id: `weekly:${week}:${d.key}`, kind: "weekly", progress: 0, claimed: false });
    r.weeklyIssued.push(week);
  }
  if (r.day === day) return;
  r.day = day;
  if (r.issued.includes(day) || peers.some(p => p.issued.includes(day))) return;
  const count = [r, ...peers].reduce((n, p) => n + p.missions.filter(m => m.kind === "daily" && !m.claimed).length, 0);
  // Three attainable objectives, with a rotating optional deck/mode objective on every third issuance.
  const options: { event: RewardEvent; target: number; label: string }[] = [
    { event: "play", target: 1, label: "Play a rewarded duel" },
    { event: "play", target: 2, label: "Play 2 rewarded duels" },
    { event: "win", target: 1, label: "Win a rewarded duel" },
    { event: "npc", target: 1, label: "Play a rewarded NPC duel" },
    { event: "pvp", target: 1, label: "Play a rewarded PvP duel" },
    { event: "extra", target: 1, label: "Play a rewarded duel with an extra deck" },
  ];
  // The first two are always mode/deck agnostic; the third rotates over the full pool.
  const dayIndex = Math.floor(now / 86400);
  const picks = [0, 1, 2 + dayIndex % 4];
  for (let i = 0; i < Math.min(REWARDS.daily.issued, REWARDS.daily.cap - count); i++) {
    r.missions.push({ ...options[picks[i]], id: `daily:${day}:${i}`, kind: "daily", mp: REWARDS.daily.mp, progress: 0, claimed: false });
  }
  r.issued.push(day);
  // Claimed daily/weekly entries are represented by durable receipts/audit, not active slots.
  r.missions = r.missions.filter(m => !m.claimed || m.kind === "first" || m.kind === "lifetime");
}
export function progress(r: RewardState, event: RewardEvent, count = 1) {
  if (!Number.isSafeInteger(count) || count <= 0) return;
  r.totals[event] = (r.totals[event] ?? 0) + count;
  for (const m of r.missions) if (!m.claimed && m.event === event) m.progress = Math.min(m.target, m.progress + count);
}

const dayStart = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
export const eventOn = (e: NpcEvent, now: number) => now >= dayStart(e.from) && now < dayStart(e.until);
/** Each event's mission while it is on, its progress the map NPCs beaten; after it ends an unfinished one goes and a
 *  finished one stays until claimed. `map`: the map NPCs' ids (empty: nothing to track). */
export function eventsRollover(r: RewardState, now: number, events: readonly NpcEvent[], map: readonly number[]) {
  if (!map.length) return;
  for (const e of events) {
    const id = `event:${e.key}`, beaten = (r.beaten?.[e.key] ?? []).filter(n => map.includes(n)).length;
    let m = r.missions.find(x => x.id === id);
    if (!m && eventOn(e, now)) r.missions.push(m = { id, label: e.label.replace("{n}", String(map.length)), event: "npc", kind: "event",
      target: map.length, progress: 0, mp: 0, shards: e.shards, ends: new Date(dayStart(e.until) * 1000).toISOString(), claimed: false });
    if (!m) continue;
    if (!m.claimed && eventOn(e, now)) m.progress = Math.min(m.target, beaten);
    if (!eventOn(e, now) && !m.claimed && m.progress < m.target) r.missions = r.missions.filter(x => x !== m);
  }
}
/** A win against map NPC `npc` (already the map's id) while events are on. */
export function noteNpcWin(r: RewardState, now: number, events: readonly NpcEvent[], npc: number) {
  for (const e of events) {
    if (!eventOn(e, now)) continue;
    const list = (r.beaten ??= {})[e.key] ??= [];
    if (!list.includes(npc)) list.push(npc);
  }
}
