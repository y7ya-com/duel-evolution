// Test driver for src/Pack, run by tests/deck_pack_test.py.
//   deck_pack_cli <merge.dat> <cardpack dir> <owned ids,...> table      every record of the pack table
//   deck_pack_cli <merge.dat> <cardpack dir> <owned ids,...> pack <id>   size/owned/completion/cards/line
// The catalogue comes from the real data/cardpack/PACK_*.bin in merge.dat (through platform/vfs), language 5
// (Spanish, the shop's packinfo_s.txt); the .iid/.ydc card lists from the cardpack dir.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "Pack/CardPack.h"
#include "Pack/pack_externs.h"
#include "vfs/vfs.h"

static std::string g_dir;
static VfsArchive* g_merge;
static uint8_t s_kaban[(0xcb8 + 4) * 3];
uint8_t* g_cardBox = s_kaban;

bool yo2AssertBox(char* once, const char* msg, const char*, int line) {
    printf("assert %d %s\n", line, msg);
    *once = 1;
    return true;
}

void uiNoBackListAdd(void*, const std::string& text) { printf("line %s\n", text.c_str()); }

bool yaneReadFile(const std::string& path, std::vector<uint8_t>& out) {
    out.clear();
    if (path.find("/PACK_") != std::string::npos) {
        const VfsEntry* e = g_merge ? vfsFind(g_merge, path.c_str()) : nullptr;
        return e && vfsReadAll(g_merge, *e, &out);
    }
    const std::string pre = "data/cardpack/";
    if (path.compare(0, pre.size(), pre) != 0) return false;
    std::ifstream f(g_dir + "/" + path.substr(pre.size()), std::ios::binary);
    if (!f) return false;
    out.assign(std::istreambuf_iterator<char>(f), {});
    return true;
}

int main(int argc, char** argv) {
    if (argc < 5) return 2;
    g_merge = vfsMount(vfsOpenFile(argv[1]));
    if (!g_merge) return 3;
    packInfoLoad(5);
    g_dir = argv[2];
    std::stringstream owned(argv[3]);
    std::string id;
    while (std::getline(owned, id, ','))
        if (!id.empty()) g_cardBox[(atoi(id.c_str()) + 3) * 3] = 1;
    packTableLoad();
    std::string cmd = argv[4];
    if (cmd == "table") {
        for (auto& [k, r] : *g_packTable)
            printf("rec %d %d %d %d %s %s %s|%s\n", k, r.id, r.type, r.pbinBit, r.iid.c_str(),
                   r.ydc.empty() ? "-" : r.ydc.c_str(), r.image.c_str(), r.name.c_str());
    } else if (cmd == "pack" && argc > 5) {
        int32_t pid = atoi(argv[5]);
        CCardPack p(pid);
        std::vector<uint16_t> cards;
        p.cards(cards);
        printf("pack %d size=%u owned=%u completion=%.4f image=%s name=%s\n", p.id, p.size(), p.ownedCount(),
               (double)p.completion(), packImage(pid).c_str(), packName(pid).c_str());
        printf("cards");
        for (uint16_t c : cards) printf(" %u", c);
        printf("\n");
        packSelectAddLine(nullptr, pid);
    }
    packTableDestroy();
    vfsUnmount(g_merge);
    return 0;
}
