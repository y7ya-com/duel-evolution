// CPlayerListMenu (src\Lobby\yo2playerListDlg.cpp): the menu a player's name opens in the lobby. Level, name,
// title, record and comment, who they're duelling and the room's conditions, then the buttons that apply (duel,
// friend, trade, chat, black list, watch, jump to them, team invite). A button sets its pressed_ flag and closes the
// menu; the lobby reads the flag.
#pragma once
#include "Net/NetLobby.h"
#include "System/window/yo2WindowDialogs.h"

// One row of the player list dialog (CPlayerListDlg's vector at +0x43c, 0xbc bytes each): what setPlayer() reads.
struct PlayerListEntry {
    int32_t pid;               // 0x00
    vc6::string name;          // 0x04
    int32_t level;             // 0x14
    int32_t wins;              // 0x18
    int32_t losses;            // 0x1c
    vc6::string comment;       // 0x20
    int32_t state;             // 0x30
    uint32_t unk34;
    uint32_t title;            // 0x38 (u16)
    uint32_t unk3c;
    vc6::string rivalName;     // 0x40
    int32_t rivalLevel;        // 0x50
    uint32_t rivalTitle;       // 0x54 (u16)
    int32_t rivalWins;         // 0x58
    int32_t rivalLosses;       // 0x5c
    vc6::string teamName;      // 0x60
    uint8_t teamCode[16];      // 0x70
    uint32_t unk80;
    vc6::string country;       // 0x84
    uint8_t rest[0xbc - 0x94];
};
YO2_AT(PlayerListEntry, comment, 0x20);
YO2_AT(PlayerListEntry, rivalName, 0x40);
YO2_AT(PlayerListEntry, teamName, 0x60);
YO2_AT(PlayerListEntry, country, 0x84);
YO2_SIZEOF(PlayerListEntry, 0xbc);

class CPlayerListMenu : public CWindowTaskModel {
public:
    static CPlayerListMenu* create(CTask* parent);
    CPlayerListMenu();
    ~CPlayerListMenu() override;
    bool onInit() override;
    bool onMain() override;
    // @yo2 0x0088f620 CPlayerListMenu::applyZ
    void applyZ() override { pos_.z = z_; }
    void layout() override;
    // @yo2 0x0088f5f0 CPlayerListMenu::maxZ
    int32_t maxZ() const override { return static_cast<int32_t>(z_ + 2.0f); }
    void onControlEvent(CWindowTaskControll* sender) override;
    // @yo2 0x0088f640 CPlayerListMenu::onControlCommand (empty)
    void onControlCommand(CWindowTaskControll*) override {}
    // @yo2 0x0088f660 CPlayerListMenu::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x0088f680 CPlayerListMenu::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}

    // buttonMask_ bits (the buttons that may show); buttonList_ holds what each shown one is.
    enum : uint32_t { BTN_FRIEND = 2, BTN_TRADE = 4, BTN_CHAT = 8, BTN_BLACK = 0x10, BTN_WATCH = 0x40, BTN_JUMP = 0x80,
                      BTN_TEAM = 0x100 };
    // The buttons (buttons_ / buttonList_ index)...
    enum Button { DUEL, FRIEND_ADD, FRIEND_DEL, TRADE, CHAT, BLACK, BLACK_DEL, MAIL, WATCH, JUMP, TEAM, BUTTON_COUNT };
    // ...and the flags they leave in pressed_ (chat has none: it acts at once).
    enum Pressed { P_DUEL, P_FRIEND_ADD, P_FRIEND_DEL, P_TRADE, P_BLACK, P_BLACK_DEL, P_MAIL, P_WATCH, P_JUMP, P_TEAM,
                   PRESSED_COUNT };
    void press(int32_t flag, bool keepAvatars);

    bool openFor(int32_t pid);                          // FUN_0089a920: at the mouse
    bool openFor(int32_t pid, int32_t x, int32_t y);    // FUN_0089a950
    bool findAndSet(int32_t pid);                       // FUN_0089ada0: the lobby's player -> setPlayer
    void setPlayer(const COnlinePlayer* p);
    void setPlayer(const PlayerListEntry* e);
    void open(int32_t x, int32_t y);
    void close(bool keepAvatars);
    void showInfo(int32_t, int32_t);                    // (both unused)
    void chatTo();                                      // CHAT: "/<name> " into the chat window

