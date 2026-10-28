// The D3DX8 calls the game makes (statically linked in yo2.exe; addresses in platform/DESIGN.md §2.3).
// Images decode with stb_image (PNG, JPG, BMP, TGA, GIF); DDS isn't supported (no such asset found yet).
#pragma once
#include "d3d8.h"

enum : DWORD { D3DX_DEFAULT = 0xffffffff };
enum : DWORD { D3DX_FILTER_NONE = 1, D3DX_FILTER_POINT, D3DX_FILTER_LINEAR, D3DX_FILTER_TRIANGLE, D3DX_FILTER_BOX };
enum D3DXIMAGE_FILEFORMAT : uint32_t { D3DXIFF_BMP = 0, D3DXIFF_JPG = 1, D3DXIFF_TGA = 2, D3DXIFF_PNG = 3,
                                       D3DXIFF_DDS = 4 };
struct D3DXIMAGE_INFO {
    UINT Width, Height, Depth, MipLevels;
    D3DFORMAT Format;
    uint32_t ResourceType;   // D3DRTYPE_TEXTURE = 3
    D3DXIMAGE_FILEFORMAT ImageFileFormat;
};

HRESULT D3DXGetImageInfoFromFileInMemory(const void* data, UINT size, D3DXIMAGE_INFO* info);   // 0x00b3ced6
HRESULT D3DXCheckTextureRequirements(IDirect3DDevice8* dev, UINT* w, UINT* h, UINT* levels, DWORD usage,
                                     D3DFORMAT* fmt, D3DPOOL pool);                              // 0x00b3d5f6
HRESULT D3DXCreateTexture(IDirect3DDevice8* dev, UINT w, UINT h, UINT levels, DWORD usage, D3DFORMAT fmt,
                          D3DPOOL pool, IDirect3DTexture8** out);                                // 0x00b3d66f
HRESULT D3DXCreateTextureFromFileInMemoryEx(IDirect3DDevice8* dev, const void* data, UINT size, UINT w, UINT h,
                                            UINT levels, DWORD usage, D3DFORMAT fmt, D3DPOOL pool, DWORD filter,
                                            DWORD mipFilter, D3DCOLOR colorKey, D3DXIMAGE_INFO* info,
                                            PALETTEENTRY* palette, IDirect3DTexture8** out);     // 0x00b400b3
HRESULT D3DXLoadSurfaceFromFileInMemory(IDirect3DSurface8* dst, const PALETTEENTRY* dstPal, const RECT* dstRect,
                                        const void* data, UINT size, const RECT* srcRect, DWORD filter,
                                        D3DCOLOR colorKey, D3DXIMAGE_INFO* info);                 // 0x00b3eb13
HRESULT D3DXLoadSurfaceFromSurface(IDirect3DSurface8* dst, const PALETTEENTRY* dstPal, const RECT* dstRect,
                                   IDirect3DSurface8* src, const PALETTEENTRY* srcPal, const RECT* srcRect,
                                   DWORD filter, D3DCOLOR colorKey);                              // 0x00b3ebcb
HRESULT D3DXLoadSurfaceFromMemory(IDirect3DSurface8* dst, const PALETTEENTRY* dstPal, const RECT* dstRect,
                                  const void* src, D3DFORMAT srcFmt, UINT srcPitch, const PALETTEENTRY* srcPal,
                                  const RECT* srcRect, DWORD filter, D3DCOLOR colorKey);          // 0x00b3cf0e

// Math: only the ones identified so far (DESIGN.md §2.3 lists the rest of the stubs to name as callers are ported)
D3DMATRIX* D3DXMatrixIdentity(D3DMATRIX* out);
D3DMATRIX* D3DXMatrixMultiply(D3DMATRIX* out, const D3DMATRIX* a, const D3DMATRIX* b);
D3DMATRIX* D3DXMatrixOrthoLH(D3DMATRIX* out, float w, float h, float zn, float zf);              // 0x00b42a44
