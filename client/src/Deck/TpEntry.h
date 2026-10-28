// tpEntry.cpp: CTpScene, the TP prize card choice (pick cards from the card box into the TP window, then
// 0x8303 REQTPCARDGET). Which prize the request claims depends on the player's TP ranking and PBIN bits 0x240 / 0x242
// ("TP100 / TP500 GET権利"): YOLaucher research/persistencia/NOTES.md section 11.
//
// TODO(System): CTpScene derives from CSceneTask (0x80 bytes); a padded stand-in. Offsets are the exe's (YO2_AT).
#pragma once
#include "TradeEntry.h"   // CardDrag, TaskPtrSlot, the shared UI hooks

struct CTpScene {   // 0x110, ctor FUN_008f1860
    uint8_t _scene[0x70];
    uint32_t arg;              // 0x70
    uint8_t _74[0xc0 - 0x74];
    TaskPtrSlot confirm;       // 0xc0 "Get these cards?" (4000 yes / 0xfa1 no)
    TaskPtrSlot done;          // 0xcc the OK dialog after a claim
    uint8_t busy;              // 0xd8 a dialog is up
    uint8_t _d9[3];
    int32_t shownCount;        // 0xdc
    uint8_t _e0[0x108 - 0xe0];
    int32_t maxCards;          // 0x108 how many cards the prize gives
    uint8_t _10c[4];

    uint32_t update();                 // FUN_008f4ac0
    void onMessage(int32_t msg);       // FUN_008f2560 (nothing but the base handler)
    void countChanged();               // FUN_008f24c0
};
YO2_AT(CTpScene, confirm, 0xc0);
YO2_AT(CTpScene, done, 0xcc);
YO2_AT(CTpScene, busy, 0xd8);
YO2_AT(CTpScene, shownCount, 0xdc);
YO2_AT(CTpScene, maxCards, 0x108);
static_assert(sizeof(void*) != 4 || sizeof(CTpScene) == 0x110, "CTpScene size");

void tpSetInput(bool on);              // FUN_008f1c60

// The kind REQTPCARDGET claims (0 = by TP ranking, 1 = TP100 right, 2 = TP500 right, -1 = none) and the PBIN right
// it uses up (0 = none). Part of FUN_008f4ac0.
struct TpClaim { int kind; uint32_t bit; };
TpClaim tpClaimKind(uint32_t tpRank, bool tp100, bool tp500);

// hooks: the TP window (yo2TpWindow.cpp, CWindowTaskTp at DAT_012b4444) and the player record (System)
extern CNetLobby* g_tpLobby;            // the lobby connection (*(DAT_012711ac + ...)), TODO(System)
int32_t tpWindowCount();                // DAT_012b4444 + 0x440
void tpWindowAdd(int32_t card);         // FUN_0098c0e0
void tpWindowRemove(int32_t index);     // FUN_0098c340
void tpWindowReset(int32_t index);      // FUN_0098c470
void tpWindowRedraw();                  // FUN_0098c550
void tpWindowEnable(bool on);           // FUN_0098c920
void tpWindowCards(uint16_t* out);      // FUN_0098d220: the chosen ids
void tpWindowPage(int page);            // FUN_0098c0c0
uint32_t playerTpRank();                // the slot record's +0x128 (PlayerData u11c[3]; 1..1000 = ranked)
bool pbinTest(uint32_t bit);            // FUN_00ad6a90
void pbinSet(uint32_t bit, bool on);    // FUN_00ad6900
void uiOkLamp();                        // FUN_0060e170(0, 0) + FUN_00973c60 (the "get" button)
void uiSceneReturn();                   // FUN_0061c540(1)
