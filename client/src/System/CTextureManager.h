// CTextureManager.cpp / COneTexture.cpp: images become D3D textures, shared by name with a reference count.
// An image that fits one power-of-two texture is one part; a bigger one is cut into a grid of square tiles (at most
// 256 parts), each its own texture. TexInfo is the per-image record; OneTexture is what a sprite holds.
#pragma once
#include <map>
#include <string>

#include "CD3DDevice.h"
#include <d3dx8.h>
#include "vc6.h"

// One tile. `rect` is where it sits in the image, `uv` the used corner of its texture.
struct TexPart {
    IDirect3DTexture8* tex;   // 0x00
    D3DSURFACE_DESC desc;     // 0x04 level 0
    float rect[4];            // 0x24 x, y, w, h (image pixels)
    float uv[4];              // 0x34 u0, v0, u1, v1
    bool loaded;              // 0x44
    bool managed;             // 0x45 D3DPOOL_MANAGED (survives a device reset)
    int32_t unk48;            // 0x48

    // @yo2 0x0059af80 TexPart::TexPart
    TexPart() : tex(nullptr), desc{}, rect{}, uv{0, 0, 1, 1}, loaded(false), managed(false), unk48(0) {}
    // @yo2 0x0059afc0 TexPart::setRect
    void setRect(float x, float y, float w, float h) {
        rect[0] = x, rect[1] = y, rect[2] = w, rect[3] = h;
    }
    // @yo2 0x0059aff0 TexPart::setUV
    void setUV(float u0, float v0, float u1, float v1) {
        uv[0] = u0, uv[1] = v0, uv[2] = u1, uv[3] = v1;
    }
};
YO2_SIZEOF(TexPart, 0x4c);

struct TexInfo {
    enum { MAX_PARTS = 256 };
    vc6::string name;         // 0x00
    int32_t refs = 0;         // 0x10 sprites using it (in the cache's copy)
    D3DXIMAGE_INFO image{};   // 0x14 the source image
    D3DSURFACE_DESC desc{};   // 0x30 part 0's texture
    int32_t partCount = 0;    // 0x50
    int32_t cols = 0;         // 0x54
    int32_t rows = 0;         // 0x58
    bool ready = false;       // 0x5c loaded (the exe's loader thread sets it)
    TexPart parts[MAX_PARTS]; // 0x60

    TexInfo();
    void reset();
    // @yo2 0x0059b0e0 TexInfo::setGrid
    void setGrid(int32_t c, int32_t r) {
        cols = c;
        rows = r;
        partCount = c * r;
    }
    TexPart* partAt(int32_t x, int32_t y);
    bool clipToPart(int32_t part, int32_t x, int32_t y, int32_t w, int32_t h, int32_t out[4], int32_t* dx,
                    int32_t* dy) const;
};
YO2_SIZEOF(TexInfo, 0x4c60);

class CD3DTextureManager {
public:
    CD3DTextureManager() = default;
    virtual ~CD3DTextureManager();

    bool load(const vc6::string& name, TexInfo* out, bool async, D3DPOOL pool);
    bool create(const vc6::string& name, UINT w, UINT h, TexInfo* out);
    void release(const vc6::string& name);
    bool info(const vc6::string& name, TexInfo* out) const;
    bool ready(const vc6::string& name) const;
    void clear();
    uint32_t memoryUsage() const;
    void debugPrint() const;
    // @yo2 0x0059d840 CD3DTextureManager::onDeviceLost (managed textures: nothing to release)
    void onDeviceLost() {}
    // @yo2 0x0059d860 CD3DTextureManager::onDeviceReset (nothing to re-create)
    void onDeviceReset() {}
    static void checkRequirements(UINT* w, UINT* h);

private:
    bool loadImage(TexInfo& info, D3DPOOL pool);
    // ponytail: the exe keeps a VC6 map<string, TexInfo> and 128 loader-thread slots in 0x1418 bytes; here a
    // std::map and synchronous loads (async requests load at once), since only methods touch it.
    std::map<std::string, TexInfo> cache_;
};

extern CD3DTextureManager* g_texMgr;  // DAT_0126f99c

class OneTexture {
public:
    // constructed inside the sprites (0x588170 etc.)
    OneTexture() = default;
    virtual ~OneTexture();
    void set(const char* name);
    void create(const char* name, UINT w, UINT h);
    void unload();
    // @yo2 0x0059aa00 OneTexture::info
    const TexInfo* info() const { return loaded_ ? &info_ : nullptr; }
    IDirect3DSurface8* partSurface(int32_t part, UINT level);
    float width() const { return width_; }
    float height() const { return height_; }
    float texWidth() const { return texW_; }
    float texHeight() const { return texH_; }
    bool loaded() const { return loaded_; }
    const vc6::string& name() const { return name_; }

private:
    vc6::string name_;       // 0x0004
    float width_ = 0;        // 0x0014 image size
    float height_ = 0;       // 0x0018
    float texW_ = 0;         // 0x001c part 0's texture size
    float texH_ = 0;         // 0x0020
    TexInfo info_;           // 0x0024
    bool loaded_ = false;    // 0x4c84
    bool fromFile_ = true;   // 0x4c85
    void adopt();
    struct Layout;
};
YO2_SIZEOF(OneTexture, 0x4c88);
