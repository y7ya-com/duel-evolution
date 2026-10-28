// yo2DeckUtil.cpp (0x00920b00..0x00934720): the small deck-editor widgets the Deck scene builds on:
//   CWindowModelInputValue   the "enter a value" dialog (two inputs, two switches, a listbox), tab order
//   CWindowTaskStructureIcon the 32x16 pack/deck icon in front of a file-list row (+ a "new" badge)
//   CWindowModelFileList     the deck-file / card-pack list window (listbox + icons + yes/no switches)
// plus the CDeckCardLoader / CDeckCardPicture accessors Ghidra missed (CWindowTaskBase.cpp's code sits here) and
// this TU's copies of the DeckTables.h string tables.
//
// Stand-ins are layout-true: the CElement / CWindowTaskControll / CWindowTaskModel regions are opaque bytes except
// the few base fields this code touches directly (named in ElemFields), pinned with YO2_AT.
#pragma once
#include "deck_a_externs.h"

namespace dk {

struct CWindowTaskInput;
struct CWindowTaskFrameBottomThick;
struct CWindowTaskScroll;

// ---------------------------------------------------------------- CElement fields written inline by the exe
// Every drawable (CElement, size 0x340) as the Deck code touches it directly.
struct ElemFields {
    uint32_t vtbl;          // 0x000
    uint8_t _004[0x20 - 0x4];
    uint32_t taskFlags;     // 0x020 CTask flags; bit 1 (TF_NOHIT) = skip input/draw while hidden
    uint8_t _024[0x70 - 0x24];
    float x, y, z;          // 0x070 position in the parent
    uint8_t _07c[0x88 - 0x7c];
    int32_t w, h;           // 0x088 CSpriteElm draw size
    uint8_t _090[0x94 - 0x90];
    int32_t src[4];         // 0x094 CSpriteElm source rect {x, y, w, h} in the texture
    float color[4];         // 0x0a4 CSpriteElm colour; [3] (0xb0) is the alpha
    uint8_t _0b4[0xc7 - 0xb4];
    uint8_t dirty;          // 0x0c7 "geometry changed": recompute before the next draw
    uint8_t _0c8[0x340 - 0xc8];
};
YO2_AT(ElemFields, taskFlags, 0x20);
YO2_AT(ElemFields, x, 0x70);
YO2_AT(ElemFields, w, 0x88);
YO2_AT(ElemFields, src, 0x94);
YO2_AT(ElemFields, color, 0xa4);
YO2_AT(ElemFields, dirty, 0xc7);
YO2_SIZEOF(ElemFields, 0x340);
enum : uint32_t { TF_NOHIT = 2 };
inline ElemFields* fields(void* e) { return static_cast<ElemFields*>(e); }

// CWindowTaskControll (0x368): an input widget; the byte at +0x350 enables it.
inline void ctlSetEnabled(void* ctl, bool on) { static_cast<uint8_t*>(ctl)[0x350] = on; }
// The exe's dynamic_cast<CWindowTaskControll*> of a child = the child + 0x340 (its IWindowTaskColleague base);
// mediators compare the colleague they are handed with these.
inline const void* colleagueOf(const void* ctl) { return ctl ? static_cast<const uint8_t*>(ctl) + 0x340 : nullptr; }

// ---------------------------------------------------------------- externs (System / yaneSDK / other parts)
// TODO(System) FUN_0061f030 CSpriteElm::create(parent, prio, path): new 0x5088-byte sprite, load path, link it
CSpriteElm* spriteCreate(void* parent, int32_t prio, const VcString& path);
void elemSetBlend(void* elem, int32_t mode);             // TODO(System) FUN_0060dc20 CElement::setBlendMode
void elemShow(void* elem, bool on, bool notify);         // TODO(System) FUN_0060e170 CElement::show
void modelBaseInit(void* model);                         // TODO(System) FUN_005ded60 CWindowTaskModel ctor
void modelBaseDestroy(void* model);                      // TODO(System) FUN_005def50 CWindowTaskModel dtor
void ctlBaseInit(void* ctl);                             // TODO(System) FUN_005de6b0 CWindowTaskControll ctor
void ctlBaseDestroy(void* ctl);                          // TODO(System) FUN_005de7e0 CWindowTaskControll dtor
bool modelIsTop(void* model);                            // TODO(System) FUN_005df450 the topmost model?
void modelOnClose(void* model);                          // TODO(System) FUN_005df430 (FUN_005e2140(model, 0)): on a colleague event
void ctlSetAlpha(void* ctl, float a);  // 0x00595010 TODO(System) CWindowTaskControll vf 9 (0x24); Listbox 0x005b26f0
void ctlLayout(void* ctl);  // 0x005c1250 (FramePlane; Input 0x005c34d0); TODO(System) CWindowTaskControll vf 13 (0x34)
void focusSet(void* colleague);                          // TODO(System) FUN_005e2cb0 the focus group's setFocus
// CWindowTaskListbox (yo2WindowTaskListbox.cpp)
void listboxAdd(CWindowTaskListbox* lb, const uint16_t* text);   // TODO(System) FUN_005b3ca0 add a row
void listboxRemove(CWindowTaskListbox* lb, int32_t row);         // TODO(System) FUN_005b3f40
void listboxClear(CWindowTaskListbox* lb);                       // TODO(System) FUN_005b40d0
void listboxRefresh(CWindowTaskListbox* lb);                     // 0x005b2820 TODO(System) CWindowTaskListbox vf 0x5c
void listboxSetEnabled(CWindowTaskListbox* lb, bool on);         // 0x005b2680 TODO(System) CWindowTaskListbox vf 0x58
int32_t listboxCount(CWindowTaskListbox* lb);                    // 0x005b2840 TODO(System) CWindowTaskListbox vf 0x64
int32_t listboxMode(CWindowTaskListbox* lb);  // inline in the exe (in 0x00933380) TODO(System) listbox +0x3fc
int32_t listboxCursor(CWindowTaskListbox* lb);  // inline in the exe (in 0x00933380) TODO(System) listbox +0x3c0
int32_t listboxScrollTop(CWindowTaskListbox* lb);  // inline in the exe (in 0x00933110) TODO(System) +0x37c's +0x478
void textSetAlign(CWindowTaskText* t, int32_t v);                // TODO(System) FUN_005af8a0 (CTextElm +0x74c)
void textSetLineHeight(CWindowTaskText* t, int32_t v);           // TODO(System) FUN_005af600
void textSetFontSize(CWindowTaskText* t, int32_t v);             // TODO(System) FUN_005af590
void textSetPos(CWindowTaskText* t, float x, float y);           // TODO(System) FUN_005baeb0 (+0x374/+0x378, z = +0x37c)
void textSetArea(CWindowTaskText* t, int32_t w, int32_t h);      // TODO(System) FUN_005af690
void textSetColor(CWindowTaskText* t, float r, float g, float b, float a);   // TODO(System) FUN_005af650
void ctlSetText(void* ctl, const uint16_t* s);  // 0x005af000 TODO(System) vf 0x44 (Text; TextSwitch 0x005ba170)
void ctlHide(void* ctl);                                         // TODO(System) FUN_005d5700 show(0) + TF_NOHIT
void ctlShow(void* ctl);                                         // TODO(System) FUN_005d56d0 clear TF_NOHIT + show(1)
// child widgets (System): create(parent, mediator[, style])
CWindowTaskFramePlane* framePlaneCreate(void* parent, void* mediator, int32_t style);   // TODO(System) FUN_005bec90
CWindowTaskText* textCreate(void* parent, void* mediator);                             // TODO(System) FUN_005aea60
CWindowTaskInput* inputCreate(void* parent, void* mediator, int32_t style);            // TODO(System) FUN_005c1690
CWindowTaskTextSwitch* textSwitchCreate(void* parent, void* mediator);                 // TODO(System) FUN_005b9f40
CWindowTaskListbox* listboxCreate(void* parent, void* mediator, int32_t style);         // TODO(System) FUN_005b22f0
void inputSetPos(CWindowTaskInput* in, float x, float y);        // TODO(System) FUN_005ec200
void inputSetSize(CWindowTaskInput* in, float w, float h);       // TODO(System) FUN_005ec1d0
void listboxSetPos(CWindowTaskListbox* lb, float x, float y);    // TODO(System) FUN_005ef1f0
void listboxSetSize(CWindowTaskListbox* lb, float w, float rowH);   // TODO(System) FUN_005ef240
void switchSetPos(CWindowTaskTextSwitch* s, float x, float y);   // TODO(System) FUN_005e99d0
void switchSetSize(CWindowTaskTextSwitch* s, float w, float h);  // TODO(System) FUN_005e9a00
void switchSetFontSize(CWindowTaskTextSwitch* s, int32_t v);     // TODO(System) FUN_005e9a30 on its +0x5a4 shadow text
VcWString msgText(int32_t id);  // 0x0061fb80 TODO(System) DAT_01271840 vf 1: the message table
// TODO(System) FUN_005ff910 + FUN_005df480: give the model a key handler (a member callback to FUN_005e0620 on obj)
void modelSetKeyHandler(void* model, void* obj);
void textFieldSetText(CWindowTaskTextField* f, const uint16_t* s);   // 0x005b0420 TODO(System) TextField vf 0x44
// the mediator interface the models notify (IWindowTaskMediator vf 0 at mediator->vtbl[0])
void mediatorNotify(void* mediator, void* sender, int32_t what, int32_t arg);   // 0x005ff8a0 TODO(System) slot 0
void mediatorSelect(void* mediator, void* colleague);  // 0x00933380 CWindowModelFileList; TODO(System) slot 0 (1 arg)
// the card database (yo2CardDB.cpp)
uint32_t cardInternalId(int32_t index);                  // TODO(System) FUN_0073bc50 table[i].word & 0x3fff
uint32_t cardFrameType(uint32_t id);                     // TODO(System) FUN_0073c010 (card_prop word >> 1) & 0x1f
// files
size_t mbToWide(const char* s, uint16_t* out, size_t n); // TODO(System) FUN_006054c0 mbstowcs
// TODO(System) FUN_0044b440..FUN_0044bae0 the directory iterator over <deck dir>\*.ydc: calls fn(name) per file
void dirForEach(const char* pattern, void (*fn)(void* ctx, const char* name), void* ctx);
const char* deckDir();                                   // TODO(System) FUN_00618600 the app's deck folder
bool fileStat(const char* path);                         // TODO(System) FUN_00b0bdc8 _stat() != -1
// the pack catalogue (DAT_012b28c4 is the file manager; the catalogue is passed in)
void fileMgrSetDir(const char* dir);                     // 0x00906440 CDeckManager; TODO(System) DAT_012b28c4 vf 1
bool fileMgrExists(const VcString& name);                // 0x00906fb0 CDeckManager; TODO(System) DAT_012b28c4 vf 0xd8
// CDeckCardPicture (CWindowTaskBase.cpp, System): the per-card thumbnail record
struct CDeckCardPicture;
void cardPictureLoad(CDeckCardPicture* p, void* parent, int32_t prio);   // TODO(System) FUN_00921e60
void cardPictureShow(CDeckCardPicture* p, bool on);                      // TODO(System) FUN_00921df0
void cardPictureSetBlend(CDeckCardPicture* p, int32_t mode);             // TODO(System) FUN_009222f0
void cardPictureSetScale(CDeckCardPicture* p, int32_t a, int32_t b, int32_t c);   // TODO(System) FUN_00922340

// ---------------------------------------------------------------- pure helpers (tested)
// 0x00933590: the frame colour of a card's structure icon from its card_prop type ((word >> 1) & 0x1f; YOLaucher's
// cards_yo2.csv "kind" is that field << 1 | 1 for monsters): 0 normal/token, 1 effect-like, 2 ritual, 3 fusion,
// 4 spell, 5 trap.
int32_t structureFrameOfType(uint32_t type);
// 0x00932890's core: the file name between the last '\\' or '/' and the last '.', Shift-JIS aware (a lead byte
// skips its trail byte). Returns the stem's start (0 = no separator or no dot, `out` untouched).
size_t pathStem(const VcString& path, VcString* out);
size_t deckFileStem(VcString* s);   // 0x00932890: pathStem in place (a std::string member in the exe)
// 0x00933110's core: which of n rows show in an 8-row window starting at `top`, and their y (40 + 16 * k).
inline bool fileRowVisible(int32_t row, int32_t top) { return row >= top && row < top + 8; }
// 0x00927d40: the icon's source rect in data/deck/icon_deck_01.png per kind (0-3; others use kind 0's).
void structureIconSrc(uint32_t kind, int32_t out[4]);
// 0x009274f0 / 0x00927650: the dialog's tab order over its four inputs (0x3bc, 0x3c8, 0x3d4, 0x3e0).
int32_t inputValueNext(int32_t i);   // 0 -> 1 -> 2 -> 3 -> 0
int32_t inputValuePrev(int32_t i);   // 0 -> 3 -> 2 -> 1 -> 0

// ---------------------------------------------------------------- CDeckCardPicture / CDeckCardLoader
// CDeckCardPicture (0x28): one card thumbnail ("data/MINI/<id>"), loaded on first use.
struct CDeckCardPicture {
    uint32_t vtbl;          // 0x00
    CSpriteElm* sprite;     // 0x04
    int32_t cardId;         // 0x08
    uint8_t loaded;         // 0x0c
    uint8_t shown;          // 0x0d
    uint8_t _0e[2];
    uint32_t a, b;          // 0x10
    float f18;              // 0x18 2.0
    float w, h;             // 0x1c 256 x 256
    float scale;            // 0x24 1.0

