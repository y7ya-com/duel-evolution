// --pre-js (after lazyfs.js): field telemetry for "the game freezes sometimes". A frame (Present to Present, rt/web.c
// calls Module.yo2Frame) longer than 250 ms on a visible page is a stall. Each one records what the page saw in that
// window, so the field data says which cause it was:
//   t, ms     when (ms since load) and how long; f the frame number
//   scene     ovr/scene.c's SceneId the game is in (0x1c duel, 0x1e janken, 12 lobby, 10 My Room)
//   duel      "npc" | "pvp" once a duel was set up (the NPC prefetch answered 200 / 204), "" before
//   miss      lazyfs's synchronous chunk misses inside it: [ms, file, chunk] (web/lazyfs.js missLog), missMs their sum
//   xhr       the game's synchronous HTTP (WININET, rt/web.c): [ms, path], xhrMs their sum
//   net       WebSocket: bytes that arrived during it (they wait for the main thread), backlog still unread after it
//   under     audio worklet underruns during it (web/sfx.js)
//   js        JS heap growth (Chrome only), bytes
//   decode    image decoding on the main thread (ovr/decode.c), ms; upload: texture uploads (rt d3d8), ms
//   sw        a scene event (ovr/scene.c begin/end) fell inside it
// A wait (kind "wait") is the server's side in a duel (janken 0x1e, duel 0x1c): the game sent and nothing came back
// for over 2 s, frames still drawn (the NPC thinking, the opponent, the server). ponytail: any reply ends it, and a
// send that expects none followed by a quiet spell counts too; read waits per scene and duel kind.
// Batches go to POST /__stall (private R2, admin-readable): 10 stalls, 60 s after the first unsent one, or the page
// hiding. Anonymous (a random id per page load, the build, the browser), at most 60 stalls per page load.
//   ?nostall  off; Module.yo2Stalls has every stall recorded (measurements read it)
if (typeof document !== "undefined" && !new URLSearchParams(location.search).has("nostall")) (() => {
    const LIMIT = 250, SLOW = 2000, BATCH = 10, WAIT = 60000, CAP = 60;
    const all = (Module.yo2Stalls = []), queue = [];
    const sid = Math.random().toString(36).slice(2, 10);
    let sent = 0, waits = 0, last = 0, frame = 0, hiddenAt = 0, scene = 0x2c, swAt = 0, under = 0, rx = 0, timer = 0;
    addEventListener("visibilitychange", () => { if (document.hidden) hiddenAt = performance.now(), flush(true); });
    addEventListener("pagehide", () => flush(true));
    Module.onYo2Scene = (kind, from, to) => { scene = to; swAt = performance.now(); };   // adds a listener (lazyfs.js)
    const since = (log, t0) => (log || []).filter((e) => e[0] + e[1] >= t0).map((e) => e.slice(1));
    const sum = (l) => l.reduce((a, e) => a + e[0], 0);
    Module.yo2Frame = (decode, upload) => {
        const now = performance.now(), u = Module.yo2Sfx?.underruns?.() | 0, r = Module.yo2NetRx | 0;
        const js = performance.memory?.usedJSHeapSize | 0;
        frame++;
        if (last && now - last > LIMIT && hiddenAt < last && all.length - waits < CAP) {
            const miss = since(Module.yo2Lazy?.missLog, last), xhr = since(Module.yo2Xhr, last);
            const s = { t: Math.round(last), ms: Math.round(now - last), f: frame, scene, sw: swAt >= last, duel: Module.yo2Lazy?.duel || "",
                decode: Math.round(decode || 0), upload: Math.round(upload || 0), miss: miss.slice(-20), missMs: sum(miss), xhr: xhr.slice(-10), xhrMs: sum(xhr),
                net: { rx: r - rx, backlog: (Module.yo2NetRx | 0) - (Module.yo2NetRead | 0) }, under: u - under,
                js: js - (Module.yo2Js | 0) };
            push(s);
        }
        last = now, under = u, rx = r, Module.yo2Js = js;
    };
    Module.yo2NetIO = (out) => {
        const now = performance.now();
        if (out) { if (!sent) sent = now; return; }
        if (sent && now - sent > SLOW && hiddenAt < sent && (scene === 0x1c || scene === 0x1e) && waits < CAP / 2)
            waits++, push({ kind: "wait", t: Math.round(sent), ms: Math.round(now - sent), f: frame, scene, duel: Module.yo2Lazy?.duel || "" });
        sent = 0;
    };
    function push(s) {
        all.push(s), queue.push(s);
        if (queue.length >= BATCH) flush(); else if (!timer) timer = setTimeout(flush, WAIT);
    }
    function flush(leaving) {
        clearTimeout(timer), timer = 0;
        if (!queue.length) return;
        const body = JSON.stringify({ sid, build: document.querySelector('meta[name="yo2-build"]')?.content || "",
            ua: navigator.userAgent, async: !!Module.rcAsyncOnly,
            mem: navigator.deviceMemory || 0, cores: navigator.hardwareConcurrency || 0, stalls: queue.splice(0) });
        if (leaving && navigator.sendBeacon) navigator.sendBeacon("/__stall", new Blob([body], { type: "application/json" }));
        else fetch("/__stall", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
})();
