#include "System/window/yo2UGDialogBase.h"

// (inlined into the subclasses' constructors, e.g. CWindowDeckList 0x007675b0)
CUGDialogBase::CUGDialogBase() = default;

// @yo2 0x007679e0 CUGDialogBase::~CUGDialogBase
// @yo2 0x00767b90 CUGDialogBase deleting destructor
CUGDialogBase::~CUGDialogBase() = default;

// @yo2 0x00767ac0 CUGDialogBase::setBox
void CUGDialogBase::setBox(int32_t w, int32_t h) {
    boxW_ = w;
    boxH_ = h;
}

// @yo2 0x00772500 CUGDialogBase::isMouseOver
bool CUGDialogBase::isMouseOver() const {
    int32_t x, y;
    windowMouseGetXY(&x, &y);
    int32_t hw = boxW_ / 2, hh = boxH_ / 2;
    return cx_ - hw <= x && x < cx_ + hw && cy_ - hh <= y && y < cy_ + hh;
}

// @yo2 0x007725a0 CUGDialogBase::windowSlot15: drag while the left button stays down (the centre kept within a
// quarter of the box off 1024 x 600); a left press over the box starts a drag
bool CUGDialogBase::windowSlot15() {
    if (fade_ != 0)
        return false;
    if (answered_)
        return isMouseOver();
    int32_t x, y;
    windowMouseGetXY(&x, &y);
    if (dragging_) {
        if (!windowMouseLButton()) {
            dragging_ = false;
            return true;
        }
        cx_ = x - dragDx_;
        cy_ = y - dragDy_;
        int32_t lim = boxW_ / 4 + 1024;
        if (lim < cx_ || (lim = -(boxW_ / 4), cx_ < lim))
            cx_ = lim;
        lim = boxH_ / 4 + 600;
        if (lim < cy_ || (lim = -(boxH_ / 4), cy_ < lim))
            cy_ = lim;
        x_ = pos_.x = static_cast<float>(cx_ - (boxW_ >> 1));
        y_ = pos_.y = static_cast<float>(cy_ - (boxH_ >> 1));
        layout();
        return true;
    }
    onMouse(windowAppMouse());
    if (!isMouseOver())
        return false;
    if (windowMouseLeftPushed()) {
        dragging_ = true;
        dragDx_ = x - cx_;
        dragDy_ = y - cy_;
        windowMouseResetButton();
    }
    return true;
}

// @yo2 0x007727d0 CUGDialogBase::tick
void CUGDialogBase::tick() {
    running_ = true;
    if (fade_ == 0) {
        if (answered_ && canClose())
            close(result_);
        return;
    }
    fade_ -= 32;
    if (fade_ == 0)
        onOpened();
    if (fade_ < -255) {
        onClosed();
        running_ = false;
    }
}

// @yo2 0x007724c0 CUGDialogBase::close: tell the server, start fading out
void CUGDialogBase::close(int32_t result) {
    fade_ = -1;
    result_ = result;
    ugDialogSendResult(result);
    onClose();
}
