// D3D8-subset renderer checks: draw into the 64x64 back buffer (an FBO, never shown) and read pixels back.
// Each case is a D3D8 behaviour the game relies on (DESIGN.md §2). Run: build/platform/gfx_test
#include <SDL.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "d3d8.h"
#include "d3dx8.h"

struct V { float x, y, z; D3DCOLOR c; float u, v; };   // FVF 0x142, stride 24
static_assert(sizeof(V) == 24, "stride");

static IDirect3DDevice8* dev;
static int failures;

static void check(bool ok, const char* what) {
    printf("%s %s\n", ok ? "ok  " : "FAIL", what);
    if (!ok) failures++;
}

static uint32_t pixel(int x, int y) {   // 0xAARRGGBB of the current render target
    IDirect3DSurface8* rt;
    dev->GetRenderTarget(&rt);
    std::vector<uint8_t> bgra;
    rt->read(bgra);
    uint32_t v;
    memcpy(&v, &bgra[((size_t)y * rt->w + x) * 4], 4);
    rt->Release();
    return v;
}

static bool approx(uint32_t a, uint32_t b, int tol = 2) {
    for (int s = 0; s < 32; s += 8)
        if (abs((int)(a >> s & 255) - (int)(b >> s & 255)) > tol) return false;
    return true;
}

static void expect(int x, int y, uint32_t want, const char* what, int tol = 2) {
    uint32_t got = pixel(x, y);
    char buf[160];
    snprintf(buf, sizeof buf, "%s (%d,%d) = %08x, want %08x", what, x, y, got, want);
    check(approx(got, want, tol), buf);
}

// Screen-pixel coordinates (y down) through an orthographic projection, the way the game's 2D layer sets it up
static void pixelSpace(int w, int h) {
    D3DMATRIX proj, world;
    D3DXMatrixOrthoLH(&proj, (float)w, (float)h, 0, 1);
    D3DXMatrixIdentity(&world);
    world.m[1][1] = -1;
    world.m[3][0] = -w / 2.f;
    world.m[3][1] = h / 2.f;
    dev->SetTransform(D3DTS_PROJECTION, &proj);
    dev->SetTransform(D3DTS_WORLD, &world);
}

static void quad(float x0, float y0, float x1, float y1, D3DCOLOR c = 0xffffffff, float z = 0.5f) {
    V v[4] = {{x0, y0, z, c, 0, 0}, {x1, y0, z, c, 1, 0}, {x0, y1, z, c, 0, 1}, {x1, y1, z, c, 1, 1}};
    dev->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP, 2, v, sizeof(V));
}

static IDirect3DTexture8* texture(int w, int h, const uint32_t* argb) {
    IDirect3DTexture8* t;
    dev->CreateTexture(w, h, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &t);
    D3DLOCKED_RECT l;
    t->LockRect(0, &l, nullptr, 0);
    for (int y = 0; y < h; y++) memcpy((uint8_t*)l.pBits + y * l.Pitch, argb + y * w, w * 4);
    t->UnlockRect(0);
    return t;
}

static void white(D3DMATERIAL8* m) {   // FUN_006100d0: diffuse/ambient 1, the sprite colour as emissive
    *m = D3DMATERIAL8{{1, 1, 1, 1}, {1, 1, 1, 1}, {1, 1, 1, 1}, {1, 1, 1, 1}, 1};
}

