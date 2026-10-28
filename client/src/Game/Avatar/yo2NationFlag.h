// yo2NationFlag.cpp: CNationFlag, the little country flag drawn next to a chibi avatar (and in player lists). One
// sprite cut out of a flag atlas in data/avatar/flag/, picked by the player's country code (PlayerData::country).
#pragma once
#include <cstdint>

#include "Game/Avatar/yo2AvatarExtern.h"

class CNationFlag : public CSpriteElm {
public:
    enum Size : int32_t { BIG, SMALL };   // 42x28 (flag_4228_0N.png) / 22x15 (flag_2215_01.png)

    // One row of the flag table (148 rows at 0x00d0b788).
    struct Entry {
        int32_t id;              // 1.. in table order
        const char* code;        // ISO 3166 alpha-2, plus "NPCL" / "NPCG" for NPCs
        const char* smallFile;
        int32_t smallRect[4];    // x, y, w, h in smallFile
        const char* bigFile;
        int32_t bigRect[4];
    };
    static const Entry kFlags[];
    static const int kFlagCount;

    static CNationFlag* create(CTask* parent, uint32_t priority);
    ~CNationFlag() override;
    bool onInit() override;

    bool setNation(const vc6::string& code, int32_t size);
    static bool isKnown(const vc6::string& code);
};
YO2_SIZEOF(CNationFlag, 0x5088);
