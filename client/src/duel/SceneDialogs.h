// yo2Dialogs.cpp (0x00772240..0x0077fda0): the duel's question dialogs. The engine asks through DUEL_VIEW, the
// scene opens one of these, and the dialog answers with engSendChoice(v) (FUN_0071f8c0) as it fades out.
//
//   CUGDialogBase         the fading, draggable box most of them share (a CWindowModelThin)
//   CUSelectDialog        a list of up to 4 options from a "\n"-separated text; answers the option's index
//   CUSelectStandDialog   two cards side by side (e.g. which of two monsters); answers 0 / 1
//   CUSelectCoinDialog    heads or tails (coin_new.txt); answers 1 for the left coin, 0 for the right
//   CUDialogBaseOk        the same fade state on a CWindowModelDialogOk; CUSelectNumDialog: a number in [min, max]
//   CUGDialogBaseHP       the same on a CWindowModelHelp; CUDiscardDialog: the "discard N cards" strip
//   CURitualDialog        the ritual level meter: one star per level, lit while the tribute total grows
//   CUSelectTypeDialog    a type list (bits 1..20 of a mask); CUSelectAttributeDialog: attributes (bits 1..6)
//   CUDiceDialog          pick N of the six dice faces (dice.txt)
//   CUSummonDialogSp      the summon / set / activate command menu next to a card
//   CUPhaseSelectDialog   the phase buttons' menu (battle / main 2 / end)
//   CULockOnDialog        the attack target cursor box that follows a card
//   CHelpDialog           an empty CWindowModelHelp
// CWindowModelDialogDecorator / CWindowModelListCardType / CWindowModelListCardAttr / CWindowModelListDuelCmd are
// the list-window wrappers the type, attribute and summon dialogs are built on.
//
// The virtual functions keep the exe's slots in their comments (slot 21.. after the window's own).
#pragma once
#include "SceneCard.h"
#include "System/window/yo2UGDialogBase.h"

namespace ds {

enum : int32_t { DLG_OK = 4000 };

// CWindowModelThin::setup (0x005e3fd0, inline in create): where a dialog made by hand goes, 336 x 144, its style
void placeThin(CWindowModelThin* w, float x, float y, int32_t style);
// rect and element position, rect size (the dialogs' inline geometry stores)
void placeAt(CWindowTaskModel* w, float x, float y, float rw, float rh);
// boxW_, boxH_ and the centre from the window rect: boxW_ = (int)w_, cx_ = (int)(x_ + boxW_ / 2) (inline __ftol)
template <class D>
void fitToRect(D* d) {
    d->boxW_ = ftol(d->w_);
    d->boxH_ = ftol(d->h_);
    d->cx_ = ftol((double)(d->boxW_ >> 1) + d->x_);
    d->cy_ = ftol((double)(d->boxH_ >> 1) + d->y_);
}

// CUGDialogBase (0x414, the fade / drag / answer box on a CWindowModelThin) is System's: yo2UGDialogBase.h.
// Its slot 23 (ugSlot23) is each dialog's draw.

// ---------------------------------------------------------------- CUSelectDialog (0xe58)
class CUSelectDialog : public ::CUGDialogBase {
public:
    CUSelectDialog(const WChar* src, int32_t nOptions, uint32_t optionMask);
    ~CUSelectDialog() override;
    bool onInit() override;
    bool onMain() override;
    void tick() override;
    void ugSlot23() override;
    bool canClose() override;
    void onMouse(CMouseEx* m) override;
    void onOpened() override;
    void onClosed() override;

