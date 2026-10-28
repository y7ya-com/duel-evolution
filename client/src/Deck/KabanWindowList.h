// yo2KabanWindow.cpp, second half (0x00966180..0x0097c8e0): the "kaban" (trunk = the player's card box) list in the
// deck editor and the trade / present / TP screens.
//   CWindowTaskKabanListBtn  one row of the list: a 3x3 frame tinted by card type, the mini picture, a count figure
//   CWindowTaskKabanList     the 9 (or 11) visible rows over two CSortList-shaped card lists: every card the player
//                            has (`all`) and the filtered / searched / sorted subset on screen (`shown`)
//   CWindowTaskKabanScroll   the list's scroll bar
//   CWindowTaskKaban         the whole trunk panel (deck bar, count, order and search buttons, frame, list, scroll)
//   CWindowModelKaban        the window model hosting it; its `mode` says which screen owns the trunk:
//                            0 deck editor, 1 trade, 2 present, 3 TP exchange
// Plus the TU's template instances: CSortBase (0x10 list entry), the yaneSDK smart_ptr<CSortBase> the name sort
// uses, vector<CSortBase> / vector<smart_ptr<CSortBase>> / vector<int> helpers, and DeckTables.h's tables.
//
// TODO(System): the base classes (CWindowTaskControll 0x368, CWindowTaskScroll 0x4c8, CWindowTaskModel 0x398) are
// opaque byte blocks here; only the fields this file touches are named. The exe's vtables are not reproduced:
// virtual slots are plain methods, each marked with the slot's address.
#pragma once
#include "deck_a_externs.h"

