// The Win32 functions declared in this directory's headers, for non-Windows builds. Each is the smallest thing that
// keeps yaneSDK's and the game's calls meaning what they meant on Windows; "no device" answers (joystick, mixer,
// MIDI, ACM codecs) are the ones a PC without that hardware/codec gives, so the original error paths handle them.
#include <windows.h>
#include <dinput.h>
#include <dsound.h>
#include <imm.h>
#include <mmsystem.h>
#include <msacm.h>
#include <process.h>

#include <cerrno>
#include <dirent.h>
#include <fnmatch.h>
#include <strings.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "platform.h"
#undef fopen   // windows.h routes fopen here; this file needs the real one
#ifdef __EMSCRIPTEN__
#include "coop.h"   // threads are fibers on the browser thread (coop.h)
#endif

// ================================================================ errors, time, misc kernel32

static thread_local DWORD tLastError;
DWORD GetLastError() { return tLastError; }
void SetLastError(DWORD e) { tLastError = e; }

void Sleep(DWORD ms) {
#ifdef __EMSCRIPTEN__
    coop::sleepUntil(platformTimeMs() + ms);   // the other threads (and the browser) run meanwhile
#else
    std::this_thread::sleep_for(std::chrono::milliseconds(ms));
#endif
}

DWORD GetTickCount() { return platformTimeMs(); }
DWORD timeGetTime() { return platformTimeMs(); }

BOOL QueryPerformanceCounter(LARGE_INTEGER* c) {
    c->QuadPart = std::chrono::duration_cast<std::chrono::nanoseconds>(
                      std::chrono::steady_clock::now().time_since_epoch()).count();
    return TRUE;
}

BOOL QueryPerformanceFrequency(LARGE_INTEGER* f) {
    f->QuadPart = 1000000000;
    return TRUE;
}

static std::atomic<DWORD> gNextThreadId{1};
DWORD GetCurrentThreadId() {
#ifdef __EMSCRIPTEN__
    return coop::self();
#else
    static thread_local DWORD id = gNextThreadId++;
    return id;
#endif
}
HANDLE GetCurrentThread() { return (HANDLE)(LONG_PTR)-2; }
HANDLE GetCurrentProcess() { return (HANDLE)(LONG_PTR)-1; }
DWORD GetCurrentProcessId() { return (DWORD)getpid(); }

int MulDiv(int a, int b, int c) {   // rounds half away from zero, -1 on divide by zero, as Win32 does
    if (!c) return -1;
    int64_t p = (int64_t)a * b, q = p / c, r = p % c;
    if (2 * (r < 0 ? -r : r) >= (c < 0 ? -(int64_t)c : c)) q += (p < 0) != (c < 0) ? -1 : 1;
    return (int)q;
}

void OutputDebugStringA(LPCSTR s) { fputs(s, stderr); }

LONG InterlockedIncrement(volatile LONG* p) { return __atomic_add_fetch(p, 1, __ATOMIC_SEQ_CST); }
LONG InterlockedDecrement(volatile LONG* p) { return __atomic_sub_fetch(p, 1, __ATOMIC_SEQ_CST); }
LONG InterlockedExchange(volatile LONG* p, LONG v) { return __atomic_exchange_n(p, v, __ATOMIC_SEQ_CST); }

// Language: the original ran on Japanese and English Windows. YO2_LANGID picks (default English, 0x0409).
LANGID GetSystemDefaultLangID() {
    const char* e = getenv("YO2_LANGID");
    return e ? (LANGID)strtol(e, nullptr, 0) : (LANGID)0x0409;
}
LANGID GetUserDefaultLangID() { return GetSystemDefaultLangID(); }
UINT GetACP() { return PRIMARYLANGID(GetSystemDefaultLangID()) == LANG_JAPANESE ? 932 : 1252; }

// MultiByteToWideChar / WideCharToMultiByte / wsprintf: text.cpp

static void systemTime(SYSTEMTIME* t, bool local) {
    auto now = std::chrono::system_clock::now();
    time_t s = std::chrono::system_clock::to_time_t(now);
    int ms = (int)(std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count() % 1000);
    struct tm tm;
    if (local) localtime_r(&s, &tm);
    else gmtime_r(&s, &tm);
    *t = SYSTEMTIME{(WORD)(tm.tm_year + 1900), (WORD)(tm.tm_mon + 1), (WORD)tm.tm_wday, (WORD)tm.tm_mday,
                    (WORD)tm.tm_hour, (WORD)tm.tm_min, (WORD)tm.tm_sec, (WORD)ms};
}
void GetLocalTime(SYSTEMTIME* t) { systemTime(t, true); }
void GetSystemTime(SYSTEMTIME* t) { systemTime(t, false); }

int lstrlenA(LPCSTR s) { return s ? (int)strlen(s) : 0; }
LPSTR lstrcpyA(LPSTR d, LPCSTR s) { return strcpy(d, s); }
LPSTR lstrcpynA(LPSTR d, LPCSTR s, int n) {   // always terminates, like the Win32 one
    if (n <= 0) return d;
    strncpy(d, s, n - 1);
    d[n - 1] = 0;
    return d;
}
LPSTR lstrcatA(LPSTR d, LPCSTR s) { return strcat(d, s); }
int lstrcmpA(LPCSTR a, LPCSTR b) { return strcmp(a, b); }
int lstrcmpiA(LPCSTR a, LPCSTR b) { return strcasecmp(a, b); }

// GlobalAlloc: plain heap blocks with their size in front (lock = the pointer)
HGLOBAL GlobalAlloc(UINT flags, SIZE_T bytes) {
    SIZE_T* p = (SIZE_T*)((flags & GMEM_ZEROINIT) ? calloc(1, bytes + sizeof(SIZE_T)) : malloc(bytes + sizeof(SIZE_T)));
    if (!p) return nullptr;
    *p = bytes;
    return p + 1;
}
LPVOID GlobalLock(HGLOBAL h) { return h; }
BOOL GlobalUnlock(HGLOBAL) { return TRUE; }
HGLOBAL GlobalFree(HGLOBAL h) {
    if (h) free((SIZE_T*)h - 1);
    return nullptr;
}
SIZE_T GlobalSize(HGLOBAL h) { return h ? ((SIZE_T*)h)[-1] : 0; }
HGLOBAL GlobalReAlloc(HGLOBAL h, SIZE_T bytes, UINT flags) {
    if (!h) return GlobalAlloc(flags, bytes);
    SIZE_T old = GlobalSize(h);
    SIZE_T* p = (SIZE_T*)realloc((SIZE_T*)h - 1, bytes + sizeof(SIZE_T));
    if (!p) return nullptr;
    *p = bytes;
    if ((flags & GMEM_ZEROINIT) && bytes > old) memset((char*)(p + 1) + old, 0, bytes - old);
    return p + 1;
}

// DLLs: the ones yaneSDK loads by name resolve to these entry points
static int gFakeModule;
HMODULE LoadLibraryA(LPCSTR name) {
    if (name && !strcasecmp(name, "dinput.dll")) return (HMODULE)&gFakeModule;
    SetLastError(ERROR_FILE_NOT_FOUND);
    return nullptr;
}
FARPROC GetProcAddress(HMODULE m, LPCSTR name) {
    if (m == (HMODULE)&gFakeModule && name && !strcmp(name, "DirectInputCreateA")) return (FARPROC)DirectInputCreateA;
    return nullptr;
}
BOOL FreeLibrary(HMODULE) { return TRUE; }
HMODULE GetModuleHandleA(LPCSTR) { return (HMODULE)&gFakeModule; }
HRSRC FindResourceA(HMODULE, LPCSTR, LPCSTR) { return nullptr; }   // no .rc resources off Windows
HGLOBAL LoadResource(HMODULE, HRSRC) { return nullptr; }
LPVOID LockResource(HGLOBAL) { return nullptr; }
DWORD SizeofResource(HMODULE, HRSRC) { return 0; }

BOOL CreateProcessA(LPCSTR, LPSTR, LPSECURITY_ATTRIBUTES, LPSECURITY_ATTRIBUTES, BOOL, DWORD, LPVOID, LPCSTR,
                    LPSTARTUPINFO, LPPROCESS_INFORMATION) {
    SetLastError(ERROR_FILE_NOT_FOUND);   // the updater / external tools are not run off Windows
    return FALSE;
}

