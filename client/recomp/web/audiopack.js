// --pre-js for the web build: audio packs. A pack is one .zip a player drops on the Audio page (web/audiopage.js) that
// sets many slots at once; Module.yo2Audio (web/audio.js) stores and plays them. The game ships no audio and no packs:
// players make and share their own. Format (recomp/AUDIO_PACKS.md, the pack makers' guide):
//   - audiopack.json anywhere in the zip (its folder is the pack's root), all optional:
//       {"name", "author", "description", "url", "master": 0..1,
//        "slots": {"<part>": "file.mp3" | ["a.mp3", "folder/"] | {"files": ..., "shuffle", "loop", "volume"}}}
//     a path ending in "/" (or naming a folder) is every audio file under it, in name order
//   - without "slots": every audio file goes where its name says, most specific first: the file's own name, then its
//     folders (deepest first), e.g. title.mp3, duel/anything.mp3, my_room/01.ogg, audio/y_gx_04.ogg
// A <part> is a slot id (title, my_room, duel_1, field_yami, ...: web/audio.js), the name of the game's own track for
// it (bgm.txt: y_gx_01, b_du1_1, ...), a plain alias (room, win, pinch, yami, ...) or a group (duel: the ten duel
// tracks, field: every field spell, lobby, menus, jingles; all: every part but the jingles and in-duel layers).
// Slot entries win over groups, groups over "all".
//   read(items) -> plan  items: a zip Blob/File, or a list of Files / {path, file} (loose files, a dropped folder, zips)
//     plan = {name, author, description, url, master, slots: {slot: {files: [File], shuffle?, loop?, volume?}},
//             unused: [path], notes: [text], manifest: bool}
//   fromUrl(url) -> plan; apply(plan, {replace, progress}) -> Module.yo2Audio.setMany's result
//   build(meta) -> Blob: the player's setup (or, with nothing set, an empty template) as a pack zip
//   match(name) -> [slot] (what a file or folder name stands for); zip(entries), unzip(blob): the zip format itself
// Test: node web/audiopack_test.mjs.
(() => {
    if (typeof window === "undefined") return;   // pthread workers load this file too
    // bgm.txt's 46 lines (recomp/audio-slots.md): [slot id (web/audio.js), the game's track name, aliases...]
    const PARTS = [
        ["title", "y_gx_01", "title_screen"], ["deck_editor", "y_gx_02", "deck", "decks", "deck_edit"],
        ["card_pack", "b_card", "card_packs", "packs", "pack_opening", "shop"], ["login", "y_gx_03", "notices", "caution"],
        ["my_room", "y_gx_04", "room", "myroom"], ["yugi_area", "y_gx_05", "yugi", "legacy_area"],
        ["gx_area", "y_gx_06", "gx", "academy", "duel_academy"], ["event_lobby", "y_gx_07"],
        ["tournament_lobby", "y_gx_08", "tournament"], ["event", "y_gx_09", "events"],
        ["janken", "y_gx_17", "rock_paper_scissors", "rps"],
        ["duel_1", "b_du1_1"], ["duel_2", "b_du1_2"], ["duel_3", "b_du1_3"], ["duel_4", "b_du1_4"], ["duel_5", "b_du1_5"],
        ["duel_6", "y_gx_12"], ["duel_7", "y_gx_13"], ["duel_8", "y_gx_14"],
        ["duel_tournament_1", "b_du2_1"], ["duel_tournament_2", "b_du2_2"],
        ["ritual", "b_gishi", "ritual_summon"], ["summon_1", "b_syou1"], ["summon_2", "b_syou2"],
        ["duel_winning", "y_gx_15", "winning", "advantage"], ["duel_pinch", "y_gx_16", "pinch", "losing"],
        ["duel_draw", "y_gx_18", "draw"], ["duel_lose", "y_gx_19", "lose", "defeat"],
        ["duel_win", "y_gx_20", "win", "victory"], ["updater", "b_instal", "patcher"],
        ["field_yami", "b_yami", "yami"], ["field_umi", "b_umi", "umi"], ["field_mountain", "b_moun", "mountain"],
        ["field_sogen", "b_sogen", "sogen"], ["field_forest", "b_forest", "forest"],
        ["field_wasteland", "b_kouya", "wasteland"], ["field_fusion_gate", "b_fusion", "fusion_gate"],
        ["field_gaia_power", "b_gaia", "gaia_power"], ["field_umiiruka", "b_water", "umiiruka", "water_world"],
        ["field_luminous_spark", "b_shine", "luminous_spark"],
        ["field_mystic_plasma_zone", "b_dark", "mystic_plasma_zone", "dark_zone"],
        ["field_rising_air_current", "b_desert", "rising_air_current", "desert_storm"],
        ["field_molten_destruction", "b_burn", "molten_destruction", "burning_blood"],
        ["field_chorus_of_sanctuary", "b_seiiki", "chorus_of_sanctuary", "hymn_of_light", "sanctuary"],
        ["field_skyscraper", "y_gx_10", "skyscraper"], ["field_other", "y_gx_11", "other_fields", "other_field"],
    ];
    const range = (a, b) => Array.from({length: b - a + 1}, (_, i) => a + i);
    const EVERYWHERE = [...range(0, 20), ...range(26, 29)];   // not the jingles or the in-duel layers (they fall back)
    const GROUPS = [
        [["duel", "duels", "battle", "duel_audio"], range(11, 20)], [["field", "fields", "field_spells"], range(30, 45)],
        [["lobby", "lobbies", "areas", "world"], range(5, 9)], [["menus", "menu"], [0, 3, 29]],
        [["jingles", "summon", "summons"], range(21, 23)],
    ];
    const ALL = ["all", "everywhere", "everything", "default"];
    const TIER = {slot: 0, group: 1, all: 2};
    const KEYS = new Map();   // normalized name -> {tier, slots}
    PARTS.forEach((names, s) => names.forEach((n) => KEYS.set(n, {tier: TIER.slot, slots: [s]})));
    for (const [names, slots] of GROUPS) for (const n of names) KEYS.set(n, {tier: TIER.group, slots});
    for (const n of ALL) KEYS.set(n, {tier: TIER.all, slots: EVERYWHERE});

    const AUDIO = /\.(mp3|m4a|aac|mp4|wav|flac|aiff?|ogg|oga|opus|webm|weba|caf)$/i;
    const MIME = {mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", mp4: "audio/mp4", wav: "audio/wav", flac: "audio/flac",
        aif: "audio/aiff", aiff: "audio/aiff", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", webm: "audio/webm",
        weba: "audio/webm", caf: "audio/x-caf", json: "application/json", txt: "text/plain"};
    const ext = (p) => (/\.([^./]+)$/.exec(p) || [])[1]?.toLowerCase() || "";
    const base = (p) => p.slice(p.lastIndexOf("/") + 1);
    const junk = (p) => /(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(p) || /(^|\/)(Thumbs\.db|desktop\.ini)$/i.test(p);
    const norm = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const natural = new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare;

    // a name -> the best key it stands for: as it is, without a leading track number ("01 - Title"), without a
    // trailing copy number ("duel 9", "title (2)")
    function keyOf(name) {
        const n = norm(name.replace(AUDIO, "")), forms = [n, n.replace(/^\d+_/, ""), n.replace(/_\d+$/, ""),
            n.replace(/^\d+_/, "").replace(/_\d+$/, "")];
        for (const f of forms) if (f && KEYS.has(f)) return KEYS.get(f);
        return null;
    }
    // a file's path -> {tier, slots}: the most specific tier any of its names reaches; the file name before folders
    function place(path) {
        const parts = path.split("/"), names = [parts.pop(), ...parts.reverse()];
        let best = null;
        for (const n of names) { const k = keyOf(n); if (k && (!best || k.tier < best.tier)) best = k; }
        return best;
    }

    // ---------------------------------------------------------------- zip (PKZIP: stored and deflated entries)
    const u16 = (d, o) => d.getUint16(o, true), u32 = (d, o) => d.getUint32(o, true);
    const utf8 = new TextDecoder(), enc = new TextEncoder();
    async function unzip(blob) {
        const tail = Math.min(blob.size, 22 + 65535);
        const end = new DataView(await blob.slice(blob.size - tail).arrayBuffer());
        let e = -1;
        for (let i = end.byteLength - 22; i >= 0; i--) if (u32(end, i) === 0x06054b50) { e = i; break; }
        if (e < 0) throw new Error("This isn't a zip file (or it is damaged)");
        const count = u16(end, e + 10), size = u32(end, e + 12), at = u32(end, e + 16);
        if (count === 0xffff || at === 0xffffffff) throw new Error("This zip is too large (ZIP64): split it into packs under 4 GB");
        const dir = new DataView(await blob.slice(at, at + size).arrayBuffer()), out = [];
        for (let o = 0, i = 0; i < count; i++) {
            if (u32(dir, o) !== 0x02014b50) throw new Error("This zip is damaged (bad directory)");
            const flags = u16(dir, o + 8), method = u16(dir, o + 10), csize = u32(dir, o + 20), usize = u32(dir, o + 24);
            const nlen = u16(dir, o + 28), xlen = u16(dir, o + 30), clen = u16(dir, o + 32), local = u32(dir, o + 42);
            const path = utf8.decode(new Uint8Array(dir.buffer, dir.byteOffset + o + 46, nlen)).replace(/\\/g, "/");
            o += 46 + nlen + xlen + clen;
            if (path.endsWith("/")) continue;
            out.push({path, size: usize, async read() {
                if (flags & 1) throw new Error(`${path} is password-protected`);
                const h = new DataView(await blob.slice(local, local + 30).arrayBuffer());
                if (u32(h, 0) !== 0x04034b50) throw new Error(`${path}: this zip is damaged`);
                const data = blob.slice(local + 30 + u16(h, 26) + u16(h, 28), local + 30 + u16(h, 26) + u16(h, 28) + csize);
                const type = MIME[ext(path)] || "";
                if (method === 0) return new File([data], base(path), {type});
                if (method !== 8) throw new Error(`${path} uses a compression the game can't open: re-save the zip normally`);
                const raw = await new Response(data.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
                return new File([raw], base(path), {type});
            }});
        }
        return out;
    }
    const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
    const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
    // entries [{path, data: Blob|string}] -> a zip Blob (stored: audio is compressed already)
    async function zip(entries) {
        const parts = [], dirs = [], d = new Date();
        const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        let off = 0;
        for (const {path, data} of entries) {
            const name = enc.encode(path), body = typeof data === "string" ? enc.encode(data) : new Uint8Array(await data.arrayBuffer());
            const sum = crc32(body);
            const head = (sig, extra) => {
                const h = new DataView(new ArrayBuffer(extra + name.length));
                h.setUint32(0, sig, true);
                return h;
            };
            const fill = (h, o) => {   // the fields local and central headers share, from `o`
                h.setUint16(o, 20, true); h.setUint16(o + 2, 0x800, true); h.setUint16(o + 4, 0, true);
                h.setUint16(o + 6, time, true); h.setUint16(o + 8, date, true); h.setUint32(o + 10, sum, true);
                h.setUint32(o + 14, body.length, true); h.setUint32(o + 18, body.length, true); h.setUint16(o + 22, name.length, true);
            };
            const l = head(0x04034b50, 30);
            fill(l, 4);
            new Uint8Array(l.buffer).set(name, 30);
            const c = head(0x02014b50, 46);
            c.setUint16(4, 20, true);
            fill(c, 6);
            c.setUint32(42, off, true);
            new Uint8Array(c.buffer).set(name, 46);
            parts.push(l, body);
            dirs.push(c);
            off += l.byteLength + body.length;
            if (off > 0xfffffff0) throw new Error("Too much audio for one pack (over 4 GB)");
        }
        const size = dirs.reduce((n, c) => n + c.byteLength, 0), e = new DataView(new ArrayBuffer(22));
        e.setUint32(0, 0x06054b50, true); e.setUint16(8, dirs.length, true); e.setUint16(10, dirs.length, true);
        e.setUint32(12, size, true); e.setUint32(16, off, true);
        return new Blob([...parts, ...dirs, e], {type: "application/zip"});
    }

    // ---------------------------------------------------------------- reading a pack
    // items -> [{path, size, read}] (zips opened; a single folder around everything removed)
    async function entriesOf(items) {
        const list = items instanceof Blob ? [items] : [...items], out = [];
        for (const it of list) {
            const file = it instanceof Blob ? it : it.file, path = (it instanceof Blob ? file.webkitRelativePath || file.name : it.path) || "file";
            if (ext(path) === "zip" || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
                const inner = await unzip(file), pre = list.length > 1 ? path.replace(/\.zip$/i, "") + "/" : "";
                out.push(...inner.map((x) => ({...x, path: pre + x.path})));
            } else out.push({path, size: file.size, read: async () => file});
        }
        const kept = out.filter((x) => !junk(x.path));
        const top = kept.length && kept.every((x) => x.path.includes("/")) && kept[0].path.split("/")[0];
        if (top && kept.every((x) => x.path.startsWith(top + "/")) && !keyOf(top))
            for (const x of kept) x.path = x.path.slice(top.length + 1);
        return kept;
    }
    const num = (v) => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v > 1 ? v / 100 : v)) : undefined);
    const opts = (o) => {
        const r = {};
        if (typeof o.shuffle === "boolean") r.shuffle = o.shuffle;
        if (typeof o.loop === "boolean") r.loop = o.loop;
        if (num(o.volume) !== undefined) r.volume = num(o.volume);
        return r;
    };

    async function read(items) {
        const entries = await entriesOf(items), notes = [];
        const man = entries.filter((x) => base(x.path).toLowerCase() === "audiopack.json")
            .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
        let meta = {};
        if (man) {
            try { meta = JSON.parse(await (await man.read()).text()); } catch (e) { throw new Error(`audiopack.json can't be read: ${e.message}`); }
            if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("audiopack.json must be an object ({...})");
        }
        const root = man ? man.path.slice(0, man.path.length - base(man.path).length) : "";
        const audio = entries.filter((x) => AUDIO.test(x.path) && x.path.startsWith(root))
            .map((x) => ({...x, rel: x.path.slice(root.length)})).sort((a, b) => natural(a.rel, b.rel));
        const assigned = new Map();   // slot -> {tier, items, opts}
        const give = (k, items, o = {}) => {
            for (const s of k.slots) {
                const a = assigned.get(s);
                if (!a || k.tier < a.tier) assigned.set(s, {tier: k.tier, items: [...items], opts: o});
                else if (k.tier === a.tier) for (const it of items) if (!a.items.includes(it)) a.items.push(it);
            }
        };
        if (meta.slots && typeof meta.slots === "object") {
            for (const [key, v] of Object.entries(meta.slots)) {
                const k = KEYS.get(norm(key));
                if (!k) { notes.push(`audiopack.json: "${key}" isn't a part of the game; left out`); continue; }
                const o = v && typeof v === "object" && !Array.isArray(v) ? v : {files: v};
                const paths = [].concat(o.files ?? o.file ?? []).filter((p) => typeof p === "string");
                const items = [];
                for (const p of paths) {
                    const want = p.replace(/\\/g, "/").replace(/^\.?\//, ""), dir = want.replace(/\/?$/, "/");
                    const hit = audio.filter((x) => x.rel === want || dir === "/" || x.rel.startsWith(dir));
                    if (!hit.length) notes.push(`audiopack.json: "${p}" (for ${key}) isn't in the pack`);
                    items.push(...hit.filter((x) => !items.includes(x)));
                }
                if (items.length || !paths.length) give(k, items, opts(o));
            }
        } else {
            for (const x of audio) { const k = place(x.rel); if (k) give(k, [x]); }
        }
        const used = new Set([...assigned.values()].flatMap((a) => a.items));
        const unused = audio.filter((x) => !used.has(x)).map((x) => x.rel);
        // read each file once (the same File object in every slot that uses it: stored once, played as one playlist)
        const files = new Map(), slots = {};
        for (const [s, a] of [...assigned].sort((x, y) => x[0] - y[0])) {
            const list = [];
            for (const it of a.items) {
                if (!files.has(it)) files.set(it, it.read().catch((e) => { notes.push(String(e.message || e)); return null; }));
                const f = await files.get(it);
                if (f) list.push(f);
            }
            if (list.length || !a.items.length) slots[s] = {files: list, ...a.opts};
        }
        const str = (v) => (typeof v === "string" ? v.slice(0, 500) : "");
        return {name: str(meta.name), author: str(meta.author), description: str(meta.description), url: str(meta.url),
            master: num(meta.master), slots, unused, notes, manifest: !!man};
    }

    async function fromUrl(url) {
        let u;
        try { u = new URL(url.trim(), location.href); } catch { throw new Error("That doesn't look like a link"); }
        if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links can be downloaded");
        // a GitHub file page -> the file itself (raw.githubusercontent.com allows it); a Dropbox share -> its download
        const gh = u.hostname === "github.com" && /^\/([^/]+\/[^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
        if (gh) u = new URL(`https://raw.githubusercontent.com/${gh[1]}/${gh[2]}`);
        if (/(^|\.)dropbox\.com$/.test(u.hostname)) u.searchParams.set("dl", "1");
        let r;
        try { r = await fetch(u.href, {mode: "cors", credentials: "omit"}); } catch {
            throw new Error("That site doesn't let the game download the pack directly. Download the .zip yourself, then drop it here.");
        }
        if (!r.ok) throw new Error(`The download failed (${r.status} ${r.statusText || ""}). Check the link.`.replace(" )", ")"));
        const blob = await r.blob(), name = decodeURIComponent(u.pathname.split("/").pop() || "pack.zip");
        return read([{path: /\.zip$/i.test(name) ? name : name + ".zip", file: new File([blob], name, {type: "application/zip"})}]);
    }

    const A = () => Module.yo2Audio;
    const apply = (plan, {replace = false, progress} = {}) =>
        A().setMany(plan.slots, {replace, progress, ...(plan.master !== undefined ? {master: plan.master} : {})});

    async function build(meta = {}) {
        const slots = A().listSlots().filter((s) => s.files.length), entries = [], names = new Map(), taken = new Set();
        const nameFor = (f) => {
            if (names.has(f)) return names.get(f);
            let n = (f.name || "audio").replace(/[\\/:*?"<>|]/g, "_"), i = 1;
            const dot = n.lastIndexOf("."), stem = dot > 0 ? n.slice(0, dot) : n, x = dot > 0 ? n.slice(dot) : "";
            while (taken.has(n.toLowerCase())) n = `${stem} (${++i})${x}`;
            taken.add(n.toLowerCase());
            names.set(f, n);
            entries.push({path: "audio/" + n, data: f});
            return n;
        };
        const man = {name: meta.name || "My audio pack", author: meta.author || "", description: meta.description || "",
            master: A().master(), slots: {}};
        for (const s of slots) man.slots[s.id] = {files: s.files.map((f) => "audio/" + nameFor(f)), shuffle: !!s.shuffle, loop: s.loop !== false, volume: s.volume ?? 1};
        if (!slots.length) {   // a template: every part, empty
            man.name = "";
            for (const id of A().slotIds()) man.slots[id] = [];
        }
        const readme = "Duel Evolution audio pack.\n\nTo use it: drop this .zip anywhere on the game (or open it from Main Menu > Audio).\n\n" +
            "audiopack.json says which file plays where; the files are in audio/. To make your own pack, use Create\n" +
            "audio pack on the game's Audio page, or put your files in audio/ and list them under \"slots\". A file or\n" +
            "folder named after a part also works without audiopack.json: title.mp3, my_room/, duel/ (every duel), field/.\n";
        return zip([{path: "audiopack.json", data: JSON.stringify(man, null, 2) + "\n"}, {path: "README.txt", data: readme}, ...entries]);
    }

    const match = (name) => (place(name)?.slots || []).slice();
    const isPackItem = (path, type) => ext(path) === "zip" || /zip/.test(type || "") || AUDIO.test(path) || /^audio\//.test(type || "") ||
        base(path).toLowerCase() === "audiopack.json";
    Module.yo2AudioPack = {read, fromUrl, apply, build, match, zip, unzip, isPackItem, AUDIO};
})();
