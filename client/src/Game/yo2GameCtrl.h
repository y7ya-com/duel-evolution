// GameCtrl: the arbiter of which UI mode ("control") owns the screen; the game-wide instance is g_gameCtrl. Its own
// object in the exe (0x00adad90..0x00adaf50, right after yo2TgtAvaListDlg.cpp's).
#pragma once
#include <cstdint>

#include "System/vc6.h"

// The UI modes. A mode may take over from the current one if the current one allows it (flags) and the new one's
// priority is high enough.
enum GameCtrlId : int32_t {
    CTRL_NONE, CTRL_SELECT_LOBBY, CTRL_MAIN_MENU, CTRL_MY_PROFILE, CTRL_COMMENT_SETTING, CTRL_TITLE_SETTING,
    CTRL_D_MAIL, CTRL_DUEL_SETTING, CTRL_BLACKLIST, CTRL_FRIENDLIST, CTRL_TEAMLIST, CTRL_DUELLOG, CTRL_DUEL_BUSY,
    CTRL_USE_DUELPASS, CTRL_REARRENGE_DISK, CTRL_ABOUTEVENT, CTRL_DUEL_MENU, CTRL_MOVE_MENU, CTRL_MOVE_MENU2,
    CTRL_PLAYER_INFO, CTRL_NPC_DUEL, CTRL_AVATAR_LIST, CTRL_TRADE_OFFER, CTRL_TRADE_REPLY, CTRL_PRESENT_GET,
    CTRL_ERROR, CTRL_COUNT
};

struct GameCtrlInfo {
    enum : uint32_t {
        YIELD_TO_HIGHER = 1,   // a mode of strictly higher priority may take over
        YIELD_TO_EQUAL = 2,    // a mode of the same or higher priority may take over
    };
    uint32_t flags;      // 0x00
    int32_t priority;    // 0x04
    const char* name;    // 0x08 "CTRL_MAIN_MENU" (CGameMng's debug dump prints it)
    bool has(uint32_t f) const;
};
YO2_SIZEOF(GameCtrlInfo, 0x0c);
extern const GameCtrlInfo g_gameCtrlInfo[CTRL_COUNT];   // DAT_00bf3f48

class GameCtrl {
public:
    GameCtrl();
    void reset();
    bool canEnter(int32_t ctrl) const;
    bool enter(int32_t ctrl);
    void leave(int32_t ctrl);
    int32_t now() const { return now_; }

private:
    int32_t now_;   // 0x00
};
YO2_SIZEOF(GameCtrl, 4);
extern GameCtrl g_gameCtrl;   // DAT_012bc618
