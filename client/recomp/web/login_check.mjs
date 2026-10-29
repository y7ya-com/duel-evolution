// The 2008 User ID / Password dialog must never show (rt/session.cpp): a headless check of a web build, every way the
// login scene can be reached. Exit 1 if any canvas screenshot shows the 2008 dialog (tools/login2008.py) or a scenario
// never reaches the sign-in panel / the signed-in answer.
//   PW=<playwright-core dir> PUB=<build-web> [BROWSER=webkit] [GAME=<game dir>] [FONTS=<fonts dir>] node web/login_check.mjs [only]
// Scenarios: the page's session check signed out, failing (500), dropped, slow (5 s); signed in with ?online=1 (straight
// to the login, which fails: the gateway is a dead port, so the scene goes back to the title) and then, the session
// lapsed, ONLINE again. The updater HTTP (/yo2/, /app/) is forwarded to the live server, as web/serve.mjs does.
import { createServer } from "node:http";
import { createReadStream, statSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const D = process.env.HOME + "/Documents/GitHub/yo2-decomp-data/web";
const PUB = process.env.PUB, GAME = process.env.GAME || D + "/game", FONTS = process.env.FONTS || D + "/public/recomp/fonts";
const pw = createRequire(import.meta.url)(process.env.PW || "playwright-core");
if (!PUB) throw new Error("PUB=<build-web> is required");
const LIVE = "https://original.ygoevolution.com", SHOTS = mkdtempSync(join(tmpdir(), "login-check-"));
const sl = (ms) => new Promise((r) => setTimeout(r, ms));
let mode = "out";   // what /api/de/session does: out, in, 500, drop, slow

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const h = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store" };
  const J = (st, o) => { res.writeHead(st, { ...h, "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (/^\/(yo2|app)\/|^\/__warm/.test(p)) {
    try {
      const r = await fetch(LIVE + req.url);
      res.writeHead(r.status, { ...h, "Content-Type": r.headers.get("content-type") || "application/octet-stream" });
      return res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(502, h); return res.end(String(e)); }
  }
  if (p === "/api/de/session") {
    if (mode === "drop") return req.socket.destroy();
    if (mode === "500") return J(500, { error: "internal" });
    if (mode === "slow") await sl(5000);
    return J(200, mode === "in" ? { signedIn: true, userId: "u1", name: "Tester", roles: [] } : { signedIn: false });
  }
  if (p === "/api/de/discord-invite") return J(200, { inviteUrl: "https://discord.gg/test" });
  if (p.startsWith("/api/")) return J(401, { code: "INVALID_USERNAME_OR_PASSWORD" });
  const f = p.startsWith("/fonts/") ? FONTS + p.slice(6) : p === "/" ? PUB + "/yo2rc.html" : p === "/game/files.txt" ? FONTS + "/../game/files.txt" : p.startsWith("/game/") ? GAME + p.slice(5) : PUB + p;
  let st;
  try { if (p.includes("..")) throw 0; st = statSync(f); } catch { res.writeHead(404, h); return res.end(); }
  const type = { html: "text/html", js: "text/javascript", wasm: "application/wasm", json: "application/json" }[f.split(".").pop()] || "application/octet-stream";
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
  if (m) {
    const a = +m[1], b = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
    res.writeHead(206, { ...h, "Content-Type": type, "Content-Range": `bytes ${a}-${b}/${st.size}`, "Content-Length": b - a + 1 });
    return createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...h, "Content-Type": type, "Content-Length": st.size });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const URL0 = `${ORIGIN}/?http=${ORIGIN}&fonts=fonts/&server=127.0.0.1&YO2_PORT_OFFSET=1000&gateway=ws://127.0.0.1:9/net&RC_SCENE_LOG=1`;

const B = process.env.BROWSER || "chromium";   // webkit: the ASYNCIFY build (yo2rc.html picks it)
const browser = await pw[B].launch({ headless: true, args: B === "chromium" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [] });
const fails = [];
async function scenario(name, boot, query, steps) {
  if (process.argv[2] && process.argv[2] !== name) return;
  mode = boot;
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
  const log = [];
  page.on("console", (m) => log.push(m.text()));
  let n = 0;
  const watch = async (ms) => {   // shots every 250 ms (the canvas fills the 1024 x 768 page)
    let took = 0;
    for (const end = Date.now() + ms; Date.now() < end; await sl(250))
      took += await page.screenshot({ path: join(SHOTS, `${name}-${String(n++).padStart(4, "0")}.png`), timeout: 5000 }).then(() => 1, () => 0);
    if (!took) fails.push(`${name}: no screenshots`);
  };
  const hold = async (x, y) => { await page.mouse.move(x, y); await sl(400); await page.mouse.down(); await sl(400); await page.mouse.up(); };
  const until = async (what, fn, ms) => {
    for (const end = Date.now() + ms; Date.now() < end; await sl(500)) if (await page.evaluate(fn).catch(() => false)) return true;
    fails.push(`${name}: no ${what}`);
    return false;
  };
  await page.goto(URL0 + query);
  if (await until("first frames", () => (Module.yo2Presents | 0) > 60, 240000)) await steps({ page, log, watch, hold, until });
  const seen = log.filter((l) => /session:|yo2rc: (signed|no session|session check)/.test(l));
  console.log(`[${name}] ${seen.map((l) => l.slice(0, 90)).join(" | ")}`);
  await page.context().close();
}
const panelOrIn = (log) => log.some((l) => /session: (sign-in panel|signed in as)/.test(l));
const online = async (s, name) => {   // ONLINE on the title, then watch the login scene
  await sl(3000);
  await s.hold(512, 457);
  await s.watch(10000);
  if (!panelOrIn(s.log)) fails.push(`${name}: the login scene never showed the panel nor went straight in`);
};

await scenario("signed-out", "out", "", (s) => online(s, "signed-out"));
await scenario("session-500", "500", "", (s) => online(s, "session-500"));
await scenario("session-drop", "drop", "", (s) => online(s, "session-drop"));
await scenario("session-slow", "slow", "", (s) => online(s, "session-slow"));
await scenario("reconnect-lapsed", "in", "&online=1", async (s) => {
  await s.watch(15000);   // straight to the login, answered; the dead gateway: "There is no response from the server."
  if (!s.log.some((l) => /session: signed in as Tester/.test(l))) fails.push("reconnect-lapsed: ?online=1 did not go straight in");
  mode = "out";           // the session lapsed meanwhile
  s.log.length = 0;
  await s.hold(512, 436); // its OK: back to the title
  await s.watch(8000);
  await online(s, "reconnect-lapsed");
});

await browser.close();
server.close();
try {
  execFileSync("python3", ["-I", new URL("../tools/login2008.py", import.meta.url).pathname, ...(await import("node:fs")).readdirSync(SHOTS).map((f) => join(SHOTS, f))], { stdio: "inherit" });
} catch { fails.push("the 2008 login dialog was on screen"); }
console.log(fails.length ? `FAIL\n  ${fails.join("\n  ")}\n(shots: ${SHOTS})` : `PASS (shots: ${SHOTS})`);
process.exit(fails.length ? 1 : 0);
