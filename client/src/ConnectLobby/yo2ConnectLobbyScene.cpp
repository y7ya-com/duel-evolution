// CConnectLobbyScene (the exe's src\ConnectLobby\yo2ConnectLobbyScene.cpp).
#include "yo2ConnectLobbyScene.h"

#include "System/yo2SceneManager.h"

// @yo2 0x008a6cb0
CConnectLobbyScene* CConnectLobbyScene::New(CTask* parent, CElement* layer) {
    return CSceneTask::spawn<CConnectLobbyScene>(parent, layer);
}

CConnectLobbyScene::CConnectLobbyScene() { setTaskName("CConnectLobbyScene"); }

// @yo2 0x008a6e90 CConnectLobbyScene deleting destructor
// @yo2 0x008a6ec0 the lobby task's CTaskPtr, then CSceneTask
CConnectLobbyScene::~CConnectLobbyScene() = default;

// @yo2 0x008a6f50
bool CConnectLobbyScene::onInit() {
    createBaseElement("CConnectLobbyScene::m_pBaseElm");
    bg = bgCommonNew(this, baseElement(), BG_CONNECT_LOBBY, 0);
    lobbyTask.setUser(this);
    lobbyTask.set(CNetLobbyTask::spawn(this));
    state = CONNECT;
    return true;
}

// @yo2 0x008a7180
// @yo2 0x008a7950 its Receive slot: CEasyTask::receive
bool CConnectLobbyScene::onMain() {
    switch (state) {
    case CONNECT:
        YO2_ASSERT(lobbyTask.task(), "netLobby ERROR");
        lobbyTask->connectMyRoom();
        state = WAIT;
        break;
    case WAIT:
        if (lobbyTask->busy == CNetLobbyTask::BUSY_FAILED) {
            yo2Trace("ERROR=[%d]\n", lobbyTask->result);
            state = DONE;
        } else if (lobbyTask->busy == CNetLobbyTask::BUSY_DONE) {
            CSceneMng::instance()->push(SCENE_MY_ROOM, 1, true);
            state = DONE;
        }
        break;
    }
    return true;
}

// @yo2 0x008a7900
void CConnectLobbyScene::onDestroy() {
    if (CElement* e = baseElement()) e->destroy(__FILE__, 0x5d);
}
