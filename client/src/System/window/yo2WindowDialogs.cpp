#include "System/window/yo2WindowDialogs.h"

#include "Game/yo2TgtAvaListDlg.h"   // GameCtrl (src\Game; the exe calls it from here too)

namespace {

constexpr float kAlpha = 0.7f;   // the panels' see-through (0x00be8ac4)

// The look every dialog gives its text field and frame: a white panel and frame at kAlpha.
void dialogPanels(CWindowTaskTextField* tf, CWindowTaskControll* frame) {
    tf->back_.get()->setColor(1, 1, 1, kAlpha);
    frame->setAlpha(kAlpha);
}

// A button on the band: centred in [left, left + span], vertically centred in the band (8 pixels above the bottom).
float bandButtonY(const CWindowModelDialogWithBtns* d, const CWindowTaskSwitch* b) {
    return (d->h_ - d->bandH_) + ((d->bandH_ - 8.0f) - b->h_) * 0.5f;
}

}  // namespace

// --- CDialogCallback ---------------------------------------------------------------------------------------------

// @yo2 0x005e0620 CDialogCallback::onResult
int CDialogCallback::onResult(CWindowTaskModel*, CALLBACK_MESSAGE_TYPE message, intptr_t value) {
    message_ = message;
    if (message == 0)
        result_ = static_cast<int32_t>(value);
    else if (message >= 1 && message <= 4)
        texts_[message - 1] = reinterpret_cast<const WChar*>(value);
    return 0;
}

// @yo2 0x005e6680 CDialogCallback::~CDialogCallback (the four texts; inlined into the dialogs' destructors)

// --- CWindowModelThin --------------------------------------------------------------------------------------------

// @yo2 0x005e3ef0 CWindowModelThin::create (priority 10000)
// @yo2 0x005e3fd0 CWindowModelThin::setup (create's position, default size 336 x 144, style)
CWindowModelThin* CWindowModelThin::create(CTask* parent, float x, float y, int32_t style) {
    auto* w = new CWindowModelThin;
    w->x_ = x;
    w->callback_ = nullptr;
    w->w_ = 336;
    w->h_ = 144;
    w->y_ = y;
    w->style_ = style;
    return dynamic_cast<CWindowModelThin*>(w->CTask::create(parent, 10000));
}

// @yo2 0x005e3a80 CWindowModelThin::CWindowModelThin
CWindowModelThin::CWindowModelThin() { setTaskName("枠の細いウィンドウ"); }

// @yo2 0x005e3e20 CWindowModelThin::~CWindowModelThin
// @yo2 0x005e3db0 CWindowModelThin deleting destructor
CWindowModelThin::~CWindowModelThin() = default;

// @yo2 0x005e4020 CWindowModelThin::onInit: text field and frame, a white see-through panel with black text, shown
// modal
bool CWindowModelThin::onInit() {
    textField_.setUser(this);
    textField_.set(CWindowTaskTextField::create(this, this));
    windowNameTask(textField_.task(), "CWindowModelThinのテキストフィールド");
    frame_.setUser(this);
    frame_.set(CWindowTaskFrameThin::create(this, this, style_));
    windowNameTask(frame_.task(), "CWindowModelThinのフレーム");
    textField_->text_.get()->setColor(0, 0, 0, 1);
    textField_->back_.get()->setColor(1, 1, 1, kAlpha);
    frame_->setAlpha(kAlpha);
    float cx = w_ * 0.5f + x_;
    openAnim_.kind = 2;
    openAnim_.frames = 15;
    openAnim_.unk0c = 0;
    openAnim_.unk10 = 0;
    openAnim_.cx = static_cast<int32_t>(cx);
    openAnim_.cy = static_cast<int32_t>(h_ * 0.5f + y_);
    openAnim_.stepW = static_cast<int32_t>(w_ * (1.0 / 30));
    openAnim_.stepH = static_cast<int32_t>(h_ * (1.0 / 30));
    windowClearLock(this, 2);
    setDisp(true, true);
    layout();
    modal_ = true;
    return true;
}

// @yo2 0x005e4270 CWindowModelThin::setPanelAlpha
void CWindowModelThin::setPanelAlpha(float a) {
    textField_->back_.get()->setColor(1, 1, 1, a);
    frame_->setAlpha(a);
}

