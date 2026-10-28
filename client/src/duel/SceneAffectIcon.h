// CAffectIcon (yo2AffectIcon.cpp, 0x00751cd0..0x00753090): while the mouse is over a card on the mat, small movies
// mark every card that affects it or that it affects (the engine's relations), the chain links targeting it, and
// the other fighter of the attack under way. Up to 30 icons, reused frame to frame.
#pragma once
#include "SceneBattleManager.h"

namespace ds {

class CAffectIcon : public CGameObject, public CTaskUser {
public:
    CAffectIcon();
    ~CAffectIcon() override;                // FUN_00751d20
    void update() override;                 // FUN_00752070 slot 2
    void draw() override;                   // FUN_00752c40 slot 3
    void addIcon(const int32_t* pos, int32_t kind);   // FUN_00752090

    uint16_t v14 = 0;                       // 0x14
    uint8_t pad16_[2] = {};
    CCard* hovered = nullptr;               // 0x18 the card under the mouse (last update)
    CTaskPtr<CSwfEngine> icons[30];         // 0x1c
    uint8_t used[30] = {};                  // 0x184 placed this frame
    uint8_t pad1a2_[2] = {};
};
YO2_AT(CAffectIcon, hovered, 0x18);
YO2_AT(CAffectIcon, icons, 0x1c);
YO2_AT(CAffectIcon, used, 0x184);
YO2_SIZEOF(CAffectIcon, 0x1a4);

// The value each hovered card leaves per mat slot (DAT_012a6140, [player * 10 + slot]): card 0x1432's counter.
#if YO2_IN_EXE
#define g_affectMarks YO2_EXE_ARR(uint32_t, 0x012a6140)
#else
extern uint32_t g_affectMarks[21];
#endif

}   // namespace ds
