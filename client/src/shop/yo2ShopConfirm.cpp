// yo2shopEntry.cpp: CShopConfirmWindow (see yo2ShopConfirm.h).
#include "shop/yo2ShopConfirm.h"

#include <utility>

#include "System/yo2Debug.h"
#include "shop/yo2ShopExtern.h"

namespace {
CWindowTaskText* newText(CTaskPtr<CWindowTaskText>& p, CShopConfirmWindow* w, const char* name) {
    p.setUser(w);
    p.set(CWindowTaskText::create(w->base_.get(), w));
    windowNameTask(p.task(), name);
    return p.get();
}
// OK / Cancel: a picture switch at x, 217 with its caption at x, 224 (110 x 32, centred)
void newButton(CShopConfirmWindow* w, CTaskPtr<CWindowTaskPictureSwitch>& b, CTaskPtr<CWindowTaskText>& t,
               const char* name, uint32_t textId, float x) {
    b.setUser(w);
    b.set(CWindowTaskPictureSwitch::create(w->base_.get(), w, w));
    windowNameTask(b.task(), name);
    b->setImages("data/shop/shop_btn2_01_c01.png", "data/shop/shop_btn2_02_c01.png", "data/shop/shop_btn2_03_c01.png",
                 "data/shop/shop_btn2_03_c01.png");
    b->pos_ = {x, 217, 1};
    CWindowTaskText* c = newText(t, w, "確認ウィンドウOKテキスト");   // (both captions)
    c->setTextId(textId);
    c->setPos(x, 224);
    c->setArea(110, 32);
    c->setAlign(CWindowTaskText::CENTRE);
    c->posZ_ = c->pos_.z = 3;
}
}   // namespace

// @yo2 0x00aeb4d0 CShopConfirmWindow::create (the constructor inlined)
CShopConfirmWindow* CShopConfirmWindow::create(CTask* parent, CTask* layer) {
    auto* w = new CShopConfirmWindow;
    w->layer_ = layer;
    return dynamic_cast<CShopConfirmWindow*>(w->CTask::create(parent, 10000));
}

CShopConfirmWindow::CShopConfirmWindow() = default;

// @yo2 0x00aeb770 CShopConfirmWindow::~CShopConfirmWindow
// @yo2 0x00aeb740 CShopConfirmWindow deleting destructor
CShopConfirmWindow::~CShopConfirmWindow() = default;

// @yo2 0x00aeb920 CShopConfirmWindow::onInit: the frame, OK / Cancel, the scroll bar, the message, ten lines
bool CShopConfirmWindow::onInit() {
    result_ = NONE;
    base_.setUser(this);
    base_.set(CElement::newChild(layer_, 10000));
    base_->pos_ = {300, 330, 51003};
    frame_.setUser(this);
    windowSpriteCreate(frame_, base_.get(), 10000);
    windowNameTask(frame_.task(), "確認ウィンドウ");
    windowSpriteTexture(frame_, "data/shop/shop_win_01_c00.png");
    CElement* f = windowElement(frame_);
    f->inheritTransform_ = true;
    f->pos_ = {0, 0, 0};
    newButton(this, ok_, okText_, "確認ウィンドウOKボタン", 4000, 39);
    newButton(this, cancel_, cancelText_, "確認ウィンドウCancelボタン", 0xfa1, 338);
    scroll_.setUser(this);
    scroll_.set(CWindowTaskScroll::create(base_.get(), this, 0));
    windowNameTask(scroll_.task(), "確認ウィンドウスクロールバー");
    scroll_->x_ = 448;
    scroll_->y_ = 17;
    scroll_->length_ = 190;
    scroll_->z_ = 1;
    scroll_->layout();
    CWindowTaskText* t = newText(message_, this, "確認ウィンドウの確認テキスト");
    t->setFontSize(15);
    t->setLineGap(1);
    t->setPos(16, 16);
    t->setArea(300, 32);
    t->posZ_ = t->pos_.z = 1;
    for (int i = 0; i < LINES; i++) {
        t = newText(lines_[i], this, "確認ウィンドウ商品名リスト");
        t->setFontSize(16);
        t->setPos(24, static_cast<float>(48 + 16 * i));
        t->setArea(512, 16);
        t->posZ_ = t->pos_.z = 1;
    }
    return true;
}

// @yo2 0x00aed6c0 CShopConfirmWindow::onDestroy
void CShopConfirmWindow::onDestroy() {
    if (base_.task())
        base_->destroy(__FILE__, __LINE__);
}

// @yo2 0x00aed480 CShopConfirmWindow::onControlEvent: OK / Cancel (with their sounds), or the scroll bar moved
void CShopConfirmWindow::onControlEvent(CWindowTaskControll* sender) {
    if (base_->isLocked(2))   // hidden
        return;
    if (sender == ok_.task() && sender) {
        result_ = OK;
        appPlaySound(0x10000001, 0);
    } else if (sender == cancel_.task() && sender) {
        result_ = CANCEL;
        appPlaySound(0x10000002, 0);
    } else if (sender == scroll_.task() && sender) {
        showLines();
    }
}

// @yo2 0x00aecf10 CShopConfirmWindow::setCart: one line per cart line (name, "x<count>" at 320, "<count * cost>MP"
// at 360), the scroll bar over the lines past ten, and the total
void CShopConfirmWindow::setCart(const ShopVec<ShopCartLine>& cart) {
    for (CTaskPtr<CWindowTaskText>& l : lines_)
        l->setText(u"");
    cart_ = cart;
    lineTexts_.clear();
    int32_t total = 0;
    for (const ShopCartLine& l : cart_) {
        int32_t mp = l.count * static_cast<int32_t>(l.item.cost);
        std::u16string s = yo2Widen(std::string_view(shopItemName(l.item))) + u"@>320/x";
        s += yo2Widen(yo2Format("%d", l.count));   // (yo2Format's buffer is reused: one at a time)
        s += u"@>360/";
        s += yo2Widen(yo2Format("%dMP", mp));
        lineTexts_.push_back(std::move(s));
        total += mp;
    }
    scroll_->setMax(static_cast<int32_t>(lineTexts_.size()) - LINES);
    showLines();
    total_ = total;
}

// @yo2 0x00aed5b0 CShopConfirmWindow::showLines: the ten lines from the scroll position on
void CShopConfirmWindow::showLines() {
    for (int i = 0; i < LINES; i++) {
        size_t at = static_cast<size_t>(scroll_->value_ + i);
        if (lineTexts_.size() <= at)
            return;
        lines_[i]->setText(lineTexts_[at].c_str());
    }
}

// @yo2 0x00aed410 CShopConfirmWindow::setVisible (the lock bit only, on the window and its base)
void CShopConfirmWindow::setVisible(bool on) {
    if (on) {
        base_->clearLockFlags(2);
        clearLockFlags(2);
    } else {
        base_->setLockFlags(2);
        setLockFlags(2);
    }
}

// @yo2 0x00aed710 CShopConfirmWindow::message
vc6::string CShopConfirmWindow::message() const { return shopConfirmMessage(total_); }
