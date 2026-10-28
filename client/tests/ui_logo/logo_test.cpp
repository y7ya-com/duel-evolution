// src/logo: CLogoScene onInit (0x7f0690), onMain (0x7f0c50), onDestroy (0x7f0cc0) and receive (0x7f0d10, it is
// what delivers the other three) driven through the real scene manager.
#include <cassert>
#include <cstdio>
#include <string>

#include "System/CD3DDevice.h"
#include "System/yo2SceneManager.h"
#include "System/yo2ZSort.h"
#include "logo/logoEntry.h"

extern int g_fakeFaderState;
extern CElement* g_fakeSceneLayer;
extern std::string g_swfPath;
extern uint32_t g_swfPriority;
extern bool g_swfLoop, g_swfPlaying, g_swfFinished;
extern CElement* g_swf;
extern int32_t g_language;

static CSceneTask* makeOther(CTask* parent, CElement* layer) { return CSceneTask::spawn<CSceneTask>(parent, layer); }

static void frame(CTask* root) {
    root->call(&g_tmMain);
    for (CZSort& q : g_zsortSet->layer)
        q.clear();
    CTask::flushDeleted();
}

static void runLogo(CTask* root, CSceneMng* mng, int32_t language, int32_t expectNext) {
    mng->change(SCENE_LOGO, CSceneMng::FADE_NONE, true);
    frame(root);
    assert(mng->sceneId() == SCENE_LOGO);
    CSceneTask* logo = mng->scene();
    assert(logo->taskName() == "CLogoScene");
    CElement* base = logo->baseElement();
    assert(base->instName() == "CLogoScene::m_pBaseElm" && base->parent() == g_fakeSceneLayer);
    assert(g_swfPath == "Data/logo/konami_logo.txt" && g_swfPriority == 0 && g_swfLoop && g_swfPlaying);
    assert(g_swf->parent() == base && g_swf->instName() == "SwfEngine" && g_swf->pos_.z == 100.0f);

    // still playing: nothing happens
    size_t depth = mng->stackDepth();
    g_language = language;
    frame(root);
    frame(root);
    assert(mng->nextSceneId() == SCENE_NONE && mng->stackDepth() == depth);

    // played through: push the next scene, behind the fader (FADE_WAIT), the logo destroyed
    g_swfFinished = true;
    g_fakeFaderState = 1;
    frame(root);
    assert(mng->nextSceneId() == expectNext && mng->stackDepth() == depth + 1 && mng->sceneId() == SCENE_LOGO);
    g_fakeFaderState = 3;
    int live = CTask::liveCount();
    frame(root);
    // the logo, its base element and the movie are gone (onDestroy took the base element down); the next is up
    assert(mng->sceneId() == expectNext && mng->scene() != logo && CTask::liveCount() == live - 3 + 1);
    g_fakeFaderState = 0;
    g_swfFinished = g_swfPlaying = false;
}

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    g_fakeSceneLayer = CElement::newChild(root, 0);
    CSceneMng::registerScene(SCENE_LOGO, &CLogoScene::New);
    CSceneMng::registerScene(SCENE_RATING, &makeOther);
    CSceneMng::registerScene(SCENE_TITLE, &makeOther);
    CSceneMng* mng = CSceneMng::newChild(root, 1);

    runLogo(root, mng, 1, SCENE_TITLE);   // English
    runLogo(root, mng, 0, SCENE_TITLE);   // Japanese
    runLogo(root, mng, 6, SCENE_RATING);  // Korean

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CTask::liveCount() == 0);
    CD3DDevice::release();
    std::puts("logo_test ok");
}
