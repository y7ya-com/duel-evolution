// Part "kaban" of the src/Deck part-A tests: yo2KabanWindow.cpp's first half (src/Deck/KabanWindow.cpp).
//   selftest            counter text position, list-row layout, the search dialogs' value lists and range rules,
//                       and a few windows driven against the stubs below
//   kaban all <field>   the value lists rows 0 and 1 of a list dialog search for ("<op> v v v ..."), for
//                       tests/deck_a_kaban_checks.py to compare with cards_yo2.csv
//   kaban range a b sortOn sortIndex     -> "<op> lo hi"
#include <cstring>
#include <string>
#include <vector>

#include "Deck/KabanWindow.h"
#include "deck_a_check.h"

#define DK_STUB __attribute__((weak))

namespace dk {

// ---------------------------------------------------------------- stub state the checks read
struct KabanStubs {
    std::vector<std::string> log;       // "se N", "filter N", "search f op n lo hi", "tab N", "show 0/1"...
    std::vector<int32_t> lastValues;    // values handed to kabanSearch
    std::vector<bool> checked;          // the fake listbox
    std::vector<int32_t> rowValue;
    int32_t result = 0;                 // modelResult
    bool busy = false, extra = false;
    std::string event;                  // swfEventIs matches this name
    std::wstring text1, text2;
    bool sortOn = false;
    int32_t sortIndex = 0;
};
KabanStubs& ks() {
    static KabanStubs s;
    return s;
}
static void logf(const char* fmt, long a = 0, long b = 0, long c = 0, long d = 0, long e = 0) {
    char buf[96];
    snprintf(buf, sizeof buf, fmt, a, b, c, d, e);
    ks().log.push_back(buf);
}
static VcWString wide(const std::wstring& s) {
    std::vector<uint16_t> w(s.begin(), s.end());
    return VcWString(w.data(), w.size());
}
// fake child tasks: every created element is a zeroed CElement-sized block
static void* newElem() { return calloc(1, 0x800); }

DK_STUB CSwfEngine* swfCreate(void*, const char*) { return static_cast<CSwfEngine*>(newElem()); }
DK_STUB void swfSetButtonMode(CSwfEngine*, bool) {}
DK_STUB void swfSetEnabled(CSwfEngine*, bool on) { logf("enable %ld", on); }
DK_STUB void swfSetListener(CSwfEngine*, void*) {}
DK_STUB bool swfEventIs(const void*, const char* n) { return ks().event == n; }
DK_STUB void controllConstruct(void*) {}
DK_STUB void controllDestruct(void*) {}
DK_STUB void controllReceive(void*, void*) {}
DK_STUB void mediatorNotify(void*, int slot, void*) { logf("notify %ld", slot); }
DK_STUB void playSe(uint32_t id, int32_t) { logf("se %ld", (long)(id & 0xf)); }
DK_STUB CTextElm* textCreate(void*, int32_t) { return static_cast<CTextElm*>(newElem()); }
DK_STUB void textSetText(CTextElm*, const VcWString& s) {
    std::string a(s.c_str(), s.c_str() + s.size());
    ks().log.push_back("text " + a);
}
DK_STUB void elemSetAnchor(void*, int32_t) {}
DK_STUB CSpriteElm* spriteCreate(void*, int32_t, const VcString& p) {
    ks().log.push_back(std::string("sprite ") + p.c_str());
    return static_cast<CSpriteElm*>(newElem());
}
DK_STUB void modelShow(void*, bool on) { logf("show %ld", on); }
DK_STUB int32_t modelResult(void*) { return ks().result; }
DK_STUB void modelRelayout(void*) {}
DK_STUB void modelSetScale(void*, float) {}
DK_STUB void modelSetColor(void*, float, float, float, float) {}
DK_STUB void frameSetScale(void*, float) {}
DK_STUB void frameSetSize(void*, int32_t, int32_t) {}
DK_STUB void inputValueSetPos(void*, float, float) {}
DK_STUB VcWString inputValueText1(void*) { return wide(ks().text1); }
DK_STUB void inputGetText(CWindowTaskInput*, VcWString* out) { *out = wide(ks().text2); }
DK_STUB bool inputValueSortOn(void*) { return ks().sortOn; }
DK_STUB int32_t inputValueSortIndex(void*) { return ks().sortIndex; }
DK_STUB bool listboxChecked(void*, int32_t i) { return i < (int32_t)ks().checked.size() && ks().checked[i]; }
DK_STUB int32_t listboxCount(void*) { return (int32_t)ks().checked.size(); }
DK_STUB int32_t listboxValue(void*, int32_t i) { return ks().rowValue[i]; }
static void* newModel() {
    auto* m = static_cast<kbn::ModelView*>(newElem());
    m->w = 300;
    m->frame = static_cast<kbn::ModelView*>(newElem());
    m->input2.setUser(m);
    m->input2.task = static_cast<CWindowTaskInput*>(newElem());
    return m;
}
DK_STUB void* listCardTypeCreate(void*) { return newModel(); }
DK_STUB void* listCardAttrCreate(void*) { return newModel(); }
DK_STUB void* listCardIconCreate(void*) { return newModel(); }
DK_STUB void* listCardStarCreate(void*) { return newModel(); }
DK_STUB void* listCardForbiCreate(void*) { return newModel(); }
DK_STUB void listboxFillTypes(void*) {}
DK_STUB void listboxFillAttrs(void*) {}
DK_STUB void listboxFillIcons(void*) {}
DK_STUB void listboxAddStar(void*, int32_t l) { logf("star %ld", l); }
DK_STUB void listboxAddForbi(void*, int32_t l) { logf("forbi %ld", l); }
DK_STUB void* inputValueCreate(void*, int32_t) { return newModel(); }
DK_STUB VcString cardImageName(uint32_t id) {
    char b[24];
    snprintf(b, sizeof b, "%05u.png", id);
    return VcString(b);
}
DK_STUB void kabanSetFilter(int32_t m) { logf("filter %ld", m); }
DK_STUB bool kabanBusy() { return ks().busy; }
DK_STUB void kabanSetInputEnabled(bool on) { logf("input %ld", on); }
DK_STUB void kabanSearch(int32_t f, int32_t op, VcVector<int32_t>* v, int32_t lo, int32_t hi, const char* t) {
    logf("search %ld %ld %ld %ld %ld", f, op, (long)v->size(), lo, hi);
    ks().lastValues.assign(v->begin(), v->end());
    if (t) ks().log.push_back(std::string("text ") + t);
}
DK_STUB void* kabanListBtnConstruct(void* mem) { return mem; }
DK_STUB size_t kabanListBtnSize() { return 0x510; }
DK_STUB bool deckShowingExtra() { return ks().extra; }
DK_STUB void deckSetTab(int32_t t) { logf("tab %ld", t); }
DK_STUB void deckRefresh() {}

}   // namespace dk