// @yo2 0x005e42e0 CWindowModelThin::layout: frame around the window, the text field 8 pixels inside it
void CWindowModelThin::layout() {
    pos_ = {x_, y_, z_};
    textField_->setText(title_.c_str());
    CWindowTaskFrameThin* f = frame_.get();
    f->w_ = w_;
    f->h_ = h_;
    f->layout();
    f->z_ = 0;
    f->pos_.z = 0;
    CWindowTaskTextField* t = textField_.get();
    t->x_ = t->y_ = 8;
    t->pos_.x = t->pos_.y = 8;
    t->h_ = h_ - 16.0f;
    t->w_ = w_ - 16.0f;
    t->layout();
    t->posZ_ = 0;
    t->layout();
}

// @yo2 0x005e4470 CWindowModelThin::setText
void CWindowModelThin::setText(const WChar* s) { title_ = s; }

// @yo2 0x005e3d00 CWindowModelThin::onControlCommand (the exe also formats z_ into an unused buffer)
void CWindowModelThin::onControlCommand(CWindowTaskControll*) {
    bringToFront();
    layout();
}

// --- CWindowModelDialogWithBtns ----------------------------------------------------------------------------------

// (inlined into the YesNo / Ok constructors)
CWindowModelDialogWithBtns::CWindowModelDialogWithBtns() { setTaskName("ダイアログの基底ウィンドウ"); }

// @yo2 0x005e6790 CWindowModelDialogWithBtns::~CWindowModelDialogWithBtns
// @yo2 0x005e6650 CWindowModelDialogWithBtns deleting destructor
CWindowModelDialogWithBtns::~CWindowModelDialogWithBtns() = default;

// @yo2 0x005e65b0 CWindowModelDialogWithBtns::onMain
bool CWindowModelDialogWithBtns::onMain() {
    layout();
    return true;
}

// @yo2 0x005e64e0 CWindowModelDialogWithBtns::setText
void CWindowModelDialogWithBtns::setText(const WChar* s) { textField_->setText(s); }

// @yo2 0x005e64b0 CWindowModelDialogWithBtns::setBandHeight
void CWindowModelDialogWithBtns::setBandHeight(float h) {
    bandH_ = h;
    layout();
}

// @yo2 0x005e6510 CWindowModelDialogWithBtns::setTextColor
void CWindowModelDialogWithBtns::setTextColor(float r, float g, float b, float a) {
    textField_->text_.get()->setColor(r, g, b, a);
}

// @yo2 0x005e6550 CWindowModelDialogWithBtns::setTextAlign
void CWindowModelDialogWithBtns::setTextAlign(int32_t align) { textField_->text_.get()->setAlign(align); }

void CWindowModelDialogWithBtns::useOwnCallback() {
    setCallback(CCallbackM3<CDialogCallback, int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, intptr_t>(
        &dialog_, &CDialogCallback::onResult));
}

// The frame over the whole window with the band at the bottom; the text field 8 pixels inside, above the band.
void CWindowModelDialogWithBtns::layoutBody() {
    CWindowTaskFrameBottomThick* f = frame_;
    f->x_ = f->y_ = 0;
    f->pos_.x = f->pos_.y = 0;
    f->w_ = w_;
    f->h_ = h_;
    f->layout();
    f->bottomH_ = bandH_;
    f->layout();
    f->z_ = 0;
    f->pos_.z = 0;
    CWindowTaskTextField* t = textField_;
    t->x_ = t->y_ = 8;
    t->pos_.x = t->pos_.y = 8;
    t->w_ = w_ - 16.0f;
    t->h_ = (h_ - 16.0f) - bandH_;
    t->layout();
    t->posZ_ = 0;
    t->layout();
}

// --- CWindowModelDialogYesNo -------------------------------------------------------------------------------------

// @yo2 0x005e6a60 CWindowModelDialogYesNo::create (priority 10000; the parts are made before the task is)
CWindowModelDialogYesNo* CWindowModelDialogYesNo::create(CTask* parent, float x, float y, int32_t yesTextId,
                                                         int32_t noTextId, int32_t style) {
    auto* d = new CWindowModelDialogYesNo;
    d->setup(x, y, yesTextId, noTextId, style);
    return dynamic_cast<CWindowModelDialogYesNo*>(d->CTask::create(parent, 10000));
}

// @yo2 0x005e6210 CWindowModelDialogYesNo::CWindowModelDialogYesNo
CWindowModelDialogYesNo::CWindowModelDialogYesNo() { setTaskName("『はい』『いいえ』ダイアログ"); }

