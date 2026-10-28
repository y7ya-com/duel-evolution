#include "CD3DSprite.h"

#include <cstring>

namespace {
D3DMATRIX identity() {  // (assigned: the real D3DMATRIX is a union, the stand-in a plain array)
    D3DMATRIX m{};
    m.m[0][0] = m.m[1][1] = m.m[2][2] = m.m[3][3] = 1;
    return m;
}
const D3DMATRIX kIdentity = identity();
}

// @yo2 0x005880b0 CD3DSpriteBasic::CD3DSpriteBasic: a unit quad, white, UVs 0..1
CD3DSpriteBasic::CD3DSpriteBasic()
    : v_{{0, 0, 0, 0xffffffff, 0, 0}, {1, 0, 0, 0xffffffff, 1, 0}, {0, 1, 0, 0xffffffff, 0, 1},
         {1, 1, 0, 0xffffffff, 1, 1}} {}

// @yo2 0x00588140 CD3DSpriteBasic::setColor
void CD3DSpriteBasic::setColor(D3DCOLOR c) {
    for (SpriteVertex& v : v_)
        v.color = c;
}

// @yo2 0x00587ff0 CD3DSpriteTransformed::CD3DSpriteTransformed
CD3DSpriteTransformed::CD3DSpriteTransformed()
    : v_{{0, 0, 0, 1, 0xffffffff, 0, 0}, {1, 0, 0, 1, 0xffffffff, 1, 0}, {0, 1, 0, 1, 0xffffffff, 0, 1},
         {1, 1, 0, 1, 0xffffffff, 1, 1}} {}

// @yo2 0x00588080 CD3DSpriteTransformed::setColor
void CD3DSpriteTransformed::setColor(D3DCOLOR c) {
    for (SpriteVertexRHW& v : v_)
        v.color = c;
}

// The address of image pixel (x, y) in its part's texture (locked read-only, then unlocked; managed textures
// keep the bits). Null when the part isn't a loaded texture.
uint8_t* lockedPixel(const TexInfo& constInfo, int32_t x, int32_t y, int32_t bytesPerPixel) {
    TexInfo& info = const_cast<TexInfo&>(constInfo);
    TexPart* p = info.partAt(x, y);
    if (!p || !p->loaded)
        return nullptr;
    D3DLOCKED_RECT lr;
    if (p->tex->LockRect(0, &lr, nullptr, 0x10 /* D3DLOCK_READONLY */) < 0)
        return nullptr;
    uint8_t* at = static_cast<uint8_t*>(lr.pBits) + static_cast<int32_t>(y - p->rect[1]) * lr.Pitch +
                  static_cast<int32_t>(x - p->rect[0]) * bytesPerPixel;
    p->tex->UnlockRect(0);
    return at;
}

// @yo2 0x00588b80 CD3DSprite::CD3DSprite
CD3DSprite::CD3DSprite() = default;

// @yo2 0x00588cd0 CD3DSprite::~CD3DSprite
// @yo2 0x00588ca0 CD3DSprite deleting destructor
CD3DSprite::~CD3DSprite() = default;

// @yo2 0x00588dd0 CD3DSprite::setTexture: a new image resets both rects to the whole image
void CD3DSprite::setTexture(const char* name) {
    if (std::strcmp(name, tex_.name().c_str()) == 0)
        return;
    tex_.set(name);
    imgW_ = tex_.width();
    imgH_ = tex_.height();
    texW_ = tex_.texWidth();
    texH_ = tex_.texHeight();
    int32_t w = static_cast<int32_t>(imgW_), h = static_cast<int32_t>(imgH_);
    setSource(0, 0, w, h);
    setDest(0, 0, w, h);
}

// @yo2 0x00588ec0 CD3DSprite::createTexture
void CD3DSprite::createTexture(const char* name, UINT w, UINT h) { tex_.create(name, w, h); }

// @yo2 0x00588ef0 CD3DSprite::draw: one strip per texture part the source rect touches
void CD3DSprite::draw(const D3DMATRIX* world) {
    IDirect3DDevice8* dev = g_d3d->device();
    dev->SetTransform(D3DTS_WORLD, world);
    dev->SetVertexShader(0x142);
    const TexInfo* info = tex_.info();
    if (!info)
        return;
    for (int32_t i = 0; i < info->partCount; ++i) {
        int32_t r[4], ix, iy;
        if (!info->clipToPart(i, src_[0], src_[1], src_[2], src_[3], r, &ix, &iy))
            continue;
        const TexPart& p = info->parts[i];
        float pw = p.rect[2], ph = p.rect[3];
        float u0 = r[0] / pw, u1 = (r[2] + r[0]) / pw;
        float v0 = r[1] / ph, v1 = (r[3] + r[1]) / ph;
        if (world->m[0][0] < 0) {  // mirrored: sample one texel to the left
            u0 = (r[0] - 1) / pw;
            u1 = (r[2] + r[0] - 1) / pw;
        }
        float x = static_cast<float>(dst_[0] - src_[0] + ix), y = static_cast<float>(dst_[1] - src_[1] + iy);
        v_[0].x = x, v_[0].y = y, v_[0].u = u0, v_[0].v = v0;
        v_[1].x = r[2] + x, v_[1].y = y, v_[1].u = u1, v_[1].v = v0;
        v_[2].x = x, v_[2].y = y + r[3], v_[2].u = u0, v_[2].v = v1;
        v_[3].x = r[2] + x, v_[3].y = y + r[3], v_[3].u = u1, v_[3].v = v1;
        dev->SetTexture(0, p.tex);
        dev->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP, 2, v_, sizeof(SpriteVertex));
    }
}

