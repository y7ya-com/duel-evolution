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

    // wasm download progress: count the bytes of the .wasm response as the runtime streams it. Phones drop the 40 MB
    // download now and then: a failed request is tried once more, and a body that breaks off resumes once from the
    // byte it reached (a Range request: the site serves ranges of the uncompressed file even when the full response
    // is zstd, so the decoded count is the offset). Emscripten itself fetches again once if streaming fails.
    const realFetch = window.fetch;
    window.fetch = async function (input, init) {
        const url = String((input && input.url) || input);
        if (!/\.wasm(\?|$)/.test(url)) return realFetch.call(this, input, init);
        const r = await realFetch.call(this, input, init).catch(() => realFetch.call(this, input, init));
        if (!r.ok || !r.body) return r;
        const total = +r.headers.get("content-length") || 0;
        let got = 0, reader = r.body.getReader(), resumed = false;
        const body = new ReadableStream({
            async pull(c) {
                for (;;) {
                    try {
                        const { done, value } = await reader.read();
                        if (done) { status("Starting…"); return c.close(); }
                        got += value.byteLength;
                        status(total ? `Downloading ${Math.min(99, Math.floor(got * 100 / total))}%` : `Downloading ${(got / 1048576).toFixed(0)} MB`);
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
    Module.onYo2Scene = function (kind, from, to) {
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
})();