using namespace dk;

static bool row(void* ctx, int32_t i) { return static_cast<std::vector<bool>*>(ctx)->at(i); }
static int32_t val(void*, int32_t i) { return i * 10; }

static std::vector<int32_t> listAll(int32_t field, int row0or1, int32_t* op) {
    std::vector<bool> rows = {row0or1 == 0, row0or1 == 1, false};
    VcVector<int32_t> v;
    *op = kabanListSearch(*kabanListSpec(field), row, val, 3, &rows, &v);
    return std::vector<int32_t>(v.begin(), v.end());
}

static bool logHas(const std::string& s) {
    for (auto& l : ks().log)
        if (l == s) return true;
    return false;
}

static int selftest() {
    int n = 0;
    // counter digits stay right-aligned: 8 px further left per digit
    CHECK(n, kabanCountTextX(0) == 56 && kabanCountTextX(9) == 56 && kabanCountTextX(10) == 48);
    CHECK(n, kabanCountTextX(999) == 40 && kabanCountTextX(1000) == 32 && kabanCountTextX(1234567) == 8);
    CHECK(n, kabanCountTextX(-5) == 56 && kabanCountTextX(-50) == 48);
    // list-row layout
    float o[3];
    kabanListItemOffset(0x10, o);
    CHECK(n, o[0] == 56 && o[1] == 32 && o[2] == 0);
    kabanListItemOffset(0x80, o);
    CHECK(n, o[0] == 232 && o[1] == 8);
    kabanListItemOffset(3, o);
    CHECK(n, o[0] == 0 && o[1] == 0);
    CHECK(n, kabanListItemShown(0) == 1);
    // ATK/DEF range rules
    int32_t lo, hi;
    CHECK(n, kabanRangeSearch(2000, 1000, false, 0, &lo, &hi) == KS_MATCH && lo == 2000 && hi == 1000);
    CHECK(n, kabanRangeSearch(2000, 1000, true, 0, &lo, &hi) == KS_SORT_DOWN && lo == 1000 && hi == 2000);
    CHECK(n, kabanRangeSearch(2000, 1000, true, 1, &lo, &hi) == KS_SORT_UP && lo == 2000 && hi == 1000);
    CHECK(n, kabanRangeSearch(0, 0, true, 0, &lo, &hi) == KS_SORT_DOWN && lo == 0 && hi == 10000);
    CHECK(n, kabanRangeSearch(0, 0, true, 2, &lo, &hi) == KS_SORT_UP && lo == 10000 && hi == 0);
    uint16_t w1[] = {'1', '2', '3', '4', '5'}, w2[] = {' ', '-', '7', 'x'}, w3[] = {0x3042, '9'};
    CHECK(n, kabanParseNumber(VcWString(w1, 5)) == 10000 && kabanParseNumber(VcWString(w2, 4)) == -7);
    CHECK(n, kabanParseNumber(VcWString(w3, 2)) == 0 && kabanParseNumber(VcWString()) == 0);
    // list dialogs: the two "all" rows and the ticked rows
    int32_t op;
    auto t = listAll(KS_TYPE, 0, &op);
    CHECK(n, op == KS_SORT_DOWN && t.size() == 20 && t.front() == 20 && t.back() == 1);
    t = listAll(KS_TYPE, 1, &op);
    CHECK(n, op == KS_SORT_UP && t.front() == 1 && t.back() == 20);
    t = listAll(KS_ICON, 1, &op);
    CHECK(n, op == KS_SORT_UP && (t == std::vector<int32_t>{1, 2, 3, 4, 5, 6, 0}));
    t = listAll(KS_ICON, 0, &op);
    CHECK(n, op == KS_SORT_DOWN && (t == std::vector<int32_t>{0, 6, 5, 4, 3, 2, 1}));
    t = listAll(KS_LEVEL, 0, &op);
    CHECK(n, op == KS_SORT_UP && t.size() == 12 && t.front() == 1);
    t = listAll(KS_LIMIT, 1, &op);
    CHECK(n, op == KS_SORT_UP && (t == std::vector<int32_t>{0, 1, 2, 3}));
    std::vector<bool> rows = {false, false, true, false, true, true};
    VcVector<int32_t> v;
    CHECK(n, kabanListSearch(*kabanListSpec(KS_ATTR), row, val, 6, &rows, &v) == KS_MATCH && v.size() == 3);
    CHECK(n, v[0] == 20 && v[1] == 40 && v[2] == 50);
    v.clear();
    kabanListSearch(*kabanListSpec(KS_TYPE), row, val, 6, &rows, &v);   // single choice
    CHECK(n, v.size() == 1 && v[0] == 20);
    v.clear();
    kabanListSearch(*kabanListSpec(KS_LIMIT), row, val, 6, &rows, &v);  // rows hold limit + 1
    CHECK(n, v.size() == 3 && v[0] == 19);
    CHECK(n, kabanOrderFilter("sort_btn1") == KF_MAGIC && kabanOrderFilter("sort_btn6") == KF_FUSION);
    CHECK(n, kabanOrderFilter("sort_btn3") == KF_NORMAL && kabanOrderFilter("kabancount") == -1);

    // windows against the stubs
    auto* num = new CWindowTaskKabanNumber;
    num->construct();
    num->init();
    CHECK(n, num->w == 256 && num->depth == 2 && logHas("text @90"));
    num->setCount(1234);
    CHECK(n, num->textX == 32 && logHas("text @91234"));
    kbn::MsgView ev{0, kbn::TM_SWF_EVENT};
    ks().event = "kabancount";
    ks().extra = true;
    ks().log.clear();
    num->receive(&ev);
    CHECK(n, logHas("filter 6") && logHas("tab 0"));
    CHECK(n, num->onMouse(kbn::WM_LBUTTONDOWN) == 1 && num->onMouse(0x202) == 0);

    auto* ord = new CWindowTaskKabanOrder;
    ord->construct();
    ord->init();
    ord->spacing = 40;
    ord->layout();
    CHECK(n, static_cast<kbn::ElemView*>((void*)ord->button[5].task)->x == 200);
    ks().event = "sort_btn6";
    ks().extra = false;
    ks().log.clear();
    ord->receive(&ev);
    CHECK(n, logHas("filter 5") && logHas("tab 1"));
    ks().busy = true;
    ks().log.clear();
    ks().event = "sort_btn2";
    ord->receive(&ev);
    CHECK(n, logHas("filter 3") && !logHas("tab 1") && !logHas("tab 0"));
    ks().busy = false;
    ks().log.clear();
    ord->setEnabled(false);
    CHECK(n, ks().log.size() == 6 && !ord->enabled);

    auto* srch = new CWindowTaskKabanSearch;
    srch->construct();
    srch->init();
    ks().event = "search_btn1";
    srch->receive(&ev);
    CHECK(n, srch->busy && srch->atkDlg.task && static_cast<kbn::ModelView*>((void*)srch->atkDlg.task)->px == 724);
    ks().result = DLG_OK;
    ks().text1 = L"1500";
    ks().text2 = L"500";
    ks().sortOn = true;
    ks().log.clear();
    srch->update();
    CHECK(n, logHas("search 1 31 0 500 1500") && !srch->busy && logHas("input 1"));
    srch->atkDlg.task = nullptr;   // the stub destroy doesn't notify the pointer
    ks().event = "search_btn8";
    ks().log.clear();
    srch->receive(&ev);
    CHECK(n, logHas("star 12") && srch->levelDlg.task && srch->busy);
    ks().checked = {false, true};
    ks().log.clear();
    srch->update();
    CHECK(n, logHas("search 8 31 12 0 0") && ks().lastValues.front() == 12 && srch->values.size() == 0);
    srch->levelDlg.task = nullptr;
    ks().event = "search_btn7";
    srch->receive(&ev);
    ks().text1 = L"Dragon";
    ks().log.clear();
    srch->update();
    CHECK(n, logHas("search 7 30 0 0 0") && logHas("text Dragon"));
    srch->textDlg.task = nullptr;
    ks().event = "search_btn3";
    srch->receive(&ev);
    ks().result = DLG_CANCEL;
    ks().log.clear();
    srch->update();
    CHECK(n, logHas("se 2") && !srch->busy && ks().log.size() == 3);   // se 2, show 0, input 1: no search

    auto* card = new CWindowTaskKabanCard;
    card->construct();
    card->init();
    CHECK(n, card->w == 50 && card->h == 72 && card->kind() == 0x17);
    ks().log.clear();
    card->setCard(4007);
    CHECK(n, card->cardId == 4007 && logHas("sprite data/MINI/04007.png"));
    return n;
}

static int cmd(int argc, char** argv) {
    if (argc >= 2 && !strcmp(argv[0], "all")) {
        int32_t field = atoi(argv[1]);
        for (int r = 0; r < 2; r++) {
            int32_t op;
            auto v = listAll(field, r, &op);
            printf("%d", op);
            for (int32_t x : v) printf(" %d", x);
            printf("\n");
        }
        return 0;
    }
    if (argc >= 5 && !strcmp(argv[0], "range")) {
        int32_t lo, hi;
        int32_t op = kabanRangeSearch(atoi(argv[1]), atoi(argv[2]), atoi(argv[3]) != 0, atoi(argv[4]), &lo, &hi);
        printf("%d %d %d\n", op, lo, hi);
        return 0;
    }
    fprintf(stderr, "kaban: all <field> | range a b sortOn sortIndex\n");
    return 2;
}

static DeckAPart reg("kaban", selftest, cmd);
