// CNpcListMenu (src\Lobby\yo2playerListDlg.cpp): the window an NPC opens in the lobby. Its name and level, the
// player's record against it, its deck and duel conditions, while the duel conversation's waist-up avatars talk;
// "duel?" goes through a yes / no box. A state machine (state_) runs it: 0 ask, 1 wait for the answer, 2 / 4 idle,
// 3 after a duel, 5-13 the NPC's lines (each waits for the balloon to close).
#pragma once
#include "Net/NetAccount.h"
#include "System/window/yo2WindowDialogs.h"

class CNpcListMenu : public CWindowTaskModel {
public:
    static CNpcListMenu* create(CTask* parent);
    CNpcListMenu();
    ~CNpcListMenu() override;
    bool onInit() override;
    bool onMain() override;
    // @yo2 0x0089bbb0 CNpcListMenu::applyZ
    void applyZ() override { pos_.z = z_; }
    void layout() override;
    // @yo2 0x0089bb80 CNpcListMenu::maxZ
    int32_t maxZ() const override { return static_cast<int32_t>(z_ + 2.0f); }
    // @yo2 0x0089e230 CNpcListMenu::onControlEvent (empty)
    void onControlEvent(CWindowTaskControll*) override {}
    // @yo2 0x0089bbd0 CNpcListMenu::onControlCommand
    void onControlCommand(CWindowTaskControll*) override { bringToFront(); }
    // @yo2 0x0089bbf0 CNpcListMenu::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x0089bc10 CNpcListMenu::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}

    enum State : int32_t { ASK, ASKING, DUEL, AFTER_DUEL, IDLE, GREET, GREETING, PRESENT, WON, WON_TALKING, LOST,
                           LOST_TALKING, ITEM, ITEM_TALKING };

    bool setNpc(int32_t npc);                   // the table row, name, avatar, record, PBIN byte
    void open(int32_t npc, int32_t x, int32_t y);           // from the lobby: greets, maybe a present
    void openAfterDuel(int32_t npc, int32_t x, int32_t y);  // back from a duel with it
    void close(bool keepAvatars);
    void showInfo();                            // the texts, laid out top to bottom
    void releaseNpc();                          // GameCtrl back, the area map's NPC let go
    int onYesNo(CWindowTaskModel* window, CALLBACK_MESSAGE_TYPE message, intptr_t value);
    static int32_t conditionText(int32_t npc);  // the duel condition line, -1 = none
    static int32_t presentFor(int32_t npc);     // what the three present NPCs give, 0 = nothing
    static vc6::string npcName(int32_t npc, vc6::string fallback);

    // the states
    void stepAsk();
    void stepAsking();
    void stepAfterDuel();
    void stepGreet();
    void stepPresent();
    void stepWon();
    void stepTalkDone();   // WON_TALKING, LOST_TALKING, ITEM_TALKING
    void stepLost();
    void stepItem();
    void sayLine(int32_t line, int32_t next);   // stepWon / stepLost / stepItem
    void talkOpening(int32_t line, int32_t present);

    // What setNpc keeps (0x44c..0x45f).
    struct NpcInfo {
        int32_t npc = 0;           // 0x44c
        uint8_t unk450_[3] = {};
        uint8_t rank = 0;          // 0x453 the PBIN record's top byte: < 2 hides the deck name
        int32_t rec[3] = {};       // 0x454 npcRecord's first, third and second counts
    };

