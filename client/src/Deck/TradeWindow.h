// yo2TradeWindow.cpp: the trade window (CWindowTaskTrade, DAT_012b47b0) and its card sprites (CWindowTaskTradeCard).
// The window keeps two lists of card tasks: the partner's offer (top row) and mine (bottom row), at most 10 counted
// each. The trade scene (TradeEntry.cpp) adds/removes the partner's cards from 0x7116, my own come from drags in
// the card box (Deck part A).
//
// TODO(System): the classes derive from CWindowTaskModel (0x340 + IWindowTaskMediator, include/yo2/System). That base
// is a padded block here, so only the fields this code touches are named; their offsets are the exe's (YO2_AT, i686).
#pragma once
#include <string>

#include "deck_b_externs.h"

struct CWindowTaskTradeCard {   // 0x3a8, ctor FUN_0098f280
    uint8_t _model[0x344];
    void* owner;             // 0x344 the window's mediator (window + 0x368)
    uint8_t _348[0x368 - 0x348];
    TaskPtrSlot sprite;      // 0x368 CTaskPtr<CSpriteElm> "picCard"
    float x, y;              // 0x374 drawn position
    float w, h;              // 0x37c 100 x 145
    float z;                 // 0x384
    float homeX, homeY;      // 0x388 slot position
    float homeZ;             // 0x390
    int32_t card;            // 0x394 card id
    uint8_t selected;        // 0x398
    uint8_t _399[3];
    int32_t hoverTicks;      // 0x39c
    uint8_t last;            // 0x3a0 last card of its row (drawn uncovered)
    uint8_t b3a1;
    uint8_t enabled;         // 0x3a2
    uint8_t _3a3[5];

    void init();                       // FUN_0098f500
    void setCard(uint32_t id);         // FUN_0098f690
    void syncPosition();               // FUN_0098f660
    int32_t update();                  // FUN_0098f590: hovered for 4 frames -> show it in the detail view
    void destroy();                    // FUN_0098fda0: drops the sprite (the window then deletes the card)
    static int32_t typeId();           // FUN_0098f440
};
YO2_AT(CWindowTaskTradeCard, owner, 0x344);
YO2_AT(CWindowTaskTradeCard, sprite, 0x368);
YO2_AT(CWindowTaskTradeCard, x, 0x374);
YO2_AT(CWindowTaskTradeCard, z, 0x384);
YO2_AT(CWindowTaskTradeCard, homeX, 0x388);
YO2_AT(CWindowTaskTradeCard, card, 0x394);
YO2_AT(CWindowTaskTradeCard, selected, 0x398);
YO2_AT(CWindowTaskTradeCard, hoverTicks, 0x39c);
YO2_AT(CWindowTaskTradeCard, last, 0x3a0);
YO2_AT(CWindowTaskTradeCard, enabled, 0x3a2);
static_assert(sizeof(void*) != 4 || sizeof(CWindowTaskTradeCard) == 0x3a8, "CWindowTaskTradeCard size");

using TradeCards = Vc6Vec<CWindowTaskTradeCard*>;

struct CWindowTaskTrade {   // 0x420, ctor FUN_00990320
    uint8_t _model[0x384];
    TradeCards other;        // 0x384 the partner's offer
    TradeCards mine;         // 0x394 my offer
    uint8_t _3a4[0x410 - 0x3a4];
    int32_t otherCount;      // 0x410 capped at 10
    int32_t mineCount;       // 0x414 capped at 10
    uint8_t enabled;         // 0x418
    uint8_t ready;           // 0x419 my "ready" pressed: rows are packed tighter
    uint8_t _41a[6];

    bool addOther(uint32_t card);        // FUN_00993090
    bool addMine(uint32_t card);         // FUN_009932f0
    bool removeOther(uint32_t index);    // FUN_00993550
    bool removeMine(uint32_t index);     // FUN_00993680
    void swapRows();                     // FUN_009937b0 (after a completed trade)
    void resetMine(uint32_t index);      // FUN_009938e0: back to its slot, unselected
    int32_t countMine(int32_t card);     // FUN_009939c0 / FUN_00994330 (two copies)
    void layout();                       // FUN_00993a40
    void clear();                        // FUN_00993da0
    void clearOther();                   // FUN_00994000
    void setEnabled(bool on);            // FUN_00994250
    void ids(int32_t* other, int32_t* mine) const;   // FUN_00994540
    uint32_t otherIds(int32_t* out) const;           // FUN_00994660: at most 10
    void setMineCount(int32_t n);        // FUN_009017e0
    void setReady(bool on);              // FUN_009929e0
};
YO2_AT(CWindowTaskTrade, other, 0x384);
YO2_AT(CWindowTaskTrade, mine, 0x394);
YO2_AT(CWindowTaskTrade, otherCount, 0x410);
YO2_AT(CWindowTaskTrade, mineCount, 0x414);
YO2_AT(CWindowTaskTrade, ready, 0x419);
static_assert(sizeof(void*) != 4 || sizeof(CWindowTaskTrade) == 0x420, "CWindowTaskTrade size");

void tradeShowOtherReady(int mode);      // FUN_009943d0: 0 = nothing, 1 = "waiting", 2 = "ready"
void tradeRefreshKaban(bool on);         // FUN_009945d0
void tradeRefreshKabanAll();             // FUN_00994630

// UI hooks the window uses (TODO(System): CWindowTaskModel / sprite calls)
CWindowTaskTradeCard* uiNewTradeCard(CWindowTaskTrade* w);   // FUN_0098f1c0: new task under the window
void uiDeleteTask(void* task, int line);                     // FUN_006286b0 (yo2TradeWindow.cpp line)
void uiRedraw(void* task);                                   // 0x0098f660 CWindowTaskTradeCard; vtable +0x34
void* uiCardSprite(CWindowTaskTradeCard* c, const std::string& path);  // FUN_0061f030: new CSpriteElm "picCard"
void uiSpriteVisible(void* sprite, bool on);                 // inline in the exe (in 0x0098fda0); CElement +0xc7
void uiReadyLamp(int which, bool on);                        // FUN_005d9520 + FUN_0060e170 + flag 2 at +0x20
void uiKabanRefresh(bool on);                                // FUN_00981af0 + FUN_0091ffd0 (Deck part A)
void uiKabanRefreshAll();                                    // FUN_00981af0 + FUN_009200a0
void uiTradeLock(bool on);                                   // FUN_008f6d50 (the ready button)
bool uiCursorOver(CWindowTaskTradeCard* c);  // 0x0098fe20 CWindowTaskTradeCard; vtable +0x3c with the cursor position
void uiDetailView(int32_t card);                             // FUN_00994850: detail window card, +0x440 = -1
std::string cardImageName(int32_t card);                     // FUN_0098fc20: the card list's file name table
