// src/Sound: CSoundTest onInit (0x688ef0), onMain (0x689520), receive (0x689540: every button, both lists wrapping).
// The WinSock functions in ygNetWin32.cpp are difftested (harness/difftest/cases_sound.py).
#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

#include "Sound/SoundTest.h"
#include "System/CD3DDevice.h"
#include "System/yo2Element.h"
#include "System/yo2ZSort.h"

extern std::vector<std::string> g_log;
extern CElement* g_panel;
CTaskMessage* makeSwfEvent(const char* name, bool clicked);

static std::vector<std::string> press(CSoundTest* t, const char* name, bool clicked = true) {
    g_log.clear();
    CTaskMessage* m = makeSwfEvent(name, clicked);
    t->call(m);
    delete m;
    return g_log;
}
using V = std::vector<std::string>;

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    CElement* layer = CElement::newChild(root, 0);
    CSoundTest* t = CSoundTest::New(root, layer);
    assert((g_log == V{"swf ./TestData/takano/soundTest/player.txt 0 1", "play SwfEngine 1", "listener CTask",
                       "+20000000 0", "window 0 0 1", "size 300 64", "layout", "origin 0 128", "text SE: 1|BGM: 1"}));
    assert(g_panel->parent() == layer && g_panel->pos_.z == -1.0f);
    g_log.clear();
    root->call(&g_tmMain);
    for (CZSort& q : g_zsortSet->layer)
        q.clear();
    assert(g_log.empty());

    assert(press(t, "bgm_play", false).empty());
    assert((press(t, "bgm_play") == V{"+20000000 0", "text SE: 1|BGM: 1"}));
    assert((press(t, "bgm_stop") == V{"-20000000 0", "text SE: 1|BGM: 1"}));
    assert((press(t, "bgm_next") == V{"-20000000 0", "+20000001 0", "text SE: 1|BGM: 2"}));
    press(t, "bgm_next");
    assert((press(t, "bgm_next") == V{"-20000002 0", "+20000000 0", "text SE: 1|BGM: 1"}));  // 3 BGMs: wraps
    assert((press(t, "bgm_back") == V{"-20000000 0", "+20000002 0", "text SE: 1|BGM: 3"}));
    assert((press(t, "bgm_rew") == V{"-20000002 0", "+20000002 0", "text SE: 1|BGM: 3"}));
    assert((press(t, "se_play") == V{"+10000000 0", "text SE: 1|BGM: 3"}));
    assert((press(t, "se_stop") == V{"-10000000 0", "text SE: 1|BGM: 3"}));
    assert((press(t, "se_next") == V{"-10000000 0", "+10000001 0", "text SE: 2|BGM: 3"}));
    assert((press(t, "se_next") == V{"-10000001 0", "+10000000 0", "text SE: 1|BGM: 3"}));  // 2 SEs: wraps
    assert((press(t, "se_back") == V{"-10000000 0", "+10000001 0", "text SE: 2|BGM: 3"}));
    assert((press(t, "se_rew") == V{"-10000001 0", "+10000001 0", "text SE: 2|BGM: 3"}));
    assert((press(t, "other") == V{"text SE: 2|BGM: 3"}));
    assert(t->bgm() == 0x20000002 && t->se() == 0x10000001);

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CTask::liveCount() == 0);
    CD3DDevice::release();
    std::puts("sound_test ok");
}
