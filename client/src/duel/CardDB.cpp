#include "CardDB.h"

#include <cstdio>
#include <string>
#include <vector>

#include "Game/yo2GameData.h"

// The exe keeps every card / text table in a yaneSDK CFile global (0x40 bytes, ctor FUN_00525dc0); FUN_0073b640
// fills them. Each global has a static initialiser (call the ctor wrapper, then register the atexit wrapper), the ctor
// wrapper (ECX = the object), the atexit registration and the atexit (dtor) wrapper, in that order below. The tables
// here stand for those globals (in the game, the i686 build, the code reads the exe's objects directly):
//   CARD_Prop         (CFile at 0x012a1140): @yo2 0x0073b380 @yo2 0x0073b3a0 @yo2 0x0073b3c0 @yo2 0x0073b3e0
//   CARD_IntID        (CFile at 0x012a1100): @yo2 0x0073b400 @yo2 0x0073b420 @yo2 0x0073b440 @yo2 0x0073b460
//   CARD_Genre        (CFile at 0x012a10c0): @yo2 0x0073b480 @yo2 0x0073b4a0 @yo2 0x0073b4c0 @yo2 0x0073b4e0
//   CARD_Name_R       (CFile at 0x012a1080): @yo2 0x0073b500 @yo2 0x0073b520 @yo2 0x0073b540 @yo2 0x0073b560
//   CARD_Indx_R       (CFile at 0x012a1040): @yo2 0x0073b580 @yo2 0x0073b5a0 @yo2 0x0073b5c0 @yo2 0x0073b5e0
struct CardLimit { uint32_t card, a; uint8_t limit; };   // 12 B each
struct CardPair { uint32_t b, a; };
#if defined(_WIN32) && defined(__i386__)
// In the game the tables are the exe's: the CBinFile objects FUN_0073b640 loaded (data at +0x18, size at +0x1c, a
// 4-byte header skipped when +0x34 is set: FUN_00527d30 / FUN_00527d10) and the limit lists at their addresses.
#define CARDDB_IN_EXE 1
static const uint8_t* binData(uint32_t o) {
    const uint8_t* b = reinterpret_cast<const uint8_t*>(o);
    return reinterpret_cast<const uint8_t*>(*reinterpret_cast<const uint32_t*>(b + 0x18) + (b[0x34] ? 4 : 0));
}
static uint32_t binSize(uint32_t o) {
    const uint8_t* b = reinterpret_cast<const uint8_t*>(o);
    return *reinterpret_cast<const uint32_t*>(b + 0x1c) - (b[0x34] ? 4 : 0);
}
static const uint32_t* propData() { return reinterpret_cast<const uint32_t*>(binData(0x012a1140)); }   // CARD_Prop
static const uint16_t* intidData() { return reinterpret_cast<const uint16_t*>(binData(0x012a1100)); }  // CARD_IntID
static const uint32_t* genreData() { return reinterpret_cast<const uint32_t*>(binData(0x012a10c0)); }  // CARD_Genre
#define g_cardLimitCount (*reinterpret_cast<uint32_t*>(0x012a1038))
#define g_cardPairCount (*reinterpret_cast<uint32_t*>(0x01295030))
#define s_limits (reinterpret_cast<CardLimit*>(0x01295038))
#define s_pairs (reinterpret_cast<CardPair*>(0x0128d030))
static uint32_t debugFlags() {   // *(*(DAT_012711ac + 0xc68) + 0x1214)
    uint32_t app = *reinterpret_cast<const uint32_t*>(0x012711ac);
    return *reinterpret_cast<const uint32_t*>(*reinterpret_cast<const uint32_t*>(app + 0xc68) + 0x1214);
}
#else
static std::vector<uint32_t> s_prop;    // 2 words per card index
static std::vector<uint16_t> s_intid;   // prop index of internal id 3000 + i
static std::vector<uint32_t> s_genre;   // 2 words of genre bits per card index
static const uint32_t s_zero[2] = {};

uint32_t g_cardLimitCount, g_cardPairCount, g_debugFlags;
static CardLimit s_limits[0x1000];     // DAT_01295038
static CardPair s_pairs[0x1000];       // DAT_0128d030
static uint32_t debugFlags() { return g_debugFlags; }
#endif

