// USER32 for the recompiled exe on platform/sdl: one real window (SDL, hidden under YO2_HIDDEN), a guest message
// queue fed by platformPump, Win32 timers, window longs, wsprintf with guest varargs.
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <mutex>
#include <string>
#include <unistd.h>
#include <vector>

#include "platform.h"
#include <windows.h>   // platform/win32 stand-in: GetDC & co. from its GDI

extern "C" {
#include "win.h"
extern "C" void rc_audio_boot(void);
extern "C" void rc_mem_report(const char* when);
void backtrace_guest(CPU *c);
}

namespace {

struct Wnd {
    uint32_t hwnd, proc, style, exstyle, userdata, parent, id;
    std::string title, cls;
    int x, y, w, h;
    std::vector<uint8_t> extra;
};
struct Cls { std::string name; uint32_t proc, wndExtra, style; };
struct Msg { uint32_t hwnd, msg, w, l; };
struct Timer { uint32_t hwnd, id, ms, proc, next; bool pending; };

std::vector<Wnd> wnds;
std::vector<Cls> classes;
std::deque<Msg> queue;
std::vector<Timer> timers;
std::recursive_mutex qmu;   // queue + timers: the exe's connect thread posts (PostMessageA at 0x68b904) while the
                            // main thread peeks
uint32_t mainHwnd;
bool platformUp, quitPosted;
uint32_t quitCode;
int GAME_W = 800, GAME_H = 600;   // the main window's size (CreateWindowExA; the game asks 1024x768)

Wnd* W(uint32_t h) {
    for (auto& w : wnds)
        if (w.hwnd == h) return &w;
    return nullptr;
}

uint32_t call_proc(CPU* c, uint32_t proc, uint32_t h, uint32_t m, uint32_t wp, uint32_t lp) {
    uint32_t a[4] = {h, m, wp, lp};
    return rc_call(c, proc, 4, a);
}
uint32_t send(CPU* c, uint32_t h, uint32_t m, uint32_t wp, uint32_t lp) {
    Wnd* w = W(h);
    return w && w->proc ? call_proc(c, w->proc, h, m, wp, lp) : 0;
}

void onMsg(const PlatformMsg& m, void*) {
    queue.push_back({mainHwnd, m.msg, (uint32_t)m.wParam, (uint32_t)m.lParam});
}

}  // namespace
extern "C" void rc_net_poll(void);
extern "C" void rc_web_sleep(uint32_t ms);
extern "C" void rc_web_idle(void);
extern "C" void rc_post(uint32_t hwnd, uint32_t msg, uint32_t w, uint32_t l) {
    std::lock_guard<std::recursive_mutex> lock(qmu);
    queue.push_back({hwnd ? hwnd : mainHwnd, msg, w, l});
}
namespace {

void pump() {
    std::lock_guard<std::recursive_mutex> lock(qmu);
    rc_net_poll();
    if (platformUp && !platformPump(onMsg, nullptr)) queue.push_back({mainHwnd, 0x10 /*WM_CLOSE*/, 0, 0});
    uint32_t now = rc_ticks_ms();
    for (auto& t : timers)
        if (!t.pending && (int32_t)(now - t.next) >= 0) {
            queue.push_back({t.hwnd, 0x113 /*WM_TIMER*/, t.id, t.proc});
            t.pending = true;
            t.next = now + t.ms;
        }
}

bool match(const Msg& m, uint32_t h, uint32_t lo, uint32_t hi) {
    return (!h || m.hwnd == h) && (!lo && !hi ? true : m.msg >= lo && m.msg <= hi);
}

void put_msg(uint32_t p, const Msg& m) {
    WR32m(p, m.hwnd); WR32m(p + 4, m.msg); WR32m(p + 8, m.w); WR32m(p + 12, m.l);
    WR32m(p + 16, rc_ticks_ms());
    int x, y, b;
    if (platformUp) platformMouse(&x, &y, &b); else x = y = 0;
    WR32m(p + 20, (uint32_t)x); WR32m(p + 24, (uint32_t)y);
}

bool peek(uint32_t p, uint32_t h, uint32_t lo, uint32_t hi, bool remove) {
    {
        std::lock_guard<std::recursive_mutex> lock(qmu);
        pump();
        for (size_t i = 0; i < queue.size(); i++)
            if (match(queue[i], h, lo, hi)) {
                Msg m = queue[i];
                if (remove) {
                    queue.erase(queue.begin() + (long)i);
                    if (m.msg == 0x113)
                        for (auto& t : timers)
                            if (t.id == m.w && t.hwnd == m.hwnd) t.pending = false;
                }
                put_msg(p, m);
                return true;
            }
        if (quitPosted) {
            put_msg(p, {0, 0x12 /*WM_QUIT*/, quitCode, 0});
            if (remove) quitPosted = false;
            return true;
        }
    }
#ifdef __EMSCRIPTEN__
    rc_web_idle();   // the game spins on PeekMessage between frames
#endif
    return false;
}

// ---- wsprintf: Windows' format language, arguments read from guest memory
// (%[-#0][width][.prec][l|h]{d,i,u,x,X,c,C,s,S}); `wide` = the W form (output and %s are UTF-16)
std::string gformat(const char* fmt, uint32_t ap, bool wideStr) {
    std::string out;
    for (const char* p = fmt; *p; p++) {
        if (*p != '%') { out += *p; continue; }
        if (p[1] == '%') { out += '%'; p++; continue; }
        std::string spec = "%";
        while (strchr("-#0", p[1])) spec += *++p;
        while (p[1] >= '0' && p[1] <= '9') spec += *++p;
        if (p[1] == '.') { spec += *++p; while (p[1] >= '0' && p[1] <= '9') spec += *++p; }
        bool h = false;
        if (p[1] == 'l' || p[1] == 'h') h = *++p == 'h';
        char conv = *++p;
        if (!conv) break;
        char buf[512];
        uint32_t v = RD32m(ap);
        ap += 4;
        switch (conv) {
        case 'd': case 'i': snprintf(buf, sizeof buf, (spec + "d").c_str(), h ? (int)(int16_t)v : (int)(int32_t)v); break;
        case 'u': snprintf(buf, sizeof buf, (spec + "u").c_str(), h ? (unsigned)(uint16_t)v : v); break;
        case 'x': case 'X': snprintf(buf, sizeof buf, (spec + conv).c_str(), h ? (unsigned)(uint16_t)v : v); break;
        case 'c': case 'C': buf[0] = (char)v; buf[1] = 0; break;
        case 's': case 'S': {
            bool w = (conv == 's') == wideStr;
            std::string s;
            if (!v) s = "(null)";
            else if (w) {
                uint32_t n = 0;
                while (rc_rd16(rc_mem + v + 2 * n)) n++;
                s.resize(n * 2 + 1);
                s.resize(rc_utf16_to_sjis((uint16_t*)G(v), n, &s[0], (uint32_t)s.size()));
            } else s = GS(v);
            snprintf(buf, sizeof buf, (spec + "s").c_str(), s.c_str());
            break;
        }
        default: snprintf(buf, sizeof buf, "%%%c", conv);
        }
        out += buf;
    }
    return out;
}
uint32_t put_a(uint32_t dst, const std::string& s) {
    size_t n = s.size() < 1024 ? s.size() : 1023;   // wsprintf's limit
    memcpy(G(dst), s.data(), n);
    WR8m(dst + (uint32_t)n, 0);
    return (uint32_t)n;
}
uint32_t put_w(uint32_t dst, const std::string& s) {
    uint32_t n = rc_sjis_to_utf16(s.data(), (uint32_t)s.size(), (uint16_t*)G(dst), 1023);
    rc_wr16(rc_mem + dst + 2 * n, 0);
    return n;
}
std::string wide_fmt(uint32_t w) {
    uint32_t n = 0;
    while (rc_rd16(rc_mem + w + 2 * n)) n++;
    std::string s(n * 2 + 1, 0);
    s.resize(rc_utf16_to_sjis((uint16_t*)G(w), n, &s[0], (uint32_t)s.size()));
    return s;
}

}  // namespace

