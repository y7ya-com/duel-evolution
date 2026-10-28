// yo2PlayerSelect.cpp: CWindowPlayerSelect, the character select window. Four rows (the account's four character
// slots): a button with the character's name (or "no data"), its level, and a Delete button; a Back button; and each
// character's waist-up avatar, the hovered one shown. It reports through the dialog callback: 0..3 a row was picked,
// 4..7 Delete on that row, 0xfa5 Back.
#pragma once
#include "System/window/yo2WindowDialogs.h"

struct CMyUser;
struct CPlayerInfo;

class CWindowPlayerSelect : public CWindowModelDialogOk {
public:
    enum : int32_t { SLOTS = 4, RESULT_BACK = 0xfa5, RESULT_DELETE = 4 };

    static CWindowPlayerSelect* create(CTask* parent, CMyUser* user, float x, float y);
    CWindowPlayerSelect();
    ~CWindowPlayerSelect() override;
    bool onInit() override;
    bool onMain() override;
    void applyZ() override;   // just re-layout
    void layout() override;
    void onControlEvent(CWindowTaskControll* sender) override;

    CPlayerInfo* player(int32_t slot) const;   // null past the fourth
    void refresh();                            // the rows from the account's character list
    bool setBusy(bool on);                     // lock the window and its buttons while the scene works

    CMyUser* user_ = nullptr;                          // 0x400 the account's CMyUser (CNetAccount + 0x121c)
    int32_t selected_ = -1;                            // 0x404 the row the mouse is over (or the first character)
    CTaskPtr<CWindowTaskFrameBottomThick> unk408_;     // 0x408 (never set)
    CTaskPtr<CWindowTaskText> unk414_;                 // 0x414 (never set)
    CTaskPtr<CWindowTaskText> unk420_;                 // 0x420 (never set)
    CTaskPtr<CElement> avatars_[SLOTS];                // 0x42c CTaskPtr<CWaistUpAvatar>
    CTaskPtr<CWindowTaskTextSwitch> rows_[SLOTS];      // 0x45c
    CTaskPtr<CWindowTaskTextSwitch> deletes_[SLOTS];   // 0x48c
    CTaskPtr<CWindowTaskText> levels_[SLOTS];          // 0x4bc "Lv%02d"
    CTaskPtr<CWindowTaskTextSwitch> back_;             // 0x4ec
    bool avatarMade_[SLOTS] = {};                      // 0x4f8
    uint32_t unk4fc_ = 0;

private:
    struct Layout;
};
YO2_SIZEOF(CWindowPlayerSelect, 0x500);

// CWindowTaskTextSwitch::setCaptionAlign (0x0080c920, inlined copy): both texts of the caption.
void textSwitchSetCaptionAlign(CWindowTaskTextSwitch* s, int32_t align);
