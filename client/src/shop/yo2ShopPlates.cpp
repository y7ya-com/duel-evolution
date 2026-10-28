// yo2shopEntry.cpp: CShopPricePlate and CShopMileagePlate.
#include "shop/yo2ShopPlates.h"

#include <cstdio>
#include <utility>

#include "shop/yo2ShopExtern.h"

namespace {
struct TaskLockBits : CTask {
    static uint32_t& of(CTask* t) { return t->*(&TaskLockBits::lockFlags_); }
};
// One of the plate's two texts: 24-pixel, right-aligned in 200 x 24 at 12, y, without its shadow.
void mileageText(CTaskPtr<CWindowTaskShadowText>& p, CShopMileagePlate* owner, float y) {
    p.setUser(owner);
    p.set(CWindowTaskShadowText::create(owner->base_.get(), owner));
    windowNameTask(p.task(), "決定テキスト");
    CWindowTaskShadowText* t = p.get();
    t->inheritTransform_ = true;
    t->shadow_->setDisp(false, true);   // CWindowTaskControll::hide (CWindowTask.h inline 0x005d5700)
    TaskLockBits::of(t->shadow_.get()) |= 2u;
    t->x_ = 12;
    t->y_ = static_cast<int32_t>(y);
    t->text_->setPos(12, y);
    t->shadow_->setPos(static_cast<float>(t->shadowDx_) + 12, static_cast<float>(t->shadowDy_) + y);
    t->text_->setArea(200, 24);
    t->shadow_->setArea(200, 24);
    t->text_->setAlign(CWindowTaskText::RIGHT);
    t->shadow_->setAlign(CWindowTaskText::RIGHT);
    t->text_->setFontSize(24);
    t->shadow_->setFontSize(24);
    t->z_ = t->pos_.z = 1;
}
vc6::string mpText(int32_t mp) {
    char buf[0x100];
    std::snprintf(buf, sizeof buf, "%dMP", mp);
    return buf;
}
}   // namespace

// --- CShopPricePlate --------------------------------------------------------------------------------------------

// @yo2 0x00ae90a0 CShopPricePlate::create (the constructor inlined)
CShopPricePlate* CShopPricePlate::create(CTask* parent, CTask* layer, IWindowTaskMediator* mediator, int32_t kind) {
    auto* p = new CShopPricePlate;
    p->layer_ = layer;
    p->mediator_ = mediator;
    p->kind_ = kind;
    return dynamic_cast<CShopPricePlate*>(p->CTask::create(parent, 10000));
}

CShopPricePlate::CShopPricePlate() = default;

// @yo2 0x00ae9270 CShopPricePlate::~CShopPricePlate
// @yo2 0x00ae9240 CShopPricePlate deleting destructor
CShopPricePlate::~CShopPricePlate() = default;

// @yo2 0x00ae9330 CShopPricePlate::onInit: the tag and its two texts under a base element on the layer
bool CShopPricePlate::onInit() {
    enabled_ = true;
    state_ = UP;
    price_ = 0;
    count_ = 10;
    index_ = 0;
    rate_ = -1.0f;
    base_.setUser(this);
    base_.set(CElement::newChild(layer_, 10000));
    windowNameTask(base_.task(), "値段プレートベースエレメント");
    tag_.setUser(this);
    tag_.set(CWindowTaskPictureSwitch::create(base_.get(), this, this));
    windowNameTask(tag_.task(), "値段プレート");
    tag_->inheritTransform_ = true;
    if (kind_ == 0)
        tag_->setImages("data/shop/shop_pricetag_06_c01.png", "data/shop/shop_pricetag_04_c01.png",
                        "data/shop/shop_pricetag_05_c01.png", "data/shop/shop_pricetag_05_c01.png");
    else
        tag_->setImages("data/shop/shop_pricetag_01_c01.png", "data/shop/shop_pricetag_02_c01.png",
                        "data/shop/shop_pricetag_03_c01.png", "data/shop/shop_pricetag_03_c01.png");
    tag_->pos_ = {0, 0, 0};
    for (auto [p, y] : {std::pair{&priceText_, 216.0f}, std::pair{&rateText_, 236.0f}}) {
        p->setUser(this);
        p->set(CWindowTaskText::create(base_.get(), this));
        CWindowTaskText* t = p->get();
        t->setPos(10, y);
        t->posZ_ = t->pos_.z = 3;
    }
    return true;
}

// @yo2 0x00ae9f60 CShopPricePlate::onDestroy
void CShopPricePlate::onDestroy() {
    if (base_.task())
        base_->destroy(__FILE__, __LINE__);
}