#define U(name) extern "C" void imp_USER32_##name(CPU* c)

U(RegisterClassExA) {
    uint32_t p = ARG(0);
    classes.push_back({GS(RD32m(p + 40)) ? GS(RD32m(p + 40)) : "", RD32m(p + 8), RD32m(p + 16), RD32m(p + 4)});
    RET(1, 0xc000 + (uint32_t)classes.size());
}
U(CreateWindowExA) {
    uint32_t clsArg = ARG(1);
    std::string cls = clsArg < 0x10000 ? "#atom" : GS(clsArg);
    Wnd w{};
    w.hwnd = 0x10010 + 4 * (uint32_t)wnds.size();
    w.exstyle = ARG(0); w.style = ARG(3);
    w.title = ARG(2) ? GS(ARG(2)) : "";
    w.cls = cls;
    w.x = 0; w.y = 0;
    if (!mainHwnd && (int32_t)ARG(6) > 0 && (int32_t)ARG(7) > 0) {
        extern int rc_game_w, rc_game_h;
        rc_game_w = GAME_W = (int)ARG(6);
        rc_game_h = GAME_H = (int)ARG(7);
    }
    w.w = GAME_W; w.h = GAME_H;
    w.parent = ARG(8);
    w.id = ARG(9);
    for (auto& k : classes)
        if (!strcasecmp(k.name.c_str(), cls.c_str()) || (clsArg < 0x10000 && 0xc000 + (&k - &classes[0]) + 1 == clsArg)) {
            w.proc = k.proc;
            w.extra.resize(k.wndExtra);
        }
    rc_log("user32: CreateWindowExA(%s, \"%s\", style %x, %d,%d %dx%d) -> %x", cls.c_str(), w.title.c_str(), w.style,
           (int32_t)ARG(4), (int32_t)ARG(5), (int32_t)ARG(6), (int32_t)ARG(7), w.hwnd);
    if (!w.proc) rc_log("user32: unknown window class %s", cls.c_str());
    wnds.push_back(w);
    if (!mainHwnd && !w.parent) {
        mainHwnd = w.hwnd;
        if (!platformInit(w.title.c_str(), GAME_W, GAME_H, getenv("YO2_HIDDEN") != nullptr)) {
            rc_log("platformInit failed");
            RET(12, 0);
        }
        platformUp = true;
    }
    // WM_NCCREATE, WM_CREATE with a CREATESTRUCTA (lpCreateParams first)
    uint32_t cs = rc_halloc(48, 1);
    WR32m(cs, ARG(11)); WR32m(cs + 4, ARG(10)); WR32m(cs + 8, ARG(9)); WR32m(cs + 12, ARG(8));
    WR32m(cs + 16, ARG(7)); WR32m(cs + 20, ARG(6)); WR32m(cs + 24, ARG(5)); WR32m(cs + 28, ARG(4));
    WR32m(cs + 32, ARG(3)); WR32m(cs + 36, ARG(2)); WR32m(cs + 40, ARG(1)); WR32m(cs + 44, ARG(0));
    uint32_t h = w.hwnd;
    if (w.proc) {
        uint32_t r = send(c, h, 0x81 /*WM_NCCREATE*/, 0, cs);
        if (r) r = send(c, h, 0x1 /*WM_CREATE*/, 0, cs) != 0xffffffffu;
        if (!r) rc_log("user32: WM_CREATE refused");
    }
    rc_hfree(cs);
    RET(12, h);
}
U(DefWindowProcA) {
    uint32_t m = ARG(1);
    if (m == 0x81) RET(4, 1);                       // WM_NCCREATE
    if (m == 0x10) { send(c, ARG(0), 0x2, 0, 0); RET(4, 0); }   // WM_CLOSE -> WM_DESTROY
    RET(4, 0);
}
U(CallWindowProcA) { RET(5, call_proc(c, ARG(0), ARG(1), ARG(2), ARG(3), ARG(4))); }
U(DestroyWindow) {
    rc_log("DestroyWindow(%x)", ARG(0));   // who closes the game: the guest stack
    backtrace_guest(nullptr);
    send(c, ARG(0), 0x2, 0, 0); RET(1, 1); }
