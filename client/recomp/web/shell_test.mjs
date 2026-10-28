// node web/shell_test.mjs: shell.html's crash path. An uncaught error or rejection while the game still draws frames is
// reported as nonfatal and the game goes on; one after which no frame comes is the crash (no browser needed).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("shell.html", import.meta.url), "utf8");
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];

function page() {
    const timers = [], listeners = {}, posts = [], shown = [];
    const ctx = {
        console: { log() {} }, URLSearchParams, location: { search: "", pathname: "/" }, navigator: { userAgent: "test" },
        crossOriginIsolated: true, WebAssembly: { Suspending: 1 }, JSON, String, CustomEvent: class { constructor(t) { this.type = t; } },
        document: { hidden: false, getElementById: () => ({ style: {} }), querySelector: () => null,
            createElement: () => ({ style: {}, querySelector: () => ({}) }), body: { append: (d) => shown.push(d) } },
        setTimeout: (f) => timers.push(f), dispatchEvent: () => true, sessionStorage: new Map(),
        addEventListener: (t, f) => (listeners[t] = f),
        fetch: (url, o) => (posts.push(JSON.parse(o.body)), Promise.resolve()),
    };
    ctx.sessionStorage.getItem = ctx.sessionStorage.get, ctx.sessionStorage.setItem = ctx.sessionStorage.set;
    ctx.location.reload = () => (ctx.reloaded = (ctx.reloaded | 0) + 1);
    vm.runInNewContext(script + ";this.Module = Module;", ctx);
    const run = (n) => { for (let i = 0; i < n && timers.length; i++) timers.shift()(); };
    return { ctx, listeners, posts, shown, run };
}

// mid-game: an audio callback throws, the game keeps presenting -> one nonfatal report, no overlay
{
    const p = page();
    p.ctx.Module.yo2Presents = 100;
    p.listeners.unhandledrejection({ reason: new TypeError("x is undefined") });
    p.ctx.Module.yo2Presents++;
    p.run(50);
    assert.equal(p.shown.length, 0);
    assert.equal(p.posts.length, 1);
    assert.equal(p.posts[0].fatal, false);
}
// mid-game: the error stopped the game (no Present follows) -> the crash, after ~5 s of free main thread
{
    const p = page();
    p.ctx.Module.yo2Presents = 100;
    p.listeners.error({ message: "boom" });
    p.run(19);
    assert.equal(p.shown.length, 0);
    p.run(50);
    assert.equal(p.shown.length, 1);
    assert.equal(p.posts.at(-1).fatal, true);
}
// booting (no frame yet): the crash at once, as before
{
    const p = page();
    p.listeners.error({ message: "Failed to fetch" });
    p.run(5);
    assert.equal(p.shown.length, 1);
}
// a ship's JS with the other build's wasm (crash report #8: ASM_CONSTS[...] is not a function at boot): one reload,
// then the crash screen if it happens again in that tab
{
    const p = page();
    p.ctx.Module.onAbort("TypeError: ASM_CONSTS[emAsmAddr] is not a function");
    p.run(5);
    assert.equal(p.ctx.reloaded, 1);
    assert.equal(p.shown.length, 0);
    const q = page();
    q.ctx.sessionStorage = p.ctx.sessionStorage;
    q.ctx.Module.onAbort("TypeError: ASM_CONSTS[emAsmAddr] is not a function");
    q.run(5);
    assert.equal(q.shown.length, 1);
}
console.log("shell.html: all checks pass");
