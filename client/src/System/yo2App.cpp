#include "yo2App.h"

#include <cstdio>

#include "CD3DTextTexture.h"
#include "window/yo2WindowTask.h"
#include "yo2Camera.h"
#include "yo2Debug.h"
#include "yo2EasyTask.h"
#include "yo2SceneManager.h"
#include "yo2Registry.h"
#include "yo2Studio.h"
#include "yo2SystemConfig.h"
#include "yo2TagConverter.h"
#include "yo2TextElm.h"

CApp* g_app;
CMyMouseEx* g_myMouse;

namespace {
int32_t g_appVersion;                  // DAT_012711a8 (never written: 0)
float g_mainClearColor[4];             // DAT_01270ee0 the main studio's clear colour (zero: black)
constexpr float kScreenW = 1024, kScreenH = 768;
constexpr uint64_t kRequiredDiskBytes = 600000000;
constexpr uint32_t kWmActivateApp = 0x86, kWmSysKeyDown = 0x104, kWmSysCommand = 0x112, kWmImeSetContext = 0x281,
                   kWmImeNotify = 0x282;
constexpr uintptr_t kVkF4 = 0x73, kScScreenSave = 0xf140;
constexpr int32_t kNetClosed = -0x65, kNetPending = -0x32;

// One language's messages: the client's single message so far.
const char* const kMessages[7][1] = {
    {"ディスクの空き容量が不足しています。\n%u Mbytes以上の空き容量が必要です。再インストールする必要があります。"},
    {"Failed to connect to server!"},
    {"Verbindung zum Server fehlgeschlagen!"},
    {"Échec de la connexion au serveur."},
    {"No se ha podido conectar al servidor."},
    {"Connessione al Server fallita."},
    {"서버 접속에 실패하였습니다."},
};

// CTaskPtr::get's checks then CTask::Destroy, as each of CApp's trees is torn down.
template <class T>
void destroyVia(CTaskPtr<T>& p, int line) {
    if (dynamic_cast<T*>(p.task()))
        p.get()->destroy(__FILE__, line);
}
}  // namespace

// @yo2 0x00606920 restoreExeFromBin: copy yo2.bin over yo2.exe when it is missing or differs in size
void restoreExeFromBin() {
    uint32_t bin, exe;
    if (!yo2FileSize("yo2.bin", bin))
        return;
    if (!yo2FileSize("yo2.exe", exe) || exe != bin)
        yo2CopyFile("yo2.bin", "yo2.exe");
}

// @yo2 0x00606ce0 appMessage: by the language the exe was built for (its resource string 1)
const char* appMessage(int32_t index) {
    int32_t lang = yo2ResourceLanguage();
    YO2_ASSERT(lang >= 0 && lang < 7, "lang invalid!");
    return kMessages[lang][index];
}

// @yo2 0x00606ec0 checkDiskSpace
void checkDiskSpace() {
    if (yo2DiskSpaceAtLeast(kRequiredDiskBytes))
        return;
    char text[0x400];
    std::snprintf(text, sizeof text, appMessage(0), 600u);
    yo2MessageBox(text, "Yu-Gi-Oh! ONLINE");
    yo2ExitProcess(0);
}

// @yo2 0x006071d0 appVersion
int32_t appVersion() { return g_appVersion; }

// @yo2 0x006071f0 appVersionTimeout
int32_t appVersionTimeout() { return (appVersion() + 11) * 100; }

// The shared data directory the installer records in the registry, and whether it exists.
struct CCommonDir {
    vc6::string path;    // 0x00
    bool exists = false;  // 0x10
    bool check();
};
// @yo2 0x00603600 static init: g_commonDir
// @yo2 0x006037d0 static init: empty
// @yo2 0x006037f0 static init: atexit(delete g_commonDir)
// @yo2 0x00603860 CCommonDir::~CCommonDir
static CCommonDir g_commonDir;  // DAT_0126fb54

// @yo2 0x006038b0 CCommonDir::check: the registry's system\CommonDir names an existing path
bool CCommonDir::check() {
    if (g_registry && g_registry->yo1.readString("system", "CommonDir", path, 0x100) == ERROR_SUCCESS &&
        yo2FileExists(path.c_str()))
        exists = true;
    return exists;
}

