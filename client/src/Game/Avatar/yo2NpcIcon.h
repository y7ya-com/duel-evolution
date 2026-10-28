// yo2NpcIcon.cpp: CNpcStar, the row of stars over a chibi (duel rank / NPC difficulty), and the NPC icons.
// PARTIAL: only what yo2PlChibiAvatar.cpp calls so far; the rest comes with yo2NpcIcon.cpp.
#pragma once
#include <cstdint>

#include "System/yo2Element.h"

class CNpcStar : public CElement {
public:
    static CNpcStar* create(CTask* parent, uint32_t priority, int32_t style);
    void setStars(int32_t big, int32_t small);   // 0x009dac50

    uint8_t starBody_[0x430 - 0x340];   // 0x340 (laid out with yo2NpcIcon.cpp)
};
YO2_SIZEOF(CNpcStar, 0x430);
