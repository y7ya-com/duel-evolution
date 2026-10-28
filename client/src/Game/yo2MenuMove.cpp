// yo2Menu.cpp: CWindowModelMove, the "where to go" list.
#include "Game/yo2DuelWindows.h"
#include "Game/yo2Menu.h"

namespace {
struct TaskLockBits : CTask {
    static uint32_t& of(CTask* t) { return t->*(&TaskLockBits::lockFlags_); }
};
void hide(CElement* e) {
    e->setDisp(false, true);
    TaskLockBits::of(e) |= 2u;
}
}   // namespace

// @yo2 0x00a6a740 CWindowModelMove::CWindowModelMove
CWindowModelMove::CWindowModelMove() { setTaskName("CWindowModelMove"); }

// @yo2 0x00a6a680 CWindowModelMove::create
CWindowModelMove* CWindowModelMove::create(CTask* parent, int32_t kind) {
    auto* w = new CWindowModelMove;
    w->kind_ = kind;
    return dynamic_cast<CWindowModelMove*>(w->CTask::create(parent, 10000));
}

// @yo2 0x00a6aa00 CWindowModelMove::~CWindowModelMove
// @yo2 0x00a6a9b0 CWindowModelMove deleting destructor
CWindowModelMove::~CWindowModelMove() = default;

// @yo2 0x00a6a900 CWindowModelMove::maxZ
int32_t CWindowModelMove::maxZ() const { return static_cast<int32_t>(z_ + 2.0f); }

// @yo2 0x00a6aad0 CWindowModelMove::onInit: the frame, a hidden scroll bar, the ×; 296 x 188 at 364, 178, topmost
bool CWindowModelMove::onInit() {
    frame_.setUser(this);
    scroll_.setUser(this);
    close_.setUser(this);
    frame_.set(CWindowTaskFrameMove::create(this, this, kind_));
    windowNameTask(frame_.task(), "外出先リストウィンドウのフレーム");
    frame_->inheritTransform_ = true;
    frame_->pos_ = {0, 0, 0};
    scroll_.set(duelResultScrollCreate(this, this, 0));
    windowNameTask(scroll_.task(), "外出先リスト用スクロールバー");
    scroll_->inheritTransform_ = true;
    scroll_->z_ = 1;
    scroll_->layout();
    hide(scroll_.get());
    close_.set(CWindowTaskIconHide::create(this, this));
    windowNameTask(close_.task(), "外出先リスト用×ボタン");
    CWindowTaskIconHide* c = close_.get();
    c->inheritTransform_ = true;
    c->x_ = 275;
    c->y_ = 0;
    c->layout();
    c->z_ = 2;
    c->layout();
    w_ = 296;
    h_ = 188;
    layout();
    x_ = pos_.x = 364;
    y_ = pos_.y = 178;
    picked_ = -1;
    rows_ = 6;
    setTopmost(true);
    modal_ = true;
    return true;
}

// @yo2 0x00a6ada0 CWindowModelMove::layout: rows_ items from the scroll position, 26 pixels apart; the frame as wide
// as the widest shown item + 38 and at least rows_ rows high; the scroll bar and the × at its right edge
void CWindowModelMove::layout() {
    for (CWindowTaskTextSwitch* b : items_)
        hide(b);
    int32_t n = static_cast<int32_t>(items_.size());
    scroll_->setMax(n - rows_);
    int32_t top = scroll_->value_;
    int32_t widest = 0;
    for (int32_t i = top; i < top + rows_ && i < n; i++) {
        CWindowTaskTextSwitch* b = items_[i];
        b->x_ = b->pos_.x = 11;
        b->y_ = b->pos_.y = static_cast<float>(24 + 26 * (i - top));
        TaskLockBits::of(b) &= ~2u;
        b->setDisp(true, true);
        widest = static_cast<int32_t>(static_cast<float>(widest) > b->w_ ? static_cast<float>(widest) : b->w_);
    }
    int32_t frameW = widest + 38;
    float rowsH = static_cast<float>(rows_ * 26 + 30);
    int32_t h = static_cast<int32_t>(h_ > rowsH ? h_ : rowsH);
    frame_->w_ = static_cast<float>(frameW);
    frame_->h_ = static_cast<float>(h);
    frame_->layout();
    CWindowTaskScrollBase* s = scroll_.get();
    s->y_ = 22;
    s->x_ = static_cast<float>(frameW - 24);
    s->length_ = static_cast<float>(h - 30);
    Vec3 at = worldTranslation();
    s->setWheelArea(at.x, at.y, w_, static_cast<float>(h));
    close_->x_ = static_cast<float>(frameW - 24);
    close_->y_ = 0;
    close_->layout();
}

// @yo2 0x00a6b0e0 CWindowModelMove::onControlEvent: an item sets picked_; the scroll bar scrolls; × hides
void CWindowModelMove::onControlEvent(CWindowTaskControll* sender) {
    for (size_t i = 0; i < items_.size(); i++)
        if (sender == items_[i])
            picked_ = static_cast<int32_t>(i);   // ("CWindowModelMove::ColleagueChanged[%d]おされた" trace)
    if (sender == frame_.task())
        return;
    if (sender == scroll_.task()) {
        layout();
        return;
    }
    if (sender == close_.task())
        hide(this);
}

// @yo2 0x00a6b240 CWindowModelMove::newItem: a choice button, 258 wide, white 16-pixel text on a black shadow
CWindowTaskTextSwitch* CWindowModelMove::newItem() {
    CWindowTaskTextSwitch* b = CWindowTaskButtonDuel::create(this, this);
    windowNameTask(b, "外出先リスト用選択しボタンのひとつ");
    b->inheritTransform_ = true;
    b->minW_ = 258;
    b->unk5b4_ = 24;
    b->layout();
    CWindowTaskShadowText* cap = b->caption_.get();
    cap->text_->setFontSize(16);
    cap->shadow_->setFontSize(16);
    b->z_ = b->pos_.z = 2;
    TaskLockBits::of(cap->shadow_.get()) &= ~2u;
    cap->shadow_->setDisp(true, true);
    cap->text_->setColor(1, 1, 1, 1);
    cap->shadow_->setColor(0, 0, 0, 1);
    return b;
}

// @yo2 0x00a6b3a0 CWindowModelMove::addItem
void CWindowModelMove::addItem(const WChar* text) {
    CWindowTaskTextSwitch* b = newItem();
    b->setText(text);
    items_.push_back(b);
    scroll_->setMax(static_cast<int32_t>(items_.size()) - 6);
    layout();
}