// @yo2 0x005996d0 imeDisableTextFrameService: no Text Services Framework UI for this process (imm32's
// ImmDisableTextFrameService(-1), looked up at run time since older Windows lacks it)
static void imeDisableTextFrameService() {
    using Fn = BOOL(WINAPI*)(DWORD);
    FARPROC p = GetProcAddress(LoadLibraryA("imm32.dll"), "ImmDisableTextFrameService");
    if (auto fn = reinterpret_cast<Fn>(reinterpret_cast<void*>(p)))
        fn(0xffffffff);
}

// ---- WinMain / CAppMainWindow ----

// @yo2 0x006069c0 static init: the archive list
// @yo2 0x006069f0 static init: atexit(~archive list)
static std::vector<std::string> s_archives;  // DAT_01270ed0

// @yo2 0x00606ab0 WinMain: yaneSDK start-up, the "merge" archive, then the window's message loop
int yo2WinMain(void* instance, void* prevInstance, const char* cmdLine, int show) {
    yo2AppInitialize(instance, prevInstance, cmdLine, show);
    s_archives.push_back("merge");
    yo2SetFileArchives(s_archives);
    yo2GameTablesInit();
    CAppMainWindow w;
    yo2RunAppWindow(w);
    return 0;
}

// @yo2 0x00606bf0 CAppMainWindow::MainThread: the one CApp, alive while the window is
void CAppMainWindow::mainThread() {
    CApp app;
    app.window_ = yo2CurrentAppWindow();
    app.mainThread();
}

// @yo2 0x0060bde0 CAppMainWindow::OnPreCreate
int32_t CAppMainWindow::onPreCreate(AppWindowOption& opt) {
    opt.caption = "Yu-Gi-Oh! ONLINE 2";
    opt.className = "YUGIOH2APPLICATION";
    opt.width = static_cast<int32_t>(kScreenW);
    opt.height = static_cast<int32_t>(kScreenH);
    opt.style = 0x00ca0000;  // WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX
    return 0;
}

// ---- CRand / CArchive ----

// @yo2 0x00606fc0 CRand::CRand
CRand::CRand() = default;

// @yo2 0x00607110 CRand deleting destructor
CRand::~CRand() = default;

// @yo2 0x00606fa0 static init: g_rand
// @yo2 0x00607190 static init: atexit(~g_rand)
static CRand g_rand;  // DAT_01270ef0

// ---- CApp ----

// @yo2 0x006072b0 CApp::CApp
CApp::CApp() {
    mouse_.setHook(true);
    g_myMouse = &mouse_;
    g_zsortSet = &zsort_;
    YO2_ASSERT(g_app == nullptr, "CAppはSingletonでは?");  // CApp is a singleton
    g_app = this;
    yo2FpsTimerSetFps(30);
    yo2HookWindowMessages(this, true);
    yo2SoundInit();
    captureRequested_ = false;
}

// @yo2 0x00607880 CApp::~CApp
// @yo2 0x00607830 CApp deleting destructor
// @yo2 0x00607860 CZSortSet::~CZSortSet (the CZSort[4] destructor loop)
CApp::~CApp() {
    destroyVia(rootTask_, __LINE__);
    destroyVia(rootElement_, __LINE__);
    destroyVia(debugRootElement_, __LINE__);
    CTask::flushDeleted();
    yo2Delete(lobby_);
    yo2Delete(duel_);
    yo2Delete(gate_);
    yo2Delete(account_);
    yo2Delete(usb_);
    yo2Delete(fbList_);
    delete usbData_;
    lobby_ = nullptr, duel_ = nullptr, gate_ = nullptr, account_ = nullptr, usb_ = nullptr;
    fbList_ = nullptr, usbData_ = nullptr;
    yo2SwfShutdown();
    yo2HookWindowMessages(this, false);
    g_app = nullptr;
    g_zsortSet = nullptr;
}

// @yo2 0x00607220 CApp::rootTask
CTask* CApp::rootTask() const { return dynamic_cast<CTask*>(rootTask_.task()); }

