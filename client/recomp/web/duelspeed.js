// --pre-js: the Duel speed control. A small button beside stage.js's full-screen one, shown only in the duel scenes
// (janken, duel, duel end, result). A click cycles 1x (2008's pacing) -> 1.5x -> 2x. The choice sets
// Module.yo2DuelSpeed, which ovr/duelspeed.c reads (it applies within half a second, mid-duel too), and is remembered
// per browser (localStorage, best effort: private windows and blocked storage just start at 1x).
if (typeof document !== "undefined") (() => {
    const SPEEDS = [1, 1.5, 2], KEY = "yo2-duel-speed", DUEL = new Set([0x1c, 0x1d, 0x1e, 0x20]);   // SceneId (ovr/scene.c)
    let speed = 1;
    try { speed = SPEEDS.includes(+localStorage.getItem(KEY)) ? +localStorage.getItem(KEY) : 1; } catch {}
    Module.yo2DuelSpeed = speed;

    const css = document.createElement("style");
    css.textContent = `
      #duelspeed { position: absolute; top: max(8px, env(safe-area-inset-top)); right: calc(max(8px, env(safe-area-inset-right)) + 40px);
                   z-index: 2; height: 32px; min-width: 44px; padding: 0 9px; border: 0; border-radius: 6px;
                   background: rgba(0,0,0,.45); color: #fff; opacity: .55; cursor: pointer; transition: opacity .15s;
                   font: 700 14.3px/32px Arial, "Liberation Sans", Arimo, Helvetica, sans-serif;   /* the 2008 client's GDI Arial (UI rule) */ }
      #duelspeed.solo { right: max(8px, env(safe-area-inset-right)); }
      #duelspeed:hover, #duelspeed:focus-visible { opacity: 1; }
      #duelspeed[hidden] { display: none; }`;
    document.head.append(css);
    const btn = document.createElement("button");
    btn.id = "duelspeed";
    btn.tabIndex = -1;   // never takes keyboard focus from the game
    btn.hidden = true;
    const label = () => {
        btn.textContent = `${speed}×`;
        btn.title = `Duel speed: ${speed}×${speed === 1 ? " (original)" : ""}. Click to change`;
        btn.setAttribute("aria-label", btn.title);
    };
    label();
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
        Module.yo2DuelSpeed = speed;
        try { localStorage.setItem(KEY, String(speed)); } catch {}
        label();
        Module.canvas?.focus();
    });
    const mount = () => {   // inside stage.js's #stage (so it stays in full screen), else over the page
        const stage = document.getElementById("stage");
        if (stage) stage.append(btn);
        else btn.style.position = "fixed", document.body.append(btn);
    };
    if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);
    Module.onYo2Scene = (kind, from, to) => {   // adds a listener (lazyfs.js)
        if (kind !== "begin") return;
        btn.hidden = !DUEL.has(to);
        btn.classList.toggle("solo", !document.getElementById("fs") || document.getElementById("fs").hidden);   // no full-screen button (iPhone)
    };
})();