    void construct();                                    // 0x00921d50
    void setPos(int32_t x, int32_t y, int32_t z);        // 0x00922190
    void setColor(float r, float g, float b, float a);   // 0x009221c0
    void setSrc(const int32_t rect[4]);                  // 0x00922210
    void getSrc(int32_t rect[4]) const;                  // 0x00922260
    void setSize(int32_t w, int32_t h);                  // 0x009222b0
    CSpriteElm* getSprite() const { return sprite; }     // 0x009223d0
};
YO2_AT(CDeckCardPicture, cardId, 0x08);
YO2_AT(CDeckCardPicture, loaded, 0x0c);
YO2_AT(CDeckCardPicture, scale, 0x24);
YO2_SIZEOF(CDeckCardPicture, 0x28);

enum : int { DECK_CARD_PICTURES = 0xcb8 };   // one per card of the 2008 client (3256)

// CDeckCardLoader (0x200c8, a CWindowTaskModel): the thumbnail cache of the deck editor.
struct CDeckCardLoader {
    uint8_t base[0x398];                 // CWindowTaskModel
    uint8_t _398[0x3bc - 0x398];
    CDeckCardPicture pic[DECK_CARD_PICTURES];   // 0x3bc
    uint8_t _tail[0x200c8 - 0x2007c];

