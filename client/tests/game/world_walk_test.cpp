// yo2FieldWalk.cpp: the walk grids (cell centres, walkable, near-blocked) and FieldMapInfo::grid.
#include "Game/yo2FieldMap.h"
#include "Game/yo2FieldWalk.h"
#include "game_test.h"

int main() {
    // a 6 x 5 mask with one blocked cell at (1, 1)
    uint8_t cells[30];
    for (uint8_t& c : cells)
        c = 1;
    cells[1 * 6 + 1] = 0;
    FieldWalkGrid g(6, 5, cells);
    CHECK(g.w_ == 6 && g.h_ == 5 && g.points_.size() == 30);
    const FieldWalkPoint& p = g.at(4, 2);
    CHECK(p.x == 90 && p.y == 50 && p.z == 0 && p.walkable == 1);
    CHECK(g.at(1, 1).walkable == 0 && !g.at(1, 1).nearBlocked);   // itself doesn't count
    CHECK(g.at(3, 3).nearBlocked && g.at(0, 0).nearBlocked && !g.at(4, 1).nearBlocked && !g.at(1, 4).nearBlocked);
    CHECK(g.at(3, 1).nearBlocked && !g.at(5, 4).nearBlocked);

    // the maps' grids, from the exe's masks
    CHECK(g_fieldMaps[0].grid == &g_walkD01 && g_walkD01.w_ == 128 && g_walkD01.h_ == 90);
    CHECK(g_fieldMaps[4].grid == &g_walkA01 && g_fieldMaps[8].grid == nullptr && g_fieldMaps[9].grid == nullptr);
    CHECK(g_walkD03.h_ == 90 && g_walkD03.points_.size() == 102 * 90);
    int walkable = 0;
    for (const FieldWalkPoint* q = g_walkA01.points_.begin(); q != g_walkA01.points_.end(); ++q)
        walkable += q->walkable;
    CHECK(walkable == 5729);   // the mask's count of 1s
    CHECK(g_walkA01.at(0, 0).walkable == 0 && g_walkA01.at(101, 0).walkable == 1);
    std::printf("world_walk_test ok\n");
}
