// What src/Pack needs from code that is not reimplemented yet (System, yaneSDK, the UI layer). Each declaration
// names the exe function it stands for; tests/deck_pack_cli.cpp gives them stub definitions.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

// TODO(System) FUN_0060cff0: the debug assert box. Shown once per flag; returns false when the player picks "quit",
// after which the caller exits (FUN_00b0ae12(1)).
bool yo2AssertBox(char* onceFlag, const char* msg, const char* file, int line);

// TODO(yaneSDK) CFile (FUN_00525dc0 ctor, FUN_0052a490 Read, FUN_00527d10 size, FUN_00527d30 data): reads a whole file
// from the game data (archive or disk). False (and an empty buffer) when it is missing.
bool yaneReadFile(const std::string& path, std::vector<uint8_t>& out);

// The pack catalogue's raw tables, data/cardpack/PACK_*.bin (src/Pack/PackInfo.cpp). Index 1..0xc0.
void packInfoLoad(int32_t language);       // FUN_00840a90 (CSystemConfigManager::applyLanguage calls it)
int32_t packInfoId(int index);             // FUN_00841140: low 15 bits of the PACK_Prop word
int32_t packInfoType(int index);           // FUN_008411a0: bits 15..18 (0 booster, 1 deck, 2 prize, 4 starter deck)
const char* packInfoImage(int index);      // FUN_008410c0
const char* packInfoName(int index);       // FUN_00841000
const char* packInfoDesc(int index);       // FUN_00841040
const char* packInfoText3(int index);      // FUN_00841080 the sort text (PACK_Sort)
const char* packInfoYdc(int index);        // FUN_00841100 (decks only)
int32_t packInfoBit(int index);            // FUN_008411d0 PBIN bit of the deck "right" (+1 = already got)

// TODO(System) DAT_012714b4: the player's card box ("kaban"), 3 bytes per card id starting at +9; byte 0 = copies.
extern uint8_t* g_cardBox;  // 0x012714b4
inline uint8_t cardBoxCount(uint32_t card) { return g_cardBox[(card + 3) * 3]; }

// TODO(System) CNoBackList (CWindowPackSelect + 0x3a8, a CTaskPtr<CNoBackList>): append one formatted line
// (FUN_005977b0 builds the line object, FUN_005b3ca0 adds it).
void uiNoBackListAdd(void* list, const std::string& text);
