// src/title: CTitleScene onInit (0x7f8f90, with and without a world UI / lobby), onMain (0x7f9ca0: the clear-ID box,
// both answers), onDestroy (0x7fa400), receive (0x7fa450: every button, the option dialog closing), scaleColor
// (0x7fb4d0) and the team-state reset (0x7fb570).
#include <cassert>
#include <cstdio>

#include "Net/NetLobby.h"
#include "System/CD3DDevice.h"
#include "System/yo2SceneManager.h"
#include "System/yo2ZSort.h"
#include "fakes.h"
#include "title/titleEntry.h"

extern int g_fakeFaderState;
extern CElement* g_fakeSceneLayer;
static CTask* g_root;
static CSceneMng* g_mng;
static CSceneTask* makeOther(CTask* parent, CElement* layer) { return CSceneTask::spawn<CSceneTask>(parent, layer); }

static void frame() {
    g_root->call(&g_tmMain);
    for (CZSort& q : g_zsortSet->layer)
        q.clear();
    CTask::flushDeleted();
}

static bool has(const std::string& s) {
    for (auto& l : g_log)
        if (l == s) return true;
    return false;
}

static CSceneTask* enter() {
    g_log.clear();
    g_swfFinished = false;
    g_mng->change(SCENE_TITLE, CSceneMng::FADE_NONE, true);
    frame();
    return g_mng->scene();
}