static bool readAll(const std::string& path, std::vector<uint8_t>& out) {
    std::string g;
    if (gameReadFile(path.c_str(), &g)) {   // the game's data (merge.dat), else a plain file
        out.assign(g.begin(), g.end());
        return true;
    }
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) return false;
    uint8_t buf[4096];
    for (size_t n; (n = fread(buf, 1, sizeof buf, f)) > 0;) out.insert(out.end(), buf, buf + n);
    fclose(f);
    return true;
}

#ifndef CARDDB_IN_EXE
// the card files of FUN_0073b640 (yo2LoadCardText; names and descriptions go to the text layer)
bool cardDbLoad(const char* dir) {
    std::vector<uint8_t> p, i;
    std::string d = dir;
    std::vector<uint8_t> g;
    if (!readAll(d + "/card_prop.bin", p) || !readAll(d + "/card_intid.bin", i)) return false;
    if (readAll(d + "/card_genre.bin", g)) {
        s_genre.resize(g.size() / 4);
        for (size_t k = 0; k < s_genre.size(); k++)
            s_genre[k] = g[k * 4] | g[k * 4 + 1] << 8 | g[k * 4 + 2] << 16 | (uint32_t)g[k * 4 + 3] << 24;
    }
    s_prop.resize(p.size() / 4);
    for (size_t k = 0; k < s_prop.size(); k++)
        s_prop[k] = p[k * 4] | p[k * 4 + 1] << 8 | p[k * 4 + 2] << 16 | (uint32_t)p[k * 4 + 3] << 24;
    s_intid.resize(i.size() / 2);
    for (size_t k = 0; k < s_intid.size(); k++) s_intid[k] = (uint16_t)(i[k * 2] | i[k * 2 + 1] << 8);
    return true;
}
#endif

// @yo2 0x0073b600 the exe's table at 0x00ccb518
int cardNormalize(int id) {
    static const uint16_t alias[][2] = {
        {0x13fb, 0xf3c}, {0x14f8, 0xf3d}, {0x14f9, 0xf3e}, {0x154f, 0xf3f}, {0x1550, 0xf40}, {0x1551, 0xf41},
        {0x1422, 0xf42}, {0x14fa, 0xf43}, {0x154e, 0xf44}, {0x15bd, 0xf45}, {0x15be, 0xf46}, {0x1602, 0xf47},
        {0x1603, 0xf48}, {0x1608, 0xf49}, {0x1639, 0xf4a}, {0x1670, 0xf4b}, {0x1671, 0xf4c}, {0x1672, 0xf4d},
        {0x1730, 0xf4e}, {0x1731, 0xf4f}, {0x1815, 0xf50}, {0x1813, 0xf51}, {0x1b6c, 0xf52}, {0x195a, 0xf53},
        {0x19ba, 0xf54}, {0x19ee, 0xf55}, {0xf56, 0xf56}, {0x19ed, 0xf57}, {0x189b, 0xf58}, {0x189c, 0xf59},
        {0x189d, 0xf5a}, {0x1b9d, 0xf5b}, {0x1b77, 0xf5c},
    };
    for (const auto& a : alias)
        if (a[0] == id) return a[1];
    return id;
}

#ifdef CARDDB_IN_EXE
// @yo2 0x0073bbe0
int cardPropIndex(int id) {
    int n = cardNormalize(id);
    if (n < 3000 || binSize(0x012a1100) >> 1 <= (uint32_t)(n - 3000)) return 0;
    return intidData()[n - 3000];
}
// @yo2 0x0073bc50
int cardPropId(int index) { return (int)(propData()[index * 2] & 0x3fff); }
// @yo2 0x0073bf50
const uint32_t* cardProp(int id) { return propData() + cardPropIndex(id) * 2; }
#else
int cardPropIndex(int id) {
    int n = cardNormalize(id);
    if (n < 3000 || (uint32_t)(n - 3000) >= s_intid.size()) return 0;
    return s_intid[n - 3000];
}
int cardPropId(int index) { return (size_t)index * 2 < s_prop.size() ? s_prop[index * 2] & 0x3fff : 0; }
// (an empty database yields a zero record instead of reading a null buffer)
const uint32_t* cardProp(int id) {
    size_t k = (size_t)cardPropIndex(id) * 2;
    return k + 1 < s_prop.size() ? &s_prop[k] : s_zero;
}
#endif

