#include "CTextureManager.h"
#include "yo2Debug.h"

// @yo2 0x005882d0 OneTexture::~OneTexture
// @yo2 0x005882a0 OneTexture deleting destructor
OneTexture::~OneTexture() { unload(); }

// @yo2 0x0059a880 OneTexture::unload: give the image back to the manager
void OneTexture::unload() {
    if (!loaded_)
        return;
    g_texMgr->release(name_);
    loaded_ = false;
    name_ = "";
}

void OneTexture::adopt() {
    loaded_ = true;
    fromFile_ = true;
    width_ = static_cast<float>(info_.image.Width);
    height_ = static_cast<float>(info_.image.Height);
    texW_ = static_cast<float>(info_.desc.Width);
    texH_ = static_cast<float>(info_.desc.Height);
}

// @yo2 0x0059ac20 OneTexture::set: load (or share) the image `name`
void OneTexture::set(const char* name) {
    if (!name || !*name)
        return;
    unload();
    name_ = name;
    if (g_texMgr->load(name_, &info_, true, D3DPOOL_DEFAULT))
        adopt();
}

// @yo2 0x0059ada0 OneTexture::create: a blank w x h texture registered as `name`
void OneTexture::create(const char* name, UINT w, UINT h) {
    if (!name || !*name)
        return;
    unload();
    name_ = name;
    if (g_texMgr->create(name_, w, h, &info_))
        adopt();
}

// @yo2 0x0059aa30 OneTexture::partSurface
IDirect3DSurface8* OneTexture::partSurface(int32_t part, UINT level) {
    if (!loaded_ || part < 0 || part >= info_.partCount)
        return nullptr;
    IDirect3DSurface8* s = nullptr;
    info_.parts[part].tex->GetSurfaceLevel(level, &s);
    return s;
}

struct OneTexture::Layout {
    YO2_AT(OneTexture, name_, 0x0004);
    YO2_AT(OneTexture, width_, 0x0014);
    YO2_AT(OneTexture, texW_, 0x001c);
    YO2_AT(OneTexture, info_, 0x0024);
    YO2_AT(OneTexture, loaded_, 0x4c84);
};
