// Weak stubs for src/Deck/DeckEntryMain.h (and the calls CDeckScene::main makes into DeckEntry.h, the deck
// window, the trunk window and the file lists), plus the "entrymain" selftest: the drop zones and deck rules of
// FUN_008df280 against YOLaucher's mazo.py numbers, and scripted frames through CDeckScene::main.
#include <algorithm>
#include <string>
#include <vector>

#include "Deck/DeckEntryMain.h"
#include "deck_a_check.h"

#define DK_STUB __attribute__((weak))

namespace dk {

// ---------------------------------------------------------------- what the stubs record
namespace em {
std::vector<std::string> log;
struct FakeDeck {   // stands in for a CDeckObject
    std::vector<uint16_t> part[4];
    bool saveOk = true;
};
int32_t mouseX, mouseY;
bool released, cancelKey, fileExists, hasSel = true;
int32_t selIndex = 0;
int32_t frameOf(uint32_t card) { return card >= 1000 ? 2 : 0; }   // cards >= 1000 are fusions here
void note(const std::string& s) { log.push_back(s); }
bool saw(const std::string& s) { return std::find(log.begin(), log.end(), s) != log.end(); }
}   // namespace em
static em::FakeDeck* fd(CDeckObject* d) { return reinterpret_cast<em::FakeDeck*>(d); }

// ---- DeckEntryMain.h
DK_STUB bool mouseReleased() { return em::released; }
DK_STUB void modelSetActive(void*, bool on) { em::note(on ? "active 1" : "active 0"); }
DK_STUB void modelSetAlpha(void*, float) {}
DK_STUB void dialogSetPos(void*, float, float) {}
static CWindowModelDialogYesNo* fakeYesNo() { return reinterpret_cast<CWindowModelDialogYesNo*>(new int[4]()); }
DK_STUB CWindowModelDialogYesNo* yesNoCreate(void*, int32_t, int32_t, int32_t, int32_t, int32_t style) {
    em::note("yesno " + std::to_string(style));
    return fakeYesNo();
}
DK_STUB CWindowModelDialogOk* okDialogCreate(void*, float, float, int32_t, int32_t) {
    em::note("ok");
    return reinterpret_cast<CWindowModelDialogOk*>(new int[4]());
}
DK_STUB CWindowModelInputValue* inputValueCreate(void*, int32_t, int32_t, int32_t, int32_t kind) {
    em::note("input " + std::to_string(kind));
    return new CWindowModelInputValue();
}
DK_STUB VcWString inputValueText(CWindowModelInputValue*) { return VcWString(); }
DK_STUB bool listboxHasSelection(CWindowTaskListbox*) { return em::hasSel; }
DK_STUB int32_t listboxSelIndex(CWindowTaskListbox*) { return em::selIndex; }
DK_STUB VcWString listboxSelText(CWindowTaskListbox*) {
    const uint16_t w[] = {'d', 'e', 'c', 'k', 0};
    return VcWString(w);
}
DK_STUB VcString wideToMb(const uint16_t* s) {
    std::string o;
    while (s && *s) o += (char)*s++;
    return VcString(o.c_str());
}
DK_STUB VcWString mbToWide(const char* s) {
    std::vector<uint16_t> w;
    while (s && *s) w.push_back((uint8_t)*s++);
    w.push_back(0);
    return VcWString(w.data());
}
DK_STUB VcString deckFolder() { return VcString("deck"); }
DK_STUB void settingsSetLastDeck(const VcString& f) { em::note(std::string("last ") + f.c_str()); }
DK_STUB void settingsWrite() {}
DK_STUB bool deckFileExists(const VcString&) { return em::fileExists; }
DK_STUB void deckFileDelete(const VcString& p) { em::note(std::string("delete ") + p.c_str()); }
DK_STUB void deckObjSetFile(CDeckObject*, const VcString& f) { em::note(std::string("file ") + f.c_str()); }
DK_STUB bool deckObjSetFolder(CDeckObject*, const VcString& f) {
    em::note(std::string("folder ") + f.c_str());
    return true;
}
DK_STUB void deckObjReset(CDeckObject* d) {
    for (auto& p : fd(d)->part) p.clear();
}
DK_STUB bool deckObjSave(CDeckObject* d) { return fd(d)->saveOk; }
DK_STUB bool deckObjLoad(CDeckObject* d) {
    fd(d)->part[DP_MAIN] = {7, 8};
    return true;
}
DK_STUB VcString deckObjName(CDeckObject*) { return VcString("old.ydc"); }
DK_STUB void deckSaveBegin() {}
DK_STUB PackCatalogue* appPacks() { return nullptr; }
DK_STUB void packMarkSeen(PackCatalogue*, int32_t, int32_t) {}
DK_STUB void duelDeckClear(void*) { em::note("duel clear"); }
DK_STUB void duelDeckAdd(void*, DeckPart p, uint32_t c) { em::note("duel " + std::to_string(p) + " " + std::to_string(c)); }
DK_STUB void bgmStop(int32_t) {}
DK_STUB void menuBarLeaveDeck() { em::note("leave"); }
DK_STUB void sceneFadeOut(int32_t, int32_t) {}
DK_STUB void sceneReturnToMap(int32_t) { em::note("map"); }
DK_STUB void menuTopTick() {}
DK_STUB int32_t menuBarMode() { return 0; }
DK_STUB void menuBarTick() {}
DK_STUB void menuBarSetFlag(int32_t) {}
DK_STUB void deckSceneMenuModeChanged(CDeckScene*) {}
DK_STUB bool lobbyConnected() { return false; }
DK_STUB uint8_t lobbyState() { return 0; }
DK_STUB bool lobbySend(int32_t) { return false; }
DK_STUB bool lobbyTaskStart(CNetLobbyTask*) { return false; }
DK_STUB int32_t lobbyTaskState(CNetLobbyTask*) { return 0; }
DK_STUB int32_t duelSideId(int32_t) { return 0; }
DK_STUB const char* duelSideParts(int32_t, int32_t) { return ""; }
DK_STUB int32_t appWorld() { return 0; }
DK_STUB void avatarSetParts(int32_t, const char*) {}
DK_STUB int32_t lobbyRoomKind() { return 0; }
DK_STUB void duelSetMode(int32_t) {}
DK_STUB void sceneChange(int32_t, int32_t, int32_t) {}

// ---- DeckEntry.h calls main makes (tests/deck_a_entry.cpp may have its own weak copies)
DK_STUB uint8_t deckObjCount(CDeckObject* d, DeckPart p) { return (uint8_t)fd(d)->part[p].size(); }
DK_STUB const uint16_t* deckObjCards(CDeckObject* d, DeckPart p) {
    static uint16_t buf[4][96];
    std::fill(std::begin(buf[p]), std::end(buf[p]), 0);
    std::copy(fd(d)->part[p].begin(), fd(d)->part[p].end(), buf[p]);
    return buf[p];
}
DK_STUB bool deckObjAdd(CDeckObject* d, DeckPart p, uint32_t card, CDeckObject*) {
    fd(d)->part[p].push_back((uint16_t)card);
    em::note("obj add " + std::to_string(p) + " " + std::to_string(card));
    return true;
}
DK_STUB bool deckObjRemove(CDeckObject* d, DeckPart p, uint32_t card) {
    auto& v = fd(d)->part[p];
    auto it = std::find(v.begin(), v.end(), (uint16_t)card);
    if (it == v.end()) return false;
    v.erase(it);
    return true;
}
DK_STUB void deckObjClear(CDeckObject* d) { fd(d)->part[DP_MISSING].clear(); }
DK_STUB void sceneSetButtonsEnabled(bool on) { em::note(on ? "buttons 1" : "buttons 0"); }
DK_STUB int32_t dialogResult(void* d) { return static_cast<int32_t*>(d)[0]; }
DK_STUB void dialogOpen(void*) {}
DK_STUB void dialogSetText(void*, const uint16_t*) {}
DK_STUB void dialogLayout(void*) {}
DK_STUB const VcWString& uiText(int32_t) {
    static VcWString e;
    return e;
}
DK_STUB bool keyEnterPressed() { return em::cancelKey; }
DK_STUB void CDeckScene::saveDone(VcString) { em::note("saveDone"); }
DK_STUB void CDeckScene::saveCancel() { em::note("saveCancel"); }
DK_STUB void CDeckScene::saveSuccess() { em::note("saveSuccess"); }

// ---- the deck window (DeckWindow.h)
DK_STUB CWindowTaskDeck* g_deckWindow = nullptr;
static DeckDragState s_drag;
DK_STUB DeckDragState* deckDragState() { return &s_drag; }
// DeckEntry.cpp's deckDragState (0x008e8430) reads DAT_012b3230 = g_drag: point it at the same state
[[maybe_unused]] static const bool s_dragHooked = (g_drag = reinterpret_cast<DragState*>(&s_drag), true);
DK_STUB void mousePos(int32_t* x, int32_t* y) { *x = em::mouseX, *y = em::mouseY; }
DK_STUB void soundPlay(uint32_t id, int32_t) { em::note("se " + std::to_string(id & 0xff)); }
DK_STUB uint32_t cardKonamiId(uint32_t card) { return card; }
DK_STUB int32_t cardFrame(uint32_t k) { return em::frameOf(k); }
DK_STUB bool CWindowTaskDeck::addMain(uint32_t c) { em::note("win main " + std::to_string(c)); return true; }
DK_STUB bool CWindowTaskDeck::addSide(uint32_t c) { em::note("win side " + std::to_string(c)); return true; }
DK_STUB bool CWindowTaskDeck::addExtra(uint32_t c) { em::note("win extra " + std::to_string(c)); return true; }
DK_STUB bool CWindowTaskDeck::addMissing(uint32_t c) { em::note("win missing " + std::to_string(c)); return true; }
DK_STUB bool CWindowTaskDeck::removeMain(uint32_t i) { em::note("win -main " + std::to_string(i)); return true; }
DK_STUB bool CWindowTaskDeck::removeSide(uint32_t i) { em::note("win -side " + std::to_string(i)); return true; }
DK_STUB bool CWindowTaskDeck::removeExtra(uint32_t i) { em::note("win -extra " + std::to_string(i)); return true; }
DK_STUB void CWindowTaskDeck::cancelDrag(int g, uint32_t i) { em::note("cancel " + std::to_string(g) + " " + std::to_string(i)); }
DK_STUB void CWindowTaskDeck::clearMissing() {}
DK_STUB void CWindowTaskDeck::clearAll() { em::note("clearAll"); }
DK_STUB void CWindowTaskDeck::rebuild() {}
DK_STUB void CWindowTaskDeck::fill(int32_t a, int32_t b) { em::note("fill " + std::to_string(a) + " " + std::to_string(b)); }
DK_STUB void CWindowTaskDeck::switchView(int w) { em::note("view " + std::to_string(w)); }
static bool s_extraView;
DK_STUB bool CWindowTaskDeck::extraView() { return s_extraView; }

// ---- the trunk window (KabanWindowList.h)
DK_STUB CWindowTaskKabanList* g_kabanList = nullptr;
DK_STUB CWindowTaskKaban* g_kaban = nullptr;
DK_STUB uint32_t CWindowTaskKabanList::addCount(uint32_t c, int32_t n) {
    em::note("trunk +" + std::to_string(c) + " " + std::to_string(n));
    return 1;
}
DK_STUB uint32_t CWindowTaskKabanList::subCount(uint32_t c, int32_t n) {
    em::note("trunk -" + std::to_string(c) + " " + std::to_string(n));
    return 1;
}
DK_STUB void CWindowTaskKaban::resetSearch() { em::note("resetSearch"); }
DK_STUB void kabanDragEnd() { em::note("dragEnd"); }

// ---- the file lists (DeckUtil.h)
DK_STUB void CWindowModelFileList::setEnabled(bool on) { em::note(on ? "list on" : "list off"); }
DK_STUB void CWindowModelFileList::removeRow(int32_t r) { em::note("row -" + std::to_string(r)); }
DK_STUB void CWindowModelFileList::addRow(const uint16_t*) { em::note("row +"); }
DK_STUB void CWindowModelFileList::setFieldText(const char*) {}
DK_STUB void CWindowModelInputValue::setEnabled(bool on) { em::note(on ? "input on" : "input off"); }
DK_STUB bool packIsNew(const PackCatalogue*, int32_t) { return false; }

}   // namespace dk

