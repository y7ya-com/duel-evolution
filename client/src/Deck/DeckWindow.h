// yo2DeckWindow.cpp: the deck panel of the deck editor (0x009354e0..0x00955800).
//   CWindowTaskDeckNumber  the nine per-type card counters above the deck ("@1%d" red under 40 in the main deck)
//   CWindowTaskDeckTab     the Main / Side tab
//   CWindowTaskDeckCard    one card picture in the deck grid (+ its forbidden/limited icon)
//   CWindowTaskDeckScroll  the scroll bar of the main / side grid
//   CWindowTaskDeck        the panel: the three card grids (main, side, extra) and everything above
//   CWindowModelDeck       the model window that owns the panel
//
// Window classes are layout-true stand-ins: the CElement / CWindowTaskControll / CWindowTaskScroll /
// CWindowTaskModel region is a byte block with the fields this file touches named (see WinElement). Every other
// window task the panel talks to is opaque and reached through TaskPtr<T> plus the externs below.
#pragma once
#include "deck_a_externs.h"

namespace dk {

// ---------------------------------------------------------------- base-class regions
// CElement (0x340): the fields of it that Deck code writes inline, on itself and on its sprites / texts.
struct WinElement {
    uint8_t task_[0x20];      // CTask
    uint32_t taskFlags;       // 0x20 bit 1: ignored by the mouse (set while hidden)
    uint8_t _24[0x70 - 0x24];
    float x, y, z;            // 0x70 position (z = draw depth)
    uint8_t _7c[0x88 - 0x7c];
    float scaleX;             // 0x88
    uint8_t _8c[0x94 - 0x8c];
    int32_t srcX, srcY, srcW, srcH;   // 0x94 sprite source rectangle
    uint8_t _a4[0xb0 - 0xa4];
    float alpha;              // 0xb0
    uint8_t _b4[0xc4 - 0xb4];
    uint8_t visible;          // 0xc4
    uint8_t _c5[2];
    uint8_t active;           // 0xc7 takes part in the frame update
    uint8_t _c8[0x340 - 0xc8];
};
YO2_AT(WinElement, taskFlags, 0x20);
YO2_AT(WinElement, x, 0x70);
YO2_AT(WinElement, scaleX, 0x88);
YO2_AT(WinElement, srcX, 0x94);
YO2_AT(WinElement, alpha, 0xb0);
YO2_AT(WinElement, visible, 0xc4);
YO2_AT(WinElement, active, 0xc7);
YO2_SIZEOF(WinElement, 0x340);

// CWindowTaskControll (0x368): CElement + IWindowTaskColleague. `mediator` is the parent's IWindowTaskMediator.
struct WinControll : WinElement {
    uint32_t colleagueVtbl;   // 0x340 IWindowTaskColleague
    void* mediator;           // 0x344
    uint8_t b348, b349;
    uint8_t _34a[2];
    float depth;              // 0x34c z of the window
    int32_t f350;             // 0x350
    uint8_t f354;
    uint8_t _355[3];
    uint32_t f358, f35c, f360, f364;

