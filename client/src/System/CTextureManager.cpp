#include "CTextureManager.h"

#include <cmath>
#include <vector>

#include "yo2Debug.h"
#include "yo2File.h"

// @yo2 0x0059b3e0 static init: g_texMgr = new CD3DTextureManager
// @yo2 0x0059b490 static init: empty
// @yo2 0x0059b4b0 static init: atexit
// @yo2 0x0059d880 CD3DTextureManager::CD3DTextureManager
CD3DTextureManager* g_texMgr = new CD3DTextureManager;

namespace {
UINT pow2(UINT n) {
    UINT p = 1;
    while (p < n)
        p <<= 1;
    return p;
}
}  // namespace

// @yo2 0x0059b020 TexInfo::TexInfo
TexInfo::TexInfo() : name("") {}

// @yo2 0x0059b1b0 TexInfo::reset (keeps the textures; the cache releases them)
void TexInfo::reset() {
    refs = 0;
    partCount = cols = rows = 0;
    ready = false;
    for (TexPart& p : parts) {
        p.loaded = false;
        p.tex = nullptr;
        p.unk48 = 0;
        p.managed = false;
    }
}

// @yo2 0x0059b110 TexInfo::partAt: the part whose rect holds image point (x, y)
TexPart* TexInfo::partAt(int32_t x, int32_t y) {
    for (int32_t i = 0; i < partCount; ++i) {
        const float* r = parts[i].rect;
        if (r[0] <= x && r[1] <= y && x <= r[2] + r[0] && y <= r[3] + r[1])
            return &parts[i];
    }
    return nullptr;
}

// @yo2 0x0059b1f0 TexInfo::clipToPart: intersect image rect (x, y, w, h) with a part. out = the rect in the part's
// own pixels, (dx, dy) = its top-left in image pixels
bool TexInfo::clipToPart(int32_t part, int32_t x, int32_t y, int32_t w, int32_t h, int32_t out[4], int32_t* dx,
                         int32_t* dy) const {
    if (part >= partCount || part < 0)
        return false;
    const float* r = parts[part].rect;
    if (x + w < r[0] || r[2] + r[0] < x || y + h < r[1] || r[3] + r[1] < y)
        return false;
    int32_t left = static_cast<int32_t>(x - r[0]);
    int32_t top = static_cast<int32_t>(y - r[1]);
    int32_t right = left + w, bottom = top + h;
    if (left < 0)
        left = 0;
    if (top < 0)
        top = 0;
    if (r[2] < right)
        right = static_cast<int32_t>(r[2]);
    if (r[3] < bottom)
        bottom = static_cast<int32_t>(r[3]);
    out[0] = left;
    out[1] = top;
    out[2] = right - left;
    out[3] = bottom - top;
    *dx = static_cast<int32_t>(left + r[0]);
    *dy = static_cast<int32_t>(top + r[1]);
    return true;
}

// @yo2 0x0059db10 CD3DTextureManager::~CD3DTextureManager
// @yo2 0x0059dae0 CD3DTextureManager deleting destructor
CD3DTextureManager::~CD3DTextureManager() { clear(); }

// @yo2 0x0059dcc0 CD3DTextureManager::clear
// @yo2 0x0059fd90 map<string, TexInfo>::iterator::operator++
void CD3DTextureManager::clear() {
    for (auto& [name, info] : cache_)
        for (int32_t i = 0; i < info.partCount; ++i)
            if (info.parts[i].tex)
                info.parts[i].tex->Release();
    cache_.clear();
}

// @yo2 0x0059ce00 CD3DTextureManager::checkRequirements: power of two, then what the device accepts
void CD3DTextureManager::checkRequirements(UINT* w, UINT* h) {
    *w = pow2(*w);
    *h = pow2(*h);
    UINT levels = 0;
    D3DFORMAT fmt = D3DFMT_A8R8G8B8;
    HRESULT hr = D3DXCheckTextureRequirements(g_d3d->device(), w, h, &levels, 0, &fmt, D3DPOOL_MANAGED);
    YO2_ASSERT(hr == D3D_OK, "error D3DXCheckTextureRequirements [%X]", hr);
}