// ================================================================ handles
// Small integers indexing a table, as real Win32 handles are: yaneSDK keeps some in a DWORD (CThread stores the
// _beginthread handle in m_dwThreadID), which a heap pointer would not survive on a 64-bit host.

namespace {
enum HandleKind { H_KOBJECT = 1, H_FILE, H_FIND };
struct HandleEntry { int kind; void* obj; };
std::mutex gHandleLock;
std::vector<HandleEntry> gHandles;

HANDLE newHandle(int kind, void* obj) {
    std::lock_guard<std::mutex> l(gHandleLock);
    size_t i = 0;
    while (i < gHandles.size() && gHandles[i].kind) i++;
    if (i == gHandles.size()) gHandles.push_back(HandleEntry{0, nullptr});
    gHandles[i] = HandleEntry{kind, obj};
    return (HANDLE)(uintptr_t)((i + 1) * 4);
}

void* lookup(HANDLE h, int kind) {
    uintptr_t v = (uintptr_t)h;
    if (!v || v % 4 || v / 4 > gHandles.size()) return nullptr;
    std::lock_guard<std::mutex> l(gHandleLock);
    HandleEntry& e = gHandles[v / 4 - 1];
    return e.kind == kind ? e.obj : nullptr;
}

HandleEntry release(HANDLE h) {
    uintptr_t v = (uintptr_t)h;
    std::lock_guard<std::mutex> l(gHandleLock);
    if (!v || v % 4 || v / 4 > gHandles.size()) return HandleEntry{0, nullptr};
    HandleEntry e = gHandles[v / 4 - 1];
    gHandles[v / 4 - 1] = HandleEntry{0, nullptr};
    return e;
}
}  // namespace

// ================================================================ kernel objects: threads, events, mutexes

namespace {
struct KObject {
    virtual ~KObject() {}
    virtual DWORD wait(DWORD ms) = 0;
};

struct Event : KObject {
    std::mutex m;
    std::condition_variable cv;
    bool manual, signaled;
    Event(bool manual, bool initial) : manual(manual), signaled(initial) {}
    DWORD wait(DWORD ms) override {
#ifdef __EMSCRIPTEN__
        DWORD end = platformTimeMs() + ms;
        while (!signaled) {
            if (ms != INFINITE && (int32_t)(platformTimeMs() - end) >= 0) return WAIT_TIMEOUT;
            coop::yield();
        }
#else
        std::unique_lock<std::mutex> l(m);
        auto ready = [&] { return signaled; };
        if (ms == INFINITE) cv.wait(l, ready);
        else if (!cv.wait_for(l, std::chrono::milliseconds(ms), ready)) return WAIT_TIMEOUT;
#endif
        if (!manual) signaled = false;
        return WAIT_OBJECT_0;
    }
    void set(bool on) {
        std::lock_guard<std::mutex> l(m);
        signaled = on;
        if (on) cv.notify_all();
    }
};

struct Thread : Event {   // signaled when the thread function returns
    DWORD code = STILL_ACTIVE;
    Thread() : Event(true, false) {}
#ifdef __EMSCRIPTEN__
    bool orphaned = false;   // its handle was closed while it ran: the thread deletes this when it ends
#else
    std::thread t;
    ~Thread() override {
        if (t.joinable()) {
            if (t.get_id() == std::this_thread::get_id()) t.detach();
            else t.join();
        }
    }
#endif
};

#ifdef __EMSCRIPTEN__
struct Mutex : KObject {   // Win32 mutexes are recursive and owned by a thread
    DWORD owner = 0, count = 0;
    DWORD wait(DWORD ms) override {
        DWORD me = GetCurrentThreadId(), end = platformTimeMs() + ms;
        while (count && owner != me) {
            if (ms != INFINITE && (int32_t)(platformTimeMs() - end) >= 0) return WAIT_TIMEOUT;
            coop::yield();
        }
        owner = me;
        count++;
        return WAIT_OBJECT_0;
    }
    void unlock() {
        if (count && --count == 0) owner = 0;
    }
};
#else
struct Mutex : KObject {   // Win32 mutexes are recursive and owned by a thread
    std::recursive_timed_mutex m;
    DWORD wait(DWORD ms) override {
        if (ms == INFINITE) {
            m.lock();
            return WAIT_OBJECT_0;
        }
        return m.try_lock_for(std::chrono::milliseconds(ms)) ? WAIT_OBJECT_0 : WAIT_TIMEOUT;
    }
    void unlock() { m.unlock(); }
};
#endif
}  // namespace

HANDLE CreateThread(LPSECURITY_ATTRIBUTES, SIZE_T, LPTHREAD_START_ROUTINE fn, LPVOID arg, DWORD, LPDWORD id) {
    Thread* th = new Thread;
#ifdef __EMSCRIPTEN__
    struct Start { Thread* th; LPTHREAD_START_ROUTINE fn; LPVOID arg; };
    DWORD tid = coop::spawn([](void* p) {
        Start s = *(Start*)p;
        delete (Start*)p;
        s.th->code = s.fn(s.arg);
        if (s.th->orphaned) delete s.th;
        else s.th->set(true);
    }, new Start{th, fn, arg});
    if (id) *id = tid;
    return newHandle(H_KOBJECT, (KObject*)th);
#else
    std::atomic<DWORD> tid{0};
    th->t = std::thread([th, fn, arg, &tid] {
        tid = GetCurrentThreadId();
        DWORD code = fn(arg);
        th->code = code;
        th->set(true);
    });
    while (!tid) std::this_thread::yield();   // CreateThread hands the id back
    if (id) *id = tid;
    return newHandle(H_KOBJECT, (KObject*)th);
#endif
}
BOOL SetThreadPriority(HANDLE, int) { return TRUE; }
int GetThreadPriority(HANDLE) { return THREAD_PRIORITY_NORMAL; }
BOOL TerminateThread(HANDLE, DWORD) { return FALSE; }   // not possible with std::thread; nobody relies on it
BOOL GetExitCodeThread(HANDLE h, LPDWORD code) {
    Thread* th = dynamic_cast<Thread*>((KObject*)lookup(h, H_KOBJECT));
    if (!th) return FALSE;
    if (code) *code = th->code;
    return TRUE;
}
DWORD ResumeThread(HANDLE) { return 0; }
void ExitThread(DWORD) { pthread_exit(nullptr); }   // ponytail: nothing in yaneSDK or the game calls it

uintptr_t _beginthread(void (*fn)(void*), unsigned, void* arg) {
    struct Start { void (*fn)(void*); void* arg; };
    Start* s = new Start{fn, arg};
    HANDLE h = CreateThread(nullptr, 0, [](LPVOID p) -> DWORD {
        Start s = *(Start*)p;
        delete (Start*)p;
        s.fn(s.arg);
        return 0;
    }, s, 0, nullptr);
    return (uintptr_t)h;   // ponytail: never freed, as _beginthread's handle is closed by the CRT on exit
}
uintptr_t _beginthreadex(void*, unsigned, unsigned (*fn)(void*), void* arg, unsigned, unsigned* id) {
    struct Start { unsigned (*fn)(void*); void* arg; };
    Start* s = new Start{fn, arg};
    DWORD tid;
    HANDLE h = CreateThread(nullptr, 0, [](LPVOID p) -> DWORD {
        Start s = *(Start*)p;
        delete (Start*)p;
        return s.fn(s.arg);
    }, s, 0, &tid);
    if (id) *id = tid;
    return (uintptr_t)h;
}
void _endthread() { pthread_exit(nullptr); }
void _endthreadex(unsigned) { pthread_exit(nullptr); }

HANDLE CreateEventA(LPSECURITY_ATTRIBUTES, BOOL manual, BOOL initial, LPCSTR) {
    return newHandle(H_KOBJECT, (KObject*)new Event(manual, initial));
}
static Event* eventOf(HANDLE h) { return dynamic_cast<Event*>((KObject*)lookup(h, H_KOBJECT)); }
BOOL SetEvent(HANDLE h) {
    Event* e = eventOf(h);
    return e ? (e->set(true), TRUE) : FALSE;
}
BOOL ResetEvent(HANDLE h) {
    Event* e = eventOf(h);
    return e ? (e->set(false), TRUE) : FALSE;
}