U(ShowWindow) { RET(2, 1); }
U(SetWindowPos) { RET(7, 1); }
U(SetWindowRgn) { RET(3, 1); }
U(SetMenu) { RET(2, 1); }
U(GetMenu) { RET(1, 0); }
U(DrawMenuBar) { RET(1, 1); }
U(SetForegroundWindow) { RET(1, 1); }
U(SetFocus) { RET(1, mainHwnd); }
U(GetActiveWindow) { RET(0, mainHwnd); }
U(GetTopWindow) { RET(1, 0); }
U(GetWindow) { RET(2, 0); }
U(EnumWindows) { RET(2, 1); }   // no other windows (the "already running?" check finds none)
U(GetWindowThreadProcessId) { if (ARG(1)) WR32m(ARG(1), 0x10); RET(2, 0x80); }
U(SetCapture) { RET(1, 0); }
U(ReleaseCapture) { RET(0, 1); }
U(AdjustWindowRect) { RET(3, 1); }   // no frame: window size = client size
U(GetClientRect) {
    Wnd* w = W(ARG(0));
    uint32_t r = ARG(1);
    WR32m(r, 0); WR32m(r + 4, 0); WR32m(r + 8, w ? w->w : GAME_W); WR32m(r + 12, w ? w->h : GAME_H);
    RET(2, 1);
}
U(GetWindowRect) {
    Wnd* w = W(ARG(0));
    uint32_t r = ARG(1);
    WR32m(r, 0); WR32m(r + 4, 0); WR32m(r + 8, w ? w->w : GAME_W); WR32m(r + 12, w ? w->h : GAME_H);
    RET(2, 1);
}
U(ClientToScreen) { RET(2, 1); }   // the window sits at the screen origin
U(ScreenToClient) { RET(2, 1); }
U(GetCursorPos) {
    rc_trace_input(c, "GetCursorPos", 0);
    int x = 0, y = 0, b;
    if (platformUp) platformMouse(&x, &y, &b);
    WR32m(ARG(0), (uint32_t)x); WR32m(ARG(0) + 4, (uint32_t)y);
    RET(1, 1);
}
U(SetCursorPos) { if (platformUp) platformSetMouse((int)ARG(0), (int)ARG(1)); RET(2, 1); }
U(ShowCursor) { static int n; n += ARG(0) ? 1 : -1; if (platformUp) platformShowCursor(n >= 0); RET(1, (uint32_t)n); }
U(GetAsyncKeyState) {
    rc_trace_input(c, "GetAsyncKeyState", ARG(0));
    RET(1, platformUp && platformKeyDownVk((int)ARG(0)) ? 0x8000 : 0); }
U(GetKeyState) { rc_trace_input(c, "GetKeyState", ARG(0)); RET(1, platformUp && platformKeyDownVk((int)ARG(0)) ? 0xff80 : 0); }
U(GetSystemMetrics) {
    int w = 1920, h = 1080;
    switch (ARG(0)) {
    case 0: RET(1, w);                                 // SM_CXSCREEN
    case 1: RET(1, h);
    case 4: RET(1, 0);                                  // SM_CYCAPTION: no frame
    case 5: case 6: case 7: case 8: case 32: case 33: RET(1, 0);   // borders / frames
    default: RET(1, 0);
    }
}
U(SystemParametersInfoA) {
    if (ARG(0) == 0x30 && ARG(2)) {   // SPI_GETWORKAREA
        WR32m(ARG(2), 0); WR32m(ARG(2) + 4, 0); WR32m(ARG(2) + 8, 1920); WR32m(ARG(2) + 12, 1040);
    }
    RET(4, 1);
}
U(GetWindowLongA) {
    Wnd* w = W(ARG(0));
    int32_t i = (int32_t)ARG(1);
    if (!w) RET(2, 0);
    switch (i) {
    case -4: RET(2, w->proc);
    case -16: RET(2, w->style);
    case -20: RET(2, w->exstyle);
    case -21: RET(2, w->userdata);
    case -12: RET(2, w->id);
    case -8: RET(2, w->parent);
    case -6: RET(2, rc_image_base);
    }
    if (i >= 0 && (size_t)i + 4 <= w->extra.size()) { uint32_t v; memcpy(&v, &w->extra[i], 4); RET(2, v); }
    RET(2, 0);
}
U(SetWindowLongA) {
    Wnd* w = W(ARG(0));
    int32_t i = (int32_t)ARG(1);
    uint32_t v = ARG(2), old = 0;
    if (!w) RET(3, 0);
    switch (i) {
    case -4: old = w->proc; w->proc = v; break;
    case -16: old = w->style; w->style = v; break;
    case -20: old = w->exstyle; w->exstyle = v; break;
    case -21: old = w->userdata; w->userdata = v; break;
    default:
        if (i >= 0 && (size_t)i + 4 <= w->extra.size()) { memcpy(&old, &w->extra[i], 4); memcpy(&w->extra[i], &v, 4); }
    }
    RET(3, old);
}

U(PeekMessageA) { RET(5, peek(ARG(0), ARG(1), ARG(2), ARG(3), ARG(4) & 1)); }
U(GetMessageA) {
#ifdef __EMSCRIPTEN__
    while (!peek(ARG(0), ARG(1), ARG(2), ARG(3), true)) rc_web_sleep(1);
#else
    while (!peek(ARG(0), ARG(1), ARG(2), ARG(3), true)) {
        if (rc_fastforward) rc_time_skip(1000);   // idle: the guest clock moves on so its timers come due
        usleep(1000);
    }
#endif
    RET(4, RD32m(ARG(0) + 4) != 0x12);
}
U(TranslateMessage) { RET(1, 0); }   // the pump already produces WM_CHAR
U(DispatchMessageA) {
    uint32_t p = ARG(0);
    uint32_t h = RD32m(p), m = RD32m(p + 4), wp = RD32m(p + 8), lp = RD32m(p + 12);
    if (m == 0x113 && lp) RET(1, call_proc(c, lp, h, m, wp, rc_ticks_ms()));   // TIMERPROC
    RET(1, send(c, h, m, wp, lp));
}
U(SendMessageA) { RET(4, send(c, ARG(0), ARG(1), ARG(2), ARG(3))); }
U(PostMessageA) { rc_post(ARG(0), ARG(1), ARG(2), ARG(3)); RET(4, 1); }
U(PostQuitMessage) {
    rc_log("PostQuitMessage(%d)", (int)ARG(0));
    backtrace_guest(nullptr);
    std::lock_guard<std::recursive_mutex> lock(qmu); quitPosted = true; quitCode = ARG(0); RET(1, 0); }
