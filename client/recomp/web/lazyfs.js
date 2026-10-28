// --pre-js for the web build of yo2rc: mounts the game folder (yo2.exe, merge.dat, Sound.dat, ...) as lazy files in
// MEMFS and sets the environment main.c reads. A lazy file is fetched with synchronous HTTP Range requests in 1 MB
// chunks through one capped LRU (the YOLaucher-web/web/lazydrive.js and platform/vfs scheme), so merge.dat (~700 MB)
// is never loaded whole. Guest file calls are plain POSIX calls on these files: k32io.c needs no web branch.
//
// Each base URL serves files.txt ("<size>\t<relative path>" per line, from `node web/serve.mjs --manifest <dir>`)
// and every file listed, with Range support. Query parameters (all optional):
//   game=<base URL>     the game folder (default game/)
//   fonts=<base URL>    TrueType fonts for GDI text, mounted at /fonts
//   http=<base URL>     WININET target: every request goes to <http><path> (YO2_HTTP)
//   gateway=<ws URL>    Boxedwine network gateway (YO2_GATEWAY)
//   server=<host>       every game socket connects to this host (YO2_SERVER)
//   UPPER_CASE=<value>  passed to the environment as is (RC_VERBOSE=1, RC_FRAMES=...)
Module.preRun = Module.preRun || [];
Module.preRun.push(() => {
    const q = new URLSearchParams(location.search);
    const CHUNK = 1 << 20, MAX_CHUNKS = 64;   // ponytail: one global 64 MB LRU, as lazydrive; per-file caps if files thrash
    const cache = new Map();                  // "url#chunk" -> Uint8Array, in use order

    function getChunk(url, size, i) {
        const key = url + "#" + i;
        let c = cache.get(key);
        if (c) { cache.delete(key); cache.set(key, c); return c; }
        const from = i * CHUNK, to = Math.min(from + CHUNK, size) - 1;
        const x = new XMLHttpRequest();
        x.open("GET", url, false);
        x.setRequestHeader("Range", `bytes=${from}-${to}`);
        x.overrideMimeType("text/plain; charset=x-user-defined");   // the only binary sync XHR the main thread allows
        x.send(null);
        const t = x.responseText;
        if (x.status !== 206 || t.length !== to - from + 1) throw new FS.ErrnoError(29);   // EIO; refuses a whole-file 200
        c = new Uint8Array(t.length);
        for (let k = 0; k < t.length; k++) c[k] = t.charCodeAt(k);
        cache.set(key, c);
        if (cache.size > MAX_CHUNKS) cache.delete(cache.keys().next().value);
        return c;
    }

    function mount(dir, base) {
        if (!base.endsWith("/")) base += "/";
        const x = new XMLHttpRequest();
        x.open("GET", base + "files.txt", false);
        x.send(null);
        if (x.status !== 200) throw new Error(`yo2rc: no manifest at ${base}files.txt (${x.status})`);
        let n = 0;
        for (const line of x.responseText.split("\n")) {
            const tab = line.indexOf("\t");
            if (tab < 0) continue;
            const size = Number(line.slice(0, tab)), rel = line.slice(tab + 1).replace(/\r$/, "");
            const path = dir + "/" + rel, parent = PATH.dirname(path);
            FS.mkdirTree(parent);
            const url = base + rel.split("/").map(encodeURIComponent).join("/");
            const node = FS.createFile(parent, PATH.basename(path), {}, true, false);
            Object.defineProperty(node, "usedBytes", { get: () => size });
            node.stream_ops = Object.assign({}, node.stream_ops, {
                read(stream, buffer, offset, length, pos) {
                    const end = Math.min(pos + length, size);
                    for (let p = pos; p < end;) {
                        const c = getChunk(url, size, Math.floor(p / CHUNK)), at = p % CHUNK;
                        const k = Math.min(end - p, c.length - at);
                        buffer.set(c.subarray(at, at + k), offset + (p - pos));
                        p += k;
                    }
                    return Math.max(0, end - pos);
                },
            });
            n++;
        }
        console.log(`yo2rc: ${dir} <- ${base} (${n} files)`);
    }

    mount("/game", q.get("game") || "game/");
    if (q.get("fonts")) mount("/fonts", q.get("fonts"));
    ENV.YO2_EXE = "/game/yo2.exe";
    ENV.YO2_GAME = "/game";
    // The game's own writes (options, the saved login, profiles/, the updater's lists) persist in IndexedDB:
    // loaded before main runs, saved every 5 s (syncfs only writes what changed) and when the page goes away.
    ENV.YO2_WRITE = "/overlay";
    FS.mkdir("/overlay");
    FS.mount(IDBFS, {}, "/overlay");
    addRunDependency("overlay");
    FS.syncfs(true, (e) => { if (e) console.log("yo2rc: overlay load failed", e); removeRunDependency("overlay"); });
    let saving = false;
    const save = () => { if (!saving) { saving = true; FS.syncfs(false, () => { saving = false; }); } };
    setInterval(save, 5000);
    addEventListener("pagehide", save);
    for (const [k, env] of [["http", "YO2_HTTP"], ["gateway", "YO2_GATEWAY"], ["server", "YO2_SERVER"]])
        if (q.get(k)) ENV[env] = q.get(k);
    for (const [k, v] of q) if (/^[A-Z][A-Z0-9_]*$/.test(k)) ENV[k] = v;   // e.g. ?RC_VERBOSE=1
    // The new server's sign-in, in the game's own UI (rt/session.cpp): ask <http>/api/de/session once (same origin, so
    // the cookie goes along). JSON = the new server: signed in -> YO2_SESSION_NAME (no login dialog); signed out ->
    // YO2_DISCORD_URL (the login dialog becomes the sign-in panel; Discord comes back to this page with ?online=1 ->
    // YO2_AUTO_ONLINE, straight past the title). Anything else (the legacy site's 404) changes nothing.
    {
        let top = window;
        try { if (window.top.location.href) top = window.top; } catch (e) {}   // a same-origin page around the game
        const tq = new URLSearchParams(top.location.search);
        const http = (ENV.YO2_HTTP || location.origin + location.pathname.replace(/[^/]*$/, "")).replace(/\/$/, "");
        const x = new XMLHttpRequest();
        x.open("GET", http + "/api/de/session", false);
        try {
            x.send(null);
            const s = x.status === 200 ? JSON.parse(x.responseText) : null;
            if (s && s.signedIn) {
                ENV.YO2_SESSION_NAME = s.name || "-";
                if (q.get("online") === "1" || tq.get("online") === "1") ENV.YO2_AUTO_ONLINE = "1";
            } else if (s) {
                ENV.YO2_DISCORD_URL = http + "/api/auth/sign-in/discord?return=" + encodeURIComponent(top.location.pathname);
                ENV.YO2_DE_HTTP = http;   // the typed User ID / Password sign in here before the game opens a socket
            }
            if (tq.has("online")) {   // a reload must not go online again
                tq.delete("online"); tq.delete("error");
                top.history.replaceState(null, "", top.location.pathname + (tq.size ? "?" + tq : "") + top.location.hash);
            }
            console.log(`yo2rc: ${!s ? "no session service (" + x.status + ")" : s.signedIn ? "signed in as " + (s.name || "(Discord)") : "signed out"}`);
        } catch (e) {
            console.log("yo2rc: session check failed", e);
        }
    }
});
