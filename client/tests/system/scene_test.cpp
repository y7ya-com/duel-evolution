// src/System scene manager: change / push / pop / popTo, fade gating, base elements, CTmSceneChange.
#include <cassert>
#include <cstdio>
#include <string>

#include "System/yo2SceneManager.h"
#include "System/CD3DDevice.h"
#include "System/yo2ZSort.h"

extern int g_fakeFaderState;
extern CElement* g_fakeSceneLayer;
static std::string g_log;

template <char Id>
struct Scene : CSceneTask {
    bool onInit() override {
        createBaseElement("base");
        g_log += std::string("+") + Id;
        return true;
    }
    void onDestroy() override { g_log += std::string("-") + Id; }
    int32_t receive(CTaskMessage* m) override {
        if (m->tag == 8) {
            auto* c = static_cast<CTmSceneChange*>(m);
            g_log += std::string(c->kind == CTmSceneChange::LEAVE ? "<" : ">") + Id + std::to_string(c->sceneId);
        }
        return CSceneTask::receive(m);
    }
    static CSceneTask* make(CTask* parent, CElement* layer) { return spawn<Scene>(parent, layer); }
};

static void frame(CTask* root) {
    root->call(&g_tmMain);
    for (CZSort& q : g_zsortSet->layer)
        q.clear();
    CTask::flushDeleted();
}

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    g_fakeSceneLayer = CElement::newChild(root, 0);
    CSceneMng::registerScene(SCENE_LOGO, &Scene<'L'>::make);
    CSceneMng::registerScene(SCENE_TITLE, &Scene<'T'>::make);
    CSceneMng::registerScene(SCENE_LOBBY, &Scene<'B'>::make);

    CSceneMng* mng = CSceneMng::newChild(root, 1);
    assert(mng == CSceneMng::instance() && mng->fader());
    assert(mng->sceneId() == SCENE_NONE);

    // change: the new scene is created on the next frame; its base element sits under the scene layer
    mng->change(SCENE_LOGO, CSceneMng::FADE_NONE, true);
    frame(root);
    assert(mng->sceneId() == SCENE_LOGO && g_log == "+L");
    CSceneTask* logo = mng->scene();
    assert(logo->baseElement()->parent() == g_fakeSceneLayer && logo->baseElement()->instName() == "base");

    // FADE_WAIT holds the switch while the fader runs (state 1/2), then switches once it is done (3)
    g_log.clear();
    g_fakeFaderState = 2;
    mng->change(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
    frame(root);
    assert(mng->sceneId() == SCENE_LOGO && g_log.empty());
    g_fakeFaderState = 3;
    frame(root);
    assert(mng->sceneId() == SCENE_TITLE && g_log == "<L4-L+T");
    g_fakeFaderState = 0;

    // push keeps the title alive (suspended); pop resumes it and destroys the lobby
    CSceneTask* title = mng->scene();
    g_log.clear();
    mng->push(SCENE_LOBBY, CSceneMng::FADE_NONE, false);
    frame(root);
    assert(mng->sceneId() == SCENE_LOBBY && mng->stackDepth() == 1 && title->alive());
    assert(g_log == "<T11+B");
    g_log.clear();
    mng->pop(CSceneMng::FADE_NONE);
    frame(root);
    assert(mng->scene() == title && mng->sceneId() == SCENE_TITLE && mng->stackDepth() == 0);
    assert(g_log == "<B4-B>T11");

    // popTo drops the stack through the given scene, destroying the suspended scenes it pops
    g_log.clear();
    mng->push(SCENE_LOGO, CSceneMng::FADE_NONE, false);  // title suspended
    frame(root);
    mng->push(SCENE_LOBBY, CSceneMng::FADE_NONE, false);  // logo suspended
    frame(root);
    assert(mng->stackDepth() == 2);
    g_log.clear();
    mng->popTo(SCENE_TITLE);
    assert(mng->stackDepth() == 0 && g_log == "-L-T");

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CTask::liveCount() == 0 && CSceneMng::instance() == nullptr);
    CD3DDevice::release();
    std::puts("scene_test ok");
}
