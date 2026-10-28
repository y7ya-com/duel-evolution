// What yo2Menu.cpp calls outside its own classes: the smallest interface each needs, declared here and implemented
// by its owner (in tests: tests/game/gameb_menu_test.cpp). "game-b" entries are windows of this file not ported yet.
// "inline at 0xADDR": the exe has no function of its own for it; that function does it in place.
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
// game-b, CWindowModelMenu (0x00a7e3b0..): the menu bar's icon i on or off (FUN_00a7f930 on the game's menu bar), and
// the event lobby it is about (+0x458: the lobby rank, 1 / 0xd / 5 / 0xf / 0x11 / 0x15 / 0xb / 7) and its sub-kind (+0x460).
void menuBarIconEnable(int32_t icon, bool on);
int32_t menuBarEventRank();   // inline at 0x00a80fc0
int32_t menuBarEventSub();   // inline at 0x00a80fc0
// TODO(Net): the current player's level (the account's CPlayerInfo of the selected slot, + 0xa4).
uint8_t accountPlayerLevel();   // inline at 0x00a80fc0
// TODO(yaneSDK): CMouseEx vslot 15 of the app's mouse (CApp + 0x148): the right button went down.
bool appMouseRightPushed();   // inline at 0x00a80fc0

// TODO(Game A): DAT_012bb6b0's windows. The duel settings window (+0x4c8, FUN_00a56570) and its vslot 21 (open).
CWindowTaskModel* gameDuelSettingWindow();
void duelSettingOpen(CWindowTaskModel* w);   // inline at 0x00a67270
// TODO(Game A): the mail list task (FUN_00a27870 on DAT_012bb6b0, mode 0).
CTask* mailListCreate(CTask* owner);

class CWindowTaskScrollBase;
class CWindowTaskTextSwitch;
class IWindowTaskMediator;

// TODO(Lobby / Game A): what the place plate shows. The lobby's player count (FUN_008a03e0), a lobby's name by rank
// and area (FUN_00a54f90), a block's number as shown (FUN_00a08ba0(block)->+4->+8), a map's name (FUN_00a55b30), and
// the players on the current map (*(DAT_012bb6b0 + 0x520)).
#include "System/vc6.h"
int32_t lobbyPlayerCount();   // 0x008a03e0
vc6::wstring lobbyDisplayName(uint8_t rank, uint8_t area);   // 0x00a54f90
uint8_t blockDisplayNumber(uint8_t block);   // 0x00a08ba0
vc6::wstring mapDisplayName(int32_t map);   // 0x00a55b30
int32_t gameMapPlayers();   // inline at 0x00a8dd80

// TODO(System): the app config DAT_0127188c: vslots 0x9c .. 0xb8, the main menu's entries switched off (item 0..7:
// entry 0, 1, 2+3, 4, 5, 8, 9, 10+11); vslot 0x88 the USB key argument.
bool configMenuItemOff(int32_t item);   // inline at 0x00a668b0
// TODO(Net): the duel-pass state: YgoUsbKey::read(config vslot 0x88), the gate's kind (*(DAT_012711ac + 0xc5c) + 4:
// 2 = USB key) and the account's 150-pass count (CNetAccount + 0x1210, 0 to start over).
void duelpassReadUsbKey();   // inline at 0x00a67270
int32_t gateKind();   // inline at 0x00a67270
int32_t& accountDuelpass150();   // inline at 0x00a67270

// TODO(Swf): FUN_00686560: play a sound; 0x10000001 click, 0x10000002 cancel.
void appPlaySound(uint32_t id, int32_t arg);   // 0x00686560
