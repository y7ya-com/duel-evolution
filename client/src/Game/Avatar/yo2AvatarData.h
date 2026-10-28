// yo2AvatarData.cpp: CAvatarData, the 16 bytes that say what a player's avatar looks like. They travel over the
// network as they are (CNetLobby regAvatarInfo / LIST2, PlayerData::avatar in src/Net), one set per world.
// Byte 0 is the sex; the parts are the part's number within its sex's PBIN range (yo2PbinMap.dat column 1:
// PBIN = number + 256 * sex).
#pragma once
#include <cstdint>

#include "System/vc6.h"

class CAvatarData {
public:
    enum Byte : int {
        SEX,          // 0 male, 1 female
        FRONT_HAIR,   // PBIN slot 1
        ACCESSORY,    // slot 2 (32 = none)
        NOSE,         // slot 3
        EYES,         // slot 4
        MOUTH,        // slot 5
        CLOTHES,      // slot 6
        BACK_HAIR,    // slot 7
        DUEL_DISK,    // slot 8
        ACCESSORY2,   // slot 9 (glasses and the like; 32 = none)
        SIZE = 16     // bytes 10..15 are 0 in every default
    };
    // setDefault's types: the sex plus the world (DM = Duelist Kingdom/Battle City, GX = Duel Academia)
    enum Type : int { MALE_DM, FEMALE_DM, MALE_GX, FEMALE_GX };

    // @yo2 0x0063c250 CAvatarData::CAvatarData (setDefault(MALE_DM))
    CAvatarData() { setDefault(MALE_DM); }
    // @yo2 0x0063c280 CAvatarData::~CAvatarData
    // @yo2 0x0063c2a0 CAvatarData deleting destructor
    virtual ~CAvatarData() = default;

    void set(const uint8_t bytes[SIZE]);
    bool equals(const uint8_t bytes[SIZE]) const;
    void setDefault(int type);

    uint8_t bytes_[SIZE];   // 0x04
};
YO2_AT(CAvatarData, bytes_, 0x04);
YO2_SIZEOF(CAvatarData, 0x14);
