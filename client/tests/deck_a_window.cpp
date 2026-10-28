// Checks for src/Deck/DeckWindow*.cpp (yo2DeckWindow.cpp): the counters, the card grids' order / layout /
// visibility / scroll rules, the add-limit rules, the tab and card hit tests. Plus weak stubs for the externs the
// window part declares (System, yaneSDK, the other part-A files).
#include <cstring>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "Deck/DeckWindow.h"
#include "deck_a_check.h"

#define DK_STUB __attribute__((weak))

namespace dk {

// ---------------------------------------------------------------- stubs
static std::vector<std::unique_ptr<WinElement>>& pool() {
    static std::vector<std::unique_ptr<WinElement>> p;
    return p;
}
static std::map<const void*, std::string>& texts() {
    static std::map<const void*, std::string> t;
    return t;
}
static int32_t g_mx, g_my, g_wheel;
static std::map<uint32_t, int32_t> g_frame, g_limit;
static DeckDragState g_drag;
static int g_sounds;

DK_STUB CSpriteElm* spriteCreate(void*, int32_t, const char*) {
    pool().emplace_back(new WinElement());
    return (CSpriteElm*)pool().back().get();
}
DK_STUB CTextElm* textCreate(void*, int32_t) {
    pool().emplace_back(new WinElement());
    return (CTextElm*)pool().back().get();
}
DK_STUB void textSetText(CTextElm* t, const VcWString& s) {
    std::string a;
    for (uint32_t i = 0; i < s.len; i++) a += (char)s.ptr[i];
    texts()[t] = a;
}
DK_STUB void elemSetBlend(void*, int32_t) {}
DK_STUB void elemAbsPos(const void* e, float* x, float* y) {
    const WinElement* w = (const WinElement*)e;
    *x = w->x, *y = w->y;
}
DK_STUB void mediatorCall(void*, int, void*) {}
DK_STUB void mousePos(int32_t* x, int32_t* y) { *x = g_mx, *y = g_my; }
DK_STUB int32_t mouseWheel() { return g_wheel; }
DK_STUB void mouseSetDragOffset(int32_t, int32_t) {}
DK_STUB int32_t sceneId() { return 0x24; }
DK_STUB void soundPlay(uint32_t, int32_t) { g_sounds++; }
DK_STUB uint32_t cardKonamiId(uint32_t card) { return card & 0x3fff; }
DK_STUB int32_t cardLimit(uint32_t k) { return g_limit.count(k) ? g_limit[k] : 3; }
DK_STUB int32_t cardFrame(uint32_t k) { return g_frame.count(k) ? g_frame[k] : 0; }
DK_STUB void scrollSetRange(void*, int32_t) {}
DK_STUB float scrollLineToPixel(void*, int32_t line) { return 10.0f * (float)line; }
DK_STUB float scrollPixelRange(void*) { return 100.0f; }
DK_STUB void scrollEnable(void*, bool) {}
DK_STUB void deckDragStartScene(int32_t) {}
DK_STUB void cardPicName(VcString* out, uint32_t card) {
    char b[16];
    snprintf(b, sizeof b, "%05u.png", card);
    *out = b;
}
DK_STUB DeckDragState* deckDragState() { return &g_drag; }
DK_STUB void modelAddCloseHandler(void*, int32_t*) {}
DK_STUB void modelClose(void*) {}
DK_STUB void sortListConstruct(void*) {}
DK_STUB void sortListDestruct(void*) {}
DK_STUB int32_t cardSortKey(uint32_t card) { return (int32_t)(card / 100); }   // test order: hundreds first
DK_STUB void deckBarMode(CWindowTaskDeckBar*, int) {}
DK_STUB void deckBarSetY(CWindowTaskDeckBar*, float, float) {}

void deckObjClear(void* deckObj);
void deckObjAdd(void* deckObj, int which, uint32_t card, int32_t slot);
CWindowTaskDeckBar* deckBarCreate(void* parent, void* mediator);
CWindowTaskDeckNumber* deckNumberCreate(void* parent, void* mediator);
CWindowTaskFrameThin* frameThinCreate(void* parent);
CWindowTaskTextField* textFieldCreate(void* parent);
void textFieldPlace(CWindowTaskTextField* f, float x, float y);
void sortListInit(void* sort);
void elemBaseVf06(void* e);

static std::vector<std::pair<int, uint32_t>> g_export;
DK_STUB void deckObjClear(void*) { g_export.clear(); }
DK_STUB void deckObjAdd(void*, int which, uint32_t card, int32_t) { g_export.push_back({which, card}); }
DK_STUB CWindowTaskDeckBar* deckBarCreate(void*, void*) {   // CWindowTaskDeckBar is 0x4b8 bytes
    static std::vector<std::vector<uint32_t>> v;
    v.emplace_back(0x4b8 / 4);
    return (CWindowTaskDeckBar*)v.back().data();
}
DK_STUB CWindowTaskDeckNumber* deckNumberCreate(void*, void*) {
    static std::vector<std::unique_ptr<CWindowTaskDeckNumber>> v;
    v.emplace_back(new CWindowTaskDeckNumber());
    v.back()->init();
    return v.back().get();
}
DK_STUB CWindowTaskFrameThin* frameThinCreate(void*) { return (CWindowTaskFrameThin*)textCreate(nullptr, 0); }
DK_STUB CWindowTaskTextField* textFieldCreate(void*) { return (CWindowTaskTextField*)textCreate(nullptr, 0); }
DK_STUB void textFieldPlace(CWindowTaskTextField*, float, float) {}
DK_STUB void sortListInit(void*) {}
DK_STUB void elemBaseVf06(void*) {}

CWindowTaskDeckCard*& deckCardAt(VcVector<CWindowTaskDeckCard*>& v, size_t i);

}   // namespace dk