U(SetTimer) {
    std::lock_guard<std::recursive_mutex> lock(qmu);
    uint32_t h = ARG(0), id = ARG(1);
    for (auto& t : timers)
        if (t.hwnd == h && t.id == id) { t.ms = ARG(2); t.proc = ARG(3); RET(4, id); }
    if (!h && !id) id = 0x7000 + (uint32_t)timers.size();
    timers.push_back({h, id, ARG(2), ARG(3), rc_ticks_ms() + ARG(2), false});
    RET(4, id);
}
U(KillTimer) {
    std::lock_guard<std::recursive_mutex> lock(qmu);
    for (size_t i = 0; i < timers.size(); i++)
        if (timers[i].hwnd == ARG(0) && timers[i].id == ARG(1)) { timers.erase(timers.begin() + (long)i); RET(2, 1); }
    RET(2, 0);
}
U(MessageBoxA) {
    rc_log("MessageBox [%s]: %s", ARG(2) ? GS(ARG(2)) : "", ARG(1) ? GS(ARG(1)) : "");
    RET(4, 1);   // IDOK
}
U(LoadCursorA) { RET(2, 0x20001); }
U(LoadIconA) { RET(2, 0x20002); }
U(LoadStringA) { if (ARG(3)) WR8m(ARG(2), 0); RET(4, 0); }
extern "C" uint32_t rc_gdi_handle(void* h);
extern "C" void* rc_gdi_host(uint32_t g);
U(BeginPaint) { memset(G(ARG(1)), 0, 64); uint32_t d = rc_gdi_handle(GetDC(nullptr)); WR32m(ARG(1), d); RET(2, d); }
U(EndPaint) { ReleaseDC(nullptr, (HDC)rc_gdi_host(RD32m(ARG(1)))); RET(2, 1); }
U(GetDC) { RET(1, rc_gdi_handle(GetDC(nullptr))); }
U(GetWindowDC) { RET(1, rc_gdi_handle(GetDC(nullptr))); }
U(ReleaseDC) { RET(2, ReleaseDC(nullptr, (HDC)rc_gdi_host(ARG(1)))); }
U(OpenClipboard) { RET(1, 0); }
U(CloseClipboard) { RET(0, 1); }
U(EmptyClipboard) { RET(0, 0); }
U(GetClipboardData) { RET(1, 0); }
U(SetClipboardData) { RET(2, 0); }
U(IsClipboardFormatAvailable) { RET(1, 0); }
U(WINNLSEnableIME) { RET(2, 1); }
U(IntersectRect) {
    int32_t a[4], b[4], r[4];
    memcpy(a, G(ARG(1)), 16);
    memcpy(b, G(ARG(2)), 16);
    r[0] = a[0] > b[0] ? a[0] : b[0]; r[1] = a[1] > b[1] ? a[1] : b[1];
    r[2] = a[2] < b[2] ? a[2] : b[2]; r[3] = a[3] < b[3] ? a[3] : b[3];
    bool ok = r[0] < r[2] && r[1] < r[3];
    if (!ok) memset(r, 0, 16);
    memcpy(G(ARG(0)), r, 16);
    RET(3, ok);
}
U(OffsetRect) {
    int32_t r[4];
    memcpy(r, G(ARG(0)), 16);
    r[0] += (int32_t)ARG(1); r[2] += (int32_t)ARG(1); r[1] += (int32_t)ARG(2); r[3] += (int32_t)ARG(2);
    memcpy(G(ARG(0)), r, 16);
    RET(3, 1);
}
U(SetRect) { WR32m(ARG(0), ARG(1)); WR32m(ARG(0) + 4, ARG(2)); WR32m(ARG(0) + 8, ARG(3)); WR32m(ARG(0) + 12, ARG(4)); RET(5, 1); }
U(wsprintfA) { RETC(put_a(ARG(0), gformat(GS(ARG(1)), c->esp + 12, false))); }
U(wvsprintfA) { RET(3, put_a(ARG(0), gformat(GS(ARG(1)), ARG(2), false))); }
U(wsprintfW) { RETC(put_w(ARG(0), gformat(wide_fmt(ARG(1)).c_str(), c->esp + 12, true))); }
U(wvsprintfW) { RET(3, put_w(ARG(0), gformat(wide_fmt(ARG(1)).c_str(), ARG(2), true))); }

