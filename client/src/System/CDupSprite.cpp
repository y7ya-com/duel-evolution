#include "CDupSprite.h"

#include "CD3DDevice.h"
#include "yo2ZSort.h"

// @yo2 0x00594100 CDupSprite::newChild
CDupSprite* CDupSprite::newChild(CTask* parent, uint32_t priority) {
    return dynamic_cast<CDupSprite*>((new CDupSprite)->create(parent, priority));
}

// @yo2 0x005934f0 CDupSprite::newChild(texture)
CDupSprite* CDupSprite::newChild(CTask* parent, uint32_t priority, const vc6::string& texture) {
    auto* d = new CDupSprite;
    d->texName_ = texture;
    return dynamic_cast<CDupSprite*>(d->create(parent, priority));
}

// @yo2 0x00593ce0 CDupSprite::~CDupSprite
// @yo2 0x005937d0 CDupSprite deleting destructor
CDupSprite::~CDupSprite() = default;

// @yo2 0x00592fb0 CDupSprite::add (vector<Instance>::push_back)
// @yo2 0x00594730 copy<Instance*>
// @yo2 0x00594830 uninitialized_fill_n<Instance*>
// @yo2 0x00594870 construct<Instance>
// @yo2 0x00594710 destroy<Instance*> (empty)
void CDupSprite::add(const Instance& i) { instances_.push_back(i); }

// @yo2 0x005932f0 CDupSprite::onMain: queue every instance at its world z
bool CDupSprite::onMain() {
    if (!isVisible(false))
        return true;
    drawn_ = 0;
    int32_t index = 0;
    for (const Instance& i : instances_) {
        pos_ = {i.x, i.y, i.z};
        scale_.x = i.sx;
        scale_.y = i.sy;
        updateMatrix();
        queues_[0]->add(this, world_.m[3][2], index++);
    }
    return true;
}

// @yo2 0x00594310 CDupSprite::draw: one instance
void CDupSprite::draw(int32_t index) {
    if (!sprite_.p || !isVisible(false) || index < 0 || size_t(index) >= instances_.size())
        return;
    Instance i = instance(index);
    for (int k = 0; k < 4; ++k)
        rect_[k] = static_cast<int32_t>(i.rect[k]);
    pos_ = {i.x, i.y, i.z};
    scale_.x = i.sx;
    scale_.y = i.sy;
    updateMatrix();
    g_d3d->setMode(blendOp_);
    applyColor(sprite_.p);
    float x = float(rect_[0]), y = float(rect_[1]), w = float(rect_[2]), h = float(rect_[3]);
    sprite_.p->draw(reinterpret_cast<const D3DMATRIX*>(&world_), w, h, x, y, w, h);
}

struct CDupSprite::Layout {
    YO2_AT(CDupSprite, instances_, 0x5088);
    YO2_AT(CDupSprite, drawn_, 0x5098);
    YO2_SIZEOF(CDupSprite, 0x50a0);
};
