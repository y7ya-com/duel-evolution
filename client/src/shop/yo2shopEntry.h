// yo2shopEntry.cpp: the card shop (CShopScene) and its parts.
//
// The shop is a scene with an NPC clerk (CWaistUpNpc) and a backdrop for the current world, a category window
// (cards / packs / avatar parts) and one item window per category (CShopCardWindow, CShopPackWindow,
// CShopAvatarWindow, all CShopWindowBase), a mileage plate with the player's MP, price plates on the items, digit
// strings drawn from a sprite sheet (CShopNumber / CShopNumberString), and the purchase confirmation window. The item
// list comes from the lobby server (0x5208 REQSHOPITEM -> 0x5213/0x5209/0x5214); a purchase sends the cart (0x5210
// REQSHOPRESULT -> 0x5212 lines + 0x5211). YOLaucher's server emulator (yo2srv/tienda.py) is the reference for
// those messages.
#pragma once
#include <cstdint>
#include <string>

#include "Net/NetLobby.h"
#include "Result/yo2UiStandIns.h"
#include "shop/yo2ShopExtern.h"
#include "shop/yo2ShopVec.h"

// (ShopCartLine: shop/yo2ShopConfirm.h)

constexpr const char* kShopFile = "C:\\yugionline\\yo2\\client\\src\\shop\\yo2shopEntry.cpp";

// (CShopNumber, CShopNumberString: shop/yo2ShopNumber.h)
#include "shop/yo2ShopNumber.h"

// ================================================================ plates

// (CShopPricePlate: shop/yo2ShopPlates.h)
// (CShopMileagePlate: shop/yo2ShopPlates.h)

// ================================================================ the purchase confirmation


// (CShopConfirmWindow: shop/yo2ShopConfirm.h)
#include "shop/yo2ShopConfirm.h"
