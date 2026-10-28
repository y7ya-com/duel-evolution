// stage.js: fit-to-window + fullscreen for the /recomp/ page (ship-recomp.sh injects it into yo2rc.html).
// Only the canvas's CSS size changes; its 1024x768 backbuffer never does, and SDL2 maps mouse events through the CSS
// size (targetX * w / css_w), so clicks stay exact at any scale. 4:3, letterboxed on black; crisp at integer scales.
(() => {
    const W = 1024, H = 768;
    const canvas = document.getElementById("canvas");
    const stage = document.createElement("div");
    stage.id = "stage";
    canvas.before(stage);
    stage.append(canvas);
    const btn = document.createElement("button");
    btn.id = "fs";
    btn.tabIndex = -1;   // never takes keyboard focus from the game
    btn.title = "Full screen (Alt+Enter)";
    btn.setAttribute("aria-label", "Toggle full screen");
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    stage.append(btn);
    const css = document.createElement("style");
    css.textContent = `
      #stage { position: fixed; inset: 0; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
      #stage canvas { flex: none; }
      #fs { position: absolute; top: 8px; right: 8px; z-index: 2; width: 32px; height: 32px; padding: 7px; border: 0; border-radius: 6px;
            background: rgba(0,0,0,.45); color: #fff; opacity: .35; cursor: pointer; transition: opacity .15s; }
      #fs:hover, #fs:focus-visible { opacity: 1; }
      #log { z-index: 3; }`;
    document.head.append(css);

    let last = "";
    function fit() {
        const s = Math.min(stage.clientWidth / W, stage.clientHeight / H), st = canvas.style;
        if (!(s > 0) || s + st.width + st.height === last) return;   // unchanged: no write, so no observer loop
        st.width = W * s + "px"; st.height = H * s + "px";
        st.imageRendering = Number.isInteger(s) ? "pixelated" : "auto";
        last = s + st.width + st.height;   // as the browser serialized them
    }
    // SDL sets the canvas CSS size itself (window creation, fullscreen changes): put ours back
    new MutationObserver(fit).observe(canvas, { attributes: true, attributeFilter: ["style"] });
    addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    fit();

    function toggle() {   // must run inside the click / key handler: fullscreen needs a user gesture
        if (document.fullscreenElement) document.exitFullscreen();
        else stage.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
        canvas.focus();
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); toggle(); }
    }, true);
    window.yo2Stage = { fit, toggle };
})();