    void* colleague() { return &colleagueVtbl; }
    void notify(int slot);    // mediator->slot(this colleague)
};
YO2_AT(WinControll, mediator, 0x344);
YO2_AT(WinControll, depth, 0x34c);
YO2_SIZEOF(WinControll, 0x368);

inline WinElement* elem(void* p) { return static_cast<WinElement*>(p); }

// ---------------------------------------------------------------- externs (System / yaneSDK / app)
CSpriteElm* spriteCreate(void* parent, int32_t prio, const char* path);   // TODO(System) FUN_0061f030 ('?' = language)
CTextElm* textCreate(void* parent, int32_t prio);                          // TODO(System) FUN_00634470
void textSetText(CTextElm* t, const VcWString& s);                        // TODO(System) FUN_00634850
void elemSetBlend(void* e, int32_t mode);                                  // TODO(System) FUN_0060dc20 (2 = alpha)
void elemAbsPos(const void* e, float* x, float* y);                        // TODO(System) FUN_0060dbe0 screen position
void mediatorCall(void* mediator, int slot, void* colleague);  // inline (in 0x00946290) TODO(System) vtbl[slot] call
void mousePos(int32_t* x, int32_t* y);  // 0x00542590 CMyMouseEx; TODO(System) (*(app+0x148))->vf01
int32_t mouseWheel();  // 0x00607780 CMyMouseEx; TODO(System) (*(app+0x148))->vf22
void mouseSetDragOffset(int32_t x, int32_t y);  // 0x005425f0 CMyMouseEx; TODO(System) (*(app+0x148))->vf07
int32_t sceneId();  // inline in the exe (in 0x00947ae0); TODO(System) *(DAT_01271790+0x7c)
void soundPlay(uint32_t id, int32_t vol);                                  // TODO(System) FUN_00686560
uint32_t cardKonamiId(uint32_t card);                                      // TODO(System) FUN_0073bc50 (card table & 0x3fff)
int32_t cardLimit(uint32_t konamiId);                                      // TODO(System) FUN_00716c10 (0/1/2 list, 3 free)
int32_t cardFrame(uint32_t konamiId);                                      // TODO(System) FUN_0073c010 (2/3 = fusion)
void scrollSetRange(void* scroll, int32_t lines);                          // TODO(System) FUN_005ad4e0 CWindowTaskScroll
float scrollLineToPixel(void* scroll, int32_t line);  // 0x005ad5a0 (+0x54); TODO(System) CWindowTaskScroll vf21
float scrollPixelRange(void* scroll);  // 0x005acc60 (+0x4c); TODO(System) CWindowTaskScroll vf19
void scrollEnable(void* scroll, bool on);                                  // TODO(System) FUN_005acbf0 / FUN_005acc30
void deckDragStartScene(int32_t sceneId);                                  // TODO(Deck B) FUN_008d7ce0+FUN_008d7e30 / FUN_008cf420
void cardPicName(VcString* out, uint32_t card);                            // TODO(Deck A) FUN_00922010 util

// The drag state the deck editor shares (DAT_012b3230, owned by deckEntry.cpp).
struct DeckDragState {
    uint32_t _0;
    int32_t dragging;   // 0x04
    int32_t fromDeck;   // 0x08
    int32_t grid;       // 0x0c 1 main, 2 side, 3 extra
    uint32_t card;      // 0x10
    uint32_t index;     // 0x14 in that grid
};
DeckDragState* deckDragState();                                            // TODO(Deck A) FUN_008e8430 entry

// Inline element helpers (the exe writes these CElement fields directly).
// show / hide an element and take it out of (or put it back into) mouse picking: FUN_005d56d0 / FUN_005d5700
inline void showElem(void* e, bool on) {
    if (!e) return;
    if (on) elem(e)->taskFlags &= ~2u;
    elemSetVisible(e, on);
    if (!on) elem(e)->taskFlags |= 2u;
}
inline void setSrc(void* e, int32_t x, int32_t y, int32_t w, int32_t h) {
    if (!e) return;
    WinElement* s = elem(e);
    s->srcX = x, s->srcY = y, s->srcW = w, s->srcH = h;
}
inline void setPos(void* e, float x, float y, float z) {
    if (!e) return;
    WinElement* s = elem(e);
    s->x = x, s->y = y, s->z = z;
}

// ---------------------------------------------------------------- CWindowTaskDeckNumber (0x490)
// Nine counters, one sprite + one text each; sprite k sits on its row, text k is drawn 17 px (one digit) or 9 px
// (two digits) right of it, 4 px lower.
enum DeckCount : int {
    DC_MAIN, DC_SIDE, DC_MAGIC, DC_TRAP, DC_NORMAL, DC_EFFECT, DC_RITUAL, DC_FUSION, DC_DEFICIENCY, DC_N
};
struct CWindowTaskDeckNumber : WinControll {
    uint32_t mediatorVtbl;            // 0x368 IWindowTaskMediator
    TaskPtr<CSpriteElm> bg[DC_N];     // 0x36c
    TaskPtr<CTextElm> num[DC_N];      // 0x3d8
    float posX, posY;                 // 0x444
    float w, h;                       // 0x44c 256 x 256
    float f454, f458;
    float typeStep;                   // 0x45c spacing of the type counters
    float sideY;                      // 0x460 row of the side counter
    float defY;                       // 0x464 row of the deficiency counter
    float mainX, sideX, typeX, fusionX, defX;   // 0x468 column anchors
    float alpha;                      // 0x47c
    uint8_t count[DC_N];              // 0x480
    uint8_t showSideRow;              // 0x489
    uint8_t showDefRow;               // 0x48a
    uint8_t _48b[5];

