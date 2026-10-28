// tradeEntry.cpp (0x008f66b0..0x00903c20): CTradeScene. The exe inlines dialog set-up code (CTaskPtr asserts,
// positions, texts) dozens of times into FUN_008fac30; here each of those blocks is one hook call.
#include "TradeEntry.h"

#include <cstring>

CardDrag* g_cardDrag = nullptr;
uint8_t* g_kabanDragging = nullptr;

enum {   // lobby request kinds (req byte = k + 0x1c) the scene polls
    K_ADDCARD = 0x3a, K_DELCARD = 0x3b, K_STATUS = 0x3e, K_ALLREADY = 0x3f, K_CONFIRM = 0x40, K_END = 0x41,
    K_EXIT = 0x42, K_TRUNK = 0x43,
};
enum {   // texts
    TX_PARTNER_LEFT = 0x1426, TX_CONFIRM = 0x1425, TX_COMPLETED = 0x141b, TX_CANCELLED = 0x141c,
};

// FUN_006aa9c0 (Net, CNetLobby's trade block): forget the partner and the last results. TODO(Net): its owner.
static void tradeBlockReset(TradeBlock* t) {
    t->partnerPid = 0;
    memset(t->partnerName, 0, sizeof t->partnerName);
    t->_18[0] = 0;   // +0x18 (the exe clears a byte there; its use is unknown)
    t->confirm = 0;
    t->tradeEnd = 0;
}

static uint8_t& req(CNetLobby* lb, int byteOff) { return lb->flag(byteOff); }

// @yo2 0x00901880
void lobbySetReq(CNetLobby* lb, int k, uint8_t v) { lb->flag(k + 0x1c) = v; }

// TradeBlock accessors (the lobby's trade sub-object)
// @yo2 0x009018c0
void tradeBlockClearOwn(TradeBlock* t) {
    t->ownMove = -1;
    t->ownMoveKind = 0xff;
    t->myStatus = 0;
}
// @yo2 0x009018e0
void tradeBlockClearOther(TradeBlock* t) {
    t->otherMove = -1;
    t->otherMoveKind = 0xff;
    t->otherStatus = 0;
}
// @yo2 0x00901900
void tradeBlockSetOtherStatus(TradeBlock* t, uint8_t v) { t->otherStatus = v; }
// @yo2 0x00901920
void tradeBlockSetConfirm(TradeBlock* t, uint8_t v) { t->confirm = v; }
// @yo2 0x00901940
uint8_t tradeBlockConfirm(const TradeBlock* t) { return t->confirm; }
// @yo2 0x00901960
uint8_t tradeBlockEnd(const TradeBlock* t) { return t->tradeEnd; }
// @yo2 0x00901980
void tradeBlockSetB25(TradeBlock* t, uint8_t v) { t->b25 = v; }

// The lobby's result array (+0x7e0 + 4k): src/Net names its slots (authResult +0x7e4 ... +0x998, plain ints with the
// exe's spacing); slots outside that run go to a side table here (none of them is read by this code).
uint8_t* lobbyResultSlot(CNetLobby* lb, int k) {
    size_t off = 0x7e0 + 4 * (size_t)k;
    if (off >= 0x7e4 && off + 4 <= 0x9a0) return reinterpret_cast<uint8_t*>(&lb->authResult) + (off - 0x7e4);
    static uint8_t other[0x70][4];
    return other[k];
}

// @yo2 0x008f6c00
void tradeSetInput(bool on) {
    uiSetInputEnabled(on);
    g_tradeWindow->setEnabled(on);
    uiDeckWindowsEnabled(on);
}
// @yo2 0x008f6c90
void tradeSetButtons(bool on) { uiSetInputEnabled(on); }
// @yo2 0x008f6d10
void tradeSetKaban(bool on) { uiDeckWindowsEnabled(on); }
// @yo2 0x008f6d50
void tradeSetReadyButton(bool on) { uiTradeLock(!on); }

// @yo2 0x008f66b0 (the CSceneTask part and the CTaskPtr members are System's)
void CTradeScene::construct() {
    box = nullptr;
    decks = nullptr;
    busy = 0;
    shownCount = 0;
    lobby = nullptr;
    state = TS_IDLE;
    resume = TS_IDLE;
    partnerLeft = completed = closing = 0;
}

// @yo2 0x008f6e10 every trade request byte back to 0 (0x4e..0x63)
void CTradeScene::clearRequests() {
    for (int off = 0x4e; off <= 0x63; off++) req(lobby, off) = 0;
}

