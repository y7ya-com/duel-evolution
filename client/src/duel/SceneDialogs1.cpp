// yo2Dialogs.cpp part 1: the fade_ / drag / answer logic of the three dialog bases (CUGDialogBase,
// CUGDialogBaseHP, CUDialogBaseOk; labelled System, they sit at the head of this file), CUSelectDialog,
// CUSelectStandDialog, CUSelectCoinDialog, and the file's static initializers. See SceneDialogs.h.
#include "Engine.h"
#include "SceneDialogs.h"

// This file's copies of the shared language / country / digit tables: the initializers and their atexit stubs are
// marked in src/System/yo2Lang.h; the init stubs and destructors Ghidra missed (islands) are these:
// @yo2 0x0077f290 init stub: languages + their atexit registration
// @yo2 0x0077f630 languages dtor
// @yo2 0x0077f660 init stub: countries
// @yo2 0x0077f9c0 countries dtor
// @yo2 0x0077f9f0 init stub: digits
// @yo2 0x0077fdc0 digits dtor
// The shared header's guarded static (bit 0 of DAT_012d3501, atexit thunk 0x00410564) and its plain twin:
// @yo2 0x0077f240 guarded atexit registration
// @yo2 0x0077f270 atexit registration
// (0x0077fdf0, the island right after, is the init stub of the next file's tables.)

