// VFS against the real merge.dat (Ver.080912). Expected values come from YOLaucher-web/tools/kcej_dat.py.
//   native: vfs_test <merge.dat> [kcej-list.txt]   (list.txt = `kcej_dat.py list merge.dat`: every TOC row is compared)
//   web:    vfs_test_web.js <url of merge.dat>      (node platform/tests/vfs_node.cjs runs it against a local file)
// Reads only the TOC and the entries below (~5 MB), never the whole archive.
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "vfs/vfs.h"

static int gFails = 0;
#define CHECK(c) ((c) ? (void)0 : (void)(printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #c), gFails++))

static uint64_t fnv(const void* p, size_t n) {   // FNV-1a 64, the same as the reference script used for the hashes
    uint64_t h = 0xcbf29ce484222325ull;
    for (size_t i = 0; i < n; i++) h = (h ^ ((const uint8_t*)p)[i]) * 0x100000001b3ull;
    return h;
}

static void checkAll(VfsArchive* a, const char* name, uint32_t size, uint32_t stored, uint64_t hash) {
    const VfsEntry* e = vfsFind(a, name);
    CHECK(e != nullptr);
    if (!e) return;
    CHECK(e->size == size && e->stored == stored);
    std::vector<uint8_t> d;
    CHECK(vfsReadAll(a, *e, &d));
    CHECK(d.size() == size && fnv(d.data(), d.size()) == hash);
    printf("  %-48s %8u %8u  %016llx\n", name, size, stored, (unsigned long long)fnv(d.data(), d.size()));
}

static void checkRange(VfsArchive* a, const VfsEntry* e, uint32_t off, uint32_t len, uint64_t hash) {
    std::vector<uint8_t> b(len);
    CHECK(vfsReadAt(a, *e, off, b.data(), len) == len);
    CHECK(fnv(b.data(), len) == hash);
}

// Every row of `kcej_dat.py list`: "%10d %10d %s %s" = offset, size, stored (blank when == size), name.
// Names with non-ASCII characters are printed as UTF-8 there, so only ASCII names are compared byte for byte.
static void checkList(VfsArchive* a, const char* path) {
    FILE* f = fopen(path, "r");
    CHECK(f != nullptr);
    if (!f) return;
    char line[600];
    size_t i = 0, named = 0;
    while (fgets(line, sizeof line, f)) {
        line[strcspn(line, "\r\n")] = 0;
        if (i >= a->entries.size() || strlen(line) < 23) { CHECK(!"list row"); break; }
        const VfsEntry& e = a->entries[i++];
        uint32_t off = strtoul(line, nullptr, 10), size = strtoul(line + 11, nullptr, 10), stored = size;
        const char* name = line + 23;
        if (line[22] != ' ') {
            char* end;
            stored = strtoul(line + 22, &end, 10);
            name = end + 1;
        }
        bool ascii = true;
        for (const char* p = name; *p; p++) ascii &= (unsigned char)*p < 0x80;
        if (e.offset != off || e.size != size || e.stored != stored || (ascii && e.name != name)) {
            printf("FAIL row %zu: %s\n", i - 1, line);
            gFails++;
        }
        named += ascii;
    }
    fclose(f);
    CHECK(i == a->entries.size());
    printf("  list: %zu rows match (%zu names compared)\n", i, named);
}

int main(int argc, char** argv) {
    if (argc < 2) { printf("usage: %s <merge.dat%s> [kcej-list.txt]\n", argv[0], "|url"); return 2; }
    CHECK(vfsNormalize("Data\\Y\\A.PNG") == "data/y/a.png");
    CHECK(vfsNormalize("\x95\x5C\\\x82\x60Z") == "\x95\x5C/\x82\x60z");   // 表 and Ａ: trail bytes untouched

#ifdef __EMSCRIPTEN__
    VfsSource* src = vfsOpenUrl(argv[1]);
#else
    VfsSource* src = vfsOpenFile(argv[1]);
#endif
    CHECK(src != nullptr);
    if (!src) return 1;
    CHECK(src->size() == 691359533);
    VfsArchive* a = vfsMount(src);
    CHECK(a != nullptr);
    if (!a) return 1;
    printf("mounted %s: %zu entries\n", argv[1], a->entries.size());
    CHECK(a->entries.size() == 19445);
    CHECK(a->entries[0].name == "data\\avatar\\chibi\\cm_a1_00_c01_n01_01.png" && a->entries[0].offset == 5211272);
    CHECK(a->entries.back().name == "data\\y\\title\\trial.txt" && a->entries.back().offset == 691359521);
    CHECK(vfsFind(a, "DATA/Y/TITLE/TRIAL.TXT") == &a->entries.back());
    CHECK(vfsFind(a, "data/y/title/nope.txt") == nullptr);
    if (argc > 2) checkList(a, argv[2]);

    checkAll(a, "data\\avatar\\chibi\\cm_a1_00_c01_n01_01.png", 126, 126, 0x418e2db707766ff5ull);    // stored
    checkAll(a, "data/avatar/chibi/cm_a1_01_c01_n01_01.png", 370, 347, 0x1798f3045572b6cfull);       // LZSS
    checkAll(a, "data/y/title/title.txt", 841, 449, 0x8d1c038c937d95e1ull);                           // LZSS
    checkAll(a, "data/y/result/result_base.bmp", 1920056, 1041541, 0xf2d9b3e95519cc7eull);            // LZSS, 1.9 MB
    checkAll(a, "DATA/Y/DUEL/FIELD/DUELBG_T_01_\x82\x93\x82\x94\x82\x85\x82\x92.PNG", 1759, 1759,  // ｓｔｅｒ
             0xcdb1e3236e9eb105ull);

    // LZSS ranged read: decodes only the prefix up to the range
    const VfsEntry* title = vfsFind(a, "data/y/title/title.txt");
    if (title) {
        checkRange(a, title, 100, 50, 0xefcbc842c872959eull);
        char hdr[8];
        CHECK(vfsReadAt(a, *title, 0, hdr, 8) == 8 && memcmp(hdr, "#KONAMI.", 8) == 0);
    }

    // 2 MB stored PNG, 12 KB read in three ranges: its head, a range across a 1 MB boundary of merge.dat, its tail
    const VfsEntry* big = vfsFind(a, "data\\y\\duel\\field\\duel_filed_25.png");
    CHECK(big && big->size == 2009557 && big->stored == big->size);
    if (big) {
        checkRange(a, big, 0, 4096, 0xfa500cb4b348829dull);
        checkRange(a, big, 245760, 4096, 0x07031da75167ccfbull);
        checkRange(a, big, big->size - 4096, 4096, 0xc584af8364240770ull);
        uint8_t sig[8], tail[16];
        CHECK(vfsReadAt(a, *big, 0, sig, 8) == 8 && memcmp(sig, "\x89PNG\r\n\x1a\n", 8) == 0);
        CHECK(vfsReadAt(a, *big, big->size - 12, tail, 16) == 12 && memcmp(tail + 4, "IEND", 4) == 0);   // clamped
        CHECK(vfsReadAt(a, *big, big->size, tail, 16) == 0);
        printf("  ranged reads of %s: ok\n", big->name.c_str());
    }

    vfsUnmount(a);
    printf(gFails ? "FAILED (%d)\n" : "PASS\n", gFails);
    return gFails ? 1 : 0;
}
