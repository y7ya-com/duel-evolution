// --pre-js for the web build of yo2rc: mounts the game folder (yo2.exe, merge.dat, Sound.dat, ...) as lazy files in
// MEMFS and sets the environment main.c reads. A lazy file is read in 1 MB chunks; merge.dat (~700 MB) is never loaded
// whole. Guest file calls are plain POSIX calls on these files: k32io.c needs no web branch.
//
// Reads are synchronous on the browser's main thread (MEMFS lives there; pthread file calls are proxied to it), so a
// chunk not in memory is a synchronous HTTP Range request: the game stops until it arrives. Everything else here exists
// to make that rare, without changing what the game reads:
//   - memory: a 64 MB LRU of chunks, plus PINNED chunks a prefetch policy wants kept (capped, PIN_MAX)
//   - prefetch: async fetch() in the background (one at a time, aborted and queued again whenever a synchronous read
//     starts, so that read has the whole link) of
//       the hot set: the small merge.dat regions the menus and the deck editor read (thumbnails, deck UI, ...),
//       the maps next to the current one (the exe's map table, 0xd2d4d0), so a door is already in memory,
//       read-ahead: the next chunks after any synchronous miss
//   - persistence: every chunk fetched is also put in the Cache API (keyed by URL, the file's ETag and the chunk), and
//     the pinned chunks of the last session are loaded from it before the game starts: a returning player's hot set
//     and maps are in memory from the first frame. Cache API reads are async, so they can only feed memory ahead of
//     time, never a synchronous miss.
//   - the HTTP cache: every request carries ?v=<ETag>, so a server that sends long-lived Cache-Control for game files
//     lets the browser answer even a synchronous miss from disk; the low-priority card trickle (data/card, 336 MB)
//     only runs then, to fill that cache, and only with ?trickle=1: on for every player, it multiplied the origin's
//     load (live 2026-10-28, rolled back).
// merge.dat's directory (KCEJYUGI: count, then 268-byte entries: nibble-swapped name, offset, size, stored size) gives
// the byte span of each folder; the policies name folders.
//
// Each base URL serves files.txt ("<size>\t<relative path>" per line, from `node web/serve.mjs --manifest <dir>`)
// and every file listed, with Range support. Query parameters (all optional):
//   game=<base URL>     the game folder (default game/)
//   fonts=<base URL>    TrueType fonts for GDI text, mounted at /fonts
//   http=<base URL>     WININET target: every request goes to <http><path> (YO2_HTTP)
//   gateway=<ws URL>    Boxedwine network gateway (YO2_GATEWAY)
//   server=<host>       every game socket connects to this host (YO2_SERVER)
//   prefetch=0          no background fetches, no persistence (the plain lazy reads)
//   trickle=1           the data/card trickle (off by default)
//   UPPER_CASE=<value>  passed to the environment as is (RC_VERBOSE=1, RC_FRAMES=...)
// Module.yo2Lazy has the counters (sync misses and their wait, prefetched, persisted) for measurements; .duel is
// "npc" / "pvp" once a duel is being set up.
Module.preRun = Module.preRun || [];
Module.preRun.push(() => {
    const q = new URLSearchParams(location.search);
    // Opened on the live site with no query (a bookmark, a Discord return that lost it): the root page's defaults, so
    // every entry path works. Only on the site's own host; local and test pages always pass their own.
    if (/(^|\.)ygoevolution\.com$/.test(location.hostname) && !q.has("http")) {
        const set = (k, v) => q.has(k) || q.set(k, v);
        set("http", location.origin);
        set("gateway", (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/net");
        set("fonts", "fonts/");
        set("server", "127.0.0.1");
        set("YO2_PORT_OFFSET", "1000");
        history.replaceState(null, "", location.pathname + "?" + q + location.hash);
    }
    // MB of chunks; background fetches in flight (one: it never takes the link from a synchronous read). Phones and tablets (coarse pointer) keep half: the tab's whole footprint counts there
    const small = matchMedia("(pointer: coarse)").matches;
    const CHUNK = 1 << 20, LRU_MAX = small ? 32 : 64, PIN_MAX = small ? 112 : 224, PARALLEL = 1, SYNC_TRIES = 3, PAGE = 64 << 10, PAGES_MAX = 256, CARD_AHEAD = 256 << 10;
    const prefetchOn = q.get("prefetch") !== "0";
    const files = new Map();   // url -> {size, etag, ver}: ver is the "?v=" suffix of every request
    const lru = new Map();     // "url#chunk" -> Uint8Array, in use order
    const pinned = new Map();  // "url#chunk" -> {data, tag}
    const stats = { syncMiss: 0, syncMs: 0, worstMs: 0, syncRetry: 0, syncFail: 0, syncBytes: 0, pageHit: 0, artPlaceholder: 0, artFilled: 0, memHit: 0, prefetched: 0, fromStore: 0, persisted: 0, pinned: 0 };
    const missLog = [];   // the last 1000 synchronous misses (measurements: which stall, how long, which chunk)
    const L = (Module.yo2Lazy = { stats, files, lru, pinned, missLog });

    const keyOf = (url, i) => url + "#" + i;
    function memChunk(url, i) {
        const k = keyOf(url, i), p = pinned.get(k);
        if (p) return p.data;
        const c = lru.get(k);
        if (c) { lru.delete(k); lru.set(k, c); }
        return c;
    }
    function remember(url, i, data, tag) {   // tag: pin it under that policy; none: the LRU
        const k = keyOf(url, i);
        if (tag) {
            const p = pinned.get(k);
            if (p) { if (p.tag === "boot") p.tag = tag; return; }   // a policy claims the boot preload; never another's pin
            if (pinned.size >= PIN_MAX) tag = null;
            else { lru.delete(k); pinned.set(k, { data, tag }); return; }
        }
        if (pinned.has(k)) return;
        lru.set(k, data);
        if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value);
    }
    // a policy lets a pin go: another policy that still wants the chunk takes it over, else
    // back to the LRU (the newest end). A chunk two policies want (a scene set and the duel effects) keeps one tag.
    const wants = new Map();   // "url#chunk" -> every policy tag that asked for it (want)
    function release(k, p) {
        const w = wants.get(k);
        if (w) w.delete(p.tag);
        if (w && w.size) p.tag = w.values().next().value;
        else pinned.delete(k), lru.set(k, p.data);
    }
    function unpin(test) {   // policy changed its mind
        for (const [k, t] of wanted) if (test(t)) wanted.delete(k);
        for (const [, w] of wants) for (const t of w) if (test(t)) w.delete(t);
        for (const [k, p] of pinned) if (test(p.tag)) release(k, p);
        while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value);
    }
    const span = (url, i) => { const f = files.get(url); return [i * CHUNK, Math.min((i + 1) * CHUNK, f.size) - 1]; };

    // ---- persistence (Cache API: async only)
    const store = prefetchOn && typeof caches !== "undefined" ? caches.open("yo2-chunks-v1").catch(() => null) : null;
    const storeKey = (url, i) => new URL(`${url}${url.includes("?") ? "&" : "?"}chunk=${i}&v=${encodeURIComponent(files.get(url).etag)}`, location.href).href;
    const persisted = new Set();
    function persist(url, i, data) {
        const f = files.get(url);
        if (!store || !f.etag || persisted.has(keyOf(url, i))) return;
        persisted.add(keyOf(url, i));
        store.then((c) => c && c.put(storeKey(url, i), new Response(data))).then(() => stats.persisted++, () => {});
    }
    async function fromStore(url, i) {
        const c = store && files.get(url).etag && (await store);
        const r = c && (await c.match(storeKey(url, i)));
        return r ? new Uint8Array(await r.arrayBuffer()) : null;
    }

    // ---- the synchronous read path
    // One synchronous Range read [from, to] of url (logged as chunk i): asked again on a timeout, a drop or a 5xx.
    // A mobile network can stall or drop one read (iOS: "TimeoutError" thrown by send, or status 0), and the game ends
    // the session on EIO. A sync XHR on the page can't take a timeout.
    function syncRange(url, from, to, i) {
        const t0 = performance.now(), name = url.slice(url.lastIndexOf("/") + 1);
        for (const ac of aborts.values()) ac.abort();   // the background yields the link (fetchChunk queues it again)
        let t = null, err = "", tries = 0;
        while (t === null && tries < SYNC_TRIES) {
            tries++;
            const x = new XMLHttpRequest();
            try {
                x.open("GET", url + files.get(url).ver, false);
                x.setRequestHeader("Range", `bytes=${from}-${to}`);
                x.overrideMimeType("text/plain; charset=x-user-defined");   // the only binary sync XHR the main thread allows
                x.send(null);
            } catch (e) { err = e && e.name || "send"; continue; }
            const r = x.responseText;
            if (x.status === 206 && r.length === to - from + 1) t = r;
            else if (x.status === 206 || x.status === 0 || x.status >= 500) err = x.status + (x.status === 206 ? " short" : "");
            else { err = String(x.status); break; }   // 4xx, or a whole-file 200: asking again won't help
        }
        const ms = performance.now() - t0;
        // [t, ms, file, chunk] (web/stall.js), plus the failed tries and the last error when a try failed
        missLog.push(tries > 1 || t === null ? [Math.round(t0), Math.round(ms), name, i, tries - (t === null ? 0 : 1), err] : [Math.round(t0), Math.round(ms), name, i]);
        if (missLog.length > 1000) missLog.shift();
        if (t === null) { stats.syncFail++; throw new FS.ErrnoError(29); }   // EIO
        if (tries > 1) stats.syncRetry += tries - 1;
        const c = new Uint8Array(t.length);
        for (let k = 0; k < t.length; k++) c[k] = t.charCodeAt(k);
        stats.syncMiss++, stats.syncMs += ms, stats.syncBytes += c.length, stats.worstMs = Math.max(stats.worstMs, ms);
        return c;
    }
    function getChunk(url, i) {   // the whole chunk, synchronously
        let c = memChunk(url, i);
        if (c) { stats.memHit++; return c; }
        const [from, to] = span(url, i);
        c = syncRange(url, from, to, i);
        remember(url, i, c, wanted.get(keyOf(url, i)));
        persist(url, i, c);
        onMiss(url, i);
        return c;
    }
    // Bytes [at, at + n) of chunk i. Big card art (data/card, ~100 KB per card, read scattered while the player scrolls
    // a card list: field stalls of 1-4 whole-chunk misses, 2-4.8 s at ~1 MB/s, scenes 0x24-0x27) not in memory: ONE
    // synchronous read of the PAGE-sized pages from the read on, CARD_AHEAD at least (a whole card and the CRT's
    // buffered read after it), within the chunk. No whole chunk or read-ahead follows: the next card is anywhere.
    // Everything else reads whole chunks (a 3-client soak: pages everywhere cost more requests, each paying the
    // latency, than the bytes they saved).
    const pages = new Map();   // "url#chunk/page" -> Uint8Array, in use order (PAGES_MAX)
    // data/card's span (contiguous in merge.dat): the game reads it through the CRT's buffered reads, a few KB, then
    // ~150 KB running past the file's end into the next card's (mvp-iotrace-deck)
    // (card.dat, the 2x art, is all card art)
    const inCardArt = (url, pos, n) => {
        if (url === cardArc) return true;
        const c = url === archive && spans && spans.get("data/card");
        return !!c && c[0] <= pos && pos + n <= c[1];
    };
    function chunkBytes(url, i, at, n) {
        if (url === archive && sceneReads && sceneReads.size < SCENE_MAX) sceneReads.add(i);
        const c = memChunk(url, i);
        if (c) return stats.memHit++, c.subarray(at, at + n);
        const p0 = Math.floor(at / PAGE), p1 = Math.floor((at + n - 1) / PAGE), pk = (pg) => keyOf(url, i) + "/" + pg;
        if (!prefetchOn || !inCardArt(url, i * CHUNK + at, n) || (p1 - p0 + 1) * PAGE * 2 > CHUNK)
            return getChunk(url, i).subarray(at, at + n);
        let a = p0;
        while (a <= p1 && pages.has(pk(a))) a++;
        if (a <= p1) {   // a page the read needs is missing: it, through the look-ahead, in one request
            const [from, to] = span(url, i);
            let b = Math.min(Math.floor((at + Math.max(n, CARD_AHEAD) - 1) / PAGE), Math.floor((to - from) / PAGE));
            while (b > p1 && pages.has(pk(b))) b--;
            const d = syncRange(url, from + a * PAGE, Math.min(from + (b + 1) * PAGE - 1, to), i);
            for (let pg = a; pg <= b; pg++) pages.set(pk(pg), d.subarray((pg - a) * PAGE, (pg - a + 1) * PAGE));
            while (pages.size > PAGES_MAX) pages.delete(pages.keys().next().value);
        } else stats.pageHit++;
        const out = new Uint8Array(n);
        for (let pg = p0; pg <= p1; pg++) {
            const d = pages.get(pk(pg)), lo = Math.max(at, pg * PAGE), hi = Math.min(at + n, pg * PAGE + d.length);
            pages.delete(pk(pg)), pages.set(pk(pg), d);   // in use order
            out.set(d.subarray(lo - pg * PAGE, hi - pg * PAGE), lo - at);
        }
        return out;
    }

    // ---- background fetches: a priority queue, PARALLEL at a time
    const queue = [];            // {url, i, pri, tag, keep}: lower pri first
    const wanted = new Map();    // "url#chunk" -> the pin tag a queued or policy chunk should get
    let running = 0, runningLow = 0;   // low: the card trickle, one at a time
    const inflight = new Map();          // "url#chunk" being fetched -> that fetch (a second asker waits for it)
    const aborts = new Map();            // "url#chunk" -> the AbortController of its network fetch
    L.queueLen = () => queue.length + running;
    function want(url, i, pri, tag, keep = true) {
        const f = files.get(url);
        if (!prefetchOn || !f || i < 0 || i * CHUNK >= f.size) return;
        const k = keyOf(url, i);
        if (tag) wanted.set(k, tag), (wants.get(k) || wants.set(k, new Set()).get(k)).add(tag);
        const m = memChunk(url, i);
        if (m) { if (tag) remember(url, i, m, tag); return; }
        if (inflight.has(k)) return;   // its fetch picks the tag up from `wanted`
        const old = queue.find((j) => j.url === url && j.i === i);
        if (old) { if (pri < old.pri) old.pri = pri; if (tag) old.tag = tag; return; }
        queue.push({ url, i, pri, tag, keep });
        pump();
    }
    let holding = false;   // the boot's hold: the queue waits, the title's reads have the link
    function pump() {
        while (!holding && running < PARALLEL && queue.length) {
            queue.sort((a, b) => a.pri - b.pri);
            if (queue[0].pri >= 9 && runningLow) break;
            const j = queue.shift(), low = j.pri >= 9;
            const m = memChunk(j.url, j.i);
            if (m) { if (j.tag) remember(j.url, j.i, m, j.tag); continue; }   // came in meanwhile (the boot's hold): its tag still applies
            running++, runningLow += low;
            fetchChunk(j).catch(() => {}).finally(() => { running--, runningLow -= low; pump(); });
        }
    }
    function fetchChunk(j) {
        const k = keyOf(j.url, j.i);
        if (inflight.has(k)) return inflight.get(k);
        const p = (async () => {
            try { await fetchChunk2(j); }
            catch (e) { if (e && e.name === "AbortError") queue.push(j); else throw e; }   // a sync read took the link
            finally { inflight.delete(k), aborts.delete(k); }
        })();
        inflight.set(k, p);
        return p;
    }
    async function fetchChunk2(j) {
        let data = j.keep ? await fromStore(j.url, j.i) : null;   // the trickle only fills the HTTP cache
        if (data) stats.fromStore++;
        else {
            const [from, to] = span(j.url, j.i);
            const ac = new AbortController();
            aborts.set(keyOf(j.url, j.i), ac);
            const r = await fetch(j.url + files.get(j.url).ver, { headers: { Range: `bytes=${from}-${to}` }, signal: ac.signal });
            if (r.status !== 206) return;
            data = new Uint8Array(await r.arrayBuffer());
            if (data.length !== to - from + 1) return;
            if (/max-age=[1-9]|immutable/.test(r.headers.get("Cache-Control") || "")) cacheable = true;   // the versioned reply
            stats.prefetched++;
            if (j.keep) persist(j.url, j.i, data);
        }
        if (j.keep && !memChunk(j.url, j.i)) remember(j.url, j.i, data, j.tag || wanted.get(keyOf(j.url, j.i)));
        if (!spans && j.url === archive) parseToc();
    }

    // ---- policies (merge.dat only)
    // The exe's map table (yo2FieldMap.cpp, DAT_00d2d4d0): which maps a map's doors lead to. My Room (r01) leads to
    // whichever lobby the gate picks: the last one visited, else a02 (the beginners' lobby).
    const MAPS = ["d01_01", "d02", "d03", "d04_01", "a01", "a02", "a03", "a04", "r01", "d05"];
    const NEXT = { d01_01: ["d02", "d03", "d04_01"], d02: ["d01_01"], d03: ["d01_01"], d04_01: ["d01_01", "d05"],
                   a01: ["a02", "a04"], a02: ["a01", "a03"], a03: ["a02"], a04: ["a01"], d05: ["d04_01"] };
    const HOT = ["data/mini", "data/deck", "data/common", "data/menu", "data/bin#"];   // ~40 MB
    const AVATARS = ["data/avatar/chibi", "data/avatar/npc"];   // ~34 MB, once the player is on a map
    const TRICKLE = ["data/card"];
    let archive = null, spans = null, curMap = null;
    // merge.dat's directory from its gzip sidecar <merge.dat>.dir.gz (client/tools/mergedir.py: ~250 KB for the 5.2 MB of
    // chunks every cold boot reads before the title), used only when it matches this merge.dat; else the chunks as before
    let dirBuf = null;
    async function dirSidecar() {
        try {
            const r = await fetch(archive + ".dir.gz", { cache: "no-cache" });
            if (r.status !== 200) return null;
            const rd = new Blob([await r.arrayBuffer()]).stream().pipeThrough(new DecompressionStream("gzip")).getReader(), parts = [];
            for (let x; !(x = await rd.read()).done;) parts.push(x.value);
            const b = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)), d = b.subarray(16);
            parts.reduce((at, x) => (b.set(x, at), at + x.length), 0);
            const magic = String.fromCharCode(...b.subarray(0, 8)), size = new DataView(b.buffer, b.byteOffset + 8, 8).getBigUint64(0, true);
            const n = d[8] | d[9] << 8 | d[10] << 16 | (d[11] << 24 >>> 0);
            return magic === "YO2DIR1\0" && Number(size) === files.get(archive).size && d.length === 12 + n * 268 ? d : null;
        } catch { return null; }
    }
    // 2x card art (tools/cardart.py): merge/data/card.dat and mini.dat, KCEJYUGI archives the exe opens before
    // merge.dat (entries named by passcode, list_card.txt inside). With them, merge.dat's data/card and data/mini are
    // never read: mini.dat (~22 MB) is the hot thumbnails, card.dat (~210 MB) the deck/NPC art and the trickle.
    let cardArc = null, miniArc = null, mergeLog = null;
    const cardFiles = new Map();   // card.dat entry name -> [from, to)
    function* tocEntries(toc, end) {   // [name (lower case, '/'), offset, stored size, size] per directory entry
        for (let e = 12; e < end; e += 268) {
            let name = "";
            for (let k = 0; k < 256; k++) {
                const b = toc[e + k], c = ((b & 15) << 4) | (b >> 4);
                if (!c) break;
                name += String.fromCharCode(c === 92 ? 47 : c);
            }
            const u32 = (o) => toc[e + o] | toc[e + o + 1] << 8 | toc[e + o + 2] << 16 | (toc[e + o + 3] << 24 >>> 0);
            yield [name.toLowerCase(), u32(256), u32(264), u32(260)];
        }
    }
    let cardTocLoad = null;
    // a chunk into memory, fetched again when a synchronous read aborted it (up to 5 tries)
    const fetchSure = async (url, i, tag) => { for (let k = 0; k < 5 && !memChunk(url, i); k++) await fetchChunk({ url, i, pri: 0, tag, keep: true }); };
    const cardToc = () => (cardTocLoad = cardTocLoad || (async () => {   // card.dat's directory (~870 KB: chunk 0)
        await fetchSure(cardArc, 0, "toc");
        const first = memChunk(cardArc, 0);
        if (!first) throw new Error("card.dat directory not read");
        const n = first[8] | first[9] << 8 | first[10] << 16 | first[11] << 24, end = 12 + n * 268;
        const toc = new Uint8Array(end);
        for (let i = 0; i * CHUNK < end; i++) {
            await fetchSure(cardArc, i, "toc");
            const c = memChunk(cardArc, i);
            if (!c) throw new Error("card.dat directory not read");
            toc.set(c.subarray(0, Math.min(CHUNK, end - i * CHUNK)), i * CHUNK);
        }
        for (const [name, off, len] of tocEntries(toc, end)) cardFiles.set(name, [off, off + len]);
    })().catch((e) => { cardTocLoad = null; throw e; }));
    // ---- card art without waiting (card.dat). A read inside a JPEG entry that isn't all in memory gets a placeholder
    // JPEG of the same 400x580 instead (padded with zeros to the entry's length), with the entry's offset in its comment
    // ("yo2-placeholder:<10 digits>"); its chunks go first in the background queue. ovr/decode.c makes the texture from
    // the placeholder as usual and, each frame, asks artBytes(offset) for the real bytes and fills that same texture.
    // The game's frame never waits for card art (field: card lists froze 2-4.8 s per card at ~1 MB/s).
    // ?cardsync=1: the synchronous read as before.
    const artAsync = prefetchOn && !q.has("cardsync");
    const PLACEHOLDER = Uint8Array.from(atob("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SpqKLBch2N6U2rFV6BhRRRQBs2n/AB7r+P8AOrFV7T/j3X8f51YrRbEM/9Tjqr3f/Hu34fzqxVe7/wCPdvw/nXW9jBGNRRRWZYVYqvVihAwooopiCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACq9WKr0mNBRRRQBs2n/Huv4/zqxVe0/491/H+dWK0WxDP//V46q93/x7t+H86sVXu/8Aj3b8P511vYwRjUUUVmWFWKr1YoQMKKKKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqvViq9JjQUUUUAbNp/x7r+P86sVXtP+Pdfx/nVitFsQz//1uOqvd/8e7fh/OrFV7v/AI92/D+ddb2MEY1FFFZlhViq9WKEDCiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKr1YqvSY0FFFFAGzaf8e6/j/OrFV7T/j3X8f51YrRbEM//9fjqr3f/Hu34fzqxVe7/wCPdvw/nXW9jBGNRRRWZYVYqvVihAwooopiCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACq9WKr0mNBRRRQBs2n/Huv4/zqxVe0/491/H+dWK0WxDP//Q46q93/x7t+H86sVXu/8Aj3b8P511vYwRjUUUVmWFWKr1YoQMKKKKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqvViq9JjQUUUUAbNp/x7r+P86sVXtP+Pdfx/nVitFsQz//0eOqvd/8e7fh/OrFV7v/AI92/D+ddb2MEY1FFFZlhViq9WKEDCiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKr1YqvSY0FFFFAGzaf8e6/j/OrFV7T/j3X8f51YrRbEM//9Ljqr3f/Hu34fzqxVe7/wCPdvw/nXW9jBGNRRRWZYVYqvVihAwooopiCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACq9WKr0mNBRRRQBs2n/Huv4/zqxVe0/491/H+dWK0WxDP//T46q93/x7t+H86sVXu/8Aj3b8P511vYwRjUUUVmWFWKr1YoQMKKKKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqvViq9JjQUUUUAbNp/x7r+P86sVXtP+Pdfx/nVitFsQz//1OOqvd/8e7fh/OrFV7v/AI92/D+ddb2MEY1FFFZlhViq9WKEDCiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKr1YqvSY0FFFFAGzaf8e6/j/OrFV7T/j3X8f51YrRbEM//9Xjqr3f/Hu34fzqxVe7/wCPdvw/nXW9jBGNRRRWZYVYqvVihAwooopiCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACq9WKr0mNBRRRQBs2n/Huv4/zqxVe0/491/H+dWK0WxDP//W46q93/x7t+H86sVXu/8Aj3b8P511vYwRjUUUVmWFWKr1YoQMKKKKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqvViq9JjQUUUUAbNp/x7r+P86sVXtP+Pdfx/nVitFsQz//1+Oqvd/8e7fh/OrFV7v/AI92/D+ddb2MEY1FFFZlhViq9WKEDCiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKr1YqvSY0FFFFAGzaf8e6/j/OrFV7T/j3X8f51YrRbEM//9Djqr3f/Hu34fzqxVe7/wCPdvw/nXW9jBGNRRRWZYVYqvVihAwooopiCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACq9WKr0mNBRRRQBs2n/Huv4/zqxVe0/491/H+dWK0WxDP//R46q93/x7t+H86sVXu/8Aj3b8P511vYwRjUUUVmWFWKr1YoQMKKKKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqvViq9JjQUUUUAbNp/x7r+P86sVXtP+Pdfx/nVitFsQz//0uOqvd/8e7fh/OrFV7v/AI92/D+ddb2MEY1FFFZlhViq9WKEDCiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKr1YqvSY0FFFFAGzaf8e6/j/OrFV7T/j3X8f51YrRbEM//9Pjqr3f/Hu34fzqxVe7/wCPdvw/nXW9jBGNRRRWZYVYqvTt7etAE1FQ729aN7etFxWJqKh3t60b29aLhYmoqHe3rRvb1ouFiaiod7etG9vWi4WJqKh3t60b29aLhYmoqHe3rRvb1ouFiaiod7etG9vWi4WJqKh3t60b29aLhYmoqHe3rRvb1ouFiaiod7etG9vWi4WJqKh3t60b29aLhYmoqHe3rRvb1ouFiaiod7etG9vWi4WJqKh3t60b29aLhYmoqHe3rRvb1ouFiaiod7etG9vWi4WJqKh3t60b29aLhYmoqHe3rRvb1ouFiaiod7etG9vWi4WJqr07e3rTaBhRRRQBs2n/AB7r+P8AOrFV7T/j3X8f51YrRbEM/9Tjqr3f/Hu34fzqxVe7/wCPdvw/nXW9jBGNRRRWZYUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAbNp/x7r+P86sVXtP+Pdfx/nVitFsQz//V46q93/x7t+H8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"), (c) => c.charCodeAt(0));
    const PH_DIGITS = PLACEHOLDER.indexOf(58) + 1;   // after "yo2-placeholder:" (its first ':')
    let artSorted = null;   // card.dat's .jpg entries as sorted [from, to)
    const resident = (url, e) => { for (let i = Math.floor(e[0] / CHUNK); i * CHUNK < e[1]; i++) if (!memChunk(url, i)) return false; return true; };
    function artWant(e) { for (let i = Math.floor(e[0] / CHUNK); i * CHUNK < e[1]; i++) want(cardArc, i, 0, wanted.get(keyOf(cardArc, i))); }
    function artRead(buffer, offset, pos, end) {   // the read with placeholders, or false (nothing missing: as usual)
        if (!artSorted) {
            if (!cardFiles.size) return cardToc().catch(() => {}), false;   // not here yet (or its load failed): again
            artSorted = [...cardFiles].filter(([n]) => n.endsWith(".jpg")).map(([, e]) => e).sort((a, b) => a[0] - b[0]);
        }
        let lo = 0, hi = artSorted.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (artSorted[m][1] <= pos) lo = m + 1; else hi = m; }
        const missing = [];
        for (let k = lo; k < artSorted.length && artSorted[k][0] < end; k++) if (!resident(cardArc, artSorted[k])) missing.push(artSorted[k]);
        if (!missing.length) return false;
        let p = pos;
        for (const e of missing) {
            const a = Math.max(pos, e[0]), b = Math.min(end, e[1]), digits = String(e[0]).padStart(10, "0");
            if (p < a) readReal(cardArc, buffer, offset + p - pos, p, a);
            for (let x = a; x < b; x++) {
                const k = x - e[0];
                buffer[offset + x - pos] = k >= PLACEHOLDER.length ? 0 : k >= PH_DIGITS && k < PH_DIGITS + 10 ? digits.charCodeAt(k - PH_DIGITS) : PLACEHOLDER[k];
            }
            if (a === e[0]) stats.artPlaceholder++;
            artWant(e);
            p = b;
        }
        if (p < end) readReal(cardArc, buffer, offset + p - pos, p, end);
        return true;
    }
    L.artBytes = (off) => {   // ovr/decode.c: the entry at `off`, once all its chunks are in memory (else asked for again)
        let lo = 0, hi = artSorted ? artSorted.length - 1 : -1;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (artSorted[m][0] <= off) lo = m; else hi = m - 1; }
        const e = hi >= 0 && artSorted[lo][0] === off ? artSorted[lo] : null;
        if (!e) return new Uint8Array(0);   // not card art: nothing to wait for (decode.c drops it)
        if (!resident(cardArc, e)) return artWant(e), null;
        const buf = new Uint8Array(e[1] - e[0]);
        readReal(cardArc, buf, 0, e[0], e[1]);
        stats.artFilled++;
        return buf;
    };
    function wantFile(url, pri, tag) {   // every chunk of a lazy file
        const f = files.get(url);
        if (f) for (let i = 0; i * CHUNK < f.size; i++) want(url, i, pri, tag);
    }
    // mini.dat (~22 MB, every card's thumbnail: the trunk and deck lists never wait) is preloaded, except over a metered
    // link: Save-Data, cellular, and on phones and tablets anything not known to be Wi-Fi or Ethernet
    const thumbsOk = () => {
        const c = typeof navigator !== "undefined" && navigator.connection;
        if (c && (c.saveData || c.type === "cellular")) return false;
        return !small || !!(c && (c.type === "wifi" || c.type === "ethernet"));
    };
    const lastLobby = () => { try { return localStorage.getItem("yo2-lazy-lobby"); } catch { return null; } };
    function wantSpan(dir, pri, tag, keep = true) {
        const s = spans && spans.get(dir);
        if (s) for (let i = Math.floor(s[0] / CHUNK); i * CHUNK < s[1]; i++) want(archive, i, pri, tag, keep);
    }
    function parseToc() {   // once chunks 0.. of the directory are in memory (or the sidecar): the byte span of each folder
        const f = files.get(archive), first = dirBuf || memChunk(archive, 0);
        if (spans || !first) return;
        const n = first[8] | first[9] << 8 | first[10] << 16 | first[11] << 24, end = 12 + n * 268;
        const need = Math.ceil(end / CHUNK), toc = dirBuf || new Uint8Array(end);
        for (let i = 0; i < need && !dirBuf; i++) {
            const c = memChunk(archive, i);
            if (!c) { for (let k = i; k < need; k++) want(archive, k, 0, "toc"); return; }   // when they arrive
            toc.set(c.subarray(0, Math.min(CHUNK, end - i * CHUNK)), i * CHUNK);
        }
        spans = new Map();
        for (const [name, off, len, orig] of tocEntries(toc, end)) {
            const parts = name.split("/"), dirs = [parts.slice(0, 2).join("/")];
            if (name.startsWith("data/card/") || /^data\/y2?\/duel/.test(name)) files2.set(name, [off, off + len, orig]);
            if ((parts[1] === "map" || parts[1] === "avatar") && parts.length > 3) dirs.push(parts.slice(0, 3).join("/"));
            if ((parts[1] === "y" || parts[1] === "y2") && parts[2] === "duel" && parts.length > 4) dirs.push(parts.slice(0, 4).join("/"));
            for (const d of dirs) {
                const s = spans.get(d);
                if (s) { s[0] = Math.min(s[0], off); s[1] = Math.max(s[1], off + len); } else spans.set(d, [off, off + len]);
            }
        }
        L.spans = spans;
        if (pendingDeck) prefetchCards(pendingDeck);
        for (let i = 0; i < need; i++) { const c = memChunk(archive, i); if (c) remember(archive, i, c, "toc"); }   // read at every start: kept
        for (const d of HOT) if (!(miniArc && d === "data/mini")) wantSpan(d, 2, "hot");
        if (miniArc && thumbsOk()) wantFile(miniArc, 2, "hot");
        // ponytail: opt-in, never on phones and tablets (data/card is 336 MB of their data plan); per-player origin cost
        // has to be measured (and capped) before it is on by default
        onIdle(() => {
            if (!cacheable || small || q.get("trickle") !== "1") return;
            if (cardArc) { const f = files.get(cardArc); for (let i = 0; i * CHUNK < f.size; i++) want(cardArc, i, 9, null, false); }
            else for (const d of TRICKLE) wantSpan(d, 9, null, false);
        });
    }
    // The duel's cards: the player's deck (rt/decktap.c reads it off the exe's own 0x6601/0x6603 at the duel's setup)
    // and the NPC's (the server, npcDeck below). A deck holds YO2 card ids; data/card/list_card.txt (LZSS in merge.dat)
    // names each id's big art, line N for id N ("5226.png", "4044_2.png", ...). Each card's art (~100 KB) is pinned
    // while rock-paper-scissors runs, so a card first shown mid-duel is in memory.
    const files2 = new Map();   // the duel's files and card art: name -> [from, to) in merge.dat, original size
    let cardNames = null;       // list_card.txt: YO2 card id -> art file name
    function lzss(src, size) {   // Okumura's LZSS as merge.dat stores it: 4 KB ring from 0xFEE, flags LSB first (1 = byte)
        const ring = new Uint8Array(4096), out = new Uint8Array(size);
        let r = 0xfee, i = 0, o = 0;
        while (i < src.length && o < size) {
            const flags = src[i++];
            for (let bit = 0; bit < 8 && i < src.length && o < size; bit++)
                if (flags & (1 << bit)) { const c = src[i++]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xfff; }
                else {
                    const b1 = src[i++], b2 = src[i++], off = b1 | ((b2 & 0xf0) << 4), len = (b2 & 0x0f) + 3;
                    for (let k = 0; k < len && o < size; k++) { const c = ring[(off + k) & 0xfff]; out[o++] = c; ring[r] = c; r = (r + 1) & 0xfff; }
                }
        }
        return out;
    }
    async function entryBytes(url, e) {   // [from, to, size?) of a lazy archive, through the chunk cache
        const buf = new Uint8Array(e[1] - e[0]);
        for (let i = Math.floor(e[0] / CHUNK); i * CHUNK < e[1]; i++) {
            await fetchSure(url, i);
            const c = memChunk(url, i);
            if (!c) return null;
            const from = Math.max(e[0], i * CHUNK), to = Math.min(e[1], (i + 1) * CHUNK);
            buf.set(c.subarray(from - i * CHUNK, to - i * CHUNK), from - e[0]);
        }
        return e[2] === undefined || buf.length === e[2] ? buf : lzss(buf, e[2]);
    }
    async function fileBytes(name) {   // a merge.dat entry, through the chunk cache (fetched in the background)
        const e = files2.get(name);
        return e ? entryBytes(archive, e) : null;
    }
    // A card's art: merge.dat's data/card/<name>, or with card.dat its <passcode>.jpg there
    const artEntry = (name) => (cardArc ? [cardArc, cardFiles.get(name)] : [archive, files2.get("data/card/" + name)]);
    let cardNumbers = null;     // merge.dat's list_card.txt: YO2 card id -> Konami card number ("4336.png"), for the fields
    const lines = (b) => { let t = ""; for (const c of b) t += String.fromCharCode(c); return t.split(/\r?\n/).map((x) => x.trim().toLowerCase()); };
    let cardNamesLoad = null;
    const loadCardNames = () => (cardNamesLoad = cardNamesLoad || (async () => {
        const orig = await fileBytes("data/card/list_card.txt");
        if (!orig) throw new Error("list_card.txt not read");
        cardNumbers = lines(orig);
        if (!cardArc) return void (cardNames = cardNumbers);
        await cardToc();
        const e = cardFiles.get("list_card.txt"), b = e && (await entryBytes(cardArc, e));
        if (!b) throw new Error("card.dat list_card.txt not read");
        cardNames = lines(b);
    })().catch(() => { cardNamesLoad = null; }));   // a dropped connection: no names this time, the next call asks again
    // these files' chunks ([url, [from, to)] each), pinned under `tag` (replacing that tag's others)
    function pinFiles(entries, tag, pri) {
        const keep = new Map();   // "url#i" -> [url, i]
        for (const [url, e] of entries)
            if (e) for (let i = Math.floor(e[0] / CHUNK); i * CHUNK < e[1]; i++) keep.set(keyOf(url, i), [url, i]);
        for (const [k, p] of pinned) if (p.tag === tag && !keep.has(k)) release(k, p);
        while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value);
        for (const [url, i] of keep.values()) want(url, i, pri, tag);
        return keep.size;
    }
    const mergeFiles = (names) => names.map((n) => [archive, files2.get(n)]);
    let pendingDeck = null;
    async function prefetchCards(ids, tag = "deck") {   // "deck": the player's (rt/decktap.c); "npc": the NPC's (the server)
        if (!prefetchOn || !archive) return;
        if (!spans) { if (tag === "deck") pendingDeck = ids; return; }
        if (tag === "deck") pendingDeck = null;
        await loadCardNames();
        const names = [...new Set(ids.map((id) => (cardNames || [])[id]).filter(Boolean))];
        stats[tag + "Cards"] = ids.length, stats[tag + "Chunks"] = pinFiles(names.map(artEntry), tag, 2);
    }
    L.prefetchCards = prefetchCards;
    L.files2 = files2;
    L.cardIds = async (names) => { await loadCardNames(); return names.map((n) => (cardNames || []).indexOf(n)).filter((i) => i > 0); };
    function mapAt(pos) {
        for (const m of MAPS) { const s = spans.get("data/map/map_" + m); if (s && pos >= s[0] && pos < s[1]) return m; }
        return null;
    }
    function enterMap(m) {   // prefetch (and pin) the maps its doors lead to; drop the rest
        curMap = m;
        if (/^a0\d$/.test(m)) try { localStorage.setItem("yo2-lazy-lobby", m); } catch {}
        const next = m === "r01" ? [lastLobby() || "a02"] : [...(NEXT[m] || []), "r01"];
        const keep = new Set([m, ...next].map((x) => "map:" + x));
        unpin((t) => t && t.startsWith("map:") && !keep.has(t));
        wantSpan("data/map/map_" + m, 1, "map:" + m);
        for (const x of next) wantSpan("data/map/map_" + x, 3, "map:" + x);
        for (const d of AVATARS) wantSpan(d, 4, "avatars");   // the other players and NPCs a lobby shows
    }
    function onMiss(url, i) {
        if (url !== archive) return;
        want(url, i + 1, 0), want(url, i + 2, 0);   // read-ahead
        if (!spans) return parseToc();
        const m = mapAt(i * CHUNK);
        if (m && m !== curMap) enterMap(m);
    }
    function onRead(url, pos) {   // every read: the map the game is in (its files may already be in memory)
        if (url !== archive) return;
        if (!spans) return parseToc();
        const m = mapAt(pos);
        if (m && m !== curMap) enterMap(m);
    }
    let cacheable = false;   // the server lets the HTTP cache keep game files (a ?v= reply says so): trickle fills it
    const onIdle = (f) => (typeof requestIdleCallback === "function" ? requestIdleCallback(f, { timeout: 30000 }) : setTimeout(f, 5000));

    // ---- scenes (ovr/scene.c: Module.onYo2Scene("begin"|"end", from, to), SceneId numbers): learned per player. The
    // chunks the game reads while switching into a scene are remembered for that scene, and which scene followed which;
    // arriving in a scene prefetches (and pins) what the next likely scenes read, two steps ahead, from the store or
    // the network. Login -> player select -> My Room and lobby -> janken -> duel are read the same way every time.
    const SCENES = "yo2-lazy-scenes", SCENE_MAX = 48, BOOT = 0x2c;   // 0x2c: SCENE_NONE, before the first scene
    const HOLD_PARALLEL = 4, HOLD_MAX = 15000;   // the boot's hold (boot below)
    const PLAYER_SELECT = 7, NEW_CHARACTER = 9;   // SCENE_PLAYER_SELECT; SCENE_CHANGE_AVATAR (a new character's avatar)
    // A player with nothing learned yet starts from this: a native run (login -> My Room -> lobby -> NPC duel -> result
    // -> lobby, RC_IOTRACE + RC_SCENE_LOG) over the same merge.dat (by size). Sets are chunk numbers; BOOT's is what the
    // exe reads before its first scene. Learned sets replace these scene by scene.
    const DEFAULT_SCENES = { size: 691359533, ...{"sets":{"44":[0,1,2,3,4,16,17,13,9,413,76,75,74,408,409,416,391,392,394,396,395,390,393,412,544,45,64,23],"4":[509,510,549,548,547,546,416],"6":[510,412,413],"7":[510,57,41,58,52,53,45,46,50],"10":[417,506,507,508,23,413,553,554,552,7,16,15,8,9,12,4,13],"12":[413,417,428,434,23,416,412,15,12,13,429,430,431,432,433,36],"30":[648,645,644,646,57,41,58,52,53,37,42,647],"28":[396,544,635,579,636,562,614,643,638,413,412,576,615,76,510,572,580,581,582,143,99,187,137,93,640,585,584,639,161,520,518,327,538,588,352,353,540,583,171,172,513,121,122,95,523,644],"29":[644],"32":[544,412,413],"25":[396,397],"23":[416,398],"24":[396,544,579,76,398,157,397],"9":[60,66,68,69,70,72,73]},"next":{"44":[1],"1":[4],"4":[6],"6":[7],"7":[10,9],"9":[10],"10":[25,12],"25":[10,23,12],"12":[30],"30":[28],"28":[29],"29":[32],"32":[25],"23":[24,25],"24":[23]}} };
    let learned = { etag: "", sets: {}, next: {} }, sceneReads = prefetchOn ? new Set() : null, sceneTo = BOOT;   // boot reads
    function loadScenes() {
        try { const l = JSON.parse(localStorage.getItem(SCENES) || "{}"); if (l.etag === files.get(archive).etag) learned = l; } catch {}
        const defaults = files.get(archive).size === DEFAULT_SCENES.size;
        if (!Object.keys(learned.sets).length && defaults)
            learned = JSON.parse(JSON.stringify({ sets: DEFAULT_SCENES.sets, next: DEFAULT_SCENES.next }));
        // A new character's avatar creation (CHANGE_AVATAR, from player select only for a new character): its ~7 MB of
        // outfits (data/avatar/wu, chunks from two field players' 3.5 s stalls) is prefetched from player select on. A
        // returning player has never learned it, so the default is kept until a visit learns its own.
        if (defaults && !learned.sets[NEW_CHARACTER]) {
            learned.sets[NEW_CHARACTER] = DEFAULT_SCENES.sets[NEW_CHARACTER];
            const n = (learned.next[PLAYER_SELECT] = learned.next[PLAYER_SELECT] || []);
            if (!n.includes(NEW_CHARACTER)) n.push(NEW_CHARACTER);
        }
        learned.etag = files.get(archive).etag;
    }
    function saveScenes() { try { localStorage.setItem(SCENES, JSON.stringify(learned)); } catch {} }
    function prefetchAfter(scene) {   // the scenes that followed `scene` before, and theirs: their reads, pinned
        const first = learned.next[scene] || [], second = first.flatMap((t) => learned.next[t] || []);
        const keep = new Set();
        for (const [list, pri] of [[first, 1], [second, 3]])
            for (const t of list) for (const i of learned.sets[t] || []) if (!keep.has(i)) keep.add(i), want(archive, i, pri, "scene");
        for (const [k, p] of pinned) if (p.tag === "scene" && !keep.has(+k.slice(k.lastIndexOf("#") + 1))) release(k, p);
        while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value);
    }
    function finishScene() {   // what the stay in a scene read (its switch, then cards and effects as they come) is its set
        if (!sceneReads) return;
        if (sceneReads.size) learned.sets[sceneTo] = [...sceneReads];   // the latest visit's reads
        sceneReads = null;
        saveScenes();
    }
    // The duel's generic pictures (data/y/duel minus the 48 MB of per-duel field backgrounds, and data/y2/duel's effects: ~19 MB): pinned from the
    // lobby on, so a first duel's attack, chain and summon effects do not stall; released back in My Room or the title.
    // phase_name: the phase banners (merge.dat 638-640; a field PvP freeze of 3.2 s on chunk 639 without it)
    const DUELFX = ["effect", "chain", "card", "phase", "phase_name", "font", "life", "list_icon", "dialog", "match", "get"].map((d) => "data/y/duel/" + d)
        .concat(["data/y2/duel/effect", "data/y2/duel/card"]);   // coin, tribute, summon effects; special card effects (~5 MB)
    const LOBBY = 12, JANKEN = 0x1e, HOME = [4, 6, 7, 10];
    const DUELUI = /^data\/y\/duel\/field\/duel_(thinkicon|window|sp)|^data\/y2\/duel_[^/]*$|^data\/y2\/duelfield_/;
    // The duel's backgrounds (data/y2/duel/field, duel_field.txt): the base one is the area's (duelbg_a_02 for lobby a02,
    // duelbg_d_04 for d04_01, ...); a Field Spell replaces it with duel_filed_NN, NN from the exe's card-number table
    // (FUN_00704100; a YO2 id's card number is its art name in list_card.txt). Only those few are pinned, not the folder.
    const FIELD_SPELLS = { 4336: 1, 4337: 2, 4338: 3, 4339: 4, 4340: 5, 4341: 6, 4899: 7, 4932: 8, 4933: 9, 4934: 10, 4935: 11,
        4936: 12, 4937: 13, 5276: 14, 5329: 15, 5387: 16, 5533: 17, 5791: 18, 5982: 19, 6207: 20, 6271: 21, 6399: 22, 6642: 23,
        6668: 24, 6758: 27, 6759: 26, 6775: 25, 6823: 28, 7003: 29, 7004: 30, 7079: 31, 7129: 32, 7164: 33, 7307: 34, 7457: 35,
        7624: 37, 7626: 38, 7627: 36 };
    async function fieldBackgrounds(fieldIds) {   // fieldIds: the NPC deck's Field Spells (YO2 ids, from the server)
        await loadCardNames();
        const names = [];
        const area = /^([ad])0(\d)/.exec(curMap || "");
        if (area) names.push(`data/y2/duel/field/duelbg_${area[1]}_0${area[2]}.png`);
        for (const id of fieldIds) {
            const nn = FIELD_SPELLS[parseInt((cardNumbers || [])[id] || "", 10)];
            if (nn) names.push(`data/y2/duel/field/duel_filed_${String(nn).padStart(2, "0")}.png`);
        }
        stats.fieldFiles = names.length, stats.fieldChunks = pinFiles(mergeFiles(names), "field", 2);
    }
    function npcDeck() {   // the NPC's deck of the duel being set up, from the server (never another player's): its art
        const http = (ENV.YO2_HTTP || location.origin + location.pathname.replace(/[^/]*$/, "")).replace(/\/$/, "");
        fetch(http + "/api/de/prefetch/duel", { credentials: "same-origin" })
            .then((r) => ((L.duel = r.status === 200 ? "npc" : r.status === 204 ? "pvp" : ""), r.status === 200 ? r.json() : null))   // web/stall.js
            .then((j) => {
                if (!j) return;
                if (Array.isArray(j.cards)) prefetchCards(j.cards.map(Number), "npc");
                if (Array.isArray(j.fields)) fieldBackgrounds(j.fields.map(Number));
            }, () => {});
    }
    function onScene(kind, from, to) {
        if (!prefetchOn || !archive || !files.get(archive).etag) return;
        if (kind === "begin" && to === JANKEN) fieldBackgrounds([]), npcDeck();
        if (kind === "end" && to === LOBBY) {
            for (const d of DUELFX) wantSpan(d, 5, "duelfx");
            // and the duel's own small pictures kept with the 48 MB of backgrounds: think icons, windows, gauges
            pinFiles(mergeFiles([...files2.keys()].filter((n) => DUELUI.test(n))), "duelui", 5);
        }
        if (kind === "end" && HOME.includes(to)) unpin((t) => ["duelfx", "duelui", "npc", "deck", "field"].includes(t));
        if (kind === "begin") {
            finishScene();
            sceneReads = new Set(), sceneTo = to;
            const n = (learned.next[from] = learned.next[from] || []);
            if (!n.includes(to)) n.push(to);
            for (const i of learned.sets[to] || []) want(archive, i, 0, "scene");   // late, but it helps the tail
        } else if (sceneReads && to === sceneTo) {
            prefetchAfter(to);
        }
    }
    {   // ONE stable dispatcher: assigning Module.onYo2Scene ADDS a listener (the loader, measurement scripts), so a
        // script that wraps "the old value" gets the dispatcher back, and a re-entrant call (that wrapper calling it)
        // is ignored instead of recursing
        const listeners = [];
        let busy = false;
        const dispatch = (kind, from, to) => {
            if (busy) return;
            busy = true;
            try {
                try { onScene(kind, from, to); } catch (e) { console.log("yo2rc: lazy scene", e); }
                for (const f of listeners) try { f(kind, from, to); } catch (e) { console.log("yo2rc: scene listener", e); }
            } finally { busy = false; }
        };
        const add = (f) => { if (typeof f === "function" && f !== dispatch && !listeners.includes(f)) listeners.push(f); };
        add(Module.onYo2Scene);
        Object.defineProperty(Module, "onYo2Scene", { configurable: true, get: () => dispatch, set: add });
    }
    L.learned = () => learned;

    // ---- boot: each lazy file's ETag (request version), then last session's pinned chunks from the store
    const lazy = [];
    function readReal(url, buffer, offset, pos, end) {   // [pos, end) of a lazy file into buffer[offset..]
        if (url === archive && dirBuf && pos < dirBuf.length) {   // merge.dat's directory: the sidecar
            const e = Math.min(end, dirBuf.length);
            buffer.set(dirBuf.subarray(pos, e), offset), (offset += e - pos), (pos = e);
        }
        for (let p = pos; p < end;) {
            const at = p % CHUNK, k = Math.min(end - p, CHUNK - at);
            buffer.set(chunkBytes(url, Math.floor(p / CHUNK), at, k), offset + (p - pos));
            p += k;
        }
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
            files.set(url, { size, etag: "", ver: "" });
            if (size >= 4 * CHUNK) lazy.push(url);   // ETag (request version, store key) for the files read in chunks
            if (/(^|\/)merge\.dat$/i.test(rel)) archive = url;
            if (/^merge\.log$/i.test(rel)) mergeLog = url;   // 1.5 KB, the patcher reads it every start
            if (/(^|\/)merge\/data\/card\.dat$/i.test(rel)) cardArc = url;
            if (/(^|\/)merge\/data\/mini\.dat$/i.test(rel)) miniArc = url;
            const node = FS.createFile(parent, PATH.basename(path), {}, true, false);
            Object.defineProperty(node, "usedBytes", { get: () => size });
            node.stream_ops = Object.assign({}, node.stream_ops, {
                read(stream, buffer, offset, length, pos) {
                    const end = Math.min(pos + length, size);
                    if (!(url === cardArc && artAsync && artRead(buffer, offset, pos, end))) readReal(url, buffer, offset, pos, end);
                    if (prefetchOn) onRead(url, pos);
                    return Math.max(0, end - pos);
                },
            });
            n++;
        }
        console.log(`yo2rc: ${dir} <- ${base} (${n} files)`);
    }
    const PINS = "yo2-lazy-pins";
    function savePins() {   // the working set (pinned chunks, then the LRU's) to load at the next start
        if (!prefetchOn) return;
        const out = {};
        const add = (k, list) => {
            const at = k.lastIndexOf("#"), url = k.slice(0, at), f = files.get(url);
            if (f && f.etag) (out[url] = out[url] || { etag: f.etag, pins: [], recent: [] })[list].push(+k.slice(at + 1));
        };
        for (const [k, p] of pinned) add(k, "pins");
        for (const k of lru.keys()) add(k, "recent");
        try { localStorage.setItem(PINS, JSON.stringify(out)); } catch {}
    }
    L.savePins = savePins;
    async function boot() {
        const side = archive ? dirSidecar() : null;   // with the HEADs (it needs only the manifest's size)
        await Promise.all(lazy.map(async (url) => {
            // never from the HTTP cache (a stale ETag would version every request wrongly); "?v=" so the reply carries
            // the Cache-Control the versioned chunk requests get
            const r = await fetch(url + "?v=head", { method: "HEAD", cache: "no-store" });
            const f = files.get(url), etag = r.headers.get("ETag") || "";
            f.etag = etag;
            f.ver = etag ? "?v=" + encodeURIComponent(etag.replace(/\W/g, "")) : "";
            if (/max-age=[1-9]|immutable/.test(r.headers.get("Cache-Control") || "")) cacheable = true;
        }));
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(PINS) || "{}"); } catch {}
        const loads = [];
        for (const [url, s] of Object.entries(saved)) {
            const f = files.get(url);
            if (!f || f.etag !== s.etag) continue;
            for (const [list, tag, max] of [["pins", "boot", PIN_MAX], ["recent", null, LRU_MAX]])
                for (const i of (s[list] || []).slice(0, max))
                    loads.push(fromStore(url, i).then((d) => d && (stats.fromStore++, remember(url, i, d, tag))));
        }
        // The hold: what the exe reads before the title shows, fetched HOLD_PARALLEL at a time in the order it reads it
        // (merge.log, merge.dat's directory, then the learned chunks of the boot, the patcher and the title), until all
        // are in or HOLD_MAX passes. Those bytes come before the title's first frame either way: fetched ahead they
        // pipeline instead of one synchronous request after another, and the title doesn't stall on them (field: merge.log
        // and the title's chunks, up to a second a frame). All at once under a 3 s cap (before), most were half done when
        // the game's first reads aborted them, and came down twice (yo2-browser: 19.9 MB of merge.dat at 20 Mbit).
        // The next scenes and the policies follow through the queue, one at a time. Works without an ETag too (it only
        // versions the store and the learned sets).
        const jobs = [], held = new Set();
        holding = true;
        const hold = (url, i, tag) => { const k = keyOf(url, i); if (url && !held.has(k) && !memChunk(url, i)) held.add(k), jobs.push([url, i, tag]); };
        const worker = async () => { for (let j; (j = jobs.shift());) await fetchSure(j[0], j[1], j[2]); };
        hold(mergeLog, 0, "boot");
        if (side && (dirBuf = await side)) {   // the directory's whole chunks, from the sidecar
            for (let i = 0; (i + 1) * CHUNK <= dirBuf.length; i++) remember(archive, i, dirBuf.subarray(i * CHUNK, (i + 1) * CHUNK), "toc");
            stats.dirSidecar = dirBuf.length;
        }
        if (archive) {
            loadScenes();
            const head = dirBuf ? Promise.resolve() : fetchSure(archive, 0, "toc");
            loads.push(worker(), head.then(() => {   // its count gives the directory's length
                const c = dirBuf || memChunk(archive, 0);
                if (c && !dirBuf) for (let i = 1, need = Math.ceil((12 + (c[8] | c[9] << 8 | c[10] << 16 | c[11] << 24) * 268) / CHUNK); i < need; i++) hold(archive, i, "toc");
                const first = learned.next[BOOT] || [];
                for (const sc of [BOOT, ...first, ...first.flatMap((t) => learned.next[t] || [])])   // boot, patcher, title
                    for (const i of learned.sets[sc] || []) hold(archive, i, "boot");
                return Promise.all(Array.from({ length: HOLD_PARALLEL }, worker));
            }));
        } else loads.push(worker());
        await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, HOLD_MAX))]);
        jobs.length = 0, (holding = false);   // past the cap: what's left goes through the queue (prefetchAfter, the policies)
        pump();
        if (cardArc) cardToc().catch(() => {});   // card art's directory (placeholders), after the title's reads
        parseToc();
        if (archive) prefetchAfter(BOOT);   // the title, login, ...
        stats.pinned = pinned.size;
        setTimeout(() => unpin((t) => t === "boot"), 120000);   // a policy re-pins what it still wants
        setInterval(savePins, 30000);
        addEventListener("pagehide", savePins);
        addEventListener("pagehide", () => { if (sceneReads && sceneReads.size) { learned.sets[sceneTo] = [...sceneReads]; saveScenes(); } });
    }

    mount("/game", q.get("game") || "game/");
    // The 2x card art (merge/data/card.dat, mini.dat) has its own manifest: the exe opens those archives before
    // merge.dat, so only a build that can show 2x art (ovr/decode.c) may mount them; a tab of an older one never sees them
    try { mount("/game", q.get("cards") || "cards/"); } catch (e) { console.log("yo2rc: no 2x card art:", e.message); }
    if (q.get("fonts")) mount("/fonts", q.get("fonts"));
    if (prefetchOn) {
        addRunDependency("lazy");
        boot().catch((e) => console.log("yo2rc: lazy boot", e)).finally(() => removeRunDependency("lazy"));
    }
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
                // back to this very page, its query too (gateway, http, server, YO2_PORT_OFFSET...), minus our flags
                const back = new URLSearchParams(top.location.search);
                back.delete("online"), back.delete("error");
                const ret = top.location.pathname + (back.size ? "?" + back : "");
                ENV.YO2_DISCORD_URL = http + "/api/auth/sign-in/discord?return=" + encodeURIComponent(ret);
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
