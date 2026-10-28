#include "d3dx8.h"

#include <cstring>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_STDIO
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_ONLY_BMP
#define STBI_ONLY_TGA
#define STBI_ONLY_GIF
#include "../third_party/stb_image.h"

namespace {

struct Image {   // B,G,R,A rows, pitch w*4
    int w = 0, h = 0, channels = 0;
    std::vector<uint8_t> bgra;
};

bool decode(const void* data, UINT size, Image* img) {
    int w, h, c;
    uint8_t* p = stbi_load_from_memory((const uint8_t*)data, (int)size, &w, &h, &c, 4);
    if (!p) return false;
    img->w = w;
    img->h = h;
    img->channels = c;
    img->bgra.assign(p, p + (size_t)w * h * 4);
    for (size_t i = 0; i < img->bgra.size(); i += 4) std::swap(img->bgra[i], img->bgra[i + 2]);
    stbi_image_free(p);
    return true;
}

D3DXIMAGE_FILEFORMAT fileFormat(const uint8_t* d, UINT size) {
    if (size >= 2 && d[0] == 0x89 && d[1] == 'P') return D3DXIFF_PNG;
    if (size >= 2 && d[0] == 0xff && d[1] == 0xd8) return D3DXIFF_JPG;
    if (size >= 2 && d[0] == 'B' && d[1] == 'M') return D3DXIFF_BMP;
    return D3DXIFF_TGA;   // ponytail: GIF reports as TGA; nothing reads ImageFileFormat yet
}

void fillInfo(const Image& img, const void* data, UINT size, D3DXIMAGE_INFO* info) {
    if (!info) return;
    *info = D3DXIMAGE_INFO{(UINT)img.w, (UINT)img.h, 1, 1,
                           img.channels == 4 || img.channels == 2 ? D3DFMT_A8R8G8B8 : D3DFMT_X8R8G8B8, 3,
                           fileFormat((const uint8_t*)data, size)};
}

UINT pow2(UINT v) {
    UINT p = 1;
    while (p < v) p <<= 1;
    return p;
}

// Copy src (rect sr) into dst (rect dr) the way D3DX does: colour key first (matching pixels become transparent
// black), then FILTER_NONE copies 1:1 from the top-left and leaves the rest transparent, POINT scales nearest,
// everything else scales bilinear (ponytail: D3DX's TRIANGLE/BOX average more on big down-scales).
HRESULT blit(IDirect3DSurface8* dst, const RECT* dstRect, const uint8_t* src, int srcW, int srcH, int srcPitch,
             const RECT* srcRect, DWORD filter, D3DCOLOR colorKey) {
    if (!dst || !src) return D3DERR_INVALIDCALL;
    RECT dr = dstRect ? *dstRect : RECT{0, 0, (int32_t)dst->w, (int32_t)dst->h};
    RECT sr = srcRect ? *srcRect : RECT{0, 0, srcW, srcH};
    int dw = dr.right - dr.left, dh = dr.bottom - dr.top, sw = sr.right - sr.left, sh = sr.bottom - sr.top;
    if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0 || sr.left < 0 || sr.top < 0 || sr.right > srcW || sr.bottom > srcH)
        return D3DERR_INVALIDCALL;
    auto px = [&](int x, int y) -> uint32_t {
        uint32_t v;
        memcpy(&v, src + (size_t)(sr.top + y) * srcPitch + (sr.left + x) * 4, 4);   // little-endian: 0xAARRGGBB
        return colorKey && v == colorKey ? 0 : v;
    };
    std::vector<uint32_t> out((size_t)dw * dh, 0);
    DWORD f = filter == D3DX_DEFAULT ? D3DX_FILTER_TRIANGLE : filter & 0xff;
    if (f == D3DX_FILTER_NONE || (dw == sw && dh == sh)) {
        for (int y = 0; y < dh && y < sh; y++)
            for (int x = 0; x < dw && x < sw; x++) out[(size_t)y * dw + x] = px(x, y);
    } else if (f == D3DX_FILTER_POINT) {
        for (int y = 0; y < dh; y++)
            for (int x = 0; x < dw; x++) out[(size_t)y * dw + x] = px(x * sw / dw, y * sh / dh);
    } else {
        for (int y = 0; y < dh; y++) {
            float fy = (y + 0.5f) * sh / dh - 0.5f;
            int y0 = fy < 0 ? 0 : (int)fy, y1 = y0 + 1 < sh ? y0 + 1 : sh - 1;
            float ty = fy < 0 ? 0 : fy - y0;
            for (int x = 0; x < dw; x++) {
                float fx = (x + 0.5f) * sw / dw - 0.5f;
                int x0 = fx < 0 ? 0 : (int)fx, x1 = x0 + 1 < sw ? x0 + 1 : sw - 1;
                float tx = fx < 0 ? 0 : fx - x0;
                uint32_t a = px(x0, y0), b = px(x1, y0), c = px(x0, y1), d = px(x1, y1), r = 0;
                for (int s = 0; s < 32; s += 8) {
                    float top = (a >> s & 255) * (1 - tx) + (b >> s & 255) * tx;
                    float bot = (c >> s & 255) * (1 - tx) + (d >> s & 255) * tx;
                    r |= (uint32_t)(top * (1 - ty) + bot * ty + 0.5f) << s;
                }
                out[(size_t)y * dw + x] = r;
            }
        }
    }
    return dst->write(dr, (const uint8_t*)out.data(), dw * 4) ? D3D_OK : D3DERR_INVALIDCALL;
}

}  // namespace

