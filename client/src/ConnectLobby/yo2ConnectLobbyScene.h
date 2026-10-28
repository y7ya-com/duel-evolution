// CConnectLobbyScene (src\ConnectLobby): the screen between player select and My Room. It connects its own
// CNetLobbyTask to a My Room lobby and, once that's done, pushes the My Room scene.
#pragma once
#include "Net/NetTasks.h"
#include "System/yo2Scene.h"

// CBgCommon::New (0xa0a030), as phase2-ui-b's caution scene declares it: the shared background, kind `bg`.
CEasyTask* bgCommonNew(CTask* parent, CElement* layer, int32_t bg, int32_t arg);

class CConnectLobbyScene : public CSceneTask {
public:
    static CConnectLobbyScene* New(CTask* parent, CElement* layer);   // FUN_008a6cb0
    CConnectLobbyScene();
    ~CConnectLobbyScene() override;     // FUN_008a6ec0
    bool onInit() override;             // FUN_008a6f50
    bool onMain() override;             // FUN_008a7180
    void onDestroy() override;          // FUN_008a7900

    enum State { CONNECT, WAIT, DONE };
    enum { BG_CONNECT_LOBBY = 0x29 };
    int32_t state = CONNECT;            // 0x80
    CEasyTask* bg = nullptr;            // 0x84 CBgCommon
    CTaskPtr<CNetLobbyTask> lobbyTask;  // 0x88
    uint8_t _94[4] = {};

private:
    struct Layout;
};
struct CConnectLobbyScene::Layout {
    YO2_AT(CConnectLobbyScene, state, 0x80);
    YO2_AT(CConnectLobbyScene, bg, 0x84);
    YO2_AT(CConnectLobbyScene, lobbyTask, 0x88);
};
YO2_SIZEOF(CConnectLobbyScene, 0x98);
