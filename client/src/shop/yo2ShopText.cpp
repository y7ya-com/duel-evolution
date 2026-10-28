// The shop's text helpers.
#include "shop/yo2ShopText.h"

#include <cstdio>
#include <string>

#include "Game/yo2PlayerBin.h"
#include "Net/NetLobby.h"
#include "System/window/yo2WindowTask.h"
#include "System/yo2StringDB.h"
#include "shop/yo2ShopExtern.h"

int32_t g_shopWorld;

// @yo2 0x00ae3400 shopIntroTextId
int32_t shopIntroTextId() { return g_shopWorld == 0 ? 0x209e : g_shopWorld == 1 ? 0x20b2 : 0; }
// @yo2 0x00ae3430 shopBoughtTextId
int32_t shopBoughtTextId() { return g_shopWorld == 0 ? 0x20ad : g_shopWorld == 1 ? 0x20c1 : 0; }
// @yo2 0x00ae38b0 shopMenuTextId
int32_t shopMenuTextId() { return g_shopWorld == 0 ? 0x20a8 : g_shopWorld == 1 ? 0x20bc : 0; }

// @yo2 0x00ae3460 shopConfirmMessage
vc6::string shopConfirmMessage(int32_t total) {
    std::string s;
    if (g_shopWorld == 0 || g_shopWorld == 1) {
        bool dm = g_shopWorld == 0;
        s = std::string_view(g_stringDB->get(dm ? 0x20a3 : 0x20b7));
        s += "\n";
        s += std::string_view(g_stringDB->get(dm ? 0x20a4 : 0x20b8));
    }
    char n[16];
    std::snprintf(n, sizeof n, "%d", total);
    for (size_t at = 0; (at = s.find("@@d", at)) != std::string::npos; at += std::char_traits<char>::length(n))
        s.replace(at, 3, n);
    return vc6::string(std::string_view(s));
}

// @yo2 0x00ae3100 shopItemName: through the UI's wide strings and back, as the exe does
vc6::string shopItemName(const ShopItem& item) {
    switch (item.type) {
    case 0:
        return shopNarrow(windowWiden(textCardName(cardPropId(static_cast<int>(item.param)))).c_str());
    case 1:
        return vc6::string(std::string_view(packName(static_cast<int32_t>(item.param))));
    case 2: {
        vc6::wstring name;
        shopPbinDictionary()->displayName(item.param, &name);
        return shopNarrow(name.c_str());
    }
    default:
        return {};
    }
}