    bool request(int32_t prio, int32_t i);                       // 0x00922a20 load + show; false if already shown
    void release(int32_t i);                                     // 0x00922ab0 hide
    void hideAll();                                              // 0x00922af0
    void setPos(int32_t x, int32_t y, int32_t z, int32_t i);     // 0x00922b20
    void setColor(float r, float g, float b, float a, int32_t i);   // 0x00922b60
    void setSrc(const int32_t rect[4], int32_t i);               // 0x00922ba0 (the rect by value)
    void getSrc(int32_t rect[4], int32_t i) const;               // 0x00922bf0
    void setSize(int32_t w, int32_t h, int32_t i);               // 0x00922c20
    void setBlend(int32_t mode, int32_t i);                      // 0x00922c50
    void setScale(int32_t a, int32_t b, int32_t c, int32_t i);   // 0x00922c80
};
YO2_AT(CDeckCardLoader, pic, 0x3bc);
YO2_SIZEOF(CDeckCardLoader, 0x200c8);

// ---------------------------------------------------------------- CWindowModelInputValue (0x448)
struct CWindowModelInputValue {
    uint8_t base[0x340];                 // CElement part of CWindowTaskModel
    uint32_t mediatorVtbl;               // 0x340 IWindowTaskMediator
    uint8_t _344[0x34c - 0x344];
    float mz;                            // 0x34c CWindowTaskModel depth
    uint8_t active;                      // 0x350
    uint8_t _351[0x380 - 0x351];
    float mx, my;                        // 0x380 CWindowTaskModel position
    float mw, mh;                        // 0x388 size
    uint8_t _390[0x398 - 0x390];
    TaskPtr<CWindowTaskFramePlane> frame;   // 0x398
    TaskPtr<CWindowTaskText> text1;      // 0x3a4
    TaskPtr<CWindowTaskText> text2;      // 0x3b0
    TaskPtr<CWindowTaskInput> input[2];  // 0x3bc
    TaskPtr<CWindowTaskTextSwitch> sw[2];   // 0x3d4
    TaskPtr<CWindowTaskListbox> list;    // 0x3ec
    int32_t style;                       // 0x3f8 passed to the frame and inputs
    int32_t kind;                        // 0x3fc 0/1 two numbers (texts 4166/4167), 2 one value (4024), 3 a name (9008)
    uint8_t keyHook[0x448 - 0x400];      // 0x400 the key-handler callback's object (TODO(System) its layout)

