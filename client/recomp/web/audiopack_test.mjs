// node web/audiopack_test.mjs: web/audiopack.js (reading, matching, building packs) over web/audio.js, with a fake
// IndexedDB / WebAudio as in audio_test.mjs (no browser needed)
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import vm from "node:vm";
import assert from "node:assert/strict";

const stores = { slots: new Map(), files: new Map() };
const req = (result) => ({ result });
const fakeDB = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
        const t = { objectStore: (n) => { const st = stores[n]; return {
            getAll: () => req([...st.values()]), getAllKeys: () => req([...st.keys()]),
            put: (v, k) => (st.set(k, v), req(k)), delete: (k) => (st.delete(k), req(undefined)) }; } };
        setTimeout(() => t.oncomplete(), 0);
        return t;
    },
};
const param = (v) => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
class AudioContext {
    constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
    resume() { this.state = "running"; return Promise.resolve(); }
    createGain() { return { gain: param(1), connect: (n) => n }; }
    createBufferSource() { return { connect: (n) => n, start() {}, stop() {} }; }
    // "bad" in the file's bytes: undecodable
    decodeAudioData(ab) {
        return new TextDecoder().decode(ab).includes("bad") ? Promise.reject(new Error("bad")) : Promise.resolve({ id: ab.byteLength });
    }
}
const window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
const Module = {};
const ctx = vm.createContext({ window, Module, console, setTimeout, Error, RangeError, AudioContext, CustomEvent: class {},
    Blob, File, Response, DecompressionStream, TextDecoder, TextEncoder, URL, location: { href: "http://localhost/" },
    indexedDB: { open: () => { const r = { result: fakeDB }; setTimeout(() => r.onsuccess(), 0); return r; } } });
for (const f of ["audio.js", "audiopack.js"]) vm.runInContext(readFileSync(new URL(f, import.meta.url), "utf8"), ctx);
const A = Module.yo2Audio, P = Module.yo2AudioPack;
const plain = (x) => JSON.parse(JSON.stringify(x));
const ids = (plan) => Object.keys(plan.slots).map((s) => A.listSlots()[s].id);
const names = (plan, id) => [...plan.slots[A.slotIds().indexOf(id)].files].map((f) => f.name);

