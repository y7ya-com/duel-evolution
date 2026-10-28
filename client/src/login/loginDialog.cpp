#include "loginDialog.h"

#include "loginExt.h"
#include "System/yo2Debug.h"

struct CWindowLogin::Layout {
    YO2_AT(CWindowLogin, frameLogin_, 0x400);
    YO2_AT(CWindowLogin, message_, 0x40c);
    YO2_AT(CWindowLogin, textId_, 0x418);
    YO2_AT(CWindowLogin, inputId_, 0x430);
    YO2_AT(CWindowLogin, inputPass_, 0x43c);
    YO2_AT(CWindowLogin, textCheckId_, 0x448);
    YO2_AT(CWindowLogin, checkId_, 0x460);
    YO2_AT(CWindowLogin, checkPass_, 0x46c);
    YO2_AT(CWindowLogin, buttonOk_, 0x478);
    YO2_AT(CWindowLogin, buttonCancel_, 0x484);
    YO2_AT(CWindowLogin, textDemoId_, 0x490);
    YO2_AT(CWindowLogin, textDemoPass_, 0x49c);
};

namespace {
enum : int32_t {
    TXT_MESSAGE = 0xc21,     // "enter your user ID and password"
    TXT_ID = 0xbb8,
    TXT_PASSWORD = 0xbb9,
    TXT_SAVE_ID = 0xbba,
    TXT_SAVE_PASSWORD = 0xbbb,
};
constexpr uint32_t LOCK_HIDDEN = 2;   // CTask lock bit: no TM_MAIN while hidden

// CTask::lockFlags_ is protected; the exe ORs the bit in directly (+0x20).
struct TaskLockAccess : CTask {
    static void lock(CTask* t, uint32_t mask) { t->*(&TaskLockAccess::lockFlags_) |= mask; }
};
// CWindowTaskText::hide / show (0x005d5700 / 0x005d56d0), on any control
void hideControl(CElement* c) {
    c->setDisp(false, true);
    TaskLockAccess::lock(c, LOCK_HIDDEN);
}
void showControl(CElement* c) {
    windowClearLock(c, LOCK_HIDDEN);
    c->setDisp(true, true);
}
void makeLabel(CWindowTaskText* t, float x, float y, int32_t w, int32_t align) {
    t->setPos(x, y);
    t->setArea(w, 16);
    t->setAlign(align);
}
}  // namespace

// @yo2 0x007fdac0 CWindowLogin::New (the constructor is inlined into it): x, y and the OK text, then into the tree
CWindowLogin* CWindowLogin::create(CTask* parent, float x, float y, int32_t okTextId) {
    auto* w = new CWindowLogin;
    w->okTextId_ = okTextId;
    w->x_ = x;
    w->y_ = y;
    return dynamic_cast<CWindowLogin*>(w->CTask::create(parent, 10000));
}

CWindowLogin::CWindowLogin() = default;

// @yo2 0x007fdde0 CWindowLogin::~CWindowLogin
// @yo2 0x007fddb0 CWindowLogin deleting destructor
CWindowLogin::~CWindowLogin() = default;