// @yo2 0x0059de80 CD3DTextureManager::LoadTexture (the load itself): one texture if the power-of-two size is
// accepted as is, otherwise a grid of square tiles cut from an image surface
bool CD3DTextureManager::loadImage(TexInfo& info, D3DPOOL pool) {
    std::vector<uint8_t> data;
    bool found = yo2LoadFile(info.name.c_str(), data);
    YO2_ASSERT(found, "%s", info.name.c_str());
    IDirect3DDevice8* dev = g_d3d->device();
    HRESULT hr = D3DXGetImageInfoFromFileInMemory(data.data(), static_cast<UINT>(data.size()), &info.image);
    YO2_ASSERT(hr == D3D_OK, "error D3DXGetImageInfoFromFileInMemory [%X]\n%s\n", hr, info.name.c_str());
    UINT tw = pow2(info.image.Width), th = pow2(info.image.Height);
    D3DCAPS8 caps{};
    dev->GetDeviceCaps(&caps);
    UINT maxTex = caps.MaxTextureWidth < caps.MaxTextureHeight ? caps.MaxTextureWidth : caps.MaxTextureHeight;
    UINT rw = tw, rh = th, levels = 1;
    D3DFORMAT fmt = D3DFMT_A8R8G8B8;
    D3DXCheckTextureRequirements(dev, &rw, &rh, &levels, 0, &fmt, pool);
    if (rw == tw && rh == th) {
        TexPart& p = info.parts[0];
        hr = D3DXCreateTextureFromFileInMemoryEx(dev, data.data(), static_cast<UINT>(data.size()), tw, th, 1, 0,
                                                 D3DFMT_A8R8G8B8, pool, D3DX_FILTER_NONE, D3DX_FILTER_NONE, 0,
                                                 &info.image, nullptr, &p.tex);
        YO2_ASSERT(hr == D3D_OK, "error D3DXCreateTextureFromFileInMemoryEx [%X]\n%s\n%s(%d,%d)", hr, "",
                   info.name.c_str(), tw, th);
        info.setGrid(1, 1);
        p.setRect(0, 0, static_cast<float>(tw), static_cast<float>(th));
        p.setUV(0, 0, 1, 1);
        p.loaded = true;
        p.managed = pool == D3DPOOL_MANAGED;
        p.tex->GetLevelDesc(0, &info.desc);
        p.desc = info.desc;
        return true;
    }
    UINT tile = tw < th ? tw : th;
    if (maxTex <= tile)
        tile = maxTex;
    int32_t cols = static_cast<int32_t>(std::ceil(double(info.image.Width) / tile));
    int32_t rows = static_cast<int32_t>(std::ceil(double(info.image.Height) / tile));
    info.setGrid(cols, rows);
    IDirect3DSurface8* image = nullptr;
    hr = dev->CreateImageSurface(info.image.Width, info.image.Height, D3DFMT_A8R8G8B8, &image);
    YO2_ASSERT(hr == D3D_OK, "error CreateOffscreenPlainSurface [%X]\n%s\n", hr, "");
    hr = D3DXLoadSurfaceFromFileInMemory(image, nullptr, nullptr, data.data(), static_cast<UINT>(data.size()),
                                         nullptr, D3DX_FILTER_NONE, 0, nullptr);
    YO2_ASSERT(hr == D3D_OK, "error D3DXLoadSurfaceFromFileInMemory [%X]\n%s\n", hr, "");
    YO2_ASSERT(cols * rows <= TexInfo::MAX_PARTS,
               "テクスチャの作成に失敗 テクスチャ分割数が上限を超えました。 CD3DTextureManager::LoadTexture");
    for (int32_t i = 0; i < info.partCount; ++i) {
        TexPart& p = info.parts[i];
        hr = dev->CreateTexture(tile, tile, 1, 0, D3DFMT_A8R8G8B8, pool, &p.tex);
        YO2_ASSERT(hr == D3D_OK, "error CreateTexturee [%X]\n%s\n", hr, "");
        p.tex->GetLevelDesc(0, &p.desc);
        p.managed = pool == D3DPOOL_MANAGED;
        p.loaded = true;
    }
    info.desc = info.parts[0].desc;
    for (int32_t r = 0; r < rows; ++r)
        for (int32_t c = 0; c < cols; ++c) {
            TexPart& p = info.parts[r * cols + c];
            RECT src{static_cast<int32_t>(c * tile), static_cast<int32_t>(r * tile), 0, 0};
            src.right = src.left + static_cast<int32_t>(tile);
            src.bottom = src.top + static_cast<int32_t>(tile);
            if (src.right > static_cast<int32_t>(info.image.Width))
                src.right = info.image.Width;
            if (src.bottom > static_cast<int32_t>(info.image.Height))
                src.bottom = info.image.Height;
            IDirect3DSurface8* level = nullptr;
            hr = p.tex->GetSurfaceLevel(0, &level);
            YO2_ASSERT(hr == D3D_OK, "テクスチャ作成に失敗　GetSurfaceLevel　CD3DTextureManager::LoadTexture");
            RECT dst{0, 0, src.right - src.left, src.bottom - src.top};
            hr = D3DXLoadSurfaceFromSurface(level, nullptr, &dst, image, nullptr, &src, D3DX_FILTER_NONE, 0);
            level->Release();
            YO2_ASSERT(hr == D3D_OK,
                       "テクスチャ作成に失敗　D3DXLoadSurfaceFromSurface　CD3DTextureManager::LoadTexture");
            // the rect keeps the full tile size: sprites divide by it to get UVs
            p.setRect(static_cast<float>(src.left), static_cast<float>(src.top), float(tile), float(tile));
            p.setUV(0, 0, float(dst.right) / tile, float(dst.bottom) / tile);
        }
    image->Release();
    return true;
}

