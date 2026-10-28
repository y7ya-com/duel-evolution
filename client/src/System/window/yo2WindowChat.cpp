// The chat window (see yo2WindowChat.h).
#include "System/window/yo2WindowChat.h"

#include <windows.h>

// =====================================================================================================================
// CInformationCallback

// @yo2 0x005e0880 CInformationCallback::call: message 5 sets values_[value >> 16] = value & 0xffff (the list cut or
// grown with -1 to end there); other messages are ignored
int CInformationCallback::call(CWindowTaskModel*, CALLBACK_MESSAGE_TYPE msg, intptr_t value) {
    if (msg != 5)
        return 0;
    uint32_t v = static_cast<uint32_t>(value);
    last_ = static_cast<int32_t>(v >> 16);
    size_t n = (v >> 16) + 1;
    while (values_.size() < n)
        values_.push_back(-1);
    while (values_.size() > n)
        values_.erase(values_.begin() + values_.size() - 1);
    values_[last_] = static_cast<int32_t>(v & 0xffff);
    return 0;
}

// =====================================================================================================================
// CWindowModelChatWindow

// @yo2 0x005f23a0 CWindowModelChatWindow::CWindowModelChatWindow
CWindowModelChatWindow::CWindowModelChatWindow() { setTaskName("チャットウィンドウ"); }

// @yo2 0x005f28d0 CWindowModelChatWindow::create
CWindowModelChatWindow* CWindowModelChatWindow::create(CTask* parent, float x, float y) {
    auto* w = new CWindowModelChatWindow;
    w->setGeometry(x, y);
    return dynamic_cast<CWindowModelChatWindow*>(w->CTask::create(parent, 10000));
}

// @yo2 0x005f2740 CWindowModelChatWindow::~CWindowModelChatWindow (0x005f4160: the callback's part, empty)
// @yo2 0x005f2710 CWindowModelChatWindow deleting destructor
// @yo2 0x005f40e0 std::list<std::wstring>::~list (a tab's log)
CWindowModelChatWindow::~CWindowModelChatWindow() = default;

// @yo2 0x005f29b0 CWindowModelChatWindow::setGeometry (the exe's first argument, the parent, is unused)
void CWindowModelChatWindow::setGeometry(float x, float y) {
    x_ = x;
    y_ = y;
    baseY_ = y;
}

// @yo2 0x005f2670 CWindowModelChatWindow::maxZ
int32_t CWindowModelChatWindow::maxZ() const { return static_cast<int32_t>(z_ + 6.0f); }

// @yo2 0x005f26a0 CWindowModelChatWindow::onControlCommand
void CWindowModelChatWindow::onControlCommand(CWindowTaskControll*) {
    bringToFront();
    layout();
}

// @yo2 0x005f29e0 CWindowModelChatWindow::onInit: 776 x 128 (short); the parts; the information callback
bool CWindowModelChatWindow::onInit() {
    pos_ = {x_, baseY_, z_};
    w_ = 776;
    h_ = 128;
    mode_ = 1;
    rows_[0] = 33;
    rows_[1] = 6;
    rows_[2] = 0;
    back_.setUser(this);
    iconbar_.setUser(this);
    expand_.setUser(this);
    shrink_.setUser(this);
    frame_.setUser(this);
    input_.setUser(this);
    back_.set(CWindowTaskBackPlane::create(this, this));
    windowNameTask(back_.get(), "背景");
    back_->inheritTransform_ = true;
    back_->z_ = back_->pos_.z = 0;
    iconbar_.set(CWindowTaskIconbar::create(this, this));
    windowNameTask(iconbar_.get(), "CWindowModelChatWindowのアイコンバー");
    iconbar_->w_ = 776;
    iconbar_->layout();
    expand_.set(CWindowTaskIconExpand::create(this, this));
    windowNameTask(expand_.get(), "CWindowModelChatWindowの△ボタン");
    shrink_.set(CWindowTaskIconHide::create(this, this));
    windowNameTask(shrink_.get(), "CWindowModelChatWindowの▽ボタン");
    frame_.set(CWindowTaskThinChop::create(this, this));   // (the exe pushes a 1 nobody reads)
    windowNameTask(frame_.get(), "CWindowModelChatWindowのフレーム");
    input_.set(CWindowTaskInput::create(this, this, 1));
    windowNameTask(input_.get(), "CWindowModelChatWindowの入力");
    input_->submitOnEnter_ = true;
    curList_ = nullptr;
    curTab_ = nullptr;
    showTabs_ = true;
    resizable_ = true;
    setCallback(CCallbackM3<CInformationCallback, int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, intptr_t>(
        &info_, &CInformationCallback::call));
    modal_ = true;
    layout();
    return true;
}