// @yo2 0x007fe0d0 CWindowLogin::onInit: 464 x 264 with a 184-high band; message on top, the two inputs and their
// labels, the two check boxes, OK / Cancel; the ID input has the focus. With the ID fixed by the launcher, the inputs
// and check boxes give way to two plain labels.
bool CWindowLogin::onInit() {
    callback_ = nullptr;
    textField_ = CWindowTaskTextField::create(this, this);
    YO2_ASSERT(textField_ != nullptr, "CWindowTaskTextField NULL error");
    textField_->setInstName("タイトル文字");
    hideControl(textField_);
    pos_ = Vec3{x_, y_, z_};

    frameLogin_.setUser(this);
    frameLogin_.set(CWindowTaskFrameBottomThick::create(this, this, 1));
    YO2_ASSERT(frameLogin_.task() != nullptr, "m_frame NULL NULL error");
    CWindowTaskFrameBottomThick* frame = frameLogin_.get();
    frame->w_ = 464;
    frame->h_ = 264;
    frame->layout();
    frame->bottomH_ = 184;
    frame->layout();
    frame->z_ = 0;
    frame->pos_.z = 0;

    message_.setUser(this);
    message_.set(CWindowTaskTextField::create(this, this));
    YO2_ASSERT(message_.task() != nullptr, "m_message NULL error");
    CWindowTaskTextField* message = message_.get();
    message->x_ = message->y_ = 8;
    message->pos_.x = message->pos_.y = 8;
    message->w_ = 448;
    message->h_ = 64;
    message->layout();
    message->setTextId(TXT_MESSAGE);

    const struct { CTaskPtr<CWindowTaskText>* ptr; const char* error; float y; int32_t text; } labels[] = {
        {&textId_, "m_textId NULL error", 80, TXT_ID}, {&textPass_, "m_textPass NULL error", 144, TXT_PASSWORD}};
    for (const auto& l : labels) {
        l.ptr->setUser(this);
        l.ptr->set(CWindowTaskText::create(this, this));
        YO2_ASSERT(l.ptr->task() != nullptr, "%s", l.error);
        CWindowTaskText* t = l.ptr->get();
        t->x_ = 8;
        t->y_ = l.y;
        t->pos_ = Vec3{8, l.y, t->posZ_};
        t->setFontSize(16);
        t->setTextId(l.text);
        t->posZ_ = t->pos_.z = 3;
    }

    const struct { CTaskPtr<CWindowTaskControll>* ptr; const char* error; float y; bool password; } inputs[] = {
        {&inputId_, "m_inputId NULL error", 96, false}, {&inputPass_, "m_inputPass NULL error", 160, true}};
    for (const auto& in : inputs) {
        in.ptr->setUser(this);
        in.ptr->set(inputCreate(this, this, 1));
        YO2_ASSERT(in.ptr->task() != nullptr, "%s", in.error);
        CWindowTaskControll* c = in.ptr->get();
        inputSetRect(c, 64, in.y, 336, 32);
        inputSetMaxLength(c, 20);
        if (in.password)
            inputSetPassword(c, true);
        c->z_ = 2;
        c->layout();
        inputSetFlags3f6_3fd(c);
        if (!in.password)
            g_windowFactory->setFocus(c);
    }

    const struct { CTaskPtr<CWindowTaskText>* ptr; const char* error; float x, y; int32_t align, text; } texts[] = {
        {&textDemoId_, "m_textDemoId NULL error", 64, 96, CWindowTaskText::LEFT, 0},
        {&textDemoPass_, "m_textDemoPass NULL error", 64, 160, CWindowTaskText::LEFT, 0},
        {&textCheckId_, "m_textCheckId NULL error", 0, 128, CWindowTaskText::RIGHT, TXT_SAVE_ID},
        {&textCheckPass_, "m_textCheckPass NULL error", 0, 192, CWindowTaskText::RIGHT, TXT_SAVE_PASSWORD}};
    for (const auto& t : texts) {
        t.ptr->setUser(this);
        t.ptr->set(CWindowTaskText::create(this, this));
        YO2_ASSERT(t.ptr->task() != nullptr, "%s", t.error);
        CWindowTaskText* c = t.ptr->get();
        makeLabel(c, t.x, t.y, 0x1a8, t.align);
        if (t.text)
            c->setTextId(t.text);
        else
            c->setTextA("");
        c->posZ_ = c->pos_.z = 3;
        if (!t.text)
            hideControl(c);   // the stand-ins stay hidden unless the ID is fixed
    }

    const struct { CTaskPtr<CWindowTaskControll>* ptr; const char* error; float y; } checks[] = {
        {&checkId_, "m_checkId NULL error", 128}, {&checkPass_, "m_checkPass NULL error", 192}};
    for (const auto& c : checks) {
        c.ptr->setUser(this);
        c.ptr->set(checkboxCreate(this, this));
        YO2_ASSERT(c.ptr->task() != nullptr, "%s", c.error);
        c.ptr->get()->pos_ = Vec3{424, c.y, 2};
    }

    buttonOk_.setUser(this);
    buttonOk_.set(CWindowTaskTextSwitch::create(this, this));
    YO2_ASSERT(buttonOk_.task() != nullptr, "m_buttonOk NULL error");
    placeButton(buttonOk_.get(), RESULT_OK, 120);
    buttonCancel_.setUser(this);
    buttonCancel_.set(CWindowTaskTextSwitch::create(this, this));
    YO2_ASSERT(buttonCancel_.task() != nullptr, "m_buttonCancel NULL error");
    placeButton(buttonCancel_.get(), RESULT_CANCEL, 280);

    useOwnCallback();
    layout();
    modal_ = true;

    if (systemConfigLoginIdLocked()) {
        // "■ユーザＩＤは変更禁止"
        for (CTaskPtr<CWindowTaskControll>* c : {&inputId_, &inputPass_, &checkId_, &checkPass_}) {
            hideControl(c->get());
            c->get()->enabled_ = false;
        }
        hideControl(textCheckId_.get());
        hideControl(textCheckPass_.get());
        showControl(textDemoId_.get());
        showControl(textDemoPass_.get());
    }
    return true;
}

