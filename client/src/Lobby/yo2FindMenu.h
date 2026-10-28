// CFindMenu (src\Lobby\yo2playerListDlg.cpp): the small pop-up menu of the lobby's player list (where to look,
// what to sort by). It opens at the mouse, follows it with an active list box, and closes on a pick or a click
// outside; the owner reads choice_ and the two toggles after it reports (onControlEvent with this as sender).
#pragma once
#include "System/window/yo2WindowControls.h"

class CFindMenu : public CWindowTaskModel, public IWindowTaskColleague {
public:
    static CFindMenu* create(CTask* parent);
    CFindMenu();
    ~CFindMenu() override;
    bool onInit() override;
    bool onMain() override;
    // @yo2 0x0088d3c0 CFindMenu::applyZ
    void applyZ() override { pos_.z = z_; }
    void layout() override;
    // @yo2 0x0088d390 CFindMenu::maxZ
    int32_t maxZ() const override { return static_cast<int32_t>(z_ + 2.0f); }
    // @yo2 0x0088d3e0 CFindMenu::onControlEvent (empty)
    void onControlEvent(CWindowTaskControll*) override {}
    // @yo2 0x0088d400 CFindMenu::onControlCommand
    void onControlCommand(CWindowTaskControll*) override { bringToFront(); }
    // @yo2 0x0088d420 CFindMenu::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x0088d440 CFindMenu::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}

    // What the items stand for (items_; the toggles report 5 / 7 and 6 / 8).
    enum Choice : int32_t { PICK_0, PICK_1, PICK_2, PICK_3, PICK_4, TOGGLE_A_ON, TOGGLE_B_ON, TOGGLE_A_OFF,
                            TOGGLE_B_OFF };
    // itemMask_ bits, in the order the items are listed: 2, 4, 0x20, 0x40, 8, 0x10, 1.
    enum : uint32_t { ITEM_0 = 1, ITEM_1 = 2, ITEM_2 = 4, ITEM_3 = 8, ITEM_4 = 0x10, ITEM_A = 0x20, ITEM_B = 0x40 };

    void build();       // the frame, the list and its items
    void open();        // at the mouse's height, shown
    void close();       // hidden, tell the mediator
    void pick(int32_t item);
    CWindowTaskControll* asSender();   // what the owner's onControlEvent sees

    CTaskPtr<CWindowTaskFrameThin> frame_;        // 0x3a0 "CWindowTaskFrameThin m_frame"
    CTaskPtr<CWindowTaskActiveListbox> list_;     // 0x3ac "CWindowTaskActiveListbox m_list"
    bool armed_ = false;                          // 0x3b8 the button went up since it opened: a click outside closes
    int32_t items_[9] = {};                       // 0x3bc what each list row means
    int32_t itemCount_ = 0;                       // 0x3e0
    int32_t choice_ = 0;                          // 0x3e4 the last pick
    bool picked_ = false;                         // 0x3e8
    bool toggleA_ = false;                        // 0x3e9
    bool toggleB_ = false;                        // 0x3ea
    uint32_t itemMask_ = 0x7f;                    // 0x3ec which items build() lists
};
YO2_AT(CFindMenu, frame_, 0x3a0);
YO2_AT(CFindMenu, list_, 0x3ac);
YO2_AT(CFindMenu, armed_, 0x3b8);
YO2_AT(CFindMenu, items_, 0x3bc);
YO2_AT(CFindMenu, itemCount_, 0x3e0);
YO2_AT(CFindMenu, choice_, 0x3e4);
YO2_AT(CFindMenu, picked_, 0x3e8);
YO2_AT(CFindMenu, toggleB_, 0x3ea);
YO2_AT(CFindMenu, itemMask_, 0x3ec);
YO2_SIZEOF(CFindMenu, 0x3f0);
