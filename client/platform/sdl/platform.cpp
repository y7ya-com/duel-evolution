#include "platform.h"

#include <SDL.h>

#include <cstdlib>
#include <deque>
#include <mutex>
#include <vector>

#include "gl.h"
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

static SDL_Window* gWindow;
static SDL_GLContext gGl;
static int gGameW, gGameH;
static std::mutex gPostLock;                 // PostMessage may come from the loader threads
static std::deque<PlatformMsg> gPosted;
struct Timer { uintptr_t id; uint32_t every, next; };
static std::vector<Timer> gTimers;
static bool gTestKeys[SDL_NUM_SCANCODES];
static int gTestMouseX = -1, gTestMouseY;
static uint32_t gTestButtons;   // MK_* held by platformTestButtons, OR-ed into the real mouse
// A press shorter than a frame (a trackpad tap) would be gone before the game polls the button once per frame:
// each press stays visible until the end of the next whole frame. gMouseX/Y also follow button events, since a
// press can arrive without a motion event before it.
static uint32_t gLatch, gLatchArmed;   // SDL_BUTTON masks
static int gMouseX = -1, gMouseY;
// A press away from where the cursor was at the last frame (a tap with no hover before it) is held back one frame
// behind its WM_MOUSEMOVE: the game's buttons only take a press they were already hovered for.
static std::deque<SDL_Event> gHeld;   // button events waiting for the next frame, in order
static bool gHeldReady;
static int gFrameX = -1, gFrameY;    // cursor at the last present

bool platformInit(const char* title, int width, int height, bool hidden) {
    gGameW = width;
    gGameH = height;
#ifdef __EMSCRIPTEN__
    // Node (the web tests): no DOM, so no window or WebGL; events, timers and the message pump still work
    if (hidden && EM_ASM_INT({ return typeof document === 'undefined'; })) return SDL_Init(SDL_INIT_TIMER | SDL_INIT_EVENTS) == 0;
#endif
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER) != 0) {
        SDL_Log("SDL_Init: %s", SDL_GetError());
        return false;
    }
#ifdef __EMSCRIPTEN__
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);   // WebGL2
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
#else
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
#endif
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);   // CreateDevice asks for D16/D24 (EnableAutoDepthStencil)
    gWindow = SDL_CreateWindow(title, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, width, height,
                               SDL_WINDOW_OPENGL | SDL_WINDOW_ALLOW_HIGHDPI | (hidden ? SDL_WINDOW_HIDDEN : 0));
    if (!gWindow) { SDL_Log("SDL_CreateWindow: %s", SDL_GetError()); return false; }
    gGl = SDL_GL_CreateContext(gWindow);
    if (!gGl) { SDL_Log("SDL_GL_CreateContext: %s", SDL_GetError()); return false; }
    // Present with D3DPRESENT_INTERVAL_DEFAULT; a hidden window has no display to sync to (macOS throttles its swaps)
    SDL_GL_SetSwapInterval(hidden ? 0 : 1);
    SDL_StartTextInput();
    return true;
}

// SDL keycode -> Win32 virtual-key code
static uintptr_t toVk(SDL_Keycode k) {
    if (k >= 'a' && k <= 'z') return k - 'a' + 'A';
    if (k >= '0' && k <= '9') return k;
    if (k >= SDLK_F1 && k <= SDLK_F12) return 0x70 + (k - SDLK_F1);
    if (k >= SDLK_KP_1 && k <= SDLK_KP_9) return 0x61 + (k - SDLK_KP_1);
    switch (k) {
    case SDLK_BACKSPACE: return 0x08;
    case SDLK_TAB: return 0x09;
    case SDLK_RETURN: case SDLK_KP_ENTER: return 0x0D;
    case SDLK_LSHIFT: case SDLK_RSHIFT: return 0x10;
    case SDLK_LCTRL: case SDLK_RCTRL: return 0x11;
    case SDLK_LALT: case SDLK_RALT: return 0x12;
    case SDLK_PAUSE: return 0x13;
    case SDLK_CAPSLOCK: return 0x14;
    case SDLK_ESCAPE: return 0x1B;
    case SDLK_SPACE: return 0x20;
    case SDLK_PAGEUP: return 0x21;
    case SDLK_PAGEDOWN: return 0x22;
    case SDLK_END: return 0x23;
    case SDLK_HOME: return 0x24;
    case SDLK_LEFT: return 0x25;
    case SDLK_UP: return 0x26;
    case SDLK_RIGHT: return 0x27;
    case SDLK_DOWN: return 0x28;
    case SDLK_INSERT: return 0x2D;
    case SDLK_DELETE: return 0x2E;
    case SDLK_KP_0: return 0x60;
    default: return 0;
    }
}

