// CWindowDeckList (yo2DeckList.cpp, 0x007674a0..0x0076b870): the card list window of the duel. It shows the engine's
// card list (g_eng.deckList, 5 cards at a time with a horizontal scroll bar) for a pile on the mat (kinds 1..4: extra
// deck, deck, graveyard, banished), to pick one card (kinds 6, 0x49.., 0xfe, 0xff), to pick several in order (7..0x48)
// or to declare a card name from the whole card list (0x4b..0x4e, with a search box: CWindowTaskListSearch).
#pragma once
#include "SceneBattleManager.h"
#include "SceneCard.h"
#include "SceneDialogs.h"

namespace ds {

// The CSwfEngine calls the list's buttons make (System / Swf's; see SceneBattleManager.h for the class).
void swfSetTarget(CSwfEngine* s, CTask* target);       // TODO(Swf) +0x3f8 CTaskPtr<CTask>::set: who gets its events
void swfActivate(CSwfEngine* s, bool on);              // TODO(Swf) FUN_0066e2f0
// TODO(Swf) FUN_006654c0 CTmSwfObjEvent: the event comes from the object `name`
bool swfEventIs(CTaskMessage* ev, const char* name);
// CWindowModelInputValue, the one-line text input dialog (System's; Deck has its own stand-in), as a plain window
CWindowTaskModel* inputValueCreate(CTask* parent, int32_t a, int32_t b, int32_t c, int32_t kind);   // TODO(System) FUN_00922d20
int32_t inputValueResult(CWindowTaskModel* d);         // TODO(System) +0x404: 4000 OK, 4001 cancel
CTask* inputValueBox(CWindowTaskModel* d);             // TODO(System) +0x3c0 CTaskPtr<CWindowTaskInput>::get
vc6::wstring taskInputText(CTask* input);              // TODO(System) FUN_005e9e40 CWindowTaskInput: the text
vc6::wstring inputValueText(CWindowTaskModel* d);      // FUN_00766800
// TODO(System) FUN_005ae210 CWindowTaskScrollH::create (the horizontal scroll bar)
CWindowTaskScrollBase* scrollHCreate(CTask* parent, IWindowTaskMediator* mediator, int32_t v);
int32_t mouseWheelDelta(Mouse* m);                     // TODO(System) vf22 (+0x58)
// The card database helpers of the name search (labelled System, near CardDB.h's)
int cardListable(int index);                           // TODO(System) FUN_0073bda0: in the list of declarable cards
const char* cardReading(int id);                       // TODO(System) FUN_0073bcc0: the name's reading (Japanese)
void textReadingKey(char16_t* out, const char* reading);   // TODO(System) FUN_00744320: the reading, cleaned for search
bool langIsJapanese();                                 // TODO(System) (*DAT_0127188c)->vf3 () == 0
void engListCopyFrom(const void* list);                // TODO(System) FUN_00743720 (g_eng.deckList = *list, 0x6014 B)

// The search box over the name list: a "search" button that opens the text input, a "reset" button.
class CWindowTaskListSearch : public CWindowTaskControll, public IWindowTaskMediator {
public:
    static CWindowTaskListSearch* create(CTask* parent, IWindowTaskMediator* mediator);   // FUN_00765260
    CWindowTaskListSearch();                            // FUN_00765320
    ~CWindowTaskListSearch() override;                  // FUN_00765680
    int32_t receive(CTaskMessage* msg) override;        // FUN_00766c00 slot 2
    bool onInit() override;                             // FUN_00765710 slot 4
    bool onMain() override;                             // FUN_007660f0 slot 5
    void setAlpha(float a) override;                    // FUN_00765530 slot 9
    uint32_t kind() const override;                     // FUN_00765550 slot 12
    void layout() override;                             // FUN_00766020 slot 13
    bool handleMessage(WindowMsg m) override;           // FUN_00766bb0 slot 14
    bool hitTest(float x, float y) override;            // FUN_00766b90 slot 15
    void onControlEvent(CWindowTaskControll* sender) override;     // FUN_00766b50
    void onControlCommand(CWindowTaskControll* sender) override;   // FUN_00765570
    void mediatorSlot2(CWindowTaskControll* sender) override;      // FUN_007655b0
    void mediatorSlot3(CWindowTaskControll* sender) override;      // FUN_007655f0
    void closeInput();                                  // FUN_00766a50
    void setEnabled(bool on);                           // FUN_00766ad0

