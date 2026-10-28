// The shop's links to the rest of the game (yo2ShopExtern.h), in their own object so a shop test can stand in for them.
#include "Game/yo2GameManager.h"
#include "shop/yo2ShopExtern.h"

CPbinDictionary* shopPbinDictionary() { return g_gameMng->pbinDictionary(); }

// TODO(System): 0x006056b0 narrows with the UI code page; byte by byte, the inverse of windowWiden, until then.
vc6::string shopNarrow(const char16_t* s) {
    std::string out;
    for (; s && *s; ++s)
        out += static_cast<char>(*s);
    return vc6::string(std::string_view(out));
}
