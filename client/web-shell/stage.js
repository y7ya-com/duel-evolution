// stage.js: fit-to-window + fullscreen for the game page (ship-recomp.sh injects it into yo2rc.html), and phones/tablets.
// Only the canvas's CSS size changes; its 1024x768 backbuffer never does, and SDL2 maps mouse events through the CSS
// size (targetX * w / css_w), so clicks stay exact at any scale. 4:3, letterboxed on black; crisp at integer scales.
// Touch (any device): one finger is the mouse. A tap = hover there, then a left click; a drag = left button held; a
// finger held still for HOLD_MS = the RIGHT button held (the game walks with it), steered by moving. SDL never sees the
// touches (its own touch->mouse emulation drops the click), and no compatibility mouse events or zoom follow.
// Phones/tablets (coarse pointer): viewport meta, devicePixelRatio 1 (the game is 1024x768; SDL would otherwise render
// at 3x on an iPhone), the stage follows the visual viewport (keyboard, notch/safe areas), a "turn sideways" prompt in
// portrait, fullscreen + landscape lock on the first tap where the browser allows it (Android; iPad), audio contexts
// resumed on touchend (touchstart/pointerdown don't count as a gesture on mobile), and the on-screen keyboard: a tap on
// one of the game's text boxes focuses a hidden <input> whose text and keys go to the game as key events.
(() => {
    const W = 1024, H = 768, HOLD_MS = 400, SLOP = 10;
    const coarse = matchMedia("(pointer: coarse)").matches;
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
      html, body { overflow: hidden; overscroll-behavior: none; }
      #stage { position: fixed; left: 0; top: 0; width: 100%; height: 100%; box-sizing: border-box; background: #000;
               display: flex; align-items: center; justify-content: center; overflow: hidden;
               padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
               touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
               -webkit-tap-highlight-color: transparent; }
      #stage canvas { flex: none; }
      #fs { position: absolute; top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); z-index: 2;
            width: 32px; height: 32px; padding: 7px; border: 0; border-radius: 6px;
            background: rgba(0,0,0,.45); color: #fff; opacity: .35; cursor: pointer; transition: opacity .15s; }
      #fs:hover, #fs:focus-visible { opacity: 1; }
      #fs[hidden] { display: none; }
      #log { z-index: 3; }
      #kb { position: fixed; left: 0; top: 0; width: 1px; height: 1px; padding: 0; border: 0; margin: 0; opacity: 0;
            font-size: 16px; color: transparent; background: transparent; caret-color: transparent; pointer-events: none; }
      #rotate { display: none; position: fixed; inset: 0; z-index: 20; background: #000; color: #fff; flex-direction: column;
                align-items: center; justify-content: center; gap: 18px; padding: 24px; text-align: center;
                font: 600 18px/1.3 system-ui, sans-serif; touch-action: none; }
      #rotate svg { animation: yo2turn 2.4s ease-in-out infinite; }
      @keyframes yo2turn { 0%, 30% { transform: rotate(0); } 60%, 100% { transform: rotate(-90deg); } }
      @media (prefers-reduced-motion: reduce) { #rotate svg { animation: none; transform: rotate(-90deg); } }
      @media (pointer: coarse) and (orientation: portrait) { #rotate { display: flex; } }`;
    document.head.append(css);

    if (coarse) {
        // the page is the game: no zoom, edge to edge (the stage's padding keeps it out of the notch)
        const meta = (name, content) => {
            let m = document.querySelector(`meta[name="${name}"]`);
            if (!m) { m = document.createElement("meta"); m.name = name; document.head.append(m); }
            m.content = content;
        };
        meta("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
        meta("theme-color", "#000000");
        meta("mobile-web-app-capable", "yes");   // Add to Home Screen = full screen (iPhone Safari has no fullscreen API)
        meta("apple-mobile-web-app-capable", "yes");
        meta("apple-mobile-web-app-status-bar-style", "black-translucent");
        // SDL sizes the backbuffer by devicePixelRatio (ALLOW_HIGHDPI): 3072x2304 on an iPhone for a 1024x768 game
        try { Object.defineProperty(window, "devicePixelRatio", { get: () => 1, configurable: true }); } catch (e) {}
        const rot = document.createElement("div");
        rot.id = "rotate";
        rot.innerHTML = '<svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">' +
            '<rect x="14" y="4" width="20" height="40" rx="3"/><path d="M21 39h6"/></svg><div>Turn your device sideways to play.</div>';
        stage.append(rot);   // inside the stage: in fullscreen nothing outside it shows
        document.addEventListener("gesturestart", (e) => e.preventDefault());   // Safari pinch
    }

    let last = "";
    function fit() {
        const vv = window.visualViewport, st = stage.style;
        if (vv && coarse) {   // the visible part: smaller while the on-screen keyboard is up
            st.left = vv.offsetLeft + "px"; st.top = vv.offsetTop + "px";
            st.width = vv.width + "px"; st.height = vv.height + "px";
        }
        const cs = getComputedStyle(stage);
        const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const s = Math.min(aw / W, ah / H), cst = canvas.style;
        if (!(s > 0) || s + cst.width + cst.height === last) return;   // unchanged: no write, so no observer loop
        cst.width = W * s + "px"; cst.height = H * s + "px";
        cst.imageRendering = Number.isInteger(s) ? "pixelated" : "auto";
        last = s + cst.width + cst.height;   // as the browser serialized them
    }
    // SDL sets the canvas CSS size itself (window creation, fullscreen changes): put ours back
    new MutationObserver(fit).observe(canvas, { attributes: true, attributeFilter: ["style"] });
    addEventListener("resize", fit);
    addEventListener("orientationchange", () => setTimeout(fit, 300));
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    document.addEventListener("fullscreenchange", fit);
    document.addEventListener("webkitfullscreenchange", fit);
    fit();

    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    const canFs = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!canFs) btn.hidden = true;   // iPhone Safari: elements can't go full screen
    function enterFs() {
        const p = stage.requestFullscreen ? stage.requestFullscreen({ navigationUI: "hide" }) : stage.webkitRequestFullscreen?.();
        Promise.resolve(p).then(() => coarse && screen.orientation?.lock?.("landscape")).catch(() => {});
    }
    function toggle() {   // must run inside the click / key handler: fullscreen needs a user gesture
        if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else enterFs();
        canvas.focus();
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); toggle(); }
    }, true);

    // ---- audio: every AudioContext the runtime makes, resumed on a real gesture (iOS also suspends on interruptions)
    const contexts = [];
    if (window.AudioContext) {
        const Real = window.AudioContext;
        window.AudioContext = class extends Real { constructor(...a) { super(...a); contexts.push(this); } };
    }
    const wake = () => { for (const c of contexts) if (c.state !== "running" && c.state !== "closed") c.resume().catch(() => {}); };
    for (const t of ["touchend", "pointerup", "keydown", "click"]) addEventListener(t, wake, true);

    // ---- the game's text boxes, read from guest memory (guest address == wasm address). The window manager at
    // [0x126fa8c] keeps its controls in a vector at +4..+8 (FUN_005e2d80, the focus lookup); a control's +0x351 is 1 while
    // it has the focus. CWindowTaskInput (and InputDuel, its subclass): world position +0xc8/+0xcc, size +0x3d0/+0x3d4.
    const INPUT_VT = [0xbe812c, 0xbf20fc];
    function textBoxes() {
        if (typeof HEAPU32 === "undefined" || !HEAPU32.length) return [];
        const U = HEAPU32, F = new Float32Array(U.buffer), mgr = U[0x126fa8c >>> 2];
        if (!mgr) return [];
        const a = U[(mgr + 4) >>> 2], b = U[(mgr + 8) >>> 2], out = [];
        if (b < a || b - a > 65536) return [];
        for (let p = a; p < b; p += 4) {
            const c = U[p >>> 2];
            if (!c || !INPUT_VT.includes(U[c >>> 2])) continue;
            out.push({ x: F[(c + 0xc8) >>> 2], y: F[(c + 0xcc) >>> 2], w: F[(c + 0x3d0) >>> 2], h: F[(c + 0x3d4) >>> 2],
                       focus: HEAPU8[c + 0x351] === 1, hidden: (U[(c + 0x20) >>> 2] & 1) !== 0 });
        }
        return out;
    }
    const onBox = (gx, gy) => textBoxes().some((t) => !t.hidden && gx >= t.x && gx < t.x + t.w && gy >= t.y && gy < t.y + t.h);
    const anyFocus = () => textBoxes().some((t) => t.focus && !t.hidden);

    // ---- keys to the game: SDL listens on window; KeyboardEvent init's keyCode/charCode are legacy, so set them again
    function key(type, k, code, keyCode, charCode = 0) {
        const e = new KeyboardEvent(type, { key: k, code, keyCode, charCode, which: keyCode || charCode, bubbles: true, cancelable: true });
        for (const [n, v] of [["keyCode", keyCode], ["charCode", charCode], ["which", keyCode || charCode]])
            if (e[n] !== v) Object.defineProperty(e, n, { value: v });
        window.dispatchEvent(e);
    }
    const NAMED = { Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46, Home: 36, End: 35 };
    const press = (k) => { key("keydown", k, k, NAMED[k]); key("keyup", k, k, NAMED[k]); };
    const char = (c) => {
        const up = c.toUpperCase(), code = /^[a-z]$/i.test(c) ? "Key" + up : /^[0-9]$/.test(c) ? "Digit" + c : "";
        key("keypress", c, code, 0, c.codePointAt(0));
    };

    // the hidden input: always holds a sentinel, so a Backspace on an "empty" box still arrives; what changed against
    // the previous value (deleted tail, inserted text) goes to the game, IME compositions included
    const SENT = "__";
    const kb = document.createElement("input");
    kb.id = "kb";
    kb.type = "text";
    kb.tabIndex = -1;
    kb.autocomplete = "off";
    kb.spellcheck = false;
    for (const [k, v] of [["autocorrect", "off"], ["autocapitalize", "none"], ["enterkeyhint", "done"], ["aria-label", "Text for the game"]]) kb.setAttribute(k, v);
    kb.value = SENT;
    let prev = SENT, composing = false;
    if (coarse) stage.append(kb);   // inside the stage, or fullscreen makes it unfocusable
    kb.addEventListener("keydown", (e) => {
        e.stopPropagation();   // the game gets the text from "input" below, and these keys from us, never twice
        if (e.isComposing || e.keyCode === 229) return;
        if (NAMED[e.key] && e.key !== "Backspace") { e.preventDefault(); press(e.key); }
    });
    for (const t of ["keyup", "keypress"]) kb.addEventListener(t, (e) => e.stopPropagation());
    kb.addEventListener("compositionstart", () => { composing = true; });
    kb.addEventListener("compositionend", () => { composing = false; sync(); });
    kb.addEventListener("input", () => sync());
    function sync() {
        const now = kb.value;
        let i = 0;
        while (i < prev.length && i < now.length && prev[i] === now[i]) i++;
        for (let n = prev.length - i; n > 0; n--) press("Backspace");
        for (const c of now.slice(i)) char(c);
        prev = now;
        if (!composing && now !== SENT) { kb.value = prev = SENT; kb.setSelectionRange(SENT.length, SENT.length); }
    }
    function keyboard(on) {
        if (on && document.activeElement !== kb) { kb.value = prev = SENT; kb.focus({ preventScroll: true }); }
        if (!on && document.activeElement === kb) kb.blur();
    }
    // the keyboard goes away once the game's box loses the focus (Enter, the dialog closing)
    if (coarse) setInterval(() => { if (document.activeElement === kb && !anyFocus()) keyboard(false); }, 250);

    // ---- touch -> mouse
    const toGame = (x, y) => {
        const b = canvas.getBoundingClientRect();
        return [(x - b.left) * W / b.width, (y - b.top) * H / b.height];
    };
    function mouse(type, x, y, button, buttons) {
        canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y,
                                                     screenX: x, screenY: y, button, buttons }));
    }
    let id = null, sx = 0, sy = 0, lx = 0, ly = 0, mode = 0, timer = 0, entered = false, firstTap = true;   // mode: 0 not yet, 1 left drag, 2 right held
    const mine = (e) => !e.target.closest?.("button, a, input, #rotate");   // the page's own controls keep their touches
    stage.addEventListener("touchstart", (e) => {
        if (!mine(e)) return;
        e.preventDefault(); e.stopPropagation();
        if (id !== null) return;   // one finger is the mouse; a second only stops the pinch
        const t = e.changedTouches[0];
        id = t.identifier; sx = lx = t.clientX; sy = ly = t.clientY; mode = 0;
        if (!entered) { entered = true; mouse("mouseenter", sx, sy, 0, 0); mouse("mouseover", sx, sy, 0, 0); }
        mouse("mousemove", sx, sy, 0, 0);   // hover first: the game's buttons take only a press they were hovered for
        timer = setTimeout(() => { if (mode === 0) { mode = 2; mouse("mousedown", lx, ly, 2, 2); } }, HOLD_MS);
    }, { capture: true, passive: false });
    stage.addEventListener("touchmove", (e) => {
        if (!mine(e)) return;
        e.preventDefault(); e.stopPropagation();
        const t = [...e.changedTouches].find((t) => t.identifier === id);
        if (!t) return;
        lx = t.clientX; ly = t.clientY;
        if (mode === 0 && Math.hypot(lx - sx, ly - sy) > SLOP) { mode = 1; clearTimeout(timer); mouse("mousedown", sx, sy, 0, 1); }
        mouse("mousemove", lx, ly, 0, mode === 1 ? 1 : mode === 2 ? 2 : 0);
    }, { capture: true, passive: false });
    function end(e) {
        if (!mine(e)) return;
        e.preventDefault(); e.stopPropagation();
        const t = [...e.changedTouches].find((t) => t.identifier === id);
        if (!t) return;
        clearTimeout(timer);
        id = null;
        if (mode === 2) { mouse("mouseup", lx, ly, 2, 0); return; }
        if (mode === 1) { mouse("mouseup", lx, ly, 0, 0); return; }
        if (e.type === "touchcancel") return;
        // a tap: the press now, the release a couple of frames later (a real click is never shorter)
        mouse("mousedown", sx, sy, 0, 1);
        setTimeout(() => mouse("mouseup", sx, sy, 0, 0), 60);
        if (coarse) {
            keyboard(onBox(...toGame(sx, sy)));   // inside this touchend: iOS shows the keyboard only for a focus() here
            if (firstTap && canFs && !fsEl()) enterFs();
        }
        firstTap = false;
    }
    stage.addEventListener("touchend", end, { capture: true, passive: false });
    stage.addEventListener("touchcancel", end, { capture: true, passive: false });

    window.yo2Stage = { fit, toggle, textBoxes };
})();
