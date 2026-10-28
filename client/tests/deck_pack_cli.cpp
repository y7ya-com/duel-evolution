// Test driver for src/Pack, run by tests/deck_pack_test.py.
//   deck_pack_cli <catalogue.tsv> <cardpack dir> <owned ids,...> table      every record of the pack table
//   deck_pack_cli <catalogue.tsv> <cardpack dir> <owned ids,...> pack <id>   size/owned/completion/cards/line
// catalogue.tsv stands in for System's PACK_*.bin reader: one line per catalogue index 1..n,
// "id \t type \t image \t name \t desc \t text3 \t ydc \t bit".
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "Pack/CardPack.h"
#include "Pack/pack_externs.h"

struct Row { int32_t id = 0, type = 0, bit = 0; std::string image, name, desc, text3, ydc; };
static std::vector<Row> g_rows;
static std::string g_dir;
static uint8_t s_kaban[(0xcb8 + 4) * 3];
uint8_t* g_cardBox = s_kaban;

static const Row& row(int i) {
    static Row none;
    return i >= 1 && (size_t)i <= g_rows.size() ? g_rows[(size_t)i - 1] : none;
}
int32_t packInfoId(int i) { return row(i).id; }
int32_t packInfoType(int i) { return row(i).type; }
const char* packInfoImage(int i) { return row(i).image.c_str(); }
const char* packInfoName(int i) { return row(i).name.c_str(); }
const char* packInfoDesc(int i) { return row(i).desc.c_str(); }
const char* packInfoText3(int i) { return row(i).text3.c_str(); }
const char* packInfoYdc(int i) { return row(i).ydc.c_str(); }
int32_t packInfoBit(int i) { return row(i).bit; }

bool yo2AssertBox(char* once, const char* msg, const char*, int line) {
    printf("assert %d %s\n", line, msg);
    *once = 1;
    return true;
}

void uiNoBackListAdd(void*, const std::string& text) { printf("line %s\n", text.c_str()); }

bool yaneReadFile(const std::string& path, std::vector<uint8_t>& out) {
    out.clear();
    const std::string pre = "data/cardpack/";
    if (path.compare(0, pre.size(), pre) != 0) return false;
    std::ifstream f(g_dir + "/" + path.substr(pre.size()), std::ios::binary);
    if (!f) return false;
    out.assign(std::istreambuf_iterator<char>(f), {});
    return true;
}

int main(int argc, char** argv) {
    if (argc < 5) return 2;
    std::ifstream tsv(argv[1]);
    std::string line;
    while (std::getline(tsv, line)) {
        std::vector<std::string> f;
        std::stringstream ss(line);
        std::string x;
        while (std::getline(ss, x, '\t')) f.push_back(x);
        f.resize(8);
        Row r;
        r.id = atoi(f[0].c_str());
        r.type = atoi(f[1].c_str());
        r.image = f[2], r.name = f[3], r.desc = f[4], r.text3 = f[5], r.ydc = f[6];
        r.bit = atoi(f[7].c_str());
        g_rows.push_back(r);
    }
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
    return 0;
}
