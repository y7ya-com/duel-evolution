// src/shop rewrites under the original ABI (game-b's file). The vector instances are ShopVec<T> for the two element
// sizes the exe instantiates: ShopItem (0x14) and the cart line (0x1c).
#include <cstdlib>

#include "../yo2hook.h"
#include "shop/yo2ShopVec.h"

namespace {
struct Item { uint32_t w[5]; };   // ShopItem's bytes
struct Line { uint32_t w[7]; };   // ShopCartLine's bytes
using ItemVec = ShopVec<Item>;
using LineVec = ShopVec<Line>;
}
void shopVecRangeError() { std::abort(); }

YO2_HOOK ItemVec* __thiscall yo2_b01600(ItemVec* v, const uint8_t* a) { return new (v) ItemVec(*a); }
YO2_HOOK LineVec* __thiscall yo2_b014a0(LineVec* v, const uint8_t* a) { return new (v) LineVec(*a); }
YO2_HOOK LineVec* __thiscall yo2_b014d0(LineVec* v, const LineVec* o) { return new (v) LineVec(*o); }
YO2_HOOK size_t __fastcall yo2_b02a30(const ItemVec* v) { return v->capacity(); }
YO2_HOOK size_t __fastcall yo2_b029a0(const LineVec* v) { return v->capacity(); }
YO2_HOOK Item* __thiscall yo2_b01630(const ItemVec* v, size_t i) { return &v->at(i); }
YO2_HOOK void __fastcall yo2_b01590(LineVec* v) { v->clear(); }
YO2_HOOK void __fastcall yo2_b01680(ItemVec* v) { v->clear(); }
YO2_HOOK Item* __thiscall yo2_b02a70(ItemVec* v, Item* a, Item* b) { return v->erase(a, b); }
YO2_HOOK Line* __thiscall yo2_b029e0(LineVec* v, Line* a, Line* b) { return v->erase(a, b); }
YO2_HOOK void __thiscall yo2_b02be0(LineVec* v, Line* pos, size_t n, const Line* x) { v->insert(pos, n, *x); }
YO2_HOOK Line* __cdecl yo2_b03930(const Line* a, const Line* b, Line* out) { return LineVec::copy(a, b, out); }
YO2_HOOK Item* __cdecl yo2_b038e0(const Item* a, const Item* b, Item* out) { return ItemVec::copy(a, b, out); }
YO2_HOOK Item* __cdecl yo2_b03980(const Item* a, const Item* b, Item* out) { return ItemVec::copy(a, b, out); }
