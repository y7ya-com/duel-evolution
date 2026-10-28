// What the lobby's Shop-group parsers (NetLobby_Shop.cpp) need from outside Net: the card database, card packs,
// the "new item" lists, the NPC info list and the deck limitation tables. Each hook names the exe function or global
// it stands for; whoever reimplements that subsystem defines it (tests/net_cli_shop.cpp stubs them).
#pragma once
#include <vector>

#include "NetAccount.h"

// Card database (*DAT_012714b4): the byte at +9 + card * 3 is the card's trunk count as of the last sync, so 0 = new.
uint8_t cardDbOwned(uint16_t card);
// FUN_00ad7d80 (CMyUser): copies trunk / trunk2 into the card database and refreshes it.
void cardDbSyncTrunk(const CMyUser& me);
// FUN_006c3610 (the pack map lookup) + FUN_0084e340 (Pack/): a card pack's cards and its PBIN bit base
// (pack + 0x68). false = no such pack (the exe's debug build asserts there).
bool cardPackCards(uint32_t pack, std::vector<uint16_t>* cards, int32_t* pbinBase);

// FUN_0056b060 push_back on the "just got" lists at *(DAT_012bb6b0 + 0x470) (PBIN bits) / + 0x480 (cards).
enum NewItemList { NEW_ITEM_FLAGS = 0x470, NEW_ITEM_CARDS = 0x480 };
void newItemListAdd(NewItemList list, uint16_t id);

// The NPC info list, a vector of 0x44-byte records at *(DAT_012bc8d0) + 0xd0 (YOLaucher mundo/npc.py npc_entry).
struct NpcInfo {
    int32_t id;             // 0x00
    char name[17];          // 0x04
    uint8_t parts[17];      // 0x15 avatar parts (16 B)
    uint8_t b26;            // 0x26
    uint8_t _27;
    int32_t u28;            // 0x28
    int32_t _2c;            // 0x2c not on the wire
    int32_t u30;            // 0x30
    int32_t threshold;      // 0x34 friendship chain
    int32_t spot;           // 0x38
    int32_t u3c;            // 0x3c
    int32_t prev;           // 0x40 previous NPC of the chain
};
static_assert(sizeof(NpcInfo) == 0x44, "NpcInfo size");
void npcInfoClear();
void npcInfoAdd(const NpcInfo& n);

// Forbidden/limited and unreleased card tables (System globals at 0x1295038 / 0x128d030).
void limitationSet(int32_t i, int32_t yo2Id, int32_t konamiId, uint8_t copies);   // FUN_0073c1e0
void limitationCount(int32_t n);                                                   // FUN_0073c220
void unreleasedSet(int32_t i, int32_t yo2Id, int32_t konamiId);                    // FUN_0073c240
void unreleasedCount(int32_t n);                                                   // FUN_0073c270
