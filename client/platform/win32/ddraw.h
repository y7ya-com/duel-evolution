// DirectDraw (DirectX 3 interfaces, as yaneSDK uses them): there is no DirectDraw here. CoCreateInstance
// (CLSID_DirectDraw) fails with REGDB_E_CLASSNOTREG and DirectDrawCreate* with DDERR_NODIRECTDRAWHW, as on a PC
// without it, so CDirectDrawBase leaves its IDirectDraw NULL and yaneSDK takes its no-DirectDraw path.
// The interfaces are declared in full (real method order and signatures) so CFastDraw/CFastPlane/CDIBDraw/CPlane
// compile; nothing implements them. Constants have their Win32 values. (win32_nodevice.cpp)
#pragma once
#include "windows.h"

struct IDirectDraw;
struct IDirectDraw2;
struct IDirectDrawSurface;
struct IDirectDrawPalette;
struct IDirectDrawClipper;
typedef IDirectDraw* LPDIRECTDRAW;
typedef IDirectDraw2* LPDIRECTDRAW2;
typedef IDirectDrawSurface* LPDIRECTDRAWSURFACE;
typedef IDirectDrawPalette* LPDIRECTDRAWPALETTE;
typedef IDirectDrawClipper* LPDIRECTDRAWCLIPPER;

extern const GUID CLSID_DirectDraw, IID_IDirectDraw, IID_IDirectDraw2, IID_IDirectDrawSurface;

// ---------------------------------------------------------------- results
#define _FACDD 0x876
#define MAKE_DDHRESULT(code) MAKE_HRESULT(1, _FACDD, code)
#define DD_OK S_OK
#define DD_FALSE S_FALSE
#define DDERR_ALREADYINITIALIZED MAKE_DDHRESULT(5)
#define DDERR_CURRENTLYNOTAVAIL MAKE_DDHRESULT(40)
#define DDERR_GENERIC E_FAIL
#define DDERR_INVALIDCAPS MAKE_DDHRESULT(100)
#define DDERR_INVALIDMODE MAKE_DDHRESULT(120)
#define DDERR_INVALIDOBJECT MAKE_DDHRESULT(130)
#define DDERR_INVALIDPARAMS E_INVALIDARG
#define DDERR_INVALIDPIXELFORMAT MAKE_DDHRESULT(145)
#define DDERR_INVALIDRECT MAKE_DDHRESULT(150)
#define DDERR_NOCOOPERATIVELEVELSET MAKE_DDHRESULT(212)
#define DDERR_NODIRECTDRAWSUPPORT MAKE_DDHRESULT(222)
#define DDERR_NOEXCLUSIVEMODE MAKE_DDHRESULT(225)
#define DDERR_NOFLIPHW MAKE_DDHRESULT(230)
#define DDERR_NOTFOUND MAKE_DDHRESULT(255)
#define DDERR_OUTOFMEMORY E_OUTOFMEMORY
#define DDERR_OUTOFVIDEOMEMORY MAKE_DDHRESULT(380)
#define DDERR_SURFACEBUSY MAKE_DDHRESULT(430)
#define DDERR_SURFACELOST MAKE_DDHRESULT(450)
#define DDERR_UNSUPPORTED E_NOTIMPL
#define DDERR_WASSTILLDRAWING MAKE_DDHRESULT(540)
#define DDERR_DIRECTDRAWALREADYCREATED MAKE_DDHRESULT(562)
#define DDERR_NODIRECTDRAWHW MAKE_DDHRESULT(563)
#define DDERR_PRIMARYSURFACEALREADYEXISTS MAKE_DDHRESULT(564)
#define DDERR_NOEMULATION MAKE_DDHRESULT(565)
#define DDERR_NOHWND MAKE_DDHRESULT(569)
#define DDERR_NOBLTHW MAKE_DDHRESULT(575)
#define DDERR_EXCLUSIVEMODEALREADYSET MAKE_DDHRESULT(581)
#define DDERR_NOTFLIPPABLE MAKE_DDHRESULT(582)
#define DDERR_NOTLOCKED MAKE_DDHRESULT(584)
#define DDERR_CANTCREATEDC MAKE_DDHRESULT(585)
#define DDERR_NODC MAKE_DDHRESULT(586)
#define DDERR_WRONGMODE MAKE_DDHRESULT(587)
#define DDERR_UNSUPPORTEDMODE MAKE_DDHRESULT(590)
#define DDERR_NOTINITIALIZED ((HRESULT)0x800401F0)   // CO_E_NOTINITIALIZED

