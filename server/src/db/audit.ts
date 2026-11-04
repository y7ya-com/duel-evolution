// The anti-alt audit (owner, 2026-11-04: a main fed by alt accounts on VPNs, 261 cards in four days): the trade ledger
// and the sign-in IP history (db/audit-schema.ts), and the daily report the Worker's cron builds from them (worker.ts
// scheduled). The report flags; a person decides (shared homes and networks look like alts too).
import type { TradeEntry } from "../game/trade.ts";
import { ipBucket } from "../auth/auth.ts";

const DAY_MS = 86400_000;
export const LOGIN_IP_KEEP_DAYS = 90, TRADE_LOG_KEEP_DAYS = 365;

export async function recordTrade(db: D1Database, e: TradeEntry): Promise<void> {
  await db.prepare(`INSERT INTO trade_log (at, result, a_acct, a_slot, a_name, a_gave, b_acct, b_slot, b_name, b_gave)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(Math.floor(e.at), e.result, e.a.acct, e.a.slot, e.a.name, JSON.stringify(e.a.gave),
    e.b.acct, e.b.slot, e.b.name, JSON.stringify(e.b.gave)).run();
}

/** A game connection of a signed-in user: its IP (an IPv6 /64), network and country, once per user, IP and day. */
export async function recordLogin(db: D1Database, userId: string, req: Request, now = Date.now()): Promise<void> {
  const ip = req.headers.get("cf-connecting-ip");
  if (!ip) return;
  const cf = ((req as unknown as { cf?: { asn?: number; asOrganization?: string; country?: string } }).cf) ?? {};
  await db.prepare(`INSERT INTO login_ip (user_id, ip, day, asn, as_org, country, first, last, n) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT (user_id, ip, day) DO UPDATE SET last = excluded.last, n = n + 1`)
    .bind(userId, ipBucket(ip), new Date(now).toISOString().slice(0, 10), cf.asn ?? null, cf.asOrganization ?? null, cf.country ?? null, now, now).run();
}

// ---- the report
/** Networks of hosting and VPN providers (consumer VPN exits sit in these). M247 carried both alts of 2026-11-04. */
const HOSTING_ASNS = new Set([9009, 16276, 24940, 14061, 16509, 14618, 396982, 8075, 63949, 20473, 60068, 60781, 28753, 16265,
  51167, 62240, 147049, 21859, 11878, 3258, 47583, 8560, 31898, 45102, 132203, 13335, 212238, 136787, 207137, 49981, 199524]);
const HOSTING_ORG = /hosting|datacent|data cent|\bcloud|server|\bvps\b|\bvpn\b|colocation|m247|ovh|hetzner|digitalocean|linode|vultr|choopa|leaseweb|contabo|datacamp/i;
export const isHosting = (asn: number | null, org: string | null): boolean => (asn !== null && HOSTING_ASNS.has(asn)) || HOSTING_ORG.test(org ?? "");

/** Thresholds (cards over the report's window). */
export const REPORT = { WINDOW_DAYS: 7, IP_DAYS: 30, ONE_WAY_NET: 20, ONE_WAY_RATIO: 4, RELAY_S: 7200, RELAY_MIN: 5, REFUSED_MIN: 5 } as const;

export interface TradeRow { at: number; result: string; a_acct: string; a_name: string | null; a_gave: string; b_acct: string; b_name: string | null; b_gave: string }
export interface LoginRow { acct: string; ip: string; asn: number | null; as_org: string | null; country: string | null }
export type Finding =
  | { kind: "one_way"; from: string; to: string; net: number; gave: number; got: number; trades: number; names: string[] }
  | { kind: "relay"; from: string; via: string; to: string; cards: number; times: number; names: string[] }
  | { kind: "shared_ip"; accounts: [string, string]; ips: string[]; traded: number }
  | { kind: "refused"; acct: string; names: string[]; attempts: number; why: Record<string, number> };
export interface Report {
  generated: string; window: { from: string; to: string }; trades: number;
  findings: Finding[];
  /** per flagged account: its sign-in networks in the IP window, and whether every one of them is a hosting/VPN network */
  accounts: Record<string, { user: string | null; networks: { ip: string; org: string | null; country: string | null; hosting: boolean }[]; hosting_only: boolean }>;
}

const cards = (j: string): number[] => { try { const v = JSON.parse(j); return Array.isArray(v) ? v.map(Number) : []; } catch { return []; } };

/** The findings over these rows (pure: tests feed it rows, buildReport feeds it D1). */
export function analyse(trades: TradeRow[], logins: LoginRow[], users: Record<string, string | null>, now: number): Report {
  const done = trades.filter((t) => t.result === "done").sort((x, y) => x.at - y.at);
  const findings: Finding[] = [];
  const names = new Map<string, Set<string>>();
  const named = (acct: string, n: string | null) => { if (n) (names.get(acct) ?? names.set(acct, new Set()).get(acct)!).add(n); };
  for (const t of trades) { named(t.a_acct, t.a_name); named(t.b_acct, t.b_name); }
  const nameList = (...accts: string[]) => accts.flatMap((a) => [...(names.get(a) ?? [])].map((n) => `${n} (${a.slice(0, 8)})`));

  // one-way: cards that went from one account to another with little coming back
  const flow = new Map<string, { gave: number; trades: number }>();
  const add = (from: string, to: string, n: number) => { const k = `${from}\t${to}`; const f = flow.get(k) ?? { gave: 0, trades: 0 }; f.gave += n; f.trades++; flow.set(k, f); };
  for (const t of done) { add(t.a_acct, t.b_acct, cards(t.a_gave).length); add(t.b_acct, t.a_acct, cards(t.b_gave).length); }
  for (const [k, f] of flow) {
    const [from, to] = k.split("\t");
    if (from === to) continue;
    const back = flow.get(`${to}\t${from}`)?.gave ?? 0, net = f.gave - back;
    if (net >= REPORT.ONE_WAY_NET && f.gave >= REPORT.ONE_WAY_RATIO * Math.max(1, back))
      findings.push({ kind: "one_way", from, to, net, gave: f.gave, got: back, trades: f.trades, names: nameList(from, to) });
  }

  // relay: cards that reached an account and left it for a third within RELAY_S (the Virus/Dark/Claw → Master → Black run)
  const relays = new Map<string, { cards: number; times: number }>();
  const legs = done.flatMap((t) => [{ at: t.at, from: t.a_acct, to: t.b_acct, c: cards(t.a_gave) }, { at: t.at, from: t.b_acct, to: t.a_acct, c: cards(t.b_gave) }]).filter((l) => l.c.length);
  for (const [i, l1] of legs.entries()) {
    const got = new Map<number, number>();
    for (const c of l1.c) got.set(c, (got.get(c) ?? 0) + 1);
    for (const l2 of legs.slice(i + 1)) {
      if (l2.at - l1.at > REPORT.RELAY_S) break;
      if (l2.from !== l1.to || l2.to === l1.from || l2.to === l1.to || l2.at < l1.at) continue;
      let n = 0;
      for (const c of l2.c) { const k = got.get(c) ?? 0; if (k > 0) { n++; got.set(c, k - 1); } }
      if (!n) continue;
      const k = `${l1.from}\t${l1.to}\t${l2.to}`, r = relays.get(k) ?? { cards: 0, times: 0 };
      r.cards += n; r.times++; relays.set(k, r);
    }
  }
  for (const [k, r] of relays) if (r.cards >= REPORT.RELAY_MIN) {
    const [from, via, to] = k.split("\t");
    findings.push({ kind: "relay", from, via, to, cards: r.cards, times: r.times, names: nameList(from, via, to) });
  }

  // shared IP: two accounts that traded with each other and signed in from one address (an IPv6 /64)
  const ipsOf = new Map<string, Set<string>>();
  for (const l of logins) (ipsOf.get(l.acct) ?? ipsOf.set(l.acct, new Set()).get(l.acct)!).add(l.ip);
  const pairs = new Map<string, number>();
  for (const t of trades) if (t.a_acct !== t.b_acct) { const k = [t.a_acct, t.b_acct].sort().join("\t"); pairs.set(k, (pairs.get(k) ?? 0) + 1); }
  for (const [k, n] of pairs) {
    const [x, y] = k.split("\t") as [string, string];
    const ys = ipsOf.get(y), shared = [...(ipsOf.get(x) ?? [])].filter((ip) => ys?.has(ip));
    if (shared.length) findings.push({ kind: "shared_ip", accounts: [x, y], ips: shared, traded: n });
  }

  // refused: an account that keeps trying to move soul-bound cards, give before it earned, or pass the day's cap
  const refused = new Map<string, Record<string, number>>();
  for (const t of trades) if (t.result === "bound" || t.result === "fresh" || t.result === "cap")
    for (const a of [t.a_acct, t.b_acct]) { const w = refused.get(a) ?? {}; w[t.result] = (w[t.result] ?? 0) + 1; refused.set(a, w); }
  for (const [acct, why] of refused) {
    const attempts = Object.values(why).reduce((s, n) => s + n, 0);
    if (attempts >= REPORT.REFUSED_MIN) findings.push({ kind: "refused", acct, names: nameList(acct), attempts, why });
  }

  const order = { relay: 0, one_way: 1, shared_ip: 2, refused: 3 } as const;
  const weight = (f: Finding) => f.kind === "relay" ? f.cards : f.kind === "one_way" ? f.net : f.kind === "shared_ip" ? f.traded : f.attempts;
  findings.sort((x, y) => order[x.kind] - order[y.kind] || weight(y) - weight(x));

  const flagged = new Set(findings.flatMap((f) => f.kind === "relay" ? [f.from, f.via, f.to] : f.kind === "one_way" ? [f.from, f.to] : f.kind === "shared_ip" ? f.accounts : [f.acct]));
  const accounts: Report["accounts"] = {};
  for (const a of flagged) {
    const seen = new Map<string, LoginRow>();
    for (const l of logins) if (l.acct === a) seen.set(l.ip, l);
    const networks = [...seen.values()].map((l) => ({ ip: l.ip, org: l.as_org, country: l.country, hosting: isHosting(l.asn, l.as_org) }));
    accounts[a] = { user: users[a] ?? null, networks, hosting_only: networks.length > 0 && networks.every((n) => n.hosting) };
  }
  return { generated: new Date(now).toISOString(), window: { from: new Date(now - REPORT.WINDOW_DAYS * DAY_MS).toISOString(), to: new Date(now).toISOString() }, trades: trades.length, findings, accounts };
}

export async function buildReport(db: D1Database, now = Date.now()): Promise<Report> {
  const from = Math.floor((now - REPORT.WINDOW_DAYS * DAY_MS) / 1000);
  const trades = (await db.prepare("SELECT at, result, a_acct, a_name, a_gave, b_acct, b_name, b_gave FROM trade_log WHERE at >= ? ORDER BY at")
    .bind(from).all<TradeRow>()).results;
  const accts = [...new Set(trades.flatMap((t) => [t.a_acct, t.b_acct]))];
  const users: Record<string, string | null> = {};
  const logins: LoginRow[] = [];
  const ipFrom = new Date(now - REPORT.IP_DAYS * DAY_MS).toISOString().slice(0, 10);
  for (let i = 0; i < accts.length; i += 50) {
    const part = accts.slice(i, i + 50), q = part.map(() => "?").join(",");
    for (const r of (await db.prepare(`SELECT acct, user_id FROM accounts WHERE acct IN (${q})`).bind(...part).all<{ acct: string; user_id: string | null }>()).results) users[r.acct] = r.user_id;
    const ids = part.map((a) => users[a]).filter((u): u is string => !!u);
    if (!ids.length) continue;
    const acctOf = new Map(part.filter((a) => users[a]).map((a) => [users[a]!, a]));
    const rows = (await db.prepare(`SELECT user_id, ip, asn, as_org, country FROM login_ip WHERE day >= ? AND user_id IN (${ids.map(() => "?").join(",")})`)
      .bind(ipFrom, ...ids).all<{ user_id: string; ip: string; asn: number | null; as_org: string | null; country: string | null }>()).results;
    for (const r of rows) logins.push({ acct: acctOf.get(r.user_id)!, ip: r.ip, asn: r.asn, as_org: r.as_org, country: r.country });
  }
  return analyse(trades, logins, users, now);
}

/** A Discord-sized summary of a report (the webhook's content limit is 2000 characters). */
export function summary(r: Report, link: string): string {
  const who = (names: string[]) => names.slice(0, 4).join(", ") + (names.length > 4 ? "…" : "");
  const vpn = (accts: string[]) => accts.some((a) => r.accounts[a]?.hosting_only) ? " ⚠ VPN/hosting only" : "";
  const lines = r.findings.slice(0, 12).map((f) =>
    f.kind === "relay" ? `• relay ${f.cards} cards ${f.from.slice(0, 8)} → ${f.via.slice(0, 8)} → ${f.to.slice(0, 8)} (${who(f.names)})${vpn([f.from, f.via])}`
    : f.kind === "one_way" ? `• one-way ${f.net} net cards ${f.from.slice(0, 8)} → ${f.to.slice(0, 8)} in ${f.trades} trades (${who(f.names)})${vpn([f.from])}`
    : f.kind === "shared_ip" ? `• shared IP ${f.accounts.map((a) => a.slice(0, 8)).join(" & ")}, ${f.traded} trades between them`
    : `• ${f.attempts} refused trades ${f.acct.slice(0, 8)} (${who(f.names)}): ${Object.entries(f.why).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  const head = `**Trade report ${r.generated.slice(0, 10)}**: ${r.trades} trades in ${REPORT.WINDOW_DAYS} days, ${r.findings.length} findings`;
  return [head, ...lines, r.findings.length > 12 ? `…and ${r.findings.length - 12} more` : "", link].filter(Boolean).join("\n").slice(0, 1990);
}

/** The cron's job: prune, build, keep the report in R2 (private/reports/trades/<day>.json), post the summary. */
export async function runTradeReport(env: { DB?: D1Database; BUCKET?: R2Bucket; REPORT_WEBHOOK?: string; PUBLIC_ORIGIN?: string }, now = Date.now()): Promise<Report | null> {
  if (!env.DB) return null;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_ip WHERE day < ?").bind(new Date(now - LOGIN_IP_KEEP_DAYS * DAY_MS).toISOString().slice(0, 10)),
    env.DB.prepare("DELETE FROM trade_log WHERE at < ?").bind(Math.floor((now - TRADE_LOG_KEEP_DAYS * DAY_MS) / 1000)),
  ]);
  const r = await buildReport(env.DB, now);
  const key = `private/reports/trades/${r.generated.slice(0, 10)}.json`;
  await env.BUCKET?.put(key, JSON.stringify(r, null, 1), { httpMetadata: { contentType: "application/json" } });
  if (env.REPORT_WEBHOOK && r.findings.length) {
    const link = `${env.PUBLIC_ORIGIN ?? ""}/__trade-report?day=${r.generated.slice(0, 10)}`;
    const res = await fetch(env.REPORT_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: summary(r, link), allowed_mentions: { parse: [] } }) });
    if (!res.ok) console.error(`[trade report] webhook ${res.status}`);
  }
  console.warn(`[economia] trade report ${r.generated.slice(0, 10)}: ${r.trades} trades, ${r.findings.length} findings`);
  return r;
}