// @yo2 0x005f5190 CWindowModelChatWindow::showTabRow
void CWindowModelChatWindow::showTabRow() {
    iconbar_->active_ = true;
    iconbar_->layout();
    CWindowTaskThinChop* f = frame_.get();
    f->y_ = f->pos_.y = 24;
    f->x_ = f->pos_.x = 0;
    f->z_ = f->pos_.z = 0;
}

// @yo2 0x005f5120 CWindowModelChatWindow::hideTabRow
void CWindowModelChatWindow::hideTabRow() {
    iconbar_->active_ = false;
    iconbar_->layout();
    CWindowTaskThinChop* f = frame_.get();
    f->y_ = 0;
    f->x_ = f->pos_.x = 99999;
    f->pos_.y = 0;
}

// @yo2 0x005f3540 CWindowModelChatWindow::layout: the height from mode_ (rows + 2 lines of 16), growing upward from
// y_; the buttons for the mode; the tabs side by side (the current one in front), their logs in the back plane
void CWindowModelChatWindow::layout() {
    iconbar_->z_ = iconbar_->pos_.z = 0;
    iconbar_->w_ = w_;
    iconbar_->layout();
    h_ = float((rows_[mode_] + 2) * 16);
    baseY_ = y_ - (h_ - float((rows_[1] + 2) * 16));
    if (!showTabs_ && mode_ == 0)
        mode_ = 1;
    if (!resizable_ && (mode_ == 0 || mode_ == 2))
        mode_ = 1;
    CWindowTaskIconExpand* ex = expand_.get();
    CWindowTaskIconHide* sh = shrink_.get();
    auto buttons = [&](bool expandOn, bool shrinkOn, bool shrinkEnabled) {
        ex->z_ = ex->pos_.z = expandOn ? 2 : 0;
        ex->enabled_ = expandOn;
        sh->z_ = shrinkOn ? 2 : 0;
        sh->layout();
        sh->enabled_ = shrinkEnabled;
    };
    bool showInput = true;
    switch (mode_) {
    case 0:
        showTabRow();
        buttons(false, true, true);
        break;
    case 1:
        showTabRow();
        buttons(true, false, false);
        if (!showTabs_)
            buttons(false, true, true);
        if (!resizable_)
            buttons(false, true, false);
        break;
    case 2:
        hideTabRow();
        buttons(true, false, false);
        baseY_ += 8;
        windowShowElement(input_.get(), false);
        showInput = false;
        break;
    default:
        showInput = false;
    }
    if (showInput)
        windowShowElement(input_.get(), true);
    ex->x_ = ex->pos_.x = w_ - 19;
    ex->y_ = ex->pos_.y = 0;
    sh->x_ = w_ - 19;
    sh->y_ = 0;
    sh->layout();
    ex->layout();
    sh->layout();
    CWindowTaskThinChop* f = frame_.get();
    f->h_ = h_ - 24;
    f->w_ = w_;
    f->layout();
    CWindowTaskBackPlane* b = back_.get();
    b->x_ = b->pos_.x = 8;
    b->y_ = b->pos_.y = 24;
    b->h_ = h_ - 24 - 8;
    b->w_ = w_ - 16;
    b->layout();
    float tabX = 8, listY = mode_ == 2 ? 99999 : 24;
    float z = float(tabs_->size());
    for (Tab& t : *tabs_) {
        t.tab->x_ = t.tab->pos_.x = tabX;
        t.tab->y_ = t.tab->pos_.y = 0;
        t.tab->z_ = t.tab->pos_.z = z;
        CWindowTaskTextlist* l = t.list;
        l->x_ = 8;
        if (l == curList_) {
            l->y_ = static_cast<int32_t>(listY);
            l->pos_.x = 8;
            l->pos_.y = float(l->y_);
            windowShowElement(l, true);
        } else {
            l->y_ = 99999;
            l->pos_.x = 8;
            l->pos_.y = 99999;
            windowShowElement(l, false);
        }
        float w = w_ - 16;
        l->h_ = static_cast<int32_t>(h_ - 24 - 8 - 16);
        if (float(l->w_) != w) {
            l->w_ = static_cast<int32_t>(w);
            l->recountLines();
        }
        l->layout();
        l->posZ_ = l->pos_.z = z;
        if (t.visible)
            tabX = t.tab->w_ - 8 + tabX;
        z -= 1;
    }
    z = float(tabs_->size() + 2);
    if (curTab_) {
        curTab_->z_ = curTab_->pos_.z = z;
        curTab_->setLook(0);
    }
    if (curList_)
        curList_->posZ_ = curList_->pos_.z = z;
    pos_ = {x_, baseY_, z_};
    iconbar_->z_ = iconbar_->pos_.z = 0;
    iconbar_->w_ = w_;
    iconbar_->layout();
    CWindowTaskInput* in = input_.get();
    in->y_ = h_ - 32;
    in->x_ = 0;
    in->layout();
    in->w_ = w_;
    in->h_ = 32;
    in->layout();
    in->z_ = z + 1;
    in->layout();
}

