// src/Lobby/yo2PlayerListMenu.cpp: a lobby player's menu (their info and the buttons that apply).
#include <map>
#include <set>
#include <string>

#include "Game/yo2TgtAvaListDlg.h"
#include "Lobby/yo2PlayerListMenu.h"
#include "lobby_help_stub.h"
#include "lobby_stubs.h"
#include "lobby_test.h"

// --- the game side, recorded -------------------------------------------------------------------------------------
std::vector<std::string> g_log;
static bool has(const std::string& s) {
    for (auto& l : g_log)
        if (l == s) return true;
    return false;
}
static CElement* g_waistUp;
CTask* lobbyWaistUp(int32_t side) { return side == 1 ? g_waistUp : nullptr; }
void duelAvaShowNpc(int32_t side, float z, int32_t npc) { g_log.push_back("show " + std::to_string(side) + " " + std::to_string(int(z)) + " " + std::to_string(npc)); }
void duelAvaHide(int32_t side) { g_log.push_back("hide " + std::to_string(side)); }
void waistUpShow(CTask*, bool on) { g_log.push_back(on ? "wshow" : "whide"); }
void waistUpReset(CTask*) { g_log.push_back("wreset"); }
void duelSetAvatarParts(int32_t side, const uint8_t parts[16]) { g_log.push_back("parts " + std::to_string(side) + " " + std::to_string(parts[0])); }
int32_t appClothType() { return 1; }
bool g_rightPushed;
bool lobbyMouseRightPushed() { return g_rightPushed; }
int32_t windowTextHeight(CWindowTaskText*, int32_t) { return 16; }
std::set<int32_t> g_options, g_friends, g_black;
bool lobbyGameOption(int32_t off) { return g_options.count(off); }
bool lobbyFriendListContains(int32_t pid) { return g_friends.count(pid); }
bool lobbyBlackListContains(int32_t pid) { return g_black.count(pid); }
vc6::string lobbyTitleName(uint16_t t) { return ("title" + std::to_string(t)).c_str(); }
CElement* lobbyNationFlagCreate(CTask* parent, uint32_t prio) {
    auto* e = new CElement;
    e->create(parent, prio);
    return e;
}
void lobbyNationFlagSet(CElement*, const vc6::string& code, int32_t) { g_log.push_back(std::string("flag ") + code.c_str()); }

struct FakeChat : CWindowTaskModel {
    std::u16string text;
    int32_t cursor = -1;
    void layout() override {}
    int32_t maxZ() const override { return 0; }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll*) override {}
};
static FakeChat* g_chat;
CWindowTaskModel* lobbyChatWindow() { return g_chat; }
void chatWindowSetText(CWindowTaskModel*, const char16_t* t) { g_chat->text = t; }
void chatWindowSetCursor(CWindowTaskModel*, int32_t pos, int32_t) { g_chat->cursor = pos; }
static CWindowTaskControll* g_chatInput;
CWindowTaskControll* chatWindowInput(CWindowTaskModel*) { return g_chatInput; }

CNetLobby g_lobby;
CNetLobby* appNetLobby() { return &g_lobby; }

struct Texts : FakeText {
    vc6::string get(uint32_t i) const override {
        if (i == 0x13d7) return "%d-%d";
        if (i == 0x2328) return "Lv";
        return FakeText::get(i);
    }
};

static bool shown(CPlayerListMenu* m, int b) { return m->buttons_[b]->isVisible(true); }

