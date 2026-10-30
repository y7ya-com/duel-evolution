// node client/web-shell/duelspeed_test.mjs: duelspeed.js with a stub page and ui.js: the stored speed, the button made
// on the first duel scene from the game's button art (state columns), the click cycle, storage that throws, and the
// button only in the duel scenes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("duelspeed.js", import.meta.url), "utf8").replace("import(UI)", "__ui()");
const tick = () => new Promise((r) => setTimeout(r, 0));
function load(store) {
    const el = (tag) => ({ tag, id: "", hidden: false, style: {}, attrs: {}, on: {}, kids: [],
        setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.on[k] = f; }, append(...k) { this.kids.push(...k); } });
    const stage = el("div"), fs = el("button"), listeners = [], cols = [];
    const Module = { canvas: { focus() {}, getBoundingClientRect: () => ({ width: 2048 }) } };
    Object.defineProperty(Module, "onYo2Scene", { set: (f) => listeners.push(f), get: () => (...a) => listeners.forEach((f) => f(...a)) });
    const ui = { SHEET: { button: {} }, loadGlyphs: async () => {},
        nine: () => Array.from({ length: 9 }, () => ({ src: (u) => cols.push(Math.floor(u / 24)) })) };
    const document = { head: { append() {} }, body: el("body"), addEventListener() {},
        getElementById: (id) => (id === "stage" ? stage : id === "fs" ? fs : null), createElement: el };
    vm.runInNewContext(src, { Module, document, localStorage: store, addEventListener() {}, String, Math, Set, Object, Array,
        console, __ui: async () => ui });
    return { Module, stage, cols, btn: () => stage.kids.find((e) => e.id === "duelspeed") };
}
const mem = (init = {}) => ({ d: { ...init }, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } });
const ev = { stopPropagation() {} };

let s = mem(), t = load(s);
assert.equal(t.Module.yo2DuelSpeed, 1, "1x by default");
t.Module.onYo2Scene("begin", 10, 12);
await tick(), assert.equal(t.btn(), undefined, "nothing made outside a duel");
t.Module.onYo2Scene("begin", 12, 0x1e);
await tick(), await tick();
const b = t.btn();
assert.ok(b && b.tag === "button", "a real <button> from janken on"), assert.equal(b.hidden, false);
assert.equal(b.cap.textContent, "1×"), assert.equal(b.style.transform, "scale(2)", "at the canvas's scale");
assert.ok(b.style.right.includes("40px"), "beside the full-screen button");
b.on.pointerenter(), assert.equal(t.cols.at(-1), 1, "hover: swich_01's hover column");
b.on.pointerdown(ev), assert.equal(t.cols.at(-1), 2, "pressed column");
b.on.pointerup(), b.on.click(ev);
assert.equal(t.Module.yo2DuelSpeed, 1.5), assert.equal(s.d["yo2-duel-speed"], "1.5"), assert.equal(b.cap.textContent, "1.5×");
b.on.click(ev), assert.equal(t.Module.yo2DuelSpeed, 2), assert.match(b.title, /^Duel speed: 2×/);
b.on.click(ev), assert.equal(t.Module.yo2DuelSpeed, 1, "back to 1x"), assert.match(b.title, /\(original\)/);
t.Module.onYo2Scene("begin", 0x20, 12), assert.equal(b.hidden, true, "hidden back in the lobby");
t.Module.onYo2Scene("begin", 12, 0x1e), assert.equal(b.hidden, false, "and back for the next duel");

assert.equal(load(mem({ "yo2-duel-speed": "2" })).Module.yo2DuelSpeed, 2, "remembered");
assert.equal(load(mem({ "yo2-duel-speed": "7" })).Module.yo2DuelSpeed, 1, "only the offered speeds");
t = load({ getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); } });
assert.equal(t.Module.yo2DuelSpeed, 1, "blocked storage: 1x");
t.Module.onYo2Scene("begin", 12, 0x1c), await tick(), await tick();
t.btn().on.click(ev), assert.equal(t.Module.yo2DuelSpeed, 1.5, "and the button still works");
console.log("duelspeed_test ok");
