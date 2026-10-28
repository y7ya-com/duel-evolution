// yo2PlChibiAvatar.cpp: CPlChibiAvatar, a player's chibi on the lobby map. On top of CChibiAvatar it carries the
// player's name and team labels, the country flag, the team flag and the rank stars, all children of the elm.
#pragma once
#include <cstdint>

#include "Game/Avatar/yo2ChibiAvatar.h"
#include "Game/Avatar/yo2NationFlag.h"
#include "Game/Avatar/yo2NpcIcon.h"

class CPlChibiAvatar : public CChibiAvatar {
public:
    static CPlChibiAvatar* create(CTask* parent, CTask* elmParent, const uint8_t* avatar);
    CPlChibiAvatar();
    ~CPlChibiAvatar() override;
    bool onInit() override;
    void reset() override;
    void setup(bool instant) override;
    void onShown() override;

    void setPlayer(const CPlayerInfo& player);
    void setTeam(const CPlayerInfo& player);
    void setNameColor(int32_t state);

    uint32_t unke4_ = 0;                  // 0xe4 (a uint32_t: a byte array would start in the base's tail padding)
    bool hasData_ = false;                // 0xe8 setPlayer has run
    int32_t pid_ = 0;                     // 0xec
    CTaskPtr<CNationFlag> nationFlag_;    // 0xf0
    CTaskPtr<CNpcStar> star_;             // 0xfc
    CTaskPtr<CTeamFlag> teamFlag_;        // 0x108
    uint8_t unk114_[4] = {};              // 0x114

private:
    void setTeamLabel(const CPlayerInfo& player);
};
YO2_AT(CPlChibiAvatar, hasData_, 0xe8);
YO2_AT(CPlChibiAvatar, pid_, 0xec);
YO2_AT(CPlChibiAvatar, nationFlag_, 0xf0);
YO2_AT(CPlChibiAvatar, star_, 0xfc);
YO2_AT(CPlChibiAvatar, teamFlag_, 0x108);
YO2_SIZEOF(CPlChibiAvatar, 0x118);