    uint32_t pad414_ = 0;
    CTaskPtr<CWindowTaskListbox> list;   // 0x418
    WChar text[5][0x100];                // 0x424 [0] the question, [1..] the options
    int32_t textCount = 0;               // 0xe24 options + 1
    uint8_t listFlag = 0;                // 0xe28
    uint8_t pade29_[3] = {};
    int32_t rowValue[5] = {};            // 0xe2c the option index each list row answers
    int32_t rows = 0;                    // 0xe40
    int32_t options;                     // 0xe44
    uint32_t mask = 0;                   // 0xe48 bit i: option i is offered
    int32_t e4c = 0;                     // 0xe4c
    int32_t cancelValue = -1;            // 0xe50 answered by right click / cancel when >= 0 (-1 = no cancel)
    uint8_t pade54_[4] = {};
};
YO2_AT(CUSelectDialog, list, 0x418);
YO2_AT(CUSelectDialog, text, 0x424);
YO2_AT(CUSelectDialog, textCount, 0xe24);
YO2_AT(CUSelectDialog, rowValue, 0xe2c);
YO2_AT(CUSelectDialog, rows, 0xe40);
YO2_AT(CUSelectDialog, mask, 0xe48);
YO2_AT(CUSelectDialog, cancelValue, 0xe50);
YO2_SIZEOF(CUSelectDialog, 0xe58);

// ---------------------------------------------------------------- CUSelectStandDialog (0x538)
class CUSelectStandDialog : public ::CUGDialogBase {
public:
    CUSelectStandDialog();
    ~CUSelectStandDialog() override;
    static CUSelectStandDialog* create(CTask* parent, float x, float y, int32_t style, const WChar* question,
                                       int32_t cardId, uint8_t flag);   // FUN_00776510
    bool onInit() override;
    bool onMain() override;
    bool windowSlot18() override;
    void tick() override;
    void ugSlot23() override;
    bool canClose() override;
    void onMouse(CMouseEx* m) override;
    void onOpened() override;
    void onClose() override;
    void onClosed() override;

    uint32_t pad414_ = 0;
    CTask* parent_ = nullptr;      // 0x418
    float px = 0, py = 0;          // 0x41c placement
    int32_t style = 0;             // 0x424
    const WChar* question = nullptr;   // 0x428
    int32_t cardId = 0;            // 0x42c both cards show it (< 0: assert)
    uint8_t flag = 0;              // 0x430
    uint8_t pad431_[3] = {};
    CCard cards[2];                // 0x434
    uint8_t pad534_[4] = {};
};
YO2_AT(CUSelectStandDialog, parent_, 0x418);
YO2_AT(CUSelectStandDialog, question, 0x428);
YO2_AT(CUSelectStandDialog, cards, 0x434);
YO2_SIZEOF(CUSelectStandDialog, 0x538);

// ---------------------------------------------------------------- CUSelectCoinDialog (0x458)
class CUSelectCoinDialog : public ::CUGDialogBase {
public:
    CUSelectCoinDialog();
    ~CUSelectCoinDialog() override;
    static CUSelectCoinDialog* create(CTask* parent, float x, float y, int32_t style,
                                      const WChar* question);   // FUN_007772e0
    void initSize();                    // FUN_007777d0
    bool onInit() override;
    bool onMain() override;
    void tick() override;
    void ugSlot23() override;
    bool canClose() override;
    void onMouse(CMouseEx* m) override;
    void onOpened() override;
    void onClosed() override;

    uint32_t pad414_ = 0;
    PlaneLoader sheet;         // 0x418 coin_new.txt
    int32_t hover = -1;        // 0x450 the coin under the mouse (0 left, 1 right; -1 none)
    int32_t afterAnswer = 0;   // 0x454 frames since the answer (the chosen coin blinks)
};
YO2_AT(CUSelectCoinDialog, sheet, 0x418);
YO2_AT(CUSelectCoinDialog, hover, 0x450);
YO2_SIZEOF(CUSelectCoinDialog, 0x458);

// ---------------------------------------------------------------- CUDialogBaseOk (0x42c): CWindowModelDialogOk + fade
class CUDialogBaseOk : public CWindowModelDialogOk {
public:
    CUDialogBaseOk();
    ~CUDialogBaseOk() override;
    bool windowSlot15() override;                       // 0x007728c0
    virtual void setBox(int32_t w, int32_t h);         // slot 27
    virtual void tick();                              // slot 28
    virtual void ugSlot23() = 0;                            // slot 29
    virtual bool isMouseOver() const;                               // slot 30 (0x007728a0: never)
    virtual bool canClose();                           // slot 31
    virtual void onMouse(CMouseEx* m);                     // slot 32
    virtual void onOpened();                            // slot 33
    virtual void onClose();                          // slot 34
    virtual void onClosed();                            // slot 35
    void close(int32_t v);                             // 0x00772860
    