    uint32_t init();                          // 0x009354e0 vf04
    void layout();                            // 0x0093ba20 vf13
    void place(int k, int digits);            // text k's position for a 1- or 2-digit value
    void show(int k);                         // place + "@?%d" text
    bool add(int k, uint8_t n);               // 0x0093bcf0..0x0093ee70
    bool sub(int k, uint8_t n);               // 0x0093f4b0..0x009426b0
    void resetAll();                          // 0x00942cf0
    void resetDeficiency();                   // 0x00943e70
    void setSideRowVisible(bool on);          // 0x009442d0
    void setSideY(float y);                   // 0x009443e0
    void setDefRowVisible(bool on);           // 0x00944540
    void setDefY(float y);                    // 0x00944650
    static const char* format(int k, uint8_t v);   // L"@1%d" / "@9%d" / "@0%d"
    static int limit(int k);                  // add() refuses count + n >= limit (0 = no limit)
};
YO2_AT(CWindowTaskDeckNumber, bg, 0x36c);
YO2_AT(CWindowTaskDeckNumber, num, 0x3d8);
YO2_AT(CWindowTaskDeckNumber, posX, 0x444);
YO2_AT(CWindowTaskDeckNumber, typeStep, 0x45c);
YO2_AT(CWindowTaskDeckNumber, mainX, 0x468);
YO2_AT(CWindowTaskDeckNumber, alpha, 0x47c);
YO2_AT(CWindowTaskDeckNumber, count, 0x480);
YO2_AT(CWindowTaskDeckNumber, showDefRow, 0x48a);
YO2_SIZEOF(CWindowTaskDeckNumber, 0x490);

// ---------------------------------------------------------------- CWindowTaskDeckTab (0x3b8)
struct CWindowTaskDeckTab : WinControll {
    TaskPtr<CSpriteElm> left, center, right, title;   // 0x368 the tab is 24 + n*8 + 8 px wide; title is the label
    float posX, posY;         // 0x398
    float w, h;               // 0x3a0 98 x 28
    int32_t selected;         // 0x3a8 0 = front (clickable), 1 = the active tab
    int32_t which;            // 0x3ac label row: 0 main, 1 side
    uint8_t enabled;          // 0x3b0
    uint8_t _3b1[7];

    void construct();         // 0x00944920
    void destruct();          // 0x00944b80
    uint32_t init();          // 0x00944c20 vf04
    void layout();            // 0x00945d40 vf13
    void setSelected(int s);  // 0x00945fc0
    bool hit(float px, float py);   // 0x009461d0 vf15
    uint32_t onMouse(int msg);      // 0x00946290 vf14
    void moveTo(float px, float py);   // 0x0094c290
};
YO2_AT(CWindowTaskDeckTab, left, 0x368);
YO2_AT(CWindowTaskDeckTab, title, 0x38c);
YO2_AT(CWindowTaskDeckTab, posX, 0x398);
YO2_AT(CWindowTaskDeckTab, selected, 0x3a8);
YO2_AT(CWindowTaskDeckTab, enabled, 0x3b0);
YO2_SIZEOF(CWindowTaskDeckTab, 0x3b8);

// ---------------------------------------------------------------- CWindowTaskDeckCard (0x3b0)
struct CWindowTaskDeckCard : WinControll {
    TaskPtr<CSpriteElm> pic;      // 0x368 data/MINI/<card>.png
    TaskPtr<CSpriteElm> limitIcon;// 0x374 forbidden / limited / semi-limited
    float posX, posY;             // 0x380
    float w, h;                   // 0x388 50 x 72
    float posZ;                   // 0x390
    int32_t f394, f398, f39c;
    uint32_t card;                // 0x3a0
    uint8_t dragging;             // 0x3a4
    uint8_t _3a5[3];
    int32_t hover;                // 0x3a8 frames under the mouse
    uint8_t narrow;               // 0x3ac hit width = w instead of 28 (the overlapped grid)
    uint8_t previewOnHover;       // 0x3ad
    uint8_t enabled;              // 0x3ae
    uint8_t _3af;

