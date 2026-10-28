// The Direct3D 8 subset yo2.exe uses (platform/DESIGN.md §2), on OpenGL 3.3 core / GLES 3.0 / WebGL2.
// Same type, constant and method names as d3d8.h, so the game's CD3DDevice code ports call for call
// (`dev->SetRenderState(D3DRS_ZFUNC, D3DCMP_LESSEQUAL)`). Plain classes, not COM: no vtable compatibility is needed
// outside the original exe. Methods the game never calls are left out on purpose.
// Threads: callers serialize calls (recomp/rt/d3d8.cpp holds one lock per call). Only the thread that created the
// device (the one with the GL context) touches GL: texture loader threads may create, lock and fill textures, which
// are uploaded on that thread when first drawn.
#pragma once
#include <cstdint>
#include <vector>

#include "../com.h"

#ifdef _WIN32
#include <windows.h>
#else
#include "windows.h"   // the stand-in next to this file
#endif

typedef uint32_t D3DCOLOR;   // 0xAARRGGBB; in memory B,G,R,A
#define D3DCOLOR_ARGB(a, r, g, b) ((D3DCOLOR)((((a) & 0xff) << 24) | (((r) & 0xff) << 16) | (((g) & 0xff) << 8) | ((b) & 0xff)))

enum : HRESULT {
    D3D_OK = 0,
    D3DERR_NOTAVAILABLE = (HRESULT)0x8876086A,
    D3DERR_INVALIDCALL = (HRESULT)0x8876086C,
    D3DERR_OUTOFVIDEOMEMORY = (HRESULT)0x8876017C,
};

enum D3DFORMAT : uint32_t { D3DFMT_UNKNOWN = 0, D3DFMT_A8R8G8B8 = 21, D3DFMT_X8R8G8B8 = 22, D3DFMT_D16 = 80,
                            D3DFMT_D24S8 = 75, D3DFMT_D24X8 = 77 };
enum D3DPOOL : uint32_t { D3DPOOL_DEFAULT = 0, D3DPOOL_MANAGED = 1, D3DPOOL_SYSTEMMEM = 2 };
enum : DWORD { D3DUSAGE_RENDERTARGET = 1, D3DUSAGE_DEPTHSTENCIL = 2 };
enum D3DDEVTYPE : uint32_t { D3DDEVTYPE_HAL = 1, D3DDEVTYPE_REF = 2 };
enum D3DBACKBUFFER_TYPE : uint32_t { D3DBACKBUFFER_TYPE_MONO = 0 };
enum D3DPRIMITIVETYPE : uint32_t { D3DPT_POINTLIST = 1, D3DPT_LINELIST, D3DPT_LINESTRIP, D3DPT_TRIANGLELIST,
                                   D3DPT_TRIANGLESTRIP, D3DPT_TRIANGLEFAN };
enum D3DTRANSFORMSTATETYPE : uint32_t { D3DTS_VIEW = 2, D3DTS_PROJECTION = 3, D3DTS_WORLD = 256 };
enum : DWORD { D3DCLEAR_TARGET = 1, D3DCLEAR_ZBUFFER = 2, D3DCLEAR_STENCIL = 4 };
enum : DWORD { D3DFVF_XYZ = 0x2, D3DFVF_DIFFUSE = 0x40, D3DFVF_TEX1 = 0x100 };