// ---------------------------------------------------------------- flags
// IDirectDraw::Initialize / DirectDrawCreate's GUID
#define DDCREATE_HARDWAREONLY ((GUID*)1)
#define DDCREATE_EMULATIONONLY ((GUID*)2)
// SetCooperativeLevel
#define DDSCL_FULLSCREEN 0x00000001L
#define DDSCL_ALLOWREBOOT 0x00000002L
#define DDSCL_NOWINDOWCHANGES 0x00000004L
#define DDSCL_NORMAL 0x00000008L
#define DDSCL_EXCLUSIVE 0x00000010L
#define DDSCL_ALLOWMODEX 0x00000040L
// DDSURFACEDESC::dwFlags
#define DDSD_CAPS 0x00000001L
#define DDSD_HEIGHT 0x00000002L
#define DDSD_WIDTH 0x00000004L
#define DDSD_PITCH 0x00000008L
#define DDSD_BACKBUFFERCOUNT 0x00000020L
#define DDSD_ZBUFFERBITDEPTH 0x00000040L
#define DDSD_ALPHABITDEPTH 0x00000080L
#define DDSD_LPSURFACE 0x00000800L
#define DDSD_PIXELFORMAT 0x00001000L
#define DDSD_CKDESTOVERLAY 0x00002000L
#define DDSD_CKDESTBLT 0x00004000L
#define DDSD_CKSRCOVERLAY 0x00008000L
#define DDSD_CKSRCBLT 0x00010000L
#define DDSD_MIPMAPCOUNT 0x00020000L
#define DDSD_REFRESHRATE 0x00040000L
#define DDSD_LINEARSIZE 0x00080000L
#define DDSD_ALL 0x000ff9eeL
// DDSCAPS::dwCaps
#define DDSCAPS_ALPHA 0x00000002L
#define DDSCAPS_BACKBUFFER 0x00000004L
#define DDSCAPS_COMPLEX 0x00000008L
#define DDSCAPS_FLIP 0x00000010L
#define DDSCAPS_FRONTBUFFER 0x00000020L
#define DDSCAPS_OFFSCREENPLAIN 0x00000040L
#define DDSCAPS_OVERLAY 0x00000080L
#define DDSCAPS_PALETTE 0x00000100L
#define DDSCAPS_PRIMARYSURFACE 0x00000200L
#define DDSCAPS_SYSTEMMEMORY 0x00000800L
#define DDSCAPS_TEXTURE 0x00001000L
#define DDSCAPS_3DDEVICE 0x00002000L
#define DDSCAPS_VIDEOMEMORY 0x00004000L
#define DDSCAPS_VISIBLE 0x00008000L
#define DDSCAPS_WRITEONLY 0x00010000L
#define DDSCAPS_ZBUFFER 0x00020000L
#define DDSCAPS_OWNDC 0x00040000L
// DDPIXELFORMAT::dwFlags
#define DDPF_ALPHAPIXELS 0x00000001L
#define DDPF_ALPHA 0x00000002L
#define DDPF_FOURCC 0x00000004L
#define DDPF_PALETTEINDEXED4 0x00000008L
#define DDPF_PALETTEINDEXEDTO8 0x00000010L
#define DDPF_PALETTEINDEXED8 0x00000020L
#define DDPF_RGB 0x00000040L
// Blt
#define DDBLT_ALPHADEST 0x00000001L
#define DDBLT_ASYNC 0x00000200L
#define DDBLT_COLORFILL 0x00000400L
#define DDBLT_DDFX 0x00000800L
#define DDBLT_DDROPS 0x00001000L
#define DDBLT_KEYDEST 0x00002000L
#define DDBLT_KEYDESTOVERRIDE 0x00004000L
#define DDBLT_KEYSRC 0x00008000L
#define DDBLT_KEYSRCOVERRIDE 0x00010000L
#define DDBLT_ROP 0x00020000L
#define DDBLT_ROTATIONANGLE 0x00040000L
#define DDBLT_ZBUFFER 0x00080000L
#define DDBLT_WAIT 0x01000000L
#define DDBLT_DEPTHFILL 0x02000000L
#define DDBLT_DONOTWAIT 0x08000000L
// BltFast
#define DDBLTFAST_NOCOLORKEY 0x00000000
#define DDBLTFAST_SRCCOLORKEY 0x00000001
#define DDBLTFAST_DESTCOLORKEY 0x00000002
#define DDBLTFAST_WAIT 0x00000010
#define DDBLTFAST_DONOTWAIT 0x00000020
// Flip
#define DDFLIP_WAIT 0x00000001L
#define DDFLIP_EVEN 0x00000002L
#define DDFLIP_ODD 0x00000004L
#define DDFLIP_NOVSYNC 0x00000008L
#define DDFLIP_DONOTWAIT 0x00000020L
// Lock
#define DDLOCK_SURFACEMEMORYPTR 0x00000000L
#define DDLOCK_WAIT 0x00000001L
#define DDLOCK_EVENT 0x00000002L
#define DDLOCK_READONLY 0x00000010L
#define DDLOCK_WRITEONLY 0x00000020L
#define DDLOCK_NOSYSLOCK 0x00000800L
#define DDLOCK_DONOTWAIT 0x00004000L
// SetColorKey
#define DDCKEY_COLORSPACE 0x00000001L
#define DDCKEY_DESTBLT 0x00000002L
#define DDCKEY_DESTOVERLAY 0x00000004L
#define DDCKEY_SRCBLT 0x00000008L
#define DDCKEY_SRCOVERLAY 0x00000010L
// CreatePalette
#define DDPCAPS_4BIT 0x00000001L
#define DDPCAPS_8BITENTRIES 0x00000002L
#define DDPCAPS_8BIT 0x00000004L
#define DDPCAPS_PRIMARYSURFACE 0x00000010L
#define DDPCAPS_ALLOW256 0x00000040L
#define DDPCAPS_1BIT 0x00000100L
#define DDPCAPS_2BIT 0x00000200L
// WaitForVerticalBlank, GetBltStatus, GetFlipStatus
#define DDWAITVB_BLOCKBEGIN 0x00000001L
#define DDWAITVB_BLOCKBEGINEVENT 0x00000002L
#define DDWAITVB_BLOCKEND 0x00000004L
#define DDGBS_CANBLT 0x00000001L
#define DDGBS_ISBLTDONE 0x00000002L
#define DDGFS_CANFLIP 0x00000001L
#define DDGFS_ISFLIPDONE 0x00000002L

