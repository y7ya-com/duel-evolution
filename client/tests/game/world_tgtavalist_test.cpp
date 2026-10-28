// yo2GameCtrl.cpp: GameCtrl (UI mode arbitration). CTgtAvaListDlg is in gameb_tgtava_test.cpp.
#include <cstring>

#include "Game/yo2GameCtrl.h"
#include "game_test.h"

int main() {
    CHECK(g_gameCtrl.now() == CTRL_NONE);
    CHECK(!std::strcmp(g_gameCtrlInfo[CTRL_AVATAR_LIST].name, "CTRL_AVATAR_LIST"));
    CHECK(!std::strcmp(g_gameCtrlInfo[CTRL_ERROR].name, "CTRL_ERROR") && g_gameCtrlInfo[CTRL_ERROR].priority == 5000);
    CHECK(g_gameCtrlInfo[CTRL_PLAYER_INFO].has(GameCtrlInfo::YIELD_TO_EQUAL));
    CHECK(!g_gameCtrlInfo[CTRL_PLAYER_INFO].has(GameCtrlInfo::YIELD_TO_HIGHER));
    CHECK(!g_gameCtrlInfo[CTRL_NONE].has(3));

    GameCtrl c;
    CHECK(c.now() == CTRL_NONE);
    CHECK(!c.canEnter(CTRL_NONE));                 // priority 0 is not > 0
    CHECK(c.enter(CTRL_MAIN_MENU) && c.now() == CTRL_MAIN_MENU);
    CHECK(!c.enter(CTRL_SELECT_LOBBY) && c.now() == CTRL_MAIN_MENU);   // 1000 is not > 1000
    CHECK(c.enter(CTRL_D_MAIL) && c.now() == CTRL_D_MAIL);           // 2000 > 1000
    CHECK(!c.enter(CTRL_FRIENDLIST));                               // same priority, YIELD_TO_HIGHER only
    c.leave(CTRL_FRIENDLIST);                                       // not current: no effect
    CHECK(c.now() == CTRL_D_MAIL);
    c.leave(CTRL_D_MAIL);
    CHECK(c.now() == CTRL_NONE);
    CHECK(c.enter(CTRL_AVATAR_LIST));                               // 500, YIELD_TO_EQUAL
    CHECK(c.enter(CTRL_PLAYER_INFO) && c.now() == CTRL_PLAYER_INFO);  // 500 >= 500
    CHECK(c.enter(CTRL_ABOUTEVENT));                                // 500 >= 500
    CHECK(!c.enter(CTRL_NONE) && c.enter(CTRL_ERROR));
    CHECK(!c.canEnter(CTRL_NPC_DUEL));
    c.reset();
    CHECK(c.now() == CTRL_NONE);

    std::printf("world_tgtavalist_test ok\n");
}
