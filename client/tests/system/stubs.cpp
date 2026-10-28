// Stand-ins for what src/System calls in other folders (or in System files not written yet), linked into the
// System tests only.
#include "System/yo2SceneManager.h"

int g_fakeFaderState;

CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return g_fakeFaderState == 3; }
bool screenFaderIdle(CElement*) { return g_fakeFaderState == 0; }

CElement* g_fakeSceneLayer;
CElement* appSceneLayer() { return g_fakeSceneLayer; }

#include <map>
#include <string>

#include "System/yo2File.h"

std::map<std::string, std::vector<uint8_t>> g_fakeFiles;
bool yo2LoadFile(const char* name, std::vector<uint8_t>& out) {
    auto it = g_fakeFiles.find(name);
    if (it == g_fakeFiles.end())
        return false;
    out = it->second;
    return true;
}

// ---- yo2SystemConfig / yo2UserConfig seams ----
#include <cstdio>

#include "System/yo2UserConfig.h"

// Plain and encrypted files as text, by name; "encryption" is the identity. Reads split on '\n' and drop a '\r'.
std::map<std::string, std::string> g_fakeTextFiles;
// Registry values by full path (RegQueryValueExA below).
std::map<std::string, std::string> g_fakeRegistry;
// What the language/volume/mkdir seams were last told.
std::string g_fakeConfigLog;
std::string g_fakeMd5Input;

static bool fakeReadLines(const std::map<std::string, std::string>& files, const char* name,
                          std::vector<std::string>& lines) {
    auto it = files.find(name);
    if (it == files.end())
        return false;
    const std::string& t = it->second;
    for (size_t pos = 0; pos < t.size();) {
        size_t nl = t.find('\n', pos);
        std::string line = t.substr(pos, nl == std::string::npos ? std::string::npos : nl - pos);
        if (!line.empty() && line.back() == '\r')
            line.pop_back();
        lines.push_back(line);
        pos = nl == std::string::npos ? t.size() : nl + 1;
    }
    return true;
}

bool yo2FileExists(const char* name) { return g_fakeTextFiles.count(name) || g_fakeFiles.count(name); }
bool yo2ReadTextFileLines(const char* name, std::vector<std::string>& lines) {
    return fakeReadLines(g_fakeTextFiles, name, lines);
}
// The registry: keys are their full paths; a value is "<key path>\\<name>" in g_fakeRegistry, as a string.
#include <set>
#include <windows.h>
LSTATUS RegCreateKeyExA(HKEY, LPCSTR sub, DWORD, LPSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, PHKEY out, LPDWORD) {
    static std::set<std::string> keys;
    *out = reinterpret_cast<HKEY>(const_cast<std::string*>(&*keys.insert(sub).first));
    return ERROR_SUCCESS;
}
static std::string fakeValueName(HKEY key, LPCSTR name) { return *reinterpret_cast<std::string*>(key) + "\\" + name; }
LSTATUS RegQueryValueExA(HKEY key, LPCSTR name, LPDWORD, LPDWORD, LPBYTE data, LPDWORD size) {
    auto it = g_fakeRegistry.find(fakeValueName(key, name));
    if (it == g_fakeRegistry.end())
        return 2;  // ERROR_FILE_NOT_FOUND
    std::memcpy(data, it->second.c_str(), std::min<size_t>(*size, it->second.size() + 1));
    return ERROR_SUCCESS;
}
LSTATUS RegSetValueExA(HKEY key, LPCSTR name, DWORD, DWORD, const BYTE* data, DWORD size) {
    g_fakeRegistry[fakeValueName(key, name)].assign(reinterpret_cast<const char*>(data), size);
    return ERROR_SUCCESS;
}
LSTATUS RegCloseKey(HKEY) { return ERROR_SUCCESS; }
void yo2MakeDirectory(const char* path) { g_fakeConfigLog += std::string("mkdir(") + path + ")"; }
void yo2SetFileLanguage(char letter, char fallback) {
    g_fakeConfigLog += std::string("file(") + letter + fallback + ")";
}
void yo2SetDuelFileLanguage(char letter, char fallback) {
    g_fakeConfigLog += std::string("duel(") + letter + fallback + ")";
}
void yo2LoadCardText(int32_t language) { g_fakeConfigLog += "card(" + std::to_string(language) + ")"; }
void yo2LoadPackText(int32_t language) { g_fakeConfigLog += "pack(" + std::to_string(language) + ")"; }
void yo2LoadPackInfo() { g_fakeConfigLog += "packinfo"; }
bool yo2SetSoundVolume(uint8_t level) {
    g_fakeConfigLog += "vol(" + std::to_string(level) + ")";
    return true;
}
// Not MD5: a 32-hex-digit FNV-1a spread, enough to tell inputs apart.
void yo2Md5Hex(const void* data, uint32_t size, char out[33]) {
    g_fakeMd5Input.assign(static_cast<const char*>(data), size);
    uint32_t h = 2166136261u;
    for (uint32_t i = 0; i < size; ++i)
        h = (h ^ static_cast<const uint8_t*>(data)[i]) * 16777619u;
    for (int i = 0; i < 4; ++i)
        std::snprintf(out + 8 * i, 9, "%08x", h + i);
}

