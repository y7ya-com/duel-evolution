// Web byte source: synchronous HTTP Range reads in 1 MB chunks through one capped LRU, as YOLaucher-web/web/lazydrive.js.
// The response comes back as text with charset x-user-defined (each char's low byte is the byte): that is the only
// binary sync XHR the main thread allows; a worker allows it too.
#include "vfs.h"

#include <algorithm>
#include <cstring>
#include <emscripten.h>
#include <list>
#include <mutex>

EM_JS(double, vfs_js_head, (const char* url), {
    const x = new XMLHttpRequest();
    x.open("HEAD", UTF8ToString(url), false);
    try { x.send(null); } catch (e) { return -1; }
    // No Accept-Ranges means a GET would return the whole file (700 MB for merge.dat): refuse before that happens
    if (x.status !== 200 || x.getResponseHeader("Accept-Ranges") !== "bytes") return -1;
    const n = Number(x.getResponseHeader("Content-Length"));
    return n > 0 ? n : -1;
});

EM_JS(int, vfs_js_get, (const char* url, double from, double to, uint8_t* dst), {
    const x = new XMLHttpRequest();
    x.open("GET", UTF8ToString(url), false);
    x.setRequestHeader("Range", "bytes=" + from + "-" + to);
    x.overrideMimeType("text/plain; charset=x-user-defined");
    try { x.send(null); } catch (e) { return -1; }
    const t = x.responseText;
    if (x.status !== 206 || t.length !== to - from + 1) return -1;
    // ponytail: plain HEAPU8; with -pthread + ALLOW_MEMORY_GROWTH the view must be refreshed after a grow
    for (let i = 0; i < t.length; i++) HEAPU8[dst + i] = t.charCodeAt(i) & 0xff;
    return t.length;
});

static const uint64_t CHUNK = 1 << 20;
static const size_t CACHE_CHUNKS = 64;   // ponytail: one global 64 MB LRU, as lazydrive; per-file caps if files thrash

struct Chunk {
    const VfsSource* src;
    uint64_t index;
    std::vector<uint8_t> data;
};
static std::list<Chunk> gCache;   // front = most recently used
static std::mutex gCacheLock;     // CTextureManager's loader thread reads too

struct VfsUrlSource : VfsSource {
    std::string url;
    uint64_t bytes;

    ~VfsUrlSource() override {
        std::lock_guard<std::mutex> lock(gCacheLock);
        gCache.remove_if([&](const Chunk& c) { return c.src == this; });   // a new source may reuse this address
    }
    uint64_t size() override { return bytes; }

    const Chunk* chunk(uint64_t index) {   // under gCacheLock
        for (auto it = gCache.begin(); it != gCache.end(); ++it)
            if (it->src == this && it->index == index) {
                gCache.splice(gCache.begin(), gCache, it);
                return &gCache.front();
            }
        uint64_t from = index * CHUNK, to = std::min(from + CHUNK, bytes) - 1;
        std::vector<uint8_t> data(to - from + 1);
        if (vfs_js_get(url.c_str(), (double)from, (double)to, data.data()) < 0) return nullptr;
        gCache.push_front(Chunk{this, index, std::move(data)});
        if (gCache.size() > CACHE_CHUNKS) gCache.pop_back();
        return &gCache.front();
    }

    bool read(uint64_t off, size_t len, void* buf) override {
        if (off > bytes || len > bytes - off) return false;
        std::lock_guard<std::mutex> lock(gCacheLock);
        for (size_t done = 0; done < len;) {
            uint64_t p = off + done;
            const Chunk* c = chunk(p / CHUNK);
            if (!c) return false;
            size_t at = (size_t)(p % CHUNK), take = std::min(len - done, c->data.size() - at);
            memcpy((char*)buf + done, c->data.data() + at, take);
            done += take;
        }
        return true;
    }
};

VfsSource* vfsOpenUrl(const char* url, uint64_t size) {
    if (!size) {
        double n = vfs_js_head(url);
        if (n < 0) return nullptr;
        size = (uint64_t)n;
    }
    auto* s = new VfsUrlSource;
    s->url = url;
    s->bytes = size;
    return s;
}
