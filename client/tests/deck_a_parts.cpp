// Part "parts" (src/Deck/DeckParts.cpp) of tests/deck_a_cli.cpp: weak stubs for its System calls, which record what
// the parts did to their sprites, and the selftest: CSortList's counters, the figure's digits, the bar's nine-slice
// layout, the swap icon's state machine and the card area's placement.
#include <map>
#include <string>
#include <vector>

#include "Deck/DeckParts.h"
#include "deck_a_check.h"

#define DK_STUB __attribute__((weak))

namespace dk {

struct FakeElem {   // what a stub System object remembers
    float x = 0, y = 0, z = 0, sx = 1, sy = 1, alpha = 1;
    int32_t u = 0, v = 0, w = 0, h = 0, blend = 0, frame = -1;
    bool disabled = false, visible = true, hold = false;
    std::string name, path, label;
    std::vector<uint16_t> text;
};
static std::map<const void*, FakeElem*>& fakes() {
    static std::map<const void*, FakeElem*> m;
    return m;
}
static FakeElem& F(const void* e) {
    auto& p = fakes()[e];
    if (!p) p = new FakeElem;   // leaked on purpose: test objects live for the whole run
    return *p;
}
static void* newFake(const char* path) {
    FakeElem* f = new FakeElem;
    f->path = path ? path : "";
    fakes()[f] = f;
    return f;
}

DK_STUB CSpriteElm* spriteCreate(void*, int32_t, const VcString& path) { return (CSpriteElm*)newFake(path.c_str()); }
DK_STUB void spriteSetBlend(CSpriteElm* s, int32_t m) { F(s).blend = m; }
DK_STUB void spriteSetSrc(CSpriteElm* s, int32_t u, int32_t v, int32_t w, int32_t h) {
    F(s).u = u, F(s).v = v, F(s).w = w, F(s).h = h;
}
DK_STUB void spriteSetAlpha(CSpriteElm* s, float a) { F(s).alpha = a; }
DK_STUB void elemSetPos3(void* e, float x, float y, float z) { F(e).x = x, F(e).y = y, F(e).z = z; }
DK_STUB void elemSetPos2(void* e, float x, float y) { F(e).x = x, F(e).y = y; }
DK_STUB void elemSetScaleX(void* e, float s) { F(e).sx = s; }
DK_STUB void elemSetScaleY(void* e, float s) { F(e).sy = s; }
DK_STUB void elemSetDisabled(void* e, bool on) { F(e).disabled = on; }
DK_STUB void elemSetFlagC7(void*) {}
DK_STUB void elemSetListener(void*, void*) {}
DK_STUB CSwfEngine* swfCreate(void*, int32_t, const VcString& path, int32_t) { return (CSwfEngine*)newFake(path.c_str()); }
DK_STUB void swfGotoFrame(CSwfEngine* s, int32_t f) { F(s).frame = f, F(s).label.clear(); }
DK_STUB void swfPlayLabel(CSwfEngine* s, int32_t, const VcString& l) { F(s).label = l.c_str(); }
DK_STUB void swfSetHold(CSwfEngine* s, bool on) { F(s).hold = on; }
DK_STUB CWindowTaskText* textCreate(void*, void*) { return (CWindowTaskText*)newFake("text"); }
DK_STUB void textSetString(CWindowTaskText* t, const VcWString& s) { F(t).text.assign(s.c_str(), s.c_str() + s.size()); }
DK_STUB void textSetSize(CWindowTaskText*, int32_t) {}
DK_STUB void textSetColor(CWindowTaskText*, float, float, float, float) {}
DK_STUB void textSetDepth(CWindowTaskText* t, float z) { F(t).z = z; }
DK_STUB void textRefresh(CWindowTaskText*) {}
DK_STUB void switchSetOn(CWindowTaskTextSwitch*, bool) {}
DK_STUB void planeSetColor(CWindowTaskBackPlane* p, float, float, float, float a) { F(p).alpha = a; }
DK_STUB void planeSetSize(CWindowTaskBackPlane* p, float w, float h) { F(p).sx = w, F(p).sy = h; }
DK_STUB const VcString& skinDir() {
    static VcString d("data/skin/");
    return d;
}
DK_STUB CWindowTaskTextSwitch* switchCreate(void*, void*) { return (CWindowTaskTextSwitch*)newFake("switch"); }
DK_STUB void switchSetText(CWindowTaskTextSwitch* t, const VcWString& s) { F(t).text.assign(s.c_str(), s.c_str() + s.size()); }
DK_STUB void switchSetOwner(CWindowTaskTextSwitch*, void*) {}
DK_STUB void switchPlace(CWindowTaskTextSwitch* t, float x, float y, float, float, bool) { F(t).x = x, F(t).y = y; }
DK_STUB const VcWString& textTable(int32_t id) {
    static std::map<int32_t, VcWString> m;
    if (m[id].empty()) m[id] = wformatInt("text%d", id);
    return m[id];
}
DK_STUB CWindowTaskBackPlane* planeCreate(void*, void*) { return (CWindowTaskBackPlane*)newFake("plane"); }
DK_STUB void elemSetZ(void* e, float z) { F(e).z = z; }
DK_STUB void elemSetDepth(void* e, float z) { F(e).z = z; }
DK_STUB void modelInstallDefaultHandler(void*) {}
DK_STUB void ctrlSetOwner(void*, void*) {}
DK_STUB void ctrlNotifyOwner(void*, int32_t) {}
DK_STUB void ctrlRelayout(void*) {}
DK_STUB void modelActivate(void*) {}
DK_STUB void modelNotifyOwner(void*, int32_t, int32_t) {}
DK_STUB void elemOnChildDestroyed(void*, int32_t) {}

}   // namespace dk

