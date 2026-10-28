// tpEntry.cpp (0x008f1860..0x008f51c0), the part that decides and sends: the scene's update (drag and drop into the
// TP window, the confirm dialog, REQTPCARDGET) and its small helpers. The scene set-up FUN_008f25b0 (7.5 KB of
// sprites and SWF) and the window (yo2TpWindow.cpp) are not done yet.
#include "TpEntry.h"

CNetLobby* g_tpLobby = nullptr;

// @yo2 0x008f1c60
void tpSetInput(bool on) {
    tpWindowEnable(on);
    uiDeckWindowsEnabled(on);
}

// @yo2 0x008f24c0 the card box shows page 9 while there is room, 0xb when the TP window is full
void CTpScene::countChanged() {
    if (shownCount == 1) {
        tpWindowPage(0);
        kabanShowPage(9);
        tpWindowRedraw();
    } else if (shownCount == 2) {
        tpWindowPage(1);
        kabanShowPage(0xb);
        tpWindowRedraw();
    }
}

// @yo2 0x008f2560
void CTpScene::onMessage(int32_t) {}

TpClaim tpClaimKind(uint32_t tpRank, bool tp100, bool tp500) {
    if (tpRank != 0 && tpRank <= 1000) return {0, 0};   // in the TP ranking
    if (tp100) return {1, 0x240};
    if (tp500) return {2, 0x242};
    return {-1, 0};
}

static void closeDialog(CTpScene* s, TaskPtrSlot* d, int line) {
    uiDialogClose(d, line);
    s->busy = 0;
    tpSetInput(true);
}

// @yo2 0x008f4ac0
uint32_t CTpScene::update() {
    if (!busy) {
        if (uiMouseReleased()) {
            int32_t x, y;
            CardDrag* d = g_cardDrag;
            if (d->from == 2) {   // from the card box into the TP window, while it has room
                if (d->phase == 1 && *g_kabanDragging == 1) {
                    uiMousePos(&x, &y);
                    if (x > 0x100 && x < 0x2d8 && y > 0x6c && y < 0x2d8 && tpWindowCount() < maxCards) {
                        uiSound(0x1000000f);
                        tpWindowAdd(d->card);
                        tpWindowRedraw();
                        uiOkLamp();
                    }
                }
                *d = CardDrag{};
                *g_kabanDragging = 0;
                kabanDragEnd();
                tpSetInput(true);
            } else if (d->from == 1 && d->phase == 1) {   // a chosen card dragged back
                uiMousePos(&x, &y);
                if (d->source == 6) {
                    uiSound(0x1000000f);
                    if (x < 0x2e9 || x > 0x3bb || y < 0x59 || y > 0x2d7) {
                        tpWindowReset(d->index);
                    } else {
                        tpWindowRemove(d->index);
                        tpWindowRedraw();
                        uiOkLamp();
                    }
                }
                *d = CardDrag{};
                tpSetInput(true);
            }
        }
        if (uiCancelKey()) kabanRightClick();
        return 1;
    }
    if (done.task) {
        if (uiDialogAnswer(&done) == 4000) {
            uiSound(0x10000001);
            closeDialog(this, &done, 0x165);
        }
        if (uiCancelKey()) {
            uiSound(0x10000002);
            closeDialog(this, &done, 0x173);
        }
    }
    if (!confirm.task) return 1;
    int32_t a = uiDialogAnswer(&confirm);
    if (a == 4000) {   // claim the prize with the chosen cards
        uiSound(0x10000001);
        uint16_t cards[4] = {0, 0, 0, 0};
        tpWindowCards(cards);
        TpClaim c = tpClaimKind(playerTpRank(), pbinTest(0x240), pbinTest(0x242));
        if (c.kind >= 0) g_tpLobby->reqTpCardGet((uint8_t)c.kind, cards);
        if (c.bit) pbinSet(c.bit, false);
        uiDialogClose(&confirm, 0x192);
        uiSceneReturn();
    } else if (a == 0xfa1) {
        uiSound(0x10000002);
        closeDialog(this, &confirm, 0x19d);
        return 1;
    }
    if (confirm.task && uiCancelKey()) {
        uiSound(0x10000002);
        closeDialog(this, &confirm, 0x1aa);
    }
    return 1;
}
