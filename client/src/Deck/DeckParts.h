// yo2DeckParts.cpp (0x00909590..0x00920b00): the small building blocks of the deck editor screen.
//   CWindowTaskDeckFigure  a 4-digit number drawn from deck_font_01 (8x12 glyphs)
//   CWindowTaskDeckBar     a nine-slice panel of 25 sprites (window_base_01 skin), three title rows
//   CWindowTaskSwapIcon    the "swap to main / swap to side" marker with the moved-card count (@2%d)
//   CWindowTaskCardArea    the card list area: frame, back plane, two text switches
//   CSortList / CSortBase  a vector of {key, value} counters (the per-card copies being moved)
//
// Layout-true stand-ins (see DeckCommon.h): each class keeps its System base class as an opaque byte block of the
// exe's size, own fields named, children through TaskPtr<T>. Base-class / System calls are externs below.
#pragma once
#include "deck_a_externs.h"

namespace dk {

struct IWindowTaskMediator;   // the owner interface a window part reports clicks to (System)

// ---------------------------------------------------------------- System calls only part "parts" makes
// CElement / CSpriteElm fields (yo2Element.cpp, yo2SpriteElm.cpp)
CSpriteElm* spriteCreate(void* parent, int32_t prio, const VcString& path);   // TODO(System) FUN_0061f030 new CSpriteElm(0x5088), load, create under parent
void spriteSetBlend(CSpriteElm* s, int32_t mode);         // TODO(System) FUN_0060dc20 (mode 2 = alpha; picks the shader)
void spriteSetSrc(CSpriteElm* s, int32_t u, int32_t v, int32_t w, int32_t h);   // TODO(System) CSpriteElm +0x94..+0xa0 source rect
void spriteSetAlpha(CSpriteElm* s, float a);              // TODO(System) CSpriteElm +0xb0
void elemSetPos3(void* e, float x, float y, float z);     // TODO(System) CElement +0x70..+0x78 (inline in the exe; FUN_005bae80)
void elemSetPos2(void* e, float x, float y);              // TODO(System) FUN_005baeb0 CElement::setPos(x, y)
void elemSetScaleX(void* e, float sx);                    // TODO(System) CElement +0x88
void elemSetScaleY(void* e, float sy);                    // TODO(System) CElement +0x8c
void elemSetDisabled(void* e, bool on);                   // TODO(System) CElement +0x20 bit 1 (set while hidden: no hit test)
void elemSetFlagC7(void* e);                              // TODO(System) CElement +0xc7 = 1
void elemSetListener(void* e, void* mediator);            // TODO(System) FUN_005ddd70: clicks on e go to mediator
// CSwfEngine (yo2SwfEngine.cpp)
CSwfEngine* swfCreate(void* parent, int32_t prio, const VcString& path, int32_t flag);   // TODO(System) FUN_0066d7a0
void swfGotoFrame(CSwfEngine* s, int32_t frame);          // TODO(System) FUN_0066e2f0
void swfPlayLabel(CSwfEngine* s, int32_t loop, const VcString& label);   // TODO(System) FUN_0066f550
void swfSetHold(CSwfEngine* s, bool on);                  // TODO(System) CSwfEngine +0x3e4 (1 = keep the current frame)
// CWindowTaskText / CWindowTaskTextSwitch / CWindowTaskBackPlane (yo2WindowTask*.cpp)
CWindowTaskText* textCreate(void* parent, void* mediator);   // TODO(System) FUN_005aea60
void textSetString(CWindowTaskText* t, const VcWString& s);  // TODO(System) CWindowTaskText vtable +0x44
void textSetSize(CWindowTaskText* t, int32_t size);       // TODO(System) FUN_005af590
void textSetColor(CWindowTaskText* t, float r, float g, float b, float a);   // TODO(System) FUN_005af650
void textSetDepth(CWindowTaskText* t, float z);           // TODO(System) CWindowTaskText +0x37c and +0x78
void textRefresh(CWindowTaskText* t);                     // TODO(System) FUN_005d5700
void switchSetOn(CWindowTaskTextSwitch* t, bool on);      // TODO(System) CWindowTaskTextSwitch +0x350
CWindowTaskTextSwitch* switchCreate(void* parent, void* mediator);   // TODO(System) FUN_005b9f40
void switchSetText(CWindowTaskTextSwitch* t, const VcWString& s);   // TODO(System) vtable +0x44 (c_str via FUN_0065ffb0)
void switchSetOwner(CWindowTaskTextSwitch* t, void* mediator);   // TODO(System) its IWindowTaskMediator (+0x340) slot 0
// TODO(System) FUN_005e99d0 setPos, FUN_005e9a00 setSize, then FUN_005d56d0 (keepSize) or FUN_005d5700 (refresh)
void switchPlace(CWindowTaskTextSwitch* t, float x, float y, float w, float h, bool keepSize);
const VcWString& textTable(int32_t id);                   // TODO(System) FUN_00858610()->vf1(id): the UI text table
CWindowTaskBackPlane* planeCreate(void* parent, void* mediator);   // TODO(System) FUN_005a6a60
void elemSetZ(void* e, float z);                          // TODO(System) CElement +0x78
void elemSetDepth(void* e, float z);                      // TODO(System) FUN_0091f930 on a foreign control (+0x34c, +0x78)
void modelInstallDefaultHandler(void* self);              // TODO(System) FUN_005df480(self, temp of vtable 0x00be8dd8 / FUN_005e7180)
void planeSetColor(CWindowTaskBackPlane* p, float r, float g, float b, float a);   // TODO(System) FUN_005a72e0
void planeSetSize(CWindowTaskBackPlane* p, float w, float h);   // TODO(System) +0x37c/+0x380, then vtable +0x34 (relayout)
// CWindowTaskControll / CWindowTaskModel (the window-part bases)
const VcString& skinDir();                                // TODO(System) *(DAT_0126fa8c)+0x1c: the window skin folder
void ctrlSetOwner(void* self, void* owner);               // TODO(System) CWindowTaskControll +0x344 (the IWindowTaskMediator told of clicks)
void ctrlNotifyOwner(void* self, int32_t slot);           // TODO(System) (*(self+0x344))->vf[slot](self+0x340)
void ctrlRelayout(void* self);                            // TODO(System) vtable +0x34 (CWindowTaskControll_vf13)
void modelActivate(void* self);                           // TODO(System) FUN_005df430 CWindowTaskModel default mediator call
void modelNotifyOwner(void* self, int32_t a, int32_t msg);   // TODO(System) (*(self+0x394))->vf0(self, a, msg)
void elemOnChildDestroyed(void* self, int32_t msg);       // TODO(System) FUN_005dea50 CElement::receive tail

// "@0%d" style formatting into a wide string (FUN_00605440 is swprintf into a std::wstring)
VcWString wformatInt(const char* fmt, int32_t v);

// Show/hide the way every part does it: setVisible(on, 1) plus the +0x20 bit 1 (hit-test off while hidden).
template <class T>
void showPart(T* e, bool on) {
    if (on) {
        elemSetDisabled(e, false);
        elemSetVisible(e, true);
    } else {
        elemSetVisible(e, false);
        elemSetDisabled(e, true);
    }
}

// Raw access to a base-class field at its exe offset (the base region is an opaque byte block here).
template <size_t N>
struct Opaque {
    uint8_t b[N];
    template <class T>
    T get(size_t off) const {
        T v;
        std::memcpy(&v, b + off, sizeof v);
        return v;
    }
    template <class T>
    void put(size_t off, T v) {
        std::memcpy(b + off, &v, sizeof v);
    }
};
// CElement / CWindowTaskControll offsets this part writes directly (inline accessors in the exe)
enum : size_t { EL_X = 0x70, EL_Y = 0x74, EL_Z = 0x78, EL_FLAG_C7 = 0xc7, CTRL_DEPTH = 0x34c, CTRL_FLAG_350 = 0x350 };

// ---------------------------------------------------------------- CWindowTaskDeckFigure (0x3b8)
struct CWindowTaskDeckFigure {
    Opaque<0x368> base;                // CWindowTaskControll
    TaskPtr<CSpriteElm> digit[4];      // 0x368 ones, tens, hundreds, and the left glyph (digit[3] shows glyph[3])
    float x, y;                        // 0x398 own position (vf13 copies it to the element)
    float w, h;                        // 0x3a0 256 x 256 (unused here)
    float alpha;                       // 0x3a8 copied to every digit
    uint8_t glyph[4];                  // 0x3ac 0..9, 10 = the "x" glyph after the digits
    int32_t style;                     // 0x3b0 0 = deck_font_01_c01, else _c02
    uint8_t _3b4[4];

