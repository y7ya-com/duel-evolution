// yo2ResultWindow.cpp: the duel result windows.
//
// CWindowResult is a player's record after a duel: a scrollable text with the player's name and the WIN / LOSE /
// SCORE captions, with the three numbers right-aligned beside the captions (CTextElms). CWindowResultNpc is the
// same for a duel against an NPC: a board and a title sprite, the player's name, and W/LOSE/DRAW captions with
// their counts, all drop-shadowed texts. CWindowTaskResultNext is the result screen's "next" button (a text button
// with its own skin).
//
// The file's first classes (CWindowTaskResultBase, CWindowResultScroll, CWindowResultNext, 0x8c4c40..0x8c6ab0) and
// CWindowResult's New/destructor/inline virtuals are labelled `duel` in labels.tsv; CWindowResult's are ported here
// with the rest of the class, the other classes are not (see HEADER_ISSUES.md).
#pragma once
#include <cstdint>

#include "Result/yo2UiStandIns.h"

// ---------------------------------------------------------------- other classes of this source file (not ported)
// CWindowTaskResultBase::New (0x8c4e60): the result window's frame (a control; `side`, `kind` as for CWindowResult).
CWindowTaskControll* resultBaseNew(CTask* parent, IWindowTaskMediator* mediator, int32_t side, int32_t kind);
// CWindowResultScroll::New (0x8c5980): the result text's vertical scroll bar.
CWindowTaskScrollBase* resultScrollNew(CTask* parent, IWindowTaskMediator* mediator, int32_t max);

// ---------------------------------------------------------------- a player's record
class CWindowResult : public CWindowTaskModel {
public:
    static CWindowResult* newChild(CTask* parent, int32_t side, int32_t kind);
    CWindowResult();
    ~CWindowResult() override;

    bool onInit() override;
    bool onMain() override;
    void layout() override;
    int32_t baseZ() override;
    void setText(const WChar* s) override;
    void onControlEvent(IWindowTaskColleague* sender) override;
    void onControlCommand(IWindowTaskColleague* sender) override;
    void mediatorSlot2(IWindowTaskColleague* sender) override;
    void mediatorSlot3(int32_t) override;
    void beginDrag(IWindowTaskColleague* sender, int32_t x, int32_t y) override;

    void setPlayerName(const char* name);
    void setRecord(int32_t wins, int32_t loses, int32_t score) {
        wins_ = wins;
        loses_ = loses;
        score_ = score;
    }
    void refresh();

    static constexpr int32_t kVisibleLines = 13;

    CWindowTaskControll* base_ = nullptr;      // 0x398 CWindowTaskResultBase
    uint32_t unk39c_ = 0;                      // 0x39c
    CWindowTaskShadowText* text_ = nullptr;    // 0x3a0 name + captions
    CWindowTaskScrollBase* scroll_ = nullptr;  // 0x3a4 CWindowResultScroll
    CTaskPtr<CTextElm> winNum_;                // 0x3a8 "CTextElm::m_WinNum"
    CTaskPtr<CTextElm> loseNum_;               // 0x3b4 "CTextElm::m_LoseNum"
    CTaskPtr<CTextElm> scoreNum_;              // 0x3c0 "CTextElm::m_ScoreNum"
    int32_t kind_ = 0;                         // 0x3cc New's third argument (passed to the frame)
    int32_t side_ = 0;                         // 0x3d0 0: the left window, else the right one
    vc6::string name_;                         // 0x3d4
    int32_t wins_ = 0;                         // 0x3e4
    int32_t loses_ = 0;                        // 0x3e8
    int32_t score_ = 0;                        // 0x3ec

private:
    void init(int32_t side, int32_t kind);
    void placeNumber(CTaskPtr<CTextElm>& num, int32_t value, int32_t dy);
    struct Layout;
};
YO2_SIZEOF(CWindowResult, 0x3f0);

// ---------------------------------------------------------------- the "next" button
class CWindowTaskResultNext : public CWindowTaskTextSwitch {
public:
    static CWindowTaskResultNext* newChild(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskResultNext();
    ~CWindowTaskResultNext() override;
    void loadImages() override;
};
YO2_SIZEOF(CWindowTaskResultNext, 0x5b8);

// ---------------------------------------------------------------- the NPC duel record
class CWindowResultNpc : public CWindowTaskModel {
public:
    static CWindowResultNpc* newChild(CTask* parent);
    CWindowResultNpc();
    ~CWindowResultNpc() override;

    bool onInit() override;
    bool onMain() override;
    void layout() override;
    int32_t baseZ() override;
    void onControlEvent(IWindowTaskColleague* sender) override;
    void onControlCommand(IWindowTaskColleague* sender) override;
    void mediatorSlot2(IWindowTaskColleague* sender) override;
    void mediatorSlot3(int32_t) override;
    void beginDrag(IWindowTaskColleague* sender, int32_t x, int32_t y) override;

    void setPlayerName(const char* name);
    void setWins(int32_t n);
    void setLoses(int32_t n);
    void setDraws(int32_t n);
    void refresh();

    CTaskPtr<CSpriteElm> board_;                // 0x398 "NPCリザルトウィンドウ土台"
    CTaskPtr<CSpriteElm> title_;                // 0x3a4 "NPCリザルトウィンドウ"
    CTaskPtr<CWindowTaskShadowText> name_;      // 0x3b0
    CTaskPtr<CWindowTaskShadowText> winCaption_;   // 0x3bc "W"
    CTaskPtr<CWindowTaskShadowText> loseCaption_;  // 0x3c8 "LOSE"
    CTaskPtr<CWindowTaskShadowText> drawCaption_;  // 0x3d4 "DRAW"
    CTaskPtr<CWindowTaskShadowText> winCount_;     // 0x3e0
    CTaskPtr<CWindowTaskShadowText> loseCount_;    // 0x3ec
    CTaskPtr<CWindowTaskShadowText> drawCount_;    // 0x3f8
    CTaskPtr<CWindowTaskScrollBase> scroll_;    // 0x404 CTaskPtr<CWindowResultScroll>, never set
    vc6::string playerName_;                    // 0x410
    int32_t wins_ = 0;                          // 0x420
    int32_t loses_ = 0;                         // 0x424
    int32_t draws_ = 0;                         // 0x428
    uint32_t unk42c_ = 0;                       // 0x42c

private:
    CWindowTaskShadowText* makeText(CTaskPtr<CWindowTaskShadowText>& ptr, const char* name, float y, int32_t align);
    struct Layout;
};
YO2_SIZEOF(CWindowResultNpc, 0x430);
