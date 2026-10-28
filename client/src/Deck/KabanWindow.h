// yo2KabanWindow.cpp, first half (0x00955850..0x009660c0): the small windows around the trunk ("kaban", the card
// box the player builds decks from):
//   CWindowTaskKabanNumber  the "N cards" counter; clicking it shows every card again (filter mode 6)
//   CWindowTaskKabanOrder   six card-type tabs (Normal, Effect, Magic, Trap, Ritual, Fusion)
//   CWindowTaskKabanSearch  nine search buttons; each opens a dialog (ATK/DEF range, type, attribute, spell icon,
//                           name, text, level, limit) whose answer becomes a CWindowTaskKaban search (FUN_009716e0)
//   CWindowTaskKabanCard    one card picture (data/MINI/<card>.png)
//   CKabanListLayout        where each card-info item sits in a trunk list row
// The trunk list itself (CWindowTaskKaban*, CWindowModelKaban) is yo2KabanWindow.cpp's second half (KabanWindowList).
//
// Stand-ins: the CElement / CWindowTaskControll regions are views with only the fields this code touches (kbn::).
#pragma once
#include "deck_a_externs.h"

namespace dk {

struct CWindowModelListCardType;
struct CWindowModelListCardAttr;
struct CWindowModelListCardStar;
struct CWindowModelListCardForbi;
struct CWindowTaskInput;
struct CWindowTaskKabanListBtn;

// ---------------------------------------------------------------- externs (System)
CSwfEngine* swfCreate(void* parent, const char* file);         // TODO(System) FUN_0066d7a0(parent, 0, file, 1)
void swfSetButtonMode(CSwfEngine* s, bool on);                 // TODO(System) FUN_0066e390 (+0x3ef)
void swfSetEnabled(CSwfEngine* s, bool on);                    // TODO(System) FUN_0066e2f0 (+0x3f0, repaints)
void swfSetListener(CSwfEngine* s, void* task);                // TODO(System) FUN_005ddd70 its CTaskPtr<CTask>::set
bool swfEventIs(const void* msg, const char* objName);         // TODO(System) FUN_006654c0 CTmSwfObjEvent name ==
void controllConstruct(void* self);                            // TODO(System) FUN_005de6b0 CWindowTaskControll ctor
void controllDestruct(void* self);                             // TODO(System) FUN_005de7e0 CWindowTaskControll dtor
void controllReceive(void* self, void* msg);                   // TODO(System) FUN_005dea50 CWindowTaskControll::receive
void mediatorNotify(void* mediator, int slot, void* colleague);   // TODO(System) IWindowTaskMediator vtable slot
void playSe(uint32_t id, int32_t arg);                         // TODO(System) FUN_00686560 sound effect
CTextElm* textCreate(void* parent, int32_t prio);              // TODO(System) FUN_00634470 new CTextElm + create
void textSetText(CTextElm* t, const VcWString& s);             // TODO(System) FUN_00634850 CTextElm::setText
void elemSetAnchor(void* elem, int32_t mode);                  // TODO(System) FUN_0060dc20 anchor (2 = centre?)
CSpriteElm* spriteCreate(void* parent, int32_t prio, const VcString& path);   // TODO(System) FUN_0061f030
void modelShow(void* model, bool on);                          // TODO(System) FUN_005df6d0 CWindowModel open/close
int32_t modelResult(void* model);                              // TODO(System) CWindowModel result (+0x404, slot 24)
void modelRelayout(void* model);                               // TODO(System) CWindowModel vtable slot 9
void modelSetScale(void* model, float s);                      // TODO(System) FUN_008da8f0
void modelSetColor(void* model, float r, float g, float b, float a);   // TODO(System) FUN_005e5630
void frameSetScale(void* frame, float s);                      // TODO(System) frame vtable slot 9 (0x24)
void frameSetSize(void* frame, int32_t w, int32_t h);          // TODO(System) FUN_006a5b60 (float bits as ints)
void inputValueSetPos(void* model, float x, float y);          // TODO(System) FUN_0064d340
VcWString inputValueText1(void* model);                        // TODO(System) FUN_00766800 the first text field
void inputGetText(CWindowTaskInput* in, VcWString* out);       // TODO(System) FUN_005e9e40 CWindowTaskInput::getText
bool inputValueSortOn(void* model);                            // TODO(System) FUN_0077ef50 listbox, FUN_005b47b0
int32_t inputValueSortIndex(void* model);                      // TODO(System) FUN_0077ef50 listbox +0x3c0
bool listboxChecked(void* model, int32_t i);                   // TODO(System) model+0x3a4 listbox, slot 29 (0x74)
int32_t listboxCount(void* model);                             // TODO(System) model+0x3a4 listbox, slot 25 (0x64)
int32_t listboxValue(void* model, int32_t i);                  // TODO(System) model+0x3a4 listbox, data[i] at +0x404
void* listCardTypeCreate(void* parent);                        // TODO(System) FUN_00a1e710(parent, 1, 0, 1)
void* listCardAttrCreate(void* parent);                        // TODO(System) FUN_00a1dd10(parent, 1, 0, 1)
void* listCardIconCreate(void* parent);                        // TODO(System) FUN_00a1f100(parent, 1, 0, 1)
void* listCardStarCreate(void* parent);                        // TODO(System) FUN_00a1fbc0(parent, 1, 0, 1)
void* listCardForbiCreate(void* parent);                       // TODO(System) FUN_00a20680(parent, 1, 0, 1)
void listboxFillTypes(void* model);                            // TODO(System) FUN_00a18ca0 on model+0x3a4
void listboxFillAttrs(void* model);                            // TODO(System) FUN_00a17540
void listboxFillIcons(void* model);                            // TODO(System) FUN_00a1a3e0
void listboxAddStar(void* model, int32_t level);               // TODO(System) FUN_00a1b1d0
void listboxAddForbi(void* model, int32_t limit);              // TODO(System) FUN_00a1c8f0
void* inputValueCreate(void* parent, int32_t kind);            // TODO(System) FUN_00922d20(parent, 0, 0, 1, kind)
VcString cardImageName(uint32_t cardId);                       // TODO(System) FUN_00922010 the card's MINI file name

// ---------------------------------------------------------------- externs (Deck A, other parts)
void kabanSetFilter(int32_t mode);           // TODO(Deck A) FUN_00971240 kabanlist: trunk window (+0x434) refilter
bool kabanBusy();                            // TODO(Deck A) kabanlist: *(DAT_012b3998 + 0x3b0) != 0
void kabanSetInputEnabled(bool on);          // TODO(Deck A) FUN_00977450 kabanlist (CWindowModelKaban)
// TODO(Deck A) FUN_009716e0 kabanlist: run a search on the trunk list
void kabanSearch(int32_t field, int32_t op, VcVector<int32_t>* values, int32_t lo, int32_t hi, const char* text);
void* kabanListBtnConstruct(void* mem);      // TODO(Deck A) FUN_00966180 kabanlist CWindowTaskKabanListBtn ctor
size_t kabanListBtnSize();                   // kabanlist: sizeof(CWindowTaskKabanListBtn) (0x510 in the exe)
bool deckShowingExtra();                     // TODO(Deck A) FUN_00951620 window: deck tab is not the main one
void deckSetTab(int32_t tab);                // TODO(Deck A) FUN_00950a00 window: 0 = main, 1 = extra
void deckRefresh();                          // TODO(Deck A) FUN_0094ee60 window

namespace kbn {

// CElement (0x340): the fields of the drawable base the Deck windows read and write directly.
struct ElemView {
    uint8_t task_[0x20];
    uint32_t taskFlags;      // 0x20 CTask flags; bit 1 = takes no mouse input
    uint8_t _24[0x70 - 0x24];
    float x, y, z;           // 0x70 position in the parent; z = draw depth
    uint8_t _7c[0xc4 - 0x7c];
    uint8_t visible;         // 0xc4
    uint8_t _c5[2];
    uint8_t dirty;           // 0xc7 relayout/redraw on the next frame
    uint8_t _c8[0x340 - 0xc8];
};
YO2_AT(ElemView, x, 0x70);
YO2_AT(ElemView, visible, 0xc4);
YO2_AT(ElemView, dirty, 0xc7);
static_assert(sizeof(ElemView) == 0x340, "ElemView size");

// CWindowTaskControll (0x368) = CElement + IWindowTaskColleague at +0x340 (its vtable, then the mediator that
// gets this window's notifications).
struct ControllView : ElemView {
    uint32_t colleagueVtbl;  // 0x340
    void* mediator;          // 0x344 IWindowTaskMediator* of the owner (set by the create helpers)
    uint8_t f348, f349, _34a[2];
    float depth;             // 0x34c the window's z; children are drawn at depth (+1 for text)
    uint8_t _350[0x368 - 0x350];
    void* colleague() { return &colleagueVtbl; }
    void notifyMediator(int slot) { mediatorNotify(mediator, slot, colleague()); }
    // IWindowTaskMediator::vf00..vf03 of a window that is itself a mediator: pass the child's notification up
    void relay(int slot) { notifyMediator(slot); }
};
YO2_AT(ControllView, mediator, 0x344);
YO2_AT(ControllView, depth, 0x34c);
YO2_SIZEOF(ControllView, 0x368);

// A CTaskMessage as receive() sees it.
struct MsgView {
    uint32_t vtbl;
    int32_t tag;             // 0x13 = CTmSwfObjEvent (a swf button was pressed)
};
enum : int32_t { TM_SWF_EVENT = 0x13 };
enum : uint32_t { WM_LBUTTONDOWN = 0x201 };

// A dialog model (CWindowModel*) as the search code positions it.
struct ModelView : ElemView {
    uint8_t _340[0x380 - 0x340];
    float px, py;            // 0x380 wanted position
    float w, h;              // 0x388 size
    uint8_t _390[0x398 - 0x390];
    ModelView* frame;        // 0x398 the window frame task (laid out with the model)
    uint8_t _39c[0x3c8 - 0x39c];
    TaskPtr<CWindowTaskInput> input2;   // 0x3c8 CWindowModelInputValue: the second text field
};
YO2_AT(ModelView, px, 0x380);
YO2_AT(ModelView, w, 0x388);
YO2_AT(ModelView, frame, 0x398);
YO2_AT(ModelView, input2, 0x3c8);

}   // namespace kbn

// ---------------------------------------------------------------- pure helpers (tested)
enum : uint32_t { SE_OK = 0x10000001, SE_CANCEL = 0x10000002 };
enum : int32_t { DLG_OK = 4000, DLG_CANCEL = 4001 };
// kabanSearch ops: 0x1e = keep the cards whose value is in the list (or in [lo, hi]); 0x1f / 0x20 = sort by the
// field, in the order of the list (or from lo to hi).
enum : int32_t { KS_MATCH = 0x1e, KS_SORT_DOWN = 0x1f, KS_SORT_UP = 0x20 };
enum : int32_t {   // kabanSearch field ids = search button number
    KS_ATK = 1, KS_DEF = 2, KS_TYPE = 3, KS_ATTR = 4, KS_ICON = 5, KS_NAME = 6, KS_TEXT = 7, KS_LEVEL = 8, KS_LIMIT = 9,
};
enum : int32_t {   // kabanSetFilter modes (the Order tabs and the counter)
    KF_NORMAL = 0, KF_EFFECT = 1, KF_MAGIC = 2, KF_TRAP = 3, KF_RITUAL = 4, KF_FUSION = 5, KF_ALL = 6,
};

float kabanCountTextX(int32_t n);   // FUN_009563b0: x of the counter digits, so they stay right-aligned
// FUN_0095c480 ATK/DEF dialog: the two typed numbers -> (op, lo, hi)
int32_t kabanRangeSearch(int32_t a, int32_t b, bool sortOn, int32_t sortIndex, int32_t* lo, int32_t* hi);
int32_t kabanParseNumber(const VcWString& s);   // FUN_0095c480: wcstombs + strtol, capped at 10000
// One list dialog's "all values" lists and how a ticked row maps to a value.
struct KabanListSpec {
    int32_t field;
    int32_t firstAll, lastAll;   // the row-0 order (KS_SORT_DOWN for most) walks firstAll..lastAll
    bool row0Up;                 // level's rows are swapped: row 0 sorts up
    bool zeroLast;               // icon: value 0 ("normal") goes after 6 going up, first going down
    bool single;                 // type: only the first ticked row counts
    int32_t valueBias;           // limit: rows hold limit+1
};
const KabanListSpec* kabanListSpec(int32_t field);
// rows 0/1 = "sort down/up by this field", rows 2.. = values; returns the op and fills `out`
int32_t kabanListSearch(const KabanListSpec& s, bool (*checked)(void*, int32_t), int32_t (*value)(void*, int32_t),
                        int32_t rows, void* ctx, VcVector<int32_t>* out);
int32_t kabanOrderFilter(const char* swfName);   // FUN_00958e20: which tab a sort_btn<N> event selects (-1 = none)
void kabanListItemOffset(int32_t item, float out[3]);   // FUN_00965da0 CKabanListLayout vf00
uint8_t kabanListItemShown(uint32_t item);              // FUN_009660a0 CKabanListLayout vf01

// ---------------------------------------------------------------- windows
struct CWindowTaskKabanNumber : kbn::ControllView {
    uint32_t mediatorVtbl;           // 0x368 IWindowTaskMediator
    TaskPtr<CSwfEngine> button;      // 0x36c "KabanCountBtn" (data/deck/kabancnt.txt)
    TaskPtr<CTextElm> number;        // 0x378 "KabanCountNumber"
    float x, y, w, h;                // 0x384
    float textX;                     // 0x394
    float scale;                     // 0x398
    int32_t count;                   // 0x39c
    uint8_t enabled;                 // 0x3a0
    uint8_t _3a1[7];

