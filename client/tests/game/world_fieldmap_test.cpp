// yo2FieldMap.cpp: the static map table (names, arrival points).
#include <cstdlib>
#include <cstring>
#include <set>

#include "Game/yo2FieldMap.h"
#include "game_test.h"

int main() {
    CHECK(!std::strcmp(fieldMapName(0), "Map_d01_01") && !std::strcmp(fieldMapName(8), "Map_r01"));
    CHECK(!std::strcmp(fieldMapName(9), "Map_d05"));

    // single-entry arrivals: fixed position and facing
    Vec3 p = fieldMapInitPos(0, 2);
    CHECK(p.x == 1700 && p.y == 230 && p.z == 0 && fieldMapInitDir(0, 2) == 1);
    p = fieldMapInitPos(1, 0);
    CHECK(p.x == 950 && p.y == 1300 && fieldMapInitDir(1, 0) == 3);
    p = fieldMapInitPos(4, 7);
    CHECK(p.x == 200 && p.y == 1200 && fieldMapInitDir(4, 7) == 7);
    p = fieldMapInitPos(8, 8);   // the room's own entry, before the END rows
    CHECK(p.x == 680 && p.y == 400 && fieldMapInitDir(8, 8) == 0);

    // leaving a duel room for map 0: one of its seven room entries, at random
    std::set<std::pair<int, int>> seen;
    std::srand(1);
    for (int i = 0; i < 400; i++) {
        p = fieldMapInitPos(0, 8);
        seen.insert({(int)p.x, (int)p.y});
        CHECK(fieldMapInitDir(0, 8) == 0);
    }
    CHECK(seen.size() == 7 && seen.count({1280, 1350}) && seen.count({870, 330}) && !seen.count({1700, 230}));

    // map 1: entries after END (index 7) are never used
    seen.clear();
    for (int i = 0; i < 200; i++) {
        p = fieldMapInitPos(1, 8);
        seen.insert({(int)p.x, (int)p.y});
    }
    CHECK(seen.size() == 5);

    // every map but the room has one non-room arrival per neighbour, and every neighbour links back
    for (int m = 0; m < FIELD_MAPS; m++)
        for (const FieldMapEntry& e : g_fieldMaps[m].entries) {
            if (e.from == FieldMapEntry::END) break;
            if (e.from >= FIELD_MAPS || e.from == 8 || m == 8) continue;
            bool back = false;
            for (const FieldMapEntry& f : g_fieldMaps[e.from].entries) back |= f.from == m;
            CHECK(back);
        }
    std::printf("world_fieldmap_test ok\n");
}
