// File layer behind the game's CFile / CFileLoader / CPackFileCache (platform/DESIGN.md §4).
//   VfsSource   raw bytes: a local file (pread), or on the web a URL read in 1 MB HTTP Range chunks through a capped
//               LRU (the YOLaucher-web/web/lazydrive.js scheme), so merge.dat (~700 MB) is never loaded whole.
//   VfsArchive  a mounted KCEJYUGI container (merge.dat): TOC index by normalized name, whole-entry reads (LZSS
//               decoded) and ranged reads that only touch the bytes asked for (stored entries).
// All reads are synchronous; on the web that means a worker thread (or the main thread with a deprecation warning).
#pragma once
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

struct VfsSource {
    virtual ~VfsSource() {}
    virtual uint64_t size() = 0;
    virtual bool read(uint64_t off, size_t len, void* buf) = 0;   // all of [off, off+len) or false
};

VfsSource* vfsOpenFile(const char* path);                  // nullptr if it can't be opened
#ifdef __EMSCRIPTEN__
// Same-origin URL served with Range support. size 0 = ask the server (HEAD: Content-Length + Accept-Ranges: bytes).
VfsSource* vfsOpenUrl(const char* url, uint64_t size = 0);
#endif

struct VfsEntry {
    std::string name;   // as stored: CP932 bytes, backslash paths ("data\y\title\title.txt")
    uint32_t offset;    // absolute, in the container
    uint32_t size;      // original size
    uint32_t stored;    // bytes in the container; != size means Okumura LZSS
};

struct VfsArchive {
    std::unique_ptr<VfsSource> src;
    std::vector<VfsEntry> entries;                         // TOC order
    std::unordered_map<std::string, uint32_t> index;       // vfsNormalize(name) -> entries[i]
};

VfsArchive* vfsMount(VfsSource* src);                       // takes src (deleted on failure); nullptr if not KCEJYUGI
void vfsUnmount(VfsArchive* a);
const VfsEntry* vfsFind(const VfsArchive* a, const char* name);   // any case, '/' or '\'; nullptr if absent
bool vfsReadAll(VfsArchive* a, const VfsEntry& e, std::vector<uint8_t>* out);   // e.size bytes, decompressed
// Up to len bytes of the entry's (decompressed) content from off. Returns bytes read (0 past the end), -1 on error.
int64_t vfsReadAt(VfsArchive* a, const VfsEntry& e, uint32_t off, void* buf, uint32_t len);

// ASCII lower case and '\' -> '/', leaving CP932 double-byte characters alone (their trail byte can be '\' or 'A'-'Z')
std::string vfsNormalize(const char* name);