// @yo2 0x00801e00 CWindowTaskTextSwitch::setMinSize (inlined copy in this file): minW_ / +0x5b4, then layout
// @yo2 0x00801db0 CWindowTaskSwitch::rect (inlined copy in this file): x_, y_, w_, h_
// A button 80 x 24 at least, centred on centreX (the exe's 120 / 280 - (w - 80) / 2), 224 down, reporting textId.
void CWindowLogin::placeButton(CWindowTaskTextSwitch* b, int32_t textId, float centreX) {
    b->minW_ = 80;
    b->unk5b4_ = 24;
    b->layout();
    b->setTextId(textId);
    const float x = static_cast<float>(centreX - (b->w_ - 80.0) * 0.5);
    b->x_ = b->pos_.x = x;      // CWindowTaskSwitch::setPos (0x005e99d0)
    b->y_ = b->pos_.y = 224;
    b->z_ = b->pos_.z = 2;
    b->unk364_ = static_cast<uint32_t>(textId);
}

// @yo2 0x00802130 CWindowLogin::layout (empty)
void CWindowLogin::layout() {}

bool CWindowLogin::onMain() {
    layout();
    return true;
}
void CWindowLogin::applyZ() {
    pos_.z = z_;
    layout();
}
void CWindowLogin::setBandHeight(float h) {
    bandH_ = h;
    layout();
}

// @yo2 0x00801e30 CWindowLogin::onControlEvent: Enter in an input or OK sends OK, Cancel sends Cancel; unticking
// "save the ID" unticks "save the password", ticking the latter ticks the former
void CWindowLogin::onControlEvent(CWindowTaskControll* sender) {
    bringToFront();
    if (!callback_)
        return;
    for (CWindowTaskControll* in : {inputId_.task() ? inputId_.get() : nullptr,
                                    inputPass_.task() ? inputPass_.get() : nullptr})
        if (in && sender == in && inputEntered(in)) {
            soundPlay(SE_ENTER, 0);
            callback_->call(this, CALLBACK_MESSAGE_TYPE(0), RESULT_OK);
        }
    if (sender == buttonOk_.task()) {
        soundPlay(SE_ENTER, 0);
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), RESULT_OK);
    }
    if (sender == buttonCancel_.task()) {
        soundPlay(SE_BACK, 0);
        callback_->call(this, CALLBACK_MESSAGE_TYPE(0), RESULT_CANCEL);
    }
    if (sender == checkId_.task()) {
        soundPlay(SE_CHECK, 0);
        if (!checkboxChecked(checkId_.get()))
            checkboxSetChecked(checkPass_.get(), false);
    }
    if (sender == checkPass_.task()) {
        soundPlay(SE_CHECK, 0);
        if (checkboxChecked(checkPass_.get()))
            checkboxSetChecked(checkId_.get(), true);
    }
}