#include "System/yo2Widen.h"
std::u16string yo2CodePageToUtf16(uint32_t, std::string_view s) { return std::u16string(s.begin(), s.end()); }

bool platformKeyDownVk(int vk);
bool g_fakeKeys[256];
bool platformKeyDownVk(int vk) { return g_fakeKeys[vk & 0xff]; }
#include <windows.h>
#ifndef _WIN32  // (the i686 pass compiles this against the real windows.h)
SHORT GetAsyncKeyState(int vk) { return g_fakeKeys[vk & 0xff] ? SHORT(0x8000) : 0; }
HMODULE LoadLibraryA(LPCSTR) { return nullptr; }  // no DLLs: run-time lookups find nothing
FARPROC GetProcAddress(HMODULE, LPCSTR) { return nullptr; }
#endif

// ---- text: CGlyphOutline's GDI seam, the app's tag converter, narrowing ----
#include <cstdlib>
#include <cstring>

#include "System/yo2TextElm.h"

// Every font is |lfHeight| (16 when 0) pixels high with the ascent 3/4 of it; every glyph a solid
// (h/2 - 1) x (h - 4) box (coverage 64 = full) one pixel below the cell's top, advancing h/2.
int g_fakeFontsAlive;
struct FakeFont {
    int32_t h;
};
void* yo2FontCreate(const GdiLogFont& lf, GdiTextMetric* tm) {
    int32_t h = lf.height ? std::abs(lf.height) : 16;
    *tm = {};
    tm->height = h;
    tm->ascent = h * 3 / 4;
    tm->descent = h - tm->ascent;
    ++g_fakeFontsAlive;
    return new FakeFont{h};
}
void yo2FontDestroy(void* font) {
    if (font) {
        --g_fakeFontsAlive;
        delete static_cast<FakeFont*>(font);
    }
}
uint32_t yo2GlyphOutline(void* font, uint32_t, uint32_t, GdiGlyphMetrics* gm, uint32_t size, void* buf) {
    int32_t h = static_cast<FakeFont*>(font)->h;
    gm->blackBoxX = static_cast<uint32_t>(h / 2 - 1);
    gm->blackBoxY = static_cast<uint32_t>(h - 4);
    gm->originX = 0;
    gm->originY = h * 3 / 4 - 1;
    gm->cellIncX = static_cast<int16_t>(h / 2);
    gm->cellIncY = 0;
    uint32_t bytes = ((gm->blackBoxX + 3) & ~3u) * gm->blackBoxY;
    if (buf && size >= bytes)
        std::memset(buf, 64, bytes);
    return bytes;
}


std::string yo2Utf16ToCodePage(uint32_t, std::u16string_view s) {
    std::string out;
    for (char16_t c : s)
        out += c < 0x80 ? static_cast<char>(c) : '?';
    return out;
}

int32_t g_fakeMouseX, g_fakeMouseY;

// ---- app shell: yaneSDK, Win32 and the other folders yo2App / yo2MouseTask / yo2Studio / yo2FileLoader call ----
#include "System/yo2App.h"
#include "System/yo2Debug.h"
#include "System/yo2FileLoader.h"
#include "System/yo2Studio.h"

