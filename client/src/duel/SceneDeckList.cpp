// CWindowDeckList and its search box (see SceneDeckList.h).
#include "SceneDeckList.h"

#include <cstdlib>
#include <cstring>

#include "CardDB.h"
#include "DuelText.h"
#include "Engine.h"
#include "EngineInternal.h"

namespace ds {

#if !YO2_IN_EXE
int32_t g_deckListScroll;   // DAT_012a6ee8
#endif

namespace {
enum : uint32_t { SE_OK = 0x10000001, SE_CANCEL = 0x10000002 };
enum : int32_t { INPUT_OK = 4000, INPUT_CANCEL = 4001 };
enum : int32_t { KEY_LEFT_ = 1, KEY_UP_ = 2, KEY_RIGHT_ = 3, KEY_DOWN_ = 4, KEY_OK_ = 6, KEY_CANCEL_ = 0x14 };
const char* const kFile = "C:\\yugionline\\yo2\\client\\src\\duel\\yo2DeckList.cpp";

// CWindowTaskModel::setPos (FUN_0064d340, inlined from System): the model's position and its element's
void setPos(CWindowTaskModel* w, float x, float y) {
    w->x_ = x;
    w->y_ = y;
    w->pos_.x = x;
    w->pos_.y = y;
}

// the pile zone a list kind zooms from (the open / close fade)
uint32_t kindZone(int32_t kind) {
    switch (kind) {
    case 1: return 0xc;
    case 2: return 0xd;
    case 3: return 0xe;
    case 4: return 0xf;
    default: return 0x10;
    }
}

// a position code (FUN_00742da0, the u16 builder): player | zone << 1 | index << 6 | face up << 14 | defense << 15
uint16_t makeCode(uint32_t player, bool faceUp, bool defense, uint32_t zone, uint32_t index) {
    return (uint16_t)((player & 1u) | (zone & 0x1fu) << 1 | (index & 0xffu) << 6 | (uint32_t)faceUp << 14 |
                      (uint32_t)defense << 15);
}

// wcsstr on the exe's UTF-16 strings
bool wcontains(const char16_t* hay, const char16_t* needle) {
    for (; *hay; hay++) {
        const char16_t *h = hay, *n = needle;
        while (*n && *h == *n) h++, n++;
        if (!*n) return true;
    }
    return false;
}
}   // namespace

// ================================================================ CWindowTaskListSearch

// @yo2 0x00765260 CWindowTaskListSearch::create (priority 10000)
CWindowTaskListSearch* CWindowTaskListSearch::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* s = new CWindowTaskListSearch;
    auto* r = dynamic_cast<CWindowTaskListSearch*>(s->CTask::create(parent, 10000));
    r->mediator_ = mediator;
    return r;
}

// @yo2 0x00765320 CWindowTaskListSearch::CWindowTaskListSearch
CWindowTaskListSearch::CWindowTaskListSearch() {
    searchBtn.setUser(this);
    resetBtn.setUser(this);
    input.setUser(this);
    setTaskName("CWindowTaskListSearch");
}

// @yo2 0x00765680 CWindowTaskListSearch::~CWindowTaskListSearch
// @yo2 0x00765630 CWindowTaskListSearch scalar deleting destructor
CWindowTaskListSearch::~CWindowTaskListSearch() = default;

// @yo2 0x00765530 slot 9
void CWindowTaskListSearch::setAlpha(float a) { alpha_ = a; }
// @yo2 0x00765550 slot 12
uint32_t CWindowTaskListSearch::kind() const { return 1; }
// @yo2 0x00766b90 slot 15: the mouse buttons go to the two buttons, not to this control
bool CWindowTaskListSearch::hitTest(float, float) { return false; }

// The buttons' notices go to this control's own mediator, naming this control.
// @yo2 0x00766b50
void CWindowTaskListSearch::onControlEvent(CWindowTaskControll*) { mediator_->onControlEvent(this); }
// @yo2 0x00765570
void CWindowTaskListSearch::onControlCommand(CWindowTaskControll*) { mediator_->onControlCommand(this); }
// @yo2 0x007655b0
void CWindowTaskListSearch::mediatorSlot2(CWindowTaskControll*) { mediator_->mediatorSlot2(this); }
// @yo2 0x007655f0
void CWindowTaskListSearch::mediatorSlot3(CWindowTaskControll*) { mediator_->mediatorSlot3(this); }