// @yo2 0x0073bf20
int cardRace(int id) { return cardProp(id)[1] >> 17 & 0x1f; }
// @yo2 0x0073bf80
int cardAttr(int id) { return cardProp(id)[1] >> 6 & 0xf; }
// @yo2 0x0073bfb0
int cardLevel(int id) { return cardProp(id)[1] >> 10 & 0xf; }
// @yo2 0x0073bfe0
int cardIcon(int id) { return cardProp(id)[1] >> 14 & 7; }
// @yo2 0x0073c010
int cardKind(int id) { return cardProp(id)[1] >> 1 & 0x1f; }

// @yo2 0x0073c040
int cardAtk(int id) {
    uint32_t v = cardProp(id)[0] >> 14 & 0x1ff;
    return v == 0x1ff ? 0 : (int)v * 10;
}
// @yo2 0x0073c080
int cardDef(int id) {
    uint32_t v = cardProp(id)[0] >> 23;
    return v == 0x1ff ? 0 : (int)v * 10;
}
// @yo2 0x0073c0c0
int cardAtkRaw(int id) {
    uint32_t v = cardProp(id)[0] >> 14 & 0x1ff;
    return v == 0x1ff ? 0xffff : (int)v * 10;
}
// @yo2 0x0073c100
int cardDefRaw(int id) {
    uint32_t v = cardProp(id)[0] >> 23;
    return v == 0x1ff ? 0xffff : (int)v * 10;
}

// @yo2 0x0073c140 genre bit n of a card (CARD_Genre.bin: 64 bits per card index; a negative bit rounds toward zero)
int cardBit(int id, int bit) {
#ifdef CARDDB_IN_EXE
    return (int)(genreData()[cardPropIndex(id) * 2 + bit / 32] >> (bit & 31) & 1);
#else
    size_t k = (size_t)cardPropIndex(id) * 2 + (size_t)(bit / 32);
    return k < s_genre.size() ? (int)(s_genre[k] >> (bit & 31) & 1) : 0;
#endif
}

// @yo2 0x0073c1e0 forbidden/limited entry i (the lobby's list): YO2 id, internal (Konami) id, copies allowed
void limitationSet(int32_t i, int32_t yo2Id, int32_t konamiId, uint8_t copies) {
    if ((unsigned)i >= 0x1000) return;
    s_limits[i].a = (uint32_t)yo2Id;
    s_limits[i].card = (uint32_t)konamiId;
    s_limits[i].limit = copies;
}

// @yo2 0x0073c220
void limitationCount(int32_t n) { g_cardLimitCount = (uint32_t)n; }

// @yo2 0x0073c240 unreleased entry i: YO2 id, internal (Konami) id
void unreleasedSet(int32_t i, int32_t yo2Id, int32_t konamiId) {
    if ((unsigned)i >= 0x1000) return;
    s_pairs[i].a = (uint32_t)yo2Id;
    s_pairs[i].b = (uint32_t)konamiId;
}

// @yo2 0x0073c270
void unreleasedCount(int32_t n) { g_cardPairCount = (uint32_t)n; }

// @yo2 0x0073c290
int cardLimitOf(int id) {
    for (uint32_t i = 0; i < g_cardLimitCount && i < 0x1000; i++)
        if ((int)s_limits[i].card == id) return s_limits[i].limit;
    return 3;
}

// @yo2 0x0073c190 cards below 3000 are not cards (0); debug builds lift the limits
int cardLimit(int id) {
    if (id < 3000) return 0;
    if (debugFlags() & 0x800) return 3;
    return cardLimitOf(id);
}

// @yo2 0x0073c330
int cardPairFindB(int id) {
    int n = cardNormalize(id);
    for (uint32_t i = 0; i < g_cardPairCount && i < 0x1000; i++)
        if ((int)s_pairs[i].b == n) return 0;
    return -1;
}

// @yo2 0x0073c380
int cardPairFindA(int id) {
    for (uint32_t i = 0; i < g_cardPairCount && i < 0x1000; i++)
        if ((int)s_pairs[i].a == id) return 0;
    return -1;
}
