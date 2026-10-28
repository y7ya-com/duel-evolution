// tradeEntry.cpp: CTradeScene, the card trade between two players (0x7000 lobby envelope). The scene polls the
// lobby's request bytes (CMessageIOBase::req, "2 = answered") and the trade block the lobby's 0x71xx parsers fill
// (deck_b_externs.h TradeBlock), drives the trade window (TradeWindow.h) and answers with src/Net's CNetLobby
// builders. Protocol and states: YOLaucher research/intercambio/NOTES.md (sections 2-4).
//
// TODO(System): CTradeScene derives from CSceneTask (0x80 bytes, include/yo2/misc/CSceneTask.h); a padded stand-in
// here. Field offsets are the exe's (YO2_AT, i686).
#pragma once
#include "TradeWindow.h"

enum TradeState : uint32_t {
    TS_IDLE = 0,
    TS_START = 1,         // clear, 0x7132 TRADEREADY, set the window up
    TS_STARTED = 2,       // wait 0x7133 TRADESTARTRESULT (req 0x4f)
    TS_TRUNK = 3,         // wait 0x7125..0x7127 TRADETRUNK (req 0x5f)
    TS_LIMIT = 4,         // wait 0x7129..0x7131 TRADELIMIT (req 0x62), then 0x7101 TRADESTART
    TS_EDIT = 9,          // cards may move; 0x7116 MOVEOTHERCARD
    TS_STATUS = 10,       // "ready" sent (0x7117), wait its answer (req 0x5a)
    TS_READY = 0xb,       // wait 0x7118 TRADEALLREADY (req 0x5b) -> final Yes/No
    TS_CONFIRM = 0xc,     // Yes/No answered (0x7119), wait 0x7120 (req 0x5c)
    TS_END = 0xd,         // wait 0x7121 TRADEEND (req 0x5d)
    TS_END_DIALOG = 0xe,  // "Trade Completed" / "Trade Cancelled" shown
    TS_DONE = 0xf,        // completed: wait the new trunk (req 0x5f), fix the decks, leave
    TS_CLOSE = 0x10,      // cancelled or closed: leave
    TS_LEFT = 0x11,       // the partner left (0x7112): "The opponent has cancelled" shown
};

// The drag and drop record of the deck screens (DAT_012b3230). TODO(Deck part A): the same global as
// KabanWindowList.h's DragState* g_drag; unify when both halves are linked together.
struct CardDrag {
    uint32_t _0;
    int32_t from;    // 0x04 2 = from the card box, 1 = from a trade row
    int32_t phase;   // 0x08 1 = dropped
    int32_t source;  // 0x0c 4 = my trade row
    int32_t card;    // 0x10
    int32_t index;   // 0x14 position in the row
};
extern CardDrag* g_cardDrag;
extern uint8_t* g_kabanDragging;   // DAT_012b3988 + 0x420

struct CTradeScene {   // 0x168, ctor FUN_008f66b0
    uint8_t _scene[0x70];
    uint32_t arg;              // 0x70 CSceneTask: the creation parameter
    TaskPtrSlot base;          // 0x74 CTaskPtr<CElement>
    CardBox* box;              // 0x80 my card box while trading (count, not-tradeable)
    void* decks;               // 0x84 the saved decks (CDeckDuel list) to fix after a trade
    uint32_t deckDuel;         // 0x88 CDeckDuel
    TaskPtrSlot bg, title;     // 0x8c CTaskPtr<CSpriteElm>
    TaskPtrSlot swf[5];        // 0xa4 CTaskPtr<CSwfEngine>
    TaskPtrSlot detail;        // 0xe0 CTaskPtr<CCardDetailViewDlg>
    TaskPtrSlot tradeModel;    // 0xec CTaskPtr<CWindowModelTrade>
    TaskPtrSlot kabanModel;    // 0xf8 CTaskPtr<CWindowModelKaban>
    TaskPtrSlot yesNo;         // 0x104 the final "Trade?" dialog (4000 yes / 0xfa1 no)
    TaskPtrSlot endDialog;     // 0x110 "Trade Completed" / "Trade Cancelled"
    TaskPtrSlot leftDialog;    // 0x11c "The opponent has cancelled"
    uint8_t busy;              // 0x128 a dialog is up: no drag and drop
    uint8_t _129[3];
    int32_t shownCount;        // 0x12c last my-row count seen (FUN_008f6da0 redraws on change)
    uint8_t _130[0x18];
    TaskPtrSlot loader;        // 0x148 CTaskPtr<CDeckCardLoader>
    CNetLobby* lobby;          // 0x154
    uint32_t state;            // 0x158 TradeState
    uint32_t resume;           // 0x15c state to go back to on an unexpected 0x7117 answer
    uint8_t partnerLeft;       // 0x160
    uint8_t completed;         // 0x161 0x7121 said completed
    uint8_t closing;           // 0x162
    uint8_t _163[5];