    bool create();                     // FUN_00909590 vf4
    void updatePos();                  // FUN_0090a6e0 vf13
    void setNumber(uint32_t n);        // FUN_0090a710
    void show(bool on);                // FUN_0090a980
    void setPos(int32_t x, int32_t y, int32_t z);   // FUN_0090ab40
    bool onMouse(int32_t msg);         // FUN_0090ac50 vf14: left button -> owner slot 1
};
YO2_AT(CWindowTaskDeckFigure, digit, 0x368);
YO2_AT(CWindowTaskDeckFigure, x, 0x398);
YO2_AT(CWindowTaskDeckFigure, alpha, 0x3a8);
YO2_AT(CWindowTaskDeckFigure, glyph, 0x3ac);
YO2_AT(CWindowTaskDeckFigure, style, 0x3b0);
YO2_SIZEOF(CWindowTaskDeckFigure, 0x3b8);

// ---------------------------------------------------------------- CWindowTaskDeckBar (0x4b8)
enum DeckBarSprite {   // CWindowTaskDeckBar::spr[i] (0x368 + 0xc * i), named after their instance names
    DB_LT, DB_TOP, DB_RT,                                // the 88-pixel top band (deckbar_01 image)
    DB_LMIDBU, DB_MIDBOTTOMU, DB_RMIDBU,                 // kind 7, row 1 at y1: top edge,
    DB_LMIDBC, DB_MIDBOTTOMC, DB_RMIDBC,                 //   2x-high body,
    DB_LMIDBD, DB_MIDBOTTOMD, DB_RMIDBD,                 //   bottom edge (window_base_01 skin)
    DB_LBU, DB_BOTTOMU, DB_RBU,                          // kind 7, row 2 at y2, same three bands
    DB_LBC, DB_BOTTOMC, DB_RBC,
    DB_LBD, DB_BOTTOMD, DB_RBD,
    DB_TITLETOP, DB_TITLEMIDDLE,                         // 0x464, 0x470: deck_moji strips at labelX
    DB_TITLEMIDBOTTOM,                                   // 0x47c: kind 7's row-1 title
    DB_TITLEBOTTOM,                                      // 0x488: row 2's title (kind 7) / third strip (kind 8)
    DB_COUNT
};
struct CWindowTaskDeckBar {
    Opaque<0x368> base;                // CWindowTaskControll
    TaskPtr<CSpriteElm> spr[DB_COUNT]; // 0x368
    float x, y;                        // 0x494
    float width;                       // 0x49c
    float height;                      // 0x4a0
    float y1, y2;                      // 0x4a4 the two inner rows
    float labelX;                      // 0x4ac x of the title strips
    float alpha;                       // 0x4b0 (vf9 sets it)
    int32_t kind;                      // 0x4b4 skin 0..8 (window_base_01_cNN); 7 = deck bar, 8 = three-strip bar