// Window points -> game pixels
static void toGame(int* x, int* y) {
    int ww = 0, wh = 0;
    if (gWindow) SDL_GetWindowSize(gWindow, &ww, &wh);
    if (ww > 0 && wh > 0) {
        *x = *x * gGameW / ww;
        *y = *y * gGameH / wh;
    }
}

static uintptr_t mouseKeys() {
    uint32_t b = SDL_GetMouseState(nullptr, nullptr) | gLatch | (gTestButtons & 1 ? SDL_BUTTON_LMASK : 0) |
                 (gTestButtons & 2 ? SDL_BUTTON_RMASK : 0);
    SDL_Keymod m = SDL_GetModState();
    return (b & SDL_BUTTON_LMASK ? 0x1 : 0) | (b & SDL_BUTTON_RMASK ? 0x2 : 0) | (m & KMOD_SHIFT ? 0x4 : 0) |
           (m & KMOD_CTRL ? 0x8 : 0) | (b & SDL_BUTTON_MMASK ? 0x10 : 0);   // MK_*
}

static intptr_t xy(int x, int y) {   // MAKELPARAM, in game pixels
    toGame(&x, &y);
    return (intptr_t)((uint16_t)x | (uint32_t)(uint16_t)y << 16);
}

bool platformPump(void (*onMsg)(const PlatformMsg& m, void* user), void* user) {
    SDL_Event e;
    bool alive = true;
    auto emit = [&](uint32_t msg, uintptr_t w, intptr_t l) { onMsg(PlatformMsg{msg, w, l}, user); };
    bool replay = false;
    auto next = [&](SDL_Event* ev) {
        replay = gHeldReady && !gHeld.empty();
        if (replay) { *ev = gHeld.front(); gHeld.pop_front(); return true; }
        gHeldReady = false;
        return SDL_PollEvent(ev) != 0;
    };
    while (next(&e)) {
        switch (e.type) {
        case SDL_QUIT:
            emit(WM_CLOSE, 0, 0);
            alive = false;
            break;
        case SDL_WINDOWEVENT:
            if (e.window.event == SDL_WINDOWEVENT_FOCUS_GAINED) emit(WM_SETFOCUS, 0, 0);
            if (e.window.event == SDL_WINDOWEVENT_FOCUS_LOST) emit(WM_KILLFOCUS, 0, 0);
            if (e.window.event == SDL_WINDOWEVENT_SIZE_CHANGED)   // the game keeps its own size; report that
                emit(WM_SIZE, 0, (intptr_t)((uint16_t)gGameW | (uint32_t)(uint16_t)gGameH << 16));
            break;
        case SDL_KEYDOWN:
        case SDL_KEYUP: {
            uintptr_t vk = toVk(e.key.keysym.sym);
            if (!vk) break;
            bool down = e.type == SDL_KEYDOWN;
            intptr_t l = 1 | (intptr_t)(e.key.keysym.scancode & 0xff) << 16 | (e.key.repeat ? 1 << 30 : 0) |
                         (down ? 0 : 0xC0000000);
            emit(down ? WM_KEYDOWN : WM_KEYUP, vk, l);
            // TEXTINPUT does not report these, but WM_CHAR does
            if (down && (vk == 0x08 || vk == 0x09 || vk == 0x0D || vk == 0x1B)) emit(WM_CHAR, vk, l);
            break;
        }
        case SDL_TEXTINPUT: {
            // ponytail: one WM_CHAR per UTF-8 code point (BMP). The game is ANSI (CP932 / CP1252); converting to
            // its code page and the IME composition messages are the input owner's call (DESIGN.md, Input).
            const unsigned char* s = (const unsigned char*)e.text.text;
            while (*s) {
                uint32_t c = *s++;
                int extra = c >= 0xF0 ? 3 : c >= 0xE0 ? 2 : c >= 0xC0 ? 1 : 0;
                c &= extra ? 0x3F >> extra : 0x7F;
                while (extra-- && (*s & 0xC0) == 0x80) c = c << 6 | (*s++ & 0x3F);
                if (c >= 0x20 && c < 0x10000) emit(WM_CHAR, c, 1);
            }
            break;
        }
        case SDL_MOUSEMOTION:
            gMouseX = e.motion.x, gMouseY = e.motion.y;
            emit(WM_MOUSEMOVE, mouseKeys(), xy(e.motion.x, e.motion.y));
            break;
        case SDL_MOUSEBUTTONDOWN:
        case SDL_MOUSEBUTTONUP: {
            bool down = e.type == SDL_MOUSEBUTTONDOWN;
            bool jumped = down && (e.button.x != gFrameX || e.button.y != gFrameY);
            if (!replay && (jumped || !gHeld.empty())) {
                if (gHeld.empty()) emit(WM_MOUSEMOVE, mouseKeys(), xy(e.button.x, e.button.y));
                gMouseX = e.button.x, gMouseY = e.button.y;
                gHeld.push_back(e);
                break;
            }
            gMouseX = e.button.x, gMouseY = e.button.y;
            if (down) gLatch |= SDL_BUTTON(e.button.button);
            bool dbl = down && e.button.clicks == 2;
            uint32_t msg = 0;
            if (e.button.button == SDL_BUTTON_LEFT) msg = dbl ? WM_LBUTTONDBLCLK : down ? WM_LBUTTONDOWN : WM_LBUTTONUP;
            if (e.button.button == SDL_BUTTON_RIGHT) msg = dbl ? WM_RBUTTONDBLCLK : down ? WM_RBUTTONDOWN : WM_RBUTTONUP;
            if (e.button.button == SDL_BUTTON_MIDDLE) msg = down ? WM_MBUTTONDOWN : WM_MBUTTONUP;
            if (msg) emit(msg, mouseKeys(), xy(e.button.x, e.button.y));
            break;
        }
        case SDL_MOUSEWHEEL: {
            int x, y;
            SDL_GetMouseState(&x, &y);   // WM_MOUSEWHEEL carries screen coords; the window is the screen here
            emit(WM_MOUSEWHEEL, mouseKeys() | (uintptr_t)(uint16_t)(int16_t)(e.wheel.y * 120) << 16, xy(x, y));
            break;
        }
        }
    }
    std::deque<PlatformMsg> posted;
    {
        std::lock_guard<std::mutex> lock(gPostLock);
        posted.swap(gPosted);
    }
    for (const PlatformMsg& m : posted) onMsg(m, user);
    uint32_t now = platformTimeMs();
    for (size_t i = 0; i < gTimers.size(); i++) {   // by index: a WM_TIMER handler may set or kill timers
        if ((int32_t)(now - gTimers[i].next) < 0) continue;
        gTimers[i].next = now + gTimers[i].every;
        emit(WM_TIMER, gTimers[i].id, 0);
    }
    return alive;
}