// @yo2 0x005e6920 CWindowModelDialogYesNo::~CWindowModelDialogYesNo
// @yo2 0x005e68f0 CWindowModelDialogYesNo deleting destructor
CWindowModelDialogYesNo::~CWindowModelDialogYesNo() = default;

// @yo2 0x005e6b50 CWindowModelDialogYesNo::setup: 336 x 144, frame, message, the two buttons; focus on 『いいえ』
void CWindowModelDialogYesNo::setup(float x, float y, int32_t yesTextId, int32_t noTextId, int32_t style) {
    x_ = x;
    y_ = y;
    kind_ = 1;
    callback_ = nullptr;
    w_ = 336;
    h_ = 144;
    yesTextId_ = yesTextId;
    noTextId_ = noTextId;
    style_ = style;
    frame_ = CWindowTaskFrameBottomThick::create(this, this, style);
    windowNameTask(frame_, "CWindowModelDialogYesNoのフレーム");
    textField_ = CWindowTaskTextField::create(this, this);
    windowNameTask(textField_, "CWindowModelDialogYesNoのテキストフィールド");
    yes_ = CWindowTaskTextSwitch::create(this, this);
    windowNameTask(yes_, "CWindowModelDialogYesNoの『はい』ボタン");
    yes_->setMediator(this);
    yes_->setText(windowText(yesTextId_).c_str());
    no_ = CWindowTaskTextSwitch::create(this, this);
    windowNameTask(no_, "CWindowModelDialogYesNoの『いいえ』ボタン");
    no_->setText(windowText(noTextId_).c_str());
    no_->setMediator(this);
    bandH_ = 32;
    textField_->back_.get()->setColor(1, 1, 1, kAlpha);
    textField_->posZ_ = 0;
    textField_->layout();
    frame_->setAlpha(kAlpha);
    useOwnCallback();
    CWindowModelDialogYesNo::layout();
    modal_ = true;
    g_windowFactory->setFocus(no_);
}

// @yo2 0x005e71c0 CWindowModelDialogYesNo::layout: the two 80 x 24 buttons centred in each half of the band
void CWindowModelDialogYesNo::layout() {
    pos_ = {x_, y_, z_};
    float half = w_ * 0.5f;
    float by = bandButtonY(this, yes_);
    yes_->x_ = (half - yes_->w_) * 0.5f;
    yes_->y_ = by;
    yes_->pos_.y = by;
    yes_->pos_.x = yes_->x_;
    yes_->w_ = 80;
    yes_->h_ = 24;
    yes_->layout();
    yes_->z_ = 1;
    yes_->pos_.z = 1;
    no_->y_ = by;
    no_->pos_.y = by;
    no_->x_ = (half - no_->w_) * 0.5f + half;
    no_->pos_.x = no_->x_;
    no_->w_ = 80;
    no_->h_ = 24;
    no_->layout();
    no_->z_ = 1;
    no_->pos_.z = 1;
    layoutBody();
}

// @yo2 0x005e7450 CWindowModelDialogYesNo::onControlEvent: a button was pressed -> callback (YES / NO)
void CWindowModelDialogYesNo::onControlEvent(CWindowTaskControll* sender) {
    bringToFront();
    if (!callback_)
        return;
    if (sender == yes_) {
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), CDialogCallback::YES);
        layout();
        return;
    }
    if (sender == no_)
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), CDialogCallback::NO);
    layout();
}

// @yo2 0x005e74f0 CWindowModelDialogYesNo::mediatorSlot2: focus to the other button
void CWindowModelDialogYesNo::mediatorSlot2(CWindowTaskControll* sender) {
    if (sender == yes_)
        g_windowFactory->setFocus(no_);
    else if (sender == no_)
        g_windowFactory->setFocus(yes_);
}

// @yo2 0x005e7570 CWindowModelDialogYesNo::mediatorSlot3: focus to the other button
void CWindowModelDialogYesNo::mediatorSlot3(CWindowTaskControll* sender) {
    if (sender == yes_)
        g_windowFactory->setFocus(no_);
    else if (sender == no_)
        g_windowFactory->setFocus(yes_);
}

// --- CWindowModelDialogOk ----------------------------------------------------------------------------------------

// @yo2 0x005e79f0 CWindowModelDialogOk::create (priority 10000)
CWindowModelDialogOk* CWindowModelDialogOk::create(CTask* parent, float x, float y, int32_t okTextId,
                                                   int32_t style) {
    auto* d = new CWindowModelDialogOk;
    d->setup(x, y, okTextId, style);
    return dynamic_cast<CWindowModelDialogOk*>(d->CTask::create(parent, 10000));
}