namespace dk {

struct CWindowTaskDeckFigure;     // yo2DeckParts.cpp (Deck A, parts)
struct CWindowTaskCardInfoItem;   // System
struct CWindowTaskDeckBar;        // yo2DeckParts.cpp
struct CWindowTaskKabanNumber;    // yo2KabanWindow.cpp first half (Deck A, kaban)
struct CWindowTaskKabanOrder;
struct CWindowTaskKabanSearch;
struct CWindowTaskKabanCard;
struct CWindowTaskKabanListBtn;
struct CWindowTaskKabanList;
struct CWindowTaskKabanScroll;
struct CWindowTaskKaban;
struct CWindowModelKaban;

// ---------------------------------------------------------------- card table (yo2Card.cpp, System)
// A card is its yo2 id (1..); its static data is looked up by Konami id. Field widths are the exe's bit fields.
namespace card {
int32_t konamiId(int32_t id);     // TODO(System) FUN_0073bc50: table[id].w0 & 0x3fff
int32_t kind(int32_t kid);        // TODO(System) FUN_0073c010: (w1 >> 1) & 0x1f (0 normal .. 13 spell, 14 trap)
int32_t attribute(int32_t kid);   // TODO(System) FUN_0073bf80: (w1 >> 6) & 0xf; < 8 = a monster
int32_t level(int32_t kid);       // TODO(System) FUN_0073bfb0: (w1 >> 10) & 0xf
int32_t icon(int32_t kid);        // TODO(System) FUN_0073bfe0: (w1 >> 14) & 7 (spell/trap icon)
int32_t race(int32_t kid);        // TODO(System) FUN_0073bf20: (w1 >> 17) & 0x1f
int32_t atk(int32_t kid);         // TODO(System) FUN_0073c040: ((w0 >> 14) & 0x1ff) * 10, "?" (0x1ff) -> 0
int32_t def(int32_t kid);         // TODO(System) FUN_0073c080: (w0 >> 23) * 10, "?" -> 0
int32_t sortKey(int32_t kid);     // TODO(System) FUN_0073bdd0: the u16 list-order key of a Konami id
int32_t group(int32_t kid);       // TODO(System) FUN_00716c30: kind -> search group (1 effect, 2 ritual, 3 fusion,
                                  //   7 spell, 8 trap, 9 token, ...)
int32_t limit(int32_t kid);       // TODO(System) FUN_00716c10 -> FUN_0073c190: copies allowed (limited list)
bool nameMatches(int32_t kid, const uint16_t* text);   // TODO(System) FUN_0073bcc0/FUN_0073bd30 + wcsstr
bool textMatches(int32_t kid, const uint16_t* text);   // TODO(duel) FUN_0073bd30 (the card text, via FUN_00743d40) + wcsstr
VcString miniFile(int32_t id);    // TODO(Deck A) FUN_00922010 util: the card's mini picture file name
// FUN_007177f0: a monster (attribute < 8); id 0 is not a card
inline bool isMonster(int32_t kid) { return kid != 0 && attribute(kid) < 8; }
}   // namespace card

// ---------------------------------------------------------------- what the list asks the rest of the game
// Whether one more copy of `id` may leave the trunk now (bright row) or not (dimmed to 0.5), per model mode.
int32_t deckCopies(int32_t id);  // 0x00907c70 TODO(System) CDeckManager (DAT_012b28c4) vtbl+0x58: copies of id in deck
int32_t deckCopiesKonami(int32_t id);   // 0x009066f0 TODO(System) CDeckManager vtbl+0x60: copies of its Konami id
bool deckRefuses(int32_t id);           // TODO(Deck A) FUN_0094edf0 window: the deck window refuses this card
int32_t tradeAvailable(int32_t id);  // inline in the exe (in 0x009735d0) TODO(System) DAT_012714b4[id*3+9] - [id*3+10]
int32_t tradeOffered(int32_t id);       // TODO(System) FUN_00994330: copies already in the trade offer
int32_t tradeSlotsUsed();  // inline in the exe (in 0x009735d0) TODO(System) DAT_012b47b0+0x414: cards offered (max 10)
bool presentHasRoom();  // inline in the exe (in 0x009735d0) TODO(Deck B) DAT_012b3d94+0x404 < DAT_012b1e28+0x108
bool tpHasRoom();  // inline in the exe (in 0x009735d0) TODO(Deck B) DAT_012b4444+0x440 < DAT_012b2180+0x108
int32_t sceneId();  // inline in the exe (in 0x00977450); TODO(System) DAT_01271790+0x7c: the running scene
void sceneKabanPicked(int32_t scene, int32_t arg);   // TODO(Deck B) FUN_008d7b70 / 008f6c00 / 008ec360 / 008f1c60
bool cardListContains(int32_t id);  // inline in the exe (in 0x009716e0) TODO(System) the text search's deck-list check
int32_t deckWindowCopies(int32_t id);   // TODO(Deck A) FUN_0094ecc0 window: copies of id in the edited deck
int32_t tradeOfferCopies(int32_t id);   // TODO(Deck B) FUN_009939c0: copies of id in the trade offer
// The per-mode test the list repeats: may one more copy of `card` leave the trunk (row bright) or not (dimmed).
// `konamiToo`: the deck editor also checks the copies of the card's Konami id (FUN_009735d0, FUN_0096e7a0).
bool kabanCanTake(int32_t mode, int32_t card, int32_t have, bool konamiToo);

// The drag-and-drop state every deck screen shares (DAT_012b3230).
struct DragState {
    uint32_t _0;
    int32_t state;   // 0x04 2 = dragging a card out of the trunk
    int32_t from;    // 0x08 1 = from the trunk
    uint32_t _c;
    int32_t card;    // 0x10
};
extern DragState* g_drag;   // TODO(System) DAT_012b3230

// ---------------------------------------------------------------- System calls
void mousePos(int32_t* x, int32_t* y);                     // 0x00542590 CMyMouseEx; TODO(System) app+0x148 vtbl+4
int32_t mouseWheel();  // 0x00607780 CMyMouseEx; TODO(System) app+0x148 vtbl+0x58: wheel position
void mediatorNotify(void* mediator, int32_t slot, void* colleague);   // inline (in 0x0096e7a0) TODO(System) vtbl[slot]
void elemSetInputOff(void* elem, bool off);  // inline in the exe (in 0x0096e380) TODO(System) CElement +0x20 bit 1
bool elemCreated(const void* elem);                        // TODO(System) FUN_0060e1c0
void elemSetPos3(void* elem, float x, float y, float z);   // TODO(System) CElement +0x70/+0x74/+0x78
void soundPlay(uint32_t id, int32_t arg);                  // TODO(System) FUN_00686560
CSpriteElm* spriteCreate(void* parent, int32_t prio, const VcString& path);   // TODO(System) FUN_0061f030
void spriteSetColor(CSpriteElm* s, float r, float g, float b, float a);  // inline in 0x0096e1d0 TODO(System) +0xa4..b0
void spriteSetAlpha(CSpriteElm* s, float a);  // inline in the exe (in 0x00976cc0); TODO(System) +0xb0
void spriteSetSrc(CSpriteElm* s, int32_t u, int32_t v, int32_t w, int32_t h); // inline in 0x00976cc0 TODO(System)
void spriteGetSrcSize(const CSpriteElm* s, int32_t* w, int32_t* h);  // inline in 0x0096e7a0 TODO(System) +0x9c/+0xa0
void spriteSetScale(CSpriteElm* s, float sx, float sy);  // inline in the exe (in 0x0096e2e0); TODO(System) +0x88/+0x8c
void spriteSetScaleX(CSpriteElm* s, float sx);             // inline in the exe (in 0x0096cbc0); TODO(System) +0x88
void spriteSetScaleY(CSpriteElm* s, float sy);             // inline in the exe (in 0x0096cbc0); TODO(System) +0x8c
void spriteSetBlend(CSpriteElm* s, int32_t mode);          // TODO(System) FUN_0060dc20
void elemScreenPos(const void* elem, float* x, float* y);          // TODO(System) FUN_0060dbe0
void elemLayout(void* elem);  // 0x005ad6b0 KabanScroll / 0x005a29b0 FrameThin; TODO(System) CElement vtbl+0x34 (vf13)
void elemSetFlagC7(void* elem, bool on);  // inline in the exe (in 0x009669e0); TODO(System) CElement +0xc7
void detailSetCard(void* detail, int32_t card);  // inline in the exe (in 0x0096cae0) TODO(System) +0x438 card +0x440 -1
void cardInfoSetCard(CWindowTaskCardInfoItem* item, int32_t id);    // TODO(System) FUN_00a12f80
void cardInfoSetWidth(CWindowTaskCardInfoItem* item, float w);      // TODO(System) FUN_00a12f40
CWindowTaskCardInfoItem* cardInfoItemCreate(void* parent, void* mediator, int32_t v, void* layout);  // 0x00a0f900
                                                                    // TODO(System) FUN_00a0f900
CWindowTaskFrameThin* frameThinCreate(void* parent, void* mediator, int32_t v);   // TODO(System) FUN_005a0c00
void scrollBaseSetRange(CWindowTaskKabanScroll* s, int32_t max);    // TODO(System) FUN_005ad4e0 CWindowTaskScroll
float scrollBaseBarLength(CWindowTaskKabanScroll* s);  // 0x005acc60 TODO(System) CWindowTaskScroll vtbl+0x4c
float scrollBasePosOf(CWindowTaskKabanScroll* s, int32_t index);  // 0x005ad5a0 TODO(System) CWindowTaskScroll vtbl+0x54
void* scrollBaseConstruct(void* self);                              // TODO(System) FUN_005aaec0
void controllConstruct(void* self);                                 // TODO(System) FUN_005de6b0 CWindowTaskControll
void controllDestruct(void* self);                                  // TODO(System) FUN_005de7e0
void controllOnDestroy(void* self);                                 // TODO(System) FUN_005dec20 (vf06 base)
void* modelConstruct(void* self);                                   // TODO(System) FUN_005ded60 CWindowTaskModel
void modelDestruct(void* self);                                     // TODO(System) FUN_005def50
void modelOnDestroy(void* self);                                    // TODO(System) FUN_005df4c0
void modelNotifyBase(void* self);                                   // TODO(System) FUN_005df430
void modelWatchInt(void* self, int32_t* field);                     // TODO(System) FUN_005df480: a change hook on
                                                                    //   a field (functor vtbl 0x00be8dec)

// ---------------------------------------------------------------- Deck A calls (other parts)
void figureSetValue(CWindowTaskDeckFigure* f, int32_t v);              // TODO(Deck A) FUN_0090a710 parts
void figureShow(CWindowTaskDeckFigure* f, bool on);                    // TODO(Deck A) FUN_0090a980 parts
void figureSetPos(CWindowTaskDeckFigure* f, int32_t x, int32_t y, int32_t z);   // TODO(Deck A) FUN_0090ab40 parts
void deckBarSetValue(CWindowTaskDeckBar* b, int32_t v);                // TODO(Deck A) FUN_00913c10 parts
CWindowTaskKabanListBtn* kabanListBtnCreate(void* parent, void* mediator);      // TODO(Deck A) FUN_009660c0 kaban
size_t kabanListBtnSize();                 // for kaban's factory
void* kabanListBtnConstruct(void* mem);    // placement-new + construct (FUN_00966180)
void kabanCardSet(CWindowTaskKabanCard* c, int32_t id);                // TODO(Deck A) FUN_009656e0 kaban
void kabanCardClear(CWindowTaskKabanCard* c);                          // TODO(Deck A) FUN_00965cf0 kaban
void kabanNumberSet(CWindowTaskKabanNumber* n, int32_t v);             // TODO(Deck A) FUN_009563b0 kaban
void kabanNumberEnable(CWindowTaskKabanNumber* n, bool on);            // TODO(Deck A) FUN_009568d0 kaban
void kabanOrderEnable(CWindowTaskKabanOrder* o, bool on);              // TODO(Deck A) FUN_00958c30 kaban
void kabanSearchEnable(CWindowTaskKabanSearch* s, bool on);            // TODO(Deck A) FUN_009616a0 kaban
void kabanSearchReset(CWindowTaskKabanSearch* s);                      // TODO(Deck A) FUN_00961880 kaban
void kabanCardPlace(CWindowTaskKabanCard* c, float x, float y);        // TODO(Deck A) kaban: +0x374/+0x378, vf13
void kabanCardSetDepth(CWindowTaskKabanCard* c, float z);              // TODO(Deck A) kaban: +0x384, vf13
void kabanCardSetActive(CWindowTaskKabanCard* c, bool on);  // inline in the exe (in 0x00974e60) TODO(Deck A) +0x350
CWindowTaskDeckFigure* deckFigureCreate(void* parent, void* mediator, int32_t v);   // TODO(Deck A) FUN_00909220 parts
CWindowTaskDeckBar* deckBarCreate(void* parent, void* mediator, int32_t v);         // TODO(Deck A) FUN_0090aca0 parts
CWindowTaskKabanNumber* kabanNumberCreate(void* parent, void* mediator);            // TODO(Deck A) FUN_009553e0 kaban
CWindowTaskKabanOrder* kabanOrderCreate(void* parent, void* mediator);              // TODO(Deck A) FUN_00956b70 kaban
CWindowTaskKabanSearch* kabanSearchCreate(void* parent, void* mediator);            // TODO(Deck A) FUN_00959350 kaban
CWindowTaskKabanCard* kabanCardCreate(void* parent, void* mediator);                // TODO(Deck A) FUN_00965330 kaban
void kabanLayoutObjInit(void* obj);                    // TODO(Deck A) FUN_00921ba0 util (CWindowTaskKaban +0x3d0)

// ---------------------------------------------------------------- CSortBase / CSortList
// CSortBase: one list entry {vtbl, card id, copies, order}. CSortList ({vtbl, vector<CSortBase>}, 0x14) and its
// lookups (FUN_00913d00..FUN_00914040) belong to yo2DeckParts.cpp; SortItems is the same layout with the two
// operations this file needs written inline (unmarked: they're part "parts"'s addresses).
struct SortItem {
    uint32_t vtbl = 0;
    int32_t card = 0;     // 0x4
    int32_t count = 0;    // 0x8
    int32_t order = -1;   // 0xc running total (name sort) / -1
};
YO2_SIZEOF(SortItem, 0x10);

struct SortItems {
    uint32_t vtbl = 0;
    VcVector<SortItem> v;   // 0x04
    size_t size() const { return v.size(); }
    SortItem* find(int32_t card);                 // = FUN_00913e00
    bool add(int32_t card, int32_t delta, int32_t* now);   // = FUN_00913f60 (refused at 256)
    bool sub(int32_t card, int32_t delta, int32_t* now);   // = FUN_00913fd0 (refused below 0)
    void push(int32_t card, int32_t count);       // = FUN_00913e80
    void clear() { v.clear(); }                   // the inlined "destroy all, last = first"
};
YO2_AT(SortItems, v, 4);
YO2_SIZEOF(SortItems, 0x14);

void sortBaseConstruct(SortItem* p);                 // FUN_00973500
SortItem* sortBaseDestroy(SortItem* p, uint8_t flags);   // FUN_0097a430 (vector-deleting destructor)
// FUN_00971640: qsort comparator of the name sort, by card::sortKey of the Konami id
int sortByKey(const SortItem* a, const SortItem* b);
void sortItemsByKey(SortItem* items, int32_t lo, int32_t hi);   // FUN_00971690 (qsort over [lo, hi])

// yaneSDK smart_ptr<CSortBase> (0x10): {vtbl, ptr, prev, next}; copies share ownership through a ring of the
// pointers (prev/next); a self-linked one owns. The last one out deletes the object.
struct SortRef {
    uint32_t vtbl = 0;
    SortItem* ptr = nullptr;
    SortRef* prev = nullptr;   // 0x8
    SortRef* next = nullptr;   // 0xc
};
YO2_SIZEOF(SortRef, 0x10);
void sortRefInit(SortRef* r, SortItem* p, bool own);   // FUN_0097a9c0
void sortRefReset(SortRef* r);                         // FUN_0097a090 (release)
void sortRefDestroy(SortRef* r);                       // FUN_00979ff0
void sortRefAssignNew(SortRef* r, SortItem* p);        // FUN_0097aa00 release, then own p
void sortRefCopy(SortRef* dst, SortRef* src);          // FUN_0097bc20 copy-construct into raw memory
void sortRefAssign(SortRef* dst, SortRef* src);        // assignment (the inlined loop of FUN_0097bc90)

// a yaneSDK "auto array" holder {vtbl, ptr, own} (vtbl 0x00befee0) of a CSortBase[] (the name sort's scratch)
struct SortArrayHolder {
    uint32_t vtbl = 0;
    SortItem* ptr = nullptr;   // array new[]: the element count sits in the u32 before it
    uint8_t own = 0;
};
void sortArrayRelease(SortArrayHolder* h);              // FUN_0097a100 / FUN_0097a140
SortArrayHolder* sortArrayTake(SortArrayHolder* dst, SortArrayHolder* src);   // FUN_0097aa30

// vector<smart_ptr<CSortBase>> as the exe's 16-byte VC6 vector with raw storage
struct SortRefVec {
    uint8_t alloc = 0;
    SortRef* first = nullptr;
    SortRef* last = nullptr;
    SortRef* end = nullptr;
    // @yo2 0x00979fc0
    int32_t size() const { return first ? (int32_t)(last - first) : 0; }
    SortRef* insert(SortRef* pos, SortRef* val);   // FUN_0097aae0
    SortRef* erase(SortRef* from, SortRef* to);    // FUN_0097a860
    void destroy();
};

// ---------------------------------------------------------------- the classes
// CWindowTaskControll (0x368) + the IWindowTaskMediator vptr at 0x368 that every Kaban window has.
struct ControllBase {
    uint8_t _0[0x70];
    float x, y, z;              // 0x70 CElement position, z = draw depth
    uint8_t _7c[0x340 - 0x7c];
    uint32_t colleagueVtbl;     // 0x340 IWindowTaskColleague
    void* mediator;             // 0x344 who hears this window's events
    uint8_t _348[4];
    float depth;                // 0x34c base depth children are placed from
    int32_t state350;           // 0x350
    uint8_t _354[0x368 - 0x354];
    uint32_t mediatorVtbl;      // 0x368 IWindowTaskMediator (this window mediates its children)

