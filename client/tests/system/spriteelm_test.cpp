// src/System sprite elements: CSpriteElm loads its texture on create, draws its rect under its world matrix
// through the z-sort queue, colours become material/TEXTUREFACTOR; CSharedSpriteElm borrows a sprite.
#include <cassert>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "System/yo2SpriteElm.h"
#include "System/yo2ZSort.h"

struct FakeDraw {
    IDirect3DTexture8* tex;
    std::vector<float> v;
};
extern std::vector<FakeDraw> g_draws;
extern std::map<std::string, std::vector<uint8_t>> g_fakeFiles;

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    const char img[] = "IMG 64 32";
    g_fakeFiles["card.png"].assign(img, img + std::strlen(img));
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();

    CSpriteElm* e = CSpriteElm::newChild(root, 0, "card.png");
    assert(e && e->sprite() == &e->ownSprite() && e->rect_[2] == 64 && e->rect_[3] == 32);
    e->pos_ = {100, 50, 1};
    e->color_[0] = 0.5f;
    e->addColor_[3] = 1.0f;
    root->call(&g_tmMain);
    g_draws.clear();
    layers.layer[CZSortSet::NONE].flush();
    layers.layer[CZSortSet::NONE].clear();
    assert(g_draws.size() == 1);
    // quad in local space; the world matrix (translation 100, 50) goes through SetTransform
    assert(g_draws[0].v[0] == 0 && g_draws[0].v[6 * 3 + 0] == 64 && g_draws[0].v[6 * 3 + 1] == 32);
    IDirect3DDevice8* dev = g_d3d->device();
    assert(dev->world.m[3][0] == 100 && dev->world.m[3][1] == 50);
    assert(dev->material.Emissive.r == 0.5f && dev->material.Emissive.a == 1);  // CUT: opaque emissive
    assert(dev->rs[D3DRS_TEXTUREFACTOR] == 0xff000000);

    // blended: vertex colour carries only alpha
    e->setDrawMode(CElement::BLEND);
    e->color_[3] = 0.5f;
    root->call(&g_tmMain);
    g_draws.clear();
    layers.layer[CZSortSet::MIDDLE].flush();
    for (CZSort& q : layers.layer)
        q.clear();
    uint32_t c;
    std::memcpy(&c, &g_draws[0].v[3], 4);
    assert(c == 0x7f000000 && g_d3d->mode() == 4);

    // hit test: inside the image but on a transparent (zero) pixel; outside
    assert(!e->hitTest(110, 60) && !e->hitTest(10, 10));

    // a shared element borrows the other's sprite
    CSharedSpriteElm* sh = CSharedSpriteElm::newChild(root, 0);
    sh->setSprite(e->sprite(), false);
    assert(sh->imageSize().x == 64 && sh->textureSize().y == 32);

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    CD3DDevice::release();
    std::puts("spriteelm_test ok");
}