HANDLE CreateMutexA(LPSECURITY_ATTRIBUTES, BOOL owned, LPCSTR) {
    Mutex* m = new Mutex;
    if (owned) m->wait(INFINITE);
    SetLastError(0);   // ponytail: names are not shared; one process never sees ERROR_ALREADY_EXISTS
    return newHandle(H_KOBJECT, (KObject*)m);
}
BOOL ReleaseMutex(HANDLE h) {
    Mutex* m = dynamic_cast<Mutex*>((KObject*)lookup(h, H_KOBJECT));
    return m ? (m->unlock(), TRUE) : FALSE;
}

DWORD WaitForSingleObject(HANDLE h, DWORD ms) {
    KObject* o = (KObject*)lookup(h, H_KOBJECT);
    return o ? o->wait(ms) : WAIT_FAILED;
}
DWORD WaitForMultipleObjects(DWORD n, const HANDLE* hs, BOOL all, DWORD ms) {
    // ponytail: polling; the game waits on at most a couple of loader threads
    auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(ms == INFINITE ? 1u << 30 : ms);
    while (true) {
        DWORD done = 0, first = WAIT_TIMEOUT;
        for (DWORD i = 0; i < n; i++)
            if (WaitForSingleObject(hs[i], 0) == WAIT_OBJECT_0) {
                done++;
                if (first == WAIT_TIMEOUT) first = WAIT_OBJECT_0 + i;
            }
        if (all ? done == n : done > 0) return all ? WAIT_OBJECT_0 : first;
        if (std::chrono::steady_clock::now() > end) return WAIT_TIMEOUT;
        Sleep(1);
    }
}

static void closeFileOrFind(int kind, void* obj);
BOOL CloseHandle(HANDLE h) {
    HandleEntry e = release(h);
#ifdef __EMSCRIPTEN__
    if (e.kind == H_KOBJECT) {   // a running thread still writes its exit code: it frees itself when it ends
        Thread* th = dynamic_cast<Thread*>((KObject*)e.obj);
        if (th && th->code == STILL_ACTIVE) th->orphaned = true;
        else delete (KObject*)e.obj;
        return TRUE;
    }
#endif
    if (e.kind == H_KOBJECT) delete (KObject*)e.obj;
    else if (e.kind) closeFileOrFind(e.kind, e.obj);
    return e.kind != 0;
}

#ifdef __EMSCRIPTEN__
void InitializeCriticalSection(LPCRITICAL_SECTION cs) { cs->impl = new Mutex; }
void DeleteCriticalSection(LPCRITICAL_SECTION cs) {
    delete (Mutex*)cs->impl;
    cs->impl = nullptr;
}
void EnterCriticalSection(LPCRITICAL_SECTION cs) { ((Mutex*)cs->impl)->wait(INFINITE); }
void LeaveCriticalSection(LPCRITICAL_SECTION cs) { ((Mutex*)cs->impl)->unlock(); }
BOOL TryEnterCriticalSection(LPCRITICAL_SECTION cs) { return ((Mutex*)cs->impl)->wait(0) == WAIT_OBJECT_0; }
#else
void InitializeCriticalSection(LPCRITICAL_SECTION cs) { cs->impl = new std::recursive_mutex; }
void DeleteCriticalSection(LPCRITICAL_SECTION cs) {
    delete (std::recursive_mutex*)cs->impl;
    cs->impl = nullptr;
}
void EnterCriticalSection(LPCRITICAL_SECTION cs) { ((std::recursive_mutex*)cs->impl)->lock(); }
void LeaveCriticalSection(LPCRITICAL_SECTION cs) { ((std::recursive_mutex*)cs->impl)->unlock(); }
BOOL TryEnterCriticalSection(LPCRITICAL_SECTION cs) { return ((std::recursive_mutex*)cs->impl)->try_lock(); }
#endif

// ================================================================ multimedia timers (callback on its own thread)

namespace {
struct MMTimer {
#ifndef __EMSCRIPTEN__
    std::thread t;
    std::mutex m;
    std::condition_variable cv;
#endif
    bool stop = false;
};
std::mutex gTimersLock;
std::map<UINT, MMTimer*> gMMTimers;
UINT gNextMMTimer = 1;
}  // namespace

MMRESULT timeGetDevCaps(LPTIMECAPS caps, UINT) {
    caps->wPeriodMin = 1;
    caps->wPeriodMax = 1000000;
    return TIMERR_NOERROR;
}
MMRESULT timeBeginPeriod(UINT) { return TIMERR_NOERROR; }
MMRESULT timeEndPeriod(UINT) { return TIMERR_NOERROR; }

MMRESULT timeSetEvent(UINT delay, UINT, LPTIMECALLBACK fn, DWORD_PTR user, UINT flags) {
    MMTimer* tm = new MMTimer;
    UINT id;
    {
        std::lock_guard<std::mutex> l(gTimersLock);
        id = gNextMMTimer++;
        gMMTimers[id] = tm;
    }
#ifdef __EMSCRIPTEN__
    struct Start { MMTimer* tm; UINT id, delay; LPTIMECALLBACK fn; DWORD_PTR user; UINT flags; };
    coop::spawn([](void* p) {   // the timer's own thread, as winmm's: it frees tm once killed
        Start s = *(Start*)p;
        delete (Start*)p;
        uint32_t next = platformTimeMs();
        do {
            next += s.delay ? s.delay : 1;
            coop::sleepUntil(next);
            if (s.tm->stop) break;
            s.fn(s.id, 0, s.user, 0, 0);
        } while ((s.flags & TIME_PERIODIC) && !s.tm->stop);
        {
            std::lock_guard<std::mutex> l(gTimersLock);
            auto it = gMMTimers.find(s.id);
            if (it != gMMTimers.end() && it->second == s.tm) gMMTimers.erase(it);   // a one-shot that fired
        }
        delete s.tm;
    }, new Start{tm, id, delay, fn, user, flags});
    return id;
#else
    tm->t = std::thread([tm, id, delay, fn, user, flags] {
        auto next = std::chrono::steady_clock::now();
        do {
            next += std::chrono::milliseconds(delay ? delay : 1);
            std::unique_lock<std::mutex> l(tm->m);
            if (tm->cv.wait_until(l, next, [tm] { return tm->stop; })) return;
            l.unlock();
            fn(id, 0, user, 0, 0);
        } while (flags & TIME_PERIODIC);
    });
    return id;
#endif
}

MMRESULT timeKillEvent(UINT id) {
    MMTimer* tm;
    {
        std::lock_guard<std::mutex> l(gTimersLock);
        auto it = gMMTimers.find(id);
        if (it == gMMTimers.end()) return MMSYSERR_INVALPARAM;
        tm = it->second;
        gMMTimers.erase(it);
    }
#ifdef __EMSCRIPTEN__
    tm->stop = true;   // the timer thread sees it at its next wake-up and frees tm
    return TIMERR_NOERROR;
#else
    {
        std::lock_guard<std::mutex> l(tm->m);
        tm->stop = true;
    }
    tm->cv.notify_all();
    if (tm->t.get_id() == std::this_thread::get_id()) {   // killed from its own callback (one-shot re-arm)
        tm->t.detach();
        return TIMERR_NOERROR;   // ponytail: tm leaks; a one-shot timer is a few bytes
    }
    tm->t.join();
    delete tm;
    return TIMERR_NOERROR;
#endif
}

// ================================================================ windows and messages (one real window)

