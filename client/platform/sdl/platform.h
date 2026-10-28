// Window, GL context, input, time and the message pump. Input comes out as Win32 (msg, wParam, lParam) triples so
// the game's own window procedure (yaneSDK CAppFrame + the game's handlers) can be fed unchanged instead of GetMessage/DispatchMessage.
#pragma once
#include <cstdint>

struct PlatformMsg {
    uint32_t msg;       // WM_*
    uintptr_t wParam;
    intptr_t lParam;
};

// GL 3.3 core natively, WebGL2 on the web. width x height are game pixels: mouse coordinates are always reported in
// them, whatever size the window ends up (HiDPI, fullscreen). hidden: for tests.
bool platformInit(const char* title, int width, int height, bool hidden = false);
// Drains pending OS events into onMsg. Returns false once the window was closed (after delivering WM_CLOSE).
bool platformPump(void (*onMsg)(const PlatformMsg& m, void* user), void* user);
void platformPresent();
void platformDrawableSize(int* w, int* h);   // pixels (HiDPI); game coordinates stay width x height
void platformShutdown();

// ---- what yaneSDK's Win32/DirectX calls become (DESIGN.md §1)
uint32_t platformTimeMs();                          // timeGetTime / GetTickCount: ms since start, wraps like DWORD
void platformSleep(uint32_t ms);                    // Sleep (a no-op on the web: the browser owns the frame loop)
void platformKeyboardDik(uint8_t state[256]);       // IDirectInputDevice::GetDeviceState: DIK_* index, 0x80 = down
bool platformKeyDownVk(int vk);                     // GetAsyncKeyState / GetKeyState, VK_* incl. VK_LBUTTON/RBUTTON
void platformMouse(int* x, int* y, int* buttons);   // client coords in game pixels; buttons MK_LBUTTON|MK_RBUTTON|..
void platformSetMouse(int x, int y);                // SetCursorPos (game pixels; ignored on the web)
void platformShowCursor(bool show);                 // ShowCursor
void platformDesktopSize(int* w, int* h);          // GetSystemMetrics(SM_CXSCREEN) / SPI_GETWORKAREA
void platformMessageBox(const char* title, const char* text);   // MessageBox (OK only)
void platformSetFullscreen(bool on);                // the windowed <-> fullscreen switch (D3D Reset path)
void platformPostMessage(uint32_t msg, uintptr_t wParam, intptr_t lParam);   // PostMessage: delivered by the pump
void platformSetTimer(uintptr_t id, uint32_t ms);   // SetTimer: the pump emits WM_TIMER(id) every ms
void platformKillTimer(uintptr_t id);

// Tests only: SDL's live keyboard/mouse state can't be set from pushed events, so these stand in for it
void platformTestKey(int sdlScancode, bool down);
void platformTestMouse(int x, int y);   // game pixels; x < 0 = back to the real mouse
void platformTestButtons(int mk);      // MK_LBUTTON 1 | MK_RBUTTON 2 held down (tests, scripted input)

#ifndef WM_KEYDOWN   // windows.h (or platform/win32) already defines them as macros
enum : uint32_t {   // the subset the pump emits (winuser.h values)
    WM_SIZE = 0x0005, WM_SETFOCUS = 0x0007, WM_KILLFOCUS = 0x0008, WM_CLOSE = 0x0010,
    WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101, WM_CHAR = 0x0102,
    WM_MOUSEMOVE = 0x0200, WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202, WM_LBUTTONDBLCLK = 0x0203,
    WM_RBUTTONDOWN = 0x0204, WM_RBUTTONUP = 0x0205, WM_RBUTTONDBLCLK = 0x0206,
    WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208, WM_MOUSEWHEEL = 0x020A, WM_TIMER = 0x0113,
};
#endif
