// node web/audio_test.mjs: web/audio.js against fake window / IndexedDB / WebAudio (no browser needed)
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const listeners = {}, events = [], started = [], stopped = [];
const store = new Map();
const req = (result) => ({ result });
const fakeDB = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
        const t = { objectStore: () => ({
            getAll: () => req([...store.values()]), getAllKeys: () => req([...store.keys()]),
            put: (v, k) => (store.set(k, v), req(k)), delete: (k) => (store.delete(k), req(undefined)) }) };
        setTimeout(() => t.oncomplete(), 0);
        return t;
    },
};
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
console.log("audio.js: all checks pass");