    void* colleague() { return &colleagueVtbl; }
    void notify(int32_t slot) { mediatorNotify(mediator, slot, colleague()); }
    void relay(int32_t slot);   // IWindowTaskMediator slots 0..3: pass a child's event on to our own mediator
};
YO2_AT(ControllBase, x, 0x70);
YO2_AT(ControllBase, mediator, 0x344);
YO2_AT(ControllBase, depth, 0x34c);
YO2_AT(ControllBase, mediatorVtbl, 0x368);
YO2_SIZEOF(ControllBase, 0x36c);

struct CWindowTaskKabanListBtn : ControllBase {
    TaskPtr<CSpriteElm> frameTop[7];   // 0x36c one 3x3-frame column per card-type colour (KLB_*)
    TaskPtr<CSpriteElm> frameMid[7];   // 0x3c0
    TaskPtr<CSpriteElm> frameBot[7];   // 0x414
    TaskPtr<CSpriteElm> body[3];       // 0x468 "picRT/RC/RB": the frame's stretched middle column (top/mid/bottom)
    TaskPtr<CSpriteElm> nothing[3];    // 0x48c "picNothingT/C/B": the same for an empty row
    TaskPtr<CSpriteElm> pic;           // 0x4b0 the card's mini picture ("picElm")
    TaskPtr<CWindowTaskDeckFigure> figure;     // 0x4bc copies left
    TaskPtr<CWindowTaskCardInfoItem> info;     // 0x4c8 name / stats line
    uint32_t layoutVtbl;               // 0x4d4 CKabanListLayout (CCardInfoLayout)
    float posX, posY;                  // 0x4d8 position in the list
    float width, height;               // 0x4e0 hit box (vf15)
    float alpha;                       // 0x4e8
    float picX, picY, picZ;            // 0x4ec where the picture goes (15, 3, depth + 1)
    int32_t card;                      // 0x4f8 shown card, <= 0 = empty row
    uint8_t type;                      // 0x4fc
    uint8_t color;                     // 0x4fd frame colour (KLB_*), 0 = none
    uint8_t enabled;                   // 0x4fe the row is in the visible page
    uint8_t infoShown;                 // 0x4ff
    uint8_t picShown;                  // 0x500
    uint8_t _501[3];
    int32_t hoverTicks;                // 0x504 frames the mouse rested on it (detail view after 4)
    uint8_t clickable;                 // 0x508
    uint8_t _509[7];