    CTaskPtr<CWindowTaskFrameThin> frame_;      // 0x398
    CTaskPtr<CWindowTaskControll> nameText_;    // 0x3a4 CWindowTaskHelp "レベル＆名前表示"
    CTaskPtr<CWindowTaskControll> titleLabel_;  // 0x3b0 『称号：』
    CTaskPtr<CWindowTaskControll> titleText_;   // 0x3bc
    CTaskPtr<CWindowTaskControll> winLabel_;    // 0x3c8 『勝率：』
    CTaskPtr<CWindowTaskControll> winText_;     // 0x3d4
    CTaskPtr<CWindowTaskControll> commentLabel_;   // 0x3e0 『コメント:』
    CTaskPtr<CWindowTaskControll> commentText_;    // 0x3ec
    CTaskPtr<CWindowTaskControll> rivalLabel_;  // 0x3f8 『対戦相手』
    CTaskPtr<CWindowTaskControll> rivalText_;   // 0x404
    CTaskPtr<CWindowTaskControll> condText_;    // 0x410 the room's conditions
    CTaskPtr<CWindowTaskTextSwitch> buttons_[BUTTON_COUNT];    // 0x41c, in Button order
    CTaskPtr<CWindowTaskBackPlane> back_;       // 0x4a0
    CTaskPtr<CTask> waistUp_;                   // 0x4ac CTaskPtr<CWaistUpAvatar> (open() drops an old one)
    CTaskPtr<CElement> flag_;                   // 0x4b8 CTaskPtr<CNationFlag> "Duel国旗"
    uint32_t buttonMask_ = 0x1df;               // 0x4c4
    vc6::string unk4c8_;                        // 0x4c8
    int32_t pid_ = 0;                           // 0x4d8
    int32_t roomId_ = 0;                        // 0x4dc the room the player is in
    int32_t roomP1_ = 0, roomP2_ = 0;           // 0x4e0
    int32_t roomKind_ = 0;                      // 0x4e8 its duel style
    uint8_t roomLocked_ = 0;                    // 0x4ec
    int32_t state_ = 0;                         // 0x4f0 the player's lobby state (0x67..0x6a, 0x98: duelling)
    int32_t teamInvitePid_ = 0;                 // 0x4f4
    int32_t level_ = 0, wins_ = 0, losses_ = 0; // 0x4f8
    vc6::string name_;                          // 0x504
    vc6::string title_;                         // 0x514
    vc6::string comment_;                       // 0x524
    int32_t rivalLevel_ = 0, rivalWins_ = 0, rivalLosses_ = 0;   // 0x534
    vc6::string rivalName_;                     // 0x540
    vc6::string rivalTitle_;                    // 0x550
    vc6::string country_;                       // 0x560
    int32_t unk570_ = 0;                        // 0x570
    uint8_t condA_ = 0, condB_ = 0, condWatch_ = 0;   // 0x574 from the room: x[0], x[1], wmode (watching allowed)
    int32_t unk578_ = 0, unk57c_ = 0, unk580_ = 0;    // 0x578
    vc6::string teamName_;                      // 0x584
    uint8_t teamCode_[16] = {};                 // 0x594
    uint8_t unk5a4_ = 0;                        // 0x5a4
    bool armed_ = false;                        // 0x5a5 the button was up since it opened
    uint8_t unk5a6_[2] = {};
    vc6::vector<int32_t> unk5a8_;               // 0x5a8
    int32_t buttonList_[20] = {};               // 0x5b8 the shown buttons (Button), top to bottom
    int32_t buttonCount_ = 0;                   // 0x608
    bool pressed_[PRESSED_COUNT] = {};          // 0x60c
    uint8_t unk616_[2] = {};
};
YO2_AT(CPlayerListMenu, frame_, 0x398);
YO2_AT(CPlayerListMenu, condText_, 0x410);
YO2_AT(CPlayerListMenu, buttons_, 0x41c);
YO2_AT(CPlayerListMenu, back_, 0x4a0);
YO2_AT(CPlayerListMenu, waistUp_, 0x4ac);
YO2_AT(CPlayerListMenu, flag_, 0x4b8);
YO2_AT(CPlayerListMenu, buttonMask_, 0x4c4);
YO2_AT(CPlayerListMenu, pid_, 0x4d8);
YO2_AT(CPlayerListMenu, roomKind_, 0x4e8);
YO2_AT(CPlayerListMenu, state_, 0x4f0);
YO2_AT(CPlayerListMenu, level_, 0x4f8);
YO2_AT(CPlayerListMenu, name_, 0x504);
YO2_AT(CPlayerListMenu, comment_, 0x524);
YO2_AT(CPlayerListMenu, rivalLevel_, 0x534);
YO2_AT(CPlayerListMenu, rivalName_, 0x540);
YO2_AT(CPlayerListMenu, country_, 0x560);
YO2_AT(CPlayerListMenu, condA_, 0x574);
YO2_AT(CPlayerListMenu, teamName_, 0x584);
YO2_AT(CPlayerListMenu, teamCode_, 0x594);
YO2_AT(CPlayerListMenu, armed_, 0x5a5);
YO2_AT(CPlayerListMenu, unk5a8_, 0x5a8);
YO2_AT(CPlayerListMenu, buttonList_, 0x5b8);
YO2_AT(CPlayerListMenu, buttonCount_, 0x608);
YO2_AT(CPlayerListMenu, pressed_, 0x60c);
YO2_SIZEOF(CPlayerListMenu, 0x618);

// The room `pid` is in (owner or challenger), null if none (CDuelRoomList, inline in the lobby).
CDuelRoom* lobbyRoomOf(CNetLobby* lobby, int32_t pid);
