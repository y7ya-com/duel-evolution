// node replay.mjs <trace log> <merge.dat> <mode> [state.json]: replays a native RC_IOTRACE run through web/lazyfs.js in
// real time (frame n at n/30 s) with a modelled network, and prints the synchronous stalls per phase.
//   mode: off (prefetch=0, today's live build) | on | on-http (the server lets the HTTP cache keep game files)
//   state.json: the Cache API + localStorage + HTTP cache of an earlier session (read, then written back): warm runs
// Network model: a chunk not cached costs LAT ms (RTT + 1 MB), sync or async; an HTTP-cache hit costs 5 ms.
import { readFileSync, openSync, readSync, writeFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const [traceFile, mergePath, mode, stateFile] = process.argv.slice(2);
const LAT = 180, MB = 1 << 20;
const fd = openSync(mergePath, "r"), size = Number(readFileSync(traceFile, "utf8").match(/iotrace \d+ (\d+)/)[1]);
const trace = [];
for (const l of readFileSync(traceFile, "utf8").split("\n")) {
    const m = /^iotrace (\d+) \d+ ([0-9a-f]+) ([0-9a-f]+)/.exec(l);
    if (m) trace.push([+m[1], parseInt(m[2], 16), parseInt(m[3], 16)]);
    const e = /^scene (begin|end) (\d+) -> (\d+)/.exec(l);   // RC_SCENE_LOG=1: Module.onYo2Scene at the same point
    if (e) trace.push([null, e[1], +e[2], +e[3]]);
    const d = /^deck (main|extra): \d+ cards:((?: \d+)*)/.exec(l);   // RC_DECK_LOG=1 (rt/decktap.c)
    if (d && process.env.DECK !== "0") trace.push([null, "deck", d[2].trim().split(" ").filter(Boolean).map(Number)]);
}
const state = stateFile && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { store: [], ls: {}, http: [] };
const store = new Map(state.store.map((k) => [k, true])), ls = new Map(Object.entries(state.ls)), http = new Set(state.http);
// NODEFAULTS=1: a first visit without lazyfs's built-in scene sets (a learned placeholder blocks them)
if (process.env.NODEFAULTS && !ls.has("yo2-lazy-scenes")) ls.set("yo2-lazy-scenes", JSON.stringify({ etag: '"m1"', sets: { 999: [] }, next: {} }));
const cacheable = mode === "on-http";
const bytes = (a, b) => { const buf = Buffer.alloc(b - a + 1); readSync(fd, buf, 0, buf.length, a); return buf; };
function cost(a) { const k = Math.floor(a / MB); if (cacheable && http.has(k)) return 5; http.add(k); return LAT; }
const busy = (ms) => { const end = Date.now() + ms; while (Date.now() < end); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rangeOf = (h) => /bytes=(\d+)-(\d+)/.exec(h).slice(1).map(Number);

let stallNow = 0;   // stall of the read in progress
class XMLHttpRequest {
    open(m, url) { this.url = url; this.h = {}; }
    setRequestHeader(k, v) { this.h[k] = v; }
    overrideMimeType() {}
    send() {
        if (this.url.includes("/api/")) { this.status = 404; this.responseText = ""; return; }   // the legacy site
        if (this.url.includes("files.txt")) { this.status = 200; this.responseText = `${size}\tmerge.dat`; return; }
        const [a, b] = rangeOf(this.h.Range), c = cost(a);
        busy(c), stallNow += c;
        this.status = 206;
        this.responseText = bytes(a, b).toString("latin1");
    }
}
async function fetch(url, o = {}) {
    const h = { get: (k) => ({ etag: '"m1"', "cache-control": cacheable ? "public, max-age=31536000, immutable" : "no-cache" })[k.toLowerCase()] ?? null };
    if (o.method === "HEAD") return { status: 200, headers: h };
    const [a, b] = rangeOf(o.headers.Range);
    await sleep(cost(a));
    const body = bytes(a, b);
    return { status: 206, headers: h, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
}
class Response { constructor(d) { this.d = d; } async arrayBuffer() { return this.d.buffer.slice(this.d.byteOffset, this.d.byteOffset + this.d.length); } }
const cacheMap = new Map();   // key -> Response (bytes re-read from the file on match)
const caches = { open: async () => ({
    put: async (k, r) => { store.set(k, true); },
    match: async (k) => {
        if (!store.has(k)) return undefined;
        const i = +/chunk=(\d+)/.exec(k)[1], a = i * MB, b = Math.min(a + MB, size) - 1;
        await sleep(3);   // a disk read
        return new Response(bytes(a, b));
    } }) };
let node;
const FS = { mkdirTree() {}, mkdir() {}, mount() {}, syncfs: (a, cb) => cb(),
    createFile() { node = { stream_ops: {} }; return node; }, ErrnoError: class extends Error {} };
const PATH = { dirname: (p) => p.slice(0, p.lastIndexOf("/")), basename: (p) => p.slice(p.lastIndexOf("/") + 1) };
let deps = 0;
const Module = {}, ENV = {};
const ctx = { Module, ENV, FS, PATH, XMLHttpRequest, fetch, caches, Response, console: { log() {} }, URL, URLSearchParams,
    location: { search: mode === "off" ? "?prefetch=0" : "", href: "http://t/" },
    localStorage: { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) },
    performance: { now: () => Date.now() }, setTimeout: (f, ms) => { const t = setTimeout(f, ms); t.unref(); return t; }, clearTimeout,
    setInterval: () => 0, addEventListener() {}, IDBFS: {}, addRunDependency: () => deps++, removeRunDependency: () => deps--,
    requestIdleCallback: (f) => setTimeout(f, 2000) };
Object.assign(ctx.location, { pathname: "/", origin: "http://t" });
ctx.history = { replaceState() {} };
ctx.window = ctx; ctx.window.top = ctx;   // the page's session check looks at the top window
vm.runInNewContext(readFileSync(new URL("lazyfs.js", import.meta.url), "utf8"), ctx);
const t0 = Date.now();
Module.preRun.forEach((f) => f());
while (deps) await sleep(1);
const bootWait = Date.now() - t0;

// CARDS=trace: at janken, the card ids whose big art the duel reads, as the server's NPC deck (the player's deck comes
// from the trace's own RC_DECK_LOG lines)
const duelCards = [];
{
    let sc = -1;
    for (const l of readFileSync(traceFile, "utf8").split("\n")) {
        const e = /^scene begin \d+ -> (\d+)/.exec(l);
        if (e) sc = +e[1];
        const m = /^iotrace \d+ \d+ ([0-9a-f]+)/.exec(l);
        if (m && sc === 0x1c) duelCards.push(parseInt(m[1], 16));
    }
}
// stalls per scene (from RC_SCENE_LOG lines: the switch into it and the time spent in it), or per frame range without
const NAMES = { 1: "patcher", 4: "title", 6: "login", 7: "player select", 10: "My Room", 12: "lobby",
    0x1c: "duel", 0x1e: "janken", 0x20: "result" };
const per = new Map();
const start = Date.now();
let lastFrame = -1, frameStall = 0, phase = "boot", lastF = 0;
const flush = () => { if (frameStall) { const p = per.get(phase) || { ms: 0, worst: 0, n: 0 }; p.ms += frameStall, p.worst = Math.max(p.worst, frameStall), p.n++; per.set(phase, p); } frameStall = 0; };
let lag = 0;   // stalls push the game's clock back, as they would on the page
for (const [frame, pos, len, to] of trace) {
    if (frame === null && pos === "deck") { if (Module.yo2Lazy && Module.yo2Lazy.prefetchCards) Module.yo2Lazy.prefetchCards(len); continue; }
    if (frame === null && process.env.CARDS === "trace" && pos === "begin" && to === 0x1e)   // both decks known at janken
        Module.yo2Lazy.cardIds([...Module.yo2Lazy.files2].filter(([n, [a, b]]) => n.startsWith("data/card/") && /\.png$/.test(n) &&
            duelCards.some((o) => o >= a && o < b)).map(([n]) => n.slice(10))).then((ids) => Module.yo2Lazy.prefetchCards(ids, "npc"));
    if (frame === null) {   // a scene event
        flush();
        if (pos === "begin") phase = `-> ${NAMES[to] ?? to}`;
        Module.onYo2Scene(pos, len, to);
        continue;
    }
    if (frame !== lastFrame) { flush(); lastFrame = frame; }
    const due = start + lag + (frame * 1000) / 30;
    if (Date.now() < due) await sleep(due - Date.now());
    stallNow = 0;
    const out = new Uint8Array(len);
    node.stream_ops.read(null, out, 0, len, pos);
    frameStall += stallNow, lag += stallNow;
    if (stallNow && process.env.MISSES) console.log(`  miss frame ${frame} chunk ${Math.floor(pos / MB)}`);
}
flush();
const L = Module.yo2Lazy || { stats: {} };
console.log(`${mode}${stateFile && state.store.length ? " (warm)" : ""}: boot wait ${bootWait} ms, prefetched ${L.stats.prefetched ?? 0}, from store ${L.stats.fromStore ?? 0}`);
let total = 0;
for (const [name, p] of per) total += p.ms, console.log(`  ${name.padEnd(18)} stalled ${String(p.ms).padStart(5)} ms in ${p.n} frames, worst frame ${p.worst} ms`);
console.log(`  ${"total".padEnd(18)} stalled ${String(total).padStart(5)} ms`);
if (stateFile) {
    if (Module.yo2Lazy) Module.yo2Lazy.savePins();   // what the page does at pagehide
    writeFileSync(stateFile, JSON.stringify({ store: [...store.keys()], ls: Object.fromEntries(ls), http: [...http] }));
}
process.exit(0);
