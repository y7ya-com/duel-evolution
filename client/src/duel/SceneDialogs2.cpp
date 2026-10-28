// yo2Dialogs.cpp part 2: CUSelectNumDialog (on CUDialogBaseOk), CUDiscardDialog (on CUGDialogBaseHP),
// CURitualDialog.
#include "EngineInternal.h"
#include "SceneDialogs.h"

namespace ds {

#if !YO2_IN_EXE
uint8_t g_ritualDialogOpen;   // DAT_012a7f08
#endif

namespace {
enum : uint32_t { VT_CCARDLOADER = 0x00bebbfc };
}   // namespace

vc6::wstring wformat4(const WChar* fmt, const WChar* a, const WChar* b, const WChar* c, const WChar* d) {
    const WChar* args[4] = {a, b, c, d};
    std::u16string out;
    int k = 0;
    for (const WChar* p = fmt; *p; p++) {
        if (p[0] == u'%' && p[1] == u's' && k < 4) {
            out += args[k++];
            p++;
        } else {
            out += *p;
        }
    }
    return vc6::wstring(std::u16string_view(out));
}

// ================================================================ CUSelectNumDialog

// @yo2 0x00778280 CUSelectNumDialog::CUSelectNumDialog(title, unit, min, max)
CUSelectNumDialog::CUSelectNumDialog(const WChar* t, const WChar* u, int32_t lo, int32_t hi)
    : unit(u), minValue(lo), maxValue(hi) {
    setTaskName("CUSelectNumDialog");
    value = minValue;
    title = t;
}

// @yo2 0x00778160 open the dialog under `parent`
CUSelectNumDialog* CUSelectNumDialog::create(CTask* parent, float x, float y, int32_t style, const WChar* title,
                                             const WChar* unit, int32_t lo, int32_t hi) {
    auto* d = new CUSelectNumDialog(title, unit, lo, hi);
    d->okTextId_ = DLG_OK;   // FUN_005e7ae0 (CWindowModelDialogOk::setup): text 4000, position, style
    d->x_ = x;
    d->y_ = y;
    d->style_ = style;
    auto* t = dynamic_cast<CUSelectNumDialog*>(d->CTask::create(parent, DLG_OK));
    t->refreshText();
    return t;
}

// @yo2 0x007787f0 CUSelectNumDialog::~CUSelectNumDialog
// @yo2 0x007787c0 CUSelectNumDialog scalar deleting destructor
CUSelectNumDialog::~CUSelectNumDialog() = default;

// @yo2 0x007789f0 the text: title, help lines 0x256 and 599, then the number in its unit format
void CUSelectNumDialog::refreshText() {
    WChar help1[0x100], help2[0x100], num[0x100];
    dlgTextW(help1, 0x256);
    dlgTextW(help2, 599);
    formatNumW(num, unit.c_str(), value);
    message = wformat4(u"%s\n%s\n%s\n%s", title.c_str(), help1, help2, num);   // DAT_00cd4f24
    setText(message.c_str());
}

// @yo2 0x00778ba0 slot 28: left / right step the number within [min, max]; OK sends it
void CUSelectNumDialog::tick() {
    CUDialogBaseOk::tick();
    if (answered_) return;
    if (!g_duelAuto) {
        if (fade_ != 0) return;
        if (keyPushed(KEY_LEFT)) {
            value = value - 1 < minValue ? minValue : value - 1;
            refreshText();
        }
        if (keyPushed(KEY_RIGHT)) {
            value = maxValue < value + 1 ? maxValue : value + 1;
            refreshText();
        }
        keyPushed(KEY_DECIDE);   // read and dropped
        if (result() != DLG_OK) return;   // CWindowModelDialogWithBtns slot 24: the button pressed
    }
    engSendChoice((uint32_t)value);
    unk3e8_ = 1;
}

// @yo2 0x00778cc0 onInit
bool CUSelectNumDialog::onInit() {
    CWindowModelDialogOk::onInit();
    setTextAlign(0);
    centre();
    movable_ = true;
    layout();
    fitToRect(this);
    return true;
}

// @yo2 0x00778d80 onMain
bool CUSelectNumDialog::onMain() {
    if (unk3e8_) return false;
    tick();
    return true;
}
// @yo2 0x007787a0 slot 29
void CUSelectNumDialog::ugSlot23() {}
// @yo2 0x00778780 slot 32
void CUSelectNumDialog::onMouse(CMouseEx*) {}
// @yo2 0x00778b80 slot 33
void CUSelectNumDialog::onOpened() {}
// @yo2 0x00778db0 slot 35
void CUSelectNumDialog::onClosed() { unk3e8_ = 1; }

// ================================================================ CUDiscardDialog

// @yo2 0x00778ee0 CUDiscardDialog::CUDiscardDialog
CUDiscardDialog::CUDiscardDialog() {
    loaderVtbl = VT_CCARDLOADER;   // the CCardLoader member, constructed inline
    cardLoaderAcquire();
    setTaskName("CUDiscardDialog");
}

// @yo2 0x00778dd0 open the dialog under `parent`
CUDiscardDialog* CUDiscardDialog::create(CTask* parent, float x, float y, int32_t style, const WChar* text) {
    auto* d = new CUDiscardDialog;
    d->setup(x, y, style);
    auto* t = dynamic_cast<CUDiscardDialog*>(d->CTask::create(parent, DLG_OK));
    t->setText(text);
    t->layout();
    return t;
}

// @yo2 0x007793e0 CUDiscardDialog::~CUDiscardDialog
// @yo2 0x007793b0 CUDiscardDialog scalar deleting destructor
CUDiscardDialog::~CUDiscardDialog() { cardLoaderRelease(); }

// @yo2 0x00779520 onInit: a 314 x 16 bar centred where the window was placed
bool CUDiscardDialog::onInit() {
    CWindowTaskModel::onInit();
    textStyle0();
    centre();
    movable_ = true;
    int32_t w0 = ftol(w_);
    cx_ = ftol((double)(w0 >> 1) + x_);
    int32_t h0 = ftol(h_);
    cy_ = ftol((double)(h0 >> 1) + y_);
    boxW_ = 0x13a;
    x_ = (float)(cx_ - 0x9d);
    boxH_ = 0x10;
    y_ = (float)(cy_ - 8);
    pos_.x = (float)(cx_ - 0x9d);
    pos_.y = (float)(cy_ - 8);
    setBox(0x13a, 0x10);
    layout();
    return true;
}

// @yo2 0x00779660 onMain: a row of mini card backs, one per card still to discard; while opening the bar grows
// from 16 px to 112 px along the sine table. Ends when nothing is left to discard (or in auto mode).
bool CUDiscardDialog::onMain() {
    if (engCc3aa() == 0) return false;
    if (g_duelAuto) return false;
    tick();
    int32_t cw = g_miniW;
    if (fade_ == 0) {
        int32_t step = g_miniH / 2;
        int32_t n = engCc3aa();
        int32_t room = boxW_ - cw * 2;
        if (room < n * step) step = room / n;
        int32_t off = 0;
        for (int32_t k = n; k > 0; k--) {
            int32_t size[2] = {cw / 2, g_miniH / 2};
            layout();
            planeEnsure(g_cardListMini, 0);
            spriteSetZ(planeSprite(g_cardListMini, 0), (float)maxZ() + 10.0f);
            planeEnsure(g_cardListMini, 0);
            spriteDraw(planeSprite(g_cardListMini, 0), (cx_ - boxW_ / 2) + off + cw - size[0] / 2,
                       (boxH_ / 2 - size[1] / 2) - 0x32 + cy_, 0xff, nullptr, size, 0);
            off += step;
        }
        return true;
    }
    int32_t x = cx_, y = cy_, s = 0x100;
    if (0x100 - fade_ < 0x40) s = g_sinTable[(uint32_t)((-0x40 - fade_) * 2) & 0x1ff] >> 8;
    if (x > 0x362) x = 0x363;
    if (y < 0x71) y = 0x70;
    int32_t hh = s * 0x70 / 256;
    int32_t hc = hh < 0x11 ? 0x10 : hh;
    x_ = (float)(x - 0x9d);
    y_ = (float)(y - hc / 2);
    pos_.x = (float)(x - 0x9d);
    pos_.y = (float)(y - hc / 2);
    setBox(0x13a, hc);
    layout();
    return true;
}

// @yo2 0x00779370 slot 18
bool CUDiscardDialog::windowSlot18() { return true; }
// @yo2 0x00779390 slot 23
void CUDiscardDialog::ugSlot23() {}

// ================================================================ CURitualDialog

// @yo2 0x00779aa0 CURitualDialog::CURitualDialog(text, level)
CURitualDialog::CURitualDialog(const WChar* text, int32_t lv) {
    planeConstruct(&sheet, (uint8_t)lv);
    setTaskName("CURitualDialog");
    level = lv;
    vc6::string path("data/Y/");
    path += "duel/dialog/ritualdlg.txt";
    planeLoad(&sheet, path);
    boxH_ += 0x28;
    cy_ -= boxH_ / 2;
    CWindowModelThin::setText(text);   // FUN_005e4470 called directly
}

// @yo2 0x007799b0 open the dialog under `parent`
CURitualDialog* CURitualDialog::create(CTask* parent, float x, float y, int32_t style, const WChar* text,
                                       int32_t lv) {
    auto* d = new CURitualDialog(text, lv);
    placeThin(d, x, y, style);
    return dynamic_cast<CURitualDialog*>(d->CTask::create(parent, DLG_OK));
}

// @yo2 0x00779da0 CURitualDialog::~CURitualDialog
// @yo2 0x00779d70 CURitualDialog scalar deleting destructor
CURitualDialog::~CURitualDialog() { planeDestruct(&sheet); }

// @yo2 0x00779d50 slot 18
bool CURitualDialog::windowSlot18() { return true; }

// @yo2 0x00779f20 slot 22: answers 0 by itself once the tribute total is reached (engPairA() == 0) or in auto mode
void CURitualDialog::tick() {
    CUGDialogBase::tick();
    if (answered_) return;
    if (g_duelAuto) close(0);
    if (fade_ == 0 && engPairA() == 0) close(0);
}

// @yo2 0x00779f90 slot 23: `level` stars in a row (at most 300 px), the last ones lit as the total grows
void CURitualDialog::ugSlot23() {
    if (fade_ != 0) return;
    int32_t sw, sh;
    spriteSize(planeSprite(&sheet, 0), &sw, &sh);
    int32_t n = level, step = sw + 2;
    if (300 - sw < n * step) step = (300 - sw) / n;
    int32_t off = 0;
    for (int32_t i = 0; i < level; i++, off += step) {
        int32_t x = off - 0x96 + cx_;
        int32_t y = (boxH_ / 2 - sh / 2) - 0x19 + cy_;
        int32_t k = level - (int32_t)engPairA() <= i ? 1 : 0;
        spriteSetZ(planeSprite(&sheet, k), (float)maxZ());
        k = level - (int32_t)engPairA() <= i ? 1 : 0;
        spriteDraw(planeSprite(&sheet, k), x, y, 0xff, nullptr, nullptr, 0);
    }
}

// @yo2 0x0077a1b0 onInit
bool CURitualDialog::onInit() {
    CWindowModelThin::onInit();
    textField_->text_->setAlign(0);
    centre();
    movable_ = true;
    layout();
    fitToRect(this);
    g_ritualDialogOpen = 1;
    return true;
}

// @yo2 0x0077a290 onMain: ends when the engine has no tribute pair any more
bool CURitualDialog::onMain() {
    if (unk3e8_) return false;
    if (engPairANone()) return false;
    if (running_) {
        tick();
        if (running_) ugSlot23();
    }
    return true;
}

// @yo2 0x0077a300 slot 29
void CURitualDialog::onClosed() {
    g_ritualDialogOpen = 0;
    unk3e8_ = 1;
}

}   // namespace ds
