// loader.js: the loading screen over the game canvas while the client downloads and boots (ship-recomp.sh injects it
// into yo2rc.html after stage.js). The game's own menu backdrop: abmake_bg_01 at 2x, the abmake_bg_02 checker
// scrolling down 1 px/frame (two copies, wrapping at 768) and the menu_mark_a01 ring movie (ring.json, from
// swf2json.py), the scroll and the ring as CSS animations (below: the boot's main thread stalls for seconds compiling
// and starting the game, and a canvas drawn per frame froze with it). Its first frame is the backdrop's blue as a CSS
// gradient, before any picture has come. A progress line under it: the wasm download %, then "Starting...". It fades once the game has drawn
// 24 frames (WebGL draw calls in 24 animation frames; clears alone don't count), or after a 90 s fallback, and is then
// hidden (display: none). After that it comes back only on the runtime's scene events, Module.onYo2Scene(kind, from, to)
// from the recomp build (yo2-gfx 6d0c5b25): "begin" (doors, duel result, title -> login...) shows the grid with the ring
// movie played by CSS keyframes made from ring.json (the main thread can be busy ~0.5 s while a scene loads; the
// compositor keeps CSS transform animations running, in Chrome and WebKit alike),
// "end" hides it (idempotent). Never on static screens: no draw-call guessing. Never takes pointer events, except its
// Reload button (booting or a scene load for 45 s). prefers-reduced-motion: no scrolling, the ring stands still.
// The box is on <body>, fixed over the canvas, not in stage.js's #stage: #stage is position: fixed, a stacking context
// of its own at z 0, so a z-index inside it never rose above the HTML UI's layers on <body> (#htmlui-host 4, the scroll
// bars 3). Every scene load then showed the next scene's HTML windows, still unskinned (black boxes), over the veil.
(() => {
    // the runtime copies the game window's caption ("Yu-Gi-Oh! ONLINE 2") into the tab title: keep the page's own
    const title = document.title;
    Object.defineProperty(document, "title", { get: () => title, set() {}, configurable: true });
    const W = 1024, H = 768, NEED = 24, FALLBACK_MS = 90000;
    const game = document.getElementById("canvas");
    const box = document.createElement("div");
    box.id = "loading";
    box.className = "boot";
    box.innerHTML = '<canvas width="1024" height="768"></canvas><div class="grid"><i></i></div><div class="spin"></div>' +
        '<div class="status">Downloading…</div>';
    const css = document.createElement("style");
    css.textContent = `
      #loading { position: fixed; z-index: 5; pointer-events: none; transition: opacity .6s ease-out;
        background: linear-gradient(90deg, #43abf5, #52aff6 12.5%, #60b4f7 25%, #96cefa 37.5%, #b2dbfb 44%, #c8e5fc 50%,
          #c3e3fc 56%, #acd8fb 62.5%, #70bbf8 75%, #44a7f5 87.5%, #39a2f5); }
      #loading canvas { display: block; width: 100%; height: 100%; }
      #loading .grid { display: none; position: absolute; inset: 0; overflow: hidden; }
      #loading.boot .grid { display: block; }
      #loading .grid i { position: absolute; left: 0; top: -100%; width: 100%; height: 200%;
        background: url(loader/abmake_bg_02.png) 0 0 / 100% 50% repeat-y; animation: yo2grid ${H / 30}s linear infinite; }
      @keyframes yo2grid { to { transform: translateY(50%); } }
      @media (prefers-reduced-motion: reduce) { #loading .grid i { animation: none; } }
      #loading .status { position: absolute; left: 0; right: 0; top: 82%; text-align: center; color: #fff;
        font: 600 2.1cqh/1.2 system-ui, sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,.6); letter-spacing: .02em; }
      #loading { container-type: size; }
      #loading.gone { opacity: 0; }
      #loading.scene { transition: opacity .15s ease-out .35s; }
      #loading.scene.gone { transition: opacity .3s ease-out; }
      #loading .spin { display: none; position: absolute; left: 50%; top: 47%; width: 600px; height: 600px;
        transform: translate(-50%, -50%) scale(var(--kx, 1), var(--ky, 1)); }
      #loading.scene .spin, #loading.boot .spin { display: block; }
      #loading .spin img { position: absolute; left: 0; top: 0; width: 480px; height: 480px; transform-origin: 0 0; }`;
    document.head.append(css);
    document.body.append(box);
    const ctx = box.firstChild.getContext("2d"), statusEl = box.lastChild, spin = box.querySelector(".spin");
    const status = (t) => { statusEl.textContent = t; };

    // follow the game canvas (stage.js resizes it with the window and in fullscreen, and moves it with a phone's
    // visual viewport)
    function place() {
        const r = game.getBoundingClientRect();
        box.style.left = r.left + "px"; box.style.top = r.top + "px";
        box.style.width = r.width + "px"; box.style.height = r.height + "px";
        spin.style.setProperty("--kx", r.width / W); spin.style.setProperty("--ky", r.height / H);   // the ring's 600 px at game scale
    }
    place();   // from its first frame (stage.js has sized the canvas already)

    // wasm download progress: count the bytes of the .wasm response as the runtime streams it. The first fetch hands
    // the network Response itself to instantiateStreaming and counts a clone(): a Response we build has no URL, and
    // V8/WebKit cache the compiled module (a warm boot skips the compile) only for one that comes from the HTTP cache.
    // Phones drop the 40 MB download now and then: Emscripten then fetches again (instantiateArrayBuffer), and that
    // fetch is tried once more on failure and, if its body breaks off, resumes once from the byte it reached (a Range
    // request: the site serves ranges of the uncompressed file even when the full response is compressed, so the
    // decoded count is the offset).
    const realFetch = window.fetch;
    const counted = new Set();
    const progress = (got, total) => status(total ? `Downloading ${Math.min(99, Math.floor(got * 100 / total))}%` : `Downloading ${(got / 1048576).toFixed(0)} MB`);
    window.fetch = async function (input, init) {
        const url = String((input && input.url) || input);
        if (!/\.wasm(\?|$)/.test(url)) return realFetch.call(this, input, init);
        const r = await realFetch.call(this, input, init).catch(() => realFetch.call(this, input, init));
        if (!r.ok || !r.body) return r;
        const total = +r.headers.get("content-length") || 0;
        if (!counted.has(url)) {
            counted.add(url);
            const c = r.clone().body.getReader();
            (async () => {
                for (let got = 0; ;) {
                    const { done, value } = await c.read();
                    if (done) return status("Starting…");
                    progress(got += value.byteLength, total);
                }
            })().catch(() => {});
            return r;
        }
        let got = 0, reader = r.body.getReader(), resumed = false;
        const body = new ReadableStream({
            async pull(c) {
                for (;;) {
                    try {
                        const { done, value } = await reader.read();
                        if (done) { status("Starting…"); return c.close(); }
                        progress(got += value.byteLength, total);
                        return c.enqueue(value);
                    } catch (e) {
                        if (resumed) throw e;
                        resumed = true;
                        const r2 = await realFetch(url, { credentials: "same-origin", headers: { Range: `bytes=${got}-` } }).catch(() => null);
                        if (!r2 || r2.status !== 206 || !(r2.headers.get("content-range") || "").startsWith(`bytes ${got}-`)) throw e;
                        reader = r2.body.getReader();
                    }
                }
            },
        });
        return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
    };

    // real frames: count animation frames in which the game issued WebGL draw calls
    let drew = false, frames = 0;
    const realGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        const gl = realGetContext.call(this, type, attrs);
        if (this === game && gl && /webgl/.test(type) && !gl.__counted) {
            gl.__counted = true;
            for (const f of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
                const orig = gl[f];
                if (orig) gl[f] = function () { drew = true; return orig.apply(this, arguments); };
            }
        }
        return gl;
    };

    // the backdrop: abmake_bg_01 on the box's canvas, over its gradient once it has come (a scene's veil adds the
    // checker, standing still); the boot's scrolling checker (.grid) and the ring (ringCss) are CSS animations, which the
    // compositor runs however long the main thread is busy
    const img = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    let bg1, bg2, ring;
    Promise.all([img("loader/abmake_bg_01.png"), img("loader/abmake_bg_02.png"),
                 fetch("loader/ring.json").then((r) => r.json()).catch(() => null)]).then(async ([a, b, m]) => {
        bg1 = a; bg2 = b;
        draw(scene);
        if (m) {   // its layers' pictures first, so the ring comes up whole
            for (const c of Object.values(m.chars)) if (c.k === "bmp") await img("loader/" + c.f);
            ring = m;
            ringCss();
        }
    }).catch(() => { ring = null; });   // a broken ring.json: the backdrop without the ring
    function draw(checker) {
        if (!bg1) return;   // the gradient until the picture comes
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(bg1, 0, 0, W, H);
        if (checker && bg2) ctx.drawImage(bg2, 0, 0, W, H);
    }

    // Boot: hidden after the first reveal. 2026-10-28: a version that came back whenever no draw calls arrived for 600 ms
    // covered the running game (static screens issue none); the comeback is driven by the runtime's scene events only.
    // Still booting, or a scene still loading, after STUCK_MS: offer a reload.
    const STUCK_MS = 45000;
    const t0 = performance.now();
    let stuck = null, booted = false, scene = false, stuckTimer = 0, offTimer = 0, dropped = false;
    function tick(now) {
        if (dropped) return;   // the download failed: keep the message up
        place();
        if (drew) { drew = false; frames++; }
        if (frames >= NEED || now - t0 > FALLBACK_MS) { window.fetch = realFetch; booted = true; hide(); return; }
        if (!stuck && now - t0 > STUCK_MS) showStuck();
        requestAnimationFrame(tick);
    }
    function hide() {
        box.classList.add("gone");
        if (stuck) { stuck.remove(); stuck = null; }
        clearTimeout(stuckTimer);
        clearTimeout(offTimer);
        offTimer = setTimeout(() => { if (!scene) { box.style.display = "none"; box.classList.remove("boot"); } }, 700);   // nothing left over the canvas
    }

    // the ring movie as CSS (the boot's, and a scene load's over the still grid). Each ring layer (a 480 px bitmap, 1/20 twips) becomes an
    // <img> in .spin (600x600 movie px, scaled to the game by place()) with one keyframe per movie frame (30 fps), so the
    // compositor plays it however busy the main thread is. Linear between frames: WebKit runs steps() keyframes on the
    // main thread (the ring froze while the game was busy). The last frame is repeated at 100% so the loop jumps back to
    // frame 0 as the movie does (no tween across the wrap, which mirrors two layers).
    // Showing .spin (display: none -> block) starts it at frame 0. prefers-reduced-motion: the first frame stands still.
    function ringCss() {
        const at = new Map(), kf = new Map(), n = ring.frames.length;
        const pose = (e) => `transform:matrix(${e.m.slice(0, 4)},${e.m[4] / 20},${e.m[5] / 20})`;
        ring.frames.forEach((ops, i) => {
            for (const o of ops) {
                if (o.rm) { at.delete(o.d); continue; }
                const e = Object.assign({ m: [1, 0, 0, 1, 0, 0], cx: null }, o.move ? at.get(o.d) : null);   // a move keeps the rest of the layer's pose
                if (o.c !== undefined) e.c = o.c;
                if (o.m) e.m = o.m;
                if ("cx" in o) e.cx = o.cx;
                at.set(o.d, e);
            }
            for (const [d, e] of at) kf.set(d, (kf.get(d) || "") + `${(i * 100 / n).toFixed(3)}%{${pose(e)}}` + (i === n - 1 ? `100%{${pose(e)}}` : ""));
        });
        let rules = "";
        for (const d of [...at.keys()].sort((x, y) => x - y)) {
            // ponytail: menu_mark_a01's layers are sprite -> one shape (identity) -> bitmap, and keep their char all movie long
            const first = ring.frames[0].find((o) => o.d === d), sprite = ring.chars[first.c];
            const bmp = ring.chars[ring.chars[sprite.frames[0][0].c].bmp];
            const im = document.createElement("img");
            im.src = "loader/" + bmp.f; im.alt = ""; im.className = "r" + d;
            // ponytail: the layer's alpha (cx) is set once, in frame 0, so it's a plain style, not keyframed
            im.style.cssText = pose(first) + `;opacity:${first.cx ? first.cx[3] : 1}`;
            spin.append(im);
            rules += `@keyframes yo2ring${d}{${kf.get(d)}}#loading .spin .r${d}{animation:yo2ring${d} ${n / 30}s linear infinite}`;
        }
        css.textContent += rules + "@media (prefers-reduced-motion: reduce) { #loading .spin img { animation: none !important; } }";
    }
    // lazyfs.js makes the scene dispatcher (assigning Module.onYo2Scene adds a listener) only in preRun, after stall.js
    // (a pre-js) has assigned its own handler, which replaced this one (f383812 on: no scene events reached the loader).
    // Until then this collects every assignment; lazyfs's dispatcher then takes the lot as one listener.
    {
        const fns = [], all = (kind, from, to) => { for (const f of fns) f(kind, from, to); };
        Object.defineProperty(Module, "onYo2Scene", { configurable: true, get: () => all, set: (f) => { if (typeof f === "function") fns.push(f); } });
    }
    Module.onYo2Scene = function (kind, from, to) {
        switching = kind === "begin";
        if (switching) { inScene = to; update.hide(); } else update.check();
        if (!booted) return;   // the boot screen is still up
        if (kind === "begin") {
            // the box fades in only after the game's own fade to black (CSceneMng's FADE_WAIT: 10 frames, 0.33 s, the
            // transition-delay above): from "begin" it came up over that fade, and the game's darkening menu mark showed
            // through it under the box's ring at another angle (owner: "weird black stuff" loading the room)
            if (scene) return;
            scene = true;
            clearTimeout(offTimer);
            place(); draw(true);
            status("Loading…");
            box.style.display = "";
            box.classList.remove("boot");   // its veil's grid stands still
            box.classList.add("scene");
            void box.offsetWidth;   // let the fade-in start from opacity 0
            box.classList.remove("gone");
            stuckTimer = setTimeout(showStuck, STUCK_MS);
        } else if (kind === "end" && scene) {
            scene = false;
            hide();
        }
    };
    addEventListener("resize", () => { if (scene) place(); });
    for (const e of ["resize", "scroll"]) window.visualViewport?.addEventListener(e, () => { if (scene) place(); });   // phones: keyboard, rotation (stage.js)
    function showStuck() {
        status("This is taking longer than usual.");
        stuck = document.createElement("button");
        stuck.textContent = "Reload";
        stuck.style.cssText = "position:absolute;left:50%;top:88%;transform:translateX(-50%);pointer-events:auto;" +
            "font:600 2cqh system-ui,sans-serif;padding:.4em 1.4em;border:0;border-radius:999px;background:#fff;color:#123;cursor:pointer";
        stuck.onclick = () => location.reload();
        box.append(stuck);
    }
    // the download failed for good (Emscripten aborts: "both async and sync fetching of the wasm failed"): say so on the
    // loading screen, and a tap anywhere reloads, instead of shell.html's "Something went wrong" (pointerup: stage.js
    // swallows the touches, so no click comes)
    addEventListener("yo2crash", (e) => {
        if (booted || !/fetching of the wasm failed|Load failed|Failed to fetch|NetworkError/i.test(e.detail)) return;
        e.preventDefault();
        dropped = true;
        if (stuck) { stuck.remove(); stuck = null; }
        clearTimeout(stuckTimer);
        status("Connection dropped. Tap to retry.");
        box.style.pointerEvents = "auto";
        box.style.cursor = "pointer";
        box.onpointerup = () => location.reload();
    });
    requestAnimationFrame(tick);

    // A new build while this tab runs (a tab can stay open for a day): BUILD.txt (no-cache, written by each ship) is
    // checked every 10 min, and once it names another build a small note in the corner offers a reload. Never during
    // a duel or janken (0x1c, 0x1e) or a scene switch; [Later] keeps it away for an hour. No forced reload: a server
    // protocol change that breaks old builds has its own reload path.
    let switching = false, inScene = -1;
    const update = (() => {
        const mine = document.querySelector('meta[name="yo2-build"]')?.content;
        const DUEL = [0x1c, 0x1e];
        let newer = false, later = 0, note = null;
        const check = () => {
            if (!newer || note || !booted || switching || DUEL.includes(inScene) || Date.now() < later) return;
            note = document.createElement("div");
            note.setAttribute("role", "status");
            note.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:6;box-sizing:border-box;max-width:300px;padding:10px 12px;border-radius:10px;" +
                "background:rgba(0,0,0,.72);color:#fff;font:600 13px/1.35 system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.6)";
            note.textContent = "A new version of Duel Evolution is ready. Reload when you're not in a duel.";
            const row = document.createElement("div");
            row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:8px";
            for (const [label, primary, act] of [["Later", false, () => { later = Date.now() + 3600000; hideNote(); }],
                                                 ["Reload", true, () => location.reload()]]) {
                const b = document.createElement("button");
                b.textContent = label;
                b.style.cssText = "font:600 13px system-ui,sans-serif;padding:.35em 1.1em;border-radius:999px;cursor:pointer;" +
                    (primary ? "border:0;background:#fff;color:#123" : "border:1px solid rgba(255,255,255,.6);background:none;color:#fff");
                b.onclick = act;
                row.append(b);
            }
            note.append(row);
            document.body.append(note);
        };
        const hideNote = () => { if (note) { note.remove(); note = null; } };
        if (mine) setInterval(() => {
            if (newer) return check();
            fetch("BUILD.txt", { cache: "no-store" }).then((r) => r.ok ? r.text() : "").then((t) => {
                const live = t.trim().split(/\s+/)[0];
                if (/^[0-9a-f]{7,}$/.test(live) && live !== mine) { newer = true; check(); }
            }).catch(() => {});
        }, +(new URLSearchParams(location.search).get("updatepoll") || 600000));
        return { check, hide: hideNote };
    })();

    // A server update (its 4012 close), or any other drop of the game's gateway WebSocket (/net): no reload (the owner:
    // "reload the page" is never the fix). The game reconnects in place: the tunnel resumes its sockets
    // (platform/net/net_ws.cpp), or else the lobby rejoins the room and area the player was in and a duel re-attaches
    // (client/recomp/ovr/lobbyretry.c, duelreattach.c). Here only a small note while that runs: it shows on the drop,
    // and goes once a new /net is open and the game no longer reports window.yo2Net.reconnecting.
    {
        const DUEL = [0x1c, 0x1e];
        let opened = false, note = null, since = 0, reopened = false;
        const Real = window.WebSocket;
        window.WebSocket = class extends Real {
            constructor(...a) {
                super(...a);
                if (!/\/net(\?|$)/.test(String(a[0]))) return;
                this.addEventListener("open", () => { opened = true; if (note) reopened = true; });
                this.addEventListener("close", () => { if (opened && booted) dropped(); });
            }
        };
        function dropped() {
            since = Date.now(), reopened = false;
            if (note) return;
            note = document.createElement("div");
            note.setAttribute("role", "status");
            note.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:7;box-sizing:border-box;max-width:300px;padding:10px 12px;" +
                "border-radius:10px;background:rgba(0,0,0,.72);color:#fff;font:600 13px/1.35 system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.6)";
            note.textContent = DUEL.includes(inScene) ? "Connection lost: reconnecting to the duel…" : "Connection lost: reconnecting…";
            document.body.append(note);
            const t = setInterval(() => {
                const net = window.yo2Net;
                if (!reopened || (net && net.reconnecting) || Date.now() - since < 1500) return;
                clearInterval(t);
                note.remove();
                note = null;
            }, 500);
        }
    }
})();
