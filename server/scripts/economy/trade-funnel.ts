// Read-only offline report from JSON {trades: TradeRow[], logins: LoginRow[], meta?: {acct:{createdAt,level}}}.
// node_modules/.pnpm/node_modules/.bin/vite-node scripts/economy/trade-funnel.ts evidence.json [days] [now-ms]
import { readFileSync } from "node:fs";
import { analyseFunnel } from "../../src/db/trade-funnel.ts";
const [file, days = "7", now = String(Date.now())] = process.argv.slice(2);
if (!file) throw new Error("usage: trade-funnel.ts evidence.json [days] [now-ms]");
const input = JSON.parse(readFileSync(file, "utf8"));
if (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 365) throw new Error("days must be 1..365");
console.log(JSON.stringify(analyseFunnel(input.trades, input.logins ?? [], input.meta ?? {}, Number(now), Number(days)), null, 2));
