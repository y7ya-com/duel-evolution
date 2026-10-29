// d3d8.dll for the recompiled exe: guest COM objects (vtable of host thunks) in front of platform/gfx's D3D8-on-GL.
// Guest object = 8 bytes in guest memory: [vtable][index into objs]. Every slot of the real D3D8 vtables exists;
// the ones the game never calls trap with their name. Every method runs under one lock: the game's texture loader
// threads create and lock textures while the main thread draws (platform/gfx keeps GL on the main thread).
#include <array>
#include <map>
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <utility>
#include <vector>

#include "d3d8.h"   // platform/win32 (the platform/gfx subset)

#include "comobj.h"

namespace {

std::recursive_mutex mu;   // serializes every call: objs/lockBuf below and platform/gfx's device are shared
std::vector<void*> objs;   // index -> host object (IDirect3D8*, IDirect3DDevice8*, ...)
std::vector<uint32_t> guestOf;   // index -> guest object address
std::vector<uint32_t> lockBuf;   // index -> guest mirror of a locked texture/surface (0 = none)

template <class T> T* host(uint32_t g) {
    uint32_t i = RD32m(g + 4);
    return i < objs.size() ? static_cast<T*>(objs[i]) : nullptr;
}

uint32_t wrap(void* h, uint32_t vtbl) {
    if (!h) return 0;
    for (size_t i = 0; i < objs.size(); i++)   // the same object and the same type: a host address can come back
        if (objs[i] == h) {                      // as another type (see forget)
            if (RD32m(guestOf[i]) == vtbl) return guestOf[i];
            static int told;
            if (!told++) rc_log("d3d8: wrap: %p still has a shell %08x of another type (vtable %08x, wanted %08x)", h,
                                guestOf[i], RD32m(guestOf[i]), vtbl);
        }
    uint32_t g = rc_palloc(8);
    WR32m(g, vtbl);
    WR32m(g + 4, (uint32_t)objs.size());
    objs.push_back(h);
    guestOf.push_back(g);
    lockBuf.push_back(0);
    return g;
}

uint32_t idx(uint32_t g) { return RD32m(g + 4); }


uint32_t vt_d3d, vt_dev, vt_tex, vt_surf;

// --- locking: the guest gets a mirror in guest memory, copied back on unlock
// Mirrors of released objects go to this pool, not back to the guest heap: the next lock of the same size takes one.
// Memory stays bounded by the most mirrors alive at once, and the heap's reuse pattern for the game's own objects is
// unchanged (freeing them to the heap made a latent use-after-free in the game trap now and then on web).
std::multimap<uint32_t, uint32_t> sparMirrors;   // size -> mirror
uint32_t mirror_get(size_t n) {
    auto it = sparMirrors.lower_bound((uint32_t)n);
    if (it == sparMirrors.end() || it->first > n * 2) return rc_palloc((uint32_t)n);   // none near that size
    uint32_t m = it->second;
    sparMirrors.erase(it);
    return m;
}
void mirror_put(uint32_t m) { if (m) sparMirrors.emplace(rc_hsize(m), m); }

uint32_t lock_mirror(uint32_t g, const D3DLOCKED_RECT& lr, size_t n, uint32_t out) {
    uint32_t i = idx(g);
    if (!lockBuf[i] || rc_hsize(lockBuf[i]) < n) {
        mirror_put(lockBuf[i]);
        lockBuf[i] = mirror_get(n);
    }
    memcpy(G(lockBuf[i]), lr.pBits, n);
    WR32m(out, (uint32_t)lr.Pitch);
    WR32m(out + 4, lockBuf[i]);
    return lockBuf[i];
}

struct Locked { void* bits; size_t n; bool peek; };
std::vector<Locked> locks;   // by index: where to copy the mirror back
void remember(uint32_t g, const D3DLOCKED_RECT& lr, size_t n, bool peek = false) {
    uint32_t i = idx(g);
    if (locks.size() <= i) locks.resize(i + 1);
    locks[i] = {lr.pBits, n, peek};
}
void copy_back(uint32_t g) {
    uint32_t i = idx(g);
    if (i < locks.size() && locks[i].bits && lockBuf[i]) memcpy(locks[i].bits, G(lockBuf[i]), locks[i].n);
}
// D3DLOCK_READONLY on a texture: read the shadow in place. No platform lock, so nothing is copied back on unlock and the
// texture is not marked dirty (the platform re-uploads every unlocked rect to GL). CD3DSprite's per-frame mouse hit test
// locks this way. Same checks as IDirect3DTexture8::LockRect; a texture locked for writing is refused as there.
HRESULT peek_rect(IDirect3DTexture8* t, UINT level, D3DLOCKED_RECT* l, const RECT* r) {
    RECT k = r ? *r : RECT{0, 0, (int32_t)t->level0.w, (int32_t)t->level0.h};
    if (level || t->shadow.empty() || t->isLocked || k.left < 0 || k.top < 0 || k.right > (int32_t)t->level0.w ||
        k.bottom > (int32_t)t->level0.h || k.left >= k.right || k.top >= k.bottom)
        return D3DERR_INVALIDCALL;
    l->Pitch = (int32_t)t->level0.w * 4;
    l->pBits = t->shadow.data() + ((size_t)k.top * t->level0.w + k.left) * 4;
    return D3D_OK;
}
// bytes from pBits to the end of the locked rect's last row (pBits is already left*4 into its first row, so a
// whole-pitch-per-row copy would run left*4 bytes past the pixels when the rect reaches the bottom)
size_t rect_bytes(uint32_t rp, int32_t pitch, UINT h) {
    if (!rp) return (size_t)pitch * h;
    int32_t l = (int32_t)RD32m(rp), t = (int32_t)RD32m(rp + 4), r = (int32_t)RD32m(rp + 8), b = (int32_t)RD32m(rp + 12);
    return (size_t)pitch * (b - t - 1) + (size_t)(r - l) * 4;
}

}  // namespace

