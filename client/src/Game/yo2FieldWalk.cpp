#include "Game/yo2FieldWalk.h"

#include <vector>

// @yo2 0x00a05da0 FieldWalkGrid::FieldWalkGrid
FieldWalkGrid::FieldWalkGrid(int32_t w, int32_t h, const uint8_t* cells) : w_(w), h_(h) {
    auto blocked = [&](int32_t x, int32_t y) { return x >= 0 && x < w_ && y >= 0 && y < h_ && cells[y * w_ + x] == 0; };
    for (int32_t y = 0; y < h_; y++)
        for (int32_t x = 0; x < w_; x++) {
            FieldWalkPoint p{static_cast<float>(x * 20 + 10), static_cast<float>(y * 20 + 10), 0, cells[y * w_ + x], false, {}};
            for (int32_t dy = -2; dy <= 2; dy++)
                for (int32_t dx = -2; dx <= 2; dx++)
                    if ((dx || dy) && blocked(x + dx, y + dy))
                        p.nearBlocked = true;
            points_.push_back(p);
        }
}

namespace {
#include "Game/yo2FieldWalkData.inc"

// The mask rows ('0' / '1') as the cell bytes the exe keeps in .rdata.
template <size_t H>
std::vector<uint8_t> cellsOf(const char* const (&rows)[H]) {
    std::vector<uint8_t> c;
    for (const char* r : rows)
        for (; *r; r++)
            c.push_back(static_cast<uint8_t>(*r - '0'));
    return c;
}
}  // namespace

// Each grid is its own object file in the exe: an entry stub, the constructor call, and its atexit (whose callback
// destroys it; the first copy also holds the destructor's body).
// @yo2 0x009f9530 g_walkA01 entry stub
// @yo2 0x009f9550 g_walkA01 init
// @yo2 0x009f9580 g_walkA01 atexit + callback + FieldWalkGrid::~FieldWalkGrid (0x009f95c0)
FieldWalkGrid g_walkA01(102, 77, cellsOf(kWalk_a01).data());
// @yo2 0x009f9650 g_walkA02 entry stub
// @yo2 0x009f9670 g_walkA02 init
// @yo2 0x009f96a0 g_walkA02 atexit + callback
FieldWalkGrid g_walkA02(102, 77, cellsOf(kWalk_a02).data());
// @yo2 0x009f9730 g_walkA03 entry stub
// @yo2 0x009f9750 g_walkA03 init
// @yo2 0x009f9780 g_walkA03 atexit + callback
FieldWalkGrid g_walkA03(102, 77, cellsOf(kWalk_a03).data());
// @yo2 0x009f9810 g_walkA04 entry stub
// @yo2 0x009f9830 g_walkA04 init
// @yo2 0x009f9860 g_walkA04 atexit + callback
FieldWalkGrid g_walkA04(102, 77, cellsOf(kWalk_a04).data());
// @yo2 0x009f98f0 g_walkD01 entry stub
// @yo2 0x009f9910 g_walkD01 init
// @yo2 0x009f9940 g_walkD01 atexit + callback
FieldWalkGrid g_walkD01(128, 90, cellsOf(kWalk_d01_01).data());
// @yo2 0x009f99d0 g_walkD02 entry stub
// @yo2 0x009f99f0 g_walkD02 init
// @yo2 0x009f9a20 g_walkD02 atexit + callback
FieldWalkGrid g_walkD02(102, 77, cellsOf(kWalk_d02).data());
// @yo2 0x009f9ab0 g_walkD03 entry stub
// @yo2 0x009f9ad0 g_walkD03 init
// @yo2 0x009f9b00 g_walkD03 atexit + callback
FieldWalkGrid g_walkD03(102, 90, cellsOf(kWalk_d03).data());
// @yo2 0x009f9b90 g_walkD04 entry stub
// @yo2 0x009f9bb0 g_walkD04 init
// @yo2 0x009f9be0 g_walkD04 atexit + callback
FieldWalkGrid g_walkD04(102, 77, cellsOf(kWalk_d04_01).data());