using namespace dk;

static std::string narrow(const std::vector<uint16_t>& w) { return std::string(w.begin(), w.end()); }

static int checkSortList(int n) {
    CSortList l;
    l.construct();
    CHECK(n, l.find(5) == nullptr);
    for (int k = 0; k < 20; k++) l.add(100 + k, k);   // grows through several reallocations
    CHECK(n, l.items.size() == 20);
    CHECK(n, l.find(107) && l.find(107)->value == 7 && l.find(107)->extra == -1);
    int32_t out = 99;
    CHECK(n, l.increase(107, 248, &out) && out == 255 && l.find(107)->value == 255);
    CHECK(n, !l.increase(107, 1, &out) && out == 0 && l.find(107)->value == 255);   // 256 refused
    CHECK(n, l.decrease(103, 3, &out) && out == 0 && l.find(103)->value == 0);
    CHECK(n, !l.decrease(103, 1, &out) && out == 0);                                // below 0 refused
    CHECK(n, !l.increase(999, 1, &out) && out == 0 && !l.decrease(999, 1, &out));  // unknown key
    // insert in the middle keeps order and shifts the tail
    CSortBase e{0, 7, 70, -1};
    sortVecInsert(l.items, l.items.begin() + 2, 3, e);
    CHECK(n, l.items.size() == 23 && l.items[1].key == 101 && l.items[2].key == 7 && l.items[4].value == 70);
    CHECK(n, l.items[5].key == 102 && l.items[22].key == 119);
    l.destruct();
    CHECK(n, l.items.size() == 0 && l.items.first == nullptr);
    return n;
}

static int checkFigure(int n) {
    static CWindowTaskDeckFigure f{};
    for (auto& d : f.digit) d.setUser(&f);
    CHECK(n, f.create());
    CHECK(n, F(f.digit[0].task).path == "data/deck/deck_font_01_c01.png" && F(f.digit[3].task).blend == 2);
    f.setNumber(40);
    CHECK(n, f.glyph[0] == 0 && f.glyph[1] == 4 && f.glyph[2] == 0 && f.glyph[3] == 10);
    CHECK(n, F(f.digit[1].task).u == 32 && F(f.digit[1].task).w == 8 && F(f.digit[1].task).h == 12);
    CHECK(n, F(f.digit[3].task).u == 80);
    f.setNumber(0x1ff);   // only the low byte: 255
    CHECK(n, f.glyph[0] == 5 && f.glyph[1] == 5 && f.glyph[2] == 2);
    f.setPos(100, 50, 3);
    CHECK(n, F(f.digit[0].task).x == 124 && F(f.digit[3].task).x == 100 && F(f.digit[2].task).y == 50);
    f.show(false);
    CHECK(n, F(f.digit[2].task).disabled && !elemVisible(f.digit[2].task));
    f.show(true);
    CHECK(n, !F(f.digit[2].task).disabled && elemVisible(f.digit[2].task));
    CHECK(n, f.onMouse(0x201) && !f.onMouse(0x202));
    return n;
}