// ---------------------------------------------------------------- structures
typedef struct _DDSCAPS { DWORD dwCaps; } DDSCAPS, *LPDDSCAPS;
typedef struct _DDCOLORKEY { DWORD dwColorSpaceLowValue, dwColorSpaceHighValue; } DDCOLORKEY, *LPDDCOLORKEY;
typedef struct _DDPIXELFORMAT {
    DWORD dwSize, dwFlags, dwFourCC;
    union { DWORD dwRGBBitCount, dwYUVBitCount, dwZBufferBitDepth, dwAlphaBitDepth; };
    union { DWORD dwRBitMask, dwYBitMask; };
    union { DWORD dwGBitMask, dwUBitMask; };
    union { DWORD dwBBitMask, dwVBitMask; };
    union { DWORD dwRGBAlphaBitMask, dwYUVAlphaBitMask, dwRGBZBitMask, dwYUVZBitMask; };
} DDPIXELFORMAT, *LPDDPIXELFORMAT;
typedef struct _DDSURFACEDESC {
    DWORD dwSize, dwFlags, dwHeight, dwWidth;
    union { LONG lPitch; DWORD dwLinearSize; };
    DWORD dwBackBufferCount;
    union { DWORD dwMipMapCount, dwZBufferBitDepth, dwRefreshRate; };
    DWORD dwAlphaBitDepth, dwReserved;
    LPVOID lpSurface;
    DDCOLORKEY ddckCKDestOverlay, ddckCKDestBlt, ddckCKSrcOverlay, ddckCKSrcBlt;
    DDPIXELFORMAT ddpfPixelFormat;
    DDSCAPS ddsCaps;
} DDSURFACEDESC, *LPDDSURFACEDESC;
typedef struct _DDBLTFX {
    DWORD dwSize, dwDDFX, dwROP, dwDDROP, dwRotationAngle, dwZBufferOpCode, dwZBufferLow, dwZBufferHigh,
        dwZBufferBaseDest, dwZDestConstBitDepth;
    union { DWORD dwZDestConst; LPDIRECTDRAWSURFACE lpDDSZBufferDest; };
    DWORD dwZSrcConstBitDepth;
    union { DWORD dwZSrcConst; LPDIRECTDRAWSURFACE lpDDSZBufferSrc; };
    DWORD dwAlphaEdgeBlendBitDepth, dwAlphaEdgeBlend, dwReserved, dwAlphaDestConstBitDepth;
    union { DWORD dwAlphaDestConst; LPDIRECTDRAWSURFACE lpDDSAlphaDest; };
    DWORD dwAlphaSrcConstBitDepth;
    union { DWORD dwAlphaSrcConst; LPDIRECTDRAWSURFACE lpDDSAlphaSrc; };
    union { DWORD dwFillColor, dwFillDepth, dwFillPixel; LPDIRECTDRAWSURFACE lpDDSPattern; };
    DDCOLORKEY ddckDestColorkey, ddckSrcColorkey;
} DDBLTFX, *LPDDBLTFX;
// Only ever passed by pointer here (nothing in yaneSDK fills them)
struct _DDCAPS;
struct _DDBLTBATCH;
struct _DDOVERLAYFX;
struct _RGNDATA;
typedef struct _DDCAPS DDCAPS, *LPDDCAPS;
typedef struct _DDBLTBATCH DDBLTBATCH, *LPDDBLTBATCH;
typedef struct _DDOVERLAYFX DDOVERLAYFX, *LPDDOVERLAYFX;
typedef HRESULT (CALLBACK* LPDDENUMMODESCALLBACK)(LPDDSURFACEDESC, LPVOID);
typedef HRESULT (CALLBACK* LPDDENUMSURFACESCALLBACK)(LPDIRECTDRAWSURFACE, LPDDSURFACEDESC, LPVOID);
typedef BOOL (CALLBACK* LPDDENUMCALLBACKA)(GUID*, LPSTR, LPSTR, LPVOID);