// @yo2 0x008f6da0 the card box shows page 9 (my offer has cards) or 0xb (my offer is empty)
void CTradeScene::myCountChanged() {
    if (shownCount == 1) kabanShowPage(9);
    else if (shownCount == 2) kabanShowPage(0xb);
}

// The 0x7112 TRADEUSEREXIT block (req 0x5e answered), inlined in every state of FUN_008fac30.
void CTradeScene::onPartnerLeft() {
    req(lobby, 0x5e) = 0;
    partnerLeft = 1;
    g_tradeWindow->clearOther();
    lobbyTrade(lobby)->otherStatus = 0;
    tradeShowOtherReady(0);
    tradeRefreshKabanAll();
    uiTradeOkDialog(TX_PARTNER_LEFT);
    busy = 1;
    tradeSetInput(false);
    state = TS_LEFT;
    req(lobby, 0x5e) = 0;
}

// The card moves every editing state handles: answers to my ADDCARD/DELETECARD, and the partner's MOVEOTHERCARD.
// Returns false when the server closed the trade (result -1010).
static bool cardMoves(CTradeScene* s, bool arrived) {
    CNetLobby* lb = s->lobby;
    int32_t r;
    if (req(lb, 0x56) == 2) {
        req(lb, 0x56) = 0;
        lobbyResult(lb, K_ADDCARD, &r);
        if (r == TRADE_CLOSED_BY_SERVER) {
            s->closing = 1;
            s->state = TS_CLOSE;
            return false;
        }
        req(lb, 0x56) = req(lb, 0x57) = 0;
    }
    if (req(lb, 0x57) == 2) {
        req(lb, 0x57) = 0;
        lobbyResult(lb, K_DELCARD, &r);
        req(lb, 0x56) = req(lb, 0x57) = 0;
    }
    if (arrived && req(lb, 0x60) == 2) {   // 0x7122 ARRIVETRADECARD: my move reached the partner
        req(lb, 0x60) = 0;
        req(lb, 0x56) = req(lb, 0x57) = 0;
    }
    if (req(lb, 0x59) == 2) {   // 0x7116 MOVEOTHERCARD
        req(lb, 0x59) = 0;
        TradeBlock* t = lobbyTrade(lb);
        if (t->otherMoveKind == 0) g_tradeWindow->addOther((uint32_t)(int32_t)t->otherMove);
        else g_tradeWindow->removeOther((uint32_t)(int32_t)t->otherMove);
        g_tradeWindow->layout();
        req(lb, 0x59) = 0;
        lb->arriveTradeCard();
    }
    return true;
}

// 0x7134 CHANGETRADESTATUS: the partner's lamp. Returns false when there was none.
static bool partnerStatus(CTradeScene* s) {
    CNetLobby* lb = s->lobby;
    if (req(lb, 0x63) != 2) return false;
    req(lb, 0x63) = 0;
    uint8_t st = lobbyTrade(lb)->otherStatus;
    if (st == 0) tradeShowOtherReady(1);
    else if (st == 1) tradeShowOtherReady(2);
    req(lb, 0x63) = 0;
    return true;
}

