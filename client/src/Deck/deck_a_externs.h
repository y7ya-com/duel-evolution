// What src/Deck part A calls that lives in other folders (System, yaneSDK, the app object) and isn't written yet.
// Each declaration names the exe function it stands for; tests/deck_a_stubs.cpp gives the test CLI stub bodies.
// Part-specific externs live next to their part (DeckParts.h, DeckUtil.h, DeckWindow.h, KabanWindow.h, DeckEntry.h)
// with the same "TODO(System) FUN_xxxxxxxx" comments.
#pragma once
#include "DeckCommon.h"

namespace dk {

// ---- System classes the Deck windows hold through TaskPtr<T> (opaque here; System/yaneSDK own them)
struct CTaskBase;               // CTask
struct CElement;                // CElement (every drawable task)
struct CSpriteElm;              // CSpriteElm (an image)
struct CTextElm;                // CTextElm (a text line)
struct CSwfEngine;              // CSwfEngine (a Flash-like animated button / number)
struct CWindowTaskListbox;      // CWindowTaskListbox
struct CWindowTaskText;
struct CWindowTaskTextField;
struct CWindowTaskTextSwitch;
struct CWindowTaskFrameThin;
struct CWindowTaskFramePlane;
struct CWindowTaskBackPlane;
struct CWindowModelInputValue;
struct CWindowModelDialogYesNo;
struct CWindowModelDialogOk;
struct CWindowModelListCardIcon;
struct CCardDetailViewDlg;
struct CNetLobbyTask;

// ---- the task tree (yo2Task.cpp)
// TODO(System) FUN_006296a0 CTask::create: link `task` under `parent` at priority `prio`, send TM_INIT; returns
// null (and destroys it) when its init returns TR_DESTROY.
void* taskCreate(void* task, void* parent, int32_t prio);
void taskDestroy(void* task);                            // TODO(System) FUN_006286b0 CTask::destroy
void taskSetInstName(void* task, const char* name);      // TODO(System) FUN_00629fa0 CTask::setInstName
void taskSetTaskName(void* task, const char* name);      // TODO(System) FUN_00629e10 CTask::setTaskName
const char* taskInstName(const void* task);              // TODO(System) FUN_0062a150 CTask::instName

// ---- CElement (yo2Element.cpp): the drawable base every window part derives from
void elemSetPos(void* elem, float x, float y);           // TODO(System) CElement position (x, y) in its parent
void elemGetPos(const void* elem, float* x, float* y);   // TODO(System) CElement position
void elemSetVisible(void* elem, bool on);                // TODO(System) FUN_0060e170 CElement::setVisible(on, notify=1)
bool elemVisible(const void* elem);  // inline in the exe (in 0x0094c2c0); TODO(System) CElement +0xc4
void elemSetAlpha(void* elem, float a);                  // TODO(System) CElement alpha (0..1)
void elemSetPrio(void* elem, int32_t prio);              // TODO(System) CElement draw priority

// ---- yaneSDK / app
uint32_t frameTick();                                    // TODO(System) the app frame counter
int32_t language();                                      // TODO(System) DAT_012711ac+0xcd8: game language 0..7

}   // namespace dk
