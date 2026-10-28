// yo2WaistUpAvatar.cpp: the waist-up avatar (the bust beside dialogs and in the menus). So far: CWADictionary, its
// parts table (data/Avatar/wu/wm_data.csv for men, ww_data.csv for women), made by CGameMng at boot.
#pragma once
#include <cstdint>

#include "System/yo2EasyTask.h"

// One waist-up part: kind, number within its kind, the seven colours' images and the part's rectangle.
struct WaistUpPart {
    int32_t kind;          // 0x000 the avatar byte it belongs to (CAvatarData::Byte)
    uint8_t number;        // 0x004 the part number (the avatar byte's value)
    char images[7][0x40];  // 0x005 one PNG per colour (c01..c07)
    int32_t rect[4];       // 0x1c8 x, y, w, h in the part's sheet
};
YO2_SIZEOF(WaistUpPart, 0x1d8);

class CWADictionary : public CEasyTask {
public:
    enum { MALE, FEMALE, TYPES, MAX_PARTS = 0x82, KINDS = 13 };

    static void create(CTask* parent);
    ~CWADictionary() override;
    bool onInit() override;
    // @yo2 0x009e2230 CWADictionary::onDestroy (empty)
    void onDestroy() override {}
    bool load();

    WaistUpPart parts_[TYPES][MAX_PARTS] = {};   // 0x70
    int32_t count_[TYPES] = {};                  // 0x1dfd0
    int32_t maxNumber_[TYPES][KINDS] = {};       // 0x1dfd8 the highest part number per kind
};
YO2_AT(CWADictionary, parts_, 0x70);
YO2_AT(CWADictionary, count_, 0x1dfd0);
YO2_AT(CWADictionary, maxNumber_, 0x1dfd8);
YO2_SIZEOF(CWADictionary, 0x1e040);
