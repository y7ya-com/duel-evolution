#include "Game/yo2InfoDlgCommon.h"

#include <string>

#include "Game/yo2GameData.h"
#include "System/yo2Debug.h"
#include "System/yo2StringDB.h"

CInfoDlgCommon::CInfoDlgCommon() {
    unused74_.setUser(this);
    setTaskName("CInfoDlgCommon");
}

// @yo2 0x00a5eb40 CInfoDlgCommon::~CInfoDlgCommon
// @yo2 0x00a5eaf0 CInfoDlgCommon deleting destructor
CInfoDlgCommon::~CInfoDlgCommon() = default;

CInfoDlgCommon* CInfoDlgCommon::finish(CInfoDlgCommon* d, CTask* parent, uint32_t flags) {
    d->flags_ = flags;
    return dynamic_cast<CInfoDlgCommon*>(d->CTask::create(parent, 10000));
}

// The message of the file variants: the file's bytes up to the first NUL (CFile::GetMemory + strlen).
static vc6::string fileText(const vc6::string& path) {
    std::string b;
    gameReadFile(path.c_str(), &b);
    return vc6::string(b.c_str());
}

// @yo2 0x00a5e890 CInfoDlgCommon::create (text-table message, SIMPLE)
CInfoDlgCommon* CInfoDlgCommon::createText(CTask* parent, CTask* owner, int32_t kind, uint32_t textId,
                                           uint32_t flags) {
    auto* d = new CInfoDlgCommon;
    d->owner_ = owner;
    d->kind_ = kind;
    d->message_ = g_stringDB->get(textId);
    return finish(d, parent, flags | SIMPLE);
}

// @yo2 0x00a5ec10 CInfoDlgCommon::create (string message, SIMPLE)
CInfoDlgCommon* CInfoDlgCommon::create(CTask* parent, CTask* owner, int32_t kind, const vc6::string& message,
                                       uint32_t flags) {
    auto* d = new CInfoDlgCommon;
    d->owner_ = owner;
    d->kind_ = kind;
    d->message_ = message;
    return finish(d, parent, flags | SIMPLE);
}

// @yo2 0x00a5ee60 CInfoDlgCommon::create (message read from a data file, SIMPLE)
CInfoDlgCommon* CInfoDlgCommon::createFile(CTask* parent, CTask* owner, int32_t kind, const vc6::string& path,
                                           uint32_t flags) {
    auto* d = new CInfoDlgCommon;
    d->kind_ = kind;
    d->owner_ = owner;
    d->message_ = fileText(path);
    return finish(d, parent, flags | SIMPLE);
}

// @yo2 0x00a5f130 CInfoDlgCommon::create (text-table message, WITH_ARG)
CInfoDlgCommon* CInfoDlgCommon::createText(CTask* parent, CTask* owner, int32_t kind, int32_t arg, uint32_t textId,
                                           uint32_t flags) {
    auto* d = new CInfoDlgCommon;
    d->arg_ = arg;
    d->owner_ = owner;
    d->kind_ = kind;
    d->message_ = g_stringDB->get(textId);
    return finish(d, parent, flags | WITH_ARG);
}

// @yo2 0x00a5f390 CInfoDlgCommon::create (string message, WITH_ARG)
CInfoDlgCommon* CInfoDlgCommon::create(CTask* parent, CTask* owner, int32_t kind, int32_t arg,
                                       const vc6::string& message, uint32_t flags) {
    auto* d = new CInfoDlgCommon;
    d->owner_ = owner;
    d->kind_ = kind;
    d->arg_ = arg;
    d->message_ = message;
    return finish(d, parent, flags | WITH_ARG);
}

// @yo2 0x00a5f5f0 CInfoDlgCommon::create (message read from a data file, WITH_ARG)
CInfoDlgCommon* CInfoDlgCommon::createFile(CTask* parent, CTask* owner, int32_t kind, int32_t arg,
                                           const vc6::string& path, uint32_t flags) {
    auto* d = new CInfoDlgCommon;
    d->kind_ = kind;
    d->owner_ = owner;
    d->arg_ = arg;
    d->message_ = fileText(path);
    return finish(d, parent, flags | WITH_ARG);
}

// @yo2 0x00a5f8e0 CInfoDlgCommon::onInit: the dialog under owner_, sized and placed by flags_, with the message
bool CInfoDlgCommon::onInit() {
    dialog_.setUser(this);
    if (flags_ & SIMPLE)
        dialog_.set(CWindowModelDialogOk::create(owner_, 0, 0, kind_, 1));
    else
        dialog_.set(CWindowModelDialogYesNo::create(owner_, 0, 0, kind_, arg_, 1));
    YO2_ASSERT(dynamic_cast<CWindowModelDialogWithBtns*>(dialog_.task()),
               "error CInfoDlgCommon::CWindowModelDialogYesNo::Create()");
    CWindowModelDialogWithBtns* d = dialog_.get();
    d->setInstName("CInfoDlgCommon::m_dialogOk");
    float w = 480, h = 272;
    if (flags_ & 0x1000)
        w = 272, h = 120;
    else if (flags_ & 0x2000)
        w = 544, h = 400;
    else if (flags_ & 0x4000)
        w = 672, h = 600;
    else if (flags_ & 0x8000)
        w = 1024, h = 736;
    d->w_ = w;
    d->h_ = h;
    d->layout();
    d->setText(windowWiden(message_.c_str()).c_str());   // TODO(System): Shift-JIS widening (0x005977b0)
    if (flags_ & 1)
        d->x_ = d->pos_.x = 64;
    else if (flags_ & 2)
        d->x_ = d->pos_.x = d->w_ - 64;   // sic: the window's width, not the screen's
    if (flags_ & 4)
        d->y_ = d->pos_.y = 64;
    else if (flags_ & 8)
        d->y_ = d->pos_.y = d->h_ - 64;
    if ((flags_ & 0xf) == 0)
        d->centre();
    d->setTextAlign((flags_ & 0x100) ? 1 : 0);
    return true;
}

// @yo2 0x00a60460 CInfoDlgCommon::onMain: once answered, the OK / cancel sound and the dialog is closed
bool CInfoDlgCommon::onMain() {
    if (!dynamic_cast<CWindowModelDialogWithBtns*>(dialog_.task()))
        return true;
    int32_t r = dialog_->result();
    if (r == CDialogCallback::YES || r == 4002) {
        // TODO(Sound): 0x00686560(0x10000001, 0), the OK sound
        dialog_->destroy(__FILE__, 157);
    } else if (r == CDialogCallback::NO) {
        // TODO(Sound): 0x00686560(0x10000002, 0), the cancel sound
        dialog_->destroy(__FILE__, 161);
    }
    return true;
}