    uint8_t unk3e8_ = 0;     // 0x400 closed (named after CUGDialogBase's)
    uint8_t pad401_[3] = {};
    int32_t result_ = 0;      // 0x404
    int32_t fade_ = 0x100;    // 0x408
    bool dragging_ = false;    // 0x40c
    bool answered_ = false;    // 0x40d
    uint8_t pad40e_[2] = {};
    int32_t cx_ = 0, cy_ = 0;  // 0x410
    int32_t dragDx_ = 0, dragDy_ = 0;   // 0x418
    int32_t boxW_ = 0, boxH_ = 0;     // 0x420
    bool running_ = true;     // 0x428 (past the generated header's 0x428 size: HEADER_ISSUES_SCENE1.md)
    uint8_t pad429_[3] = {};
};
YO2_AT(CUDialogBaseOk, unk3e8_, 0x400);
YO2_AT(CUDialogBaseOk, fade_, 0x408);
YO2_AT(CUDialogBaseOk, answered_, 0x40d);
YO2_AT(CUDialogBaseOk, boxW_, 0x420);
YO2_AT(CUDialogBaseOk, running_, 0x428);

// ---------------------------------------------------------------- CUSelectNumDialog (0x470)
class CUSelectNumDialog : public CUDialogBaseOk {
public:
    CUSelectNumDialog(const WChar* t, const WChar* u, int32_t lo, int32_t hi);
    ~CUSelectNumDialog() override;
    static CUSelectNumDialog* create(CTask* parent, float x, float y, int32_t style, const WChar* title,
                                     const WChar* unit, int32_t lo, int32_t hi);   // FUN_00778160
    void refreshText();                 // FUN_007789f0
    bool onInit() override;
    bool onMain() override;
    void tick() override;
    void ugSlot23() override;
    void onMouse(CMouseEx* m) override;
    void onOpened() override;
    void onClosed() override;

    uint8_t pad42c_[4] = {};
    vc6::wstring message;     // 0x430 "%s\n%s\n%s\n%s": title, two help lines, the number
    vc6::wstring title;       // 0x440
    vc6::wstring unit;        // 0x450 the number's format ("%d" with a unit)
    int32_t value;            // 0x460
    int32_t minValue;         // 0x464
    int32_t maxValue;         // 0x468
    uint8_t pad46c_[4] = {};
};
YO2_AT(CUSelectNumDialog, message, 0x430);
YO2_AT(CUSelectNumDialog, title, 0x440);
YO2_AT(CUSelectNumDialog, unit, 0x450);
YO2_AT(CUSelectNumDialog, value, 0x460);
YO2_AT(CUSelectNumDialog, maxValue, 0x468);
YO2_SIZEOF(CUSelectNumDialog, 0x470);

// ---------------------------------------------------------------- CUGDialogBaseHP (0x414) / CUDiscardDialog (0x420)
class CUGDialogBaseHP : public CWindowModelHelp {
public:
    CUGDialogBaseHP();
    ~CUGDialogBaseHP() override;
    bool windowSlot15() override;                       // 0x00772320: like CUGDialogBase's, without moving the box
    virtual void setBox(int32_t w, int32_t h);         // slot 21 (also the rect size)
    virtual void tick();                              // slot 22 (0x00772430)
    virtual void ugSlot23() = 0;                            // slot 23
    virtual bool isMouseOver() const;                               // slot 24 (0x00772280)
    virtual bool canClose();                           // slot 25
    virtual void onMouse(CMouseEx* m);                     // slot 26
    virtual void onOpened();                            // slot 27
    virtual void onClose();                          // slot 28
    virtual void onClosed();                            // slot 29
    void close(int32_t v);                             // 0x00772240

    uint8_t unk3e8_ = 0;      // 0x3e8 closed: slot 29 sets it, onMain then ends the task
    uint8_t pad3e9_[3] = {};
    int32_t result_ = 0;      // 0x3ec
    int32_t fade_ = 0x100;    // 0x3f0
    bool dragging_ = false;    // 0x3f4
    bool answered_ = false;    // 0x3f5
    uint8_t pad3f6_[2] = {};
    int32_t cx_ = 0x200;      // 0x3f8
    int32_t cy_ = 0x180;      // 0x3fc
    int32_t dragDx_ = 0, dragDy_ = 0;   // 0x400
    int32_t boxW_ = 0, boxH_ = 0;     // 0x408
    bool running_ = true;     // 0x410
    uint8_t pad411_[3] = {};
};
YO2_AT(CUGDialogBaseHP, unk3e8_, 0x3e8);
YO2_AT(CUGDialogBaseHP, cx_, 0x3f8);
YO2_AT(CUGDialogBaseHP, running_, 0x410);
YO2_SIZEOF(CUGDialogBaseHP, 0x414);

class CUDiscardDialog : public CUGDialogBaseHP {
public:
    CUDiscardDialog();
    ~CUDiscardDialog() override;
    static CUDiscardDialog* create(CTask* parent, float x, float y, int32_t style, const WChar* text);   // FUN_00778dd0
    bool onInit() override;
    bool onMain() override;       // the strip (or its open / close zoom)
    bool windowSlot18() override;
    void ugSlot23() override;