void platformPresent() {
    gLatch &= ~gLatchArmed;   // a press latched before the last frame has now been seen for a whole frame
    gLatchArmed = gLatch;
    gFrameX = gMouseX, gFrameY = gMouseY;
    if (!gHeld.empty()) gHeldReady = true;
    if (gWindow) SDL_GL_SwapWindow(gWindow);
}

void platformDrawableSize(int* w, int* h) {
    *w = gGameW;
    *h = gGameH;
    if (gWindow) SDL_GL_GetDrawableSize(gWindow, w, h);
}

void platformShutdown() {
    SDL_GL_DeleteContext(gGl);
    SDL_DestroyWindow(gWindow);
    SDL_Quit();
}

uint32_t platformTimeMs() { return (uint32_t)SDL_GetTicks64(); }

void platformSleep(uint32_t ms) {
#ifndef __EMSCRIPTEN__
    SDL_Delay(ms);
#else
    (void)ms;
#endif
}

// SDL scancode (USB HID) -> DIK_* (PC set-1 scancode), for CDirectInput's 256-byte key state
static uint8_t toDik(SDL_Scancode s) {
    if (s >= SDL_SCANCODE_A && s <= SDL_SCANCODE_Z) {
        static const uint8_t letters[26] = {0x1E, 0x30, 0x2E, 0x20, 0x12, 0x21, 0x22, 0x23, 0x17, 0x24, 0x25, 0x26,
                                            0x32, 0x31, 0x18, 0x19, 0x10, 0x13, 0x1F, 0x14, 0x16, 0x2F, 0x11, 0x2D,
                                            0x15, 0x2C};
        return letters[s - SDL_SCANCODE_A];
    }
    if (s >= SDL_SCANCODE_1 && s <= SDL_SCANCODE_0) return (uint8_t)(0x02 + (s - SDL_SCANCODE_1));   // 1..9, 0
    if (s >= SDL_SCANCODE_F1 && s <= SDL_SCANCODE_F10) return (uint8_t)(0x3B + (s - SDL_SCANCODE_F1));
    switch (s) {
    case SDL_SCANCODE_F11: return 0x57;
    case SDL_SCANCODE_F12: return 0x58;
    case SDL_SCANCODE_ESCAPE: return 0x01;
    case SDL_SCANCODE_MINUS: return 0x0C;
    case SDL_SCANCODE_EQUALS: return 0x0D;
    case SDL_SCANCODE_BACKSPACE: return 0x0E;
    case SDL_SCANCODE_TAB: return 0x0F;
    case SDL_SCANCODE_LEFTBRACKET: return 0x1A;
    case SDL_SCANCODE_RIGHTBRACKET: return 0x1B;
    case SDL_SCANCODE_RETURN: return 0x1C;
    case SDL_SCANCODE_LCTRL: return 0x1D;
    case SDL_SCANCODE_SEMICOLON: return 0x27;
    case SDL_SCANCODE_APOSTROPHE: return 0x28;
    case SDL_SCANCODE_GRAVE: return 0x29;
    case SDL_SCANCODE_LSHIFT: return 0x2A;
    case SDL_SCANCODE_BACKSLASH: return 0x2B;
    case SDL_SCANCODE_COMMA: return 0x33;
    case SDL_SCANCODE_PERIOD: return 0x34;
    case SDL_SCANCODE_SLASH: return 0x35;
    case SDL_SCANCODE_RSHIFT: return 0x36;
    case SDL_SCANCODE_KP_MULTIPLY: return 0x37;
    case SDL_SCANCODE_LALT: return 0x38;
    case SDL_SCANCODE_SPACE: return 0x39;
    case SDL_SCANCODE_CAPSLOCK: return 0x3A;
    case SDL_SCANCODE_KP_7: return 0x47;
    case SDL_SCANCODE_KP_8: return 0x48;
    case SDL_SCANCODE_KP_9: return 0x49;
    case SDL_SCANCODE_KP_MINUS: return 0x4A;
    case SDL_SCANCODE_KP_4: return 0x4B;
    case SDL_SCANCODE_KP_5: return 0x4C;
    case SDL_SCANCODE_KP_6: return 0x4D;
    case SDL_SCANCODE_KP_PLUS: return 0x4E;
    case SDL_SCANCODE_KP_1: return 0x4F;
    case SDL_SCANCODE_KP_2: return 0x50;
    case SDL_SCANCODE_KP_3: return 0x51;
    case SDL_SCANCODE_KP_0: return 0x52;
    case SDL_SCANCODE_KP_PERIOD: return 0x53;
    case SDL_SCANCODE_KP_ENTER: return 0x9C;
    case SDL_SCANCODE_RCTRL: return 0x9D;
    case SDL_SCANCODE_KP_DIVIDE: return 0xB5;
    case SDL_SCANCODE_RALT: return 0xB8;
    case SDL_SCANCODE_HOME: return 0xC7;
    case SDL_SCANCODE_UP: return 0xC8;
    case SDL_SCANCODE_PAGEUP: return 0xC9;
    case SDL_SCANCODE_LEFT: return 0xCB;
    case SDL_SCANCODE_RIGHT: return 0xCD;
    case SDL_SCANCODE_END: return 0xCF;
    case SDL_SCANCODE_DOWN: return 0xD0;
    case SDL_SCANCODE_PAGEDOWN: return 0xD1;
    case SDL_SCANCODE_INSERT: return 0xD2;
    case SDL_SCANCODE_DELETE: return 0xD3;
    default: return 0;
    }
}

