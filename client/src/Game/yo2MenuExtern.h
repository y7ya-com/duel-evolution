// What yo2Menu.cpp calls outside its own classes: the smallest interface each needs, declared here and implemented
// by its owner (in tests: tests/game/gameb_menu_test.cpp). "game-b" entries are windows of this file not ported yet.
#pragma once
#include <cstdint>

class CTask;
class CElement;
class CWindowTaskModel;
// game-b, later in yo2Menu.cpp: the windows the main menu opens (complete classes once ported).
CWindowTaskModel* profileCreate(CTask* owner);      // FUN_00a6e1d0 (CWindowModelProfile, 0x00a6e4e0..)
CWindowTaskModel* setCommentCreate(CTask* owner);   // FUN_00a6b6d0 (CWindowModelSetComment, 0x00a6b9b0..)
CTask* changeTitleCreate(CTask* owner);             // FUN_00ac73e0 (CChangeTitleTask, 0x00ac72d0..)
bool changeTitleFinished(CTask* t);                 // FUN_00ac7ee0
CTask* duelLogCreate(CTask* owner);                       // FUN_00a9c580 (CDuelLogTask)
CTask* blacklistCreate(CTask* owner);                     // FUN_00a8f1f0 (CWindowModelBlacklist)
CTask* friendlistCreate(CTask* owner);                    // FUN_00a93860 (CWindowModelFriendlist)
CTask* teamlistCreate(CTask* owner);                      // FUN_00a95b50 (CWindowModelTeamlist)
class CWindowModelDialogYesNo;
CWindowModelDialogYesNo* duelpassUsbCreate(CTask* owner);     // FUN_00a89010 (CWindowModelDuelpassUSB)
CWindowModelDialogYesNo* duelpassCodeCreate(CTask* owner);    // FUN_00a83b20 (CWindowModelDuelpassInputCode)
CWindowModelDialogYesNo* duelpass150Create(CTask* owner);     // FUN_00a86a50 (CWindowModelDuelpass150)
// game-b, CWindowModelMenu (0x00a7e3b0..): the menu bar's icon i on or off (FUN_00a7f930 on the game's menu bar).
void menuBarIconEnable(int32_t icon, bool on);

// TODO(Game A): DAT_012bb6b0's windows. The duel settings window (+0x4c8, FUN_00a56570) and its vslot 21 (open).
CWindowTaskModel* gameDuelSettingWindow();
void duelSettingOpen(CWindowTaskModel* w);
// TODO(Game A): the mail list task (FUN_00a27870 on DAT_012bb6b0, mode 0).
CTask* mailListCreate(CTask* owner);

// TODO(System): the app config DAT_0127188c: vslots 0x9c .. 0xb8, the main menu's entries switched off (item 0..7:
// entry 0, 1, 2+3, 4, 5, 8, 9, 10+11); vslot 0x88 the USB key argument.
bool configMenuItemOff(int32_t item);
// TODO(Net): the duel-pass state: YgoUsbKey::read(config vslot 0x88), the gate's kind (*(DAT_012711ac + 0xc5c) + 4:
// 2 = USB key) and the account's 150-pass count (CNetAccount + 0x1210, 0 to start over).
void duelpassReadUsbKey();
int32_t gateKind();
int32_t& accountDuelpass150();

// TODO(Swf): FUN_00686560: play a sound; 0x10000001 click, 0x10000002 cancel.
void appPlaySound(uint32_t id, int32_t arg);
