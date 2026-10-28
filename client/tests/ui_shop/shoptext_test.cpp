// src/shop/yo2ShopText.cpp: the shop's texts, and CPbinDictionary::displayName (src/Game/yo2PlayerBin.cpp).
#include <cstring>
#include <string>

#include "Game/yo2PlayerBin.h"
#include "Net/NetAccount.h"
#include "Net/NetLobby.h"
#include "System/yo2Debug.h"
#include "System/yo2StringDB.h"
#include "game_test.h"
#include "shop/yo2ShopExtern.h"

// (CPbinDictionary's object also has collect(), which asks Net's PBIN bits)
bool CPlayerBinData::flag(uint32_t) const { return false; }

struct FakeText : CStringDB {
    vc6::string get(uint32_t id) const override {
        switch (id) {
        case 0x20a3: return "Buy these for @@d MP?";
        case 0x20a4: return "(@@d MP total)";
        case 0x20b7: return "GX @@d";
        case 0x20b8: return "";
        case 0xca7: return "M";
        case 0xc9e: return "Hair";
        case 777: return "Spiky";
        default: return yo2Format("T%u", id);
        }
    }
};
int cardPropId(int index) { return index + 1; }
const char* textCardName(int card) { return card == 4008 ? "Kuriboh" : "?"; }
std::string packName(int32_t id) { return id == 5 ? "Pack Five" : "?"; }
static CPbinDictionary* g_dict;
CPbinDictionary* shopPbinDictionary() { return g_dict; }
vc6::string shopNarrow(const char16_t* s) {
    std::string out;
    for (; *s; ++s) out += static_cast<char>(*s);
    return vc6::string(std::string_view(out));
}

int main() {
    FakeText text;
    g_stringDB = &text;
    g_shopWorld = 0;
    CHECK(shopIntroTextId() == 0x209e && shopBoughtTextId() == 0x20ad && shopMenuTextId() == 0x20a8);
    CHECK(shopConfirmMessage(1200) == "Buy these for 1200 MP?\n(1200 MP total)");
    g_shopWorld = 1;
    CHECK(shopIntroTextId() == 0x20b2 && shopBoughtTextId() == 0x20c1 && shopMenuTextId() == 0x20bc);
    CHECK(shopConfirmMessage(7) == "GX 7\n");
    g_shopWorld = 2;
    CHECK(shopIntroTextId() == 0 && shopBoughtTextId() == 0 && shopMenuTextId() == 0 && shopConfirmMessage(7).empty());

    auto* d = new CPbinDictionary;   // not created: onInit would load yo2PbinMap.dat
    g_dict = d;
    d->info_[40] = {40, 3, 0, 1, 3, 777, 2};   // a male part, slot 3 (hair)
    d->info_[41] = {41, 3, 0, 10, 0, 777, 0};  // a title: no part name
    vc6::wstring w;
    CHECK(d->displayName(40, &w) && w == u"Hair - Spiky(M)");
    CHECK(!d->displayName(41, &w) && w == u"-----");

    ShopItem card = {}, pack = {}, part = {}, other = {};
    card.type = 0, card.param = 4007;
    pack.type = 1, pack.param = 5;
    part.type = 2, part.param = 40;
    other.type = 3;
    CHECK(shopItemName(card) == "Kuriboh" && shopItemName(pack) == "Pack Five");
    CHECK(shopItemName(part) == "Hair - Spiky(M)" && shopItemName(other).empty());
    delete d;
    g_stringDB = nullptr;
    std::puts("shoptext: ok");
}
