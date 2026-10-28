// node web/yieldguard_test.mjs: web/yieldguard.js's rcYieldOk on the stack formats each engine prints (no browser needed)
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

let stack = "";
class FakeError { constructor() { this.stack = stack; } }
FakeError.stackTraceLimit = 10;
const Module = { rcAsyncOnly: new Set([7268, 476]), rcAsyncNames: new Set(["f_00607fd0", "rc_icall"]) };
vm.runInNewContext(readFileSync(new URL("yieldguard.js", import.meta.url), "utf8"),
    { document: {}, location: { search: "" }, URLSearchParams, Module, console, Error: FakeError });
const ok = (s) => ((stack = s), Module.rcYieldOk());

// Firefox / desktop WebKit: indices
assert.equal(ok("yo2rc-async.wasm.f_00607fd0@x:wasm-function[7268]:0x1\nyo2rc-async.wasm.rc_icall@x:wasm-function[476]:0x2"), 1);
assert.equal(ok("yo2rc-async.wasm.f_x@x:wasm-function[9999]:0x1"), 0);
// iOS Safari 18.7 (crash reports on 1f33c45): some frames named, no index -> used to throw on exec(...)[1]
assert.equal(ok("f_00607fd0@yo2rc-ios.wasm:wasm-function[7268]\nyo2rc-ios.wasm.wasm-function[rc_icall]@x"), 1);
assert.equal(ok("yo2rc-ios.wasm.wasm-function[not_instrumented]@x"), 0);
console.log("yieldguard.js: all checks pass");