    void construct();                  // FUN_0090ad70
    void destruct();                   // FUN_0090b350
    bool create();                     // FUN_0090b5a0 vf4
    void layout();                     // FUN_00911fe0 vf13
    void showRow1(bool on);            // FUN_009133d0 / FUN_009135e0
    void showRow2(bool on);            // FUN_009137f0 / FUN_00913a00
    void showTitle1(bool on);          // FUN_00913c10
    bool onMouse(int32_t msg);         // FUN_00913cb0 vf14
};
YO2_AT(CWindowTaskDeckBar, spr, 0x368);
YO2_AT(CWindowTaskDeckBar, x, 0x494);
YO2_AT(CWindowTaskDeckBar, width, 0x49c);
YO2_AT(CWindowTaskDeckBar, y1, 0x4a4);
YO2_AT(CWindowTaskDeckBar, labelX, 0x4ac);
YO2_AT(CWindowTaskDeckBar, kind, 0x4b4);
YO2_SIZEOF(CWindowTaskDeckBar, 0x4b8);
static_assert(DB_COUNT == 25, "25 sprites");

CWindowTaskDeckBar* deckBarNew(void* parent, void* owner, int32_t kind);   // FUN_0090aca0

// ---------------------------------------------------------------- CWindowTaskSwapIcon (0x3c8)
enum SwapState : int32_t { SWAP_NONE = 0, SWAP_TO_SIDE = 1, SWAP_TO_MAIN = 2 };
struct CWindowTaskSwapIcon {
    Opaque<0x368> base;                // CWindowTaskControll
    uint32_t mediatorVtbl;             // 0x368 IWindowTaskMediator (clicks of the two marks come here)
    TaskPtr<CSwfEngine> toMain;        // 0x36c change_mark02 "SwapIconToMain"
    TaskPtr<CSwfEngine> toSide;        // 0x378 change_mark01 "SwapIconToSide"
    TaskPtr<CWindowTaskText> number;   // 0x384 "SwapNumber"
    float x, y;                        // 0x390
    float w, h;                        // 0x398 256 x 256
    float iconX, iconY;                // 0x3a0 where the marks are (728, 400)
    float textDx, textDy;              // 0x3a8 the number's offset from the marks
    float alpha;                       // 0x3b0
    int32_t base_;                     // 0x3b4 the count the difference is taken from
    int32_t count;                     // 0x3b8
    int32_t diff;                      // 0x3bc |base - count| after setCount
    int32_t state;                     // 0x3c0 SwapState
    uint8_t _3c4[4];