// @yo2 0x005891a0 CD3DSprite::draw(x, y)
void CD3DSprite::draw(float x, float y) {
    dst_[0] = static_cast<int32_t>(x);
    dst_[1] = static_cast<int32_t>(y);
    draw(&kIdentity);
}

// @yo2 0x00589290 CD3DSprite::draw(x, y, w, h)
void CD3DSprite::draw(float x, float y, float w, float h) {
    setDest(static_cast<int32_t>(x), static_cast<int32_t>(y), static_cast<int32_t>(w), static_cast<int32_t>(h));
    draw(&kIdentity);
}

// @yo2 0x005893a0 CD3DSprite::draw(dest rect, source rect)
void CD3DSprite::draw(float x, float y, float w, float h, float sx, float sy, float sw, float sh) {
    setDest(static_cast<int32_t>(x), static_cast<int32_t>(y), static_cast<int32_t>(w), static_cast<int32_t>(h));
    setSource(static_cast<int32_t>(sx), static_cast<int32_t>(sy), static_cast<int32_t>(sw),
              static_cast<int32_t>(sh));
    draw(&kIdentity);
}

// @yo2 0x005894e0 CD3DSprite::draw(world, size, source rect)
void CD3DSprite::draw(const D3DMATRIX* world, float w, float h, float sx, float sy, float sw, float sh) {
    setDest(0, 0, static_cast<int32_t>(w), static_cast<int32_t>(h));
    setSource(static_cast<int32_t>(sx), static_cast<int32_t>(sy), static_cast<int32_t>(sw),
              static_cast<int32_t>(sh));
    draw(world);
}

// @yo2 0x00589570 CD3DSprite::textureFormat
D3DFORMAT CD3DSprite::textureFormat() const { return tex_.info()->desc.Format; }

// @yo2 0x00589590 CD3DSprite::pixelPtr
uint8_t* CD3DSprite::pixelPtr(int32_t x, int32_t y, int32_t bytesPerPixel) {
    if (x < 0 || x > texW_ || y < 0 || y > texH_)
        return nullptr;
    const TexInfo* info = tex_.info();
    if (!info || !info->ready)
        return nullptr;
    return lockedPixel(*info, x, y, bytesPerPixel);
}

struct CD3DSprite::Layout {
    YO2_AT(CD3DSprite, dst_, 0x04);
    YO2_AT(CD3DSprite, src_, 0x14);
    YO2_AT(CD3DSprite, v_, 0x24);
    YO2_AT(CD3DSprite, tex_, 0x84);
    YO2_AT(CD3DSprite, imgW_, 0x4d0c);
    YO2_AT(CD3DSprite, texW_, 0x4d14);
};

// @yo2 0x00588170 CD3DSpriteTrans::CD3DSpriteTrans (default)
// @yo2 0x00588420 CD3DSpriteTrans::~CD3DSpriteTrans
// @yo2 0x005883f0 CD3DSpriteTrans deleting destructor
CD3DSpriteTrans::~CD3DSpriteTrans() = default;

// @yo2 0x00588500 CD3DSpriteTrans::setTexture
void CD3DSpriteTrans::setTexture(const char* name) {
    if (std::strcmp(name, tex_.name().c_str()) == 0)
        return;
    tex_.set(name);
    imgW_ = tex_.width();
    imgH_ = tex_.height();
    texW_ = tex_.texWidth();
    texH_ = tex_.texHeight();
    resetRects();
}

// @yo2 0x005885f0 CD3DSpriteTrans::resetRects: both rects = the whole image
void CD3DSpriteTrans::resetRects() {
    int32_t w = static_cast<int32_t>(imgW_), h = static_cast<int32_t>(imgH_);
    setSource(0, 0, w, h);
    setDest(0, 0, w, h);
}

// @yo2 0x00588a50 CD3DSpriteTrans::pixelPtr
uint8_t* CD3DSpriteTrans::pixelPtr(int32_t x, int32_t y, int32_t bytesPerPixel) {
    if (x < 0 || x > texW_ || y < 0 || y > texH_)
        return nullptr;
    const TexInfo* info = tex_.info();
    if (!info || !info->ready)
        return nullptr;
    return lockedPixel(*info, x, y, bytesPerPixel);
}

struct CD3DSpriteTrans::Layout {
    YO2_AT(CD3DSpriteTrans, v_, 0x24);
    YO2_AT(CD3DSpriteTrans, tex_, 0x94);
    YO2_AT(CD3DSpriteTrans, imgW_, 0x4d1c);
};