#define M(iface, name)                                    \
    static void iface##_##name##_locked(CPU* c);          \
    extern "C" void iface##_##name(CPU* c) {              \
        std::lock_guard<std::recursive_mutex> lock(mu);   \
        iface##_##name##_locked(c);                       \
    }                                                     \
    static void iface##_##name##_locked(CPU* c)
#define THIS(T) host<T>(ARG(0))

// ---------------------------------------------------------------- IUnknown (shared)
M(any, QueryInterface) { RET(3, 0x80004002u); }   // E_NOINTERFACE
M(any, AddRef) { RET(1, host<ComObject>(ARG(0))->AddRef()); }
// A dead host object's shells: none may answer wrap() again. wrap() matches by host address, and the next object the
// host allocates there would otherwise get the dead one's shell, of the wrong type: a texture's level-0 surface lives
// inside the texture, so after the texture died a new texture at that address came back as the old SURFACE shell and
// the game called texture LockRect (slot 0x40) through vt_surf (the web build's "indirect call to unknown" trap).
void forget(const void* h) {
    for (size_t j = 0; j < objs.size(); j++)
        if (objs[j] == h) {
            objs[j] = nullptr;   // ponytail: the 8-byte guest shell and its index are not reused
            // its lock mirror too: kept for the next lock while the object lives, it leaked 256 KB of guest heap per
            // card texture, which exhausts the wasm build's 1 GB guest within a session (black screen after a duel)
            mirror_put(lockBuf[j]);   // to the mirror pool (see lock_mirror)
            lockBuf[j] = 0;
            if (j < locks.size()) locks[j] = {};
        }
}

M(any, Release) {
    uint32_t g = ARG(0), vt = RD32m(g);
    const void *self = objs[idx(g)], *also = nullptr;   // the other shell's object that dies with this one
    if (vt == vt_tex) also = &THIS(IDirect3DTexture8)->level0;
    else if (vt == vt_surf) also = THIS(IDirect3DSurface8)->owner;   // a texture level: the texture dies with it
    uint32_t r = host<ComObject>(g)->Release();
    if (!r) {
        forget(self);
        if (also) forget(also);
    }
    RET(1, r);
}

