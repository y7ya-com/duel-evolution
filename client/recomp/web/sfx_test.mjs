// node web/sfx_test.mjs: web/sfx.js's AudioWorklet processor against a SharedArrayBuffer ring, with a 400 ms producer
// stall (what a stalled main thread could do at worst): the buffered 150 ms play on, then the output decays to
// silence and stays there (no replayed samples), and fades back in when audio returns.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const Module = {};
vm.runInNewContext(readFileSync(new URL("sfx.js", import.meta.url), "utf8"), { Module });
let Proc;
vm.runInNewContext(`(${Module.yo2Sfx._processor})()`, {
    AudioWorkletProcessor: class {}, registerProcessor: (n, c) => (Proc = c), Atomics, Int32Array, Float32Array, Math,
});

const RATE = 48000, FRAMES = 1 << 15, BLOCK = 128, AHEAD = Math.round(RATE * 0.15);
const buf = new SharedArrayBuffer(32 + FRAMES * 8), i32 = new Int32Array(buf, 0, 8), f = new Float32Array(buf, 32);
const p = new Proc({ processorOptions: { buf, ptr: 0, frames: FRAMES } });
let produced = 0;
const tone = (t) => 0.5 * Math.sin((2 * Math.PI * 440 * t) / RATE);
function produce() {   // the mixer thread: keep AHEAD frames buffered
    let w = Atomics.load(i32, 0);
    while (((w - Atomics.load(i32, 1)) | 0) < AHEAD) {
        const j = (w & (FRAMES - 1)) * 2;
        f[j] = f[j + 1] = tone(produced++);
        w = (w + 1) | 0;
    }
    Atomics.store(i32, 0, w);
}
const out = [];
function block() {
    const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);
    assert.equal(p.process([], [[L, R]]), true);
    out.push(...L);
}

for (let b = 0; b < 200; b++) { produce(); block(); }                 // ~0.5 s of normal playback
const start = out.length, stallBlocks = Math.round((0.4 * RATE) / BLOCK);
for (let b = 0; b < stallBlocks; b++) block();                         // the producer stalls for 400 ms
const resume = out.length;
for (let b = 0; b < 40; b++) { produce(); block(); }                   // and comes back

// normal playback (after the start-up fade-in) is the tone, sample for sample
for (let k = 200; k < start; k++) assert.ok(Math.abs(out[k] - tone(k)) < 1e-6, `sample ${k}`);
// the stall: the buffered 150 ms play on as the tone ...
const buffered = AHEAD - BLOCK;   // the last normal block already took one block of it
for (let k = start; k < start + buffered; k++) assert.ok(Math.abs(out[k] - tone(k)) < 1e-6, `buffered ${k}`);
// ... then the output only decays (never a repeat of old samples) and is silent within 128 samples
for (let k = start + buffered + 1; k < resume; k++) assert.ok(Math.abs(out[k]) <= Math.abs(out[k - 1]) + 1e-12, `decay ${k}`);
for (let k = start + buffered + 128; k < resume; k++) assert.ok(Math.abs(out[k]) < 1e-3, `silent ${k}`);
// back: a short fade-in (no click), then the tone at full level again
const first = out.slice(resume, resume + 8).map(Math.abs);
assert.ok(Math.max(...first) < 0.05, "fades back in");
const tail = out.slice(resume + 256, resume + 2048);
assert.ok(Math.max(...tail.map(Math.abs)) > 0.45, "full level after the fade-in");
assert.ok(Atomics.load(i32, 4) > 0, "the stall shows as underruns");
console.log(`sfx.js: all checks pass (stall ${stallBlocks} blocks: ${buffered} buffered frames played, then silence)`);
