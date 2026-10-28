// What src/title calls in other folders that this branch hasn't ported (tests/ui_title doubles them). Each says the
// exe function it stands for. Windows and the SWF player are CElements, the game world's UI is a CTask.
#pragma once
#include <cstdint>

#include "System/vc6.h"

class CTask;
class CElement;
struct CNetLobby;

// ---- src/Swf: CSwfEngine (the Flash-movie player) and the sound player ----
CElement* swfEngineNew(CElement* parent, uint32_t priority, const vc6::string& path, bool loop);  // 0x66d7a0
void swfEngineSetPlaying(CElement* swf, bool on);   // 0x66e390: CSwfEngine+0x3ef
bool swfEngineFinished(CElement* swf);              // CSwfEngine+0x3f1: the movie has run out
void swfEngineSetActive(CElement* swf, bool on);    // 0x66e2f0: +0x3f0, its buttons take clicks (off under a dialog)
void swfEngineSetListener(CElement* swf, CTask* t); // CSwfEngine+0x3f8 CTaskPtr<>::set (0x5ddd70): gets CTmSwfObjEvent
bool soundPlay(uint32_t id, int32_t fadeFrames);    // 0x686560: 0x1xxxxxxx sound effect, 0x2xxxxxxx BGM
enum : uint32_t { SE_OK = 0x10000001, SE_CANCEL = 0x10000002, BGM_TITLE = 0x20000000 };

// ---- src/System ----
CTask* bgCommonNew(CTask* parent, CElement* layer, int32_t bg, int32_t arg);  // CBgCommon::New 0xa0a030
// CWindowModelDialogYesNo::New (0x5e6a60): a yes/no box; result() (vf24) is `yes` or `no` once answered
CElement* dialogYesNoNew(CElement* parent, int32_t a, int32_t b, int32_t yes, int32_t no, int32_t c);
int32_t dialogResult(CElement* dlg);                     // CWindowModelDialogWithBtns vf24 (0x5e65f0)
void windowSetSize(CElement* win, float w, float h);     // CWindowTaskModel +0x388 / +0x38c (w_, h_)
void windowLayout(CElement* win);                        // CWindowTaskModel vf9
void windowSetTextId(CElement* win, int32_t textId);     // CWindowTaskModel vf13: the string table's text
void windowCentre(CElement* win);                        // CWindowTaskModel vf14
// The CSystemConfigManager (DAT_0127188c) calls.
int32_t systemLanguage();                        // vf3 (0x622b40): 0..6 JPN ENG DEU FRA ITA ESP KOR
void systemConfigSetLastLoginId(vc6::string id); // vf22
bool systemConfigSave();                         // vf0
vc6::string systemHomepageUrl();                 // vf24
void shellOpen(const char* url);                 // ShellExecuteA(0, "open", url, 0, 0, SW_SHOWNORMAL)
void appQuit();                                  // CApp (DAT_012711ac) +4 -> +4 vtable[6]: close the game window

// ---- src/duel: the scene manager's CScreenFader ----
void screenFaderFadeIn(CElement* fader, int32_t frames, int32_t z);  // 0x7dcc20 (from black)

// ---- src/Game: the world UI (DAT_012bb6b0) the title resets when you come back from the lobby ----
CTask* gameWorld();                                      // DAT_012bb6b0, null before the first login
void gameWorldEnterTitle(CTask* world);                  // 0xa58f00 (the exe calls it on a null world too)
CElement* gameWorldMenu(CTask* world);                   // 0xa564e0 CWindowModelMenu
CElement* gameWorldChat(CTask* world);                   // 0xa564b0 CChatWindow
CElement* gameWorldPlace(CTask* world);                  // 0xa565d0 CWindowModelPlace
CElement* gameWorldDuelConfig(CTask* world);             // 0xa56570 CWindowModelDuelConfig
CTask* gameWorldDuelAvatar(CTask* world);                // 0xa56630 CDuelAvaTask
void gameWorldSetKorean(CTask* world, bool korean);      // 0xa5a4d0
void chatWindowClear(CElement* chat);                    // 0x5f4680: every log line
void chatWindowSetTab(CElement* chat, int32_t tab, bool on);  // 0x5f4800
void menuWindowReset(CElement* menu);                    // 0xa7fb40
void menuWindowClose(CElement* menu);                    // 0xa7ff10
void duelAvatarClear(CTask* ava, int32_t side);          // 0x781ec0 (src/duel)
void duelRequestReset();                                 // 0x73a070: DAT_0128d02c = 0
// ---- src/Net: the app's connections ----
CNetLobby* appNetLobby();                 // CApp+0xc6c (null without an app)
void appDuelConnectionDisconnect();       // CMessageIOBase::disconnect (0x68cdf0) on CApp+0xc70

// ---- gaps in this branch's src/System ----
// The exe's CTmDestroyed is 0x18 bytes when a CTaskPtr sends it (0x6343a0): +0x14 is that CTaskPtr. src/System's
// CTmDestroyed stops at the sender (+0x10), so the pointer is asked for here (see src/title/HEADER_ISSUES.md).
class CTaskPtrBase;
class CTaskMessage;
const CTaskPtrBase* destroyedTaskPtr(const CTaskMessage* msg);
// The SWF player's button event (CTmSwfObjEvent, tag 0x13, src/Swf): +0x10 the SWF object, whose name is a string at
// +0x34c; +0x15 set when it was clicked.
const char* swfEventObjectName(const CTaskMessage* msg);
bool swfEventClicked(const CTaskMessage* msg);
// COptionDlg::New (0x7f1cb0, src/title/optionDlg.cpp, still to port): x, y, and the background image
CElement* optionDlgNew(CElement* parent, int32_t x, int32_t y, const vc6::string& background);
