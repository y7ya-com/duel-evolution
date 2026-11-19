// --pre-js for the web build: the Settings page, opened by the Main Menu's Settings entry (ovr/audiomenu.c ->
// Module.rcSettingsUI.open()). One setting so far, the card pictures: HD (card.dat, tools/cardart.py) or the 2008
// client's own. The choice is localStorage yo2-card-pictures ("original" or "hd"), which web/lazyfs.js reads at boot
// (the exe reads its card lists then), so a change asks to load the game again. Drawn as the Audio page is (its
// colours: Module.rcLobbySkin, web/audiopage.js), in game pixels, scaled with the canvas.
if (typeof document !== "undefined") (() => {
    const KEY = "yo2-card-pictures";
    const CHOICES = [
        ["hd", "HD", "Sharp pictures of every card"],
        ["original", "Original (2008)", "The pictures the game first came with. Cards added since keep their HD picture."],
    ];
    const L = () => Module.yo2Lazy || {};
    const chosen = () => { try { return localStorage.getItem(KEY) || "hd"; } catch { return "hd"; } };
    const choose = (v) => { try { localStorage.setItem(KEY, v); } catch {} };
    let panel = null;

    const h = (tag, props = {}, ...kids) => {
        const e = Object.assign(document.createElement(tag), props);
        for (const k of kids) if (k != null && k !== false) e.append(k);
        return e;
    };
    function css() {
        const { FONT, PLATE, plate, MBTN, mbtn, OUTLINE, TITLE, BEVEL } = Module.rcLobbySkin;
        return `
    #rc-settings { position: fixed; z-index: 10; display: flex; align-items: center; justify-content: center; overflow: hidden;
      font: 14.32px/16px ${FONT}; letter-spacing: 1px; color: #000; -webkit-user-select: none; user-select: none; }
    #rc-settings .win { position: relative; flex: none; display: flex; flex-direction: column; width: 440px; }
    #rc-settings .bar { position: relative; height: 22px; color: #fff; ${OUTLINE}; font: 14.32px/20px ${FONT}; letter-spacing: 1px;
      text-align: center; white-space: nowrap; background: ${TITLE}; }
    #rc-settings .x { position: absolute; top: 4px; right: 4px; width: 16px; height: 13px; box-sizing: border-box; margin: 0; padding: 0;
      border: 0; border-left: 1px solid #fff; cursor: pointer;
      background: linear-gradient(to right, transparent calc(100% - 2.5px), #f5cf00 calc(100% - 1.5px), #f7dc80 calc(100% - 0.5px)),
        linear-gradient(to bottom, #fffec2 0.5px, #fffd63 1.5px, #fffc00 3px, #fffc00 calc(100% - 2.5px), #f1bb00 calc(100% - 1.5px), #f5cf80 calc(100% - 0.5px)); }
    #rc-settings .x::before, #rc-settings .x::after { content: ""; position: absolute; left: 1px; top: 5.5px; width: 12px; height: 2px; background: #005fea; border-radius: 1px; }
    #rc-settings .x::before { transform: rotate(42deg); }
    #rc-settings .x::after { transform: rotate(-42deg); }
    #rc-settings .x:hover { filter: brightness(1.08); }
    #rc-settings .pnl { position: relative; isolation: isolate; display: grid; gap: 10px; padding: 10px 12px 12px; }
    #rc-settings .pnl::before { content: ""; position: absolute; inset: 0; z-index: -1; opacity: ${(178 / 255).toFixed(3)}; background: #84f4ff; box-shadow: ${BEVEL}; }
    #rc-settings .plane { position: relative; isolation: isolate; display: grid; gap: 6px; padding: 8px 10px 10px; }
    #rc-settings .plane::before { content: ""; position: absolute; inset: 0; z-index: -1; background: #fff; opacity: .9; }
    #rc-settings .head { height: 22px; margin: -8px -10px 2px; padding: 0 8px; color: #fff; ${OUTLINE}; font: 14.32px/22px ${FONT}; background: ${TITLE}; }
    #rc-settings .opt { display: grid; grid-template-columns: 13px 1fr; gap: 2px 8px; align-items: center; padding: 5px 8px; cursor: pointer; outline: 1px solid #59c6ff; }
    #rc-settings .opt:hover { background: #e6f7ff; }
    #rc-settings .opt.on { outline: 2px solid #ffa92e; outline-offset: -1px; background: #fffee0; }
    #rc-settings .opt.off { cursor: default; color: #8c8c8c; }
    #rc-settings .opt input { -webkit-appearance: none; appearance: none; width: 13px; height: 13px; margin: 0; border-radius: 50%; background: #fff;
      border: 1px solid #336deb; box-shadow: inset 1px 1px #b6c9e8; display: grid; place-content: center; cursor: inherit; }
    #rc-settings .opt input:checked::after { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #005fea; }
    #rc-settings .opt b { font-weight: bold; }
    #rc-settings .opt span { grid-column: 2; color: #1d4a74; font-size: 12.53px; line-height: 15px; letter-spacing: .5px; }
    #rc-settings .note { display: flex; align-items: center; gap: 10px; padding-top: 2px; color: #1d4a74; font-size: 12.53px; line-height: 15px; letter-spacing: .5px; }
    #rc-settings .note > span { flex: 1; }
    #rc-settings .row { display: flex; align-items: center; justify-content: flex-end; }
    #rc-settings button { font: inherit; letter-spacing: inherit; cursor: pointer; }
    #rc-settings .btn { height: 24px; min-width: 72px; padding: 0 10px; box-sizing: border-box; border: 1px solid; color: #000; white-space: nowrap; ${plate(PLATE[0])} }
    #rc-settings .btn:hover { ${plate(PLATE[1])} }
    #rc-settings .btn:active { ${plate(PLATE[2])} }
    #rc-settings .mbtn { flex: none; height: 26px; min-width: 120px; padding: 0 16px; box-sizing: border-box; border: 1px solid; border-radius: 3px;
      color: #fff; ${OUTLINE}; white-space: nowrap; ${mbtn(MBTN[0])} }
    #rc-settings .mbtn:hover { ${mbtn(MBTN[1])} }
    #rc-settings .mbtn:active { ${mbtn(MBTN[2])} }
    #rc-settings :is(button, input):focus-visible { outline: 1px dotted #000; outline-offset: -4px; }`;
    }

    function cards() {
        const now = L().cardPictures || "hd", can = !!L().cardPicturesSwitch, pick = can ? chosen() : now;
        const rows = CHOICES.map(([v, name, desc]) => h("label", { className: "opt" + (v === pick ? " on" : "") + (can ? "" : " off") },
            h("input", { type: "radio", name: "rc-card-pictures", value: v, checked: v === pick, disabled: !can,
                onchange: () => { choose(v); render(); } }),
            h("b", { textContent: name }), h("span", { textContent: desc })));
        const note = !can ? h("div", { className: "note" }, h("span", { textContent: "The card pictures can't be changed on this page." }))
            : pick !== now ? h("div", { className: "note" },
                h("span", { textContent: "The game loads again to change the pictures: you start again from the title screen." }),
                h("button", { className: "mbtn", type: "button", textContent: "Reload now", onclick: () => location.reload() }))
            : null;
        return h("div", { className: "plane", role: "radiogroup", ariaLabel: "Card pictures" }, h("div", { className: "head", textContent: "Card pictures" }), ...rows, note);
    }
    function render() {
        if (!panel) return;
        const focused = document.activeElement?.value;
        panel.querySelector(".body").replaceChildren(cards());
        panel.querySelector(`.body input[value="${focused}"]`)?.focus();
    }

    // over the canvas, at its scale (stage.js letterboxes it to the window)
    function place() {
        if (!panel) return;
        const r = (Module.canvas || document.body).getBoundingClientRect(), k = r.width / 1024 || 1;
        Object.assign(panel.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
        panel.firstChild.style.transform = `scale(${k})`;
    }
    function open() {
        if (panel || !Module.rcLobbySkin) return;
        if (!document.getElementById("rc-settings-css")) document.head.append(h("style", { id: "rc-settings-css", textContent: css() }));
        panel = h("div", { id: "rc-settings", role: "dialog", ariaModal: "true", ariaLabel: "Settings" },
            h("div", { className: "win" },
                h("div", { className: "bar" }, h("span", { textContent: "Settings" }),
                    h("button", { className: "x", type: "button", ariaLabel: "Close", onclick: close })),
                h("div", { className: "pnl" }, h("div", { className: "body" }),
                    h("div", { className: "row" }, h("button", { className: "btn", type: "button", textContent: "OK", onclick: close })))));
        // the game reads keys from the window: keep them here while the page is open
        for (const t of ["keydown", "keyup", "keypress"])
            panel.addEventListener(t, (e) => { e.stopPropagation(); if (t === "keydown" && e.key === "Escape") close(); });
        document.body.append(panel);
        addEventListener("resize", place);
        document.addEventListener("fullscreenchange", place);
        place();
        render();
        panel.querySelector(".row .btn").focus();
    }
    function close() {
        removeEventListener("resize", place);
        document.removeEventListener("fullscreenchange", place);
        panel?.remove();
        panel = null;
        Module.canvas?.focus();
    }
    Module.rcSettingsUI = { open, close };
})();