// @yo2 0x00766bb0 slot 14: a left click is a command to the mediator
bool CWindowTaskListSearch::handleMessage(WindowMsg m) {
    if (m.msg != 0x201) return false;   // WM_LBUTTONDOWN
    mediator_->onControlCommand(this);
    return true;
}

// @yo2 0x00765710 slot 4: the two buttons, playing, with this control as their event target
bool CWindowTaskListSearch::onInit() {
    w_ = h_ = 256.0f;
    x_ = y_ = 0;
    z_ = 2.0f;
    alpha_ = 1.0f;
    inputOpen = false;
    enabled = true;
    inheritTransform_ = true;
    searchBtn.set(swfCreate(this, 0, vc6::string("data/deck/search_btn7.txt"), 1));
    searchBtn.get()->setInstName("StrBtn");
    swfPlay(searchBtn.get(), 1);
    searchBtn.get()->inheritTransform_ = true;
    swfSetTarget(searchBtn.get(), this);
    resetBtn.set(swfCreate(this, 0, vc6::string("data/deck/search_btn6.txt"), 1));
    resetBtn.get()->setInstName("RstBtn");
    swfPlay(resetBtn.get(), 1);
    resetBtn.get()->inheritTransform_ = true;
    swfSetTarget(resetBtn.get(), this);
    layout();
    return true;
}

// @yo2 0x00766020 slot 13: reset at (x, y), search 25 to its right
void CWindowTaskListSearch::layout() {
    resetBtn.get()->pos_ = {x_, y_, z_};
    searchBtn.get()->pos_ = {x_ + 25.0f, y_, z_};
}

// @yo2 0x00766ad0 the buttons on / off
void CWindowTaskListSearch::setEnabled(bool on) {
    enabled = on;
    swfActivate(searchBtn.get(), on);
    swfActivate(resetBtn.get(), on);
}

// @yo2 0x00766a50 drop the text input
void CWindowTaskListSearch::closeInput() {
    if (!input.task()) return;
    input.get()->setTopmost(false);
    input.get()->destroy(kFile, 0xaf);
    inputOpen = false;
}

// @yo2 0x007660f0 slot 5: while the input is up, wait for its answer
bool CWindowTaskListSearch::onMain() {
    layout();
    if (!inputOpen || !input.task()) return true;
    CWindowTaskModel* d = input.get();
    if (inputValueResult(d) == INPUT_OK) {
        playSe(SE_OK, 0);
        vc6::wstring s = inputValueText(input.get());
        // ponytail: the exe formats with the typed text as the format (swprintf); "%" in a search is not expanded
        const WChar* t = s.c_str() ? s.c_str() : u"";
        int32_t n = 0;
        for (; t[n] && n < 0xff; n++) text[n] = t[n];
        text[n] = 0;
        input.get()->setTopmost(false);
        input.get()->destroy(kFile, 0x92);
        inputOpen = false;
        setEnabled(true);
        state = 3;
    } else if (inputValueResult(input.get()) == INPUT_CANCEL) {
        playSe(SE_CANCEL, 0);
        input.get()->setTopmost(false);
        input.get()->destroy(kFile, 0x9c);
        inputOpen = false;
        setEnabled(true);
        state = 0;
    }
    return true;
}

// @yo2 0x00766c00 slot 2: the buttons' events (CTmSwfObjEvent, tag 0x13)
int32_t CWindowTaskListSearch::receive(CTaskMessage* msg) {
    if (msg->tag == 0x13) {
        if (swfEventIs(msg, "search_btn7")) {   // search: ask for the text at the right edge
            playSe(SE_OK, 0);
            input.set(inputValueCreate(this, 0, 0, 1, 2));
            input.get()->setInstName("StrDlg");
            float w = input.get()->w_;
            setPos(input.get(), 1024.0f - w, 88.0f);
            inputOpen = true;
            setEnabled(false);
            state = 1;
            input.get()->setTopmost(true);
        } else if (swfEventIs(msg, "search_btn6")) {   // reset
            playSe(SE_OK, 0);
            state = 2;
        }
    }
    return CWindowTaskControll::receive(msg);
}

