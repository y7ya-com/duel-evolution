// node web/lazyfs_test.mjs: web/lazyfs.js against a synthetic merge.dat (KCEJYUGI) and fake XHR / fetch / Cache API /
// localStorage / MEMFS (no browser needed). Checks the bytes, the hot-set and map prefetches, persistence across a
// reload, the trickle staying out of memory, and prefetch=0.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const MB = 1 << 20;
// ---- a small archive: folders with known spans (in MB), every byte a function of its offset
const layout = [["data/bin#/a.bin", 1], ["data/mini/0001.png", 3], ["data/deck/bg.png", 1], ["data/common/c.png", 1],
    ["data/menu/m.png", 1], ["data/map/map_r01/r.png", 2], ["data/map/map_a02/a.png", 3], ["data/map/map_a01/b.png", 4],
    ["data/map/map_a03/c.png", 2], ["data/avatar/x.png", 2], ["data/card/0001.png", 6], ["data/y/duel/effect/a.png", 2], ["data/card/0002.png", 2],
    ["data/y2/duel/field/duelbg_a_02.png", 1], ["data/y2/duel/field/duel_filed_01.png", 1]];
const listCard = "0000.png\r\n0001.png\r\n0002.png\r\n4336.png\r\n";   // id 3: a Field Spell (card number 4336 -> 01)   // list_card.txt: line N = YO2 card id N's art
const toc = 12 + (layout.length + 1) * 268;
let off = 8 * MB;   // past the directory, so entries start on later chunks
const entries = layout.map(([name, mb]) => { const e = { name, off, len: mb * MB - 100 }; off += mb * MB; return e; });
entries.push({ name: "data/card/list_card.txt", off, len: listCard.length }), off += MB;
const size = off;
const file = Buffer.alloc(size);
for (let i = toc; i < size; i += 4) file.writeUInt32LE((i * 2654435761) >>> 0, i);
file.write("KCEJYUGI", 0, "latin1");
file.writeUInt32LE(entries.length, 8);
file.write(listCard, entries.at(-1).off, "latin1");
entries.forEach((e, k) => {
    const at = 12 + k * 268;
    file.fill(0, at, at + 268);
    for (let c = 0; c < e.name.length; c++) {
        const b = e.name.replace(/\//g, "\\").charCodeAt(c);
        file[at + c] = ((b & 15) << 4) | (b >> 4);
    }
    file.writeUInt32LE(e.off, at + 256), file.writeUInt32LE(e.len, at + 260), file.writeUInt32LE(e.len, at + 264);
});
const files = { "game/merge.dat": file, "game/yo2.exe": Buffer.from("MZ tiny") };

// ---- fakes
let syncXhr = 0, netFetch = 0;
let aborted = 0, flying = 0, maxFlying = 0;   // fetches in flight now, and the most at once
const syncSizes = [];   // bytes of every synchronous request   // background fetches a synchronous read aborted
const syncFaults = [], fetchFaults = [];   // fetchFaults: (range) => true drops that background fetch, once   // what the next synchronous Range reads do instead of answering
const fetched = [];   // offsets of every background fetch
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rangeOf(h) { const m = /bytes=(\d+)-(\d+)/.exec(h); return [+m[1], +m[2]]; }
const pathOf = (url) => decodeURIComponent(new URL(url, "http://t/").pathname.slice(1));
function makeEnv(store, ls, opts = {}) {
    class XMLHttpRequest {
        open(m, url) { this.url = url; this.h = {}; }
        setRequestHeader(k, v) { this.h[k] = v; }
        overrideMimeType() {}
        send() {
            const p = pathOf(this.url);
            if (p.startsWith("api/")) { this.status = 404; this.responseText = ""; return; }   // the legacy site: no session service
            if (p.endsWith("files.txt")) {   // game/ and cards/ (the 2x card art, when a test adds it)
                const dir = p.slice(0, -"files.txt".length), list = Object.entries(files).filter(([k]) => k.startsWith(dir));
                this.status = list.length ? 200 : 404;
                this.responseText = list.map(([k, b]) => `${b.length}\t${k.slice(dir.length)}`).join("\n");
                return;
            }
            syncXhr++;
            const fail = syncFaults.shift();   // a stalled or broken mobile read: "throw" | a status | "short"
            if (fail === "throw") throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
            const [a, b] = rangeOf(this.h.Range);
            syncSizes.push(b - a + 1);
            this.status = typeof fail === "number" ? fail : 206;
            this.responseText = typeof fail === "number" ? "" : files[p].subarray(a, fail === "short" ? b : b + 1).toString("latin1");
        }
    }
    async function fetch(url, o = {}) {
        if (pathOf(url) === "api/de/prefetch/duel")   // the server's NPC deck for the duel being set up
            return { status: 200, headers: { get: () => null }, json: async () => ({ npc: 35, cards: [2, 3], fields: [3] }) };
        const p = pathOf(url), headers = new Map(Object.entries({ etag: '"e1"', "cache-control": opts.cc || "no-cache" }));
        const h = { get: (k) => headers.get(k.toLowerCase()) || null };
        if (o.method === "HEAD") return { status: 200, headers: h };
        netFetch++, (flying++, (maxFlying = Math.max(maxFlying, flying)));
        await sleep(1).finally(() => flying--);
        if (o.signal && o.signal.aborted) { aborted++; throw Object.assign(new Error("aborted"), { name: "AbortError" }); }
        if (fetchFaults.length && fetchFaults[0](o.headers.Range)) { fetchFaults.shift(); throw new TypeError("Load failed"); }   // a dropped connection
        const [a, b] = rangeOf(o.headers.Range);
        fetched.push(a);
        const body = files[p].subarray(a, b + 1);
        return { status: 206, headers: h, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
    }
    class Response { constructor(d) { this.d = d; } async arrayBuffer() { return this.d.buffer.slice(this.d.byteOffset, this.d.byteOffset + this.d.length); } }
    const caches = { open: async () => ({ put: async (k, r) => store.set(k, r), match: async (k) => store.get(k) }) };
    const nodes = {};
    const FS = {
        mkdirTree() {}, mkdir() {}, mount() {}, syncfs: (a, cb) => cb(),
        createFile(parent, name) { const n = { stream_ops: {} }; nodes[parent + "/" + name] = n; return n; },
        ErrnoError: class extends Error { constructor(e) { super("errno " + e); } },
    };
    const PATH = { dirname: (p) => p.slice(0, p.lastIndexOf("/")), basename: (p) => p.slice(p.lastIndexOf("/") + 1) };
    let deps = 0;
    const Module = {}, ENV = {};
    const ctx = { Module, ENV, FS, PATH, XMLHttpRequest, fetch, caches, Response, console: { log() {} },
        location: { search: opts.search || "", href: "http://t/" }, localStorage: { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) },
        performance: { now: () => Date.now() }, setTimeout: (f, ms) => { const t = setTimeout(f, ms); t.unref(); return t; }, clearTimeout, setInterval: () => 0, addEventListener() {}, URL, URLSearchParams,
        IDBFS: {}, addRunDependency: () => deps++, removeRunDependency: () => deps--, requestIdleCallback: (f) => setTimeout(f, 1), matchMedia: () => ({ matches: false }), AbortController, atob };
    ctx.location.pathname = "/"; ctx.location.origin = "http://t";
    ctx.history = { replaceState() {} };
    ctx.window = ctx; ctx.window.top = ctx;   // the session check (rt/session.cpp's page side) looks at the top window
    vm.runInNewContext(readFileSync(new URL("lazyfs.js", import.meta.url), "utf8"), ctx);
    Module.preRun.forEach((f) => f());
    const read = (path, pos, len) => {
        const out = new Uint8Array(len);
        nodes[path].stream_ops.read(null, out, 0, len, pos);
        return out;
    };
    return { Module, read, ready: async () => { while (deps) await sleep(1); } };
}
const settle = async (L) => { for (let i = 0; i < 2000 && (L.queueLen ? L.queueLen() : 1); i++) await sleep(2); await sleep(50); };
const ent = (prefix) => entries.find((e) => e.name.startsWith(prefix));
function readEntry(g, prefix) {
    const e = ent(prefix), got = g.read("/game/merge.dat", e.off, 4096);
    assert.deepEqual(Buffer.from(got), file.subarray(e.off, e.off + 4096), prefix + " bytes");
}

// ---- session 1: cold
const store = new Map(), ls = new Map();
ls.set("yo2-lazy-scenes", JSON.stringify({ etag: '"e1"', sets: { 44: [5, 6, 7, 8, 9, 10, 11, 12] }, next: {} }));   // a learned boot
let g = makeEnv(store, ls);
await g.ready();
const L = g.Module.yo2Lazy;
// the boot's hold: merge.dat's directory is in before the game starts, never more than 4 fetches at once
assert.ok(Array.from({ length: Math.ceil(toc / MB) }, (_, i) => i).every((i) => L.pinned.has([...L.files.keys()].find((u) => /merge\.dat$/.test(u)) + "#" + i)), "the directory, held");
assert.ok([5, 6, 7, 8, 9, 10, 11, 12].every((i) => L.pinned.has([...L.files.keys()].find((u) => /merge\.dat$/.test(u)) + "#" + i)), "the learned boot set, held");
assert.ok(maxFlying <= 4, "at most 4 at once: " + maxFlying);
g.read("/game/merge.dat", 0, toc);   // the game reads the directory first
await settle(L);
assert.ok(L.spans && L.spans.get("data/mini"), "directory parsed");
const hotChunks = [...L.pinned.values()].filter((p) => p.tag === "hot").length;
assert.ok(hotChunks >= 7, "hot set pinned: " + hotChunks);
let before = syncXhr;
readEntry(g, "data/mini"), readEntry(g, "data/deck"), readEntry(g, "data/bin#");
assert.equal(syncXhr, before, "the hot set reads without a synchronous request");
before = syncXhr;
readEntry(g, "data/map/map_r01");   // My Room: a miss (not prefetched yet), then its lobby comes
await settle(L);
assert.ok([...L.pinned.values()].some((p) => p.tag === "map:a02"), "the lobby next to My Room is pinned");
const r01miss = syncXhr - before;
before = syncXhr;
readEntry(g, "data/map/map_a02");   // through the door
assert.equal(syncXhr, before, "the door's map reads without a synchronous request");
await settle(L);
assert.ok([...L.pinned.values()].some((p) => p.tag === "map:a01"), "a02's neighbours are pinned");
assert.ok(![...L.pinned.values()].some((p) => p.tag === "map:x"), "nothing stale");
assert.equal(ls.get("yo2-lazy-lobby"), "a02");
readEntry(g, "data/avatar");   // a miss: read-ahead follows
await settle(L);
assert.ok(L.stats.syncMiss >= 1 && L.stats.prefetched > 0, "counters");
assert.ok([...L.lru.keys()].length + L.pinned.size <= 64 + 128, "memory capped");
assert.ok(store.size > 0, "chunks persisted");
// what session 1 pins, session 2 loads before the game starts
L.savePins();   // what the page does at pagehide
console.log(`session 1: ${L.stats.syncMiss} sync misses (My Room ${r01miss}), ${L.stats.prefetched} prefetched, ${store.size} persisted, ${L.pinned.size} pinned`);

// ---- session 2: a reload with the store and localStorage of session 1
netFetch = 0, syncXhr = 0;
g = makeEnv(store, ls);
await g.ready();
const L2 = g.Module.yo2Lazy;
assert.ok(L2.pinned.size > 0 && L2.stats.fromStore > 0, "pins loaded from the store at boot");
g.read("/game/merge.dat", 0, toc);
readEntry(g, "data/mini"), readEntry(g, "data/map/map_a02");
await settle(L2);
assert.equal(syncXhr, 0, "a returning player's directory, hot set and lobby: no synchronous request");
console.log(`session 2: ${syncXhr} sync, ${netFetch} network fetches, ${L2.stats.fromStore} from the store`);

fetched.length = 0;
// ---- scenes: session 3 learns what switching into the title and the login reads; session 4 (a reload) has it in
// memory before the game asks
const card = ent("data/card"), av = ent("data/avatar");
const titleReads = [card.off, card.off + 2 * MB], loginReads = [av.off, card.off + 4 * MB];
const scenes = (g, from, to, offs) => {
    g.Module.onYo2Scene("begin", from, to);
    for (const o of offs) g.read("/game/merge.dat", o, 64);
    g.Module.onYo2Scene("end", from, to);
    g.Module.onYo2Scene("begin", to, 0x63), g.Module.onYo2Scene("end", to, 0x63);   // (closes the recording window now)
};
let seen = [];
const s3 = new Map(), l3 = new Map();
g = makeEnv(s3, l3);
await g.ready();
g.Module.onYo2Scene = (k, f, t) => seen.push(k + f + ">" + t);   // the page's own handler still hears every event
g.read("/game/merge.dat", 0, toc);
scenes(g, 0x2c, 4, titleReads), scenes(g, 4, 6, loginReads);
await settle(g.Module.yo2Lazy);
assert.deepEqual(seen.slice(0, 2), ["begin44>4", "end44>4"], "the page handler is chained");
assert.ok(["4", "6"].every((k) => g.Module.yo2Lazy.learned().sets[k]), "sets learned for the title and the login");
l3.delete("yo2-lazy-pins");   // no saved working set: only what the scenes taught can be in memory
syncXhr = 0;
g = makeEnv(s3, l3);
await g.ready();
await settle(g.Module.yo2Lazy);
g.read("/game/merge.dat", 0, toc);
scenes(g, 0x2c, 4, titleReads), scenes(g, 4, 6, loginReads);
assert.equal(syncXhr, 0, "a returning player's title and login reads are in memory before the game asks");
console.log("scenes: ok");

// ---- the duel deck (rt/decktap.c): its cards' big art is pinned before the duel shows them
syncXhr = 0;
g = makeEnv(new Map(), new Map());
await g.ready();
g.read("/game/merge.dat", 0, toc);
await settle(g.Module.yo2Lazy);
g.Module.yo2Lazy.prefetchCards([1, 9999]);   // card 0001 is in the archive, 9999 is not
await settle(g.Module.yo2Lazy);
assert.ok([...g.Module.yo2Lazy.pinned.values()].some((p) => p.tag === "deck"), "the deck's art is pinned");
readEntry(g, "data/card/0001.png");
assert.equal(syncXhr, 0, "a deck card's art reads without a synchronous request");
console.log("deck: ok");
{   // list_card.txt's read drops: the deck prefetch resolves (nothing pinned), and the next one reads the names
    const r = makeEnv(new Map(), new Map());
    await r.ready();
    const L = r.Module.yo2Lazy, list = entries.find((e) => e.name.endsWith("list_card.txt"));
    r.read("/game/merge.dat", 0, toc);
    await settle(L);
    fetchFaults.push((range) => rangeOf(range)[0] === list.off);
    await L.prefetchCards([1]);   // rejected before: an unhandled rejection, and the names never loaded again
    assert.equal(fetchFaults.length, 0, "the list's fetch was dropped");
    assert.ok(![...L.pinned.values()].some((p) => p.tag === "deck"), "no names, nothing pinned");
    await L.prefetchCards([1]);
    await settle(L);
    assert.ok([...L.pinned.values()].some((p) => p.tag === "deck"), "the next prefetch reads the names");
    console.log("card names retry: ok");
}

// ---- a duel from the lobby: the generic duel effects pinned there, the NPC's deck (server) at janken, all released in
// My Room
readEntry(g, "data/map/map_a02");   // the lobby's map: its area picks the duel's base background
// an effects chunk a learned scene set wants too (janken's): the scene pins it first
const Lfx = g.Module.yo2Lazy, fx = Math.floor(Lfx.spans.get("data/y/duel/effect")[0] / (1 << 20));
const fxKey = [...Lfx.files.keys()].find((u) => /merge\.dat$/.test(u)) + "#" + fx;
Lfx.learned().sets[0x1e] = [fx], (Lfx.learned().next[12] = [0x1e]);
g.Module.onYo2Scene("begin", 10, 12), g.Module.onYo2Scene("end", 10, 12);
g.Module.onYo2Scene("begin", 12, 0x1e);
await settle(g.Module.yo2Lazy);
const tags = () => [...g.Module.yo2Lazy.pinned.values()].map((p) => p.tag);
assert.ok(tags().includes("duelfx"), "duel effects pinned from the lobby on");
assert.ok(tags().includes("npc"), "the NPC's cards pinned at janken");
assert.ok(tags().includes("field"), "the duel's backgrounds pinned at janken");
syncXhr = 0;
readEntry(g, "data/y/duel/effect"), readEntry(g, "data/card/0002"), readEntry(g, "data/y2/duel/field/duelbg_a_02");
readEntry(g, "data/y2/duel/field/duel_filed_01");   // the NPC's Field Spell background
assert.equal(syncXhr, 0, "effects and the NPC's art read without a synchronous request");
g.Module.onYo2Scene("end", 12, 0x1e);
assert.equal(Lfx.pinned.get(fxKey)?.tag, "duelfx", "the scene lets it go, the duel effects keep it pinned");
g.Module.onYo2Scene("begin", 0x20, 10), g.Module.onYo2Scene("end", 0x20, 10);
assert.ok(!tags().some((t) => ["duelfx", "duelui", "npc", "deck", "field"].includes(t)), "released back in My Room");
console.log("duel: ok");

fetched.length = 0;
// ---- trickle: only when the server lets the HTTP cache keep game files; never kept in memory
g = makeEnv(new Map(), new Map(), { cc: "public, max-age=31536000, immutable", search: "?trickle=1" });
await g.ready();
g.read("/game/merge.dat", 0, toc);
await settle(g.Module.yo2Lazy);
await sleep(300);
const cardKeys = [...g.Module.yo2Lazy.lru.keys(), ...g.Module.yo2Lazy.pinned.keys()].filter((k) => +k.split("#")[1] >= Math.floor(card.off / MB));
assert.equal(cardKeys.length, 0, "the trickle keeps nothing in memory");
assert.ok(fetched.some((a) => a >= card.off), "the trickle fetched data/card");
fetched.length = 0;
g = makeEnv(new Map(), new Map(), { cc: "public, max-age=31536000, immutable" });
await g.ready();
g.read("/game/merge.dat", 0, toc);
await settle(g.Module.yo2Lazy);
await sleep(300);
assert.ok(!fetched.some((a) => a >= card.off), "no trickle without ?trickle=1");
console.log("trickle: ok");

// ---- a synchronous read takes the link: the background fetch in flight is aborted, and fetched again after it
g = makeEnv(new Map(), new Map());
await g.ready();
g.read("/game/merge.dat", 0, toc);   // the directory: the hot set queued, one fetch in flight
aborted = 0;
readEntry(g, "data/card/0001");   // a synchronous miss meanwhile
await settle(g.Module.yo2Lazy);
assert.ok(aborted >= 1, "the background fetch in flight was aborted");
assert.ok([...g.Module.yo2Lazy.pinned.values()].filter((p) => p.tag === "hot").length >= 7, "and fetched again");
console.log("sync read yields: ok");

// ---- big card art (data/card) not in memory: one request of the pages from the read on (256 KB: the card and the CRT's
// buffered read after it), nothing more; elsewhere whole chunks
g = makeEnv(new Map(), new Map());
await g.ready();
g.read("/game/merge.dat", 0, toc);
await settle(g.Module.yo2Lazy);
syncXhr = 0, syncSizes.length = 0, fetched.length = 0;
const off1 = ent("data/card/0001").off;
let got = g.read("/game/merge.dat", off1 + 38556, 512);   // the CRT's small read, then ~150 KB past it (mvp-iotrace-deck)
assert.deepEqual(Buffer.from(got), file.subarray(off1 + 38556, off1 + 38556 + 512));
assert.equal(syncXhr, 1), assert.ok(syncSizes[0] >= 256 << 10 && syncSizes[0] < MB, "the look-ahead, not the chunk: " + syncSizes[0]);
got = g.read("/game/merge.dat", off1 + 39068, 159744);
assert.deepEqual(Buffer.from(got), file.subarray(off1 + 39068, off1 + 39068 + 159744));
assert.equal(syncXhr, 1, "the buffered read after it: already there");
await settle(g.Module.yo2Lazy);
assert.ok(!fetched.some((a) => a >= off1 && a < off1 + MB), "no whole chunk follows (the next card is anywhere)");
syncSizes.length = 0;
readEntry(g, "data/avatar/x.png");   // not card art: the whole chunk
assert.equal(syncSizes[0], MB, "elsewhere a miss reads the whole chunk");
await settle(g.Module.yo2Lazy);   // its read-ahead, before the next test counts fetches
console.log("card pages: ok");

// ---- prefetch=0: the plain lazy reads
syncXhr = 0, netFetch = 0;
g = makeEnv(new Map(), new Map(), { search: "?prefetch=0" });
await g.ready();
g.read("/game/merge.dat", 0, toc);
readEntry(g, "data/mini");
await sleep(50);
assert.equal(netFetch, 0, "prefetch=0: no background fetch");
console.log("prefetch=0: ok");
{   // a script that wraps "the old" onYo2Scene (the live crash report): runs once per event, no recursion
    const M = makeEnv(new Map(), new Map()).Module;
    let n = 0;
    const old = M.onYo2Scene;
    M.onYo2Scene = (...a) => { n++; old(...a); };
    M.onYo2Scene("begin", 4, 6);
    M.onYo2Scene = M.onYo2Scene;   // self-assignment: ignored
    M.onYo2Scene("end", 4, 6);
    assert.equal(n, 2, "a wrapping listener runs once per event");
    console.log("scene listeners: ok");
}
{   // a sync read that times out, drops (status 0), 503s or comes back short is asked again; EIO only after 3 tries
    const r = makeEnv(new Map(), new Map(), { search: "?prefetch=0" });
    await r.ready();
    const L = r.Module.yo2Lazy;
    syncFaults.push("throw", 0);
    r.read("/game/merge.dat", 0, toc);   // rc_init's first read (the iPhone boot failure)
    readEntry(r, "data/mini");
    syncFaults.push(503, "short");
    readEntry(r, "data/deck");
    assert.equal(L.stats.syncRetry, 4, "four failed tries, each asked again");
    assert.deepEqual([...L.missLog[0].slice(2)], ["merge.dat", 0, 2, "0"], "telemetry: the failed tries and the last error");
    syncFaults.push("throw", "throw", "throw");
    assert.throws(() => readEntry(r, "data/common"), /errno 29/, "EIO after 3 failed tries");
    assert.equal(L.stats.syncFail, 1);
    assert.deepEqual([...L.missLog.at(-1).slice(2)], ["merge.dat", Math.floor(ent("data/common").off / MB), 3, "TimeoutError"]);
    syncFaults.push(404);
    assert.throws(() => readEntry(r, "data/menu"), /errno 29/, "a 404 is not asked again");
    assert.equal(syncFaults.length, 0);
    readEntry(r, "data/menu");   // and the next read works
    console.log("sync retry: ok");
}
{   // 2x card art (tools/cardart.py): cards/ = merge/data/card.dat + mini.dat, mounted into /game. The thumbnails are pinned from mini.dat (not
    // merge.dat's data/mini), a deck's art from card.dat by its list_card.txt, a Field Spell's background still by
    // merge.dat's card numbers
    const arc = (list) => {   // a KCEJYUGI archive of [name, bytes]
        const head = 12 + list.length * 268, out = Buffer.alloc(head + list.reduce((n, [, b]) => n + b.length, 0));
        out.write("KCEJYUGI", 0, "latin1"), out.writeUInt32LE(list.length, 8);
        let at = head;
        list.forEach(([name, b], k) => {
            const e = 12 + k * 268;
            for (let c = 0; c < name.length; c++) { const x = name.charCodeAt(c); out[e + c] = ((x & 15) << 4) | (x >> 4); }
            out.writeUInt32LE(at, e + 256), out.writeUInt32LE(b.length, e + 260), out.writeUInt32LE(b.length, e + 264);
            b.copy(out, at), at += b.length;
        });
        return out;
    };
    const fill = (n, seed) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i += 4) b.writeUInt32LE((i * 2654435761 + seed) >>> 0, i); return b; };
    const list = Buffer.from("0000.png\r\n89631139.jpg\r\n67105242.jpg\r\n24094653.jpg\r\n", "latin1");
    const cardDat = arc([["list_card.txt", list], ["24094653.jpg", fill(MB, 1)], ["67105242.jpg", fill(2 * MB, 2)], ["89631139.jpg", fill(2 * MB, 3)]]);
    files["cards/merge/data/card.dat"] = cardDat;
    files["cards/merge/data/mini.dat"] = arc([["list_card.txt", list], ["89631139.jpg", fill(5 * MB, 4)]]);
    try {
        const r = makeEnv(new Map(), new Map());
        await r.ready();
        const L = r.Module.yo2Lazy;
        r.read("/game/merge.dat", 0, toc);
        await settle(L);
        const hot = [...L.pinned.entries()].filter(([, p]) => p.tag === "hot").map(([k]) => k);
        const miniChunks = Math.ceil(files["cards/merge/data/mini.dat"].length / MB);
        assert.equal(hot.filter((k) => k.includes("mini.dat")).length, miniChunks, "mini.dat pinned whole");
        const mini = ent("data/mini");
        assert.ok(!hot.some((k) => k.endsWith("merge.dat#" + Math.floor((mini.off + MB) / MB))), "merge.dat's data/mini is not");
        // card art not in memory: a placeholder at once (its entry's offset in the comment), the entry fetched behind it
        syncXhr = 0;
        const off = cardDat.length - 2 * MB, ph = Buffer.from(r.read("/game/merge/data/card.dat", off, 8192));
        assert.equal(syncXhr, 0, "no synchronous read for card art");
        assert.equal(ph[0], 0xff), assert.equal(ph[1], 0xd8);
        assert.ok(ph.includes("yo2-placeholder:" + String(off).padStart(10, "0")), "the entry's offset in the comment");
        assert.equal(ph[ph.length - 1], 0, "zeros past the placeholder");
        assert.equal(L.artBytes(off), null, "not here yet");
        await settle(L);
        assert.deepEqual(Buffer.from(L.artBytes(off)), cardDat.subarray(off, off + 2 * MB), "then the entry's real bytes");
        assert.equal(L.artBytes(off + 1).length, 0, "an offset that is no entry: nothing to wait for");
        syncXhr = 0;
        await L.prefetchCards([1]);   // card 1: 89631139.jpg, the last 2 MB of card.dat
        await settle(L);
        const deck = [...L.pinned.entries()].filter(([, p]) => p.tag === "deck").map(([k]) => k);
        assert.ok(deck.length >= 2 && deck.every((k) => k.includes("card.dat")), "the deck's art pinned from card.dat: " + deck);
        const at = cardDat.length - 2 * MB, got = r.read("/game/merge/data/card.dat", at, 4096);
        assert.deepEqual(Buffer.from(got), cardDat.subarray(at, at + 4096), "card.dat bytes");
        r.Module.onYo2Scene("begin", 12, 0x1e);   // rock-paper-scissors: the NPC's deck (cards 2, 3) and its Field Spell (3)
        await settle(L);
        assert.equal(L.stats.fieldFiles, 1, "card 3's Field Spell, by merge.dat's card number 4336 (no map yet: no area)");
        assert.ok([...L.pinned.entries()].some(([k, p]) => p.tag === "npc" && k.includes("card.dat")), "the NPC's art from card.dat");
        console.log("2x card art: ok");
    } finally {
        delete files["cards/merge/data/card.dat"], delete files["cards/merge/data/mini.dat"];
    }
}
console.log("lazyfs_test ok");
