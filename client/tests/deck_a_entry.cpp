// The "entry" part test (src/Deck/DeckEntry.cpp): weak stubs for the externs of DeckEntry.h that
// tests/deck_a_entry_main.cpp doesn't already stub, the "entry" selftest (drop rules and zones, the scene's init /
// fill / save helpers against recording stubs, the inline accessors), and the data command
//   deck_a_cli entry drop      stdin "part count frame" per line -> "0" / "1" (deckDropAllowed)
// which tests/deck_a_entry_checks.py runs against YOLaucher's mazo.py rules over cards_yo2.csv.
#include <cstdio>
#include <iostream>
#include <map>
#include <string>
#include <vector>

#include "Deck/DeckEntry.h"
#include "Deck/DeckEntryMain.h"
#include "deck_a_check.h"

#define DK_STUB __attribute__((weak))

namespace dk {
namespace em {   // tests/deck_a_entry_main.cpp's recorder and fake CDeckObject (same definition)
extern std::vector<std::string> log;
void note(const std::string& s);
bool saw(const std::string& s);
struct FakeDeck {
    std::vector<uint16_t> part[4];
    bool saveOk = true;
};
}   // namespace em

namespace et {
std::map<std::string, std::vector<float>> sprites;   // instance name -> {src x, y, w, h, sx, sy, x, y, z, blend}
std::vector<std::pair<int32_t, int32_t>> pushed;     // trunk counts pushed to the trunk list
int32_t rowCount, number, lastDeckNoted;
uint8_t sceneId = 0xc;
bool lobbyOk = true;
std::vector<uint8_t> trunkBytes(0x2700);
}   // namespace et

static std::string nameOf(const void* p) { return taskInstName(p); }   // recorded by deck_a_stubs.cpp
static std::vector<float>& spr(const void* p) {
    auto& v = et::sprites[nameOf(p)];
    if (v.empty()) v.assign(10, 0);
    return v;
}

// ---- DeckEntry.h
DK_STUB void deckObjPrepare(CDeckObject*) { em::note("trunk prepare"); }
DK_STUB int32_t trunkTotal(const CDeckObject*) { return 1234; }
DK_STUB CDeckObject* appTrunk() { return reinterpret_cast<CDeckObject*>(et::trunkBytes.data()); }
DK_STUB CDeckObject* appEditDeck() {
    static em::FakeDeck deck;   // empty: init then loads it (the entry_main stub of deckObjLoad gives main {7, 8})
    return reinterpret_cast<CDeckObject*>(&deck);
}
DK_STUB VcString settingsLastDeck() { return VcString("last.ydc"); }
static std::vector<void*> s_allocs;
template <class T>
static T* fake(const char* tag) {
    void* p = ::operator new(0x600);
    std::memset(p, 0, 0x600);
    s_allocs.push_back(p);
    em::note(std::string("create ") + tag);
    return static_cast<T*>(p);
}
DK_STUB CElement* elementCreate(void*, int32_t prio) { return fake<CElement>(prio == 10000 ? "root" : "elem"); }
DK_STUB CDeckCardLoader* cardLoaderCreate(void*, int32_t, int32_t) { return fake<CDeckCardLoader>("loader"); }
DK_STUB void cardPicsPrepare(void*) {}
DK_STUB CCardDetailViewDlg* detailDlgCreate(void*, int32_t, int32_t w, int32_t) {
    em::note("detail w " + std::to_string(w));
    return fake<CCardDetailViewDlg>("detail");
}
DK_STUB void detailDlgHide(CCardDetailViewDlg*) { em::note("detail hide"); }
DK_STUB CNetLobbyTask* deckLobbyCreate(void*) { return et::lobbyOk ? fake<CNetLobbyTask>("lobby") : nullptr; }
DK_STUB void swfSetButton(CSwfEngine*) {}
DK_STUB void sceneMenuForDeck(uint8_t id) { em::note("menu " + std::to_string(id)); }
DK_STUB uint8_t appSceneId() { return et::sceneId; }
DK_STUB void sceneFadeIn(int32_t a, int32_t b) { em::note("fadein " + std::to_string(a) + " " + std::to_string(b)); }
DK_STUB void packsRefresh() {}
DK_STUB void elemDestroyTree(void*) {}
DK_STUB void elemSetScaleX(void* e, float s) { spr(e)[4] = s; }
DK_STUB void elemSetScaleY(void* e, float s) { spr(e)[5] = s; }
DK_STUB void elemSetListener(void*, void*) {}
DK_STUB CSwfEngine* swfCreate(void*, int32_t, const VcString& path, int32_t) {
    em::note(std::string("swf ") + path.c_str());
    return fake<CSwfEngine>("swf");
}
DK_STUB void sorterDestroy(void*) { em::note("sorter dtor"); }
DK_STUB void sceneTaskDestruct(void*) { em::note("base dtor"); }
DK_STUB void dialogSetSize(void*, float w, float h) { em::note("dlg size " + std::to_string((int)w) + "x" + std::to_string((int)h)); }
DK_STUB void dialogSetTextScale(void*, float) {}
DK_STUB void dialogSetColor(void*, float, float, float, float) {}
DK_STUB void dialogClose(void*) {}
// ---- the trunk / deck windows' calls init makes (KabanWindowList.h, DeckWindow.h)
DK_STUB void SortItems::push(int32_t card, int32_t count) { et::pushed.push_back({card, count}); }
DK_STUB void CWindowTaskKabanList::applyCategory() { em::note("applyCategory"); }
DK_STUB void CWindowTaskKabanList::setRowCount(int32_t n) { et::rowCount = n; }
DK_STUB void CWindowTaskKaban::setNumber(int32_t v) { et::number = v; }
DK_STUB CWindowModelKaban* modelKabanCreate(void*, void*, int32_t, float, float, int32_t) {
    return fake<CWindowModelKaban>("kabanModel");
}
DK_STUB CWindowModelDeck* modelDeckCreate(void*, int32_t, float, float, int32_t) {
    return fake<CWindowModelDeck>("deckModel");
}
// ---- sprites (shared System externs)
DK_STUB CSpriteElm* spriteCreate(void*, int32_t, const VcString& path) {
    em::note(std::string("sprite ") + path.c_str());
    return fake<CSpriteElm>("sprite");
}
DK_STUB void spriteSetSrc(CSpriteElm* s, int32_t x, int32_t y, int32_t w, int32_t h) {
    auto& v = spr(s);
    v[0] = (float)x, v[1] = (float)y, v[2] = (float)w, v[3] = (float)h;
}
DK_STUB void spriteSetBlend(CSpriteElm* s, int32_t m) { spr(s)[9] = (float)m; }
DK_STUB void elemSetPos3(void* e, float x, float y, float z) {
    auto& v = spr(e);
    v[6] = x, v[7] = y, v[8] = z;
}

}   // namespace dk