namespace {
struct Window {
    std::string cls, title;
    WNDPROC proc = nullptr;
    LONG_PTR userData = 0;
    LONG_PTR style = 0, exStyle = 0;
    HMENU menu = nullptr;
    bool visible = false, destroyed = false;
    bool real = false;   // backed by the platform window
};
std::map<std::string, WNDCLASSEX> gClasses;
std::vector<Window*> gWindows;
Window* gMain = nullptr;
DWORD gUiThread;
int gGameW = 640, gGameH = 480;
std::mutex gQueueLock;
std::deque<MSG> gQueue;
std::map<UINT_PTR, TIMERPROC> gTimerProcs;
int gCursorCount = 0;

std::string lower(const char* s) {
    std::string r = s ? s : "";
    for (char& c : r) c = (char)tolower((unsigned char)c);
    return r;
}

Window* win(HWND h) {
    for (Window* w : gWindows)
        if ((HWND)w == h) return w;
    return nullptr;
}

void post(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    std::lock_guard<std::mutex> l(gQueueLock);
    gQueue.push_back(MSG{h, msg, wp, lp, platformTimeMs(), {0, 0}});
}

// Pull the OS events into the queue: only on the thread that made the window (SDL wants its own thread)
void pump() {
    if (!gMain || !gMain->real || GetCurrentThreadId() != gUiThread) return;
    platformPump([](const PlatformMsg& m, void*) {
        LPARAM lp = m.lParam;
        if (m.msg == WM_TIMER) {
            auto it = gTimerProcs.find(m.wParam);
            if (it != gTimerProcs.end()) lp = (LPARAM)it->second;
        }
        post((HWND)gMain, m.msg, m.wParam, lp);
    }, nullptr);
}
}  // namespace

ATOM RegisterClassExA(const WNDCLASSEX* wc) {
    gClasses[lower(wc->lpszClassName)] = *wc;
    return 1;
}
ATOM RegisterClassA(const WNDCLASS* wc) {
    WNDCLASSEX x{sizeof x, wc->style, wc->lpfnWndProc, wc->cbClsExtra, wc->cbWndExtra, wc->hInstance, wc->hIcon,
                 wc->hCursor, wc->hbrBackground, wc->lpszMenuName, wc->lpszClassName, nullptr};
    return RegisterClassExA(&x);
}
BOOL UnregisterClassA(LPCSTR name, HINSTANCE) { return gClasses.erase(lower(name)) ? TRUE : FALSE; }

HWND CreateWindowExA(DWORD exStyle, LPCSTR cls, LPCSTR title, DWORD style, int x, int y, int w, int h, HWND parent,
                     HMENU menu, HINSTANCE inst, LPVOID param) {
    auto it = gClasses.find(lower(cls));
    Window* wnd = new Window;
    wnd->cls = cls ? cls : "";
    wnd->title = title ? title : "";
    wnd->proc = it != gClasses.end() ? it->second.lpfnWndProc : DefWindowProcA;   // built-in classes: inert
    wnd->style = style;
    wnd->exStyle = exStyle;
    wnd->menu = menu;
    gWindows.push_back(wnd);
    // The first top-level window with a real class is the game window: it becomes the platform window
    if (!gMain && !parent && it != gClasses.end()) {
        if (w > 0 && w != CW_USEDEFAULT) gGameW = w;
        if (h > 0 && h != CW_USEDEFAULT) gGameH = h;
        if (!platformInit(wnd->title.c_str(), gGameW, gGameH, getenv("YO2_HIDDEN") != nullptr)) return nullptr;
        wnd->real = true;
        gMain = wnd;
        gUiThread = GetCurrentThreadId();
    }
    CREATESTRUCT cs{param, inst, menu, parent, gGameH, gGameW, y, x, (LONG)style, title, cls, exStyle};
    SendMessageA((HWND)wnd, WM_NCCREATE, 0, (LPARAM)&cs);
    if (SendMessageA((HWND)wnd, WM_CREATE, 0, (LPARAM)&cs) == -1) {
        DestroyWindow((HWND)wnd);
        return nullptr;
    }
    if (style & WS_VISIBLE) ShowWindow((HWND)wnd, SW_SHOW);
    return (HWND)wnd;
}

BOOL DestroyWindow(HWND h) {
    Window* w = win(h);
    if (!w || w->destroyed) return FALSE;
    w->destroyed = true;
    SendMessageA(h, WM_DESTROY, 0, 0);
    SendMessageA(h, WM_NCDESTROY, 0, 0);
    return TRUE;   // ponytail: the record stays (handles are compared later); the platform window lives to exit
}
BOOL IsWindow(HWND h) {
    Window* w = win(h);
    return w && !w->destroyed;
}
BOOL ShowWindow(HWND h, int cmd) {
    Window* w = win(h);
    if (!w) return FALSE;
    BOOL was = w->visible;
    w->visible = cmd != SW_HIDE && cmd != SW_MINIMIZE && cmd != SW_SHOWMINIMIZED;
    return was;
}
BOOL UpdateWindow(HWND) { return TRUE; }
BOOL IsIconic(HWND) { return FALSE; }
BOOL IsZoomed(HWND) { return FALSE; }
BOOL IsWindowVisible(HWND h) {
    Window* w = win(h);
    return w && w->visible;
}
BOOL SetWindowPos(HWND, HWND, int, int, int, int, UINT) { return TRUE; }   // the platform window keeps its size
BOOL MoveWindow(HWND, int, int, int, int, BOOL) { return TRUE; }
BOOL SetWindowTextA(HWND h, LPCSTR s) {
    if (Window* w = win(h)) w->title = s ? s : "";
    return TRUE;
}
int GetWindowTextA(HWND h, LPSTR s, int n) {
    Window* w = win(h);
    if (!w || n <= 0) return 0;
    lstrcpynA(s, w->title.c_str(), n);
    return (int)strlen(s);
}

LONG_PTR GetWindowLongA(HWND h, int i) {
    Window* w = win(h);
    if (!w) return 0;
    switch (i) {
    case GWL_WNDPROC: return (LONG_PTR)w->proc;
    case GWL_USERDATA: return w->userData;
    case GWL_STYLE: return w->style;
    case GWL_EXSTYLE: return w->exStyle;
    default: return 0;
    }
}
LONG_PTR SetWindowLongA(HWND h, int i, LONG_PTR v) {
    Window* w = win(h);
    if (!w) return 0;
    LONG_PTR old = GetWindowLongA(h, i);
    switch (i) {
    case GWL_WNDPROC: w->proc = (WNDPROC)v; break;
    case GWL_USERDATA: w->userData = v; break;
    case GWL_STYLE: w->style = v; break;   // windowed/fullscreen switches go through the D3D device here
    case GWL_EXSTYLE: w->exStyle = v; break;
    }
    return old;
}

LRESULT CallWindowProcA(WNDPROC proc, HWND h, UINT msg, WPARAM wp, LPARAM lp) { return proc ? proc(h, msg, wp, lp) : 0; }

LRESULT DefWindowProcA(HWND h, UINT msg, WPARAM, LPARAM) {
    switch (msg) {
    case WM_CLOSE: DestroyWindow(h); return 0;
    case WM_NCCREATE: return TRUE;
    default: return 0;
    }
}

BOOL PeekMessageA(LPMSG m, HWND h, UINT lo, UINT hi, UINT remove) {
    pump();
    std::lock_guard<std::mutex> l(gQueueLock);
    for (auto it = gQueue.begin(); it != gQueue.end(); ++it) {
        if (h && it->hwnd != h && it->message != WM_QUIT) continue;
        if ((lo || hi) && (it->message < lo || it->message > hi)) continue;
        *m = *it;
        GetCursorPos(&m->pt);
        if (remove & PM_REMOVE) gQueue.erase(it);
        return TRUE;
    }
#ifdef __EMSCRIPTEN__
    coop::yield();   // a polling loop gives the others, then the browser, their turn
#endif
    return FALSE;
}

BOOL GetMessageA(LPMSG m, HWND h, UINT lo, UINT hi) {
    while (!PeekMessageA(m, h, lo, hi, PM_REMOVE)) {
#ifndef __EMSCRIPTEN__   // the web's empty PeekMessage already yielded
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
#endif
    }
    return m->message != WM_QUIT;
}

BOOL WaitMessage() {
    MSG m;
    while (!PeekMessageA(&m, nullptr, 0, 0, PM_NOREMOVE)) {
#ifndef __EMSCRIPTEN__
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
#endif
    }
    return TRUE;
}

BOOL TranslateMessage(const MSG*) { return FALSE; }   // the pump already emits WM_CHAR

