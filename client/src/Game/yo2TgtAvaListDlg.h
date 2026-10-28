// yo2TgtAvaListDlg.cpp: CTgtAvaListDlg, the "which avatar?" list that pops up when a click on the map hits several
// avatars, and GameCtrl, the arbiter of which UI mode ("control") owns the screen (its methods sit in this file's
// object, the game-wide instance is g_gameCtrl).
// Only the constructor/destructor of CTgtAvaListDlg are here: the rest needs System's window framework
// (CWindowModelList) and the avatar classes (CChibiAvatarMng, CChibiAvatar): see STATUS_world.md.
#pragma once
#include <cstdint>

#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

class CWindowModelList;   // TODO(System window framework)
class CChibiAvatarMng;    // TODO(Test / Game/Avatar)
class CChibiAvatar;       // TODO(Game/Avatar)

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

class CTgtAvaListDlg : public CEasyTask {
public:
    enum : uint32_t {
        OPEN_INFO = 1,     // picking an avatar opens its player info (or talks to the NPC)
        CLOSE_ON_PICK = 2,
    };
    CTgtAvaListDlg();
    ~CTgtAvaListDlg() override;
    // create 0x00ad8ec0, open 0x00ad90d0, close 0x00ad9a00, onInit/onMain/onDestroy: blocked (STATUS_world.md)

    uint32_t flags_ = 0;                         // 0x70
    CTaskPtr<CWindowModelList> list_;            // 0x74
    CTaskPtr<CChibiAvatarMng> avatarMng_;        // 0x80
    vc6::vector<CChibiAvatar*> avatars_;         // 0x8c the avatars listed
    CTaskPtr<CChibiAvatar> target_;              // 0x9c
};
YO2_AT(CTgtAvaListDlg, flags_, 0x70);
YO2_AT(CTgtAvaListDlg, list_, 0x74);
YO2_AT(CTgtAvaListDlg, avatarMng_, 0x80);
YO2_AT(CTgtAvaListDlg, avatars_, 0x8c);
YO2_AT(CTgtAvaListDlg, target_, 0x9c);
YO2_SIZEOF(CTgtAvaListDlg, 0xa8);