    CTaskPtr<CSwfEngine> searchBtn;     // 0x36c data/deck/search_btn7.txt "StrBtn"
    CTaskPtr<CSwfEngine> resetBtn;      // 0x378 data/deck/search_btn6.txt "RstBtn"
    CTaskPtr<CWindowTaskModel> input;   // 0x384 the text input "StrDlg" (a CWindowModelInputValue)
    float x_ = 0, y_ = 0;               // 0x390
    float w_ = 0, h_ = 0;               // 0x398
    float alpha_ = 1.0f;                // 0x3a0
    bool inputOpen = false;             // 0x3a4
    uint8_t pad3a5_[3] = {};
    int32_t state = 0;                  // 0x3a8 1 typing, 2 reset pressed, 3 a text was entered (the list takes it)
    WChar text[0x100] = {};             // 0x3ac what to search for
    bool enabled = true;                // 0x5ac the buttons work
};
YO2_AT(CWindowTaskListSearch, searchBtn, 0x36c);
YO2_AT(CWindowTaskListSearch, input, 0x384);
YO2_AT(CWindowTaskListSearch, x_, 0x390);
YO2_AT(CWindowTaskListSearch, inputOpen, 0x3a4);
YO2_AT(CWindowTaskListSearch, state, 0x3a8);
YO2_AT(CWindowTaskListSearch, text, 0x3ac);
YO2_AT(CWindowTaskListSearch, enabled, 0x5ac);
YO2_SIZEOF(CWindowTaskListSearch, 0x5b0);

// yaneSDK smart_ptr<CCard> (0x10): the list owns its 5 cards through these
struct CardSlot {
    uint32_t vtbl = 0;
    CCard* card = nullptr;
    CardSlot* next = nullptr;
    CardSlot* prev = nullptr;
    void reset(CCard* c = nullptr);     // vf1 then the inline set: the card is freed when no other pointer shares it
};
YO2_SIZEOF(CardSlot, 0x10);

class CWindowDeckList : public CUGDialogBase {
public:
    CWindowDeckList(uint32_t side, int32_t kind, const WChar* title);   // FUN_007675b0
    ~CWindowDeckList() override;                        // FUN_00767c30 (FUN_00767bc0 deleting)
    bool onInit() override;                             // FUN_00767e50 slot 4
    bool onMain() override;                             // FUN_00768990 slot 5
    bool windowSlot15() override;                       // FUN_0076a380 slot 15
    void tick() override;                               // FUN_0076a8f0 slot 22
    void ugSlot23() override;                           // FUN_0076ad80 slot 23 (draw)
    bool isMouseOver() const override;                  // FUN_0076a2c0 slot 24
    bool canClose() override;                           // FUN_0076a8a0 slot 25
    void onMouse(CMouseEx* m) override;                 // FUN_0076a3f0 slot 26
    void onOpened() override;                           // FUN_0076a190 slot 27
    void onClose() override;                            // FUN_0076a230 slot 28
    void onClosed() override;                           // FUN_0076a2a0 slot 29

    void buildNameList();                               // FUN_007689d0
    int32_t listCount() const;                          // FUN_00768bc0 (island)
    int32_t indexOf(int32_t id) const;                  // FUN_00768be0
    uint32_t shownId(int32_t i) const;                  // FUN_00768c50
    uint32_t flags(int32_t i) const;                    // FUN_00768c70
    void slotPos(int32_t out[2], int32_t i) const;      // FUN_00768c90
    void openSearch();                                  // FUN_00768cd0
    void closeSearch();                                 // FUN_00769330
    void applySearch();                                 // FUN_007693a0
    void rebuild();                                     // FUN_00769550
    void warpTo(int32_t slot);                          // FUN_0076a140
    void makeScroll(bool fromInit);                     // the scroll bar (inline in onInit and rebuild)
    int32_t scrollValue();                              // inline: the scroll bar's value, 0 without one

    uint32_t pad414_ = 0;
    CTaskPtr<CWindowTaskScrollBase> scroll;   // 0x418 "CWindowTaskScrollH" (more than 5 cards)
    CTaskPtr<CWindowTaskListSearch> search;   // 0x424 (name lists)
    bool searchOn = false;                    // 0x430
    uint8_t pad431_[3] = {};
    uint32_t side;                            // 0x434 whose pile
    int32_t kind_;                            // 0x438
    int32_t frames = 0;                       // 0x43c open frames
    PlaneLoader sheets;                       // 0x440 duel/list_icon/list_icon.txt: 0 own, 1 the opponent's, 2.. flags
    CardSlot cards[5];                        // 0x478 the shown cards (list entries scroll .. scroll + 4)
    vc6::vector<int32_t> v4c8;                // 0x4c8 never filled
    int32_t sel = 0;                          // 0x4d8 the slot the keys move
    int32_t picked = 0;                       // 0x4dc cards picked (in order)
    uint8_t b4e0 = 0;                         // 0x4e0
    uint8_t pad4e1_[3] = {};
    int32_t count = 0;                        // 0x4e4 list entries
    int32_t titleOffset = 0;                  // 0x4e8 0x14 with a title line
    vc6::wstring title;                       // 0x4ec
    uint32_t pad4fc_ = 0;
};
YO2_AT(CWindowDeckList, scroll, 0x418);
YO2_AT(CWindowDeckList, search, 0x424);
YO2_AT(CWindowDeckList, side, 0x434);
YO2_AT(CWindowDeckList, sheets, 0x440);
YO2_AT(CWindowDeckList, cards, 0x478);
YO2_AT(CWindowDeckList, v4c8, 0x4c8);
YO2_AT(CWindowDeckList, sel, 0x4d8);
YO2_AT(CWindowDeckList, count, 0x4e4);
YO2_AT(CWindowDeckList, title, 0x4ec);
YO2_SIZEOF(CWindowDeckList, 0x500);

// FUN_007674a0: open the list at (x, y) under `parent` (priority 3000)
CWindowDeckList* deckListOpen(CTask* parent, int32_t x, int32_t y, int32_t style, uint32_t side, int32_t kind,
                              const WChar* title);

#if YO2_IN_EXE
#define g_deckListScroll YO2_EXE_VAR(int32_t, 0x012a6ee8)
#else
extern int32_t g_deckListScroll;   // DAT_012a6ee8: the scroll value the last list drew with
#endif

}   // namespace ds