    void construct();                  // FUN_008f66b0
    void onMessage(int32_t msg);       // FUN_008f6f20 (CTask vf2): the close button
    uint32_t update();                 // FUN_009019c0 (CEasyTask vf4): dialogs, the state machine, drag and drop
    void step();                       // FUN_008fac30: one step of the state machine
    void clearRequests();              // FUN_008f6e10
    void onPartnerLeft();              // the block every state inlines when req 0x5e is answered
    void myCountChanged();             // FUN_008f6da0
};
YO2_AT(CTradeScene, arg, 0x70);
YO2_AT(CTradeScene, box, 0x80);
YO2_AT(CTradeScene, bg, 0x8c);
YO2_AT(CTradeScene, detail, 0xe0);
YO2_AT(CTradeScene, yesNo, 0x104);
YO2_AT(CTradeScene, endDialog, 0x110);
YO2_AT(CTradeScene, leftDialog, 0x11c);
YO2_AT(CTradeScene, busy, 0x128);
YO2_AT(CTradeScene, shownCount, 0x12c);
YO2_AT(CTradeScene, loader, 0x148);
YO2_AT(CTradeScene, lobby, 0x154);
YO2_AT(CTradeScene, state, 0x158);
YO2_AT(CTradeScene, closing, 0x162);
static_assert(sizeof(void*) != 4 || sizeof(CTradeScene) == 0x168, "CTradeScene size");

void tradeSetInput(bool on);           // FUN_008f6c00: scene buttons + card box + trade window
void tradeSetButtons(bool on);         // FUN_008f6c90
void tradeSetKaban(bool on);           // FUN_008f6d10
void tradeSetReadyButton(bool on);     // FUN_008f6d50
void tradeBlockClearOwn(TradeBlock* t);     // FUN_009018c0
void tradeBlockClearOther(TradeBlock* t);   // FUN_009018e0
void tradeBlockSetOtherStatus(TradeBlock* t, uint8_t v);   // FUN_00901900
void tradeBlockSetConfirm(TradeBlock* t, uint8_t v);       // FUN_00901920
uint8_t tradeBlockConfirm(const TradeBlock* t);            // FUN_00901940
uint8_t tradeBlockEnd(const TradeBlock* t);                // FUN_00901960
void tradeBlockSetB25(TradeBlock* t, uint8_t v);           // FUN_00901980
void lobbySetReq(CNetLobby* lb, int k, uint8_t v);         // FUN_00901880: req byte k + 0x1c

// UI / Deck part A hooks the scene uses (logged by the test stubs)
void uiTradeWindowOpen(const char* partner);   // FUN_00992b20 (CWindowTaskTrade setup with the partner's name)
void uiSound(uint32_t id);                     // FUN_00686560
void uiDialogClose(TaskPtrSlot* dlg, int line);   // FUN_005df6d0 + FUN_006286b0
int32_t uiDialogAnswer(TaskPtrSlot* dlg);  // 0x005e65f0 DialogOk/YesNo vtable +0x60: the button id pressed, 0 = none
bool uiCancelKey();  // 0x00607720 CMyMouseEx; the input object's vtable +0x48 (right click / escape)
bool uiMouseReleased();                        // 0x00607750 CMyMouseEx; the input object's vtable +0x4c
void uiMousePos(int32_t* x, int32_t* y);       // 0x00542590 CMyMouseEx; the input object's vtable +0x04
bool uiCloseButton(int32_t msg);               // FUN_006654c0("deck_botton5") on a CTmSwfObjEvent
void kabanOffer(int32_t card, int n);          // FUN_00970a80: n copies leave the card box
void kabanReturn(int32_t card, int n);         // FUN_009702c0
void kabanDragEnd();                           // FUN_009772d0
void kabanRightClick();                        // FUN_009774f0
void kabanShowPage(int page);                  // FUN_00977010 + FUN_0096feb0
