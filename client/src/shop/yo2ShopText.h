// The shop's text helpers (their own object in the exe, 0x00ae2180..0x00ae4860, labelled System): which world's shop
// is open, the clerk's texts for it, the purchase question, and an item's display name.
#pragma once
#include <cstdint>

#include "System/vc6.h"

struct ShopItem;

// DAT_012bcc38: the shop's world, 0 = DM, 1 = GX (CShopScene sets it when it switches backdrops).
extern int32_t g_shopWorld;

// The clerk's texts for the current world (0 for any other world). Names are ours, from where CShopScene uses them.
int32_t shopIntroTextId();    // 0x209e / 0x20b2
int32_t shopBoughtTextId();   // 0x20ad / 0x20c1
int32_t shopMenuTextId();     // 0x20a8 / 0x20bc
// "Buy for <total> MP?": two lines (0x20a3 + 0x20a4, GX: 0x20b7 + 0x20b8) with every "@@d" replaced by the total.
vc6::string shopConfirmMessage(int32_t total);
// A card's name, a pack's name, or an avatar part's display name (CPbinDictionary::displayName), by the item's type.
vc6::string shopItemName(const ShopItem& item);
