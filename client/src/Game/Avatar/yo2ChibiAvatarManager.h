// yo2ChibiAvatarManager.cpp: CChibiAvatarMng, owner of every chibi on the map (players and NPCs).
// PARTIAL: only what yo2ChibiAvatar.cpp calls so far; the rest comes with yo2ChibiAvatarManager.cpp.
#pragma once
#include "System/yo2EasyTask.h"

class CChibiAvatar;

class CChibiAvatarMng : public CEasyTask {
public:
    bool lockLoader(CChibiAvatar* who);
    void unlockLoader(CChibiAvatar* who);

    uint8_t mngBody_[0x3d0 - 0x70];
    CChibiAvatar* loading_ = nullptr;   // 0x3d0 the one avatar allowed to load its parts this frame
    uint8_t unk3d4_[4] = {};
};
YO2_AT(CChibiAvatarMng, loading_, 0x3d0);
YO2_SIZEOF(CChibiAvatarMng, 0x3d8);