// @yo2 0x00607250 CApp::rootElement (the scene layer)
CElement* CApp::rootElement() const { return dynamic_cast<CElement*>(rootElement_.task()); }

// @yo2 0x00607280 CApp::debugRootElement
CElement* CApp::debugRootElement() const { return dynamic_cast<CElement*>(debugRootElement_.task()); }

// @yo2 0x0060a3f0 CApp::CreateRootTask
CTask* CApp::makeRootTask() {
    if (rootTask())
        return rootTask();
    CTask* t = CTask::createRoot();
    YO2_ASSERT(t != nullptr, "RootTaskのCreateに失敗");  // creating the root task failed
    t->setInstName("ルートタスク");                       // "root task"
    return t;
}

// @yo2 0x0060a670 CApp::CreateRootElement
CElement* CApp::makeRootElement() {
    if (rootElement())
        return rootElement();
    CElement* e = CElement::createRoot();
    YO2_ASSERT(e != nullptr, "RootElementのCreateに失敗");  // creating the root element failed
    e->setInstName("ルートエレメント");                       // "root element"
    return e;
}

// @yo2 0x0060a8f0 CApp::CreateDebugRootElement: under the root element, drawn over everything
CElement* CApp::makeDebugRootElement() {
    if (debugRootElement())
        return debugRootElement();
    CElement* e = CElement::newChild(rootElement(), 10000);
    YO2_ASSERT(e != nullptr, "DebugRootElementのCreateに失敗");
    e->setInstName("デバッグ用ルートエレメント/CApp::m_pDebugRootElement");  // "debug root element"
    return e;
}

// @yo2 0x0060ab90 CApp::CreateCamera: centred on the screen, far up the z axis, y pointing down
// @yo2 0x0060aee0 CTmUpdateMatrix deleting destructor
// @yo2 0x0060af10 CTmUpdateMatrix::~CTmUpdateMatrix
COrthoCamera* CApp::makeCamera() {
    COrthoCamera* c = COrthoCamera::newChild(rootElement(), 10000);
    YO2_ASSERT(c != nullptr, "OrthoCameraのCreateに失敗");
    c->setInstName("メインカメラ");  // "main camera"
    c->pos_ = {kScreenW / 2, kScreenH / 2, 63008.0f};
    c->rot_ = {3.14159274f, 0, 0};
    CTaskMessage update(TM_UPDATE_MATRIX, true);
    c->call(&update);
    Mat4 m = c->world_;
    m.m[1][1] = -1.0f;
    m.m[1][2] = 0;
    m.m[2][1] = 0;
    m.m[2][2] = -1.0f;
    c->world_ = m;
    c->matrixLocked_ = true;
    c->setFar(65008.0f);
    c->setNear(1.0f);
    c->setSize(kScreenW, kScreenH);
    return c;
}

// @yo2 0x0060b190 CApp::CreateInfoText: the mouse-position readout in the lower right (unused)
CElement* CApp::makeInfoText() {
    CElement* t = CTextElm::newChild(debugRootElement(), 10000);
    YO2_ASSERT(t != nullptr, "InfoText生成失敗");
    t->setInstName("右下のマウス位置とか");  // "the mouse position etc., lower right"
    t->pos_ = {750.0f, 680.0f, camera_->pos_.z - camera_->nearZ() - 1.0f};
    t->color_[0] = 1.0f;
    t->color_[1] = 0.3f;
    t->color_[2] = 0.2f;
    t->color_[3] = 1.0f;
    return t;
}

// @yo2 0x0060bc00 CApp::saveScreen: the back buffer into the surface requestCapture() gave
void CApp::saveScreen() {
    IDirect3DSurface8* back = nullptr;
    HRESULT hr = g_d3d->device()->GetBackBuffer(0, D3DBACKBUFFER_TYPE_MONO, &back);
    YO2_ASSERT(hr >= 0, "error GetBackBuffer");
    RECT r{0, 0, static_cast<int32_t>(kScreenW), static_cast<int32_t>(kScreenH)};
    D3DXLoadSurfaceFromSurface(captureSurface_, nullptr, &r, back, nullptr, &r, D3DX_FILTER_NONE, 0);
    back->Release();
    if (captureSurface_)
        captureSurface_->Release();
}

