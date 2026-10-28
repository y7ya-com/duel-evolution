// The slice of platform/win32/d3d8.h System calls, without GL: every call is appended to g_d3dLog so tests can check
// what the game code asked the device to do.
#ifndef _WIN32  // it fakes the stand-in d3d8.h; on Windows the real COM interfaces are abstract
#include <cstdio>
#include <string>

#include "System/CD3DDevice.h"  // d3d8.h, with windows.h first

std::string g_d3dLog;
static void log(const char* fmt, unsigned a = 0, unsigned b = 0, unsigned c = 0) {
    char buf[128];
    std::snprintf(buf, sizeof buf, fmt, a, b, c);
    g_d3dLog += buf;
}

IDirect3D8* Direct3DCreate8(UINT) { return new IDirect3D8; }
UINT IDirect3D8::GetAdapterModeCount(UINT) { return 2; }
HRESULT IDirect3D8::EnumAdapterModes(UINT, UINT mode, D3DDISPLAYMODE* out) {
    *out = mode == 0 ? D3DDISPLAYMODE{640, 480, 60, D3DFMT_X8R8G8B8} : D3DDISPLAYMODE{800, 600, 60, D3DFMT_X8R8G8B8};
    return D3D_OK;
}
HRESULT IDirect3D8::GetAdapterDisplayMode(UINT, D3DDISPLAYMODE* out) {
    *out = {800, 600, 60, D3DFMT_X8R8G8B8};
    return D3D_OK;
}
HRESULT IDirect3D8::GetDeviceCaps(UINT, D3DDEVTYPE, D3DCAPS8* caps) {
    *caps = {};
    caps->TextureOpCaps = D3DTEXOPCAPS_MULTIPLYADD;
    return D3D_OK;
}
HRESULT IDirect3D8::CreateDevice(UINT, D3DDEVTYPE, HWND, DWORD flags, D3DPRESENT_PARAMETERS* pp,
                                 IDirect3DDevice8** device) {
    log("CreateDevice(%x,%u)", flags, pp->Windowed);
    *device = new IDirect3DDevice8;
    (*device)->pp = *pp;
    return D3D_OK;
}
IDirect3DDevice8::~IDirect3DDevice8() {}
HRESULT IDirect3DDevice8::Reset(D3DPRESENT_PARAMETERS* p) {
    log("Reset(%u)", p->Windowed);
    pp = *p;
    return D3D_OK;
}
HRESULT IDirect3DDevice8::SetRenderState(D3DRENDERSTATETYPE s, DWORD v) {
    log("RS(%u,%x)", s, v);
    rs[s] = v;
    return D3D_OK;
}
HRESULT IDirect3DDevice8::GetRenderState(D3DRENDERSTATETYPE s, DWORD* v) {
    *v = rs[s];
    return D3D_OK;
}
HRESULT IDirect3DDevice8::SetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE t, DWORD v) {
    log("TSS(%u,%u,%x)", stage, t, v);
    tss[t] = v;
    return D3D_OK;
}
#endif  // _WIN32
