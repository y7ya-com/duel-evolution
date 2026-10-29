// Smoke run of sim.ts from Node against a local `wrangler dev` (README.md): a walker, an NPC dueler and a PvP pair.
//   (from server/, bundled with esbuild) node local.mjs <base> <test sign-in secret> [secs]
import { readFileSync } from "node:fs";
import { newStats, npcDueler, pvpPair, Sim, summary, walker, type Plan } from "./sim.ts";

const [base, secret, secs = "60"] = process.argv.slice(2);
const ORIGIN = "https://load.invalid";
const d = JSON.parse(readFileSync("gamedata/duel.json", "utf8")).npc_decks["51"];
const plan: Plan = { secs: Number(secs), npc: 84, deck: [d.main, d.extra ?? []], prompts: 6, pvpPrompts: 30 };
const st = newStats();
const tag = Math.random().toString(36).slice(2, 5);

async function connect(i: number): Promise<Sim> {
  const r = await fetch(`${base}/api/de/test-sign-in`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "x-test-signin": secret }, body: JSON.stringify({ name: `TestS${tag}${i}` }) });
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/net", { headers: { Origin: ORIGIN, Cookie: cookie } } as any);
  ws.binaryType = "arraybuffer";
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const s = new Sim(ws as any, `S${i}`, st);
  if (!(await s.login(`S${tag}${i}`))) throw new Error(`login ${i}: ${JSON.stringify(st.errors)}`);
  return s;
}
setTimeout(() => { console.log("WATCHDOG", JSON.stringify(summary(st))); process.exit(1); }, (plan.secs + 90) * 1000);
const [w, n, a, b] = await Promise.all([0, 1, 2, 3].map(connect));
await Promise.all([walker(w, plan), npcDueler(n, plan), pvpPair(a, b, plan)]);
console.log(JSON.stringify(summary(st), null, 1));
process.exit(0);