// @yo2 0x006099c0 CApp::GameStep: input, then TM_MAIN through the task tree and the element tree
// @yo2 0x00609ee0 CTmMain deleting destructor (the step's local message)
// @yo2 0x00609f10 CTmMain::~CTmMain
bool CApp::gameStep() {
    mouse_.update();
    yo2KeyUpdate();
    yo2SwfUpdate();
    CTask::flushDeleted();
    CTask::clearMainOrder();
    CTmMain tick;
    yo2TestHookBegin();
    rootTask_.get()->call(&tick);
    yo2TestHookEnd();
    yo2TestHookBegin();
    rootElement_.get()->call(&tick);
    yo2TestHookEnd();
    if (captureRequested_) {
        saveScreen();
        captureRequested_ = false;
    }
    return true;
}

// @yo2 0x00609f50 CApp::WndProc: the server sockets, activation, and the keys/IME messages Windows must not see
int32_t CApp::wndProc(HWND wnd, uint32_t msg, uintptr_t wParam, intptr_t lParam) {
    g_windowFactory->dispatch(msg, static_cast<uint32_t>(wParam), static_cast<uint32_t>(lParam));
    switch (msg) {
    case kWmImeSetContext:  // the IME's own windows stay hidden (ISC_SHOWUI* bits cleared)
        yo2DefWindowProc(wnd, msg, wParam, lParam & 0x3ffffff0);
        return 1;
    case kWmActivateApp:
        active_ = wParam != 0;
        yo2SwfSetActive(wParam != 0);
        return 0;
    case kWmSysKeyDown:  // Alt+F4 doesn't close the game
        return wParam == kVkF4 ? 1 : 0;
    case kWmSysCommand:
        return wParam == kScScreenSave ? 1 : 0;
    case kWmImeNotify:
        return wParam != 0 && wParam < 6 ? 1 : 0;
    case WM_SOCKET:
        dispatchSocket(wParam);
        return 0;
    default:
        return 0;
    }
}

// The socket message to its connection: receive, or report and close a connection the server dropped.
void CApp::dispatchSocket(uintptr_t socket) {
    CMessageIOBase* io[5] = {yo2NetIo(gate_), yo2NetIo(account_), yo2NetIo(lobby_), yo2NetIo(duel_),
                             yo2NetIo(usb_)};
    static const char* const kCut[5] = {"ゲートサーバに斬られた・・・\n", "アカウントサーバに斬られた・・・\n",
                                        "ロビーサーバに斬られた・・・\n", "デュエルサーバに斬られた・・・\n",
                                        "ＵＳＢサーバに斬られた・・・\n"};
    static const char* const kAsked[5] = {
        "要求どおりに切断された。(ゲートサーバ)\n", "要求どおりに切断された。(アカウントサーバ)\n",
        "要求どおりに切断された。(ロビーサーバ)\n", "要求どおりに切断された。(デュエルサーバ)\n",
        "要求どおりに切断された。(ＵＳＢサーバ)\n"};
    for (int i = GATE; i <= USB; ++i) {
        if (!yo2NetIsSocket(io[i], socket))
            continue;
        int32_t r = yo2NetRecv(io[i]);
        if (r == 0) {
            yo2NetOnReceive(io[i]);
        } else if (r != kNetPending && r == kNetClosed) {
            bool asked = yo2NetByeSent(io[i]);
            yo2Trace(asked ? kAsked[i] : kCut[i]);  // "cut off by the server" / "closed as we asked"
            if (!asked && (i == LOBBY || i == DUEL)) {
                disconnectedFrom_ = i == LOBBY ? 1 : 2;
                disconnected_ = true;
            }
            yo2NetDisconnect(io[i]);
        }
        return;
    }
}