// @yo2 0x00802f80 CWindowLogin::mediatorSlot2: the next control in the tab order
void CWindowLogin::mediatorSlot2(CWindowTaskControll* sender) {
    CTaskPtrBase* next = sender == buttonCancel_.task() ? static_cast<CTaskPtrBase*>(&inputId_)
                         : sender == inputId_.task()    ? static_cast<CTaskPtrBase*>(&inputPass_)
                         : sender == inputPass_.task()  ? static_cast<CTaskPtrBase*>(&buttonOk_)
                         : sender == buttonOk_.task()   ? static_cast<CTaskPtrBase*>(&buttonCancel_)
                                                        : nullptr;
    if (next)
        g_windowFactory->setFocus(dynamic_cast<CWindowTaskControll*>(next->task()));
}

// @yo2 0x008030e0 CWindowLogin::mediatorSlot3: the previous control in the tab order
void CWindowLogin::mediatorSlot3(CWindowTaskControll* sender) {
    CTaskPtrBase* prev = sender == buttonCancel_.task() ? static_cast<CTaskPtrBase*>(&buttonOk_)
                         : sender == inputId_.task()    ? static_cast<CTaskPtrBase*>(&buttonCancel_)
                         : sender == inputPass_.task()  ? static_cast<CTaskPtrBase*>(&inputId_)
                         : sender == buttonOk_.task()   ? static_cast<CTaskPtrBase*>(&inputPass_)
                                                        : nullptr;
    if (prev)
        g_windowFactory->setFocus(dynamic_cast<CWindowTaskControll*>(prev->task()));
}

// @yo2 0x00802150 CWindowLogin::userId: the ID input's text, narrowed
vc6::string CWindowLogin::userId() const { return narrow(inputText(inputId_.get())); }
// @yo2 0x00802470 CWindowLogin::password
vc6::string CWindowLogin::password() const { return narrow(inputText(inputPass_.get())); }
// @yo2 0x00802790 CWindowLogin::idChecked
bool CWindowLogin::idChecked() const { return checkboxChecked(checkId_.get()); }
// @yo2 0x008027c0 CWindowLogin::passChecked
bool CWindowLogin::passChecked() const { return checkboxChecked(checkPass_.get()); }

// @yo2 0x008027f0 CWindowLogin::setUserId (and the fixed-ID label)
void CWindowLogin::setUserId(vc6::string id) {
    inputSetText(inputId_.get(), windowWiden(id.c_str()));
    if (systemConfigLoginIdLocked())
        textDemoId_.get()->setTextA(id.c_str());
}

// @yo2 0x00802af0 CWindowLogin::setPassword (the fixed-ID label shows it as one '*' per byte)
void CWindowLogin::setPassword(vc6::string password) {
    inputSetText(inputPass_.get(), windowWiden(password.c_str()));
    if (systemConfigLoginIdLocked()) {
        vc6::string stars;
        for (size_t i = 0; i < password.size(); i++)
            stars += "*";
        textDemoPass_.get()->setTextA(stars.c_str());
    }
}

// @yo2 0x00802f20 CWindowLogin::setIdChecked
void CWindowLogin::setIdChecked(bool on) { checkboxSetChecked(checkId_.get(), on); }
// @yo2 0x00802f50 CWindowLogin::setPassChecked
void CWindowLogin::setPassChecked(bool on) { checkboxSetChecked(checkPass_.get(), on); }