// @yo2 0x00766800 CWindowModelInputValue::text: what its input box holds
vc6::wstring inputValueText(CWindowTaskModel* d) { return taskInputText(inputValueBox(d)); }

// ================================================================ CWindowDeckList

void CardSlot::reset(CCard* c) {
    if (card) {
        if (next == this) {
            delete card;
        } else {
            next->prev = prev;
            prev->next = next;
        }
    }
    card = c;
    next = prev = c ? this : nullptr;
}

// @yo2 0x007674a0
CWindowDeckList* deckListOpen(CTask* parent, int32_t x, int32_t y, int32_t style, uint32_t side, int32_t kind,
                              const WChar* title) {
    auto* d = new CWindowDeckList(side, kind, title);
    placeThin(d, (float)x, (float)y, style);
    return dynamic_cast<CWindowDeckList*>(d->CTask::create(parent, 3000));
}

// @yo2 0x007675b0 CWindowDeckList::CWindowDeckList
CWindowDeckList::CWindowDeckList(uint32_t side_, int32_t kind, const WChar* title_)
    : side(side_), kind_(kind) {
    planeConstruct(&sheets, (uint8_t)(uintptr_t)title_);
    if (title_) {
        titleOffset = 0x14;
        title = title_;
    } else {
        titleOffset = 0;
    }
    fade_ = 0x100;
    dragging_ = false;
    answered_ = false;
    result_ = 0;
    scroll.setUser(this);
    search.setUser(this);
    searchOn = false;
    setTaskName("CWindowDeckList");
}

// @yo2 0x00767c30 CWindowDeckList::~CWindowDeckList
// @yo2 0x00767bc0 CWindowDeckList scalar deleting destructor
CWindowDeckList::~CWindowDeckList() {
    result_ = 0;
    for (CardSlot& s : cards) s.reset();
    planeDestruct(&sheets);
}

// @yo2 0x00768bc0
int32_t CWindowDeckList::listCount() const { return (int32_t)engListCount(); }
// @yo2 0x00768c50
uint32_t CWindowDeckList::shownId(int32_t i) const { return engListShownId(i); }
// @yo2 0x00768c70
uint32_t CWindowDeckList::flags(int32_t i) const { return engListFlags((uint32_t)i); }

// @yo2 0x00768be0 the entry showing card `id`, -1 none (it compares the 0/1 of "entry i is id" through cardPropId,
// as the exe does)
int32_t CWindowDeckList::indexOf(int32_t id) const {
    for (int32_t i = 0; i < listCount(); i++) {
        if (cardPropId((int)(shownId(i) == (uint32_t)id)) != 0) return i;
    }
    return -1;
}

// @yo2 0x00768c90 where slot i's card sits: 64 apart around the window's centre
void CWindowDeckList::slotPos(int32_t out[2], int32_t i) const {
    out[0] = (i - 2) * 0x40 + cx_;
    out[1] = titleOffset + cy_;
}

int32_t CWindowDeckList::scrollValue() { return scroll.task() ? scroll.get()->value_ : 0; }

// @yo2 0x007689d0 the name lists (kinds 0x4b..0x4e): every declarable card of the database, sorted
// @yo2 0x00768b80 qsort comparator: by the cards' name order (CARD_Sort)
static int deckNameCmp(const void* a, const void* b) {
    return cardSortKey(cardPropId((int)*static_cast<const uint32_t*>(a))) -
           cardSortKey(cardPropId((int)*static_cast<const uint32_t*>(b)));
}

void CWindowDeckList::buildNameList() {
    if (kind_ < 0x4b || kind_ == 0xff || kind_ == 0xfe) return;
    engZero(&g_eng.deckList, 0x6014);
    for (int32_t i = 1; i < 0xcb8; i++) {
        int id = cardNormalize(cardPropId(i));
        if (!id || engIsTokenKind(id) || indexOf(id) >= 0 || !cardListable(i)) continue;
        bool add;
        switch (kind_) {
        case 0x4b: add = true; break;
        case 0x4c: add = !engIsFusion(id); break;
        case 0x4d: add = cardIsMonster(id) && !engIsFusion(id); break;
        case 0x4e: add = cardIsMonster(id); break;
        default: add = false; break;
        }
        if (!add) continue;
        uint32_t& w = g_eng.deckList.card[listCount()];
        w = ((w ^ (uint32_t)i) & 0x3fffu) ^ w;
        g_eng.deckList.count += listCount() < 0xfff;
    }
    // FUN_00b09c4f qsort (ponytail: the CRT's qsort; MSVC 6's may order equal names differently)
    std::qsort(g_eng.deckList.card, g_eng.deckList.count, sizeof(uint32_t), deckNameCmp);
}

