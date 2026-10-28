// Part "kabanlist" of the Deck A tests (src/Deck/KabanWindowList.*): selftest of the pure helpers, weak stubs for
// the externs KabanWindowList.h declares, and the data commands tests/deck_a_kabanlist_checks.py drives:
//   deck_a_cli kabanlist <cards_yo2.csv> category <cat>
//   deck_a_cli kabanlist <cards_yo2.csv> search <mode> <order> <lo> <hi> <v1,v2,...|->
//   deck_a_cli kabanlist <cards_yo2.csv> page <first> <rows>
// The trunk is every card of the csv, with (id % 4) copies; the deck holds one copy of each id % 5 == 0.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <map>
#include <string>
#include <vector>

#include "Deck/KabanWindowList.h"
#include "deck_a_check.h"

#define DK_STUB __attribute__((weak))

namespace {
struct Row {
    int kid = 0, kind = 0, attr = 0, level = 0, icon = 0, race = 0, atk = 0, def = 0, limit = 0;
};
std::map<int, Row> g_cards;
int g_mouseX = 0, g_mouseY = 0;
int32_t g_deckCopies = 0, g_tradeSlots = 0;
bool g_room = true;
float g_elemX = 100, g_elemY = 200;

std::vector<std::string> csvSplit(const std::string& line) {
    std::vector<std::string> out(1);
    bool q = false;
    for (size_t i = 0; i < line.size(); i++) {
        char c = line[i];
        if (q) {
            if (c == '"' && i + 1 < line.size() && line[i + 1] == '"') out.back() += '"', i++;
            else if (c == '"') q = false;
            else out.back() += c;
        } else if (c == '"') q = true;
        else if (c == ',') out.emplace_back();
        else if (c != '\r') out.back() += c;
    }
    return out;
}

// cards_yo2.csv: kind is card_prop's 6-bit field (the client's kind is that >> 1); atk 5110 is "?"
bool loadCards(const char* path) {
    std::ifstream f(path);
    std::string line;
    if (!std::getline(f, line)) return false;
    std::vector<std::string> head = csvSplit(line);
    auto col = [&](const char* n) {
        for (size_t i = 0; i < head.size(); i++)
            if (head[i] == n) return (int)i;
        return -1;
    };
    int cId = col("yo2_id"), cK = col("konami_id"), cKind = col("kind"), cAttr = col("attr"), cLv = col("level"),
        cRace = col("race"), cAtk = col("atk"), cDef = col("def"), cLim = col("limit"), cIcon = col("spell_icon");
    static const char* icons[] = {"normal", "contraefecto", "campo", "equipo", "continua", "rápida", "ritual"};
    while (std::getline(f, line)) {
        std::vector<std::string> v = csvSplit(line);
        if ((int)v.size() < (int)head.size()) continue;
        Row r;
        r.kid = atoi(v[cK].c_str());
        r.kind = atoi(v[cKind].c_str()) >> 1;
        r.attr = atoi(v[cAttr].c_str());
        r.level = atoi(v[cLv].c_str());
        r.race = atoi(v[cRace].c_str());
        r.atk = atoi(v[cAtk].c_str());
        r.def = atoi(v[cDef].c_str());
        if (r.atk == 5110) r.atk = 0;
        if (r.def == 5110) r.def = 0;
        r.limit = atoi(v[cLim].c_str());
        for (int k = 0; k < 7; k++)
            if (v[cIcon] == icons[k]) r.icon = k;
        g_cards[atoi(v[cId].c_str())] = r;
    }
    return !g_cards.empty();
}
// Konami id -> the first yo2 id with it (the card accessors take a Konami id)
const Row* byKid(int kid) {
    static std::map<int, const Row*> idx;
    if (idx.empty())
        for (auto& p : g_cards)
            if (!idx.count(p.second.kid)) idx[p.second.kid] = &p.second;
    auto it = idx.find(kid);
    return it == idx.end() ? nullptr : it->second;
}
}   // namespace