enum D3DRENDERSTATETYPE : uint32_t {
    D3DRS_ZENABLE = 7, D3DRS_FILLMODE = 8, D3DRS_SHADEMODE = 9, D3DRS_ZWRITEENABLE = 14, D3DRS_ALPHATESTENABLE = 15,
    D3DRS_SRCBLEND = 19, D3DRS_DESTBLEND = 20, D3DRS_CULLMODE = 22, D3DRS_ZFUNC = 23, D3DRS_ALPHAREF = 24,
    D3DRS_ALPHAFUNC = 25, D3DRS_DITHERENABLE = 26, D3DRS_ALPHABLENDENABLE = 27, D3DRS_FOGENABLE = 28,
    D3DRS_SPECULARENABLE = 29, D3DRS_TEXTUREFACTOR = 60, D3DRS_LIGHTING = 137, D3DRS_AMBIENT = 139,
    D3DRS_COLORVERTEX = 141, D3DRS_DIFFUSEMATERIALSOURCE = 145, D3DRS_SPECULARMATERIALSOURCE = 146,
    D3DRS_AMBIENTMATERIALSOURCE = 147, D3DRS_EMISSIVEMATERIALSOURCE = 148, D3DRS_COLORWRITEENABLE = 168,
    D3DRS_BLENDOP = 171,
};
enum D3DTEXTURESTAGESTATETYPE : uint32_t {
    D3DTSS_COLOROP = 1, D3DTSS_COLORARG1, D3DTSS_COLORARG2, D3DTSS_ALPHAOP, D3DTSS_ALPHAARG1, D3DTSS_ALPHAARG2,
    D3DTSS_TEXCOORDINDEX = 11, D3DTSS_ADDRESSU = 13, D3DTSS_ADDRESSV = 14, D3DTSS_MAGFILTER = 16,
    D3DTSS_MINFILTER = 17, D3DTSS_MIPFILTER = 18, D3DTSS_COLORARG0 = 26, D3DTSS_ALPHAARG0 = 27,
};
enum : DWORD {   // D3DTEXTUREOP
    D3DTOP_DISABLE = 1, D3DTOP_SELECTARG1, D3DTOP_SELECTARG2, D3DTOP_MODULATE, D3DTOP_MODULATE2X, D3DTOP_MODULATE4X,
    D3DTOP_ADD, D3DTOP_ADDSIGNED, D3DTOP_ADDSIGNED2X, D3DTOP_SUBTRACT, D3DTOP_ADDSMOOTH, D3DTOP_BLENDDIFFUSEALPHA,
    D3DTOP_BLENDTEXTUREALPHA, D3DTOP_BLENDFACTORALPHA, D3DTOP_BLENDTEXTUREALPHAPM, D3DTOP_BLENDCURRENTALPHA,
    D3DTOP_MULTIPLYADD = 25, D3DTOP_LERP = 26,
};
enum : DWORD { D3DTA_DIFFUSE = 0, D3DTA_CURRENT = 1, D3DTA_TEXTURE = 2, D3DTA_TFACTOR = 3, D3DTA_SPECULAR = 4,
               D3DTA_COMPLEMENT = 0x10, D3DTA_ALPHAREPLICATE = 0x20 };
enum : DWORD { D3DBLEND_ZERO = 1, D3DBLEND_ONE, D3DBLEND_SRCCOLOR, D3DBLEND_INVSRCCOLOR, D3DBLEND_SRCALPHA,
               D3DBLEND_INVSRCALPHA, D3DBLEND_DESTALPHA, D3DBLEND_INVDESTALPHA, D3DBLEND_DESTCOLOR,
               D3DBLEND_INVDESTCOLOR };
enum : DWORD { D3DBLENDOP_ADD = 1, D3DBLENDOP_SUBTRACT, D3DBLENDOP_REVSUBTRACT, D3DBLENDOP_MIN, D3DBLENDOP_MAX };
enum : DWORD { D3DCMP_NEVER = 1, D3DCMP_LESS, D3DCMP_EQUAL, D3DCMP_LESSEQUAL, D3DCMP_GREATER, D3DCMP_NOTEQUAL,
               D3DCMP_GREATEREQUAL, D3DCMP_ALWAYS };
