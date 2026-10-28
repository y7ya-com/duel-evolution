// yo2App.cpp: the application shell. WinMain hands control to yaneSDK, which creates the window (CAppMainWindow)
// and runs CAppMainWindow::mainThread on its own thread; that builds the one CApp and runs CApp::mainThread: the
// start-up (config, network objects, Direct3D, the root task and element trees, camera, studio, mouse, scene and
// game managers) and then the frame loop. A frame is gameStep() (input, then TM_MAIN through the task tree and
// the element tree, which queues the draws) and the studio's render; with the frame limiter on it runs at 30 fps
// (33 ms), dropping the render of up to 10 late frames in a row.
//
// CApp is reached everywhere through g_app, and other folders read its members by offset (the mouse at 0x148, the
// draw queues at 0xb7c, the network objects at 0xc64..), so its layout is the exe's.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "CD3DDevice.h"
#include "yo2Element.h"
#include "yo2MouseTask.h"
#include "yo2TaskPtr.h"
#include "yo2ZSort.h"

class AtConverter;
class COrthoCamera;
class CStudio;
class CUsbDataIO;
// Other folders' objects CApp creates and owns.
class CNetGate;
class CNetAccount;
class CNetLobby;
class CNetDuel;
class CNetUsb;
class CFBlistManager;

// ---- what this file calls outside System (tests: tests/system/stubs.cpp) ----

// yaneSDK's start-up and window side.
void yo2AppInitialize(void* instance, void* prevInstance, const char* cmdLine, int show);  // CAppInitializer::Init
const char* yo2AppCommandLine();                                    // DAT_00d450a8 (lpCmdLine)
void yo2SetFileArchives(const std::vector<std::string>& names);     // CFile's archive list (DAT_00d49598)
void* yo2CurrentAppWindow();                                        // 0x0042cc50: the thread's CAppBase
HWND yo2AppWindowHandle();                                          // the game window's HWND (DAT_00d450a0 + 0x1c)
void yo2ApplyWindowMode(bool fullscreen);                           // 0x005825c0 CWindow style/position switch
bool yo2AppPumpMessages();                                          // 0x0042b8a0: false once the window closed
intptr_t yo2DefWindowProc(HWND wnd, uint32_t msg, uintptr_t wParam, intptr_t lParam);
void yo2HookWindowMessages(class CApp* app, bool on);               // 0x0042bd00 / 0x0042bd30 (CAppManager hooks)
// yaneSDK CFPSTimer (CApp+0x14) and CKey (CApp+0x184).
void yo2FpsTimerSetFps(int32_t fps);                                // 0x005304c0
void yo2FpsTimerWaitFrame();                                        // 0x00530600
int32_t yo2FpsTimerFps();                                           // 0x005307d0
void yo2KeyUpdate();                                                // 0x00580a90
// Win32 / CRT.
uint32_t yo2TimeMs();                                               // timeGetTime
void yo2Sleep(uint32_t ms);
void yo2TimerResolution(bool fine);                                 // timeBeginPeriod(1) / timeEndPeriod(1)
bool yo2FileSize(const char* name, uint32_t& size);                 // _stat
void yo2CopyFile(const char* from, const char* to);                 // CopyFileA, overwriting
std::string yo2CurrentDirectory();                                  // _getcwd
void yo2SeedRandom();                                               // srand(time(NULL))
void yo2MessageBox(const char* text, const char* caption);          // MessageBoxA(NULL, .., MB_SYSTEMMODAL)
[[noreturn]] void yo2ExitProcess(int code);                         // _exit
int32_t yo2ResourceLanguage();                                      // atoi(LoadString(hInstance, 1))
bool yo2DiskSpaceAtLeast(uint64_t bytes);                           // 0x0069f820 GetDiskFreeSpaceEx (Net)
// Other folders.
void yo2SoundInit();                                                // 0x0068b3e0 (Sound)
void yo2SwfInit(const char* soundDir, int32_t volume, bool dolby);  // 0x00685a60 (Swf)
void yo2SwfUpdate();                                                // 0x006863a0
void yo2SwfShutdown();                                              // 0x00686360
void yo2SwfSetActive(bool active);                                  // 0x006863d0 (WM_ACTIVATEAPP)
void yo2GameTablesInit();                                           // 0x009c9730 (Game): one-time static tables
CNetGate* yo2NewNetGate();                                          // 0x0069a210
CNetAccount* yo2NewNetAccount();                                    // 0x0068e040
CNetLobby* yo2NewNetLobby();                                        // 0x006aa2e0
CNetDuel* yo2NewNetDuel();                                          // 0x00691050
CNetUsb* yo2NewNetUsb();                                            // 0x006d59b0
CFBlistManager* yo2NewFBlistManager();                              // 0x0085dac0 (Lobby)
void yo2Delete(CNetGate*);
void yo2Delete(CNetAccount*);
void yo2Delete(CNetLobby*);
void yo2Delete(CNetDuel*);
void yo2Delete(CNetUsb*);
void yo2Delete(CFBlistManager*);
// CMessageIOBase, the five connections' base (Net): isSocket (0x0068cfb0), recv (0x0068cec0), the receive handler
// (vtable slot 2), byeSent (+0xe4: we asked to close) and disconnect (0x0068cdf0).
struct CMessageIOBase;
CMessageIOBase* yo2NetIo(CNetGate*);
CMessageIOBase* yo2NetIo(CNetAccount*);
CMessageIOBase* yo2NetIo(CNetLobby*);
CMessageIOBase* yo2NetIo(CNetDuel*);
CMessageIOBase* yo2NetIo(CNetUsb*);
bool yo2NetIsSocket(CMessageIOBase* io, uintptr_t socket);
int32_t yo2NetRecv(CMessageIOBase* io);
void yo2NetOnReceive(CMessageIOBase* io);
bool yo2NetByeSent(CMessageIOBase* io);
void yo2NetDisconnect(CMessageIOBase* io);
CTask* yo2NewCheckDisconnectTask(CTask* parent, CElement* layer);   // CCheckDisconnectTask::Create (0x0069bd80)
bool yo2NewGameMng(CTask* parent, uint32_t priority);               // CGameMng::Create (0x00a54850)
void yo2TestHookBegin();                                            // 0x00646380 (Test): empty in the shipped exe
void yo2TestHookEnd();                                              // 0x006463c0

