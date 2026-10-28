// net_cli verbs and stubs for the scenes on the Net side (src/ConnectLobby): System's scene manager is real; its
// fader, scene layer and z-sort are stand-ins, as are the backgrounds.
#include "ConnectLobby/yo2ConnectLobbyScene.h"
#include "System/yo2SceneManager.h"
#include "System/yo2ZSort.h"
#include "net_cli.h"

CTask* netCliRoot();
CElement* appSceneLayer() {
    static CElement* layer = CElement::newChild(netCliRoot(), 0);
    return layer;
}
CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return true; }
bool screenFaderIdle(CElement*) { return true; }
bool CZSort::add(CElement*, float, int32_t) { return true; }
CZSort::~CZSort() = default;   // the key function: its typeinfo, which CElement's dynamic_casts need
CZSort::CZSort() = default;
CZSortSet::CZSortSet() = default;
static CZSortSet g_zsorts;
CZSortSet* g_zsortSet = &g_zsorts;
CEasyTask* bgCommonNew(CTask*, CElement*, int32_t bg, int32_t arg) {
    printf("bg %x %d\n", bg, arg);
    return nullptr;
}

struct FakeMyRoomScene : CSceneTask {
    bool onInit() override {
        printf("my room scene\n");
        return true;
    }
};

static CSceneMng* g_mng;
NET_CLI("call", "scene.connectlobby") {   // the scene manager switches to SCENE_CONNECT_LOBBY
    g_mng = CSceneMng::newChild(netCliRoot(), 10000);
    CSceneMng::registerScene(SCENE_CONNECT_LOBBY, [](CTask* p, CElement* l) -> CSceneTask* {
        return CConnectLobbyScene::New(p, l);
    });
    CSceneMng::registerScene(SCENE_MY_ROOM, [](CTask* p, CElement* l) -> CSceneTask* {
        return CSceneTask::spawn<FakeMyRoomScene>(p, l);
    });
    g_mng->change(SCENE_CONNECT_LOBBY, CSceneMng::FADE_NONE, true);
});
NET_CLI("call", "scene.mng") { printf("scenemng now=%d next=%d depth=%zu\n", g_mng->sceneId(), g_mng->nextSceneId(), g_mng->stackDepth()); });