// ---------------------------------------------------------------- IDirect3D8
M(d3d, GetAdapterCount) { RET(1, 1); }
M(d3d, GetAdapterIdentifier) {
    uint32_t p = ARG(3);
    memset(G(p), 0, 1100);   // D3DADAPTER_IDENTIFIER8
    strcpy(GS(p), "yo2rc");
    strcpy(GS(p + 512), "OpenGL (yo2 recomp)");
    RET(4, 0);
}
M(d3d, GetAdapterModeCount) { RET(2, THIS(IDirect3D8)->GetAdapterModeCount(ARG(1))); }
M(d3d, EnumAdapterModes) { RET(4, THIS(IDirect3D8)->EnumAdapterModes(ARG(1), ARG(2), (D3DDISPLAYMODE*)G(ARG(3)))); }
M(d3d, GetAdapterDisplayMode) { RET(3, THIS(IDirect3D8)->GetAdapterDisplayMode(ARG(1), (D3DDISPLAYMODE*)G(ARG(2)))); }
M(d3d, CheckDeviceType) { RET(6, 0); }
M(d3d, CheckDeviceFormat) {
    RET(7, THIS(IDirect3D8)->CheckDeviceFormat(ARG(1), (D3DDEVTYPE)ARG(2), (D3DFORMAT)ARG(3), ARG(4),
                                               (D3DRESOURCETYPE)ARG(5), (D3DFORMAT)ARG(6)));
}
M(d3d, CheckDeviceMultiSampleType) { RET(5, ARG(4) == 0 ? 0 : D3DERR_NOTAVAILABLE); }
M(d3d, CheckDepthStencilMatch) { RET(6, 0); }
M(d3d, GetDeviceCaps) {   // D3DCAPS8 has the real layout (static_assert in d3d8.h)
    RET(4, THIS(IDirect3D8)->GetDeviceCaps(ARG(1), (D3DDEVTYPE)ARG(2), (D3DCAPS8*)G(ARG(3))));
}
M(d3d, GetAdapterMonitor) { RET(2, 1); }
static D3DPRESENT_PARAMETERS pp_in(uint32_t p) {   // guest layout: 13 dwords (HWND is 4 bytes there)
    D3DPRESENT_PARAMETERS pp{};
    pp.BackBufferWidth = RD32m(p); pp.BackBufferHeight = RD32m(p + 4);
    pp.BackBufferFormat = (D3DFORMAT)RD32m(p + 8); pp.BackBufferCount = RD32m(p + 12);
    pp.MultiSampleType = RD32m(p + 16); pp.SwapEffect = RD32m(p + 20);
    pp.Windowed = RD32m(p + 28); pp.EnableAutoDepthStencil = RD32m(p + 32);
    pp.AutoDepthStencilFormat = (D3DFORMAT)RD32m(p + 36); pp.Flags = RD32m(p + 40);
    pp.FullScreen_RefreshRateInHz = RD32m(p + 44); pp.FullScreen_PresentationInterval = RD32m(p + 48);
    extern int rc_game_w, rc_game_h;
    if (!pp.BackBufferWidth) pp.BackBufferWidth = rc_game_w;   // windowed with 0: the client size
    if (!pp.BackBufferHeight) pp.BackBufferHeight = rc_game_h;
    return pp;
}
static uint32_t g_gdev;   // the guest IDirect3DDevice8 (one per process), for IDirect3DResource8::GetDevice
M(d3d, CreateDevice) {
    D3DPRESENT_PARAMETERS pp = pp_in(ARG(5));
    IDirect3DDevice8* dev = nullptr;
    HRESULT hr = THIS(IDirect3D8)->CreateDevice(ARG(1), (D3DDEVTYPE)ARG(2), nullptr, ARG(4), &pp, &dev);
    WR32m(ARG(6), hr ? 0 : (g_gdev = wrap(dev, vt_dev)));
    rc_log("d3d8: CreateDevice %ux%u windowed=%u flags=%x -> %x (shell %08x, vtable %08x), render scale %u", pp.BackBufferWidth,
           pp.BackBufferHeight, pp.Windowed, ARG(4), (unsigned)hr, g_gdev, vt_dev, dev ? dev->scale : 0);
    RET(7, hr);
}

// ovr/decode.c: the render scale (2x card art only pays off above 1) and a texture's high-resolution pixels
extern "C" int rc_render_scale(void) {
    std::lock_guard<std::recursive_mutex> lock(mu);
    IDirect3DDevice8* d = g_gdev ? host<IDirect3DDevice8>(g_gdev) : nullptr;
    return d ? (int)d->scale : 1;
}
extern "C" void rc_texture_hq(uint32_t gtex, const uint8_t* bgra, size_t n, int scale) {
    std::lock_guard<std::recursive_mutex> lock(mu);
    IDirect3DTexture8* t = host<IDirect3DTexture8>(gtex);
    if (!t || n != (size_t)t->level0.w * scale * t->level0.h * scale * 4) return;
    t->hq.assign(bgra, bgra + n);
    t->hqScale = (UINT)scale;
}

