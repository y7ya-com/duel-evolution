// What the shop calls in other folders and in shop helpers outside yo2shopEntry.cpp's labels. Each declaration names
// the exe function or global it stands for; the owners define them, tests/ui_shop links recording stand-ins.
#pragma once
#include <cstdint>
#include <string>
#include <string_view>

#include "System/vc6.h"

struct ShopItem;

// System (yo2Widen.cpp, 0x5977b0): MultiByteToWideChar with the UI code page.
std::u16string yo2Widen(std::string_view s);
// Swf (0x686560): play a sound; 0x1000000x are the UI sound effects (0x10000001 click, 0x10000002 cancel).
void appPlaySound(uint32_t id, int32_t arg);

// Shop helpers labelled System (0xae3100..0xae4860, a source file of their own).
vc6::string shopItemName(const ShopItem& item);  // 0xae3100: card name / pack name / avatar part name by type
vc6::string shopConfirmMessage(int32_t total);   // 0xae3460: text 0x20a3 + '\n' + 0x20a4 with "@@d" = total
