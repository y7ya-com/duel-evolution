// yo2DuelWindows.cpp: the duel room's windows: CWindowTaskButtonDuel (the duel menus' choice button) and the duel
// settings window CWindowModelDuelConfig with its frame CWindowTaskDuelConfigFrame.
#pragma once
#include <cstdint>

#include "System/window/yo2WindowControls.h"

// --- CWindowTaskButtonDuel: a text button on duel_btn_01_c01.png ------------------------------------------------
class CWindowTaskButtonDuel : public CWindowTaskTextSwitch {
public:
    // (the exe sets the mediator after create, so onInit runs without one)
    static CWindowTaskButtonDuel* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskButtonDuel();
    ~CWindowTaskButtonDuel() override;
    void loadImages() override;
};
YO2_SIZEOF(CWindowTaskButtonDuel, 0x5b8);

// TODO(Result): CWindowResultScroll::create (0x008c5980), the result window's vertical scroll bar (a
// CWindowTaskScrollBase); the settings window reuses it for its help text.
CWindowTaskScrollBase* duelResultScrollCreate(CTask* parent, IWindowTaskMediator* mediator, int32_t style);

// --- CWindowTaskDuelConfigFrame: the settings window's background, one 492 x 452 picture (duel_win_03_c01.png) ----
class CWindowTaskDuelConfigFrame : public CWindowTaskPictureFrame {
public:
    // (the exe sets the mediator after create)
    static CWindowTaskDuelConfigFrame* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskDuelConfigFrame();
    ~CWindowTaskDuelConfigFrame() override;
    void loadImages() override;

    uint32_t unk474_ = 0;   // 0x474 (never written)
};
YO2_SIZEOF(CWindowTaskDuelConfigFrame, 0x478);

// --- CWindowModelDuelConfig: "デュエル詳細設定", the duel settings window --------------------------------------
// Three rows of choices (picture switches: rows 1 and 2 on / off, row 3 one of three), a help text with a scroll
// bar and arrows, OK and Cancel. It starts from the saved settings (appDuelSetting) and writes them to g_gameMng.
class CWindowModelDuelConfig : public CWindowTaskModel {
public:
    static CWindowModelDuelConfig* create(CTask* parent);
    CWindowModelDuelConfig();
    ~CWindowModelDuelConfig() override;
    bool onInit() override;
    // onMain (0x00a49430), onControlEvent (0x00a4af50) and slot 21 (0x00a492c0) are outside the assigned rows:
    // not ported (the base onMain runs; onControlEvent does nothing).
    void onControlEvent(CWindowTaskControll* sender) override;
    void onControlCommand(CWindowTaskControll* sender) override;   // brings the window to the front
    void applyZ() override;
    // @yo2 0x00a4af30 CWindowModelDuelConfig::layout (empty)
    void layout() override {}
    int32_t maxZ() const override;
    // the rows' switches (the other choice of the row unchecked) and the remembered values
    void setRow1(bool on);
    void setRow2(bool on);
    void setRow3(int32_t choice);   // 0..2 (other values are only remembered)

    CTaskPtr<CWindowTaskDuelConfigFrame> frame_;   // 0x398
    CTaskPtr<CWindowTaskShadowText> title_;        // 0x3a4
    CTaskPtr<CWindowTaskShadowText> label1_;       // 0x3b0
    CTaskPtr<CWindowTaskPictureSwitch> row1On_;    // 0x3bc
    CTaskPtr<CWindowTaskShadowText> row1OnText_;   // 0x3c8
    CTaskPtr<CWindowTaskPictureSwitch> row1Off_;   // 0x3d4
    CTaskPtr<CWindowTaskShadowText> row1OffText_;  // 0x3e0
    CTaskPtr<CWindowTaskShadowText> label2_;       // 0x3ec
    CTaskPtr<CWindowTaskPictureSwitch> row2On_;    // 0x3f8
    CTaskPtr<CWindowTaskShadowText> row2OnText_;   // 0x404
    CTaskPtr<CWindowTaskPictureSwitch> row2Off_;   // 0x410
    CTaskPtr<CWindowTaskShadowText> row2OffText_;  // 0x41c
    CTaskPtr<CWindowTaskShadowText> label3_;       // 0x428
    CTaskPtr<CWindowTaskPictureSwitch> row3A_;     // 0x434
    CTaskPtr<CWindowTaskShadowText> row3AText_;    // 0x440
    CTaskPtr<CWindowTaskPictureSwitch> row3B_;     // 0x44c
    CTaskPtr<CWindowTaskShadowText> row3BText_;    // 0x458
    CTaskPtr<CWindowTaskPictureSwitch> row3C_;     // 0x464
    CTaskPtr<CWindowTaskShadowText> row3CText_;    // 0x470
    CTaskPtr<CWindowTaskShadowText> helpLabel_;    // 0x47c "『説明』"
    CTaskPtr<CWindowTaskShadowText> help_;         // 0x488 "説明"
    CTaskPtr<CWindowTaskPictureSwitch> helpUp_;    // 0x494 (hidden)
    CTaskPtr<CWindowTaskPictureSwitch> helpDown_;  // 0x4a0 (hidden)
    CTaskPtr<CWindowTaskScrollBase> helpScroll_;   // 0x4ac CTaskPtr<CWindowResultScroll> in the exe
    CTaskPtr<CWindowTaskButtonDuel> ok_;           // 0x4b8
    CTaskPtr<CWindowTaskButtonDuel> cancel_;       // 0x4c4
    bool row1_ = true;                             // 0x4d0
    bool row2_ = true;                             // 0x4d1
    int32_t row3_ = 1;                             // 0x4d4
    int32_t unk4d8_ = 0, unk4dc_ = 0;              // 0x4d8 -1 after onInit
    uint32_t unk4e0_ = 0, unk4e4_ = 0;             // 0x4e0
};
YO2_AT(CWindowModelDuelConfig, frame_, 0x398);
YO2_AT(CWindowModelDuelConfig, row1On_, 0x3bc);
YO2_AT(CWindowModelDuelConfig, row3A_, 0x434);
YO2_AT(CWindowModelDuelConfig, helpLabel_, 0x47c);
YO2_AT(CWindowModelDuelConfig, helpScroll_, 0x4ac);
YO2_AT(CWindowModelDuelConfig, cancel_, 0x4c4);
YO2_AT(CWindowModelDuelConfig, row1_, 0x4d0);
YO2_AT(CWindowModelDuelConfig, row3_, 0x4d4);
YO2_SIZEOF(CWindowModelDuelConfig, 0x4e8);