// ---------------------------------------------------------------- IDirect3DDevice8
#define DEV THIS(IDirect3DDevice8)
M(dev, TestCooperativeLevel) { RET(1, 0); }
M(dev, GetAvailableTextureMem) { RET(1, 256u << 20); }
M(dev, ResourceManagerDiscardBytes) { RET(2, 0); }
static uint32_t g_d3d;   // the guest IDirect3D8 (one per process)
M(dev, GetDirect3D) { static_cast<ComObject*>(objs[idx(g_d3d)])->AddRef(); WR32m(ARG(1), g_d3d); RET(2, 0); }
M(dev, GetCreationParameters) {   // D3DDEVICE_CREATION_PARAMETERS
    WR32m(ARG(1), 0); WR32m(ARG(1) + 4, D3DDEVTYPE_HAL); WR32m(ARG(1) + 8, 0x10010); WR32m(ARG(1) + 12, 0x44);
    RET(2, 0);
}
M(dev, GetDeviceCaps) { RET(2, DEV->GetDeviceCaps((D3DCAPS8*)G(ARG(1)))); }
M(dev, GetDisplayMode) {
    WR32m(ARG(1), DEV->pp.BackBufferWidth); WR32m(ARG(1) + 4, DEV->pp.BackBufferHeight);
    WR32m(ARG(1) + 8, 60); WR32m(ARG(1) + 12, D3DFMT_X8R8G8B8);
    RET(2, 0);
}
M(dev, Reset) { D3DPRESENT_PARAMETERS pp = pp_in(ARG(1)); RET(2, DEV->Reset(&pp)); }
static IDirect3DDevice8* g_dev;
extern "C" void rc_present_hook(void);
extern "C" void rc_ovr_frame(CPU* c);
extern "C" void rc_scene_present(void);   // ovr/scene.c
extern "C" void rc_web_frame(void);
extern "C" int rc_backbuffer_luma(void) {   // mean of the back buffer's B,G,R bytes, -1 when unreadable (RC_SCENE_LOG)
    std::vector<uint8_t> px;
    if (!g_dev || !g_dev->backBuffer || !g_dev->backBuffer->read(px) || px.empty()) return -1;
    uint64_t sum = 0;
    for (size_t i = 0; i < px.size(); i += 4) sum += px[i] + px[i + 1] + px[i + 2];
    return (int)(sum / (px.size() / 4 * 3));
}
// back buffer -> shot_<frame>.bmp (32-bit BGRA, top-down); RC_SHOT_NATIVE=1: at the render scale's resolution
extern "C" void rc_screenshot(int frame) {
    std::vector<uint8_t> px;
    static const bool native = getenv("RC_SHOT_NATIVE") != nullptr;
    if (!g_dev || !g_dev->backBuffer || !g_dev->backBuffer->read(px, native)) { rc_log("screenshot %d: no back buffer", frame); return; }
    UINT s = native ? g_dev->backBuffer->scale : 1;
    int32_t w = (int32_t)(g_dev->backBuffer->w * s), h = (int32_t)(g_dev->backBuffer->h * s);
    char name[64];
    snprintf(name, sizeof name, "shot_%d.bmp", frame);
    FILE* f = fopen(name, "wb");
    uint32_t sz = (uint32_t)(w * h * 4);
    uint8_t hd[54] = {'B', 'M'};
    uint32_t v[] = {54 + sz, 0, 54, 40, (uint32_t)w, (uint32_t)-h};
    memcpy(hd + 2, v, 24);
    uint16_t pl[] = {1, 32};
    memcpy(hd + 26, pl, 4);
    memcpy(hd + 34, &sz, 4);
    fwrite(hd, 1, 54, f);
    fwrite(px.data(), 1, sz, f);
    fclose(f);
    rc_log("screenshot: %s (%dx%d)", name, w, h);
}
// not M(): the browser yield must happen outside the lock, or loader threads wait out the whole frame
extern "C" void dev_Present(CPU* c) {
    HRESULT hr;
    {
        std::lock_guard<std::recursive_mutex> lock(mu);
        g_dev = DEV;
        hr = rc_render_frame ? DEV->Present(ARG(1) ? (const RECT*)G(ARG(1)) : nullptr,
                                            ARG(2) ? (const RECT*)G(ARG(2)) : nullptr, nullptr, nullptr) : 0;
        rc_present_hook();
        rc_scene_present();
    }
    rc_ovr_frame(c);   // outside the lock too: it may run game code (ovr/sedefer.c)
#ifdef __EMSCRIPTEN__
    rc_web_frame();   // the browser composites the frame and delivers input
#endif
    RET(5, hr);
}
M(dev, GetBackBuffer) {
    IDirect3DSurface8* s = nullptr;
    HRESULT hr = DEV->GetBackBuffer(ARG(1), (D3DBACKBUFFER_TYPE)ARG(2), &s);
    WR32m(ARG(3), wrap(s, vt_surf));
    RET(4, hr);
}
M(dev, GetRasterStatus) { WR32m(ARG(1), 0); WR32m(ARG(1) + 4, 0); RET(2, 0); }
M(dev, SetGammaRamp) { RET(3, 0); }
M(dev, GetGammaRamp) {
    for (int i = 0; i < 256; i++)
        for (int k = 0; k < 3; k++) rc_wr16(rc_mem + ARG(1) + 512 * k + 2 * i, (uint16_t)(i * 257));
    RET(2, 0);
}
M(dev, CreateTexture) {
    IDirect3DTexture8* t = nullptr;
    HRESULT hr = DEV->CreateTexture(ARG(1), ARG(2), ARG(3), ARG(4), (D3DFORMAT)ARG(5), (D3DPOOL)ARG(6), &t);
    WR32m(ARG(7), hr ? 0 : wrap(t, vt_tex));
    RET(8, hr);
}
M(dev, CreateImageSurface) {
    IDirect3DSurface8* s = nullptr;
    HRESULT hr = DEV->CreateImageSurface(ARG(1), ARG(2), (D3DFORMAT)ARG(3), &s);
    WR32m(ARG(4), hr ? 0 : wrap(s, vt_surf));
    RET(5, hr);
}
M(dev, CopyRects) {   // guest RECT and POINT are host RECT and POINT (32-bit LONGs)
    RET(6, DEV->CopyRects(host<IDirect3DSurface8>(ARG(1)), ARG(2) ? (const RECT*)G(ARG(2)) : nullptr, ARG(3),
                          host<IDirect3DSurface8>(ARG(4)), ARG(5) ? (const POINT*)G(ARG(5)) : nullptr));
}
M(dev, SetRenderTarget) {
    RET(3, DEV->SetRenderTarget(ARG(1) ? host<IDirect3DSurface8>(ARG(1)) : nullptr,
                                ARG(2) ? host<IDirect3DSurface8>(ARG(2)) : nullptr));
}
M(dev, GetRenderTarget) {
    IDirect3DSurface8* s = nullptr;
    HRESULT hr = DEV->GetRenderTarget(&s);
    WR32m(ARG(1), wrap(s, vt_surf));
    RET(2, hr);
}
M(dev, GetDepthStencilSurface) {
    IDirect3DSurface8* s = nullptr;
    HRESULT hr = DEV->GetDepthStencilSurface(&s);
    WR32m(ARG(1), wrap(s, vt_surf));
    RET(2, hr);
}
M(dev, BeginScene) { RET(1, 0); }
M(dev, EndScene) { RET(1, 0); }
M(dev, Clear) {
    if (!rc_render_frame) RET(7, 0);   // fast-forward: an undrawn frame
    float z;
    uint32_t zb = ARG(5);
    memcpy(&z, &zb, 4);
    RET(7, DEV->Clear(ARG(1), ARG(2) ? (const D3DRECT*)G(ARG(2)) : nullptr, ARG(3), ARG(4), z, ARG(6)));
}
M(dev, SetTransform) { RET(3, DEV->SetTransform((D3DTRANSFORMSTATETYPE)ARG(1), (const D3DMATRIX*)G(ARG(2)))); }
M(dev, GetTransform) { RET(3, DEV->GetTransform((D3DTRANSFORMSTATETYPE)ARG(1), (D3DMATRIX*)G(ARG(2)))); }
M(dev, SetViewport) { RET(2, DEV->SetViewport((const D3DVIEWPORT8*)G(ARG(1)))); }
M(dev, GetViewport) { RET(2, DEV->GetViewport((D3DVIEWPORT8*)G(ARG(1)))); }
M(dev, SetMaterial) { RET(2, DEV->SetMaterial((const D3DMATERIAL8*)G(ARG(1)))); }
M(dev, GetMaterial) { RET(2, DEV->GetMaterial((D3DMATERIAL8*)G(ARG(1)))); }
M(dev, SetLight) { RET(3, 0); }        // lighting is never enabled (DESIGN.md §2)
M(dev, LightEnable) { RET(3, 0); }
M(dev, SetRenderState) { RET(3, DEV->SetRenderState((D3DRENDERSTATETYPE)ARG(1), ARG(2))); }
M(dev, GetRenderState) {
    DWORD v = 0;
    HRESULT hr = DEV->GetRenderState((D3DRENDERSTATETYPE)ARG(1), &v);
    WR32m(ARG(2), v);
    RET(3, hr);
}
M(dev, GetTexture) { WR32m(ARG(2), DEV->texture ? wrap(DEV->texture, vt_tex) : 0); if (DEV->texture) DEV->texture->AddRef(); RET(3, 0); }
M(dev, SetTexture) { RET(3, DEV->SetTexture(ARG(1), ARG(2) ? host<IDirect3DTexture8>(ARG(2)) : nullptr)); }
M(dev, GetTextureStageState) {
    DWORD v = 0;
    HRESULT hr = DEV->GetTextureStageState(ARG(1), (D3DTEXTURESTAGESTATETYPE)ARG(2), &v);
    WR32m(ARG(3), v);
    RET(4, hr);
}
M(dev, SetTextureStageState) { RET(4, DEV->SetTextureStageState(ARG(1), (D3DTEXTURESTAGESTATETYPE)ARG(2), ARG(3))); }
M(dev, ValidateDevice) { WR32m(ARG(1), 1); RET(2, 0); }
M(dev, DrawPrimitiveUP) { if (!rc_render_frame) RET(5, 0); RET(5, DEV->DrawPrimitiveUP((D3DPRIMITIVETYPE)ARG(1), ARG(2), G(ARG(3)), ARG(4))); }
M(dev, SetVertexShader) { RET(2, DEV->SetVertexShader(ARG(1))); }
M(dev, GetVertexShader) {
    DWORD v = 0;
    HRESULT hr = DEV->GetVertexShader(&v);
    WR32m(ARG(1), v);
    RET(2, hr);
}
M(dev, SetStreamSource) { RET(4, 0); }
M(dev, SetIndices) { RET(3, 0); }
M(dev, SetPixelShader) { RET(2, 0); }
M(dev, SetCursorPosition) { RET(4, 0); }
M(dev, ShowCursor) { RET(2, 0); }