// The command line's start scene: -patch the patcher, -logo the logo (after restoring yo2.exe), the test scenes,
// and the patcher by default.
bool CApp::startScene(const std::string& cmdLine) {
    CSceneMng* mng = CSceneMng::newChild(rootTask(), 10000);
    YO2_ASSERT(mng != nullptr, "SceneMng生成失敗");  // creating the scene manager failed
    mng->setInstName("シーンマネージャ");              // "scene manager"
    auto has = [&](const char* s) { return cmdLine.find(s) != std::string::npos; };
    int32_t scene = SCENE_PATCHER;
    if (has("-patch")) {
        scene = SCENE_PATCHER;
    } else if (has("-logo")) {
        restoreExeFromBin();
        scene = SCENE_LOGO;
    } else if (has("-map")) {
        scene = SCENE_MAP_TEST;
    } else if (has("-avatar")) {
        scene = SCENE_AVATAR_TEST;
    } else if (has("-title")) {
        scene = SCENE_TITLE;
    } else if (has("-test")) {
        scene = SCENE_ENTRY;
    }
    mng->change(scene, CSceneMng::FADE_WAIT, true);
    return true;
}

// @yo2 0x00607fd0 CApp::MainThread: start-up, then the frame loop until the window closes
void CApp::mainThread() {
    checkDiskSpace();
    yo2SeedRandom();
    std::string cmdLine = yo2AppCommandLine();
    g_commonDir.check();
    unkC7c_ = false;
    g_systemConfig->load();
    if (cmdLine.find("-allowall") != std::string::npos)
        g_systemConfig->clearRestrictions();
    disconnected_ = false;
    disconnectedFrom_ = 0;
    gate_ = yo2NewNetGate();
    account_ = yo2NewNetAccount();
    lobby_ = yo2NewNetLobby();
    duel_ = yo2NewNetDuel();
    usb_ = yo2NewNetUsb();

    yo2ApplyWindowMode(g_systemConfig->fullscreen());
    if (!g_d3d->initialize(yo2AppWindowHandle(), static_cast<UINT>(kScreenW), static_cast<UINT>(kScreenH),
                           g_systemConfig->fullscreen())) {
        // no device in this mode: next time start windowed
        g_systemConfig->setFullscreen(false);
        g_systemConfig->save();
        return;
    }
    if (g_registry)
        g_registry->usb.writeString("", "path", (yo2CurrentDirectory() + "\\yo2.exe").c_str());
    if (g_registry) {
        DWORD size = 0x100;
        if (g_registry->yo2.readDword("system", "fonttexturesize", size) == ERROR_SUCCESS)
            setTextPageSize(static_cast<int32_t>(size), static_cast<int32_t>(size));
    }
    fbList_ = yo2NewFBlistManager();
    bool dolby = g_systemConfig->dolby();
    yo2SwfInit("Sound", g_systemConfig->volume(), dolby);
    imeDisableTextFrameService();

    rootTask_.setUser(this);
    rootTask_.set(makeRootTask());
    rootElement_.setUser(this);
    rootElement_.set(makeRootElement());
    debugRootElement_.setUser(this);
    debugRootElement_.set(makeDebugRootElement());
    checkDisconnect_ = yo2NewCheckDisconnectTask(rootTask(), rootElement());
    YO2_ASSERT(checkDisconnect_ != nullptr, "error CCheckDisconnectTask::Create()");
    checkDisconnect_->setInstName("接続エラーチェッカ");  // "connection error checker"

    camera_ = makeCamera();
    studio_ = g_studioMng.addStudio(1000);
    for (int i = 0; i < 4; ++i)
        studio_->clear_[i] = g_mainClearColor[i];
    for (CZSort& q : zsort_.layer)
        studio_->addLayer(&q);
    studio_->camera_ = camera_;
    studio_->useBackBuffer();

    mouseMng_ = CMouseManager::newChild(rootElement());
    YO2_ASSERT(mouseMng_ != nullptr, "errror CMouseManager::Create()");
    mouseMng_->setInstName("マウスマネージャ");  // "mouse manager"
    mouseMng_->setCursor(yo2NewHandCursor());
    CWindowTaskDebug::create(rootTask());
    applyWindowTagStyles(g_windowFactory->tags_);
    running_ = false;
    usbData_ = new CUsbDataIO;

    if (!CSceneMng::instance())
        startScene(cmdLine);
    bool made = yo2NewGameMng(rootTask(), 10000);
    YO2_ASSERT(made, "error CGameMng::Create()");
    static const char kRooms[] = "ABCDEFGH";
    for (int i = 0; i < 8; ++i) {
        char opt[16];
        std::snprintf(opt, sizeof opt, "-myroom%c", kRooms[i]);
        if (cmdLine.find(opt) != std::string::npos)
            myroomIndex_ = i;
    }
    frameLimit_ = true;
    running_ = true;
    frameLoop();
}