// @yo2 0x005f4b20 CWindowModelChatWindow::onControlEvent
void CWindowModelChatWindow::onControlEvent(CWindowTaskControll* sender) {
    bringToFront();
    if (sender == expand_.get()) {
        if (mode_ == 1)
            mode_ = 0;
        else if (mode_ == 2)
            mode_ = 1;
    } else if (sender == shrink_.get()) {
        if (mode_ == 0)
            mode_ = 2;
        if (mode_ == 1 && !showTabs_)
            mode_ = 2;
    }
    int32_t i = 0;
    for (Tab& t : *tabs_) {
        if (sender == t.tab) {
            windowSoundPlay(0x10000000, 0);
            selectTab(i);
            callback_->call(this, CALLBACK_MESSAGE_TYPE(5), intptr_t(i) << 16);
        }
        if (sender == t.list)
            callback_->call(this, CALLBACK_MESSAGE_TYPE(5), intptr_t(i) << 16);
        i++;
    }
    layout();
}

// @yo2 0x005f3e30 CWindowModelChatWindow::addTab: a log (a left-aligned text list) and its tab; the first is current
void CWindowModelChatWindow::addTab() {
    Tab t;
    t.list = CWindowTaskTextlist::create(this, this);
    windowNameTask(t.list, "CWindowModelChatWindowの追加リスト");
    t.list->setEnabled(false);
    t.list->text_->setAlign(CWindowTaskText::LEFT);
    t.tab = CWindowTaskTab::create(this, this);
    if (tabs_->empty()) {
        curTab_ = t.tab;
        t.tab->setLook(0);
        curIndex_ = 0;
        curList_ = t.list;
    }
    tabs_->push_back(std::move(t));
    layout();
}

// @yo2 0x005f4190 CWindowModelChatWindow::addLine ("ChatSetText"; the profiler scope is left out)
void CWindowModelChatWindow::addLine(int32_t tab, const WChar* s) {
    if (tab < 0 || static_cast<size_t>(tab) >= tabs_->size())
        return;
    Tab& t = (*tabs_)[tab];
    t.lines->push_back(vc6::wstring(s));
    if (static_cast<size_t>(t.maxLines) < t.lines->size()) {
        t.lines->pop_front();
        t.list->removeItem(0);
    }
    t.list->autoLayout_ = false;
    t.list->addItem(s);
    CWindowTaskScroll* sc = t.list->scroll_.get();
    sc->setValue(sc->max_);
    t.list->autoLayout_ = true;
    layout();
}

// @yo2 0x005f4510 CWindowModelChatWindow::clearTab
void CWindowModelChatWindow::clearTab(int32_t tab) {
    if (tab < 0 || static_cast<size_t>(tab) >= tabs_->size())
        return;
    Tab& t = (*tabs_)[tab];
    t.list->clear();
    t.lines->clear();
    layout();
}

// @yo2 0x005f4680 CWindowModelChatWindow::clearAll
void CWindowModelChatWindow::clearAll() {
    for (size_t i = 0; i < tabs_->size(); i++)
        clearTab(static_cast<int32_t>(i));
}

