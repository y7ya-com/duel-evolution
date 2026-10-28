// Background audio slots on the page (--pre-js): decoding, the player's files and playback. rt/audio.cpp sends every
// background request of the game here (Module.yo2Audio._game(slot, action, fadeFrames)); the game's own background
// audio never plays. A slot plays the files the player chose for it (web/audiopage.js, the Audio settings page), or
// nothing (the default). Sound effects are not slots. Slot n = line n of the game's data/etc/bgm.txt
// (recomp/audio-slots.md). Files stay in this browser's IndexedDB ("yo2audio"), never uploaded.
//   listSlots()                -> [{slot, id, label, group, files: [Blob|File], shuffle, loop, volume}]
//   set(id|slot, {files, shuffle, loop, volume})   any subset; new files are decoded first (rejects what can't play)
//   master(v) / master(), preview(id|slot, on), current() (the slot the game is in, -1 none), ready (a Promise)
//   window event "yo2audioslot" {detail: {slot}} whenever the game changes context.
// Empty slots: "Winning", "Pinch" and the field spells keep the duel's own audio; the summon jingles keep what plays.
// A slot's files play in order (shuffled when asked); a looping slot starts over, a single looping file loops
// seamlessly. Test: node web/audio_test.mjs.
(() => {
    if (typeof window === "undefined") return;   // pthread workers load this file too
    const LOOP = 1, ONCE = 0;
    const SLOTS = [   // [id, label, group, loop by default] (rt/audio.cpp has the same ids for the native folders)
        ["title", "Title", "menus", LOOP], ["deck_editor", "Deck editor", "deck", LOOP],
        ["card_pack", "Card pack opening", "deck", ONCE], ["login", "Login", "menus", LOOP],
        ["my_room", "My Room", "world", LOOP], ["yugi_area", "Yugi area", "world", LOOP],
        ["gx_area", "GX area", "world", LOOP], ["event_lobby", "Event lobby", "world", LOOP],
        ["tournament_lobby", "Tournament lobby", "world", LOOP], ["event", "Event", "world", LOOP],
        ["janken", "Rock-paper-scissors", "duel", LOOP],
        ["duel_1", "Duel 1", "duel", LOOP], ["duel_2", "Duel 2", "duel", LOOP], ["duel_3", "Duel 3", "duel", LOOP],
        ["duel_4", "Duel 4", "duel", LOOP], ["duel_5", "Duel 5", "duel", LOOP], ["duel_6", "Duel 6", "duel", LOOP],
        ["duel_7", "Duel 7", "duel", LOOP], ["duel_8", "Duel 8", "duel", LOOP],
        ["duel_tournament_1", "Tournament duel 1", "duel", LOOP], ["duel_tournament_2", "Tournament duel 2", "duel", LOOP],
        ["ritual", "Ritual Summon", "jingle", ONCE], ["summon_1", "Summon 1", "jingle", LOOP],
        ["summon_2", "Summon 2", "jingle", ONCE],
        ["duel_winning", "Duel: winning", "duel_state", LOOP], ["duel_pinch", "Duel: pinch", "duel_state", LOOP],
        ["duel_draw", "Duel result: draw", "duel_result", ONCE], ["duel_lose", "Duel result: lose", "duel_result", ONCE],
        ["duel_win", "Duel result: win", "duel_result", ONCE], ["updater", "Updater", "menus", LOOP],
        ["field_yami", "Field: Yami", "field", LOOP], ["field_umi", "Field: Umi", "field", LOOP],
        ["field_mountain", "Field: Mountain", "field", LOOP], ["field_sogen", "Field: Sogen", "field", LOOP],
        ["field_forest", "Field: Forest", "field", LOOP], ["field_wasteland", "Field: Wasteland", "field", LOOP],
        ["field_fusion_gate", "Field: Fusion Gate", "field", LOOP], ["field_gaia_power", "Field: Gaia Power", "field", LOOP],
        ["field_umiiruka", "Field: Umiiruka", "field", LOOP], ["field_luminous_spark", "Field: Luminous Spark", "field", LOOP],
        ["field_mystic_plasma_zone", "Field: Mystic Plasma Zone", "field", LOOP],
        ["field_rising_air_current", "Field: Rising Air Current", "field", LOOP],
        ["field_molten_destruction", "Field: Molten Destruction", "field", LOOP],
        ["field_chorus_of_sanctuary", "Field: Chorus of Sanctuary", "field", LOOP],
        ["field_skyscraper", "Field: Skyscraper", "field", LOOP], ["field_other", "Field: other field spells", "field", LOOP],
    ];
    const PLAY = 1, STOP = 2;
    const isDuelBase = (s) => s >= 10 && s <= 20, isJingle = (s) => s >= 21 && s <= 23;
    const isDuelLayer = (s) => s === 24 || s === 25 || (s >= 30 && s <= 45);

    // ---- storage: slot -> {files: [Blob], shuffle, loop, volume}; "master" -> number
    const cfg = new Map();
    let masterVol = 1;
    const db = new Promise((ok, fail) => {
        const r = indexedDB.open("yo2audio", 2);
        r.onupgradeneeded = () => r.result.objectStoreNames.contains("slots") || r.result.createObjectStore("slots");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
    });
    const tx = (mode, f) => db.then((d) => new Promise((ok, fail) => {
        const t = d.transaction("slots", mode), r = f(t.objectStore("slots"));
        t.oncomplete = () => ok(r && r.result);
        t.onerror = () => fail(t.error);
    }));
    const ready = Promise.all([tx("readonly", (s) => s.getAllKeys()), tx("readonly", (s) => s.getAll())]).then(([keys, vals]) => {
        keys.forEach((k, i) => (k === "master" ? (masterVol = vals[i]) : vals[i] && vals[i].files && cfg.set(k, vals[i])));
    }).catch((e) => console.warn("audio: no IndexedDB, slots won't persist", e));
    const conf = (s) => cfg.get(s) || {files: [], shuffle: false, loop: SLOTS[s][3] === LOOP, volume: 1};
    const has = (s) => s >= 0 && conf(s).files.length > 0;

    // ---- playback: one AudioContext, made or resumed on the first user gesture (autoplay rules)
    let ctx = null, out = null, voice = null, cur = -1, duelBase = -1, previewing = -1, playingSlot = -1, token = 0;
    const buffers = new WeakMap();   // Blob -> Promise<AudioBuffer>
    function context() {
        if (!ctx) {
            ctx = new AudioContext();
            out = ctx.createGain();
            out.gain.value = masterVol;
            out.connect(ctx.destination);
        }
        return ctx;
    }
    const gesture = () => {
        context().resume().then(() => update(0.5, true), () => {});
        for (const e of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(e, gesture, true);
    };
    for (const e of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(e, gesture, true);

    function decode(blob) {
        if (!buffers.has(blob)) buffers.set(blob, blob.arrayBuffer().then((b) => context().decodeAudioData(b)));
        return buffers.get(blob);
    }
    function fadeOut(v, secs) {
        const t = ctx.currentTime;
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(v.gain.gain.value, t);
        v.gain.gain.linearRampToValueAtTime(0, t + secs);
        if (v.src) v.src.stop(t + secs + 0.05);
    }
    const shuffled = (a) => {
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    };
    // what to play for the game's slot: its files, or for an empty duel layer the duel's own slot, else nothing
    const resolve = (s) => (has(s) ? s : isDuelLayer(s) && has(duelBase) ? duelBase : -1);

    // crossfade from what plays to `slot`'s files (nothing when -1)
    function play(slot, secs) {
        playingSlot = slot;
        const my = ++token;
        if (!ctx || ctx.state !== "running") return;   // starts on the first gesture
        if (voice) { fadeOut(voice, secs); voice = null; }
        if (slot < 0) return;
        const c = conf(slot), gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(c.volume, ctx.currentTime + secs);
        gain.connect(out);
        const v = voice = {gain, src: null, slot, list: c.shuffle ? shuffled(c.files.slice()) : c.files.slice(), item: 0};
        const next = async (skips = 0) => {
            if (my !== token || !v.list.length || skips > v.list.length) return;   // a slot emptied while it played
            if (v.item >= v.list.length) {
                if (!c.loop) return;
                v.item = 0;
                if (c.shuffle) shuffled(v.list);
            }
            let b;
            try { b = await decode(v.list[v.item]); } catch (e) {
                console.warn("audio: cannot decode", v.list[v.item].name, e);
                v.item++;
                return next(skips + 1);
            }
            if (my !== token) return;
            const src = ctx.createBufferSource();
            src.buffer = b;
            src.loop = c.loop && v.list.length === 1;
            src.connect(gain);
            src.onended = () => { if (v.src === src && my === token) { v.item++; next(); } };
            v.src = src;
            src.start();
        };
        next();
    }
    function update(secs, restart) {
        const want = previewing >= 0 ? previewing : resolve(cur);
        if (want !== playingSlot || restart) play(want, secs);
    }

    function game(slot, action, fade) {   // from rt/audio.cpp; fades are 60 fps frames, 0.25 s at least
        if (action === PLAY && isJingle(slot) && !has(slot)) return;   // an empty jingle: what plays goes on
        if (action === PLAY && slot === cur) return;
        if (action === STOP && slot !== cur) return;
        cur = action === PLAY ? slot : -1;
        if (isDuelBase(cur)) duelBase = cur;
        window.dispatchEvent(new CustomEvent("yo2audioslot", {detail: {slot: cur}}));
        update(Math.max(fade, 15) / 60);
    }

    const slotOf = (id) => {
        const s = typeof id === "number" ? id : SLOTS.findIndex((x) => x[0] === id);
        if (!(s >= 0 && s < SLOTS.length)) throw new RangeError("no audio slot " + id);
        return s;
    };
    Module["yo2Audio"] = {
        _game: game,
        ready,
        listSlots: () => SLOTS.map(([id, label, group], slot) => ({slot, id, label, group, ...conf(slot), files: conf(slot).files.slice()})),
        async set(id, change) {
            const s = slotOf(id), old = conf(s), c = {...old, ...change};
            c.files = (c.files || []).slice();
            for (const f of c.files.filter((f) => !old.files.includes(f)))   // new files: decode first
                await decode(f).catch((e) => { buffers.delete(f); throw new Error(`${f.name || "file"} can't be played (${e.message || e})`); });
            const sameFiles = c.files.length === old.files.length && c.files.every((f, i) => f === old.files[i]);
            const onlyVolume = sameFiles && c.shuffle === old.shuffle && c.loop === old.loop;
            if (c.files.length) cfg.set(s, c); else { cfg.delete(s); if (previewing === s) previewing = -1; }
            await tx("readwrite", (st) => (c.files.length ? st.put(c, s) : st.delete(s)));
            if (onlyVolume) { if (voice && voice.slot === s) voice.gain.gain.setTargetAtTime(c.volume, ctx.currentTime, 0.05); }
            else update(0.5, s === playingSlot);   // restarts the slot if it plays; starts it if it now should
        },
        master(v) {
            if (v === undefined) return masterVol;
            masterVol = v;
            if (out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
            return tx("readwrite", (st) => st.put(v, "master"));
        },
        preview(id, on) {
            const s = slotOf(id);
            if (on) { context().resume().then(() => { previewing = s; update(0.3); }, () => {}); return; }
            if (previewing === s) { previewing = -1; update(0.3); }
        },
        current: () => cur,
    };
})();
