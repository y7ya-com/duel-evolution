import { expect, it } from "vitest";
import { logLevel } from "../src/util/loglevel.ts";
it("production log: errors, anomalies and the economy only", () => {
  expect([
    "[ERROR] [ocg] duelo 7: fallo del duelo (x)", "[srv:5740] error answering: TypeError", "[d1] write of 3 row changes failed (e)",
    "[srv:5760] closed (bad MD5 or message > 1024 B)", "[economia] abc123: +150 MP (npc win)", "[hub] limit of 64 sessions: 0x3003 of ab… refused (−200)",
    "[srv:5740] <- 0x5300 #8 len=10 0000", "[srv:5740] -> 0x5300 #25 len=10", "[aviso] [srv:5740] 0x3112 on a closed connection: dropped",
    "[d1] state loaded: 33 accounts", "[hub] account u:abc: index 3",
  ].map(logLevel)).toEqual(["error", "error", "error", "warn", "warn", "warn", null, null, null, null, null]);
});
