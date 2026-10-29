// loader.js: the loading screen over the game canvas while the client downloads and boots (ship-recomp.sh injects it
// into yo2rc.html after stage.js). The game's own menu backdrop: abmake_bg_01 at 2x, the abmake_bg_02 checker
// scrolling down 1 px/frame (two copies, wrapping at 768) and the menu_mark_a01 ring movie (ring.json, from
// swf2json.py). A progress line under it: the wasm download %, then "Starting...". It fades once the game has drawn
// 24 frames (WebGL draw calls in 24 animation frames; clears alone don't count), or after a 90 s fallback, and is then
// hidden (display: none). After that it comes back only on the runtime's scene events, Module.onYo2Scene(kind, from, to)
// from the recomp build (yo2-gfx 6d0c5b25): "begin" (doors, duel result, title -> login...) shows the grid with the ring
// spun by a CSS animation (the main thread can be busy ~0.5 s while a scene loads; the compositor keeps CSS running),
// "end" hides it (idempotent). Never on static screens: no draw-call guessing. Never takes pointer events, except its
// Reload button (booting or a scene load for 45 s). prefers-reduced-motion: no scrolling, the ring stands still.
(() => {
    // the runtime copies the game window's caption ("Yu-Gi-Oh! ONLINE 2") into the tab title: keep the page's own
    const title = document.title;
    Object.defineProperty(document, "title", { get: () => title, set() {}, configurable: true });
    const W = 1024, H = 768, NEED = 24, FALLBACK_MS = 90000;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const game = document.getElementById("canvas");
    const box = document.createElement("div");
    box.id = "loading";
    box.innerHTML = '<canvas width="1024" height="768"></canvas><canvas class="spin" width="600" height="600"></canvas>' +
        '<div class="status">Downloading…</div>';
    const css = document.createElement("style");
    css.textContent = `
      #loading { position: absolute; z-index: 5; pointer-events: none; transition: opacity .6s ease-out; }
      #loading canvas { display: block; width: 100%; height: 100%; }
      #loading .status { position: absolute; left: 0; right: 0; top: 82%; text-align: center; color: #fff;
        font: 600 2.1cqh/1.2 system-ui, sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,.6); letter-spacing: .02em; }
      #loading { container-type: size; }
      #loading.gone { opacity: 0; }
      #loading.scene { transition: opacity .15s ease-out; }
      #loading.scene.gone { transition: opacity .3s ease-out; }
      #loading .spin { display: none; position: absolute; left: 50%; top: 47%; width: 58.59%; height: 78.125%;
        transform: translate(-50%, -50%); }
      #loading.scene .spin { display: block; animation: yo2spin 2s linear infinite; }
      @keyframes yo2spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { #loading.scene .spin { animation: none; } }`;
    document.head.append(css);
    (game.parentElement || document.body).append(box);
    const ctx = box.firstChild.getContext("2d"), statusEl = box.lastChild, spin = box.children[1];
    const status = (t) => { statusEl.textContent = t; };

    // follow the game canvas (stage.js resizes it with the window and in fullscreen)
    function place() {
        box.style.left = game.offsetLeft + "px"; box.style.top = game.offsetTop + "px";
        box.style.width = game.offsetWidth + "px"; box.style.height = game.offsetHeight + "px";
    }

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

    // the backdrop: same player as the old title replica, cut down to what menu_mark_a01 uses
    const img = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    let bg1, bg2, ring, list = new Map(), rf = 0, scroll = 0;
    Promise.all([img("loader/abmake_bg_01.png"), img("loader/abmake_bg_02.png"),
                 fetch("loader/ring.json").then((r) => r.json()).catch(() => null)]).then(async ([a, b, m]) => {
        bg1 = a; bg2 = b;
        if (m) {
            m.img = {};
            for (const c of Object.values(m.chars)) if (c.k === "bmp") m.img[c.f] = await img("loader/" + c.f);
            ring = m;
            apply(ring.frames[0]); rf = 1;
        }
    }).catch(() => { ring = null; });   // a broken ring.json: the backdrop without the ring
    function apply(ops) {
        for (const o of ops) {
            if (o.rm) { list.delete(o.d); continue; }
            const prev = list.get(o.d);
            const e = o.move && prev ? Object.assign({}, prev) : { m: [1, 0, 0, 1, 0, 0], cx: null };
            if (o.c !== undefined) e.c = o.c;
            if (o.m) e.m = o.m;
            if ("cx" in o) e.cx = o.cx;
            list.set(o.d, e);
        }
    }
    function drawChar(g, id, alpha) {
        const ch = ring.chars[id];
        if (!ch) return;
        if (ch.k === "shape") {
            const bmp = ring.chars[ch.bmp], im = bmp && ring.img[bmp.f];
            if (!im) return;
            g.save(); g.globalAlpha = alpha; g.transform(...ch.bm); g.drawImage(im, 0, 0); g.restore();
        } else if (ch.k === "sprite") {
            for (const o of ch.frames[0] || []) {
                if (o.c === undefined) continue;
                g.save(); g.transform(...(o.m || [1, 0, 0, 1, 0, 0])); drawChar(g, o.c, alpha); g.restore();
            }
        }
    }
    function draw(noRing) {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
        if (bg1) ctx.drawImage(bg1, 0, 0, W, H);
        if (bg2) { const y = Math.floor(scroll) % H; ctx.drawImage(bg2, 0, y - H, W, H); ctx.drawImage(bg2, 0, y, W, H); }
        if (ring && !noRing) {
            // the movie spins the ring around (300, 300), where the game's menu puts it; centre it above the status line
            ctx.save(); ctx.translate(W / 2 - 300, H * 0.47 - 300); ctx.scale(1 / 20, 1 / 20);
            for (const d of [...list.keys()].sort((x, y) => x - y)) {
                const e = list.get(d), a = e.cx ? e.cx[3] : 1;
                if (a <= 0) continue;
                ctx.save(); ctx.transform(...e.m); drawChar(ctx, e.c, a); ctx.restore();
            }
            ctx.restore();
        }
    }

    // Boot: hidden after the first reveal. 2026-10-28: a version that came back whenever no draw calls arrived for 600 ms
    // covered the running game (static screens issue none); the comeback is driven by the runtime's scene events only.
    // Still booting, or a scene still loading, after STUCK_MS: offer a reload.
    const STUCK_MS = 45000;
    const t0 = performance.now();
    let last = 0, shown = true, stuck = null, booted = false, scene = false, stuckTimer = 0, offTimer = 0, dropped = false;
    function tick(now) {
        if (dropped) return;   // the download failed: keep the message up
        place();
        if (drew) { drew = false; frames++; }
        if (frames >= NEED || now - t0 > FALLBACK_MS) { window.fetch = realFetch; booted = true; hide(); return; }
        if (!stuck && now - t0 > STUCK_MS) showStuck();
        if (shown && now - last >= 1000 / 30) {   // the movies run at 30 fps
            last = now;
            if (!still) {
                scroll += 1;
                if (ring && ring.frames.length > 1) { if (rf >= ring.frames.length) { list = new Map(); rf = 0; } apply(ring.frames[rf++]); }
            }
            draw();
        }
        requestAnimationFrame(tick);
    }
    function hide() {
        shown = false;
        box.classList.add("gone");
        if (stuck) { stuck.remove(); stuck = null; }
        clearTimeout(stuckTimer);
        clearTimeout(offTimer);
        offTimer = setTimeout(() => { if (!scene) box.style.display = "none"; }, 700);   // nothing left over the canvas
    }

    // scene loads: the grid (static) + the ring frame turned by CSS, so it keeps spinning while the main thread is busy
    function drawSpin() {
        const s = spin.getContext("2d");
        s.clearRect(0, 0, 600, 600);
        if (!ring) return;
        const keep = list;
        list = new Map(); apply(ring.frames[0]);   // the movie's first frame: the ring face-on
        s.save(); s.scale(1 / 20, 1 / 20);
        for (const d of [...list.keys()].sort((x, y) => x - y)) {
            const e = list.get(d), a = e.cx ? e.cx[3] : 1;
            if (a <= 0) continue;
            s.save(); s.transform(...e.m); drawChar(s, e.c, a); s.restore();
        }
        s.restore();
        list = keep;
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
            if (scene) return;
            scene = true;
            clearTimeout(offTimer);
            place(); draw(true); drawSpin();
            status("Loading…");
            box.style.display = "";
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
    window.visualViewport?.addEventListener("resize", () => { if (scene) place(); });   // phones: keyboard, rotation (stage.js)
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

    // A server update drops the game's gateway WebSocket (/net) for everyone. Then: a small note, wait for the server to
    // answer, reload with ?online=1 (YO2_AUTO_ONLINE: a signed-in player goes straight past the title). Two signals:
    // the server closes the socket with 4012 before a planned deploy; any other close is checked against GET /__version
    // (read at boot): a new version within ~2 min is an update, the same one (or none) is the player's own network, and
    // the game's own message stands. At most 3 such reloads in 10 min, then a Reload button.
    {
        const DUEL = [0x1c, 0x1e], q = new URLSearchParams(location.search);
        const getV = () => fetch("__version", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => j && j.v || null, () => null);
        let mine = null, opened = false, busy = false;
        getV().then((v) => { mine = v; });
        const Real = window.WebSocket;
        window.WebSocket = class extends Real {
            constructor(...a) {
                super(...a);
                if (!/\/net(\?|$)/.test(String(a[0]))) return;
                this.addEventListener("open", () => { opened = true; });
                this.addEventListener("close", (e) => { if (opened && booted) dropped(e.code); });
            }
        };
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        async function dropped(code) {
            if (busy) return;
            busy = true;
            const duel = DUEL.includes(inScene);
            if (code !== 4012) {   // unannounced: an update only if the server comes back as another version
                let v = null;
                for (let t = 0, wait = 1000; t < 120000 && (!v || v === mine); t += wait, wait = Math.min(wait * 2, 15000)) {
                    await sleep(wait);
                    v = await getV();
                    if (v && v === mine) break;
                }
                if (!v || !mine || v === mine) { busy = false; return; }   // the player's network, or no /__version
            }
            let tries = [];
            try { tries = JSON.parse(sessionStorage.getItem("yo2-reconnects") || "[]").filter((t) => Date.now() - t < 600000); } catch (e) {}
            const auto = tries.length < 3;
            const note = document.createElement("div");
            note.setAttribute("role", "status");
            note.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:7;box-sizing:border-box;max-width:300px;padding:10px 12px;" +
                "border-radius:10px;background:rgba(0,0,0,.72);color:#fff;font:600 13px/1.35 system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.6)";
            note.textContent = (duel ? "The server was updated and the duel in progress was lost. " : "The server was updated. ") +
                (auto ? "Reconnecting…" : "Reload to reconnect.");
            const go = () => {
                try { sessionStorage.setItem("yo2-reconnects", JSON.stringify([...tries, Date.now()])); } catch (e) {}
                const u = new URLSearchParams(q); u.set("online", "1");
                location.replace(location.pathname + "?" + u);
            };
            if (!auto) {
                const b = document.createElement("button");
                b.textContent = "Reload";
                b.style.cssText = "display:block;margin:8px 0 0 auto;font:600 13px system-ui,sans-serif;padding:.35em 1.1em;border:0;" +
                    "border-radius:999px;background:#fff;color:#123;cursor:pointer";
                b.onclick = go;
                note.append(b);
            }
            document.body.append(note);
            if (!auto) return;
            // wait for the server: /__version answers (and, after a 4012, names the new version, or 3 min pass)
            for (let t = 0, wait = 1000; ; t += wait, wait = Math.min(wait * 2, 10000)) {
                await sleep(wait);
                const v = await getV();
                if (v && (code !== 4012 || v !== mine || t > 180000)) break;
                if (!v && !mine && t > 5000 && await fetch("__warm", { cache: "no-store" }).then((r) => r.ok, () => false)) break;   // no /__version on this server
            }
            go();
        }
    }
})();