void CWindowDeckList::makeScroll(bool fromInit) {
    scroll.set(scrollHCreate(this, static_cast<IWindowTaskMediator*>(this), 0));
    scroll.get()->setInstName("CWindowTaskScrollH スクロールバーの設定");
    scroll.get()->x_ = 8.0f;
    scroll.get()->y_ = (float)(titleOffset + 0xc0);
    scroll.get()->length_ = 384.0f;
    if (fromInit) scroll.get()->setMax(0);
    scroll.get()->page_ = 5;
}

// @yo2 0x00767e50 slot 4: the window (400 wide), the icon sheets, the list and its first 5 cards
bool CWindowDeckList::onInit() {
    CWindowModelThin::onInit();
    textField_.get()->text_.get()->setAlign(0);
    w_ = 400.0f;
    h_ = (float)(titleOffset + 0xd8);
    layout();
    planeLoad(&sheets, vc6::string("data/Y/duel/list_icon/list_icon.txt"));
    sel = 0;
    frames = 0;
    picked = 0;
    uint32_t zone = kindZone(kind_);
    buildNameList();
    count = listCount();
    if (count > 5) makeScroll(true);
    cx_ = 0x200;   // DAT_00bed658
    cy_ = 300;
    setBox((int32_t)w_, (int32_t)h_);
    bool faceUp = true;
    if (kind_ == 0x4a) {   // the opponent's cards, face down
        faceUp = false;
        side ^= 1u;
    }
    uint16_t code = makeCode(side, faceUp, false, zone, 0);
    for (int32_t i = 0; i < count && i < 5; i++) {
        CCard* c = new CCard((uint8_t)shownId(i));
        c->upright = 1;
        c->order_ = i + 0x701;
        c->moveTo(&code);
        c->snap();
        cards[i].reset(c);
        c->active_ = false;
        c->drawNow = 0;
    }
    return true;
}

// @yo2 0x00768990 slot 5
bool CWindowDeckList::onMain() {
    if (unk3e8_) return false;
    tick();
    if (running_) ugSlot23();
    return true;
}

// @yo2 0x00768cd0 the search box of the name lists
void CWindowDeckList::openSearch() {
    if (kind_ >= 0x4b && kind_ != 0xff && kind_ != 0xfe) searchOn = true;
    if (!searchOn) return;
    search.set(CWindowTaskListSearch::create(this, static_cast<IWindowTaskMediator*>(this)));
    search.get()->setInstName("Search");
    search.get()->x_ = 344.0f;
    search.get()->y_ = (float)(titleOffset + 0xa7);
    search.get()->z_ = 7.0f;
}

// @yo2 0x00769330
void CWindowDeckList::closeSearch() {
    searchOn = false;
    if (search.task()) search.get()->destroy(kFile, 0x204);
}

// @yo2 0x007693a0 keep the entries whose name (or, in Japanese, reading) holds the search text
void CWindowDeckList::applySearch() {
    static DuelCardList found;   // the exe's is on the stack (0x6014 B)
    engZero(&found, 0x6014);
    for (int32_t i = 0; i < listCount(); i++) {
        bool hit = false;
        if (langIsJapanese()) {
            char16_t key[0x100];
            textReadingKey(key, cardReading(cardPropId((int)shownId(i))));
            if (wcontains(key, search.get()->text)) hit = true;
        }
        const char16_t* name = reinterpret_cast<const char16_t*>(textCardName(cardPropId((int)shownId(i))));
        if (wcontains(name, search.get()->text) || hit) {
            uint32_t& w = found.card[found.count];
            w = ((w ^ shownId(i)) & 0x3fffu) ^ w;
            found.count += found.count < 0xfff;
        }
    }
    engListCopyFrom(&found);
    rebuild();
}

