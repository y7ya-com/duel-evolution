// src/Deck part A, "util" (yo2DeckUtil.cpp): weak stubs for DeckUtil.h's externs and the pure-helper selftest.
//   deck_a_cli util frame <type>...     structureFrameOfType per card_prop type (tests/deck_a_util_checks.py)
//   deck_a_cli util stem <path>         pathStem: "<start> <stem>"
#include <algorithm>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "Deck/DeckUtil.h"
#include "deck_a_check.h"

#define DK_STUB __attribute__((weak))

namespace dk {
// ---- stubs (recording just what the selftest reads)
static std::vector<std::u16string> g_rows;
static int g_shown;
static void* g_focusTarget;
static std::vector<int32_t> g_notes;

DK_STUB CSpriteElm* spriteCreate(void*, int32_t, const VcString&) {
    return reinterpret_cast<CSpriteElm*>(new ElemFields());
}
DK_STUB void elemSetBlend(void*, int32_t) {}
DK_STUB void elemShow(void* e, bool on, bool) { fields(e)->color[0] = on; }
DK_STUB void modelBaseInit(void*) {}
DK_STUB void modelBaseDestroy(void*) {}
DK_STUB void ctlBaseInit(void*) {}
DK_STUB void ctlBaseDestroy(void*) {}
DK_STUB bool modelIsTop(void*) { return true; }
DK_STUB void modelOnClose(void*) {}
DK_STUB void focusSet(void* c) { g_focusTarget = c; }
DK_STUB void listboxAdd(CWindowTaskListbox*, const uint16_t* t) {
    g_rows.push_back(std::u16string(reinterpret_cast<const char16_t*>(t)));
}
DK_STUB void listboxRemove(CWindowTaskListbox*, int32_t r) { g_rows.erase(g_rows.begin() + r); }
DK_STUB void listboxClear(CWindowTaskListbox*) { g_rows.clear(); }
DK_STUB void listboxRefresh(CWindowTaskListbox*) {}
DK_STUB void listboxSetEnabled(CWindowTaskListbox*, bool) {}
DK_STUB int32_t listboxCount(CWindowTaskListbox*) { return (int32_t)g_rows.size(); }
DK_STUB int32_t listboxMode(CWindowTaskListbox*) { return 1; }
DK_STUB int32_t listboxCursor(CWindowTaskListbox*) { return 7; }
DK_STUB int32_t listboxScrollTop(CWindowTaskListbox*) { return 2; }
DK_STUB void textFieldSetText(CWindowTaskTextField*, const uint16_t*) {}
DK_STUB void mediatorNotify(void*, void*, int32_t what, int32_t arg) {
    g_notes.push_back(what);
    g_notes.push_back(arg);
}
DK_STUB void mediatorSelect(void*, void*) {}
DK_STUB uint32_t cardInternalId(int32_t i) { return (uint32_t)i & 0x3fff; }
DK_STUB uint32_t cardFrameType(uint32_t) { return 0; }
DK_STUB size_t mbToWide(const char* s, uint16_t* out, size_t n) {
    size_t i = 0;
    for (; s[i] && i < n; i++) out[i] = (uint8_t)s[i];
    if (i < n) out[i] = 0;
    return i;
}
DK_STUB void dirForEach(const char*, void (*fn)(void*, const char*), void* ctx) {
    fn(ctx, "deck\\Yugi.ydc");
    fn(ctx, "deck\\gone.ydc");
}
DK_STUB const char* deckDir() { return "deck\\"; }
DK_STUB bool fileStat(const char* p) { return !strstr(p, "gone"); }
DK_STUB void fileMgrSetDir(const char*) {}
DK_STUB bool fileMgrExists(const VcString& n) { return n.size() && n.c_str()[0] == 'y'; }
DK_STUB bool packIsNew(const PackCatalogue*, int32_t id) { return id == 2; }
DK_STUB void cardPictureLoad(CDeckCardPicture* p, void*, int32_t) { p->sprite = nullptr; }
DK_STUB void cardPictureShow(CDeckCardPicture* p, bool on) {
    p->shown = on;
    g_shown += on ? 1 : -1;
}
static std::vector<std::string> g_log;   // what the input dialog builder did, in order
static void* fake(const char* what) {
    g_log.push_back(what);
    return new uint8_t[0x800]();
}
DK_STUB void ctlSetAlpha(void*, float) {}
DK_STUB void ctlLayout(void*) {}
DK_STUB void textSetAlign(CWindowTaskText*, int32_t) { g_log.push_back("align"); }
DK_STUB void textSetLineHeight(CWindowTaskText*, int32_t) {}
DK_STUB void textSetFontSize(CWindowTaskText*, int32_t) {}
DK_STUB void textSetPos(CWindowTaskText* t, float x, float y) { fields(t)->x = x, fields(t)->y = y; }
DK_STUB void textSetArea(CWindowTaskText*, int32_t, int32_t) {}
DK_STUB void textSetColor(CWindowTaskText*, float, float, float, float) {}
DK_STUB void ctlSetText(void*, const uint16_t* s) {
    g_log.push_back("text " + std::to_string(s[0]));
}
DK_STUB void ctlHide(void* c) { fields(c)->taskFlags |= TF_NOHIT; }
DK_STUB void ctlShow(void* c) { fields(c)->taskFlags &= ~TF_NOHIT; }
DK_STUB CWindowTaskFramePlane* framePlaneCreate(void*, void*, int32_t) {
    return static_cast<CWindowTaskFramePlane*>(fake("frame"));
}
DK_STUB CWindowTaskText* textCreate(void*, void*) { return static_cast<CWindowTaskText*>(fake("text")); }
DK_STUB CWindowTaskInput* inputCreate(void*, void*, int32_t) { return static_cast<CWindowTaskInput*>(fake("input")); }
DK_STUB CWindowTaskTextSwitch* textSwitchCreate(void*, void*) {
    return static_cast<CWindowTaskTextSwitch*>(fake("switch"));
}
DK_STUB CWindowTaskListbox* listboxCreate(void*, void*, int32_t) {
    return static_cast<CWindowTaskListbox*>(fake("listbox"));
}
DK_STUB void inputSetPos(CWindowTaskInput* in, float x, float y) { fields(in)->x = x, fields(in)->y = y; }
DK_STUB void inputSetSize(CWindowTaskInput*, float, float) {}
DK_STUB void listboxSetPos(CWindowTaskListbox*, float, float) {}
DK_STUB void listboxSetSize(CWindowTaskListbox*, float, float) {}
DK_STUB void switchSetPos(CWindowTaskTextSwitch* s, float x, float y) { fields(s)->x = x, fields(s)->y = y; }
DK_STUB void switchSetSize(CWindowTaskTextSwitch*, float, float) {}
DK_STUB void switchSetFontSize(CWindowTaskTextSwitch*, int32_t) {}
DK_STUB VcWString msgText(int32_t id) {
    uint16_t s[2] = {(uint16_t)(id % 10000), 0};   // the id itself as one "character"
    return VcWString(s);
}
DK_STUB void modelSetKeyHandler(void*, void*) {}
// the file-list builder (0x009299f0)
DK_STUB VcString skinPath(const char* f) { return VcString("skin\\") += f; }
DK_STUB CWindowTaskFrameBottomThick* frameThickCreate(void*, void*, int32_t) {
    return static_cast<CWindowTaskFrameBottomThick*>(fake("thick"));
}
DK_STUB void frameThickPlace(CWindowTaskFrameBottomThick* f, float x, float y, float w, float h, float b) {
    fields(f)->x = x, fields(f)->y = y;
    float v[3] = {w, h, b};
    memcpy(reinterpret_cast<uint8_t*>(f) + 0x418, v, sizeof v);
}
DK_STUB void listboxPlace(CWindowTaskListbox* lb, int32_t x, int32_t y, int32_t w, int32_t h) {
    fields(lb)->x = (float)x, fields(lb)->y = (float)y;
    int32_t v[2] = {w, h};
    memcpy(reinterpret_cast<uint8_t*>(lb) + 0x3b4, v, sizeof v);
}
DK_STUB void listboxSetZ(CWindowTaskListbox* lb, float z) { fields(lb)->z = z; }
DK_STUB void listboxSetTextAlign(CWindowTaskListbox*, int32_t) { g_log.push_back("lbalign"); }
DK_STUB void listboxSetMarks(CWindowTaskListbox*, bool) {}
DK_STUB void frameSetZ(CWindowTaskFrameBottomThick* f, float z) { fields(f)->z = z; }
DK_STUB CWindowTaskTextField* textFieldCreate(void*, void*) { return static_cast<CWindowTaskTextField*>(fake("field")); }
DK_STUB void ctlSetColor(void*, float, float, float, float) {}
DK_STUB void ctlSetMediator(void*, void*) {}
DK_STUB void textSetFont(CWindowTaskText*, const void*) {}
DK_STUB void textResetClip(CWindowTaskText*) {}
DK_STUB int32_t textWidth(CWindowTaskText*) { return 100; }
DK_STUB void ctlSetTextAlign(void*, int32_t) { g_log.push_back("ctlalign"); }
DK_STUB void switchGetRect(CWindowTaskTextSwitch*, float* x, float* y, float* w, float* h) {
    *x = *y = 0, *w = 64, *h = 20;
}
DK_STUB void cardPictureSetBlend(CDeckCardPicture*, int32_t) {}
DK_STUB void cardPictureSetScale(CDeckCardPicture*, int32_t, int32_t, int32_t) {}
}   // namespace dk