// @yo2 0x005e7ae0 CWindowModelDialogOk::setup
void CWindowModelDialogOk::setup(float x, float y, int32_t okTextId, int32_t style) {
    okTextId_ = okTextId;
    x_ = x;
    y_ = y;
    style_ = style;
}

// @yo2 0x005e75f0 CWindowModelDialogOk::CWindowModelDialogOk
CWindowModelDialogOk::CWindowModelDialogOk() { setTaskName("『OK』ダイアログ"); }

// @yo2 0x005e78b0 CWindowModelDialogOk::~CWindowModelDialogOk
// @yo2 0x005e7880 CWindowModelDialogOk deleting destructor
CWindowModelDialogOk::~CWindowModelDialogOk() = default;

// @yo2 0x005e7b20 CWindowModelDialogOk::onInit: 336 x 144, frame, message, the button; shown modal
bool CWindowModelDialogOk::onInit() {
    kind_ = 2;
    callback_ = nullptr;
    w_ = 336;
    h_ = 144;
    frame_ = CWindowTaskFrameBottomThick::create(this, this, style_);
    windowNameTask(frame_, "CWindowModelDialogOkのフレーム");
    w_ = 336;
    h_ = 144;
    textField_ = CWindowTaskTextField::create(this, this);
    windowNameTask(textField_, "CWindowModelDialogOkのテキストフィールド");
    ok_ = CWindowTaskTextSwitch::create(this, this);
    windowNameTask(ok_, "CWindowModelDialogOkの『OK』ボタン");
    ok_->setText(windowText(okTextId_).c_str());
    ok_->x_ = 128;
    ok_->y_ = 112;
    ok_->pos_.x = 128;
    ok_->pos_.y = 112;
    setBandHeight(32);
    dialogPanels(textField_, frame_);
    useOwnCallback();
    resetResult();
    g_windowFactory->setFocus(ok_);
    layout();
    modal_ = true;
    return true;
}

// @yo2 0x005e8020 CWindowModelDialogOk::layout: the button centred in the band
void CWindowModelDialogOk::layout() {
    pos_ = {x_, y_, z_};
    layoutBody();
    float by = bandButtonY(this, ok_);
    ok_->x_ = (w_ - ok_->w_) * 0.5f;
    ok_->y_ = by;
    ok_->pos_.y = by;
    ok_->pos_.x = ok_->x_;
    ok_->z_ = 2;
    ok_->pos_.z = 2;
}

// @yo2 0x005e81e0 CWindowModelDialogOk::onControlEvent: 『OK』 -> callback (YES)
void CWindowModelDialogOk::onControlEvent(CWindowTaskControll* sender) {
    bringToFront();
    if (!callback_)
        return;
    if (sender == ok_)
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), CDialogCallback::YES);
    layout();
}

// --- CWindowModelDialogError -------------------------------------------------------------------------------------

// @yo2 0x005f7b90 CWindowModelDialogError::create (OK text 4002, style 0, priority 10000)
CWindowModelDialogError* CWindowModelDialogError::create(CTask* parent) {
    auto* d = new CWindowModelDialogError;
    d->setup(0, 0, 4002, 0);
    return dynamic_cast<CWindowModelDialogError*>(d->CTask::create(parent, 10000));
}

// @yo2 0x005f7890 CWindowModelDialogError::CWindowModelDialogError
CWindowModelDialogError::CWindowModelDialogError() { setTaskName("エラー用ダイアログ"); }

// @yo2 0x005f7a00 CWindowModelDialogError::~CWindowModelDialogError
// @yo2 0x005f79d0 CWindowModelDialogError deleting destructor
CWindowModelDialogError::~CWindowModelDialogError() = default;

// @yo2 0x005f7c70 CWindowModelDialogError::onInit: the shield (screen-sized, at the screen's origin, alpha 0), then
// the OK dialog, centred, topmost
bool CWindowModelDialogError::onInit() {
    inheritTransform_ = true;
    shield_.setUser(this);
    shield_.set(CWindowTaskBackPlane::create(this, this));
    windowNameTask(shield_.task(), "エラーダイアログ以外操作不可能にするためのダミー背景");
    CWindowTaskBackPlane* s = shield_.get();
    s->inheritTransform_ = true;
    Vec3 at = worldTranslation();
    s->pos_ = {-at.x, -at.y, 0};
    s->w_ = 1024;
    s->h_ = 768;
    s->layout();
    s->color_[3] = 0;
    CWindowModelDialogOk::onInit();
    centre();
    layout();
    setTopmost(true);
    bringToFront();
    g_gameCtrl.enter(CTRL_ERROR);
    return true;
}

