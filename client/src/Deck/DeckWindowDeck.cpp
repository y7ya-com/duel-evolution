// yo2DeckWindow.cpp, part 2: CWindowTaskDeck, the deck panel (0x00948360..0x009524f0).
// Four grids of CWindowTaskDeckCard, 15 per row, 28 px apart (cards overlap; see CWindowTaskDeckCard::hit):
//   cards[0] main      (x 262, y 96 - 80 * scroll line)    cards[1] side (one row, 14 px apart past 15 cards)
//   cards[2] extra     (x 262, y 96, shown instead of main + side when the Extra tab is in front)
//   cards[3] missing   cards the trunk doesn't have, one row at a time under the main grid
// The counters (CWindowTaskDeckNumber) follow every add / remove.
#include "DeckWindow.h"

#include <initializer_list>

namespace dk {

CWindowTaskDeck* g_deckWindow = nullptr;

// ---------------------------------------------------------------- creation

// @yo2 0x00948360 new CWindowTaskDeck (0x498); it becomes the one g_deckWindow
CWindowTaskDeck* deckWindowCreate(void* parent, void* mediator, void* preview) {
    CWindowTaskDeck* d = new CWindowTaskDeck();
    d->construct();
    g_deckWindow = d;
    d->setPreview(preview);
    d = (CWindowTaskDeck*)taskCreate(d, parent, 10000);
    if (d) d->mediator = mediator;
    return d;
}

void sortListConstruct(void* sort);   // TODO(Deck A) FUN_009215f0 util: CSortList::CSortList
void sortListDestruct(void* sort);    // TODO(Deck A) FUN_006121c0 / FUN_0052bfa0: the sort list's own members

// @yo2 0x00948450
void CWindowTaskDeck::construct() {
    bar.setUser(this);
    number.setUser(this);
    for (auto& p : frame) p.setUser(this);
    for (auto& p : field) p.setUser(this);
    for (auto& p : scroll) p.setUser(this);
    for (auto& p : tab) p.setUser(this);
    front = nullptr;
    sortListConstruct(&sort);
    preview = nullptr;
    expanded = 0;
    posX = posY = w = h = posZ = 0.0f;
    mainCount = sideCount = extraCount = missingCount = 0;
    live = 1;
    mainScrollOn = sideScrollOn = 0;
    lastWheel = 0;
    taskSetTaskName(this, "CWindowTaskDeck");
}

// @yo2 0x00948a90 deleting destructor   @yo2 0x00948b40 destructor: the sort list, the four grids, the TaskPtrs
// (the islands @yo2 0x00948ac0 @yo2 0x00948ae0 @yo2 0x00948b00 @yo2 0x00948b20 @yo2 0x00952920 are its
// TaskPtr-destructor jumps)
void CWindowTaskDeck::destruct() {
    sort.keys.clear();
    sortListDestruct(&sort);
    for (int g = 3; g >= 0; g--) cards[g].clear();
}

// @yo2 0x00948990 vf12 window kind
uint32_t deckKind() { return 0x17; }
// @yo2 0x009489b0 vf15 never hit itself (its children are)
uint32_t deckHit(float, float) { return 0; }

// @yo2 0x009489d0 mediator vf01   @yo2 0x00948a10 vf02   @yo2 0x00948a50 vf03: pass the event up
void CWindowTaskDeck::relay(int slot) { notify(slot); }

// @yo2 0x009524f0 vf06: the panel is going away
void deckGone() { g_deckWindow = nullptr; }

// ---------------------------------------------------------------- rules and lookups

// @yo2 0x0094edf0 no room for one more copy: fusion frames go to the extra deck (30), the rest to main (80)
// and then side (15)
bool CWindowTaskDeck::full(uint32_t card) const {
    int32_t f = cardFrame(cardKonamiId(card));
    if (f >= 2 && f <= 3) return extraCount > 0x1d;
    return mainCount > 0x4f && sideCount > 0xe;
}

// @yo2 0x00951620
bool CWindowTaskDeck::extraView() { return front != tab[0].get(); }

// @yo2 0x0094ecc0 copies of a card in main + side + extra
int32_t CWindowTaskDeck::copies(uint32_t card) {
    int32_t n = 0;
    for (int g = 0; g < 3; g++)
        for (CWindowTaskDeckCard* c : cards[g])
            if (c->card == card) n++;
    return n;
}

// @yo2 0x00951820 the type counters a main-deck card belongs to (card frame of its Konami id)
void CWindowTaskDeck::countType(uint32_t card, bool remove) {
    int k;
    switch (cardFrame(cardKonamiId(card))) {
    case 0: case 10: k = DC_NORMAL; break;
    case 1: case 6: case 7: case 8: case 9: case 0xb: k = DC_EFFECT; break;
    case 4: case 5: k = DC_RITUAL; break;
    case 0xd: k = DC_MAGIC; break;
    case 0xe: k = DC_TRAP; break;
    default: return;   // fusions (2, 3) and the rest are not counted
    }
    if (CWindowTaskDeckNumber* n = number.get()) remove ? n->sub(k, 1) : n->add(k, 1);
}

// @yo2 0x00951670 enable / disable the tabs and every card
void CWindowTaskDeck::setEnabled(bool on) {
    live = on;
    if (CWindowTaskDeckTab* t = tab[0].get()) t->enabled = on;
    if (CWindowTaskDeckTab* t = tab[1].get()) t->enabled = on;
    for (int g = 0; g < 4; g++)
        for (CWindowTaskDeckCard* c : cards[g]) c->enabled = on;
}

// ---------------------------------------------------------------- adding and removing cards

int32_t cardSortKey(uint32_t card);   // TODO(Deck A) FUN_00933590 util: the grid order key of a card

// Where a card goes in a key-sorted grid: after the cards of its key with a smaller or equal id, or before the
// first card with a greater key, or at the end.
static size_t sortedSlot(const VcVector<CWindowTaskDeckCard*>& v, uint32_t card) {
    int32_t key = cardSortKey(card);
    size_t i = 0, n = v.size();
    for (; i < n; i++)
        if (cardSortKey(v[i]->card) == key) break;
    if (i < n) {
        for (; i < n && cardSortKey(v[i]->card) == key; i++)
            if ((int32_t)card < (int32_t)v[i]->card) break;
        return i;
    }
    for (i = 0; i < n; i++)
        if (key < cardSortKey(v[i]->card)) break;
    return i;
}

void deckCardInsert(VcVector<CWindowTaskDeckCard*>& v, size_t pos, CWindowTaskDeckCard* c);

CWindowTaskDeckCard* CWindowTaskDeck::newCard(uint32_t card) {
    CWindowTaskDeckCard* c = deckCardCreate(this, &mediatorVtbl);
    if (c) c->setCard(card);
    return c;
}

// @yo2 0x0094d940
bool CWindowTaskDeck::addMain(uint32_t card) {
    mainCount++;
    if (CWindowTaskDeckNumber* n = number.get()) n->add(DC_MAIN, 1);
    countType(card, false);
    CWindowTaskDeckCard* c = newCard(card);
    deckCardInsert(cards[0], sortedSlot(cards[0], card), c);
    if (!extraView()) mainGridScroll();
    return true;
}

// @yo2 0x0094dcb0
bool CWindowTaskDeck::addSide(uint32_t card) {
    sideCount++;
    if (CWindowTaskDeckNumber* n = number.get()) n->add(DC_SIDE, 1);
    CWindowTaskDeckCard* c = newCard(card);
    deckCardInsert(cards[1], sortedSlot(cards[1], card), c);
    return true;
}

// @yo2 0x0094e020 the extra grid is sorted by card id only
bool CWindowTaskDeck::addExtra(uint32_t card) {
    extraCount++;
    if (CWindowTaskDeckNumber* n = number.get()) n->add(DC_FUSION, 1);
    CWindowTaskDeckCard* c = newCard(card);
    size_t i = 0;
    while (i < cards[2].size() && !((int32_t)card < (int32_t)cards[2][i]->card)) i++;
    deckCardInsert(cards[2], i, c);
    return true;
}

// @yo2 0x0094e2e0
bool CWindowTaskDeck::addMissing(uint32_t card) {
    missingCount++;
    if (CWindowTaskDeckNumber* n = number.get()) n->add(DC_DEFICIENCY, 1);
    CWindowTaskDeckCard* c = newCard(card);
    deckCardInsert(cards[3], sortedSlot(cards[3], card), c);
    if (!extraView()) missingGridScroll();
    return true;
}

static void killCard(VcVector<CWindowTaskDeckCard*>& v, uint32_t index) {
    CWindowTaskDeckCard* c = v[index];
    c->destroyPics();
    taskDestroy(c);
    v.erase(index);
}

// @yo2 0x0094e640 (an index past the end is ignored, like the exe's walk)
bool CWindowTaskDeck::removeMain(uint32_t index) {
    mainCount--;
    if (CWindowTaskDeckNumber* n = number.get()) n->sub(DC_MAIN, 1);
    if (index >= cards[0].size()) return true;
    uint32_t card = cards[0][index]->card;
    killCard(cards[0], index);
    countType(card, true);
    if (!extraView()) mainGridScroll();
    return true;
}

// @yo2 0x0094e7c0
bool CWindowTaskDeck::removeSide(uint32_t index) {
    sideCount--;
    if (CWindowTaskDeckNumber* n = number.get()) n->sub(DC_SIDE, 1);
    if (index < cards[1].size()) killCard(cards[1], index);
    return true;
}

// @yo2 0x0094e900
bool CWindowTaskDeck::removeExtra(uint32_t index) {
    extraCount--;
    if (CWindowTaskDeckNumber* n = number.get()) n->sub(DC_FUSION, 1);
    if (index < cards[2].size()) killCard(cards[2], index);
    return true;
}

// @yo2 0x0094ea20 main   @yo2 0x0094eb00 side   @yo2 0x0094ebe0 extra:
// a dropped drag snaps the card back to where it was
void CWindowTaskDeck::cancelDrag(int grid, uint32_t index) {
    if (index >= cards[grid].size()) return;
    CWindowTaskDeckCard* c = cards[grid][index];
    c->posX = (float)c->f394;
    c->posY = (float)c->f398;
    c->posZ = (float)c->f39c;
    c->layout();
    c->dragging = 0;
}

// @yo2 0x0094fe00 drop the whole missing grid
void CWindowTaskDeck::clearMissing() {
    while (cards[3].size()) killCard(cards[3], 0);
    missingCount = 0;
    if (CWindowTaskDeckNumber* n = number.get()) n->resetDeficiency();
}

// ---------------------------------------------------------------- scrolling

// main-grid rows on screen: 5, or 6 when expanded; one less... see mainGridScroll
int32_t CWindowTaskDeck::mainVisibleRows() const {
    if (missingCount > 0) return expanded ? 4 : 3;
    return expanded ? 6 : 5;
}

// @yo2 0x00951ad0 the main grid's scroll range: one line per row of 15 past what fits
void CWindowTaskDeck::mainGridScroll() {
    int32_t n = (int32_t)cards[0].size();
    int32_t rows = mainVisibleRows();
    if (CWindowTaskDeckScroll* s = scroll[0].get())
        *(float*)((uint8_t*)s + 0x468) = missingCount > 0 ? (expanded ? 376.0f : 272.0f) : (expanded ? 496.0f : 392.0f);
    int32_t extra = n > rows * 15 ? (n - rows * 15 + 14) / 15 : 0;
    if (!extra) {
        scrollBy(0, 1);
        setLive(0, false);
        setMainScrollOn(false);
        return;
    }
    if (CWindowTaskDeckScroll* s = scroll[0].get()) s->setMax(extra);
    setLive(0, true);
    setMainScrollOn(true);
}

// @yo2 0x00951e40 the missing grid scrolls one row (15 cards) at a time
void CWindowTaskDeck::missingGridScroll() {
    if (missingCount <= 0) return;
    if (CWindowTaskDeckScroll* s = scroll[1].get()) *(float*)((uint8_t*)s + 0x468) = 88.0f;
    uint32_t n = (uint32_t)cards[3].size();
    if (n > 0xf) {
        uint32_t lines = n / 0xf;
        if (n % 0xf == 0) lines--;
        if (CWindowTaskDeckScroll* s = scroll[1].get()) s->setMax((int32_t)lines);
        setLive(1, true);
        setSideScrollOn(true);
        return;
    }
    scrollBy(1, 1);
    setLive(1, false);
    setSideScrollOn(false);
}

// @yo2 0x00951cd0 @yo2 0x00951f50 (islands) saveDrag
void CWindowTaskDeck::saveDrag(int s) {
    if (CWindowTaskDeckScroll* p = scroll[s].get()) p->saveDrag();
}
// @yo2 0x00951d00 @yo2 0x00951f80 (islands) lineFromDrag
int32_t CWindowTaskDeck::lineFromDrag(int s) {
    CWindowTaskDeckScroll* p = scroll[s].get();
    return p ? p->lineFromDrag() : 0;
}
// @yo2 0x00951d30 @yo2 0x00951fb0
void CWindowTaskDeck::scrollBy(int s, int32_t n) {
    if (CWindowTaskDeckScroll* p = scroll[s].get()) p->scrollBy(n);
}
// @yo2 0x00951d60 @yo2 0x00951fe0
int32_t CWindowTaskDeck::line(int s) {
    CWindowTaskDeckScroll* p = scroll[s].get();
    return p ? p->line : 0;
}
// @yo2 0x00951d90 @yo2 0x00952010
void CWindowTaskDeck::setLive(int s, bool on) {
    if (CWindowTaskDeckScroll* p = scroll[s].get()) p->live = on;
}
// @yo2 0x00951dc0 @yo2 0x00952040
bool CWindowTaskDeck::live_(int s) {
    CWindowTaskDeckScroll* p = scroll[s].get();
    return p && p->live;
}
// @yo2 0x00951df0
void CWindowTaskDeck::setMainScrollOn(bool on) {
    mainScrollOn = on;
    scrollEnable(scroll[0].get(), on);
}
// @yo2 0x00952070
void CWindowTaskDeck::setSideScrollOn(bool on) {
    sideScrollOn = on;
    scrollEnable(scroll[1].get(), on);
}

// @yo2 0x0094c2c0 vf05 main: the mouse wheel scrolls the grid under the cursor
uint32_t CWindowTaskDeck::main() {
    layout();
    int32_t wheel = mouseWheel();
    int32_t mx, my;
    if (live_(0) && wheel != lastWheel) {
        mousePos(&mx, &my);
        if (elemVisible(scroll[0].get())) {
            int32_t bottom = (missingCount > 0 ? 480 - 120 : 480) + (expanded ? 0x68 : 0);
            if (mx >= 0x100 && mx <= 0x2d8 && my >= 0x58 && my <= bottom) {
                lastWheel = wheel;
                scrollBy(0, wheel);
            }
        }
    }
    if (live_(1) && wheel != lastWheel) {
        mousePos(&mx, &my);
        if (elemVisible(scroll[1].get())) {
            bool mainTab = front == tab[0].get();
            int32_t top = mainTab ? 0x188 : 0x200, bottom = mainTab ? 0x1e0 : 0x258;
            if (expanded) top += 0x68, bottom += 0x68;
            if (mx >= 0x100 && mx <= 0x2d8 && my >= top && my <= bottom) {
                lastWheel = wheel;
                scrollBy(1, wheel);
            }
        }
    }
    return 1;
}

// ---------------------------------------------------------------- layout

// one grid: 15 per row from (262, y0), 28 px and one depth step apart; the last card of a row and of the grid
// are hit over their whole width
static void layGrid(VcVector<CWindowTaskDeckCard*>& v, float y0, float z0) {
    float x = 262.0f, y = y0, z = z0;
    int col = 0;
    for (size_t i = 0; i < v.size(); i++) {
        CWindowTaskDeckCard* c = v[i];
        c->posX = x, c->f394 = (int32_t)x;
        c->posY = y, c->f398 = (int32_t)y;
        c->layout();
        c->posZ = z, c->f39c = (int32_t)z;
        c->layout();
        if (col == 0xe) {
            col = 0;
            y += 80.0f;
            x = 262.0f;
            z = z0;
            c->narrow = 1;
        } else {
            x += 28.0f;
            col++;
            z += 1.0f;
            c->narrow = 0;
        }
    }
    if (v.size()) v[v.size() - 1]->narrow = 1;
}

// @yo2 0x0094ee60 place every card of the four grids
void CWindowTaskDeck::rebuild() {
    // main: 96 at the top, one row (80 px) up per scroll line while the grid scrolls
    int32_t ln = line(0);
    float y0 = (mainScrollOn && ln >= 1 && ln <= 3) ? 96.0f - 80.0f * (float)ln : 96.0f;
    layGrid(cards[0], y0, 2.0f);
    if (missingCount > 0) {
        int32_t ml = line(1);
        float my = ml >= 1 && ml <= 5 ? 400.0f - 80.0f * (float)ml : 400.0f;
        if (expanded) my += 104.0f;
        if (front == tab[1].get()) my += 120.0f;
        layGrid(cards[3], my, 22.0f);
    }
    // side: one row; past 15 cards they squeeze to 14 px
    float x = 262.0f, y = expanded ? 624.0f : 520.0f, z = 42.0f;
    for (size_t i = 0; i < cards[1].size(); i++) {
        CWindowTaskDeckCard* c = cards[1][i];
        c->posX = x, c->f394 = (int32_t)x;
        c->posY = y, c->f398 = (int32_t)y;
        c->layout();
        c->posZ = z, c->f39c = (int32_t)z;
        c->layout();
        c->narrow = 0;
        x += cards[1].size() > 0xf ? 14.0f : 28.0f;
        z += 1.0f;
    }
    if (cards[1].size()) cards[1][cards[1].size() - 1]->narrow = 1;
    layGrid(cards[2], 96.0f, 2.0f);
}

static void showCard(CWindowTaskDeckCard* c, bool on) {
    c->setPreviewOnHover(on);
    showElem(c, on);
}

// @yo2 0x009500a0 show the cards of one view: main + side + missing, or extra; rows scrolled away are hidden
void CWindowTaskDeck::fill(int32_t a, int32_t b) {
    bool extra = a != b;
    if (!extra) {
        for (CWindowTaskDeckCard* c : cards[2]) showCard(c, false);
        int32_t first = line(0) * 15, last = first + mainVisibleRows() * 15;
        for (size_t i = 0; i < cards[0].size(); i++) showCard(cards[0][i], (int32_t)i >= first && (int32_t)i < last);
        for (CWindowTaskDeckCard* c : cards[1]) showCard(c, true);
    } else {
        for (CWindowTaskDeckCard* c : cards[0]) showCard(c, false);
        for (CWindowTaskDeckCard* c : cards[1]) showCard(c, false);
        for (CWindowTaskDeckCard* c : cards[2]) showCard(c, true);
    }
    if (missingCount < 1) return;
    int32_t ml = line(1);
    for (size_t i = 0; i < cards[3].size(); i++)
        showCard(cards[3][i], !extra && (int32_t)i >= ml * 15 && (int32_t)i < (ml + 1) * 15);
}

// @yo2 0x0094c4a0 vf13 layout: the panel, the bar / counters / frames, and any card being dragged follows the mouse
void CWindowTaskDeck::layout() {
    x = posX, y = posY, z = posZ;
    if (w < 0.0f) w = 1.0f;
    if (h < 0.0f) h = 1.0f;
    if (CWindowTaskDeckBar* b = bar.get()) {
        uint8_t* p = (uint8_t*)b;   // CWindowTaskDeckBar fields (DeckParts): x, y, a, b, depth
        *(float*)(p + 0x494) = 248.0f;
        *(float*)(p + 0x498) = 0.0f;
        *(float*)(p + 0x4ac) = 8.0f;
        *(float*)(p + 0x4a0) = 88.0f;
        *(float*)(p + 0x34c) = 26.0f;
    }
    if (CWindowTaskDeckNumber* n = number.get()) {
        n->posX = 248.0f;
        n->posY = 29.0f;
        n->mainX = 154.0f;
        n->sideX = 70.0f;
        n->typeX = 232.0f;
        n->fusionX = 348.0f;
        n->defX = 144.0f;
        n->typeStep = 40.0f;
        n->depth = 27.0f;
    }
    if (CWindowTaskDeckTab* t = tab[0].get()) {
        t->depth = 28.0f;
        t->layout();
    }
    if (CWindowTaskDeckTab* t = tab[1].get()) {
        t->depth = 27.0f;
        t->layout();
    }
    for (int g = 0; g < 3; g++)
        for (CWindowTaskDeckCard* c : cards[g]) {
            if (c->dragging != 1) continue;
            int32_t mx, my;
            mousePos(&mx, &my);
            c->posX = (float)(mx - 0x19);
            c->posY = (float)(my - 0x24);
            c->layout();
            c->posZ = 4500.0f;
            c->layout();
        }
    scrollEnable(scroll[0].get(), mainScrollOn);
    scrollEnable(scroll[1].get(), sideScrollOn);
    if (CWindowTaskDeckScroll* s = scroll[0].get()) s->depth = 4.0f;
    if (CWindowTaskDeckScroll* s = scroll[1].get()) s->depth = 43.0f;
}

// ---------------------------------------------------------------- events

// @yo2 0x009520c0 IWindowTaskMediator vf00: a tab was clicked (switch view), or a card started dragging
void CWindowTaskDeck::onColleague(void* who) {
    void* t0 = tab[0].task ? tab[0].task->colleague() : nullptr;
    void* t1 = tab[1].task ? tab[1].task->colleague() : nullptr;
    if (who == t0 && front == tab[1].get()) {
        soundPlay(0x10000001, 0);
        switchView(0);
        rebuild();
    } else if (who == t1 && who && front == tab[0].get()) {
        soundPlay(0x10000001, 0);
        switchView(1);
        rebuild();
    }
    DeckDragState* d = deckDragState();
    for (int g = 0; g < 3; g++)
        for (size_t i = 0; i < cards[g].size(); i++) {
            CWindowTaskDeckCard* c = cards[g][i];
            if (who == c->colleague() && c->dragging == 1) {
                d->grid = g + 1;
                d->index = (uint32_t)i;
                d->card = c->card;
            }
        }
    relay(0);
}

// TODO(Deck A) parts: CWindowTaskDeckBar frame sets, 0 FUN_009133d0, 1 FUN_009135e0, 2 FUN_009137f0, 3 FUN_00913a00
void deckBarMode(CWindowTaskDeckBar* bar, int mode);
void deckBarSetY(CWindowTaskDeckBar* bar, float a, float b);  // inline (in 0x00950a00) TODO(Deck A) bar +0x4a4 / +0x4a8

// @yo2 0x009519d0
void CWindowTaskDeck::showMissingFrame() {
    deckBarMode(bar.get(), 0);
    showElem(frame[2].get(), true);
    showElem(field[2].get(), true);
}

// @yo2 0x00951a50
void CWindowTaskDeck::hideMissingFrame() {
    deckBarMode(bar.get(), 1);
    showElem(frame[2].get(), false);
    showElem(field[2].get(), false);
}

// @yo2 0x0094cab0 grow / shrink the main grid over the side grid's rows, then re-place the frames
// TODO(Deck A): like switchView, the exe's per-state frame / caption coordinates are not transcribed.
void CWindowTaskDeck::setExpanded(bool on) {
    expanded = on;
    switchView(extraView() ? 1 : 0);
}

// @yo2 0x0094f9a0 empty every grid and zero the counters
void CWindowTaskDeck::clearAll() {
    for (int g : {0, 1, 3, 2})
        while (cards[g].size()) killCard(cards[g], 0);
    mainCount = sideCount = extraCount = missingCount = 0;
    if (CWindowTaskDeckNumber* n = number.get()) n->resetAll();
}

// CDeckObject's virtuals the export uses. TODO(System): vtable slots 50 (clear), 2 / 3 / 4 (add main/side/extra)
void deckObjClear(void* deckObj);  // 0x00906cc0 CDeckManager vf 0xc8
void deckObjAdd(void* deckObj, int which, uint32_t card, int32_t slot);  // 0x00907350/0x00907430/0x00907510

// @yo2 0x0094ff40 write the grids into a deck object (the missing grid is not part of the deck)
void CWindowTaskDeck::exportTo(void* deckObj, int32_t slot) {
    deckObjClear(deckObj);
    for (int g = 0; g < 3; g++)
        for (CWindowTaskDeckCard* c : cards[g]) deckObjAdd(deckObj, g, c->card, slot);
}

// Creators of the panel's children (other folders / part-A files).
CWindowTaskDeckBar* deckBarCreate(void* parent, void* mediator);           // TODO(Deck A) FUN_0090aca0 parts
CWindowTaskDeckNumber* deckNumberCreate(void* parent, void* mediator);     // TODO(Deck A) FUN_00934b40
CWindowTaskFrameThin* frameThinCreate(void* parent);                       // TODO(System) FUN_005a0c00
CWindowTaskTextField* textFieldCreate(void* parent);                       // TODO(System) FUN_005b01a0 + FUN_00600c10
void textFieldPlace(CWindowTaskTextField* f, float x, float y);            // TODO(Deck A) FUN_00932280 / FUN_009322b0 util
void sortListInit(void* sort);                                             // TODO(Deck A) FUN_00921ba0 util
CWindowTaskDeckScroll* lastDeckScroll();                                   // the scroll deckScrollCreate made
CWindowTaskDeckTab* lastDeckTab();                                         // the tab deckTabCreate made

// @yo2 0x00948e30 vf04 init: bar, counters, three frames with captions, two scroll bars, the Main / Fusion tabs
uint32_t CWindowTaskDeck::init() {
    bar.set(deckBarCreate(this, &mediatorVtbl));
    DK_ASSERT(bar.task, "bar create failed");
    if (bar.task) taskSetInstName(bar.task, "bar");
    number.set(deckNumberCreate(this, &mediatorVtbl));
    DK_ASSERT(number.task, "DeckNum create failed");
    if (CWindowTaskDeckNumber* n = number.get()) {
        taskSetInstName(n, "DeckNum");
        n->setSideRowVisible(true);
        n->setSideY(454.0f);
        n->setDefRowVisible(false);
        n->setDefY(336.0f);
    }
    static const char* const kFrame[3][4] = {
        {"frameMain", "frameMain create failed", "textFieldMain", "textFieldMain create failed"},
        {"frameSide", "frameSide create failed", "textFieldSide", "textFieldSide create failed"},
        {"frameDeficiency", "frameDeficiency create failed", "textFieldDeficiency",
         "textFieldDeficiency create failed"},
    };
    for (int k = 0; k < 3; k++) {
        frame[k].set(frameThinCreate(this));
        DK_ASSERT(frame[k].task, kFrame[k][1]);
        if (frame[k].task) taskSetInstName(frame[k].task, kFrame[k][0]);
    }
    showElem(frame[2].get(), false);
    for (int k = 0; k < 3; k++) {
        field[k].set(textFieldCreate(this));
        DK_ASSERT(field[k].task, kFrame[k][3]);
        if (!field[k].task) continue;
        taskSetInstName(field[k].task, kFrame[k][2]);
        textFieldPlace(field[k].get(), 256.0f, 88.0f);
    }
    showElem(field[2].get(), false);
    static const char* const kScroll[2][2] = {{"scroll", "scroll create failed"},
                                              {"scrollDeficiency", "scrollDeficiency create failed"}};
    for (int k = 0; k < 2; k++) {
        deckScrollCreate(this, &mediatorVtbl, 0);
        scroll[k].set(lastDeckScroll());
        DK_ASSERT(scroll[k].task, kScroll[k][1]);
        if (CWindowTaskDeckScroll* s = scroll[k].get()) {
            taskSetInstName(s, kScroll[k][0]);
            s->setMax(0);
        }
    }
    static const char* const kTab[2][2] = {{"MainTab", "Main create failed"}, {"FusionTab", "Fusion create failed"}};
    for (int k = 0; k < 2; k++) {
        deckTabCreate(this, &mediatorVtbl);
        tab[k].set(lastDeckTab());
        DK_ASSERT(tab[k].task, kTab[k][1]);
        if (CWindowTaskDeckTab* t = tab[k].get()) {
            taskSetInstName(t, kTab[k][0]);
            t->setSelected(k);
            t->which = k;
        }
    }
    sortListInit(&sort);
    front = tab[0].get();
    if (CWindowTaskDeckTab* t = tab[0].get()) t->moveTo(256.0f, 64.0f);
    if (CWindowTaskDeckTab* t0 = tab[0].get())
        if (CWindowTaskDeckTab* t = tab[1].get()) t->moveTo(256.0f + t0->w, 64.0f);
    mainCount = sideCount = extraCount = missingCount = 0;
    live = 1;
    mainScrollOn = sideScrollOn = 0;
    lastWheel = 0;
    layout();
    return 1;
}

// @yo2 0x00950a00 bring a tab to the front. The exe then re-places the bar, the three frames and their captions
// with per-state constants; the bar / frame parts are kept to the calls the deck logic needs.
// TODO(Deck A): the frame and caption coordinates (CWindowTaskFrameThin +0x3c8 / CWindowTaskTextField +0x390).
void CWindowTaskDeck::switchView(int which) {
    front = tab[which ? 1 : 0].get();
    if (CWindowTaskDeckTab* t = tab[0].get()) t->setSelected(which ? 0 : 1);
    if (CWindowTaskDeckTab* t = tab[1].get()) t->setSelected(which ? 1 : 0);
    CWindowTaskDeckNumber* n = number.get();
    if (which == 0) {
        bool miss = missingCount > 0;
        deckBarMode(bar.get(), miss ? 0 : 1);
        showElem(frame[2].get(), miss);
        showElem(field[2].get(), miss);
        if (n) n->setDefRowVisible(miss);
        deckBarMode(bar.get(), 2);
        showElem(frame[1].get(), true);
        showElem(field[1].get(), true);
        if (n) n->setSideRowVisible(true);
        if (!expanded) {
            deckBarSetY(bar.get(), 360.0f, 480.0f);
            if (n) n->setSideY(454.0f), n->setDefY(336.0f);
        } else {
            deckBarSetY(bar.get(), 464.0f, 584.0f);
            if (n) n->setSideY(558.0f), n->setDefY(440.0f);
        }
        int32_t rows = mainVisibleRows();
        setMainScrollOn((int32_t)cards[0].size() > rows * 15);
        setSideScrollOn(miss && cards[3].size() > 0xf);
        fill(0, 0);
    } else {
        deckBarMode(bar.get(), 3);
        for (int k = 1; k < 3; k++) showElem(frame[k].get(), false), showElem(field[k].get(), false);
        if (n) n->setSideRowVisible(false), n->setDefRowVisible(false);
        setMainScrollOn(false);
        setSideScrollOn(false);
        fill(1, 0);
    }
}


}   // namespace dk