using namespace dk;

static std::u16string u(const char* s) { return std::u16string(s, s + strlen(s)); }

static int selftest() {
    int n = 0;
    // frame colours (card_prop type = cards_yo2.csv kind >> 1)
    const int frames[16] = {0, 1, 3, 3, 2, 2, 1, 1, 1, 1, 0, 1, 0, 4, 5, 0};
    for (uint32_t t = 0; t < 16; t++) CHECK(n, structureFrameOfType(t) == frames[t]);
    // stems, Shift-JIS aware
    VcString out("keep");
    CHECK(n, pathStem(VcString("deck\\Yugi.ydc"), &out) == 5 && out == VcString("Yugi"));
    CHECK(n, pathStem(VcString("a/b.c/d.ydc"), &out) == 6 && out == VcString("d"));
    CHECK(n, pathStem(VcString("nodir.ydc"), &out) == 0 && out == VcString("d"));
    CHECK(n, pathStem(VcString("x\\noext"), &out) == 0);
    const char sj[] = "d\\\x83\x5c\x83\x5c.ydc";   // 0x5c ('\\') as the trail byte of two katakana
    CHECK(n, pathStem(VcString(sj), &out) == 2 && out.size() == 4);
    CHECK(n, pathStem(VcString("a.b\\c"), &out) == 4 && out.size() == 0);   // dot before slash: clamped
    VcString in("deck/x.ydc");
    CHECK(n, deckFileStem(&in) == 5 && in == VcString("x"));
    // icon source cells
    int32_t r[4];
    structureIconSrc(2, r);
    CHECK(n, r[0] == 80 && r[1] == 0 && r[2] == 32 && r[3] == 16);
    structureIconSrc(9, r);
    CHECK(n, r[0] == 16);
    // tab order
    CHECK(n, inputValueNext(3) == 0 && inputValuePrev(0) == 3 && inputValueNext(1) == 2);
    CHECK(n, fileRowVisible(2, 2) && fileRowVisible(9, 2) && !fileRowVisible(10, 2) && !fileRowVisible(1, 2));

    // the input dialog's Tab cycling
    auto* iv = new CWindowModelInputValue();
    uint8_t ctl[4][0x400] = {};
    iv->input[0].task = reinterpret_cast<CWindowTaskInput*>(ctl[0]);
    iv->input[1].task = reinterpret_cast<CWindowTaskInput*>(ctl[1]);
    iv->sw[0].task = reinterpret_cast<CWindowTaskTextSwitch*>(ctl[2]);
    iv->sw[1].task = reinterpret_cast<CWindowTaskTextSwitch*>(ctl[3]);
    iv->focusNext(ctl[3] + 0x340);
    CHECK(n, g_focusTarget == ctl[0]);
    iv->focusPrev(ctl[0] + 0x340);
    CHECK(n, g_focusTarget == ctl[3]);
    g_focusTarget = nullptr;
    iv->focusNext(ctl[0]);   // not a colleague pointer: ignored
    CHECK(n, g_focusTarget == nullptr);
    for (auto& p : {&iv->input[0], &iv->input[1]}) p->task = nullptr;
    for (auto& p : {&iv->sw[0], &iv->sw[1]}) p->task = nullptr;
    delete iv;

    // the input dialog, kind 0 (two numbers) and kind 3 (one name)
    for (int32_t kind : {0, 3}) {
        auto* dlg = new CWindowModelInputValue();
        dlg->kind = kind;
        g_log.clear();
        g_rows.clear();
        CHECK(n, dlg->build());
        CHECK(n, g_log.size() >= 8 && g_log[0] == "frame" && g_log[7] == "listbox");
        CHECK(n, g_focusTarget == dlg->input[0].task && dlg->active == 1 && dlg->mw == 336.0f && dlg->mh == 144.0f);
        CHECK(n, fields(dlg->sw[1].task)->x == 208.0f && fields(dlg->sw[0].task)->z == 2.0f);
        if (kind == 0) {
            CHECK(n, g_log[8] == "text 4166" && g_rows.size() == 2 && fields(dlg->input[1].task)->x == 188.0f);
            CHECK(n, static_cast<uint8_t*>((void*)dlg->input[1].task)[0x3f0] == 5);
            CHECK(n, !(fields(dlg->text2.task)->taskFlags & TF_NOHIT));
        } else {
            CHECK(n, g_log[8] == "text 9008" && g_rows.empty() && fields(dlg->input[0].task)->y == 56.0f);
            CHECK(n, fields(dlg->text2.task)->taskFlags & TF_NOHIT);
            CHECK(n, fields(dlg->list.task)->taskFlags & TF_NOHIT);
        }
    }

    // structure icon
    auto* ic = structureIconNew(nullptr, nullptr);
    CHECK(n, ic->enabled == 1 && ic->alpha == 1.0f && ic->init() && ic->w1 == 32.0f && ic->h2 == 16.0f);
    ic->create(3);
    CHECK(n, fields(ic->icon.task)->src[0] == 112 && fields(ic->badge.task)->src[2] == 16);
    ic->x1 = 5, ic->y1 = 6, ic->z = 7;
    ic->place();
    CHECK(n, fields(ic->icon.task)->x == 5 && fields(ic->icon.task)->z == 7);
    ic->setNew(false);
    CHECK(n, fields(ic->badge.task)->taskFlags & TF_NOHIT);
    ic->setNew(true);
    CHECK(n, !(fields(ic->badge.task)->taskFlags & TF_NOHIT));

    // file list: deck files, packs, the 8-row window
    auto* fl = fileListNew(nullptr, 10, 20, FILELIST_PACKS);
    CHECK(n, fl->mh == 296.0f && fl->mw == 696.0f && fl->fade == 0.8f && fl->sel1 == -1);
    g_rows.clear();
    fl->listDeckFiles();
    CHECK(n, g_rows.size() == 1 && g_rows[0] == u("Yugi"));
    g_rows.clear();
    auto* cat = new PackCatalogue();
    for (int i = 0; i < 12; i++) {
        PackEntry e{};
        e.type = i % 2 ? 4 : 1;
        char nm[16];
        snprintf(nm, sizeof nm, "Pack%d", i);
        e.name = nm;
        e.image = i < 2 ? "yes.png" : "no.png";
        e.id = i;
        cat->packs.push_back(e);
    }
    fl->fillPacks(cat);
    CHECK(n, g_rows.size() == 12 && g_rows[0] == u("@>64/Pack0") && fl->icons.size() == 12);
    CHECK(n, fl->icons[0]->kind == 1 && fl->icons[1]->kind == 3 && fl->icons[2]->kind == 0 && fl->icons[3]->kind == 2);
    CHECK(n, fl->icons[2]->isNew && !fl->icons[3]->isNew);
    CHECK(n, fl->icons[7]->y1 == 152.0f && !(fields(fl->icons[7])->taskFlags & TF_NOHIT));
    CHECK(n, fields(fl->icons[8])->taskFlags & TF_NOHIT);
    fl->layoutIcons();   // scrolled to row 2
    CHECK(n, (fields(fl->icons[1])->taskFlags & TF_NOHIT) && fl->icons[2]->y1 == 40.0f);
    CHECK(n, !(fields(fl->icons[9])->taskFlags & TF_NOHIT) && fl->icons[9]->y1 == 152.0f);
    CHECK(n, fields(fl->icons[10])->taskFlags & TF_NOHIT);
    fl->owner = &n;   // any non-null mediator
    g_notes.clear();
    uint8_t lb[0x400], swc[0x400];
    fl->list.task = reinterpret_cast<CWindowTaskListbox*>(lb);
    fl->sw[2].task = reinterpret_cast<CWindowTaskTextSwitch*>(swc);
    fl->onColleague(lb + 0x340);
    fl->onColleague(swc + 0x340);
    CHECK(n, g_notes == std::vector<int32_t>({5, 7, 0, 0xfa2}));
    fl->list.task = nullptr;
    fl->sw[2].task = nullptr;
    vectorInsertIcons(&fl->icons, 1, 2, fl->icons[5]);
    CHECK(n, fl->icons.size() == 14 && fl->icons[1] == fl->icons[7] && fl->icons[2] == fl->icons[7]);
    vectorFreeIcons(&fl->icons);
    CHECK(n, fl->icons.size() == 0);
    delete cat;

    // the file-list window builder (0x009299f0), decks mode: 696 x 144
    for (int32_t mode : {FILELIST_DECKS, FILELIST_PACKS}) {
        auto* w = static_cast<CWindowModelFileList*>(::operator new(sizeof(CWindowModelFileList)));
        memset((void*)w, 0, sizeof *w);
        w->construct();
        w->setup(nullptr, 10.0f, 20.0f, mode);
        g_log.clear();
        CHECK(n, w->init() == 1);
        ElemFields* rt = fields(w->deco[2].get());   // RT1: right column, top row
        CHECK(n, rt->x == 696.0f - 8.0f && rt->y == 0.0f && rt->z == 31.0f && rt->src[0] == 0x28 && rt->src[2] == 8);
        CHECK(n, rt->color[3] == 0.8f);
        float sx, sy;
        memcpy(&sx, reinterpret_cast<uint8_t*>(w->deco[4].get()) + 0x88, 4);   // Top2: stretched, 3x high
        memcpy(&sy, reinterpret_cast<uint8_t*>(w->deco[4].get()) + 0x8c, 4);
        CHECK(n, sx == (696.0f - 16.0f) / 8.0f && sy == 3.0f && fields(w->deco[4].get())->y == 8.0f);
        CHECK(n, fields(w->deco[15].get())->y == 184.0f && fields(w->deco[15].get())->src[0] == 0x48);
        // switches: quarter cells under the window, (cell - 64) / 2 + i * cell, y = (24 - 20) / 2 + h + 32
        for (int i = 0; i < 4; i++) {
            ElemFields* s = fields(w->sw[i].get());
            CHECK(n, s->x == (174.0f - 64.0f) * 0.5f + 174.0f * (float)i && s->z == 32.0f);
            CHECK(n, s->y == 2.0f + w->mh + 32.0f);
        }
        // title centred: 696 / 2 - 100 / 2 - 8
        CHECK(n, fields(w->title.get())->x == 290.0f && fields(w->title.get())->y == 8.0f);
        CHECK(n, !(fields(w->title.get())->taskFlags & TF_NOHIT));
        bool fieldHidden = fields(w->field.get())->taskFlags & TF_NOHIT;
        bool newHidden = fields(w->sw[0].get())->taskFlags & TF_NOHIT;
        bool delHidden = fields(w->sw[1].get())->taskFlags & TF_NOHIT;
        if (mode == FILELIST_DECKS) CHECK(n, fieldHidden && newHidden && !delHidden && fields(w->deco[9].get())->taskFlags & TF_NOHIT);
        else CHECK(n, !fieldHidden && newHidden && delHidden && w->mh == 296.0f);
        CHECK(n, (std::find(g_log.begin(), g_log.end(), "lbalign") != g_log.end()) == (mode == FILELIST_PACKS));
        CHECK(n, fields(w->list.get())->x == 8.0f && fields(w->list.get())->y == 40.0f && fields(w)->x == 10.0f);
    }

    // card loader
    auto* ld = static_cast<CDeckCardLoader*>(::operator new(sizeof(CDeckCardLoader)));
    for (auto& p : ld->pic) p.construct();
    g_shown = 0;
    CHECK(n, ld->request(5, 10) && ld->pic[10].loaded && !ld->request(5, 10));
    ld->release(10);
    CHECK(n, !ld->pic[10].shown && ld->request(5, 10) && g_shown == 1);
    CHECK(n, ld->pic[0].w == 256.0f && ld->pic[0].f18 == 2.0f);
    ::operator delete(ld);
    return n;
}

static int cmd(int argc, char** argv) {
    if (argc >= 1 && !strcmp(argv[0], "frame")) {
        for (int i = 1; i < argc; i++) printf("%d\n", structureFrameOfType((uint32_t)atoi(argv[i])));
        return 0;
    }
    if (argc == 2 && !strcmp(argv[0], "stem")) {
        VcString out;
        size_t at = pathStem(VcString(argv[1]), &out);
        printf("%zu %s\n", at, out.c_str());
        return 0;
    }
    return 2;
}

static DeckAPart reg("util", selftest, cmd);