    void setSize(float w, float h);                     // 0x00927330
    void layout();                                      // 0x00927360 vf 9
    void refreshList();                                 // 0x009273b0
    void addRow(const uint16_t* text);                  // 0x009273e0 (island)
    void setEnabled(bool on);                           // 0x00927420
    void focusNext(const void* colleague);              // 0x009274f0 mediator slot 2: Tab
    void focusPrev(const void* colleague);              // 0x00927650 mediator slot 3: Shift+Tab
    void* tabTarget(int32_t i) const;
    bool build();                                       // 0x00923ec0 vf 4 (DeckUtilBuild.cpp)
};
YO2_AT(CWindowModelInputValue, mz, 0x34c);
YO2_AT(CWindowModelInputValue, active, 0x350);
YO2_AT(CWindowModelInputValue, mx, 0x380);
YO2_AT(CWindowModelInputValue, mw, 0x388);
YO2_AT(CWindowModelInputValue, frame, 0x398);
YO2_AT(CWindowModelInputValue, input, 0x3bc);
YO2_AT(CWindowModelInputValue, sw, 0x3d4);
YO2_AT(CWindowModelInputValue, list, 0x3ec);
YO2_AT(CWindowModelInputValue, kind, 0x3fc);
YO2_AT(CWindowModelInputValue, keyHook, 0x400);
YO2_SIZEOF(CWindowModelInputValue, 0x448);

// ---------------------------------------------------------------- CWindowTaskStructureIcon (0x3b0)
struct CWindowTaskStructureIcon {
    uint8_t base[0x344];                 // CWindowTaskControll (vtbl 0, colleague vtbl 0x340)
    void* mediator;                      // 0x344 told when the icon is clicked
    uint8_t _348[0x368 - 0x348];
    TaskPtr<CSpriteElm> icon;            // 0x368 "picIcon"
    TaskPtr<CSpriteElm> badge;           // 0x374 "picNewIcon"
    float x1, y1;                        // 0x380 the icon
    float w1, h1;                        // 0x388 32 x 16
    float x2, y2;                        // 0x390 the badge
    float w2, h2;                        // 0x398 32 x 16
    float z;                             // 0x3a0
    float alpha;                         // 0x3a4 1.0
    uint32_t kind;                       // 0x3a8 0-3, picks the icon's source rect
    uint8_t ready;                       // 0x3ac
    uint8_t enabled;                     // 0x3ad
    uint8_t isNew;                       // 0x3ae shows the badge
    uint8_t _3af;

