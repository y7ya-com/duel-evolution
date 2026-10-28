#include "System/window/yo2WindowImage.h"

// @yo2 0x005d65f0 CWindowTaskImage::create
CWindowTaskImage* CWindowTaskImage::create(CTask* parent, IWindowTaskMediator* mediator, const vc6::string& texture) {
    auto* c = new CWindowTaskImage;
    c->texture_ = texture;
    c->mediator_ = mediator;
    return dynamic_cast<CWindowTaskImage*>(c->CTask::create(parent, 0));
}

// @yo2 0x005d6850 CWindowTaskImage::CWindowTaskImage
CWindowTaskImage::CWindowTaskImage() { setTaskName("単なる画像(コントロール)"); }

// @yo2 0x005d6af0 CWindowTaskImage::~CWindowTaskImage
// @yo2 0x005d6ac0 CWindowTaskImage deleting destructor
CWindowTaskImage::~CWindowTaskImage() = default;

// @yo2 0x005d6bb0 CWindowTaskImage::onInit: the sprite of texture_, drawn at the part's own size
bool CWindowTaskImage::onInit() {
    x_ = y_ = 0;
    z_ = 0;
    inheritTransform_ = true;
    setDrawMode(2);
    sprite_.setUser(this);
    windowSpriteCreate(sprite_, this, 10000, texture_);
    CElement* s = windowElement(sprite_);
    windowNameTask(s, "CWindowTaskImgの画像");
    s->setDrawMode(2);
    s->inheritTransform_ = true;
    w_ = static_cast<float>(part_[2]);
    h_ = static_cast<float>(part_[3]);
    layout();
    return true;
}

// @yo2 0x005d6a00 CWindowTaskImage::onMain
bool CWindowTaskImage::onMain() {
    layout();
    return true;
}

// @yo2 0x005d70e0 CWindowTaskImage::layout: the part stretched to w_ x h_
void CWindowTaskImage::layout() {
    pos_ = {x_, y_, z_};
    CElement* s = windowElement(sprite_);
    s->pos_ = {0, 0, 0};
    s->scale_.x = w_ / static_cast<float>(part_[2]);
    s->scale_.y = h_ / static_cast<float>(part_[3]);
}

// @yo2 0x005d71a0 CWindowTaskImage::handleMessage: a left click goes to the window
bool CWindowTaskImage::handleMessage(WindowMsg m) {
    if (m.msg == 0x201)
        mediator_->onControlCommand(this);
    return true;
}

// @yo2 0x005d6a40 CWindowTaskImage::setPart
void CWindowTaskImage::setPart(int32_t u, int32_t v, int32_t w, int32_t h) {
    part_[0] = u, part_[1] = v, part_[2] = w, part_[3] = h;
    CElement* s = windowElement(sprite_);
    s->rect_[0] = u, s->rect_[1] = v, s->rect_[2] = w, s->rect_[3] = h;
    layout();
}
