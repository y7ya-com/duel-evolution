// --pre-js for the web build: the Audio page, opened by the Main Menu's Audio entry (rt/audioui.c ->
// Module.rcAudioUI.open()) or by dropping an audio pack anywhere on the game. UI only: decoding, storage (the
// player's files stay in their browser's IndexedDB, never uploaded) and playback are Module.yo2Audio's (web/audio.js);
// packs are Module.yo2AudioPack's (web/audiopack.js). The game ships no background audio.
// Three views: the start (drop an audio pack: all most players need, plus the volume and removing it), a pack's
// review (what it covers; nothing changes until "Use this pack") and Create audio pack (for pack authors: every part
// of the game, files dropped or added per part, then saved as one .zip). Slots are bgm.txt's 46 contexts
// (recomp/audio-slots.md), grouped and named here. Drawn as the game's own lobby windows (htmlui/controls/skin.js's
// sampled colours: the blue title bar, the translucent bevelled panel, the cream plate and yellow menu buttons, black
// Arial spaced like the game's glyph cells), in game pixels, scaled with the canvas.
if (typeof document !== "undefined") (() => {
    // [title, slots or sub-groups, open by default, note]; a sub-group is [title, slots, open, note]
    const GROUPS = [
        ["Title & login", [0, 3, 29]],
        ["My Room", [4]],
        ["Lobby areas", [5, 6, 7, 8, 9]],
        ["Shop & packs", [2]],
        ["Deck editor", [1]],
        ["Duel", [10, ["Main duel", [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], true, "The game picks one of these for each duel"], 24, 25,
                  ["Summon jingles", [21, 22, 23], false, "Short jingles; an empty one changes nothing"],
                  ["Field spells", [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45], false,
                   "While a field spell is active; an empty one keeps the duel audio"]]],
        ["Results", [28, 27, 26]],
    ];
    const NAMES = {
        0: ["Title screen", ""], 3: ["Login & notices", ""], 29: ["Updater", "While the game checks for updates"],
        4: ["My Room", ""], 5: ["Yugi area", "And its shops"], 6: ["GX area", "And its shops"],
        7: ["Event lobby", ""], 8: ["Tournament lobby", "And brackets"], 9: ["Event", ""], 2: ["Card packs", "Opening card packs"],
        1: ["Deck editor", "And trades, gifts"], 10: ["Rock-paper-scissors", "Deciding who goes first"],
        11: ["Duel 1", ""], 12: ["Duel 2", ""], 13: ["Duel 3", ""], 14: ["Duel 4", ""], 15: ["Duel 5", ""],
        16: ["Duel 6", ""], 17: ["Duel 7", ""], 18: ["Duel 8", ""], 19: ["Tournament duel 1", ""], 20: ["Tournament duel 2", ""],
        24: ["Winning", "Ahead by 3000 LP or more"], 25: ["Pinch", "Behind by 3000 LP or more"],
        21: ["Ritual summon", ""], 22: ["Summon 1", ""], 23: ["Summon 2", ""],
        30: ["Yami", ""], 31: ["Umi", ""], 32: ["Mountain", ""], 33: ["Sogen", ""], 34: ["Forest", ""], 35: ["Wasteland", ""],
        36: ["Fusion Gate", ""], 37: ["Gaia Power", ""], 38: ["Umiiruka", ""], 39: ["Luminous Spark", ""], 40: ["Dark Zone", ""],
        41: ["Desert Storm", ""], 42: ["Burning Blood", ""], 43: ["Hymn of Light", ""], 44: ["Skyscraper", ""],
        45: ["Other field spells", ""],
        28: ["Win", "After a duel you won"], 27: ["Lose", "After a duel you lost"], 26: ["Draw", "After a drawn duel"],
    };
    const ACCEPT = "audio/*,.mp3,.m4a,.aac,.wav,.flac,.aiff,.aif,.ogg,.opus";
    const slotsOf = (items) => items.flatMap((x) => (Array.isArray(x) ? slotsOf(x[1]) : [x]));
    const ALL = slotsOf(GROUPS.map((g) => [g[0], g[1]]));
    // one file for every part: not the jingles or the in-duel layers, which keep the duel's audio when empty
    const EVERYWHERE = ALL.filter((n) => !(n >= 21 && n <= 25) && !(n >= 30 && n <= 45));
    const PACK_KEY = "yo2audio.pack";   // localStorage: the pack in use / being made, {name, author, description}

    // view: "start" | "review" | "create"; review: {plan, label} of a pack waiting for the player's OK
    let panel, view = "start", state = {}, playing = -1, previewing = -1, note = "", good = "";
    let review = null, busy = "", link = null, removing = 0;
    const open_ = new Map();   // group title -> open (kept while the page lives)
    const isOpen = (title, dflt) => (open_.has(title) ? open_.get(title) : dflt);

    const A = () => Module.yo2Audio, P = () => Module.yo2AudioPack;
    const isAudio = (f) => P().AUDIO.test(f.name || "") || /^audio\//.test(f.type || "");
    const packInfo = () => { try { return JSON.parse(localStorage.getItem(PACK_KEY)) || {}; } catch { return {}; } };
    const savePack = (p) => { try { p ? localStorage.setItem(PACK_KEY, JSON.stringify(p)) : localStorage.removeItem(PACK_KEY); } catch {} };
    const setCount = () => Object.values(state).filter((s) => s.files.length).length;
    async function refresh() {
        state = {};
        for (const s of await A().listSlots()) state[s.slot] = s;
        playing = A().current ? A().current() : -1;
    }
    async function run(job) {
        note = good = "";
        try { await job(); } catch (e) { note = String(e && e.message || e); busy = ""; }
        await refresh();
        render();
    }
    const go = (v) => { view = v; note = good = ""; removing = 0; render(); };
    const setSlot = (n, cfg) => A().set(state[n].id, cfg);
    const failed = (r) => { if (r && r.failed.length) note = r.failed.map((f) => f.error).join("\n"); };
    const addTo = (ns, list) => run(async () => { for (const n of ns) await setSlot(n, { files: [...state[n].files, ...list] }); });
    const replaceIn = (ns, list) => run(() => A().setMany(ns.map((n) => [n, { files: [...list] }])).then(failed));
    const clearIn = (ns) => run(() => A().setMany(ns.map((n) => [n, { files: [] }])));
    const removeFile = (n, f) => run(() => setSlot(n, { files: state[n].files.filter((x) => x !== f) }));
    const setCfg = (n, k, v) => run(() => setSlot(n, { [k]: v }));
    function preview(n) {
        if (previewing >= 0) A().preview(state[previewing].id, false);
        previewing = previewing === n ? -1 : n;
        if (previewing >= 0) A().preview(state[n].id, true);
        render();
    }
    function removeAll() {   // two clicks: the first arms it for a few seconds
        if (!removing) { removing = setTimeout(() => { removing = 0; render(); }, 4000); render(); return; }
        clearTimeout(removing);
        removing = 0;
        savePack(null);
        run(async () => { await A().setMany(ALL.map((n) => [n, { files: [] }])); good = "The audio pack is removed."; });
    }

    // ---- packs: read (zip, loose files, a folder, a link) -> review -> use
    function readPack(job, label) {
        view = "review";
        review = null;
        busy = "Opening the audio pack…";
        render();
        return run(async () => {
            const plan = await job();
            busy = "";
            review = { plan, label };
        });
    }
    const importItems = (items) => readPack(() => P().read(items),
        items.length === 1 && /\.zip$/i.test(items[0].path) ? items[0].path.replace(/\.zip$/i, "") : "");
    const importLink = () => link && link.trim() && readPack(() => P().fromUrl(link), "");
    const usePack = () => {
        const { plan, label } = review;
        review = null;
        return run(async () => {
            const r = await P().apply(plan, { replace: true, progress: (i, n) => {
                busy = n ? `Checking the audio… ${i} of ${n}` : "";
                render();
            } });
            busy = "";
            view = "start";
            link = null;
            failed(r);
            savePack({ name: plan.name || label || "Audio pack", author: plan.author, description: plan.description });
            good = `${plan.name || label || "The audio pack"} is ready: you'll hear it as you play.`;
        });
    };
    async function savePackFile() {
        const info = packInfo();
        await run(async () => {
            const blob = await P().build(info);
            const name = (info.name || "audio pack").replace(/[\\/:*?"<>|]+/g, " ").trim() || "audio pack";
            const a = h("a", { href: URL.createObjectURL(blob), download: name + ".zip" });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 60000);
            good = `Saved "${name}.zip". Anyone can drop it on the game to use it.`;
        });
    }

    // a drop -> [{path, file}], folders walked (entries must be taken before the first await)
    async function droppedItems(dt) {
        const entries = [...(dt.items || [])].map((i) => i.kind === "file" && i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
        const plain = [...(dt.files || [])].map((file) => ({ path: file.name, file }));
        if (!entries.length) return plain;
        const out = [];
        const walk = async (e, pre) => {
            if (e.isFile) out.push({ path: pre + e.name, file: await new Promise((ok, no) => e.file(ok, no)) });
            else if (e.isDirectory) {
                const r = e.createReader();
                for (let batch; (batch = await new Promise((ok, no) => r.readEntries(ok, no))).length;)
                    for (const x of batch) await walk(x, pre + e.name + "/");
            }
        };
        for (const e of entries) await walk(e, "");
        return out;
    }

    // ---- look: skin.js's sampled colours (the lobby windows), as CSS
    const FONT = 'Arial, "Liberation Sans", Arimo, Helvetica, sans-serif';
    // the cream plate (ui.js PLATE, swich_01_c00): normal, hover, pressed
    const PLATE = [
        ["#011434", "#fefdfc", "#f8f4ef", "#f4efe7", "#faf7f3", 5, "#f1ede7", "#c6bba7", "#f7f4ef", "#f6f2eb", "#e9e2d7", "#d3c9b9"],
        ["#011434", "#ffe8b1", "#ffe9c3", "#ffffff", "#ffffef", 5, "#fff1d0", "#ffb85b", "#ffeac6", "#fff3df", "#ffeed7", "#ffcc89"],
        ["#011434", "#838383", "#d4d4d4", "#c0c0c0", "#e0e0e0", 6, "#d0d0d0", "#f0f0f0", "#949494", "#b1b1b1", "#c8c8c8", "#cfcfcf"],
    ];
    const plate = ([bd, t1, t2, body, st, row, b1, b2, l1, l2, r1, r2]) => `border-color: ${bd};
      background: linear-gradient(to right, ${l1} 0 1px, ${l2} 1px 2px, transparent 2px calc(100% - 2px), ${r1} calc(100% - 2px) calc(100% - 1px), ${r2} calc(100% - 1px)),
        linear-gradient(to bottom, ${t1} 0 1px, ${t2} 1px 2px, transparent 2px calc(100% - 2px), ${b1} calc(100% - 2px) calc(100% - 1px), ${b2} calc(100% - 1px)),
        repeating-linear-gradient(to bottom, transparent 0 3px, ${st} 3px 4px) 0 ${row - 4}px / 100% calc(100% - 4px) no-repeat, ${body};`;
    // the yellow menu button (skin.js MBTN, main_btn_01_c01): normal, hover, pressed
    const MBTN = [
        { top: ["#f1b780", "#ffffc8", "#fff97f", "#f9e45f"], body: "#f4d558", bottom: ["#f3d054", "#f0be45", "#eca430"],
          left: ["#f1b757", "#ffff95", "#fff673", "#f9e15d"], right: ["#f3d357", "#f2cc51", "#f0bd45"], border: "#e36f08 #e99223 #e68317 #e36f08" },
        { top: ["#fffec8", "#ffffff", "#ffffe2", "#fcf4b8"], body: "#faeaac", bottom: ["#f9e4a4", "#f6d086", "#f2b55e"],
          left: ["#fffec8", "#ffffff", "#ffffdf", "#fcf4b6"], right: ["#fae8aa", "#f8e09e", "#f6d086"], border: "#fffe92" },
        { top: ["#fada68", "#f8c550", "#fce473", "#fef98c"], body: "#ffff93", bottom: ["#ffff9e", "#ffffd2", "#fffffe"],
          left: ["#fceb7c", "#fce272", "#fef487", "#fffe91"], right: ["#ffff9b", "#ffffbf", "#ffffed"], border: "#fffe92" },
    ];
    const mbtn = ({ top, body, bottom, left, right, border }) => {
        const edge = (dir, near, mid, far) => `linear-gradient(to ${dir}, ${near.map((c, i) => `${c} ${i + 0.5}px`).join(", ")},
          ${mid} ${near.length + 0.5}px, ${mid} calc(100% - ${far.length + 0.5}px), ${far.map((c, j) => `${c} calc(100% - ${far.length - j - 0.5}px)`).join(", ")})`;
        return `border-color: ${border}; background: ${edge("right", left, "transparent", right)}, ${edge("bottom", top, body, bottom)};`;
    };
    const OUTLINE = "text-shadow: 1px 0 #4a4a4a, -1px 0 #4a4a4a, 0 1px #4a4a4a, 0 -1px #4a4a4a";
    const TITLE = `linear-gradient(to bottom, #e5f1f4 0.5px, #cae7f3 2.5px, #a3d7f3 4.5px, #9dd3f4 6.5px, #5fa4f5 17.5px,
        #4e93f5 18.5px, #336deb 19.5px, #234cdb 20.5px, #234cdb 21.5px)`;
    const BEVEL = `inset 3px 0 0 #76ffff, inset 0 3px 0 #a7ffff, inset -3px 0 0 #41abef, inset 0 -3px 0 #329be5,
        inset 4px 0 0 #68e8ff, inset 0 4px 0 #79ffff, inset -4px 0 0 #4db9f7, inset 0 -4px 0 #46b1f2,
        inset 7px 0 0 #59c6ff, inset 0 7px 0 #59c6ff, inset -7px 0 0 #59c6ff, inset 0 -7px 0 #59c6ff`;
    const css = `
    #rc-audio, #rc-audio-drop { position: fixed; z-index: 10; display: flex; align-items: center; justify-content: center; overflow: hidden;
      font: 14.32px/16px ${FONT}; letter-spacing: 1px; color: #000; -webkit-user-select: none; user-select: none; }
    #rc-audio-drop { pointer-events: none; }
    :is(#rc-audio, #rc-audio-drop) .win, #rc-audio-drop .win { position: relative; flex: none; display: flex; flex-direction: column; max-height: 720px; }
    .rca-bar { position: relative; flex: none; height: 22px; color: #fff; ${OUTLINE}; font: 14.32px/20px ${FONT}; letter-spacing: 1px;
      text-align: center; white-space: nowrap; background: ${TITLE}; }
    .rca-x { position: absolute; top: 4px; right: 4px; width: 16px; height: 13px; box-sizing: border-box; margin: 0; padding: 0;
      border: 0; border-left: 1px solid #fff; cursor: pointer;
      background: linear-gradient(to right, transparent calc(100% - 2.5px), #f5cf00 calc(100% - 1.5px), #f7dc80 calc(100% - 0.5px)),
        linear-gradient(to bottom, #fffec2 0.5px, #fffd63 1.5px, #fffc00 3px, #fffc00 calc(100% - 2.5px), #f1bb00 calc(100% - 1.5px), #f5cf80 calc(100% - 0.5px)); }
    .rca-x::before, .rca-x::after { content: ""; position: absolute; left: 1px; top: 5.5px; width: 12px; height: 2px; background: #005fea; border-radius: 1px; }
    .rca-x::before { transform: rotate(42deg); }
    .rca-x::after { transform: rotate(-42deg); }
    .rca-x:hover { filter: brightness(1.08); }
    .rca-pnl { position: relative; isolation: isolate; display: flex; flex-direction: column; min-height: 0; padding: 10px 12px 12px; }
    .rca-pnl::before { content: ""; position: absolute; inset: 0; z-index: -1; opacity: ${(178 / 255).toFixed(3)}; background: #84f4ff; box-shadow: ${BEVEL}; }
    :is(#rc-audio, #rc-audio-drop) .body { display: grid; gap: 8px; overflow: auto; min-height: 0; padding: 2px; scrollbar-width: thin; scrollbar-color: #336deb #c4eeff; }
    :is(#rc-audio, #rc-audio-drop) .plane { position: relative; isolation: isolate; padding: 8px 10px; }
    :is(#rc-audio, #rc-audio-drop) .plane::before { content: ""; position: absolute; inset: 0; z-index: -1; background: #fff; opacity: .9; }
    :is(#rc-audio, #rc-audio-drop) .drop { display: grid; justify-items: center; gap: 8px; padding: 18px 10px 16px; text-align: center; outline: 1px solid #59c6ff; }
    :is(#rc-audio, #rc-audio-drop) .big { font: bold 17.9px/20px ${FONT}; letter-spacing: 1px; color: #234cdb; }
    :is(#rc-audio, #rc-audio-drop) .sub { color: #1d4a74; font-size: 12.53px; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .err { color: #c00000; white-space: pre-line; }
    :is(#rc-audio, #rc-audio-drop) .good { color: #00602a; }
    :is(#rc-audio, #rc-audio-drop) .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    :is(#rc-audio, #rc-audio-drop) .row.c { justify-content: center; }
    :is(#rc-audio, #rc-audio-drop) .row.r { justify-content: flex-end; }
    :is(#rc-audio, #rc-audio-drop) .grow { flex: 1; }
    #rc-audio button { font: inherit; letter-spacing: inherit; cursor: pointer; }
    #rc-audio button:disabled { cursor: default; }
    :is(#rc-audio, #rc-audio-drop) .btn { height: 24px; min-width: 72px; padding: 0 10px; box-sizing: border-box; border: 1px solid; color: #000; white-space: nowrap; ${plate(PLATE[0])} }
    :is(#rc-audio, #rc-audio-drop) .btn:not(:disabled):hover { ${plate(PLATE[1])} }
    :is(#rc-audio, #rc-audio-drop) .btn:not(:disabled):active { ${plate(PLATE[2])} }
    :is(#rc-audio, #rc-audio-drop) .btn:disabled { color: #8c8c8c; }
    :is(#rc-audio, #rc-audio-drop) .btn.s { height: 20px; min-width: 0; padding: 0 6px; font-size: 12.53px; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .mbtn { height: 26px; min-width: 120px; padding: 0 16px; box-sizing: border-box; border: 1px solid; border-radius: 3px;
      color: #fff; ${OUTLINE}; white-space: nowrap; ${mbtn(MBTN[0])} }
    :is(#rc-audio, #rc-audio-drop) .mbtn:hover { ${mbtn(MBTN[1])} }
    :is(#rc-audio, #rc-audio-drop) .mbtn:active { ${mbtn(MBTN[2])} }
    :is(#rc-audio, #rc-audio-drop) .field { height: 20px; box-sizing: border-box; padding: 0 4px; font: inherit; letter-spacing: .5px; color: #000;
      background: #fff; border: 1px solid #336deb; box-shadow: inset 1px 1px #b6c9e8; user-select: text; -webkit-user-select: text; }
    :is(#rc-audio, #rc-audio-drop) .vol { display: inline-flex; align-items: center; gap: 6px; }
    #rc-audio input[type=range] { -webkit-appearance: none; appearance: none; width: 120px; height: 16px; background: none; margin: 0; }
    #rc-audio input[type=range].s { width: 80px; }
    #rc-audio input[type=range]::-webkit-slider-runnable-track { height: 6px; background: #fff; border: 1px solid #336deb; }
    #rc-audio input[type=range]::-moz-range-track { height: 6px; background: #fff; border: 1px solid #336deb; }
    #rc-audio input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 16px; margin-top: -6px;
      border: 1px solid #011434; ${plate(PLATE[0])} }
    #rc-audio input[type=range]::-moz-range-thumb { width: 10px; height: 16px; border: 1px solid #011434; border-radius: 0; background: #f4efe7; }
    :is(#rc-audio, #rc-audio-drop) .chk { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12.53px; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .chk input { -webkit-appearance: none; appearance: none; width: 13px; height: 13px; margin: 0; background: #fff;
      border: 1px solid #336deb; box-shadow: inset 1px 1px #b6c9e8; display: grid; place-content: center; cursor: pointer; }
    :is(#rc-audio, #rc-audio-drop) .chk input:checked::after { content: ""; width: 7px; height: 4px; margin-top: -2px; border: solid #005fea;
      border-width: 0 0 2px 2px; transform: rotate(-45deg); }
    :is(#rc-audio, #rc-audio-drop) .list { background: #fff; border: 1px solid #59c6ff; }
    :is(#rc-audio, #rc-audio-drop) .list > div { display: flex; align-items: center; min-height: 18px; padding: 1px 4px 1px 6px; font-size: 12.53px; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .list > div:nth-child(even) { background: #e6f7ff; }
    :is(#rc-audio, #rc-audio-drop) .list span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    :is(#rc-audio, #rc-audio-drop) .rm { all: unset; cursor: pointer; padding: 0 4px; color: #005fea; font-weight: bold; }
    :is(#rc-audio, #rc-audio-drop) .parts { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; }
    :is(#rc-audio, #rc-audio-drop) .parts b { white-space: nowrap; }
    :is(#rc-audio, #rc-audio-drop) .ghead { display: flex; align-items: center; gap: 6px; height: 22px; padding: 0 3px 0 6px; color: #fff; ${OUTLINE}; background: ${TITLE}; }
    :is(#rc-audio, #rc-audio-drop) .ghead.subg { height: 20px; color: #000; text-shadow: none;
      background: linear-gradient(to bottom, #fafeff 0, #dcfaff 30%, #b3f4ff 60%, #81edff 100%); border-bottom: 1px solid #59c6ff; }
    :is(#rc-audio, #rc-audio-drop) .tog { all: unset; cursor: pointer; flex: 1; display: flex; align-items: baseline; gap: 8px; white-space: nowrap; }
    :is(#rc-audio, #rc-audio-drop) .tog::before { content: "▶"; font-size: 9px; width: 10px; }
    :is(#rc-audio, #rc-audio-drop) .tog[aria-expanded=true]::before { content: "▼"; }
    :is(#rc-audio, #rc-audio-drop) .count { font-size: 12.53px; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .gbody { display: grid; gap: 4px; padding: 4px 0 6px 10px; }
    :is(#rc-audio, #rc-audio-drop) .slot { position: relative; isolation: isolate; display: grid; gap: 4px; padding: 4px 6px; }
    :is(#rc-audio, #rc-audio-drop) .slot::before { content: ""; position: absolute; inset: 0; z-index: -1; background: #fff; opacity: .86; }
    :is(#rc-audio, #rc-audio-drop) .slot.now { outline: 2px solid #ff2a96; outline-offset: -2px; }
    :is(#rc-audio, #rc-audio-drop) .over { outline: 2px solid #ffa92e !important; outline-offset: -2px; }
    :is(#rc-audio, #rc-audio-drop) .over::before { background: #fffe92 !important; }
    :is(#rc-audio, #rc-audio-drop) .name { font-weight: bold; }
    :is(#rc-audio, #rc-audio-drop) .desc { margin-left: 8px; color: #1d4a74; font-size: 12.53px; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .none { margin-left: 8px; color: #6b7c8c; font-size: 12.53px; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .live { margin-left: 8px; color: #e0007a; font-size: 12.53px; font-weight: bold; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .hint { padding: 2px 0 2px 16px; color: #1d4a74; font-size: 12.53px; letter-spacing: .5px; }
    :is(#rc-audio, #rc-audio-drop) .label { font-size: 12.53px; letter-spacing: .5px; }
    #rc-audio :is(button, input):focus-visible { outline: 1px dotted #000; outline-offset: -4px; }
    :is(#rc-audio, #rc-audio-drop) .field:focus-visible { outline: 1px solid #ffa92e; outline-offset: 0; }`;

    const h = (tag, { dataset, ...props } = {}, ...kids) => {
        const e = Object.assign(document.createElement(tag), props);
        if (dataset) Object.assign(e.dataset, dataset);
        for (const k of kids) if (k != null && k !== false) e.append(k);
        return e;
    };
    const pick = (multiple, then, accept = ACCEPT) => {
        const i = h("input", { type: "file", accept, multiple });
        i.onchange = () => i.files.length && then([...i.files]);
        i.click();
    };
    const btn = (text, onclick, { disabled = false, cls = "btn", title = "" } = {}) =>
        h("button", { className: cls, type: "button", textContent: text, onclick, disabled, title });
    const check = (text, on, onchange) => h("label", { className: "chk" },
        h("input", { type: "checkbox", checked: on, onchange: (e) => onchange(e.target.checked) }), text);
    const volume = (value, onchange, label, cls = "") =>
        h("label", { className: "vol" + (cls ? " label" : "") }, label, h("input", { type: "range", className: cls, min: 0, max: 100,
            value: Math.round(value * 100), onchange: (e) => onchange(e.target.value / 100), ariaLabel: label }));
    const message = () => (note || good ? h("div", { className: "plane" }, note ? h("div", { className: "err", textContent: note }) : null,
        good ? h("div", { className: "good", textContent: good }) : null) : null);

    // ---- the start: drop an audio pack
    function startView() {
        const n = setCount(), info = packInfo();
        const linkRow = link === null ? null : h("div", { className: "row c" },
            h("input", { className: "field grow", type: "url", placeholder: "Paste a link to an audio pack (.zip)", value: link,
                ariaLabel: "Link to an audio pack", oninput: (e) => { link = e.target.value; },
                onkeydown: (e) => { if (e.key === "Enter") importLink(); } }),
            btn("Download", importLink));
        const status = n ? h("div", {}, h("div", {}, "Using: ", h("b", { textContent: info.name || "your own audio" }),
                info.author ? ` by ${info.author}` : ""),
            h("div", { className: "sub", textContent: `Plays in ${n} of ${ALL.length} parts of the game` }))
            : h("div", { className: "sub", textContent: "No audio pack yet: the game is silent until you add one." });
        return [message(),
            h("div", { className: "plane drop", dataset: { drop: "pack" } },
                h("div", { className: "big", textContent: "Drop an audio pack here" }),
                h("div", { className: "sub", textContent: "An audio pack is one .zip file. Drop it anywhere on the game." }),
                h("div", { className: "row c" },
                    btn("Open audio pack…", () => pick(true, (l) => importItems(l.map((file) => ({ path: file.name, file }))),
                        ".zip,application/zip," + ACCEPT), { cls: "mbtn" }),
                    link === null ? btn("From a link…", () => { link = ""; render(); panel.querySelector(".field")?.focus(); }) : null),
                linkRow),
            h("div", { className: "plane" }, h("div", { className: "row" },
                h("div", { className: "grow" }, status),
                n ? btn(removing ? "Click again to remove" : "Remove", removeAll) : null)),
            h("div", { className: "row" }, volume(A().master(), (v) => A().master(v), "Volume"))];
    }

    // ---- a pack's review: what it covers, nothing changed yet
    function partsOf(plan) {
        const has = (n) => plan.slots[n] && plan.slots[n].files.length;
        const names = (items) => items.flatMap((x) => {
            if (!Array.isArray(x)) return has(x) ? [NAMES[x][0]] : [];
            const ns = slotsOf(x[1]).filter(has);
            return ns.length === x[1].length ? [`${x[0]} (all ${ns.length})`] : ns.map((n) => NAMES[n][0]);
        });
        return GROUPS.map(([title, items]) => [title, names(items)]).filter(([, l]) => l.length);
    }
    function reviewView() {
        if (busy) return [message(), h("div", { className: "plane", textContent: busy })];
        if (!review) return [message(), h("div", { className: "row c" }, btn("Back", () => go("start")))];
        const { plan, label } = review, rows = partsOf(plan);
        const warn = [...plan.notes];
        if (plan.unused.length)
            warn.push(`Not used (no part of the game has that name): ${plan.unused.slice(0, 5).join(", ")}${plan.unused.length > 5 ? ", …" : ""}`);
        return [message(),
            h("div", { className: "plane" },
                h("div", { className: "big", textContent: plan.name || label || "Audio pack" }),
                plan.author ? h("div", { className: "sub", textContent: "by " + plan.author }) : null,
                plan.description ? h("div", { style: "margin-top: 6px", textContent: plan.description }) : null,
                plan.url ? h("a", { className: "sub", href: plan.url, target: "_blank", rel: "noopener noreferrer", textContent: plan.url }) : null),
            rows.length ? h("div", { className: "plane" }, h("div", { style: "margin-bottom: 6px", textContent: "This pack plays in:" }),
                h("div", { className: "parts" }, ...rows.flatMap(([g, l]) => [h("b", { textContent: g }), h("span", { textContent: l.join(", ") })])))
                : h("div", { className: "plane err", textContent: "This isn't an audio pack: nothing in it is named after a part of the game." }),
            warn.length ? h("div", { className: "plane sub", style: "white-space: pre-line", textContent: warn.join("\n") }) : null,
            rows.length && setCount() ? h("div", { className: "sub", style: "text-align: center", textContent: "It replaces the audio you have now." }) : null,
            h("div", { className: "row c" },
                rows.length ? btn("Use this pack", usePack, { cls: "mbtn" }) : null,
                btn("Cancel", () => { review = null; go("start"); }))];
    }

    // ---- Create audio pack (authors): every part, then save as one .zip
    function slotRow(n) {
        const s = state[n];
        if (!s) return null;
        const [name, desc] = NAMES[n] || ["Audio", ""], files = s.files || [];
        const head = h("div", { className: "row" },
            h("div", { className: "grow" }, h("span", { className: "name", textContent: name }),
                desc ? h("span", { className: "desc", textContent: desc }) : null,
                playing === n ? h("span", { className: "live", textContent: "Playing now" }) : null,
                files.length ? null : h("span", { className: "none", textContent: "No audio" })),
            btn("Add…", () => pick(true, (l) => addTo([n], l)), { cls: "btn s", title: "Or drop audio files here" }),
            files.length ? btn(previewing === n ? "■ Stop" : "▶ Listen", () => preview(n), { cls: "btn s" }) : null,
            files.length ? btn("Clear", () => clearIn([n]), { cls: "btn s" }) : null);
        return h("div", { className: "slot" + (playing === n ? " now" : ""), dataset: { drop: "slot:" + n } }, head,
            files.length ? h("div", { className: "list" }, ...files.map((f) => h("div", {}, h("span", { textContent: f.name }),
                h("button", { className: "rm", textContent: "×", title: "Remove", ariaLabel: `Remove ${f.name}`, onclick: () => removeFile(n, f) })))) : null,
            files.length ? h("div", { className: "row" },
                volume(s.volume ?? 1, (v) => setCfg(n, "volume", v), "Volume", "s"),
                files.length > 1 ? check("Shuffle", !!s.shuffle, (v) => setCfg(n, "shuffle", v)) : null,
                check("Loop", s.loop !== false, (v) => setCfg(n, "loop", v))) : null);
    }
    function group([title, items, dflt = false, hint], sub) {
        const ns = slotsOf(items), set = ns.filter((n) => state[n]?.files?.length).length, open = isOpen(title, dflt);
        return h("div", { dataset: { drop: "group:" + ns.join(",") } },
            h("div", { className: "ghead" + (sub ? " subg" : "") },
                h("button", { className: "tog", type: "button", ariaExpanded: String(open), onclick: () => { open_.set(title, !open); render(); } },
                    h("span", { textContent: title }), h("span", { className: "count", textContent: `${set} of ${ns.length}` })),
                ns.length > 1 ? btn("Set all…", () => pick(true, (l) => replaceIn(ns, l)), { cls: "btn s", title: "One file (or playlist) for every part here" }) : null),
            open ? h("div", { className: "gbody" }, hint ? h("div", { className: "hint", textContent: hint }) : null,
                ...items.map((x) => (Array.isArray(x) ? group(x, true) : slotRow(x)))) : null);
    }
    function createView() {
        const info = packInfo(), n = setCount();
        const meta = (k, label, ph) => h("label", { className: "row" }, h("span", { className: "label", style: "width: 84px", textContent: label }),
            h("input", { className: "field grow", value: info[k] || "", placeholder: ph, maxLength: 200,
                oninput: (e) => savePack({ ...packInfo(), [k]: e.target.value }) }));
        return [message(),
            h("div", { className: "plane" },
                h("div", { className: "sub", style: "margin-bottom: 6px", textContent: "Add audio to the parts of the game, then save the pack " +
                    "as one .zip to share. Drop files onto a part, or use Add. What you set here also plays in your game." }),
                h("div", { style: "display: grid; gap: 4px" }, meta("name", "Pack name", "My audio pack"), meta("author", "Author", "Your name"),
                    meta("description", "About", "One line shown to players before they use it"))),
            h("div", { className: "row" },
                btn("One file for every part…", () => pick(false, (l) => replaceIn(EVERYWHERE, l)),
                    { title: "Every part except the duel jingles, winning, pinch and field spells, which keep the duel audio" }),
                h("span", { className: "grow" }),
                h("span", { className: "sub", textContent: `${n} of ${ALL.length} parts have audio` })),
            ...GROUPS.map((g) => group(g, false))];
    }

    function render() {
        if (!panel) return;
        const win = panel.querySelector(".win"), body = panel.querySelector(".body"), foot = panel.querySelector(".foot"), top = body.scrollTop;
        win.style.width = view === "create" ? "680px" : "500px";
        panel.querySelector(".rca-bar > span").textContent = view === "create" ? "Create audio pack" : "Audio";
        body.replaceChildren(...(view === "create" ? createView() : view === "review" ? reviewView() : startView()).filter(Boolean));
        foot.replaceChildren(...(view === "create"
            ? [btn("Back", () => go("start")), h("span", { className: "grow" }),
                btn("Save audio pack", savePackFile, { cls: "mbtn", disabled: !setCount() })]
            : view === "start" ? [btn("Create audio pack", () => go("create"), { title: "For pack authors: make your own audio pack" }),
                h("span", { className: "grow" }), btn("OK", close)] : []));
        foot.style.display = foot.childElementCount ? "" : "none";
        body.scrollTop = view === "create" ? top : 0;
    }

    // over the canvas, at its scale (stage.js letterboxes it to the window)
    const box = () => (Module.canvas || document.body).getBoundingClientRect();
    function cover(el) {
        const r = box(), k = r.width / 1024 || 1;
        Object.assign(el.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
        el.firstChild.style.transform = `scale(${k})`;
    }
    const place = () => panel && cover(panel);
    const onSlot = () => { if (!panel || !A().current) return; playing = A().current(); if (view === "create") render(); };
    const style = () => document.getElementById("rc-audio-css") || document.head.append(h("style", { id: "rc-audio-css", textContent: css }));
    const windowOf = (title, ...kids) => h("div", { className: "win" },
        h("div", { className: "rca-bar" }, h("span", { textContent: title })), h("div", { className: "rca-pnl" }, ...kids));

    async function open() {
        if (panel || !A()) return;
        style();
        view = "start";
        panel = h("div", { id: "rc-audio", role: "dialog", ariaModal: "true", ariaLabel: "Audio" },
            windowOf("Audio", h("div", { className: "body" }), h("div", { className: "row foot", style: "margin-top: 10px" })));
        panel.querySelector(".rca-bar").append(h("button", { className: "rca-x", type: "button", ariaLabel: "Close", onclick: close }));
        // the game reads keys from the window: keep them here while the page is open
        for (const t of ["keydown", "keyup", "keypress"])
            panel.addEventListener(t, (e) => {
                e.stopPropagation();
                if (t === "keydown" && e.key === "Escape") { if (view !== "start") { review = null; go("start"); } else close(); }
            });
        document.body.append(panel);
        addEventListener("resize", place);
        document.addEventListener("fullscreenchange", place);
        addEventListener("yo2audioslot", onSlot);
        place();
        await A().ready;
        await refresh();
        render();
        panel?.querySelector(".foot button:last-child")?.focus();
    }
    function close() {
        if (previewing >= 0) preview(previewing);
        removeEventListener("resize", place);
        document.removeEventListener("fullscreenchange", place);
        removeEventListener("yo2audioslot", onSlot);
        panel?.remove();
        if (!hint) document.getElementById("rc-audio-css")?.remove();
        panel = null;
        review = null;
        link = null;
        busy = note = good = "";
        Module.canvas?.focus();
    }

    // ---- drag and drop, anywhere on the game: a pack opens this page with its review; in Create audio pack, files
    // dropped on a part or a group go there. Any file drop is taken, so a stray one never navigates away from the game.
    let depth = 0, hint = null, over = null;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
    const target = (e) => (panel && e.target instanceof Element && panel.contains(e.target) ? e.target.closest("[data-drop]") : null);
    const mark = (el) => {
        if (over === el) return;
        over?.classList.remove("over");
        over = el;
        over?.classList.add("over");
    };
    function showHint(on) {
        if (on && !panel && !hint) {
            style();
            hint = h("div", { id: "rc-audio-drop" }, windowOf("Audio", h("div", { className: "plane drop", style: "padding: 24px 40px" },
                h("div", { className: "big", textContent: "Drop to use this audio pack" }),
                h("div", { className: "sub", textContent: "You'll see what it plays before anything changes." }))));
            document.body.append(hint);
            cover(hint);
        } else if (!on && hint) {
            hint.remove();
            hint = null;
            if (!panel) document.getElementById("rc-audio-css")?.remove();
        }
    }
    addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth++; showHint(true); } }, true);
    addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; showHint(false); mark(null); } }, true);
    addEventListener("dragover", (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        mark(target(e));
    }, true);
    addEventListener("drop", async (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const where = target(e)?.dataset.drop || "";
        depth = 0;
        showHint(false);
        mark(null);
        const items = (await droppedItems(e.dataTransfer)).filter((x) => P().isPackItem(x.path, x.file.type));
        if (!items.length) return;
        if (!panel) await open();
        const loose = items.every((x) => !x.path.includes("/") && isAudio(x.file));
        if (loose && view === "create" && where.startsWith("slot:")) return addTo([+where.slice(5)], items.map((x) => x.file));
        if (loose && view === "create" && where.startsWith("group:")) return replaceIn(where.slice(6).split(",").map(Number), items.map((x) => x.file));
        importItems(items);
    }, true);

    Module.rcAudioUI = { open, close };
})();
