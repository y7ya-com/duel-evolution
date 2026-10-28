// What src/Deck part B (card swap, present, TP and trade scenes + windows) needs from code that is not reimplemented
// yet: the System task/UI layer, the lobby object's trade block (Net), the deck editor windows (Deck part A) and the
// player object. Every declaration names the exe function it stands for; tests/deck_b_cli.cpp defines stubs that log.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>

#include "../Net/NetLobby.h"

// ---------------------------------------------------------------- layout helpers

// TODO(System): CTaskPtr<T> (src/System/yo2TaskPtr.h, 0xc bytes {vtbl, task, user}). A stand-in with the same size on
// i686 so the classes below keep their offsets; `task` is what the reimplemented code reads.
struct TaskPtrSlot {
    uint32_t _vtbl;
    void* task;
    void* user;
};

// TODO(System): vc6::vector<T> (src/System/vc6.h, 16 bytes {allocator byte, first, last, end}).
template <class T>
struct Vc6Vec {
    uint8_t _alloc;
    T* first;
    T* last;
    T* end;
    size_t size() const { return first ? (size_t)(last - first) : 0; }
    T& operator[](size_t i) { return first[i]; }
};

// ---------------------------------------------------------------- the lobby's trade block (CNetLobby + 0x1bb4)

// The trade sub-object FUN_0086b6e0 returns (lobby + 0x1bb4). Filled by the lobby's 0x71xx parsers (src/Net, not
// written yet), read by the trade scene. Offsets from research/intercambio/NOTES.md and the accessors 0x009018c0..
struct TradeBlock {
    uint8_t _00[4];
    uint32_t partnerPid;     // 0x04 (+0x1bb8) 0x7104
    char partnerName[16];    // 0x08 (+0x1bbc)
    uint8_t _18[2];
    int16_t ownMove;         // 0x1a (+0x1bce) 0x7115 id / index
    uint8_t ownMoveKind;     // 0x1c (+0x1bd0) 0 = added, else removed
    uint8_t myStatus;        // 0x1d (+0x1bd1) 0x7117
    int16_t otherMove;       // 0x1e (+0x1bd2) 0x7116 id (kind 0) or index (kind != 0)
    uint8_t otherMoveKind;   // 0x20 (+0x1bd4)
    uint8_t otherStatus;     // 0x21 (+0x1bd5) 0x7134: 1 = the partner is ready
    uint8_t confirm;         // 0x22 (+0x1bd6) 0x7120: 1 back to ready, 2 back to edit, 3 done
    uint8_t tradeEnd;        // 0x23 (+0x1bd7) 0x7121: != 0 completed
    uint8_t offerPending;    // 0x24 (+0x1bd8)
    uint8_t b25;             // 0x25 (+0x1bd9) cleared when the scene ends
    uint8_t offerWithdrawn;  // 0x26 (+0x1bda)
};
static_assert(offsetof(TradeBlock, ownMove) == 0x1a && offsetof(TradeBlock, otherStatus) == 0x21, "TradeBlock");
static_assert(offsetof(TradeBlock, offerWithdrawn) == 0x26, "TradeBlock");

// FUN_0086b6e0. src/Net lays the same bytes out as CNetLobby's trade members (_vtbl1bb4 .. tradeTrunk).
inline TradeBlock* lobbyTrade(CNetLobby* lb) { return reinterpret_cast<TradeBlock*>(&lb->_vtbl1bb4); }

// FUN_006a5b90: req byte k + 0x1c went 2 (answered) -> 0. TODO(Net): a CMessageIOBase/CNetLobby method.
inline bool lobbyAnswered(CNetLobby* lb, int k) {
    uint8_t& f = lb->flag(k + 0x1c);
    if (f != 2) return false;
    f = 0;
    return true;
}
// FUN_006adfb0: the s32 result of request k (+0x7e0 + 4k), -150 = none yet (then 0 and false); reading it resets it.
// TODO(Net): CNetLobby's result array; reached through its padding here.
uint8_t* lobbyResultSlot(CNetLobby* lb, int k);   // TradeEntry.cpp
inline bool lobbyResult(CNetLobby* lb, int k, int32_t* out) {
    if (k < 0 || k >= 0x70) return false;
    uint8_t* slot = lobbyResultSlot(lb, k);
    int32_t v;
    memcpy(&v, slot, 4);
    *out = v;
    if (v == -150) {
        *out = 0;
        return false;
    }
    v = -150;
    memcpy(slot, &v, 4);
    return true;
}
enum : int32_t { TRADE_CLOSED_BY_SERVER = -1010 };   // ADDCARD/DELETECARD result that ends the scene

// ---------------------------------------------------------------- player data (System)

// TODO(System) *(DAT_012711ac + 0xc68): the player record. Its card box (+0x18ed, one count per card id 1..0xcb8;
// 0x7125 TRADETRUNK) and the per-card "not tradeable" copies (+0x25a5; 0x7129 TRADELIMIT).
enum { CARD_MAX = 0xcb8 };
extern uint8_t g_playerTrunk[CARD_MAX + 1];   // inline in the exe (in 0x008fac30): index = card id (+0x18ed + id - 1)
extern uint8_t g_playerLimit[CARD_MAX + 1];   // inline in the exe (in 0x008fac30); exe: +0x25a5 + id - 1

// A card box as the deck windows keep it: 3 bytes per id from +9 {copies, not-tradeable copies, -}.
struct CardBox {
    uint8_t raw[(CARD_MAX + 4) * 3];
    uint8_t& count(uint32_t id) { return raw[((id & 0xffff) + 3) * 3]; }
    uint8_t& limit(uint32_t id) { return raw[((id & 0xffff) + 3) * 3 + 1]; }
};

// ---------------------------------------------------------------- UI and System hooks used by the trade scene

// TODO(System/UI): each hook replaces a call sequence of the exe that only touches windows; the stubs log them.
void uiSetInputEnabled(bool on);         // FUN_005d9520 + FUN_0066e2f0: the scene's buttons / mouse
void uiDeckWindowsEnabled(bool on);      // FUN_00977360 (Deck part A: CWindowModelKaban)
void uiTradeOkDialog(int text);          // FUN_005e79f0 into the scene's CTaskPtr<CWindowModelDialogOk> +0x11c
void uiTradeYesNoDialog(int yes, int no);   // FUN_005e6a60 into +0x104 (texts 4000 / 0xfa1)
void uiTradeEndDialog(int text);         // states 0xc/0xd: FUN_007fb510 + FUN_005e79f0 + the result window setup
void uiKabanLoad(CardBox* box);          // state 4: FUN_00913e80 per card, FUN_00971270, FUN_0096feb0(9), FUN_00977310
void uiSceneChangeSound();               // state 4: FUN_0061ca80(10, 0xee4c) + FUN_007dcc20
void tradeApplyToDecks(CardBox* box);    // inline in the exe (in 0x008fac30): state 0xf, drop traded copies from decks
void tradeLeaveScene();                  // states 0xf/0x10/0x11 tail: FUN_00686780 + FUN_006a5e80 + FUN_00a564b0

// The trade window (CWindowTaskTrade, yo2TradeWindow.cpp) the scene drives; DAT_012b47b0. Its list and button
// functions are reimplemented in TradeWindow.cpp.
struct CWindowTaskTrade;
extern CWindowTaskTrade* g_tradeWindow;   // FUN_009019a0
