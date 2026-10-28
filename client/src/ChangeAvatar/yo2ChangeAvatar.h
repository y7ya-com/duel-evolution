// yo2ChangeAvatar.cpp: the avatar change screen's parts.
//
// CWindowDialogAvatarSwitch, the dressing window: 13 category buttons (sex, hair, eyes, clothes, colours, ...) down
// the middle, a page of up to 14 item buttons on the right listing what the player may pick for the chosen category
// (fixed choices, or the PBINs the player owns), page arrows, and OK / Back. It reports every press through its
// dialog callback, so result() gives: 0..12 a category, 13..26 an item, 27 OK, 28 Back.
//
// CChangeAvatarPack, the screen's driver: the player's two avatars (one per world) and PBIN bits, the waist-up
// avatar picture of the one being dressed, and the window. It applies each item to the picture and reads the result
// back; OK copies the looks to the other world's avatar (state DONE), Back gives up (CANCELLED).
#pragma once
#include <cstdlib>

#include "Game/Avatar/yo2AvatarData.h"
#include "Net/NetAccount.h"
#include "System/window/yo2WindowDialogs.h"

class CSpriteElm;
class CWADictionary;

class CWindowDialogAvatarSwitch : public CWindowModelDialogOk {
public:
    enum : int32_t { CATEGORIES = 13, ITEMS = 14 };
    enum Result : int32_t { RESULT_ITEM = 13, RESULT_OK = 27, RESULT_BACK = 28 };   // below 13: a category

    static CWindowDialogAvatarSwitch* create(CTask* parent, const CAvatarData* avatar, const CPlayerBinData* bin,
                                             int32_t world, float x, float y);
    CWindowDialogAvatarSwitch();
    ~CWindowDialogAvatarSwitch() override;
    bool onInit() override;
    // @yo2 0x008a8c80 CWindowDialogAvatarSwitch::onMain
    bool onMain() override { return true; }
    void applyZ() override;
    void layout() override;
    void setBandHeight(float h) override;
    void onControlEvent(CWindowTaskControll* sender) override;

    // @yo2 0x008b07a0 CWindowDialogAvatarSwitch::setAvatar: what the items are compared with
    void setAvatar(const CAvatarData& a) { avatar_.set(a.bytes_); }
    void refresh();   // the item page for category_ / page_

    CTaskPtr<CWindowTaskControll> categories_[CATEGORIES];   // 0x400 CTaskPtr<CWindowTaskPictureSwitch>
    CTaskPtr<CWindowTaskText> categoryTexts_[CATEGORIES];    // 0x49c
    CTaskPtr<CWindowTaskControll> items_[ITEMS];             // 0x538
    CTaskPtr<CWindowTaskText> itemTexts_[ITEMS];             // 0x5e0
    CTaskPtr<CWindowTaskControll> buttons_[2];               // 0x688 OK, Back
    CTaskPtr<CWindowTaskText> buttonTexts_[2];               // 0x6a0
    CTaskPtr<CWindowTaskControll> next_;                     // 0x6b8 page arrows
    CTaskPtr<CWindowTaskControll> prev_;                     // 0x6c4
    CTaskPtr<CSpriteElm> frameLine_;                         // 0x6d0 "囲み線" round the items
    CTaskPtr<CSpriteElm> linkLine_;                          // 0x6dc "つなぎの線" from the chosen category to them
    int32_t category_ = -1;                                  // 0x6e8 the chosen category, -1 none
    int32_t value_ = -1;                                     // 0x6ec the chosen item's value
    int32_t itemValues_[ITEMS] = {};                         // 0x6f0 each item button's value, -1 unused
    uint32_t page_ = 0;                                      // 0x728
    uint32_t pageCount_ = 0;                                 // 0x72c the last page's index
    CWADictionary* waDict_ = nullptr;                        // 0x730
    CAvatarData avatar_;                                     // 0x734
    CPlayerBinData bin_{};                                   // 0x748 (its PBIN bits)
    int32_t world_ = 0;                                      // 0x9d0
    uint32_t unk9d4_ = 0;                                    // 0x9d4

private:
    struct Layout;
};
YO2_SIZEOF(CWindowDialogAvatarSwitch, 0x9d8);

class CChangeAvatarPack : public CEasyTask {
public:
    enum State : int32_t { START, RUNNING, DONE, CANCELLED };

    static CChangeAvatarPack* create(CTask* parent, CElement* layer, const CAvatarData* const avatars[2],
                                     const CPlayerBinData* bin, int32_t waistUpArg, int32_t world);
    CChangeAvatarPack();
    ~CChangeAvatarPack() override;
    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    // @yo2 0x008b2c20 CChangeAvatarPack::avatar: a copy of one world's avatar
    void avatar(int32_t world, CAvatarData* out) const { out->set(avatars_[world].bytes_); }

    // @yo2 0x008b2af0 CChangeAvatarPack::randomize ("WUランダム生成"): random hair, eyes, mouth and colours
    static void randomize(CAvatarData* a) {
        const int frontHair = std::rand() % 6, backHair = std::rand() % 4, mouth = std::rand() % 3,
                  eyes = std::rand() % 4, skin = std::rand() % 3, hairColour = std::rand() % 7,
                  eyeColour = std::rand() % 7;
        a->bytes_[CAvatarData::FRONT_HAIR] = static_cast<uint8_t>(frontHair);
        a->bytes_[CAvatarData::BACK_HAIR] = static_cast<uint8_t>(backHair + 0x90);
        a->bytes_[CAvatarData::MOUTH] = static_cast<uint8_t>(mouth + 0x60);
        a->bytes_[CAvatarData::EYES] = static_cast<uint8_t>(eyes + 0x40);
        a->bytes_[13] = static_cast<uint8_t>(skin);
        a->bytes_[14] = static_cast<uint8_t>(hairColour);
        a->bytes_[15] = static_cast<uint8_t>(eyeColour);
    }

    CElement* layer_ = nullptr;                    // 0x70 where base_ goes (cleared once it is made)
    CTaskPtr<CElement> base_;                      // 0x74 "m_pBaseElm"
    int32_t state_ = START;                        // 0x80 State
    uint32_t unk84_ = 0;                           // 0x84
    float unk88_ = 50;                             // 0x88
    CAvatarData avatars_[2];                       // 0x8c one per world
    CPlayerBinData bin_{};                         // 0xb4
    int32_t waistUpArg_ = 0;                       // 0x33c
    CTaskPtr<CElement> waistUp_;                   // 0x340 CTaskPtr<CWaistUpAvatar>
    CTaskPtr<CWindowDialogAvatarSwitch> window_;   // 0x34c
    int32_t world_ = 0;                            // 0x358 the world being dressed
    uint32_t unk35c_ = 0;                          // 0x35c

private:
    struct Layout;
};
YO2_SIZEOF(CChangeAvatarPack, 0x360);
