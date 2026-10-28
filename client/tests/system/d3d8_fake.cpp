// The slice of platform/win32/d3d8.h System calls, without GL: every call is appended to g_d3dLog so tests can check
// what the game code asked the device to do.
#ifndef _WIN32  // it fakes the stand-in d3d8.h; on Windows the real COM interfaces are abstract
#include <cassert>
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
UINT g_fakeModeCount = 2;  // 3 adds 1024x768 (the game's own size)
UINT IDirect3D8::GetAdapterModeCount(UINT) { return g_fakeModeCount; }
HRESULT IDirect3D8::EnumAdapterModes(UINT, UINT mode, D3DDISPLAYMODE* out) {
    static const D3DDISPLAYMODE kModes[] = {
        {640, 480, 60, D3DFMT_X8R8G8B8}, {800, 600, 60, D3DFMT_X8R8G8B8}, {1024, 768, 60, D3DFMT_X8R8G8B8}};
    *out = kModes[mode];
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

// Textures: fake images are "IMG <w> <h>"; textures only remember their size.
#include <cstring>

#include <d3dx8.h>

int g_texturesAlive;
UINT g_fakeMaxTexture = 256;

HRESULT IDirect3DDevice8::GetDeviceCaps(D3DCAPS8* caps) {
    *caps = {};
    caps->MaxTextureWidth = caps->MaxTextureHeight = g_fakeMaxTexture;
    return D3D_OK;
}
HRESULT IDirect3DDevice8::CreateTexture(UINT w, UINT h, UINT, DWORD, D3DFORMAT fmt, D3DPOOL pool,
                                        IDirect3DTexture8** out) {
    auto* t = new IDirect3DTexture8;
    t->level0.w = w;
    t->level0.h = h;
    t->level0.fmt = fmt;
    t->level0.pool = pool;
    t->level0.owner = t;
    ++g_texturesAlive;
    *out = t;
    return D3D_OK;
}
HRESULT IDirect3DDevice8::CreateImageSurface(UINT w, UINT h, D3DFORMAT fmt, IDirect3DSurface8** out) {
    auto* s = new IDirect3DSurface8;
    s->w = w;
    s->h = h;
    s->fmt = fmt;
    *out = s;
    return D3D_OK;
}
IDirect3DTexture8::~IDirect3DTexture8() { --g_texturesAlive; }
HRESULT IDirect3DTexture8::GetLevelDesc(UINT, D3DSURFACE_DESC* d) {
    *d = {};
    d->Format = level0.fmt;
    d->Pool = level0.pool;
    d->Width = level0.w;
    d->Height = level0.h;
    return D3D_OK;
}
HRESULT IDirect3DTexture8::GetSurfaceLevel(UINT, IDirect3DSurface8** s) {
    *s = &level0;
    AddRef();
    return D3D_OK;
}
UINT IDirect3DSurface8::AddRef() { return owner ? owner->AddRef() : ComObject::AddRef(); }
UINT IDirect3DSurface8::Release() { return owner ? owner->Release() : ComObject::Release(); }
IDirect3DSurface8::~IDirect3DSurface8() {}

static bool fakeImage(const void* data, UINT size, UINT* w, UINT* h) {
    std::string s(static_cast<const char*>(data), size);
    return std::sscanf(s.c_str(), "IMG %u %u", w, h) == 2;
}
HRESULT D3DXGetImageInfoFromFileInMemory(const void* data, UINT size, D3DXIMAGE_INFO* info) {
    *info = {};
    auto* b = static_cast<const uint8_t*>(data);
    if (size >= 24 && std::memcmp(b, "\x89PNG", 4) == 0) {  // a real PNG: the IHDR size
        info->Width = UINT(b[16]) << 24 | b[17] << 16 | b[18] << 8 | b[19];
        info->Height = UINT(b[20]) << 24 | b[21] << 16 | b[22] << 8 | b[23];
        return D3D_OK;
    }
    return fakeImage(data, size, &info->Width, &info->Height) ? D3D_OK : D3DERR_INVALIDCALL;
}
HRESULT D3DXCheckTextureRequirements(IDirect3DDevice8*, UINT* w, UINT* h, UINT*, DWORD, D3DFORMAT*, D3DPOOL) {
    if (*w > g_fakeMaxTexture)
        *w = g_fakeMaxTexture;
    if (*h > g_fakeMaxTexture)
        *h = g_fakeMaxTexture;
    return D3D_OK;
}
HRESULT D3DXCreateTextureFromFileInMemoryEx(IDirect3DDevice8* dev, const void* data, UINT size, UINT w, UINT h,
                                            UINT, DWORD, D3DFORMAT fmt, D3DPOOL pool, DWORD, DWORD, D3DCOLOR,
                                            D3DXIMAGE_INFO* info, PALETTEENTRY*, IDirect3DTexture8** out) {
    if (info)
        D3DXGetImageInfoFromFileInMemory(data, size, info);
    g_d3dLog += "TexFromFile ";
    return dev->CreateTexture(w, h, 1, 0, fmt, pool, out);
}
HRESULT D3DXLoadSurfaceFromFileInMemory(IDirect3DSurface8*, const PALETTEENTRY*, const RECT*, const void*, UINT,
                                        const RECT*, DWORD, D3DCOLOR, D3DXIMAGE_INFO*) {
    return D3D_OK;
}
HRESULT D3DXLoadSurfaceFromSurface(IDirect3DSurface8*, const PALETTEENTRY*, const RECT* dst, IDirect3DSurface8*,
                                   const PALETTEENTRY*, const RECT* src, DWORD, D3DCOLOR) {
    log("Blit(%u,%u,", src->left, src->top, 0);
    log("%ux%u) ", dst->right, dst->bottom);
    return D3D_OK;
}

// Drawing: every DrawPrimitiveUP's vertices are kept (as floats) in g_drawn, with the texture bound at the time.
#include <vector>
struct FakeDraw {
    IDirect3DTexture8* tex;
    std::vector<float> v;
};
std::vector<FakeDraw> g_draws;
HRESULT IDirect3DDevice8::SetTransform(D3DTRANSFORMSTATETYPE s, const D3DMATRIX* m) {
    if (s == D3DTS_WORLD)
        world = *m;
    return D3D_OK;
}
HRESULT IDirect3DDevice8::SetVertexShader(DWORD f) {
    fvf = f;
    return D3D_OK;
}
HRESULT IDirect3DDevice8::SetTexture(DWORD, IDirect3DTexture8* t) {
    texture = t;
    return D3D_OK;
}
HRESULT IDirect3DDevice8::DrawPrimitiveUP(D3DPRIMITIVETYPE type, UINT count, const void* v, UINT stride) {
    assert(type == D3DPT_TRIANGLESTRIP && count == 2);
    const float* f = static_cast<const float*>(v);
    g_draws.push_back({texture, std::vector<float>(f, f + 4 * stride / 4)});
    return D3D_OK;
}
HRESULT IDirect3DTexture8::LockRect(UINT, D3DLOCKED_RECT* lr, const RECT*, DWORD) {
    shadow.resize(level0.w * level0.h * 4);
    lr->Pitch = level0.w * 4;
    lr->pBits = shadow.data();
    return D3D_OK;
}
HRESULT IDirect3DTexture8::UnlockRect(UINT) { return D3D_OK; }
HRESULT IDirect3DDevice8::SetMaterial(const D3DMATERIAL8* m) {
    material = *m;
    return D3D_OK;
}

// Text pages (CD3DTextTexture).
HRESULT D3DXCreateTexture(IDirect3DDevice8* dev, UINT w, UINT h, UINT levels, DWORD usage, D3DFORMAT fmt,
                          D3DPOOL pool, IDirect3DTexture8** out) {
    return dev->CreateTexture(w, h, levels, usage, fmt, pool, out);
}

// The app shell (yo2App / yo2Camera / yo2Studio): render targets, scene, viewport, projection.
static IDirect3DSurface8* fakeSurface(IDirect3DSurface8*& slot) {
    if (!slot)
        slot = new IDirect3DSurface8;
    slot->AddRef();
    return slot;
}
HRESULT IDirect3DDevice8::GetRenderTarget(IDirect3DSurface8** s) {
    *s = fakeSurface(backBuffer);
    return D3D_OK;
}
HRESULT IDirect3DDevice8::GetBackBuffer(UINT, D3DBACKBUFFER_TYPE, IDirect3DSurface8** s) {
    *s = fakeSurface(backBuffer);
    return D3D_OK;
}
HRESULT IDirect3DDevice8::GetDepthStencilSurface(IDirect3DSurface8** s) {
    *s = fakeSurface(autoDepth);
    return D3D_OK;
}
HRESULT IDirect3DDevice8::SetRenderTarget(IDirect3DSurface8* t, IDirect3DSurface8* d) {
    log("Target(%u,%u)", t != nullptr, d != nullptr);
    target = t;
    depth = d;
    return D3D_OK;
}
HRESULT IDirect3DDevice8::Clear(DWORD, const D3DRECT*, DWORD flags, D3DCOLOR color, float, DWORD) {
    log("Clear(%u,%x)", flags, color);
    return D3D_OK;
}
HRESULT IDirect3DDevice8::Present(const RECT*, const RECT*, HWND, const void*) {
    log("Present");
    return D3D_OK;
}
HRESULT IDirect3DDevice8::SetViewport(const D3DVIEWPORT8* v) {
    log("Viewport(%u,%u)", v->Width, v->Height);
    vp = *v;
    return D3D_OK;
}
D3DMATRIX* D3DXMatrixOrthoLH(D3DMATRIX* out, float w, float h, float zn, float zf) {
    *out = {};
    out->m[0][0] = 2 / w;
    out->m[1][1] = 2 / h;
    out->m[2][2] = 1 / (zf - zn);
    out->m[3][2] = zn / (zn - zf);
    out->m[3][3] = 1;
    return out;
}
#endif  // _WIN32