// @yo2 0x005f46d0 CWindowModelChatWindow::setTabText: and the visible tabs placed side by side from 0 (layout
// places them again from 8)
void CWindowModelChatWindow::setTabText(int32_t tab, const WChar* s) {
    if (tab < 0 || static_cast<size_t>(tab) >= tabs_->size())
        return;
    (*tabs_)[tab].tab->setTabText(s);
    int32_t x = 0;
    for (Tab& t : *tabs_) {
        if (!t.visible)
            continue;
        t.tab->x_ = t.tab->pos_.x = float(x);
        t.tab->y_ = t.tab->pos_.y = 0;
        x = static_cast<int32_t>(t.tab->w_ + float(x));
    }
}

// @yo2 0x005f4800 CWindowModelChatWindow::setTabVisible: hiding the current tab makes the first visible one current
void CWindowModelChatWindow::setTabVisible(int32_t tab, bool on) {
    if (tab < 0 || static_cast<size_t>(tab) >= tabs_->size())
        return;
    if (curIndex_ == tab) {
        curList_ = nullptr;
        curTab_ = nullptr;
        curIndex_ = -1;
        for (size_t i = 0; i < tabs_->size(); i++) {
            Tab& t = (*tabs_)[i];
            if (t.visible) {
                curList_ = t.list;
                curIndex_ = static_cast<int32_t>(i);
                curTab_ = t.tab;
                break;
            }
        }
    }
    Tab& t = (*tabs_)[tab];
    t.visible = on;
    windowShowElement(t.list, on);
    windowShowElement(t.tab, on);
    int32_t x = 0;
    for (Tab& u : *tabs_) {
        if (!u.visible)
            continue;
        u.tab->x_ = u.tab->pos_.x = float(x);
        u.tab->y_ = u.tab->pos_.y = 0;
        x = static_cast<int32_t>(u.tab->w_ + float(x));
    }
    layout();
}

// @yo2 0x005f4a80 CWindowModelChatWindow::setMaxLines
void CWindowModelChatWindow::setMaxLines(int32_t tab, int32_t n) {
    if (tab >= 0 && static_cast<size_t>(tab) < tabs_->size())
        (*tabs_)[tab].maxLines = n;
}

// @yo2 0x005f4af0 CWindowModelChatWindow::setCaret
void CWindowModelChatWindow::setCaret(int32_t col, int32_t line) { input_->setCaret(col, line); }

// @yo2 0x005f4fa0 CWindowModelChatWindow::selectTab
void CWindowModelChatWindow::selectTab(int32_t tab) {
    for (Tab& t : *tabs_)
        t.tab->setLook(1);
    curTab_ = (*tabs_)[tab].tab;
    curIndex_ = tab;
    curList_ = (*tabs_)[tab].list;
    layout();
}

// @yo2 0x005f4ce0 CWindowModelChatWindow::selectTabAndReport
void CWindowModelChatWindow::selectTabAndReport(int32_t tab) {
    selectTab(tab);
    callback_->call(this, CALLBACK_MESSAGE_TYPE(5), intptr_t(tab) << 16);
}

// @yo2 0x005f4d20 CWindowModelChatWindow::setResizable
void CWindowModelChatWindow::setResizable(bool on) {
    resizable_ = on;
    windowShowElement(expand_.get(), on);
    windowShowElement(shrink_.get(), on);
    layout();
}

// @yo2 0x005f4e00 CWindowModelChatWindow::setShowTabs
void CWindowModelChatWindow::setShowTabs(bool on) {
    showTabs_ = on;
    layout();
}

// @yo2 0x005f4e30 CWindowModelChatWindow::setInputOnly
void CWindowModelChatWindow::setInputOnly(bool on) {
    inputOnly_ = on;
    if (on) {
        windowShowElement(expand_.get(), false);
        windowShowElement(shrink_.get(), false);
        mode_ = 2;
        layout();
        layout();
        return;
    }
    windowShowElement(expand_.get(), resizable_);
    windowShowElement(shrink_.get(), resizable_);
    layout();
}

// @yo2 0x005f5030 CWindowModelChatWindow::setInputText
void CWindowModelChatWindow::setInputText(const WChar* s) { input_->setText(vc6::wstring(s).c_str()); }