std::string g_fakeAppLog;            // what the app seams were asked to do, in order
std::string g_fakeCmdLine;
uint32_t g_fakeTimeMs;               // advanced by yo2Sleep and by g_fakeStepMs per yo2TimeMs call
uint32_t g_fakeStepMs;
int g_fakePumpFrames;                // yo2AppPumpMessages returns true this many times
std::map<std::string, uint32_t> g_fakeFileSizes;
std::map<std::string, std::vector<uint8_t>> g_fakeSaved;
uint32_t g_fakeMouseButtons;         // bit 0 right, bit 1 left (position: g_fakeMouseX/Y above)

void yo2AppInitialize(void*, void*, const char* cmdLine, int) { g_fakeCmdLine = cmdLine; }
const char* yo2AppCommandLine() { return g_fakeCmdLine.c_str(); }
void yo2SetFileArchives(const std::vector<std::string>& names) {
    for (const std::string& n : names)
        g_fakeAppLog += "archive(" + n + ")";
}
void* yo2CurrentAppWindow() { return &g_fakeAppLog; }
HWND yo2AppWindowHandle() { return nullptr; }
void yo2ApplyWindowMode(bool fullscreen) { g_fakeAppLog += fullscreen ? "fullscreen" : "windowed"; }
bool yo2AppPumpMessages() { return g_fakePumpFrames-- > 0; }
intptr_t yo2DefWindowProc(HWND, uint32_t, uintptr_t, intptr_t) { return 0; }
void yo2HookWindowMessages(CApp*, bool on) { g_fakeAppLog += on ? "hook" : "unhook"; }
void yo2FpsTimerSetFps(int32_t) {}
void yo2FpsTimerWaitFrame() {}
int32_t yo2FpsTimerFps() { return 30; }
void yo2KeyUpdate() {}
uint32_t yo2TimeMs() { return g_fakeTimeMs += g_fakeStepMs; }
void yo2Sleep(uint32_t ms) { g_fakeTimeMs += ms; }
void yo2TimerResolution(bool) {}
bool yo2FileSize(const char* name, uint32_t& size) {
    auto it = g_fakeFileSizes.find(name);
    if (it == g_fakeFileSizes.end())
        return false;
    size = it->second;
    return true;
}
void yo2CopyFile(const char* from, const char* to) {
    g_fakeAppLog += std::string("copy(") + from + "," + to + ")";
    g_fakeFileSizes[to] = g_fakeFileSizes[from];
}
std::string yo2CurrentDirectory() { return "C:\\yo2"; }
void yo2SeedRandom() {}
void yo2MessageBox(const char* text, const char*) { g_fakeAppLog += std::string("box(") + text + ")"; }
void yo2ExitProcess(int code) { std::exit(code); }
int32_t yo2ResourceLanguage() { return 1; }
bool yo2DiskSpaceAtLeast(uint64_t) { return true; }
void yo2SoundInit() {}
void yo2SwfInit(const char*, int32_t, bool) {}
void yo2SwfUpdate() {}
void yo2SwfShutdown() {}
void yo2SwfSetActive(bool) {}
void yo2GameTablesInit() {}

