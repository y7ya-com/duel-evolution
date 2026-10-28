// Skeleton host: 800x600 window, D3D8-subset device, clear + present, pump input. Stands in for WinMain until the
// game loop lands.
//   yo2_skeleton [--frames N] [--verbose]     (--frames: quit after N frames, for smoke tests)
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "d3d8.h"
#include "gl.h"
#include "platform.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

static int gFrames = -1;
static bool gVerbose = false;
static bool gAlive = true;
static IDirect3DDevice8* gDev;

static void onMsg(const PlatformMsg& m, void*) {
    if (gVerbose) printf("msg %04x w=%lx l=%lx\n", m.msg, (unsigned long)m.wParam, (unsigned long)m.lParam);
}

static void frame() {
    if (!platformPump(onMsg, nullptr) || gFrames == 0) gAlive = false;
    gDev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, D3DCOLOR_ARGB(255, 13, 26, 77), 1, 0);
    gDev->Present(nullptr, nullptr, nullptr, nullptr);
    if (gFrames > 0) gFrames--;
#ifdef __EMSCRIPTEN__
    if (!gAlive) emscripten_cancel_main_loop();
#endif
}

int main(int argc, char** argv) {
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--frames") && i + 1 < argc) gFrames = atoi(argv[++i]);
        if (!strcmp(argv[i], "--verbose")) gVerbose = true;
    }
    if (!platformInit("Yu-Gi-Oh! Online 2", 800, 600)) return 1;
    printf("GL %s | %s\n", (const char*)glGetString(GL_VERSION), (const char*)glGetString(GL_RENDERER));
    D3DPRESENT_PARAMETERS pp{};   // what CD3DDevice::Initialize asks for (FUN_00585270)
    pp.BackBufferWidth = 800;
    pp.BackBufferHeight = 600;
    pp.BackBufferFormat = D3DFMT_X8R8G8B8;
    pp.Windowed = 1;
    pp.EnableAutoDepthStencil = 1;
    pp.AutoDepthStencilFormat = D3DFMT_D16;
    if (Direct3DCreate8(220)->CreateDevice(0, D3DDEVTYPE_HAL, nullptr, 0x44, &pp, &gDev) != D3D_OK) return 1;
#ifdef __EMSCRIPTEN__
    emscripten_set_main_loop(frame, 0, 1);
#else
    while (gAlive) frame();
    platformShutdown();
#endif
    return 0;
}
