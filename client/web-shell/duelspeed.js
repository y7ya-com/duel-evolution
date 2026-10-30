// duelspeed.js: the Duel speed control (ship-client.sh injects it after starter.js). In the duel scenes (janken, duel,
// duel end, result) a small game button sits beside stage.js's full-screen one; a click cycles 1x (2008's pacing) ->
// 1.5x -> 2x. The choice sets Module.yo2DuelSpeed, which ovr/duelspeed.c reads (mid-duel too, within half a second),
// and is remembered per browser (localStorage, best effort: private windows and blocked storage start at 1x).
// The button is the game's own (the owner's rule): a real <button>, swich_01's 9-slice per state as its background
// (client/html-ui/ui.js, art under ui/), its caption real text in the 2008 client's Arial, laid out in game pixels and
// scaled with the canvas.
(() => {
    const UI = "./ui.js", ART = "ui/", KEY = "yo2-duel-speed";
    const SPEEDS = [1, 1.5, 2], DUEL = new Set([0x1c, 0x1d, 0x1e, 0x20]);   // SceneId (ovr/scene.c)
    const FONT = 'Arial, "Liberation Sans", Arimo, Helvetica, sans-serif', H = 24, W = 48;
    let speed = 1, btn = null, set = null, shown = false, loading = null;
    try { speed = SPEEDS.includes(+localStorage.getItem(KEY)) ? +localStorage.getItem(KEY) : 1; } catch {}
    Module.yo2DuelSpeed = speed;

    const title = () => `Duel speed: ${speed}×${speed === 1 ? " (original)" : ""}. Click to change`;
    function cycle() {
        speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
        Module.yo2DuelSpeed = speed;
        try { localStorage.setItem(KEY, String(speed)); } catch {}
        if (btn) btn.cap.textContent = `${speed}×`, btn.title = title(), btn.setAttribute("aria-label", btn.title);
    }
    async function make() {
        const ui = await import(UI);
        await ui.loadGlyphs(ART);
        const css = document.createElement("style");
        css.textContent = `
          #duelspeed { position: absolute; z-index: 2; top: max(8px, env(safe-area-inset-top)); width: ${W}px; height: ${H}px;
                       padding: 0; border: 0; background: none; cursor: pointer; transform-origin: top right; }
          #duelspeed[hidden] { display: none; }
          #duelspeed .sp { position: absolute; overflow: hidden; pointer-events: none; }
          #duelspeed .sp > b { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
          #duelspeed .cap { position: absolute; left: 0; top: ${(H - 16) / 2}px; width: ${W}px; text-align: center;
                            font: 14.3px/16px ${FONT}; color: #000; pointer-events: none; white-space: pre; }`;
        document.head.append(css);
        btn = document.createElement("button");
        btn.id = "duelspeed";
        btn.type = "button";
        btn.tabIndex = -1;   // never takes keyboard focus from the game
        const tiles = ui.nine(btn, ui.SHEET.button, 0, 0, 0, 0, W, H);
        set = (st) => tiles.forEach((t, i) => t.src(st * 24 + (i % 3) * 8, Math.floor(i / 3) * 8));   // 0 normal 1 hover 2 pressed
        btn.cap = Object.assign(document.createElement("span"), { className: "cap", textContent: `${speed}×` });
        btn.append(btn.cap);
        btn.title = title(), btn.setAttribute("aria-label", btn.title);
        let over = false, down = false;
        const look = () => set(down && over ? 2 : over ? 1 : 0);
        btn.addEventListener("pointerenter", () => { over = true; look(); });
        btn.addEventListener("pointerleave", () => { over = down = false; look(); });
        btn.addEventListener("pointerdown", (e) => { e.stopPropagation(); down = true; look(); });
        btn.addEventListener("pointerup", () => { down = false; look(); });
        btn.addEventListener("mousedown", (e) => e.stopPropagation());   // SDL listens on the window
        btn.addEventListener("click", (e) => { e.stopPropagation(); cycle(); Module.canvas?.focus(); });
        (document.getElementById("stage") || document.body).append(btn);
        addEventListener("resize", place);
        document.addEventListener("fullscreenchange", place);
        return btn;
    }
    function place() {   // beside the full-screen button (or in its place where there is none: iPhone), at the canvas's scale
        if (!btn) return;
        const k = (Module.canvas?.getBoundingClientRect().width || 1024) / 1024, fs = document.getElementById("fs");
        btn.style.right = fs && !fs.hidden ? "calc(max(8px, env(safe-area-inset-right)) + 40px)" : "max(8px, env(safe-area-inset-right))";
        btn.style.transform = `scale(${Math.max(1, Math.floor(k))})`;   // whole steps: a fractional scale seams the 9-slice
        btn.hidden = !shown;
    }
    // a plain assignment ADDS a listener (loader.js's collector before preRun, lazyfs's dispatcher after)
    Module.onYo2Scene = (kind, from, to) => {
        if (kind !== "begin") return;
        shown = DUEL.has(to);
        if (shown && !btn) (loading ||= make().catch((e) => console.warn("duelspeed:", e))).then(place);
        else place();
    };
})();