LRESULT DispatchMessageA(const MSG* m) {
    if (m->message == WM_TIMER && m->lParam) {
        ((TIMERPROC)m->lParam)(m->hwnd, WM_TIMER, m->wParam, platformTimeMs());
        return 0;
    }
    Window* w = win(m->hwnd);
    return w && w->proc ? w->proc(m->hwnd, m->message, m->wParam, m->lParam) : 0;
}

BOOL PostMessageA(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    post(h, msg, wp, lp);
    return TRUE;
}
BOOL PostThreadMessageA(DWORD, UINT msg, WPARAM wp, LPARAM lp) {
    post(nullptr, msg, wp, lp);   // one message thread
    return TRUE;
}
// ponytail: a direct call from any thread (Win32 marshals a cross-thread send to the window's thread)
LRESULT SendMessageA(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    Window* w = win(h);
    return w && w->proc ? w->proc(h, msg, wp, lp) : 0;
}
void PostQuitMessage(int code) { post(nullptr, WM_QUIT, (WPARAM)code, 0); }

UINT_PTR SetTimer(HWND, UINT_PTR id, UINT ms, TIMERPROC fn) {
    if (fn) gTimerProcs[id] = fn;
    else gTimerProcs.erase(id);
    platformSetTimer(id, ms);
    return id ? id : 1;
}
BOOL KillTimer(HWND, UINT_PTR id) {
    gTimerProcs.erase(id);
    platformKillTimer(id);
    return TRUE;
}

BOOL GetClientRect(HWND, LPRECT r) {
    *r = RECT{0, 0, gGameW, gGameH};
    return TRUE;
}
BOOL GetWindowRect(HWND h, LPRECT r) { return GetClientRect(h, r); }   // no frame: the window is its client area
BOOL ClientToScreen(HWND, LPPOINT) { return TRUE; }                     // and sits at the screen origin
BOOL ScreenToClient(HWND, LPPOINT) { return TRUE; }
BOOL AdjustWindowRect(LPRECT, DWORD, BOOL) { return TRUE; }
BOOL AdjustWindowRectEx(LPRECT, DWORD, BOOL, DWORD) { return TRUE; }

BOOL GetCursorPos(LPPOINT p) {
    int x = 0, y = 0;
    if (gMain) platformMouse(&x, &y, nullptr);
    p->x = x;
    p->y = y;
    return TRUE;
}
BOOL SetCursorPos(int x, int y) {
    if (gMain) platformSetMouse(x, y);
    return TRUE;
}
int ShowCursor(BOOL show) {   // a display counter, as in Win32: visible while >= 0
    gCursorCount += show ? 1 : -1;
    if (gMain) platformShowCursor(gCursorCount >= 0);
    return gCursorCount;
}
static int gCursorHandle;
HCURSOR SetCursor(HCURSOR c) { return c; }
HCURSOR LoadCursorA(HINSTANCE, LPCSTR) { return (HCURSOR)&gCursorHandle; }
HICON LoadIconA(HINSTANCE, LPCSTR) { return (HICON)&gCursorHandle; }
static HWND gCapture;
HWND SetCapture(HWND w) {
    HWND old = gCapture;
    gCapture = w;
    return old;
}
BOOL ReleaseCapture() {
    gCapture = nullptr;
    return TRUE;
}
HWND GetCapture() { return gCapture; }
HWND SetFocus(HWND w) { return w; }
HWND GetFocus() { return (HWND)gMain; }
HWND GetActiveWindow() { return (HWND)gMain; }
HWND GetForegroundWindow() { return (HWND)gMain; }
BOOL SetForegroundWindow(HWND) { return TRUE; }
HMENU GetMenu(HWND h) {
    Window* w = win(h);
    return w ? w->menu : nullptr;
}
BOOL SetMenu(HWND h, HMENU m) {
    if (Window* w = win(h)) w->menu = m;
    return TRUE;
}
BOOL DrawMenuBar(HWND) { return TRUE; }

int GetSystemMetrics(int i) {
    int w, h;
    platformDesktopSize(&w, &h);
    switch (i) {
    case SM_CXSCREEN: return w;
    case SM_CYSCREEN: return h;
    default: return 0;   // frame/caption/border sizes: the window has none
    }
}
BOOL SystemParametersInfoA(UINT action, UINT, LPVOID pv, UINT) {
    if (action == SPI_GETWORKAREA) {   // CWindow::Create clamps the window to this ([Konami])
        int w, h;
        platformDesktopSize(&w, &h);
        *(RECT*)pv = RECT{0, 0, w, h};
    }
    return TRUE;
}

SHORT GetAsyncKeyState(int vk) { return gMain && platformKeyDownVk(vk) ? (SHORT)0x8000 : 0; }
SHORT GetKeyState(int vk) { return GetAsyncKeyState(vk); }
BOOL GetKeyboardState(LPBYTE s) {
    for (int vk = 0; vk < 256; vk++) s[vk] = GetAsyncKeyState(vk) ? 0x80 : 0;
    return TRUE;
}

BOOL SetRect(LPRECT r, int l, int t, int ri, int b) {
    *r = RECT{l, t, ri, b};
    return TRUE;
}
BOOL SetRectEmpty(LPRECT r) { return SetRect(r, 0, 0, 0, 0); }
BOOL OffsetRect(LPRECT r, int dx, int dy) {
    r->left += dx; r->right += dx; r->top += dy; r->bottom += dy;
    return TRUE;
}
BOOL IntersectRect(LPRECT d, const RECT* a, const RECT* b) {
    RECT r{max(a->left, b->left), max(a->top, b->top), min(a->right, b->right), min(a->bottom, b->bottom)};
    if (r.left >= r.right || r.top >= r.bottom) {
        SetRectEmpty(d);
        return FALSE;
    }
    *d = r;
    return TRUE;
}
BOOL PtInRect(const RECT* r, POINT p) { return p.x >= r->left && p.x < r->right && p.y >= r->top && p.y < r->bottom; }
BOOL InvalidateRect(HWND, const RECT*, BOOL) { return TRUE; }

int MessageBoxA(HWND, LPCSTR text, LPCSTR caption, UINT type) {
    platformMessageBox(caption ? caption : "", text ? text : "");
    return (type & 0xf) == MB_YESNO ? IDYES : IDOK;
}

BOOL EnumWindows(WNDENUMPROC fn, LPARAM lp) {
    for (Window* w : gWindows)
        if (!w->destroyed && !fn((HWND)w, lp)) break;
    return TRUE;
}
DWORD GetWindowThreadProcessId(HWND, LPDWORD pid) {
    if (pid) *pid = GetCurrentProcessId();
    return 1;
}
HWND FindWindowA(LPCSTR cls, LPCSTR title) {
    for (Window* w : gWindows)
        if (!w->destroyed && (!cls || lower(cls) == lower(w->cls.c_str())) && (!title || w->title == title))
            return (HWND)w;
    return nullptr;
}
int GetClassNameA(HWND h, LPSTR buf, int n) {
    Window* w = win(h);
    if (!w || n <= 0) return 0;
    lstrcpynA(buf, w->cls.c_str(), n);
    return (int)strlen(buf);
}

// Clipboard: process-local text only (the system clipboard is SDL's; chat paste goes through the input path)
static std::string gClip;
BOOL OpenClipboard(HWND) { return TRUE; }
BOOL CloseClipboard() { return TRUE; }
BOOL EmptyClipboard() { gClip.clear(); return TRUE; }
HANDLE GetClipboardData(UINT fmt) {
    if (fmt != CF_TEXT || gClip.empty()) return nullptr;
    HGLOBAL g = GlobalAlloc(GMEM_ZEROINIT, gClip.size() + 1);
    memcpy(g, gClip.c_str(), gClip.size());
    return g;
}
HANDLE SetClipboardData(UINT fmt, HANDLE h) {
    if (fmt == CF_TEXT && h) gClip = (const char*)h;
    return h;
}
BOOL IsClipboardFormatAvailable(UINT fmt) { return fmt == CF_TEXT && !gClip.empty(); }

static int gStock;
HGDIOBJ GetStockObject(int) { return &gStock; }

