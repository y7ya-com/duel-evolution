// src/System app shell: CApp start-up and frame loop, the socket dispatch, the studio's render, the camera, the
// mouse and the cursor manager.
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "System/CTextureManager.h"
#include "System/yo2App.h"
#include "System/yo2Camera.h"
#include "System/yo2SceneManager.h"
#include "System/yo2Studio.h"

extern std::string g_d3dLog, g_fakeAppLog, g_fakeCmdLine;
extern int g_fakePumpFrames, g_fakeNetAlive;
extern bool g_fakeCursorShown, g_fakeKeys[256];
extern int32_t g_fakeMouseX, g_fakeMouseY;
extern uint32_t g_fakeMouseButtons;
extern std::map<std::string, std::vector<uint8_t>> g_fakeFiles;
extern std::map<std::string, uint32_t> g_fakeFileSizes;

static int g_patcherScenes;
struct Patcher : CSceneTask {
    bool onInit() override {
        ++g_patcherScenes;
        return true;
    }
    static CSceneTask* make(CTask* parent, CElement* layer) { return spawn<Patcher>(parent, layer); }
};

static size_t count(const std::string& s, const char* what) {
    size_t n = 0;
    for (size_t at = s.find(what); at != std::string::npos; at = s.find(what, at + 1))
        ++n;
    return n;
}

static void testMouse() {
    CMyMouseEx m;
    m.update();  // the guard frames run out
    m.update();
    g_fakeMouseX = 10, g_fakeMouseY = 20, g_fakeMouseButtons = 2;  // left down
    m.update();
    bool l, r;
    m.getButton(l, r);
    assert(l && !r && m.leftPressed() && m.stillFrames() == 0);
    m.swallowButtons();
    assert(!m.leftPressed());
    m.update();
    assert(!m.leftPressed() && m.stillFrames() == 1);  // held, not moved
    g_fakeMouseButtons = 0;
    m.update();
    m.getButtonUp(l, r);
    assert(l && !r);
    // two notches away, one towards: +1 this frame, then nothing
    m.wndProc(nullptr, 0x20a, 120u << 16, 0);
    m.wndProc(nullptr, 0x20a, 120u << 16, 0);
    m.wndProc(nullptr, 0x20a, static_cast<uint32_t>(-120) << 16, 0);
    m.update();
    assert(m.wheelDelta() == 1);
    m.consumeWheel();
    assert(m.wheelDelta() == 0);
    m.update();
    assert(m.wheelDelta() == 0);
}

static void testCamera(COrthoCamera* cam) {
    // y down, looking down -z from z 63008 at the screen centre; the view maps the centre to the origin
    assert(cam->matrixLocked_ && cam->world_.m[1][1] == -1 && cam->world_.m[2][2] == -1);
    assert(cam->farZ() == 65008.0f && cam->nearZ() == 1.0f && cam->viewport().Width == 1024);
    cam->draw(0);
    const D3DMATRIX& v = g_d3d->device()->view;
    float x = 512 * v.m[0][0] + 384 * v.m[1][0] + v.m[3][0];
    float y = 512 * v.m[0][1] + 384 * v.m[1][1] + v.m[3][1];
    assert(std::fabs(x) < 1e-3f && std::fabs(y) < 1e-3f);
    assert(g_d3dLog.find("Viewport(1024,768)") != std::string::npos);
}

static void testStudio() {
    // priority order, ties after earlier ones
    CStudioMng& m = g_studioMng;
    size_t before = m.size();
    CStudio* a = m.addStudio(2000);
    CStudio* b = m.addStudio(500);
    CStudio* c = m.addStudio(2000);
    assert(m.size() == before + 3);
    a->clear_[0] = 1, a->clear_[1] = 0, a->clear_[2] = 0.5f, a->clear_[3] = 1;
    a->useBackBuffer();
    g_d3dLog.clear();
    m.render();
    // b renders first (500), then the app's studio (1000), then a and c (2000)
    assert(count(g_d3dLog, "Clear(") == 4 && count(g_d3dLog, "Present") == 1);
    assert(g_d3dLog.find("Clear(3,ffff007f)") != std::string::npos);
    m.removeStudio(a);
    m.removeStudio(b);
    m.removeStudio(c);
    assert(m.size() == before);
}