// The frame loop. With the limiter: a step every 33 ms; a step that finishes inside its slot is rendered, a late
// one isn't (its queued draws are dropped) unless 10 have been dropped in a row. Without it the CFPSTimer paces.
void CApp::frameLoop() {
    constexpr uint32_t kRenderedFramesSecond = 1000;
    yo2TimerResolution(true);
    nextFrame_ = yo2TimeMs() + FRAME_MS;
    skipped_ = 0;
    fpsStart_ = yo2TimeMs();
    frames_ = 0;
    sleepMs_ = 0;
    while (yo2AppPumpMessages()) {
        yo2TestHookBegin();
        if (frameLimit_) {
            uint32_t now = yo2TimeMs();
            if (now < nextFrame_) {
                skipped_ = 0;
                yo2Sleep(1);
            } else {
                if (!gameStep())
                    break;
                now = yo2TimeMs();
                if (now < nextFrame_ + FRAME_MS) {
                    g_studioMng.render();
                    yo2Sleep(sleepMs_);
                    skipped_ = 0;
                    ++frames_;
                    nextFrame_ += FRAME_MS;
                } else if (++skipped_ > MAX_SKIPPED_FRAMES) {
                    skipped_ = 0;
                    g_studioMng.render();
                    yo2Sleep(sleepMs_);
                    nextFrame_ = now + FRAME_MS;
                    ++frames_;
                } else {
                    for (CZSort& q : g_app->zsort_.layer)
                        q.clear();
                    nextFrame_ += FRAME_MS;
                }
            }
            if (fpsStart_ + kRenderedFramesSecond < now) {
                fps_ = static_cast<int32_t>(static_cast<uint32_t>(frames_ * 1000) / (now - fpsStart_));
                frames_ = 0;
                fpsStart_ = now;
            }
        } else {
            gameStep();
            g_studioMng.render();
            yo2FpsTimerWaitFrame();
            fps_ = yo2FpsTimerFps();
        }
        yo2TestHookEnd();
    }
    yo2TimerResolution(false);
}

struct CApp::Layout {
    YO2_AT(CApp, window_, 0x004);
    YO2_AT(CApp, active_, 0x010);
    YO2_AT(CApp, yaneFpsTimer_, 0x014);
    YO2_AT(CApp, captureRequested_, 0x140);
    YO2_AT(CApp, captureSurface_, 0x144);
    YO2_AT(CApp, mouse_, 0x148);
    YO2_AT(CApp, yaneKey_, 0x184);
    YO2_AT(CApp, zsort_, 0xb7c);
    YO2_AT(CApp, studio_, 0xc1c);
    YO2_AT(CApp, rootTask_, 0xc20);
    YO2_AT(CApp, rootElement_, 0xc2c);
    YO2_AT(CApp, debugRootElement_, 0xc38);
    YO2_AT(CApp, camera_, 0xc48);
    YO2_AT(CApp, mouseMng_, 0xc4c);
    YO2_AT(CApp, fbList_, 0xc50);
    YO2_AT(CApp, disconnected_, 0xc54);
    YO2_AT(CApp, disconnectedFrom_, 0xc58);
    YO2_AT(CApp, usbData_, 0xc5c);
    YO2_AT(CApp, myroomIndex_, 0xc60);
    YO2_AT(CApp, gate_, 0xc64);
    YO2_AT(CApp, usb_, 0xc74);
    YO2_AT(CApp, checkDisconnect_, 0xc78);
    YO2_AT(CApp, unkC7c_, 0xc7c);
    YO2_AT(CApp, frameLimit_, 0xc7d);
    YO2_AT(CApp, skipped_, 0xc84);
    YO2_AT(CApp, nextFrame_, 0xc88);
    YO2_AT(CApp, fps_, 0xc94);
    YO2_AT(CApp, running_, 0xc9c);
};