// IMM: composition already arrives as WM_CHAR from the pump
static int gImc;
HIMC ImmAssociateContext(HWND, HIMC c) { return c; }
HIMC ImmGetContext(HWND) { return (HIMC)&gImc; }
BOOL ImmReleaseContext(HWND, HIMC) { return TRUE; }
BOOL ImmSetOpenStatus(HIMC, BOOL) { return TRUE; }
BOOL ImmGetOpenStatus(HIMC) { return FALSE; }

// ================================================================ files

namespace {
// "C:\Foo\bar.TXT" -> an existing POSIX path, matching each component case-insensitively. For a file that does not
// exist yet, the directories are matched and the last component is kept as given.
std::string resolvePath(const char* winPath) {
    std::string p = winPath ? winPath : "";
    for (char& c : p)
        if (c == '\\') c = '/';
    if (p.size() >= 2 && isalpha((unsigned char)p[0]) && p[1] == ':') p = p.substr(2);   // drive letters go
    bool abs = !p.empty() && p[0] == '/';
    std::string out = abs ? "" : ".";
    size_t i = 0;
    while (i <= p.size()) {
        size_t j = p.find('/', i);
        if (j == std::string::npos) j = p.size();
        std::string part = p.substr(i, j - i);
        i = j + 1;
        if (part.empty() || part == ".") continue;
        std::string cand = out + "/" + part;
        struct stat st;
        if (part != ".." && stat(cand.c_str(), &st) != 0) {
            if (DIR* d = opendir(out.empty() ? "/" : out.c_str())) {
                while (dirent* e = readdir(d))
                    if (!strcasecmp(e->d_name, part.c_str())) {
                        cand = out + "/" + e->d_name;
                        break;
                    }
                closedir(d);
            }
        }
        out = cand;
    }
    if (out.empty()) out = "/";
    if (!abs && out.compare(0, 2, "./") == 0) out = out.substr(2);
    return out;
}
}  // namespace

struct FindObj {
    std::vector<WIN32_FIND_DATA> items;
    size_t next = 0;
};

static void closeFileOrFind(int kind, void* obj) {
    if (kind == H_FILE) fclose((FILE*)obj);
    else delete (FindObj*)obj;
}

static FILE* fileOf(HANDLE h) { return (FILE*)lookup(h, H_FILE); }

FILE* win32_fopen(const char* name, const char* mode) {
    // a file being created keeps its own name; existing components match case-insensitively
    return fopen(resolvePath(name).c_str(), mode);
}

HANDLE CreateFileA(LPCSTR name, DWORD access, DWORD, LPSECURITY_ATTRIBUTES, DWORD disp, DWORD, HANDLE) {
    std::string path = resolvePath(name);
    struct stat st;
    bool exists = stat(path.c_str(), &st) == 0;
    if (exists && S_ISDIR(st.st_mode)) {
        SetLastError(ERROR_ACCESS_DENIED);
        return INVALID_HANDLE_VALUE;
    }
    bool write = access & GENERIC_WRITE;
    const char* mode = nullptr;
    switch (disp) {
    case CREATE_NEW: mode = exists ? nullptr : "w+b"; break;
    case CREATE_ALWAYS: mode = "w+b"; break;
    case OPEN_EXISTING: mode = exists ? (write ? "r+b" : "rb") : nullptr; break;
    case OPEN_ALWAYS: mode = exists ? (write ? "r+b" : "rb") : "w+b"; break;
    case TRUNCATE_EXISTING: mode = exists ? "w+b" : nullptr; break;
    }
    FILE* f = mode ? fopen(path.c_str(), mode) : nullptr;
    if (!f) {
        SetLastError(exists && disp == CREATE_NEW ? ERROR_ALREADY_EXISTS : ERROR_FILE_NOT_FOUND);
        return INVALID_HANDLE_VALUE;
    }
    SetLastError(exists && (disp == OPEN_ALWAYS || disp == CREATE_ALWAYS) ? ERROR_ALREADY_EXISTS : 0);
    return newHandle(H_FILE, f);
}

BOOL ReadFile(HANDLE h, LPVOID buf, DWORD n, LPDWORD got, LPOVERLAPPED) {
    FILE* f = fileOf(h);
    if (!f) return FALSE;
    size_t r = fread(buf, 1, n, f);
    if (got) *got = (DWORD)r;
    return !ferror(f);
}
BOOL WriteFile(HANDLE h, LPCVOID buf, DWORD n, LPDWORD put, LPOVERLAPPED) {
    FILE* f = fileOf(h);
    if (!f) return FALSE;
    size_t w = fwrite(buf, 1, n, f);
    if (put) *put = (DWORD)w;
    return w == n;
}
DWORD SetFilePointer(HANDLE h, LONG dist, PLONG high, DWORD method) {
    FILE* f = fileOf(h);
    if (!f) return INVALID_SET_FILE_POINTER;
    int64_t off = high ? ((int64_t)*high << 32) | (uint32_t)dist : dist;
    if (fseeko(f, off, method == FILE_BEGIN ? SEEK_SET : method == FILE_CURRENT ? SEEK_CUR : SEEK_END) != 0)
        return INVALID_SET_FILE_POINTER;
    int64_t pos = ftello(f);
    if (high) *high = (LONG)(pos >> 32);
    return (DWORD)pos;
}
DWORD GetFileSize(HANDLE h, LPDWORD high) {
    FILE* f = fileOf(h);
    if (!f) return INVALID_FILE_SIZE;
    struct stat st;
    fstat(fileno(f), &st);
    if (high) *high = (DWORD)((uint64_t)st.st_size >> 32);
    return (DWORD)st.st_size;
}
BOOL SetEndOfFile(HANDLE h) {
    FILE* f = fileOf(h);
    return f && ftruncate(fileno(f), ftello(f)) == 0;
}
BOOL FlushFileBuffers(HANDLE h) {
    FILE* f = fileOf(h);
    return f && fflush(f) == 0;
}
BOOL DeleteFileA(LPCSTR name) { return unlink(resolvePath(name).c_str()) == 0; }
BOOL MoveFileA(LPCSTR from, LPCSTR to) { return rename(resolvePath(from).c_str(), resolvePath(to).c_str()) == 0; }
BOOL CopyFileA(LPCSTR from, LPCSTR to, BOOL failIfExists) {
    std::string dst = resolvePath(to);
    struct stat st;
    if (failIfExists && stat(dst.c_str(), &st) == 0) return FALSE;
    FILE* a = fopen(resolvePath(from).c_str(), "rb");
    if (!a) return FALSE;
    FILE* b = fopen(dst.c_str(), "wb");
    if (!b) { fclose(a); return FALSE; }
    char buf[65536];
    size_t n;
    while ((n = fread(buf, 1, sizeof buf, a)) > 0) fwrite(buf, 1, n, b);
    fclose(a);
    return fclose(b) == 0;
}
BOOL CreateDirectoryA(LPCSTR name, LPSECURITY_ATTRIBUTES) {
    if (mkdir(resolvePath(name).c_str(), 0755) == 0) return TRUE;
    SetLastError(errno == EEXIST ? ERROR_ALREADY_EXISTS : ERROR_ACCESS_DENIED);
    return FALSE;
}
BOOL RemoveDirectoryA(LPCSTR name) { return rmdir(resolvePath(name).c_str()) == 0; }

static DWORD attributes(const struct stat& st) {
    return S_ISDIR(st.st_mode) ? FILE_ATTRIBUTE_DIRECTORY : FILE_ATTRIBUTE_ARCHIVE;
}
DWORD GetFileAttributesA(LPCSTR name) {
    struct stat st;
    return stat(resolvePath(name).c_str(), &st) == 0 ? attributes(st) : INVALID_FILE_ATTRIBUTES;
}

