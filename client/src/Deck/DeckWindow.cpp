// yo2DeckWindow.cpp, part 1: the counters, the tab, one card, the scroll bar, the model window, and the
// vector<CWindowTaskDeckCard*> instantiations (0x009354e0..0x00947fd0, 0x00952530..0x00955010).
// CWindowTaskDeck itself is in DeckWindowDeck.cpp.
#include "DeckWindow.h"

#include <cstdio>

#include <initializer_list>

#include "DeckTables.h"

// This TU's copies of the DeckTables.h initializers and destructors:
//   @yo2 0x00954460 guarded one-time init stub   @yo2 0x00954490 atexit stub
//   @yo2 0x009544b0 languages: init + atexit       (System: 0x9544d0) languages init   (System: 0x954830) atexit
//   @yo2 0x00954850 languages destructor (8)
//   @yo2 0x00954880 countries: init + atexit       (System: 0x9548a0) countries init   (System: 0x954bc0) atexit
//   @yo2 0x00954be0 countries destructor (7)
//   @yo2 0x00954c10 digits: init + atexit          (System: 0x954c30) digits init      (System: 0x954fc0) atexit
//   @yo2 0x00954fe0 digits destructor (20)
//   CWindowTaskBase.cpp's languages copy, linked right after: @yo2 0x00955010 init + atexit
//   @yo2 0x009553b0 its destructor (8)

