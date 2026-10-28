// The world maps' walk grids: one point per 20 x 20 pixel cell of a map, with whether the cell is walkable and
// whether a blocked cell is within two cells of it. Eight maps have one (built at static-init time from masks in the
// exe, yo2FieldWalkData.inc); FieldMapInfo::grid points at it. The exe gives the class no name or RTTI.
#pragma once
#include <cstdint>

#include "System/vc6.h"

struct FieldWalkPoint {
    float x, y, z;       // 0x00 the cell's centre in map pixels (z 0)
    uint8_t walkable;    // 0x0c the mask's value
    bool nearBlocked;    // 0x0d a blocked cell among the 24 around it
    uint8_t unk0e[2];    // 0x0e left as the stack had it in the exe (0 here)
};
YO2_SIZEOF(FieldWalkPoint, 0x10);

class FieldWalkGrid {
public:
    FieldWalkGrid(int32_t w, int32_t h, const uint8_t* cells);
    ~FieldWalkGrid() = default;

    const FieldWalkPoint& at(int32_t x, int32_t y) const { return points_.begin()[y * w_ + x]; }

    int32_t w_;                           // 0x00 cells
    int32_t h_;                           // 0x04
    vc6::vector<FieldWalkPoint> points_;  // 0x08 row by row
};
YO2_AT(FieldWalkGrid, points_, 0x08);
YO2_SIZEOF(FieldWalkGrid, 0x18);

// DAT_012b9ab0..DAT_012b9b90, one per map that has a mask
extern FieldWalkGrid g_walkA01, g_walkA02, g_walkA03, g_walkA04, g_walkD01, g_walkD02, g_walkD03, g_walkD04;