HANDLE FindFirstFileA(LPCSTR pattern, LPWIN32_FIND_DATA out) {
    std::string p = pattern ? pattern : "";
    for (char& c : p)
        if (c == '\\') c = '/';
    size_t slash = p.rfind('/');
    std::string dir = slash == std::string::npos ? "." : resolvePath(p.substr(0, slash ? slash : 1).c_str());
    std::string mask = slash == std::string::npos ? p : p.substr(slash + 1);
    if (mask == "*.*") mask = "*";   // DOS: "*.*" matches names without a dot too
    FindObj* fo = new FindObj;
    if (DIR* d = opendir(dir.c_str())) {
        while (dirent* e = readdir(d)) {
            if (fnmatch(mask.c_str(), e->d_name, FNM_CASEFOLD) != 0) continue;
            struct stat st;
            if (stat((dir + "/" + e->d_name).c_str(), &st) != 0) continue;
            WIN32_FIND_DATA fd{};
            fd.dwFileAttributes = attributes(st);
            fd.nFileSizeLow = (DWORD)st.st_size;
            fd.nFileSizeHigh = (DWORD)((uint64_t)st.st_size >> 32);
            lstrcpynA(fd.cFileName, e->d_name, MAX_PATH);
            fo->items.push_back(fd);
        }
        closedir(d);
    }
    if (fo->items.empty()) {
        delete fo;
        SetLastError(ERROR_FILE_NOT_FOUND);
        return INVALID_HANDLE_VALUE;
    }
    *out = fo->items[fo->next++];
    return newHandle(H_FIND, fo);
}
BOOL FindNextFileA(HANDLE h, LPWIN32_FIND_DATA out) {
    FindObj* fo = (FindObj*)lookup(h, H_FIND);
    if (!fo || fo->next >= fo->items.size()) return FALSE;
    *out = fo->items[fo->next++];
    return TRUE;
}
BOOL FindClose(HANDLE h) { return CloseHandle(h); }

static DWORD copyOut(const std::string& s, LPSTR buf, DWORD n) {
    if (n <= s.size()) return (DWORD)s.size() + 1;   // Win32: too small -> the size needed
    memcpy(buf, s.c_str(), s.size() + 1);
    return (DWORD)s.size();
}
static std::string toWin(std::string s) {   // POSIX absolute path in Windows dress, so '\\' parsing works
    for (char& c : s)
        if (c == '/') c = '\\';
    return s;
}
DWORD GetTempPathA(DWORD n, LPSTR buf) {
    const char* t = getenv("TMPDIR");
    std::string s = toWin(t ? t : "/tmp/");
    if (s.back() != '\\') s += '\\';
    return copyOut(s, buf, n);
}
UINT GetTempFileNameA(LPCSTR dir, LPCSTR prefix, UINT unique, LPSTR out) {
    static std::atomic<unsigned> counter{0};
    unsigned u = unique ? unique : (unsigned)(getpid() * 31 + ++counter) & 0xffff;
    snprintf(out, MAX_PATH, "%s\\%.3s%04X.TMP", dir, prefix ? prefix : "", u);
    if (!unique) {   // Win32 creates the file when it picked the number
        HANDLE h = CreateFileA(out, GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, 0, nullptr);
        if (h != INVALID_HANDLE_VALUE) CloseHandle(h);
    }
    return u;
}
DWORD GetCurrentDirectoryA(DWORD n, LPSTR buf) {
    char cwd[4096];
    if (!getcwd(cwd, sizeof cwd)) return 0;
    return copyOut(toWin(cwd), buf, n);
}
BOOL SetCurrentDirectoryA(LPCSTR dir) { return chdir(resolvePath(dir).c_str()) == 0; }
UINT GetWindowsDirectoryA(LPSTR buf, UINT n) { return GetTempPathA(n, buf); }   // nothing of Windows' lives here
DWORD GetLogicalDrives() { return 1u << 2; }                                    // C:
DWORD GetFullPathNameA(LPCSTR name, DWORD n, LPSTR buf, LPSTR* filePart) {
    std::string s = name ? name : "";
    if (s.empty() || (s[0] != '\\' && s[0] != '/' && !(s.size() > 1 && s[1] == ':'))) {
        char cwd[MAX_PATH];
        GetCurrentDirectoryA(MAX_PATH, cwd);
        s = std::string(cwd) + "\\" + s;
    }
    DWORD r = copyOut(toWin(s), buf, n);
    if (filePart && r < n) {
        char* sl = strrchr(buf, '\\');
        *filePart = sl ? sl + 1 : buf;
    }
    return r;
}
// The exe "lives" in the current directory: the game finds its data next to itself
DWORD GetModuleFileNameA(HMODULE, LPSTR buf, DWORD n) {
    char cwd[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, cwd);
    std::string s = std::string(cwd) + "\\yo2.exe";
    DWORD r = copyOut(s, buf, n);
    return r > n ? n : r;
}

// ================================================================ mmio (RIFF), on memory or a file

namespace {
struct Mmio {
    std::vector<char> data;   // a file is read whole: RIFF wave files are small (BGM streams use other readers)
    const char* mem = nullptr;
    LONG size = 0, pos = 0;
};
}  // namespace

HMMIO mmioOpenA(LPSTR name, LPMMIOINFO info, DWORD) {
    Mmio* m = new Mmio;
    if (info && info->fccIOProc == FOURCC_MEM) {
        m->mem = info->pchBuffer;
        m->size = info->cchBuffer;
    } else {
        FILE* f = fopen(resolvePath(name).c_str(), "rb");
        if (!f) {
            delete m;
            if (info) info->wErrorRet = MMSYSERR_ERROR;
            return nullptr;
        }
        fseek(f, 0, SEEK_END);
        m->data.resize((size_t)ftell(f));
        fseek(f, 0, SEEK_SET);
        if (fread(m->data.data(), 1, m->data.size(), f) != m->data.size()) m->data.clear();
        fclose(f);
        m->mem = m->data.data();
        m->size = (LONG)m->data.size();
    }
    return (HMMIO)m;
}
MMRESULT mmioClose(HMMIO h, UINT) {
    delete (Mmio*)h;
    return MMSYSERR_NOERROR;
}
LONG mmioRead(HMMIO h, char* buf, LONG n) {
    Mmio* m = (Mmio*)h;
    if (n > m->size - m->pos) n = m->size - m->pos;
    if (n <= 0) return 0;
    memcpy(buf, m->mem + m->pos, n);
    m->pos += n;
    return n;
}
LONG mmioSeek(HMMIO h, LONG off, int origin) {
    Mmio* m = (Mmio*)h;
    LONG p = origin == SEEK_SET ? off : origin == SEEK_CUR ? m->pos + off : m->size + off;
    if (p < 0 || p > m->size) return -1;
    return m->pos = p;
}
MMRESULT mmioDescend(HMMIO h, LPMMCKINFO ck, const MMCKINFO* parent, UINT flags) {
    Mmio* m = (Mmio*)h;
    LONG end = parent ? (LONG)(parent->dwDataOffset + parent->cksize) : m->size;
    FOURCC want = (flags & MMIO_FINDRIFF) ? FOURCC_RIFF : (flags & MMIO_FINDLIST) ? FOURCC_LIST : ck->ckid;
    while (m->pos + 8 <= end) {
        MMCKINFO c{};
        memcpy(&c.ckid, m->mem + m->pos, 4);
        memcpy(&c.cksize, m->mem + m->pos + 4, 4);
        c.dwDataOffset = (DWORD)m->pos + 8;
        bool container = c.ckid == FOURCC_RIFF || c.ckid == FOURCC_LIST;
        if (container && m->pos + 12 <= end) memcpy(&c.fccType, m->mem + m->pos + 8, 4);
        bool match = !(flags & (MMIO_FINDCHUNK | MMIO_FINDRIFF | MMIO_FINDLIST)) || c.ckid == want;
        if (match && (flags & (MMIO_FINDRIFF | MMIO_FINDLIST)) && ck->fccType && c.fccType != ck->fccType) match = false;
        if (match) {
            *ck = c;
            m->pos = (LONG)c.dwDataOffset + (container ? 4 : 0);
            return MMSYSERR_NOERROR;
        }
        m->pos = (LONG)(c.dwDataOffset + ((c.cksize + 1) & ~1u));   // chunks are word aligned
    }
    return MMIOERR_CHUNKNOTFOUND;
}
MMRESULT mmioAscend(HMMIO h, LPMMCKINFO ck, UINT) {
    ((Mmio*)h)->pos = (LONG)(ck->dwDataOffset + ((ck->cksize + 1) & ~1u));
    return MMSYSERR_NOERROR;
}

