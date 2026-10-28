#include "yo2SpriteElm.h"

// @yo2 0x0061ed60 CSharedSpriteElm::CSharedSpriteElm
CSharedSpriteElm::CSharedSpriteElm() { setTaskName("CSharedSpriteElm"); }

// @yo2 0x00593f00 CSharedSpriteElm::~CSharedSpriteElm
// @yo2 0x0061eec0 CSharedSpriteElm deleting destructor
CSharedSpriteElm::~CSharedSpriteElm() = default;

// @yo2 0x0061eb20 CSharedSpriteElm::newChild
CSharedSpriteElm* CSharedSpriteElm::newChild(CTask* parent, uint32_t priority) {
    auto* e = new CSharedSpriteElm;
    return dynamic_cast<CSharedSpriteElm*>(e->create(parent, priority));
}

// @yo2 0x0061ebe0 CSharedSpriteElm::draw: the element's source rect of the sprite, under its world matrix
void CSharedSpriteElm::draw(int32_t) {
    if (!sprite_.p)
        return;
    g_d3d->setMode(blendOp_);
    applyColor(sprite_.p);
    float x = float(rect_[0]), y = float(rect_[1]), w = float(rect_[2]), h = float(rect_[3]);
    sprite_.p->draw(reinterpret_cast<const D3DMATRIX*>(&world_), w, h, x, y, w, h);
}

// @yo2 0x0061ec80 CSharedSpriteElm::imageSize
Vec3 CSharedSpriteElm::imageSize() const {
    return {sprite_.p->texture().width(), sprite_.p->texture().height(), 0};
}

// @yo2 0x0061ecf0 CSharedSpriteElm::textureSize
Vec3 CSharedSpriteElm::textureSize() const {
    return {sprite_.p->texture().texWidth(), sprite_.p->texture().texHeight(), 0};
}

// @yo2 0x0061eef0 CSharedSpriteElm::Receive
int32_t CSharedSpriteElm::receive(CTaskMessage* msg) {
    if (msg->tag == TM_DISP_STATUS) {
        auto* s = static_cast<CTmDispStatus*>(msg);
        s->print("---- CSharedSpriteElm ----\n");
        s->print("ImageSize = ( %f, %f )\n", sprite_.p->texture().width(), sprite_.p->texture().height());
        s->print("Origin    = ( %f, %f )\n", origin_[0], origin_[1]);
        if (!s->chain)
            return TR_HANDLED;
    }
    return CElement::receive(msg);
}

// @yo2 0x0061f760 CSharedSpriteElm::hitTest: inside the image at the world position, and not on a transparent
// pixel (A8R8G8B8 alpha byte, A4R4G4B4 low nibble of the second byte as the exe reads it)
bool CSharedSpriteElm::hitTest(int32_t x, int32_t y) const {
    int32_t ix = static_cast<int32_t>(worldTranslation().x);
    int32_t iy = static_cast<int32_t>(worldTranslation().y);
    CD3DSprite* s = sprite_.p;
    float h = s->texture().height();
    if (!(ix < x && x < ix + s->texture().width() && iy < y && y < iy + h))
        return false;
    switch (static_cast<uint32_t>(s->textureFormat())) {
    case D3DFMT_A8R8G8B8:
        return s->pixelPtr(x - ix, y - iy, 4)[3] != 0;
    case 0x1a:  // D3DFMT_A4R4G4B4
        return (s->pixelPtr(x - ix, y - iy, 2)[1] & 0xf) != 0;
    default:
        return true;
    }
}

struct CSharedSpriteElm::Layout {
    YO2_AT(CSharedSpriteElm, sprite_, 0x340);
    YO2_AT(CSharedSpriteElm, origin_, 0x348);
    YO2_AT(CSharedSpriteElm, unk350_, 0x350);
};

// @yo2 0x0061f450 CSpriteElm::CSpriteElm: shares its own sprite
CSpriteElm::CSpriteElm() : texName_("") {
    setTaskName("CSpriteElm");
    sprite_.reset(&own_, false);
}

// @yo2 0x00593800 CSpriteElm::~CSpriteElm
// @yo2 0x0061f610 CSpriteElm deleting destructor
CSpriteElm::~CSpriteElm() { sprite_.reset(nullptr, false); }

// @yo2 0x0061f260 CSpriteElm::newChild
CSpriteElm* CSpriteElm::newChild(CTask* parent, uint32_t priority) {
    auto* e = new CSpriteElm;
    return dynamic_cast<CSpriteElm*>(e->create(parent, priority));
}

// @yo2 0x0061f030 CSpriteElm::newChild(texture): the texture is loaded by onInit
CSpriteElm* CSpriteElm::newChild(CTask* parent, uint32_t priority, const vc6::string& texture) {
    auto* e = new CSpriteElm;
    e->texName_ = texture;
    return dynamic_cast<CSpriteElm*>(e->create(parent, priority));
}

// @yo2 0x0061f640 CSpriteElm::onInit
bool CSpriteElm::onInit() {
    vc6::string name = texName_;
    setTexture(name);
    return true;
}

// @yo2 0x0061f320 CSpriteElm::setTexture: the source rect becomes the whole image
void CSpriteElm::setTexture(const vc6::string& name) {
    texName_ = name;
    own_.setTexture(texName_.c_str());
    rect_[2] = static_cast<int32_t>(own_.imageWidth());
    rect_[3] = static_cast<int32_t>(own_.imageHeight());
}

// @yo2 0x0061f3b0 CSpriteElm::createTexture
void CSpriteElm::createTexture(const vc6::string& name, UINT w, UINT h) {
    texName_ = name;
    own_.createTexture(texName_.c_str(), w, h);
    rect_[2] = static_cast<int32_t>(own_.texture().width());
    rect_[3] = static_cast<int32_t>(own_.texture().height());
}

struct CSpriteElm::Layout {
    YO2_AT(CSpriteElm, texName_, 0x358);
    YO2_AT(CSpriteElm, own_, 0x368);
};