// @yo2 0x008fac30
void CTradeScene::step() {
    CNetLobby* lb = lobby;
    TradeBlock* t = lobbyTrade(lb);
    // the partner left (0x7112): every state but 0xc..0x10 shows "The opponent has cancelled" and goes to 0x11
    if (state >= TS_START && state <= TS_READY && state != 5 && state != 6 && state != 7 && state != 8) {
        if (state == TS_READY) tradeRefreshKaban(true);
        if (req(lb, 0x5e) == 2) {
            onPartnerLeft();
            return;
        }
    }
    switch (state) {
    case TS_START:
        tradeSetInput(true);
        g_tradeWindow->clear();
        clearRequests();
        lb->tradeReady();
        uiTradeWindowOpen(std::string(t->partnerName, strnlen(t->partnerName, sizeof t->partnerName)).c_str());
        state = TS_TRUNK;
        return;
    case TS_STARTED:
        if (req(lb, 0x4f) != 2) return;
        req(lb, 0x4f) = 0;
        req(lb, 0x60) = 0;
        state = TS_EDIT;
        tradeRefreshKaban(true);
        return;
    case TS_TRUNK:
        if (req(lb, 0x5f) != 2) return;
        req(lb, 0x5f) = 0;
        for (uint32_t id = 1; id <= CARD_MAX; id++) box->count(id) = g_playerTrunk[id];
        state = TS_LIMIT;
        return;
    case TS_LIMIT:
        if (req(lb, 0x62) != 2) return;
        req(lb, 0x62) = 0;
        for (uint32_t id = 1; id <= CARD_MAX; id++) box->limit(id) = g_playerLimit[id];
        uiKabanLoad(box);
        lb->tradeStart();
        uiSceneChangeSound();
        state = TS_STARTED;
        return;
    case TS_EDIT:
        if (!cardMoves(this, true)) return;
        partnerStatus(this);
        return;
    case TS_STATUS:
        if (!cardMoves(this, false)) return;
        if (partnerStatus(this)) return;
        if (req(lb, 0x5a) != 2) return;
        req(lb, 0x5a) = 0;
        if (t->myStatus == 0) {   // back to editing
            tradeSetInput(true);
            g_tradeWindow->setReady(false);
            state = TS_EDIT;
            tradeRefreshKaban(true);
        } else if (t->myStatus == 1) {
            tradeSetInput(false);
            g_tradeWindow->setReady(true);
            state = TS_READY;
        } else {
            state = resume;
        }
        req(lb, 0x5a) = 0;
        return;
    case TS_READY:
        if (!cardMoves(this, false)) return;
        if (partnerStatus(this)) return;
        if (req(lb, 0x5b) != 2) return;   // 0x7118 TRADEALLREADY: the final question
        req(lb, 0x5b) = 0;
        uiTradeYesNoDialog(4000, 0xfa1);
        busy = 1;
        tradeSetInput(false);
        tradeRefreshKaban(false);
        state = TS_CONFIRM;
        lobbySetReq(lb, K_ALLREADY, 0);
        return;
    case TS_CONFIRM: {
        int32_t r;
        if (lobbyAnswered(lb, K_EXIT)) {
            partnerLeft = 1;
            g_tradeWindow->clearOther();
            tradeShowOtherReady(0);
            tradeRefreshKabanAll();
            tradeBlockSetOtherStatus(t, 0);
            uiTradeOkDialog(TX_PARTNER_LEFT);
            busy = 1;
            tradeSetInput(false);
            uiDialogClose(&yesNo, 0);
            state = TS_LEFT;
            lobbySetReq(lb, K_EXIT, 0);
            return;
        }
        if (lobbyAnswered(lb, K_ADDCARD)) {
            lobbyResult(lb, K_ADDCARD, &r);
            if (r == TRADE_CLOSED_BY_SERVER) {
                closing = 1;
                state = TS_CLOSE;
                return;
            }
            lobbySetReq(lb, K_ADDCARD, 0);
            lobbySetReq(lb, K_DELCARD, 0);
        }
        if (lobbyAnswered(lb, K_DELCARD)) {
            lobbyResult(lb, K_DELCARD, &r);
            lobbySetReq(lb, K_ADDCARD, 0);
            lobbySetReq(lb, K_DELCARD, 0);
        }
        if (!lobbyAnswered(lb, K_CONFIRM)) return;   // 0x7120 TRADELASTCONFIRMRESULT
        switch (tradeBlockConfirm(t)) {
        case 1:
            lobbySetReq(lb, K_STATUS, 0);
            state = TS_READY;
            break;
        case 2:   // someone said no: back to editing
            tradeSetInput(true);
            lobbySetReq(lb, K_STATUS, 0);
            g_tradeWindow->setReady(false);
            state = TS_EDIT;
            tradeRefreshKaban(true);
            break;
        case 3:
            state = TS_END;
            break;
        }
        tradeBlockSetConfirm(t, 0);
        int32_t mine[10], theirs[10];
        for (int i = 0; i < 10; i++) mine[i] = theirs[i] = -1;
        lb->tradeLastConfirm(0, mine, theirs);
        lobbySetReq(lb, K_CONFIRM, 0);
        lobbySetReq(lb, K_STATUS, 0);
        return;
    }
    case TS_END:
        if (!lobbyAnswered(lb, K_END)) return;   // 0x7121 TRADEEND
        tradeRefreshKaban(false);
        if (tradeBlockEnd(t)) {
            g_tradeWindow->swapRows();
            uiTradeEndDialog(TX_COMPLETED);
            busy = 1;
            tradeSetInput(false);
            completed = 1;
        } else {
            uiTradeEndDialog(TX_CANCELLED);
            busy = 1;
            tradeSetInput(false);
            completed = 0;
        }
        state = TS_END_DIALOG;
        return;
    case TS_DONE:
        if (!lobbyAnswered(lb, K_TRUNK)) return;   // the new trunk: the saved decks lose what was traded away
        tradeApplyToDecks(box);
        tradeBlockReset(t);
        tradeBlockClearOwn(t);
        tradeBlockClearOther(t);
        g_tradeWindow->clear();
        state = TS_IDLE;
        break;
    case TS_CLOSE:
        tradeBlockReset(t);
        tradeBlockClearOwn(t);
        tradeBlockClearOther(t);
        g_tradeWindow->clear();
        state = TS_IDLE;
        break;
    default:
        return;
    }
    // 0xf / 0x10: back to the lobby
    tradeBlockSetB25(t, 1);
    g_tradeWindow->setMineCount(1);
    tradeLeaveScene();
}

