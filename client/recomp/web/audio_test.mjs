// node web/audio_test.mjs: web/audio.js against fake window / IndexedDB / WebAudio (no browser needed)
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const listeners = {}, events = [], started = [], stopped = [];
const stores = { slots: new Map(), files: new Map() }, store = stores.slots;
const req = (result) => ({ result });
const fakeDB = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
        const t = { objectStore: (n) => { const store = stores[n]; return {
            getAll: () => req([...store.values()]), getAllKeys: () => req([...store.keys()]),
            put: (v, k) => (store.set(k, v), req(k)), delete: (k) => (store.delete(k), req(undefined)) }; } };
        setTimeout(() => t.oncomplete(), 0);
        return t;
    },
};
// a v2 database: the files inside the slot record
const legacyFile = { name: "old.mp3", arrayBuffer: async () => new ArrayBuffer(7) };
stores.slots.set(5, { files: [legacyFile], shuffle: false, loop: true, volume: 1 });
const param = (v) => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime(x) { this.value = x; },
    cancelScheduledValues() {}, setTargetAtTime(x) { this.value = x; } });
class AudioContext {
    constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
    resume() { this.state = "running"; return Promise.resolve(); }
    createGain() { return { gain: param(1), connect: (n) => n }; }
    createBufferSource() {
        const s = { connect: (n) => n, start() { started.push(s); }, stop() { stopped.push(s); }, end() { s.onended(); } };
        return s;
    }
    decodeAudioData(ab) { return ab.byteLength ? Promise.resolve({ id: ab.byteLength }) : Promise.reject(new Error("bad")); }
}
const window = {
    addEventListener: (e, f) => (listeners[e] = f), removeEventListener: (e) => delete listeners[e],
    dispatchEvent: (e) => events.push(e.detail.slot),
};
class CustomEvent { constructor(type, o) { this.type = type; this.detail = o.detail; } }
const Module = {};
vm.runInNewContext(readFileSync(new URL("audio.js", import.meta.url), "utf8"),
    { window, CustomEvent, AudioContext, Module, console, setTimeout, Math, Error, RangeError,
      indexedDB: { open: () => { const r = { result: fakeDB }; setTimeout(() => r.onsuccess(), 0); return r; } } });
const A = Module.yo2Audio, tick = () => new Promise((r) => setTimeout(r, 5));
const file = (name, size) => ({ name, arrayBuffer: async () => new ArrayBuffer(size) });
const last = () => started.at(-1).buffer.id;

await A.ready;
assert.equal(A.listSlots().length, 46);
assert.equal(A.listSlots()[5].files[0], legacyFile);    // v2 read, then rewritten with the file stored once
assert.equal(stores.files.size, 1);
assert.deepEqual([...stores.slots.get(5).ids], [...stores.files.keys()]);
await A.set(5, { files: [] });
assert.equal(stores.files.size, 0);
assert.equal(A.listSlots()[4].id, "my_room");
A._game(0, 1, 5);                                       // title, before any gesture: nothing can play yet
assert.equal(A.current(), 0);
const t1 = file("title.mp3", 10);
await A.set("title", { files: [t1], volume: 0.5 });
assert.equal(A.listSlots()[0].files.length, 1);
assert.equal(A.listSlots()[0].volume, 0.5);
assert.equal(started.length, 0);
listeners.pointerdown();                                // first click: the title plays, looping
await tick();
assert.equal(last(), 10);
assert.equal(started.at(-1).loop, true);
A._game(3, 1, 5);                                       // login has no files: the title fades out
await tick();
assert.equal(stopped.length, 1);
await A.set("login", { files: [file("a.mp3", 20), file("b.mp3", 21)], loop: false });   // the slot that plays now
await tick();
assert.equal(last(), 20);
assert.equal(started.at(-1).loop, false);
started.at(-1).end();                                   // playlist: the second file follows
await tick();
assert.equal(last(), 21);
await A.set(16, { files: [file("duel.mp3", 30)] });
A._game(16, 1, 0);                                      // a duel
await tick();
assert.equal(last(), 30);
let n = started.length;
A._game(25, 1, 15);                                     // pinch, empty: the duel's audio goes on
A._game(22, 1, 0);                                      // a summon jingle, empty: the same
await tick();
assert.equal(started.length, n);
assert.equal(A.current(), 25);
await A.set("field_yami", { files: [file("yami.mp3", 40)] });
A._game(30, 1, 0);                                      // a field spell with files takes over
await tick();
assert.equal(last(), 40);
A._game(7, 2, 5);                                       // stop(7) while 30 plays: ignored, as the original
assert.equal(A.current(), 30);
A._game(-1, 3, 15);                                     // stop all
await tick();
assert.equal(A.current(), -1);
n = started.length;
A.preview("duel_6", true);                              // preview from the settings page
await tick();
assert.equal(last(), 30);
A.preview("duel_6", false);
await tick();
assert.deepEqual(events, [0, 3, 16, 25, 30, -1]);
await assert.rejects(A.set("event", { files: [file("broken.mp3", 0)] }), /can't be played/);
assert.equal(A.listSlots()[9].files.length, 0);
const before = started.length;
await A.set("title", { volume: 0.2 });                  // volume only: no restart
assert.equal(started.length, before);
assert.equal(A.listSlots()[0].volume, 0.2);
await A.set("title", { files: [] });                    // clear
assert.equal(A.listSlots()[0].files.length, 0);
assert.equal(store.has(0), false);
await A.master(0.7);
assert.equal(A.master(), 0.7);
// crash report 1f33c45: preview a looping slot, then clear it -> was an unhandled rejection in next()
let unhandled = null;
process.on("unhandledRejection", (e) => { unhandled = e; });
await A.set("my_room", { files: [file("room.mp3", 50)] });
A.preview("my_room", true);
await tick();
await A.set("my_room", { files: [] });
await tick();
assert.equal(unhandled, null);
// many slots at once (an audio pack): one shared file is stored once, a broken one is reported, not fatal
const shared = file("shared.mp3", 60), bad = file("bad.mp3", 0);
const progress = [];
const res = await A.setMany({ duel_1: { files: [shared, bad] }, duel_2: { files: [shared] }, 13: { files: [shared] } },
    { replace: true, progress: (i, n) => progress.push([i, n]) });
assert.deepEqual([...res.failed.map((f) => f.name)], ["bad.mp3"]);
assert.deepEqual([...A.listSlots().filter((s) => s.files.length).map((s) => s.id)], ["duel_1", "duel_2", "duel_3"]);
assert.equal(A.listSlots()[11].files.length, 1);
assert.equal(stores.files.size, 1);
assert.deepEqual(progress.at(-1), [2, 2]);
// slots with the same files: the playlist goes on from one to the next
A._game(11, 1, 0);
await tick();
n = started.length;
assert.equal(last(), 60);
A._game(12, 1, 0);
await tick();
assert.equal(started.length, n);
A._game(13, 1, 0);
await tick();
assert.equal(started.length, n);
await A.setMany({ duel_3: { files: [file("other.mp3", 61)] } });   // the slot that plays changed: it restarts
await tick();
assert.equal(last(), 61);
console.log("audio.js: all checks pass");
