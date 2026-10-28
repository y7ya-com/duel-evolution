// What the shop calls in other folders and in shop helpers outside yo2shopEntry.cpp's labels. Each declaration names
// the exe function or global it stands for; the owners define them, tests/ui_shop links recording stand-ins.
// "inline at 0xADDR": the exe has no function of its own for it; that function does it in place.
#pragma once
#include <cstdint>
#include <string>
#include <string_view>

#include "System/vc6.h"

struct ShopItem;

// System (yo2Widen.cpp, 0x5977b0): MultiByteToWideChar with the UI code page.
std::u16string yo2Widen(std::string_view s);   // 0x005977b0
// Swf (0x686560): play a sound; 0x1000000x are the UI sound effects (0x10000001 click, 0x10000002 cancel).
void appPlaySound(uint32_t id, int32_t arg);   // 0x00686560

// (shopItemName / shopConfirmMessage: shop/yo2ShopText.h)
#include "shop/yo2ShopText.h"

// What shopItemName reaches: duel's card db and texts (src/duel/CardDB.h, DuelText.h), Pack's names
// (src/Pack/CardPack.h), the game's PBIN dictionary (CGameMng::pbinDictionary on DAT_012bb6b0) and the UI narrowing
// (System, 0x006056b0 / 0x00635090: the inverse of windowWiden).
int cardPropId(int index);
const char* textCardName(int card);   // inline at 0x00ae3100
std::string packName(int32_t id);   // inline at 0x00ae3100
class CPbinDictionary;
CPbinDictionary* shopPbinDictionary();   // inline at 0x00ae3100
vc6::string shopNarrow(const char16_t* s);   // 0x006056b0