    CWindowTaskKabanListBtn* construct();             // FUN_00966180
    void destruct();                                  // FUN_00966870
    CWindowTaskKabanListBtn* destroy(uint8_t flags);  // FUN_00966800 deleting destructor
    // @yo2 0x00966700 vf09
    void setAlpha(float a) { alpha = a; }
    // @yo2 0x00966720 vf12
    static uint32_t typeId() { return 1; }
    uint32_t build();                                 // FUN_009669e0 vf04
    uint32_t onMain();                                // FUN_0096cae0 vf05
    void layout();                                    // FUN_0096cbc0 vf13
    uint32_t onMessage(int32_t msg);                  // FUN_0096e7a0 vf14
    bool hitTest(float x, float y);                   // FUN_0096e6e0 vf15
    void setCard(int32_t id);                         // FUN_0096d250
    void setEnabled(bool on);                         // FUN_0096d9d0
    void setInfoShown(bool on);                       // FUN_0096da00
    void setPicShown(bool on);                        // FUN_0096da90
    void loadPicture();                               // FUN_0096db30
    void dropPicture();                               // FUN_0096e160
    void setPicColor(float r, float g, float b, float a);   // FUN_0096e1d0
    void setPicPos(int32_t x, int32_t y, int32_t z);  // FUN_0096e270
    void setPicScale(float sx, float sy);             // FUN_0096e2e0
    void setCount(int32_t n);                         // FUN_0096e350
    void showCount(bool on);                          // FUN_0096e380
    void setCountPos(int32_t x, int32_t y, int32_t z);   // FUN_0096e400
    void setFrameColor(float r, float g, float b, float a);   // FUN_0096e440
};
YO2_AT(CWindowTaskKabanListBtn, frameTop, 0x36c);
YO2_AT(CWindowTaskKabanListBtn, body, 0x468);
YO2_AT(CWindowTaskKabanListBtn, nothing, 0x48c);
YO2_AT(CWindowTaskKabanListBtn, pic, 0x4b0);
YO2_AT(CWindowTaskKabanListBtn, figure, 0x4bc);
YO2_AT(CWindowTaskKabanListBtn, layoutVtbl, 0x4d4);
YO2_AT(CWindowTaskKabanListBtn, posX, 0x4d8);
YO2_AT(CWindowTaskKabanListBtn, alpha, 0x4e8);
YO2_AT(CWindowTaskKabanListBtn, card, 0x4f8);
YO2_AT(CWindowTaskKabanListBtn, color, 0x4fd);
YO2_AT(CWindowTaskKabanListBtn, hoverTicks, 0x504);
YO2_AT(CWindowTaskKabanListBtn, clickable, 0x508);
YO2_SIZEOF(CWindowTaskKabanListBtn, 0x510);

enum : uint8_t {   // CWindowTaskKabanListBtn::color, from the card kind (FUN_0096d250)
    KLB_NONE = 0, KLB_SPELL = 1, KLB_TRAP = 2, KLB_NORMAL = 3, KLB_EFFECT = 4, KLB_RITUAL = 5, KLB_FUSION = 6,
};
uint8_t kabanRowColor(int32_t kind);   // the switch of FUN_0096d250

enum : int32_t {   // CWindowTaskKabanList::category (the filter tabs, FUN_00971270)
    KL_CAT_NORMAL = 0, KL_CAT_EFFECT = 1, KL_CAT_SPELL = 2, KL_CAT_TRAP = 3, KL_CAT_RITUAL = 4, KL_CAT_FUSION = 5,
    KL_CAT_ALL = 6,
};
bool kabanCategoryHas(int32_t category, int32_t kind);   // the kind test of FUN_00971270

enum : int32_t {   // CWindowTaskKabanList::search modes (FUN_009716e0)
    KL_SEARCH_ATK = 1, KL_SEARCH_DEF = 2, KL_SEARCH_RACE = 3, KL_SEARCH_ATTR = 4, KL_SEARCH_ICON = 5,
    KL_SEARCH_NAME_SORT = 6, KL_SEARCH_TEXT = 7, KL_SEARCH_LEVEL = 8, KL_SEARCH_LIMIT = 9,
    KL_ORDER_UP = 0x1f, KL_ORDER_DOWN = 0x20,   // ATK/DEF: walk lo..hi (or hi..lo) in steps of 10; else a range
};

struct CWindowTaskKabanList : ControllBase {
    TaskPtr<CWindowTaskKabanListBtn> rows[11];   // 0x36c
    SortItems all;           // 0x3f0 every card in the trunk, with its count
    SortItems shown;         // 0x404 the filtered / searched list on screen
    int32_t rowCount;        // 0x418 9, or 11 when the list is extended
    float posX, posY;        // 0x41c
    float width, height;     // 0x424 256 x 504
    float rowHeight;         // 0x42c 56
    float alpha;             // 0x430
    int32_t category;        // 0x434 KL_CAT_*
    int32_t top;             // 0x438 index in `shown` of the first row
    uint8_t enabled;         // 0x43c
    uint8_t picsShown;       // 0x43d
    uint8_t _43e[2];
    int32_t wheel;           // 0x440 last mouse wheel position seen
    uint8_t _444[4];

