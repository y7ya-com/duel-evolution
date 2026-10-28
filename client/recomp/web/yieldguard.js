// --pre-js for both web builds: what is on the wasm stack when the guest main thread yields (rt/web.c, emscripten_sleep).
// The ASYNCIFY build (no JSPI: Safari, Firefox) instruments only the functions that were seen there
// (web/async-only.txt, written from ?yieldlog runs), so a yield from any other stack would corrupt it: rcYieldOk()
// lets a yield through only when every wasm frame is instrumented, else the guest just keeps running (one skipped
// yield; the next one catches up) and the log names the frame to add.
//   ?yieldlog   record every frame seen at a yield (any build); Module.rcYieldStacks() -> the sorted names
if (typeof document !== "undefined") (() => {
    const record = new URLSearchParams(location.search).has("yieldlog");
    const seen = new Set(), missing = new Set();
    let skipped = 0;
    // Chrome "at yo2rc.wasm.f_x (http://...)", Firefox "yo2rc.wasm.f_x@http://...:wasm-function[n]", WebKit
    // "f_x@yo2rc.wasm:wasm-function[n]"; C++ names carry spaces and parentheses ("(anonymous namespace)::peek(unsigned int, ...)")
    const frame = /^\s*(?:at )?(?:[\w-]+\.wasm\.)?(.+?)(?: \(\S+\)$|@\S+$)/;
    function frames() {
        const limit = Error.stackTraceLimit;
        Error.stackTraceLimit = Infinity;   // Chrome keeps 10 by default
        const s = new Error().stack;
        Error.stackTraceLimit = limit;
        Module.rcYieldRaw = s;
        const out = [];
        for (const l of s.split("\n")) if (/wasm-function\[|wasm:\/\//.test(l)) { const m = frame.exec(l); if (m) out.push(m[1]); }
        return out;
    }
    Module.rcYieldOk = () => {
        const only = Module.rcAsyncOnly;   // the ASYNCIFY build's instrumented function indices (web/async-only.txt)
        if (!record && !only) return 1;
        const f = frames();
        if (record) for (const n of f) seen.add(n);
        if (!only) return 1;
        // by function index: every engine prints "wasm-function[N]", WebKit drops many names
        const idx = Module.rcYieldRaw.split("\n").filter((l) => /wasm-function\[/.test(l));
        const badAt = idx.findIndex((l) => !only.has(Number(/wasm-function\[(\d+)\]/.exec(l)[1])));
        if (badAt < 0) return 1;
        const bad = f[badAt] || idx[badAt];
        skipped++;
        if (!missing.has(bad)) { missing.add(bad); console.warn(`yo2rc: yield skipped, ${bad} is not in web/async-only.txt (${skipped} so far)\n${Module.rcYieldRaw}`); }
        return 0;
    };
    Module.rcYieldStacks = () => [...seen].sort();
    Module.rcYieldMissing = () => ({ skipped, missing: [...missing] });
})();