    void construct();                    // 0x009278a0
    void destruct();                     // 0x00927af0
    static uint32_t typeId() { return 0x17; }   // 0x00927aa0 vf 12
    bool init();                         // 0x00927b70 vf 4
    bool onMain() { return true; }       // 0x00927c10 vf 5
    void place();                        // 0x00927c30 vf 13: move both sprites
    void create(uint32_t kind);          // 0x00927d40
    void destroySprites();               // 0x00928c60
    void setNew(bool on);                // 0x00928ce0
    void onClick();                      // 0x00928d70 vf 19: tell the mediator
    static bool hitTest(float, float) { return false; }   // 0x00928db0 vf 15
    static bool onInput() { return false; }               // 0x00928dd0 vf 14
    void setBadgeSize(float w, float h); // 0x009322b0
    void setZ(float v);                  // 0x009322e0
};
YO2_AT(CWindowTaskStructureIcon, mediator, 0x344);
YO2_AT(CWindowTaskStructureIcon, icon, 0x368);
YO2_AT(CWindowTaskStructureIcon, x1, 0x380);
YO2_AT(CWindowTaskStructureIcon, z, 0x3a0);
YO2_AT(CWindowTaskStructureIcon, kind, 0x3a8);
YO2_AT(CWindowTaskStructureIcon, isNew, 0x3ae);
YO2_SIZEOF(CWindowTaskStructureIcon, 0x3b0);

CWindowTaskStructureIcon* structureIconNew(void* parent, void* mediator);   // 0x009277e0

// ---------------------------------------------------------------- the card-pack catalogue
// One pack of the shop/pack list (0x6c). Owned by the pack code (part B / System); read here.
struct PackEntry {
    uint32_t _00;
    int32_t type;           // 0x04 1 = booster, 4 = structure deck (picks the icon kind)
    uint8_t _08[0x18 - 0x08];
    VcString name;          // 0x18 shown in the list
    uint8_t _28[0x58 - 0x28];
    VcString image;         // 0x58 its file in data\cardpack (exists = the "owned" icon variant)
    int32_t id;             // 0x68

