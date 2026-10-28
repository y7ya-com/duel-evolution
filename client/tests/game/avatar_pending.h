// Stand-ins for src/Game/Avatar functions that are declared but not ported yet (their .obj block comes later).
// Every avatar test links all Avatar sources, so they are here, recorded in pendingLog(); each goes when its file
// lands.
#pragma once
#include <string>
#include <vector>

#include "Game/Avatar/yo2ChibiAvatarElm.h"
#include "Game/Avatar/yo2NpcIcon.h"

struct PendingLog {
    std::vector<std::string> calls;
    bool has(const std::string& c) const {
        for (auto& x : calls)
            if (x == c) return true;
        return false;
    }
};
inline PendingLog& pendingLog() {
    static PendingLog l;
    return l;
}

// yo2NpcIcon.cpp
CNpcStar* CNpcStar::create(CTask* parent, uint32_t priority, int32_t style) {
    pendingLog().calls.push_back("star.create:" + std::to_string(style));
    return dynamic_cast<CNpcStar*>((new CNpcStar)->CTask::create(parent, priority));
}
void CNpcStar::setStars(int32_t big, int32_t small) {
    pendingLog().calls.push_back("star:" + std::to_string(big) + "," + std::to_string(small));
}
