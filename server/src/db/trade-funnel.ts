// Review evidence only. Card value is the currently selected dismantle yield; cosmetics are reported separately.
import type { TradeRow, LoginRow } from "./audit.ts";
import { cardRarity } from "../game/card-rarity.ts";
import { shardValues } from "../game/shards-config.ts";
export type AccountEvidence = { createdAt?: number | null; level?: number | null };
export function analyseFunnel(trades: TradeRow[], logins: LoginRow[], meta: Record<string, AccountEvidence> = {},
  now = Date.now(), days = 7) {
  const from = now - days * 86400000;
  const value = (json: string) => {
    const pcs: unknown = JSON.parse(json);
    const cards = Array.isArray(pcs) ? pcs : [];
    return { copies: cards.length, value: cards.reduce((sum: number, pc) => sum +
      (cardRarity(Number(pc)) && !(Number(pc) >= 501000000 && Number(pc) <= 501000007) ? shardValues().dismantle[cardRarity(Number(pc))!] : 0), 0) };
  };
  const accounts = new Map<string, { account: string; received: number; sent: number; receivedCopies: number; sentCopies: number; trades: number; lopsidedTrades: number;
    senders: Map<string, { account: string; received: number; sent: number; receivedCopies: number; sentCopies: number; trades: number }> }>();
  const get = (account: string) => {
    let a = accounts.get(account);
    if (!a) { a = { account, received: 0, sent: 0, receivedCopies: 0, sentCopies: 0, trades: 0, lopsidedTrades: 0, senders: new Map() }; accounts.set(account, a); }
    return a;
  };
  const ips = (acct: string) => new Set(logins.filter((l) => l.acct === acct).map((l) => l.ip));
  let completedTrades = 0;
  for (const t of trades) {
    if (t.result !== "done" || t.at * 1000 < from || t.at * 1000 > now || t.a_acct === t.b_acct) continue;
    completedTrades++;
    const av = value(t.a_gave), bv = value(t.b_gave);
    for (const [acct, sender, received, sent, receivedCopies, sentCopies] of [[t.a_acct, t.b_acct, bv.value, av.value, bv.copies, av.copies], [t.b_acct, t.a_acct, av.value, bv.value, av.copies, bv.copies]] as [string, string, number, number, number, number][]) {
      const a = get(acct); a.received += received; a.sent += sent; a.receivedCopies += receivedCopies; a.sentCopies += sentCopies; a.trades++;
      if (received > 0 && received >= 4 * Math.max(1, sent)) a.lopsidedTrades++;
      const leg = a.senders.get(sender) ?? { account: sender, received: 0, sent: 0, receivedCopies: 0, sentCopies: 0, trades: 0 };
      leg.received += received; leg.sent += sent; leg.receivedCopies += receivedCopies; leg.sentCopies += sentCopies; leg.trades++; a.senders.set(sender, leg);
    }
  }
  const ranked = [...accounts.values()].map((a) => {
    const mine = ips(a.account);
    const senders = [...a.senders.values()].map((s) => {
      const m = meta[s.account] ?? {}, sharedIPs = [...ips(s.account)].filter((ip) => mine.has(ip));
      return { ...s, net: s.received - s.sent, sharedIPs,
        newAccount: m.createdAt == null ? null : now - m.createdAt < 7 * 86400000,
        lowLevel: m.level == null ? null : m.level <= 5, ...m };
    }).sort((x, y) => y.net - x.net || x.account.localeCompare(y.account));
    const positive = senders.filter((s) => s.net > 0), flags: string[] = [];
    if (a.received > a.sent && a.received >= 4 * Math.max(1, a.sent)) flags.push("one-way-flow");
    if (positive.length >= 5) flags.push("many-senders");
    if (positive.some((s) => s.sharedIPs.length)) flags.push("shared-ip");
    if (positive.some((s) => s.newAccount)) flags.push("new-senders");
    if (positive.some((s) => s.lowLevel)) flags.push("low-level-senders");
    if (a.lopsidedTrades) flags.push("lopsided-trades");
    return { account: a.account, received: a.received, sent: a.sent, net: a.received - a.sent, receivedCopies: a.receivedCopies, sentCopies: a.sentCopies, trades: a.trades,
      lopsidedTrades: a.lopsidedTrades, senderCount: positive.length, flags, topSenders: senders.slice(0, 20) };
  }).sort((x, y) => y.net - x.net || x.account.localeCompare(y.account));
  return { generated: new Date(now).toISOString(), window: { from: new Date(from).toISOString(), to: new Date(now).toISOString(), days },
    values: shardValues().dismantle, completedTrades, accounts: ranked, signals: { ip: true, device: false },
    note: "Review only. Shared networks are evidence, not proof. Cosmetics excluded from shard value; unknown age/level is null." };
}
export async function buildFunnelReport(db: D1Database, days = 7, now = Date.now()) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("window must be 1..365 days");
  const trades = (await db.prepare("SELECT * FROM trade_log WHERE at >= ? AND at <= ? ORDER BY at")
    .bind(Math.floor((now - days * 86400000) / 1000), Math.floor(now / 1000)).all<TradeRow>()).results;
  const accts = [...new Set(trades.flatMap((t) => [t.a_acct, t.b_acct]))];
  const meta: Record<string, AccountEvidence> = {}, logins: LoginRow[] = [];
  for (let i = 0; i < accts.length; i += 50) {
    const part = accts.slice(i, i + 50), q = part.map(() => "?").join(",");
    const rows = (await db.prepare(`SELECT a.acct, u.created_at AS createdAt, MAX(c.lv) AS level FROM accounts a
      LEFT JOIN user u ON u.id = a.user_id LEFT JOIN characters c ON c.acct = a.acct WHERE a.acct IN (${q}) GROUP BY a.acct`)
      .bind(...part).all<{ acct: string; createdAt: number | null; level: number | null }>()).results;
    for (const r of rows) meta[r.acct] = { createdAt: r.createdAt, level: r.level };
    const ips = (await db.prepare(`SELECT a.acct, l.ip, l.asn, l.as_org, l.country FROM accounts a JOIN login_ip l ON l.user_id = a.user_id
      WHERE a.acct IN (${q}) AND l.day >= ? AND l.day <= ?`)
      .bind(...part, new Date(now - Math.max(days, 30) * 86400000).toISOString().slice(0, 10), new Date(now).toISOString().slice(0, 10)).all<LoginRow>()).results;
    logins.push(...ips);
  }
  return analyseFunnel(trades, logins, meta, now, days);
}