    CTaskPtr<CWindowTaskFrameThin> frame_;      // 0x398
    CTaskPtr<CWindowTaskControll> nameText_;    // 0x3a4 CWindowTaskHelp "レベル＆名前表示"
    CTaskPtr<CWindowTaskControll> unused3b0_;   // 0x3b0 (never made)
    CTaskPtr<CWindowTaskControll> unused3bc_;   // 0x3bc (never made)
    CTaskPtr<CWindowTaskControll> winLabel_;    // 0x3c8 『勝率：』
    CTaskPtr<CWindowTaskControll> winText_;     // 0x3d4
    CTaskPtr<CWindowTaskControll> deckLabel_;   // 0x3e0 『デッキ名:』
    CTaskPtr<CWindowTaskControll> deckText_;    // 0x3ec
    CTaskPtr<CWindowTaskControll> rivalText_;   // 0x3f8 "対戦相手テキスト": the duel conditions
    CTaskPtr<CWindowTaskControll> condText_;    // 0x404 "デュエル条件テキスト" (hidden)
    CTaskPtr<CWindowTaskTextSwitch> duelButton_;    // 0x410
    CTaskPtr<CWindowTaskTextSwitch> tradeButton_;   // 0x41c
    CTaskPtr<CWindowTaskTextSwitch> chatButton_;    // 0x428
    CTaskPtr<CWindowTaskBackPlane> back_;           // 0x434
    CTaskPtr<CWindowModelDialogYesNo> yesNo_;       // 0x440
    NpcInfo info_;                              // 0x44c
    int32_t unk460_ = 0xd;                      // 0x460
    int32_t state_ = ASK;                       // 0x464
    vc6::string condition_;                     // 0x468 the condition text shown in rivalText_
    int32_t npc_ = 0;                           // 0x478
    int32_t unk47c_[4] = {};                    // 0x47c
    uint8_t unk48c_ = 0;                        // 0x48c
    int32_t unk490_[4] = {};                    // 0x490
    vc6::string name_;                          // 0x4a0
    vc6::string unk4b0_;                        // 0x4b0
    vc6::string unk4c0_;                        // 0x4c0
    int32_t unk4d0_[3] = {};                    // 0x4d0
    vc6::string unk4dc_;                        // 0x4dc
    vc6::string unk4ec_;                        // 0x4ec
    int32_t unk4fc_ = 0;                        // 0x4fc
    uint8_t unk500_ = 0, unk501_ = 0, unk502_ = 0;   // 0x500
    int32_t unk504_[3] = {};                    // 0x504
    CAvatarData avatar_ = {};                   // 0x510 the NPC's parts
    int32_t answer_ = -1;                       // 0x524 the yes / no: 1 yes, 0 no, -1 none yet
    uint8_t unk528_ = 0;                        // 0x528
    vc6::vector<int32_t> unk52c_;               // 0x52c
    int32_t unk53c_[20] = {};                   // 0x53c
    int32_t unk58c_ = 0;                        // 0x58c
    int32_t present_ = 0;                       // 0x590 presentFor()
    bool asked_ = false;                        // 0x594 the duel was accepted
    bool left_ = false;                         // 0x595 releaseNpc() ran
};
YO2_AT(CNpcListMenu, frame_, 0x398);
YO2_AT(CNpcListMenu, nameText_, 0x3a4);
YO2_AT(CNpcListMenu, condText_, 0x404);
YO2_AT(CNpcListMenu, duelButton_, 0x410);
YO2_AT(CNpcListMenu, back_, 0x434);
YO2_AT(CNpcListMenu, yesNo_, 0x440);
YO2_AT(CNpcListMenu, info_, 0x44c);
YO2_AT(CNpcListMenu, state_, 0x464);
YO2_AT(CNpcListMenu, condition_, 0x468);
YO2_AT(CNpcListMenu, npc_, 0x478);
YO2_AT(CNpcListMenu, name_, 0x4a0);
YO2_AT(CNpcListMenu, unk4fc_, 0x4fc);
YO2_AT(CNpcListMenu, avatar_, 0x510);
YO2_AT(CNpcListMenu, answer_, 0x524);
YO2_AT(CNpcListMenu, unk52c_, 0x52c);
YO2_AT(CNpcListMenu, unk58c_, 0x58c);
YO2_AT(CNpcListMenu, present_, 0x590);
YO2_AT(CNpcListMenu, left_, 0x595);
YO2_SIZEOF(CNpcListMenu, 0x598);