    void construct();             // 0x009463c0
    void destruct();              // 0x009465f0
    uint32_t init();              // 0x00946670 vf04
    uint32_t main();              // 0x00946700 vf05
    void layout();                // 0x009467e0 vf13
    void setCard(uint32_t id);    // 0x00946870
    void destroyPics();           // 0x00947940
    // @yo2 0x009509d0
    void setPreviewOnHover(bool on) { previewOnHover = on, f350 = on; }
    bool hit(float px, float py); // 0x00947a00 vf15
    uint32_t onMouse(int msg);    // 0x00947ae0 vf14
    static bool limitIconRect(int32_t limit, int32_t* srcX);   // false = no icon
};
YO2_AT(CWindowTaskDeckCard, pic, 0x368);
YO2_AT(CWindowTaskDeckCard, posX, 0x380);
YO2_AT(CWindowTaskDeckCard, card, 0x3a0);
YO2_AT(CWindowTaskDeckCard, hover, 0x3a8);
YO2_AT(CWindowTaskDeckCard, enabled, 0x3ae);
YO2_SIZEOF(CWindowTaskDeckCard, 0x3b0);

// ---------------------------------------------------------------- CWindowTaskDeckScroll (0x4e0)
// CWindowTaskScroll (0x4c8) region: only the fields the deck grid uses.
struct WinScroll : WinControll {
    uint8_t _368[0x470 - 0x368];
    float pixel;              // 0x470 scroll offset in pixels
    float pixelRange;         // 0x474
    int32_t line;             // 0x478 first visible line
    int32_t pageLines;        // 0x47c
    uint8_t upHeld;           // 0x480
    uint8_t _481[7];
    uint8_t downHeld;         // 0x488
    uint8_t _489[7];
    uint8_t barHeld;          // 0x490
    uint8_t _491[0x49d - 0x491];
    uint8_t dragHeld;         // 0x49d
    uint8_t _49e[0x4a8 - 0x49e];
    uint8_t b4a8;             // 0x4a8
    uint8_t _4a9[0x4c8 - 0x4a9];
};
YO2_AT(WinScroll, pixel, 0x470);
YO2_AT(WinScroll, line, 0x478);
YO2_AT(WinScroll, dragHeld, 0x49d);
YO2_SIZEOF(WinScroll, 0x4c8);

struct CWindowTaskDeckScroll : WinScroll {
    int32_t maxLine;          // 0x4c8
    int32_t shownLine;        // 0x4cc the line the grid was last filled at
    int32_t dragLine, dragPage;   // 0x4d0 saved at drag start
    uint8_t live;             // 0x4d8 refill the grid on input
    uint8_t _4d9[7];

