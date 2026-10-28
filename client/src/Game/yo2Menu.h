// yo2Menu.cpp (0x00a607c0..0x00ad3980): the world's menus. This header has the main menu's parts so far:
// CWindowTaskFrameMain (the menus' 3 x 3 frame of 24-pixel cells), CWindowTaskFrameMove (the same frame in the move /
// duel-log textures), CWindowTaskButtonMain (a menu entry) and CMainMenu (the 14-entry menu window).
#pragma once
#include <cstdint>

#include "Game/yo2MenuExtern.h"
#include "System/window/yo2WindowDialogs.h"

// --- CWindowTaskFrameMain: nine 24 x 24 cells of main_win_01_c01.png, the edges and the middle stretched ---------
class CWindowTaskFrameMain : public CWindowTaskControll {
public:
    static CWindowTaskFrameMain* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskFrameMain();
    ~CWindowTaskFrameMain() override;
    bool onInit() override;
    // @yo2 0x00a638c0 CWindowTaskFrameMain::onMain
    bool onMain() override { return true; }
    void layout() override;
    bool handleMessage(WindowMsg m) override;   // a click brings the window to the front
    bool hitTest(float x, float y) override;     // inside the frame
    // @yo2 0x00a61a60 CWindowTaskFrameMain::loadImages (empty: onInit made them)
    virtual void loadImages() {}                 // slot 19: subclasses re-texture the cells
    void setSize(float w, float h);

    // top left, top, top right, left, middle, right, bottom left, bottom, bottom right
    CTaskPtr<CSpriteElm> cells_[9];   // 0x368
    float x_ = 0, y_ = 0;             // 0x3d4
    float w_ = 0, h_ = 0;             // 0x3dc 282 x 218 after onInit
    uint32_t unk3e4_ = 0;             // 0x3e4
};
YO2_AT(CWindowTaskFrameMain, cells_, 0x368);
YO2_AT(CWindowTaskFrameMain, x_, 0x3d4);
YO2_AT(CWindowTaskFrameMain, w_, 0x3dc);
YO2_SIZEOF(CWindowTaskFrameMain, 0x3e8);

// --- CWindowTaskFrameMove: the frame with move_win_01_c01.png (kind 8: log_win_02_c01.png), drawn BLEND_POINT ----
class CWindowTaskFrameMove : public CWindowTaskFrameMain {
public:
    enum : int32_t { KIND_LOG = 8 };
    static CWindowTaskFrameMove* create(CTask* parent, IWindowTaskMediator* mediator, int32_t kind);
    CWindowTaskFrameMove();
    ~CWindowTaskFrameMove() override;
    void loadImages() override;

    int32_t kind_ = 0;   // 0x3e8
    uint32_t unk3ec_ = 0;
};
YO2_AT(CWindowTaskFrameMove, kind_, 0x3e8);
YO2_SIZEOF(CWindowTaskFrameMove, 0x3f0);

// --- CWindowTaskButtonMain: a menu entry, a text switch in main_btn_01_c01.png's pieces -------------------------
class CWindowTaskButtonMain : public CWindowTaskTextSwitch {
public:
    static CWindowTaskButtonMain* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskButtonMain();
    ~CWindowTaskButtonMain() override;
    void loadImages() override;
};
YO2_SIZEOF(CWindowTaskButtonMain, 0x5b8);

// CWindowTaskControll::show (CWindowTask.h inline 0x005d56d0): TM_MAIN on again and visible with the children.
void windowShow(CElement* e);

// --- CMainMenu: the main menu, fourteen entries in a FrameMain at the bottom left, a title and a × button ---------
// An entry picked sets selected_ (what the owner reads, selection()); most entries also open their window under
// owner_ and take over GameCtrl's mode. The menu then hides itself and the menu bar's icon 0 is turned off until
// the window it opened is gone (onMain).
class CMainMenu : public CWindowTaskModel {
public:
    enum : int32_t { ENTRIES = 14 };
    // What each entry is (its index; selected_ uses the same numbers).
    enum Entry : int32_t {
        ENTRY_0, PROFILE, TITLE, COMMENT, DUEL_SETTING, MAIL, ENTRY_6, DUEL_LOG, DUELPASS, BLACKLIST, FRIENDS,
        TEAMS, ENTRY_12, ENTRY_13,
    };
    static CMainMenu* create(CTask* owner);
    CMainMenu();
    ~CMainMenu() override;
    bool onInit() override;
    bool onMain() override;
    // @yo2 0x00a65370 CMainMenu::applyZ
    void applyZ() override { pos_.z = z_; }
    void layout() override;
    int32_t maxZ() const override;
    void onControlEvent(CWindowTaskControll* sender) override;
    // @yo2 0x00a65390 CMainMenu::onControlCommand
    void onControlCommand(CWindowTaskControll*) override { bringToFront(); }
    // @yo2 0x00a653b0 CMainMenu::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x00a653d0 CMainMenu::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}

    void showEntry(int32_t i);    // and lay the entries out again
    void hideEntry(int32_t i);
    void hideEntries();
    void setEntriesEnabled(bool on);   // the config's switched-off entries stay off
    // @yo2 0x00a67250 CMainMenu::selection
    int32_t selection() const { return selected_; }
    void arrange();               // the shown entries from the top, the window resized and set on the bottom edge
    void pollWindows();           // onMain: what the opened windows did

    CTaskPtr<CWindowTaskShadowText> title_;     // 0x398 text 0x1404
    CTaskPtr<CWindowTaskFrameMain> frame_;      // 0x3a4
    CWindowTaskButtonMain* entries_[ENTRIES] = {};   // 0x3b0
    CTaskPtr<CWindowTaskIconHide> close_;       // 0x3e8
    int32_t selected_ = -1;                     // 0x3f4 Entry, -1 none
    CTask* owner_ = nullptr;                    // 0x3f8 the windows the entries open go under it
    // (CWindowModelProfile / CWindowModelSetComment / CChangeTitleTask in the exe; the general types until they land)
    CTaskPtr<CWindowTaskModel> profile_;        // 0x3fc
    CTaskPtr<CWindowTaskModel> comment_;        // 0x408
    CTaskPtr<CTask> changeTitle_;               // 0x414 "称号切り替えオブジェクト"
    CTaskPtr<CWindowModelDialogYesNo> duelpass_;   // 0x420 one of the three duel-pass windows
    bool active_ = false;                       // 0x42c the entries react
    bool duelSettingOpen_ = false;              // 0x42d
    bool shown_[ENTRIES] = {};                  // 0x42e
    uint32_t unk43c_ = 0;                       // 0x43c
};
YO2_AT(CMainMenu, title_, 0x398);
YO2_AT(CMainMenu, frame_, 0x3a4);
YO2_AT(CMainMenu, entries_, 0x3b0);
YO2_AT(CMainMenu, close_, 0x3e8);
YO2_AT(CMainMenu, selected_, 0x3f4);
YO2_AT(CMainMenu, owner_, 0x3f8);
YO2_AT(CMainMenu, profile_, 0x3fc);
YO2_AT(CMainMenu, changeTitle_, 0x414);
YO2_AT(CMainMenu, duelpass_, 0x420);
YO2_AT(CMainMenu, active_, 0x42c);
YO2_AT(CMainMenu, shown_, 0x42e);
YO2_SIZEOF(CMainMenu, 0x440);