using namespace dk;

static std::vector<uint32_t> ids(const VcVector<CWindowTaskDeckCard*>& v) {
    std::vector<uint32_t> r;
    for (CWindowTaskDeckCard* c : v) r.push_back(c->card);
    return r;
}

static int selftest() {
    int n = 0;
    // ---- counters
    auto num = std::make_unique<CWindowTaskDeckNumber>();
    num->init();
    CHECK(n, num->w == 256.0f && num->depth == 2.0f && num->alpha == 1.0f);
    CHECK(n, num->bg[DC_MAGIC].get() && elem(num->bg[DC_MAGIC].get())->srcX == 0x44);
    CHECK(n, elem(num->bg[DC_FUSION].get())->srcX == 0x22);   // the exe reuses the side cell
    CHECK(n, texts()[num->num[DC_MAIN].get()] == "@90");
    num->mainX = 100.0f;
    num->typeX = 200.0f;
    num->typeStep = 40.0f;
    for (int i = 0; i < 39; i++) CHECK(n, num->add(DC_MAIN, 1));
    CHECK(n, texts()[num->num[DC_MAIN].get()] == "@139");   // red until 40
    CHECK(n, elem(num->num[DC_MAIN].get())->x == 109.0f && elem(num->num[DC_MAIN].get())->y == 35.0f);
    CHECK(n, num->add(DC_MAIN, 1) && texts()[num->num[DC_MAIN].get()] == "@940");
    CHECK(n, num->add(DC_MAIN, 55) && num->count[DC_MAIN] == 95 && !num->add(DC_MAIN, 1));   // count + n < 0x60
    CHECK(n, num->add(DC_SIDE, 30) && !num->add(DC_SIDE, 1));                                // < 0x1f
    CHECK(n, num->add(DC_DEFICIENCY, 80) && !num->add(DC_DEFICIENCY, 1));                    // < 0x51
    for (int i = 0; i < 300; i++) num->add(DC_TRAP, 1);                                      // no limit, wraps
    CHECK(n, num->count[DC_TRAP] == (uint8_t)300);
    CHECK(n, !num->sub(DC_MAGIC, 1) && num->count[DC_MAGIC] == 0);
    num->add(DC_EFFECT, 7);
    CHECK(n, texts()[num->num[DC_EFFECT].get()] == "@07");
    CHECK(n, elem(num->num[DC_EFFECT].get())->x == 200.0f + 3 * 40.0f + 17.0f && elem(num->num[DC_EFFECT].get())->y == 4.0f);
    num->layout();
    CHECK(n, elem(num->bg[DC_RITUAL].get())->x == 200.0f + 4 * 40.0f);
    num->setSideRowVisible(false);
    CHECK(n, (elem(num->bg[DC_SIDE].get())->taskFlags & 2) && !elemVisible(num->bg[DC_SIDE].get()));
    num->resetAll();
    CHECK(n, num->count[DC_MAIN] == 0 && texts()[num->num[DC_MAIN].get()] == "@10");

    // ---- limit icon cells
    int32_t sx;
    CHECK(n, CWindowTaskDeckCard::limitIconRect(0, &sx) && sx == 0);
    CHECK(n, CWindowTaskDeckCard::limitIconRect(2, &sx) && sx == 0x20);
    CHECK(n, !CWindowTaskDeckCard::limitIconRect(3, &sx) && sx == 0x30);

    // ---- tab
    auto tab0 = std::make_unique<CWindowTaskDeckTab>(), tab1 = std::make_unique<CWindowTaskDeckTab>();
    for (auto* t : {tab0.get(), tab1.get()}) t->construct(), t->init();
    CHECK(n, tab0->w == 98.0f && tab0->h == 28.0f);
    tab0->setSelected(1);
    CHECK(n, elem(tab0->left.get())->srcX == 41 && elem(tab0->right.get())->srcX == 72);
    tab0->moveTo(10.0f, 20.0f);
    CHECK(n, tab0->x == 10.0f && elem(tab0->center.get())->scaleX == (98.0f - 32.0f) * 0.125f);
    CHECK(n, tab0->hit(11, 21) && !tab0->hit(10, 21) && !tab0->hit(108, 21));
    tab0->enabled = 0;
    CHECK(n, tab0->onMouse(0x201) == 0);

    // ---- the panel
    auto deck = std::make_unique<CWindowTaskDeck>();
    deck->construct();
    g_deckWindow = deck.get();
    deck->number.set(num.get());
    deck->tab[0].set(tab0.get());
    deck->tab[1].set(tab1.get());
    deck->front = tab0.get();
    auto sc0 = std::make_unique<CWindowTaskDeckScroll>(), sc1 = std::make_unique<CWindowTaskDeckScroll>();
    deck->scroll[0].set(sc0.get());
    deck->scroll[1].set(sc1.get());
    CHECK(n, !deck->extraView());

    // main grid order: by key (hundreds), then id inside a key
    for (uint32_t c : {305u, 101u, 199u, 150u, 302u, 101u}) deck->addMain(c);
    CHECK(n, ids(deck->cards[0]) == (std::vector<uint32_t>{101, 101, 150, 199, 302, 305}));
    CHECK(n, deck->mainCount == 6 && num->count[DC_MAIN] == 6 && num->count[DC_NORMAL] == 6);
    g_frame[777] = 0xd;
    g_frame[778] = 0xe;
    g_frame[779] = 2;
    g_frame[780] = 4;
    deck->addMain(777);
    deck->addMain(778);
    deck->addMain(780);
    CHECK(n, num->count[DC_MAGIC] == 1 && num->count[DC_TRAP] == 1 && num->count[DC_RITUAL] == 1);
    deck->addExtra(779);
    deck->addExtra(50);
    CHECK(n, ids(deck->cards[2]) == (std::vector<uint32_t>{50, 779}) && num->count[DC_FUSION] == 2);
    deck->addSide(101);
    CHECK(n, deck->copies(101) == 3 && deck->copies(779) == 1 && deck->copies(5) == 0);
    deck->removeMain(0);
    CHECK(n, deck->copies(101) == 2 && deck->mainCount == 8);
    deck->removeMain(ids(deck->cards[0]).size() - 1);   // 780, a ritual
    CHECK(n, num->count[DC_RITUAL] == 0);
    deck->removeMain(100);                               // past the end: count only, like the exe
    CHECK(n, deck->mainCount == 6 && deck->cards[0].size() == 7);

    // add limits (0x0094edf0)
    deck->mainCount = 80, deck->sideCount = 14;
    CHECK(n, !deck->full(5));
    deck->sideCount = 15;
    CHECK(n, deck->full(5) && !deck->full(779));
    deck->extraCount = 30;
    CHECK(n, deck->full(779));
    deck->mainCount = (int32_t)deck->cards[0].size(), deck->sideCount = 1, deck->extraCount = 2;

    // grid layout: 15 per row, 28 px apart, the last of a row and of the grid hit across their width
    for (uint32_t c = 400; c < 420; c++) deck->addMain(c);
    deck->rebuild();
    CWindowTaskDeckCard* c0 = deck->cards[0][0];
    CWindowTaskDeckCard* c14 = deck->cards[0][14];
    CWindowTaskDeckCard* c15 = deck->cards[0][15];
    CHECK(n, c0->posX == 262.0f && c0->posY == 96.0f && c0->posZ == 2.0f && !c0->narrow);
    CHECK(n, c14->posX == 262.0f + 14 * 28.0f && c14->narrow && c14->posZ == 16.0f);
    CHECK(n, c15->posX == 262.0f && c15->posY == 176.0f && deck->cards[0][deck->cards[0].size() - 1]->narrow);
    CHECK(n, deck->cards[1][0]->posY == 520.0f && deck->cards[2][0]->posY == 96.0f);
    // hit width: 28 px for overlapped cards
    c0->x = 262, c0->y = 96, c0->w = 50, c0->h = 72;   // init() (TM_INIT) is not run by the stub taskCreate
    CHECK(n, c0->hit(262 + 27, 100) && !c0->hit(262 + 29, 100));
    c14->x = 262, c14->y = 96, c14->w = 50, c14->h = 72;
    CHECK(n, c14->hit(262 + 49, 100));

    // scrolling of the main grid: 5 rows fit (75 cards), 6 when expanded, fewer with a missing grid
    CHECK(n, deck->mainVisibleRows() == 5);
    while (deck->cards[0].size() < 76) deck->addMain(500);
    CHECK(n, sc0->live && sc0->maxLine == 1 && deck->mainScrollOn);
    deck->expanded = 1;
    deck->mainGridScroll();
    CHECK(n, !sc0->live && !deck->mainScrollOn);
    deck->expanded = 0;
    deck->mainGridScroll();
    sc0->scrollBy(-1);   // wheel down one line
    CHECK(n, sc0->line == 1 && sc0->shownLine == 1 && sc0->pixel == 10.0f);
    CHECK(n, deck->cards[0][15]->posY == 96.0f && deck->cards[0][0]->posY == 16.0f);
    CHECK(n, !elemVisible(deck->cards[0][14]) && elemVisible(deck->cards[0][15]) && elemVisible(deck->cards[0][75]));
    sc0->scrollBy(-5);
    CHECK(n, sc0->line == 1);   // clamped at maxLine, no refill
    sc0->scrollBy(5);
    CHECK(n, sc0->line == 0);

    // the Extra tab hides main + side and shows extra
    deck->switchView(1);
    CHECK(n, deck->extraView() && !elemVisible(deck->cards[0][20]) && elemVisible(deck->cards[2][0]));
    deck->switchView(0);
    CHECK(n, !deck->extraView() && elemVisible(deck->cards[1][0]) && !elemVisible(deck->cards[2][0]));

    // missing grid: one row of 15 at a time
    for (uint32_t c = 900; c < 917; c++) deck->addMissing(c);
    CHECK(n, deck->missingCount == 17 && sc1->maxLine == 1 && sc1->live);
    deck->fill(0, 0);
    CHECK(n, elemVisible(deck->cards[3][14]) && !elemVisible(deck->cards[3][15]));
    deck->clearMissing();
    CHECK(n, deck->cards[3].size() == 0 && num->count[DC_DEFICIENCY] == 0);

    // a card drag from the deck: drag state filled in by the panel
    CWindowTaskDeckCard* d = deck->cards[1][0];
    d->x = d->y = 0;
    CHECK(n, d->onMouse(0x201) == 1 && d->dragging && g_drag.dragging && g_drag.card == 101);
    deck->onColleague(d->colleague());
    CHECK(n, g_drag.grid == 2 && g_drag.index == 0);
    deck->cancelDrag(1, 0);
    CHECK(n, !d->dragging && d->posY == 520.0f);

    // the wheel over the main grid scrolls it
    g_mx = 300, g_my = 100, g_wheel = -1;
    sc0->visible = 1;
    deck->main();
    CHECK(n, sc0->line == 1 && deck->lastWheel == -1);

    deck->exportTo(nullptr, 0);
    CHECK(n, g_export.size() == deck->cards[0].size() + deck->cards[1].size() + deck->cards[2].size());
    CHECK(n, g_export.back() == (std::pair<int, uint32_t>(2, 779)));

    deck->setEnabled(false);
    CHECK(n, !deck->cards[0][0]->enabled && !tab1->enabled);

    // a fresh panel built by init(): Main tab in front, Fusion tab behind it, the missing frame hidden
    auto deck2 = std::make_unique<CWindowTaskDeck>();
    deck2->construct();
    CHECK(n, deck2->init() == 1);
    CHECK(n, deck2->front == deck2->tab[0].get() && deck2->tab[1]->which == 1 && deck2->tab[1]->posX == 256.0f + deck2->tab[0]->w);
    CHECK(n, !elemVisible(deck2->frame[2].get()) && elemVisible(deck2->frame[0].get()));
    CHECK(n, !deck2->number->showDefRow && deck2->number->sideY == 454.0f);
    deck2->addMain(1);
    deck2->clearAll();
    CHECK(n, deck2->cards[0].size() == 0 && deck2->mainCount == 0 && deck2->number->count[DC_MAIN] == 0);

    // model window
    auto model = std::make_unique<CWindowModelDeck>();
    model->construct();
    model->w = 336, model->h = 144;
    model->center();
    CHECK(n, model->posX == (1024 - 336) / 2.0f && model->posY == (768 - 144) / 2.0f);
    model->setup(7, 1, 2, 3);
    CHECK(n, model->parentArg == 7 && model->posY == 2.0f && model->f3ac == 3);

    // the CTaskPtrs above point at stack-owned stand-ins: drop them before the objects go
    g_deckWindow = nullptr;
    for (int g = 0; g < 4; g++) {
        for (CWindowTaskDeckCard* c : deck->cards[g]) delete c;
        deck->cards[g].clear();
    }
    return n;
}

static DeckAPart reg("window", selftest, nullptr);