    void construct();         // 0x00947da0
    void destruct();          // 0x00948000
    void setLines(int32_t n);         // 0x009480d0
    void saveDrag();                  // 0x00948140
    int32_t lineFromDrag();           // 0x00948170
    void setMax(int32_t n);           // 0x009481c0
    void scrollBy(int32_t n);         // 0x009481f0 (wheel)
    uint32_t onMouse();               // 0x00948290 vf14
};
YO2_AT(CWindowTaskDeckScroll, maxLine, 0x4c8);
YO2_AT(CWindowTaskDeckScroll, live, 0x4d8);
YO2_SIZEOF(CWindowTaskDeckScroll, 0x4e0);

void deckScrollCreate(void* parent, void* mediator, int32_t pageLines);   // 0x00947cb0
void deckTabCreate(void* parent, void* mediator);                         // 0x00944860
CWindowTaskDeckCard* deckCardCreate(void* parent, void* mediator);        // 0x00946300

// ---------------------------------------------------------------- CWindowTaskDeck (0x498)
struct CWindowTaskDeckBar;           // DeckParts
struct CSortListStandIn {            // 0x444: the CSortList the panel sorts with (DeckUtil owns the class)
    uint32_t vtbl;
    VcVector<VcString> keys;         // 0x448
    uint8_t rest[0x24 - 0x14];
};
struct CWindowTaskDeck : WinControll {
    uint32_t mediatorVtbl;                           // 0x368
    TaskPtr<CWindowTaskDeckBar> bar;                 // 0x36c
    TaskPtr<CWindowTaskDeckNumber> number;           // 0x378
    TaskPtr<CWindowTaskFrameThin> frame[3];          // 0x384 main / side / extra frames
    TaskPtr<CWindowTaskTextField> field[3];          // 0x3a8 their captions
    TaskPtr<CWindowTaskDeckScroll> scroll[2];        // 0x3cc main grid, missing grid
    TaskPtr<CWindowTaskDeckTab> tab[2];              // 0x3e4 main, side
    CWindowTaskDeckTab* front;                       // 0x3fc the tab in front (tab[0] main, tab[1] side)
    VcVector<CWindowTaskDeckCard*> cards[4];         // 0x400 main, side, extra, missing (not in the trunk)
    void* preview;                                   // 0x440 the card-info window (+0x438 card, +0x440 -1)
    CSortListStandIn sort;                           // 0x444
    uint8_t expanded;                                // 0x468 the main grid takes the side grid's rows
    uint8_t _469[3];
    float posX, posY, w, h, posZ;                    // 0x46c
    int32_t mainCount, sideCount, extraCount;        // 0x480
    int32_t missingCount;                            // 0x48c
    uint8_t live;                                    // 0x490
    uint8_t mainScrollOn, sideScrollOn;              // 0x491
    uint8_t _493;
    int32_t lastWheel;                               // 0x494