    void construct();                // (its ctor/dtor are System-labelled; this one just wires the pointers)
    uint32_t init();                 // FUN_00955850 CElement vf04
    void layout();                   // FUN_00956380 vf13
    void relay0();                   // FUN_00956910 IWindowTaskMediator vf00
    uint32_t hitTest(float x, float y);   // FUN_00956950 vf15
    void setCount(int32_t n);        // FUN_009563b0
    void setEnabled(bool on);        // FUN_009568d0
    void receive(void* msg);         // FUN_009569c0
    uint32_t onMouse(uint32_t msg);  // FUN_00956970 vf14
};
YO2_AT(CWindowTaskKabanNumber, button, 0x36c);
YO2_AT(CWindowTaskKabanNumber, number, 0x378);
YO2_AT(CWindowTaskKabanNumber, x, 0x384);
YO2_AT(CWindowTaskKabanNumber, textX, 0x394);
YO2_AT(CWindowTaskKabanNumber, count, 0x39c);
YO2_AT(CWindowTaskKabanNumber, enabled, 0x3a0);
YO2_SIZEOF(CWindowTaskKabanNumber, 0x3a8);

struct CWindowTaskKabanOrder : kbn::ControllView {
    uint32_t mediatorVtbl;           // 0x368
    TaskPtr<CSwfEngine> button[6];   // 0x36c Magic, Trap, Normal, Effect, Ritual, Fusion (sort_btn1..6)
    float x, y, w, h;                // 0x3b4
    float spacing;                   // 0x3c4 button pitch
    float scale;                     // 0x3c8
    uint8_t enabled;                 // 0x3cc
    uint8_t _3cd[3];