int main() {
    LobbyWorld w;
    Texts texts;
    g_stringDB = &texts;
    g_waistUp = new CElement;
    g_waistUp->create(w.root, 0);
    g_chat = new FakeChat;
    g_chat->create(w.root, 10000);
    g_chatInput = windowHelpCreate(g_chat, g_chat);

    COnlinePlayer p{};
    p.pid = 42;
    std::strcpy(p.name, "Yugi");
    p.level = 7;
    p.w0b0[1] = 10, p.w0b0[5] = 3;
    p.titleId = 5;
    p.state = 1;
    std::strcpy(p.comment, "hello");
    std::strcpy(p.title, "line2");
    std::strcpy(p.country, "JP");
    p.avatar[1].bytes_[0] = 9;
    g_lobby.players.push_back(p);

    g_mouseX = 500, g_mouseY = 300;
    CPlayerListMenu* m = CPlayerListMenu::create(w.root);
    CHECK(m && m->taskName() == "CPlayerListMenu" && m->w_ == 336 && m->modal_ && m->topmost_ && m->buttonMask_ == 0x1df);
    CHECK(m->titleText_->instName() == "CPlayerListMenの称号テキスト" && m->buttons_[CPlayerListMenu::WATCH]->instName() == "\t観戦ボタン");
    CHECK(m->buttons_[CPlayerListMenu::TEAM]->minW_ == 288 && m->buttons_[0]->z_ == 2 && help(m->rivalLabel_.get())->textId == 0x13e6);
    CHECK(m->flag_->instName() == "Duel国旗" && m->flag_->pos_.z == 31729 && m->condWatch_ == 1);

    // a player standing about: friend, trade, chat, black list, jump (mail is off in the mask, no team)
    CHECK(!m->findAndSet(99) && m->findAndSet(42));
    CHECK(m->name_ == "Yugi" && m->title_ == "title5" && m->comment_ == "hello" && m->country_ == "JP");
    m->showInfo(0, 0);
    CHECK(help(m->nameText_.get())->text == u"Lv07      Yugi\n" && help(m->winText_.get())->text == u"10-3");
    CHECK(help(m->commentText_.get())->y == 124 && !m->rivalLabel_->isVisible(true) && !m->condText_->isVisible(true));
    const int want[] = {CPlayerListMenu::FRIEND_ADD, CPlayerListMenu::TRADE, CPlayerListMenu::CHAT, CPlayerListMenu::BLACK,
                        CPlayerListMenu::JUMP};
    CHECK(m->buttonCount_ == 5);
    for (int i = 0; i < 5; i++) CHECK(m->buttonList_[i] == want[i] && shown(m, want[i]) && m->buttons_[want[i]]->y_ == 148 + 36 * i);
    CHECK(!shown(m, CPlayerListMenu::DUEL) && !shown(m, CPlayerListMenu::MAIL) && !shown(m, CPlayerListMenu::TEAM));
    CHECK(m->h_ == 148 + 36 * 5 && m->frame_->h_ == m->h_ && m->back_->y_ == 140 && m->back_->h_ == m->h_ - 140 - 8);
    CHECK(has("flag JP"));

    // a friend on the black list: delete-from-black instead, no friend row or chat
    g_friends.insert(42), g_black.insert(42);
    m->showInfo(0, 0);
    CHECK(m->buttonCount_ == 3 && m->buttonList_[1] == CPlayerListMenu::BLACK_DEL && shown(m, CPlayerListMenu::BLACK_DEL));
    CHECK(!shown(m, CPlayerListMenu::BLACK) && !shown(m, CPlayerListMenu::FRIEND_ADD) && !shown(m, CPlayerListMenu::CHAT));
    g_friends.clear(), g_black.clear();

    // waiting in a room: its conditions, then the duel button
    auto room = std::make_unique<CDuelRoom>();
    room->id = 7, room->p1 = 42, room->dstyle = 3, room->wmode = 1;
    room->x[0] = 1, room->x[1] = 0, room->x[2] = 1;
    g_lobby.rooms.push_back(std::move(room));
    g_lobby.players[0].state = 100;
    m->findAndSet(42);
    m->showInfo(0, 0);
    CHECK(m->roomId_ == 7 && m->condA_ == 1 && m->condB_ == 0 && m->condWatch_ == 1 && m->condText_->isVisible(true));
    CHECK(help(m->condText_.get())->text == u"T13c0\nT13d9\nT13dc\nT13c1\nT13cc\n" && help(m->condText_.get())->y == 140);
    CHECK(m->buttonList_[0] == CPlayerListMenu::DUEL && m->buttons_[0]->y_ == 164 && m->back_->y_ == 156);
    // in a duel: the rival, and watching (the room allows it)
    g_lobby.players[0].state = 0x67;
    std::strcpy(g_lobby.players[0].duelName, "Kaiba");
    g_lobby.players[0].duelLevel = 9;
    g_lobby.players[0].duelStats[0] = 4, g_lobby.players[0].duelStats[1] = 2, g_lobby.players[0].duelStats[2] = 3;
    m->findAndSet(42);
    m->showInfo(0, 0);
    CHECK(m->rivalText_->isVisible(true) && help(m->rivalText_.get())->text == u"Lv09     Kaiba\nT232e:title3\n4-2\n");
    CHECK(help(m->condText_.get())->y == 172 && !shown(m, CPlayerListMenu::DUEL) && !shown(m, CPlayerListMenu::TRADE));
    CHECK(m->buttonCount_ == 3 && m->buttonList_[1] == CPlayerListMenu::WATCH && m->buttonList_[2] == CPlayerListMenu::JUMP);
    g_lobby.rooms.clear();
    g_lobby.players[0].state = 1;

    // open at the mouse: centred, 32 above, the duel avatar showing the player's clothes
    m->setDisp(false, true);
    CHECK(m->openFor(42));
    CHECK(m->isVisible(true) && m->x_ == 500 - 168 && m->y_ == 300 - 32 && g_gameCtrl.now() == 0x13);
    CHECK(has("parts 1 9") && has("show 1 31730 -1") && has("wshow") && has("wreset"));
    // kept on screen
    m->close(true);
    g_mouseX = 1000, g_mouseY = 600;
    m->openFor(42);
    CHECK(m->x_ == 1024 - 336 && m->y_ == 607 - m->h_);

    // a button: its flag, closed; trade keeps the avatar, the friend request doesn't
    g_log.clear();
    m->onControlEvent(m->buttons_[CPlayerListMenu::TRADE].get());
    CHECK(m->pressed_[CPlayerListMenu::P_TRADE] && !m->isVisible(true) && g_sounds.back() == 0x10000001 && !has("hide 1"));
    CHECK(g_gameCtrl.now() != 0x13);
    m->openFor(42, 0, 0);
    m->onControlEvent(m->buttons_[CPlayerListMenu::FRIEND_ADD].get());
    CHECK(m->pressed_[CPlayerListMenu::P_FRIEND_ADD] && has("hide 1"));
    m->openFor(42, 0, 0);
    m->onControlEvent(m->buttons_[CPlayerListMenu::TEAM].get());
    CHECK(m->pressed_[CPlayerListMenu::P_TEAM] && m->teamInvitePid_ == 42);
    // chat: "/Yugi " into the chat line
    m->openFor(42, 0, 0);
    m->onControlEvent(m->buttons_[CPlayerListMenu::CHAT].get());
    CHECK(g_chat->text == u"/Yugi " && g_chat->cursor == 6 && !m->isVisible(true));

    // a right click closes it; the tournament lobby never opens it
    m->openFor(42, 0, 0);
    g_rightPushed = true;
    m->onMain();
    CHECK(!m->isVisible(true));
    g_rightPushed = false;
    g_lobby.rank = 8;
    m->openFor(42, 0, 0);
    CHECK(!m->isVisible(true));
    std::printf("playerlistmenu_test ok\n");
}