// ---- headless screenshots: RC_SHOT=frame[,frame..] writes shot_<frame>.bmp; RC_FRAMES=n exits after n frames
#include "d3d8.h"
extern "C" void rc_screenshot(int frame);
extern "C" void rc_starter_request(const char* req);   // ovr/starterdeck.c
// RC_INPUT="<frame>:<cmd>;...": input scripted inside the program (headless runs; never real input). Commands, in
// game pixels: `move x y`, `click x y` (button up 4 frames later), `down`/`up x y`, `rdown`/`rup x y` (right button:
// hold it to walk the avatar), `text abc` (WM_CHAR each), `key enter|tab|bs|esc`, `walkto exit N|X Y|npc NAME [frames]`, `clicknpc NAME` (below);
// `+N:cmd` instead of `frame:cmd` runs N frames after the last queued walkto ends.
namespace {
struct InputEv { int frame; std::string cmd; };
std::vector<InputEv> inputs;

// `walkto exit N [frames]` / `walkto X Y [frames]` (world pixels): hold the right button with the cursor steered,
// every frame, along a BFS path over the map's atari colours, until the map changes (exit), the avatar is within
// 12 px (point), or the timeout (default 1500 frames). Objects: the live CChibiAvatarCtrl (vtable 0xbf0a50, found by a
// heap scan) -> +0x84 CPlChibiAvatar -> +0x98 CChibiAvatarElm (world position floats +0x70/+0x74, CFieldMap at +0x618)
// -> camera floats at +0x9a6f68/+0x9a6f6c (FUN_00a505a0): screen = world - camera. The atari colour of a cell comes
// from the game's own lookup (below); the avatar's blocked test (FUN_00a50a00) is black or an exit colour, and
// FUN_009cd5c0 numbers the exits 0 blue, 1 cyan, 2 purple, 3 blue2. RC_WALK_DUMP=1 writes the grid as walk_<frame>.ppm.
struct Walk {
    bool on = false, held = false;
    float lx = 0, ly = 0;            // where the avatar was when it last moved
    int still = 0;                   // frames held without moving
    int exit = -1, tx = 0, ty = 0, until = 0, frame0 = 0;
    uint32_t ctrl = 0, fm = 0, npc = 0;   // npc: the element of `walkto npc NAME`'s avatar
    std::string npc_name;
    int w = 0, h = 0;                // grid in cells
    std::vector<uint8_t> cls;        // per cell: 0 not asked, 1 floor, 2 wall, 3 + exit index, 7 tile not loaded
    std::vector<int> asked;          // when a cell's tile was not loaded: asked again 30 frames later
} walk;
std::deque<std::string> walk_queue;   // a walkto given while one runs starts when it ends
std::vector<InputEv> after_walk;      // `+N:cmd`: N frames after the last queued walkto ends
std::vector<int> shots;              // RC_SHOT frames, and `shot` commands (a screenshot of the next frame)
const int CELL = 8;
const uint32_t EXIT_COLOUR[] = {0xff0000ff, 0xff00ffff, 0xff6400ff, 0xff0064ff};

int vt_is(uint32_t p, uint32_t vt) { return rc_readable(p) && RD32m(p) == vt; }
uint32_t elm_of(uint32_t ctrl) {
    uint32_t pl = RD32m(ctrl + 0x84);
    if (!vt_is(pl, 0xbf0c5c)) return 0;
    uint32_t elm = RD32m(pl + 0x98);
    return vt_is(elm, 0xbf0adc) && vt_is(RD32m(elm + 0x618), 0xbf24c8) ? elm : 0;
}
int ctrl_ok(uint32_t p) { return elm_of(p) != 0; }

// Another avatar by name: an NPC (CNpcChibiAvatar, vtable 0xbf0b9c) or another player (CChibiAvatar, 0xbf09d4) whose task
// name (a VC6 std::string: chars at +0x50, length at +0x54; unused NPC slots are "[N]disable") matches and whose element
// (+0x98) stands on field map `fm`. Returns the element, or 0.
std::string want_name;
uint32_t want_fm;
int named_ok(uint32_t a) {
    uint32_t s = RD32m(a + 0x50), n = RD32m(a + 0x54), e = RD32m(a + 0x98);
    return n == want_name.size() && rc_readable(s) && !memcmp(rc_mem + s, want_name.data(), n) && vt_is(e, 0xbf0adc) &&
           RD32m(e + 0x618) == want_fm;
}
uint32_t avatar_named(const std::string& name, uint32_t fm) {
    want_name = name, want_fm = fm;
    uint32_t a = rc_heap_find(0xbf0b9c, named_ok);
    if (!a) a = rc_heap_find(0xbf09d4, named_ok);
    return a ? RD32m(a + 0x98) : 0;
}   // the map left behind has freed its ctrl (vtable word gone)

int walk_frame;
// The atari is streamed in tiles (FUN_00a50ad0: surface fm + 0x5090 + (x / tw * 16 + y / th) * 0x9a6c, tw/th at +0x340/
// +0x344); only those near the camera are loaded, and FUN_00588a50 (the pixel's address) gives 0 for the others. Those
// cells count as walkable until their tile comes in.
// Each lookup locks the tile's texture: cheap natively, a mirror copy on the web, where a whole map's worth in one
// frame (~49k cells) never finishes. So at most walk_budget lookups a frame (RC_WALK_BUDGET: default 200 on the web,
// no limit natively); a cell not asked yet counts as walkable until a later frame asks it (the BFS grows from the
// avatar, so near cells go first).
int walk_budget;
uint8_t cell_class(int cx, int cy) {
    if (cx < 0 || cy < 0 || cx >= walk.w || cy >= walk.h) return 2;
    size_t i = (size_t)cy * walk.w + cx;
    uint8_t& k = walk.cls[i];
    if (!k || (k == 7 && walk_frame - walk.asked[i] >= 30)) {
        if (walk_budget <= 0) return k ? k : 7;
        walk_budget--;
        int x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2;
        int tw = (int)RD32m(walk.fm + 0x340), th = (int)RD32m(walk.fm + 0x344);
        CPU* cur = rc_cur();
        if (!cur) return 7;   // no guest thread here: unknown
        CPU t = *cur;   // a scratch copy: the guest call runs below the current stack pointer and leaves c alone
        t.ecx = walk.fm + 0x5090 + (uint32_t)((x / tw) * 16 + y / th) * 0x9a6c;
        uint32_t a[3] = {(uint32_t)(x % tw), (uint32_t)(y % th), 4};
        uint32_t p = rc_call(&t, 0x588a50, 3, a);
        if (!p) {
            k = 7, walk.asked[i] = walk_frame;
        } else {
            uint32_t col = RD32m(p);
            k = col == 0xff000000 ? 2 : 1;
            for (int e = 0; e < 4; e++)
                if (col == EXIT_COLOUR[e]) k = 3 + e;
        }
    }
    return k;
}
bool goal(int cx, int cy) {
    return walk.exit >= 0 ? cell_class(cx, cy) == 3 + walk.exit : cx == walk.tx / CELL && cy == walk.ty / CELL;
}
// Walkable with some clearance: no wall (or other exit) within r cells; a goal cell always is.
bool open(int cx, int cy, int r) {
    if (goal(cx, cy)) return true;
    for (int dy = -r; dy <= r; dy++)
        for (int dx = -r; dx <= r; dx++) {
            uint8_t k = cell_class(cx + dx, cy + dy);
            if (k == 2 || (k >= 3 && k != 3 + walk.exit)) return false;
        }
    return true;
}

void walk_mouse(int x, int y, bool down) {
    uint32_t l = (uint32_t)(uint16_t)x | (uint32_t)(uint16_t)y << 16;
    platformTestMouse(x, y);
    rc_post(0, 0x200 /*WM_MOUSEMOVE*/, down ? 2 : 0, l);
}
bool walk_start(const std::string& arg, int frame) {
    int t = 1500;
    walk = Walk();
    char name[64];
    if (sscanf(arg.c_str(), "npc %63s %d", name, &t) >= 1)
        walk.npc_name = name;
    else if (sscanf(arg.c_str(), "exit %d %d", &walk.exit, &t) < 1 && sscanf(arg.c_str(), "%d %d %d", &walk.tx, &walk.ty, &t) < 2)
        return false;
    walk.on = true, walk.frame0 = frame, walk.until = frame + t;
    return true;
}
void walk_end(const char* why, int frame) {
    rc_log("walkto: %s at frame %d (%d frames)", why, frame, frame - walk.frame0);
    platformTestButtons(0);
    rc_post(0, 0x205 /*WM_RBUTTONUP*/, 0, 0);
    walk.on = false;
    if (!walk_queue.empty()) {
        std::string next = walk_queue.front();
        walk_queue.pop_front();
        rc_log("walkto: next, %s", next.c_str());
        walk_start(next, frame);
    } else {
        for (InputEv& e : after_walk) inputs.push_back({frame + e.frame, e.cmd});
        after_walk.clear();
    }
}


void walk_step(int frame) {
    if (!walk.on) return;
    walk_frame = frame;
#ifdef __EMSCRIPTEN__
    static int budget = getenv("RC_WALK_BUDGET") ? atoi(getenv("RC_WALK_BUDGET")) : 200;
#else
    static int budget = getenv("RC_WALK_BUDGET") ? atoi(getenv("RC_WALK_BUDGET")) : 1 << 30;
#endif
    walk_budget = budget;
    if (frame >= walk.until) return walk_end("timeout", frame);
    uint32_t elm = walk.ctrl && vt_is(walk.ctrl, 0xbf0a50) ? elm_of(walk.ctrl) : 0;
    if (!elm) {
        if (walk.fm) return walk_end("map changed", frame);   // the exit was taken
        if (frame % 15 || !(walk.ctrl = rc_heap_find(0xbf0a50, ctrl_ok))) return;   // no field map yet: wait
        elm = elm_of(walk.ctrl);
    }
    uint32_t fm = RD32m(elm + 0x618);
    if (walk.fm && fm != walk.fm) return walk_end("map changed", frame);
    if (!walk.fm) {
        walk.fm = fm;
        walk.w = (int)(RD32m(fm + 0x348) * RD32m(fm + 0x340)) / CELL;
        walk.h = (int)(RD32m(fm + 0x34c) * RD32m(fm + 0x344)) / CELL;
        walk.cls.assign((size_t)walk.w * walk.h, 0);
        walk.asked.assign((size_t)walk.w * walk.h, 0);
        rc_log("walkto: map %dx%d px, field map %08x", walk.w * CELL, walk.h * CELL, fm);
        if (getenv("RC_WALK_DUMP")) {   // walk_<frame>.ppm: one pixel per cell, black wall, grey floor, exits coloured
            walk_budget = 1 << 30;
            static const uint8_t RGB[][3] = {{0, 0, 0}, {160, 160, 160}, {0, 0, 0}, {0, 0, 255}, {0, 255, 255},
                                             {100, 0, 255}, {0, 100, 255}, {90, 30, 30}};
            char name[64];
            snprintf(name, sizeof name, "walk_%d.ppm", frame);
            if (FILE* f = fopen(name, "wb")) {
                fprintf(f, "P6 %d %d 255\n", walk.w, walk.h);
                for (int y = 0; y < walk.h; y++)
                    for (int x = 0; x < walk.w; x++) fwrite(RGB[cell_class(x, y)], 1, 3, f);
                fclose(f);
            }
        }
    }
    float px, py, camx, camy;
    memcpy(&px, rc_mem + elm + 0x70, 4); memcpy(&py, rc_mem + elm + 0x74, 4);
    memcpy(&camx, rc_mem + fm + 0x9a6f68, 4); memcpy(&camy, rc_mem + fm + 0x9a6f6c, 4);
    if (!walk.npc_name.empty()) {   // the target is wherever that avatar stands now
        if (!vt_is(walk.npc, 0xbf0adc) && (frame % 15 || !(walk.npc = avatar_named(walk.npc_name, fm)))) return;
        float nx, ny;
        memcpy(&nx, rc_mem + walk.npc + 0x70, 4); memcpy(&ny, rc_mem + walk.npc + 0x74, 4);
        walk.tx = (int)nx, walk.ty = (int)ny;
    }
    int reach = walk.npc_name.empty() ? 12 : 90;   // near an avatar, not overlapping it (a click there lists both)
    if (walk.exit < 0 && std::abs(px - walk.tx) < reach && std::abs(py - walk.ty) < reach) return walk_end("arrived", frame);
    // BFS from the avatar's cell to the nearest goal cell, keeping 2 cells off the walls; from a cell that close to a
    // wall (a spawn by a door) nothing has that clearance, so then again with none (else it steered straight into the
    // wall and never moved)
    int sx = (int)px / CELL, sy = (int)py / CELL, n = walk.w * walk.h, found = -1;
    if (sx < 0 || sy < 0 || sx >= walk.w || sy >= walk.h) return;
    std::vector<int> prev;
    for (int r = 2; r >= 0 && found < 0; r -= 2) {
        prev.assign(n, -1);
        std::deque<int> q;
        prev[sy * walk.w + sx] = sy * walk.w + sx;
        q.push_back(sy * walk.w + sx);
        while (!q.empty() && found < 0) {
            int i = q.front(); q.pop_front();
            for (int d = 0; d < 8; d++) {
                static const int DX[] = {1, -1, 0, 0, 1, 1, -1, -1}, DY[] = {0, 0, 1, -1, 1, -1, 1, -1};
                int x = i % walk.w + DX[d], y = i / walk.w + DY[d], j = y * walk.w + x;
                if (x < 0 || y < 0 || x >= walk.w || y >= walk.h || prev[j] >= 0 || !open(x, y, r)) continue;
                prev[j] = i;
                if (goal(x, y)) { found = j; break; }
                q.push_back(j);
            }
        }
        if (found < 0 && r == 2 && (frame - walk.frame0) % 60 == 0) rc_log("walkto: no clear path, trying close to walls");
    }
    // steer at the path cell 6 ahead (or the goal), the cursor 120 px from the avatar in that direction
    float wx = (float)walk.tx, wy = (float)walk.ty;
    if (found >= 0) {
        std::vector<int> path;
        for (int i = found; i != prev[i]; i = prev[i]) path.push_back(i);
        int k = path.size() > 6 ? (int)path.size() - 6 : 0;
        wx = (float)(path[k] % walk.w * CELL + CELL / 2), wy = (float)(path[k] / walk.w * CELL + CELL / 2);
    } else if (walk.exit >= 0) {
        if (frame % 60 == 0) rc_log("walkto: no path to exit %d from (%.0f,%.0f)", walk.exit, px, py);
        return;
    }
    float dx = wx - px, dy = wy - py, len = std::sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    int mx = (int)(px - camx + dx / len * 120), my = (int)(py - camy + dy / len * 120);
    mx = mx < 0 ? 0 : mx > 1023 ? 1023 : mx;
    my = my < 0 ? 0 : my > 767 ? 767 : my;
    walk_mouse(mx, my, true);
    // A press the game dropped (e.g. while an NPC popup was closing) never starts the walk: held 30 frames without
    // moving, the button is released and pressed again.
    if (std::abs(px - walk.lx) + std::abs(py - walk.ly) > 1) walk.lx = px, walk.ly = py, walk.still = 0;
    else if (walk.held && ++walk.still >= 30) {
        rc_log("walkto: not moving at (%.0f,%.0f), pressing again", px, py);
        platformTestButtons(0);
        rc_post(0, 0x205 /*WM_RBUTTONUP*/, 0, 0);
        walk.held = false, walk.still = 0;
        return;
    }
    if (!walk.held) {
        walk.held = true;
        platformTestButtons(2);
        rc_post(0, 0x204 /*WM_RBUTTONDOWN*/, 2, (uint32_t)(uint16_t)mx | (uint32_t)(uint16_t)my << 16);
    }
    if ((frame - walk.frame0) % 60 == 0)
        rc_log("walkto: avatar (%.0f,%.0f) cam (%.0f,%.0f) -> (%.0f,%.0f) cursor (%d,%d)", px, py, camx, camy, wx, wy, mx,
               my);
}

void run_input(int frame, const std::string& cmd) {
    if (cmd.rfind("starter ", 0) == 0) {   // ovr/starterdeck.c: "starter name|ifMissing|pc:n,...|pc:n,..."
        rc_starter_request(cmd.c_str() + 8);
        return;
    }
    if (cmd == "shot") {   // a screenshot of the next frame (drawn under RC_FASTFORWARD too): `+N:shot` after a walk
        shots.push_back(frame + 1);
        return;
    }
    char op[16] = {0}, arg[256] = {0};
    int x = 0, y = 0;
    sscanf(cmd.c_str(), "%15s %255[^\n]", op, arg);
    std::string o = op;
    rc_log("RC_INPUT frame %d: %s", frame, cmd.c_str());
    if (o == "clicknpc") {   // `clicknpc NAME`: hover that avatar's body, click it (the scene needs the hover first); the click
                             // opens a list of the avatars under the cursor with this one's row right there: click it too
        uint32_t ctrl = rc_heap_find(0xbf0a50, ctrl_ok), elm = ctrl ? elm_of(ctrl) : 0, fm = elm ? RD32m(elm + 0x618) : 0;
        uint32_t npc = fm ? avatar_named(arg, fm) : 0;
        if (!npc) {
            rc_log("clicknpc: no avatar named %s on this map", arg);
            return;
        }
        float nx, ny, cx, cy;
        memcpy(&nx, rc_mem + npc + 0x70, 4); memcpy(&ny, rc_mem + npc + 0x74, 4);
        memcpy(&cx, rc_mem + fm + 0x9a6f68, 4); memcpy(&cy, rc_mem + fm + 0x9a6f6c, 4);
        int sx = (int)(nx - cx), sy = (int)(ny - cy) - 40;   // the position is the feet: aim at the body
        rc_log("clicknpc: %s at world (%.0f,%.0f), screen (%d,%d)", arg, nx, ny, sx, sy);
        std::string at = std::to_string(sx) + " " + std::to_string(sy);
        std::string row = std::to_string(sx + 5) + " " + std::to_string(sy + 2);
        run_input(frame, "move " + at);
        inputs.push_back({frame + 10, "click " + at});
        inputs.push_back({frame + 60, "move " + row});
        inputs.push_back({frame + 70, "click " + row});
        return;
    }
    if (o == "walkto") {
        if (walk.on) walk_queue.push_back(arg);
        else walk_start(arg, frame);
        return;
    }
    if ((o == "rdown" || o == "rup") && sscanf(arg, "%d %d", &x, &y) == 2) {   // right button: the avatar walks
        uint32_t l = (uint32_t)(uint16_t)x | (uint32_t)(uint16_t)y << 16;      // while it is held
        platformTestMouse(x, y);
        rc_post(0, 0x200 /*WM_MOUSEMOVE*/, o == "rdown" ? 2 : 0, l);
        platformTestButtons(o == "rdown" ? 2 : 0);
        rc_post(0, o == "rdown" ? 0x204 /*WM_RBUTTONDOWN*/ : 0x205 /*WM_RBUTTONUP*/, o == "rdown" ? 2 : 0, l);
    } else if ((o == "move" || o == "click" || o == "down" || o == "up") && sscanf(arg, "%d %d", &x, &y) == 2) {
        uint32_t l = (uint32_t)(uint16_t)x | (uint32_t)(uint16_t)y << 16;
        static int held;   // MK_LBUTTON while a "down" is held, so a "move" in between is a drag
        platformTestMouse(x, y);
        rc_post(0, 0x200 /*WM_MOUSEMOVE*/, held, l);
        if (o == "down") held = 1;
        if (o == "up") held = 0;
        if (o == "click" || o == "down") {
            platformTestButtons(1);
            rc_post(0, 0x201 /*WM_LBUTTONDOWN*/, 1, l);
        }
        if (o == "click") inputs.push_back({frame + 4, "up " + std::to_string(x) + " " + std::to_string(y)});
        if (o == "up") {
            platformTestButtons(0);
            rc_post(0, 0x202 /*WM_LBUTTONUP*/, 0, l);
        }
    } else if (o == "dblclick" && sscanf(arg, "%d %d", &x, &y) == 2) {   // as Windows sends it: down, up, DBLCLK, up
        uint32_t l = (uint32_t)(uint16_t)x | (uint32_t)(uint16_t)y << 16;
        platformTestMouse(x, y);
        rc_post(0, 0x201 /*WM_LBUTTONDOWN*/, 1, l);
        rc_post(0, 0x202 /*WM_LBUTTONUP*/, 0, l);
        platformTestButtons(1);
        rc_post(0, 0x203 /*WM_LBUTTONDBLCLK*/, 1, l);
        inputs.push_back({frame + 4, "up " + std::to_string(x) + " " + std::to_string(y)});
    } else if (o == "text") {
        for (unsigned char ch : std::string(arg)) rc_post(0, 0x102 /*WM_CHAR*/, ch, 1);
    } else if (o == "key" || o == "keyup") {
        static const struct { const char* name; uint32_t vk; int sc; } keys[] = {
            {"enter", 0x0D, 40}, {"esc", 0x1B, 41}, {"bs", 0x08, 42}, {"tab", 0x09, 43}};   // SDL scancodes
        for (auto& k : keys)
            if (!strcmp(arg, k.name)) {
                bool down = o == "key";
                platformTestKey(k.sc, down);
                rc_post(0, down ? 0x100 : 0x101, k.vk, down ? 1 : 0xC0000001u);   // WM_KEYDOWN / WM_KEYUP
                if (down) {
                    rc_post(0, 0x102 /*WM_CHAR*/, k.vk, 1);
                    inputs.push_back({frame + 4, "keyup " + std::string(k.name)});
                }
            }
    }
}
}   // namespace

