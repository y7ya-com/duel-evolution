// --pre-js (after lazyfs.js): field telemetry for "the game freezes sometimes". A frame (Present to Present, rt/web.c
// calls Module.yo2Frame) longer than 250 ms on a page visible the whole time is a stall. Each one records what the page saw in that
// window, so the field data says which cause it was:
//   t, ms     when (ms since load) and how long; f the frame number
//   scene     ovr/scene.c's SceneId the game is in (0x1c duel, 0x1e janken, 12 lobby, 10 My Room)
//   duel      "npc" | "pvp" once a duel was set up (the NPC prefetch answered 200 / 204), "" before
//   miss      lazyfs's synchronous chunk misses inside it: [ms, file, chunk] (web/lazyfs.js missLog), missMs their sum;
//             a miss that needed more than one try adds [..., failed tries, last error]
//   xhr       the game's synchronous HTTP (WININET, rt/web.c): [ms, path], xhrMs their sum
//   net       WebSocket: bytes that arrived during it (they wait for the main thread), backlog still unread after it
//   under     audio worklet underruns during it (web/sfx.js)
//   js        JS heap growth (Chrome only), bytes
//   decode    image decoding on the main thread (ovr/decode.c), ms; upload: texture uploads (rt d3d8), ms
//   slept     ms the game yielded (Sleep, idle, WaitFor* polling: it was waiting, not working); waitObj: of that,
//             in WaitFor* (a guest thread or event it waited on); yields: how many. xhr includes guest threads'
//             ("thread <path>"). focus: the page had focus at the start / the end ("10": lost it)
//   laf       Long Animation Frames overlapping it (Chrome 123+), up to 3: {d duration, b blocking, r/l render and
//             style+layout start after the frame's, s: the 2 longest scripts [ms, invoker type, invoker, file,
//             function]}: the game's wasm, another script (an extension), or layout
//   sw        a scene event (ovr/scene.c begin/end) fell inside it
// A wait (kind "wait") is the server's side in a duel (janken 0x1e, duel 0x1c): the game sent and nothing came back
// for over 2 s, frames still drawn (the NPC thinking, the opponent, the server). ponytail: any reply ends it, and a
// send that expects none followed by a quiet spell counts too; read waits per scene and duel kind.
// A duel's frame rate (kind "fps"), when the duel scene (0x1c) ends on a page visible all along: ms in it, f frames
// (game steps), fps = f per second, speed the Duel speed (web/duelspeed.js). The duel loop's step is 30 fps, times the
// speed: a device below that plays the duel's frame-counted cinematics slower than 2008 did.
// Batches go to POST /__stall (private R2, admin-readable): 10 stalls, 60 s after the first unsent one, or the page
// hiding. Anonymous (a random id per page load, the build, the browser), at most 60 stalls per page load.
//   ?nostall  off; Module.yo2Stalls has every stall recorded (measurements read it)
if (typeof document !== "undefined" && !new URLSearchParams(location.search).has("nostall")) (() => {
    const LIMIT = 250, SLOW = 2000, BATCH = 10, WAIT = 60000, CAP = 60;
    const all = (Module.yo2Stalls = []), queue = [];
    const sid = Math.random().toString(36).slice(2, 10);
    let sent = 0, waits = 0, last = 0, frame = 0, hiddenAt = 0, scene = 0x2c, swAt = 0, under = 0, rx = 0, timer = 0;
    // hiddenAt: the last visibility change either way (a stall that spans one is the browser's timers, not the game)
    addEventListener("visibilitychange", () => { hiddenAt = performance.now(); if (document.hidden) flush(true); });
    addEventListener("pagehide", () => flush(true));
    let duelAt = 0, duelF = 0;
    Module.onYo2Scene = (kind, from, to) => {   // adds a listener (lazyfs.js)
        const now = performance.now();
        if (kind === "begin" && to === 0x1c && from !== 0x1c) duelAt = now, duelF = frame;
        else if (kind === "begin" && from === 0x1c && to !== 0x1c && duelAt) {
            if (!document.hidden && hiddenAt < duelAt && now - duelAt > 10000)
                push({ kind: "fps", t: Math.round(duelAt), ms: Math.round(now - duelAt), f: frame - duelF,
                       fps: Math.round((frame - duelF) * 10000 / (now - duelAt)) / 10, speed: +Module.yo2DuelSpeed || 1,
                       duel: Module.yo2Lazy?.duel || "" });
            duelAt = 0;
        }
        scene = to; swAt = now;
    };
    const since = (log, t0) => (log || []).filter((e) => e[0] + e[1] >= t0).map((e) => e.slice(1));
    const sum = (l) => l.reduce((a, e) => a + e[0], 0);
    let focusAt = document.hasFocus ? +document.hasFocus() : 1;
    const loaf = [];   // the last 50 long-animation-frame entries
    try {
        new PerformanceObserver((l) => { loaf.push(...l.getEntries()); if (loaf.length > 50) loaf.splice(0, loaf.length - 50); })
            .observe({ type: "long-animation-frame", buffered: true });
    } catch {}
    const lafs = (t0, t1) => loaf.filter((e) => e.startTime + e.duration >= t0 && e.startTime <= t1).slice(-3).map((e) => ({
        d: Math.round(e.duration), b: Math.round(e.blockingDuration || 0),
        r: Math.round(e.renderStart ? e.renderStart - e.startTime : 0), l: Math.round(e.styleAndLayoutStart ? e.styleAndLayoutStart - e.startTime : 0),
        s: [...(e.scripts || [])].sort((a, b) => b.duration - a.duration).slice(0, 2).map((x) => [Math.round(x.duration), x.invokerType,
            String(x.invoker || "").slice(0, 60), String(x.sourceURL || "").replace(/^.*\//, "").slice(0, 40), String(x.sourceFunctionName || "").slice(0, 40)]),
    }));
    Module.yo2Frame = (decode, upload, slept, waitObj, yields) => {
        const now = performance.now(), u = Module.yo2Sfx?.underruns?.() | 0, r = Module.yo2NetRx | 0;
        const js = performance.memory?.usedJSHeapSize | 0;
        frame++;
        const focus = document.hasFocus ? +document.hasFocus() : 1;
        // ponytail: hidden at either end or in between is skipped (a background tab's timers fire once a second)
        if (last && now - last > LIMIT && !document.hidden && hiddenAt < last && all.length - waits < CAP) {
            const miss = since(Module.yo2Lazy?.missLog, last), xhr = since(Module.yo2Xhr, last);
            const s = { t: Math.round(last), ms: Math.round(now - last), f: frame, scene, sw: swAt >= last, duel: Module.yo2Lazy?.duel || "",
                decode: Math.round(decode || 0), upload: Math.round(upload || 0), slept: Math.round(slept || 0),
                waitObj: Math.round(waitObj || 0), yields: yields | 0, focus: `${focusAt}${focus}`, laf: lafs(last, now), miss: miss.slice(-20), missMs: sum(miss), xhr: xhr.slice(-10), xhrMs: sum(xhr),
                net: { rx: r - rx, backlog: (Module.yo2NetRx | 0) - (Module.yo2NetRead | 0) }, under: u - under,
                js: js - (Module.yo2Js | 0) };
            push(s);
        }
        last = now, under = u, rx = r, Module.yo2Js = js, focusAt = focus;
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