// @yo2 0x0059b550 CD3DTextureManager::LoadTexture: share a cached image, or load it with one reference
// @yo2 0x0059fae0 map<string, TexInfo>::find
// @yo2 0x0059fbc0 map<string, TexInfo>::insert
// ponytail: async requests (the exe's 128 loader threads) load synchronously
bool CD3DTextureManager::load(const vc6::string& name, TexInfo* out, bool, D3DPOOL pool) {
    if (name.empty())
        return false;
    auto it = cache_.find(std::string(name));
    if (it == cache_.end()) {
        TexInfo& info = cache_[std::string(name)];
        info.name = name;
        info.refs = 1;
        loadImage(info, pool);
        info.ready = true;
        *out = info;
        return true;
    }
    ++it->second.refs;
    *out = it->second;
    return true;
}

// @yo2 0x0059bb10 CD3DTextureManager::CreateTexture: a blank w x h (rounded up to powers of two) texture
bool CD3DTextureManager::create(const vc6::string& name, UINT w, UINT h, TexInfo* out) {
    if (!g_d3d) {
        yo2Trace("CD3DDeviceの初期化前にテクスチャを作ろうとしました。\n");  // texture before the device
        return false;
    }
    if (name.empty() || cache_.count(std::string(name)))
        return false;
    TexInfo& info = cache_[std::string(name)];
    info.name = name;
    UINT tw = w, th = h;
    checkRequirements(&tw, &th);
    TexPart& p = info.parts[0];
    HRESULT hr = g_d3d->device()->CreateTexture(tw, th, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &p.tex);
    YO2_ASSERT(hr == D3D_OK, "error CreateTexture [%X]", hr);
    info.image.Width = w;
    info.image.Height = h;
    info.setGrid(1, 1);
    p.setRect(0, 0, static_cast<float>(tw), static_cast<float>(th));
    p.setUV(0, 0, 1, 1);
    p.loaded = true;
    p.managed = true;
    p.tex->GetLevelDesc(0, &info.desc);
    p.desc = info.desc;
    info.ready = true;
    info.refs = 1;
    *out = info;
    return true;
}

