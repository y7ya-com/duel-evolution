// Differential test of the in-process duel engine (src/duel/engine) against py's REAL duelcore process: every command
// recorded by scripts/engine_record.mjs is replayed into the TS DuelCore and its event lines must equal duelcore's,
// byte for byte except the `ms` timings. Needs gamedata/engine/ (scripts/engine_gamedata.mjs) and
// gamedata/fixtures/engine/ (scripts/engine_record.mjs), both gitignored.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DuelCore, Json } from "../src/duel/engine/core.ts";
import { createNodeDuelCore, ENGINE_DATA_DIR } from "../src/duel/engine/node.ts";

const FIX = join(ENGINE_DATA_DIR, "..", "fixtures", "engine");
const haveData = existsSync(join(ENGINE_DATA_DIR, "scripts.pack"));
const haveFix = existsSync(join(FIX, "ready.json"));
const ready = haveData && haveFix;
if (!ready) {
  console.warn(
    "duel-engine: SKIPPED, " + (!haveData ? "no gamedata/engine (run: nice node scripts/engine_gamedata.mjs)" : "no gamedata/fixtures/engine (run: nice node scripts/engine_record.mjs)"),
  );
}

/** Timings are not part of parity */
function mask(line: string): string {
  const o = JSON.parse(line) as Json;
  if ("ms" in o) o.ms = 0;
  if (o.ev === "ready") {
    o.load_ms = 0;
    o.pid = 0;
  }
  return JSON.stringify(o);
}

const scenarios = haveFix ? readdirSync(FIX).filter((f) => f.endsWith(".jsonl")).sort() : [];

describe.skipIf(!ready)("duel engine vs duelcore", () => {
  let dc: DuelCore;
  beforeAll(async () => {
    dc = await createNodeDuelCore();
  }, 60_000);

  it("ready event", () => {
    expect(mask(JSON.stringify(dc.ready))).toBe(mask(readFileSync(join(FIX, "ready.json"), "utf8").trim()));
  });

  for (const f of scenarios) {
    it(f.replace(/\.jsonl$/, ""), () => {
      const recs = readFileSync(join(FIX, f), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { cmd: Json; out: string[] });
      let events = 0;
      recs.forEach(({ cmd, out }, i) => {
        // duelcore places bot.ts's and `auto`'s cards from the left: py's order (src/duel/zones.ts)
        const got = dc.commandLines(cmd.cmd === "new" ? { ...cmd, place_order: "py" } : cmd).map(mask);
        const want = out.map(mask);
        if (got.join("\n") !== want.join("\n")) {
          // first differing line, for a readable failure
          const k = got.findIndex((l, j) => l !== want[j]);
          expect({ command: i, cmd, line: k, got: got[k] ?? got.length, want: want[k] ?? want.length }).toEqual({ command: i, cmd, line: k, got: want[k] ?? want.length, want: want[k] ?? want.length });
        }
        events += out.length;
      });
      expect(events).toBeGreaterThan(0);
    }, 120_000);
  }

  it("helpers send what duelcore.py sends", () => {
    const deck = { main: Array(40).fill(15025844) };
    const evs = dc.new("helper", [deck, deck], { seed: 3, rule: "MR1" });
    expect(evs[0]).toMatchObject({ ev: "created", id: "helper", first: 0, seed: "3", rule: "MR1", bot: [false, true], auto_chain: true });
    expect(evs.at(-1)!.ev).toBe("select");
    expect(dc.query("helper")).toMatchObject({ ev: "state", id: "helper", turn: 1 });
    expect(dc.cardinfo([15025844])[0]).toMatchObject({ code: 15025844, name: "Mystical Elf" });
    expect(dc.end("helper")[0]).toMatchObject({ ev: "end", reason: "ended", winner: null });
  });
});
