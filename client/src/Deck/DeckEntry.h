// deckEntry.cpp (0x008da960..0x008ebb40): CDeckScene, the deck editor scene. It builds the screen (background,
// title, the five side buttons, the card detail dialog, the trunk window and the deck window), fills both from the
// player's deck objects, then runs every frame: the open dialog (save as / overwrite / delete / load / clear /
// exit / recipe), and the drag-and-drop of cards between the trunk ("kaban") and the deck grids.
//
// The deck rules the scene enforces on a drop (FUN_008df280) are the ones YOLaucher's mazo.py documents:
// main < 80 and side < 15 for non-fusions, extra < 30 for fusions (card frame 2/3), and only from the trunk.
//
// Layout-true stand-in (see DeckCommon.h); the windows it drives are the other part-A classes (DeckWindow.h,
// KabanWindowList.h, DeckUtil.h). The player's deck objects (CDeckObject, System) are reached through the externs
// below, named after their vtable slots.
#pragma once
#include "DeckUtil.h"
#include "DeckWindow.h"
#include "KabanWindowList.h"

namespace dk {

struct CDeckObject;   // the deck file object (System, yo2DeckObject.cpp): a vtable of counts / lists / edits

// ---------------------------------------------------------------- the deck rules of a drop (FUN_008df280)
enum DeckPart : int32_t { DP_MAIN = 0, DP_SIDE = 1, DP_EXTRA = 2, DP_MISSING = 3 };
enum : int32_t {
    DECK_MAIN_MAX = 80,    // a drop on the main grid needs count < 0x50
    DECK_SIDE_MAX = 15,    // side < 0xf
    DECK_EXTRA_MAX = 30,   // extra < 0x1e
};
// A card with frame 2 or 3 (FUN_0073c010: fusion) goes only to the extra deck; anything else only to main/side.
inline bool frameIsFusion(int32_t frame) { return frame == 2 || frame == 3; }
// May a card of this frame be dropped on `part` when it holds `count` cards (the checks of FUN_008df280)?
inline bool deckDropAllowed(DeckPart part, int32_t count, int32_t frame) {
    switch (part) {
    case DP_MAIN: return count < DECK_MAIN_MAX && !frameIsFusion(frame);
    case DP_SIDE: return count < DECK_SIDE_MAX && !frameIsFusion(frame);
    case DP_EXTRA: return count < DECK_EXTRA_MAX && frameIsFusion(frame);
    default: return false;
    }
}

// The drop zones (screen pixels) the frame handler hit-tests while a trunk card is dragged (FUN_008df280).
// x must be in (0x100, 0x2d8); the main grid spans y in (0x58, mainBottom), the side grid (sideTop, sideBottom).
struct DropZones {
    int32_t mainBottom;   // edi: 0x1e0, 0x168 with the missing-cards row; expanded 0x248 / 0x1d0
    int32_t sideTop;      // ebx: 0x200, or 0x268 when the main grid is expanded
    int32_t sideBottom;   // 0x258, 0x2c0 expanded (the missing row doesn't change it)
};
DropZones deckDropZones(bool expanded, bool missingRow);
DeckPart deckDropTarget(const DropZones& z, bool extraView, int32_t x, int32_t y);   // DP_MISSING = nowhere

// ---------------------------------------------------------------- System / app externs only deckEntry uses
// CDeckObject vtable (the edited deck, CDeckScene+0x84; the trunk at +0x80 is one too). Counts are u8 in the exe.
// The string slots (vf 0x00 setFile, vf 0x04 setFolder, vf 0xd0 save, vf 0xd4 load) are in DeckEntryMain.h.
// In the exe the object is a CDeckManager (vtable 0x00bef2b4; the trunk is a CKabanManager). Per-part slots:
// count 0x009065f0/0x00906610/0x00906630/0x00906650, cards 0x00906790/0x009068a0/0x009069b0/0x00906ac0,
// add 0x00907350/0x00907430/0x00907510, remove 0x00907970/0x00907a30/0x00907af0.
uint8_t deckObjCount(CDeckObject* d, DeckPart part);        // 0x009065f0 TODO(System) vf 0x38 / 0x3c / 0x40 / 0x44
const uint16_t* deckObjCards(CDeckObject* d, DeckPart part);   // 0x00906790 TODO(System) vf 0x6c / 0x80 / 0x94 / 0xa8
bool deckObjAdd(CDeckObject* d, DeckPart part, uint32_t card, CDeckObject* trunk);  // 0x00907350 TODO(System) vf+8/c/10
bool deckObjRemove(CDeckObject* d, DeckPart part, uint32_t card);   // 0x00907970 TODO(System) vf 0x28 / 0x2c / 0x30
void deckObjClear(CDeckObject* d);  // 0x00906d90 CDeckManager; TODO(System) vf 0xcc: empty the missing-cards list
void deckObjPrepare(CDeckObject* trunk);                    // TODO(System) FUN_00815350 (before reading the trunk)
// The trunk's per-card record: 3 bytes per card id from offset 9 (count first), read inline by the init.
inline uint8_t trunkCount(const CDeckObject* trunk, uint32_t card) {
    return reinterpret_cast<const uint8_t*>(trunk)[(card + 3) * 3];
}
int32_t trunkTotal(const CDeckObject* trunk);  // inline in the exe (in 0x008da960) TODO(System) trunk +0x4: the total
CDeckObject* appTrunk();  // inline in the exe (in 0x008da960); TODO(System) DAT_012714b4: the player's trunk deck
CDeckObject* appEditDeck();  // inline in the exe (in 0x008da960); TODO(System) DAT_012b28c4: the deck being edited
VcString settingsLastDeck();                                // TODO(System) FUN_00814f40()->FUN_00815110: last deck file

// The scene machinery
CElement* elementCreate(void* parent, int32_t prio);        // TODO(System) FUN_0060e2c0 (new CElement 0x340)
CDeckCardLoader* cardLoaderCreate(void* parent, int32_t a, int32_t b);   // TODO(Deck A) FUN_009223f0 util
void cardPicsPrepare(void* parent);                         // TODO(System) FUN_007d8800
CCardDetailViewDlg* detailDlgCreate(void* parent, int32_t a, int32_t w, int32_t b);   // TODO(System) FUN_0075cc10
void detailDlgHide(CCardDetailViewDlg* d);                  // TODO(System) FUN_005f7860
CNetLobbyTask* deckLobbyCreate(void* owner);                // TODO(System) FUN_006d14e0
void swfSetButton(CSwfEngine* s);                           // TODO(System) FUN_0066e390 (button mode)
void sceneSetButtonsEnabled(bool on);                       // TODO(System) FUN_008d7b70 (5 buttons + windows)
// TODO(System) the menu-bar calls at the end of the init (DAT_012bb6b0: FUN_00a564e0/FUN_00a564b0/FUN_00a565d0/
// FUN_00a56630 objects): tick the top menu, show the bar in deck mode, and for scene 0xc / 8 set its buttons
void sceneMenuForDeck(uint8_t sceneId);
uint8_t appSceneId();  // inline in the exe (in 0x008da960); TODO(System) *(*(DAT_012711ac+0xc6c)+0x9ed)
void sceneFadeIn(int32_t a, int32_t b);                     // TODO(System) FUN_0061ca80(a, b)->FUN_007dcc20 (10, 0xee4c)
void packsRefresh();                                        // TODO(System) FUN_00983e20 (the pack catalogue)
void elemDestroyTree(void* root);                           // TODO(System) FUN_0063d280 + CTask::destroy
// dialogs (CWindowModelDialogOk / YesNo, System): result 4000 = OK / yes, 0xfa1 = no / cancel
int32_t dialogResult(void* dlg);                            // 0x005e65f0 TODO(System) vf 0x60
void dialogClose(void* dlg);                                // TODO(System) FUN_005df6d0
void dialogOpen(void* dlg);                                 // TODO(System) FUN_005df430
void dialogSetText(void* dlg, const uint16_t* text);        // 0x005e64e0 TODO(System) vf 0x30
void dialogLayout(void* dlg);                               // 0x005df4f0 TODO(System) vf 0x38
const VcWString& uiText(int32_t id);                        // 0x0061fb80 TODO(System) (*DAT_01271840)->vf1(id)
bool keyEnterPressed();                                     // 0x00607720 CMyMouseEx; TODO(System) (app+0x148)->vf 0x48

// ---- also declared (same signatures) by DeckParts.h, which deckEntry doesn't include
void elemSetScaleX(void* e, float sx);  // inline in the exe (in 0x008da960); TODO(System) CElement +0x88
void elemSetScaleY(void* e, float sy);  // inline in the exe (in 0x008da960); TODO(System) CElement +0x8c
void elemSetListener(void* e, void* mediator);              // TODO(System) FUN_005ddd70: clicks on e go to mediator
CSwfEngine* swfCreate(void* parent, int32_t prio, const VcString& path, int32_t flag);   // TODO(System) FUN_0066d7a0
// ---- the rest of what CDeckScene's own functions call
void sorterDestroy(void* obj);                              // TODO(Deck A) FUN_009215d0 util (the object at +0x1c0)
void sceneTaskDestruct(void* scene);                        // TODO(System) FUN_00629530 the CSceneTask/CTask base
void dialogSetSize(void* dlg, float w, float h);  // inline in the exe (in 0x008e9d40) TODO(System) +0x388/c, vf 0x24
void dialogSetTextScale(void* dlg, float s);  // 0x00595010 TODO(System) (*(dlg+0x398))->vf 0x24(s), its frame
void dialogSetColor(void* dlg, float r, float g, float b, float a);   // TODO(System) FUN_005e5630

// A field of an object the exe reads inline at a fixed offset.
template <class T>
T field(const void* obj, size_t off) {
    T v;
    std::memcpy(&v, static_cast<const uint8_t*>(obj) + off, sizeof v);
    return v;
}
// CWindowTaskListbox as far as deckEntry reads it: its rows (vector<wstring> at +0x39c) and selection (+0x3c0).
struct ListboxView {
    uint8_t _0[0x39c];
    VcVector<VcWString> items;   // 0x39c
    uint8_t _3ac[0x3c0 - 0x3ac];
    int32_t sel;                 // 0x3c0 -1 = none
};
YO2_AT(ListboxView, items, 0x39c);
YO2_AT(ListboxView, sel, 0x3c0);

// The inline accessors of other classes the exe emitted in deckEntry.cpp (DeckEntry.cpp).
DeckDragState* deckDragState();                             // 0x008e8430
int32_t dragState(const DeckDragState* d);                  // 0x008e8450
int32_t dragFrom(const DeckDragState* d);                   // 0x008e8470
int32_t dragGrid(const DeckDragState* d);                   // 0x008e8490
uint32_t dragCard(const DeckDragState* d);                  // 0x008e84b0
uint32_t dragIndex(const DeckDragState* d);                 // 0x008e84d0
void dragClear(DeckDragState* d);                           // 0x008e84f0
int32_t inputValueResult(const CWindowModelInputValue* v);  // 0x008e8520
void inputValueResetResult(CWindowModelInputValue* v);      // 0x008e8540
bool fileListHasSelection(CWindowModelFileList* fl);        // 0x008e8560
int32_t fileListSelIndex(CWindowModelFileList* fl);         // 0x008e8590
VcWString fileListSelText(CWindowModelFileList* fl);        // 0x008e85c0
VcWString listboxSelTextOf(const CWindowTaskListbox* lb);   // 0x008e8810
int32_t fileListResult(const CWindowModelFileList* fl);     // 0x008e89a0
void fileListResetResult(CWindowModelFileList* fl);         // 0x008e89c0
CWindowTaskDeck* deckWindow();                              // 0x008e8a00
bool deckWindowExpanded(const CWindowTaskDeck* w);          // 0x008e8a20
int32_t deckWindowMissing(const CWindowTaskDeck* w);        // 0x008e8a40
CWindowTaskKabanList* kabanList();                          // 0x008e8a60
CWindowTaskKaban* kabanWindow();                            // 0x008e8a80
void kabanSetDragging(CWindowTaskKaban* k, uint8_t on);     // 0x008e8aa0
uint8_t kabanDragging(const CWindowTaskKaban* k);           // 0x008e8ac0
VcString packText(const PackEntry* p);                      // 0x008e8ae0
int32_t packType(const PackEntry* p);                       // 0x008e8c60
PackEntry* packAt(PackCatalogue* c, int32_t i);             // 0x008ea9e0
int32_t roomKind(const void* room);                         // 0x008e8c80
void* lobbyRoom(void* lobby);                               // 0x008e8ca0
VcString deckFileName(const void* deckMgr);                 // 0x008e8cc0
int32_t worldOf(const void* app);                           // 0x008e8e40
int32_t netDuelSideId(const void* nd, int32_t side);        // 0x008e8e60
const char* netDuelSideParts(const void* nd, int32_t side, int32_t world);   // 0x008e8e90
void* appInputOf(void* app);                                // 0x008e8ed0
int32_t lobbyTaskStateOf(const void* t);                    // 0x008e8ef0
int32_t menuBarModeOf(const void* bar);                     // 0x008e8410
size_t wideLength(const VcWString& s);                      // 0x008ea440

// ---------------------------------------------------------------- CDeckScene (0x1f8)
enum : int32_t { SCENE_BTN_LOAD, SCENE_BTN_SAVE, SCENE_BTN_RECIPE, SCENE_BTN_CLEAR, SCENE_BTN_EXIT, SCENE_BTN_COUNT };

struct CDeckScene {
    uint8_t task_[0x70];                          // CEasyTask (CTask + the easy-task state)
    void* rootParent;                             // 0x70 CSceneTask: where the root element goes (0 after init)
    TaskPtr<CElement> root;                       // 0x74 "deckScene": every sprite and window hangs off it
    CDeckObject* trunk;                           // 0x80 DAT_012714b4: the cards the player owns
    CDeckObject* edit;                            // 0x84 DAT_012b28c4: the deck being edited
    uint32_t deckDuel;                            // 0x88 CDeckDuel (vtable only)
    TaskPtr<CSpriteElm> title;                    // 0x8c data/deck/deck_title_01_?.png
    TaskPtr<CSpriteElm> bg;                       // 0x98 data/deck/deck_bg_01.png
    TaskPtr<CSwfEngine> btn[SCENE_BTN_COUNT];     // 0xa4 Load, Save, Recipe, Clear, Exit (deck_botton1..5)
    TaskPtr<CCardDetailViewDlg> detail;           // 0xe0
    TaskPtr<CWindowModelDeck> deckModel;          // 0xec
    TaskPtr<CWindowModelKaban> kabanModel;        // 0xf8
    TaskPtr<CWindowModelFileList> fileList[3];    // 0x104 load, save, recipe (packs)
    TaskPtr<CWindowModelDialogYesNo> yesNo[3];    // 0x128 exit?, clear?, save: overwrite?
    TaskPtr<CWindowModelInputValue> input;        // 0x14c the save-as name
    TaskPtr<CWindowModelDialogOk> ok158;          // 0x158
    TaskPtr<CWindowModelDialogYesNo> yesNo164;    // 0x164 delete?
    TaskPtr<CWindowModelDialogOk> ok[3];          // 0x170 save success, 0x17c, 0x188
    uint8_t busy;                                 // 0x194 a dialog is up: no drag-and-drop
    uint8_t _195[3];
    uint32_t f198;
    uint8_t dirty;                                // 0x19c the deck changed since the last save
    uint8_t _19d[3];
    PackCatalogue* packs;                         // 0x1a0 DAT_012b4100 at init (the recipe packs)
    uint32_t f1a4;                                // the recipe list's last shown pack
    int32_t saveMode;                             // 0x1a8 0 = save as (file list 0x110), 1 = overwrite (input 0x14c)
    VcString fileName;                            // 0x1ac the deck file being saved
    uint8_t f1bc;
    uint8_t _1bd[3];
    uint8_t sorter[0x18];                         // 0x1c0 TODO(Deck A) embedded object, dtor FUN_009215d0 (util)
    TaskPtr<CDeckCardLoader> loader;              // 0x1d8 "cardLoader"
    TaskPtr<CNetLobbyTask> lobby;                 // 0x1e4 "DECK CNetLobbyTask"
    uint32_t f1f0;
    uint8_t _1f4[4];

