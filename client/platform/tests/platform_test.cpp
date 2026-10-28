// Input pump checks on a hidden window: synthetic SDL events in, Win32 messages and DirectInput state out.
#include <SDL.h>

#include <cstdio>
#include <vector>

#include "platform.h"

static int failures;
static std::vector<PlatformMsg> got;

static void check(bool ok, const char* what) {
    printf("%s %s\n", ok ? "ok  " : "FAIL", what);
    if (!ok) failures++;
}

static void onMsg(const PlatformMsg& m, void*) { got.push_back(m); }

static const PlatformMsg* find(uint32_t msg) {
    for (const PlatformMsg& m : got)
        if (m.msg == msg) return &m;
    return nullptr;
}

static void key(SDL_Scancode sc, SDL_Keycode k, bool down) {
    SDL_Event e{};
    e.type = down ? SDL_KEYDOWN : SDL_KEYUP;
    e.key.state = down ? SDL_PRESSED : SDL_RELEASED;
    e.key.keysym.scancode = sc;
    e.key.keysym.sym = k;
    SDL_PushEvent(&e);
}

int main() {
    if (!platformInit("platform_test", 800, 600, true)) return 1;

    key(SDL_SCANCODE_A, SDLK_a, true);
    got.clear();
    platformPump(onMsg, nullptr);
    const PlatformMsg* m = find(WM_KEYDOWN);
    check(m && m->wParam == 'A' && (m->lParam >> 16 & 0xff) == SDL_SCANCODE_A, "A -> WM_KEYDOWN VK 'A'");
    key(SDL_SCANCODE_RETURN, SDLK_RETURN, true);
    got.clear();
    platformPump(onMsg, nullptr);
    check(find(WM_CHAR) && find(WM_CHAR)->wParam == 0x0D, "Return also sends WM_CHAR 0x0D");
    key(SDL_SCANCODE_RETURN, SDLK_RETURN, false);
    got.clear();
    platformPump(onMsg, nullptr);
    m = find(WM_KEYUP);
    check(m && m->wParam == 0x0D && (m->lParam & 0xC0000000) == (intptr_t)0xC0000000, "WM_KEYUP transition bits");

    // DirectInput state and GetAsyncKeyState read SDL's live keyboard state, which pushed events don't change, so
    // only the idle case is checkable here (the SDL scancode -> DIK table is reviewed, not tested)
    uint8_t dik[256];
    platformKeyboardDik(dik);
    int down = 0;
    for (int i = 0; i < 256; i++) down += dik[i] != 0;
    check(down == 0, "DIK state empty with no real key down");

    SDL_Event e{};
    e.type = SDL_MOUSEMOTION;
    e.motion.x = 400;
    e.motion.y = 300;
    SDL_PushEvent(&e);
    got.clear();
    platformPump(onMsg, nullptr);
    m = find(WM_MOUSEMOVE);
    int w, h;
    SDL_GetWindowSize(SDL_GL_GetCurrentWindow(), &w, &h);
    char buf[120];
    snprintf(buf, sizeof buf, "mouse (400,300) in a %dx%d window -> game (%ld,%ld)", w, h,
             m ? (long)(m->lParam & 0xffff) : -1L, m ? (long)(m->lParam >> 16 & 0xffff) : -1L);
    check(m && (m->lParam & 0xffff) == 400 * 800 / w && (m->lParam >> 16 & 0xffff) == 300 * 600 / h, buf);

    platformPostMessage(0x1401, 7, 1);   // a socket notification, as src/Net will post it
    got.clear();
    platformPump(onMsg, nullptr);
    m = find(0x1401);
    check(m && m->wParam == 7 && m->lParam == 1, "PostMessage delivered by the next pump");

    platformSetTimer(42, 20);
    uint32_t t0 = platformTimeMs();
    int ticks = 0;
    while (platformTimeMs() - t0 < 110) {
        got.clear();
        platformPump(onMsg, nullptr);
        for (const PlatformMsg& p : got) ticks += p.msg == WM_TIMER && p.wParam == 42;
        platformSleep(1);
    }
    platformKillTimer(42);
    snprintf(buf, sizeof buf, "WM_TIMER every 20 ms for 110 ms: %d ticks", ticks);
    check(ticks >= 4 && ticks <= 6, buf);
    got.clear();
    platformSleep(30);
    platformPump(onMsg, nullptr);
    check(!find(WM_TIMER), "KillTimer stops it");

    e = SDL_Event{};
    e.type = SDL_QUIT;
    SDL_PushEvent(&e);
    got.clear();
    check(!platformPump(onMsg, nullptr) && find(WM_CLOSE), "SDL_QUIT -> WM_CLOSE, pump returns false");

    platformShutdown();
    printf(failures ? "FAILED %d\n" : "PASS\n", failures);
    return failures ? 1 : 0;
}