    VcString copyName() const { return name; }   // 0x00932f90
};
YO2_AT(PackEntry, type, 0x04);
YO2_AT(PackEntry, name, 0x18);
YO2_AT(PackEntry, image, 0x58);
YO2_AT(PackEntry, id, 0x68);
YO2_SIZEOF(PackEntry, 0x6c);

struct PackCatalogue {
    uint8_t newIds[0x20];   // 0x00 std::map<int, int> of pack ids flagged new (TODO(Deck B) its layout)
    VcVector<PackEntry> packs;   // 0x20
};
YO2_AT(PackCatalogue, packs, 0x20);
bool packIsNew(const PackCatalogue* c, int32_t id);   // TODO(Deck A) FUN_009845d0 (part B) map lookup == 1

// ---------------------------------------------------------------- CWindowModelFileList (0x530)
enum : int32_t { FILELIST_DECKS = 0, FILELIST_PACKS = 1, FILELIST_OTHER = 2 };

struct CWindowModelFileList {
    uint8_t base[0x340];                 // CElement part of CWindowTaskModel
    uint32_t mediatorVtbl;               // 0x340
    uint8_t _344[0x34c - 0x344];
    float mz;                            // 0x34c
    uint8_t _350[0x37c - 0x350];
    float z;                             // 0x37c
    float mx, my;                        // 0x380
    float mw, mh;                        // 0x388 window size
    uint32_t _390;
    void* owner;                         // 0x394 the mediator told about picks (vtbl[0](this, what, arg))
    TaskPtr<CWindowTaskFrameBottomThick> frame;   // 0x398
    TaskPtr<CWindowTaskListbox> list;    // 0x3a4
    TaskPtr<CSpriteElm> deco[18];        // 0x3b0 frame corners / edges
    TaskPtr<CWindowTaskTextField> field; // 0x488
    TaskPtr<CWindowTaskTextSwitch> sw[4];   // 0x494 sort / ok / cancel switches
    TaskPtr<CWindowTaskText> title;      // 0x4c4
    VcVector<CWindowTaskStructureIcon*> icons;   // 0x4d0 one per pack row
    int32_t sel1, sel2;                  // 0x4e0 -1
    VcWString s4e8;                      // 0x4e8
    VcWString s4f8;                      // 0x4f8
    VcVector<uint32_t> v508;             // 0x508
    VcWString s518;                      // 0x518
    float fade;                          // 0x528 0.8
    int32_t mode;                        // 0x52c FILELIST_*