// ---------------------------------------------------------------- interfaces
struct IDirectDraw : IUnknown {
    virtual HRESULT Compact() = 0;
    virtual HRESULT CreateClipper(DWORD flags, LPDIRECTDRAWCLIPPER* out, IUnknown* outer) = 0;
    virtual HRESULT CreatePalette(DWORD flags, LPPALETTEENTRY entries, LPDIRECTDRAWPALETTE* out, IUnknown* outer) = 0;
    virtual HRESULT CreateSurface(LPDDSURFACEDESC desc, LPDIRECTDRAWSURFACE* out, IUnknown* outer) = 0;
    virtual HRESULT DuplicateSurface(LPDIRECTDRAWSURFACE src, LPDIRECTDRAWSURFACE* out) = 0;
    virtual HRESULT EnumDisplayModes(DWORD flags, LPDDSURFACEDESC desc, LPVOID ctx, LPDDENUMMODESCALLBACK fn) = 0;
    virtual HRESULT EnumSurfaces(DWORD flags, LPDDSURFACEDESC desc, LPVOID ctx, LPDDENUMSURFACESCALLBACK fn) = 0;
    virtual HRESULT FlipToGDISurface() = 0;
    virtual HRESULT GetCaps(LPDDCAPS driver, LPDDCAPS hel) = 0;
    virtual HRESULT GetDisplayMode(LPDDSURFACEDESC desc) = 0;
    virtual HRESULT GetFourCCCodes(LPDWORD n, LPDWORD codes) = 0;
    virtual HRESULT GetGDISurface(LPDIRECTDRAWSURFACE* out) = 0;
    virtual HRESULT GetMonitorFrequency(LPDWORD hz) = 0;
    virtual HRESULT GetScanLine(LPDWORD line) = 0;
    virtual HRESULT GetVerticalBlankStatus(LPBOOL inVB) = 0;
    virtual HRESULT Initialize(GUID* guid) = 0;
    virtual HRESULT RestoreDisplayMode() = 0;
    virtual HRESULT SetCooperativeLevel(HWND w, DWORD flags) = 0;
    virtual HRESULT SetDisplayMode(DWORD width, DWORD height, DWORD bpp) = 0;
    virtual HRESULT WaitForVerticalBlank(DWORD flags, HANDLE event) = 0;
};