// Mode 0 from the exe's tables (DESIGN.md §2.1) plus the game's TEXTUREFACTOR = 0
static void mode0() {
    dev->SetRenderState(D3DRS_ZFUNC, D3DCMP_LESSEQUAL);
    dev->SetRenderState(D3DRS_ZWRITEENABLE, 1);
    dev->SetRenderState(D3DRS_ALPHABLENDENABLE, 0);
    dev->SetRenderState(D3DRS_ALPHATESTENABLE, 1);
    dev->SetRenderState(D3DRS_ALPHAFUNC, D3DCMP_NOTEQUAL);
    dev->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
    dev->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
    dev->SetRenderState(D3DRS_COLORWRITEENABLE, 15);
    dev->SetRenderState(D3DRS_TEXTUREFACTOR, 0);
    dev->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
    dev->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_MULTIPLYADD);
    dev->SetTextureStageState(0, D3DTSS_COLORARG1, D3DTA_TEXTURE);
    dev->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
    dev->SetTextureStageState(0, D3DTSS_COLORARG0, D3DTA_TFACTOR);
    dev->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_MODULATE);
    dev->SetTextureStageState(0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE);
    dev->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
    dev->SetTextureStageState(0, D3DTSS_MAGFILTER, D3DTEXF_POINT);
    dev->SetTextureStageState(0, D3DTSS_MINFILTER, D3DTEXF_POINT);
    dev->SetTextureStageState(0, D3DTSS_ADDRESSU, D3DTADDRESS_CLAMP);
    dev->SetTextureStageState(0, D3DTSS_ADDRESSV, D3DTADDRESS_CLAMP);
    dev->SetVertexShader(D3DFVF_XYZ | D3DFVF_DIFFUSE | D3DFVF_TEX1);
    D3DMATERIAL8 m;
    white(&m);
    dev->SetMaterial(&m);
}

// A 3x2 32-bit BMP in memory, bottom-up rows, for the D3DX file loaders
static std::vector<uint8_t> bmp3x2(const uint32_t px[6]) {
    std::vector<uint8_t> b(54 + 24, 0);
    auto u32 = [&](int o, uint32_t v) { memcpy(&b[o], &v, 4); };
    b[0] = 'B'; b[1] = 'M';
    u32(2, (uint32_t)b.size()); u32(10, 54); u32(14, 40); u32(18, 3); u32(22, 2);
    b[26] = 1; b[28] = 32; u32(34, 24);
    for (int y = 0; y < 2; y++) memcpy(&b[54 + (1 - y) * 12], px + y * 3, 12);
    return b;
}

