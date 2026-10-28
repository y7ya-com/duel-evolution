// src/Lobby/yo2NpcListMenu.cpp: an NPC's window in the lobby and its conversation.
#include <map>
#include <string>

#include "Game/yo2EventManager.h"
#include "Game/yo2TgtAvaListDlg.h"
#include "Lobby/yo2NpcListMenu.h"
#include "Net/NetLobby.h"
#include "lobby_help_stub.h"
#include "lobby_stubs.h"
#include "lobby_test.h"

// --- the game side, recorded -------------------------------------------------------------------------------------
std::vector<std::string> g_log;
static std::string fmt(const char* f, ...) {
    char b[256];
    va_list a;
    va_start(a, f);
    std::vsnprintf(b, sizeof b, f, a);
    va_end(a);
    return b;
}
struct FakeWaistUp : CElement {
    bool balloon = false;
};
static FakeWaistUp* g_waistUp;
static CFukiDictionary* g_fuki;
CFukiDictionary* lobbyFukiDictionary() { return g_fuki; }
CTask* lobbyWaistUp(int32_t side) { return side == 1 ? g_waistUp : nullptr; }
void duelAvaShowNpc(int32_t side, float z, int32_t npc) { g_log.push_back(fmt("show %d %g %d", side, z, npc)); }
void duelAvaClose(int32_t side) { g_log.push_back(fmt("close %d", side)); }
int32_t g_nameText = -1;
int32_t duelAvaNpcNameText(int32_t) { return g_nameText; }
bool waistUpBalloonOpen(CTask*) { return g_waistUp->balloon; }
void waistUpShow(CTask*, bool on) { g_log.push_back(fmt("wshow %d", on)); }
void waistUpReset(CTask*) { g_log.push_back("wreset"); }
void waistUpSetSpeaker(CTask*, vc6::string n, int32_t a, int32_t f) { g_log.push_back(fmt("speaker %s %d %d", n.c_str(), a, f)); }
void waistUpSetListener(CTask*, vc6::string n) { g_log.push_back(fmt("listener %s", n.c_str())); }
void waistUpSay(CTask*, int32_t npc, int32_t line) {
    g_log.push_back(fmt("say %d %d", npc, line));
    g_waistUp->balloon = true;
}
void waistUpSayText(CTask*, vc6::string t, int32_t a) { g_log.push_back(fmt("saytext %s %d", t.c_str(), a)); }
void waistUpSayPresent(CTask*, int32_t p, int32_t a, int32_t b) { g_log.push_back(fmt("present %x %d %d", p, a, b)); }
void duelSetAvatarParts(int32_t side, const uint8_t parts[16]) { g_log.push_back(fmt("parts %d %d", side, parts[0])); }
int32_t duelResultLine() { return 0x31; }
int32_t g_duelResult = 1, g_duelNpc;
int32_t lobbyDuelResult() { return g_duelResult; }
void lobbySetDuelNpc(int32_t npc) { g_duelNpc = npc; }
bool g_presentDone;
bool npcPresentDone(int32_t) { return g_presentDone; }
void npcRecord(int32_t, int32_t* a, int32_t* b, int32_t* c, int32_t* d) { *a = 12, *b = 34, *c = 56, *d = 78; }
vc6::string npcDeckName(int32_t id) { return fmt("deck%d", id).c_str(); }
static std::vector<LobbyNpcRow> g_rows;
const LobbyNpcRow* lobbyNpcRows(size_t* n) {
    *n = g_rows.size();
    return g_rows.empty() ? nullptr : g_rows.data();
}
void lobbyAreaMapNpcRelease(int32_t npc) { g_log.push_back(fmt("release %d", npc)); }
CNetLobby g_lobby;
CNetAccount g_acc;
CNetLobby* appNetLobby() { return &g_lobby; }
CNetAccount* appNetAccount() { return &g_acc; }
static bool has(const std::string& s) {
    for (auto& l : g_log)
        if (l == s) return true;
    return false;
}

struct Texts : FakeText {
    vc6::string get(uint32_t i) const override {
        if (i == 0x13d7) return "%d-%d";
        if (i == 0x22c6) return "cond";
        if (i == 0x777) return "Kaiba";
        return FakeText::get(i);
    }
};