    void construct();                 // 0x00948450
    void destruct();                  // 0x00948b40
    bool full(uint32_t card) const;   // 0x0094edf0 no room for one more copy
    bool extraView();                 // 0x00951620 the Extra tab is in front
    // @yo2 0x00948e10
    void setPreview(void* p) { preview = p; }
    // @yo2 0x00952510
    void* getPreview() const { return preview; }
    uint32_t init();                  // 0x00948e30 vf04
    void clearAll();                  // 0x0094f9a0
    void exportTo(void* deckObj, int32_t slot);   // 0x0094ff40 (island)
    uint32_t main();                  // 0x0094c2c0 vf05
    void layout();                    // 0x0094c4a0 vf13
    void setExpanded(bool on);        // 0x0094cab0
    void setMainScrollOn(bool on);    // 0x00951df0
    void setSideScrollOn(bool on);    // 0x00952070
    void showMissingFrame();          // 0x009519d0
    void hideMissingFrame();          // 0x00951a50
    // scroll[0] / scroll[1] forwards (0x00951cd0..0x00951dc0 / 0x00951f50..0x00952040)
    void saveDrag(int s);
    int32_t lineFromDrag(int s);
    void scrollBy(int s, int32_t n);
    int32_t line(int s);
    void setLive(int s, bool on);
    bool live_(int s);
    // the grids
    bool addMain(uint32_t card);              // 0x0094d940
    bool addSide(uint32_t card);              // 0x0094dcb0
    bool addExtra(uint32_t card);             // 0x0094e020
    bool addMissing(uint32_t card);           // 0x0094e2e0
    bool removeMain(uint32_t index);          // 0x0094e640
    bool removeSide(uint32_t index);          // 0x0094e7c0
    bool removeExtra(uint32_t index);         // 0x0094e900
    void cancelDrag(int grid, uint32_t index);    // 0x0094ea20 / 0x0094eb00 / 0x0094ebe0
    int32_t copies(uint32_t card);            // 0x0094ecc0 in main + side + extra
    void clearMissing();                      // 0x0094fe00
    void setEnabled(bool on);                 // 0x00951670
    void countType(uint32_t card, bool remove);   // 0x00951820
    void mainGridScroll();                    // 0x00951ad0
    void missingGridScroll();                 // 0x00951e40
    CWindowTaskDeckCard* newCard(uint32_t card);
    // grid refresh, in DeckWindowDeck.cpp
    void rebuild();                   // 0x0094ee60
    void fill(int32_t a, int32_t b);  // 0x009500a0 show the grids of one view (extra view when a != b)
    int32_t mainVisibleRows() const;
    void onColleague(void* who);      // 0x009520c0 IWindowTaskMediator::vf00
    void switchView(int which);       // 0x00950a00 0 = Main tab (main + side + missing), 1 = Extra tab
    void relay(int slot);             // 0x009489d0 / 0x00948a10 / 0x00948a50
};
YO2_AT(CWindowTaskDeck, bar, 0x36c);
YO2_AT(CWindowTaskDeck, frame, 0x384);
YO2_AT(CWindowTaskDeck, scroll, 0x3cc);
YO2_AT(CWindowTaskDeck, tab, 0x3e4);
YO2_AT(CWindowTaskDeck, front, 0x3fc);
YO2_AT(CWindowTaskDeck, cards, 0x400);
YO2_AT(CWindowTaskDeck, preview, 0x440);
YO2_AT(CWindowTaskDeck, sort, 0x444);
YO2_AT(CWindowTaskDeck, expanded, 0x468);
YO2_AT(CWindowTaskDeck, posX, 0x46c);
YO2_AT(CWindowTaskDeck, mainCount, 0x480);
YO2_AT(CWindowTaskDeck, missingCount, 0x48c);
YO2_AT(CWindowTaskDeck, lastWheel, 0x494);
YO2_SIZEOF(CWindowTaskDeck, 0x498);

extern CWindowTaskDeck* g_deckWindow;   // DAT_012b35b8
CWindowTaskDeck* deckWindowCreate(void* parent, void* mediator, void* preview);   // 0x00948360

// ---------------------------------------------------------------- CWindowModelDeck (0x3f8)
// CWindowTaskModel (0x398) region: CElement + IWindowTaskMediator at 0x340 + the model's own fields.
struct WinModel : WinElement {
    uint32_t mediatorVtbl;    // 0x340
    uint8_t _344[0x34c - 0x344];
    float depth;              // 0x34c
    uint8_t _350[0x380 - 0x350];
    float posX, posY;         // 0x380
    float w, h;               // 0x388
    uint8_t _390[0x398 - 0x390];
};
YO2_AT(WinModel, posX, 0x380);
YO2_SIZEOF(WinModel, 0x398);

struct CWindowModelDeck : WinModel {
    TaskPtr<CWindowTaskDeck> deck;   // 0x398
    int32_t parentArg;               // 0x3a4
    float f3a8;                      // 0x3a8 32.0
    int32_t f3ac;                    // 0x3ac
    int32_t f3b0, f3b4;              // -1
    VcWString s3b8[4];               // 0x3b8 (the destructor frees the first three)

    void construct();                // 0x00952660
    void destruct();                 // 0x00952940
    void setup(int32_t a, float x, float y, int32_t d);   // 0x00952620
    uint32_t init();                 // 0x00952ab0 vf04
    void layout();                   // 0x00952fe0 vf09
    void center();                   // 0x00953010 vf14
};
YO2_AT(CWindowModelDeck, deck, 0x398);
YO2_AT(CWindowModelDeck, f3ac, 0x3ac);
YO2_AT(CWindowModelDeck, s3b8, 0x3b8);
YO2_SIZEOF(CWindowModelDeck, 0x3f8);

CWindowModelDeck* modelDeckCreate(void* parent, int32_t a, float x, float y, int32_t d);   // 0x00952530

}   // namespace dk
