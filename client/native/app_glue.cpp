// System's calls to the outside world, implemented on yaneSDK and the platform for the native exe: the "yaneSDK side"
// and "Win32 / CRT" parts of src/System/yo2App.h, and System/yo2File.h. Each does what the exe's call there does.
// The yo2App.h half compiles only once that header exists (it's on phase2-system, not yet on main).
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <unistd.h>

#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <string>
#include <vector>

#include "System/yo2File.h"
#include "yane_glue.h"

// yaneSDK's CFile::Read: loose files first, then the archives in the path list (merge.dat)
bool yo2LoadFile(const char* name, std::vector<uint8_t>& out) {
    return yaneReadFile(name, [](void* user, const void* data, uint32_t size) {
        auto* v = (std::vector<uint8_t>*)user;
        v->assign((const uint8_t*)data, (const uint8_t*)data + size);
    }, &out);
}

#if __has_include("System/yo2App.h")
#include <windows.h>
#include <mmsystem.h>

#include "Game/Avatar/yo2ChibiAvatarElm.h"
#include "System/yo2App.h"
#include "platform.h"

void yo2AppInitialize(void* instance, void* prev, const char* cmdLine, int show) { yaneInit(instance, prev, cmdLine, show); }
const char* yo2AppCommandLine() { return yaneCmdLine(); }

void yo2SetFileArchives(const std::vector<std::string>& names) {
    std::vector<const char*> p;
    for (const std::string& n : names) p.push_back(n.c_str());
    yaneSetPathList(p.data(), (int)p.size());
}

void yo2RunAppWindow(CAppMainWindow& w) {
    yaneRunApp(
        [](void* user, YaneWindowSpec* out) {
            static AppWindowOption opt;   // the strings must outlive the call
            ((CAppMainWindow*)user)->onPreCreate(opt);
            *out = YaneWindowSpec{opt.caption.c_str(), opt.className.c_str(), opt.width, opt.height, opt.style};
        },
        [](void* user) { ((CAppMainWindow*)user)->mainThread(); }, &w);
}

void* yo2CurrentAppWindow() { return yaneCurrentApp(); }
HWND yo2AppWindowHandle() { return (HWND)yaneAppHwnd(); }
void yo2ApplyWindowMode(bool fullscreen) { platformSetFullscreen(fullscreen); }
bool yo2AppPumpMessages() { return yanePump(); }
intptr_t yo2DefWindowProc(HWND wnd, uint32_t msg, uintptr_t wParam, intptr_t lParam) {
    return DefWindowProcA(wnd, msg, wParam, lParam);
}

// CApp is a CWinHook on the main window (CAppInitializer::Hook / Unhook)
void yo2HookWindowMessages(CApp* app, bool on) {
    static void* hook;
    if (on && !hook) {
        hook = yaneHook([](void* user, void* hwnd, uint32_t msg, uintptr_t wp, intptr_t lp) -> intptr_t {
            return ((CApp*)user)->wndProc((HWND)hwnd, msg, wp, lp);
        }, app);
    } else if (!on && hook) {
        yaneUnhook(hook);
        hook = nullptr;
    }
}

void yo2FpsTimerSetFps(int32_t fps) { yaneFpsSet(fps); }
void yo2FpsTimerWaitFrame() { yaneFpsWait(); }
int32_t yo2FpsTimerFps() { return yaneFpsGet(); }
void yo2KeyUpdate() { yaneKeyUpdate(); }

uint32_t yo2TimeMs() { return timeGetTime(); }
void yo2Sleep(uint32_t ms) { Sleep(ms); }
void yo2TimerResolution(bool) {}   // timeBeginPeriod(1): the platform's timers are already 1 ms
bool yo2FileSize(const char* name, uint32_t& size) {
    struct stat st;
    if (stat(name, &st) != 0) return false;
    size = (uint32_t)st.st_size;
    return true;
}
void yo2CopyFile(const char* from, const char* to) {
    std::error_code ec;
    std::filesystem::copy_file(from, to, std::filesystem::copy_options::overwrite_existing, ec);
}
std::string yo2CurrentDirectory() {
    char buf[1024];
    return getcwd(buf, sizeof buf) ? buf : "";
}
void yo2SeedRandom() { srand((unsigned)time(nullptr)); }
void yo2MessageBox(const char* text, const char* caption) { MessageBoxA(nullptr, text, caption, 0x1000 /*MB_SYSTEMMODAL*/); }
void yo2ExitProcess(int code) { _exit(code); }

// LoadString(hInstance, 1): the exe has one per language; Windows picks the user's (the shim's GetSystemDefaultLangID)
int32_t yo2ResourceLanguage() {
    switch (GetSystemDefaultLangID()) {
    case 0x411: return 0;   // Japanese
    case 0x407: return 2;   // German
    case 0x40c: return 3;   // French
    case 0x410: return 4;   // Italian
    case 0xc0a: return 5;   // Spanish
    case 0x412: return 6;   // Korean
    default: return 1;      // English (0x409, and Windows' fallback)
    }
}

// 0x0069f820: GetDiskFreeSpaceEx on the current drive >= bytes
bool yo2DiskSpaceAtLeast(uint64_t bytes) {
    struct statvfs v;
    return statvfs(".", &v) != 0 || (uint64_t)v.f_bavail * v.f_frsize >= bytes;   // unknown: don't block the start
}

// 0x009c9730 is CChibiAvatarElm::loadMotions (src/Game)
void yo2GameTablesInit() { CChibiAvatarElm::loadMotions(); }
#endif
