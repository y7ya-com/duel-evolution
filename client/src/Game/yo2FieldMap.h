// yo2FieldMap.cpp: the world maps. CFieldMap itself (a 10 MB CElement holding 16x16 map tiles, each a pair of
// System sprites, plus the object sprites read from FieldMapData.txt) is not rewritten yet: it is built on System's
// sprite/texture classes (see STATUS_world.md). What is here is CFieldMap's static map table: the ten world maps and,
// for each, where a player arriving from another map appears.
#pragma once
#include <cstdint>

#include "System/vc6.h"
#include "System/yo2Math.h"

// Where a player coming from `from` enters a map. Map 8 (the duel room) has several entries per map: leaving a room
// puts the player at one of them at random.
struct FieldMapEntry {
    enum : int32_t { END = 12 };   // `from` of the entry after the last
    int32_t from;   // 0x00 previous map id, or END
    int32_t x;      // 0x04 position in map pixels
    int32_t y;      // 0x08
    int32_t dir;    // 0x0c facing on arrival
};
YO2_SIZEOF(FieldMapEntry, 0x10);

struct FieldMapInfo {
    enum { ENTRIES = 10 };
    char name[0x104];                       // 0x000 "Map_d01_01": the map's section in FieldMapData.txt
    FieldMapEntry entries[ENTRIES];         // 0x104
};
YO2_SIZEOF(FieldMapInfo, 0x1a4);

enum { FIELD_MAPS = 10 };
extern const FieldMapInfo g_fieldMaps[FIELD_MAPS];   // DAT_00d2d4d0

const char* fieldMapName(int32_t map);
Vec3 fieldMapInitPos(int32_t map, int32_t from);
int32_t fieldMapInitDir(int32_t map, int32_t from);