    void construct();          // the members' own constructors (the ctor proper is 0x008d7xxx, System)
    void destruct();           // 0x008e8f60
    uint32_t init();           // 0x008da960 vf03
    uint32_t main();           // 0x008df280 vf04 (DeckEntryMain.cpp)
    void exit();               // 0x008e8f10 vf05: destroy the root element (and with it the whole screen)
    void saveDone(VcString file);  // 0x008e9210 saved as `file`: remember it, close the dialogs, say so
    void saveCancel();         // 0x008e97a0 the overwrite question was declined
    void saveSuccess();        // 0x008e9d40 the "saved" OK dialog
    void setBusy(uint8_t on);  // 0x008e89e0
    void fillFromDecks(bool haveTrunk, bool haveDeck);   // a piece of init: trunk counts, deck grids
};
YO2_AT(CDeckScene, rootParent, 0x70);
YO2_AT(CDeckScene, root, 0x74);
YO2_AT(CDeckScene, trunk, 0x80);
YO2_AT(CDeckScene, edit, 0x84);
YO2_AT(CDeckScene, title, 0x8c);
YO2_AT(CDeckScene, bg, 0x98);
YO2_AT(CDeckScene, btn, 0xa4);
YO2_AT(CDeckScene, detail, 0xe0);
YO2_AT(CDeckScene, deckModel, 0xec);
YO2_AT(CDeckScene, kabanModel, 0xf8);
YO2_AT(CDeckScene, fileList, 0x104);
YO2_AT(CDeckScene, yesNo, 0x128);
YO2_AT(CDeckScene, input, 0x14c);
YO2_AT(CDeckScene, ok158, 0x158);
YO2_AT(CDeckScene, yesNo164, 0x164);
YO2_AT(CDeckScene, ok, 0x170);
YO2_AT(CDeckScene, busy, 0x194);
YO2_AT(CDeckScene, dirty, 0x19c);
YO2_AT(CDeckScene, packs, 0x1a0);
YO2_AT(CDeckScene, saveMode, 0x1a8);
YO2_AT(CDeckScene, fileName, 0x1ac);
YO2_AT(CDeckScene, f1bc, 0x1bc);
YO2_AT(CDeckScene, sorter, 0x1c0);
YO2_AT(CDeckScene, loader, 0x1d8);
YO2_AT(CDeckScene, lobby, 0x1e4);
YO2_SIZEOF(CDeckScene, 0x1f8);

extern uint8_t g_deckSceneAlive;   // DAT_012b1ac0, cleared by the destructor

}   // namespace dk
