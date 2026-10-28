// deckEntry.cpp (0x008da960..0x008ebb40): CDeckScene's construction, destruction and save helpers, plus the small
// inline accessors of other classes the exe emitted out of line in this file. CDeckScene::main (0x008df280) is in
// DeckEntryMain.cpp. See DeckEntry.h.
#include "DeckEntry.h"

#include "DeckEntryMain.h"
#include "DeckTables.h"

#include <cstring>

namespace dk {

uint8_t g_deckSceneAlive;   // DAT_012b1ac0
DragState* g_drag;          // DAT_012b3230: the drag-and-drop state every deck screen shares

namespace {

// the yo2 "X create failed" assert after each TaskPtr::set of the init
template <class T>
bool created(const TaskPtr<T>& p, const char* what) {
    DK_ASSERT(p.task, what);
    return p.task != nullptr;
}

template <class T>
void closeAndDestroy(TaskPtr<T>& p) {
    if (T* t = p.get()) {
        modelSetActive(t, false);
        taskDestroy(t);
    }
}

// one of the five side buttons (deck_bottonN.txt): a SwfEngine button at (0, y, 1) that reports to the scene
void makeButton(CDeckScene* s, int i, const char* file, const char* name, float y) {
    TaskPtr<CSwfEngine>& b = s->btn[i];
    b.set(swfCreate(s->root.get(), 0, VcString(file), 1));
    static const char* const kFailed[SCENE_BTN_COUNT] = {
        "SwfEngine LoadBtn create failed", "SwfEngine SaveBtn create failed", "SwfEngine RecipeBtn create failed",
        "SwfEngine ClearBtn create failed", "SwfEngine ExitBtn create failed"};
    created(b, kFailed[i]);
    CSwfEngine* e = b.get();
    if (!e) return;
    taskSetInstName(e, name);
    swfSetButton(e);
    elemSetListener(reinterpret_cast<uint8_t*>(e) + 0x3f8, s);   // its click listener (+0x3f8) is the scene
    elemSetPos3(e, 0, y, 1.0f);
}

}   // namespace

// ---------------------------------------------------------------- CDeckScene

// @yo2 0x008da960 vf03: build the editor screen and fill it from the player's decks
uint32_t CDeckScene::init() {
    root.set(elementCreate(rootParent, 10000));
    created(root, "BaseElm create failed");
    taskSetInstName(root.get(), "deckScene");
    rootParent = nullptr;

    // the background: 512 x 384 of deck_bg_01 drawn at 2x
    bg.set(spriteCreate(root.get(), 0, VcString("data/deck/deck_bg_01.png")));
    created(bg, "BG create failed");
    if (CSpriteElm* e = bg.get()) {
        taskSetInstName(e, "BG");
        spriteSetSrc(e, 0, 0, 0x200, 0x180);
        elemSetScaleX(e, 2.0f);
        elemSetScaleY(e, 2.0f);
        elemSetPos3(e, 0, 0, 0);
        spriteSetBlend(e, 2);
    }
    // the title strip ('?' = the language letter)
    title.set(spriteCreate(root.get(), 0, VcString("data/deck/deck_title_01_?.png")));
    created(title, "Title create failed");
    if (CSpriteElm* e = title.get()) {
        taskSetInstName(e, "title");
        spriteSetSrc(e, 0, 0, 0xf8, 0x28);
        elemSetPos3(e, 0, 0, 1.0f);
        spriteSetBlend(e, 2);
    }
    makeButton(this, SCENE_BTN_LOAD, "data/deck/deck_botton1.txt", "LoadBtn", 40);
    makeButton(this, SCENE_BTN_SAVE, "data/deck/deck_botton2.txt", "SaveBtn", 67);
    makeButton(this, SCENE_BTN_RECIPE, "data/deck/deck_botton3.txt", "RecipeBtn", 94);
    makeButton(this, SCENE_BTN_CLEAR, "data/deck/deck_botton4.txt", "ClearBtn", 121);
    makeButton(this, SCENE_BTN_EXIT, "data/deck/deck_botton5.txt", "ExitBtn", 148);

    // the trunk (the cards owned) and the deck being edited, both read from the deck folder
    trunk = appTrunk();
    VcString folder = deckFolder();
    deckObjPrepare(trunk);
    bool haveTrunk = deckObjSetFolder(trunk, folder);
    edit = appEditDeck();
    deckObjSetFolder(edit, deckFolder());
    deckObjSetFile(edit, settingsLastDeck());
    bool haveDeck = deckObjCount(edit, DP_MAIN) || deckObjCount(edit, DP_SIDE) || deckObjCount(edit, DP_EXTRA) ||
                    deckObjLoad(edit);

    cardPicsPrepare(root.get());
    loader.set(cardLoaderCreate(root.get(), 0, 0));
    created(loader, "Deck CardLoader create failed");
    taskSetInstName(loader.get(), "cardLoader");

    detail.set(detailDlgCreate(root.get(), 0, 0x260, 0));
    created(detail, "Detal create failed");   // sic
    taskSetInstName(detail.get(), "detail");
    detailDlgHide(detail.get());

    kabanModel.set(modelKabanCreate(root.get(), detail.get(), 0, 0, 0, 1));
    created(kabanModel, "Kaban create failed");
    taskSetInstName(kabanModel.get(), "kabanWindow");
    // the model keeps the detail dialog at +0x3a4 (a pointer: 32 bits in the exe)
    deckModel.set(modelDeckCreate(root.get(), (int32_t)(intptr_t)detail.get(), 0, 0, 1));
    created(deckModel, "Deck create failed");
    taskSetInstName(deckModel.get(), "deckWindow");

    fillFromDecks(haveTrunk, haveDeck);
    g_deckWindow->fill(0, 0);
    g_deckWindow->switchView(0);

    busy = 0;
    packs = appPacks();
    packsRefresh();
    f1bc = 0;
    lobby.set(deckLobbyCreate(this));
    if (!lobby.task) {
        DK_ASSERT(false, "CNetLobbyTask task create failed");
        return 0;
    }
    taskSetInstName(lobby.get(), "DECK CNetLobbyTask");

    sceneMenuForDeck(appSceneId());
    soundPlay(0x20000001, 0);
    sceneFadeIn(10, 0xee4c);
    return 1;
}

// The trunk window gets every card's count; the deck grids get the deck's cards, each taken out of the trunk count
// (the missing-cards grid lists cards the trunk doesn't have, so it doesn't count them).
void CDeckScene::fillFromDecks(bool haveTrunk, bool haveDeck) {
    if (haveTrunk) {
        for (uint32_t card = 1; card <= 0xcb8; card++) g_kabanList->all.push((int32_t)card, trunkCount(trunk, card));
        g_kabanList->applyCategory();
        g_kabanList->setRowCount(9);
        g_kaban->setNumber(trunkTotal(trunk));
    }
    g_deckWindow->clearAll();
    if (!haveDeck) return;
    const DeckPart parts[3] = {DP_MAIN, DP_SIDE, DP_EXTRA};
    for (DeckPart p : parts) {
        for (int i = 0; i < deckObjCount(edit, p); i++) {
            uint32_t card = deckObjCards(edit, p)[i];
            if (p == DP_MAIN) g_deckWindow->addMain(card);
            else if (p == DP_SIDE) g_deckWindow->addSide(card);
            else g_deckWindow->addExtra(card);
            g_kabanList->subCount(card, 1);
        }
    }
    for (int i = 0; i < deckObjCount(edit, DP_MISSING); i++) g_deckWindow->addMissing(deckObjCards(edit, DP_MISSING)[i]);
    g_deckWindow->rebuild();
}

// @yo2 0x008e8f10 vf05: the scene ends; destroying the root element takes every sprite and window with it
void CDeckScene::exit() {
    if (root.task) taskDestroy(root.get());
}

// @yo2 0x008e8f60 destructor body: the members in reverse order, then the CSceneTask base
void CDeckScene::destruct() {
    g_deckSceneAlive = 0;
    lobby.~TaskPtr();
    loader.~TaskPtr();
    sorterDestroy(sorter);
    fileName.~VcString();
    for (int i = 2; i >= 0; i--) ok[i].~TaskPtr();
    yesNo164.~TaskPtr();
    ok158.~TaskPtr();
    input.~TaskPtr();
    for (int i = 2; i >= 0; i--) yesNo[i].~TaskPtr();
    for (int i = 2; i >= 0; i--) fileList[i].~TaskPtr();
    kabanModel.~TaskPtr();
    deckModel.~TaskPtr();
    detail.~TaskPtr();
    for (int i = SCENE_BTN_COUNT - 1; i >= 0; i--) btn[i].~TaskPtr();
    bg.~TaskPtr();
    title.~TaskPtr();
    root.~TaskPtr();
    sceneTaskDestruct(this);
}

// @yo2 0x008e89e0
void CDeckScene::setBusy(uint8_t on) { busy = on; }

// @yo2 0x008e9210 the deck was written as `file`: remember it as the last deck, close the question (and the name
// input when it was a "save as"), then show "saved"
void CDeckScene::saveDone(VcString file) {
    settingsSetLastDeck(file);
    settingsWrite();
    dirty = 0;
    closeAndDestroy(yesNo[2]);
    if (saveMode == 1) closeAndDestroy(input);
    saveSuccess();
}

// @yo2 0x008e97a0 "overwrite?" said no: forget the name, back to the save list (or the name input)
void CDeckScene::saveCancel() {
    fileName.clear();
    deckObjSetFile(edit, fileName);
    closeAndDestroy(yesNo[2]);
    if (CWindowModelFileList* fl = fileList[1].task ? fileList[1].get() : nullptr) {
        fl->setEnabled(true);
        modelSetActive(fl, true);
    }
    if (saveMode != 1) {
        busy = 0;
        sceneSetButtonsEnabled(true);
        return;
    }
    modelSetActive(input.get(), true);
}

// @yo2 0x008e9d40 the "saved" notice (text 0x11ac) in a 500 x 116 OK dialog
void CDeckScene::saveSuccess() {
    ok[0].set(okDialogCreate(root.get(), 0, 0, 0xfa2, 0));
    CWindowModelDialogOk* d = ok[0].task ? ok[0].get() : nullptr;
    if (!d) return;
    dialogOpen(d);
    taskSetInstName(d, "savesuccessdialog");
    dialogSetText(d, uiText(0x11ac).c_str());
    dialogSetSize(d, 500.0f, 116.0f);
    dialogSetTextScale(d, 1.0f);
    dialogSetColor(d, 1.0f, 1.0f, 1.0f, 1.0f);
    dialogLayout(d);
    busy = 1;
    sceneSetButtonsEnabled(false);
    modelSetActive(d, true);
}

// ---------------------------------------------------------------- inline accessors emitted in this file

// @yo2 0x008e8430 the shared drag state (DAT_012b3230)
DeckDragState* deckDragState() { return reinterpret_cast<DeckDragState*>(g_drag); }
static_assert(offsetof(DragState, state) == offsetof(DeckDragState, dragging) &&
                  offsetof(DragState, from) == offsetof(DeckDragState, fromDeck) &&
                  offsetof(DragState, card) == offsetof(DeckDragState, card),
              "the two stand-ins of DAT_012b3230 must agree");
// @yo2 0x008e8450
int32_t dragState(const DeckDragState* d) { return d->dragging; }
// @yo2 0x008e8470
int32_t dragFrom(const DeckDragState* d) { return d->fromDeck; }
// @yo2 0x008e8490
int32_t dragGrid(const DeckDragState* d) { return d->grid; }
// @yo2 0x008e84b0
uint32_t dragCard(const DeckDragState* d) { return d->card; }
// @yo2 0x008e84d0
uint32_t dragIndex(const DeckDragState* d) { return d->index; }
// @yo2 0x008e84f0 the drop is over
void dragClear(DeckDragState* d) { d->dragging = d->fromDeck = d->grid = 0, d->card = d->index = 0; }

// @yo2 0x008e8520 CWindowModelInputValue +0x404: the button that closed it (-1 = none)
int32_t inputValueResult(const CWindowModelInputValue* v) {
    int32_t r;
    std::memcpy(&r, reinterpret_cast<const uint8_t*>(v) + 0x404, 4);
    return r;
}
// @yo2 0x008e8540
void inputValueResetResult(CWindowModelInputValue* v) {
    int32_t r = -1;
    std::memcpy(reinterpret_cast<uint8_t*>(v) + 0x404, &r, 4);
}

// @yo2 0x008e8560 the file list's listbox has a selected row
bool fileListHasSelection(CWindowModelFileList* fl) { return listboxHasSelection(fl->list.get()); }
// @yo2 0x008e8590 its selected row (-1 = none)
int32_t fileListSelIndex(CWindowModelFileList* fl) { return listboxSelIndex(fl->list.get()); }
// @yo2 0x008e85c0 the selected row's text
VcWString fileListSelText(CWindowModelFileList* fl) { return listboxSelTextOf(fl->list.get()); }

// @yo2 0x008e8810 CWindowTaskListbox: a copy of items[sel] (vector<wstring> at +0x39c, selection at +0x3c0)
VcWString listboxSelTextOf(const CWindowTaskListbox* lb) {
    const ListboxView* v = reinterpret_cast<const ListboxView*>(lb);
    if (v->sel < 0 || (size_t)v->sel >= v->items.size()) return VcWString();   // fix: the exe doesn't check
    return v->items[(size_t)v->sel];
}

// @yo2 0x008e89a0 CWindowModelFileList +0x4e4: the button that closed it (-1 = none)
int32_t fileListResult(const CWindowModelFileList* fl) { return fl->sel2; }
// @yo2 0x008e89c0
void fileListResetResult(CWindowModelFileList* fl) { fl->sel2 = -1; }

// @yo2 0x008e8a00 DAT_012b35b8
CWindowTaskDeck* deckWindow() { return g_deckWindow; }
// @yo2 0x008e8a20
bool deckWindowExpanded(const CWindowTaskDeck* w) { return w->expanded != 0; }
// @yo2 0x008e8a40
int32_t deckWindowMissing(const CWindowTaskDeck* w) { return w->missingCount; }
// @yo2 0x008e8a60 DAT_012b3980
CWindowTaskKabanList* kabanList() { return g_kabanList; }
// @yo2 0x008e8a80 DAT_012b3988
CWindowTaskKaban* kabanWindow() { return g_kaban; }
// @yo2 0x008e8aa0 CWindowTaskKaban +0x420: a trunk card is being dragged out
void kabanSetDragging(CWindowTaskKaban* k, uint8_t on) { k->dragging = on; }
// @yo2 0x008e8ac0
uint8_t kabanDragging(const CWindowTaskKaban* k) { return k->dragging; }

// @yo2 0x008e8ae0 PackEntry +0x28: the pack's description (a copy)
VcString packText(const PackEntry* p) { return *reinterpret_cast<const VcString*>(reinterpret_cast<const uint8_t*>(p) + 0x28); }
// @yo2 0x008e8c60 PackEntry +0x4: its type (1 booster, 4 structure deck)
int32_t packType(const PackEntry* p) { return p->type; }
// @yo2 0x008ea9e0 PackCatalogue: packs[i] (0x6c each)
PackEntry* packAt(PackCatalogue* c, int32_t i) { return c->packs.first + i; }

// @yo2 0x008e8c80 +0x70 of the lobby room record (FUN_008e8ca0's)
int32_t roomKind(const void* room) { return field<int32_t>(room, 0x70); }
// @yo2 0x008e8ca0 the lobby's room record (+0x35fc)
void* lobbyRoom(void* lobby) { return reinterpret_cast<uint8_t*>(lobby) + 0x35fc; }
// @yo2 0x008e8cc0 CDeckManager +0x5ac: the deck's file name (a copy)
VcString deckFileName(const void* deckMgr) {
    return *reinterpret_cast<const VcString*>(reinterpret_cast<const uint8_t*>(deckMgr) + 0x5ac);
}
// @yo2 0x008e8e40 +0x448: the world (0 Domino, 1 Academia) of FUN_006a5e80's object
int32_t worldOf(const void* app) { return field<int32_t>(app, 0x448); }
// @yo2 0x008e8e60 CNetDuel side[i].id (+0x548, 0x94 each)
int32_t netDuelSideId(const void* nd, int32_t side) { return field<int32_t>(nd, 0x548 + side * 0x94); }
// @yo2 0x008e8e90 CNetDuel side[side].parts[world] (+0x574, 17 bytes each)
const char* netDuelSideParts(const void* nd, int32_t side, int32_t world) {
    return reinterpret_cast<const char*>(nd) + 0x574 + side * 0x94 + world * 0x11;
}
// @yo2 0x008e8ed0 the app's input object (+0x148)
void* appInputOf(void* app) { return reinterpret_cast<uint8_t*>(app) + 0x148; }
// @yo2 0x008e8ef0 CNetLobbyTask +0x88: its state
int32_t lobbyTaskStateOf(const void* t) { return field<int32_t>(t, 0x88); }
// @yo2 0x008e8410 +0x414: the menu bar's mode
int32_t menuBarModeOf(const void* bar) { return field<int32_t>(bar, 0x414); }
// @yo2 0x008ea440 a wide string's length
size_t wideLength(const VcWString& s) { return s.len; }

// The is-it-set peeks of CTaskPtr<T> the exe emitted here (dynamic_cast of the task, no liveness assert):
//   @yo2 0x008ea8c0 CWindowModelFileList   @yo2 0x008ea8f0 @yo2 0x008ea920 CWindowModelDialogYesNo
//   @yo2 0x008ea950 @yo2 0x008ea980 CWindowModelInputValue   @yo2 0x008ea9b0 CWindowModelDialogOk
template <class T>
T* peek(const TaskPtr<T>& p) {
    return p.task;
}
template CWindowModelFileList* peek(const TaskPtr<CWindowModelFileList>&);
template CWindowModelDialogYesNo* peek(const TaskPtr<CWindowModelDialogYesNo>&);
template CWindowModelInputValue* peek(const TaskPtr<CWindowModelInputValue>&);
template CWindowModelDialogOk* peek(const TaskPtr<CWindowModelDialogOk>&);

// ---------------------------------------------------------------- this file's static initializers
// DeckTables.h's three tables (kLanguageNames, kCountryCodes, kDigitNames), included above:
//   @yo2 0x008eb030 (System: 0x8eb050) (System: 0x8eb3b0) @yo2 0x008eb3d0 languages: init stub, init, atexit, destructor
//   @yo2 0x008eb400 (System: 0x8eb420) (System: 0x8eb740) @yo2 0x008eb760 countries
//   @yo2 0x008eb790 (System: 0x8eb7b0) (System: 0x8ebb40) @yo2 0x008ebb60 digits
// A guarded header static (bit 0 of DAT_012d3501) whose atexit destructor is the thunk at 0x00410564:
//   @yo2 0x008eafe0 @yo2 0x008eb010
struct GuardedHeaderStatic {
    GuardedHeaderStatic() = default;
    ~GuardedHeaderStatic() {}
};
[[maybe_unused]] static GuardedHeaderStatic s_guarded;

}   // namespace dk