// @yo2 0x00769550 the list changed (search / reset): the scroll bar and the 5 cards again
void CWindowDeckList::rebuild() {
    count = listCount();
    if (count < 6) {
        if (scroll.task()) scroll.get()->destroy(kFile, 0x241);
    } else {
        if (!scroll.task()) makeScroll(false);
        scroll.get()->setMax(count - 5);
        scroll.get()->setValue(0);
    }
    bool faceUp = true;
    if (kind_ == 0x4a) {
        faceUp = false;
        side ^= 1u;
    }
    uint16_t code = makeCode(side, faceUp, false, 0x10, 0);
    for (int32_t i = 0; i < 5; i++) {
        if (i >= count) {
            cards[i].reset();
            continue;
        }
        if (cards[i].card) continue;
        CCard* c = new CCard((uint8_t)shownId(i));
        int32_t p[2];
        slotPos(p, i);
        c->order_ = i + 0x701;
        c->upright = 1;
        c->moveTo(&code);
        c->snap();
        cards[i].reset(c);
        c->pin(p[0], p[1]);
        c->active_ = true;
        c->drawNow = 0;
    }
}

// @yo2 0x0076a140 the cursor onto slot i (auto focus)
void CWindowDeckList::warpTo(int32_t i) {
    if (!duelAutoFocus()) return;
    int32_t p[2];
    slotPos(p, i);
    cursorWarp(p[0], p[1]);
}

// @yo2 0x0076a190 slot 27: faded in
void CWindowDeckList::onOpened() {
    for (CardSlot& s : cards) {
        if (s.card) s.card->active_ = true;
    }
    if (count > 5) scroll.get()->setMax(count - 5);
    if (title.size()) setText(title.c_str() ? title.c_str() : u"");
    openSearch();
    warpTo(sel);
}

// @yo2 0x0076a230 slot 28: answered, fading out
void CWindowDeckList::onClose() {
    for (CardSlot& s : cards) {
        if (s.card) s.card->active_ = false;
    }
    if (count > 5) scroll.get()->setMax(0);
    closeSearch();
    setTextA("");
}

// @yo2 0x0076a2a0 slot 29
void CWindowDeckList::onClosed() { unk3e8_ = 1; }

// @yo2 0x0076a2c0 slot 24: inside the box, above its bottom 24 pixels
bool CWindowDeckList::isMouseOver() const {
    int32_t mx, my;
    mousePos(appMouse(), &mx, &my);
    int32_t dx = mx - (cx_ - boxW_ / 2), dy = my - (cy_ - boxH_ / 2);
    return dx > 0 && dx < boxW_ && dy > 0 && dy < boxH_ - 0x18;
}

// @yo2 0x0076a380 slot 15: no dragging while fading, answered, or typing a search
bool CWindowDeckList::windowSlot15() {
    if (fade_ != 0) return false;
    if (answered_) return isMouseOver();
    if (searchOn && search.get()->state != 0) return false;
    return CUGDialogBase::windowSlot15();
}

// @yo2 0x0076a8a0 slot 25: once every card has settled
bool CWindowDeckList::canClose() {
    for (CardSlot& s : cards) {
        if (s.card && (s.card->anim != 0x100 || s.card->flash != 0)) return false;
    }
    return true;
}

