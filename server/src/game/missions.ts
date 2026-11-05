import { REWARDS } from "./rewards-config.ts";
export type RewardEvent = "play" | "win" | "npc" | "pvp" | "extra" | "deck" | "pack" | "shop" | "days";
export type Mission = { id: string; label: string; event: RewardEvent; target: number; progress: number; mp: number; kind: "daily" | "weekly" | "first" | "lifetime"; claimed: boolean };
export type RewardState = {
  version: 1; started: string; day: string; week: string; issued: string[]; weeklyIssued: string[];
  login: { day: string; count: number; streak: number }; playedDay: string;
  missions: Mission[]; totals: Partial<Record<RewardEvent, number>>;
  token: string; receipts: Record<string, { id: string; mp: number }>;
  audit: { at: number; id: string; mp: number; earned: true; balance: number; requestId?: string }[];
};
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