    uint32_t pad414_ = 0;
    uint32_t loaderVtbl = 0;      // 0x418 CCardLoader member (the shared list_card sheets)
    uint8_t pad41c_[4] = {};
};
YO2_AT(CUDiscardDialog, loaderVtbl, 0x418);
YO2_SIZEOF(CUDiscardDialog, 0x420);

// ---------------------------------------------------------------- CURitualDialog (0x458)
class CURitualDialog : public ::CUGDialogBase {
public:
    CURitualDialog(const WChar* text, int32_t lv);
    ~CURitualDialog() override;
    static CURitualDialog* create(CTask* parent, float x, float y, int32_t style, const WChar* text,
                                  int32_t lv);   // FUN_007799b0
    bool onInit() override;
    bool onMain() override;
    bool windowSlot18() override;
    void tick() override;
    void ugSlot23() override;
    void onClosed() override;

    uint32_t pad414_ = 0;
    PlaneLoader sheet;        // 0x418 ritualdlg.txt: sheet 0 a dark star, 1 a lit one
    int32_t level;            // 0x450 the stars to fill
    uint8_t pad454_[4] = {};
};
YO2_AT(CURitualDialog, sheet, 0x418);
YO2_AT(CURitualDialog, level, 0x450);
YO2_SIZEOF(CURitualDialog, 0x458);
#if YO2_IN_EXE
#define g_ritualDialogOpen YO2_EXE_VAR(uint8_t, 0x012a7f08)
#else
extern uint8_t g_ritualDialogOpen;   // DAT_012a7f08 (byte 0)
#endif

// ---------------------------------------------------------------- the list-window decorators
// CWindowModelDialogDecorator (0x39c) is System's (yo2WindowDialogs.h): it forwards to inner_.

template <class List>
class CWindowModelListCard : public ::CWindowModelDialogDecorator {   // CWindowModelListCardType / CardAttr (0x3b0)
public:
    CWindowModelListCard() { list.setUser(this); }

    void* owner = nullptr;    // 0x39c
    CTaskPtr<List> list;      // 0x3a0
    uint8_t multi = 0;        // 0x3ac several may be picked
    uint8_t v3ad = 0;
    uint8_t pad3ae_[2] = {};
};
using CWindowModelListCardType = CWindowModelListCard<CWindowTaskListboxCardType>;
using CWindowModelListCardAttr = CWindowModelListCard<CWindowTaskListboxCardAttr>;
YO2_AT(CWindowModelListCardType, owner, 0x39c);
YO2_AT(CWindowModelListCardType, list, 0x3a0);
YO2_AT(CWindowModelListCardType, multi, 0x3ac);
YO2_SIZEOF(CWindowModelListCardType, 0x3b0);
bool listCardTypeInit(CWindowModelListCardType* d);   // TODO(System) FUN_00a1e8f0 vf04: the wrapped dialog, the list
bool listCardAttrInit(CWindowModelListCardAttr* d);   // TODO(System) FUN_00a1def0 vf04

class CUSelectTypeDialog : public CWindowModelListCardType {
public:
    explicit CUSelectTypeDialog(uint32_t mask);
    ~CUSelectTypeDialog() override;
    static void create(CTask* parent, void* owner, uint32_t unused, uint32_t mask);   // FUN_0077a320
    bool onInit() override;
    bool onMain() override;

    int32_t picks = 1;        // 0x3b0 rows to tick before OK counts
    int32_t types[20] = {};   // 0x3b4 the offered types (mask bits 1..20)
    int32_t count = 0;        // 0x404
};
YO2_AT(CUSelectTypeDialog, picks, 0x3b0);
YO2_AT(CUSelectTypeDialog, count, 0x404);
YO2_SIZEOF(CUSelectTypeDialog, 0x408);

class CUSelectAttributeDialog : public CWindowModelListCardAttr {
public:
    explicit CUSelectAttributeDialog(uint32_t mask);
    ~CUSelectAttributeDialog() override;
    static void create(CTask* parent, void* owner, uint32_t unused, int32_t picks, uint32_t mask);   // FUN_0077ad20
    bool onInit() override;
    bool onMain() override;   // answers the picked attributes as a bit mask

