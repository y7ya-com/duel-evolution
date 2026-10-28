// yo2LobbyError.cpp: the lobby scene's error state (FUN_00884b70). It opens a CWindowModelDialogError with the
// message for the scene's error code, keeps the screen fader hidden while it's up, and once it's answered goes to
// the scene's next state (opening the error's web page first, for the one error that has one).
//
// It's a method of the lobby scene in the exe; the scene class is written elsewhere, so this is a template over it.
// What it needs from Scene (the exe's offsets):
//   CElement* baseElement()                 CSceneTask's base element (+0x74)
//   int32_t stateFrames                     +0x90 frames in the current state
//   int32_t errorCode                       +0x94 what the dialog explains
//   int32_t prevState, state, nextState     +0x98 / +0x9c / +0xa0
//   int32_t errChoice                       +0xb4 the dialog's answer, -1 until then (set by onErrorDialog)
//   CTaskPtr<T> errDlg                      +0x144 CTaskPtr<CWindowModelDialogError>, T: CWindowModelDialogWithBtns or below
//   vc6::string errUrl                      +0x254 opened after the dialog when set
//   int onErrorDialog(CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, intptr_t)   the dialog's callback (0x00863340)
//   void errorClosed()                      the player list's +0x13f0 = 1 (CTaskPtr<CPlayerListDlg> at +0x10c)
#pragma once
#include <cstdio>

#include "System/vc6.h"
#include "System/window/yo2WindowDialogs.h"
#include "System/window/yo2WindowTask.h"

// CWindowModelDialogError::create (0x005f7b90; on phase2-game's window dialogs, not on this branch yet).
CWindowModelDialogWithBtns* windowModelDialogErrorCreate(CTask* parent);
// (*DAT_0127188c)->vf25: the page error -612 sends the player to (and its message shows).
vc6::string lobbyErrorUrl();
// CSceneMng::fader() (0x0061ca80) -> FUN_007dcda0: hide the screen fader.
void screenFaderHide();
// FUN_00a56630(1) -> FUN_00781ec0(1), when the error sends the scene back to its main state (0xb).
void lobbyErrorBackToMain();
// ShellExecuteA(nullptr, "open", url, nullptr, nullptr, SW_SHOWNORMAL)
void lobbyShellOpen(const char* url);

// The message for a lobby error code (the switch of FUN_00884b70): a string, or "<string>(<code>)"; -612 is
// "<string>\n\n<url>" and sets *url to lobbyErrorUrl().
vc6::string lobbyErrorMessage(int32_t code, vc6::string* url);

enum { LOBBY_STATE_MAIN = 0xb };

// @yo2 0x00884b70 the lobby scene's error state
template <class Scene>
bool lobbyErrorState(Scene& s) {
    if (!s.errDlg.task()) {
        s.errChoice = -1;
        s.errDlg.set(windowModelDialogErrorCreate(s.baseElement()));
        YO2_ASSERT(s.errDlg.task(), "CWindowModelDialogOk タスク生成失敗！？");   // couldn't create the dialog
        s.errDlg->setInstName("m_pErrDlg -> CWindowModelDialogOk");
        s.errDlg->setTopmost(true);
        // @yo2 0x00883090 CCallbackM3<CLobbyScene, int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, int>::CCallbackM3
        s.errDlg->setCallback(CCallbackM3<Scene, int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, intptr_t>(
            &s, &Scene::onErrorDialog));
        vc6::string text = lobbyErrorMessage(s.errorCode, &s.errUrl);
        char buf[0x100];   // the exe widens at most 0xff characters of it
        std::snprintf(buf, sizeof buf, "%s", text.c_str());
        vc6::wstring w = windowWiden(buf);
        s.errDlg->setText(w.c_str());
        s.errDlg->layout();
    }
    screenFaderHide();
    if (s.errChoice == -1) return false;
    if (s.errDlg.task()) s.errDlg->destroy(__FILE__, 0x162);
    s.errorClosed();
    if (s.nextState == LOBBY_STATE_MAIN) lobbyErrorBackToMain();
    if (!s.errUrl.empty()) {
        lobbyShellOpen(s.errUrl.c_str());
        s.errUrl = "";
    }
    s.prevState = s.state;
    s.state = s.nextState;
    s.nextState = LOBBY_STATE_MAIN;
    s.stateFrames = 0;
    return false;
}
