// Shared bits for tests/game/*_test.cpp: CHECK, a fixture file provider, and the real merge.dat through the VFS.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <map>
#include <string>

#include "Game/yo2GameData.h"
#include "vfs/vfs.h"

#define CHECK(c)                                                              \
    do {                                                                      \
        if (!(c)) {                                                           \
            std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); \
            std::exit(1);                                                     \
        }                                                                     \
    } while (0)

// Files keyed by path, exactly as the game asks for them.
inline std::map<std::string, std::string>& fixtureFiles() {
    static std::map<std::string, std::string> m;
    return m;
}
inline bool fixtureProvider(const char* path, std::string* out) {
    auto it = fixtureFiles().find(path);
    if (it == fixtureFiles().end()) return false;
    *out = it->second;
    return true;
}

// The real merge.dat (YO2_MERGE_DAT), mounted once; nullptr when it isn't there.
inline VfsArchive* mergeDat() {
    static VfsArchive* a = [] {
        const char* p = std::getenv("YO2_MERGE_DAT");
        VfsSource* s = p ? vfsOpenFile(p) : nullptr;
        return s ? vfsMount(s) : nullptr;
    }();
    return a;
}
inline bool mergeProvider(const char* path, std::string* out) {
    VfsArchive* a = mergeDat();
    const VfsEntry* e = a ? vfsFind(a, path) : nullptr;
    std::vector<uint8_t> b;
    if (!e || !vfsReadAll(a, *e, &b)) return false;
    out->assign(b.begin(), b.end());
    return true;
}