// @yo2 0x005f7e00 CWindowModelDialogError::onDestroy
void CWindowModelDialogError::onDestroy() {
    g_gameCtrl.leave(CTRL_ERROR);
    CWindowTaskModel::onDestroy();
}

// @yo2 0x005f7e30 CWindowModelDialogError::layout: the shield stays on the screen's origin
void CWindowModelDialogError::layout() {
    CWindowModelDialogOk::layout();
    CWindowTaskBackPlane* s = shield_.get();
    s->x_ = s->pos_.x = -x_;
    s->y_ = s->pos_.y = -y_;
    s->z_ = 0;
    s->pos_.z = 0;
    s->w_ = 1024;
    s->h_ = 768;
    s->layout();
    bringToFront();
}

// --- CWindowModelList -------------------------------------------------------------------------------------------

// @yo2 0x005ee5d0 CWindowModelList::create (priority 10000)
// @yo2 0x005ee6b0 CWindowModelList::setup (the position)
CWindowModelList* CWindowModelList::create(CTask* parent, float x, float y) {
    auto* w = new CWindowModelList;
    w->x_ = x;
    w->y_ = y;
    return dynamic_cast<CWindowModelList*>(w->CTask::create(parent, 10000));
}

// @yo2 0x005ee180 CWindowModelList::CWindowModelList
CWindowModelList::CWindowModelList() { setTaskName("単純なリストのウィンドウ"); }

// @yo2 0x005ee530 CWindowModelList::~CWindowModelList
// @yo2 0x005ee500 CWindowModelList deleting destructor
CWindowModelList::~CWindowModelList() = default;

// @yo2 0x005ee8a0 CWindowModelList::onInit: icon bar, frame under it, the list inside, × at the right, modal
bool CWindowModelList::onInit() {
    bar_.setUser(this);
    hide_.setUser(this);
    frame_.setUser(this);
    list_.setUser(this);
    unk3c8_ = false;
    closeRequested_ = false;
    pos_ = {x_, y_, z_};
    w_ = 248;
    h_ = 128;
    bar_.set(CWindowTaskIconbar::create(this, this));
    windowNameTask(bar_.task(), "CWindowModelListのアイコンバー");
    bar_->setInstName("CWindowModelListの");   // sic: renamed right away
    bar_->w_ = 248;
    bar_->layout();
    bar_->z_ = 0;
    bar_->pos_.z = 0;
    frame_.set(CWindowTaskThinChop::create(this, this));
    windowNameTask(frame_.task(), "CWindowModelListのフレーム");
    frame_->x_ = 0;
    frame_->y_ = 24;
    frame_->pos_.x = 0;
    frame_->pos_.y = 24;
    frame_->z_ = 0;
    frame_->pos_.z = 0;
    list_.set(CWindowTaskActiveListbox::create(this, this, false));
    windowNameTask(list_.task(), "CWindowModelListのリストボックス");
    list_->setPos(8, 24);
    list_->setSize(232, 96);
    hide_.set(CWindowTaskIconHide::create(this, this));
    windowNameTask(hide_.task(), "CWindowModelListの×ボタン");
    hide_->x_ = w_ - 19.0f;
    hide_->y_ = 0;
    hide_->layout();
    hide_->z_ = 1;
    hide_->layout();
    modal_ = true;
    layout();
    return true;
}

// @yo2 0x005ee6e0 CWindowModelList::layout
void CWindowModelList::layout() {
    pos_ = {x_, y_, z_};
    CWindowTaskIconbar* bar = bar_.get();
    bar->w_ = w_;
    bar->layout();
    windowClearLock(bar, 2);
    bar->setDisp(true, true);
    CWindowTaskThinChop* f = frame_.get();
    f->h_ = h_ - 24.0f;
    f->w_ = w_;
    f->layout();
    list_->setSize(w_ - 16.0f, h_ - 24.0f - 8.0f);
    CWindowTaskIconHide* x = hide_.get();
    x->x_ = w_ - 19.0f;
    x->y_ = 0;
    x->layout();
}