    static CWindowTaskKabanOrder* create(void* parent, void* mediator);   // FUN_00956b70
    void construct();                // FUN_00956c30
    void destruct();                 // FUN_00957000
    static void destroy(CWindowTaskKabanOrder* p, bool free);   // FUN_00956fd0
    void setScale(float s);          // FUN_00956ed0 vf09
    uint32_t isControl();            // FUN_00956ef0 vf12
    uint32_t update();               // FUN_00958c10 CElement vf05
    uint32_t hitTest(float x, float y);   // FUN_00958db0 vf15
    void relay0(), relay1(), relay2(), relay3();   // FUN_00958d70, 0x00956f10/50/90
    uint32_t init();                 // FUN_009570d0
    void layout();                   // FUN_00958a50
    void setEnabled(bool on);        // FUN_00958c30
    void receive(void* msg);         // FUN_00958e20
    uint32_t onMouse(uint32_t msg);  // FUN_00958dd0
};
YO2_AT(CWindowTaskKabanOrder, button, 0x36c);
YO2_AT(CWindowTaskKabanOrder, x, 0x3b4);
YO2_AT(CWindowTaskKabanOrder, spacing, 0x3c4);
YO2_AT(CWindowTaskKabanOrder, enabled, 0x3cc);
YO2_SIZEOF(CWindowTaskKabanOrder, 0x3d0);

struct CWindowTaskKabanSearch : kbn::ControllView {
    uint32_t mediatorVtbl;                       // 0x368
    TaskPtr<CSwfEngine> button[9];               // 0x36c Atk, Def, Type, Attr, Effect, Name, Str, Level, Forbi
    TaskPtr<CWindowModelInputValue> atkDlg;      // 0x3d8
    TaskPtr<CWindowModelInputValue> defDlg;      // 0x3e4
    TaskPtr<CWindowModelListCardType> typeDlg;   // 0x3f0
    TaskPtr<CWindowModelListCardAttr> attrDlg;   // 0x3fc
    TaskPtr<CWindowModelListCardIcon> iconDlg;   // 0x408
    TaskPtr<CWindowModelInputValue> textDlg;     // 0x414
    TaskPtr<CWindowModelListCardStar> levelDlg;  // 0x420
    TaskPtr<CWindowModelListCardForbi> limitDlg; // 0x42c
    float x, y, w, h;                            // 0x438
    float spacing;                               // 0x448
    float scale;                                 // 0x44c
    uint8_t busy;                                // 0x450 a dialog is open
    uint8_t _451[3];
    VcVector<int32_t> values;                    // 0x454 the list handed to kabanSearch
    uint8_t enabled;                             // 0x464
    uint8_t _465[3];

