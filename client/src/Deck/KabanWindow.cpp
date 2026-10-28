// yo2KabanWindow.cpp, first half (0x00955850..0x009660c0): trunk counter, type tabs, search buttons and their
// dialogs, the card picture and the list-row layout. See KabanWindow.h.
#include "KabanWindow.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <type_traits>

namespace dk {

namespace {

constexpr int32_t kPrio = 10000;   // every child here is created at priority 10000
constexpr float kScreenW = 1024;   // DAT_00be8680: dialogs open against the right edge...
constexpr float kDialogY = 88;     // ...88 px down
constexpr int32_t kListDlgW = 300, kListDlgH = 192;

kbn::ElemView* view(void* task) { return static_cast<kbn::ElemView*>(task); }
kbn::ModelView* model(void* task) { return static_cast<kbn::ModelView*>(task); }

// swprintf(L"%s%ld") into a wide string (the exe formats "@9%d": "@9" is a text-colour code)
VcWString wideNumber(const char* prefix, long n) {
    char buf[40];
    snprintf(buf, sizeof buf, "%s%ld", prefix, n);
    uint16_t w[40];
    size_t k = 0;
    for (; buf[k]; k++) w[k] = (uint8_t)buf[k];
    return VcWString(w, k);
}

// wcstombs(buf, s, 0x100) in the C locale: ASCII goes through, the first other character ends the string
void wideToAnsi(const VcWString& s, char* out, size_t cap) {
    size_t k = 0;
    for (; k + 1 < cap && k < s.size() && s.c_str()[k] && s.c_str()[k] < 0x80; k++) out[k] = (char)s.c_str()[k];
    out[k] = 0;
}

// The pattern every button in this file is built with: a swf button from a .txt description, named, clickable,
// reporting its events to `owner`.
struct ButtonDef {
    const char* file;
    const char* name;
    const char* failMsg;
};

void makeButton(void* owner, TaskPtr<CSwfEngine>& p, const ButtonDef& d) {
    p.set(swfCreate(owner, d.file));
    DK_ASSERT(p.task, d.failMsg);
    CSwfEngine* s = p.get();
    taskSetInstName(s, d.name);
    swfSetButtonMode(p.get(), true);
    view(p.get())->dirty = 1;
    swfSetListener(p.get(), owner);
}

// buttons side by side at x = i * pitch, on the window's own depth
void layoutRow(kbn::ControllView* w, float x, float y, TaskPtr<CSwfEngine>* b, int n, float pitch) {
    w->x = x;
    w->y = y;
    w->z = w->depth;
    for (int i = 0; i < n; i++) {
        kbn::ElemView* e = view(b[i].get());
        e->x = pitch * (float)i;   // the exe multiplies by the constants 2.0, 3.0... (i = 1 adds pitch itself)
        e->y = 0;
        e->z = w->depth;
    }
}

// after the counter or a tab selected a card type, the deck editor shows the matching deck
void syncDeckTab(int32_t filter) {
    if (kabanBusy()) return;
    if (filter == KF_FUSION) {
        if (!deckShowingExtra()) deckSetTab(1), deckRefresh();
    } else if (deckShowingExtra()) {
        deckSetTab(0), deckRefresh();
    }
}

template <class T>
T* createWindow(void* parent, void* mediator, bool mediatorFirst) {
    T* w = new T;
    w->construct();
    if (mediatorFirst) w->mediator = mediator;
    T* t = static_cast<T*>(taskCreate(w, parent, kPrio));
    if (t && !mediatorFirst) t->mediator = mediator;
    return t;
}

}   // namespace

// ================================================================ pure helpers

// (part of FUN_009563b0 setCount)
float kabanCountTextX(int32_t n) {
    if (n / 1000000) return 8;
    if (n / 100000) return 16;
    if (n / 10000) return 24;
    if (n / 1000) return 32;
    if (n / 100) return 40;
    if (n / 10) return 48;
    return 56;
}

int32_t kabanParseNumber(const VcWString& s) {
    char buf[0x100];
    wideToAnsi(s, buf, sizeof buf);
    long v = strtol(buf, nullptr, 10);
    return v > 10000 ? 10000 : (int32_t)v;
}

// The ATK/DEF dialog: two numbers and a "sort" box with a direction list. Without the box it is a range match on
// the numbers as typed; with it, a sort over [min, max] (index 0) or [max, min] (otherwise); 0/0 means everything.
int32_t kabanRangeSearch(int32_t a, int32_t b, bool sortOn, int32_t sortIndex, int32_t* lo, int32_t* hi) {
    if (!sortOn) {
        *lo = a, *hi = b;
        return KS_MATCH;
    }
    bool none = a == 0 && b == 0;
    int32_t mn = a < b ? a : b, mx = a < b ? b : a;
    if (sortIndex == 0) {
        *lo = none ? 0 : mn, *hi = none ? 10000 : mx;
        return KS_SORT_DOWN;
    }
    *lo = none ? 10000 : mx, *hi = none ? 0 : mn;
    return KS_SORT_UP;
}

const KabanListSpec* kabanListSpec(int32_t field) {
    // rows 2.. of each list hold these values (race 1..20, attribute 1..9 incl. 8 magic / 9 trap, spell icon 0..6
    // with 7 meaning 0, level 1..12, limit 0..3 stored +1)
    static const KabanListSpec specs[] = {
        {KS_TYPE, 20, 1, false, false, true, 0},  {KS_ATTR, 9, 1, false, false, false, 0},
        {KS_ICON, 6, 1, false, true, false, 0},   {KS_LEVEL, 1, 12, true, false, false, 0},
        {KS_LIMIT, 3, 0, false, false, false, 1},
    };
    for (const KabanListSpec& s : specs)
        if (s.field == field) return &s;
    return nullptr;
}

// FUN_0095c480's five list dialogs. Row 0 / row 1 sort the whole field one way or the other (level's rows are the
// other way round); otherwise the ticked rows' values are matched.
int32_t kabanListSearch(const KabanListSpec& s, bool (*checked)(void*, int32_t), int32_t (*value)(void*, int32_t),
                        int32_t rows, void* ctx, VcVector<int32_t>* out) {
    auto walk = [&](int32_t from, int32_t to) {
        int32_t step = from <= to ? 1 : -1;
        bool up = step > 0;
        if (s.zeroLast && !up) out->push_back(0);
        for (int32_t v = from;; v += step) {
            out->push_back(v);
            if (v == to) break;
        }
        if (s.zeroLast && up) out->push_back(0);
    };
    int32_t a = s.firstAll, b = s.lastAll;   // row 0's walk
    if (checked(ctx, 0)) {
        walk(a, b);
        return s.row0Up ? KS_SORT_UP : KS_SORT_DOWN;
    }
    if (checked(ctx, 1)) {
        walk(b, a);
        return s.row0Up ? KS_SORT_DOWN : KS_SORT_UP;
    }
    for (int32_t i = 2; i < rows; i++) {
        if (!checked(ctx, i)) continue;
        int32_t v = value(ctx, i);
        if (s.zeroLast && v == 7) v = 0;
        out->push_back(v - s.valueBias);
        if (s.single) break;
    }
    return KS_MATCH;
}

int32_t kabanOrderFilter(const char* name) {
    static const struct {
        const char* swf;
        int32_t filter;
    } tabs[] = {{"sort_btn1", KF_MAGIC},  {"sort_btn2", KF_TRAP},   {"sort_btn3", KF_NORMAL},
                {"sort_btn4", KF_EFFECT}, {"sort_btn5", KF_RITUAL}, {"sort_btn6", KF_FUSION}};
    for (const auto& t : tabs)
        if (!strcmp(name, t.swf)) return t.filter;
    return -1;
}

// @yo2 0x00965da0 CKabanListLayout vf00: offset of one card-info item (a bit) inside a trunk list row
void kabanListItemOffset(int32_t item, float out[3]) {
    float x = 0, y = 0;
    switch (item) {
    case 0x001: x = 72, y = 8; break;
    case 0x002: x = 56, y = 8; break;
    case 0x004: x = 88, y = 8; break;
    case 0x008: x = 104, y = 8; break;
    case 0x010: x = 56, y = 32; break;
    case 0x020: x = 140, y = 8; break;
    case 0x040: x = 184, y = 8; break;
    case 0x080: x = 232, y = 8; break;
    case 0x100: x = 176, y = 8; break;
    }
    out[0] = x, out[1] = y, out[2] = 0;
}

// @yo2 0x009660a0 CKabanListLayout vf01: every item is shown
uint8_t kabanListItemShown(uint32_t) { return 1; }

// ================================================================ CWindowTaskKabanNumber

void CWindowTaskKabanNumber::construct() {
    controllConstruct(this);
    button.setUser(this);
    number.setUser(this);
}

// @yo2 0x00955850
uint32_t CWindowTaskKabanNumber::init() {
    w = h = 256;
    x = y = 0;
    depth = 2;
    textX = 8;
    scale = 1;
    count = 0;
    enabled = 1;
    dirty = 1;
    makeButton(this, button, {"data/deck/kabancnt.txt", "KabanCountBtn", "KabanCountBtn create failed"});
    kbn::ElemView* b = view(button.get());
    b->x = b->y = 0;
    b->z = depth;
    number.set(textCreate(this, kPrio));
    DK_ASSERT(number.task, "Number create failed");
    taskSetInstName(number.get(), "KabanCountNumber");
    kbn::ElemView* t = view(number.get());
    t->x = textX, t->y = 2, t->z = depth + 1;
    textSetText(number.get(), wideNumber("@9", count));
    elemSetAnchor(number.get(), 2);
    view(number.get())->dirty = 1;
    layout();
    return 1;
}

// @yo2 0x00956380 vf13
void CWindowTaskKabanNumber::layout() {
    ElemView::x = x;
    ElemView::y = y;
    z = depth;
}

// @yo2 0x009563b0
void CWindowTaskKabanNumber::setCount(int32_t n) {
    count = n;
    textX = kabanCountTextX(n);
    textSetText(number.get(), wideNumber("@9", n));
    kbn::ElemView* t = view(number.get());
    t->x = textX, t->y = 2, t->z = depth + 1;
}

// @yo2 0x009568d0
void CWindowTaskKabanNumber::setEnabled(bool on) {
    enabled = on;
    swfSetEnabled(button.get(), on);
}

// @yo2 0x00956910 IWindowTaskMediator vf00 (vf01..vf03 are System-labelled copies: 0x009556e0...)
void CWindowTaskKabanNumber::relay0() { relay(0); }

// @yo2 0x00956950 vf15: no hit area of its own
uint32_t CWindowTaskKabanNumber::hitTest(float, float) { return 0; }

// @yo2 0x00956970 vf14: a click on the window is passed to the mediator
uint32_t CWindowTaskKabanNumber::onMouse(uint32_t msg) {
    if (msg != kbn::WM_LBUTTONDOWN) return 0;
    notifyMediator(1);
    return 1;
}

// @yo2 0x009569c0 the counter button shows every card again
void CWindowTaskKabanNumber::receive(void* msg) {
    if (static_cast<kbn::MsgView*>(msg)->tag == kbn::TM_SWF_EVENT && swfEventIs(msg, "kabancount")) {
        playSe(SE_OK, 0);
        kabanSetFilter(KF_ALL);
        syncDeckTab(KF_ALL);
    }
    controllReceive(this, msg);
}

// ================================================================ CWindowTaskKabanOrder

// @yo2 0x00956b70
CWindowTaskKabanOrder* CWindowTaskKabanOrder::create(void* parent, void* mediator) {
    return createWindow<CWindowTaskKabanOrder>(parent, mediator, false);   // left in eax
}

// @yo2 0x00956c30
void CWindowTaskKabanOrder::construct() {
    controllConstruct(this);
    for (TaskPtr<CSwfEngine>& b : button) b.setUser(this);
    x = y = w = h = spacing = 0;
    scale = 1;
    enabled = 1;
    taskSetTaskName(this, "CWindowTaskKabanOrder");
}

// @yo2 0x00957000 (the six CTaskPtr members unregister in their own destructors)
void CWindowTaskKabanOrder::destruct() { controllDestruct(this); }

// @yo2 0x00956fd0 scalar deleting destructor
void CWindowTaskKabanOrder::destroy(CWindowTaskKabanOrder* p, bool free) {
    p->destruct();
    if (free) delete p;
}

// @yo2 0x00956ed0 vf09
void CWindowTaskKabanOrder::setScale(float s) { scale = s; }
// @yo2 0x00956ef0 vf12
uint32_t CWindowTaskKabanOrder::isControl() { return 1; }
// @yo2 0x00958d70 IWindowTaskMediator vf00
void CWindowTaskKabanOrder::relay0() { relay(0); }
// @yo2 0x00956f10 IWindowTaskMediator vf01
void CWindowTaskKabanOrder::relay1() { relay(1); }
// @yo2 0x00956f50 IWindowTaskMediator vf02
void CWindowTaskKabanOrder::relay2() { relay(2); }
// @yo2 0x00956f90 IWindowTaskMediator vf03
void CWindowTaskKabanOrder::relay3() { relay(3); }

// @yo2 0x009570d0
uint32_t CWindowTaskKabanOrder::init() {
    w = h = 256;
    x = y = 0;
    depth = 2;
    scale = 1;
    spacing = 0;
    enabled = 1;
    dirty = 1;
    static const ButtonDef defs[6] = {
        {"data/deck/sort_btn1.txt", "MagicBtn", "SwfEngine MagicBtn create failed"},
        {"data/deck/sort_btn2.txt", "TrapBtn", "SwfEngine TrapBtn create failed"},
        {"data/deck/sort_btn3.txt", "NormalBtn", "SwfEngine NormalBtn create failed"},
        {"data/deck/sort_btn4.txt", "EffectBtn", "SwfEngine EffectBtn create failed"},
        {"data/deck/sort_btn5.txt", "RitualBtn", "SwfEngine RitualBtn create failed"},
        {"data/deck/sort_btn6.txt", "FusionBtn", "SwfEngine FusionBtn create failed"},
    };
    for (int i = 0; i < 6; i++) makeButton(this, button[i], defs[i]);
    layout();
    return 1;
}

// @yo2 0x00958a50 vf13
void CWindowTaskKabanOrder::layout() { layoutRow(this, x, y, button, 6, spacing); }

// @yo2 0x00958c10 CElement vf05
uint32_t CWindowTaskKabanOrder::update() {
    layout();
    return 1;
}

// @yo2 0x00958c30
void CWindowTaskKabanOrder::setEnabled(bool on) {
    enabled = on;
    for (TaskPtr<CSwfEngine>& b : button) swfSetEnabled(b.get(), on);
}

// @yo2 0x00958db0 vf15
uint32_t CWindowTaskKabanOrder::hitTest(float, float) { return 0; }

// @yo2 0x00958dd0 vf14
uint32_t CWindowTaskKabanOrder::onMouse(uint32_t msg) {
    if (msg != kbn::WM_LBUTTONDOWN) return 0;
    notifyMediator(1);
    return 1;
}

// @yo2 0x00958e20 a tab: filter the trunk by card type and show the deck it goes in
void CWindowTaskKabanOrder::receive(void* msg) {
    if (static_cast<kbn::MsgView*>(msg)->tag == kbn::TM_SWF_EVENT) {
        static const char* const names[] = {"sort_btn1", "sort_btn2", "sort_btn3",
                                            "sort_btn4", "sort_btn5", "sort_btn6"};
        for (const char* n : names) {
            if (!swfEventIs(msg, n)) continue;
            int32_t f = kabanOrderFilter(n);
            playSe(SE_OK, 0);
            kabanSetFilter(f);
            syncDeckTab(f);
            break;
        }
    }
    controllReceive(this, msg);
}

// ================================================================ CWindowTaskKabanSearch

// @yo2 0x00959350
CWindowTaskKabanSearch* CWindowTaskKabanSearch::create(void* parent, void* mediator) {
    return createWindow<CWindowTaskKabanSearch>(parent, mediator, false);   // left in eax
}

// @yo2 0x00959410
void CWindowTaskKabanSearch::construct() {
    controllConstruct(this);
    for (TaskPtr<CSwfEngine>& b : button) b.setUser(this);
    atkDlg.setUser(this), defDlg.setUser(this), typeDlg.setUser(this), attrDlg.setUser(this);
    iconDlg.setUser(this), textDlg.setUser(this), levelDlg.setUser(this), limitDlg.setUser(this);
    x = y = w = h = spacing = 0;
    scale = 1;
    busy = 0;
    enabled = 1;
    taskSetTaskName(this, "CWindowTaskKabanSearch");
}

// @yo2 0x00959a60 (the 17 CTaskPtr members unregister in their own destructors)
// @yo2 0x00959a40 island: an unwind funclet running one of those CTaskPtr destructors
void CWindowTaskKabanSearch::destruct() {
    values.clear();
    controllDestruct(this);
}

// @yo2 0x00959a10 scalar deleting destructor
void CWindowTaskKabanSearch::destroy(CWindowTaskKabanSearch* p, bool free) {
    p->destruct();
    if (free) delete p;
}

// @yo2 0x00959910 vf09
void CWindowTaskKabanSearch::setScale(float s) { scale = s; }
// @yo2 0x00959930 vf12
uint32_t CWindowTaskKabanSearch::isControl() { return 1; }
// @yo2 0x00961c30 IWindowTaskMediator vf00
void CWindowTaskKabanSearch::relay0() { relay(0); }
// @yo2 0x00959950 IWindowTaskMediator vf01
void CWindowTaskKabanSearch::relay1() { relay(1); }
// @yo2 0x00959990 IWindowTaskMediator vf02
void CWindowTaskKabanSearch::relay2() { relay(2); }
// @yo2 0x009599d0 IWindowTaskMediator vf03
void CWindowTaskKabanSearch::relay3() { relay(3); }
// @yo2 0x00961c70 vf15
uint32_t CWindowTaskKabanSearch::hitTest(float, float) { return 0; }

// @yo2 0x00961c90 vf14
uint32_t CWindowTaskKabanSearch::onMouse(uint32_t msg) {
    if (msg != kbn::WM_LBUTTONDOWN) return 0;
    notifyMediator(1);
    return 1;
}

// @yo2 0x00959c40
uint32_t CWindowTaskKabanSearch::init() {
    w = h = 256;
    x = y = 0;
    depth = 2;
    scale = 1;
    spacing = 0;
    dirty = 1;
    static const ButtonDef defs[9] = {
        {"data/deck/search_btn1.txt", "AtkBtn", "SwfEngine AtkBtn create failed"},
        {"data/deck/search_btn2.txt", "DefBtn", "SwfEngine DefBtn create failed"},
        {"data/deck/search_btn3.txt", "TypeBtn", "SwfEngine TypeBtn create failed"},
        {"data/deck/search_btn4.txt", "AttrBtn", "SwfEngine AttrBtn create failed"},
        {"data/deck/search_btn5.txt", "EffectBtn", "SwfEngine EffectBtn create failed"},
        {"data/deck/search_btn6.txt", "NameBtn", "SwfEngine NameBtn create failed"},
        {"data/deck/search_btn7.txt", "StrBtn", "SwfEngine StrBtn create failed"},
        {"data/deck/search_btn8.txt", "LevelBtn", "SwfEngine LevelBtn create failed"},
        {"data/deck/search_btn9.txt", "ForbiBtn", "SwfEngine ForbiBtn create failed"},
    };
    for (int i = 0; i < 9; i++) makeButton(this, button[i], defs[i]);
    layout();
    return 1;
}

// @yo2 0x0095c200 vf13
void CWindowTaskKabanSearch::layout() { layoutRow(this, x, y, button, 9, spacing); }

// @yo2 0x009616a0
void CWindowTaskKabanSearch::setEnabled(bool on) {
    enabled = on;
    for (TaskPtr<CSwfEngine>& b : button) swfSetEnabled(b.get(), on);
}

// closing a dialog (answered or cancelled) hands the input back to the trunk window
void CWindowTaskKabanSearch::endDialog(void* dlg) {
    modelShow(dlg, false);
    taskDestroy(dlg);
    busy = 0;
    kabanSetInputEnabled(true);
}

bool CWindowTaskKabanSearch::finishRange(TaskPtr<CWindowModelInputValue>& p, int32_t field) {
    if (!p.task) return false;
    void* dlg = p.get();
    int32_t r = modelResult(dlg);
    if (r == DLG_OK) {
        playSe(SE_OK, 0);
        VcWString t2;
        int32_t a = kabanParseNumber(inputValueText1(dlg));
        int32_t b = kabanParseNumber(*kabanInputText2(model(dlg), &t2));
        int32_t lo, hi;
        int32_t op = kabanRangeSearch(a, b, inputValueSortOn(dlg), inputValueSortIndex(dlg), &lo, &hi);
        kabanSearch(field, op, &values, lo, hi, nullptr);
    } else if (r == DLG_CANCEL) {
        playSe(SE_CANCEL, 0);
    } else {
        return false;
    }
    endDialog(dlg);
    return true;
}

bool CWindowTaskKabanSearch::finishList(void* dlg, int32_t field) {
    if (!dlg) return false;
    int32_t r = modelResult(dlg);
    if (r == DLG_OK) {
        playSe(SE_OK, 0);
        int32_t op = kabanListSearch(*kabanListSpec(field), listboxChecked, listboxValue, listboxCount(dlg), dlg,
                                     &values);
        if (values.size()) {
            kabanSearch(field, op, &values, 0, 0, nullptr);
            values.last = values.first;
        }
    } else if (r == DLG_CANCEL) {
        playSe(SE_CANCEL, 0);
    } else {
        return false;
    }
    endDialog(dlg);
    return true;
}

bool CWindowTaskKabanSearch::finishText() {
    if (!textDlg.task) return false;
    void* dlg = textDlg.get();
    int32_t r = modelResult(dlg);
    if (r == DLG_OK) {
        playSe(SE_OK, 0);
        char buf[0x200];
        wideToAnsi(inputValueText1(dlg), buf, 0x100);
        kabanSearch(KS_TEXT, KS_MATCH, &values, 0, 0, buf);
    } else if (r == DLG_CANCEL) {
        playSe(SE_CANCEL, 0);
    } else {
        return false;
    }
    endDialog(dlg);
    return true;
}

// @yo2 0x0095c480 CElement vf05: while a dialog is open, wait for its OK (4000) or cancel (4001)
uint32_t CWindowTaskKabanSearch::update() {
    layout();
    if (!busy) return 1;
    finishRange(atkDlg, KS_ATK);
    finishRange(defDlg, KS_DEF);
    finishList(typeDlg.task, KS_TYPE);
    finishList(attrDlg.task, KS_ATTR);
    finishList(iconDlg.task, KS_ICON);
    finishText();
    finishList(levelDlg.task, KS_LEVEL);
    finishList(limitDlg.task, KS_LIMIT);
    return 1;
}

// @yo2 0x00961450 CWindowModelInputValue: the second field's text
VcWString* kabanInputText2(kbn::ModelView* m, VcWString* out) {
    inputGetText(m->input2.get(), out);
    return out;
}

// @yo2 0x00961880 drop every open dialog (the trunk window closing)
void CWindowTaskKabanSearch::closeDialogs() {
    void* dlgs[] = {atkDlg.task, defDlg.task, typeDlg.task, attrDlg.task,
                    iconDlg.task, textDlg.task, levelDlg.task, limitDlg.task};
    for (void* d : dlgs) {
        if (!d) continue;
        modelShow(d, false);
        taskDestroy(d);
        kabanSetInputEnabled(true);
    }
}

void CWindowTaskKabanSearch::openRange(TaskPtr<CWindowModelInputValue>& p, int32_t kind, const char* name) {
    playSe(SE_OK, 0);
    p.set(static_cast<CWindowModelInputValue*>(inputValueCreate(this, kind)));
    DK_ASSERT(p.task, kind == 0 ? "AtkDlg create failed" : kind == 1 ? "DefDlg create failed" : "StrDlg create failed");
    taskSetInstName(p.get(), name);
    kbn::ModelView* m = model(p.get());
    if (kind == 2) {
        inputValueSetPos(m, kScreenW - m->w, kDialogY);
    } else {
        m->px = kScreenW - m->w;
        m->py = kDialogY;
        m->x = m->px;
        m->y = m->py;
    }
    busy = 1;
    kabanSetInputEnabled(false);
    modelShow(p.get(), true);
}

// @yo2 0x00961ce0 a search button: open its dialog (the name button sorts at once)
void CWindowTaskKabanSearch::receive(void* msg) {
    if (static_cast<kbn::MsgView*>(msg)->tag != kbn::TM_SWF_EVENT) {
        controllReceive(this, msg);
        return;
    }
    // the list dialogs: created, filled, shown at the right edge
    auto openList = [&](auto& p, void* (*make)(void*), const char* name, const char* fail, void (*fill)(void*),
                        bool framed) {
        playSe(SE_OK, 0);
        p.set(static_cast<std::remove_reference_t<decltype(*p.task)>*>(make(this)));
        DK_ASSERT(p.task, fail);
        taskSetInstName(p.get(), name);
        kbn::ModelView* m = model(p.get());
        fill(m);
        if (framed) {   // type / attribute: a framed window sized on its frame
            frameSetScale(m->frame ? m->frame->frame : nullptr, 1.0f);
            modelSetColor(m, 1, 1, 1, 1);
            busy = 1;
            kabanSetInputEnabled(false);
            frameSetSize(m, kListDlgW, kListDlgH);
            if (m->frame) frameSetSize(m->frame, kListDlgW, kListDlgH);
            m->px = kScreenW - m->w;
            m->py = kDialogY;
            inputValueSetPos(m, m->px, kDialogY);
            modelRelayout(m);
        } else {
            modelSetScale(m, 1.0f);
            busy = 1;
            kabanSetInputEnabled(false);
            kabanModelSetSize(m, kListDlgW, kListDlgH);
            kabanModelSetPos(m, kScreenW - m->w, kDialogY);
            modelRelayout(m);
        }
        modelShow(m, true);
    };
    if (swfEventIs(msg, "search_btn1")) {
        openRange(atkDlg, 0, "AtkDlg");
    } else if (swfEventIs(msg, "search_btn2")) {
        openRange(defDlg, 1, "DefDlg");
    } else if (swfEventIs(msg, "search_btn3")) {
        openList(typeDlg, listCardTypeCreate, "TypeDlg", "TypeDlg create failed", listboxFillTypes, true);
    } else if (swfEventIs(msg, "search_btn4")) {
        openList(attrDlg, listCardAttrCreate, "AttrDlg", "AttrDlg create failed", listboxFillAttrs, true);
    } else if (swfEventIs(msg, "search_btn5")) {
        openList(iconDlg, listCardIconCreate, "EffectDlg", "EffectDlg create failed", listboxFillIcons, false);
    } else if (swfEventIs(msg, "search_btn6")) {
        playSe(SE_OK, 0);
        kabanSearch(KS_NAME, KS_MATCH, &values, 0, 0, nullptr);
    } else if (swfEventIs(msg, "search_btn7")) {
        openRange(textDlg, 2, "StrDlg");
    } else if (swfEventIs(msg, "search_btn8")) {
        openList(levelDlg, listCardStarCreate, "LevelDlg", "LevelDlg create failed", kabanFillLevels, false);
    } else if (swfEventIs(msg, "search_btn9")) {
        openList(limitDlg, listCardForbiCreate, "ForbiDlg", "ForbiDlg create failed", kabanFillLimits, false);
    }
    controllReceive(this, msg);
}

// @yo2 0x009651a0 a dialog model and its frame get the same size
void kabanModelSetSize(kbn::ModelView* m, float w, float h) {
    m->h = h;
    m->w = w;
    modelRelayout(m);
    if (kbn::ModelView* f = m->frame) {
        f->w = w;
        f->h = h;
        modelRelayout(f);
    }
}

// @yo2 0x00965210 ... and the same position (the exe doesn't check the frame here)
void kabanModelSetPos(kbn::ModelView* m, float x, float y) {
    m->px = x;
    m->py = y;
    kbn::ModelView* f = m->frame;
    f->px = x;
    f->py = y;
    f->x = x;
    f->y = y;
}

// @yo2 0x009652d0 the level list: one row per level 1..12
void kabanFillLevels(void* m) {
    for (int32_t i = 1; i < 13; i++) listboxAddStar(m, i);
}

// @yo2 0x00965300 the limit list: forbidden, limited, semi-limited, unlimited (1..4)
void kabanFillLimits(void* m) {
    for (int32_t i = 1; i < 5; i++) listboxAddForbi(m, i);
}

// ================================================================ CWindowTaskKabanCard

// @yo2 0x00965330 (this one sets the mediator before linking the task)
CWindowTaskKabanCard* CWindowTaskKabanCard::create(void* parent, void* mediator) {
    return createWindow<CWindowTaskKabanCard>(parent, mediator, true);   // left in eax
}

// @yo2 0x009653f0
void CWindowTaskKabanCard::construct() {
    controllConstruct(this);
    picture.setUser(this);
    x = y = w = h = z = 0;
    cardId = f38c = 0;
    taskSetTaskName(this, "CWindowTaskKabanCard");
}

// @yo2 0x009655d0
void CWindowTaskKabanCard::destruct() { controllDestruct(this); }

// @yo2 0x009655a0 scalar deleting destructor
void CWindowTaskKabanCard::destroy(CWindowTaskKabanCard* p, bool free) {
    p->destruct();
    if (free) delete p;
}

// @yo2 0x00965580 vf12: the control kind
uint32_t CWindowTaskKabanCard::kind() { return 0x17; }

// @yo2 0x00965640 a mini card is 50 x 72
uint32_t CWindowTaskKabanCard::init() {
    w = 50;
    h = 72;
    x = y = 0;
    z = 0;
    f38c = 0;
    dirty = 1;
    layout();
    return 1;
}

// @yo2 0x00965690 CElement vf05
uint32_t CWindowTaskKabanCard::update() {
    layout();
    return 1;
}

// @yo2 0x009656b0 vf13
void CWindowTaskKabanCard::layout() {
    ElemView::x = x;
    ElemView::y = y;
    ElemView::z = z;
}

// @yo2 0x009656e0 show card `id` (data/MINI/<name>)
void CWindowTaskKabanCard::setCard(uint32_t id) {
    cardId = id;
    VcString path("data/MINI/");
    path += cardImageName(cardId);
    picture.set(spriteCreate(this, kPrio, path));
    DK_ASSERT(picture.task, "picCard create failed");
    taskSetInstName(picture.get(), "picCard");
    elemSetAnchor(picture.get(), 2);
    kbn::ElemView* p = view(picture.get());
    p->dirty = 1;
    p->taskFlags &= ~2u;   // clickable
    elemSetVisible(picture.get(), true);
}

// @yo2 0x00965cf0
void CWindowTaskKabanCard::clearCard() { taskDestroy(picture.get()); }

// @yo2 0x00965d20 vf19: tell the owner this card was picked
void CWindowTaskKabanCard::clicked() { notifyMediator(0); }

// @yo2 0x00965d60 vf15
uint32_t CWindowTaskKabanCard::hitTest(float, float) { return 0; }

// @yo2 0x00965d80 vf14: mouse messages are left to the owner
uint32_t CWindowTaskKabanCard::onMouse(uint32_t) { return 0; }

// ================================================================ CWindowTaskKabanListBtn factory

// @yo2 0x009660c0 (the class itself is in KabanWindowList)
CWindowTaskKabanListBtn* kabanListBtnCreate(void* parent, void* mediator) {
    void* mem = ::operator new(kabanListBtnSize());   // 0x510 in the exe
    void* w = kabanListBtnConstruct(mem);
    if (!w) return nullptr;
    auto* t = static_cast<kbn::ControllView*>(taskCreate(w, parent, kPrio));
    if (t) t->mediator = mediator;
    return reinterpret_cast<CWindowTaskKabanListBtn*>(t);
}

}   // namespace dk