int main() {
    LobbyWorld w;
    Texts texts;
    g_stringDB = &texts;
    g_waistUp = new FakeWaistUp;
    g_waistUp->create(w.root, 0);
    g_fuki = new CFukiDictionary;   // empty: no lines
    LobbyNpcRow row{};
    row.id = 0x33;
    std::strcpy(row.name, "Bandit");
    row.parts[0] = 9;
    g_rows.push_back(row);
    std::strcpy(g_acc.me.players[0].name, "Me");
    g_acc.bin.npcBin[0x33 * 4 + 3] = 2;   // the PBIN byte: deck name shown

    CNpcListMenu* m = CNpcListMenu::create(w.root);
    CHECK(m && m->taskName() == "CPlayerListMenu" && m->w_ == 336 && m->modal_ && m->topmost_);
    CHECK(m->nameText_->instName() == "CPlayerListMenuのレベル＆名前表示" && m->duelButton_->instName() == "デュエル申し込みボタン");
    CHECK(m->duelButton_->minW_ == 288 && m->duelButton_->z_ == 2 && help(m->winLabel_.get())->textId == 0x2331);
    CHECK(elmOf(windowHelpText(m->nameText_.get()))->align == 1 && help(m->winText_.get())->back[0] == 0.8f);
    CHECK(!m->unused3b0_.task() && m->state_ == CNpcListMenu::ASK && m->unk502_ == 1);

    // setNpc: the table's name unless the duel module has one
    CHECK(!m->setNpc(0x99));
    CHECK(m->setNpc(0x33) && m->name_ == "Bandit" && m->avatar_.bytes_[0] == 9 && m->info_.npc == 0x33);
    CHECK(m->info_.rec[0] == 12 && m->info_.rec[1] == 56 && m->info_.rec[2] == 34 && m->info_.rank == 2);
    g_nameText = 0x777;
    CHECK(m->setNpc(0x33) && m->name_ == "Kaiba");
    g_nameText = -1;
    m->setNpc(0x33);
    CHECK(CNpcListMenu::conditionText(0x33) == 0x22c6 && CNpcListMenu::conditionText(0x5f) == 0x22d5);
    CHECK(CNpcListMenu::conditionText(0x60) == -1 && CNpcListMenu::presentFor(0x43) == 0x655e);

    // showInfo: the texts top to bottom, the condition sized to its lines (1 line of 16)
    m->showInfo();
    CHECK(help(m->nameText_.get())->text == u"  Bandit" && help(m->winText_.get())->text == u"12-56");
    CHECK(help(m->deckText_.get())->text == u"deck10051" && help(m->rivalText_.get())->text == u"cond\n");
    CHECK(help(m->rivalText_.get())->y == 108 && help(m->rivalText_.get())->h == 16 && m->h_ == 132);
    CHECK(m->back_->y_ == 124 && m->back_->h_ == 0 && m->frame_->h_ == 132 && !m->duelButton_->isVisible(true));

    // open: the NPC greets with line 5 (its PBIN byte is set), the window at (0, 607 - 132)
    m->setDisp(false, true);   // (the lobby makes it hidden)
    m->open(0x33, -1, -1);
    CHECK(m->isVisible(true) && m->x_ == 0 && m->y_ == 607 - 132 && g_gameCtrl.now() == 0x13);
    CHECK(has("parts 1 9") && has("show 1 31730 51") && has("speaker Bandit 0 90") && has("say 51 5"));
    // the balloon is up: nothing; closed: "duel?"
    m->onMain();
    CHECK(m->state_ == CNpcListMenu::ASK && !m->yesNo_.task());
    g_waistUp->balloon = false;
    m->onMain();
    CHECK(m->state_ == CNpcListMenu::ASKING && m->yesNo_.task() && m->yesNo_->instName() == "m_pYesNoDlg -> CWindowModelDialogYesNo");
    CHECK(m->yesNo_->topmost_ && g_gameCtrl.now() == 0x14);
    m->onMain();
    CHECK(m->state_ == CNpcListMenu::ASKING);   // not answered yet
    m->yesNo_->callback_->call(m->yesNo_.get(), CALLBACK_MESSAGE_TYPE(0), 4000);
    CHECK(m->answer_ == 1 && g_sounds.back() == 0x10000001 && !m->yesNo_->isVisible(true));
    m->onMain();
    CTask::flushDeleted();
    CHECK(m->state_ == CNpcListMenu::DUEL && m->asked_ && g_duelNpc == 0x33 && !m->yesNo_.task());

    // back from the duel: the result line, then (won, a present) its line 0x45, then the ITEMGET
    m->close(true);
    g_log.clear();
    m->openAfterDuel(0x33, 1, 1);
    CHECK(m->state_ == CNpcListMenu::AFTER_DUEL && has("say 51 49") && m->isVisible(true));
    g_waistUp->balloon = false;
    g_lobby.npcPresentType = 1;
    m->onMain();
    CHECK(m->state_ == CNpcListMenu::WON && g_lobby.npcPresentType == 0);
    m->onMain();
    CHECK(m->state_ == CNpcListMenu::WON_TALKING && has("say 51 69"));
    g_waistUp->balloon = false;
    m->onMain();
    CHECK(m->state_ == CNpcListMenu::IDLE && m->left_ && has("release 51"));

    // a present NPC (0x36) not yet given: its present first, then PRESENT waits for the ITEMGET answer
    LobbyNpcRow p = row;
    p.id = 0x36;
    g_rows.push_back(p);
    m->close(false);
    g_log.clear();
    m->open(0x36, 0, 0);
    CHECK(m->state_ == CNpcListMenu::PRESENT && m->present_ == 0x63e2 && has("present 63e2 0 5"));
    m->onMain();
    CHECK(m->isVisible(true));
    g_lobby.flag(0x7f) = 2;
    m->onMain();
    CHECK(!m->isVisible(true) && has("close 1") && g_lobby.flag(0x7f) == 0);

    // never in your own room
    g_lobby.ownRoom = 1;
    g_log.clear();
    m->open(0x33, 0, 0);
    CHECK(!m->isVisible(true) && has("release 51"));
    std::printf("npclistmenu_test ok\n");
}