struct IDirectDraw2 : IUnknown {
    virtual HRESULT Compact() = 0;
    virtual HRESULT CreateClipper(DWORD flags, LPDIRECTDRAWCLIPPER* out, IUnknown* outer) = 0;
    virtual HRESULT CreatePalette(DWORD flags, LPPALETTEENTRY entries, LPDIRECTDRAWPALETTE* out, IUnknown* outer) = 0;
    virtual HRESULT CreateSurface(LPDDSURFACEDESC desc, LPDIRECTDRAWSURFACE* out, IUnknown* outer) = 0;
    virtual HRESULT DuplicateSurface(LPDIRECTDRAWSURFACE src, LPDIRECTDRAWSURFACE* out) = 0;
    virtual HRESULT EnumDisplayModes(DWORD flags, LPDDSURFACEDESC desc, LPVOID ctx, LPDDENUMMODESCALLBACK fn) = 0;
    virtual HRESULT EnumSurfaces(DWORD flags, LPDDSURFACEDESC desc, LPVOID ctx, LPDDENUMSURFACESCALLBACK fn) = 0;
    virtual HRESULT FlipToGDISurface() = 0;
    virtual HRESULT GetCaps(LPDDCAPS driver, LPDDCAPS hel) = 0;
    virtual HRESULT GetDisplayMode(LPDDSURFACEDESC desc) = 0;
    virtual HRESULT GetFourCCCodes(LPDWORD n, LPDWORD codes) = 0;
    virtual HRESULT GetGDISurface(LPDIRECTDRAWSURFACE* out) = 0;
    virtual HRESULT GetMonitorFrequency(LPDWORD hz) = 0;
    virtual HRESULT GetScanLine(LPDWORD line) = 0;
    virtual HRESULT GetVerticalBlankStatus(LPBOOL inVB) = 0;
    virtual HRESULT Initialize(GUID* guid) = 0;
    virtual HRESULT RestoreDisplayMode() = 0;
    virtual HRESULT SetCooperativeLevel(HWND w, DWORD flags) = 0;
    virtual HRESULT SetDisplayMode(DWORD width, DWORD height, DWORD bpp, DWORD refresh, DWORD flags) = 0;
    virtual HRESULT WaitForVerticalBlank(DWORD flags, HANDLE event) = 0;
    virtual HRESULT GetAvailableVidMem(LPDDSCAPS caps, LPDWORD total, LPDWORD free) = 0;
};