namespace ds {

namespace {
struct GuardedHeaderStatic {
    GuardedHeaderStatic() = default;
    ~GuardedHeaderStatic() {}
};
[[maybe_unused]] GuardedHeaderStatic s_guarded;

// The fade / answer state machine of the three bases (one source, three copies in the exe).
template <class D>
void fadeUpdate(D* d) {
    if (d->fade_ == 0) {
        if (d->answered_ && d->canClose()) d->close(d->result_);
        return;
    }
    d->fade_ -= 0x20;
    if (d->fade_ == 0) d->onOpened();
    if (d->fade_ < -0xff) d->onClosed();
}

template <class D>
bool boxHit(const D* d) {
    int32_t mx, my;
    mousePos(appMouse(), &mx, &my);
    int32_t hh = d->boxH_ / 2, hw = d->boxW_ / 2;
    return d->cx_ - hw <= mx && mx < hw + d->cx_ && d->cy_ - hh <= my && my < d->cy_ + hh;
}

// Slot 15, the window's mouse handler (CUGDialogBase's is System's; these are its two copies on the other bases):
// while dragging, follow the mouse (moveBox: the window moves too, kept within a quarter of its size off the
// 1024 x 600 area); else the dialog's own vf26, then a click on the box starts a drag (`consume`: mark it used).
template <class D>
bool dragSlot15(D* d, bool moveBox, bool consume, bool moveCentre) {
    if (d->fade_ != 0) return false;
    if (d->answered_) return d->isMouseOver();
    Mouse* m = appMouse();
    int32_t mx, my;
    mousePos(m, &mx, &my);
    if (d->dragging_) {
        if (!mouseHeld(m)) {
            d->dragging_ = false;
            return true;
        }
        if (!moveCentre) return true;
        int32_t x = mx - d->dragDx_, y = my - d->dragDy_;
        d->cy_ = y;
        d->cx_ = x;
        int32_t lim = d->boxW_ / 4 + 0x400;
        if (lim < x || (lim = -(d->boxW_ / 4), x < lim)) d->cx_ = lim;
        lim = d->boxH_ / 4 + 600;
        if (lim < y || (lim = -(d->boxH_ / 4), y < lim)) d->cy_ = lim;
        if (moveBox) {
            float fx = (float)(d->cx_ - (d->boxW_ >> 1)), fy = (float)(d->cy_ - (d->boxH_ >> 1));
            d->x_ = fx;
            d->y_ = fy;
            d->pos_.x = fx;
            d->pos_.y = fy;
            d->layout();
        }
        return true;
    }
    d->onMouse(m);
    if (!d->isMouseOver()) return false;
    if (mouseClicked(m)) {
        d->dragging_ = true;
        d->dragDx_ = mx - d->cx_;
        d->dragDy_ = my - d->cy_;
        if (consume) mouseConsume(m);
    }
    return true;
}
}   // namespace

// A task's lock flags (CTask +0x20, protected; FUN_00628d70 reads them): bit 1 keeps TM_MAIN away.
void taskLock(CTask* t, uint32_t mask, bool on) {
    struct Access : CTask {
        static uint32_t CTask::*flags() { return &Access::lockFlags_; }
    };
    if (on) t->*Access::flags() |= mask;
    else windowClearLock(t, mask);
}

// CWindowModelThin::setup (0x005e3fd0, marked in src/System inside create): the dialogs' factories call it on their
// own object
void placeThin(CWindowModelThin* w, float x, float y, int32_t style) {
    w->x_ = x;
    w->callback_ = nullptr;
    w->w_ = 336;
    w->h_ = 144;
    w->y_ = y;
    w->style_ = style;
}

void placeAt(CWindowTaskModel* w, float x, float y, float rw, float rh) {
    w->x_ = x;
    w->y_ = y;
    w->pos_.x = x;
    w->pos_.y = y;
    w->w_ = rw;
    w->h_ = rh;
}

// ================================================================ CUGDialogBaseHP

CUGDialogBaseHP::CUGDialogBaseHP() = default;
// @yo2 0x00779180 CUGDialogBaseHP::~CUGDialogBaseHP
// @yo2 0x00779340 CUGDialogBaseHP scalar deleting destructor
CUGDialogBaseHP::~CUGDialogBaseHP() = default;
// @yo2 0x00772320 slot 15 (the box is not moved while dragging)
bool CUGDialogBaseHP::windowSlot15() { return dragSlot15(this, false, false, false); }
// @yo2 0x00779260 slot 21: the size, also as the window rect's
void CUGDialogBaseHP::setBox(int32_t w, int32_t h) {
    boxW_ = w;
    w_ = (float)w;
    boxH_ = h;
    h_ = (float)h;
    layout();
}
// @yo2 0x00772430 slot 22
void CUGDialogBaseHP::tick() {
    running_ = true;
    fadeUpdate(this);
    if (fade_ < -0xff) running_ = false;
}
// @yo2 0x00772280 slot 24
bool CUGDialogBaseHP::isMouseOver() const { return boxHit(this); }
// @yo2 0x007792a0 slot 25
bool CUGDialogBaseHP::canClose() { return true; }
// @yo2 0x007792c0 slot 26
void CUGDialogBaseHP::onMouse(CMouseEx*) {}
// @yo2 0x007792e0 slot 27
void CUGDialogBaseHP::onOpened() {}
// @yo2 0x00779300 slot 28
void CUGDialogBaseHP::onClose() {}
// @yo2 0x00779320 slot 29
void CUGDialogBaseHP::onClosed() {}
// @yo2 0x00772240
void CUGDialogBaseHP::close(int32_t v) {
    fade_ = -1;
    result_ = v;
    engSendChoice((uint32_t)v);
    onClose();
}

// ================================================================ CUDialogBaseOk

CUDialogBaseOk::CUDialogBaseOk() = default;
// @yo2 0x00778520 CUDialogBaseOk::~CUDialogBaseOk
// @yo2 0x00778750 CUDialogBaseOk scalar deleting destructor
CUDialogBaseOk::~CUDialogBaseOk() = default;
// @yo2 0x007728c0 slot 15 (the centre follows the drag; the window itself is not moved here)
bool CUDialogBaseOk::windowSlot15() { return dragSlot15(this, false, false, true); }
// @yo2 0x00778680 slot 27
void CUDialogBaseOk::setBox(int32_t w, int32_t h) { boxW_ = w, boxH_ = h; }
// @yo2 0x00772aa0 slot 28
void CUDialogBaseOk::tick() { fadeUpdate(this); }
// @yo2 0x007728a0 slot 30
bool CUDialogBaseOk::isMouseOver() const { return false; }
// @yo2 0x007786b0 slot 31
bool CUDialogBaseOk::canClose() { return true; }
// @yo2 0x007786d0 slot 32
void CUDialogBaseOk::onMouse(CMouseEx*) {}
// @yo2 0x007786f0 slot 33
void CUDialogBaseOk::onOpened() {}
// @yo2 0x00778710 slot 34
void CUDialogBaseOk::onClose() {}
// @yo2 0x00778730 slot 35
void CUDialogBaseOk::onClosed() {}
// @yo2 0x00772860
void CUDialogBaseOk::close(int32_t v) {
    fade_ = -1;
    result_ = v;
    engSendChoice((uint32_t)v);
    onClose();
}

// ================================================================ CUSelectDialog

// @yo2 0x00774fd0 CUSelectDialog::CUSelectDialog(text, options, mask)
CUSelectDialog::CUSelectDialog(const WChar* src, int32_t nOptions, uint32_t optionMask) : options(nOptions) {
    std::memset(text, 0, sizeof text);
    setTaskName("CUSelectDialog");
    YO2_ASSERT(nOptions != 0, "no options to select from");   // "項目が０ってどういうこっちゃ"
    if (cancelValue >= 0 && mouseVf02(appMouse())) {   // never true: cancelValue was just set to -1
        close(cancelValue);
        return;
    }
    textCount = options + 1;
    for (int32_t i = 0; i < options + 1; i++) textLine(src, text[i], i);
    mask = optionMask;
}

// @yo2 0x007753d0 CUSelectDialog::~CUSelectDialog
// @yo2 0x007753a0 CUSelectDialog scalar deleting destructor
CUSelectDialog::~CUSelectDialog() = default;

// @yo2 0x007754c0 slot 27: the cursor jumps onto the first row
void CUSelectDialog::onOpened() {
    int32_t h0 = boxH_;
    e4c = 0;
    if (duelAutoFocus()) cursorWarp(cx_, cy_ + (0x38 - (h0 >> 1)));
}

// @yo2 0x00775530 slot 26: right click / cancel key answers the cancel value, when there is one
void CUSelectDialog::onMouse(CMouseEx* m) {
    if (cancelValue < 0) return;
    if (!mouseRightClicked(m) && !keyPushed(KEY_CANCEL)) return;
    mouseConsume(m);
    close(cancelValue);
}

// @yo2 0x007755c0 slot 22: hover the row under the mouse; a release on a row answers its option
void CUSelectDialog::tick() {
    CUGDialogBase::tick();
    if (g_duelAuto) {
        answered_ = 1;
        result_ = rowValue[0];
    }
    if (answered_ || fade_ != 0) return;
    int32_t mx, my;
    mousePos(appMouse(), &mx, &my);
    int32_t ly = ftol((double)my - y_ - 48.0);
    int32_t lx = ftol((double)mx - x_ - 8.0);
    bool hovered = false;
    if (ly >= 0 && lx >= 0 && (double)lx < (double)(w_ - 16.0f)) {
        int32_t row = ly / 16;
        for (int32_t k = 0; k < row; k++) {   // a row of several text lines takes several 16 px lines
            if (list->rowSpan(k) > 1) row += 1 - list->rowSpan(k);
        }
        if (row < rows) {
            list->setHover(row);
            hovered = true;
        }
    }
    if (!hovered) list->clearHover();
    layout();
    if (mouseReleased(appMouse()) && list->hover() != -1) {
        int32_t v = rowValue[list->hover()];
        answered_ = 1;
        result_ = v;
    }
}

// @yo2 0x007757c0 onInit: size the box to the options and fill the list box
bool CUSelectDialog::onInit() {
    CWindowModelThin::onInit();
    textField_->text_->setAlign(0);
    centre();
    movable_ = true;
    int32_t w0 = ftol(w_);
    cx_ = ftol((double)(w0 >> 1) + x_);
    cy_ = ftol((double)(ftol(h_) >> 1) + y_);
    boxH_ = options * 16 + 0x38;
    boxW_ = w0 + 100;
    placeAt(this, (float)(cx_ - (boxW_ >> 1)), (float)(cy_ - (boxH_ >> 1)), (float)boxW_, (float)boxH_);
    layout();
    listFlag = 0;
    list.setUser(this);
    list.set(listboxCreate(this, this, listFlag != 0));
    YO2_ASSERT(list.task(), "CWindowTaskListbox create failed");   // "CWindowTaskListbox 生成失敗！？"
    list->setInstName("CWindowTaskScrollH list");                  // "CWindowTaskScrollH 属性一覧"
    list->setMargins(8, 0x30, 8.0f, 48.0f);
    // approximated: the exe's first resize passes a height Ghidra lost; the second (below) is the one that counts
    list->setSize(w_ - 16.0f, h_ - 16.0f - 40.0f);
    list->setDepth(2.0f);
    rows = 0;
    setText(text[0]);
    for (int32_t i = 0; i + 1 < textCount; i++) {
        if (mask >> i & 1u) {
            list->add(text[i + 1]);
            rowValue[rows] = i;
            rows++;
        }
    }
    boxH_ = list->rows() * 16 + 0x38;
    x_ = pos_.x = (float)(cx_ - (boxW_ >> 1));   // FUN_0064d340 setPos
    y_ = pos_.y = (float)(cy_ - (boxH_ >> 1));
    w_ = (float)boxW_;                           // FUN_006a5b60 setSize (+ layout)
    h_ = (float)boxH_;
    layout();
    list->setSize(w_ - 16.0f, h_ - 16.0f - 40.0f);
    layout();
    return true;
}

// @yo2 0x007764c0 onMain
bool CUSelectDialog::onMain() {
    if (unk3e8_) return false;
    tick();
    return true;
}
// @yo2 0x00775380 slot 23 (the list box draws)
void CUSelectDialog::ugSlot23() {}
// @yo2 0x007755a0 slot 25
bool CUSelectDialog::canClose() { return true; }
// @yo2 0x007764f0 slot 29
void CUSelectDialog::onClosed() { unk3e8_ = 1; }

// ================================================================ CUSelectStandDialog

// @yo2 0x00776650 CUSelectStandDialog::CUSelectStandDialog
// @yo2 0x00776860 (island) the card array's element constructor: CCard(0xff) (the default argument)
CUSelectStandDialog::CUSelectStandDialog() {
    setTaskName("CUSelectStandDialog");
}

// @yo2 0x00776510 open the dialog under `parent`
CUSelectStandDialog* CUSelectStandDialog::create(CTask* parent, float x, float y, int32_t style,
                                                 const WChar* question, int32_t cardId, uint8_t flag) {
    auto* d = new CUSelectStandDialog;
    d->py = y;
    d->px = x;
    d->style = style;
    d->flag = flag;
    d->parent_ = parent;
    d->question = question;
    d->cardId = cardId;
    placeThin(d, x, y, style);
    return dynamic_cast<CUSelectStandDialog*>(d->CTask::create(parent, DLG_OK));
}

// @yo2 0x00776880 CUSelectStandDialog::~CUSelectStandDialog
// @yo2 0x00776830 CUSelectStandDialog scalar deleting destructor
CUSelectStandDialog::~CUSelectStandDialog() = default;   // the cards' destructors (vector dtor iterator)

// @yo2 0x00776810 slot 18
bool CUSelectStandDialog::windowSlot18() { return fade_ < 0; }

// @yo2 0x00776990 slot 27: the cards take part in hover tests, the cursor jumps to the left card
void CUSelectStandDialog::onOpened() {
    for (CCard& c : cards) c.active_ = 1;
    if (duelAutoFocus()) cursorWarp(cx_ - 0x32, boxH_ / 2 - 0x32 + cy_);
}

// @yo2 0x00776a00 slot 28
void CUSelectStandDialog::onClose() {
    for (CCard& c : cards) c.active_ = 0;
}

// @yo2 0x00776a30 slot 26: a click on a card answers its index (the card flashes)
void CUSelectStandDialog::onMouse(CMouseEx* m) {
    int32_t mx = 0, my = 0;
    mousePos(m, &mx, &my);
    if (g_duelAuto) {
        answered_ = 1;
        result_ = 0;
        return;
    }
    if (!isMouseOver()) return;
    for (int32_t i = 0; i < 2; i++) {
        CCard& c = cards[i];
        if (!c.hit(mx, my)) continue;
        g_cardHover = &c;
        cardHoverMark();
        if (mouseClicked(m) || keyPushed(KEY_DECIDE)) {
            c.flash = 1;
            c.flashLevel = 0x100;
            answered_ = 1;
            result_ = i;
            mouseConsume(m);
        }
    }
}

// @yo2 0x00776b50 slot 25: both cards at rest and not flashing
bool CUSelectStandDialog::canClose() {
    for (const CCard& c : cards)
        if (c.anim != 0x100 || c.flash != 0) return false;
    return true;
}

// @yo2 0x00776b90 slot 22: left / right keys move the cursor between the cards
void CUSelectStandDialog::tick() {
    CUGDialogBase::tick();
    if (answered_ || fade_ != 0) return;
    int32_t x;
    if (keyPushed(KEY_LEFT)) x = cx_ - 0x32;
    else if (keyPushed(KEY_RIGHT)) x = cx_ + 0x32;
    else return;
    cursorWarpRepeat(x, boxH_ / 2 - 0x32 + cy_);
}

// @yo2 0x00776c30 slot 23: the two cards, 100 px apart, at the window's depth
void CUSelectStandDialog::ugSlot23() {
    if (fade_ != 0) return;
    int32_t off = 0;
    for (CCard& c : cards) {
        c.setZ(maxZ());
        c.drawNow = 1;
        c.pinned = 1;
        int32_t x = off - 0x32 + cx_;
        c.ty = boxH_ / 2 - 0x32 + cy_;
        c.tx = x;
        c.fx = x;
        c.x = x;
        c.fy = c.ty;
        c.y = c.ty;
        c.draw();
        c.drawNow = 0;
        off += 100;
    }
}

// @yo2 0x00776cf0 onInit: the question, then both cards placed side by side under it
bool CUSelectStandDialog::onInit() {
    CWindowModelThin::onInit();
    textField_->text_->setAlign(0);
    centre();
    layout();
    setText(question);
    fitToRect(this);
    YO2_ASSERT(cardId >= 0, "not a card");   // "カードの範囲ではない"
    for (int32_t i = 0; i < 2; i++) {
        CCard& c = cards[i];
        c.setCard(cardId);
        // approximated: the exe passes a stack u16 whose high byte is whatever was there; the low byte is the
        // viewer | zone 0x10 << 1
        uint16_t code = (uint16_t)((g_eng.viewer & 1u) | 0x20u);
        c.moveTo(&code);
        c.snap();
        c.ty = boxH_ / 2 - 0x32 + cy_;
        c.pinned = 1;
        int32_t x = i * 100 - 0x32 + cx_;
        c.tx = x;
        c.fx = x;
        c.x = x;
        c.fy = c.ty;
        c.y = c.ty;
        YO2_ASSERT(x >= 1 && x <= 0x3ff, "card X out of range (%d)", x);   // "X範囲外にある(%d)"
        YO2_ASSERT(c.ty >= 1 && c.ty <= 0x2ff, "card Y out of range (%d)", c.ty);   // "Y範囲外にある(%d)"
        c.order_ = 0x701;
        c.active_ = 0;
    }
    layout();
    return true;
}

// @yo2 0x00777270 onMain
bool CUSelectStandDialog::onMain() {
    if (unk3e8_) return false;
    if (running_) {
        tick();
        if (running_) ugSlot23();
    }
    return true;
}

// @yo2 0x007772c0 slot 29
void CUSelectStandDialog::onClosed() { unk3e8_ = 1; }

// ================================================================ CUSelectCoinDialog

// @yo2 0x007773f0 CUSelectCoinDialog::CUSelectCoinDialog
CUSelectCoinDialog::CUSelectCoinDialog() {
    planeConstruct(&sheet, 0);   // the exe passes an uninitialised byte as the string allocator
    setTaskName("CUSelectCoinDialog");
    initSize();
    if (boxW_ < 0xc9) boxW_ = 200;
    hover = -1;
    afterAnswer = 0;
    boxH_ += 0x32;
}

// @yo2 0x007772e0 open the dialog under `parent` with `question` as its text
CUSelectCoinDialog* CUSelectCoinDialog::create(CTask* parent, float x, float y, int32_t style,
                                               const WChar* question) {
    auto* d = new CUSelectCoinDialog;
    placeThin(d, x, y, style);
    auto* t = dynamic_cast<CUSelectCoinDialog*>(d->CTask::create(parent, DLG_OK));
    t->setText(question);
    t->layout();
    return t;
}

// @yo2 0x00777650 CUSelectCoinDialog::~CUSelectCoinDialog
// @yo2 0x00777620 CUSelectCoinDialog scalar deleting destructor
CUSelectCoinDialog::~CUSelectCoinDialog() { planeDestruct(&sheet); }

// @yo2 0x007777d0 centre (512, 300); the size calls go through slot 21 (the plain setter): (0, 0), then (w - 8, 92)
void CUSelectCoinDialog::initSize() {
    cx_ = 512;   // DAT_00bed658
    cy_ = 300;
    setBox(0, 0);
    setBox(boxW_ - 8, 0x5c);
}

// @yo2 0x00777820 slot 27: the cursor jumps to the left coin
void CUSelectCoinDialog::onOpened() {
    if (duelAutoFocus()) cursorWarp(cx_ - 0x32, boxH_ / 2 - 0x28 + cy_);
}

// @yo2 0x00777870 slot 26: a click on a coin's face answers 1 for the left (heads), 0 for the right
void CUSelectCoinDialog::onMouse(CMouseEx* m) {
    int32_t mx, my;
    mousePos(m, &mx, &my);
    hover = -1;
    if (g_duelAuto) {
        answered_ = 1;
        result_ = 0;
        return;
    }
    if (!isMouseOver()) return;
    int32_t cw, ch;
    spriteSize(planeSprite(&sheet, 0), &cw, &ch);
    cw /= planeFrames(&sheet, 0);
    int32_t i = 0;
    for (int32_t off = 0; off < 0x140; off += 0xa0, i++) {
        int32_t bx = cx_ - 0x50 + off, by = boxH_ / 2 - 0x28 + cy_;
        if (!(bx - cw / 2 <= mx && mx < cw / 2 + bx && by - ch / 2 <= my && my < ch / 2 + by)) continue;
        int32_t frame = (i != 0 ? 7 : 0) + 6;   // frames 6 and 13 hold the two faces
        if (!spriteHit(planeSprite(&sheet, 0), frame * cw + cw / 2 - bx + mx, ch / 2 - by + my)) continue;
        hover = i;
        if (mouseClicked(m) || keyPushed(KEY_DECIDE)) {
            answered_ = 1;
            result_ = i == 0;
            mouseConsume(m);
        }
    }
}

// @yo2 0x00777af0 slot 25
bool CUSelectCoinDialog::canClose() { return afterAnswer > 15; }

// @yo2 0x00777b10 slot 22: after the answer count frames (the pick blinks); else left / right move the cursor
void CUSelectCoinDialog::tick() {
    CUGDialogBase::tick();
    if (answered_) {
        afterAnswer++;
        return;
    }
    if (fade_ != 0) return;
    int32_t x;
    if (keyPushed(KEY_LEFT)) x = cx_ - 0x50;
    else if (keyPushed(KEY_RIGHT)) x = cx_ + 0x50;
    else return;
    cursorWarpRepeat(x, boxH_ / 2 - 0x28 + cy_);
}

// @yo2 0x00777bd0 slot 23: both coins, the hovered one opaque (blinking once answered_), the other at half alpha
void CUSelectCoinDialog::ugSlot23() {
    float z = (float)maxZ();
    if (fade_ != 0) return;
    int32_t cw, ch;
    spriteSize(planeSprite(&sheet, 0), &cw, &ch);
    cw /= planeFrames(&sheet, 0);
    int32_t i = 0;
    for (int32_t off = 0; off < 0x140; off += 0xa0, i++) {
        int32_t f = i != 0 ? 7 : 0;
        int32_t src[4] = {(f + 6) * cw, 0, (f + 7) * cw + 1, ch + 1};
        spriteSetZ(planeSprite(&sheet, 0), z);
        int32_t dx = cx_ - cw / 2 - 0x50 + off, dy = (boxH_ / 2 + cy_) - ch / 2 - 0x28;
        bool lit = i == hover && (afterAnswer & 2) == 0;
        spriteDraw(planeSprite(&sheet, 0), dx, dy, lit ? 0xff : 0x80, src, nullptr, 0);
    }
}

// @yo2 0x00777ea0 onInit: the box 48 px lower than placed, coin_new.txt loaded
bool CUSelectCoinDialog::onInit() {
    CWindowModelThin::onInit();
    textField_->text_->setAlign(0);
    centre();
    movable_ = true;
    fitToRect(this);
    cy_ += 0x30;
    placeAt(this, (float)(cx_ - (boxW_ >> 1)), (float)(cy_ - (boxH_ >> 1)), (float)boxW_, (float)boxH_);
    layout();
    planeLoad(&sheet, vc6::string("data/Y2/duel/effect/coin_new.txt"));
    return true;
}

// @yo2 0x007780f0 onMain
bool CUSelectCoinDialog::onMain() {
    if (unk3e8_) return false;
    if (running_) {
        tick();
        if (running_) ugSlot23();
    }
    return true;
}

// @yo2 0x00778140 slot 29
void CUSelectCoinDialog::onClosed() { unk3e8_ = 1; }

}   // namespace ds

// The answer CUGDialogBase::close sends to the server (System's seam, TODO(duel) there): the engine's
// engSendChoice (0x0071f8c0, EngineChain.cpp).
void ugDialogSendResult(int32_t result) { engSendChoice((uint32_t)result); }
