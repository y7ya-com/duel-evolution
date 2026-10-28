#include "Game/Avatar/yo2AvatarData.h"

#include <cstring>

#include "System/yo2Debug.h"

// @yo2 0x009bce70 CAvatarData::set (copies the 16 bytes)
void CAvatarData::set(const uint8_t bytes[SIZE]) {
    std::memcpy(bytes_, bytes, SIZE);
}

// @yo2 0x009bcea0 CAvatarData::equals (all 16 bytes)
bool CAvatarData::equals(const uint8_t bytes[SIZE]) const {
    return std::memcmp(bytes_, bytes, SIZE) == 0;
}

// @yo2 0x009bced0 CAvatarData::setDefault: the starting avatar of a new character of `type` (Type)
void CAvatarData::setDefault(int type) {
    YO2_ASSERT(type < 4, "DefaultAvaterData Error.");
    std::memset(bytes_, 0, SIZE);
    bytes_[FRONT_HAIR] = 0x00;
    bytes_[ACCESSORY] = 0x20;    // no accessory
    bytes_[NOSE] = 0x30;
    bytes_[EYES] = 0x40;
    bytes_[MOUTH] = 0x60;
    bytes_[BACK_HAIR] = 0x90;
    bytes_[ACCESSORY2] = 0x20;
    switch (type) {
    case MALE_DM:
    case FEMALE_DM:
        bytes_[SEX] = type == FEMALE_DM;
        bytes_[CLOTHES] = 0x70;     // Domino High uniform
        bytes_[DUEL_DISK] = 0xb0;   // Battle City model
        break;
    case MALE_GX:
    case FEMALE_GX:
        bytes_[SEX] = type == FEMALE_GX;
        bytes_[CLOTHES] = 0x80;     // Duel Academia red uniform
        bytes_[DUEL_DISK] = 0xb8;   // Academia model
        break;
    default:   // negative types get here (the first check is signed)
        YO2_ASSERT(false, "DefaultAvaterData Error[2].");
    }
}