// ---------------------------------------------------------------- IDirect3DTexture8 / IDirect3DSurface8
M(res, GetDevice) { static_cast<ComObject*>(objs[idx(g_gdev)])->AddRef(); WR32m(ARG(1), g_gdev); RET(2, 0); }
M(res, SetPriority) { RET(2, 0); }
M(res, GetPriority) { RET(1, 0); }
M(res, PreLoad) { RET(1, 0); }
M(res, GetType) { RET(1, 3); }   // D3DRTYPE_TEXTURE
M(tex, SetLOD) { RET(2, 0); }
M(tex, GetLOD) { RET(1, 0); }
M(tex, GetLevelCount) { RET(1, THIS(IDirect3DTexture8)->GetLevelCount()); }
M(tex, GetLevelDesc) { RET(3, THIS(IDirect3DTexture8)->GetLevelDesc(ARG(1), (D3DSURFACE_DESC*)G(ARG(2)))); }
M(tex, GetSurfaceLevel) {
    IDirect3DSurface8* s = nullptr;
    HRESULT hr = THIS(IDirect3DTexture8)->GetSurfaceLevel(ARG(1), &s);
    WR32m(ARG(2), wrap(s, vt_surf));
    RET(3, hr);
}
M(tex, LockRect) {
    IDirect3DTexture8* t = THIS(IDirect3DTexture8);
    D3DLOCKED_RECT lr{};
    const RECT* r = ARG(3) ? (const RECT*)G(ARG(3)) : nullptr;
    bool peek = (ARG(4) & 0x10) && !rc_nospeed;   // D3DLOCK_READONLY
    HRESULT hr = peek ? peek_rect(t, ARG(1), &lr, r) : t->LockRect(ARG(1), &lr, r, ARG(4));
    if (!hr) {
        size_t n = rect_bytes(ARG(3), lr.Pitch, t->level0.h);
        remember(ARG(0), lr, n, peek);
        lock_mirror(ARG(0), lr, n, ARG(2));
    }
    RET(5, hr);
}
M(tex, UnlockRect) {
    uint32_t i = idx(ARG(0));
    if (i < locks.size() && locks[i].peek) {   // a READONLY lock took no platform lock
        locks[i].peek = false;
        RET(2, ARG(1) ? D3DERR_INVALIDCALL : D3D_OK);
    }
    copy_back(ARG(0));
    RET(2, THIS(IDirect3DTexture8)->UnlockRect(ARG(1)));
}
M(tex, AddDirtyRect) { RET(2, 0); }
// the exe's static D3DX asks after loading into a surface. ponytail: riid ignored (the Boxedwine fast path did the
// same through the lobby, deck editor and duel): a texture level's texture, else the device
M(surf, GetContainer) {
    IDirect3DSurface8* s = THIS(IDirect3DSurface8);
    uint32_t g = s->owner ? wrap(s->owner, vt_tex) : g_gdev;
    static_cast<ComObject*>(objs[idx(g)])->AddRef();
    WR32m(ARG(2), g);
    RET(3, 0);
}
M(surf, GetDesc) { RET(2, THIS(IDirect3DSurface8)->GetDesc((D3DSURFACE_DESC*)G(ARG(1)))); }
M(surf, LockRect) {
    IDirect3DSurface8* s = THIS(IDirect3DSurface8);
    D3DLOCKED_RECT lr{};
    HRESULT hr = s->LockRect(&lr, ARG(2) ? (const RECT*)G(ARG(2)) : nullptr, ARG(3));
    if (!hr) {
        size_t n = rect_bytes(ARG(2), lr.Pitch, s->h);
        remember(ARG(0), lr, n);
        lock_mirror(ARG(0), lr, n, ARG(1));
    }
    RET(4, hr);
}
M(surf, UnlockRect) { copy_back(ARG(0)); RET(1, THIS(IDirect3DSurface8)->UnlockRect()); }

