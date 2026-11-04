// Background audio slots on the page (--pre-js): decoding, the player's files and playback. rt/audio.cpp sends every
// background request of the game here (Module.yo2Audio._game(slot, action, fadeFrames)); the game's own background
// audio never plays. A slot plays the files the player chose for it (web/audiopage.js, the Audio settings page), or
// nothing (the default). Sound effects are not slots. Slot n = line n of the game's data/etc/bgm.txt
// (recomp/audio-slots.md). Files stay in this browser's IndexedDB ("yo2audio"), never uploaded.
//   listSlots()                -> [{slot, id, label, group, files: [Blob|File], shuffle, loop, volume}]
//   set(id|slot, {files, shuffle, loop, volume})   any subset; new files are decoded first (rejects what can't play)
//   setMany({id|slot: change}, {replace, master, progress(done, total, name)}) -> {failed: [{name, error}]}: many slots
//     at once (an audio pack, web/audiopack.js): one save, one change of what plays; replace clears every other slot;
//     a file that can't be played is left out (and reported) instead of failing the lot
//   master(v) / master(), preview(id|slot, on), current() (the slot the game is in, -1 none), ready (a Promise)
//   window event "yo2audioslot" {detail: {slot}} whenever the game changes context.
// Empty slots: "Winning", "Pinch" and the field spells keep the duel's own audio; the summon jingles keep what plays.
// A slot's files play in order (shuffled when asked); a looping slot starts over, a single looping file loops
// seamlessly; a context whose slot has the same files as the one playing goes on without a restart (one playlist for
// many slots). Each file is stored once however many slots use it ("files" store; slots keep ids). Test: node
// web/audio_test.mjs.
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

    // ---- storage (IndexedDB v3): "slots": slot -> {ids, shuffle, loop, volume}, "master" -> number; "files": id -> File.
    // v2 kept the files in each slot record ({files: [Blob]}): read as they are, rewritten as ids on load.
    const cfg = new Map();   // slot -> {files: [Blob], shuffle, loop, volume}
    const fileId = new WeakMap(), stored = new Set();   // Blob -> its id in "files"; the ids there
    let masterVol = 1, seq = 0;
    const newId = () => "f" + Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
    const db = new Promise((ok, fail) => {
        const r = indexedDB.open("yo2audio", 3);
        r.onupgradeneeded = () => {
            for (const n of ["slots", "files"]) r.result.objectStoreNames.contains(n) || r.result.createObjectStore(n);
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
    });
    // f(slots, files) -> a request or a list of them; resolves to their result(s) once the transaction completes
    const tx = (mode, f) => db.then((d) => new Promise((ok, fail) => {
        const t = d.transaction(["slots", "files"], mode), r = f(t.objectStore("slots"), t.objectStore("files"));
        t.oncomplete = () => ok(Array.isArray(r) ? r.map((x) => x.result) : r && r.result);
        t.onerror = t.onabort = () => fail(t.error);
    }));
    // writes these slots' records (and their new files), then drops the files no slot uses any more
    function persist(slots) {
        return tx("readwrite", (st, fs) => {
            for (const s of slots) {
                const c = cfg.get(s);
                if (!c) { st.delete(s); continue; }
                const ids = c.files.map((f) => {
                    let id = fileId.get(f);
                    if (!id || !stored.has(id)) { id = id || newId(); fileId.set(f, id); fs.put(f, id); stored.add(id); }
                    return id;
                });
                st.put({ids, shuffle: c.shuffle, loop: c.loop, volume: c.volume}, s);
            }
            const used = new Set([...cfg.values()].flatMap((c) => c.files.map((f) => fileId.get(f))));
            for (const id of [...stored]) if (!used.has(id)) { fs.delete(id); stored.delete(id); }
        });
    }
    const ready = tx("readonly", (st, fs) => [st.getAllKeys(), st.getAll(), fs.getAllKeys(), fs.getAll()]).then(([keys, vals, fkeys, fvals]) => {
        const byId = new Map(fkeys.map((k, i) => [k, fvals[i]]));
        for (const [id, f] of byId) { fileId.set(f, id); stored.add(id); }
        const legacy = [];
        keys.forEach((k, i) => {
            const v = vals[i];
            if (k === "master") masterVol = v;
            else if (v && v.ids) cfg.set(k, {files: v.ids.map((id) => byId.get(id)).filter(Boolean), shuffle: v.shuffle, loop: v.loop, volume: v.volume});
            else if (v && v.files) { cfg.set(k, v); legacy.push(k); }
        });
        for (const [k, c] of cfg) if (!c.files.length) { cfg.delete(k); legacy.push(k); }
        if (legacy.length || byId.size) return persist(legacy);   // also drops files left over
    }).catch((e) => console.warn("audio: no IndexedDB, slots won't persist", e));
    const conf = (s) => cfg.get(s) || {files: [], shuffle: false, loop: SLOTS[s][3] === LOOP, volume: 1};
    const has = (s) => s >= 0 && conf(s).files.length > 0;

    // ---- playback: one AudioContext, made or resumed on the first user gesture (autoplay rules)
    let ctx = null, out = null, voice = null, cur = -1, duelBase = -1, previewing = -1, playingSlot = -1, token = 0;
    const buffers = new Map(), KEEP = 4;   // Blob -> Promise<AudioBuffer>, the last few used (decoded audio is large)
    const playable = new WeakSet();          // Blobs that decoded once
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
        const p = buffers.get(blob) || blob.arrayBuffer().then((b) => context().decodeAudioData(b));
        buffers.delete(blob);
        buffers.set(blob, p);
        while (buffers.size > KEEP) buffers.delete(buffers.keys().next().value);
        p.then(() => playable.add(blob), () => buffers.get(blob) === p && buffers.delete(blob));
        return p;
    }
    // decodes a file the player adds (once per file), without keeping it unless it plays
    const check = (blob) => (playable.has(blob) ? Promise.resolve() : blob.arrayBuffer()
        .then((b) => context().decodeAudioData(b)).then(() => { playable.add(blob); }));
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

    const sameList = (a, b) => a.files.length === b.files.length && a.files.every((f, i) => f === b.files[i]) &&
        a.shuffle === b.shuffle && a.loop === b.loop;

    // crossfade from what plays to `slot`'s files (nothing when -1); the same playlist goes on unless `restart`
    function play(slot, secs, restart) {
        playingSlot = slot;
        if (!restart && slot >= 0 && voice && ctx && ctx.state === "running" && sameList(conf(slot), voice.c)) {
            voice.slot = slot;
            voice.gain.gain.setTargetAtTime(conf(slot).volume, ctx.currentTime, secs / 3);
            return;
        }
        const my = ++token;
        if (!ctx || ctx.state !== "running") return;   // starts on the first gesture
        if (voice) { fadeOut(voice, secs); voice = null; }
        if (slot < 0) return;
        const c = conf(slot), gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(c.volume, ctx.currentTime + secs);
        gain.connect(out);
        const v = voice = {gain, src: null, slot, c, list: c.shuffle ? shuffled(c.files.slice()) : c.files.slice(), item: 0};
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
            if (v.list.length > 1) decode(v.list[(v.item + 1) % v.list.length]).catch(() => {});   // ready when this ends
        };
        next();
    }
    function update(secs, restart) {
        const want = previewing >= 0 ? previewing : resolve(cur);
        if (want !== playingSlot || restart) play(want, secs, restart);
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

    // changes: {id|slot: {files, shuffle, loop, volume}} or [[id|slot, change]]; see the header
    async function setMany(changes, {replace = false, master, progress, strict = false} = {}) {
        const next = new Map();
        for (const [k, ch] of Array.isArray(changes) ? changes : Object.entries(changes)) {
            const s = slotOf(typeof k === "string" && /^\d+$/.test(k) ? +k : k), c = {...conf(s), ...ch};
            c.files = (c.files || []).slice();
            next.set(s, c);
        }
        if (replace) for (let s = 0; s < SLOTS.length; s++) if (!next.has(s)) next.set(s, {...conf(s), files: []});
        const fresh = [...new Set([...next].flatMap(([s, c]) => c.files.filter((f) => !conf(s).files.includes(f))))];
        const failed = [];
        for (const [i, f] of fresh.entries()) {   // new files: decode first
            if (progress) progress(i, fresh.length, f.name || "file");
            try { await check(f); } catch (e) {
                const error = `${f.name || "file"} can't be played (${e && e.message || e})`;
                if (strict) throw new Error(error);
                failed.push({name: f.name || "file", error});
                for (const c of next.values()) c.files = c.files.filter((x) => x !== f);
            }
        }
        if (progress) progress(fresh.length, fresh.length, "");
        let restart = false, volumeOnly = null;
        for (const [s, c] of next) {
            const old = conf(s);
            if (s === playingSlot || (voice && voice.slot === s)) {
                if (!sameList(c, old)) restart = true; else if (c.volume !== old.volume) volumeOnly = c.volume;
            }
            if (c.files.length) cfg.set(s, c); else { cfg.delete(s); if (previewing === s) previewing = -1; }
        }
        await persist([...next.keys()]);
        if (master !== undefined) await api.master(master);
        if (!restart && volumeOnly !== null && voice) voice.gain.gain.setTargetAtTime(volumeOnly, ctx.currentTime, 0.05);
        update(0.5, restart);   // restarts what plays if its files changed; starts a slot that now should
        return {failed};
    }
    const slotOf = (id) => {
        const s = typeof id === "number" ? id : SLOTS.findIndex((x) => x[0] === id);
        if (!(s >= 0 && s < SLOTS.length)) throw new RangeError("no audio slot " + id);
        return s;
    };
    const api = Module["yo2Audio"] = {
        _game: game,
        ready,
        listSlots: () => SLOTS.map(([id, label, group], slot) => ({slot, id, label, group, ...conf(slot), files: conf(slot).files.slice()})),
        set: (id, change) => setMany([[id, change]], {strict: true}),
        setMany,
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
        slotIds: () => SLOTS.map((x) => x[0]),
    };
})();