// @yo2 0x0076a3f0 slot 26: pick a card (or several, in order), right click to close or to finish
void CWindowDeckList::onMouse(CMouseEx* m) {
    int32_t mx, my;
    mousePos(m, &mx, &my);
    if (isMouseOver()) {
        for (int32_t i = 0; i < 5; i++) {
            CCard* c = cards[i].card;
            if (!c || !c->hit(mx, my)) continue;
            g_cardHover = c;
            sel = i;
            int32_t idx = i + (scroll.task() ? scroll.get()->value_ : 0);
            bool pick = false;
            if (kind_ < 7 || kind_ > 0x48) {   // one card
                if (kind_ > 5) {
                    cardHoverMark();
                    if (mouseClicked(m) || keyPushed(KEY_OK_)) {
                        c->flash = 1;
                        c->flashLevel = 0x100;
                        answered_ = true;
                        result_ = 1;
                        if (kind_ < 0x4b || kind_ == 0xff || kind_ == 0xfe) {
                            engListSelect((uint32_t)idx);
                        } else {
                            engSendChoice((uint32_t)cardPropId((int)(g_eng.deckList.card[idx] & 0x3fff)));
                        }
                        engListSetOrder(idx, ++picked);
                        pick = true;
                    }
                }
            } else if (engListOrder(idx) == 0) {   // several: pick the next one
                cardHoverMark();
                if (mouseClicked(m) || keyPushed(KEY_OK_)) {
                    int32_t need = kind_ > 0x26 ? kind_ - 0x27 : kind_ - 6;
                    if (kind_ == 0x48 || kind_ == 0x47) need = (int32_t)g_eng.deckList.count;
                    c->flash = 1;
                    c->flashLevel = 0x100;
                    engListSetOrder(idx, ++picked);
                    if (listCount() <= need) need = listCount();
                    if (need <= picked) {
                        answered_ = true;
                        result_ = picked;
                    }
                    pick = true;
                }
            } else if (mouseClicked(m) || keyPushed(KEY_OK_)) {   // unpick: the later picks move up
                int32_t o = (int32_t)engListOrder(idx);
                engListSetOrder(idx, 0);
                for (int32_t j = 0; j < listCount(); j++) {
                    if (o < (int32_t)engListOrder(j)) engListSetOrder(j, (int)engListOrder(j) - 1);
                }
                picked--;
                pick = true;
            }
            if (pick) {
                mouseConsume(m);
                return;
            }
            break;
        }
    }
    if (mouseRightClicked(m) || keyPushed(KEY_CANCEL_)) {
        if (kind_ < 6) {
            close(0);
            mouseConsume(m);
            return;
        }
        if (kind_ > 0x27 && kind_ < 0x49 && (picked != 0 || kind_ == 0x48)) {   // done picking
            answered_ = true;
            result_ = picked;
            mouseConsume(m);
        }
    }
}

// @yo2 0x0076a8f0 slot 22: the search's results, the wheel and the keys scroll, the cards follow their slots
void CWindowDeckList::tick() {
    CUGDialogBase::tick();
    if (fade_ != 0) return;
    frames++;
    if (answered_) return;
    if (searchOn) {
        int32_t st = search.get()->state;
        if (st == 1) return;
        if (st == 2) {   // reset: the whole list again
            buildNameList();
            rebuild();
            search.get()->state = 0;
            return;
        }
        if (st == 3) {
            applySearch();
            search.get()->state = 0;
            search.get()->closeInput();
            return;
        }
    }
    int32_t w = mouseWheelDelta(appMouse());
    if (w >= 1) {
        int32_t v = scrollValue() + 1;
        if (count - 5 < v) v = count - 5;
        if (scroll.task()) scroll.get()->setValue(v);
    } else if (w < 0) {
        int32_t v = scrollValue() - 1;
        if (v < 0) v = 0;
        if (scroll.task()) scroll.get()->setValue(v);
    }
    bool moved = keyPushed(KEY_LEFT_) || keyPushed(KEY_RIGHT_) || keyPushed(KEY_UP_) || keyPushed(KEY_DOWN_);
    if (keyPushed(KEY_DOWN_)) {
        if (sel == 4) {
            int32_t v = scrollValue() + 1;
            if (count - 5 < v) v = count - 5;
            if (scroll.task()) scroll.get()->setValue(v);
        } else if (sel < listCount() - 1) {
            sel++;
        }
    }
    if (keyPushed(KEY_RIGHT_)) {
        if (sel == 0) {
            int32_t v = scrollValue() - 1;
            if (v < 0) v = 0;
            if (scroll.task()) scroll.get()->setValue(v);
        } else {
            sel--;
        }
    }
    if (moved) warpTo(sel);
    for (int32_t i = 0; i < 5; i++) {
        if (!cards[i].card) continue;
        int32_t p[2];
        slotPos(p, i);
        cards[i].card->pin(p[0], p[1]);
    }
}