HRESULT D3DXGetImageInfoFromFileInMemory(const void* data, UINT size, D3DXIMAGE_INFO* info) {
    int w, h, c;
    if (!data || !info || !stbi_info_from_memory((const uint8_t*)data, (int)size, &w, &h, &c))
        return D3DERR_INVALIDCALL;
    Image img;
    img.w = w;
    img.h = h;
    img.channels = c;
    fillInfo(img, data, size, info);
    return D3D_OK;
}

HRESULT D3DXCheckTextureRequirements(IDirect3DDevice8* dev, UINT* w, UINT* h, UINT* levels, DWORD,
                                     D3DFORMAT* fmt, D3DPOOL) {
    if (!dev) return D3DERR_INVALIDCALL;
    D3DCAPS8 caps;
    dev->GetDeviceCaps(&caps);
    for (UINT* v : {w, h}) {
        if (!v) continue;
        if (!*v || *v == D3DX_DEFAULT) *v = 256;
        if (caps.TextureCaps & D3DPTEXTURECAPS_POW2) *v = pow2(*v);
        if (*v > caps.MaxTextureWidth) *v = caps.MaxTextureWidth;
    }
    if (levels) *levels = 1;
    if (fmt && *fmt != D3DFMT_X8R8G8B8) *fmt = D3DFMT_A8R8G8B8;   // the only colour formats the device has
    return D3D_OK;
}

HRESULT D3DXCreateTexture(IDirect3DDevice8* dev, UINT w, UINT h, UINT levels, DWORD usage, D3DFORMAT fmt,
                          D3DPOOL pool, IDirect3DTexture8** out) {
    HRESULT r = D3DXCheckTextureRequirements(dev, &w, &h, &levels, usage, &fmt, pool);
    return r ? r : dev->CreateTexture(w, h, levels, usage, fmt, pool, out);
}

HRESULT D3DXCreateTextureFromFileInMemoryEx(IDirect3DDevice8* dev, const void* data, UINT size, UINT w, UINT h,
                                            UINT levels, DWORD usage, D3DFORMAT fmt, D3DPOOL pool, DWORD filter,
                                            DWORD, D3DCOLOR colorKey, D3DXIMAGE_INFO* info, PALETTEENTRY*,
                                            IDirect3DTexture8** out) {
    Image img;
    if (!dev || !out || !data || !decode(data, size, &img)) return D3DERR_INVALIDCALL;
    D3DXIMAGE_INFO src;
    fillInfo(img, data, size, &src);
    if (!w || w == D3DX_DEFAULT) w = img.w;
    if (!h || h == D3DX_DEFAULT) h = img.h;
    if (fmt == D3DFMT_UNKNOWN || fmt == (D3DFORMAT)D3DX_DEFAULT) fmt = src.Format;
    IDirect3DTexture8* t;
    HRESULT r = D3DXCreateTexture(dev, w, h, levels, usage, fmt, pool, &t);
    if (r) return r;
    IDirect3DSurface8* s;
    t->GetSurfaceLevel(0, &s);
    r = blit(s, nullptr, img.bgra.data(), img.w, img.h, img.w * 4, nullptr, filter, colorKey);
    s->Release();
    if (r) {
        t->Release();
        return r;
    }
    if (info) *info = src;
    *out = t;
    return D3D_OK;
}

