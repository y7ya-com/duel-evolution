// Local-file byte source and the KCEJYUGI archive. Format (YOLaucher-web/tools/kcej_dat.py is the reference):
//   "KCEJYUGI", u32 LE count, then count × 268-byte records:
//   char[256] name (each byte's nibbles swapped, CP932, NUL-terminated), u32 offset, u32 size, u32 stored.
// ponytail: the file source is POSIX (open/pread), like net_posix.cpp; a Windows-native build swaps in ReadFile.
#include "vfs.h"

#include <cstring>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

struct VfsFileSource : VfsSource {
    int fd;
    uint64_t bytes;
    ~VfsFileSource() override { close(fd); }
    uint64_t size() override { return bytes; }
    bool read(uint64_t off, size_t len, void* buf) override {
        if (off > bytes || len > bytes - off) return false;
        for (size_t done = 0; done < len;) {
            ssize_t n = pread(fd, (char*)buf + done, len - done, (off_t)(off + done));   // thread-safe: no shared seek
            if (n <= 0) return false;
            done += (size_t)n;
        }
        return true;
    }
};

VfsSource* vfsOpenFile(const char* path) {
    int fd = open(path, O_RDONLY);
    if (fd < 0) return nullptr;
    struct stat st;
    if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode)) { close(fd); return nullptr; }
    auto* s = new VfsFileSource;
    s->fd = fd;
    s->bytes = (uint64_t)st.st_size;
    return s;
}

std::string vfsNormalize(const char* name) {
    std::string out;
    for (const unsigned char* p = (const unsigned char*)name; *p; p++) {
        unsigned c = *p;
        if ((c >= 0x81 && c <= 0x9F) || (c >= 0xE0 && c <= 0xFC)) {   // CP932 lead byte: copy it and its trail byte
            out += (char)c;
            if (p[1]) out += (char)*++p;
            continue;
        }
        if (c == '\\') c = '/';
        else if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
        out += (char)c;
    }
    return out;
}

static uint32_t le32(const uint8_t* p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }

VfsArchive* vfsMount(VfsSource* src) {
    std::unique_ptr<VfsSource> owned(src);
    if (!src) return nullptr;
    uint64_t total = src->size();
    uint8_t head[12];
    if (total < 12 || !src->read(0, 12, head) || memcmp(head, "KCEJYUGI", 8) != 0) return nullptr;
    uint32_t count = le32(head + 8);
    if ((uint64_t)count * 268 > total - 12) return nullptr;
    std::vector<uint8_t> toc((size_t)count * 268);   // merge.dat: 19,445 records = 5.2 MB, freed after parsing
    if (!src->read(12, toc.size(), toc.data())) return nullptr;

    auto* a = new VfsArchive;
    a->entries.resize(count);
    a->index.reserve(count);
    for (uint32_t i = 0; i < count; i++) {
        const uint8_t* r = &toc[(size_t)i * 268];
        VfsEntry& e = a->entries[i];
        for (int k = 0; k < 256; k++) {
            char c = (char)(r[k] << 4 | r[k] >> 4);
            if (!c) break;
            e.name += c;
        }
        e.offset = le32(r + 256);
        e.size = le32(r + 260);
        e.stored = le32(r + 264);
        if ((uint64_t)e.offset + e.stored > total) { delete a; return nullptr; }
        a->index[vfsNormalize(e.name.c_str())] = i;   // a repeated name: the last one wins, as kcej_dat.py extract
    }
    a->src = std::move(owned);
    return a;
}

void vfsUnmount(VfsArchive* a) { delete a; }

const VfsEntry* vfsFind(const VfsArchive* a, const char* name) {
    auto it = a->index.find(vfsNormalize(name));
    return it == a->index.end() ? nullptr : &a->entries[it->second];
}

// Okumura LZSS: 4096-byte ring starting at 0xFEE, zero-filled; flag bits LSB first, 1 = literal byte,
// 0 = 2-byte reference (offset = b1 | (b2 & 0xF0) << 4, length = (b2 & 0x0F) + 3). Stops at outSize.
static size_t lzss(const uint8_t* src, size_t n, uint8_t* out, size_t outSize) {
    uint8_t ring[4096] = {};
    unsigned r = 0xFEE;
    size_t i = 0, o = 0;
    while (i < n && o < outSize) {
        unsigned flags = src[i++];
        for (int bit = 0; bit < 8 && i < n && o < outSize; bit++) {
            if (flags >> bit & 1) {
                out[o++] = ring[r] = src[i++];
                r = (r + 1) & 0xFFF;
                continue;
            }
            if (i + 1 >= n) return o;   // truncated reference
            unsigned off = src[i] | (src[i + 1] & 0xF0) << 4, len = (src[i + 1] & 0x0F) + 3;
            i += 2;
            for (unsigned k = 0; k < len && o < outSize; k++) {
                uint8_t c = ring[(off + k) & 0xFFF];
                out[o++] = ring[r] = c;
                r = (r + 1) & 0xFFF;
            }
        }
    }
    return o;
}

// Decodes the first `want` bytes of a compressed entry (LZSS is sequential, so a prefix costs only that prefix).
// The stored bytes are read whole; compressed entries are small (merge.dat's largest: 1.7 MB stored).
static bool unpack(VfsArchive* a, const VfsEntry& e, uint8_t* out, size_t want) {
    std::vector<uint8_t> packed(e.stored);
    if (!a->src->read(e.offset, packed.size(), packed.data())) return false;
    return lzss(packed.data(), packed.size(), out, want) == want;
}

bool vfsReadAll(VfsArchive* a, const VfsEntry& e, std::vector<uint8_t>* out) {
    out->resize(e.size);
    if (e.size == e.stored) return a->src->read(e.offset, e.size, out->data());
    return unpack(a, e, out->data(), e.size);
}

int64_t vfsReadAt(VfsArchive* a, const VfsEntry& e, uint32_t off, void* buf, uint32_t len) {
    if (off >= e.size) return 0;
    uint32_t n = len < e.size - off ? len : e.size - off;
    if (e.size == e.stored) return a->src->read((uint64_t)e.offset + off, n, buf) ? n : -1;
    // ponytail: no cache of decoded entries, so reading a compressed entry in pieces decodes its prefix each time.
    // Fine for CFile's whole-file loads; add a one-entry cache if a caller streams a big compressed entry.
    std::vector<uint8_t> tmp((size_t)off + n);
    if (!unpack(a, e, tmp.data(), tmp.size())) return -1;
    memcpy(buf, tmp.data() + off, n);
    return n;
}
