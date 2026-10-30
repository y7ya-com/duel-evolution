// node web/duelspeed_test.mjs: web/duelspeed.js with a stub page: the stored speed, the click cycle, storage that
// throws, and the button only in the duel scenes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("duelspeed.js", import.meta.url), "utf8");
function load(store) {
    const el = (tag) => ({ tag, hidden: false, style: {}, attrs: {}, on: {}, classList: { toggle() {} },
        setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.on[k] = f; }, append() {} });
    const listeners = [], made = [];
    const Module = { canvas: { focus() {} } };
    Object.defineProperty(Module, "onYo2Scene", { set: (f) => listeners.push(f), get: () => (...a) => listeners.forEach((f) => f(...a)) });
    const document = { head: { append() {} }, body: { append() {} }, getElementById: () => null,
        createElement: (t) => { const e = el(t); made.push(e); return e; } };
    vm.runInNewContext(src, { Module, document, localStorage: store, addEventListener() {}, String });
    return { Module, btn: made.find((e) => e.tag === "button") };
}
const mem = (init = {}) => ({ d: { ...init }, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } });

let s = mem(), { Module, btn } = load(s);
assert.equal(Module.yo2DuelSpeed, 1, "1x by default");
assert.equal(btn.textContent, "1×"), assert.equal(btn.hidden, true, "hidden outside a duel");
Module.onYo2Scene("begin", 12, 0x1e), assert.equal(btn.hidden, false, "shown from janken on");
Module.onYo2Scene("begin", 0x1e, 0x1c), assert.equal(btn.hidden, false);
const click = () => btn.on.click({ stopPropagation() {} });
click(), assert.equal(Module.yo2DuelSpeed, 1.5), assert.equal(s.d["yo2-duel-speed"], "1.5"), assert.equal(btn.textContent, "1.5×");
click(), assert.equal(Module.yo2DuelSpeed, 2);
click(), assert.equal(Module.yo2DuelSpeed, 1, "back to 1x");
Module.onYo2Scene("begin", 0x20, 12), assert.equal(btn.hidden, true, "hidden back in the lobby");

({ Module } = load(mem({ "yo2-duel-speed": "2" })));
assert.equal(Module.yo2DuelSpeed, 2, "remembered");
({ Module } = load(mem({ "yo2-duel-speed": "7" })));
assert.equal(Module.yo2DuelSpeed, 1, "only the offered speeds");
const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); } };
({ Module, btn } = load(broken));
assert.equal(Module.yo2DuelSpeed, 1, "blocked storage: 1x");
btn.on.click({ stopPropagation() {} }), assert.equal(Module.yo2DuelSpeed, 1.5, "and the button still works");
console.log("duelspeed_test ok");