    void construct();                    // 0x00928f60
    void destruct();                     // 0x009296e0
    uint32_t init();                     // 0x009299f0 vf 4: build the window (DeckUtilFileList.cpp)
    void setup(void* parent, float x, float y, int32_t mode);   // 0x00928ef0
    static bool onMain() { return true; }    // 0x00929550 vf 5
    void moveTo(float x, float y);       // 0x00929570 vf 21
    void relayout();                     // 0x00929600 vf 8
    int32_t heightPlus6() const;         // 0x00929620 vf 10
    void onColleague1(void*);            // 0x00929650 mediator slot 1: close
    void onColleague2(void*) {}          // 0x00929670 mediator slot 2: nothing
    void onColleague3(void*) {}          // 0x00929690 mediator slot 3: nothing
    void addRow(const uint16_t* text);   // 0x00932370
    void removeRow(int32_t row);         // 0x009323b0
    void clearRows();                    // 0x009323f0
    int32_t rowCount();                  // 0x00932420 (island)
    void refreshList();                  // 0x00932450
    void place();                        // 0x00932340 vf 9
    void listDeckFiles();                // 0x00932480
    void fillPacks(const PackCatalogue* cat);   // 0x00932a50
    void layoutIcons();                  // 0x00933110
    void setFieldText(const char* s);    // 0x00933240
    void setEnabled(bool on);            // 0x009332b0
    void setListAlpha(float a);          // 0x00933350
    void onColleague(const void* sender);   // 0x00933380 mediator slot 0
};
YO2_AT(CWindowModelFileList, mz, 0x34c);
YO2_AT(CWindowModelFileList, z, 0x37c);
YO2_AT(CWindowModelFileList, mx, 0x380);
YO2_AT(CWindowModelFileList, mw, 0x388);
YO2_AT(CWindowModelFileList, owner, 0x394);
YO2_AT(CWindowModelFileList, frame, 0x398);
YO2_AT(CWindowModelFileList, list, 0x3a4);
YO2_AT(CWindowModelFileList, field, 0x488);
YO2_AT(CWindowModelFileList, sw, 0x494);
YO2_AT(CWindowModelFileList, title, 0x4c4);
YO2_AT(CWindowModelFileList, icons, 0x4d0);
YO2_AT(CWindowModelFileList, sel1, 0x4e0);
YO2_AT(CWindowModelFileList, s4e8, 0x4e8);
YO2_AT(CWindowModelFileList, v508, 0x508);
YO2_AT(CWindowModelFileList, fade, 0x528);
YO2_AT(CWindowModelFileList, mode, 0x52c);
YO2_SIZEOF(CWindowModelFileList, 0x530);

// ---- what the file-list builder (0x009299f0, DeckUtilFileList.cpp) calls besides the externs above
VcString skinPath(const char* file);   // TODO(System) FUN_005a2510(DAT_0126fa8c) + FUN_00429430: <skin dir> + file
// TODO(System) FUN_005a3350 CWindowTaskFrameBottomThick::create(parent, mediator, style)
CWindowTaskFrameBottomThick* frameThickCreate(void* parent, void* mediator, int32_t style);
// TODO(System) inline in the exe: +0x410/+0x414 = (x, y) (copied to +0x70/+0x74), +0x418/+0x41c = size, relayout
// (vf 13), then +0x420 = the bottom band's height, relayout again
void frameThickPlace(CWindowTaskFrameBottomThick* f, float x, float y, float w, float h, float bottom); // in 0x009299f0
// TODO(System) inline: +0x3ac/+0x3b0 = (x, y) (float copies at +0x70/+0x74), +0x3b8 = h, +0x3b4 = w (when it
// changes, FUN_005b4d80 re-measures the rows), relayout (vf 13)
void listboxPlace(CWindowTaskListbox* lb, int32_t x, int32_t y, int32_t w, int32_t h);
void listboxSetZ(CWindowTaskListbox* lb, float z);  // inline in the exe (in 0x009299f0) TODO(System) +0x3bc and +0x78
void listboxSetTextAlign(CWindowTaskListbox* lb, int32_t v);        // TODO(System) FUN_005af8a0 on its +0x384 text
// TODO(System) inline +0x3f8 = on, then FUN_005af870(on) on its +0x384 text (CTextElm +0x51c)
void listboxSetMarks(CWindowTaskListbox* lb, bool on);
void frameSetZ(CWindowTaskFrameBottomThick* f, float z);  // inline in the exe (in 0x009299f0) TODO(System) +0x34c/+0x78
CWindowTaskTextField* textFieldCreate(void* parent, void* mediator);   // TODO(System) FUN_005b01a0
void ctlSetColor(void* ctl, float r, float g, float b, float a);   // TODO(System) FUN_005e5630
void ctlSetMediator(void* ctl, void* mediator);   // 0x00594ff0 TODO(System) the colleague (+0x340) slot 0: who it tells
void textSetFont(CWindowTaskText* t, const void* font);   // 0x005af350 TODO(System) vf 0x4c (DAT_00d4509c: default)
void textResetClip(CWindowTaskText* t);           // TODO(System) FUN_005af930(0): +0x430 = its own +0x434 buffer
int32_t textWidth(CWindowTaskText* t);            // TODO(System) FUN_005af6e0 the drawn width in pixels
// TODO(System) FUN_00801db0 CWindowTaskTextSwitch's rect {x, y, w, h} (+0x3d4..+0x3e0)
void switchGetRect(CWindowTaskTextSwitch* s, float* x, float* y, float* w, float* h);
// The CWindowTaskControll inlines this TU instantiates (one copy each; CWindowTaskStructureIcon's setBadgeSize /
// setZ / textSetFromTask are the same code): +0x398/+0x39c size, +0x3a0 z, relayout; text align of +0x384.
void ctlSetSize(void* ctl, float w, float h);     // = 0x009322b0
void ctlSetZ(void* ctl, float z);                 // = 0x009322e0
// = 0x00932310 (textSetFromTask on the control's +0x384 TaskPtr<CWindowTaskText>); System-side here because that
// member is opaque in the stand-ins. TODO(System)
void ctlSetTextAlign(void* ctl, int32_t v);

// The file list's nine-slice frame: 18 8x8 tiles of <skin>/window_base_01_c01.png (deco[i]).
struct FileListTile {
    const char* name;
    int16_t sx, sy;    // source rect origin (8 x 8)
    int8_t col;        // 0 = x 0, 1 = x 8 stretched to the width - 16, 2 = x width - 8
    int16_t y;
    bool tall;         // drawn 3x high (the 24-pixel title band)
};
extern const FileListTile kFileListTiles[18];

// 0x00928e10: new + setup + CTask::create at priority 10000.
CWindowModelFileList* fileListNew(void* parent, float x, float y, int32_t mode);

// Small helpers of other System classes that yo2DeckUtil.cpp instantiates (the exe inlined them into this TU).
inline void taskAddFlags(void* t, uint32_t bits) { fields(t)->taskFlags |= bits; }   // 0x00932230
void modelSetZ(void* model, float z);                       // 0x00932250 (CWindowTaskModel +0x37c and +0x78)
void modelSetPos2(void* model, float x, float y);           // 0x00932280 (+0x390/+0x394 and +0x70/+0x74)
void textSetFromTask(TaskPtr<CWindowTaskText>* p, int32_t v);   // 0x00932310
bool textPtrEmpty(const TaskPtr<CWindowTaskText>* p);       // 0x00933630 dynamic_cast == null
bool textFieldPtrEmpty(const TaskPtr<CWindowTaskTextField>* p);   // 0x00933660
void vectorFreeIcons(VcVector<CWindowTaskStructureIcon*>* v);   // 0x009338c0
void vectorInsertIcons(VcVector<CWindowTaskStructureIcon*>* v, size_t pos, size_t n,
                       CWindowTaskStructureIcon* const& val);   // 0x00933920

}   // namespace dk
