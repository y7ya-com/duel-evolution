// CDuelMenuTask (src\Lobby\yo2LobbyEntry.cpp): the "duel" menu the lobby opens. CWindowModelDuel asks auto duel
// (-> CWindowModelDuelFind) or normal duel (-> CWindowModelDuelWait); in the event lobbies it's
// CWindowModelJoinGunsling instead. The task ends when the window it shows closes.
#pragma once
#include "System/window/yo2WindowTask.h"
#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

// The four windows (System, 0x00a38140..0x00a445c0, not written yet): New(parent) and the pressed button.
CWindowTaskModel* windowModelDuelNew(CTask* parent);          // CWindowModelDuel::New 0x00a38640
int32_t windowModelDuelChoice(CWindowTaskModel* w);           // 0x00a3aaf0 (+0x440)
CWindowTaskModel* windowModelDuelFindNew(CTask* parent);      // CWindowModelDuelFind::New 0x00a413c0
int32_t windowModelDuelFindResult(CWindowTaskModel* w);       // 0x00a435d0 (+0x448)
CWindowTaskModel* windowModelDuelWaitNew(CTask* parent);      // CWindowModelDuelWait::New 0x00a3ca60
int32_t windowModelDuelWaitResult(CWindowTaskModel* w);       // 0x00a40ec0 (+0x4a4)
CWindowTaskModel* windowModelJoinGunslingNew(CTask* parent);  // CWindowModelJoinGunsling::New 0x00a43920
int32_t windowModelJoinGunslingResult(CWindowTaskModel* w);   // 0x00a445c0 (+0x3d4)
// TODO(yaneSDK): CMouseEx::IsPushRButton (vslot 15 of CApp + 0x148): the right button went down (= cancel).
bool windowMouseRightPushed();

class CDuelMenuTask : public CEasyTask {
public:
    static CDuelMenuTask* spawn(CTask* parent, CElement* layer);   // FUN_0087ebe0
    CDuelMenuTask();
    ~CDuelMenuTask() override;          // FUN_0087ef40
    bool onInit() override;             // FUN_0087f010
    bool onMain() override;             // FUN_0087f950
    void onDestroy() override;          // FUN_00880dc0

    enum State { TOTAL, AUTO, NORMAL, NONE, GUNSLING, DONE };
    enum { CHOICE_AUTO = 1, CHOICE_NORMAL = 2, BUTTON_OK = 0xfa2, BUTTON_CANCEL = 0xfa3 };

    CElement* layer = nullptr;              // 0x70 the base element's parent, until onInit
    CTaskPtr<CElement> baseElm;             // 0x74 "CDuelMenuTask::m_pBaseElm"
    CTaskPtr<CWindowTaskModel> total;       // 0x80 CTaskPtr<CWindowModelDuel> "m_TotalDuel"
    CTaskPtr<CWindowTaskModel> autoDuel;    // 0x8c CTaskPtr<CWindowModelDuelFind> "m_AutoDuel"
    CTaskPtr<CWindowTaskModel> normDuel;    // 0x98 CTaskPtr<CWindowModelDuelWait> "m_NormDuel"
    CTaskPtr<CWindowTaskModel> eventDuel;   // 0xa4 CTaskPtr<CWindowModelJoinGunsling> "m_EventDuel"
    int32_t state = TOTAL;                  // 0xb0
    uint8_t _b4[4] = {};

private:
    struct Layout;
};
struct CDuelMenuTask::Layout {
    YO2_AT(CDuelMenuTask, layer, 0x70);
    YO2_AT(CDuelMenuTask, baseElm, 0x74);
    YO2_AT(CDuelMenuTask, total, 0x80);
    YO2_AT(CDuelMenuTask, normDuel, 0x98);
    YO2_AT(CDuelMenuTask, eventDuel, 0xa4);
    YO2_AT(CDuelMenuTask, state, 0xb0);
};
YO2_SIZEOF(CDuelMenuTask, 0xb8);
