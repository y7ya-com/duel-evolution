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
        console: { log() {} }, URLSearchParams, location: { search: "", pathname: "/", origin: "https://site.test" }, navigator: { userAgent: "test" },
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
// a browser extension's error before the first frame (crash report 7589ac0e) is not the game's: no crash, no report
{
    const p = page();
    p.listeners.unhandledrejection({ reason: { message: "Cannot read properties of undefined (reading 'M_ID')",
        stack: "TypeError: ...\n    at Y (chrome-extension://eppio/executors/200.js:1:761)" } });
    p.listeners.error({ message: "x", filename: "moz-extension://abc/content.js" });
    p.run(50);
    assert.equal(p.shown.length, 0);
    assert.equal(p.posts.length, 0);
    // the page's own code in the stack: still the crash
    p.listeners.unhandledrejection({ reason: { message: "boom", stack: "at f (https://site.test/yo2rc.js:1:1)\n at g (chrome-extension://e/x.js:1:1)" } });
    p.run(5);
    assert.equal(p.shown.length, 1);
}
console.log("shell.html: all checks pass");

// the picker (<script id="pick">): a 2 GB build that runs out of memory before its first frame (Firefox, field
// 2026-10-29) marks the device and reloads once into the 1 GB build; the 1 GB build running out shows the message
{
    const pick = /<script id="pick">([\s\S]*?)<\/script>/.exec(html)[1];
    const boot = (store) => {
        const shown = [], heads = [], on = {};
        const el = () => ({ style: {}, querySelector: () => ({}) });
        const ctx = {
            console: { log() {} }, URLSearchParams, location: { search: "" }, navigator: { userAgent: "Mozilla/5.0 Firefox/158.0", platform: "Win32" },
            WebAssembly: { Suspending: 1, Memory: class {} }, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
            document: { createElement: el, head: { append: (l) => heads.push(l) }, body: { append: (d) => shown.push(d) } },
            addEventListener: (t, f) => (on[t] = f), log() {}, Module: {},
        };
        ctx.location.reload = () => (ctx.reloaded = (ctx.reloaded | 0) + 1);
        vm.runInNewContext(pick, ctx);
        const oom = (why) => { let prevented = false; on.yo2crash({ detail: why, preventDefault: () => (prevented = true) }); return prevented; };
        return { ctx, shown, heads, oom, src: shown.find((d) => d.src)?.src };
    };
    const store = new Map();
    let p = boot(store);
    assert.equal(p.src, "yo2rc-async.js");
    assert.equal(p.heads[0].href, "yo2rc-async.wasm");   // the preload follows the pick
    assert.ok(p.oom("abort: InternalError: out of memory"));
    assert.equal(store.get("yo2-small"), "1");
    assert.equal(p.ctx.reloaded, 1);
    p = boot(store);
    assert.equal(p.src, "yo2rc-ios.js");
    const before = p.shown.length;
    assert.ok(p.oom("abort: CompileError: wasm validation error: at offset 4: failed to match magic number"));
    assert.equal(p.ctx.reloaded, undefined);   // no loop: the message instead
    assert.equal(p.shown.length, before + 1);
    // mid-game it is not a build question: the message, no switch
    const fresh = new Map(); p = boot(fresh); p.ctx.Module.yo2Presents = 5;
    p.oom("error: uncaught exception: out of memory");
    assert.equal(fresh.get("yo2-small"), undefined);
}
console.log("shell.html picker: all checks pass");
