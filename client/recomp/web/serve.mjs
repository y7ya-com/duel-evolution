// Local server for the web build: cross-origin isolated (COOP/COEP, for SharedArrayBuffer) with HTTP Range.
//   node web/serve.mjs [port]            / -> build-web/, /game/ -> $YO2_GAME (files.txt made on the fly)
//   node web/serve.mjs --manifest <dir>  print <dir>'s files.txt (for the R2 copy)
//   YO2_DELAY=<ms> YO2_KBPS=<KB/s>      a slow network for /game/ Range reads: latency + size at that rate (stall repros);
//   YO2_SHARED=1                        ...through one shared link: active transfers split YO2_KBPS evenly (contention;
//                                       a client that aborts stops taking its share)
//   YO2_WEB=<dir>                       serve another web build at / (comparisons)
// The game files are Konami's: this binds to 127.0.0.1 only.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

function manifest(dir) {
    const out = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.isFile()) out.push(`${fs.statSync(p).size}\t${path.relative(dir, p).split(path.sep).join("/")}`);
        }
    })(dir);
    return out.join("\n") + "\n";
}

if (process.argv[2] === "--manifest") {
    process.stdout.write(manifest(process.argv[3]));
    process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const roots = {
    "/game/": process.env.YO2_GAME || process.env.HOME + "/Library/Containers/org.boxedwine/Data/yo2/game",
    "/": process.env.YO2_WEB || path.join(here, "..", "build-web"),
};
const types = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".txt": "text/plain" };

// YO2_SHARED: every 10 ms the link's bytes are split between the transfers on it
const link = new Set();
setInterval(() => {
    if (!link.size) return;
    const share = Math.ceil((+process.env.YO2_KBPS * 10) / link.size);   // KB/s * 10 ms = bytes
    for (const s of link) {
        s.res.write(s.buf.subarray(s.at, s.at + share)), (s.at += share);
        if (s.at >= s.buf.length) s.res.end(), link.delete(s);
    }
}, 10).unref();
http.createServer((req, res) => {
    const h = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
                "Accept-Ranges": "bytes" };
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const prefix = Object.keys(roots).find((p) => url.startsWith(p));
    const root = path.resolve(roots[prefix]);
    if (prefix === "/game/" && url === "/game/files.txt") return res.writeHead(200, h).end(manifest(root));
    const file = path.resolve(root, url.slice(prefix.length) || "yo2rc.html");
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
        return res.writeHead(404, h).end();
    const st = fs.statSync(file), size = st.size;
    // an ETag and Cache-Control like the live server's (server/src/worker.ts; multipart style, "-1"): lazyfs's scene
    // policies, store and card trickle need them
    const etag = `${size.toString(16)}${Math.floor(st.mtimeMs).toString(16)}-1`, v = new URL(req.url, "http://x").searchParams.get("v");
    h.ETag = `"${etag}"`;
    h["Cache-Control"] = v && v.replace(/\W/g, "") === etag.replace(/\W/g, "") ? "public, max-age=31536000, immutable" : "no-cache";
    h["Content-Type"] = types[path.extname(file)] || "application/octet-stream";
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    if (m) {
        const from = Number(m[1]), to = Math.min(m[2] ? Number(m[2]) : size - 1, size - 1);
        if (from > to) return res.writeHead(416, { ...h, "Content-Range": `bytes */${size}` }).end();
        const send = () => {
            res.writeHead(206, { ...h, "Content-Length": to - from + 1, "Content-Range": `bytes ${from}-${to}/${size}` });
            req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start: from, end: to }).pipe(res);
        };
        if (prefix !== "/game/" || !(process.env.YO2_DELAY || process.env.YO2_KBPS)) return send();
        if (process.env.YO2_SHARED && req.method !== "HEAD") return setTimeout(() => {
            res.writeHead(206, { ...h, "Content-Length": to - from + 1, "Content-Range": `bytes ${from}-${to}/${size}` });
            const buf = Buffer.alloc(to - from + 1), fd = fs.openSync(file, "r");
            fs.readSync(fd, buf, 0, buf.length, from), fs.closeSync(fd);
            const s = { res, buf, at: 0 };
            link.add(s), res.on("close", () => link.delete(s));
        }, +(process.env.YO2_DELAY || 0));
        return setTimeout(send, +(process.env.YO2_DELAY || 0) + (to - from + 1) / (+process.env.YO2_KBPS || Infinity));
    }
    res.writeHead(200, { ...h, "Content-Length": size });
    req.method === "HEAD" ? res.end() : fs.createReadStream(file).pipe(res);
}).listen(Number(process.argv[2]) || 8780, "127.0.0.1", function () {
    console.log(`yo2rc web: http://127.0.0.1:${this.address().port}/`);
});