void platformKeyboardDik(uint8_t state[256]) {
    int n;
    const uint8_t* keys = SDL_GetKeyboardState(&n);
    for (int i = 0; i < 256; i++) state[i] = 0;
    for (int s = 0; s < n; s++)
        if (keys[s] || gTestKeys[s]) {
            uint8_t d = toDik((SDL_Scancode)s);
            if (d) state[d] = 0x80;
        }
}

bool platformKeyDownVk(int vk) {
    uint32_t b = SDL_GetMouseState(nullptr, nullptr) | gLatch | (gTestButtons & 1 ? SDL_BUTTON_LMASK : 0) |
                 (gTestButtons & 2 ? SDL_BUTTON_RMASK : 0);
    if (vk == 0x01) return b & SDL_BUTTON_LMASK;
    if (vk == 0x02) return b & SDL_BUTTON_RMASK;
    if (vk == 0x04) return b & SDL_BUTTON_MMASK;
    int n;
    const uint8_t* keys = SDL_GetKeyboardState(&n);
    for (int s = 0; s < n; s++)
        if ((keys[s] || gTestKeys[s]) && (int)toVk(SDL_GetKeyFromScancode((SDL_Scancode)s)) == vk) return true;
    return false;
}

void platformMouse(int* x, int* y, int* buttons) {
    int mx, my;
    SDL_GetMouseState(&mx, &my);
    if (gMouseX >= 0) mx = gMouseX, my = gMouseY;
    toGame(&mx, &my);
    if (gTestMouseX >= 0) {
        mx = gTestMouseX;
        my = gTestMouseY;
    }
    if (x) *x = mx;
    if (y) *y = my;
    if (buttons) *buttons = (int)mouseKeys();
}