// @yo2 0x005ee360 CWindowModelList::setPos
void CWindowModelList::setPos(float x, float y) {
    x_ = x;
    y_ = y;
    pos_.x = x;
    pos_.y = y;
}

// @yo2 0x005ef420 CWindowModelList::onControlEvent: the × asks to close
void CWindowModelList::onControlEvent(CWindowTaskControll* sender) {
    if (sender == dynamic_cast<CWindowTaskIconHide*>(hide_.task()))
        closeRequested_ = true;
}

// @yo2 0x005ef320 CWindowModelList::addItem
void CWindowModelList::addItem(const WChar* s) { list_->addItem(s); }

// @yo2 0x005ef390 CWindowModelList::clear
void CWindowModelList::clear() {
    list_->clear();
    layout();
}

// @yo2 0x005ef3c0 CWindowModelList::reset
void CWindowModelList::reset() {
    list_->reset();
    layout();
}

// --- CWindowModelDialogDecorator ---------------------------------------------------------------------------------

// @yo2 0x0077a8e0 CWindowModelDialogDecorator deleting destructor
CWindowModelDialogDecorator::~CWindowModelDialogDecorator() = default;

// @yo2 0x0077a820 CWindowModelDialogDecorator::onMain
bool CWindowModelDialogDecorator::onMain() { return inner_ ? inner_->onMain() : true; }

// @yo2 0x0077a720 CWindowModelDialogDecorator::applyZ
void CWindowModelDialogDecorator::applyZ() {
    if (inner_)
        inner_->applyZ();
}

// @yo2 0x0077a630 CWindowModelDialogDecorator::layout
void CWindowModelDialogDecorator::layout() {
    if (inner_)
        inner_->layout();
}

// @yo2 0x0077a740 CWindowModelDialogDecorator::maxZ
int32_t CWindowModelDialogDecorator::maxZ() const { return inner_ ? inner_->maxZ() : static_cast<int32_t>(z_); }

// @yo2 0x0077a680 CWindowModelDialogDecorator::setText
void CWindowModelDialogDecorator::setText(const WChar* s) {
    if (inner_)
        inner_->setText(s);
}

// @yo2 0x0077a850 CWindowModelDialogDecorator::onControlEvent
void CWindowModelDialogDecorator::onControlEvent(CWindowTaskControll* sender) {
    if (inner_)
        inner_->onControlEvent(sender);
}

// @yo2 0x0077a770 CWindowModelDialogDecorator::onControlCommand
void CWindowModelDialogDecorator::onControlCommand(CWindowTaskControll* sender) {
    if (inner_)
        inner_->onControlCommand(sender);
}

// @yo2 0x0077a880 CWindowModelDialogDecorator::mediatorSlot2
void CWindowModelDialogDecorator::mediatorSlot2(CWindowTaskControll* sender) {
    if (inner_)
        inner_->mediatorSlot2(sender);
}

// @yo2 0x0077a8b0 CWindowModelDialogDecorator::mediatorSlot3
void CWindowModelDialogDecorator::mediatorSlot3(CWindowTaskControll* sender) {
    if (inner_)
        inner_->mediatorSlot3(sender);
}

// @yo2 0x0077a650 CWindowModelDialogDecorator::setBandHeight
void CWindowModelDialogDecorator::setBandHeight(float h) {
    if (inner_)
        inner_->setBandHeight(h);
}

// @yo2 0x0077a6b0 CWindowModelDialogDecorator::setTextColor
void CWindowModelDialogDecorator::setTextColor(float r, float g, float b, float a) {
    if (inner_)
        inner_->setTextColor(r, g, b, a);
}

// @yo2 0x0077a6f0 CWindowModelDialogDecorator::setTextAlign
void CWindowModelDialogDecorator::setTextAlign(int32_t align) {
    if (inner_)
        inner_->setTextAlign(align);
}

// @yo2 0x0077a7a0 CWindowModelDialogDecorator::result
int32_t CWindowModelDialogDecorator::result() const { return inner_ ? inner_->result() : 0; }

// @yo2 0x0077a7d0 CWindowModelDialogDecorator::resetResult
void CWindowModelDialogDecorator::resetResult() {
    if (inner_)
        inner_->resetResult();
}

// @yo2 0x0077a7f0 CWindowModelDialogDecorator::textField
CWindowTaskTextField* CWindowModelDialogDecorator::textField() const { return inner_ ? inner_->textField() : nullptr; }