int main() {
    if (SDL_Init(SDL_INIT_VIDEO) != 0) { printf("FAIL SDL_Init: %s\n", SDL_GetError()); return 1; }
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_Window* win = SDL_CreateWindow("gfx_test", 0, 0, 64, 64, SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN);
    SDL_GLContext gl = win ? SDL_GL_CreateContext(win) : nullptr;
    if (!gl) { printf("FAIL GL context: %s\n", SDL_GetError()); return 1; }

    IDirect3D8* d3d = Direct3DCreate8(220);
    D3DPRESENT_PARAMETERS pp{};
    pp.BackBufferWidth = pp.BackBufferHeight = 64;
    pp.BackBufferFormat = D3DFMT_X8R8G8B8;
    pp.Windowed = 1;
    pp.EnableAutoDepthStencil = 1;
    pp.AutoDepthStencilFormat = D3DFMT_D24S8;
    check(d3d->CreateDevice(0, D3DDEVTYPE_HAL, nullptr, 0x44, &pp, &dev) == D3D_OK, "CreateDevice");
    if (!dev) return 1;

    // clear honours the viewport
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff102030, 1, 0);
    D3DVIEWPORT8 vp{8, 4, 16, 8, 0, 1};
    dev->SetViewport(&vp);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET, 0xffff0000, 1, 0);
    expect(8, 4, 0xffff0000, "clear inside viewport");
    expect(7, 4, 0xff102030, "clear outside viewport");
    expect(8, 12, 0xff102030, "clear below viewport");
    D3DVIEWPORT8 full{0, 0, 64, 64, 0, 1};
    dev->SetViewport(&full);

    // textured quad: orientation, texel exactness and D3D pixel coverage
    mode0();
    pixelSpace(64, 64);
    const uint32_t t4[4] = {0xffff0000, 0xff00ff00, 0xff0000ff, 0xffffffff};
    IDirect3DTexture8* tex = texture(2, 2, t4);
    dev->SetTexture(0, tex);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000, 1, 0);
    quad(8, 8, 24, 24);
    expect(10, 10, 0xffff0000, "texel (0,0) top-left");
    expect(20, 10, 0xff00ff00, "texel (1,0) top-right");
    expect(10, 20, 0xff0000ff, "texel (0,1) bottom-left");
    expect(8, 8, 0xffff0000, "first covered pixel is 8 (D3D pixel centres)", 0);
    expect(23, 23, 0xffffffff, "last covered pixel is 23", 0);
    expect(24, 12, 0xff000000, "pixel 24 not covered", 0);
    expect(7, 12, 0xff000000, "pixel 7 not covered", 0);

    // lighting: RGB from the material's emissive, alpha from the vertex (D3DRS_LIGHTING defaults to TRUE)
    D3DMATERIAL8 m;
    white(&m);
    m.Emissive = {1, 0, 0, 1};
    dev->SetMaterial(&m);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000, 1, 0);
    quad(8, 8, 24, 24, 0xff00ff00);   // the vertex says green; lit D3D ignores vertex RGB
    expect(20, 20, 0xffff0000, "lit: emissive red x white texel");
    dev->SetRenderState(D3DRS_LIGHTING, 0);
    quad(8, 8, 24, 24, 0xff00ff00);
    expect(20, 20, 0xff00ff00, "unlit: vertex colour x white texel");
    dev->SetRenderState(D3DRS_LIGHTING, 1);
    white(&m);
    dev->SetMaterial(&m);

    // MULTIPLYADD: texture*diffuse + TEXTUREFACTOR (the game's additive tint)
    dev->SetRenderState(D3DRS_TEXTUREFACTOR, 0x00303030);
    quad(8, 8, 24, 24);
    expect(10, 10, 0xffff3030, "MULTIPLYADD adds TFACTOR");
    dev->SetRenderState(D3DRS_TEXTUREFACTOR, 0);

    // alpha test NOTEQUAL 0 discards transparent texels even with blending off
    const uint32_t holes[4] = {0x00ffffff, 0xffffff00, 0xffffff00, 0xffffff00};
    IDirect3DTexture8* holed = texture(2, 2, holes);
    dev->SetTexture(0, holed);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000080, 1, 0);
    quad(8, 8, 24, 24);
    expect(10, 10, 0xff000080, "alpha 0 texel discarded");
    expect(20, 10, 0xffffff00, "opaque texel drawn");

    // blending: mode 4 (SRCALPHA, INVSRCALPHA) and mode 6 (additive)
    dev->SetTexture(0, tex);
    dev->SetRenderState(D3DRS_ALPHABLENDENABLE, 1);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff0000ff, 1, 0);
    quad(8, 8, 24, 24, 0x80ffffff);   // half alpha from the vertex
    expect(10, 10, 0xff80007f, "alpha blend 50% red over blue");
    dev->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_ONE);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff0000ff, 1, 0);
    quad(8, 8, 24, 24, 0x80ffffff);
    expect(10, 10, 0xff8000ff, "additive blend");
    dev->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
    dev->SetRenderState(D3DRS_ALPHABLENDENABLE, 0);

    // depth: LESSEQUAL keeps the nearer quad
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000, 1, 0);
    m.Emissive = {0, 1, 0, 1};
    dev->SetMaterial(&m);
    quad(8, 8, 24, 24, 0xffffffff, 0.2f);
    m.Emissive = {1, 1, 1, 1};
    dev->SetMaterial(&m);
    quad(8, 8, 24, 24, 0xffffffff, 0.8f);
    expect(20, 20, 0xff00ff00, "far quad hidden by depth");

    // culling: D3D default CULL_CCW drops counter-clockwise (on screen) triangles
    dev->SetRenderState(D3DRS_CULLMODE, D3DCULL_CCW);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000, 1, 0);
    V cw[3] = {{8, 8, .5f, ~0u, 0, 0}, {24, 8, .5f, ~0u, 1, 0}, {8, 24, .5f, ~0u, 0, 1}};    // clockwise on screen
    V ccw[3] = {{40, 8, .5f, ~0u, 0, 0}, {40, 24, .5f, ~0u, 0, 1}, {56, 8, .5f, ~0u, 1, 0}};
    dev->DrawPrimitiveUP(D3DPT_TRIANGLELIST, 1, cw, sizeof(V));
    dev->DrawPrimitiveUP(D3DPT_TRIANGLELIST, 1, ccw, sizeof(V));
    expect(10, 10, 0xffff0000, "clockwise triangle kept");
    expect(42, 10, 0xff000000, "counter-clockwise triangle culled");
    dev->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);

    // render to texture with the back buffer's (bigger) depth surface, then draw the result
    IDirect3DTexture8* rtTex;
    check(dev->CreateTexture(32, 32, 1, D3DUSAGE_RENDERTARGET, D3DFMT_A8R8G8B8, D3DPOOL_DEFAULT, &rtTex) == D3D_OK,
          "create render-target texture");
    IDirect3DSurface8 *rtSurf, *oldRt, *oldDs;
    rtTex->GetSurfaceLevel(0, &rtSurf);
    dev->GetRenderTarget(&oldRt);
    dev->GetDepthStencilSurface(&oldDs);
    dev->SetRenderTarget(rtSurf, oldDs);
    pixelSpace(32, 32);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff0000ff, 1, 0);
    quad(0, 0, 16, 16);   // red/green/blue/white texture in the top-left quarter
    expect(2, 2, 0xffff0000, "render target: top-left texel lands top-left");
    expect(20, 20, 0xff0000ff, "render target: clear colour");
    dev->SetRenderTarget(oldRt, oldDs);
    oldRt->Release();
    oldDs->Release();
    pixelSpace(64, 64);
    dev->SetTexture(0, rtTex);
    dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000000, 1, 0);
    quad(0, 0, 64, 64);
    expect(2, 2, 0xffff0000, "sampled render target keeps its orientation");
    expect(60, 60, 0xff0000ff, "sampled render target: bottom-right");

    // partial LockRect + UnlockRect re-uploads just that rect
    dev->SetTexture(0, tex);
    D3DLOCKED_RECT l;
    RECT r{1, 1, 2, 2};
    check(tex->LockRect(0, &l, &r, 0) == D3D_OK, "LockRect sub-rect");
    *(uint32_t*)l.pBits = 0xff808080;
    tex->UnlockRect(0);
    quad(8, 8, 24, 24);
    expect(20, 20, 0xff808080, "locked texel updated");
    expect(10, 10, 0xffff0000, "other texels unchanged");

    // D3DX: a 3x2 image becomes a 4x2 texture (POW2 caps), FILTER_NONE leaves the padding transparent,
    // the colour key turns its colour transparent
    const uint32_t img[6] = {0xffff0000, 0xff00ff00, 0xffff00ff, 0xff0000ff, 0xffffffff, 0xff000000};
    std::vector<uint8_t> file = bmp3x2(img);
    D3DXIMAGE_INFO info;
    check(D3DXGetImageInfoFromFileInMemory(file.data(), (UINT)file.size(), &info) == D3D_OK && info.Width == 3 &&
              info.Height == 2 && info.ImageFileFormat == D3DXIFF_BMP, "D3DXGetImageInfoFromFileInMemory");
    IDirect3DTexture8* fileTex = nullptr;
    HRESULT hr = D3DXCreateTextureFromFileInMemoryEx(dev, file.data(), (UINT)file.size(), D3DX_DEFAULT, D3DX_DEFAULT,
                                                     1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, D3DX_FILTER_NONE,
                                                     D3DX_FILTER_NONE, 0xffff00ff, nullptr, nullptr, &fileTex);
    D3DSURFACE_DESC desc{};
    if (fileTex) fileTex->GetLevelDesc(0, &desc);
    check(hr == D3D_OK && desc.Width == 4 && desc.Height == 2, "texture from file rounded up to 4x2");
    if (fileTex) {
        IDirect3DSurface8* s;
        fileTex->GetSurfaceLevel(0, &s);
        std::vector<uint8_t> px;
        s->read(px);
        s->Release();
        uint32_t p[8];
        memcpy(p, px.data(), 32);
        check(p[0] == 0xffff0000 && p[1] == 0xff00ff00 && p[4] == 0xff0000ff, "file pixels in place, top row first");
        check(p[2] == 0 && p[3] == 0, "colour key and padding are transparent black");
        fileTex->Release();
    }

    // D3DXLoadSurfaceFromSurface: the screenshot path (back buffer -> system-memory surface)
    IDirect3DSurface8 *bb, *shot;
    dev->GetBackBuffer(0, D3DBACKBUFFER_TYPE_MONO, &bb);
    dev->CreateImageSurface(64, 64, D3DFMT_A8R8G8B8, &shot);
    check(D3DXLoadSurfaceFromSurface(shot, nullptr, nullptr, bb, nullptr, nullptr, D3DX_FILTER_NONE, 0) == D3D_OK,
          "D3DXLoadSurfaceFromSurface");
    D3DLOCKED_RECT sl;
    shot->LockRect(&sl, nullptr, 0);
    uint32_t s0 = ((uint32_t*)sl.pBits)[2 * 64 + 2];
    shot->UnlockRect();
    check(s0 == 0xffff0000, "screenshot copy matches the back buffer");
    RECT outside{60, 60, 65, 64}, empty{4, 4, 4, 8};
    check(shot->LockRect(&sl, &outside, 0) == D3DERR_INVALIDCALL && shot->LockRect(&sl, &empty, 0) == D3DERR_INVALIDCALL,
          "image surface LockRect rejects rects outside or empty");
    shot->Release();
    bb->Release();

    // Point sampling on a texel boundary. An integer-aligned sprite puts D3D's pixel centres exactly between two texel
    // rows; the duel bust's arm cut-out ends on one (y 384), and a sample a hair low picks the cut-out row: a 1-px
    // seam across the chest (seen under Wine). The lower texel row must win on both sides of the boundary.
    uint32_t split[16];
    for (int i = 0; i < 16; i++) split[i] = i < 8 ? 0x00ffffff : 0xff00ff00;   // 4x4: rows 0-1 cut out, 2-3 green
    IDirect3DTexture8* cut = texture(4, 4, split);
    dev->SetTexture(0, cut);
    dev->SetTextureStageState(0, D3DTSS_MAGFILTER, D3DTEXF_POINT);
    dev->SetTextureStageState(0, D3DTSS_MINFILTER, D3DTEXF_POINT);
    mode0();
    dev->SetRenderState(D3DRS_LIGHTING, 0);
    for (float nudge : {1 / 128.f, -1 / 128.f}) {   // past the rasterizer's sub-pixel snap, well under 1/64 texel
        dev->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff000080, 1, 0);
        quad(40, 40 + nudge, 56, 56 + nudge);   // 4 px per texel: pixel row 48 samples texel row 2.0
        expect(44, 48, 0xff00ff00, nudge > 0 ? "point sample just short of a texel edge" : "point sample just past a texel edge");
        expect(44, 47, 0xff000080, "point sample inside the cut-out row stays cut out");
    }
    dev->SetTextureStageState(0, D3DTSS_MAGFILTER, D3DTEXF_LINEAR);
    dev->SetTextureStageState(0, D3DTSS_MINFILTER, D3DTEXF_LINEAR);
    cut->Release();

    rtSurf->Release();
    rtTex->Release();
    holed->Release();
    tex->Release();
    dev->Release();
    d3d->Release();
    SDL_GL_DeleteContext(gl);
    SDL_DestroyWindow(win);
    SDL_Quit();
    printf(failures ? "FAILED %d\n" : "PASS\n", failures);
    return failures ? 1 : 0;
}