// @yo2 0x0076ad80 slot 23: the window zooming from its pile while it fades; open, each card with its owner frame,
// its flag icons, a face-up monster's ATK / DEF, and its pick number
void CWindowDeckList::ugSlot23() {
    int32_t mz = maxZ();
    float zf = (float)mz;
    if (fade_ != 0) {
        int32_t px, py;
        matPos(side, kindZone(kind_), 0, &px, &py);
        int32_t f = fade_ > 0 ? 0x100 - fade_ : fade_ + 0x100;
        int32_t k = g_sinTable[(uint32_t)(f / 2 - 0x80) & 0x1ff] >> 8;   // 0..0x100
        int32_t bw = boxW_ * k / 256, bh = boxH_ * k / 256;
        int32_t x = (cx_ - px) * k / 256 + px - (bw >> 1);
        int32_t y = (cy_ - py) * k / 256 + py - (bh >> 1);
        setPanelAlpha((float)k * 0.00390625f);
        x_ = (float)x;
        y_ = (float)y;
        w_ = (float)bw;
        h_ = (float)bh;
        layout();
        return;
    }
    int32_t x0 = cx_ - boxW_ / 2, y0 = cy_ - boxH_ / 2;
    setPanelAlpha(1.0f);
    x_ = (float)x0;
    y_ = (float)y0;
    w_ = (float)boxW_;
    h_ = (float)boxH_;
    layout();
    int32_t top = 0;
    if (scroll.task()) top = scroll.get()->value_;
    if (g_deckListScroll != top) g_deckListScroll = top;
    CNumber num{0x00bebbe4, 100.0f, nullptr, 10};   // a CNumber on the stack, sharing the number sheet
    numberAcquire();
    int32_t e = top;
    for (int32_t i = 0; i < 5; i++, e++) {
        CCard* c = cards[i].card;
        if (!c) continue;
        int32_t p[2];
        slotPos(p, i);
        uint32_t id = shownId(e);
        uint32_t fl = flags(e);
        int32_t sw, sh;
        // the owner frame above the card (sheet 1: the opponent's, or every card of kind 0x4a)
        CSpriteElmOlder* s = planeSprite(&sheets, (kind_ == 0x4a || (fl & 0x8000)) ? 1 : 0);
        spriteSize(s, &sw, &sh);
        spriteSetZ(s, zf + 2.0f);
        spriteDrawOpaque(s, p[0] - sw / 2, -(g_miniH / 2) - sh / 2 + p[1] - 8, nullptr, nullptr, 0);
        // the flag icons (sheets 2.. for bits 1..), centred in a row
        spriteSize(planeSprite(&sheets, 2), &sw, &sh);
        uint32_t bits = (uint32_t)((int32_t)fl >> 1) & 0xffffbfffu;
        int32_t ix = p[0] - (int32_t)__builtin_popcount(bits) * sw / 2;
        for (int32_t sheet = 2; bits; sheet++, bits = (uint32_t)((int32_t)bits >> 1)) {
            if (!(bits & 1)) continue;
            planeSetZ(&sheets, sheet, zf + 3.0f);
            spriteDrawOpaque(planeSprite(&sheets, sheet), ix, -(g_miniH / 2) - sh / 2 + p[1] - 8, nullptr, nullptr,
                             0);
            ix += sw;
        }
        uint16_t code;
        c->getCode(&code);
        if ((code & CODE_FACEUP) && cardIsMonster(cardPropId((int)id))) {   // ATK / DEF under it
            num.z = zf;
            num.sheet = planeSprite(g_numberSheet, 0);
            int32_t f = planeFrames(g_numberSheet, 0);
            num.frames = f ? f : 10;
            int32_t ny = g_miniH / 2 + 4 + p[1];
            num.glyph(p[0] + 3, ny, 10, 0);
            num.draw(p[0] - 3, ny, cardAtk(cardPropId((int)id)), false, 0);
            num.draw(p[0] + 0x1b, ny, cardDef(cardPropId((int)id)), false, 0);
        }
        c->setZ(ftol(zf + 1.0f));
        c->setCard((int32_t)id);
        c->code = (uint16_t)((((((uint32_t)(top + i) << 6) ^ c->code) & 0x3fc0u) ^ c->code));
        c->drawNow = 1;
        c->draw();
        c->drawNow = 0;
        if (listCount() > 1 && kind_ > 6 && kind_ < 0x49 && engListOrder(e) != 0) {   // its pick number
            num.sheet = planeSprite(g_numberSheet, 7);
            int32_t f = planeFrames(g_numberSheet, 7);
            num.frames = f ? f : 10;
            num.z = zf + 10.0f;
            num.drawCentred(p[0], p[1], (int32_t)engListOrder(e), false, 0);
        }
    }
    numberRelease();
}

}   // namespace ds
