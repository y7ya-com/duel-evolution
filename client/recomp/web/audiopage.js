// --pre-js for the web build: the Audio settings page, opened by the Main Menu's Audio entry (rt/audioui.c ->
// Module.rcAudioUI.open()). UI only: decoding, storage (the player's files stay in their browser's IndexedDB, never
// uploaded) and playback are Module.yo2Audio's (web/audio.js). The game ships no background audio: every slot is
// silent until the player adds files. Slots are bgm.txt's 46 contexts (recomp/audio-slots.md), grouped and named here.
// Drawn like the game's own windows (DUEL OPTIONS, D-Mail, My Profile), in game pixels, scaled with the canvas.
if (typeof document !== "undefined") (() => {
    // [title, slots or sub-groups, open by default, note]; a sub-group is [title, slots, open, note]
    const GROUPS = [
        ["Title & login", [0, 3, 29]],
        ["My Room", [4]],
        ["Lobby areas", [5, 6, 7, 8, 9]],
        ["Shop & packs", [2]],
        ["Deck editor", [1]],
        ["Duel", [10, ["Main duel", [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], true], 24, 25,
                  ["Summon jingles", [21, 22, 23], true, "Short jingles; an empty one changes nothing"],
                  ["Field spells", [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45], false,
                   "While a field spell is active; an empty one keeps the duel audio"]]],
        ["Results", [28, 27, 26]],
    ];
    const NAMES = {
        0: ["Title screen", "The title screen"], 3: ["Login & notices", "Logging in and the notice pages"],
        29: ["Updater", "While the game checks for updates"], 4: ["My Room", "Your room and its menus"],
        5: ["Yugi area", "The Yugi area map and its shops"], 6: ["GX area", "The Duel Academy map and its shops"],
        7: ["Event lobby", "Event lobbies"], 8: ["Tournament lobby", "Tournament lobbies and brackets"],
        9: ["Event", "Events"], 2: ["Card packs", "Opening card packs"],
        1: ["Deck editor", "Editing decks, trades and gifts"], 10: ["Rock-paper-scissors", "Deciding who goes first"],
        11: ["Duel 1", ""], 12: ["Duel 2", ""], 13: ["Duel 3", ""], 14: ["Duel 4", ""], 15: ["Duel 5", ""],
        16: ["Duel 6", ""], 17: ["Duel 7", ""], 18: ["Duel 8", ""], 19: ["Tournament duel 1", "Tournament and event duels"],
        20: ["Tournament duel 2", "Tournament and event duels"],
        24: ["Winning", "When you lead by 3000 LP or more; empty keeps the duel audio"],
        25: ["Pinch", "When you trail by 3000 LP or more; empty keeps the duel audio"],
        21: ["Ritual summon", "A short jingle"], 22: ["Summon 1", "A short jingle"], 23: ["Summon 2", "A short jingle"],
        30: ["Yami", ""], 31: ["Umi", ""], 32: ["Mountain", ""], 33: ["Sogen", ""], 34: ["Forest", ""], 35: ["Wasteland", ""],
        36: ["Fusion Gate", ""], 37: ["Gaia Power", ""], 38: ["Umiiruka", ""], 39: ["Luminous Spark", ""], 40: ["Dark Zone", ""],
        41: ["Desert Storm", ""], 42: ["Burning Blood", ""], 43: ["Hymn of Light", ""], 44: ["Skyscraper", ""],
        45: ["Other field spells", "Any field spell not listed"],
        28: ["Win", "After a duel you won"], 27: ["Lose", "After a duel you lost"], 26: ["Draw", "After a drawn duel"],
    };
    const ACCEPT = "audio/*,.mp3,.m4a,.aac,.wav,.flac,.aiff,.aif,.ogg,.opus";
    const slotsOf = (items) => items.flatMap((x) => (Array.isArray(x) ? slotsOf(x[1]) : [x]));
    const ALL = slotsOf(GROUPS.map((g) => [g[0], g[1]]));

    let panel, state = {}, playing = -1, previewing = -1, note = "";
    const open_ = new Map();   // group title -> open (kept while the page lives)
    const isOpen = (title, dflt) => (open_.has(title) ? open_.get(title) : dflt);

    const A = () => Module.yo2Audio;
    async function refresh() {
        state = {};
        for (const s of await A().listSlots()) state[s.slot] = s;
        playing = A().current ? A().current() : -1;
    }
    async function run(job) {
        note = "";
        try { await job(); } catch (e) { note = String(e && e.message || e); }
        await refresh();
        render();
    }
    const setSlot = (n, cfg) => A().set(state[n].id, cfg);
    const addTo = (ns, list) => run(async () => { for (const n of ns) await setSlot(n, { files: [...state[n].files, ...list] }); });
    const replaceIn = (ns, list) => run(async () => { for (const n of ns) await setSlot(n, { files: [...list] }); });
    const clearIn = (ns) => run(async () => { for (const n of ns) await setSlot(n, { files: [] }); });
    const removeFile = (n, f) => run(() => setSlot(n, { files: state[n].files.filter((x) => x !== f) }));
    const setCfg = (n, k, v) => run(() => setSlot(n, { [k]: v }));
    function preview(n) {
        if (previewing >= 0) A().preview(state[previewing].id, false);
        previewing = previewing === n ? -1 : n;
        if (previewing >= 0) A().preview(state[n].id, true);
        render();
    }

    const css = `
    #rc-audio { position: fixed; z-index: 10; display: flex; align-items: center; justify-content: center; overflow: hidden;
      font: 13px/1.3 Arial, Helvetica, sans-serif; color: #fff; }
    #rc-audio .win { width: 660px; max-height: 712px; display: flex; flex-direction: column; flex: none;
      border: 2px solid #c9c9d3; border-radius: 3px; box-shadow: 0 0 0 1px #4a4a62, 0 6px 18px #0009;
      background: rgba(58, 62, 96, .94) repeating-linear-gradient(45deg, #ffffff06 0 1px, transparent 1px 3px); }
    #rc-audio .bar { height: 22px; line-height: 22px; text-align: center; border-top: 1px solid #646363;
      background: linear-gradient(#f4f4f7, #dcdce2 45%, #b2b2c4 55%, #8e8ea6); border-bottom: 2px solid #5c5c84;
      font-size: 14px; letter-spacing: .5px; text-shadow: 1px 1px 0 #333, 0 0 3px #000; }
    #rc-audio .body { overflow: auto; padding: 8px 12px 10px; display: grid; gap: 6px; }
    #rc-audio .note { background: linear-gradient(#5e93cd, #79b4ef); border: 1px solid #4f7bab; padding: 6px 8px; text-shadow: 1px 1px 0 #2a4f80; }
    #rc-audio .err { color: #ffd0d0; font-weight: bold; }
    #rc-audio .group { border-top: 1px solid #3b4166; box-shadow: inset 0 1px 0 #ffffff1c; padding-top: 4px; }
    #rc-audio .ghead { display: flex; align-items: center; gap: 6px; min-height: 24px; }
    #rc-audio .tog { all: unset; cursor: pointer; flex: 1; white-space: nowrap; display: flex; align-items: baseline; gap: 8px; }
    #rc-audio .tog::before { content: "▶"; font-size: 10px; color: #35d53b; width: 10px; text-shadow: 1px 1px 0 #000; }
    #rc-audio .tog[aria-expanded=true]::before { content: "▼"; }
    #rc-audio .label { color: #35d53b; font-weight: bold; font-size: 14px; text-shadow: 1px 1px 0 #000, 0 0 2px #000; }
    #rc-audio .sub .label { font-size: 13px; }
    #rc-audio .count { color: #e6e8f4; font-size: 12px; text-shadow: 1px 1px 0 #000; }
    #rc-audio .hint { color: #e6e8f4; font-size: 12px; padding-left: 16px; text-shadow: 1px 1px 0 #000; }
    #rc-audio .gbody { display: grid; gap: 6px; padding: 4px 0 4px 16px; }
    #rc-audio .slot { display: grid; gap: 4px; padding: 4px 6px; background: #0000001f; border: 1px solid #ffffff14; }
    #rc-audio .slot.now { border-color: #ff2a96; box-shadow: 0 0 6px #ff2a9680; }
    #rc-audio .name { font-weight: bold; text-shadow: 1px 1px 0 #000; }
    #rc-audio .desc { color: #e6e8f4; font-size: 12px; margin-left: 8px; text-shadow: 1px 1px 0 #000; }
    #rc-audio .live { color: #ff6ab8; font-size: 12px; margin-left: 8px; font-weight: bold; text-shadow: 1px 1px 0 #000; }
    #rc-audio .list { background: #fff; color: #000; border: 1px solid #2b2f4a; }
    #rc-audio .list > div { display: flex; align-items: center; height: 20px; padding: 0 4px 0 6px; border-bottom: 1px solid #3c3f55; }
    #rc-audio .list > div:last-child { border-bottom: 0; }
    #rc-audio .list span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #rc-audio .list .none { color: #777; }
    #rc-audio .ctl { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    #rc-audio button { font: inherit; cursor: pointer; }
    #rc-audio button:disabled { opacity: .5; cursor: default; }
    #rc-audio .cbtn { background: #f4f1e8; color: #000; border: 1px solid #1f2a4a; border-radius: 1px; padding: 1px 8px;
      height: 22px; letter-spacing: .5px; box-shadow: inset -1px -1px 0 #b8b2a2, inset 1px 1px 0 #fff; }
    #rc-audio .cbtn:not(:disabled):hover { background: #fffdf6; }
    #rc-audio .rm { all: unset; cursor: pointer; padding: 0 5px; color: #24306a; font-weight: bold; }
    #rc-audio .opt { border: 0; height: 22px; min-width: 76px; padding: 0 12px; color: #fff; text-shadow: 1px 1px 0 #222, 0 0 3px #000, 0 0 3px #000;
      background: radial-gradient(ellipse 50% 60% at center, #ffffff 0, #d6d6d6 60%, #d6d6d600 100%); }
    #rc-audio .opt.on { background: radial-gradient(ellipse 50% 60% at center, #ff2a96 0, #cf026c 60%, #cf026c00 100%); }
    #rc-audio .vol { display: inline-flex; align-items: center; gap: 4px; text-shadow: 1px 1px 0 #000; }
    #rc-audio input[type=range] { -webkit-appearance: none; appearance: none; width: 92px; height: 16px; background: none; margin: 0; }
    #rc-audio input[type=range]::-webkit-slider-runnable-track { height: 6px; background: #1d2038; border: 1px solid #8d8da4;
      box-shadow: inset 1px 1px 0 #000; }
    #rc-audio input[type=range]::-moz-range-track { height: 6px; background: #1d2038; border: 1px solid #8d8da4; }
    #rc-audio input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 16px; margin-top: -6px;
      border: 1px solid #2b2b2b; border-radius: 2px; background: linear-gradient(#f3f3f3, #c4c4c4); box-shadow: inset 1px 1px 0 #fff; }
    #rc-audio input[type=range]::-moz-range-thumb { width: 10px; height: 16px; border: 1px solid #2b2b2b; border-radius: 2px;
      background: linear-gradient(#f3f3f3, #c4c4c4); }
    #rc-audio .foot { display: flex; justify-content: center; padding: 5px; background: #9a98b0; border-top: 2px solid #5c5c84; }
    #rc-audio .ok { min-width: 132px; height: 24px; color: #000; border: 1px solid #2b2b2b; border-radius: 4px;
      background: linear-gradient(#f3f3f3, #d7d7d7 50%, #c4c4c4); box-shadow: inset 1px 1px 0 #fff; }
    #rc-audio .ok:hover { background: linear-gradient(#fff, #e2e2e2 50%, #cfcfcf); }
    #rc-audio button:focus-visible, #rc-audio input:focus-visible { outline: 2px solid #ffe14d; outline-offset: 1px; }`;

    const h = (tag, props = {}, ...kids) => {
        const e = Object.assign(document.createElement(tag), props);
        for (const k of kids) if (k != null) e.append(k);
        return e;
    };
    const pick = (multiple, then) => {
        const i = h("input", { type: "file", accept: ACCEPT, multiple });
        i.onchange = () => i.files.length && then([...i.files]);
        i.click();
    };
    const cbtn = (text, onclick, disabled = false) => h("button", { className: "cbtn", textContent: text, onclick, disabled });
    const option = (text, on, onclick) => h("button", { className: "opt" + (on ? " on" : ""), textContent: text, ariaPressed: String(on), onclick });
    const volume = (value, onchange, label) =>
        h("label", { className: "vol" }, label, h("input", { type: "range", min: 0, max: 100, value: Math.round(value * 100),
            onchange: (e) => onchange(e.target.value / 100), ariaLabel: label }));

    function slotRow(n) {
        const s = state[n];
        if (!s) return null;
        const [name, desc] = NAMES[n] || ["Audio", ""], files = s.files || [];
        return h("div", { className: "slot" + (playing === n ? " now" : "") },
            h("div", {}, h("span", { className: "name", textContent: name }), desc && h("span", { className: "desc", textContent: desc }),
                playing === n ? h("span", { className: "live", textContent: "Playing now" }) : null),
            h("div", { className: "list" }, ...(files.length ? files.map((f) =>
                h("div", {}, h("span", { textContent: f.name }),
                    h("button", { className: "rm", textContent: "×", title: "Remove", ariaLabel: `Remove ${f.name}`, onclick: () => removeFile(n, f) })))
                : [h("div", {}, h("span", { className: "none", textContent: "Silent" }))])),
            h("div", { className: "ctl" },
                cbtn("Add file…", () => pick(true, (l) => addTo([n], l))),
                cbtn(previewing === n ? "■ Stop" : "▶ Preview", () => preview(n), !files.length),
                volume(s.volume ?? 1, (v) => setCfg(n, "volume", v), "Volume"),
                option("Shuffle", !!s.shuffle, () => setCfg(n, "shuffle", !s.shuffle)),
                option("Loop", s.loop !== false, () => setCfg(n, "loop", s.loop === false)),
                cbtn("Clear", () => clearIn([n]), !files.length)));
    }

    function group([title, items, dflt = false, hint], sub) {
        const ns = slotsOf(items), set = ns.filter((n) => state[n]?.files?.length).length, open = isOpen(title, dflt);
        return h("div", { className: "group" + (sub ? " sub" : "") },
            h("div", { className: "ghead" },
                h("button", { className: "tog", ariaExpanded: String(open), onclick: () => { open_.set(title, !open); render(); } },
                    h("span", { className: "label", textContent: title }),
                    h("span", { className: "count", textContent: set ? `${set} of ${ns.length} set` : "Silent" })),
                cbtn("Set for the whole group…", () => pick(true, (l) => replaceIn(ns, l))),
                cbtn("Clear", () => clearIn(ns), !set)),
            hint ? h("div", { className: "hint", textContent: hint }) : null,
            open ? h("div", { className: "gbody" }, ...items.map((x) => (Array.isArray(x) ? group(x, true) : slotRow(x)))) : null);
    }

    function render() {
        if (!panel) return;
        const body = panel.querySelector(".body"), top = body.scrollTop;
        body.replaceChildren(
            h("div", { className: "note" }, "Add your own audio files for each part of the game. They stay on this device " +
                "(stored by your browser) and are never uploaded. Everything is silent until you add something; sound " +
                "effects are not affected.", note ? h("div", { className: "err", textContent: note }) : null),
            h("div", { className: "ctl" },
                volume(A().master(), (v) => A().master(v), "Master volume"),
                cbtn("Use one file everywhere…", () => pick(false, (l) => replaceIn(ALL, l))),
                cbtn("Clear everything", () => clearIn(ALL))),
            ...GROUPS.map((g) => group(g, false)));
        body.scrollTop = top;
    }

    // over the canvas, at its scale (stage.js letterboxes it to the window)
    function place() {
        if (!panel) return;
        const r = (Module.canvas || document.body).getBoundingClientRect(), k = r.width / 1024 || 1;
        Object.assign(panel.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
        panel.firstChild.style.transform = `scale(${k})`;
    }
    const onSlot = () => { if (!panel || !A().current) return; playing = A().current(); render(); };

    async function open() {
        if (panel || !A()) return;
        document.head.append(h("style", { id: "rc-audio-css", textContent: css }));
        panel = h("div", { id: "rc-audio", role: "dialog", ariaModal: "true", ariaLabel: "Audio" },
            h("div", { className: "win" },
                h("div", { className: "bar", textContent: "Audio" }),
                h("div", { className: "body" }),
                h("div", { className: "foot" }, h("button", { className: "ok", textContent: "OK", onclick: close }))));
        // the game reads keys from the window: keep them here while the page is open
        for (const t of ["keydown", "keyup", "keypress"])
            panel.addEventListener(t, (e) => { e.stopPropagation(); if (t === "keydown" && e.key === "Escape") close(); });
        document.body.append(panel);
        addEventListener("resize", place);
        document.addEventListener("fullscreenchange", place);
        addEventListener("yo2audioslot", onSlot);
        place();
        panel.querySelector(".ok").focus();
        await A().ready;
        await refresh();
        render();
    }
    function close() {
        if (previewing >= 0) preview(previewing);
        removeEventListener("resize", place);
        document.removeEventListener("fullscreenchange", place);
        removeEventListener("yo2audioslot", onSlot);
        panel?.remove();
        document.getElementById("rc-audio-css")?.remove();
        panel = null;
        Module.canvas?.focus();
    }
    Module.rcAudioUI = { open, close };
})();