    void construct();                  // FUN_00914210
    void destruct();                   // FUN_009144d0
    bool create();                     // FUN_00914560 vf4
    void updatePos();                  // FUN_00915850 vf13
    void setIconPos(float x, float y); // FUN_00915880
    void setCount(int32_t n);          // FUN_00915990
};
YO2_AT(CWindowTaskSwapIcon, mediatorVtbl, 0x368);
YO2_AT(CWindowTaskSwapIcon, toMain, 0x36c);
YO2_AT(CWindowTaskSwapIcon, number, 0x384);
YO2_AT(CWindowTaskSwapIcon, x, 0x390);
YO2_AT(CWindowTaskSwapIcon, iconX, 0x3a0);
YO2_AT(CWindowTaskSwapIcon, textDx, 0x3a8);
YO2_AT(CWindowTaskSwapIcon, alpha, 0x3b0);
YO2_AT(CWindowTaskSwapIcon, base_, 0x3b4);
YO2_AT(CWindowTaskSwapIcon, state, 0x3c0);
YO2_SIZEOF(CWindowTaskSwapIcon, 0x3c8);

CWindowTaskSwapIcon* swapIconNew(void* parent);   // FUN_00914150

// ---------------------------------------------------------------- CWindowTaskCardArea (0x4c8)
struct CWindowTaskCardArea {
    Opaque<0x398> base;                // CWindowTaskModel (IWindowTaskMediator at +0x340, owner at +0x394)
    TaskPtr<CSpriteElm> frame[14];     // 0x398 the area's frame pieces
    TaskPtr<CWindowTaskBackPlane> plane;   // 0x440
    TaskPtr<CWindowTaskTextSwitch> sw1;    // 0x44c
    TaskPtr<CWindowTaskTextSwitch> sw2;    // 0x458
    float x, y;                        // 0x464
    float w, h;                        // 0x46c
    float alpha;                       // 0x474 1.0
    int32_t mode;                      // 0x478 1 = the tall layout; 3/4 change sw1's message
    int32_t sel1, sel2;                // 0x47c -1
    VcWString text[4];                 // 0x484
    uint8_t _4c4[4];

