#include "Game/yo2FieldMap.h"

#include <cstdlib>
#include <vector>

#include "System/yo2Debug.h"

// DAT_00d2d4d0. Map ids: 0 d01_01, 1 d02, 2 d03, 3 d04_01, 4 a01, 5 a02, 6 a03, 7 a04, 8 r01 (duel room), 9 d05.
const FieldMapInfo g_fieldMaps[FIELD_MAPS] = {
    {"Map_d01_01", {{2, 1700, 230, 1}, {3, 2300, 940, 2}, {1, 250, 930, 6}, {8, 1280, 1350, 0}, {8, 900, 1230, 0},
                    {8, 840, 960, 0}, {8, 990, 630, 0}, {8, 1420, 660, 0}, {8, 1620, 1020, 0}, {8, 870, 330, 0}}},
    {"Map_d02", {{0, 950, 1300, 3}, {8, 1450, 840, 0}, {11, 0, 0, 0}, {8, 1830, 610, 0}, {8, 1830, 1200, 0},
                 {8, 510, 1160, 0}, {8, 140, 660, 0}, {12, 0, 0, 0}, {0, 0, 0, 0}, {0, 0, 0, 0}}},
    {"Map_d03", {{0, 350, 1350, 5}, {8, 1330, 500, 0}, {8, 1300, 800, 0}, {8, 1050, 980, 0}, {8, 800, 1140, 0},
                 {8, 330, 1190, 0}, {8, 80, 550, 0}, {8, 1500, 700, 0}, {12, 0, 0, 0}, {0, 0, 0, 0}}},
    {"Map_d04_01", {{0, 400, 1200, 5}, {9, 1350, 610, 0}, {8, 650, 730, 0}, {8, 1110, 1020, 0}, {8, 1350, 800, 0},
                    {8, 1780, 1320, 0}, {8, 120, 240, 0}, {8, 520, 200, 0}, {8, 1020, 240, 0}, {8, 910, 830, 0}}},
    {"Map_a01", {{5, 1480, 360, 1}, {7, 200, 1200, 7}, {8, 530, 920, 0}, {8, 740, 1030, 0}, {8, 820, 860, 0},
                 {8, 1190, 790, 0}, {8, 990, 600, 0}, {8, 330, 580, 0}, {8, 1940, 1100, 0}, {8, 1440, 1280, 0}}},
    {"Map_a02", {{4, 250, 1250, 5}, {6, 1800, 770, 1}, {11, 0, 0, 0}, {8, 370, 1000, 0}, {8, 810, 1360, 0},
                 {8, 1860, 1370, 0}, {8, 1610, 1010, 0}, {8, 1360, 260, 0}, {8, 740, 330, 0}, {8, 220, 550, 0}}},
    {"Map_a03", {{5, 1320, 1300, 3}, {8, 800, 580, 0}, {8, 1140, 810, 0}, {8, 1500, 1050, 0}, {8, 970, 1400, 0},
                 {8, 620, 1160, 0}, {8, 270, 930, 0}, {8, 300, 600, 0}, {8, 1300, 480, 0}, {8, 1670, 690, 0}}},
    {"Map_a04", {{4, 1270, 1280, 3}, {8, 1600, 800, 0}, {8, 1380, 980, 0}, {8, 1160, 1120, 0}, {8, 1880, 310, 0},
                 {8, 1880, 540, 0}, {8, 450, 1230, 0}, {8, 1920, 1040, 0}, {8, 1920, 1240, 0}, {8, 1760, 1150, 0}}},
    {"Map_r01", {{8, 680, 400, 0}, {12, 680, 400, 0}, {12, 680, 400, 0}, {12, 680, 400, 0}, {12, 0, 0, 0}}},
    {"Map_d05", {{3, 260, 710, 5}, {8, 170, 560, 0}, {8, 480, 760, 0}, {8, 830, 750, 0}, {8, 890, 520, 0},
                 {8, 750, 370, 0}, {8, 550, 240, 0}, {8, 430, 360, 0}, {8, 320, 660, 0}, {12, 0, 0, 0}}},
};

// @yo2 0x00a4fe00 CFieldMap::mapName (static)
const char* fieldMapName(int32_t map) { return g_fieldMaps[map].name; }

// The entries of `map` for arrivals from `from`, up to the END entry.
static std::vector<int32_t> entriesFrom(int32_t map, int32_t from) {
    std::vector<int32_t> hits;
    for (int32_t i = 0; i < FieldMapInfo::ENTRIES; i++) {
        int32_t f = g_fieldMaps[map].entries[i].from;
        if (f == FieldMapEntry::END)
            break;
        if (f == from)
            hits.push_back(i);
    }
    // The exe divides by zero here (rand() % 0) when nothing matches.
    YO2_ASSERT(!hits.empty(), "no entry GetInitPos(%d,%d)", map, from);
    return hits;
}

// @yo2 0x00a4fe30 CFieldMap::initPos (static, "GetInitPos"): where a player from `from` appears on `map`; a random one of
// the matching entries, z = 0
Vec3 fieldMapInitPos(int32_t map, int32_t from) {
    YO2_ASSERT(map >= 0 && map <= 9, "illegal mapid GetInitPos(%d,%d)", map, from);
    YO2_ASSERT(from >= 0 && from <= 9, "illegal frommap GetInitPos(%d,%d)", map, from);
    std::vector<int32_t> hits = entriesFrom(map, from);
    int32_t i = hits[std::rand() % hits.size()];
    const FieldMapEntry& e = g_fieldMaps[map].entries[i];
    yo2Trace("GetInitPos(%d<-%d) connect=%d  pos(%d,%d)\n", map, from, i, e.x, e.y);
    return {static_cast<float>(e.x), static_cast<float>(e.y), 0.0f};
}

// @yo2 0x00a50190 CFieldMap::initDir (static; asserts as GetInitPos): the facing of a random matching entry (drawn independently of
// fieldMapInitPos's, so with several entries the two can disagree; all of map 8's entries face 0)
int32_t fieldMapInitDir(int32_t map, int32_t from) {
    YO2_ASSERT(map >= 0 && map <= 9, "illegal mapid GetInitPos(%d,%d)", map, from);
    YO2_ASSERT(from >= 0 && from <= 9, "illegal frommap GetInitPos(%d,%d)", map, from);
    std::vector<int32_t> hits = entriesFrom(map, from);
    return g_fieldMaps[map].entries[hits[std::rand() % hits.size()]].dir;
}