static void leave(int32_t expect) {
    g_fakeFaderState = 3;
    frame();
    assert(g_mng->sceneId() == expect);
    g_fakeFaderState = 0;
}

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    g_root = root;
    g_fakeSceneLayer = CElement::newChild(root, 0);
    CSceneMng::registerScene(SCENE_TITLE, &CTitleScene::New);
    CSceneMng::registerScene(SCENE_CAUTION, &makeOther);
    CSceneMng::registerScene(SCENE_LOGO, &makeOther);
    g_mng = CSceneMng::newChild(root, 1);

    {   // first start: no world UI, no lobby
        CSceneTask* s = enter();
        assert(s->taskName() == "CTitleScene" && s->baseElement()->instName() == "CTitleScene::m_pBaseElm");
        std::vector<std::string> want = {
            "bg CTitleScene::m_pBaseElm 64 0", "swf Data/title/title_flash_01.txt 0 1", "swfPlay CTitleScene::m_title 1",
            "swfListener CTitleScene::m_title CTitleScene", "worldEnterTitle 0", "fadeIn 1 10 61004", "sound 20000000 0",
            "korean 0 0"};
        assert(g_log == want);
        assert(g_swf->pos_.z == 100.0f);
        bool bgNamed = false;
        for (CTask* c : s->children()) bgNamed |= c->instName() == "CTitleScene::bg";
        assert(bgNamed);

        // buttons do nothing until the intro has played, nor when not clicked
        g_log.clear();
        SwfEvent start("btn_start", true), hover("btn_start", false);
        s->call(&start);
        g_swfFinished = true;
        s->call(&hover);
        assert(g_log.empty());
        s->call(&start);
        assert((g_log == std::vector<std::string>{"sound 10000001 0"}) && g_mng->nextSceneId() == SCENE_CAUTION);
        leave(SCENE_CAUTION);
    }
    {   // web, quit, unknown buttons
        CSceneTask* s = enter();
        g_swfFinished = true;
        g_log.clear();
        SwfEvent web("btn_web", true), quit("btn_quit", true), other("btn_other", true);
        s->call(&web);
        s->call(&quit);
        s->call(&other);
        assert((g_log == std::vector<std::string>{"sound 10000001 0", "open http://home/", "quit"}));
    }
    {   // option: dialog over a dimmed title; it closing re-enters the title (other deaths don't)
        CSceneTask* s = enter();
        g_swfFinished = true;
        g_log.clear();
        SwfEvent opt("btn_option", true);
        s->call(&opt);
        assert((g_log == std::vector<std::string>{"sound 10000001 0", "option CTitleScene::m_pBaseElm 0 0 data/title/option_dai_01_c01.png",
                                                  "swfActive CTitleScene::m_title 0"}));
        assert(g_lastOption->instName() == "CTitleScene::m_option" && !g_lastOption->inheritColor_);
        assert(s->baseElement()->color_[0] == 0.75f && s->baseElement()->color_[3] == 0.75f);
        CTmDestroyed other(g_swf);
        g_destroyedPtr = nullptr;
        s->call(&other);
        assert(g_mng->nextSceneId() == SCENE_NONE);
        // the scene's option_ (+0x98 on 32-bit) is the CTaskPtr whose task_ word holds the dialog: find it
        const CTaskPtrBase* optPtr = nullptr;
        for (size_t off = sizeof(void*); off < sizeof(CTitleScene); off += sizeof(void*))
            if (*reinterpret_cast<CElement* const*>(reinterpret_cast<const char*>(s) + off) == g_lastOption)
                optPtr = reinterpret_cast<const CTaskPtrBase*>(reinterpret_cast<const char*>(s) + off - sizeof(void*));
        assert(optPtr && optPtr->task() == g_lastOption);
        g_destroyedPtr = optPtr;
        s->call(&other);
        assert(g_mng->nextSceneId() == SCENE_TITLE);
        leave(SCENE_TITLE);
    }
    {   // clear: yes forgets the ID and saves; no just leaves; both re-enter the title
        for (int answer : {4000, 4001}) {
            CSceneTask* s = enter();
            g_swfFinished = true;
            g_log.clear();
            SwfEvent clr("btn_clear", true);
            s->call(&clr);
            FakeDialog* d = g_lastDialog;
            assert(d->instName() == "CTitleScene::m_dialogYesNo" && !d->inheritColor_);
            std::vector<std::string> want = {"sound 10000001 0", "yesno CTitleScene::m_pBaseElm 0 0 4000 4001 0",
                                             "size CTitleScene::m_dialogYesNo 500 150", "layout CTitleScene::m_dialogYesNo",
                                             "text CTitleScene::m_dialogYesNo 0xbcc", "centre CTitleScene::m_dialogYesNo",
                                             "swfActive CTitleScene::m_title 0"};
            assert(g_log == want && s->baseElement()->color_[1] == 0.75f);
            g_log.clear();
            frame();  // unanswered
            assert(g_log.empty());
            d->result = answer;
            frame();
            if (answer == 4000)
                assert((g_log == std::vector<std::string>{"sound 10000001 0", "swfActive CTitleScene::m_title 1",
                                                          "lastLoginId ''", "configSave"}));
            else
                assert((g_log == std::vector<std::string>{"sound 10000002 0", "swfActive CTitleScene::m_title 1"}));
            assert(g_mng->nextSceneId() == SCENE_TITLE);
            leave(SCENE_TITLE);
        }
    }
    {   // back from the lobby: the world UI is reset, the lobby's team state forgotten (Korean: the world is told)
        g_world = CTask::newChild(root, 5);
        g_menu = CElement::newChild(g_world, 1);
        g_menu->setInstName("menu");
        g_chat = CElement::newChild(g_world, 2);
        g_chat->setInstName("chat");
        g_place = CElement::newChild(g_world, 3);
        g_place->setInstName("place");
        g_duelConfig = CElement::newChild(g_world, 4);
        g_duelConfig->setInstName("duelcfg");
        g_duelAva = CTask::newChild(g_world, 5);
        g_duelAva->setInstName("ava");
        g_lobby = new CNetLobby();
        g_lobby->inTeam = 1;
        g_lobby->joinApplied = 1;
        g_lobby->joinApplications.push_back({1, 2, "a", "b"});
        g_lobby->joinApplications.push_back({3, 4, "c", "d"});
        g_language = 6;
        enter();
        std::vector<std::string> want = {
            "bg CTitleScene::m_pBaseElm 64 0", "swf Data/title/title_flash_01.txt 0 1", "swfPlay CTitleScene::m_title 1",
            "swfListener CTitleScene::m_title CTitleScene", "worldEnterTitle 1", "chatClear chat", "chatTab chat 3 0",
            "chatTab chat 4 0", "chatTab chat 0 1", "chatTab chat 1 1", "chatTab chat 2 1", "chatTab chat 5 1",
            "menuReset menu", "menuClose menu", "duelAvaClear ava 0", "duelAvaClear ava 1", "duelRequestReset",
            "duelDisconnect", "fadeIn 1 10 61004", "sound 20000000 0", "korean 1 1"};
        assert(g_log == want);
        assert(!g_menu->isVisible(true) && !g_chat->isVisible(true) && !g_place->isVisible(true));
        assert(!g_duelConfig->isVisible(true));  // it was shown, so it is hidden too
        assert(g_lobby->inTeam == 0 && g_lobby->joinApplied == 0 && g_lobby->joinApplications.empty());
        // a hidden duel-config window is left alone
        g_log.clear();
        g_duelConfig->setDisp(false, false);
        enter();
        assert(!has("bogus"));
        delete g_lobby;
        g_lobby = nullptr;
    }
    {   // scaleColor (0x7fb4d0)
        float c[4] = {1, 0.5f, 0.25f, 2};
        assert(scaleColor(c, 0.75f) == c && c[0] == 0.75f && c[1] == 0.375f && c[2] == 0.1875f && c[3] == 1.5f);
    }

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CTask::liveCount() == 0);
    CD3DDevice::release();
    std::puts("title_test ok");
}
