// --pre-js: plays the sound effects through an AudioWorklet. platform/audio/dsound.cpp's mixer pthread writes mixed
// audio into a ring in the wasm heap (shared memory) and keeps ~150 ms ahead; the worklet reads it on the browser's
// audio thread, so a stall of the page's main thread doesn't reach the output. On an underrun the worklet fades
// what played to silence (it never replays old samples) and fades back in when audio returns.
//   Module.yo2Sfx.open(ringPtr, frames) -> the context's sample rate (0: no AudioWorklet; the game mixes silently)
//   Module.yo2Sfx.ctx (the AudioContext), .underruns() (blocks the worklet found empty), .stall(ms) (busy-waits the
//   main thread, for tests). Ring: int32 write, read, running, stop, underruns, 3 spare; float L/R x frames.
// The context starts on the page's first gesture (autoplay rules); `running` tells the mixer when it plays.
// Test: node web/sfx_test.mjs.
(() => {
    // Runs inside the AudioWorkletGlobalScope (shipped there as source through a Blob URL)
    function processor() {
        class Sfx extends AudioWorkletProcessor {
            constructor(o) {
                super();
                const p = o.processorOptions;
                this.i32 = new Int32Array(p.buf, p.ptr, 8);
                this.f = new Float32Array(p.buf, p.ptr + 32, p.frames * 2);
                this.mask = p.frames - 1;
                this.g = 0;   // fade-in gain after an underrun (and at start)
                this.l = 0;
                this.r = 0;   // the last samples out, faded on an underrun
            }
            process(inputs, outputs) {
                const o = outputs[0], L = o[0], R = o[1] || o[0], n = L.length, i32 = this.i32, f = this.f;
                const rd = Atomics.load(i32, 1), avail = (Atomics.load(i32, 0) - rd) | 0;
                const take = avail > 0 ? Math.min(avail, n) : 0;
                for (let k = 0; k < take; k++) {
                    const j = ((rd + k) & this.mask) * 2;
                    if (this.g < 1) this.g = Math.min(1, this.g + 1 / 128);
                    L[k] = this.l = f[j] * this.g;
                    R[k] = this.r = f[j + 1] * this.g;
                }
                if (take < n) Atomics.add(i32, 4, 1);   // a block the mixer did not fill in time
                for (let k = take; k < n; k++) {   // underrun: decay to silence
                    L[k] = this.l *= 0.95;
                    R[k] = this.r *= 0.95;
                    this.g = 0;
                }
                if (take) Atomics.store(i32, 1, (rd + take) | 0);
                return true;
            }
        }
        registerProcessor("yo2-sfx", Sfx);
    }

    Module["yo2Sfx"] = {
        _processor: processor,
        ctx: null,
        i32: null,
        underruns() { return this.i32 ? Atomics.load(this.i32, 4) : 0; },
        stall(ms) { const t = performance.now(); while (performance.now() - t < ms); },
        open(ptr, frames) {
            if (typeof AudioWorkletNode === "undefined" || typeof HEAPU8 === "undefined") return 0;
            const ctx = this.ctx = new AudioContext(), i32 = this.i32 = new Int32Array(HEAPU8.buffer, ptr, 8);
            let node = null;
            const sync = () => Atomics.store(i32, 2, node && ctx.state === "running" ? 1 : 0);
            ctx.onstatechange = sync;
            ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([`(${processor})()`], {type: "text/javascript"})))
                .then(() => {
                    node = new AudioWorkletNode(ctx, "yo2-sfx", {numberOfInputs: 0, outputChannelCount: [2],
                        processorOptions: {buf: HEAPU8.buffer, ptr, frames}});
                    node.connect(ctx.destination);
                    sync();
                })
                .catch((e) => console.warn("sfx: no AudioWorklet, effects stay silent", e));
            const gesture = () => {
                ctx.resume();
                for (const e of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(e, gesture, true);
            };
            for (const e of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(e, gesture, true);
            return ctx.sampleRate;
        },
    };
})();