namespace dk {
DK_STUB DragState* g_drag = nullptr;

namespace card {
DK_STUB int32_t konamiId(int32_t id) {
    auto it = g_cards.find(id);
    return it == g_cards.end() ? 0 : it->second.kid;
}
#define FIELD(fn, f) \
    DK_STUB int32_t fn(int32_t kid) { const Row* r = byKid(kid); return r ? r->f : 0; }
FIELD(kind, kind)
FIELD(attribute, attr)
FIELD(level, level)
FIELD(icon, icon)
FIELD(race, race)
FIELD(atk, atk)
FIELD(def, def)
FIELD(limit, limit)
#undef FIELD
DK_STUB int32_t sortKey(int32_t kid) { return kid; }
DK_STUB int32_t group(int32_t kid) {   // FUN_00716c30's switch
    switch (kind(kid)) {
    case 1: case 6: case 7: case 8: case 9: case 16: return 1;
    case 2: case 3: return 3;
    case 4: case 5: return 2;
    case 10: return 9;
    case 11: return kid - 0x1382;
    case 13: return 7;
    case 14: return 8;
    case 17: case 18: return 10;
    }
    return 0;
}
DK_STUB bool nameMatches(int32_t, const uint16_t*) { return false; }
DK_STUB bool textMatches(int32_t, const uint16_t*) { return false; }
DK_STUB VcString miniFile(int32_t id) {
    char b[32];
    snprintf(b, sizeof b, "%05d.png", id);
    return VcString(b);
}
}   // namespace card

DK_STUB int32_t deckCopies(int32_t) { return g_deckCopies; }
DK_STUB int32_t deckCopiesKonami(int32_t) { return g_deckCopies; }
DK_STUB bool deckRefuses(int32_t) { return false; }
DK_STUB int32_t tradeAvailable(int32_t) { return 2; }
DK_STUB int32_t tradeOffered(int32_t) { return 1; }
DK_STUB int32_t tradeSlotsUsed() { return g_tradeSlots; }
DK_STUB bool presentHasRoom() { return g_room; }
DK_STUB bool tpHasRoom() { return g_room; }
DK_STUB int32_t sceneId() { return 0; }
DK_STUB void sceneKabanPicked(int32_t, int32_t) {}
DK_STUB bool cardListContains(int32_t) { return false; }
DK_STUB int32_t deckWindowCopies(int32_t id) { return id % 5 == 0 ? 1 : 0; }
DK_STUB int32_t tradeOfferCopies(int32_t) { return 0; }

DK_STUB void mousePos(int32_t* x, int32_t* y) { *x = g_mouseX, *y = g_mouseY; }
DK_STUB int32_t mouseWheel() { return 0; }
DK_STUB void mediatorNotify(void*, int32_t, void*) {}
DK_STUB void elemSetInputOff(void*, bool) {}
DK_STUB bool elemCreated(const void* e) { return e != nullptr; }
DK_STUB void elemSetPos3(void* e, float x, float y, float) { elemSetPos(e, x, y); }
DK_STUB void soundPlay(uint32_t, int32_t) {}
std::vector<std::string> g_spritePaths;
DK_STUB CSpriteElm* spriteCreate(void*, int32_t, const VcString& path) {   // distinct fake sprites
    static uint8_t pool[64][16];
    g_spritePaths.push_back(path.c_str());
    return (CSpriteElm*)pool[(g_spritePaths.size() - 1) % 64];
}
DK_STUB void spriteSetColor(CSpriteElm*, float, float, float, float) {}
DK_STUB void spriteSetAlpha(CSpriteElm*, float) {}
DK_STUB void spriteSetSrc(CSpriteElm*, int32_t, int32_t, int32_t, int32_t) {}
DK_STUB void spriteGetSrcSize(const CSpriteElm*, int32_t* w, int32_t* h) { *w = 72, *h = 72; }
DK_STUB void spriteSetScale(CSpriteElm*, float, float) {}
DK_STUB void spriteSetScaleX(CSpriteElm*, float) {}
DK_STUB void spriteSetScaleY(CSpriteElm*, float) {}
DK_STUB void spriteSetBlend(CSpriteElm*, int32_t) {}
DK_STUB void elemScreenPos(const void*, float* x, float* y) { *x = g_elemX, *y = g_elemY; }
DK_STUB void elemLayout(void*) {}
DK_STUB void elemSetFlagC7(void*, bool) {}
DK_STUB void detailSetCard(void*, int32_t) {}
DK_STUB void cardInfoSetCard(CWindowTaskCardInfoItem*, int32_t) {}
DK_STUB void scrollBaseSetRange(CWindowTaskKabanScroll* s, int32_t max) { s->steps = max; }
DK_STUB float scrollBaseBarLength(CWindowTaskKabanScroll*) { return 16.0f; }
DK_STUB float scrollBasePosOf(CWindowTaskKabanScroll*, int32_t i) { return (float)i * 4; }
DK_STUB void* scrollBaseConstruct(void* s) { return s; }
DK_STUB void* controllConstruct(void* s) { return s; }
DK_STUB void controllDestruct(void*) {}
DK_STUB void controllOnDestroy(void*) {}
DK_STUB void* modelConstruct(void* s) { return s; }
DK_STUB void modelDestruct(void*) {}
DK_STUB void modelOnDestroy(void*) {}
DK_STUB void modelNotifyBase(void*) {}
DK_STUB void modelWatchInt(void*, int32_t*) {}

DK_STUB void figureSetValue(CWindowTaskDeckFigure*, int32_t) {}
DK_STUB void figureShow(CWindowTaskDeckFigure*, bool) {}
DK_STUB void figureSetPos(CWindowTaskDeckFigure*, int32_t, int32_t, int32_t) {}
DK_STUB void deckBarSetValue(CWindowTaskDeckBar*, int32_t) {}
DK_STUB CWindowTaskKabanListBtn* kabanListBtnCreate(void*, void*) {
    return (new CWindowTaskKabanListBtn())->construct();
}
DK_STUB void kabanCardSet(CWindowTaskKabanCard*, int32_t) {}
DK_STUB void kabanCardClear(CWindowTaskKabanCard*) {}
DK_STUB void kabanNumberSet(CWindowTaskKabanNumber*, int32_t) {}
DK_STUB void kabanNumberEnable(CWindowTaskKabanNumber*, bool) {}
DK_STUB void kabanOrderEnable(CWindowTaskKabanOrder*, bool) {}
DK_STUB void kabanSearchEnable(CWindowTaskKabanSearch*, bool) {}
DK_STUB void kabanSearchReset(CWindowTaskKabanSearch*) {}
DK_STUB void kabanCardPlace(CWindowTaskKabanCard*, float, float) {}
DK_STUB void kabanCardSetDepth(CWindowTaskKabanCard*, float) {}
DK_STUB void kabanCardSetActive(CWindowTaskKabanCard*, bool) {}
DK_STUB CWindowTaskDeckFigure* deckFigureCreate(void*, void*, int32_t) { return nullptr; }
DK_STUB CWindowTaskDeckBar* deckBarCreate(void*, void*, int32_t) { return nullptr; }
DK_STUB CWindowTaskKabanNumber* kabanNumberCreate(void*, void*) { return nullptr; }
DK_STUB CWindowTaskKabanOrder* kabanOrderCreate(void*, void*) { return nullptr; }
DK_STUB CWindowTaskKabanSearch* kabanSearchCreate(void*, void*) { return nullptr; }
DK_STUB CWindowTaskKabanCard* kabanCardCreate(void*, void*) { return nullptr; }
DK_STUB void kabanLayoutObjInit(void*) {}
DK_STUB void cardInfoSetWidth(CWindowTaskCardInfoItem*, float) {}
DK_STUB CWindowTaskCardInfoItem* cardInfoItemCreate(void*, void*, int32_t, void*) { return nullptr; }
DK_STUB CWindowTaskFrameThin* frameThinCreate(void*, void*, int32_t) { return nullptr; }
}   // namespace dk

