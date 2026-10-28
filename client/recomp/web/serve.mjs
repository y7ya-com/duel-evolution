// Local server for the web build: cross-origin isolated (COOP/COEP, for SharedArrayBuffer) with HTTP Range.
//   node web/serve.mjs [port]            / -> build-web/, /game/ -> $YO2_GAME (files.txt made on the fly)
//   node web/serve.mjs --manifest <dir>  print <dir>'s files.txt (for the R2 copy)
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
    "/": path.join(here, "..", "build-web"),
};
const types = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".txt": "text/plain" };

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
    const size = fs.statSync(file).size;
    h["Content-Type"] = types[path.extname(file)] || "application/octet-stream";
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    if (m) {
        const from = Number(m[1]), to = Math.min(m[2] ? Number(m[2]) : size - 1, size - 1);
        if (from > to) return res.writeHead(416, { ...h, "Content-Range": `bytes */${size}` }).end();
        res.writeHead(206, { ...h, "Content-Length": to - from + 1, "Content-Range": `bytes ${from}-${to}/${size}` });
        return req.method === "HEAD" ? res.end() : fs.createReadStream(file, { start: from, end: to }).pipe(res);
    }
    res.writeHead(200, { ...h, "Content-Length": size });
    req.method === "HEAD" ? res.end() : fs.createReadStream(file).pipe(res);
}).listen(Number(process.argv[2]) || 8780, "127.0.0.1", function () {
    console.log(`yo2rc web: http://127.0.0.1:${this.address().port}/`);
});