// A connection: its socket handle, what recv() returns, and whether we said goodbye.
struct CMessageIOBase {
    uintptr_t sock;
    int32_t recvResult = 0;
    bool bye = false;
    std::string log;
};
class CNetGate : public CMessageIOBase {};
class CNetAccount : public CMessageIOBase {};
class CNetLobby : public CMessageIOBase {};
class CNetDuel : public CMessageIOBase {};
class CNetUsb : public CMessageIOBase {};
class CFBlistManager {};
int g_fakeNetAlive;
CMessageIOBase* g_fakeNets[5];  // the last gate, account, lobby, duel and USB connection made (sockets 100..104)
template <class T>
T* fakeNet(uintptr_t sock) {
    ++g_fakeNetAlive;
    T* n = new T;
    n->sock = sock;
    g_fakeNets[sock - 100] = n;
    return n;
}
CNetGate* yo2NewNetGate() { return fakeNet<CNetGate>(100); }
CNetAccount* yo2NewNetAccount() { return fakeNet<CNetAccount>(101); }
CNetLobby* yo2NewNetLobby() { return fakeNet<CNetLobby>(102); }
CNetDuel* yo2NewNetDuel() { return fakeNet<CNetDuel>(103); }
CNetUsb* yo2NewNetUsb() { return fakeNet<CNetUsb>(104); }
CFBlistManager* yo2NewFBlistManager() {
    ++g_fakeNetAlive;
    return new CFBlistManager;
}
template <class T>
void fakeDelete(T* p) {
    if (p)
        --g_fakeNetAlive;
    delete p;
}
void yo2Delete(CNetGate* p) { fakeDelete(p); }
void yo2Delete(CNetAccount* p) { fakeDelete(p); }
void yo2Delete(CNetLobby* p) { fakeDelete(p); }
void yo2Delete(CNetDuel* p) { fakeDelete(p); }
void yo2Delete(CNetUsb* p) { fakeDelete(p); }
void yo2Delete(CFBlistManager* p) { fakeDelete(p); }
CMessageIOBase* yo2NetIo(CNetGate* p) { return p; }
CMessageIOBase* yo2NetIo(CNetAccount* p) { return p; }
CMessageIOBase* yo2NetIo(CNetLobby* p) { return p; }
CMessageIOBase* yo2NetIo(CNetDuel* p) { return p; }
CMessageIOBase* yo2NetIo(CNetUsb* p) { return p; }
bool yo2NetIsSocket(CMessageIOBase* io, uintptr_t socket) { return io && io->sock == socket; }
int32_t yo2NetRecv(CMessageIOBase* io) { return io->recvResult; }
void yo2NetOnReceive(CMessageIOBase* io) { io->log += "recv"; }
bool yo2NetByeSent(CMessageIOBase* io) { return io->bye; }
void yo2NetDisconnect(CMessageIOBase* io) { io->log += "close"; }
// The app's start-up passes its scene layer here first: the stand-in appSceneLayer() answers with it from then on.
CTask* yo2NewCheckDisconnectTask(CTask* parent, CElement* layer) {
    g_fakeSceneLayer = layer;
    return CTask::newChild(parent, 0);
}
bool yo2NewGameMng(CTask* parent, uint32_t priority) { return CTask::newChild(parent, priority) != nullptr; }
void yo2TestHookBegin() {}
void yo2TestHookEnd() {}
void yo2RunAppWindow(CAppMainWindow& w) {
    AppWindowOption opt;
    w.onPreCreate(opt);
    g_fakeAppLog += std::string("window(") + opt.caption.c_str() + ")";
}

// yaneSDK CMouseEx over the fake mouse state.
int32_t YaneMouseEx::wndProc(HWND, uint32_t msg, uintptr_t, intptr_t) {
    if (msg == 0x201)
        ++lClicks_;
    return 0;
}
bool YaneMouseEx::flush() {
    if (guard_)
        --guard_;
    rDownPrev_ = rDown_;
    lDownPrev_ = lDown_;
    x_ = g_fakeMouseX;
    y_ = g_fakeMouseY;
    buttons_ = g_fakeMouseButtons;
    rDown_ = buttons_ & 1;
    lDown_ = buttons_ >> 1 & 1;
    return false;
}
bool YaneMouseEx::rightPressed() const { return !rDownPrev_ && rDown_ && !guard_; }
bool YaneMouseEx::leftPressed() const { return !lDownPrev_ && lDown_ && !guard_; }
bool YaneMouseEx::rightReleased() const { return rDownPrev_ && !rDown_ && !guard_; }
bool YaneMouseEx::leftReleased() const { return lDownPrev_ && !lDown_ && !guard_; }
bool g_fakeCursorShown = true;
void platformShowCursor(bool show) { g_fakeCursorShown = show; }
IMouseCursor* yo2NewHandCursor() { return new CArrowCursorTask; }


// Loader threads run to completion at once.
void yo2BeginThread(void (*fn)(void*), void* arg) { fn(arg); }
bool yo2SaveFile(const char* name, const void* data, size_t size) {
    auto* p = static_cast<const uint8_t*>(data);
    g_fakeSaved[name].assign(p, p + size);
    g_fakeFiles[name] = g_fakeSaved[name];  // the disk: loadable from now on
    return true;
}
bool yo2ExeProductVersion(const char*, const char*, char* out, size_t cap) {
    std::snprintf(out, cap, "1.0.0.0");
    return true;
}

// The window factory exists before any text texture (CApp's start-up makes it); its AtConverter is their default.
#include "System/window/yo2WindowTask.h"
static const bool s_factory = (CWindowTaskFactory::create(), true);
