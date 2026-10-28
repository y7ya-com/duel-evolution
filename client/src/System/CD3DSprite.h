// The game's 2D quads. A sprite has a destination rect and a source rect (texture pixels); CD3DSprite draws its
// OneTexture part by part (a big image is several tiles) as XYZ|DIFFUSE|TEX1 triangle strips under a world matrix.
// The *Transformed / *Trans variants keep pre-transformed (XYZRHW) vertices; nothing in the exe draws them.
#pragma once
#include "CTextureManager.h"

struct SpriteVertex {  // FVF 0x142: XYZ | DIFFUSE | TEX1
    float x, y, z;
    D3DCOLOR color;
    float u, v;
};
struct SpriteVertexRHW {  // XYZRHW | DIFFUSE | TEX1
    float x, y, z, rhw;
    D3DCOLOR color;
    float u, v;
};

class CD3DSpriteBase {
public:
    // @yo2 0x00587fb0 CD3DSpriteBase::CD3DSpriteBase
    CD3DSpriteBase() = default;
    virtual void setColor(D3DCOLOR c) = 0;
    void setDest(int32_t x, int32_t y, int32_t w, int32_t h) { dst_[0] = x, dst_[1] = y, dst_[2] = w, dst_[3] = h; }
    void setSource(int32_t x, int32_t y, int32_t w, int32_t h) { src_[0] = x, src_[1] = y, src_[2] = w, src_[3] = h; }
    const int32_t* dest() const { return dst_; }
    const int32_t* source() const { return src_; }

protected:
    int32_t dst_[4] = {0, 0, 1, 1};  // 0x04 x, y, w, h
    int32_t src_[4] = {0, 0, 1, 1};  // 0x14
};

class CD3DSpriteBasic : public CD3DSpriteBase {
public:
    CD3DSpriteBasic();
    void setColor(D3DCOLOR c) override;
    const SpriteVertex* vertices() const { return v_; }

protected:
    SpriteVertex v_[4];  // 0x24 top-left, top-right, bottom-left, bottom-right
};

class CD3DSpriteTransformed : public CD3DSpriteBase {
public:
    CD3DSpriteTransformed();
    void setColor(D3DCOLOR c) override;

protected:
    SpriteVertexRHW v_[4];  // 0x24
};

class CD3DSprite : public CD3DSpriteBasic {
public:
    CD3DSprite();
    virtual ~CD3DSprite();
    void setTexture(const char* name);
    void createTexture(const char* name, UINT w, UINT h);
    void draw(const D3DMATRIX* world);
    void draw(float x, float y);
    void draw(float x, float y, float w, float h);
    void draw(float x, float y, float w, float h, float sx, float sy, float sw, float sh);
    void draw(const D3DMATRIX* world, float w, float h, float sx, float sy, float sw, float sh);
    D3DFORMAT textureFormat() const;
    uint8_t* pixelPtr(int32_t x, int32_t y, int32_t bytesPerPixel);
    OneTexture& texture() { return tex_; }
    float imageWidth() const { return imgW_; }
    float imageHeight() const { return imgH_; }

private:
    OneTexture tex_;              // 0x0084
    float imgW_ = 0, imgH_ = 0;   // 0x4d0c
    float texW_ = 0, texH_ = 0;   // 0x4d14
    struct Layout;
};
YO2_SIZEOF(CD3DSprite, 0x4d1c);

class CD3DSpriteTrans : public CD3DSpriteTransformed {
public:
    CD3DSpriteTrans() = default;
    virtual ~CD3DSpriteTrans();
    void setTexture(const char* name);
    void resetRects();
    uint8_t* pixelPtr(int32_t x, int32_t y, int32_t bytesPerPixel);

private:
    OneTexture tex_;              // 0x0094
    float imgW_ = 0, imgH_ = 0;   // 0x4d1c
    float texW_ = 0, texH_ = 0;   // 0x4d24
    struct Layout;
};
YO2_SIZEOF(CD3DSpriteTrans, 0x4d2c);

uint8_t* lockedPixel(const TexInfo& info, int32_t x, int32_t y, int32_t bytesPerPixel);