// @yo2 0x0059c1f0 CD3DTextureManager::ReleaseTexture: drop a reference, free the textures with the last one
// @yo2 0x0059f4f0 map<string, TexInfo>::erase
void CD3DTextureManager::release(const vc6::string& name) {
    auto it = cache_.find(std::string(name));
    if (it == cache_.end() || --it->second.refs != 0)
        return;
    TexInfo& info = it->second;
    YO2_ASSERT(info.ready, "error ReleaseTexture(%s)", name.c_str());
    for (int32_t i = 0; i < info.partCount; ++i)
        if (info.parts[i].tex) {
            info.parts[i].tex->Release();
            info.parts[i].tex = nullptr;
        }
    cache_.erase(it);
}

// @yo2 0x0059c3f0 CD3DTextureManager::GetTextureInfo
bool CD3DTextureManager::info(const vc6::string& name, TexInfo* out) const {
    auto it = cache_.find(std::string(name));
    if (it == cache_.end())
        return false;
    *out = it->second;
    return true;
}

// @yo2 0x0059c650 CD3DTextureManager::isReady
bool CD3DTextureManager::ready(const vc6::string& name) const {
    auto it = cache_.find(std::string(name));
    return it != cache_.end() && it->second.ready;
}

// @yo2 0x0059d700 CD3DTextureManager::debugPrint: every cached texture to the debug trace
void CD3DTextureManager::debugPrint() const {
    yo2Trace("----texture debug print----\n");
    for (const auto& [name, info] : cache_)
        yo2Trace("ファイル名=%s, ref=%d, width=%d, height=%d\n", name.c_str(), info.refs, info.image.Width,
                 info.image.Height);
}

// @yo2 0x0059d780 CD3DTextureManager::memoryUsage: bytes of every ready part (32 bpp)
uint32_t CD3DTextureManager::memoryUsage() const {
    uint32_t n = 0;
    for (const auto& [name, info] : cache_)
        if (info.ready)
            for (int32_t i = 0; i < info.partCount; ++i)
                n += info.parts[i].desc.Width * info.parts[i].desc.Height * 4;
    return n;
}

// The exe reads PNGs with libpng 1.2.10; stb_image decodes the same files.
#if defined(__GNUC__) || defined(__clang__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#pragma GCC diagnostic ignored "-Wsign-compare"
#pragma GCC diagnostic ignored "-Wunused-parameter"
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#pragma GCC diagnostic ignored "-Wimplicit-fallthrough"
#endif
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_NO_STDIO
#include "third_party/stb_image.h"
#if defined(__GNUC__) || defined(__clang__)
#pragma GCC diagnostic pop
#endif

// @yo2 0x0059cfd0 yo2DecodePng: any PNG (grey, palette, 16-bit and tRNS expanded, opaque when it has no alpha)
// as A8R8G8B8 rows `pitch` bytes apart.
// ponytail: libpng also applied the file's gAMA/sRGB gamma for a 2.2 display; stb leaves the samples as stored.
bool yo2DecodePng(uint32_t* out, int32_t pitch, const void* data, size_t size) {
    int w, h, n;
    stbi_uc* rgba = stbi_load_from_memory(static_cast<const stbi_uc*>(data), static_cast<int>(size), &w, &h, &n, 4);
    YO2_ASSERT(rgba, "PNGではない");
    if (!rgba)
        return false;
    for (int y = 0; y < h; ++y) {
        auto* row = reinterpret_cast<uint32_t*>(reinterpret_cast<uint8_t*>(out) + size_t(y) * pitch);
        const stbi_uc* p = rgba + size_t(y) * w * 4;
        for (int x = 0; x < w; ++x, p += 4)
            row[x] = uint32_t(p[3]) << 24 | uint32_t(p[0]) << 16 | uint32_t(p[1]) << 8 | p[2];
    }
    stbi_image_free(rgba);
    return true;
}