// The connections the stubs made, and what each was asked (recv / close).
struct CMessageIOBase {
    uintptr_t sock;
    int32_t recvResult = 0;
    bool bye = false;
    std::string log;
};
extern CMessageIOBase* g_fakeNets[5];

static void testSockets(CApp& app) {
    CMessageIOBase& lobby = *g_fakeNets[CApp::LOBBY];
    CMessageIOBase& gate = *g_fakeNets[CApp::GATE];
    app.wndProc(nullptr, CApp::WM_SOCKET, lobby.sock, 0);  // data: the handler runs
    assert(lobby.log == "recv" && !app.disconnected());
    gate.recvResult = -0x65;  // closed, but we asked: just close
    gate.bye = true;
    app.wndProc(nullptr, CApp::WM_SOCKET, gate.sock, 0);
    assert(gate.log == "close" && !app.disconnected());
    lobby.recvResult = -0x65;  // the lobby server dropped us
    app.wndProc(nullptr, CApp::WM_SOCKET, lobby.sock, 0);
    assert(lobby.log == "recvclose" && app.disconnected());
    assert(app.wndProc(nullptr, 0x104, 0x73, 0) == 1 && app.wndProc(nullptr, 0x104, 0x41, 0) == 0);  // Alt+F4
}

extern UINT g_fakeModeCount;

int main() {
    g_fakeModeCount = 3;
    g_d3d = new CD3DDevice;
    g_texMgr = new CD3DTextureManager;
    g_fakeFiles["data/common/window/mausuk_01_c00.png"] = {'I', 'M', 'G', ' ', '8', '0', ' ', '4', '0'};
    testMouse();

    // misc helpers
    assert(std::strcmp(appMessage(0), "Failed to connect to server!") == 0);
    g_fakeFileSizes["yo2.bin"] = 7;
    restoreExeFromBin();
    assert(g_fakeAppLog == "copy(yo2.bin,yo2.exe)");
    restoreExeFromBin();  // same size now: nothing
    assert(count(g_fakeAppLog, "copy") == 1);
    assert(appVersionTimeout() == 1100);

    CSceneMng::registerScene(SCENE_PATCHER, &Patcher::make);
    g_fakeCmdLine = "yo2.exe -myroomC";
    g_fakePumpFrames = 110;  // 1 ms per idle pass: frames at 33, 66 and 99 ms
    g_fakeAppLog.clear();
    {
        CApp app;
        assert(g_app == &app && g_myMouse == &app.mouse());
        app.mainThread();
        assert(app.rootTask() && app.rootElement() && app.debugRootElement());
        assert(app.debugRootElement()->parent() == app.rootElement());
        assert(app.rootElement()->instName() == "ルートエレメント");
        assert(app.myroomIndex() == 2);
        assert(g_patcherScenes == 1 && CSceneMng::instance()->sceneId() == SCENE_PATCHER);
        assert(count(g_d3dLog, "Present") == 3);
        assert(app.mouseManager() && app.mouseManager()->cursor());
        // the mouse is inside the client area: our cursor, not Windows'
        assert(!g_fakeCursorShown);
        g_fakeMouseY = -5;
        app.gameStep();
        assert(g_fakeCursorShown && !app.mouseManager()->isVisible(true));
        g_fakeMouseY = 5;
        app.gameStep();
        assert(!g_fakeCursorShown);
        testCamera(app.camera());
        testStudio();
        testSockets(app);
        assert(g_fakeNetAlive == 6);
    }
    assert(g_app == nullptr && g_fakeNetAlive == 0 && g_fakeCursorShown);
    assert(g_fakeAppLog.find("hook") == 0 && g_fakeAppLog.find("unhook") != std::string::npos);
    std::printf("app_test ok\n");
    return 0;
}
