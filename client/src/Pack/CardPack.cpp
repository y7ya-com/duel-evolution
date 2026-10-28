// yo2CardPack.h's out-of-line half (0x0084d550..0x0084e7c0) plus its inline getters (one copy per .cpp in the exe).
// The std::map node code around it (0x0084ed10..0x0084fb20 insert/erase/lower_bound) is the STL's: std::map here.
#include "CardPack.h"

#include <cstdio>
#include <cstdlib>

#include "pack_externs.h"

static const char kHeader[] = "C:\\yugionline\\yo2\\client\\src\\Pack\\yo2CardPack.h";
static const char kPackDir[] = "data/cardpack/";

PackTable* g_packTable = nullptr;

// @yo2 0x0084d550 static initializer: the empty table
void packTableCreate() {
    if (!g_packTable) g_packTable = new PackTable;
}

// @yo2 0x0084d760
void packTableDestroy() {
    delete g_packTable;
    g_packTable = nullptr;
}

// @yo2 0x0084e690 the path is built and dropped: the catalogue comes from the PACK_*.bin tables (System)
void packTableLoad() {
    std::string unused = "data/cardpack/packinfo_?.txt";
    (void)unused;
    packTableCreate();
    packTableFill(*g_packTable);
}

// @yo2 0x0084e7c0 every catalogue slot, keyed by pack id (a missing slot keeps overwriting the record of id 0)
void packTableFill(PackTable& t) {
    for (int i = 1; i <= 0xc0; i++) {
        PackRecord r;
        r.id = packInfoId(i);
        char iid[0x100];
        snprintf(iid, sizeof iid, "%d.iid", r.id);
        r.iid = iid;
        r.type = packInfoType(i);
        r.image = packInfoImage(i);
        r.name = packInfoName(i);
        r.desc = packInfoDesc(i);
        r.text3 = packInfoText3(i);
        if (r.isDeck()) {
            r.ydc = packInfoYdc(i);
            r.pbinBit = packInfoBit(i);
        }
        t[r.id] = r;
    }
}

static char s_noPackOnce;   // DAT_0128bc6c

// @yo2 0x0084dc10 map[id], with a one-time "パックがありません。" (no such pack) assert when it is not in the table
PackRecord& packRecord(int32_t id) {
    packTableCreate();
    if (!s_noPackOnce && (*g_packTable)[id].id == 0 &&
        !yo2AssertBox(&s_noPackOnce, "パックがありません。", kHeader, 0x6f))
        exit(1);
    return (*g_packTable)[id];
}

// The three getters differ only in the field, the message and their once-flag.
static std::string getter(int32_t id, char* once, const char* msg, int line, std::string PackRecord::*field) {
    packTableCreate();
    if (!*once && (*g_packTable)[id].id == 0 && !yo2AssertBox(once, msg, kHeader, line)) exit(1);
    return (*g_packTable)[id].*field;
}

static char s_noImageOnce, s_noDescOnce, s_noNameOnce;   // DAT_012ae004 / DAT_012ae008 / DAT_012aeed8

// @yo2 0x008453b0
std::string packImage(int32_t id) { return getter(id, &s_noImageOnce, "パックの画像がありません。", 0x5f, &PackRecord::image); }

// @yo2 0x00846640
std::string packDesc(int32_t id) { return getter(id, &s_noDescOnce, "パックの説明がありません。", 0x69, &PackRecord::desc); }

// @yo2 0x008581b0
std::string packName(int32_t id) { return getter(id, &s_noNameOnce, "パックの名称がありません。", 0x5f, &PackRecord::name); }

// @yo2 0x0084d8a0
CCardPack::CCardPack(int32_t packId) {
    const PackRecord& r = packRecord(packId);
    static_cast<PackRecord&>(*this) = r;
    id = packId;
}

static std::vector<uint8_t> readPackFile(const std::string& name) {
    std::vector<uint8_t> raw;
    yaneReadFile(kPackDir + name, raw);
    return raw;
}

static uint16_t u16le(const std::vector<uint8_t>& b, size_t i) { return (uint16_t)(b[2 * i] | b[2 * i + 1] << 8); }

// @yo2 0x0084dfc0
uint32_t CCardPack::size() const { return (uint32_t)readPackFile(iid).size() >> 1; }

// @yo2 0x0084e0b0
uint32_t CCardPack::ownedCount() const {
    std::vector<uint8_t> raw = readPackFile(iid);
    uint32_t n = (uint32_t)raw.size() >> 1, owned = n;
    for (uint32_t i = 0; i < n; i++)
        if (cardBoxCount(u16le(raw, i)) == 0) owned--;
    return owned;
}

// @yo2 0x0084e1e0
float CCardPack::completion() const {
    uint32_t n = size();
    if (n == 0) return 0.0f;   // fix: the exe divides by zero for an empty or missing .iid
    return (float)(int32_t)ownedCount() / (float)n;
}

// @yo2 0x0084e340
void CCardPack::cards(std::vector<uint16_t>& out) const {
    std::vector<uint8_t> raw = readPackFile(isDeck() ? ydc : iid);
    for (size_t i = 0; i < raw.size() / 2; i++)
        if (uint16_t c = u16le(raw, i)) out.push_back(c);
}

static char s_listNoPackOnce;   // DAT_012aeee8

// CWindowPackSelect's list line. The colour test compares the ratio (0..1) with 99.99, not the
// percentage, so the "complete" colour @1 never shows in the exe; kept as is.
std::string packCompletionLine(int32_t id) {
    std::string name = packName(id);
    packTableCreate();
    if (!s_listNoPackOnce && (*g_packTable)[id].id == 0 &&
        !yo2AssertBox(&s_listNoPackOnce, "パックがありません。", kHeader, 0x81))
        exit(1);
    CCardPack pack(id);
    float ratio = pack.completion();
    char pct[0x40];
    snprintf(pct, sizeof pct, ratio <= 99.99f ? "@>600/@2%0.1f %%@0" : "@>600/@1%0.1f %%@0", (double)(ratio * 100.0f));
    return "@>64/" + name + pct;
}

// @yo2 0x0085a840
void packSelectAddLine(void* noBackList, int32_t id) { uiNoBackListAdd(noBackList, packCompletionLine(id)); }