    CWindowTaskKabanList* construct();               // FUN_0096efe0
    void destruct();                                 // FUN_0096f420
    CWindowTaskKabanList* destroy(uint8_t flags);    // FUN_0096f3d0
    // @yo2 0x0096f2d0 vf09
    void setAlpha(float a) { alpha = a; }
    // @yo2 0x0096f2f0 vf12
    static uint32_t typeId() { return 1; }
    // @yo2 0x00973f50 vf15: the list itself takes no hit
    bool hitTest(float, float) { return false; }
    uint32_t build();                                // FUN_0096f4c0 vf04
    void layout();                                   // FUN_0096fd70 vf13
    uint32_t onMain();                               // FUN_0096fda0 vf05
    void onDestroy();                                // FUN_00973fc0 vf06
    uint32_t onMessage(int32_t msg);                 // FUN_00973f70 vf14
    void setRowCount(int32_t n);                     // FUN_0096feb0
    int32_t cardAt(int32_t x, int32_t y);            // FUN_00970170
    int32_t countOf(int32_t card);                   // FUN_00970280
    uint32_t addCount(uint32_t card, int32_t delta); // FUN_009702c0
    uint32_t subCount(uint32_t card, int32_t delta); // FUN_00970a80
    uint32_t countChanged(int32_t card, int32_t now);   // the shared tail of addCount / subCount
    void setCategory(int32_t c);                     // FUN_00971240
    void applyCategory();                            // FUN_00971270
    void search(int32_t mode, int32_t order, const VcVector<int32_t>& set, int32_t lo, int32_t hi,
                const uint16_t* text);               // FUN_009716e0
    void showFrom(int32_t first);                    // FUN_009735d0
    void setClickable(bool on);                      // FUN_00973bc0
    void setPicsShown(bool on);                      // FUN_00973c10
    void refreshBrightness();                        // FUN_00973c60
    void setRowColor(int32_t row, float r, float g, float b, float a);   // FUN_00973e40
    void setCardColor(float r, float g, float b, float a, int32_t card); // FUN_00973e90
};
YO2_AT(CWindowTaskKabanList, rows, 0x36c);
YO2_AT(CWindowTaskKabanList, all, 0x3f0);
YO2_AT(CWindowTaskKabanList, shown, 0x404);
YO2_AT(CWindowTaskKabanList, rowCount, 0x418);
YO2_AT(CWindowTaskKabanList, alpha, 0x430);
YO2_AT(CWindowTaskKabanList, top, 0x438);
YO2_AT(CWindowTaskKabanList, wheel, 0x440);
YO2_SIZEOF(CWindowTaskKabanList, 0x448);

// CWindowTaskScroll (0x4c8) as far as the trunk scroll bar uses it.
struct ScrollBase {
    uint8_t _0[0x344];
    void* mediator;          // 0x344
    uint8_t _348[0x470 - 0x348];
    float barPos;            // 0x470 the knob's position
    float barLen;            // 0x474
    int32_t index;           // 0x478 the step the knob is on
    int32_t steps;           // 0x47c
    uint8_t dragging;        // 0x480
    uint8_t _481[7];
    uint8_t wheeled;         // 0x488
    uint8_t _489[0x4a8 - 0x489];
    uint8_t b4a8;            // 0x4a8
    uint8_t _4a9[0x4c8 - 0x4a9];
};
YO2_AT(ScrollBase, barPos, 0x470);
YO2_AT(ScrollBase, index, 0x478);
YO2_SIZEOF(ScrollBase, 0x4c8);

struct CWindowTaskKabanScroll : ScrollBase {
    int32_t maxTop;          // 0x4c8 total - rows (0 when everything fits)
    int32_t lastTop;         // 0x4cc the top row last shown
    int32_t total;           // 0x4d0
    int32_t savedIndex;      // 0x4d4
    int32_t savedSteps;      // 0x4d8
    uint8_t enabled;         // 0x4dc
    uint8_t _4dd[3];

