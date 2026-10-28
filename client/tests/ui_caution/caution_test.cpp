// src/caution: CCautionScene New/ctor/dtor (0x7fb6a0, 0x7fb940, 0x7fb8f0), receive (0x7fd7f0), onInit (0x7fba60),
// onMain (0x7fbfe0, every step), onDestroy (0x7fd7a0), and CHttpDownload::data (0x7fd780) through the pages it shows.
#include <cassert>

#include "System/CD3DDevice.h"
#include "System/yo2SceneManager.h"
#include "System/yo2ZSort.h"
#include "fakes.h"

extern int g_fakeFaderState;
extern CElement* g_fakeSceneLayer;

static CSceneTask* makeOther(CTask* parent, CElement* layer) { return CSceneTask::spawn<CSceneTask>(parent, layer); }
static CTask* g_root;
static CSceneMng* g_mng;

static void frame() {
    g_root->call(&g_tmMain);
    for (CZSort& q : g_zsortSet->layer)
        q.clear();
    CTask::flushDeleted();
}

// Accessors for the scene's private members, by their checked offsets (the test only runs on the host, so go through
// the dialogs the fakes hand out instead).
static FakeDlg* g_lastDlg;
static FakeDlg* lastDialog(CTask* scene) {
    FakeDlg* d = nullptr;
    for (CTask* c : scene->children())
        if (auto* f = dynamic_cast<FakeDlg*>(c)) d = f;
    return g_lastDlg = d;
}

struct Pages {
    CHttpDownload *stoplogin, *info, *info0;
};
static Pages pagesOf() {  // the fake start() remembers which download fetches which page
    auto find = [](const char* page) -> CHttpDownload* {
        auto it = g_downloads.find(std::string("http://site/eng/") + page);
        return it == g_downloads.end() ? nullptr : it->second;
    };
    return {find("stoplogin.html"), find("info.html"), find("info0.html")};
}

static CSceneTask* enter() {
    g_log.clear();
    g_downloads.clear();
    g_stopLogin = false;
    g_mng->change(SCENE_CAUTION, CSceneMng::FADE_NONE, true);
    frame();
    CSceneTask* s = g_mng->scene();
    assert(s->taskName() == "CCautionScene" && s->baseElement()->instName() == "CCautionScene::m_pBaseElm");
    assert((g_log == std::vector<std::string>{"bg 57 0 layer", "GET http://site/eng/stoplogin.html",
                                              "GET http://site/eng/info0.html", "sound 20000003 0"}));
    bool bgNamed = false;
    for (CTask* c : s->children())
        bgNamed |= c->instName() == "CCautionScene::背景";
    assert(bgNamed);
    g_log.clear();
    return s;
}

static void finish(CSceneTask* s, int32_t expect) {
    g_fakeFaderState = 3;
    frame();
    assert(g_mng->sceneId() == expect && g_mng->scene() != s);
    g_fakeFaderState = 0;
}

static void answer(FakeDlg* d) {
    d->result = 4001;  // something else: nothing happens
    frame();
    d->result = INFODLG_RESULT_OK;
}

static void set(CHttpDownload* h, int32_t status, const char* text = nullptr) {
    h->status_ = status;
    h->data_ = const_cast<char*>(text);
}

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    g_root = root;
    g_fakeSceneLayer = CElement::newChild(root, 0);
    CSceneMng::registerScene(SCENE_CAUTION, &CCautionScene::New);
    CSceneMng::registerScene(SCENE_TITLE, &makeOther);
    CSceneMng::registerScene(SCENE_LOGIN, &makeOther);
    g_mng = CSceneMng::newChild(root, 1);

    {   // info0 shown, then the stop-login notice: back to the title
        CSceneTask* s = enter();
        Pages p = pagesOf();
        assert(p.stoplogin && p.info0 && !p.info);
        frame();  // both still running
        assert(g_log.empty());
        set(p.info0, CHttpDownload::DONE, "news!");
        set(p.stoplogin, CHttpDownload::DONE, "closed");
        frame();
        FakeDlg* d = lastDialog(s);
        assert(g_log.back() == "dlg 4004 news!" && d->instName() == "CCautionScene::m_infoDlg0");
        assert(d->owner == s->baseElement() && d->flags == INFODLG_CENTER && !d->fromFile);
        answer(d);
        frame();  // -> WAIT_STOPLOGIN
        frame();
        d = lastDialog(s);
        assert(g_stopLogin && g_log.back() == "dlg 4005 closed" && d->instName() == "CCautionScene::m_stoploginDlg");
        answer(d);
        frame();
        assert(g_mng->nextSceneId() == SCENE_TITLE);
        finish(s, SCENE_TITLE);
    }
    {   // no info0, no stop-login: info.html, then the caution text, then the login
        CSceneTask* s = enter();
        Pages p = pagesOf();
        set(p.info0, CHttpDownload::FAILED);
        frame();
        assert(g_log.empty());
        set(p.stoplogin, CHttpDownload::FAILED);
        frame();
        assert(g_log.back() == "GET http://site/eng/info.html" && !g_stopLogin);
        p = pagesOf();
        assert(p.info);
        frame();
        set(p.info, CHttpDownload::DONE, "info");
        frame();
        FakeDlg* d = lastDialog(s);
        assert(g_log.back() == "dlg 4004 info" && d->instName() == "CCautionScene::m_infoDlg");
        answer(d);
        frame();  // -> OPEN_CAUTION
        frame();
        d = lastDialog(s);
        assert(g_log.back() == "dlg 4004 data/etc/caution_?.txt" && d->fromFile);
        assert(d->instName() == "CCautionScene::m_cautionDlg");
        answer(d);
        frame();
        finish(s, SCENE_LOGIN);
    }
    {   // info.html missing too: straight to the caution text
        CSceneTask* s = enter();
        Pages p = pagesOf();
        set(p.info0, CHttpDownload::FAILED);
        set(p.stoplogin, CHttpDownload::FAILED);
        frame();
        frame();
        p = pagesOf();
        set(p.info, CHttpDownload::FAILED);
        frame();
        frame();
        FakeDlg* d = lastDialog(s);
        assert(d && d->fromFile);
        d->result = INFODLG_RESULT_OK;
        frame();
        finish(s, SCENE_LOGIN);
    }

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CTask::liveCount() == 0);
    CD3DDevice::release();
    std::puts("caution_test ok");
}
