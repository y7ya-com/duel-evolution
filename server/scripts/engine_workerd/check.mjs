// Runs the duel engine parity replay INSIDE workerd (wrangler dev, local): every fixture of
// gamedata/fixtures/engine/ (scripts/engine_record.mjs) is POSTed to scripts/engine_workerd/worker.js.
//
//   nice node scripts/engine_workerd/check.mjs
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_startWorker } from "wrangler";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "..", "gamedata", "fixtures", "engine");
const worker = await unstable_startWorker({ config: join(HERE, "wrangler.jsonc"), dev: { server: { port: 0 }, inspector: false, logLevel: "warn" } });
let bad = 0;
try {
  await worker.ready;
  const url = await worker.url;
  const ready = await (await fetch(new URL("/ready", url))).json();
  const want = JSON.parse(readFileSync(join(FIX, "ready.json"), "utf8"));
  for (const k of ["load_ms", "pid"]) ready[k] = want[k] = 0;
  if (JSON.stringify(ready) !== JSON.stringify(want)) {
    bad++;
    console.log("ready differs", ready, want);
  }
  let events = 0;
  for (const f of readdirSync(FIX).filter((f) => f.endsWith(".jsonl")).sort()) {
    const r = await (await fetch(new URL("/replay", url), { method: "POST", body: readFileSync(join(FIX, f)) })).json();
    events += r.events;
    bad += r.mismatches.length;
    console.log(`${f}: ${r.commands} commands, ${r.events} events, ${r.mismatches.length ? "MISMATCH " + JSON.stringify(r.mismatches[0]) : "equal"}`);
  }
  console.log(`workerd: ${events} events, ${bad ? "DIFFERENT" : "all equal"}`);
} finally {
  await worker.dispose();
}
process.exit(bad ? 1 : 0);
