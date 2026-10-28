// The externs CDeckScene::main (FUN_008df280, DeckEntryMain.cpp) needs beyond DeckEntry.h: the System dialogs,
// files, settings, the menu bar / lobby / scene machinery of the per-frame tail, and the CDeckObject vtable slots
// that take a string. Same convention as deck_a_externs.h: each names the exe function it stands for.
#pragma once
#include "DeckEntry.h"

namespace dk {

// ---- input (app+0x148)
bool mouseReleased();                                        // TODO(System) (app+0x148)->vf 0x4c: left button let go

// ---- CWindowTaskModel / dialogs (System)
void modelSetActive(void* model, bool on);                   // TODO(System) FUN_005df6d0 (+0x35c = on, then FUN_005df430)
void modelSetAlpha(void* model, float a);                    // TODO(System) FUN_008da8f0
void dialogSetPos(void* dlg, float x, float y);              // TODO(System) FUN_006a5b60 (CWindowModelDialogOk)
// TODO(System) FUN_005e6a60(parent, a, b, yesId, noId, style): a yes/no dialog
CWindowModelDialogYesNo* yesNoCreate(void* parent, int32_t a, int32_t b, int32_t yesId, int32_t noId, int32_t style);
// TODO(System) FUN_005e79f0(parent, w, h, okId, style): an OK dialog
CWindowModelDialogOk* okDialogCreate(void* parent, float w, float h, int32_t okId, int32_t style);
// TODO(Deck A) FUN_00922d20 util: new CWindowModelInputValue(parent, a, b, c, kind) at priority 10000
CWindowModelInputValue* inputValueCreate(void* parent, int32_t a, int32_t b, int32_t c, int32_t kind);
VcWString inputValueText(CWindowModelInputValue* v);         // TODO(System) FUN_00766800: the typed text

// ---- CWindowTaskListbox (System)
bool listboxHasSelection(CWindowTaskListbox* lb);            // TODO(System) FUN_005b47b0
int32_t listboxSelIndex(CWindowTaskListbox* lb);             // TODO(System) +0x3c0 (-1 = none)
VcWString listboxSelText(CWindowTaskListbox* lb);            // TODO(System) FUN_008e8810: copy of items[+0x3c0] (+0x3a0)

// ---- strings, files, settings
VcString wideToMb(const uint16_t* s);                        // TODO(System) FUN_006056b0: wcstombs into 0x100 bytes
VcWString mbToWide(const char* s);                           // TODO(System) mbstowcs into 0x100 wchar_t
VcString deckFolder();                                       // TODO(System) DAT_012714c4->FUN_00618600 (= FUN_00814f40())
void settingsSetLastDeck(const VcString& file);              // TODO(System) FUN_00814f40()->FUN_00814f60
void settingsWrite();                                        // TODO(System) FUN_00814f40()->vf 0x00
bool deckFileExists(const VcString& path);                   // TODO(System) FUN_00525dc0 + FUN_005273e0(path, "rb") == 0
void deckFileDelete(const VcString& path);                   // TODO(System) DeleteFileA (KERNEL32, IAT 0x012d5ce0)

// ---- CDeckObject slots that take a string or that DeckEntry.h names differently
void deckObjSetFile(CDeckObject* d, const VcString& file);   // TODO(System) vf 0x00 (file name, "x.ydc")
bool deckObjSetFolder(CDeckObject* d, const VcString& dir);  // TODO(System) vf 0x04 (the trunk: true = read)
void deckObjReset(CDeckObject* d);                           // TODO(System) vf 0xc8: empty every list
bool deckObjSave(CDeckObject* d);                            // TODO(System) vf 0xd0: write folder\file
bool deckObjLoad(CDeckObject* d);                            // TODO(System) vf 0xd4: read folder\file
VcString deckObjName(CDeckObject* d);                        // TODO(Deck A) FUN_008e8cc0 entry: copy of its file name
void deckSaveBegin();                                        // TODO(System) FUN_006cf0f0 on *(app+0xc6c), before a save

// ---- the recipe packs (CDeckScene+0x1a0 is DAT_012b4100, a PackCatalogue*)
PackCatalogue* appPacks();                                   // TODO(System) DAT_012b4100
void packMarkSeen(PackCatalogue* c, int32_t id, int32_t v);  // TODO(Deck B) FUN_00984350

// ---- leaving the editor ("exit" yes): copy the deck to the duel deck, back to the map
void duelDeckClear(void* deckDuel);                          // TODO(Deck) FUN_00904d70 (CDeckDuel, CDeckScene+0x88)
void duelDeckAdd(void* deckDuel, DeckPart part, uint32_t card);   // TODO(Deck) FUN_00904dc0 / FUN_00904df0 / FUN_00904e20
void bgmStop(int32_t a);                                     // TODO(System) FUN_00686780
void menuBarLeaveDeck();                                     // TODO(System) menu bar (FUN_00a564b0): +0x414 = 1, vf 0x24,
                                                             //   FUN_005f4e00(1), FUN_005f4e30
void sceneFadeOut(int32_t a, int32_t b);                     // TODO(System) FUN_0061ca80(a, b)->FUN_007dcb00 (10, 0xee4c)
void sceneReturnToMap(int32_t a);                            // TODO(System) DAT_01271790->FUN_0061c540

// ---- the per-frame tail (0x008e64bd..)
void menuTopTick();                                          // TODO(System) FUN_006a5e80()->FUN_00a564e0()->FUN_008280c0
int32_t menuBarMode();                                       // TODO(System) FUN_006a5e80()->FUN_00a564b0() +0x414
void menuBarTick();                                          // TODO(System) ...->FUN_00a564b0()->FUN_008280c0
void menuBarSetFlag(int32_t v);                              // TODO(System) ...->FUN_00a564b0()->FUN_005f4e00
void deckSceneMenuModeChanged(CDeckScene* s);                // TODO(System) FUN_008d7ec0
bool lobbyConnected();                                       // TODO(System) FUN_00742d40()->FUN_008584b0()->state() == 2
uint8_t lobbyState();                                        // TODO(System) FUN_00742d40()->FUN_008584b0()->FUN_008584d0
bool lobbySend(int32_t what);                                // TODO(System) FUN_00742d40()->FUN_008584b0()->FUN_006a5b90
bool lobbyTaskStart(CNetLobbyTask* t);                       // TODO(System) FUN_006d4630
int32_t lobbyTaskState(CNetLobbyTask* t);                    // TODO(System) +0x88 (FUN_008e8ef0)
int32_t duelSideId(int32_t side);                            // TODO(Net) CNetDuel side[side].id (FUN_008e8e60)
const char* duelSideParts(int32_t side, int32_t world);      // TODO(Net) CNetDuel side[side].parts[world] (FUN_008e8e90)
int32_t appWorld();                                          // TODO(System) FUN_006a5e80() +0x448 (FUN_008e8e40)
void avatarSetParts(int32_t side, const char* parts);        // TODO(System) FUN_0079a370
int32_t lobbyRoomKind();                                     // TODO(System) FUN_008584b0()+0x35fc (FUN_008e8ca0) +0x70
void duelSetMode(int32_t m);                                 // TODO(System) FUN_00794d90
void sceneChange(int32_t scene, int32_t a, int32_t b);       // TODO(System) FUN_00858190()->FUN_0061c280

}   // namespace dk