    int32_t picks = 1;        // 0x3b0
    int32_t attrs[6] = {};    // 0x3b4 mask bits 1..6
    int32_t count = 0;        // 0x3cc
};
YO2_AT(CUSelectAttributeDialog, attrs, 0x3b4);
YO2_AT(CUSelectAttributeDialog, count, 0x3cc);
YO2_SIZEOF(CUSelectAttributeDialog, 0x3d0);

// ---------------------------------------------------------------- CUDiceDialog (0x480)
class CUDiceDialog : public ::CUGDialogBase {
public:
    CUDiceDialog(const WChar* text, int32_t nNeed, uint32_t mask);
    ~CUDiceDialog() override;
    // FUN_0077b480 (the exe passes the text, need and mask from arguments 2, 4 and 5; 3 is unused)
    static CUDiceDialog* create(CTask* parent, const WChar* text, uint32_t unused, int32_t need, uint32_t mask);
    void facePos(int32_t* out, int32_t i) const;   // FUN_0077ba80: top-left of face i
    bool onInit() override;
    bool onMain() override;
    void tick() override;
    void ugSlot23() override;
    bool canClose() override;
    void onMouse(CMouseEx* m) override;
    void onOpened() override;
    void onClosed() override;

    uint32_t pad414_ = 0;
    PlaneLoader sheet;         // 0x418 dice.txt: sheets 7..12 the faces
    int32_t hover = -1;        // 0x450 the face under the mouse
    int32_t lastHover = -1;    // 0x454
    int32_t blink = 0;         // 0x458 frames since the last pick
    int32_t picked = 0;        // 0x45c faces picked so far
    int32_t need;              // 0x460 faces to pick
    uint32_t free;             // 0x464 faces still offered (bits 0..5)
    uint32_t chosen = 0;       // 0x468 faces picked (bits 0..5)
    vc6::wstring message;      // 0x46c
    uint8_t pad47c_[4] = {};
};
YO2_AT(CUDiceDialog, sheet, 0x418);
YO2_AT(CUDiceDialog, hover, 0x450);
YO2_AT(CUDiceDialog, need, 0x460);
YO2_AT(CUDiceDialog, chosen, 0x468);
YO2_AT(CUDiceDialog, message, 0x46c);
YO2_SIZEOF(CUDiceDialog, 0x480);

// ---------------------------------------------------------------- CWindowModelListDuelCmd / CUSummonDialogSp
class CWindowModelListDuelCmd : public CWindowModelThin {   // 0x3f8: a thin window with a command list box
public:
    CWindowModelListDuelCmd();
    ~CWindowModelListDuelCmd() override;
    bool baseInit();          // TODO(System) FUN_00a22dd0 vf04

    CTaskPtr<CWindowTaskListboxDuelCmd> list;   // 0x3e8
    uint8_t pad3f4_[4] = {};
};
YO2_AT(CWindowModelListDuelCmd, list, 0x3e8);
YO2_SIZEOF(CWindowModelListDuelCmd, 0x3f8);

class CUSummonDialogSp : public CWindowModelListDuelCmd {
public:
    CUSummonDialogSp();
    ~CUSummonDialogSp() override;
    static CUSummonDialogSp* create(CTask* parent, float x, float y, int32_t style);   // FUN_0077c3d0
    void open(uint32_t a, uint32_t b, uint32_t mask, CCard* c);   // FUN_0077c940
    void hide();                          // FUN_0077cd20
    int32_t choice() const;               // FUN_0077cd60
    bool hasChoice() const;               // FUN_0077cd80
    bool onInit() override;
    bool onMain() override;
    bool inRect(int32_t x, int32_t y) const;   // FUN_0077d1b0