// fast-forward: whether the coming frame is drawn (its Clear/DrawPrimitiveUP/Present reach GL). Screenshot frames and
// every RC_FF_RENDER-th frame are; the rest only run the game's logic.
extern "C" int rc_render_frame = 1;
extern "C" int rc_duelspeed_frame(int frame);   // ovr/duelspeed.c
extern "C" int rc_frame_no;   // the present count, for logs (k32io.c RC_IOLAT)
extern "C" int rc_frame_no = 0;

extern "C" void rc_present_hook(void) {
    static int frame, ffEvery;
    static int maxFrames = -1;
    if (!frame) {
        if (const char* s = getenv("RC_SHOT"))
            for (const char* p = s; *p;) { shots.push_back(atoi(p)); p += strcspn(p, ","); if (*p) p++; }
        if (const char* f = getenv("RC_FRAMES")) maxFrames = atoi(f);
        if (const char* e = getenv("RC_FF_RENDER")) ffEvery = atoi(e);
        if (const char* in = getenv("RC_INPUT"))
            for (const char* p = in; *p;) {
                size_t n = strcspn(p, ";");
                std::string ev(p, n);
                size_t colon = ev.find(':');
                if (colon != std::string::npos)
                    (ev[0] == '+' ? after_walk : inputs).push_back({atoi(ev.c_str() + (ev[0] == '+')), ev.substr(colon + 1)});
                p += n;
                if (*p) p++;
            }
    }
    if (!frame) rc_audio_boot();   // the player's audio settings (rt/audioui.c), once the window is up
    frame++;
    rc_frame_no = frame;
    if (getenv("RC_TRACE_INPUT")) rc_log("-- frame %d", frame);
    for (size_t i = 0; i < inputs.size(); i++)   // by index: a click queues its button-up
        if (inputs[i].frame == frame) run_input(frame, inputs[i].cmd);
    // RC_INPUT_FILE=<path>: lines appended to that file run as they arrive, so a driver can steer a long run live (two
    // clients in one PvP duel); a line "shot" saves a screenshot of the next frame (drawn under RC_FASTFORWARD too)
    static const char* infile = getenv("RC_INPUT_FILE");
    if (infile && frame % 5 == 0)
        if (FILE* f = fopen(infile, "r")) {
            static long off;
            char line[512];
            fseek(f, off, SEEK_SET);
            while (fgets(line, sizeof line, f)) {
                size_t n = strlen(line);
                if (!n || line[n - 1] != '\n') break;   // still being written: read again next time
                off = ftell(f);
                line[n - 1] = 0;
                if (*line) run_input(frame, line);
            }
            fclose(f);
        }
    walk_step(frame);
    for (int s : shots)
        if (s == frame) rc_screenshot(frame);
    if (rc_fastforward) rc_render_frame = ffEvery > 0 && (frame + 1) % ffEvery == 0;
    else rc_render_frame = rc_duelspeed_frame(frame);   // above 1x, still the original 30 drawn frames a second
    for (int s : shots) rc_render_frame |= s == frame + 1;
    if (frame % 3000 == 0) rc_mem_report("now");
    if (frame % 300 == 0) {   // with the wall-clock frame rate over those 300 frames
        static auto t0 = std::chrono::steady_clock::now();
        auto t = std::chrono::steady_clock::now();
        rc_log("frame %d (%.1f fps)", frame, 300 / std::chrono::duration<double>(t - t0).count());
        t0 = t;
    }
    // RC_FRAMESTATS=1: every 30 presents, fps and the worst present-to-present gap (wall), and the main thread's CPU
    // per frame (mean and worst): CPU time is what the game itself spends, steady even when the machine is busy.
    static const bool stats = getenv("RC_FRAMESTATS") || getenv("RC_PROF");
    if (stats) {
        static double last, start, worst, cpuLast, cpuStart, cpuWorst;
        static int worstAt, cpuWorstAt;
        timespec ts;
        clock_gettime(CLOCK_MONOTONIC, &ts);
        double now = ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
        clock_gettime(CLOCK_THREAD_CPUTIME_ID, &ts);
        double cpu = ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
        if (!last) rc_prof_start();
        if (last) {
            rc_prof_frame(frame, last, now);
            clock_gettime(CLOCK_MONOTONIC, &ts);   // the profiler's own time is not the next frame's
            now = ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
            if (cpu - cpuLast > cpuWorst) cpuWorst = cpu - cpuLast, cpuWorstAt = frame;
            clock_gettime(CLOCK_THREAD_CPUTIME_ID, &ts);
            cpu = ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
        }
        if (last && now - last > worst) worst = now - last, worstAt = frame;
        if (!start) start = now, cpuStart = cpu;
        last = now, cpuLast = cpu;
        if (frame % 30 == 0) {
            rc_log("stats frame %d: %.1f fps, worst %.0f ms at %d; cpu %.1f ms/frame, worst %.0f ms at %d", frame,
                   30e3 / (now - start), worst, worstAt, (cpu - cpuStart) / 30, cpuWorst, cpuWorstAt);
            start = now, worst = 0, cpuStart = cpu, cpuWorst = 0;
        }
    }
    if (maxFrames >= 0 && frame >= maxFrames) {
        rc_log("RC_FRAMES reached (%d)", frame);
        rc_prof_end();
        fflush(stderr);
        _exit(0);
    }
}
