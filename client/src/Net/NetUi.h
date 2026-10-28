// What the Net tasks (CNetGateTask, CNetAccountTask, CNetLobbyTask, ...) need from the app and from System's UI
// classes. Each hook names the exe function or global it stands for; the game provides them (System's sprite and
// dialog classes once they exist), tests/net_cli_tasks.cpp stubs them.
//
// The UI objects are CTask subclasses System hasn't written yet (CSpriteElm, CWindowModelDialogOk), so the tasks hold
// them as CTaskPtr<CTask> (the same 12 bytes as the exe's CTaskPtr<CSpriteElm> etc.).
// TODO(System): switch to the real types and calls when they land.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

class CTask;
struct CNetGate;
struct CNetAccount;
struct CNetLobby;
struct CNetDuel;
struct CMessageIOBase;

// The app object *DAT_012711ac: its network objects (+0xc64 / +0xc68 / +0xc6c) and the window handle
// (FUN_0042cc50()->+0x1c) every connection posts its socket notifications to.
CNetGate* appNetGate();
CNetAccount* appNetAccount();
CNetLobby* appNetLobby();
uint32_t appWindowHandle();
CNetDuel* appNetDuel();                    // +0xc70
uint8_t appLanguage();                     // (*DAT_0127188c)->vtable +0xc: the language byte PSELECT sends
std::vector<uint32_t> appPSelectDeck();    // the deck object +0xc50: its card ids (count +0xcbdc, FUN_0085e1e0(i))
int32_t appClothType();                    // *(DAT_012bb6b0 + 0x448): which world's clothes the avatar wears, 0 / 1
int32_t appMyRoomArea();                   // +0xc60: a fixed My Room area, < 0 = pick one at random
// +0xc54 / +0xc58: set by whoever sees the connection drop; CCheckDisconnectTask shows the box and clears it.
struct AppDisconnect {
    uint8_t flag;     // +0xc54
    int32_t reason;   // +0xc58 1 / 2 / 3 (the box's text)
};
AppDisconnect& appDisconnect();
void appMarkDisconnected();                // *(u8*)(DAT_012bb6b0 + 0x74) = 1
// CSceneMng's fader (FUN_0061ca80) -> FUN_007dcb00(frames, arg): fade out
void appFadeOut(int32_t frames, int32_t arg);
// FUN_00a58770(rank): the avatar's world (DAT_012bb6b0 +0x448, see appClothType) for a lobby rank; the old one
// goes to +0x44c, and FUN_00a58740(+0x44c) puts it back.
void appSetWorldForRank(int32_t rank);
void appRestoreWorld();
// The deck object DAT_012b28c4 (vtable +0xd4, then its main / extra / side card ids) copied into the duel's deck
// message DAT_012bdf40 (FUN_00904d70 clears it, FUN_00904dc0 / df0 / e20 append): what duelSendMyDeck sends.
void appPrepareDuelDeck();
// FUN_00686560 (Swf): play a sound; ids 0x1xxxxxxx are sound effects (0x10000001 = the button click).
void appPlaySound(uint32_t id, int32_t arg);

// FUN_0061f260: a CSpriteElm child of parent (the layer a task draws its dialogs on).
CTask* uiCreateSpriteElm(CTask* parent, uint32_t priority);
// FUN_005e79f0 (CWindowModelDialogOk on layer at x, y, with an id) + its vtable +0x34 (text id) / +0x38 and
// FUN_005df430: open a modal "OK" message box showing string textId.
CTask* uiOpenDialogOk(CTask* layer, float x, float y, int32_t id, int32_t textId);
// The dialog's vtable +0x60: the pressed button, 4000 = OK, 0xfa1 = no; -1 while open (FUN_005e75f0 sets +0x3b0).
int32_t uiDialogResult(CTask* dialog);
// uiOpenDialogOk with the text "<string textId>(<code>)" (L"%s(%d)": the account task's unknown-error box).
CTask* uiOpenDialogOkCode(CTask* layer, float x, float y, int32_t id, int32_t textId, int32_t code);
// FUN_005e6a60: a yes/no box (4000 / 0xfa1) with string textId.
CTask* uiOpenYesNo(CTask* layer, float x, float y, int32_t textId);
// FUN_005e86d0: a CWindowModelInput1 (mode 4 = password, 1 = name) titled with string textId (FUN_006a5e40).
CTask* uiOpenInput(CTask* layer, float x, float y, int32_t mode, int32_t textId);
// The input's pressed button (+0x3dc: 0xfa2 OK / 0xfa3 cancel / -1 none), clearing it, and its text
// (FUN_006a5bf0 + FUN_006056b0 wide -> narrow).
int32_t uiInputResult(CTask* input);
void uiInputClear(CTask* input);
std::string uiInputText(CTask* input);

// The typed login, two std::strings in the game-info object DAT_012bb6b0 (+0x78 user, +0x88 password):
// FUN_006a5ea0 / FUN_006a6020 read them, FUN_006a6380 / FUN_006a6530 set them.
std::string appLoginUser();
std::string appLoginPassword();
void appSetLogin(const std::string& user, const std::string& password);

// The duel connection CNetDuel (FUN_00691050..FUN_00694460) lives on phase2-duel (src/duel/NetDuel.h), not on
// main yet: the lobby task reaches it through these. TODO(duel): call CNetDuel directly once it's merged.
CMessageIOBase& duelIo(CNetDuel* d);                                    // CNetDuel : CMessageIOBase
int32_t duelConnect(CNetDuel* d, CNetGate* gate, const char* host, uint16_t port);   // FUN_00691190
void duelSendBookedCheck(CNetDuel* d, uint32_t pid);                    // FUN_006917b0 0x6001
void duelSendWatch(CNetDuel* d);                                        // FUN_006926d0 0x6700
void duelSendMyDeck(CNetDuel* d);                                       // FUN_00692840(&DAT_012bdf40) 0x6600..
void duelSendPrepare(CNetDuel* d);                                      // FUN_00691880 0x600b
bool duelAnswered(CNetDuel* d, int n);                                  // FUN_00693190
bool duelBooked(CNetDuel* d);                                           // flags (+0x670) bit 0
uint8_t& duelSvrCode(CNetDuel* d);                                      // +0x675 the 0x649b code
uint8_t duelState(CNetDuel* d);                                         // +0x676 ND_* bits
int32_t duelLast(CNetDuel* d);                                          // +0xb8f8 last queued command, -1 = none