void platformSetMouse(int x, int y) {
#ifndef __EMSCRIPTEN__
    int ww, wh;
    SDL_GetWindowSize(gWindow, &ww, &wh);
    SDL_WarpMouseInWindow(gWindow, x * ww / gGameW, y * wh / gGameH);
#else
    (void)x, (void)y;
#endif
}

void platformShowCursor(bool show) { SDL_ShowCursor(show ? SDL_ENABLE : SDL_DISABLE); }

void platformDesktopSize(int* w, int* h) {
    SDL_DisplayMode m;
    if (SDL_GetDesktopDisplayMode(0, &m) == 0) {
        *w = m.w;
        *h = m.h;
    } else {
        *w = 1920;
        *h = 1080;
    }
}

void platformMessageBox(const char* title, const char* text) {
    // YO2_HIDDEN (tests, the native boot): never a modal box on someone's screen
    if (getenv("YO2_HIDDEN") || SDL_ShowSimpleMessageBox(SDL_MESSAGEBOX_INFORMATION, title, text, gWindow) != 0)
        SDL_Log("%s: %s", title, text);   // no display (tests, headless)
}

void platformSetFullscreen(bool on) { SDL_SetWindowFullscreen(gWindow, on ? SDL_WINDOW_FULLSCREEN_DESKTOP : 0); }

void platformPostMessage(uint32_t msg, uintptr_t wParam, intptr_t lParam) {
    std::lock_guard<std::mutex> lock(gPostLock);
    gPosted.push_back(PlatformMsg{msg, wParam, lParam});
}

void platformSetTimer(uintptr_t id, uint32_t ms) {
    platformKillTimer(id);   // SetTimer with a live id replaces it
    gTimers.push_back(Timer{id, ms, platformTimeMs() + ms});
}

void platformKillTimer(uintptr_t id) {
    for (size_t i = 0; i < gTimers.size(); i++)
        if (gTimers[i].id == id) gTimers.erase(gTimers.begin() + i--);
}

void platformTestKey(int sdlScancode, bool down) {
    if (sdlScancode >= 0 && sdlScancode < SDL_NUM_SCANCODES) gTestKeys[sdlScancode] = down;
}

void platformTestButtons(int mk) { gTestButtons = (uint32_t)mk; }

void platformTestMouse(int x, int y) {
    gTestMouseX = x;
    gTestMouseY = y;
}