    void construct();                  // FUN_00916a20
    void destruct();                   // FUN_00916f30
    bool create();                     // FUN_00917240 vf4
    void updatePos();                  // FUN_0091f960 vf9
    int32_t childDepth() const;        // FUN_00916e70 vf10: (long)(depth + 5)
    void onMediator0(void* sender);    // FUN_00917130 (mediator slot 0, `this` adjusted by -0x340)
    void setWide(bool wide);           // FUN_0091f990: x 480 or 768, the tall mode keeps four rows
    void setSwitch1(bool on);          // FUN_0091ffd0
    void setSwitch2(bool on);          // FUN_00920000
    void showSwitch1(bool on);         // FUN_00920030
    void setPlaneDefault();            // FUN_009200a0 (1, 1, 1, 0.7)
    void setPlaneColor(float r, float g, float b, float a);   // FUN_009200e0
};
YO2_AT(CWindowTaskCardArea, frame, 0x398);
YO2_AT(CWindowTaskCardArea, plane, 0x440);
YO2_AT(CWindowTaskCardArea, sw2, 0x458);
YO2_AT(CWindowTaskCardArea, x, 0x464);
YO2_AT(CWindowTaskCardArea, alpha, 0x474);
YO2_AT(CWindowTaskCardArea, mode, 0x478);
YO2_AT(CWindowTaskCardArea, sel1, 0x47c);
YO2_AT(CWindowTaskCardArea, text, 0x484);
YO2_SIZEOF(CWindowTaskCardArea, 0x4c8);

CWindowTaskCardArea* cardAreaNew(void* parent, int32_t mode);   // FUN_00916920

// ---------------------------------------------------------------- CSortList / CSortBase
// CSortBase: 0x10 bytes {vtbl, key, value, extra(-1)}. CSortList: {vtbl, vector<CSortBase>}: a small id -> count
// table; counts stay in 0..255.
struct CSortBase {
    uint32_t vtbl;
    int32_t key;       // 0x4
    int32_t value;     // 0x8
    int32_t extra;     // 0xc -1
};
YO2_AT(CSortBase, value, 0x8);
YO2_SIZEOF(CSortBase, 0x10);

struct CSortList {
    uint32_t vtbl;
    VcVector<CSortBase> items;   // 0x4 (allocator byte at 0x4, first 0x8, last 0xc, end 0x10)

    void construct();                                    // FUN_00913d00
    void destruct();                                     // FUN_00914040
    CSortBase* find(int32_t key);                        // FUN_00913e00
    void add(int32_t key, int32_t value);                // FUN_00913e80 push_back {key, value, -1}
    bool increase(int32_t key, int32_t by, int32_t* out);   // FUN_00913f60 refused when the result >= 0x100
    bool decrease(int32_t key, int32_t by, int32_t* out);   // FUN_00913fd0 refused when the result < 0
};
YO2_AT(CSortList, items, 0x4);
YO2_SIZEOF(CSortList, 0x14);

// vector<CSortBase> internals the exe instantiates in this file
void sortVecInsert(VcVector<CSortBase>& v, CSortBase* pos, uint32_t n, const CSortBase& val);   // FUN_00920250
void sortVecTidy(VcVector<CSortBase>& v);               // FUN_009201b0

// Inline methods of System classes the compiler emitted in this file (they act on raw objects).
void elemMarkC7(uint8_t* elem);                          // FUN_0091f8f0 +0xc7 = 1
void ctrlMark350(uint8_t* ctrl);                         // FUN_0091f910 +0x350 = 1
void ctrlSetDepth(uint8_t* ctrl, float z);               // FUN_0091f930 +0x34c and +0x78

}   // namespace dk