enum : DWORD { D3DCULL_NONE = 1, D3DCULL_CW, D3DCULL_CCW };
enum : DWORD { D3DTEXF_NONE = 0, D3DTEXF_POINT, D3DTEXF_LINEAR };
enum : DWORD { D3DTADDRESS_WRAP = 1, D3DTADDRESS_MIRROR, D3DTADDRESS_CLAMP, D3DTADDRESS_BORDER };
enum : DWORD { D3DMCS_MATERIAL = 0, D3DMCS_COLOR1, D3DMCS_COLOR2 };
enum : DWORD { D3DCREATE_SOFTWARE_VERTEXPROCESSING = 0x20, D3DCREATE_HARDWARE_VERTEXPROCESSING = 0x40,
               D3DCREATE_MIXED_VERTEXPROCESSING = 0x80, D3DCREATE_MULTITHREADED = 0x4 };
enum : DWORD { D3DPTEXTURECAPS_POW2 = 0x2, D3DPTEXTURECAPS_NONPOW2CONDITIONAL = 0x100 };
enum : DWORD { D3DTEXOPCAPS_MULTIPLYADD = 0x1000000 };
enum D3DRESOURCETYPE : uint32_t { D3DRTYPE_SURFACE = 1, D3DRTYPE_TEXTURE = 3 };

struct D3DMATRIX { float m[4][4]; };   // row-major, row vectors (v * M), as in d3d8types.h
struct D3DCOLORVALUE { float r, g, b, a; };
struct D3DMATERIAL8 { D3DCOLORVALUE Diffuse, Ambient, Specular, Emissive; float Power; };
struct D3DVIEWPORT8 { DWORD X, Y, Width, Height; float MinZ, MaxZ; };
struct D3DLOCKED_RECT { int32_t Pitch; void* pBits; };
struct D3DDISPLAYMODE { UINT Width, Height, RefreshRate; D3DFORMAT Format; };
struct D3DSURFACE_DESC { D3DFORMAT Format; uint32_t Type; DWORD Usage; D3DPOOL Pool; UINT Size; uint32_t MultiSampleType;
                         UINT Width, Height; };
struct D3DPRESENT_PARAMETERS {
    UINT BackBufferWidth, BackBufferHeight;
    D3DFORMAT BackBufferFormat;
    UINT BackBufferCount;
    uint32_t MultiSampleType, SwapEffect;
    HWND hDeviceWindow;
    BOOL Windowed, EnableAutoDepthStencil;
    D3DFORMAT AutoDepthStencilFormat;
    DWORD Flags;
    UINT FullScreen_RefreshRateInHz, FullScreen_PresentationInterval;
};
struct D3DCAPS8 {   // the real layout (212 bytes), so the recomp hands it to the guest as is
    D3DDEVTYPE DeviceType;
    UINT AdapterOrdinal;
    DWORD Caps, Caps2, Caps3, PresentationIntervals, CursorCaps, DevCaps, PrimitiveMiscCaps, RasterCaps, ZCmpCaps,
        SrcBlendCaps, DestBlendCaps, AlphaCmpCaps, ShadeCaps, TextureCaps, TextureFilterCaps, CubeTextureFilterCaps,
        VolumeTextureFilterCaps, TextureAddressCaps, VolumeTextureAddressCaps, LineCaps, MaxTextureWidth,
        MaxTextureHeight, MaxVolumeExtent, MaxTextureRepeat, MaxTextureAspectRatio, MaxAnisotropy;
    float MaxVertexW, GuardBandLeft, GuardBandTop, GuardBandRight, GuardBandBottom, ExtentsAdjust;
    DWORD StencilCaps, FVFCaps, TextureOpCaps, MaxTextureBlendStages, MaxSimultaneousTextures, VertexProcessingCaps,
        MaxActiveLights, MaxUserClipPlanes, MaxVertexBlendMatrices, MaxVertexBlendMatrixIndex;
    float MaxPointSize;
    DWORD MaxPrimitiveCount, MaxVertexIndex, MaxStreams, MaxStreamStride, VertexShaderVersion, MaxVertexShaderConst,
        PixelShaderVersion;
    float MaxPixelShaderValue;
};
static_assert(sizeof(D3DCAPS8) == 212, "D3DCAPS8 layout");

struct D3DRECT { int32_t x1, y1, x2, y2; };