struct IDirectDrawSurface : IUnknown {
    virtual HRESULT AddAttachedSurface(LPDIRECTDRAWSURFACE s) = 0;
    virtual HRESULT AddOverlayDirtyRect(LPRECT r) = 0;
    virtual HRESULT Blt(LPRECT dst, LPDIRECTDRAWSURFACE src, LPRECT srcRect, DWORD flags, LPDDBLTFX fx) = 0;
    virtual HRESULT BltBatch(LPDDBLTBATCH batch, DWORD n, DWORD flags) = 0;
    virtual HRESULT BltFast(DWORD x, DWORD y, LPDIRECTDRAWSURFACE src, LPRECT srcRect, DWORD flags) = 0;
    virtual HRESULT DeleteAttachedSurface(DWORD flags, LPDIRECTDRAWSURFACE s) = 0;
    virtual HRESULT EnumAttachedSurfaces(LPVOID ctx, LPDDENUMSURFACESCALLBACK fn) = 0;
    virtual HRESULT EnumOverlayZOrders(DWORD flags, LPVOID ctx, LPDDENUMSURFACESCALLBACK fn) = 0;
    virtual HRESULT Flip(LPDIRECTDRAWSURFACE target, DWORD flags) = 0;
    virtual HRESULT GetAttachedSurface(LPDDSCAPS caps, LPDIRECTDRAWSURFACE* out) = 0;
    virtual HRESULT GetBltStatus(DWORD flags) = 0;
    virtual HRESULT GetCaps(LPDDSCAPS caps) = 0;
    virtual HRESULT GetClipper(LPDIRECTDRAWCLIPPER* out) = 0;
    virtual HRESULT GetColorKey(DWORD flags, LPDDCOLORKEY key) = 0;
    virtual HRESULT GetDC(HDC* out) = 0;
    virtual HRESULT GetFlipStatus(DWORD flags) = 0;
    virtual HRESULT GetOverlayPosition(LPLONG x, LPLONG y) = 0;
    virtual HRESULT GetPalette(LPDIRECTDRAWPALETTE* out) = 0;
    virtual HRESULT GetPixelFormat(LPDDPIXELFORMAT fmt) = 0;
    virtual HRESULT GetSurfaceDesc(LPDDSURFACEDESC desc) = 0;
    virtual HRESULT Initialize(LPDIRECTDRAW dd, LPDDSURFACEDESC desc) = 0;
    virtual HRESULT IsLost() = 0;
    virtual HRESULT Lock(LPRECT r, LPDDSURFACEDESC desc, DWORD flags, HANDLE event) = 0;
    virtual HRESULT ReleaseDC(HDC dc) = 0;
    virtual HRESULT Restore() = 0;
    virtual HRESULT SetClipper(LPDIRECTDRAWCLIPPER c) = 0;
    virtual HRESULT SetColorKey(DWORD flags, LPDDCOLORKEY key) = 0;
    virtual HRESULT SetOverlayPosition(LONG x, LONG y) = 0;
    virtual HRESULT SetPalette(LPDIRECTDRAWPALETTE p) = 0;
    virtual HRESULT Unlock(LPVOID p) = 0;
    virtual HRESULT UpdateOverlay(LPRECT src, LPDIRECTDRAWSURFACE dst, LPRECT dstRect, DWORD flags, LPDDOVERLAYFX fx) = 0;
    virtual HRESULT UpdateOverlayDisplay(DWORD flags) = 0;
    virtual HRESULT UpdateOverlayZOrder(DWORD flags, LPDIRECTDRAWSURFACE ref) = 0;
};

struct IDirectDrawPalette : IUnknown {
    virtual HRESULT GetCaps(LPDWORD caps) = 0;
    virtual HRESULT GetEntries(DWORD flags, DWORD base, DWORD n, LPPALETTEENTRY entries) = 0;
    virtual HRESULT Initialize(LPDIRECTDRAW dd, DWORD flags, LPPALETTEENTRY entries) = 0;
    virtual HRESULT SetEntries(DWORD flags, DWORD start, DWORD n, LPPALETTEENTRY entries) = 0;
};

struct IDirectDrawClipper : IUnknown {
    virtual HRESULT GetClipList(LPRECT r, struct _RGNDATA* list, LPDWORD size) = 0;
    virtual HRESULT GetHWnd(HWND* out) = 0;
    virtual HRESULT Initialize(LPDIRECTDRAW dd, DWORD flags) = 0;
    virtual HRESULT IsClipListChanged(BOOL* changed) = 0;
    virtual HRESULT SetClipList(struct _RGNDATA* list, DWORD flags) = 0;
    virtual HRESULT SetHWnd(DWORD flags, HWND w) = 0;
};

// ---------------------------------------------------------------- entry points: all fail, out pointers NULL
HRESULT DirectDrawCreate(GUID* guid, LPDIRECTDRAW* out, IUnknown* outer);
HRESULT DirectDrawCreateEx(GUID* guid, LPVOID* out, REFIID iid, IUnknown* outer);
HRESULT DirectDrawCreateClipper(DWORD flags, LPDIRECTDRAWCLIPPER* out, IUnknown* outer);
HRESULT DirectDrawEnumerateA(LPDDENUMCALLBACKA fn, LPVOID ctx);   // no drivers: never calls back
#define DirectDrawEnumerate DirectDrawEnumerateA
