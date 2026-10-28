// src/Gunsling: CGunsMng create/ctor/dtor (0x996310, 0x996660, 0x9968b0, 0x996880), onInit (0x996950), onDestroy
// (0x996df0), enterArea (0x9964e0), onMain (0x996da0) and its four steps (0x996e10, 0x996e90, 0x9978b0, 0x9979e0).
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include "Gunsling/yo2GunslingManager.h"
#include "Net/NetLobby.h"
#include "System/CD3DDevice.h"
#include "System/yo2SceneManager.h"
#include "System/yo2ZSort.h"
#include "fakes.h"

extern int g_fakeFaderState;
extern CElement* g_fakeSceneLayer;
extern std::vector<std::string> g_log;
extern CNetLobby* g_lobby;
extern CTask* g_world;
extern int32_t g_area;
extern CElement* g_swf;
extern bool g_swfFinished;
CSceneTask* makeAreaMap(CTask* parent, CElement* layer);
static CTask* g_root;

static void frame() {
    g_root->call(&g_tmMain);
    for (CZSort& q : g_zsortSet->layer)
        q.clear();
    CTask::flushDeleted();
}


static void run(CGunsMng* gm, CSceneMng* mng, int32_t kind, const char* movie) {
    g_log.clear();
    g_swf = nullptr;
    g_swfFinished = false;
    std::srand(77 + kind);
    int ry = std::rand() % 60 - 30, rx = std::rand() % 60 - 30;
    std::srand(77 + kind);
    g_fakeFaderState = 1;
    gm->enterArea(kind);
    char move[64];
    std::snprintf(move, sizeof move, "move ガンスマネージャCNetLobbyTask 4242 %d %d 3 0", 1000 + rx, 2000 + ry);
    assert((g_log == std::vector<std::string>{"initPos 9 8", "initDir 9 8", move, "fadeOut 10 61004"}));
    assert(g_area == 9 && gm->step() == CGunsMng::WAIT_MAP && mng->nextSceneId() == SCENE_AREA_MAP);

    // the fade runs (state 1/2): nothing; it ends and the map switches in, but hasn't loaded: nothing
    frame();
    assert(gm->step() == CGunsMng::WAIT_MAP);
    g_fakeFaderState = 3;
    frame();
    auto* map = dynamic_cast<FakeAreaMap*>(mng->scene());
    assert(mng->sceneId() == SCENE_AREA_MAP && gm->step() == CGunsMng::WAIT_MAP);
    map->loaded = true;
    g_log.clear();
    frame();  // step 1 -> 2
    assert(map->frozen && gm->step() == CGunsMng::SHOW_TITLE);
    frame();  // step 2: dim + title
    std::vector<std::string> want = {"fade 1,1,1,1 -> 0.5,0.5,0.5,1 30 0 1 61004"};
    if (movie) {
        want.push_back("sound 10000004 0");
        want.push_back(std::string("swf map ") + movie + " 0 1");
        want.push_back("play m_pGunsTitle 1");
    }
    assert(g_log == want && gm->step() == CGunsMng::PLAY_TITLE);
    if (movie) assert(g_swf->instName() == "m_pGunsTitle" && g_swf->pos_.z == 61014.0f && g_swf->pos_.x == 0);

    // step 3: the movie plays; when it ends it goes and the screen undims; the fader settles: unfreeze
    g_log.clear();
    g_fakeFaderState = 2;
    frame();
    assert(g_log.empty() && gm->step() == CGunsMng::PLAY_TITLE);
    g_swfFinished = true;
    int live = CTask::liveCount();
    frame();
    if (movie) {
        assert((g_log == std::vector<std::string>{"fadeTo 1,1,1 30 1 0 61004"}));
        assert(CTask::liveCount() == live - 1);
    }
    g_fakeFaderState = 0;
    frame();
    assert(!map->frozen && gm->step() == CGunsMng::IN_AREA);
    frame();
    assert(gm->step() == CGunsMng::IN_AREA);
    map->leaving = true;
    frame();
    assert(gm->step() == CGunsMng::LEFT);
    frame();  // LEFT: nothing more
}

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    g_root = root;
    g_fakeSceneLayer = CElement::newChild(root, 0);
    CSceneMng::registerScene(SCENE_AREA_MAP, &makeAreaMap);
    CSceneMng* mng = CSceneMng::newChild(root, 1);
    g_lobby = new CNetLobby();
    g_lobby->block2 = 9;
    g_world = CTask::newChild(root, 3);

    CGunsMng* gm = CGunsMng::create(root, 2);
    assert(gm == CGunsMng::instance() && gm->taskName() == "GunsMng" && gm->step() == CGunsMng::IDLE);
    bool lobbyTask = false;
    for (CTask* c : gm->children()) lobbyTask |= c->instName() == "ガンスマネージャCNetLobbyTask";
    assert(lobbyTask);
    frame();  // IDLE: nothing
    run(gm, mng, 1, "data/Y/duel/effect/guns_ef_start_a01_j.txt");
    run(gm, mng, 13, "data/Y/duel/effect/guns_ef_start_a01_j.txt");
    run(gm, mng, 5, "data/Y/duel/effect/trial_ef_start_a01_j.txt");
    run(gm, mng, 15, "data/Y/duel/effect/trial_ef_start_a01_j.txt");
    run(gm, mng, 7, "data/Y/duel/effect/anniv_ef_start_a01_j.txt");
    run(gm, mng, 17, "data/Y/duel/effect/evolution_ef_start_a01_j.txt");
    run(gm, mng, 21, "data/Y/duel/effect/ult_ef_start_a01_j.txt");
    run(gm, mng, 2, nullptr);  // no movie for this kind

    gm->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CGunsMng::instance() == nullptr);
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CTask::liveCount() == 0);
    delete g_lobby;
    CD3DDevice::release();
    std::puts("gunsling_test ok");
}