// a zip written by another tool: deflated entries (and a stored one), a data-descriptor-free PKZIP like zip(1)
function otherZip(files) {
    const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
    const crc = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
    const parts = [], dir = [];
    let off = 0;
    for (const [path, text, store] of files) {
        const raw = Buffer.from(text), body = store ? raw : deflateRawSync(raw), name = Buffer.from(path), h = Buffer.alloc(30), c = Buffer.alloc(46);
        h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(store ? 0 : 8, 8); h.writeUInt32LE(crc(raw), 14);
        h.writeUInt32LE(body.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(store ? 0 : 8, 10); c.writeUInt32LE(crc(raw), 16); c.writeUInt32LE(body.length, 20);
        c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
        parts.push(h, name, body); dir.push(c, name);
        off += 30 + name.length + body.length;
    }
    const d = Buffer.concat(dir), e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(d.length, 12); e.writeUInt32LE(off, 16);
    return new File([Buffer.concat([...parts, d, e])], "pack.zip", { type: "application/zip" });
}

await A.ready;

// names -> parts
assert.deepEqual(plain(P.match("01 - Title.mp3")), [0]);
assert.deepEqual(plain(P.match("y_gx_04.ogg")), [4]);
assert.deepEqual(plain(P.match("Duel 9.mp3")), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
assert.deepEqual(plain(P.match("duel/Winning.flac")), [24]);   // the file's own name before its folder's
assert.deepEqual(plain(P.match("field/whatever.mp3")).length, 16);
assert.deepEqual(plain(P.match("track.mp3")), []);

// no audiopack.json: names and folders decide; one folder around everything, macOS junk and non-audio ignored
let plan = await P.read(otherZip([
    ["GX Pack/title.mp3", "t"], ["GX Pack/duel/b.mp3", "b2"], ["GX Pack/duel/a.mp3", "a1"], ["GX Pack/duel/Duel 3.ogg", "d3"],
    ["GX Pack/audio/y_gx_04.ogg", "room", true], ["GX Pack/field/Yami.mp3", "yami"], ["GX Pack/random.mp3", "r"],
    ["GX Pack/notes.txt", "hi"], ["__MACOSX/GX Pack/._title.mp3", "junk"],
]));
assert.equal(plan.manifest, false);
assert.deepEqual(ids(plan), ["title", "my_room", "duel_1", "duel_2", "duel_3", "duel_4", "duel_5", "duel_6", "duel_7", "duel_8",
    "duel_tournament_1", "duel_tournament_2", "field_yami"]);
assert.deepEqual(names(plan, "duel_1"), ["a.mp3", "b.mp3"]);
assert.deepEqual(names(plan, "duel_3"), ["Duel 3.ogg"]);
assert.equal(plan.slots[11].files[0], plan.slots[12].files[0]);   // one File for every slot that uses it
assert.equal(await plan.slots[4].files[0].text(), "room");
assert.equal(await plan.slots[0].files[0].text(), "t");             // inflated
assert.deepEqual(plain(plan.unused), ["random.mp3"]);

// applied: one shared file stored once, everything else cleared (replace)
await A.set("login", { files: [new File(["x"], "old.mp3")] });
let res = await P.apply(plan, { replace: true });
assert.equal(res.failed.length, 0);
assert.equal(A.listSlots()[3].files.length, 0);
assert.equal(A.listSlots()[11].files.length, 2);
assert.equal(stores.files.size, 6);   // title, a, b, Duel 3, room, Yami

// audiopack.json: slot > group > all, folders, settings, unknown parts and missing files noted, a broken file reported
plan = await P.read(otherZip([
    ["pack/audiopack.json", JSON.stringify({ name: "Test pack", author: "someone", master: 80, slots: {
        all: "audio/main.mp3", duel: { files: "audio/duels/", shuffle: true, volume: 0.5 }, win: ["audio/win.mp3"],
        title: "audio/missing.mp3", "not a part": "audio/main.mp3", lose: "audio/broken.mp3" } })],
    ["pack/audio/main.mp3", "main"], ["pack/audio/duels/2.mp3", "d2"], ["pack/audio/duels/10.mp3", "d10"],
    ["pack/audio/win.mp3", "win"], ["pack/audio/broken.mp3", "bad"], ["pack/audio/extra.mp3", "x"],
]));
assert.equal(plan.manifest, true);
assert.equal(plan.name, "Test pack");
assert.equal(plan.master, 0.8);
assert.deepEqual(names(plan, "title"), ["main.mp3"]);              // its own file is missing: "all" covers it
assert.deepEqual(names(plan, "duel_5"), ["2.mp3", "10.mp3"]);      // natural order
assert.equal(plan.slots[15].shuffle, true);
assert.equal(plan.slots[15].volume, 0.5);
assert.deepEqual(names(plan, "duel_win"), ["win.mp3"]);
assert.equal(plan.slots[24], undefined);                           // "all" leaves the in-duel layers to fall back
assert.equal(plan.notes.length, 2);
assert.ok(plan.notes.some((n) => /not a part/.test(n)) && plan.notes.some((n) => /missing\.mp3/.test(n)));
assert.deepEqual(plain(plan.unused), ["audio/extra.mp3"]);
const progress = [];
res = await P.apply(plan, { replace: true, progress: (i, n) => progress.push(i + "/" + n) });
assert.deepEqual(plain(res.failed.map((f) => f.name)), ["broken.mp3"]);
assert.equal(A.listSlots()[27].files.length, 0);                   // its only file broken: silent
assert.equal(A.master(), 0.8);
assert.equal(progress.at(-1), "5/5");

// the player's setup as a pack, and back
const zip = await P.build({ name: "Mine" });
const back = await P.read(zip);
assert.equal(back.name, "Mine");
const now = A.listSlots().filter((s) => s.files.length);
assert.deepEqual(ids(back), [...now].map((s) => s.id));
for (const s of now) {
    assert.deepEqual(names(back, s.id), [...s.files].map((f) => f.name));
    assert.equal(back.slots[s.slot].shuffle, s.shuffle);
    assert.equal(back.slots[s.slot].volume, s.volume);
}
assert.equal(await back.slots[15].files[1].text(), "d10");
// with nothing set: a template listing every part
await A.setMany({}, { replace: true });
const tpl = await P.read(await P.build());
assert.equal(Object.keys(tpl.slots).length, 46);

// loose files and a dropped folder ({path, file}) work like a zip
plan = await P.read([new File(["w"], "Victory.mp3"), { path: "my pack/my_room/02.mp3", file: new File(["r"], "02.mp3") }]);
assert.deepEqual(ids(plan), ["my_room", "duel_win"]);
await assert.rejects(P.read(new File(["not a zip"], "x.zip")), /isn't a zip/);
console.log("audiopack.js: all checks pass");