    CWindowTaskKabanScroll* construct();             // FUN_009740d0
    void destruct();                                 // FUN_00974340
    CWindowTaskKabanScroll* destroy(uint8_t flags);  // FUN_00974310
    // @yo2 0x009742f0 vf12
    static uint32_t typeId() { return 0xe; }
    uint32_t onMessage();                            // FUN_009745b0 vf14
    void setTotal(int32_t n);                        // FUN_00974410
    void save();                                     // FUN_009744a0
    int32_t restore();                               // FUN_009744d0
    void scrollBy(int32_t d);                        // FUN_00974520
};
YO2_AT(CWindowTaskKabanScroll, maxTop, 0x4c8);
YO2_AT(CWindowTaskKabanScroll, enabled, 0x4dc);
YO2_SIZEOF(CWindowTaskKabanScroll, 0x4e0);

struct CWindowTaskKaban : ControllBase {
    TaskPtr<CWindowTaskDeckBar> bar;          // 0x36c
    TaskPtr<CWindowTaskKabanNumber> number;   // 0x378
    TaskPtr<CWindowTaskKabanOrder> order;     // 0x384
    TaskPtr<CWindowTaskKabanSearch> searchBtn;   // 0x390
    TaskPtr<CWindowTaskFrameThin> frame;      // 0x39c
    TaskPtr<CSpriteElm> listBack;             // 0x3a8
    TaskPtr<CWindowTaskKabanScroll> scroll;   // 0x3b4
    TaskPtr<CWindowTaskKabanList> list;       // 0x3c0
    void* detail;                             // 0x3cc where a hovered card's detail goes (+0x438 card, +0x440 -1)
    uint8_t layoutObj[0x24];                  // 0x3d0 TODO(Deck A) FUN_009215f0 util: a CWindowTaskCardArea-like
                                              //   helper with a vector at +4 (destroyed by FUN_00657a30)
    TaskPtr<CWindowTaskKabanCard> dragCard;   // 0x3f4 the card picture that follows the mouse while dragging
    float posX, posY;                         // 0x400
    float scaleX, scaleY;                     // 0x408 (0 -> 1)
    float posZ;                               // 0x410
    float alpha;                              // 0x414
    uint32_t _418;
    int32_t rowCount;                         // 0x41c 9 / 11
    uint8_t dragging;                         // 0x420
    uint8_t enabled;                          // 0x421
    uint8_t _422[6];