class IDirect3DDevice8;
class IDirect3DTexture8;

typedef ComObject D3DUnknown;

class IDirect3DSurface8 : public D3DUnknown {
public:
    HRESULT GetDesc(D3DSURFACE_DESC* desc);
    HRESULT LockRect(D3DLOCKED_RECT* locked, const RECT* rect, DWORD flags);
    HRESULT UnlockRect();

    // implementation
    UINT AddRef() override;
    UINT Release() override;
    IDirect3DDevice8* dev = nullptr;
    IDirect3DTexture8* owner = nullptr;   // level 0 of this texture: refcount and pixels live there
    UINT w = 0, h = 0;
    D3DFORMAT fmt = D3DFMT_UNKNOWN;
    D3DPOOL pool = D3DPOOL_SYSTEMMEM;
    DWORD usage = 0;
    std::vector<uint8_t> bits;            // image surfaces: B,G,R,A rows, pitch w*4
    uint32_t glFbo = 0, glColor = 0;      // back buffer: FBO + colour renderbuffer
    uint32_t glDepth = 0;                 // depth surfaces: renderbuffer
    uint64_t fboDepth = ~0ull;            // render targets: depth attached to their FBO, as rbEpoch << 32 | renderbuffer
    bool read(std::vector<uint8_t>& bgra);   // whole surface as B,G,R,A rows (GPU surfaces are read back)
    bool write(const RECT& r, const uint8_t* bgra, int pitch);   // into a CPU-backed surface or texture level
    ~IDirect3DSurface8() override;
};

class IDirect3DTexture8 : public D3DUnknown {
public:
    DWORD GetLevelCount() { return 1; }   // ponytail: one level; the game asks for 1 (mip chains add when it doesn't)
    HRESULT GetLevelDesc(UINT level, D3DSURFACE_DESC* desc);
    HRESULT GetSurfaceLevel(UINT level, IDirect3DSurface8** surface);
    HRESULT LockRect(UINT level, D3DLOCKED_RECT* locked, const RECT* rect, DWORD flags);
    HRESULT UnlockRect(UINT level);

    // implementation
    IDirect3DDevice8* dev = nullptr;
    IDirect3DSurface8 level0;             // refcount forwards to the texture
    uint32_t glTex = 0, glFbo = 0, glFboDepth = 0;
    std::vector<uint8_t> shadow;          // managed textures: B,G,R,A copy that LockRect hands out
    RECT locked{};
    RECT dirty{};                         // shadow rect not yet uploaded (empty: clean)
    bool isLocked = false;
    int32_t sampler[4] = {-1, -1, -1, -1};   // GL params last set: mag, min, wrap s, wrap t
    void markDirty(const RECT& r);
    void sync();                          // GL thread: create glTex, upload the dirty rect
    ~IDirect3DTexture8() override;
};