using namespace dk;

namespace {

// a built list (11 rows from build()) over the whole csv trunk, filtered to the "all" tab
CWindowTaskKabanList* makeList() {
    CWindowTaskKabanList* l = (new CWindowTaskKabanList())->construct();
    g_kabanList = l;
    l->build();
    for (auto& p : g_cards) l->all.push(p.first, p.first % 4);
    return l;
}
void freeList(CWindowTaskKabanList* l) {
    for (auto& r : l->rows) {
        CWindowTaskKabanListBtn* b = r.task;
        r.set(nullptr);
        if (b) b->destroy(1);
    }
    l->destroy(1);
    g_kabanList = nullptr;
}
void printShown(const CWindowTaskKabanList* l) {
    for (const SortItem& e : l->shown.v) printf("%d\n", e.card);
}

int selftest() {
    int n = 0;
    // the frame colours and the filter tabs, by client kind (csv kind >> 1)
    CHECK(n, kabanRowColor(0) == KLB_NORMAL && kabanRowColor(10) == KLB_NORMAL);
    CHECK(n, kabanRowColor(1) == KLB_EFFECT && kabanRowColor(11) == KLB_EFFECT && kabanRowColor(9) == KLB_EFFECT);
    CHECK(n, kabanRowColor(2) == KLB_FUSION && kabanRowColor(3) == KLB_FUSION);
    CHECK(n, kabanRowColor(4) == KLB_RITUAL && kabanRowColor(13) == KLB_SPELL && kabanRowColor(14) == KLB_TRAP);
    CHECK(n, kabanRowColor(12) == KLB_NONE && kabanRowColor(15) == KLB_NONE);
    for (int k = 0; k < 16; k++) {
        int tabs = 0;
        for (int c = KL_CAT_NORMAL; c <= KL_CAT_FUSION; c++) tabs += kabanCategoryHas(c, k);
        CHECK(n, tabs == (k == 12 || k == 15 ? 0 : 1));   // every real kind is on exactly one tab
        CHECK(n, kabanCategoryHas(KL_CAT_ALL, k));
        // the row colour agrees with the tab the card is on
        static const uint8_t colorOfTab[] = {KLB_NORMAL, KLB_EFFECT, KLB_SPELL, KLB_TRAP, KLB_RITUAL, KLB_FUSION};
        for (int c = KL_CAT_NORMAL; c <= KL_CAT_FUSION; c++)
            if (kabanCategoryHas(c, k)) CHECK(n, kabanRowColor(k) == colorOfTab[c]);
    }
    CHECK(n, !kabanCategoryHas(7, 0));

    // smart_ptr<CSortBase> ownership ring: the last owner deletes (ASan checks the rest)
    {
        SortRef a, b, c;
        sortRefInit(&a, new SortItem(), true);
        sortRefCopy(&b, &a);
        sortRefCopy(&c, &b);
        CHECK(n, a.ptr == b.ptr && b.ptr == c.ptr && a.prev->prev->prev == &a && a.next->next->next == &a);
        CHECK(n, a.prev != &a && a.next != &a && b.prev == &a);
        sortRefReset(&a);
        CHECK(n, a.ptr == nullptr && b.ptr && c.ptr);
        sortRefAssignNew(&b, new SortItem());
        CHECK(n, b.ptr != c.ptr && b.prev == &b && c.prev == &c);
        sortRefDestroy(&b);
        sortRefDestroy(&c);
        SortRefVec v;
        SortRef x;
        sortRefInit(&x, new SortItem(), true);
        for (int i = 0; i < 5; i++) v.insert(v.last, &x);
        x.ptr->card = 7;
        v.insert(v.first + 2, &x);
        CHECK(n, v.size() == 6 && v.first[5].ptr->card == 7);
        v.erase(v.first + 1, v.first + 3);
        CHECK(n, v.size() == 4);
        v.destroy();
        sortRefDestroy(&x);
        SortArrayHolder h1, h2;
        uint32_t* raw = (uint32_t*)::operator new(4 + 2 * sizeof(SortItem));
        raw[0] = 2;
        h1.ptr = (SortItem*)(raw + 1);
        h1.own = 1;
        sortArrayTake(&h2, &h1);
        CHECK(n, h2.own && !h1.own && h2.ptr == h1.ptr);
        sortArrayRelease(&h1);
        sortArrayRelease(&h2);
        CHECK(n, !h2.ptr);
    }
    {   // vector<int>::insert and vector<CSortBase>::erase
        VcVector<int32_t> v;
        int32_t a = 1, b = 2, c = 3;
        intVecInsert(&v, v.first, &a);
        intVecInsert(&v, v.first, &b);
        intVecInsert(&v, v.first + 1, &c);
        CHECK(n, v.size() == 3 && v[0] == 2 && v[1] == 3 && v[2] == 1);
        intVecInsert(&v, v.first, &v[2]);
        CHECK(n, v[0] == 1 && v.size() == 4);
        SortItems s;
        for (int i = 0; i < 5; i++) s.push(i, i * 10);
        sortItemsErase(&s.v, s.v.first + 1, s.v.first + 3);
        CHECK(n, s.size() == 3 && s.v[1].card == 3 && s.find(4)->count == 40 && !s.find(1));
        int32_t now = 0;
        CHECK(n, s.add(3, 5, &now) && now == 35 && !s.add(3, 300, &now) && now == 0 && !s.add(9, 1, &now));
    }
    {   // the name-sort comparator / qsort, by sortKey of the Konami id (the stub's key is the Konami id)
        SortItem it[4];
        int ids[4] = {0, 0, 0, 0}, k = 0;
        for (auto& p : g_cards) {
            if (k == 4) break;
            ids[k++] = p.first;
        }
        if (k == 4) {
            for (int i = 0; i < 4; i++) it[i].card = ids[3 - i];
            sortItemsByKey(it, 0, 3);
            for (int i = 0; i < 3; i++)
                CHECK(n, card::konamiId(it[i].card) <= card::konamiId(it[i + 1].card));
        }
    }
    {   // the scroll bar: range, wheel steps, clamping, and the saved step rescaled
        CWindowTaskKabanList* l = makeList();
        CWindowTaskKabanScroll* s = (new CWindowTaskKabanScroll())->construct();
        s->setTotal(20);
        CHECK(n, s->maxTop == 11 && s->index == 0 && s->barLen == 16.0f);
        s->scrollBy(-3);
        CHECK(n, s->index == 3 && s->lastTop == 3 && s->barPos == 12.0f && l->top == 3);
        s->scrollBy(5);
        CHECK(n, s->index == 0 && l->top == 3);   // clamped without redrawing
        s->scrollBy(-30);
        CHECK(n, s->index == 11);
        s->index = 3;
        s->save();
        s->steps = 22;
        CHECK(n, s->restore() == 6 && s->barPos == 24.0f);
        s->savedSteps = 0;
        CHECK(n, s->restore() == 0);
        s->destroy(1);
        freeList(l);
    }
    {   // a row: colour from the kind, the strict hit box
        CWindowTaskKabanListBtn* b = (new CWindowTaskKabanListBtn())->construct();
        CHECK(n, b->card == -1 && b->alpha == 1.0f && b->enabled && b->clickable);
        for (auto& p : g_cards)
            if (p.second.kind == 13) {
                b->setCard(p.first);
                CHECK(n, b->color == KLB_SPELL);
                break;
            }
        b->setCard(0);
        CHECK(n, b->color == KLB_NONE);
        b->width = 10, b->height = 20;
        CHECK(n, b->hitTest(105, 205) && !b->hitTest(100, 205) && !b->hitTest(110, 205) && !b->hitTest(105, 220));
        b->destroy(1);
    }
    {   // who may take a card out, per screen
        g_deckCopies = 2;
        int any = g_cards.empty() ? 0 : g_cards.begin()->first;
        int lim = card::limit(card::konamiId(any));
        CHECK(n, kabanCanTake(0, any, 1, true) == (2 < lim) && !kabanCanTake(0, any, 0, true));
        g_deckCopies = 0;
        CHECK(n, kabanCanTake(1, any, 1, false) && !kabanCanTake(1, any, 0, false));
        g_tradeSlots = 10;
        CHECK(n, !kabanCanTake(1, any, 1, false));
        g_tradeSlots = 0;
        g_room = false;
        CHECK(n, !kabanCanTake(2, any, 5, false) && !kabanCanTake(3, any, 5, false) && !kabanCanTake(4, any, 5, false));
        g_room = true;
        CHECK(n, kabanCanTake(2, any, 0, false) && kabanCanTake(3, any, 0, false));
    }
    {   // a built row: 27 frame sprites from the colour sheets; a card shows its colour's column and the body
        g_spritePaths.clear();
        CWindowTaskKabanListBtn* b = (new CWindowTaskKabanListBtn())->construct();
        b->build();
        CHECK(n, g_spritePaths.size() == 27 && b->width == 256 && b->height == 56 && b->depth == 2.0f);
        CHECK(n, g_spritePaths[0] == "data/deck/deck_carddai_01_c00.png" &&
                     g_spritePaths[6] == "data/deck/deck_carddai_01_c06.png" &&
                     g_spritePaths[21] == "data/deck/deck_carddai_01_c01.png" &&
                     g_spritePaths[22] == "data/deck/deck_carddai_01_c00.png");
        int trap = 0;
        for (auto& p : g_cards)
            if (p.second.kind == 14) trap = p.first;
        b->setCard(trap);
        CHECK(n, b->color == KLB_TRAP);
        for (int i = 0; i < 7; i++)
            CHECK(n, elemVisible(b->frameTop[i].task) == (i == KLB_TRAP) && elemVisible(b->frameBot[i].task) == (i == KLB_TRAP));
        CHECK(n, elemVisible(b->body[1].task) && !elemVisible(b->nothing[1].task));
        b->setCard(0);
        CHECK(n, elemVisible(b->frameMid[0].task) && !elemVisible(b->body[0].task) && elemVisible(b->nothing[2].task));
        b->setEnabled(false);
        CHECK(n, !elemVisible(b->frameMid[0].task) && !elemVisible(b->nothing[2].task));
        b->destroy(1);
    }
    {   // the whole panel: list and scroll bar are created and wired to each other through the singletons
        CWindowTaskKaban* k = kabanCreate(nullptr, nullptr, nullptr);
        CHECK(n, g_kaban == k && k->build() == 1 && g_kabanList == k->list.task && k->scroll.task);
        CHECK(n, k->scaleX == 288.0f && k->rowCount == 9 && k->list.task->posX == 744 && k->list.task->depth == 8.0f);
        CHECK(n, k->scroll.task->enabled && kabanScrollEnabled());
        k->setEnabled(false);
        CHECK(n, !kabanScrollEnabled() && !k->list.task->enabled);
        CWindowTaskKabanList* l = k->list.task;
        k->list.set(nullptr);
        for (auto& p : g_cards) l->all.push(p.first, 2);
        l->setCategory(KL_CAT_SPELL);
        CHECK(n, k->scroll.task->total == (int)l->shown.size() && k->scroll.task->maxTop == (int)l->shown.size() - 9);
        int32_t first = l->shown.v[0].card;
        CHECK(n, l->subCount(first, 2) == 1 && l->countOf(first) == 0 && !l->subCount(first, 1));
        CHECK(n, l->addCount(first, 3) == 1 && l->countOf(first) == 3 && l->shown.find(first)->count == 3);
        freeList(l);
        CWindowTaskKabanScroll* s = k->scroll.task;
        k->scroll.set(nullptr);
        s->destroy(1);
        k->onDestroy();
        CHECK(n, g_kaban == nullptr);
        k->destroy(1);
    }
    {   // the model window: centred on 1024x768
        CWindowModelKaban* m = (new CWindowModelKaban())->construct();
        CHECK(n, m->mode == 0 && m->f3a8 == 32.0f && m->f3b4 == -1);
        m->winW = 400, m->winH = 300;
        m->center();
        CHECK(n, m->winX == 312 && m->winY == 234 && m->x == 312);
        m->depth = 2.5f;
        CHECK(n, m->depthPlus5() == 7);
        m->destroy(1);
    }
    return n;
}

int cmd(int argc, char** argv) {
    if (argc < 2 || !loadCards(argv[0])) {
        fprintf(stderr, "usage: kabanlist <cards_yo2.csv> category|search|page ...\n");
        return 2;
    }
    std::string what = argv[1];
    CWindowTaskKabanList* l = makeList();
    if (what == "category" && argc >= 3) {
        l->setCategory(atoi(argv[2]));
        printShown(l);
    } else if (what == "search" && argc >= 7) {
        l->setCategory(KL_CAT_ALL);
        VcVector<int32_t> set;
        if (strcmp(argv[6], "-"))
            for (char* p = strtok(argv[6], ","); p; p = strtok(nullptr, ",")) set.push_back(atoi(p));
        l->search(atoi(argv[2]), atoi(argv[3]), set, atoi(argv[4]), atoi(argv[5]), nullptr);
        printShown(l);
    } else if (what == "page" && argc >= 4) {
        l->setCategory(KL_CAT_ALL);
        l->setRowCount(atoi(argv[3]));
        l->showFrom(atoi(argv[2]));
        for (auto& r : l->rows) printf("%d %d\n", r.task->card, (int)r.task->enabled);
    } else {
        freeList(l);
        return 2;
    }
    freeList(l);
    return 0;
}

int selftestWithCards() {
    const char* csv = getenv("YO2_CARDS_CSV");
    loadCards(csv ? csv : "cards_yo2.csv");
    return selftest();
}

DeckAPart reg("kabanlist", selftestWithCards, cmd);

}   // namespace