// ================================================================ no-device answers: joystick, mixer, MIDI, ACM

UINT joyGetNumDevs() { return 0; }
MMRESULT joyGetPos(UINT, LPJOYINFO) { return JOYERR_UNPLUGGED; }
MMRESULT joyGetPosEx(UINT, LPJOYINFOEX) { return JOYERR_UNPLUGGED; }
MMRESULT joyGetDevCapsA(UINT_PTR, LPJOYCAPS, UINT) { return MMSYSERR_NODRIVER; }
UINT mixerGetNumDevs() { return 0; }
MMRESULT mixerOpen(LPHMIXER, UINT, DWORD_PTR, DWORD_PTR, DWORD) { return MMSYSERR_BADDEVICEID; }
MMRESULT mixerClose(HMIXER) { return MMSYSERR_INVALHANDLE; }
MMRESULT mixerGetDevCapsA(UINT_PTR, LPMIXERCAPS, UINT) { return MMSYSERR_BADDEVICEID; }
MMRESULT mixerGetLineInfoA(HMIXEROBJ, LPMIXERLINE, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT mixerGetLineControlsA(HMIXEROBJ, LPMIXERLINECONTROLS, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT mixerGetControlDetailsA(HMIXEROBJ, LPMIXERCONTROLDETAILS, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT mixerSetControlDetails(HMIXEROBJ, LPMIXERCONTROLDETAILS, DWORD) { return MMSYSERR_INVALHANDLE; }
UINT midiOutGetNumDevs() { return 0; }
MMRESULT midiOutOpen(LPHMIDIOUT, UINT, DWORD_PTR, DWORD_PTR, DWORD) { return MMSYSERR_BADDEVICEID; }
MMRESULT midiOutClose(HMIDIOUT) { return MMSYSERR_INVALHANDLE; }
MMRESULT midiOutShortMsg(HMIDIOUT, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT midiOutReset(HMIDIOUT) { return MMSYSERR_INVALHANDLE; }
UINT midiInGetNumDevs() { return 0; }
MMRESULT midiInOpen(LPHMIDIIN, UINT, DWORD_PTR, DWORD_PTR, DWORD) { return MMSYSERR_BADDEVICEID; }
MMRESULT midiInClose(HMIDIIN) { return MMSYSERR_INVALHANDLE; }
MMRESULT midiInStart(HMIDIIN) { return MMSYSERR_INVALHANDLE; }
MMRESULT midiInStop(HMIDIIN) { return MMSYSERR_INVALHANDLE; }
MMRESULT midiInReset(HMIDIIN) { return MMSYSERR_INVALHANDLE; }
MMRESULT acmStreamOpen(LPHACMSTREAM, HACMDRIVER, LPWAVEFORMATEX, LPWAVEFORMATEX, void*, DWORD_PTR, DWORD_PTR, DWORD) {
    return ACMERR_NOTPOSSIBLE;
}
MMRESULT acmStreamClose(HACMSTREAM, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT acmStreamSize(HACMSTREAM, DWORD, LPDWORD, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT acmStreamPrepareHeader(HACMSTREAM, LPACMSTREAMHEADER, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT acmStreamUnprepareHeader(HACMSTREAM, LPACMSTREAMHEADER, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT acmStreamConvert(HACMSTREAM, LPACMSTREAMHEADER, DWORD) { return MMSYSERR_INVALHANDLE; }
MMRESULT acmFormatSuggest(HACMDRIVER, LPWAVEFORMATEX, LPWAVEFORMATEX, DWORD, DWORD) { return ACMERR_NOTPOSSIBLE; }

// ================================================================ COM and DirectInput

// The real GUID values, so code that compares or logs them sees what it saw on Windows
const GUID CLSID_DirectSound = {0x47D4D946, 0x62E8, 0x11CF, {0x93, 0xBC, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID IID_IDirectSound = {0x279AFA83, 0x4981, 0x11CE, {0xA5, 0x21, 0x00, 0x20, 0xAF, 0x0B, 0xE5, 0x60}};
const GUID CLSID_DirectInput = {0x25E609E0, 0xB259, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID IID_IDirectInputA = {0x89521360, 0xAA8A, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID IID_IDirectInput = IID_IDirectInputA;
const GUID IID_IDirectInput2 = {0x5944E662, 0xAA8A, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID IID_IDirectInputDevice = {0x5944E680, 0xC92E, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID IID_IDirectInputDevice2 = {0x5944E682, 0xC92E, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_SysKeyboard = {0x6F1D2B61, 0xD5A0, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_SysMouse = {0x6F1D2B60, 0xD5A0, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_XAxis = {0xA36D02E0, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_YAxis = {0xA36D02E1, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID CLSID_AMMultiMediaStream = {0x49C47CE5, 0x9BA4, 0x11D0, {0x82, 0x12, 0x00, 0xC0, 0x4F, 0xC3, 0x2C, 0x45}};
const GUID IID_IAMMultiMediaStream = {0xBEBE595C, 0x9A6F, 0x11D0, {0x8F, 0xDE, 0x00, 0xC0, 0x4F, 0xD9, 0x18, 0x9D}};
const DIDATAFORMAT c_dfDIKeyboard = {sizeof(DIDATAFORMAT), 16, 2, 256, 256, nullptr};
const DIDATAFORMAT c_dfDIJoystick = {sizeof(DIDATAFORMAT), 16, 1, sizeof(DIJOYSTATE), 44, nullptr};
const DIDATAFORMAT c_dfDIMouse = {sizeof(DIDATAFORMAT), 16, 2, 16, 7, nullptr};

HRESULT CoInitialize(LPVOID) { return S_OK; }
HRESULT CoInitializeEx(LPVOID, DWORD) { return S_OK; }
void CoUninitialize() {}

HRESULT CoCreateInstance(REFCLSID clsid, LPUNKNOWN, DWORD, REFIID, LPVOID* out) {
    *out = nullptr;
    if (clsid == CLSID_DirectSound) *out = new IDirectSound(44100);   // opened by IDirectSound::Initialize
    else if (clsid == CLSID_DirectInput) *out = new IDirectInput;
    return *out ? S_OK : (HRESULT)0x80040154;   // REGDB_E_CLASSNOTREG: DirectShow, DirectDraw, ...
}

HRESULT IDirectInput::QueryInterface(REFIID, void** out) {
    AddRef();
    *out = this;
    return DI_OK;
}
HRESULT IDirectInput::CreateDevice(REFGUID guid, LPDIRECTINPUTDEVICE* out, LPUNKNOWN) {
    if (!(guid == GUID_SysKeyboard)) return DIERR_DEVICENOTREG;   // joysticks: EnumDevices never offered one
    *out = new IDirectInputDevice;
    return DI_OK;
}
HRESULT DirectInputCreateA(HINSTANCE, DWORD, LPDIRECTINPUTA* out, LPUNKNOWN) {
    *out = new IDirectInput;
    return DI_OK;
}
HRESULT IDirectInputDevice::QueryInterface(REFIID, void** out) {   // IDirectInputDevice2 is the same object
    AddRef();
    *out = this;
    return DI_OK;
}
HRESULT IDirectInputDevice::GetCapabilities(LPDIDEVCAPS caps) {
    *caps = DIDEVCAPS{sizeof(DIDEVCAPS), 1, DIDEVTYPE_KEYBOARD, 0, 128, 0, 0, 0, 0, 0, 0};
    return DI_OK;
}
HRESULT IDirectInputDevice::GetDeviceInfo(LPDIDEVICEINSTANCE info) {
    DIDEVICEINSTANCE d{};
    d.dwSize = sizeof d;
    d.guidInstance = d.guidProduct = GUID_SysKeyboard;
    d.dwDevType = DIDEVTYPE_KEYBOARD;
    strcpy(d.tszInstanceName, "Keyboard");
    strcpy(d.tszProductName, "Keyboard");
    *info = d;
    return DI_OK;
}
HRESULT IDirectInputDevice::GetDeviceState(DWORD size, LPVOID data) {
    if (size != 256) return DIERR_INVALIDPARAM;
    platformKeyboardDik((uint8_t*)data);
    return DI_OK;
}