class IDirect3DDevice8 : public D3DUnknown {
public:
    HRESULT TestCooperativeLevel() { return D3D_OK; }   // a GL context is never "lost"
    HRESULT Reset(D3DPRESENT_PARAMETERS* pp);
    HRESULT Present(const RECT* src, const RECT* dst, HWND window, const void* dirty);
    HRESULT GetBackBuffer(UINT index, D3DBACKBUFFER_TYPE type, IDirect3DSurface8** surface);
    HRESULT GetDeviceCaps(D3DCAPS8* caps);
    HRESULT CreateTexture(UINT w, UINT h, UINT levels, DWORD usage, D3DFORMAT fmt, D3DPOOL pool,
                          IDirect3DTexture8** texture);
    HRESULT CreateImageSurface(UINT w, UINT h, D3DFORMAT fmt, IDirect3DSurface8** surface);
    HRESULT CopyRects(IDirect3DSurface8* src, const RECT* rects, UINT count, IDirect3DSurface8* dst,
                      const POINT* points);
    HRESULT SetRenderTarget(IDirect3DSurface8* target, IDirect3DSurface8* depth);
    HRESULT GetRenderTarget(IDirect3DSurface8** surface);
    HRESULT GetDepthStencilSurface(IDirect3DSurface8** surface);
    HRESULT BeginScene() { return D3D_OK; }
    HRESULT EndScene() { return D3D_OK; }
    HRESULT Clear(DWORD count, const D3DRECT* rects, DWORD flags, D3DCOLOR color, float z, DWORD stencil);
    HRESULT SetTransform(D3DTRANSFORMSTATETYPE state, const D3DMATRIX* m);
    HRESULT GetTransform(D3DTRANSFORMSTATETYPE state, D3DMATRIX* m);
    HRESULT SetViewport(const D3DVIEWPORT8* vp);
    HRESULT GetViewport(D3DVIEWPORT8* vp);
    HRESULT SetMaterial(const D3DMATERIAL8* m);
    HRESULT GetMaterial(D3DMATERIAL8* m);
    HRESULT SetRenderState(D3DRENDERSTATETYPE state, DWORD value);
    HRESULT GetRenderState(D3DRENDERSTATETYPE state, DWORD* value);
    HRESULT SetTexture(DWORD stage, IDirect3DTexture8* texture);
    HRESULT SetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE type, DWORD value);
    HRESULT GetTextureStageState(DWORD stage, D3DTEXTURESTAGESTATETYPE type, DWORD* value);
    HRESULT SetVertexShader(DWORD fvf);
    HRESULT GetVertexShader(DWORD* fvf);
    HRESULT DrawPrimitiveUP(D3DPRIMITIVETYPE type, UINT count, const void* vertices, UINT stride);

    // implementation
    bool init(const D3DPRESENT_PARAMETERS& pp);
    ~IDirect3DDevice8() override;
    D3DPRESENT_PARAMETERS pp{};
    IDirect3DSurface8* backBuffer = nullptr;
    IDirect3DSurface8* autoDepth = nullptr;
    IDirect3DSurface8* target = nullptr;
    IDirect3DSurface8* depth = nullptr;
    IDirect3DTexture8* texture = nullptr;
    DWORD rs[256] = {};
    DWORD tss[29] = {};                   // stage 0 only; the game never enables stage 1
    D3DMATRIX world{}, view{}, proj{};
    D3DVIEWPORT8 vp{};
    D3DMATERIAL8 material{};
    DWORD fvf = 0;
    uint32_t glProgram = 0, glVao = 0, glVbo = 0;
    int u[16] = {};                       // uniform locations
    // Sprites batch: world transform and lighting are applied on the CPU as vertices are queued, so consecutive
    // draws with the same texture and state go out as one glDrawArrays. Setters flush only on an actual change.
    struct Vertex { float x, y, z; uint8_t c[4]; float u, v; };   // c = lit R,G,B,A
    std::vector<Vertex> batch;
    void flush();
    void bindTarget();
    void applyState();
};

class IDirect3D8 : public D3DUnknown {
public:
    UINT GetAdapterModeCount(UINT adapter);
    HRESULT EnumAdapterModes(UINT adapter, UINT mode, D3DDISPLAYMODE* out);
    HRESULT GetAdapterDisplayMode(UINT adapter, D3DDISPLAYMODE* out);
    HRESULT GetDeviceCaps(UINT adapter, D3DDEVTYPE type, D3DCAPS8* caps);
    HRESULT CheckDeviceFormat(UINT adapter, D3DDEVTYPE type, D3DFORMAT adapterFmt, DWORD usage, D3DRESOURCETYPE rtype,
                              D3DFORMAT fmt);
    // Uses the GL context current on this thread (platformInit, or a test's own); window is ignored.
    HRESULT CreateDevice(UINT adapter, D3DDEVTYPE type, HWND window, DWORD flags, D3DPRESENT_PARAMETERS* pp,
                         IDirect3DDevice8** device);
};

IDirect3D8* Direct3DCreate8(UINT sdkVersion);   // 220 (D3D_SDK_VERSION of DirectX 8.1)
