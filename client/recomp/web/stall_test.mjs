// node web/stall_test.mjs: web/stall.js in a sandbox with a fake clock: long frames, hidden tabs, duel waits, batches.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let now = 0;
const posts = [], listeners = {}, Module = { yo2Lazy: { missLog: [], duel: "npc" } };
const ctx = { Module, URLSearchParams, JSON, Math, Blob,
    location: { search: "" }, performance: { now: () => now }, navigator: { userAgent: "test" },
    document: { hidden: false, querySelector: () => ({ content: "b1" }) },
    addEventListener: (k, f) => (listeners[k] = f), setTimeout: () => 1, clearTimeout() {},
    fetch: (url, o) => (posts.push(JSON.parse(o.body)), Promise.resolve()) };
vm.runInNewContext(readFileSync(new URL("stall.js", import.meta.url), "utf8"), ctx);
const frame = (ms) => { now += ms; Module.yo2Frame(); };

frame(16), frame(16), frame(100);
assert.equal(Module.yo2Stalls.length, 0, "short frames are not stalls");
Module.yo2Lazy.missLog.push([now + 10, 200, "merge.dat", 561], [now - 500, 50, "merge.dat", 3]);
frame(400);
assert.deepEqual(Module.yo2Stalls[0].miss, [[200, "merge.dat", 561]], "only the misses inside the long frame");
assert.equal(Module.yo2Stalls[0].ms, 400), assert.equal(Module.yo2Stalls[0].duel, "npc"), assert.equal(Module.yo2Stalls[0].sw, false);

ctx.document.hidden = true, listeners.visibilitychange();   // hiding flushes the queue
assert.equal(posts.length, 1), assert.equal(posts[0].stalls.length, 1), assert.equal(posts[0].build, "b1");
frame(5000), (ctx.document.hidden = false), frame(16);
assert.equal(Module.yo2Stalls.length, 1, "a frame the tab spent hidden is not a stall");

Module.yo2NetIO(1), (now += 3000), Module.yo2NetIO(0);
assert.equal(Module.yo2Stalls.length, 1, "a slow reply outside a duel is not recorded");
Module.onYo2Scene("end", 0x1e, 0x1c);
Module.yo2NetIO(1), (now += 1000), Module.yo2NetIO(1), (now += 2500), Module.yo2NetIO(0);
assert.equal(Module.yo2Stalls[1].kind, "wait"), assert.equal(Module.yo2Stalls[1].ms, 3500, "from the first unanswered send");

now += 100, Module.onYo2Scene("begin", 0x1c, 0x20), (now += 300), Module.yo2Frame(120.4, 30);
assert.equal(Module.yo2Stalls[2].sw, true, "a scene switch inside it"), assert.equal(Module.yo2Stalls[2].decode, 120);
for (let i = 0; i < 8; i++) frame(300);
assert.equal(posts.length, 2, "10 queued: a batch"), assert.equal(posts[1].stalls.length, 10);
console.log("stall_test ok");