using namespace dk;

namespace {

int selftest() {
    int n = 0;
    // ---- the drop rules: mazo.py's sizes (main 80, extra 30) and the 15-card side
    CHECK(n, deckDropAllowed(DP_MAIN, 79, 0) && !deckDropAllowed(DP_MAIN, 80, 0) && !deckDropAllowed(DP_MAIN, 0, 2));
    CHECK(n, deckDropAllowed(DP_SIDE, 14, 1) && !deckDropAllowed(DP_SIDE, 15, 1) && !deckDropAllowed(DP_SIDE, 0, 3));
    CHECK(n, deckDropAllowed(DP_EXTRA, 29, 2) && deckDropAllowed(DP_EXTRA, 0, 3) && !deckDropAllowed(DP_EXTRA, 30, 3));
    CHECK(n, !deckDropAllowed(DP_EXTRA, 0, 0) && !deckDropAllowed(DP_EXTRA, 0, 4) && !deckDropAllowed(DP_MISSING, 0, 0));
    // ---- the drop zones
    DropZones z = deckDropZones(false, false);
    CHECK(n, z.mainBottom == 0x1e0 && z.sideTop == 0x200 && z.sideBottom == 0x258);
    z = deckDropZones(false, true);
    CHECK(n, z.mainBottom == 0x168 && z.sideBottom == 0x258);
    z = deckDropZones(true, false);
    CHECK(n, z.mainBottom == 0x248 && z.sideTop == 0x268 && z.sideBottom == 0x2c0);
    CHECK(n, deckDropZones(true, true).mainBottom == 0x1d0);
    z = deckDropZones(false, false);
    CHECK(n, deckDropTarget(z, false, 0x101, 0x59) == DP_MAIN && deckDropTarget(z, false, 0x100, 0x100) == DP_MISSING);
    CHECK(n, deckDropTarget(z, false, 0x2d7, 0x1df) == DP_MAIN && deckDropTarget(z, false, 0x2d8, 0x100) == DP_MISSING);
    CHECK(n, deckDropTarget(z, false, 0x200, 0x1f0) == DP_MISSING && deckDropTarget(z, false, 0x200, 0x201) == DP_SIDE);
    CHECK(n, deckDropTarget(z, false, 0x200, 0x258) == DP_MISSING && deckDropTarget(z, true, 0x200, 0x257) == DP_EXTRA);
    // ---- the trunk record: 3 bytes per card from offset 9, count first
    std::vector<uint8_t>& tb = et::trunkBytes;
    std::fill(tb.begin(), tb.end(), 0);
    tb[(1 + 3) * 3] = 3, tb[(2 + 3) * 3] = 1, tb[(0xcb8 + 3) * 3] = 2;
    CHECK(n, trunkCount(appTrunk(), 1) == 3 && trunkCount(appTrunk(), 2) == 1 && trunkCount(appTrunk(), 0xcb8) == 2);

    // ---- init: the screen, then the trunk and deck fill
    CWindowTaskDeck win;
    CWindowTaskKabanList list;
    CWindowTaskKaban kaban;
    g_deckWindow = &win, g_kabanList = &list, g_kaban = &kaban;
    CDeckScene* s = new CDeckScene();
    s->root.setUser(s), s->title.setUser(s), s->bg.setUser(s), s->detail.setUser(s), s->deckModel.setUser(s);
    s->kabanModel.setUser(s), s->loader.setUser(s), s->lobby.setUser(s);
    for (auto& b : s->btn) b.setUser(s);
    for (auto& o : s->ok) o.setUser(s);
    em::log.clear();
    CHECK(n, s->init() == 1);
    CHECK(n, s->root.task && s->rootParent == nullptr && nameOf(s->root.task) == "deckScene");
    const std::vector<float>& bg = et::sprites["BG"];
    CHECK(n, bg[0] == 0 && bg[2] == 512 && bg[3] == 384 && bg[4] == 2 && bg[5] == 2 && bg[9] == 2);
    const std::vector<float>& ti = et::sprites["title"];
    CHECK(n, ti[2] == 0xf8 && ti[3] == 0x28 && ti[8] == 1.0f && ti[9] == 2);
    const char* names[SCENE_BTN_COUNT] = {"LoadBtn", "SaveBtn", "RecipeBtn", "ClearBtn", "ExitBtn"};
    const float ys[SCENE_BTN_COUNT] = {40, 67, 94, 121, 148};
    for (int i = 0; i < SCENE_BTN_COUNT; i++) {
        CHECK(n, nameOf(s->btn[i].task) == names[i]);
        CHECK(n, et::sprites[names[i]][7] == ys[i] && et::sprites[names[i]][8] == 1.0f);
        CHECK(n, em::saw("swf data/deck/deck_botton" + std::to_string(i + 1) + ".txt"));
    }
    CHECK(n, nameOf(s->loader.task) == "cardLoader" && nameOf(s->detail.task) == "detail");
    CHECK(n, nameOf(s->kabanModel.task) == "kabanWindow" && nameOf(s->deckModel.task) == "deckWindow");
    CHECK(n, nameOf(s->lobby.task) == "DECK CNetLobbyTask" && em::saw("detail w 608") && em::saw("detail hide"));
    // the trunk counts of all 0xcb8 cards go to the trunk list, then its filter, 9 rows and the total
    CHECK(n, et::pushed.size() == 0xcb8 && et::pushed[0] == std::make_pair(1, 3) && et::pushed[0xcb7].second == 2);
    CHECK(n, em::saw("applyCategory") && et::rowCount == 9 && et::number == 1234);
    // the deck's cards: each into its grid and out of the trunk count; the missing cards only into their grid
    CHECK(n, em::saw("win main 7") && em::saw("win main 8") && em::saw("trunk -7 1") && em::saw("trunk -8 1"));
    CHECK(n, em::saw("clearAll") && em::saw("fill 0 0") && em::saw("view 0"));
    CHECK(n, em::saw("menu 12") && em::saw("se 1") && em::saw("fadein 10 61004") && s->busy == 0);
    // ---- the save helpers
    em::log.clear();
    s->saveMode = 0;
    s->dirty = 1;
    s->saveDone(VcString("mine.ydc"));
    CHECK(n, em::saw("last mine.ydc") && s->dirty == 0 && em::saw("ok") && em::saw("dlg size 500x116"));
    CHECK(n, s->busy == 1 && nameOf(s->ok[0].task) == "savesuccessdialog");
    em::log.clear();
    s->fileName = "x.ydc";
    s->saveMode = 0;
    s->busy = 1;
    s->saveCancel();
    CHECK(n, s->fileName.empty() && s->busy == 0);
    // ---- the inline accessors
    DeckDragState drag{};
    DragState* savedDrag = g_drag;
    g_drag = reinterpret_cast<DragState*>(&drag);
    drag.dragging = 2, drag.fromDeck = 1, drag.grid = 3, drag.card = 77, drag.index = 5;
    DeckDragState* d = deckDragState();
    CHECK(n, dragState(d) == 2 && dragFrom(d) == 1 && dragGrid(d) == 3 && dragCard(d) == 77 && dragIndex(d) == 5);
    dragClear(d);
    CHECK(n, d->dragging == 0 && d->card == 0 && d->index == 0);
    g_drag = savedDrag;
    CHECK(n, deckWindow() == &win && kabanList() == &list && kabanWindow() == &kaban);
    win.expanded = 1, win.missingCount = 4;
    CHECK(n, deckWindowExpanded(&win) && deckWindowMissing(&win) == 4);
    kabanSetDragging(&kaban, 1);
    CHECK(n, kabanDragging(&kaban) == 1 && kaban.dragging == 1);
    std::vector<uint8_t> raw(0x700, 0);
    raw[0x548] = 0x2a, raw[0x548 + 0x94] = 0x2b;
    std::memcpy(&raw[0x574 + 0x94 + 0x11], "parts", 6);
    CHECK(n, netDuelSideId(raw.data(), 0) == 0x2a && netDuelSideId(raw.data(), 1) == 0x2b);
    CHECK(n, std::string(netDuelSideParts(raw.data(), 1, 1)) == "parts");
    raw[0x414] = 3, raw[0x448] = 1, raw[0x88] = 9;
    CHECK(n, menuBarModeOf(raw.data()) == 3 && worldOf(raw.data()) == 1 && lobbyTaskStateOf(raw.data()) == 9);
    CHECK(n, lobbyRoom(raw.data()) == raw.data() + 0x35fc && appInputOf(raw.data()) == raw.data() + 0x148);
    std::vector<uint8_t> iv(0x600, 0);
    auto* in = reinterpret_cast<CWindowModelInputValue*>(iv.data());
    inputValueResetResult(in);
    CHECK(n, inputValueResult(in) == -1);
    CHECK(n, wideLength(VcWString((const uint16_t*)u"abc")) == 3);
    // CWindowTaskListbox: the selected row's text, and no read past the rows (fix)
    std::vector<uint8_t> lbBytes(sizeof(ListboxView), 0);
    ListboxView* lb = new (lbBytes.data()) ListboxView();
    lb->items.push_back(VcWString((const uint16_t*)u"one"));
    lb->items.push_back(VcWString((const uint16_t*)u"two"));
    lb->sel = 1;
    CHECK(n, listboxSelTextOf(reinterpret_cast<CWindowTaskListbox*>(lb)) == VcWString((const uint16_t*)u"two"));
    lb->sel = 2;
    CHECK(n, listboxSelTextOf(reinterpret_cast<CWindowTaskListbox*>(lb)).empty());
    lb->~ListboxView();
    PackCatalogue cat;
    PackEntry pe{};
    pe.type = 4;
    cat.packs.push_back(pe);
    CHECK(n, packAt(&cat, 0) == cat.packs.first && packType(packAt(&cat, 0)) == 4);
    // ---- teardown: members in reverse order, then the base
    em::log.clear();
    s->destruct();
    CHECK(n, em::saw("sorter dtor") && em::log.back() == "base dtor");
    ::operator delete(static_cast<void*>(s));   // destruct() ran the member destructors
    g_deckWindow = nullptr, g_kabanList = nullptr, g_kaban = nullptr;
    for (void* p : s_allocs) ::operator delete(p);
    s_allocs.clear();
    return n;
}

// deck_a_cli entry drop < "part count frame" lines
int cmd(int argc, char** argv) {
    if (argc < 1 || std::string(argv[0]) != "drop") return 2;
    int part, count, frame;
    while (std::cin >> part >> count >> frame) printf("%d\n", deckDropAllowed((DeckPart)part, count, frame) ? 1 : 0);
    return 0;
}

DeckAPart reg("entry", selftest, cmd);

}   // namespace