    CWindowTaskKaban* construct();                 // FUN_00974760
    void destruct();                               // FUN_00974cd0
    CWindowTaskKaban* destroy(uint8_t flags);      // FUN_00974be0
    // @yo2 0x00974ac0 vf09
    void setAlpha(float a) { alpha = a; }
    // @yo2 0x00974ae0 vf12
    static uint32_t typeId() { return 0x17; }
    // @yo2 0x00974b00 vf15
    bool hitTest(float, float) { return false; }
    uint32_t onMain();                             // FUN_00976be0 vf05
    uint32_t build();                              // FUN_00974e60 vf04
    void layout();                                 // FUN_00976cc0 vf13
    uint32_t onMessage(int32_t msg);               // FUN_00977580 vf14
    void onDestroy();                              // FUN_009775d0 vf06
    // @yo2 0x00974740
    void setDetail(void* d) { detail = d; }
    // @yo2 0x009775f0
    void* getDetail() const { return detail; }
    void setRowCount(int32_t n);                   // FUN_00977010
    void setNumber(int32_t v);                     // FUN_00977310
    void setEnabled(bool on);                      // FUN_00977360
    void setBarValue(int32_t v);                   // FUN_00977420
    void resetSearch();                            // FUN_009774f0
};
YO2_AT(CWindowTaskKaban, bar, 0x36c);
YO2_AT(CWindowTaskKaban, list, 0x3c0);
YO2_AT(CWindowTaskKaban, detail, 0x3cc);
YO2_AT(CWindowTaskKaban, dragCard, 0x3f4);
YO2_AT(CWindowTaskKaban, posX, 0x400);
YO2_AT(CWindowTaskKaban, alpha, 0x414);
YO2_AT(CWindowTaskKaban, rowCount, 0x41c);
YO2_AT(CWindowTaskKaban, dragging, 0x420);
YO2_SIZEOF(CWindowTaskKaban, 0x428);

// CWindowTaskModel (0x398) as far as the trunk model uses it.
struct ModelBase {
    uint8_t _0[0x70];
    float x, y, z;              // 0x70
    uint8_t _7c[0x340 - 0x7c];
    uint32_t mediatorVtbl;      // 0x340
    uint8_t _344[0x34c - 0x344];
    float depth;                // 0x34c
    uint8_t ready;              // 0x350 set once built
    uint8_t _351[0x380 - 0x351];
    float winX, winY;           // 0x380 window position
    float winW, winH;           // 0x388 window size
    uint8_t _390[4];
    uint32_t f394;              // 0x394
};
YO2_AT(ModelBase, winX, 0x380);
YO2_SIZEOF(ModelBase, 0x398);

struct CWindowModelKaban : ModelBase {
    TaskPtr<CWindowTaskKaban> kaban;   // 0x398
    void* detail;                      // 0x3a4 the card detail view the trunk feeds (CWindowTaskKaban::detail)
    float f3a8;                        // 0x3a8 32
    int32_t f3ac;                      // 0x3ac
    int32_t mode;                      // 0x3b0 0 deck editor, 1 trade, 2 present, 3 TP
    int32_t f3b4, f3b8;                // 0x3b4 -1
    VcWString text[4];                 // 0x3bc
    uint8_t _3fc[4];