// A texture method called on a surface: the game's texture manager sometimes hands a surface (from a holder freed and
// reused, a race seen on the web build only) to code that locks a texture. The surface vtable carries
// IDirect3DTexture8's slots 11..18 as stubs that refuse (the callers test the HRESULT, e.g. 0x58e970 skips its clear),
// where the call used to read past the 11-slot vtable into the next block: "indirect call to unknown". ponytail: a
// stopgap until the race is found; logged once with the guest stack.
extern "C" void backtrace_guest(CPU* c);
#define NOT_TEX(name, n, v)                                                                  \
    M(surf, Tex##name) {                                                                     \
        static int once;                                                                     \
        if (!once++) {                                                                       \
            rc_log("d3d8: IDirect3DTexture8::" #name " on surface %08x, refused", ARG(0));   \
            backtrace_guest(c);                                                              \
        }                                                                                    \
        RET(n, v);                                                                           \
    }
NOT_TEX(SetLOD, 2, 0)
NOT_TEX(GetLOD, 1, 0)
NOT_TEX(GetLevelCount, 1, 0)
NOT_TEX(GetLevelDesc, 3, D3DERR_INVALIDCALL)
NOT_TEX(GetSurfaceLevel, 3, D3DERR_INVALIDCALL)
NOT_TEX(LockRect, 5, D3DERR_INVALIDCALL)
NOT_TEX(UnlockRect, 2, D3DERR_INVALIDCALL)
NOT_TEX(AddDirtyRect, 2, D3DERR_INVALIDCALL)

static uint32_t build(std::initializer_list<RcSlot> l) { return rc_vtable(l); }
static void init_vtables() {
    vt_d3d = build({S(any_QueryInterface), S(any_AddRef), S(any_Release), N("IDirect3D8::RegisterSoftwareDevice"),
                    S(d3d_GetAdapterCount), S(d3d_GetAdapterIdentifier), S(d3d_GetAdapterModeCount),
                    S(d3d_EnumAdapterModes), S(d3d_GetAdapterDisplayMode), S(d3d_CheckDeviceType),
                    S(d3d_CheckDeviceFormat), S(d3d_CheckDeviceMultiSampleType), S(d3d_CheckDepthStencilMatch),
                    S(d3d_GetDeviceCaps), S(d3d_GetAdapterMonitor), S(d3d_CreateDevice)});
    vt_dev = build({S(any_QueryInterface), S(any_AddRef), S(any_Release), S(dev_TestCooperativeLevel),
                    S(dev_GetAvailableTextureMem), S(dev_ResourceManagerDiscardBytes), S(dev_GetDirect3D),
                    S(dev_GetDeviceCaps), S(dev_GetDisplayMode), S(dev_GetCreationParameters),
                    N("IDirect3DDevice8::SetCursorProperties"), S(dev_SetCursorPosition), S(dev_ShowCursor),
                    N("IDirect3DDevice8::CreateAdditionalSwapChain"), S(dev_Reset), S(dev_Present),
                    S(dev_GetBackBuffer), S(dev_GetRasterStatus), S(dev_SetGammaRamp), S(dev_GetGammaRamp),
                    S(dev_CreateTexture), N("IDirect3DDevice8::CreateVolumeTexture"),
                    N("IDirect3DDevice8::CreateCubeTexture"), N("IDirect3DDevice8::CreateVertexBuffer"),
                    N("IDirect3DDevice8::CreateIndexBuffer"), N("IDirect3DDevice8::CreateRenderTarget"),
                    N("IDirect3DDevice8::CreateDepthStencilSurface"), S(dev_CreateImageSurface),
                    S(dev_CopyRects), N("IDirect3DDevice8::UpdateTexture"),
                    N("IDirect3DDevice8::GetFrontBuffer"), S(dev_SetRenderTarget), S(dev_GetRenderTarget),
                    S(dev_GetDepthStencilSurface), S(dev_BeginScene), S(dev_EndScene), S(dev_Clear),
                    S(dev_SetTransform), S(dev_GetTransform), N("IDirect3DDevice8::MultiplyTransform"),
                    S(dev_SetViewport), S(dev_GetViewport), S(dev_SetMaterial), S(dev_GetMaterial), S(dev_SetLight),
                    N("IDirect3DDevice8::GetLight"), S(dev_LightEnable), N("IDirect3DDevice8::GetLightEnable"),
                    N("IDirect3DDevice8::SetClipPlane"), N("IDirect3DDevice8::GetClipPlane"),
                    S(dev_SetRenderState), S(dev_GetRenderState), N("IDirect3DDevice8::BeginStateBlock"),
                    N("IDirect3DDevice8::EndStateBlock"), N("IDirect3DDevice8::ApplyStateBlock"),
                    N("IDirect3DDevice8::CaptureStateBlock"), N("IDirect3DDevice8::DeleteStateBlock"),
                    N("IDirect3DDevice8::CreateStateBlock"), N("IDirect3DDevice8::SetClipStatus"),
                    N("IDirect3DDevice8::GetClipStatus"), S(dev_GetTexture), S(dev_SetTexture),
                    S(dev_GetTextureStageState), S(dev_SetTextureStageState), S(dev_ValidateDevice),
                    N("IDirect3DDevice8::GetInfo"), N("IDirect3DDevice8::SetPaletteEntries"),
                    N("IDirect3DDevice8::GetPaletteEntries"), N("IDirect3DDevice8::SetCurrentTexturePalette"),
                    N("IDirect3DDevice8::GetCurrentTexturePalette"), N("IDirect3DDevice8::DrawPrimitive"),
                    N("IDirect3DDevice8::DrawIndexedPrimitive"), S(dev_DrawPrimitiveUP),
                    N("IDirect3DDevice8::DrawIndexedPrimitiveUP"), N("IDirect3DDevice8::ProcessVertices"),
                    N("IDirect3DDevice8::CreateVertexShader"), S(dev_SetVertexShader), S(dev_GetVertexShader),
                    N("IDirect3DDevice8::DeleteVertexShader"), N("IDirect3DDevice8::SetVertexShaderConstant"),
                    N("IDirect3DDevice8::GetVertexShaderConstant"), N("IDirect3DDevice8::GetVertexShaderDeclaration"),
                    N("IDirect3DDevice8::GetVertexShaderFunction"), S(dev_SetStreamSource),
                    N("IDirect3DDevice8::GetStreamSource"), S(dev_SetIndices), N("IDirect3DDevice8::GetIndices"),
                    N("IDirect3DDevice8::CreatePixelShader"), S(dev_SetPixelShader),
                    N("IDirect3DDevice8::GetPixelShader"), N("IDirect3DDevice8::DeletePixelShader"),
                    N("IDirect3DDevice8::SetPixelShaderConstant"), N("IDirect3DDevice8::GetPixelShaderConstant"),
                    N("IDirect3DDevice8::GetPixelShaderFunction"), N("IDirect3DDevice8::DrawRectPatch"),
                    N("IDirect3DDevice8::DrawTriPatch"), N("IDirect3DDevice8::DeletePatch")});
    vt_tex = build({S(any_QueryInterface), S(any_AddRef), S(any_Release), S(res_GetDevice),
                    N("IDirect3DTexture8::SetPrivateData"), N("IDirect3DTexture8::GetPrivateData"),
                    N("IDirect3DTexture8::FreePrivateData"), S(res_SetPriority), S(res_GetPriority), S(res_PreLoad),
                    S(res_GetType), S(tex_SetLOD), S(tex_GetLOD), S(tex_GetLevelCount), S(tex_GetLevelDesc),
                    S(tex_GetSurfaceLevel), S(tex_LockRect), S(tex_UnlockRect), S(tex_AddDirtyRect)});
    vt_surf = build({S(any_QueryInterface), S(any_AddRef), S(any_Release), S(res_GetDevice),
                     N("IDirect3DSurface8::SetPrivateData"), N("IDirect3DSurface8::GetPrivateData"),
                     N("IDirect3DSurface8::FreePrivateData"), S(surf_GetContainer), S(surf_GetDesc),
                     S(surf_LockRect), S(surf_UnlockRect), S(surf_TexSetLOD), S(surf_TexGetLOD),
                     S(surf_TexGetLevelCount), S(surf_TexGetLevelDesc), S(surf_TexGetSurfaceLevel), S(surf_TexLockRect),
                     S(surf_TexUnlockRect), S(surf_TexAddDirtyRect)});
}

extern "C" void imp_D3D8_Direct3DCreate8(CPU* c) {
    std::lock_guard<std::recursive_mutex> lock(mu);
    if (!vt_d3d) init_vtables();
    g_d3d = wrap(Direct3DCreate8(ARG(0)), vt_d3d);
    RET(1, g_d3d);
}
