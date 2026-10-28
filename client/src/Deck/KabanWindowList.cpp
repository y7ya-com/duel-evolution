// yo2KabanWindow.cpp, second half (0x00966180..0x0097c8e0): the trunk list. See KabanWindowList.h.
#include "KabanWindowList.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <initializer_list>

#include "DeckTables.h"

namespace dk {

CWindowTaskKabanList* g_kabanList = nullptr;   // DAT_012b3980
CWindowTaskKaban* g_kaban = nullptr;           // DAT_012b3988
CWindowModelKaban* g_modelKaban = nullptr;     // DAT_012b3998

namespace {

const float kBright = 1.0f, kDim = 0.5f;
const float kMiniScale = 0.6944444f;   // 0x3f31c71c / 0x00befe48: mini pictures are drawn at 1/1.44
const int32_t kWmLButtonDown = 0x201;

template <class T>
void release(TaskPtr<T>& p) {
    if (p.task) taskRemoveUser(p.task, &p);
    p.task = nullptr;
}

// show or hide an element: visibility plus the "ignore the mouse" bit, as the exe pairs them
void show(void* e, bool on) {
    if (!e) return;
    if (on) elemSetInputOff(e, false);
    elemSetVisible(e, on);
    if (!on) elemSetInputOff(e, true);
}

// a field of another Deck window, written at its exe offset (the other part owns the class)
void pokeF(void* obj, uint32_t off, float v) {
    if (obj) std::memcpy((uint8_t*)obj + off, &v, sizeof v);
}

void place(CSpriteElm* s, float x, float y, float z, float alpha, int32_t u, int32_t v) {
    if (!s || !elemCreated(s)) return;
    elemSetPos3(s, x, y, z);
    spriteSetAlpha(s, alpha);
    spriteSetSrc(s, u, v, 8, 8);
}

int32_t modelMode() { return g_modelKaban ? g_modelKaban->mode : 0; }

}   // namespace

// @yo2 0x0096e6a0 CWindowTaskKabanListBtn IWindowTaskMediator slot 0
// @yo2 0x00966740 slot 1
// @yo2 0x00966780 slot 2
// @yo2 0x009667c0 slot 3
// @yo2 0x00973f10 CWindowTaskKabanList slot 0
// @yo2 0x0096f310 slot 1
// @yo2 0x0096f350 slot 2
// @yo2 0x0096f390 slot 3
// @yo2 0x00977540 CWindowTaskKaban slot 0
// @yo2 0x00974b20 slot 1
// @yo2 0x00974b60 slot 2
// @yo2 0x00974ba0 slot 3
void ControllBase::relay(int32_t slot) { notify(slot); }

bool kabanCanTake(int32_t mode, int32_t card, int32_t have, bool konamiToo) {
    switch (mode) {
    case 0: {   // deck editor: a copy left, under the limited-list count, and the deck window takes it
        if (have < 1) return false;
        int32_t lim = card::limit(card::konamiId(card));
        if (konamiToo && deckCopiesKonami(card) >= lim) return false;
        return deckCopies(card) < lim && !deckRefuses(card);
    }
    case 1:     // trade: a tradable copy not yet offered, at most 10 cards in the offer
        return have >= 1 && tradeOffered(card) < tradeAvailable(card) && tradeSlotsUsed() < 10;
    case 2:
        return presentHasRoom();
    case 3:
        return tpHasRoom();
    }
    return false;
}

// ---------------------------------------------------------------- CSortBase / CSortList shapes

SortItem* SortItems::find(int32_t c) {
    for (SortItem& e : v)
        if (e.card == c) return &e;
    return nullptr;
}

bool SortItems::add(int32_t c, int32_t delta, int32_t* now) {
    *now = 0;
    SortItem* e = find(c);
    if (!e || e->count + delta >= 0x100) return false;
    e->count += delta;
    *now = e->count;
    return true;
}

bool SortItems::sub(int32_t c, int32_t delta, int32_t* now) {
    *now = 0;
    SortItem* e = find(c);
    if (!e || e->count - delta < 0) return false;
    e->count -= delta;
    *now = e->count;
    return true;
}

void SortItems::push(int32_t c, int32_t count) {
    SortItem e;
    e.card = c;
    e.count = count;
    v.push_back(e);
}

// @yo2 0x00973500 CSortBase::CSortBase
void sortBaseConstruct(SortItem* p) {
    p->vtbl = 0;
    p->card = p->count = 0;
    p->order = -1;
}

// @yo2 0x0097a430 CSortBase vector deleting destructor (flags & 2: an array new[] with its count before it)
// (the plain destructor, FUN_00913f10, is yo2DeckParts.cpp's)
SortItem* sortBaseDestroy(SortItem* p, uint8_t flags) {
    if (flags & 2) {
        uint32_t* head = (uint32_t*)p - 1;
        if (flags & 1) ::operator delete(head);
        return (SortItem*)head;
    }
    if (flags & 1) ::operator delete(p);
    return p;
}

// @yo2 0x00971640 qsort comparator of the name sort
int sortByKey(const SortItem* a, const SortItem* b) {
    return card::sortKey(card::konamiId(a->card)) - card::sortKey(card::konamiId(b->card));
}

// @yo2 0x00971690 qsort(items + lo, hi - lo + 1)
// @yo2 0x00971620 (makes the comparator pointer)
void sortItemsByKey(SortItem* items, int32_t lo, int32_t hi) {
    if (hi < lo) return;
    std::qsort(items + lo, (size_t)(hi - lo + 1), sizeof(SortItem),
               [](const void* a, const void* b) { return sortByKey((const SortItem*)a, (const SortItem*)b); });
}

// ---- smart_ptr<CSortBase>: owners form a ring through prev/next; the last one out deletes

// @yo2 0x0097a9c0 smart_ptr(p, own)
void sortRefInit(SortRef* r, SortItem* p, bool own) {
    r->ptr = p;
    r->prev = r->next = own ? r : nullptr;
}

// @yo2 0x0097a090 release
void sortRefReset(SortRef* r) {
    if (r->prev) {
        if (r->prev == r) {
            delete r->ptr;   // alone in the ring: we own it
        } else {
            r->prev->next = r->next;   // unlink
            r->next->prev = r->prev;
        }
        r->prev = r->next = nullptr;
    }
    r->ptr = nullptr;
}

// @yo2 0x00979ff0 ~smart_ptr
// @yo2 0x0097a390 deleting destructor
void sortRefDestroy(SortRef* r) { sortRefReset(r); }

// @yo2 0x0097aa00 reset(p): own a new object
void sortRefAssignNew(SortRef* r, SortItem* p) {
    sortRefReset(r);
    if (p) sortRefInit(r, p, true);
}

// @yo2 0x0097bc20 copy-construct: join src's ring
void sortRefCopy(SortRef* dst, SortRef* src) {
    if (!dst) return;
    dst->vtbl = src->vtbl;
    dst->ptr = src->ptr;
    if (src->prev) {
        dst->prev = src;
        dst->next = src->next;
        src->next->prev = dst;
        src->next = dst;
    } else {
        dst->prev = dst->next = nullptr;
    }
}

void sortRefAssign(SortRef* dst, SortRef* src) {
    if (dst == src) return;
    sortRefReset(dst);
    sortRefCopy(dst, src);
}

// @yo2 0x0097bc90 fill [first, last) with copies of val
static void sortRefFill(SortRef* first, SortRef* last, SortRef* val) {
    for (; first != last; first++) sortRefAssign(first, val);
}

// @yo2 0x0097bd00 copy_backward
static SortRef* sortRefCopyBackward(SortRef* first, SortRef* last, SortRef* dest) {
    while (last != first) sortRefAssign(--dest, --last);
    return dest;
}

// @yo2 0x0097a970 uninitialized_copy
static SortRef* sortRefUninitCopy(SortRef* first, SortRef* last, SortRef* dest) {
    for (; first != last; first++, dest++) sortRefCopy(dest, first);
    return dest;
}

// @yo2 0x0097ace0 uninitialized_fill_n
static void sortRefUninitFill(SortRef* dest, int32_t n, SortRef* val) {
    for (; n > 0; n--) sortRefCopy(dest++, val);
}

// @yo2 0x0097a930 destroy [first, last)
// @yo2 0x0097aaa0
static void sortRefDestroyRange(SortRef* first, SortRef* last) {
    for (; first != last; first++) sortRefDestroy(first);
}

// @yo2 0x0097aae0 vector<smart_ptr<CSortBase>>::insert(pos, val)
SortRef* SortRefVec::insert(SortRef* pos, SortRef* val) {
    int32_t at = first ? (int32_t)(pos - first) : 0;
    if (first && last != end) {
        if (pos == last) {
            sortRefUninitFill(last, 1, val);
        } else {
            sortRefUninitCopy(last - 1, last, last);
            sortRefCopyBackward(pos, last - 1, last);
            sortRefFill(pos, pos + 1, val);
        }
        last++;
        return first + at;
    }
    int32_t n = size(), grow = n < 2 ? 1 : n;   // the VC6 growth: double, at least 1
    SortRef* mem = (SortRef*)::operator new((size_t)(n + grow) * sizeof(SortRef));
    SortRef* p = sortRefUninitCopy(first, pos, mem);
    sortRefCopy(p, val);
    sortRefUninitCopy(pos, last, p + 1);
    sortRefDestroyRange(first, last);
    ::operator delete(first);
    first = mem;
    last = mem + n + 1;
    end = mem + n + grow;
    return first + at;
}

// @yo2 0x0097a860 vector<smart_ptr<CSortBase>>::erase(from, to)
SortRef* SortRefVec::erase(SortRef* from, SortRef* to) {
    SortRef* d = from;
    for (SortRef* s = to; s != last; s++, d++) sortRefAssign(d, s);
    sortRefDestroyRange(d, last);
    last = d;
    return from;
}

void SortRefVec::destroy() {
    sortRefDestroyRange(first, last);
    ::operator delete(first);
    first = last = end = nullptr;
}

// @yo2 0x0097a100 the auto-array holder's destructor
// @yo2 0x0097a140 release
// @yo2 0x0097a3c0 deleting destructor
void sortArrayRelease(SortArrayHolder* h) {
    if (h->ptr && h->own) {
        sortBaseDestroy(h->ptr, 3);   // delete[]
        h->own = 0;
    }
    h->ptr = nullptr;
}

// @yo2 0x0097aa30 operator=: take src's array and its ownership
SortArrayHolder* sortArrayTake(SortArrayHolder* dst, SortArrayHolder* src) {
    if (dst != src) {
        sortArrayRelease(dst);
        dst->ptr = src->ptr;
        dst->own = src->own;
        src->own = 0;
    }
    return dst;
}

// ---- vector<CSortBase> / vector<int> instances

// @yo2 0x0097a6c0 vector<CSortBase>: "invalid vector<T> subscript"
[[noreturn]] static void sortVecXran() { vectorXran(); }

// @yo2 0x0097a7e0 vector<CSortBase>::erase(from, to)
// @yo2 0x00973530 (the whole-range clear + free, ~vector)
// @yo2 0x00978280 (the whole-range clear)
SortItem* sortItemsErase(VcVector<SortItem>* v, SortItem* from, SortItem* to) {
    if (from < v->first || to > v->last || from > to) sortVecXran();
    size_t i = (size_t)(from - v->first), n = (size_t)(to - from);
    for (size_t k = 0; k < n; k++) v->erase(i);
    return v->first + i;
}

// @yo2 0x00978250 vector<CSortBase>::size
// @yo2 0x00978200 (clear without freeing: last = first)
// @yo2 0x009735a0 (the 12-byte field copy of a CSortBase's card/count/order)
// @yo2 0x0097bba0 copy [first, last) -> dest by those fields
// @yo2 0x0097bbf0 construct one int in place (vector<int>)
// @yo2 0x00979f90 vector<T>(allocator): all null
// These are VcVector<T> (DeckCommon.h) / SortItem's implicit copy.

// @yo2 0x00973160
XranError* xranCopy(XranError* self, const XranError* from) {
    self->what = from->what;
    self->vtbl = 0x00be72b0;
    return self;
}

// @yo2 0x00973330
XranError* xranConstruct(XranError* self, const VcString& msg) {
    self->what = msg;
    self->vtbl = 0x00be729c;
    return self;
}

// @yo2 0x0097a4b0 vector<int>::insert(pos, val)
int32_t* intVecInsert(VcVector<int32_t>* v, int32_t* pos, const int32_t* val) {
    size_t at = v->first ? (size_t)(pos - v->first) : 0;
    int32_t x = *val;   // val may point into the vector
    v->push_back(x);
    for (size_t k = v->size() - 1; k > at; k--) (*v)[k] = (*v)[k - 1];
    (*v)[at] = x;
    return v->first + at;
}

// ---------------------------------------------------------------- CWindowTaskKabanListBtn

uint8_t kabanRowColor(int32_t kind) {
    switch (kind) {
    case 0: case 10: return KLB_NORMAL;
    case 1: case 6: case 7: case 8: case 9: case 11: return KLB_EFFECT;
    case 2: case 3: return KLB_FUSION;
    case 4: case 5: return KLB_RITUAL;
    case 13: return KLB_SPELL;
    case 14: return KLB_TRAP;
    }
    return KLB_NONE;
}

// The factory at 0x009660c0 (KabanWindow.cpp) allocates and constructs a button through these two.
size_t kabanListBtnSize() { return sizeof(CWindowTaskKabanListBtn); }
void* kabanListBtnConstruct(void* mem) { return (new (mem) CWindowTaskKabanListBtn())->construct(); }

// @yo2 0x00966180
CWindowTaskKabanListBtn* CWindowTaskKabanListBtn::construct() {
    controllConstruct(this);
    for (int i = 0; i < 7; i++) {
        frameTop[i].setUser(this);
        frameMid[i].setUser(this);
        frameBot[i].setUser(this);
    }
    for (int i = 0; i < 3; i++) body[i].setUser(this), nothing[i].setUser(this);
    pic.setUser(this);
    pic.set(nullptr);
    figure.setUser(this);
    info.setUser(this);
    posX = posY = width = height = 0;
    alpha = 1.0f;
    picX = picY = picZ = 0;
    card = -1;
    type = color = 0;
    enabled = infoShown = picShown = 1;
    hoverTicks = 0;
    clickable = 1;
    taskSetTaskName(this, "CWindowTaskKabanListBtn");
    return this;
}

// @yo2 0x00966870
void CWindowTaskKabanListBtn::destruct() {
    release(info);
    release(figure);
    release(pic);
    for (int i = 2; i >= 0; i--) release(nothing[i]), release(body[i]);
    for (int i = 6; i >= 0; i--) release(frameBot[i]), release(frameMid[i]), release(frameTop[i]);
    controllDestruct(this);
}

// @yo2 0x00966800
// @yo2 0x00966830 (the TaskPtr<CSpriteElm> array element destructor stubs)
// @yo2 0x00966850
CWindowTaskKabanListBtn* CWindowTaskKabanListBtn::destroy(uint8_t flags) {
    destruct();
    if (flags & 1) {
        delete this;
        return nullptr;
    }
    return this;
}

// @yo2 0x009669e0 vf04: the 3x3 frame (7 colour sheets for the left column, sheet 1 for the card body, sheet 0
// for an empty row), the copies figure and the info line
uint32_t CWindowTaskKabanListBtn::build() {
    posX = posY = 0;
    depth = 2.0f;
    width = 256.0f;
    height = 56.0f;
    alpha = 1.0f;
    picX = picY = picZ = 0;
    card = -1;
    type = color = 0;
    enabled = infoShown = picShown = 1;
    hoverTicks = 0;
    clickable = 1;
    char path[64], err[32];
    auto make = [&](TaskPtr<CSpriteElm>& p, int sheet, const char* inst) {
        snprintf(path, sizeof path, "data/deck/deck_carddai_01_c%02d.png", sheet);
        p.set(spriteCreate(this, 10000, VcString(path)));
        snprintf(err, sizeof err, "%s create failed", inst + 3);   // "LT0 create failed", "RB create failed"...
        DK_ASSERT(p.task, err);
    };
    static const char* rowName[3] = {"picLT", "picLC", "picLB"};
    for (int r = 0; r < 3; r++)
        for (int i = 0; i < 7; i++) {
            TaskPtr<CSpriteElm>* col = r == 0 ? frameTop : r == 1 ? frameMid : frameBot;
            char inst[8];
            snprintf(inst, sizeof inst, "%s%d", rowName[r], i);
            make(col[i], i, inst);
        }
    for (int i = 0; i < 7; i++)
        for (int r = 0; r < 3; r++) {
            CSpriteElm* s = (r == 0 ? frameTop : r == 1 ? frameMid : frameBot)[i].get();
            if (!s) continue;
            taskSetInstName(s, rowName[r]);
            spriteSetBlend(s, 2);
            elemSetFlagC7(s, true);
            show(s, false);
        }
    static const char* bodyName[3] = {"picRT", "picRC", "picRB"};
    static const char* nothingName[3] = {"picNothingT", "picNothingC", "picNothingB"};
    for (int r = 0; r < 3; r++) {
        make(body[r], 1, bodyName[r]);
        make(nothing[r], 0, nothingName[r]);
    }
    for (int r = 0; r < 3; r++)
        for (CSpriteElm* s : {body[r].task, nothing[r].task}) {
            if (!s) continue;
            taskSetInstName(s, s == body[r].task ? bodyName[r] : nothingName[r]);
            spriteSetBlend(s, 2);
            elemSetFlagC7(s, true);
            show(s, false);
        }
    figure.set(deckFigureCreate(this, &mediatorVtbl, 0));
    DK_ASSERT(figure.task, "Number create failed");
    if (figure.task) {
        taskSetInstName(figure.task, "Number");
        figureSetValue(figure.task, 0);
        figureShow(figure.task, false);
        figureSetPos(figure.task, 0, 0, 0);
    }
    info.set(cardInfoItemCreate(this, &mediatorVtbl, 1, &layoutVtbl));
    DK_ASSERT(info.task, "CardItem create failed");
    if (info.task) {
        taskSetInstName(info.task, "CardItem");
        cardInfoSetCard(info.task, 0);
        show(info.task, true);
        pokeF(info.task, 0x34c, depth + 2.0f);
        cardInfoSetWidth(info.task, 200.0f);
    }
    layout();
    return 1;
}

// @yo2 0x0096e6e0 vf15: inside the hit box (strictly)
bool CWindowTaskKabanListBtn::hitTest(float mx, float my) {
    float sx, sy;
    elemScreenPos(this, &sx, &sy);
    float x0 = (float)(int32_t)sx, y0 = (float)(int32_t)sy;
    return mx > x0 && mx < x0 + width && my > y0 && my < y0 + height;
}

// @yo2 0x0096cae0 vf05: count the frames the mouse rests on a shown card; the 4th puts it in the detail view
uint32_t CWindowTaskKabanListBtn::onMain() {
    int32_t mx, my;
    mousePos(&mx, &my);
    if (hitTest((float)mx, (float)my) && enabled && picShown) {
        if (hoverTicks++ == 3 && g_kaban) detailSetCard(g_kaban->getDetail(), card);
        if (hoverTicks <= 1000) {
            layout();
            return 1;
        }
    }
    hoverTicks = 0;
    layout();
    return 1;
}

// @yo2 0x0096cbc0 vf13: the 3x3 frame from an 8x8-tile sheet: an 8-px left column per colour, a middle column
// stretched 31x, the middle row stretched 5x (rows at y 0 / 8 / 48).
// The decompile hides which TaskPtr each call targets; the frame pieces are placed by role.
void CWindowTaskKabanListBtn::layout() {
    x = posX, y = posY, z = depth;
    static const float rowY[3] = {0, 8, 48};
    for (int i = 0; i < 7; i++) {
        TaskPtr<CSpriteElm>* col[3] = {&frameTop[i], &frameMid[i], &frameBot[i]};
        for (int r = 0; r < 3; r++) {
            CSpriteElm* s = col[r]->task;
            place(s, 0, rowY[r], 1.0f, alpha, 0, r * 8);
            if (s && r == 1) spriteSetScaleY(s, 5.0f);
        }
    }
    TaskPtr<CSpriteElm>* mid = color ? body : nothing;
    for (int r = 0; r < 3; r++) {
        CSpriteElm* s = mid[r].task;
        place(s, 8, rowY[r], 1.0f, alpha, 8, r * 8);
        if (!s) continue;
        spriteSetScaleX(s, 31.0f);
        if (r == 1) spriteSetScaleY(s, 5.0f);
    }
    if (color && info.task) {
        pokeF(info.task, 0x368, 0);
        pokeF(info.task, 0x36c, 0);
        pokeF(info.task, 0x34c, depth + 2.0f);
    }
}

// @yo2 0x0096d250 show `id` in this row: frame colour from its kind, picture, info line
void CWindowTaskKabanListBtn::setCard(int32_t id) {
    card = id;
    loadPicture();
    cardInfoSetCard(info.task, id);
    color = id < 1 ? KLB_NONE : kabanRowColor(card::kind(card::konamiId(id)));
    for (int i = 0; i < 7; i++) {
        show(frameTop[i].task, false);
        show(frameMid[i].task, false);
        show(frameBot[i].task, false);
    }
    if (!enabled) {
        for (int r = 0; r < 3; r++) show(nothing[r].task, false), show(body[r].task, false);
    } else {
        show(frameTop[color].task, true);
        show(frameMid[color].task, true);
        show(frameBot[color].task, true);
        for (int r = 0; r < 3; r++) {
            show(body[r].task, color != 0);
            show(nothing[r].task, color == 0);
        }
        if (color) {
            show(pic.task, true);
            return;
        }
    }
    show(pic.task, false);
}

// @yo2 0x0096d9d0
void CWindowTaskKabanListBtn::setEnabled(bool on) {
    enabled = on;
    setCard(card);
}

// @yo2 0x0096da00
void CWindowTaskKabanListBtn::setInfoShown(bool on) {
    infoShown = on;
    show(info.task, on);
}

// @yo2 0x0096da90 off: hide the picture; on: redraw the row
void CWindowTaskKabanListBtn::setPicShown(bool on) {
    picShown = on;
    if (!on) {
        if (pic.task) show(pic.task, false);
    } else if (enabled) {
        setCard(card);
    }
}

// @yo2 0x0096db30 create the mini picture "data/MINI/<file>" once
void CWindowTaskKabanListBtn::loadPicture() {
    if (pic.task) return;
    VcString path("data/MINI/");
    path += card::miniFile(card);
    pic.set(spriteCreate(this, 10000, path));
    DK_ASSERT(pic.task, "picElm create failed");
    if (!pic.task) return;
    taskSetInstName(pic.task, "picElm");
    spriteSetBlend(pic.task, 2);
    elemSetFlagC7(pic.task, true);
    show(pic.task, false);
}

// @yo2 0x0096e160
void CWindowTaskKabanListBtn::dropPicture() {
    if (!pic.task) return;
    taskDestroy(pic.get());
    pic.set(nullptr);
}

// @yo2 0x0096e1d0
void CWindowTaskKabanListBtn::setPicColor(float r, float g, float b, float a) {
    if (pic.task) spriteSetColor(pic.task, r, g, b, a);
}

// @yo2 0x0096e270
void CWindowTaskKabanListBtn::setPicPos(int32_t px, int32_t py, int32_t pz) {
    if (pic.task) elemSetPos3(pic.task, (float)px, (float)py, (float)pz);
}

// @yo2 0x0096e2e0
void CWindowTaskKabanListBtn::setPicScale(float sx, float sy) {
    if (pic.task) spriteSetScale(pic.task, sx, sy);
}

// @yo2 0x0096e350
void CWindowTaskKabanListBtn::setCount(int32_t n) { figureSetValue(figure.get(), n); }

// @yo2 0x0096e380
void CWindowTaskKabanListBtn::showCount(bool on) {
    CWindowTaskDeckFigure* f = figure.get();
    if (on) elemSetInputOff(f, false);
    figureShow(f, on);
    if (!on) elemSetInputOff(f, true);
}

// @yo2 0x0096e400
void CWindowTaskKabanListBtn::setCountPos(int32_t px, int32_t py, int32_t pz) { figureSetPos(figure.get(), px, py, pz); }

// @yo2 0x0096e440 tint the whole frame (the dimmed rows)
void CWindowTaskKabanListBtn::setFrameColor(float r, float g, float b, float a) {
    for (int i = 0; i < 7; i++) {
        spriteSetColor(frameTop[i].get(), r, g, b, a);
        spriteSetColor(frameMid[i].get(), r, g, b, a);
        spriteSetColor(frameBot[i].get(), r, g, b, a);
    }
    for (int k = 0; k < 3; k++) spriteSetColor(body[k].get(), r, g, b, a);
}

// @yo2 0x0096e7a0 vf14: a click on the picture picks the card up out of the trunk
uint32_t CWindowTaskKabanListBtn::onMessage(int32_t msg) {
    if (!clickable || msg != kWmLButtonDown || !enabled) return 0;
    int32_t mx, my, w = 0, h = 0;
    mousePos(&mx, &my);
    float px, py;
    elemScreenPos(pic.get(), &px, &py);
    spriteGetSrcSize(pic.get(), &w, &h);
    int32_t x0 = (int32_t)px, y0 = (int32_t)py;
    if (mx <= x0 || (float)x0 + w * kMiniScale <= (float)mx || my <= y0 || (float)y0 + h * kMiniScale <= (float)my)
        return 0;
    if (!g_kaban || g_kaban->dragging || !g_drag || g_drag->state || g_drag->from) return 0;
    int32_t mode = modelMode();
    int32_t have = g_kabanList ? g_kabanList->countOf(card) : 0;
    if (mode < 0 || mode > 3 || !kabanCanTake(mode, card, have, true)) return 0;
    kabanDragStart((float)(mx - 25), (float)(my - 36), 9999.0f, card);
    g_kaban->dragging = 1;
    g_drag->state = 2;
    g_drag->from = 1;
    g_drag->card = card;
    kabanPicked(0);
    notify(1);
    return 1;
}

// ---------------------------------------------------------------- CWindowTaskKabanList

bool kabanCategoryHas(int32_t category, int32_t kind) {
    switch (category) {
    case KL_CAT_NORMAL: return kind == 0 || kind == 10;
    case KL_CAT_EFFECT: return kind == 1 || kind == 6 || kind == 7 || kind == 8 || kind == 9 || kind == 11;
    case KL_CAT_SPELL: return kind == 13;
    case KL_CAT_TRAP: return kind == 14;
    case KL_CAT_RITUAL: return kind == 4 || kind == 5;
    case KL_CAT_FUSION: return kind == 2 || kind == 3;
    case KL_CAT_ALL: return true;
    }
    return false;
}

// @yo2 0x0096ef20
CWindowTaskKabanList* kabanListCreate(void* parent, void* mediator) {
    CWindowTaskKabanList* l = (new CWindowTaskKabanList())->construct();
    g_kabanList = l;
    if (taskCreate(l, parent, 10000)) l->mediator = mediator;
    return l;
}

// @yo2 0x0096efe0
CWindowTaskKabanList* CWindowTaskKabanList::construct() {
    controllConstruct(this);
    for (auto& r : rows) r.setUser(this);
    all.clear();
    shown.clear();
    rowCount = 9;
    posX = posY = width = height = rowHeight = 0;
    alpha = 1.0f;
    category = KL_CAT_ALL;
    top = 0;
    enabled = picsShown = 1;
    wheel = 0;
    taskSetTaskName(this, "CWindowTaskKabanList");
    return this;
}

// @yo2 0x0096f420
// @yo2 0x0096f400 (TaskPtr array element destructor stub)
void CWindowTaskKabanList::destruct() {
    shown.clear();
    all.clear();
    for (int i = 10; i >= 0; i--) release(rows[i]);
    controllDestruct(this);
}

// @yo2 0x0096f3d0
CWindowTaskKabanList* CWindowTaskKabanList::destroy(uint8_t flags) {
    destruct();
    if (flags & 1) {
        delete this;
        return nullptr;
    }
    return this;
}

// @yo2 0x0096f4c0 vf04: 11 rows, 56 px apart; the last two only show in the extended (11-row) list
uint32_t CWindowTaskKabanList::build() {
    posX = posY = 0;
    depth = 2.0f;
    width = 256.0f;
    height = 504.0f;
    rowHeight = 56.0f;
    alpha = 1.0f;
    rowCount = 9;
    category = KL_CAT_ALL;
    top = 0;
    enabled = picsShown = 1;
    wheel = 0;
    elemSetFlagC7(this, true);
    for (int i = 0; i < 11; i++) {
        rows[i].set(kabanListBtnCreate(this, &mediatorVtbl));
        DK_ASSERT(rows[i].task, "ListBtn create failed");
        CWindowTaskKabanListBtn* b = rows[i].get();
        if (!b) continue;
        taskSetInstName(b, "ListBtn");
        b->posX = 0;
        b->posY = (float)i * rowHeight;
        b->depth = depth;
        b->setCard(i + 1);
        b->setEnabled(i < 9);
        b->setInfoShown(i < 9);
    }
    all.clear();
    shown.clear();
    layout();
    return 1;
}

// @yo2 0x0096fd70 vf13
void CWindowTaskKabanList::layout() { x = posX, y = posY, z = depth; }

// @yo2 0x0096fda0 vf05: the mouse wheel scrolls the list while the pointer is over it
uint32_t CWindowTaskKabanList::onMain() {
    layout();
    int32_t w = mouseWheel();
    if (kabanScrollEnabled() && w != wheel) {
        int32_t mx, my;
        mousePos(&mx, &my);
        int32_t rowsShown = g_kaban ? g_kaban->rowCount : rowCount;
        if (mx > 0x2e7 && mx < 0x3f9 && my > 0x57 && my <= rowsShown * 56 + 0x58) {
            wheel = w;
            kabanScrollBy(w);
            for (auto& r : rows)
                if (CWindowTaskKabanListBtn* b = r.get()) b->hoverTicks = 0;
        }
    }
    return 1;
}

// @yo2 0x00973f70 vf14: a click anywhere on the list is reported up
uint32_t CWindowTaskKabanList::onMessage(int32_t msg) {
    if (msg != kWmLButtonDown) return 0;
    notify(1);
    return 1;
}

// @yo2 0x00973fc0 vf06
void CWindowTaskKabanList::onDestroy() {
    g_kabanList = nullptr;
    controllOnDestroy(this);
}

// @yo2 0x0096feb0 9 or 11 rows: rows past the list's end show nothing
void CWindowTaskKabanList::setRowCount(int32_t n) {
    if (n != 9 && n != 11) return;
    rowCount = n;
    int32_t size = (int32_t)shown.size();
    if (size > n) kabanScrollSave();
    kabanScrollSetTotal(size);
    for (int i = 0; i < 11; i++) {
        CWindowTaskKabanListBtn* b = rows[i].get();
        if (!b) continue;
        bool inPage = i < n;
        b->setEnabled(inPage);
        bool on = inPage && i < size;
        b->setInfoShown(on);
        b->showCount(on);
    }
    showFrom(size > n ? kabanScrollRestore() : 0);
}

// @yo2 0x00970170 the Konami id of the card under (x, y), or -1
int32_t CWindowTaskKabanList::cardAt(int32_t mx, int32_t my) {
    float sx, sy;
    elemScreenPos(this, &sx, &sy);
    int32_t x0 = (int32_t)sx, y0 = (int32_t)sy, x1 = (int32_t)(sx + width), y1 = (int32_t)(sy + height);
    if (mx <= x0 || mx >= x1 || my <= y0 || my >= y1 || rowHeight <= 0) return -1;
    int32_t row = (int32_t)((float)(my - y0) / rowHeight);
    if (row >= rowCount || row > 10) return -1;   // fix: the exe trusts rowCount <= 11
    CWindowTaskKabanListBtn* b = rows[row].get();
    return b ? card::konamiId(b->card) : -1;
}

// @yo2 0x00970280 copies of `c` in the trunk (0 when absent)
int32_t CWindowTaskKabanList::countOf(int32_t c) {
    SortItem* e = all.find(c);
    return e ? e->count : 0;
}

// @yo2 0x00973e40 tint row `row`'s picture
void CWindowTaskKabanList::setRowColor(int32_t row, float r, float g, float b, float a) {
    if (row < 0 || row > 10) return;   // fix: the exe indexes blindly
    if (CWindowTaskKabanListBtn* btn = rows[row].get()) btn->setPicColor(r, g, b, a);
}

// @yo2 0x00973e90 tint every row showing `c`
void CWindowTaskKabanList::setCardColor(float r, float g, float b, float a, int32_t c) {
    for (auto& row : rows) {
        CWindowTaskKabanListBtn* btn = row.get();
        if (btn && btn->card == c) btn->setPicColor(r, g, b, a);
    }
}

// @yo2 0x009702c0 a copy of `c` went back into the trunk (deck -> trunk): both lists +delta, refused at 256
uint32_t CWindowTaskKabanList::addCount(uint32_t c, int32_t delta) {
    int32_t now = 0, nowShown = 0;
    bool ok = all.add((int32_t)c, delta, &now);
    shown.add((int32_t)c, delta, &nowShown);
    return ok ? countChanged((int32_t)c, nowShown) : 0;
}

// @yo2 0x00970a80 copies of `c` left the trunk: both lists -delta, refused below 0
uint32_t CWindowTaskKabanList::subCount(uint32_t c, int32_t delta) {
    int32_t now = 0, nowShown = 0;
    bool ok = all.sub((int32_t)c, delta, &now);
    shown.sub((int32_t)c, delta, &nowShown);
    return ok ? countChanged((int32_t)c, nowShown) : 0;
}

// the rest of both: the row's figure, and every row's brightness for the new counts
uint32_t CWindowTaskKabanList::countChanged(int32_t c, int32_t now) {
    int32_t mode = modelMode();
    if (mode <= 3) {
        float v = kabanCanTake(mode, c, now, false) ? kBright : kDim;
        setCardColor(v, v, v, 1.0f, c);
    }
    if (SortItem* e = shown.find(c)) {
        for (auto& row : rows) {
            CWindowTaskKabanListBtn* b = row.get();
            if (!b || b->card != c) continue;
            b->setCount(e->count);
            if (mode <= 3) {
                float v = kabanCanTake(mode, c, now, false) ? kBright : kDim;
                b->setFrameColor(v, v, v, 1.0f);
            }
            break;
        }
    }
    for (int i = 0; i < 11; i++) {
        CWindowTaskKabanListBtn* b = rows[i].get();
        if (!b || !b->card || b->card == c || mode > 3) continue;
        float v = kabanCanTake(mode, b->card, countOf(b->card), false) ? kBright : kDim;
        setRowColor(i, v, v, v, 1.0f);
        b->setFrameColor(v, v, v, 1.0f);
    }
    layout();
    return 1;
}

// @yo2 0x00971240
void CWindowTaskKabanList::setCategory(int32_t c) {
    category = c;
    applyCategory();
}

// @yo2 0x00971270 rebuild `shown` from `all` for the current tab. A card with no copy left stays listed while the
// edited deck (or the trade offer) still holds some.
void CWindowTaskKabanList::applyCategory() {
    shown.clear();
    int32_t mode = modelMode();
    for (size_t i = 0; i < all.size(); i++) {
        SortItem e = all.v[i];
        if (category != KL_CAT_ALL && !kabanCategoryHas(category, card::kind(card::konamiId(e.card)))) continue;
        if (e.count < 1) {
            if (mode == 0 && deckWindowCopies(e.card) <= 0) continue;
            if (mode == 1 && tradeOfferCopies(e.card) < 1) continue;
        }
        shown.push(e.card, e.count);
    }
    if (shown.size()) kabanScrollSetTotal((int32_t)shown.size());
    showFrom(0);
}

// @yo2 0x009716e0 the search window's query, applied to what's shown now:
//   ATK / DEF: monsters, either walking lo..hi in steps of 10 (KL_ORDER_UP / KL_ORDER_DOWN: grouped by value) or
//              lo <= v <= hi in list order;
//   RACE / ATTR / LEVEL / LIMIT: one pass per value in `set` (results grouped in set order);
//   ICON: per value; 0 means the plain spells / traps (group 7 / 8 with icon 0);
//   NAME_SORT: everything, ordered by card::sortKey;
//   TEXT: names (or readings) and card text containing `text`, and the cards of the matching deck list.
void CWindowTaskKabanList::search(int32_t mode, int32_t order, const VcVector<int32_t>& set, int32_t lo, int32_t hi,
                                  const uint16_t* text) {
    if (mode < KL_SEARCH_ATK || mode > KL_SEARCH_LIMIT) return;
    SortItems from;   // the list being narrowed
    for (const SortItem& e : shown.v) from.push(e.card, e.count);
    shown.clear();

    auto valueOf = [&](int32_t kid) -> int32_t {
        switch (mode) {
        case KL_SEARCH_ATK: return card::atk(kid);
        case KL_SEARCH_DEF: return card::def(kid);
        case KL_SEARCH_RACE: return card::race(kid);
        case KL_SEARCH_ATTR: return card::attribute(kid);
        case KL_SEARCH_ICON: return card::icon(kid);
        case KL_SEARCH_LEVEL: return card::level(kid);
        case KL_SEARCH_LIMIT: return card::limit(kid);
        }
        return 0;
    };
    switch (mode) {
    case KL_SEARCH_ATK:
    case KL_SEARCH_DEF: {
        auto take = [&](int32_t v, bool range) {
            for (const SortItem& e : from.v) {
                int32_t kid = card::konamiId(e.card);
                if (!card::isMonster(kid)) continue;
                int32_t s = valueOf(kid);
                if (range ? (lo <= s && s <= hi) : s == v) shown.push(e.card, e.count);
            }
        };
        if (order == KL_ORDER_UP)
            for (int32_t v = lo; v <= hi; v += 10) take(v, false);
        else if (order == KL_ORDER_DOWN)
            for (int32_t v = lo; v >= hi; v -= 10) take(v, false);
        else
            take(0, true);
        break;
    }
    case KL_SEARCH_RACE:
    case KL_SEARCH_ATTR:
    case KL_SEARCH_LEVEL:
    case KL_SEARCH_LIMIT:
    case KL_SEARCH_ICON:
        for (size_t k = 0; k < set.size(); k++)
            for (const SortItem& e : from.v) {
                int32_t kid = card::konamiId(e.card);
                if (mode == KL_SEARCH_ICON && set[k] == 0) {
                    int32_t g = card::group(kid);
                    if (g != 7 && g != 8) continue;
                }
                if (set[k] == valueOf(kid)) shown.push(e.card, e.count);
            }
        break;
    case KL_SEARCH_NAME_SORT: {
        // the exe goes through smart_ptr<CSortBase>s, a running total in `order`, and a "%d" round trip of the
        // count (identity); what's left is a qsort by key of the shown list
        int32_t n = (int32_t)from.size();
        SortItem* arr = n ? new SortItem[(size_t)n] : nullptr;
        int32_t run = 0;
        for (int32_t i = 0; i < n; i++) {
            arr[i] = from.v[(size_t)i];
            arr[i].order = run;
            run += arr[i].count;
        }
        if (n > 1) sortItemsByKey(arr, 0, n - 1);
        for (int32_t i = 0; i < n; i++) shown.push(arr[i].card, arr[i].count);
        delete[] arr;
        break;
    }
    case KL_SEARCH_TEXT:
        for (const SortItem& e : from.v) {
            int32_t kid = card::konamiId(e.card);
            if (cardListContains(e.card) || (text && (card::nameMatches(kid, text) || card::textMatches(kid, text))))
                shown.push(e.card, e.count);
        }
        break;
    }
    if (shown.size()) kabanScrollSetTotal((int32_t)shown.size());
    showFrom(0);
}

// @yo2 0x009735d0 fill the rows from `shown[first]` on
void CWindowTaskKabanList::showFrom(int32_t first) {
    top = first;
    for (auto& r : rows)
        if (CWindowTaskKabanListBtn* b = r.get()) b->dropPicture();
    int32_t mode = modelMode();
    for (int32_t i = 0; i < rowCount && i < 11; i++) {   // fix: rowCount is 9 or 11
        CWindowTaskKabanListBtn* b = rows[i].get();
        if (!b) continue;
        int32_t idx = first + i;
        if (idx >= 0 && idx < (int32_t)shown.size()) {
            SortItem e = shown.v[(size_t)idx];
            b->setCard(e.card);
            b->picX = 15.0f;
            b->picY = 3.0f;
            b->picZ = depth + 1.0f;
            b->setPicPos(15, 3, (int32_t)b->picZ);
            b->setPicScale(kMiniScale, kMiniScale);
            b->setEnabled(true);
            b->setInfoShown(true);
            b->setCount(e.count);
            b->showCount(true);
            b->setCountPos(16, 40, (int32_t)(depth + 1.0f));
            if (mode <= 3) {
                float v = kabanCanTake(mode, e.card, e.count, true) ? kBright : kDim;
                setCardColor(v, v, v, 1.0f, e.card);
                b->setFrameColor(v, v, v, 1.0f);
            }
        } else {
            b->dropPicture();
            b->setCard(0);
            b->setFrameColor(1, 1, 1, 1);
            b->setInfoShown(false);
            b->showCount(false);
        }
    }
}

// @yo2 0x00973bc0
void CWindowTaskKabanList::setClickable(bool on) {
    enabled = on;
    for (auto& r : rows)
        if (CWindowTaskKabanListBtn* b = r.get()) b->clickable = on;
}

// @yo2 0x00973c10
void CWindowTaskKabanList::setPicsShown(bool on) {
    picsShown = on;
    for (auto& r : rows)
        if (CWindowTaskKabanListBtn* b = r.get()) b->setPicShown(on);
}

// @yo2 0x00973c60 the present / TP screens re-dim the page when their box fills up or frees a slot
void CWindowTaskKabanList::refreshBrightness() {
    int32_t mode = modelMode();
    if (mode != 2 && mode != 3) return;
    for (int32_t i = 0; i < rowCount && i < 11; i++) {
        int32_t idx = top + i;
        if (idx >= (int32_t)shown.size()) continue;
        int32_t c = shown.v[(size_t)idx].card;
        float v = kabanCanTake(mode, c, 1, false) ? kBright : kDim;
        setCardColor(v, v, v, 1.0f, c);
        if (CWindowTaskKabanListBtn* b = rows[i].get()) b->setFrameColor(v, v, v, 1.0f);
    }
}

// ---------------------------------------------------------------- CWindowTaskKabanScroll

// @yo2 0x00973fe0
CWindowTaskKabanScroll* kabanScrollCreate(void* parent, void* mediator, int32_t steps) {
    CWindowTaskKabanScroll* s = (new CWindowTaskKabanScroll())->construct();
    s->steps = steps;
    if (!taskCreate(s, parent, 10000)) return nullptr;
    s->mediator = mediator;
    s->maxTop = s->lastTop = s->total = s->savedIndex = s->savedSteps = 0;
    s->enabled = 1;
    s->b4a8 = 0;
    return s;
}

// @yo2 0x009740d0
CWindowTaskKabanScroll* CWindowTaskKabanScroll::construct() {
    scrollBaseConstruct(this);
    maxTop = lastTop = total = savedIndex = savedSteps = 0;
    enabled = 1;
    taskSetTaskName(this, "CWindowTaskKabanScroll");
    return this;
}

// @yo2 0x00974340
void CWindowTaskKabanScroll::destruct() { controllDestruct(this); }

// @yo2 0x00974310
CWindowTaskKabanScroll* CWindowTaskKabanScroll::destroy(uint8_t flags) {
    destruct();
    if (flags & 1) {
        delete this;
        return nullptr;
    }
    return this;
}

// @yo2 0x009745b0 vf14: the knob moved to another step: show the list from there (with a click sound when the
// user dragged it or used the wheel)
uint32_t CWindowTaskKabanScroll::onMessage() {
    if (!enabled) return 0;
    if (g_kabanList && g_kabanList->rowCount < total && index != lastTop && maxTop > 0) {
        g_kabanList->showFrom(index);
        lastTop = index;
        if (dragging || wheeled) soundPlay(0x10000000, 0);
    }
    return 1;
}

// @yo2 0x00974410
void CWindowTaskKabanScroll::setTotal(int32_t n) {
    total = n;
    int32_t rows = g_kabanList ? g_kabanList->rowCount : 9;
    maxTop = n > rows ? n - rows : 0;
    lastTop = 0;
    scrollBaseSetRange(this, maxTop);
    barPos = 0;
    index = 0;
    barLen = scrollBaseBarLength(this);
}

// @yo2 0x009744a0
void CWindowTaskKabanScroll::save() {
    savedIndex = index;
    savedSteps = steps;
}

// @yo2 0x009744d0 the saved step, rescaled to the current number of steps
int32_t CWindowTaskKabanScroll::restore() {
    // fix: the exe divides by savedSteps unchecked
    index = savedSteps ? (int32_t)((double)savedIndex / savedSteps * steps + 0.5) : 0;
    barPos = scrollBasePosOf(this, index);
    return index;
}

// @yo2 0x00974520 the wheel moved by `d` notches
void CWindowTaskKabanScroll::scrollBy(int32_t d) {
    int32_t i = index - d;
    index = i;
    if (i < 0) {
        index = 0;
        return;
    }
    if (i > maxTop) {
        index = maxTop;
        return;
    }
    if (g_kabanList) g_kabanList->showFrom(i);
    lastTop = index;
    barPos = scrollBasePosOf(this, index);
}

// ---------------------------------------------------------------- CWindowTaskKaban

// @yo2 0x00974650
CWindowTaskKaban* kabanCreate(void* parent, void* mediator, void* detail) {
    CWindowTaskKaban* k = (new CWindowTaskKaban())->construct();
    g_kaban = k;
    k->setDetail(detail);
    if (!taskCreate(k, parent, 10000)) return nullptr;
    k->mediator = mediator;
    return k;
}

// @yo2 0x00974760
// @yo2 0x00979010 (a CTaskPtr<T> constructor of this TU)
CWindowTaskKaban* CWindowTaskKaban::construct() {
    controllConstruct(this);
    bar.setUser(this);
    number.setUser(this);
    order.setUser(this);
    searchBtn.setUser(this);
    frame.setUser(this);
    listBack.setUser(this);
    scroll.setUser(this);
    list.setUser(this);
    detail = nullptr;
    dragCard.setUser(this);
    posX = posY = scaleX = scaleY = posZ = 0;
    alpha = 1.0f;
    _418 = 0;
    rowCount = 9;
    dragging = 0;
    enabled = 1;
    taskSetTaskName(this, "CWindowTaskKaban");
    return this;
}

// @yo2 0x00974cd0
// @yo2 0x00974c10 (TaskPtr member destructor stubs)
// @yo2 0x00974c30
// @yo2 0x00974c50
// @yo2 0x00974c70
// @yo2 0x00974c90
// @yo2 0x00974cb0
void CWindowTaskKaban::destruct() {
    release(dragCard);
    release(list);
    release(scroll);
    release(listBack);
    release(frame);
    release(searchBtn);
    release(order);
    release(number);
    release(bar);
    controllDestruct(this);
}

// @yo2 0x00974be0
CWindowTaskKaban* CWindowTaskKaban::destroy(uint8_t flags) {
    destruct();
    if (flags & 1) {
        delete this;
        return nullptr;
    }
    return this;
}

// @yo2 0x00976be0 vf05: the picked-up card follows the mouse
uint32_t CWindowTaskKaban::onMain() {
    if (dragging == 1) {
        int32_t mx, my;
        mousePos(&mx, &my);
        if (dragCard.task) kabanCardPlace(dragCard.get(), (float)(mx - 25), (float)(my - 36));
    }
    layout();
    return 1;
}

// @yo2 0x00976cc0 vf13: the panel's fixed layout on the 1024x768 screen
void CWindowTaskKaban::layout() {
    x = posX, y = posY, z = posZ;
    if (scaleX < 0) scaleX = 1.0f;
    if (scaleY < 0) scaleY = 1.0f;
    CWindowTaskDeckBar* b = bar.get();
    pokeF(b, 0x494, 736), pokeF(b, 0x498, 0), pokeF(b, 0x4a8, 480), pokeF(b, 0x4ac, 8);
    pokeF(b, 0x49c, scaleX), pokeF(b, 0x4a0, 88), pokeF(b, 0x34c, 6);
    CWindowTaskKabanNumber* n = number.get();
    pokeF(n, 0x384, 944), pokeF(n, 0x388, 4), pokeF(n, 0x34c, 7);
    CWindowTaskKabanOrder* o = order.get();
    pokeF(o, 0x3b4, 832), pokeF(o, 0x3b8, posY + 29.0f), pokeF(o, 0x3c4, 32), pokeF(o, 0x34c, 7);
    CWindowTaskKabanSearch* s = searchBtn.get();
    pokeF(s, 0x438, 800), pokeF(s, 0x43c, posY + 57.0f), pokeF(s, 0x448, 24), pokeF(s, 0x34c, 7);
    CWindowTaskFrameThin* f = frame.get();
    pokeF(f, 0x3c8, 736), pokeF(f, 0x3cc, 80), pokeF(f, 0x74, 80), pokeF(f, 0x70, 736);
    pokeF(f, 0x34c, 5), pokeF(f, 0x78, 5);
    if (CSpriteElm* back = listBack.get()) {
        elemSetPos3(back, 744, 592, 11);
        spriteSetAlpha(back, alpha);
        spriteSetSrc(back, 8, 8, 8, 8);
        spriteSetScaleX(back, 32.0f);
    }
    if (CWindowTaskKabanList* l = list.get()) {
        l->depth = 8.0f;
        l->posX = 744;
        l->posY = 88;
    }
}

// @yo2 0x00974e60 vf04: deck bar, count, order and search buttons, frame, list background, scroll bar, list, and
// the picture that follows a dragged card
uint32_t CWindowTaskKaban::build() {
    posX = posY = 0;
    posZ = 1.0f;
    scaleX = 288.0f;
    scaleY = 608.0f;
    alpha = 1.0f;
    rowCount = 9;
    dragging = 0;
    elemSetFlagC7(this, true);
    void* med = &mediatorVtbl;
    auto named = [](void* t, const char* inst, const char* err) {
        DK_ASSERT(t, err);
        if (t) taskSetInstName(t, inst);
    };
    bar.set(deckBarCreate(this, med, 8));
    named(bar.task, "Bar", "Bar create failed");
    number.set(kabanNumberCreate(this, med));
    named(number.task, "KabanNum", "KabanNum create failed");
    order.set(kabanOrderCreate(this, med));
    named(order.task, "Order", "Order create failed");
    searchBtn.set(kabanSearchCreate(this, med));
    named(searchBtn.task, "Search", "Search create failed");
    frame.set(frameThinCreate(this, med, 8));
    named(frame.task, "Frame", "Frame create failed");
    pokeF(frame.task, 0x3d0, scaleX);
    pokeF(frame.task, 0x3d4, 528.0f);
    listBack.set(spriteCreate(this, 10000, VcString("data/deck/deck_carddai_01_c00.png")));
    named(listBack.task, "picBottom", "Bottom create failed");
    if (listBack.task) {
        spriteSetBlend(listBack.task, 2);
        elemSetFlagC7(listBack.task, true);
        show(listBack.task, true);
    }
    scroll.set(kabanScrollCreate(this, med, 0));
    named(scroll.task, "Scroll", "Scroll create failed");
    if (CWindowTaskKabanScroll* s = scroll.task) {
        pokeF(s, 0x468, 512.0f);   // bar length
        pokeF(s, 0x460, 1000.0f);  // x
        pokeF(s, 0x464, 88.0f);    // y
        pokeF(s, 0x34c, 4.0f);
        elemLayout(s);
        scrollBaseSetRange(s, 1);
        uint8_t b = (uint8_t)state350;
        std::memcpy((uint8_t*)s + 0x350, &b, 1);
    }
    kabanLayoutObjInit(layoutObj);
    list.set(kabanListCreate(this, med));
    named(list.task, "KabanList", "KabanList create failed");
    dragCard.set(kabanCardCreate(this, med));
    named(dragCard.task, "SelectCard", "SelectCard create failed");
    if (dragCard.task) kabanCardSetActive(dragCard.task, false);
    dragging = 0;
    layout();
    return 1;
}

// @yo2 0x00977010 9 rows (with the list's bottom border) or 11 (taller frame, no border)
void CWindowTaskKaban::setRowCount(int32_t n) {
    if (n != 9 && n != 11) return;
    rowCount = n;
    pokeF(scroll.get(), 0x468, n == 9 ? 512.0f : 616.0f);
    CWindowTaskFrameThin* f = frame.get();
    pokeF(f, 0x3d0, scaleX);
    pokeF(f, 0x3d4, n == 9 ? 528.0f : 632.0f);
    if (f) elemLayout(f);
    show(listBack.get(), n == 9);
}

// @yo2 0x00977150
void kabanScrollSetTotal(int32_t n) {
    if (g_kaban)
        if (CWindowTaskKabanScroll* s = g_kaban->scroll.get()) s->setTotal(n);
}

// @yo2 0x00977180
void kabanScrollSave() {
    if (g_kaban)
        if (CWindowTaskKabanScroll* s = g_kaban->scroll.get()) s->save();
}

// @yo2 0x009771b0
int32_t kabanScrollRestore() {
    CWindowTaskKabanScroll* s = g_kaban ? g_kaban->scroll.get() : nullptr;
    return s ? s->restore() : 0;
}

// @yo2 0x009771e0
void kabanScrollBy(int32_t d) {
    if (g_kaban)
        if (CWindowTaskKabanScroll* s = g_kaban->scroll.get()) s->scrollBy(d);
}

// @yo2 0x00977210
bool kabanScrollEnabled() {
    CWindowTaskKabanScroll* s = g_kaban ? g_kaban->scroll.get() : nullptr;
    return s && s->enabled;
}

// @yo2 0x00977240 show the dragged card's picture at (x, y, z)
void kabanDragStart(float px, float py, float pz, int32_t c) {
    CWindowTaskKabanCard* k = g_kaban ? g_kaban->dragCard.get() : nullptr;
    if (!k) return;
    kabanCardPlace(k, px, py);
    kabanCardSetDepth(k, pz);
    kabanCardSet(k, c);
    kabanCardSetActive(k, true);
}

// @yo2 0x009772d0
void kabanDragEnd() {
    CWindowTaskKabanCard* k = g_kaban ? g_kaban->dragCard.get() : nullptr;
    if (!k) return;
    kabanCardClear(k);
    kabanCardSetActive(k, false);
}

// @yo2 0x00977310
void CWindowTaskKaban::setNumber(int32_t v) {
    if (number.task) kabanNumberSet(number.get(), v);
}

// @yo2 0x00977360 lock or unlock the whole panel (while a dialog is up)
void CWindowTaskKaban::setEnabled(bool on) {
    enabled = on;
    kabanNumberEnable(number.get(), on);
    kabanOrderEnable(order.get(), on);
    kabanSearchEnable(searchBtn.get(), on);
    if (CWindowTaskKabanScroll* s = scroll.get()) s->enabled = on;
    if (CWindowTaskKabanList* l = list.get()) l->setClickable(on);
}

// @yo2 0x00977420
void CWindowTaskKaban::setBarValue(int32_t v) { deckBarSetValue(bar.get(), v); }

// @yo2 0x00977450 tell the running deck scene a card was picked up
void kabanPicked(int32_t arg) {
    int32_t s = sceneId();
    if (s == 0x24 || s == 0x26 || s == 0x27 || s == 0x28) sceneKabanPicked(s, arg);
}

// @yo2 0x009774f0
void CWindowTaskKaban::resetSearch() {
    if (searchBtn.task) kabanSearchReset(searchBtn.get());
}

// @yo2 0x00977580 vf14
uint32_t CWindowTaskKaban::onMessage(int32_t msg) {
    if (msg != kWmLButtonDown) return 0;
    notify(1);
    return 1;
}

// @yo2 0x009775d0 vf06
void CWindowTaskKaban::onDestroy() {
    g_kaban = nullptr;
    controllOnDestroy(this);
}

// ---------------------------------------------------------------- CWindowModelKaban

// @yo2 0x00977610
CWindowModelKaban* modelKabanCreate(void* parent, void* detail, int32_t mode, float px, float py, int32_t f3ac) {
    CWindowModelKaban* m = (new CWindowModelKaban())->construct();
    g_modelKaban = m;
    m->setup(detail, mode, px, py, f3ac);
    return (CWindowModelKaban*)taskCreate(m, parent, 10000);
}

// @yo2 0x00977b50
void CWindowModelKaban::setup(void* d, int32_t m, float px, float py, int32_t v) {
    winX = px;
    winY = py;
    f3ac = v;
    mode = m;
    detail = d;
}

// @yo2 0x00977700
CWindowModelKaban* CWindowModelKaban::construct() {
    modelConstruct(this);
    kaban.setUser(this);
    f3b4 = f3b8 = -1;
    for (auto& t : text) t.clear();
    detail = nullptr;
    f3a8 = 32.0f;
    f3ac = 1;
    mode = 0;
    taskSetTaskName(this, "CWindowModelKaban");
    return this;
}

// @yo2 0x009779e0
// @yo2 0x009779c0 (TaskPtr member destructor stub)
void CWindowModelKaban::destruct() {
    for (int i = 3; i >= 0; i--) text[i].clear();
    release(kaban);
    modelDestruct(this);
}

// @yo2 0x00977990
CWindowModelKaban* CWindowModelKaban::destroy(uint8_t flags) {
    destruct();
    if (flags & 1) {
        delete this;
        return nullptr;
    }
    return this;
}

// @yo2 0x00977ba0 vf04: a 336x144 window holding the trunk panel
uint32_t CWindowModelKaban::build() {
    f394 = 0;
    winW = 336.0f;
    winH = 144.0f;
    kaban.set(kabanCreate(this, &mediatorVtbl, detail));
    DK_ASSERT(kaban.task, "Kaban create failed");
    if (kaban.task) taskSetInstName(kaban.get(), "Kaban");
    f3a8 = 32.0f;
    layout();
    modelWatchInt(this, &f3b4);
    layout();
    ready = 1;
    return 1;
}

// @yo2 0x00977950 vf05
// @yo2 0x00977900 vf08 (the same: lay out)
uint32_t CWindowModelKaban::onMain() {
    layout();
    return 1;
}

// @yo2 0x009780d0 vf09
void CWindowModelKaban::layout() { x = winX, y = winY, z = depth; }

// @yo2 0x00977920 vf10
int32_t CWindowModelKaban::depthPlus5() const { return (int32_t)(depth + 5.0f); }

// @yo2 0x00978100 vf14: centre on the 1024x768 screen
void CWindowModelKaban::center() {
    winX = (1024.0f - winW) * 0.5f;
    winY = (768.0f - winH) * 0.5f;
    x = winX;
    y = winY;
}

// @yo2 0x009781e0 vf06
void CWindowModelKaban::onDestroy() {
    g_modelKaban = nullptr;
    modelOnDestroy(this);
}

// @yo2 0x00978180 IWindowTaskMediator slot 0: the base model's handler
// @yo2 0x00977970 slot 1 (the same)
// @yo2 0x009781a0 slot 2 (empty)
// @yo2 0x009781c0 slot 3 (empty)
void CWindowModelKaban::relay(int32_t slot) {
    if (slot < 2) modelNotifyBase(this);
}

// ---------------------------------------------------------------- the TU's string tables (DeckTables.h)
// @yo2 0x0097bdd0 @yo2 0x0097c1a0 @yo2 0x0097c530 (the "init both" stubs)
// @yo2 0x0097bd80 @yo2 0x0097bdb0 (the TU's guard / atexit stubs)

}   // namespace dk
