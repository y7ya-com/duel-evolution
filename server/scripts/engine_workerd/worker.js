// workerd check for the duel engine (scripts/engine_workerd/check.mjs runs it under `wrangler dev`, locally): the same
// fixture replay as test/duel-engine.test.ts, but inside workerd, with the precompiled wasm module (workerd.ts) and
// node:zlib from nodejs_compat. POST /replay with a fixture .jsonl body -> {commands, events, mismatches[]}.
// Plain JS so tsc skips it (it imports the gitignored gamedata). The data is bundled here only for the local check (scripts.pack is ~20 MB: a deployed Worker reads it from R2).
import cards from "../../gamedata/engine/cards.json";
import strings from "../../gamedata/engine/strings.json";
import scripts from "../../gamedata/engine/scripts.pack";
import { createWorkerdDuelCore } from "../../src/duel/engine/workerd.ts";

/** @type {Promise<import("../../src/duel/engine/core.ts").DuelCore> | undefined} */
let dc;

function mask(line) {
  const o = JSON.parse(line);
  if ("ms" in o) o.ms = 0;
  if (o.ev === "ready") {
    o.load_ms = 0;
    o.pid = 0;
  }
  return JSON.stringify(o);
}

export default {
  async fetch(req) {
    dc ??= createWorkerdDuelCore({ cards, strings, scripts: new Uint8Array(scripts) });
    const core = await dc;
    const url = new URL(req.url);
    if (url.pathname === "/ready") return Response.json(core.ready);
    if (url.pathname !== "/replay") return new Response("not found", { status: 404 });
    const recs = (await req.text()).trim().split("\n").map((l) => JSON.parse(l));
    const mismatches = [];
    let events = 0;
    recs.forEach(({ cmd, out }, i) => {
      const got = core.commandLines(cmd).map(mask);
      const want = out.map(mask);
      events += want.length;
      if (got.join("\n") !== want.join("\n") && mismatches.length < 5) {
        const k = got.findIndex((l, j) => l !== want[j]);
        mismatches.push({ command: i, cmd, line: k, got: got[k] ?? null, want: want[k] ?? null });
      }
    });
    return Response.json({ commands: recs.length, events, mismatches });
  },
};