HRESULT D3DXLoadSurfaceFromFileInMemory(IDirect3DSurface8* dst, const PALETTEENTRY*, const RECT* dstRect,
                                        const void* data, UINT size, const RECT* srcRect, DWORD filter,
                                        D3DCOLOR colorKey, D3DXIMAGE_INFO* info) {
    Image img;
    if (!data || !decode(data, size, &img)) return D3DERR_INVALIDCALL;
    fillInfo(img, data, size, info);
    return blit(dst, dstRect, img.bgra.data(), img.w, img.h, img.w * 4, srcRect, filter, colorKey);
}

HRESULT D3DXLoadSurfaceFromSurface(IDirect3DSurface8* dst, const PALETTEENTRY*, const RECT* dstRect,
                                   IDirect3DSurface8* src, const PALETTEENTRY*, const RECT* srcRect, DWORD filter,
                                   D3DCOLOR colorKey) {
    std::vector<uint8_t> bgra;
    if (!src || !src->read(bgra)) return D3DERR_INVALIDCALL;
    if (src->fmt == D3DFMT_X8R8G8B8)
        for (size_t i = 3; i < bgra.size(); i += 4) bgra[i] = 255;
    return blit(dst, dstRect, bgra.data(), src->w, src->h, src->w * 4, srcRect, filter, colorKey);
}

HRESULT D3DXLoadSurfaceFromMemory(IDirect3DSurface8* dst, const PALETTEENTRY*, const RECT* dstRect, const void* src,
                                  D3DFORMAT srcFmt, UINT srcPitch, const PALETTEENTRY*, const RECT* srcRect,
                                  DWORD filter, D3DCOLOR colorKey) {
    if (!src || !srcRect || (srcFmt != D3DFMT_A8R8G8B8 && srcFmt != D3DFMT_X8R8G8B8)) return D3DERR_INVALIDCALL;
    // srcRect is in the source's own coordinates; treat the memory as exactly that rect's bounding image
    int sw = srcRect->right, sh = srcRect->bottom;
    const uint8_t* p = (const uint8_t*)src;
    if (srcFmt == D3DFMT_A8R8G8B8) return blit(dst, dstRect, p, sw, sh, srcPitch, srcRect, filter, colorKey);
    std::vector<uint8_t> opaque((size_t)sh * srcPitch);
    memcpy(opaque.data(), p, opaque.size());
    for (int y = 0; y < sh; y++)
        for (int x = 0; x < sw; x++) opaque[(size_t)y * srcPitch + x * 4 + 3] = 255;
    return blit(dst, dstRect, opaque.data(), sw, sh, srcPitch, srcRect, filter, colorKey);
}

D3DMATRIX* D3DXMatrixIdentity(D3DMATRIX* out) {
    *out = D3DMATRIX{};
    for (int i = 0; i < 4; i++) out->m[i][i] = 1;
    return out;
}

D3DMATRIX* D3DXMatrixMultiply(D3DMATRIX* out, const D3DMATRIX* a, const D3DMATRIX* b) {
    D3DMATRIX r;
    for (int i = 0; i < 4; i++)
        for (int j = 0; j < 4; j++)
            r.m[i][j] = a->m[i][0] * b->m[0][j] + a->m[i][1] * b->m[1][j] + a->m[i][2] * b->m[2][j] +
                        a->m[i][3] * b->m[3][j];
    *out = r;
    return out;
}

// @yo2 0x00b42a44 D3DXMatrixOrthoLH (constants 2.0 and 1.0 read from 0x00bfea4c / 0x00bfea18)
D3DMATRIX* D3DXMatrixOrthoLH(D3DMATRIX* out, float w, float h, float zn, float zf) {
    *out = D3DMATRIX{};
    out->m[0][0] = 2.0f / w;
    out->m[1][1] = 2.0f / h;
    out->m[2][2] = 1.0f / (zf - zn);
    out->m[3][2] = -zn / (zf - zn);
    out->m[3][3] = 1.0f;
    return out;
}