// @yo2 0x00ae9da0 CShopPricePlate::onControlEvent
void CShopPricePlate::onControlEvent(CWindowTaskControll*) {
    if (enabled_)
        mediator_->onControlEvent(asSender());
}

// @yo2 0x00ae9660 CShopPricePlate::setPrice: "<n>MP"
void CShopPricePlate::setPrice(int32_t mp) {
    price_ = mp;
    priceText_->setText(yo2Widen(std::string_view(mpText(mp))).c_str());
}

// @yo2 0x00ae9a10 CShopPricePlate::setIndex (above count_: count_ - 1; below 0: 0)
void CShopPricePlate::setIndex(int32_t i) {
    index_ = i;
    if (count_ < i)
        index_ = count_ - 1;
    if (index_ < 0)
        index_ = 0;
}

// @yo2 0x00ae9a60 CShopPricePlate::setRate: "<rate * 100, one decimal> %"
void CShopPricePlate::setRate(float rate) {
    rate_ = rate;
    char buf[0x40];
    std::snprintf(buf, sizeof buf, "%0.1f %%", static_cast<double>(rate * 100.0f));
    rateText_->setText(yo2Widen(buf).c_str());
}

// @yo2 0x00ae9de0 CShopPricePlate::setVisible
void CShopPricePlate::setVisible(bool on) {
    if (on) {
        base_->clearLockFlags(2);
        base_->setDisp(true, true);
    } else {
        base_->setLockFlags(2);
        base_->setDisp(false, true);
    }
}

// @yo2 0x00ae9e80 CShopPricePlate::setState: DOWN checks the tag, UP / HOVER uncheck it
void CShopPricePlate::setState(int32_t s) {
    state_ = s;
    if (s == UP || s == HOVER)
        tag_->checked_ = false;
    else if (s == DOWN)
        tag_->checked_ = true;
}

// @yo2 0x00ae9ef0 CShopPricePlate::buttonState: DOWN while checked, else the tag's (NORMAL: UP, HOVER: HOVER, else UP)
int32_t CShopPricePlate::buttonState() const {
    if (tag_->checked_)
        return DOWN;
    return tag_->state_ == CWindowTaskPictureSwitch::HOVER ? HOVER : UP;
}

// --- CShopMileagePlate -------------------------------------------------------------------------------------------

// @yo2 0x00ae9fd0 CShopMileagePlate::create (the constructor inlined)
CShopMileagePlate* CShopMileagePlate::create(CTask* parent, CTask* layer) {
    auto* p = new CShopMileagePlate;
    p->layer_ = layer;
    return dynamic_cast<CShopMileagePlate*>(p->CTask::create(parent, 10000));
}

CShopMileagePlate::CShopMileagePlate() = default;

// @yo2 0x00aea1a0 CShopMileagePlate::~CShopMileagePlate
// @yo2 0x00aea170 CShopMileagePlate deleting destructor
CShopMileagePlate::~CShopMileagePlate() = default;

// @yo2 0x00aea260 CShopMileagePlate::onInit: the plate and its two texts (y 7 and 48)
bool CShopMileagePlate::onInit() {
    base_.setUser(this);
    base_.set(CElement::newChild(layer_, 10000));
    windowNameTask(base_.task(), "");
    base_->inheritTransform_ = true;
    plate_.setUser(this);
    windowSpriteCreate(plate_, base_.get(), 10000);
    windowNameTask(plate_.task(), "商品の種類を載せるプレート");
    CElement* p = windowElement(plate_);
    p->inheritTransform_ = true;
    windowSpriteTexture(plate_, "data/shop/shop_money_01_c01.png");
    p->pos_ = {0, 0, 0};
    p->setDrawMode(CElement::BLEND);
    mileageText(top_, this, 7);
    mileageText(bottom_, this, 48);
    return true;
}

// @yo2 0x00aeb480 CShopMileagePlate::onDestroy
void CShopMileagePlate::onDestroy() {
    if (base_.task())
        base_->destroy(__FILE__, __LINE__);
}

// @yo2 0x00aeade0 CShopMileagePlate::setTop: "<n>MP"
void CShopMileagePlate::setTop(int32_t mp) {
    topMp_ = mp;
    top_->setTextA(mpText(mp).c_str());
}

// @yo2 0x00aeb130 CShopMileagePlate::setBottom: "<n>MP"
void CShopMileagePlate::setBottom(int32_t mp) {
    bottomMp_ = mp;
    bottom_->setTextA(mpText(mp).c_str());
}