    static CWindowTaskKabanSearch* create(void* parent, void* mediator);   // FUN_00959350
    void construct();                // FUN_00959410
    void destruct();                 // FUN_00959a60
    static void destroy(CWindowTaskKabanSearch* p, bool free);   // FUN_00959a10
    void setScale(float s);          // FUN_00959910 vf09
    uint32_t isControl();            // FUN_00959930 vf12
    uint32_t hitTest(float x, float y);   // FUN_00961c70 vf15
    void relay0(), relay1(), relay2(), relay3();   // FUN_00961c30, 0x00959950/90/d0
    uint32_t init();                 // FUN_00959c40
    uint32_t update();               // FUN_0095c480 CElement vf05: collect a closed dialog's answer
    void layout();                   // FUN_0095c200
    void setEnabled(bool on);        // FUN_009616a0
    void closeDialogs();             // FUN_00961880
    void receive(void* msg);         // FUN_00961ce0
    uint32_t onMouse(uint32_t msg);  // FUN_00961c90

  private:
    bool finishRange(TaskPtr<CWindowModelInputValue>& dlg, int32_t field);
    bool finishList(void* dlg, int32_t field);
    bool finishText();
    void endDialog(void* dlg);
    void openRange(TaskPtr<CWindowModelInputValue>& dlg, int32_t kind, const char* name);
};
YO2_AT(CWindowTaskKabanSearch, button, 0x36c);
YO2_AT(CWindowTaskKabanSearch, atkDlg, 0x3d8);
YO2_AT(CWindowTaskKabanSearch, limitDlg, 0x42c);
YO2_AT(CWindowTaskKabanSearch, x, 0x438);
YO2_AT(CWindowTaskKabanSearch, spacing, 0x448);
YO2_AT(CWindowTaskKabanSearch, busy, 0x450);
YO2_AT(CWindowTaskKabanSearch, values, 0x454);
YO2_AT(CWindowTaskKabanSearch, enabled, 0x464);
YO2_SIZEOF(CWindowTaskKabanSearch, 0x468);

struct CWindowTaskKabanCard : kbn::ControllView {
    TaskPtr<CSpriteElm> picture;     // 0x368 "picCard"
    float x, y, w, h;                // 0x374
    float z;                         // 0x384
    uint32_t cardId;                 // 0x388
    uint32_t f38c;                   // 0x38c