    int32_t bit[20] = {};     // 0x3f8 the command bit each row stands for
    int32_t cmd[20] = {};     // 0x448 the row's command (kSummonCommands)
    int32_t count = 0;        // 0x498
    uint16_t v49c = 0;        // 0x49c
    uint8_t pad49e_[2] = {};
    CCard* card = nullptr;    // 0x4a0 the card the menu belongs to
    int32_t openFrame = 0;    // 0x4a4 the scene frame it was opened on
    uint8_t shown = 0;        // 0x4a8
    uint8_t pad4a9_[3] = {};
    int32_t hoverRow = 0;     // 0x4ac
    uint8_t balloon[0x20];    // 0x4b0 the help balloon (FUN_00a5c410 / FUN_00a5c500 / FUN_00a5c530 / FUN_00a5c6a0)
    int32_t chosen = -1;      // 0x4d0 the picked command bit (-1 = none yet)
    uint8_t pad4d4_[4] = {};
};
YO2_AT(CUSummonDialogSp, bit, 0x3f8);
YO2_AT(CUSummonDialogSp, cmd, 0x448);
YO2_AT(CUSummonDialogSp, count, 0x498);
YO2_AT(CUSummonDialogSp, card, 0x4a0);
YO2_AT(CUSummonDialogSp, balloon, 0x4b0);
YO2_AT(CUSummonDialogSp, chosen, 0x4d0);
YO2_SIZEOF(CUSummonDialogSp, 0x4d8);
extern const int32_t kSummonCommands[14];   // DAT_00cd4a10

// ---------------------------------------------------------------- CUPhaseSelectDialog (0x668)
class CUPhaseSelectDialog : public ::CUGDialogBase {
public:
    CUPhaseSelectDialog(const WChar* t, uint32_t mask);
    ~CUPhaseSelectDialog() override;
    static CUPhaseSelectDialog* create(CTask* parent, float x, float y, int32_t style, const WChar* title,
                                       uint32_t mask);   // FUN_0077d240
    bool onInit() override;
    bool onMain() override;
    void tick() override;
    void ugSlot23() override;
    bool canClose() override;
    void onMouse(CMouseEx* m) override;
    void onOpened() override;
    void onClosed() override;

    uint32_t pad414_ = 0;
    WChar title[0x100];       // 0x418
    uint8_t pad618_[4] = {};
    CTaskPtr<CWindowTaskListbox> list;   // 0x61c
    uint8_t listFlag = 0;     // 0x628
    uint8_t pad629_[3] = {};
    int32_t text[6] = {};     // 0x62c DLG_Text id of each row
    int32_t phase[6] = {};    // 0x644 2 battle, 3 main 2, 4 end, 5 ...; 7 = cancel
    int32_t count = 0;        // 0x65c
    int32_t v660 = 0;         // 0x660
    int32_t cancelValue = -1; // 0x664 -1 = none
};
YO2_AT(CUPhaseSelectDialog, title, 0x418);
YO2_AT(CUPhaseSelectDialog, list, 0x61c);
YO2_AT(CUPhaseSelectDialog, text, 0x62c);
YO2_AT(CUPhaseSelectDialog, phase, 0x644);
YO2_AT(CUPhaseSelectDialog, count, 0x65c);
YO2_AT(CUPhaseSelectDialog, cancelValue, 0x664);
YO2_SIZEOF(CUPhaseSelectDialog, 0x668);
// The row texts per phase bit (2..5): {mask has bit 2, normal, mask 0x24 / 0x30} (DAT_00cd4a48).
extern const int32_t kPhaseTexts[4][3];
int32_t phaseRowText(uint32_t mask, int32_t bit);

// ---------------------------------------------------------------- CULockOnDialog (0x470)
class CULockOnDialog : public ::CUGDialogBase {
public:
    explicit CULockOnDialog(const WChar* text);
    ~CULockOnDialog() override;
    static CULockOnDialog* create(CTask* parent, float x, float y, int32_t style, const WChar* text);   // FUN_0077e3a0
    bool onInit() override;
    bool onMain() override;
    bool windowSlot18() override;
    void tick() override;
    void ugSlot23() override;
    void onClosed() override;
    bool inRect(int32_t x, int32_t y) const;   // FUN_0077ec40

    uint32_t pad414_ = 0;
    PlaneLoader sheet;          // 0x418 (constructed, never loaded here)
    int32_t targetX = 0, targetY = 0;   // 0x450 where the box glides to
    int32_t boxX = 0, boxY = 0;         // 0x458 where it is
    int32_t mouseX = 0, mouseY = 0;     // 0x460 the mouse when it opened
    uint8_t following = 1;      // 0x468 until the mouse moves off the box
    uint8_t pad469_[7] = {};
};
YO2_AT(CULockOnDialog, targetX, 0x450);
YO2_AT(CULockOnDialog, mouseX, 0x460);
YO2_AT(CULockOnDialog, following, 0x468);
YO2_SIZEOF(CULockOnDialog, 0x470);

// ---------------------------------------------------------------- CHelpDialog (0x3e8)
class CHelpDialog : public CWindowModelHelp {
public:
    CHelpDialog();
    ~CHelpDialog() override;
    static CHelpDialog* create(CTask* parent);   // FUN_0077ecd0
    bool onInit() override;
    bool onMain() override;
};
YO2_SIZEOF(CHelpDialog, 0x3e8);

}   // namespace ds
