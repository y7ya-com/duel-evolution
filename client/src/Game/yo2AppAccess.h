// What src/Game reads from app-level objects not ported yet. TODO(System): replaced by yo2App.h when System publishes
// it; until then each accessor here names the exe field it stands for, and the tests define them.
#pragma once
#include <cstdint>

// The duel settings saved between duels, bytes of the object at DAT_012714c4 (what CWindowModelDuelConfig starts
// from): its three rows.
enum class AppDuelSetting : uint32_t {
    ROW1 = 0xf0,   // 0: off
    ROW2 = 0xf1,   // 0: off
    ROW3 = 0xf4,   // 0, 1, else 2
};
uint8_t appDuelSetting(AppDuelSetting which);   // *(uint8_t*)(DAT_012714c4 + which)
