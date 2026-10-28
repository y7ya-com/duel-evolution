#include "yo2TransitTask.h"

// @yo2 0x00636df0 CTransitTask::newChild
CTransitTask* CTransitTask::newChild(CTask* parent) {
    auto* t = new CTransitTask;
    t->sprite_.setUser(t);
    t->sprite_.set(CSpriteElm::newChild(parent, 10000));
    return dynamic_cast<CTransitTask*>(t->create(parent, 10000));
}

// @yo2 0x006370f0 CTransitTask::~CTransitTask
// @yo2 0x006370c0 CTransitTask deleting destructor
CTransitTask::~CTransitTask() = default;

// @yo2 0x00637170 CTransitTask::onInit: a 256x256 white texture, the sprite at (200, 200, 500). The exe locks
// a null texture pointer here (it would crash); this locks the texture it just made.
bool CTransitTask::onInit() {
    CSpriteElm* s = sprite_.get();
    s->createTexture("sysTransit", 256, 256);
    const TexInfo* info = s->ownSprite().texture().info();
    IDirect3DTexture8* tex = info ? info->parts[0].tex : nullptr;
    D3DLOCKED_RECT lr;
    if (!tex || tex->LockRect(0, &lr, nullptr, 0) < 0)
        return false;
    auto* px = static_cast<uint32_t*>(lr.pBits);
    for (int i = 0; i < 256 * 256; ++i)
        px[i] = 0xffffffff;
    tex->UnlockRect(0);
    sprite_->pos_ = {200, 200, 500};
    return true;
}

struct CTransitTask::Layout {
    YO2_AT(CTransitTask, sprite_, 0x70);
    YO2_SIZEOF(CTransitTask, 0x80);
};