// @yo2 0x009019c0 dialogs first, then one step, then my drag and drop
uint32_t CTradeScene::update() {
    CNetLobby* lb = lobby;
    if (leftDialog.task && (uiDialogAnswer(&leftDialog) == 0xfa2 || uiCancelKey())) {
        uiSound(0x10000001);
        uiDialogClose(&leftDialog, 0x57d);
        busy = 0;
        tradeSetInput(true);
        closing = 1;
        state = TS_CLOSE;
    }
    if (yesNo.task) {
        int32_t a = uiDialogAnswer(&yesNo);
        int32_t mine[10], theirs[10];
        for (int i = 0; i < 10; i++) mine[i] = theirs[i] = -1;
        if (a == 4000) {   // yes: both rows go to the server for the last check
            uiSound(0x10000001);
            g_tradeWindow->ids(theirs, mine);
            lb->tradeLastConfirm(1, mine, theirs);
            uiDialogClose(&yesNo, 0x5ad);
            busy = 0;
            tradeSetInput(true);
        } else if (a == 0xfa1 || uiCancelKey()) {
            uiSound(0x10000002);
            lb->tradeLastConfirm(2, mine, theirs);
            uiDialogClose(&yesNo, 0x5bd);
            busy = 0;
            tradeSetInput(true);
        }
    }
    if (endDialog.task && (uiDialogAnswer(&endDialog) == 0xfa2 || uiCancelKey())) {
        uiSound(0x10000001);
        uiDialogClose(&endDialog, 0x5dd);
        closing = 1;
        state = completed ? TS_DONE : TS_CLOSE;
    }
    step();
    if (!busy && uiMouseReleased()) {
        int32_t x, y;
        CardDrag* d = g_cardDrag;
        if (d->from == 2) {   // from the card box onto my row
            if (d->phase == 1 && *g_kabanDragging == 1) {
                uiMousePos(&x, &y);
                if (x > 0xf8 && x < 0x2e0 && y > 0x140 && y < 0x260 && g_tradeWindow->mineCount < 10 &&
                    g_tradeWindow->addMine((uint32_t)d->card)) {
                    uiSound(0x1000000f);
                    kabanOffer(d->card, 1);
                    g_tradeWindow->layout();
                    lb->tradeAddCard((int16_t)d->card);
                }
            }
            *d = CardDrag{};
            *g_kabanDragging = 0;
            kabanDragEnd();
            tradeSetInput(true);
        } else if (d->from == 1 && d->phase == 1) {   // one of my offered cards dropped somewhere
            uiMousePos(&x, &y);
            if (d->source == 4) {
                if (x < 0x2e9 || x > 0x3bb || y < 0x59 || y > 599) {
                    uiSound(0x1000000f);
                    g_tradeWindow->resetMine((uint32_t)d->index);
                } else if (g_tradeWindow->removeMine((uint32_t)d->index)) {   // onto the card box: withdrawn
                    uiSound(0x1000000f);
                    kabanReturn(d->card, 1);
                    g_tradeWindow->layout();
                    lb->tradeDeleteCard((int16_t)d->index);
                } else {
                    uiSound(0x1000000f);
                    g_tradeWindow->resetMine((uint32_t)d->index);
                }
            }
            *d = CardDrag{};
            tradeSetInput(true);
        }
        if (uiCancelKey()) kabanRightClick();
    }
    if (g_tradeWindow->mineCount != shownCount) {
        shownCount = g_tradeWindow->mineCount;
        myCountChanged();
    }
    return 1;
}

// @yo2 0x008f6f20 the close button ("deck_botton5"): leave whatever the state, telling the partner unless the
// trade is already over
void CTradeScene::onMessage(int32_t msg) {
    if (closing || !uiCloseButton(msg)) return;
    closing = 1;
    busy = 1;
    tradeSetInput(false);
    uiSound(0x10000001);
    if (state != TS_END && state != TS_END_DIALOG && state != TS_DONE && state != TS_CLOSE) lobby->tradeUserExit();
    TradeBlock* t = lobbyTrade(lobby);
    tradeBlockReset(t);
    tradeBlockClearOwn(t);
    tradeBlockClearOther(t);
    g_tradeWindow->clear();
    state = TS_IDLE;
    t->b25 = 1;
    g_tradeWindow->setMineCount(1);
    tradeLeaveScene();
}