using namespace dk;

namespace {

struct Rig {
    CDeckScene* s = new CDeckScene();
    em::FakeDeck trunk, edit;
    CWindowTaskDeck* win = new CWindowTaskDeck();
    CWindowTaskKabanList* list = new CWindowTaskKabanList();
    CWindowTaskKaban* kaban = new CWindowTaskKaban();
    int rootElem = 0;
    Rig() {
        s->trunk = reinterpret_cast<CDeckObject*>(&trunk);
        s->edit = reinterpret_cast<CDeckObject*>(&edit);
        s->busy = 0;
        s->root.setUser(s);
        s->root.task = reinterpret_cast<CElement*>(&rootElem);
        for (auto& p : s->fileList) p.setUser(s);
        for (auto& p : s->yesNo) p.setUser(s);
        for (auto& p : s->ok) p.setUser(s);
        s->input.setUser(s), s->ok158.setUser(s), s->yesNo164.setUser(s);
        g_deckWindow = win, g_kabanList = list, g_kaban = kaban;
        em::log.clear();
        em::released = em::cancelKey = em::fileExists = false;
        s_extraView = false;
        s_drag = DeckDragState();
    }
    // a trunk card let go at (x, y)
    void dropTrunk(uint32_t card, int32_t x, int32_t y) {
        s_drag.dragging = 2, s_drag.fromDeck = 1, s_drag.card = card;
        kaban->dragging = 1;
        em::released = true, em::mouseX = x, em::mouseY = y;
        s->main();
    }
    void dropDeck(int grid, uint32_t card, uint32_t index, int32_t x, int32_t y) {
        s_drag.dragging = 1, s_drag.fromDeck = 1, s_drag.grid = grid, s_drag.card = card, s_drag.index = index;
        em::released = true, em::mouseX = x, em::mouseY = y;
        s->main();
    }
};

int selftest() {
    int n = 0;
    // the drop zones: missing row takes 0x78 off the main grid; expanded moves everything down
    DropZones z = deckDropZones(false, false);
    CHECK(n, z.mainBottom == 0x1e0 && z.sideTop == 0x200 && z.sideBottom == 0x258);
    CHECK(n, deckDropZones(false, true).mainBottom == 0x168);
    DropZones ze = deckDropZones(true, false);
    CHECK(n, ze.mainBottom == 0x248 && ze.sideTop == 0x268 && ze.sideBottom == 0x2c0);
    CHECK(n, deckDropZones(true, true).mainBottom == 0x1d0);
    CHECK(n, deckDropTarget(z, false, 0x200, 0x100) == DP_MAIN);
    CHECK(n, deckDropTarget(z, false, 0x200, 0x220) == DP_SIDE);
    CHECK(n, deckDropTarget(z, false, 0x200, 0x1f0) == DP_MISSING);   // between the grids
    CHECK(n, deckDropTarget(z, false, 0x100, 0x100) == DP_MISSING);   // x bounds are exclusive
    CHECK(n, deckDropTarget(z, false, 0x2d8, 0x100) == DP_MISSING);
    CHECK(n, deckDropTarget(z, true, 0x200, 0x250) == DP_EXTRA);      // the extra grid ends at 0x258
    CHECK(n, deckDropTarget(deckDropZones(false, true), true, 0x200, 0x1f0) == DP_MISSING);
    // the rules (mazo.py: MAIN_MAX 80, side 15, EXTRA_MAX 30; fusions = frame 2/3 only in the extra deck)
    CHECK(n, deckDropAllowed(DP_MAIN, 79, 0) && !deckDropAllowed(DP_MAIN, 80, 0) && !deckDropAllowed(DP_MAIN, 0, 2));
    CHECK(n, deckDropAllowed(DP_SIDE, 14, 1) && !deckDropAllowed(DP_SIDE, 15, 1) && !deckDropAllowed(DP_SIDE, 0, 3));
    CHECK(n, deckDropAllowed(DP_EXTRA, 29, 2) && !deckDropAllowed(DP_EXTRA, 30, 3) && !deckDropAllowed(DP_EXTRA, 0, 0));

    // a trunk card onto the main grid
    {
        Rig r;
        r.dropTrunk(5, 0x200, 0x100);
        CHECK(n, r.edit.part[DP_MAIN] == std::vector<uint16_t>{5} && r.s->dirty == 1);
        CHECK(n, em::saw("win main 5") && em::saw("trunk -5 1") && em::saw("fill 0 0") && em::saw("se 15"));
        CHECK(n, em::saw("dragEnd") && em::saw("buttons 1") && s_drag.dragging == 0 && r.kaban->dragging == 0);
    }
    // a fusion is refused on main, accepted on the extra tab (fill(1, 0))
    {
        Rig r;
        r.dropTrunk(1001, 0x200, 0x100);
        CHECK(n, r.edit.part[DP_MAIN].empty() && !em::saw("se 15") && em::saw("dragEnd"));
        s_extraView = true;
        r.dropTrunk(1001, 0x200, 0x100);
        CHECK(n, r.edit.part[DP_EXTRA] == std::vector<uint16_t>{1001} && em::saw("fill 1 0"));
    }
    // a full side deck refuses; a deck card main -> side moves; side -> trunk returns it
    {
        Rig r;
        r.edit.part[DP_SIDE].assign(15, 9);
        r.dropTrunk(5, 0x200, 0x220);
        CHECK(n, r.edit.part[DP_SIDE].size() == 15);
        r.edit.part[DP_SIDE].clear();
        r.edit.part[DP_MAIN] = {4, 5};
        r.dropDeck(1, 5, 1, 0x200, 0x220);
        CHECK(n, r.edit.part[DP_MAIN] == std::vector<uint16_t>{4} && r.edit.part[DP_SIDE] == std::vector<uint16_t>{5});
        CHECK(n, em::saw("win -main 1") && em::saw("win side 5"));
        r.dropDeck(2, 5, 0, 0x300, 0x100);   // the trunk zone
        CHECK(n, r.edit.part[DP_SIDE].empty() && em::saw("trunk +5 1") && em::saw("win -side 0"));
        r.dropDeck(3, 1001, 0, 0x200, 0x100);   // an extra card dropped on the grid: put back
        CHECK(n, em::saw("cancel 3 0"));
    }
    // the save list: "new name" with 39 main cards -> errdialog; with 40 -> the input dialog
    {
        Rig r;
        CWindowModelFileList fl;
        r.s->fileList[1].task = &fl;
        r.s->busy = 1;
        r.edit.part[DP_MAIN].assign(39, 3);
        fl.sel2 = 0xfc9;
        r.s->main();
        CHECK(n, em::saw("ok") && r.s->ok158.task && em::saw("buttons 0") && em::saw("list off") && fl.sel2 == -1);
        // OK on the notice gives the list back
        static_cast<int32_t*>(static_cast<void*>(r.s->ok158.task))[0] = 4000;
        r.s->main();
        CHECK(n, !r.s->ok158.task && em::saw("list on"));
        r.edit.part[DP_MAIN].assign(40, 3);
        fl.sel2 = 0xfc9;
        r.s->main();
        CHECK(n, em::saw("input 3") && r.s->input.task != nullptr);
    }
    // the delete question from the load list: yes deletes deck\deck.ydc and its row
    {
        Rig r;
        CWindowModelFileList fl;
        r.s->fileList[0].task = &fl;
        r.s->busy = 1;
        fl.sel2 = 0xfa7;
        r.s->main();
        CHECK(n, em::saw("yesno 4") && r.s->yesNo[1].task);
        static_cast<int32_t*>(static_cast<void*>(r.s->yesNo[1].task))[0] = 4000;
        r.s->main();
        CHECK(n, em::saw("delete deck\\deck.ydc") && em::saw("row -0") && !r.s->yesNo[1].task);
    }
    // loading a deck: the old cards go back to the trunk, the loaded ones come out
    {
        Rig r;
        CWindowModelFileList fl;
        r.s->fileList[0].task = &fl;
        r.s->busy = 1;
        r.edit.part[DP_MAIN] = {1, 2};
        fl.sel2 = 0xfa2;
        r.s->main();
        CHECK(n, em::saw("trunk +1 1") && em::saw("trunk +2 1") && em::saw("file deck.ydc") && em::saw("last deck.ydc"));
        CHECK(n, em::saw("win main 7") && em::saw("trunk -8 1") && r.s->busy == 0 && !r.s->fileList[0].task);
    }
    // leaving: the deck goes to the duel deck
    {
        Rig r;
        r.s->busy = 1;
        r.edit.part[DP_MAIN] = {11};
        r.edit.part[DP_EXTRA] = {1002};
        r.s->yesNo164.task = fakeYesNo();
        static_cast<int32_t*>(static_cast<void*>(r.s->yesNo164.task))[0] = 4000;
        r.s->main();
        CHECK(n, em::saw("duel clear") && em::saw("duel 0 11") && em::saw("duel 2 1002") && em::saw("map"));
    }
    return n;
}

DeckAPart reg("entrymain", selftest, nullptr);

}   // namespace
