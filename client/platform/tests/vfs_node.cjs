// Runs the web build of vfs_test (vfs_url.cpp: sync XHR + HTTP Range) under Node, against a local file.
//   node platform/tests/vfs_node.cjs build-web/platform/vfs_test_web.js <merge.dat>
// Starts a child Range server (this file, "serve" mode) on 127.0.0.1, installs a test-only synchronous
// XMLHttpRequest made of `curl` calls (Node has no XHR), runs the test, and kills the server on exit.
// The server answers HEAD and single-range GETs only, so nothing can ever send the whole 700 MB file.
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

if (process.argv[2] === "serve") {
    const file = process.argv[3], size = fs.statSync(file).size, route = "/" + path.basename(file);
    const server = http.createServer((req, res) => {
        if (req.url !== route) return res.writeHead(404).end();
        if (req.method === "HEAD")
            return res.writeHead(200, { "Content-Length": size, "Accept-Ranges": "bytes" }).end();
        const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || "");
        if (req.method !== "GET" || !m) return res.writeHead(400).end();   // no whole-file GETs
        const from = Number(m[1]), to = Math.min(Number(m[2]), size - 1);
        if (from > to) return res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        res.writeHead(206, {
            "Content-Length": to - from + 1,
            "Content-Range": `bytes ${from}-${to}/${size}`,
            "Accept-Ranges": "bytes",
        });
        fs.createReadStream(file, { start: from, end: to }).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => console.log(server.address().port));
    return;
}

const stats = { requests: 0, bytes: 0 };
class XMLHttpRequest {
    open(method, url, async) {
        if (async !== false) throw new Error("test XHR shim is synchronous only");
        Object.assign(this, { method, url, args: [], status: 0, responseText: "", headers: {} });
    }
    setRequestHeader(k, v) { this.args.push("-H", `${k}: ${v}`); }
    overrideMimeType() {}   // the body is always handed back as latin1 text: one char per byte
    send() {
        const args = ["-sS", this.method === "HEAD" ? "-I" : "-i", ...this.args, this.url];
        const out = execFileSync("curl", args, { maxBuffer: 8 << 20 });
        const sep = out.indexOf("\r\n\r\n");
        const lines = out.subarray(0, sep).toString("latin1").split("\r\n");
        this.status = Number(lines[0].split(" ")[1]);
        for (const l of lines.slice(1)) {
            const i = l.indexOf(":");
            this.headers[l.slice(0, i).toLowerCase()] = l.slice(i + 1).trim();
        }
        if (this.method !== "HEAD") this.responseText = out.subarray(sep + 4).toString("latin1");
        stats.requests++;
        stats.bytes += this.responseText.length;
    }
    getResponseHeader(k) { return this.headers[k.toLowerCase()] ?? null; }
}

const [testJs, file] = process.argv.slice(2);
const server = spawn(process.execPath, [__filename, "serve", file], { stdio: ["ignore", "pipe", "inherit"] });
process.on("exit", () => {
    server.kill();
    console.log(`xhr shim: ${stats.requests} requests, ${(stats.bytes / 1048576).toFixed(1)} MB`);
});
server.stdout.once("data", (d) => {
    server.unref();
    server.stdout.unref();   // the test's own exit ends the process; the "exit" hook stops the server
    globalThis.XMLHttpRequest = XMLHttpRequest;
    process.argv = [process.argv[0], testJs, `http://127.0.0.1:${String(d).trim()}/${path.basename(file)}`];
    require(path.resolve(testJs));
});