namespace dk {

static CWindowTaskDeckScroll* s_lastScroll;
static CWindowTaskDeckTab* s_lastTab;

void WinControll::notify(int slot) { mediatorCall(mediator, slot, colleague()); }

// "@1%d"-style counter text: the exe swprintf's into a wchar_t[16]
static VcWString wideFormat(const char* fmt, int v) {
    char b[32];
    snprintf(b, sizeof b, fmt, v);
    uint16_t w[32];
    size_t n = 0;
    for (; b[n] && n < 31; n++) w[n] = (uint8_t)b[n];
    return VcWString(w, n);
}

// a sprite child: created, its pointer set and checked, named, alpha-blended, active
template <class T>
static void* makeSprite(T* self, TaskPtr<CSpriteElm>& p, const char* path, const char* name, const char* failMsg) {
    p.set(spriteCreate(self, 10000, path));
    DK_ASSERT(p.task, failMsg);
    CSpriteElm* s = p.get();
    if (!s) return nullptr;
    taskSetInstName(s, name);
    elemSetBlend(s, 2);
    elem(s)->active = 1;
    return s;
}

// ================================================================ CWindowTaskDeckNumber

namespace {
struct CountDef {
    const char* bgName;
    const char* bgFail;
    int32_t srcX;           // cell in deck_cardcount_01_?.png (34 x 25 each)
    const char* numName;
    const char* numFail;
    int limit;              // add(): count + n must stay below this (0 = unchecked)
};
const CountDef kCounts[DC_N] = {
    {"mainBG", "DMain create failed", 0x00, "mainNumber", "MainNum create failed", 0x60},
    {"sideBG", "DSide create failed", 0x22, "sideNumber", "SideNum create failed", 0x1f},
    {"magicBG", "DMagic create failed", 0x44, "magicNumber", "MagicNum create failed", 0},
    {"trapBG", "DTrap create failed", 0x66, "trapNumber", "TrapNum create failed", 0},
    {"normalBG", "DNormal create failed", 0x88, "normalNumber", "NormalNum create failed", 0},
    {"effectBG", "DEffect create failed", 0xaa, "effectNumber", "EffectNum create failed", 0},
    {"ritualBG", "DRitual create failed", 0xcc, "ritualNumber", "RitualNum create failed", 0},
    // the exe gives the fusion and deficiency counters the side counter's cell
    {"fusionBG", "DFusion create failed", 0x22, "fusionNumber", "FusionNum create failed", 0x1f},
    {"deficiencyBG", "DDeficiency create failed", 0x22, "deficiencyNumber", "DeficiencyNum create failed", 0x51},
};
}   // namespace

const char* CWindowTaskDeckNumber::format(int k, uint8_t v) {
    if (k == DC_MAIN) return v < 40 ? "@1%d" : "@9%d";   // red until the deck is legal
    if (k == DC_SIDE || k == DC_FUSION || k == DC_DEFICIENCY) return "@9%d";
    return "@0%d";
}

int CWindowTaskDeckNumber::limit(int k) { return kCounts[k].limit; }

// sprite k's row and column; the text sits 4 px lower and 17 (one digit) or 9 (two digits) px right
void CWindowTaskDeckNumber::place(int k, int digits) {
    float bx, by;
    switch (k) {
    case DC_MAIN: bx = mainX, by = 31.0f; break;
    case DC_SIDE: bx = sideX, by = sideY; break;
    case DC_FUSION: bx = fusionX, by = 31.0f; break;
    case DC_DEFICIENCY: bx = defX, by = defY; break;
    default: bx = typeX + typeStep * (float)(k - DC_MAGIC), by = 0.0f; break;
    }
    setPos(num[k].get(), bx + (digits < 2 ? 17.0f : 9.0f), by + 4.0f, depth + 1.0f);
}

void CWindowTaskDeckNumber::show(int k) {
    place(k, count[k] / 10 == 0 ? 1 : 2);
    textSetText(num[k].get(), wideFormat(format(k, count[k]), count[k]));
}

// @yo2 0x009354e0 vf04 init: nine sprites from one sheet, nine texts, then layout
uint32_t CWindowTaskDeckNumber::init() {
    w = h = 256.0f;
    posX = posY = 0.0f;
    depth = 2.0f;
    f454 = 0.0f;
    alpha = 1.0f;
    f458 = typeStep = sideY = defY = mainX = sideX = typeX = fusionX = defX = 0.0f;
    for (uint8_t& c : count) c = 0;
    showSideRow = showDefRow = 1;
    active = 1;
    for (int k = 0; k < DC_N; k++) {
        CSpriteElm* s = (CSpriteElm*)makeSprite(this, bg[k], "data/deck/deck_cardcount_01_?.png", kCounts[k].bgName,
                                                kCounts[k].bgFail);
        if (!s) continue;
        elem(s)->alpha = alpha;
        setSrc(s, kCounts[k].srcX, 0, 0x22, 0x19);
    }
    for (int k = 0; k < DC_N; k++) {
        num[k].set(textCreate(this, 10000));
        DK_ASSERT(num[k].task, kCounts[k].numFail);
        CTextElm* t = num[k].get();
        if (!t) continue;
        taskSetInstName(t, kCounts[k].numName);
        place(k, 2);
        // the first text starts white whatever the count; show() picks the colour later
        textSetText(t, wideFormat(k == DC_MAIN ? "@9%d" : format(k, count[k]), count[k]));
        elemSetBlend(t, 2);
        elem(t)->active = 1;
    }
    layout();
    return 1;
}

// @yo2 0x0093ba20 vf13 layout: the window at posX/posY, the nine sprites on their rows
void CWindowTaskDeckNumber::layout() {
    x = posX, y = posY, z = depth;
    for (int k = 0; k < DC_N; k++) {
        float bx, by;
        switch (k) {
        case DC_MAIN: bx = mainX, by = 31.0f; break;
        case DC_SIDE: bx = sideX, by = sideY; break;
        case DC_FUSION: bx = fusionX, by = 31.0f; break;
        case DC_DEFICIENCY: bx = defX, by = defY; break;
        default: bx = typeX + typeStep * (float)(k - DC_MAGIC), by = 0.0f; break;
        }
        setPos(bg[k].get(), bx, by, depth);
    }
}

// @yo2 0x0093bcf0 add main     @yo2 0x0093c350 add side     @yo2 0x0093c990 add magic
// @yo2 0x0093cfa0 add trap     @yo2 0x0093d5c0 add normal   @yo2 0x0093dbe0 add effect
// @yo2 0x0093e210 add ritual   @yo2 0x0093e840 add fusion   @yo2 0x0093ee70 add deficiency
// One function per counter in the exe, identical but for the field, limit, column and colour.
bool CWindowTaskDeckNumber::add(int k, uint8_t n) {
    if (kCounts[k].limit && (unsigned)count[k] + n >= (unsigned)kCounts[k].limit) return false;
    count[k] = (uint8_t)(count[k] + n);
    show(k);
    return true;
}

// @yo2 0x0093f4b0 sub main     @yo2 0x0093fb10 sub side     @yo2 0x00940150 sub magic
// @yo2 0x00940780 sub trap     @yo2 0x00940dc0 sub normal   @yo2 0x00941400 sub effect
// @yo2 0x00941a40 sub ritual   @yo2 0x00942080 sub fusion   @yo2 0x009426b0 sub deficiency
bool CWindowTaskDeckNumber::sub(int k, uint8_t n) {
    if ((int)count[k] - (int)n < 0) return false;
    count[k] = (uint8_t)(count[k] - n);
    show(k);
    return true;
}

// @yo2 0x00942cf0 every counter back to 0
void CWindowTaskDeckNumber::resetAll() {
    for (int k = 0; k < DC_N; k++) count[k] = 0;
    for (int k = 0; k < DC_N; k++) show(k);
}

// @yo2 0x00943e70
void CWindowTaskDeckNumber::resetDeficiency() {
    count[DC_DEFICIENCY] = 0;
    show(DC_DEFICIENCY);
}

// @yo2 0x009442d0
void CWindowTaskDeckNumber::setSideRowVisible(bool on) {
    showSideRow = on;
    showElem(bg[DC_SIDE].get(), on);
    showElem(num[DC_SIDE].get(), on);
}

// @yo2 0x009443e0
void CWindowTaskDeckNumber::setSideY(float v) {
    sideY = v;
    setPos(bg[DC_SIDE].get(), sideX, v, depth);
    place(DC_SIDE, count[DC_SIDE] / 10 ? 2 : 1);
}

// @yo2 0x00944540
void CWindowTaskDeckNumber::setDefRowVisible(bool on) {
    showDefRow = on;
    showElem(bg[DC_DEFICIENCY].get(), on);
    showElem(num[DC_DEFICIENCY].get(), on);
}

// @yo2 0x00944650
void CWindowTaskDeckNumber::setDefY(float v) {
    defY = v;
    setPos(bg[DC_DEFICIENCY].get(), defX, v, depth);
    place(DC_DEFICIENCY, count[DC_DEFICIENCY] / 10 ? 2 : 1);
}

// The IWindowTaskMediator thunks of the counter window: pass the event up with this window as the colleague.
// @yo2 0x009447b0 vf00 (slots 1-3 are 0x00935230 / 0x00935270 / 0x009352b0, outside part A)
void relayUp(WinControll* w, int slot) { w->notify(slot); }

// @yo2 0x009447f0 vf15 hit test: never hit
uint32_t numberHit(float, float) { return 0; }

// @yo2 0x00944810 vf14 mouse: a click (WM_LBUTTONDOWN) goes to the parent as event 1
uint32_t numberMouse(CWindowTaskDeckNumber* w, int msg) {
    if (msg != 0x201) return 0;
    w->notify(1);
    return 1;
}

// ================================================================ CWindowTaskDeckTab

// @yo2 0x00944860 new CWindowTaskDeckTab (0x3b8) under parent, talking to `mediator`
void deckTabCreate(void* parent, void* mediator) {
    CWindowTaskDeckTab* t = new CWindowTaskDeckTab();
    s_lastTab = t;
    t->construct();
    t->mediator = mediator;
    taskCreate(t, parent, 10000);
}

// @yo2 0x00944920
void CWindowTaskDeckTab::construct() {
    for (TaskPtr<CSpriteElm>* p : {&left, &center, &right, &title}) p->setUser(this);
    posX = posY = w = h = 0.0f;
    selected = which = 0;
    enabled = 1;
    taskSetTaskName(this, "CWindowTaskDeckTab");
}

// @yo2 0x00944b50 deleting destructor   @yo2 0x00944b80 destructor (the four TaskPtrs, then the base)
void CWindowTaskDeckTab::destruct() {}

// @yo2 0x00944b30 vf12 window kind
uint32_t deckTabKind() { return 9; }

// @yo2 0x00944c20 vf04 init: the three tab pieces and the label
uint32_t CWindowTaskDeckTab::init() {
    active = 1;
    makeSprite(this, left, "data/deck/decktab_01_c02.png", "leftTab", "LeftTab create failed");
    makeSprite(this, center, "data/deck/decktab_01_c02.png", "centerTab", "CenterTab create failed");
    makeSprite(this, right, "data/deck/decktab_01_c02.png", "rightTab", "RightTab create failed");
    makeSprite(this, title, "data/deck/deck_tabmoji_01_?.png", "titleTab", "TitleTab create failed");
    posX = posY = 0.0f;
    w = 98.0f;
    h = 28.0f;
    selected = which = 0;
    enabled = 1;
    return 1;
}

// @yo2 0x00945d20 vf05 main: lay out every frame
uint32_t deckTabMain(CWindowTaskDeckTab* t) {
    t->layout();
    return 1;
}

// @yo2 0x00945d40 vf13 layout: 24 px left cap, centre piece stretched to w - 32, 8 px right cap, label at (23, 5)
void CWindowTaskDeckTab::layout() {
    x = posX, y = posY, z = depth;
    setPos(left.get(), 0, 0, 0);
    setPos(center.get(), 24.0f, 0, 0);
    if (CSpriteElm* c = center.get()) elem(c)->scaleX = (w - 32.0f) * 0.125f;
    setPos(right.get(), w - 8.0f, 0, 0);
    setPos(title.get(), 23.0f, 5.0f, depth + 1.0f);
    // label sheet: the active tab's word in the left column, the front tab's in the right; main row 0, side 24
    setSrc(title.get(), selected ? 0 : 128, which ? 24 : 0, 128, 24);
}

// @yo2 0x00945fc0 0 = front tab (lighter pieces), 1 = the active one
void CWindowTaskDeckTab::setSelected(int s) {
    if (s != 0 && s != 1) return;
    selected = s;
    setSrc(left.get(), s ? 41 : 0, 0, 24, 28);
    setSrc(center.get(), s ? 64 : 24, 0, 8, 28);
    setSrc(right.get(), s ? 72 : 32, 0, 8, 28);
}

// @yo2 0x009461d0 vf15 inside the tab's rectangle (screen position from the element)
bool CWindowTaskDeckTab::hit(float px, float py) {
    float ax, ay;
    elemAbsPos(this, &ax, &ay);
    float l = (float)(int32_t)ax, t = (float)(int32_t)ay;
    return px > l && px < l + w && py > t && py < t + h;
}

// @yo2 0x0094c290
void CWindowTaskDeckTab::moveTo(float px, float py) {
    posX = px;
    posY = py;
    layout();
}

// @yo2 0x00946290 vf14 a click on an enabled tab tells the parent (event 0) and brings it to the front
uint32_t CWindowTaskDeckTab::onMouse(int msg) {
    if (!enabled) return 0;
    if (msg == 0x201) {
        notify(0);
        setSelected(0);
    }
    return 1;
}

// ================================================================ CWindowTaskDeckCard

// @yo2 0x00946300 new CWindowTaskDeckCard (0x3b0)
CWindowTaskDeckCard* deckCardCreate(void* parent, void* mediator) {
    CWindowTaskDeckCard* c = new CWindowTaskDeckCard();
    c->construct();
    c->mediator = mediator;
    return (CWindowTaskDeckCard*)taskCreate(c, parent, 10000);
}

// @yo2 0x009463c0
void CWindowTaskDeckCard::construct() {
    pic.setUser(this);
    limitIcon.setUser(this);
    posX = posY = w = h = posZ = 0.0f;
    f394 = f398 = f39c = 0;
    card = 0;
    dragging = 0;
    hover = 0;
    narrow = previewOnHover = 0;
    enabled = 1;
    taskSetTaskName(this, "CWindowTaskDeckCard");
}

// @yo2 0x009465c0 deleting destructor   @yo2 0x009465f0 destructor (two TaskPtrs, then the base)
void CWindowTaskDeckCard::destruct() {}

// @yo2 0x009465a0 vf12 window kind
uint32_t deckCardKind() { return 0x17; }

// @yo2 0x00946670 vf04 init: 50 x 72
uint32_t CWindowTaskDeckCard::init() {
    w = 50.0f;
    h = 72.0f;
    posX = posY = 0.0f;
    posZ = 0.0f;
    dragging = 0;
    hover = 0;
    narrow = 0;
    previewOnHover = 0;
    f394 = f398 = f39c = 0;
    enabled = 1;
    active = 1;
    layout();
    return 1;
}

// @yo2 0x00946700 vf05 main: after 3 frames under the mouse the card-info window shows this card
uint32_t CWindowTaskDeckCard::main() {
    int32_t mx, my;
    mousePos(&mx, &my);
    if (hit((float)mx, (float)my)) {
        if (hover++ == 3 && previewOnHover) {
            uint8_t* p = (uint8_t*)g_deckWindow->getPreview();
            *(uint32_t*)(p + 0x438) = card;
            *(int32_t*)(p + 0x440) = -1;
        }
        if (hover > 1000) hover = 0;
    } else {
        hover = 0;
    }
    layout();
    return 1;
}

// @yo2 0x009467e0 vf13 layout
void CWindowTaskDeckCard::layout() {
    x = posX, y = posY, z = posZ;
    if (CSpriteElm* s = limitIcon.get()) setPos(s, 0, 0, 1.0f);
}

// 0 forbidden, 1 limited, 2 semi-limited: a 16 x 16 cell of icon_seigen_01.png; anything else hides the icon
bool CWindowTaskDeckCard::limitIconRect(int32_t limit, int32_t* sx) {
    if (limit < 0 || limit > 2) {
        *sx = 0x30;
        return false;
    }
    *sx = limit * 0x10;
    return true;
}

// @yo2 0x00946870 the card picture (data/MINI/<name>) and its limit icon
void CWindowTaskDeckCard::setCard(uint32_t id) {
    card = id;
    VcString name;
    cardPicName(&name, card);
    VcString path("data/MINI/");
    path += name;
    makeSprite(this, pic, path.c_str(), "picCard", "Card create failed");
    showElem(pic.get(), true);
    makeSprite(this, limitIcon, "data/common/icon/icon_seigen_01.png", "picLimit", "Card create failed");
    int32_t sx;
    bool on = limitIconRect(cardLimit(cardKonamiId(card)), &sx);
    setSrc(limitIcon.get(), sx, 0, 0x10, 0x10);
    showElem(limitIcon.get(), on);
}

// @yo2 0x00947940 kill both pictures (before the card itself is destroyed)
void CWindowTaskDeckCard::destroyPics() {
    if (CSpriteElm* s = pic.get()) {
        elem(s)->active = 0;
        taskDestroy(s);
    }
    if (CSpriteElm* s = limitIcon.get()) {
        elem(s)->active = 0;
        taskDestroy(s);
    }
}

// @yo2 0x00947c90 (island) a vf06 thunk: straight to CWindowTaskControll's (FUN_005dec20)
void elemBaseVf06(void* e);   // TODO(System) FUN_005dec20
void deckCardVf06(CWindowTaskDeckCard* c) { elemBaseVf06(c); }

// @yo2 0x009479c0 vf19: tell the parent (event 0)
void deckCardPoke(CWindowTaskDeckCard* c) { c->notify(0); }

// @yo2 0x00947a00 vf15 hit: cards overlap in the grid, so only the last of a row is hit across its whole width
bool CWindowTaskDeckCard::hit(float px, float py) {
    float ax, ay;
    elemAbsPos(this, &ax, &ay);
    int32_t l = (int32_t)ax, t = (int32_t)ay;
    int32_t hw = narrow ? (int32_t)w : 0x1c;
    return (float)l < px && px < (float)(hw + l) && (float)t < py && py < (float)t + h;
}

// @yo2 0x00947ae0 vf14 a click starts dragging the card out of the deck
uint32_t CWindowTaskDeckCard::onMouse(int msg) {
    if (!enabled) return 0;
    DeckDragState* d = deckDragState();
    if (msg == 0x201 && !dragging && !d->dragging && !d->fromDeck) {
        float ax, ay;
        elemAbsPos(this, &ax, &ay);
        mouseSetDragOffset((int32_t)ax + 0x19, (int32_t)ay + 0x24);
        dragging = 1;
        d->dragging = 1;
        d->fromDeck = 1;
        d->card = card;
        deckDragStartScene(sceneId());
        notify(1);
        notify(0);
    }
    return 1;
}

// ================================================================ CWindowTaskDeckScroll

CWindowTaskDeckScroll* lastDeckScroll() { return s_lastScroll; }
CWindowTaskDeckTab* lastDeckTab() { return s_lastTab; }

// @yo2 0x00947cb0 new CWindowTaskDeckScroll (0x4e0); the exe's callers read it back through dynamic_cast of the
// created task, lastDeckScroll() here
void deckScrollCreate(void* parent, void* mediator, int32_t pageLines) {
    CWindowTaskDeckScroll* s = new CWindowTaskDeckScroll();
    s_lastScroll = s;
    s->construct();
    s->pageLines = pageLines;
    taskCreate(s, parent, 10000);
    s->mediator = mediator;
    s->maxLine = s->shownLine = s->dragLine = s->dragPage = 0;
    s->live = 0;
    s->b4a8 = 0;
}

// @yo2 0x00947da0
void CWindowTaskDeckScroll::construct() {
    taskSetTaskName(this, "CWindowTaskDeckScroll");
    maxLine = shownLine = dragLine = dragPage = 0;
    live = 0;
}

// @yo2 0x00947fd0 deleting destructor   @yo2 0x00948000 destructor (the base's six TaskPtrs)
void CWindowTaskDeckScroll::destruct() {}

// @yo2 0x00947fb0 vf12 window kind
uint32_t deckScrollKind() { return 0xe; }

// @yo2 0x009480d0 n lines, back to the top
void CWindowTaskDeckScroll::setLines(int32_t n) {
    maxLine = n;
    shownLine = 0;
    scrollSetRange(this, n);
    pixel = 0;
    line = 0;
    pixelRange = scrollPixelRange(this);
}

// @yo2 0x00948140
void CWindowTaskDeckScroll::saveDrag() {
    dragLine = line;
    dragPage = pageLines;
}

// @yo2 0x00948170 restore the drag-start position scaled to the current page size (rounded)
int32_t CWindowTaskDeckScroll::lineFromDrag() {
    line = (int32_t)((double)dragLine / (double)dragPage * (double)pageLines + 0.5);
    pixel = scrollLineToPixel(this, line);
    return line;
}

// @yo2 0x009481c0
void CWindowTaskDeckScroll::setMax(int32_t n) {
    maxLine = n;
    scrollSetRange(this, n);
}

// @yo2 0x009481f0 wheel: move up n lines (clamped); a real move refills the deck grid
void CWindowTaskDeckScroll::scrollBy(int32_t n) {
    line -= n;
    if (line < 0) {
        line = 0;
        return;
    }
    if (line > maxLine) {
        line = maxLine;
        return;
    }
    g_deckWindow->rebuild();
    g_deckWindow->fill(g_deckWindow->extraView(), 0);
    shownLine = line;
    pixel = scrollLineToPixel(this, line);
}

// @yo2 0x00948290 vf14: any held part of the bar refills the grid; the arrow buttons click
uint32_t CWindowTaskDeckScroll::onMouse() {
    if (!live) return 0;
    if (upHeld || downHeld || barHeld || dragHeld) {
        g_deckWindow->rebuild();
        g_deckWindow->fill(g_deckWindow->extraView(), 0);
        shownLine = line;
        if (upHeld || downHeld) soundPlay(0x10000000, 0);
    }
    return 1;
}

// ================================================================ CWindowModelDeck

// @yo2 0x00952530 new CWindowModelDeck (0x3f8)
CWindowModelDeck* modelDeckCreate(void* parent, int32_t a, float px, float py, int32_t d) {
    CWindowModelDeck* m = new CWindowModelDeck();
    m->construct();
    m->setup(a, px, py, d);
    return (CWindowModelDeck*)taskCreate(m, parent, 10000);
}

// @yo2 0x00952620
void CWindowModelDeck::setup(int32_t a, float px, float py, int32_t d) {
    posX = px;
    posY = py;
    parentArg = a;
    f3ac = d;
}

// @yo2 0x00952660
void CWindowModelDeck::construct() {
    deck.setUser(this);
    f3b0 = f3b4 = -1;
    parentArg = 0;
    f3a8 = 32.0f;
    f3ac = 1;
    taskSetTaskName(this, "CWindowModelDeck");
}

// @yo2 0x009528f0 deleting destructor   @yo2 0x00952940 destructor: three wide strings, the TaskPtr, the base
void CWindowModelDeck::destruct() {
    for (int i = 0; i < 3; i++) s3b8[i].clear();
}

// @yo2 0x00952860 vf08   @yo2 0x009528b0 vf05 main: both just lay out (vf09)
uint32_t modelDeckMain(CWindowModelDeck* m) {
    m->layout();
    return 1;
}

// @yo2 0x00952880 vf10: converts a float and drops it (an empty override left in the exe)
void modelDeckNop10(float v) { (void)(int32_t)v; }

void modelAddCloseHandler(void* model, int32_t* target);   // TODO(System) FUN_005df480 (delegate on +0x3b0)

// @yo2 0x00952ab0 vf04 init: 336 x 144, the deck panel as child "deck"
uint32_t CWindowModelDeck::init() {
    *(uint32_t*)((uint8_t*)this + 0x394) = 0;
    w = 336.0f;
    h = 144.0f;
    deck.set(deckWindowCreate(this, &mediatorVtbl, (void*)(intptr_t)parentArg));
    DK_ASSERT(deck.task, "deck create failed");
    if (CWindowTaskDeck* p = deck.get()) taskSetInstName(p, "deck");
    f3a8 = 32.0f;
    layout();
    modelAddCloseHandler(this, &f3b0);
    layout();
    *((uint8_t*)this + 0x350) = 1;
    return 1;
}

// @yo2 0x00952fe0 vf09 layout
void CWindowModelDeck::layout() {
    x = posX, y = posY, z = depth;
}

// @yo2 0x00953010 vf14 centre on the 1024 x 768 screen
void CWindowModelDeck::center() {
    posX = (1024.0f - w) * 0.5f;
    posY = (768.0f - h) * 0.5f;
    x = posX, y = posY;
}

// @yo2 0x009528d0 mediator vf01   @yo2 0x00953090 mediator vf00: both hand the event to the model base
// (FUN_005df430 = CWindowTaskModel close)   @yo2 0x009530b0 vf02   @yo2 0x009530d0 vf03: empty
void modelClose(void* model);   // TODO(System) FUN_005df430
void modelDeckEvent(CWindowModelDeck* m) { modelClose(m); }

// ================================================================ vector<CWindowTaskDeckCard*> (VC6 STL copies)
// The panel's four card grids instantiate these; VcVector<T*> provides the same behaviour.
//   @yo2 0x00953a50 vector::_Tidy (free the block)          @yo2 0x00953a90 vector::size
//   @yo2 0x00953ac0 vector::at (Xran when out of range)      @yo2 0x00953bf0 vector::insert(pos, n, value)
//   @yo2 0x00953e90 _Destroy (nothing for pointers)          @yo2 0x00953eb0 _Xran "invalid vector<T> subscript"
//   @yo2 0x00953fd0 uninitialized_copy                       @yo2 0x00954010 uninitialized_fill_n
//   @yo2 0x009543f0 copy                                     @yo2 0x00954430 construct
//   @yo2 0x009530f0 vector<VcWString>::clear (the sort list's keys)

template <class T>
T& checkedAt(VcVector<T>& v, size_t i) {
    if (!v.first || i >= v.size()) vectorXran();
    return v[i];
}

template <class T>
void insertAt(VcVector<T>& v, size_t pos, const T& value) {
    v.push_back(value);
    for (size_t k = v.size() - 1; k > pos; k--) v[k] = v[k - 1];
    v[pos] = value;
}

// test hooks for the helpers above
CWindowTaskDeckCard*& deckCardAt(VcVector<CWindowTaskDeckCard*>& v, size_t i) { return checkedAt(v, i); }
void deckCardInsert(VcVector<CWindowTaskDeckCard*>& v, size_t pos, CWindowTaskDeckCard* c) { insertAt(v, pos, c); }


}   // namespace dk