static int checkBar(int n) {
    static CWindowTaskDeckBar b{};
    b.construct();
    CHECK(n, b.kind == 7 && b.alpha == 1.0f);
    CHECK(n, b.create());
    CHECK(n, F(b.spr[DB_TOP].task).path == "data/deck/deckbar_01_c02.png");
    CHECK(n, F(b.spr[DB_RBD].task).path == "data/skin/window_base_01_c07.png");
    CHECK(n, F(b.spr[DB_TITLEMIDBOTTOM].task).path == "data/deck/deck_moji_01_?.png" && b.width == 256);
    b.width = 200, b.y1 = 40, b.y2 = 100, b.labelX = 20;
    b.layout();
    CHECK(n, F(b.spr[DB_RT].task).x == 192 && F(b.spr[DB_TOP].task).sx == 23.0f && F(b.spr[DB_LT].task).h == 88);
    CHECK(n, F(b.spr[DB_MIDBOTTOMC].task).y == 48 && F(b.spr[DB_MIDBOTTOMC].task).sy == 2.0f);
    CHECK(n, F(b.spr[DB_RBD].task).y == 124 && F(b.spr[DB_RBD].task).u == 0x50);
    CHECK(n, F(b.spr[DB_TITLEBOTTOM].task).y == 100 && F(b.spr[DB_TITLEBOTTOM].task).v == 0x38);
    b.kind = 8;
    b.layout();
    CHECK(n, F(b.spr[DB_TITLEBOTTOM].task).y == 56 && F(b.spr[DB_TITLEBOTTOM].task).v == 0x8c && F(b.spr[DB_TITLEBOTTOM].task).disabled);
    b.showRow2(true);
    CHECK(n, !F(b.spr[DB_TITLEBOTTOM].task).disabled && !F(b.spr[DB_LBU].task).disabled);
    b.showRow1(false);
    CHECK(n, F(b.spr[DB_TITLEMIDBOTTOM].task).disabled && F(b.spr[DB_RMIDBD].task).disabled && !F(b.spr[DB_LBU].task).disabled);
    return n;
}

static int checkSwap(int n) {
    static CWindowTaskSwapIcon s{};
    s.construct();
    CHECK(n, s.create());
    CHECK(n, F(s.toMain.task).path == "data/deck/change_mark02.txt" && F(s.toSide.task).path == "data/deck/change_mark01.txt");
    CHECK(n, F(s.toMain.task).disabled && F(s.toMain.task).x == 728 && narrow(F(s.number.task).text) == "@00");
    s.base_ = 40;
    s.setCount(37);   // 3 fewer: "to main"
    CHECK(n, s.state == SWAP_TO_MAIN && s.diff == 3 && F(s.toMain.task).label == "this" && !F(s.toMain.task).disabled);
    CHECK(n, F(s.toSide.task).disabled && narrow(F(s.number.task).text) == "@23");
    CHECK(n, F(s.number.task).x == 728 + 56 && F(s.number.task).y == 400 + 156);
    s.setCount(52);   // 12 more: "to side", two digits shift 16 left
    CHECK(n, s.state == SWAP_TO_SIDE && s.diff == 12 && F(s.toMain.task).disabled && !F(s.toSide.task).disabled);
    CHECK(n, F(s.number.task).x == 728 + 56 - 16 && F(s.number.task).y == 412 && narrow(F(s.number.task).text) == "@212");
    s.setCount(40);
    CHECK(n, s.state == SWAP_NONE && s.diff == 0 && F(s.toSide.task).disabled && F(s.number.task).x == -16 + 16);
    s.setIconPos(10, 20);
    CHECK(n, F(s.toSide.task).x == 10 && F(s.number.task).x == 10 + 56 && s.iconY == 20);
    return n;
}

static int checkArea(int n) {
    static CWindowTaskCardArea a{};
    a.construct();
    CHECK(n, a.sel1 == -1 && a.sel2 == -1 && a.alpha == 1.0f);
    a.mode = 3;
    CHECK(n, a.create());
    CHECK(n, F(a.frame[0].task).path == "data/skin/window_base_01_c07.png" && F(a.frame[5].task).y == 596);
    CHECK(n, F(a.frame[13].task).sy == 73.5f && F(a.plane.task).sy == 588 && narrow(F(a.sw1.task).text) == "text4014");
    CHECK(n, narrow(F(a.sw2.task).text) == "text4003" && F(a.sw2.task).x == 340);
    a.mode = 1;
    a.setWide(true);
    CHECK(n, F(a.frame[2].task).x == 768 && F(a.frame[5].task).y == 248 && F(a.frame[7].task).sy == 3.0f);
    CHECK(n, F(a.plane.task).sx == 760 && F(a.sw1.task).disabled && !F(a.sw2.task).disabled);
    a.mode = 0;
    a.setWide(false);
    CHECK(n, F(a.frame[13].task).x == 480 && F(a.frame[13].task).y == 40 && F(a.frame[4].task).sy == 3.0f);
    a.setPlaneDefault();
    CHECK(n, F(a.plane.task).alpha == 0.7f);
    a.base.put<float>(CTRL_DEPTH, 2.5f);
    CHECK(n, a.childDepth() == 7);
    a.destruct();
    return n;
}

static int selftest() {
    int n = 0;
    n = checkSortList(n);
    n = checkFigure(n);
    n = checkBar(n);
    n = checkSwap(n);
    n = checkArea(n);
    return n;
}

static DeckAPart reg("parts", selftest, nullptr);