// ---- the app ----

// yaneSDK's CAppFrame and CWinHook as CApp sees them: the frame's thread body, and the window-message hook.
class YaneAppFrame {
public:
    virtual ~YaneAppFrame() = default;
    virtual void mainThread() = 0;
    void* window_ = nullptr;  // 0x04 the CAppBase running us
};
class YaneWinHook {
public:
    virtual int32_t wndProc(HWND wnd, uint32_t msg, uintptr_t wParam, intptr_t lParam) = 0;
};

class CApp : public YaneAppFrame, public YaneWinHook, public CTaskUser {
public:
    // The five server connections (CNetGate .. CNetUsb), in the order the socket message is matched.
    enum Server : int32_t { GATE, ACCOUNT, LOBBY, DUEL, USB };
    enum : uint32_t { WM_SOCKET = 0x1401 };
    enum : uint32_t { FRAME_MS = 33, MAX_SKIPPED_FRAMES = 10 };

    CApp();
    ~CApp() override;
    void mainThread() override;
    int32_t wndProc(HWND wnd, uint32_t msg, uintptr_t wParam, intptr_t lParam) override;

    bool gameStep();
    CTask* rootTask() const;
    CElement* rootElement() const;
    CElement* debugRootElement() const;
    CMyMouseEx& mouse() { return mouse_; }
    CZSortSet& zsort() { return zsort_; }
    COrthoCamera* camera() const { return camera_; }
    CMouseManager* mouseManager() const { return mouseMng_; }
    CStudio* studio() const { return studio_; }
    int32_t fps() const { return fps_; }
    bool active() const { return active_; }
    // The frame loop runs once more and saves the back buffer into captureSurface_.
    void requestCapture(IDirect3DSurface8* target) {
        captureSurface_ = target;
        captureRequested_ = true;
    }
    bool disconnected() const { return disconnected_; }
    int32_t myroomIndex() const { return myroomIndex_; }

private:
    CTask* makeRootTask();
    CElement* makeRootElement();
    CElement* makeDebugRootElement();
    COrthoCamera* makeCamera();
    CElement* makeInfoText();
    void saveScreen();
    bool startScene(const std::string& cmdLine);
    void frameLoop();
    void dispatchSocket(uintptr_t socket);