    CWindowModelKaban* construct();                // FUN_00977700
    void destruct();                               // FUN_009779e0
    CWindowModelKaban* destroy(uint8_t flags);     // FUN_00977990
    uint32_t build();                              // FUN_00977ba0 vf04
    uint32_t onMain();                             // FUN_00977950 vf05
    void onDestroy();                              // FUN_009781e0 vf06
    void layout();                                 // FUN_009780d0 vf09
    int32_t depthPlus5() const;                    // FUN_00977920 vf10
    void center();                                 // FUN_00978100 vf14
    void setup(void* detail, int32_t mode, float x, float y, int32_t f3ac);   // FUN_00977b50
    void relay(int32_t slot);                      // IWindowTaskMediator slots 0..3
};
YO2_AT(CWindowModelKaban, kaban, 0x398);
YO2_AT(CWindowModelKaban, mode, 0x3b0);
YO2_AT(CWindowModelKaban, text, 0x3bc);
YO2_SIZEOF(CWindowModelKaban, 0x400);

// The singletons the trunk windows reach each other through.
extern CWindowTaskKabanList* g_kabanList;   // DAT_012b3980
extern CWindowTaskKaban* g_kaban;           // DAT_012b3988
extern CWindowModelKaban* g_modelKaban;     // DAT_012b3998

CWindowTaskKabanList* kabanListCreate(void* parent, void* mediator);                // FUN_0096ef20
CWindowTaskKabanScroll* kabanScrollCreate(void* parent, void* mediator, int32_t steps);   // FUN_00973fe0
CWindowTaskKaban* kabanCreate(void* parent, void* mediator, void* detail);          // FUN_00974650
CWindowModelKaban* modelKabanCreate(void* parent, void* detail, int32_t mode, float x, float y, int32_t f3ac);
                                                                                    // FUN_00977610

// the scroll bar / list glue (FUN_00977150..FUN_00977240)
void kabanScrollSetTotal(int32_t n);    // FUN_00977150
void kabanScrollSave();                 // FUN_00977180
int32_t kabanScrollRestore();           // FUN_009771b0
void kabanScrollBy(int32_t d);          // FUN_009771e0
bool kabanScrollEnabled();              // FUN_00977210
void kabanDragStart(float x, float y, float z, int32_t card);   // FUN_00977240
void kabanDragEnd();                    // FUN_009772d0
void kabanPicked(int32_t arg);          // FUN_00977450

// The std::logic_error-shaped object `vectorXran` throws ({vtbl, 8 bytes, the message}); its two constructors are
// instanced in this TU.
struct XranError {
    uint32_t vtbl = 0;
    uint8_t _4[8] = {};
    VcString what;   // 0x0c
};
YO2_AT(XranError, what, 0xc);
XranError* xranCopy(XranError* self, const XranError* from);        // FUN_00973160 (copy, vtbl 0x00be72b0)
XranError* xranConstruct(XranError* self, const VcString& msg);     // FUN_00973330 (vtbl 0x00be729c)

// vector<CSortBase> / vector<int> helpers of this TU (VC6 template instances)
SortItem* sortItemsErase(VcVector<SortItem>* v, SortItem* from, SortItem* to);   // FUN_0097a7e0
int32_t* intVecInsert(VcVector<int32_t>* v, int32_t* pos, const int32_t* val);  // FUN_0097a4b0

}   // namespace dk
