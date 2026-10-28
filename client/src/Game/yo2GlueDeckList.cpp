// yo2GlueDeckList.cpp: yo2Glue.cpp's forwarders for src/Deck/KabanWindowList.h (which can't share a TU with
// KabanWindow.h). Deck's CWindowTaskCardInfoItem is an opaque stand-in for ours.
#include "Deck/KabanWindowList.h"
#include "Game/yo2CardListView.h"

namespace dk {
// 0x00a12f80
void cardInfoSetCard(CWindowTaskCardInfoItem* item, int32_t id) {
    reinterpret_cast<::CWindowTaskCardInfoItem*>(item)->setCard(id);
}
// 0x00a12f40
void cardInfoSetWidth(CWindowTaskCardInfoItem* item, float w) {
    reinterpret_cast<::CWindowTaskCardInfoItem*>(item)->setNameWidth(w);
}
}   // namespace dk
