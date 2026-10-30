// node client/web-shell/index_test.mjs: the root page sends the game to this site's own server, gateway and data
// folders whatever a link's query says, and passes the rest (?online=1, ?log) through.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("index.html", import.meta.url), "utf8");
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
let to = null;
const ctx = {
    URLSearchParams, SharedArrayBuffer, crossOriginIsolated: true, fetch: () => Promise.resolve(),
    document: { createElement: () => ({ getContext: () => ({}) }), getElementById: () => ({}), documentElement: {} },
    location: { search: "?game=yiaKk&cards=x&fonts=evil/&gateway=wss://evil/net&http=https://evil&server=6.6.6.6&online=1&log",
                origin: "https://ygoevolution.com", protocol: "https:", host: "ygoevolution.com", replace: (u) => (to = u) },
};
ctx.window = ctx;
vm.runInNewContext(script, ctx);
const q = new URLSearchParams(to.split("?")[1]);
assert.equal(q.has("game"), false);
assert.equal(q.has("cards"), false);
assert.equal(q.get("fonts"), "fonts/");
assert.equal(q.get("http"), "https://ygoevolution.com");
assert.equal(q.get("gateway"), "wss://ygoevolution.com/net");
assert.equal(q.get("server"), "127.0.0.1");
assert.equal(q.get("online"), "1");
assert.equal(q.has("log"), true);
console.log("index.html: all checks pass");
