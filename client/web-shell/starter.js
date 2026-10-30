// starter.js: the starter structure-deck picker, shown once to a character that hasn't claimed one (ship-client.sh
// injects it after loader.js). When the game reaches My Room or the lobby (Module.onYo2Scene "end" to 10/11) it asks GET /api/de/starter; while that says claimable it opens over
// the game canvas, drawn with the game's own window, buttons and glyphs (client/html-ui/ui.js, its art under ui/):
// a grid of decks (cover card, name, one line of flavour), a deck's card list, "Choose this deck", a confirm, POST
// /api/de/starter/claim {id}, done. The game keeps running underneath. The overlay sits on <body> (not in stage.js's
// #stage, so its touches never become game clicks), swallows its own key and pointer events (SDL listens on window
// and document) and, closed, removes every node and listener it added. "Later" closes it until the next page load.
// Laid out in game pixels: 1024x768 scaled with the canvas on desktop; below 1x (phones) the layout reflows at 1x.
(() => {
    const UI = "./ui.js", ART = "ui/", COVERS = "cards/covers/", API = "/api/de/starter";
    const MY_ROOM = 10, LOBBY = 11, DECK = 0x24;   // SceneId (yo2SceneManager.h); DECK: a player with an empty trunk is sent straight there and can't leave
    let ui = null, busy = false, done = false, open = null;

    // a plain assignment ADDS a listener (loader.js's collector before preRun, lazyfs's dispatcher after); wrapping the
    // old value would recurse through the collector (crash-signatures.md #1)
    let scene = 0;   // the scene the picker was asked from
    Module.onYo2Scene = (kind, from, to) => {
        if (kind === "end" && (to === MY_ROOM || to === LOBBY || to === DECK)) { scene = to; check(); }
    };

    async function check() {
        if (busy || done || open) return;
        busy = true;
        try {
            const r = await fetch(API, { credentials: "same-origin" });
            const j = r.ok && r.status !== 204 ? await r.json() : null;
            if (j && !j.claimable && j.reason === "claimed") {   // claimed: never ask again
                done = true;
                // a past claimer: the game equips the starter only if they have no 40-card deck (never overwrites)
                if (j.claimed?.main) try { Module.yo2InstallStarterDeck?.(j.claimed, { ifMissing: true }); } catch (e) { console.warn("starter: install", e); }
            }
            // not in game yet / no character picked (the session lands a moment after the scene): ask at the next scene
            else if (j && j.decks?.length) await show(j.decks);
        } catch (e) { console.warn("starter:", e); }   // ask again at the next My Room / lobby
        busy = false;
    }

    // ---- the overlay
    async function show(decks) {
        ui ||= await import(UI);
        await ui.loadGlyphs(ART);
        const { windowFrame, text, measure, button, sprite, SHEET } = ui;
        const canvas = document.getElementById("canvas");
        const root = document.createElement("div"), k = document.createElement("div");
        root.id = "starter";
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-label", "Choose your first deck");
        root.append(k);
        const css = document.createElement("style");
        css.textContent = `
          #starter { position: fixed; z-index: 10; overflow: hidden; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
          #starter > div { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
          #starter .sp, #starter .tx, #starter .btn, #starter .frame, #starter .layer, #starter .box { position: absolute; display: block; }
          #starter .frame { left: 0; top: 0; }
          #starter .sp { overflow: hidden; }
          #starter .sp > b { position: absolute; display: block; left: 0; top: 0; background-repeat: no-repeat; mask-repeat: no-repeat; transform-origin: 0 0; }
          #starter .btn { cursor: pointer; }
          #starter .btn:focus { outline: none; }
          #starter .btn:focus-visible { outline: 1px dotted #000; outline-offset: -4px; }
          #starter .scroll { position: absolute; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;
                             scrollbar-width: thin; scrollbar-color: rgba(0,0,0,.45) transparent; }
          #starter .cover { position: absolute; display: block; object-fit: cover; }
          #starter .top { position: absolute; inset: 0; }`;
        document.head.append(css);
        document.body.append(root);

        // its events stay here: the game listens on window/document
        const stop = (e) => e.stopPropagation();
        const kinds = ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "mousemove", "click", "dblclick",
            "contextmenu", "wheel", "touchstart", "touchmove", "touchend", "touchcancel", "keyup", "keypress"];
        for (const t of kinds) root.addEventListener(t, stop);
        root.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Escape") { e.preventDefault(); back(); }
            else if (e.key === "Tab") {   // Tab stays inside the top layer
                const f = [...(k.querySelector(".top") || k).querySelectorAll(".btn")];
                if (!f.length) return;
                const i = f.indexOf(document.activeElement), n = f.length;
                e.preventDefault();
                f[i < 0 ? 0 : (i + (e.shiftKey ? n - 1 : 1)) % n].focus();
            }
        });

        let view = "grid", deck = null, msg = "", scrollTop = {}, L = { w: 1024, h: 768 }, focusLabel = null;
        const wrap = (s, w, max) => {   // words onto lines of at most w px; the last line gets "..." if cut
            const out = [];
            let line = "";
            for (const word of String(s || "").split(/\s+/).filter(Boolean)) {
                const t = line ? line + " " + word : word;
                if (measure(t) <= w || !line) line = t; else { out.push(line); line = word; }
            }
            if (line) out.push(line);
            if (out.length > max) { out.length = max; out[max - 1] += "..."; }
            return out.map((l) => { while (measure(l) > w && l.length > 4) l = l.slice(0, -4) + "..."; return l; });
        };
        const lines = (parent, ls, x, y) => ls.forEach((l, i) => text(parent, [[l, x, y + 16 * i]]));
        const btn = (parent, x, y, label, onClick, w = Math.max(96, measure(label) + 32)) => button(parent, x, y, w, label, onClick);
        const cover = (parent, d, x, y, w, h) => {   // the field's white inner tile behind the art, so a missing image is a card-shaped box
            sprite(parent, SHEET.window, 56, 8, 8, 8, x, y, w, h);
            const img = document.createElement("img");
            img.className = "cover"; img.alt = ""; img.decoding = "async";
            Object.assign(img.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
            img.onerror = () => img.remove();
            img.src = COVERS + d.cover + ".jpg";
            parent.append(img);
        };

        function render() {
            const r = canvas.getBoundingClientRect();
            if (!r.width) return;
            const s = Math.max(1, r.width / 1024);
            L = { w: Math.floor(r.width / s), h: Math.floor(r.height / s) };
            Object.assign(root.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
            Object.assign(k.style, { width: L.w + "px", height: L.h + "px", transform: `scale(${s})` });
            k.querySelectorAll(".scroll").forEach((e) => { scrollTop[e.dataset.v] = e.scrollTop; });
            focusLabel = document.activeElement?.closest?.("#starter .btn")?.getAttribute("aria-label") ?? focusLabel;
            k.replaceChildren();
            const M = L.w < 700 ? 4 : 32, W = { x: M, y: M, w: L.w - 2 * M, h: L.h - 2 * M }, HEAD = 16;
            const inner = { x: W.x + 16, y: W.y + 8 + HEAD + 16 + 8, w: W.w - 32 };
            inner.h = W.y + W.h - 16 - 32 - inner.y;   // room for the footer buttons
            const foot = W.y + W.h - 16 - 24;
            windowFrame(k, W.x, W.y, W.w, W.h, HEAD);
            const title = view === "grid" ? "Welcome to Duel Evolution! Choose your first deck." : deck.name;
            const t = wrap(title, W.w - 32, 1)[0];
            text(k, [[t, W.x + Math.floor((W.w - measure(t)) / 2), W.y + 8]]);
            if (view === "grid") grid(inner, foot, W);
            else if (view === "deck") deckView(inner, foot, W);
            else dialog();   // over the empty window: the frames are translucent, the list would show through
            const top = k.querySelector(".top") || k, want = [...top.querySelectorAll(".btn")];
            (want.find((b) => b.getAttribute("aria-label") === focusLabel) || want[0])?.focus({ preventScroll: true });
        }

        function scroller(r, v) {
            const sc = document.createElement("div");
            sc.className = "scroll"; sc.dataset.v = v;
            Object.assign(sc.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
            k.append(sc);
            return sc;
        }
        const keep = (sc) => requestAnimationFrame(() => { sc.scrollTop = scrollTop[sc.dataset.v] || 0; });

        function grid(r, foot, W) {
            const sc = scroller(r, "grid"), GAP = 8, cw = L.h < 560 ? 64 : 100, ch = Math.round(cw * 1.45);
            const avail = sc.clientWidth - 2, cols = Math.max(1, Math.floor((avail + GAP) / (300 + GAP)));
            const tw = Math.floor((avail - GAP * (cols - 1)) / cols), tx = cw + 16, twText = tw - tx - 8;
            const tiles = decks.map((d) => ({ d, name: wrap(d.name, twText, 2), blurb: wrap(d.blurb, twText, L.h < 560 ? 2 : 4) }));
            const th = Math.max(ch + 16, ...tiles.map((t) => 16 + 16 * t.name.length + 4 + 16 * t.blurb.length));
            tiles.forEach((t, i) => {
                const b = button(sc, (i % cols) * (tw + GAP), Math.floor(i / cols) * (th + GAP), tw, t.d.name, () => { deck = t.d; view = "deck"; scrollTop.deck = 0; render(); }, th, false);
                cover(b, t.d, 8, 8, cw, ch);
                lines(b, t.name, tx, 8);
                lines(b, t.blurb, tx, 8 + 16 * t.name.length + 4);
            });
            const spacer = document.createElement("div");   // the scroll height (the tiles are absolute)
            spacer.style.height = Math.ceil(tiles.length / cols) * (th + GAP) - GAP + "px";
            sc.append(spacer);
            keep(sc);
            const later = "Later";
            btn(k, W.x + W.w - 16 - Math.max(96, measure(later) + 32), foot, later, close);
        }

        function deckView(r, foot, W) {
            const cw = L.h < 560 ? 100 : 200, ch = Math.round(cw * 1.45);
            cover(k, deck, r.x, r.y, cw, ch);
            const lr = { x: r.x + cw + 16, y: r.y, w: r.w - cw - 16, h: r.h }, sc = scroller(lr, "deck"), lw = sc.clientWidth - 8;
            const out = [...wrap(deck.blurb, lw, 4), ""];
            const groups = [["monster", "Monsters"], ["spell", "Spells"], ["trap", "Traps"], ["extra", "Extra Deck"]];
            const row = (c) => wrap(`${c.n}x ${c.name}`, lw, 1)[0];
            for (const [ty, label] of groups) {   // the server always sends type
                const g = (deck.cards || []).filter((c) => c.type === ty).sort((a, b) => a.name.localeCompare(b.name));
                if (g.length) out.push(`${label} (${g.reduce((a, c) => a + c.n, 0)})`, ...g.map(row), "");
            }
            lines(sc, out, 0, 0);
            const spacer = document.createElement("div");
            spacer.style.height = 16 * out.length + "px";
            sc.append(spacer);
            keep(sc);
            btn(k, W.x + 16, foot, "Back", () => { view = "grid"; render(); });
            const pick = "Choose this deck";
            btn(k, W.x + W.w - 16 - Math.max(96, measure(pick) + 32), foot, pick, () => { view = "confirm"; render(); });
        }

        // the confirm / sending / done / error window
        function dialog() {
            const top = document.createElement("div");
            top.className = "top";
            k.append(top);
            const name = `"${deck.name}"`;
            const body = {
                confirm: ["You can only pick one starter deck.", `Take ${name}?`],
                busy: ["◌ Sending your choice..."],
                // The claim also sets the deck's recipe bit (server 169c918): Edit Deck's STRUCTURE DECK list (the English
                // client's name for the Recipe button) then lists it, under the game's own product name ("SPELLCASTER'S
                // UNITY DECK" for "Dark Magicians"), so the text points at the list, not the name. A deck the 2008 limit list
                // trims loads 37-39 cards ("Cards Missing") and needs the substitutes from the trunk to reach 40.
                // ">" not "→": the glyph atlas (ui/glyphs-dejavu16.json) has no arrow.
                done: [`✓ ${name} is yours!`, "It's your active deck, ready to duel."],
                error: [`● ${msg}`],
            }[view];
            const w = Math.min(L.w - 16, 440), tw = w - 32;
            const ls = body.flatMap((l) => wrap(l, tw, 3)), h = 8 + 16 + 16 + 8 + 16 * ls.length + 16 + (view === "busy" ? 0 : 32);
            const x = Math.floor((L.w - w) / 2), y = Math.floor((L.h - h) / 2);
            windowFrame(top, x, y, w, h, 16);
            const head = view === "confirm" ? "Choose this deck?" : "Starter deck";
            text(top, [[head, x + Math.floor((w - measure(head)) / 2), y + 8]]);
            lines(top, ls, x + 16, y + 48);
            const by = y + h - 16 - 24;
            if (view === "confirm") {
                btn(top, x + 16, by, "Yes, take it", claim);
                btn(top, x + w - 16 - 96, by, "Back", back);
            } else if (view === "done") btn(top, x + Math.floor((w - 96) / 2), by, "OK", close);
            else if (view === "error") btn(top, x + Math.floor((w - 96) / 2), by, "OK", done ? close : back);
        }

        function back() {
            if (view === "confirm" || view === "error") view = "deck";
            else if (view === "deck") view = "grid";
            else return;
            render();
        }

        async function claim() {
            view = "busy"; render();
            try {
                const r = await fetch(API + "/claim", { method: "POST", credentials: "same-origin",
                    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deck.id }) });
                const j = await r.json().catch(() => ({}));
                if (r.ok && j.ok !== false) {
                    done = true; view = "done";
                    // in place, no reload: the game takes the deck now; the server's trunk push (0x7125-27) refreshes an open Edit Deck
                    // .main: the server's deck shape {id, name, main, extra}; an older server's answer just installs nothing
                    if (j.deck?.main) try { await Module.yo2InstallStarterDeck?.(j.deck); } catch (e) { console.warn("starter: install", e); }
                }
                else {
                    if (j.error === "claimed") done = true;
                    msg = j.error === "claimed" ? "This character already has its starter deck."
                        : r.status === 409 ? "Pick a character and enter the game first."   // not-in-game / no-character
                        : r.status === 401 ? "You're signed out. Sign in again, then pick your deck."
                        : "That didn't work. Try again in a moment.";
                    view = "error";
                }
            } catch (e) { msg = "No connection. Try again in a moment."; view = "error"; }
            if (open) render();
        }

        let raf = 0;
        const again = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
        const ro = new ResizeObserver(again);
        ro.observe(canvas);
        addEventListener("resize", again);
        window.visualViewport?.addEventListener("resize", again);
        function close() {
            ro.disconnect();
            cancelAnimationFrame(raf);
            removeEventListener("resize", again);
            window.visualViewport?.removeEventListener("resize", again);
            root.remove(); css.remove();
            open = null;
            if (!done) done = true;   // "Later": not again until the next page load
            canvas.focus?.();
        }
        open = { close, render };
        render();
    }

    // demos and tests: yo2Starter.show(decks) opens the picker without the server
    window.yo2Starter = { show: (decks) => open || show(decks), check, close: () => open?.close() };
})();