    bool active_ = false;                  // 0x010 the application is the active one (WM_ACTIVATEAPP)
    [[maybe_unused]] alignas(4) uint8_t yaneFpsTimer_[0x12c] = {};     // 0x014 yaneSDK CFPSTimer (the port keeps its state in the platform)
    bool captureRequested_ = false;        // 0x140
    IDirect3DSurface8* captureSurface_ = nullptr;  // 0x144
    CMyMouseEx mouse_;                     // 0x148
    [[maybe_unused]] alignas(4) uint8_t yaneKey_[0x9f8] = {};          // 0x184 yaneSDK CKey
    CZSortSet zsort_;                      // 0xb7c BACK / NONE / MIDDLE / FRONT
    CStudio* studio_ = nullptr;            // 0xc1c the main studio
    CTaskPtr<CTask> rootTask_;             // 0xc20 "ルートタスク"
    CTaskPtr<CElement> rootElement_;       // 0xc2c the scene layer
    CTaskPtr<CElement> debugRootElement_;  // 0xc38 "CApp::m_pDebugRootElement"
    [[maybe_unused]] uint32_t unkC44_ = 0;                  // 0xc44
    COrthoCamera* camera_ = nullptr;       // 0xc48 "メインカメラ"
    CMouseManager* mouseMng_ = nullptr;    // 0xc4c
    CFBlistManager* fbList_ = nullptr;     // 0xc50
    bool disconnected_ = false;            // 0xc54 the lobby or duel server closed on us
    int32_t disconnectedFrom_ = 0;         // 0xc58 1 = lobby, 2 = duel
    CUsbDataIO* usbData_ = nullptr;        // 0xc5c
    int32_t myroomIndex_ = -1;             // 0xc60 n of "-myroomA".."-myroomH" on the command line
    CNetGate* gate_ = nullptr;             // 0xc64
    CNetAccount* account_ = nullptr;       // 0xc68
    CNetLobby* lobby_ = nullptr;           // 0xc6c
    CNetDuel* duel_ = nullptr;             // 0xc70
    CNetUsb* usb_ = nullptr;               // 0xc74
    CTask* checkDisconnect_ = nullptr;     // 0xc78 a CCheckDisconnectTask
    [[maybe_unused]] bool unkC7c_ = false;                  // 0xc7c
    bool frameLimit_ = false;              // 0xc7d the 33 ms limiter (else the CFPSTimer paces)
    [[maybe_unused]] uint32_t unkC80_ = 0;                  // 0xc80
    uint32_t skipped_ = 0;                 // 0xc84 renders dropped in a row
    uint32_t nextFrame_ = 0;               // 0xc88 timeGetTime of the next frame
    uint32_t fpsStart_ = 0;                // 0xc8c
    int32_t frames_ = 0;                   // 0xc90 rendered since fpsStart_
    int32_t fps_ = 0;                      // 0xc94
    uint32_t sleepMs_ = 0;                 // 0xc98 after each render
    bool running_ = false;                 // 0xc9c start-up finished
    struct Layout;
};
YO2_SIZEOF(CApp, 0xca0);

extern CApp* g_app;            // DAT_012711ac
extern CMyMouseEx* g_myMouse;  // DAT_012714bc, g_app's mouse

// The process-wide archive list and the window class CAppMainWindow (yaneSDK CAppBase): its thread runs one CApp.
struct AppWindowOption {  // yaneSDK CWindowOption, the fields onPreCreate fills
    vc6::string caption;   // 0x00
    vc6::string className; // 0x10
    int32_t width = 0;     // 0x20
    int32_t height = 0;    // 0x24
    uint32_t style = 0;    // 0x28
};
class CAppMainWindow {
public:
    // @yo2 0x00606c80 CAppMainWindow deleting destructor (the second base's thunk)
    virtual ~CAppMainWindow() = default;
    virtual void mainThread();
    virtual int32_t onPreCreate(AppWindowOption& opt);
};
void yo2RunAppWindow(CAppMainWindow& w);  // CAppBase::Run: create the window (onPreCreate), run mainThread
int yo2WinMain(void* instance, void* prevInstance, const char* cmdLine, int show);

// CRand / CArchive: yaneSDK-style helpers the exe keeps in yo2App.obj.
class CArchive {
public:
    // @yo2 0x00607160 CArchive deleting destructor
    virtual ~CArchive() = default;
};
class CRand : public CArchive {
public:
    CRand();
    ~CRand() override;

private:
    [[maybe_unused]] uint32_t state_[624] = {};  // 0x004 a Mersenne twister (only construction survives in the exe)
    [[maybe_unused]] int32_t index_ = 625;       // 0x9c4 N + 1: not seeded
};
YO2_SIZEOF(CRand, 0x9c8);

// CUsbDataIO: the USB duel-pass reader's buffer (0x11c bytes); CApp only creates and deletes it.
class CUsbDataIO {
public:
    // @yo2 0x00609920 CUsbDataIO deleting destructor
    virtual ~CUsbDataIO() = default;
    uint32_t data_[0x45] = {};  // 0x004
    int32_t unk118_ = -1;       // 0x118
};
YO2_SIZEOF(CUsbDataIO, 0x11c);

// One message per language (index = the exe's resource string 1), formatted by the caller.
const char* appMessage(int32_t index);
// The free-space check at start-up: 600 MB, or a message box and exit.
void checkDiskSpace();
// "-logo" start: when the patcher left a yo2.bin that differs from yo2.exe, copy it over.
void restoreExeFromBin();
int32_t appVersion();
// The duel module's frame timing: (version + 11) * 100.
int32_t appVersionTimeout();