    static CWindowTaskKabanCard* create(void* parent, void* mediator);   // FUN_00965330
    void construct();                // FUN_009653f0
    void destruct();                 // FUN_009655d0
    static void destroy(CWindowTaskKabanCard* p, bool free);   // FUN_009655a0
    uint32_t kind();                 // FUN_00965580 vf12
    uint32_t update();               // FUN_00965690 CElement vf05
    uint32_t hitTest(float x, float y);   // FUN_00965d60 vf15
    uint32_t onMouse(uint32_t msg);  // FUN_00965d80 vf14
    uint32_t init();                 // FUN_00965640
    void layout();                   // FUN_009656b0
    void setCard(uint32_t id);       // FUN_009656e0
    void clearCard();                // FUN_00965cf0
    void clicked();                  // FUN_00965d20 vf19
};
YO2_AT(CWindowTaskKabanCard, picture, 0x368);
YO2_AT(CWindowTaskKabanCard, x, 0x374);
YO2_AT(CWindowTaskKabanCard, cardId, 0x388);
YO2_SIZEOF(CWindowTaskKabanCard, 0x390);

// FUN_009660c0: returns the new button (left in eax; Ghidra shows void), null when its init failed
CWindowTaskKabanListBtn* kabanListBtnCreate(void* parent, void* mediator);
void kabanModelSetSize(kbn::ModelView* m, float w, float h);   // FUN_009651a0
void kabanModelSetPos(kbn::ModelView* m, float x, float y);    // FUN_00965210
void kabanFillLevels(void* model);                             // FUN_009652d0
void kabanFillLimits(void* model);                             // FUN_00965300
VcWString* kabanInputText2(kbn::ModelView* m, VcWString* out); // FUN_00961450

}   // namespace dk
