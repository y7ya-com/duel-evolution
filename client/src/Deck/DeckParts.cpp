// yo2DeckParts.cpp (0x00909590..0x00920b00): see DeckParts.h.
#include "DeckParts.h"

#include <cstdio>
#include <initializer_list>

#include "DeckTables.h"

// This file's copies of DeckTables.h's initializers and destructors:
// @yo2 0x00920640 init stub: languages + their atexit registration
// @yo2 0x009209e0 languages dtor
// @yo2 0x00920a10 init stub: countries + their atexit registration
// Two more file-scope statics the shared header defines (an empty guard object, atexit only):
// @yo2 0x009205f0 guarded atexit registration
// @yo2 0x00920620 atexit registration

namespace dk {

// A sprite created under `parent`, kept in `ptr`, named and set up the way every part does it:
// alpha blending, and the +0xc7 flag.
static void makeSprite(TaskPtr<CSpriteElm>& ptr, void* parent, const VcString& path, const char* name) {
    ptr.set(spriteCreate(parent, 10000, path));
    char msg[64];
    snprintf(msg, sizeof msg, "%s create failed", name);
    DK_ASSERT(ptr.task, msg);
    taskSetInstName(ptr.get(), name);
    spriteSetBlend(ptr.get(), 2);
    elemSetFlagC7(ptr.get());
}

// One tile of a sliced image: position, alpha, and its 8-pixel cell in the sheet.
static void tile(TaskPtr<CSpriteElm>& p, float x, float y, float z, float alpha, int32_t u, int32_t v, int32_t w,
                 int32_t h) {
    elemSetPos3(p.get(), x, y, z);
    spriteSetAlpha(p.get(), alpha);
    spriteSetSrc(p.get(), u, v, w, h);
}

VcWString wformatInt(const char* fmt, int32_t v) {
    char buf[64];
    snprintf(buf, sizeof buf, fmt, v);
    uint16_t w[64];
    size_t n = 0;
    for (; buf[n] && n < 63; n++) w[n] = (uint8_t)buf[n];
    return VcWString(w, n);
}

// ================================================================ CWindowTaskDeckFigure

// @yo2 0x00909590 vf4: four digit sprites from deck_font_01
bool CWindowTaskDeckFigure::create() {
    w = h = 256.0f;
    x = y = 0;
    base.put<float>(CTRL_DEPTH, 2.0f);
    alpha = 1.0f;
    glyph[0] = glyph[1] = glyph[2] = 0;
    glyph[3] = 10;
    style = 0;
    base.put<uint8_t>(EL_FLAG_C7, 1);
    VcString path(style == 0 ? "data/deck/deck_font_01_c01.png" : "data/deck/deck_font_01_c02.png");
    static const char* const names[4] = {"figure1", "figure2", "figure3", "figure4"};
    for (int i = 0; i < 4; i++) {
        char fail[32];
        snprintf(fail, sizeof fail, "Figure%d", i + 1);
        digit[i].set(spriteCreate(this, 10000, path));
        char msg[48];
        snprintf(msg, sizeof msg, "%s create failed", fail);
        DK_ASSERT(digit[i].task, msg);
        taskSetInstName(digit[i].get(), names[i]);
        spriteSetBlend(digit[i].get(), 2);
        elemSetFlagC7(digit[i].get());
    }
    ctrlRelayout(this);
    return true;
}

// @yo2 0x0090a6e0 vf13
void CWindowTaskDeckFigure::updatePos() {
    base.put<float>(EL_X, x);
    base.put<float>(EL_Y, y);
    base.put<float>(EL_Z, base.get<float>(CTRL_DEPTH));
}

// @yo2 0x0090a710 digits of n & 0xff (the exe takes the low byte); glyphs are 8x12 cells in a row
void CWindowTaskDeckFigure::setNumber(uint32_t n) {
    n &= 0xff;
    glyph[0] = (uint8_t)(n % 10);
    glyph[1] = (uint8_t)(n % 100 / 10);
    glyph[2] = (uint8_t)(n / 100);
    for (int i = 0; i < 4; i++) {
        spriteSetAlpha(digit[i].get(), alpha);
        spriteSetSrc(digit[i].get(), glyph[i] * 8, 0, 8, 12);
    }
}

// @yo2 0x0090a980
void CWindowTaskDeckFigure::show(bool on) {
    for (auto& d : digit) showPart(d.get(), on);
}

// @yo2 0x0090ab40 the leftmost glyph at x, the ones digit at x + 24
void CWindowTaskDeckFigure::setPos(int32_t px, int32_t py, int32_t pz) {
    for (int i = 0; i < 4; i++) elemSetPos3(digit[i].get(), (float)(px + 8 * (3 - i)), (float)py, (float)pz);
}

// @yo2 0x0090ac30 vf15: never takes the mouse wheel
// @yo2 0x00913c90 CWindowTaskDeckBar vf15 (same body)
// @yo2 0x009168c0 CWindowTaskSwapIcon vf15 (same body)
// @yo2 0x009168e0 CWindowTaskSwapIcon vf14 (same body)
static bool returnsFalse() { return false; }
// @yo2 0x0090b300 CWindowTaskDeckBar vf12
// @yo2 0x009143c0 CWindowTaskSwapIcon vf12
// @yo2 0x00916e30 CWindowTaskCardArea vf5
static bool returnsTrue() { return true; }

// @yo2 0x0090ac50 vf14: WM_LBUTTONDOWN (0x201) is reported to the owner (mediator slot 1)
bool CWindowTaskDeckFigure::onMouse(int32_t msg) {
    if (msg != 0x201) return false;
    ctrlNotifyOwner(this, 1);
    return true;
}

// ================================================================ CWindowTaskDeckBar

// @yo2 0x0090aca0
CWindowTaskDeckBar* deckBarNew(void* parent, void* owner, int32_t kind) {
    auto* b = new CWindowTaskDeckBar;
    b->construct();
    b->kind = kind;
    auto* t = (CWindowTaskDeckBar*)taskCreate(b, parent, 10000);
    if (t) ctrlSetOwner(t, owner);
    return t;
}

// @yo2 0x0090ad70
void CWindowTaskDeckBar::construct() {
    std::memset(base.b, 0, sizeof base.b);   // TODO(System) CWindowTaskControll ctor (FUN_005de6b0)
    for (auto& p : spr) p.setUser(this);
    x = y = width = height = y1 = y2 = labelX = 0;
    alpha = 1.0f;
    kind = 7;
}

// @yo2 0x0090b350 (members' TaskPtr destructors in reverse, then the base)
void CWindowTaskDeckBar::destruct() {
    for (int i = DB_COUNT - 1; i >= 0; i--) spr[i].set(nullptr);
}
// @yo2 0x0090b320 deleting destructor
static void deckBarDelete(CWindowTaskDeckBar* b, bool free) {
    b->destruct();
    if (free) delete b;
}

// @yo2 0x0090b5a0 vf4: 25 sprites. The top band comes from deckbar_01 (kind 7: _c02, kind 8: _c03; other kinds
// leave the path empty), kind 7's two framed rows from the skin's window_base_01_cNN, the titles from deck_moji.
bool CWindowTaskDeckBar::create() {
    x = y = 0;
    base.put<float>(CTRL_DEPTH, 2.0f);
    width = height = 256.0f;
    y1 = y2 = 0;
    alpha = 1.0f;
    base.put<uint8_t>(EL_FLAG_C7, 1);
    VcString bar(kind == 7 ? "data/deck/deckbar_01_c02.png" : kind == 8 ? "data/deck/deckbar_01_c03.png" : "");
    VcString frame = skinDir();
    if (kind >= 0 && kind <= 8) {
        char name[32];
        snprintf(name, sizeof name, "window_base_01_c%02d.png", kind);
        frame += name;
    }
    VcString moji("data/deck/deck_moji_01_?.png");
    static const char* const names[DB_COUNT] = {
        "LT",     "Top",       "RT",     "LMidBU", "MidBottomU", "RMidBU", "LMidBC",   "MidBottomC",  "RMidBC",
        "LMidBD", "MidBottomD", "RMidBD", "LBU",    "BottomU",    "RBU",    "LBC",      "BottomC",     "RBC",
        "LBD",    "BottomD",    "RBD",    "TitleTop", "TitleMiddle", "TitleMidBottom", "TitleBottom"};
    for (int i = DB_LT; i <= DB_RT; i++) makeSprite(spr[i], this, bar, names[i]);
    if (kind == 7) {
        for (int i = DB_LMIDBU; i <= DB_RMIDBD; i++) makeSprite(spr[i], this, frame, names[i]);
        makeSprite(spr[DB_TITLEMIDBOTTOM], this, moji, names[DB_TITLEMIDBOTTOM]);
        for (int i = DB_LBU; i <= DB_RBD; i++) makeSprite(spr[i], this, frame, names[i]);
    }
    for (int i : {DB_TITLETOP, DB_TITLEMIDDLE, DB_TITLEBOTTOM}) makeSprite(spr[i], this, moji, names[i]);
    ctrlRelayout(this);
    return true;
}

// @yo2 0x0090b2c0 vf5: relayout
// @yo2 0x00914380 CWindowTaskSwapIcon vf5 (same body)
template <class T>
static bool relayoutPart(T* t) {
    ctrlRelayout(t);
    return true;
}

// @yo2 0x0090b2e0 vf9
static void deckBarSetAlpha(CWindowTaskDeckBar* b, float a) { b->alpha = a; }

// @yo2 0x00911fe0 vf13: lay the nine-slice out at the current size
void CWindowTaskDeckBar::layout() {
    base.put<float>(EL_Y, y);
    base.put<float>(EL_X, x);
    base.put<float>(EL_Z, base.get<float>(CTRL_DEPTH));
    const float a = alpha, right = width - 8.0f, stretch = (width - 16.0f) * 0.125f;
    // the 88-pixel-high top: two corners and the stretched middle
    tile(spr[DB_LT], 0, 0, 0, a, 0, 0, 8, 0x58);
    tile(spr[DB_TOP], 8, 0, 0, a, 8, 0, 8, 0x58);
    elemSetScaleX(spr[DB_TOP].get(), stretch);
    tile(spr[DB_RT], right, 0, 0, a, 0x10, 0, 8, 0x58);
    const float z1 = base.get<float>(CTRL_DEPTH) + 1.0f;
    if (kind == 7) {
        // two framed rows at y1 and y2, each: top edge, 2x-high body, bottom edge
        const int rows[2][9] = {{DB_LMIDBU, DB_MIDBOTTOMU, DB_RMIDBU, DB_LMIDBC, DB_MIDBOTTOMC, DB_RMIDBC, DB_LMIDBD, DB_MIDBOTTOMD, DB_RMIDBD},
                                {DB_LBU, DB_BOTTOMU, DB_RBU, DB_LBC, DB_BOTTOMC, DB_RBC, DB_LBD, DB_BOTTOMD, DB_RBD}};
        for (int r = 0; r < 2; r++) {
            const float ry = r == 0 ? y1 : y2;
            const int* s = rows[r];
            tile(spr[s[0]], 0, ry, 0, a, 0x48, 8, 8, 8);
            tile(spr[s[1]], 8, ry, 0, a, 0x38, 0x10, 8, 8);
            elemSetScaleX(spr[s[1]].get(), stretch);
            tile(spr[s[2]], right, ry, 0, a, 0x50, 8, 8, 8);
            tile(spr[s[3]], 0, ry + 8, 0, a, 0x18, 8, 8, 8);
            elemSetScaleY(spr[s[3]].get(), 2.0f);
            tile(spr[s[4]], 8, ry + 8, 0, a, 0x20, 8, 8, 8);
            elemSetScaleX(spr[s[4]].get(), stretch);
            elemSetScaleY(spr[s[4]].get(), 2.0f);
            tile(spr[s[5]], right, ry + 8, 0, a, 0x28, 8, 8, 8);
            elemSetScaleY(spr[s[5]].get(), 2.0f);
            tile(spr[s[6]], 0, ry + 24, 0, a, 0x48, 0, 8, 8);
            tile(spr[s[7]], 8, ry + 24, 0, a, 0x38, 0, 8, 8);
            elemSetScaleX(spr[s[7]].get(), stretch);
            tile(spr[s[8]], right, ry + 24, 0, a, 0x50, 0, 8, 8);
            if (r == 0) tile(spr[DB_TITLEMIDBOTTOM], labelX, y1, z1, a, 0, 0xa8, 0xa0, 0x1c);
        }
        tile(spr[DB_TITLETOP], labelX, 0, z1, a, 0, 0, 0xa0, 0x1c);
        tile(spr[DB_TITLEMIDDLE], labelX, 28, z1, a, 0, 0x1c, 0xa0, 0x1c);
        tile(spr[DB_TITLEBOTTOM], labelX, y2, z1, a, 0, 0x38, 0xa0, 0x1c);
    } else if (kind == 8) {
        // three title strips, the third hidden
        tile(spr[DB_TITLETOP], labelX, 0, z1, a, 0, 0x54, 0xa0, 0x1c);
        tile(spr[DB_TITLEMIDDLE], labelX, 28, z1, a, 0, 0x70, 0xa0, 0x1c);
        tile(spr[DB_TITLEBOTTOM], labelX, 56, z1, a, 0, 0x8c, 0xa0, 0x1c);
        showPart(spr[DB_TITLEBOTTOM].get(), false);
    }
}

// @yo2 0x009133d0 show row 1 (its nine pieces and its title strip)
// @yo2 0x009135e0 hide row 1
void CWindowTaskDeckBar::showRow1(bool on) {
    for (int i = DB_LMIDBU; i <= DB_RMIDBD; i++) showPart(spr[i].get(), on);
    showPart(spr[DB_TITLEMIDBOTTOM].get(), on);
}

// @yo2 0x009137f0 show row 2
// @yo2 0x00913a00 hide row 2
void CWindowTaskDeckBar::showRow2(bool on) {
    for (int i = DB_LBU; i <= DB_RBD; i++) showPart(spr[i].get(), on);
    showPart(spr[DB_TITLEBOTTOM].get(), on);
}

// @yo2 0x00913c10
void CWindowTaskDeckBar::showTitle1(bool on) { showPart(spr[DB_TITLETOP].get(), on); }

// @yo2 0x00913cb0 vf14
bool CWindowTaskDeckBar::onMouse(int32_t msg) {
    if (msg != 0x201) return false;
    ctrlNotifyOwner(this, 1);
    return true;
}

// ================================================================ CSortList / CSortBase

// @yo2 0x00913d00
void CSortList::construct() {
    vtbl = 0;
    items.clear();
}

// @yo2 0x00913dd0 deleting destructor
static void sortListDelete(CSortList* l, bool free) {
    l->destruct();
    if (free) delete l;
}

// @yo2 0x00913e00 the entry with this key, or null
CSortBase* CSortList::find(int32_t key) {
    for (size_t i = 0; i < items.size(); i++)
        if (items[i].key == key) return &items[i];
    return nullptr;
}

// @yo2 0x00913e80
void CSortList::add(int32_t key, int32_t value) {
    CSortBase e{0, key, value, -1};
    sortVecInsert(items, items.end(), 1, e);
}

// @yo2 0x00913f10 CSortBase::CSortBase (sets the vtable)
// @yo2 0x00913f30 CSortBase deleting destructor
static void sortBaseInit(CSortBase* b) { b->vtbl = 0; }

// @yo2 0x00913f60 a missing key, or a result >= 0x100, leaves *out = 0 and returns false
bool CSortList::increase(int32_t key, int32_t by, int32_t* out) {
    *out = 0;
    for (CSortBase& e : items) {
        if (e.key != key) continue;
        int32_t v = e.value + by;
        if (v >= 0x100) return false;
        e.value = *out = v;
        return true;
    }
    return false;
}

// @yo2 0x00913fd0 a missing key, or a result < 0, leaves *out = 0 and returns false
bool CSortList::decrease(int32_t key, int32_t by, int32_t* out) {
    *out = 0;
    for (CSortBase& e : items) {
        if (e.key != key) continue;
        int32_t v = e.value - by;
        if (v < 0) return false;
        e.value = *out = v;
        return true;
    }
    return false;
}

// @yo2 0x00914040
void CSortList::destruct() { sortVecTidy(items); }

// @yo2 0x00920250 vector<CSortBase>::insert(pos, n, val)
void sortVecInsert(VcVector<CSortBase>& v, CSortBase* pos, uint32_t n, const CSortBase& val) {
    if (!n) return;
    size_t at = pos && v.first ? (size_t)(pos - v.first) : v.size();
    CSortBase copy = val;
    for (uint32_t i = 0; i < n; i++) v.push_back(copy);   // grow (the exe reallocates to max(2*size, size+n))
    for (size_t k = v.size() - 1; k >= at + n; k--) v[k] = v[k - n];
    for (uint32_t i = 0; i < n; i++) v[at + i] = copy;
}

// @yo2 0x009205b0 construct(p, val): copy key/value/extra and set the vtable
static void sortBaseCopy(CSortBase* p, const CSortBase& v) {
    if (p) *p = CSortBase{0, v.key, v.value, v.extra};
}

// @yo2 0x009201b0 destroy every element, free the block
void sortVecTidy(VcVector<CSortBase>& v) { v.clear(); }

// ================================================================ CWindowTaskSwapIcon

// @yo2 0x00914150
CWindowTaskSwapIcon* swapIconNew(void* parent) {
    auto* s = new CWindowTaskSwapIcon;
    s->construct();
    return (CWindowTaskSwapIcon*)taskCreate(s, parent, 10000);
}

// @yo2 0x00914210
void CWindowTaskSwapIcon::construct() {
    std::memset(base.b, 0, sizeof base.b);   // TODO(System) CWindowTaskControll ctor (FUN_005de6b0)
    mediatorVtbl = 0;
    toMain.setUser(this);
    toSide.setUser(this);
    number.setUser(this);
    x = y = w = h = iconX = iconY = textDx = textDy = 0;
    alpha = 1.0f;
    base_ = count = diff = state = 0;
}

// @yo2 0x009143a0 vf9
static void swapIconSetAlpha(CWindowTaskSwapIcon* s, float a) { s->alpha = a; }

// @yo2 0x00916880 IWindowTaskMediator slot 0: forwarded to the owner's slot 0
// @yo2 0x009143e0 slot 1
// @yo2 0x00914420 slot 2
// @yo2 0x00914460 slot 3
static void swapIconForward(CWindowTaskSwapIcon* s, int32_t slot) { ctrlNotifyOwner(s, slot); }

// @yo2 0x009144d0
void CWindowTaskSwapIcon::destruct() {
    number.set(nullptr);
    toSide.set(nullptr);
    toMain.set(nullptr);
}
// @yo2 0x009144a0 deleting destructor
static void swapIconDelete(CWindowTaskSwapIcon* s, bool free) {
    s->destruct();
    if (free) delete s;
}

// One of the two marks: a stopped, hidden swf whose clicks come to this icon.
static void makeMark(CWindowTaskSwapIcon* s, TaskPtr<CSwfEngine>& p, const char* path, const char* name,
                     const char* fail, float z) {
    p.set(swfCreate(s, 0, VcString(path), 1));
    DK_ASSERT(p.task, fail);
    elemSetPos3(p.get(), 728.0f, 400.0f, z);
    taskSetInstName(p.get(), name);
    swfGotoFrame(p.get(), 0);
    swfSetHold(p.get(), true);
    elemSetFlagC7(p.get());
    showPart(p.get(), false);
    elemSetListener(p.get(), s);
}

// @yo2 0x00914560 vf4
bool CWindowTaskSwapIcon::create() {
    w = h = 256.0f;
    x = y = 0;
    base.put<float>(CTRL_DEPTH, 2.0f);
    alpha = 1.0f;
    base_ = count = diff = state = 0;
    iconX = 728.0f, iconY = 400.0f;
    textDx = 56.0f, textDy = 12.0f;
    base.put<uint8_t>(EL_FLAG_C7, 1);
    const float z = base.get<float>(CTRL_DEPTH);
    makeMark(this, toMain, "data/deck/change_mark02.txt", "SwapIconToMain", "SwfEngine SwapIconToMain create failed", z);
    makeMark(this, toSide, "data/deck/change_mark01.txt", "SwapIconToSide", "SwfEngine SwapIconToSide create failed", z);
    number.set(textCreate(this, &mediatorVtbl));
    DK_ASSERT(number.task, "SwfEngine Number create failed");
    taskSetInstName(number.get(), "SwapNumber");
    elemSetPos2(number.get(), 784.0f, 412.0f);
    textSetDepth(number.get(), z + 3.0f);
    textSetString(number.get(), wformatInt("@0%d", diff));
    textSetSize(number.get(), 0x20);
    textSetColor(number.get(), 0, 0, 0, 1.0f);
    textRefresh(number.get());
    ctrlRelayout(this);
    return true;
}

// @yo2 0x00915850 vf13
void CWindowTaskSwapIcon::updatePos() {
    base.put<float>(EL_X, x);
    base.put<float>(EL_Y, y);
    base.put<float>(EL_Z, base.get<float>(CTRL_DEPTH));
}

// @yo2 0x00915880 both marks at (px, py), the number at the current offset from them
void CWindowTaskSwapIcon::setIconPos(float px, float py) {
    const float z = base.get<float>(CTRL_DEPTH);
    elemSetPos3(toMain.get(), px, py, z);
    elemSetPos3(toSide.get(), px, py, z);
    elemSetPos2(number.get(), px + textDx, py + textDy);   // the exe writes +0x374/+0x378 and +0x70/+0x74
    iconX = px;
    iconY = py;
}

// @yo2 0x00915990 n cards against base_: fewer -> "to main" mark, more -> "to side" mark, equal -> none; the
// number shows |base_ - n| ("@2%d"), 16 pixels further left from two digits on
void CWindowTaskSwapIcon::setCount(int32_t n) {
    int32_t d = base_ - n;
    float tx = 0, ty = 0;
    count = n;
    diff = d;
    auto stop = [](TaskPtr<CSwfEngine>& p) {
        swfSetHold(p.get(), false);
        swfGotoFrame(p.get(), 0);
        showPart(p.get(), false);
    };
    auto play = [](TaskPtr<CSwfEngine>& p) {
        swfSetHold(p.get(), true);
        swfPlayLabel(p.get(), 1, VcString("this"));
        showPart(p.get(), true);
    };
    if (d > 0) {
        state = SWAP_TO_MAIN;
        play(toMain);
        stop(toSide);
        textDx = 56.0f, textDy = 156.0f;
        tx = iconX + 56.0f, ty = iconY + 156.0f;
        showPart(number.get(), true);
    } else if (d < 0) {
        state = SWAP_TO_SIDE;
        stop(toMain);
        play(toSide);
        textDx = 56.0f, textDy = 12.0f;
        tx = iconX + 56.0f, ty = iconY + 12.0f;
        showPart(number.get(), true);
    } else {
        state = SWAP_NONE;
        stop(toMain);
        stop(toSide);
        textRefresh(number.get());
    }
    diff = d < 0 ? -d : d;
    textSetString(number.get(), wformatInt("@2%d", diff));
    if (diff / 10 != 0) tx -= 16.0f;
    elemSetPos2(number.get(), tx, ty);
}

// @yo2 0x00916900 CTask vf2: the base receive
static void swapIconReceive(CWindowTaskSwapIcon* s, int32_t msg) { elemOnChildDestroyed(s, msg); }

// ================================================================ CWindowTaskCardArea

// @yo2 0x00916920
CWindowTaskCardArea* cardAreaNew(void* parent, int32_t mode) {
    auto* a = new CWindowTaskCardArea;
    a->construct();
    a->mode = mode;   // FUN_00916a00 (inline setter, its first argument unused)
    return (CWindowTaskCardArea*)taskCreate(a, parent, 10000);
}
// @yo2 0x00916a00
static void cardAreaSetMode(CWindowTaskCardArea* a, int32_t, int32_t mode) { a->mode = mode; }

// @yo2 0x00916a20
void CWindowTaskCardArea::construct() {
    std::memset(base.b, 0, sizeof base.b);   // TODO(System) CWindowTaskModel ctor (FUN_005ded60)
    for (auto& f : frame) f.setUser(this);
    plane.setUser(this);
    sw1.setUser(this);
    sw2.setUser(this);
    sel1 = sel2 = -1;
    for (auto& t : text) t.clear();
    x = y = w = h = 0;
    alpha = 1.0f;
    mode = 0;
}

// The card area's 14 frame tiles per mode: {x, y, u, v, scaleX, scaleY}, 8x8 cells of window_base_01.
struct AreaTile {
    float x, y;
    int32_t u, v;
    float sx, sy;
};
static const AreaTile kAreaTall[14] = {   // mode 1: second row at 248..288
    {0, 0, 0, 0, 1, 1},          {8, 0, 8, 0, 59, 1},          {480, 0, 0x10, 0, 1, 1},
    {0, 248, 0x48, 8, 1, 1},     {8, 248, 0x38, 0x10, 59, 1},  {480, 248, 0x50, 8, 1, 1},
    {0, 256, 0x18, 8, 1, 3},     {8, 256, 0x20, 8, 59, 3},     {480, 256, 0x28, 8, 1, 3},
    {0, 280, 0x18, 0x10, 1, 1},  {8, 280, 0x20, 0x10, 59, 1},  {480, 280, 0x28, 0x10, 1, 1},
    {0, 8, 0, 8, 1, 30},         {480, 8, 0x10, 8, 1, 30}};
static const AreaTile kAreaTrade[14] = {   // mode 3: the long trade list, row at 596..636
    {0, 0, 0, 0, 1, 1},          {8, 0, 8, 0, 59, 1},          {480, 0, 0x10, 0, 1, 1},
    {0, 596, 0x48, 8, 1, 1},     {8, 596, 0x38, 0x10, 59, 1},  {480, 596, 0x50, 8, 1, 1},
    {0, 604, 0x18, 8, 1, 3},     {8, 604, 0x20, 8, 59, 3},     {480, 604, 0x28, 8, 1, 3},
    {0, 628, 0x18, 0x10, 1, 1},  {8, 628, 0x20, 0x10, 59, 1},  {480, 628, 0x28, 0x10, 1, 1},
    {0, 8, 0, 8, 1, 73.5f},      {480, 8, 0x10, 8, 1, 73.5f}};
static const AreaTile kAreaTrade2[14] = {   // mode 4: row at 546..586
    {0, 0, 0, 0, 1, 1},          {8, 0, 8, 0, 59, 1},          {480, 0, 0x10, 0, 1, 1},
    {0, 546, 0x48, 8, 1, 1},     {8, 546, 0x38, 0x10, 59, 1},  {480, 546, 0x50, 8, 1, 1},
    {0, 554, 0x18, 8, 1, 3},     {8, 554, 0x20, 8, 59, 3},     {480, 554, 0x28, 8, 1, 3},
    {0, 578, 0x18, 0x10, 1, 1},  {8, 578, 0x20, 0x10, 59, 1},  {480, 578, 0x28, 0x10, 1, 1},
    {0, 8, 0, 8, 1, 67.25f},     {480, 8, 0x10, 8, 1, 67.25f}};
static const AreaTile kAreaPlain[14] = {   // other modes: title band 0..40, body to 288
    {0, 0, 0x18, 0, 1, 1},       {8, 0, 0x20, 0, 59, 1},       {480, 0, 0x28, 0, 1, 1},
    {0, 8, 0x18, 8, 1, 3},       {8, 8, 0x20, 8, 59, 3},       {480, 8, 0x28, 8, 1, 3},
    {0, 32, 0x48, 0, 1, 1},      {8, 32, 0x38, 0, 59, 1},      {480, 32, 0x50, 0, 1, 1},
    {0, 280, 0, 0x10, 1, 1},     {8, 280, 8, 0x10, 59, 1},     {480, 280, 0x10, 0x10, 1, 1},
    {0, 40, 0, 8, 1, 30},        {480, 40, 0x10, 8, 1, 30}};

// @yo2 0x00917240 vf4: the 14-piece frame (skin window_base_01: mode 1 _c02, 2 _c04, 3/4 _c07, else _c01), the
// back plane, and the two text switches (ready: text 0x1427, or 0xfae in the trade modes 3/4; cancel: 0xfa3)
bool CWindowTaskCardArea::create() {
    base.put<float>(0x388, 256.0f);   // CWindowTaskModel width / height
    base.put<float>(0x38c, 256.0f);
    x = y = 0;
    alpha = 1.0f;
    base.put<uint8_t>(EL_FLAG_C7, 1);
    VcString path = skinDir();
    path += mode == 1 ? "window_base_01_c02.png"
          : mode == 2 ? "window_base_01_c04.png"
          : (mode == 3 || mode == 4) ? "window_base_01_c07.png" : "window_base_01_c01.png";
    static const char* const names[14] = {"L1", "C1", "R1", "L2", "C2", "R2", "L3",
                                          "C3", "R3", "L4", "C4", "R4", "LSide", "RSide"};
    for (int i = 0; i < 14; i++) makeSprite(frame[i], this, path, names[i]);
    plane.set(planeCreate(this, base.b + 0x340));
    DK_ASSERT(plane.task, "BG create failed");
    taskSetInstName(plane.get(), "BG");
    elemSetFlagC7(plane.get());
    sw1.set(switchCreate(this, base.b + 0x340));
    DK_ASSERT(sw1.task, "readySwitch create failed");
    taskSetInstName(sw1.get(), "TradereadySwitch");
    switchSetText(sw1.get(), textTable(mode == 3 || mode == 4 ? 0xfae : 0x1427));
    switchSetOwner(sw1.get(), base.b + 0x340);
    sw2.set(switchCreate(this, base.b + 0x340));
    DK_ASSERT(sw2.task, "cancelSwitch create failed");
    taskSetInstName(sw2.get(), "TradecancelSwitch");
    switchSetText(sw2.get(), textTable(0xfa3));
    switchSetOwner(sw2.get(), base.b + 0x340);

    const AreaTile* t = mode == 1 ? kAreaTall : mode == 3 ? kAreaTrade : mode == 4 ? kAreaTrade2 : kAreaPlain;
    for (int i = 0; i < 14; i++) {
        elemSetPos3(frame[i].get(), t[i].x, t[i].y, 0);
        spriteSetAlpha(frame[i].get(), alpha);
        spriteSetSrc(frame[i].get(), t[i].u, t[i].v, 8, 8);
        if (t[i].sx != 1) elemSetScaleX(frame[i].get(), t[i].sx);
        if (t[i].sy != 1) elemSetScaleY(frame[i].get(), t[i].sy);
    }
    const float planeH = mode == 3 ? 588.0f : mode == 4 ? 538.0f : 240.0f;
    planeSetSize(plane.get(), 472.0f, planeH);
    elemSetPos2(plane.get(), 8.0f, mode == 1 || mode == 3 || mode == 4 ? 8.0f : 40.0f);   // FUN_0089a430
    planeSetColor(plane.get(), 1.0f, 1.0f, 1.0f, alpha);
    switchPlace(sw1.get(), 196.0f, 256.0f, 96.0f, 24.0f, mode == 1);
    switchPlace(sw2.get(), 340.0f, 256.0f, 96.0f, 24.0f, false);
    for (auto& f : frame) elemSetZ(f.get(), 0);
    elemSetZ(plane.get(), 0);
    elemSetDepth(sw1.get(), 1.0f);   // FUN_0091f930 on each switch
    elemSetDepth(sw2.get(), 1.0f);
    modelInstallDefaultHandler(this);
    ctrlMark350(base.b);
    updatePos();   // vtable slot 9
    return true;
}

// @yo2 0x00916e50 CWindowTaskModel slot 8: calls its own slot 9 (updatePos)
static void cardAreaSlot8(CWindowTaskCardArea* a) { a->updatePos(); }

// @yo2 0x00916e70 vf10
int32_t CWindowTaskCardArea::childDepth() const { return (int32_t)(base.get<float>(CTRL_DEPTH) + 5.0f); }

// @yo2 0x00916ea0 mediator slot 1: the base handler
static void cardAreaMediator1(CWindowTaskCardArea* a) { modelActivate(a); }
// @yo2 0x00916ec0 mediator slot 2 (empty)
// @yo2 0x00916ee0 mediator slot 3 (empty)
static void cardAreaMediatorNop(CWindowTaskCardArea*) {}

// @yo2 0x00916f30
void CWindowTaskCardArea::destruct() {
    for (int i = 3; i >= 0; i--) text[i].clear();
    sw2.set(nullptr);
    sw1.set(nullptr);
    plane.set(nullptr);
    for (int i = 13; i >= 0; i--) frame[i].set(nullptr);
}
// @yo2 0x00916f00 deleting destructor
static void cardAreaDelete(CWindowTaskCardArea* a, bool free) {
    a->destruct();
    if (free) delete a;
}

// @yo2 0x00917130 a click on a text switch asks the owner for its help message (msg ids are text-table ids)
void CWindowTaskCardArea::onMediator0(void* sender) {
    modelActivate(this);
    if (!base.get<uint32_t>(0x394)) return;   // no owner
    if (sender && sender == (void*)sw1.task) {
        modelNotifyOwner(this, 0, (mode == 3 || mode == 4) ? 0xfae : 0x1427);
    } else if (sender && sender == (void*)sw2.task) {
        modelNotifyOwner(this, 0, 0xfa3);
    }
}

// @yo2 0x0091f960 slot 9
void CWindowTaskCardArea::updatePos() {
    base.put<float>(EL_X, x);
    base.put<float>(EL_Y, y);
}

// @yo2 0x0091f990 narrow (x 480) or wide (x 768) placement of the right-hand frame column; the tall mode (1) has
// a second row at 248..280 and swaps the two text switches
void CWindowTaskCardArea::setWide(bool wide) {
    const float fx = wide ? 768.0f : 480.0f, sx = wide ? 95.0f : 59.0f, px = wide ? 760.0f : 472.0f;
    auto at = [&](int i, float y) { elemSetPos3(frame[i].get(), fx, y, 0); };
    elemSetScaleX(frame[1].get(), sx);
    at(2, 0);
    elemSetScaleX(frame[4].get(), sx);
    if (mode == 1) {
        at(5, 248.0f);
        elemSetScaleX(frame[7].get(), sx);
        elemSetScaleY(frame[7].get(), 3.0f);
        at(8, 256.0f);
        elemSetScaleX(frame[10].get(), sx);
        at(11, 280.0f);
        at(13, 8.0f);
        planeSetSize(plane.get(), px, 240.0f);
        showPart(sw1.get(), !wide);
        showPart(sw2.get(), wide);
        return;
    }
    elemSetScaleY(frame[4].get(), 3.0f);
    at(5, 8.0f);
    elemSetScaleX(frame[7].get(), sx);
    at(8, 32.0f);
    elemSetScaleX(frame[10].get(), sx);
    at(11, 280.0f);
    at(13, 40.0f);
    planeSetSize(plane.get(), px, 240.0f);
}

// @yo2 0x0091ffd0
void CWindowTaskCardArea::setSwitch1(bool on) { switchSetOn(sw1.get(), on); }
// @yo2 0x00920000 (island) the same setter for the second switch
void CWindowTaskCardArea::setSwitch2(bool on) { switchSetOn(sw2.get(), on); }

// @yo2 0x00920030
void CWindowTaskCardArea::showSwitch1(bool on) { showPart(sw1.get(), on); }

// @yo2 0x009200a0
void CWindowTaskCardArea::setPlaneDefault() { planeSetColor(plane.get(), 1.0f, 1.0f, 1.0f, 0.7f); }

// @yo2 0x009200e0
void CWindowTaskCardArea::setPlaneColor(float r, float g, float b, float a) { planeSetColor(plane.get(), r, g, b, a); }

// @yo2 0x00920120 CTaskPtr<CSpriteElm>: target gone
// @yo2 0x00920150 CTaskPtr<CWindowTaskBackPlane>: target gone
// @yo2 0x00920180 CTaskPtr<CWindowTaskTextSwitch>: target gone
template <class T>
static bool ptrDead(const TaskPtr<T>& p) { return p.task == nullptr; }
// @yo2 0x00920220 CTaskPtr<CSpriteElm>::raw (the dynamic_cast without the liveness check)
template <class T>
static T* ptrRaw(const TaskPtr<T>& p) { return p.task; }

// ================================================================ inline System methods emitted here

// @yo2 0x0091f8f0
void elemMarkC7(uint8_t* elem) { elem[EL_FLAG_C7] = 1; }
// @yo2 0x0091f910
void ctrlMark350(uint8_t* ctrl) { ctrl[CTRL_FLAG_350] = 1; }
// @yo2 0x0091f930
void ctrlSetDepth(uint8_t* ctrl, float z) {
    std::memcpy(ctrl + CTRL_DEPTH, &z, 4);
    std::memcpy(ctrl + EL_Z, &z, 4);
}

// Keep the file-local helpers referenced (they are vtable slots in the exe).
[[maybe_unused]] static const void* const kSlots[] = {
    (const void*)&returnsFalse,      (const void*)&returnsTrue,         (const void*)&deckBarDelete,
    (const void*)&relayoutPart<CWindowTaskDeckBar>, (const void*)&relayoutPart<CWindowTaskSwapIcon>,
    (const void*)&deckBarSetAlpha,   (const void*)&sortListDelete,      (const void*)&sortBaseInit,
    (const void*)&sortBaseCopy,      (const void*)&swapIconSetAlpha,    (const void*)&swapIconForward,
    (const void*)&swapIconDelete,    (const void*)&swapIconReceive,     (const void*)&cardAreaSetMode,
    (const void*)&cardAreaSlot8,     (const void*)&cardAreaMediator1,   (const void*)&cardAreaMediatorNop,
    (const void*)&cardAreaDelete,    (const void*)&ptrDead<CSpriteElm>,
    (const void*)&ptrDead<CWindowTaskBackPlane>, (const void*)&ptrDead<CWindowTaskTextSwitch>,
    (const void*)&ptrRaw<CSpriteElm>,
};

}   // namespace dk
