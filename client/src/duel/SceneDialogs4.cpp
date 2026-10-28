// yo2Dialogs.cpp part 4: CUDiceDialog, CUPhaseSelectDialog, CULockOnDialog, CHelpDialog.
#include "DuelText.h"
#include "Engine.h"
#include "SceneDialogs.h"

namespace ds {

// ================================================================ CUDiceDialog

// @yo2 0x0077b570 CUDiceDialog::CUDiceDialog(text, faces to pick, offered faces << 1)
CUDiceDialog::CUDiceDialog(const WChar* text, int32_t nNeed, uint32_t mask) : need(nNeed), free(mask >> 1) {
    planeConstruct(&sheet, (uint8_t)nNeed);   // the exe passes a byte of the argument slot as the allocator
    setTaskName("CUDiceDialog");
    boxW_ = 0x90;
    boxH_ = 0x80;
    message = text;
}

// @yo2 0x0077b480 open the dialog under `parent` at (0, 0), style 1
CUDiceDialog* CUDiceDialog::create(CTask* parent, const WChar* text, uint32_t unused, int32_t need, uint32_t mask) {
    (void)unused;
    auto* d = new CUDiceDialog(text, need, mask);
    placeThin(d, 0.0f, 0.0f, 1);
    return dynamic_cast<CUDiceDialog*>(d->CTask::create(parent, DLG_OK));
}

// @yo2 0x0077b8b0 CUDiceDialog::~CUDiceDialog
// @yo2 0x0077b880 CUDiceDialog scalar deleting destructor
CUDiceDialog::~CUDiceDialog() { planeDestruct(&sheet); }

// @yo2 0x0077ba80 face i's top left: six faces 32 px apart, centred on the box, 16 px above its centre
void CUDiceDialog::facePos(int32_t* out, int32_t i) const {
    int32_t y = cy_;
    out[0] = (i - 3) * 0x20 + cx_;
    out[1] = y - 0x10;
}

// @yo2 0x0077bac0 slot 27: the cursor jumps onto face 0
void CUDiceDialog::onOpened() {
    if (!duelAutoFocus()) return;
    int32_t p[2];
    facePos(p, 0);
    cursorWarp(p[0] + 0x10, p[1] + 0x10);
}

// @yo2 0x0077bb30 slot 26: a click on an offered face picks it; the last pick answers the picked faces << 1
void CUDiceDialog::onMouse(CMouseEx* m) {
    int32_t mx, my;
    mousePos(m, &mx, &my);
    int32_t last = hover;
    hover = -1;
    lastHover = last;
    if (g_duelAuto) {
        answered_ = true;
        result_ = 0;
        return;
    }
    if (!isMouseOver()) return;
    int32_t fw, fh;
    spriteSize(planeSprite(&sheet, 7), &fw, &fh);
    for (int32_t i = 0; i < 6; i++) {
        int32_t p[2];
        facePos(p, i);
        if (!(p[0] <= mx && mx < p[0] + fw && p[1] <= my && my < p[1] + fh)) continue;
        hover = i;
        uint32_t b = 1u << i;
        if ((b & free) && (mouseClicked(m) || keyPushed(KEY_DECIDE))) {
            blink = 0;
            chosen |= b;
            free ^= b;
            picked++;
            if (picked == need) {
                answered_ = true;
                result_ = (int32_t)(chosen * 2);
            }
            mouseConsume(m);
            return;
        }
    }
}

// @yo2 0x0077bd30 slot 25
bool CUDiceDialog::canClose() { return blink > 15; }

// @yo2 0x0077bd50 slot 22: left / right walk the cursor over the faces (wrapping)
void CUDiceDialog::tick() {
    CUGDialogBase::tick();
    if (picked != 0) blink++;
    if (answered_ || fade_ != 0) return;
    if (!keyPushed(KEY_LEFT) && !keyPushed(KEY_RIGHT)) return;
    int32_t i = 0;
    if (keyPushed(KEY_LEFT)) i = hover < 1 ? 5 : hover - 1;
    else if (keyPushed(KEY_RIGHT)) i = hover < 5 ? hover + 1 : 0;
    int32_t p[2];
    facePos(p, i);
    cursorWarpRepeat(p[0] + 0x10, p[1] + 0x10);
}

// @yo2 0x0077be90 slot 23: the six faces; picked ones opaque (blinking), offered 1/2 alpha (opaque under the mouse),
// the rest 1/8
void CUDiceDialog::ugSlot23() {
    if (fade_ != 0) return;
    int32_t cw, chh;
    spriteSize(planeSprite(&sheet, 0), &cw, &chh);
    cw /= planeFrames(&sheet, 0);   // computed and unused, as in the exe
    for (int32_t i = 0; i < 6; i++) {
        int32_t p[2];
        facePos(p, i);
        uint32_t b = 1u << i;
        int32_t a = 0x100;
        if (!(b & chosen) || (blink & 2)) {
            if (!(free & b)) a = 0x20;
            else if (i != hover) a = 0x80;
        }
        spriteSetZ(planeSprite(&sheet, i + 7), (float)maxZ());
        spriteDraw(planeSprite(&sheet, i + 7), p[0], p[1], a, nullptr, nullptr, 0);
    }
}

// @yo2 0x0077c070 onInit: the box 48 px lower than placed, dice.txt loaded
bool CUDiceDialog::onInit() {
    CWindowModelThin::onInit();
    textField_->text_->setAlign(0);
    centre();
    movable_ = true;
    layout();
    fitToRect(this);
    cy_ += 0x30;
    setText(message.c_str());
    placeAt(this, (float)(cx_ - (boxW_ >> 1)), (float)(cy_ - (boxH_ >> 1)), (float)boxW_, (float)boxH_);
    layout();
    vc6::string path("data/Y/");
    path += "duel/effect/dice.txt";
    planeLoad(&sheet, path);
    return true;
}

// @yo2 0x0077c360 onMain
bool CUDiceDialog::onMain() {
    if (unk3e8_) return false;
    if (running_) {
        tick();
        if (running_) ugSlot23();
    }
    return true;
}

// @yo2 0x0077c3b0 slot 29
void CUDiceDialog::onClosed() { unk3e8_ = 1; }

// ================================================================ CUPhaseSelectDialog

// The phase rows' DLG_Text ids per mask bit 2..5 (DAT_00cd4a48, three per bit): [0] when the mask has bit 2,
// [1] otherwise, [2] for the masks 0x24 and 0x30.
const int32_t kPhaseTexts[4][3] = {{413, 413, 413}, {410, 412, 412}, {414, 414, 413}, {415, 415, 415}};

int32_t phaseRowText(uint32_t mask, int32_t bit) {
    const int32_t* e = kPhaseTexts[bit - 2];
    if (mask == 0x24 || mask == 0x30) return e[2];
    return (mask & 4) == 0 ? e[1] : e[0];
}

// @yo2 0x0077d330 CUPhaseSelectDialog::CUPhaseSelectDialog(title, mask of phase bits 2..5)
CUPhaseSelectDialog::CUPhaseSelectDialog(const WChar* t, uint32_t mask) {
    setTaskName("CUPhaseSelectDialog");
    size_t n = 0;
    while (t[n]) n++;
    std::memcpy(title, t, (n + 1) * sizeof(WChar));   // wcscpy (no bound, as in the exe)
    count = 0;
    for (int32_t b = 2; b <= 5; b++) {
        if ((int32_t)mask >> b & 1) {
            text[count] = phaseRowText(mask, b);
            phase[count] = b;
            count++;
        }
    }
}

// @yo2 0x0077d240 open the dialog under `parent`
CUPhaseSelectDialog* CUPhaseSelectDialog::create(CTask* parent, float x, float y, int32_t style, const WChar* title,
                                                 uint32_t mask) {
    auto* d = new CUPhaseSelectDialog(title, mask);
    placeThin(d, x, y, style);
    return dynamic_cast<CUPhaseSelectDialog*>(d->CTask::create(parent, DLG_OK));
}

// @yo2 0x0077d5e0 CUPhaseSelectDialog::~CUPhaseSelectDialog
// @yo2 0x0077d5b0 CUPhaseSelectDialog scalar deleting destructor
CUPhaseSelectDialog::~CUPhaseSelectDialog() = default;

// @yo2 0x0077d6d0 slot 27
void CUPhaseSelectDialog::onOpened() {
    v660 = 0;
    if (duelAutoFocus()) cursorWarp(cx_, (boxH_ >> 1) - 0x10 + cy_);
}

// @yo2 0x0077d720 slot 26: auto mode answers 0; right click / cancel answers the cancel value when there is one
void CUPhaseSelectDialog::onMouse(CMouseEx* m) {
    if (g_duelAuto) {
        close(0);
        return;
    }
    if (cancelValue < 0) return;
    if (!mouseRightClicked(m) && !keyPushed(KEY_CANCEL)) return;
    mouseConsume(m);
    close(cancelValue);
}

// @yo2 0x0077d7b0 slot 25
bool CUPhaseSelectDialog::canClose() { return true; }

// @yo2 0x0077d7d0 slot 22: rows hover under the mouse; a release answers the row's phase (rows are listed from the
// second entry on, the first last), a release outside the rows answers 7 (cancel)
void CUPhaseSelectDialog::tick() {
    CUGDialogBase::tick();
    if (answered_ || fade_ != 0) return;
    int32_t mx, my;
    mousePos(appMouse(), &mx, &my);
    int32_t ly = ftol((double)my - y_ - 48.0);
    int32_t lx = ftol((double)mx - x_ - 8.0);
    int32_t row = ly / 16;
    if (ly < 0 || lx < 0 || !((double)lx < (double)(w_ - 16.0f)) || count <= row)
        list->clearHover();
    else
        list->setHover(row);
    layout();
    if (mouseReleased(appMouse()) && list->hover() != -1) {
        int32_t hv = list->hover();
        int32_t k = hv == count - 1 ? 0 : hv + 1;
        switch (phase[k]) {
        case 2: result_ = 2; break;
        case 3: result_ = 3; break;
        case 4: result_ = 4; break;
        case 5: result_ = 5; break;
        default: result_ = 7; break;
        }
        answered_ = true;
        return;
    }
    if (mouseReleased(appMouse()) && list->hover() == -1) {
        answered_ = true;
        result_ = 7;
    }
}

// @yo2 0x0077da70 onInit: one 16 px row per phase, the list box filled from the second entry on
bool CUPhaseSelectDialog::onInit() {
    CWindowModelThin::onInit();
    textField_->text_->setAlign(0);
    centre();
    movable_ = true;
    boxW_ = ftol(w_);
    boxH_ = count * 0x10 + 0x38;
    cx_ = ftol((double)(boxW_ >> 1) + x_);
    cy_ = ftol((double)(boxH_ >> 1) + y_);
    w_ = (float)boxW_;
    h_ = (float)boxH_;
    layout();
    listFlag = 0;
    list.setUser(this);
    list.set(listboxCreate(this, this, listFlag != 0));
    YO2_ASSERT(list.task(), "CWindowTaskListbox create failed");   // "CWindowTaskListbox 生成失敗！？"
    list->setInstName("CWindowTaskListbox list");                  // "CWindowTaskListbox 属性一覧"
    list->setMargins(8, 0x30, 8.0f, 48.0f);
    // approximated: the width / height Ghidra lost; the select dialog's (rect - 16, rect - 56) is used
    list->setSize(w_ - 16.0f, h_ - 16.0f - 40.0f);
    list->setDepth(2.0f);
    setText(title);
    for (int32_t i = 1; i < count; i++) list->add(windowWiden(textById(text[i])).c_str());
    list->add(windowWiden(textById(text[0])).c_str());
    layout();
    return true;
}

// @yo2 0x0077e350 onMain
bool CUPhaseSelectDialog::onMain() {
    if (unk3e8_) return false;
    tick();
    return true;
}
// @yo2 0x0077d590 slot 23
void CUPhaseSelectDialog::ugSlot23() {}
// @yo2 0x0077e380 slot 29
void CUPhaseSelectDialog::onClosed() { unk3e8_ = 1; }

// ================================================================ CULockOnDialog

// @yo2 0x0077e490 CULockOnDialog::CULockOnDialog(text)
CULockOnDialog::CULockOnDialog(const WChar* text) {
    planeConstruct(&sheet, 0);
    setTaskName("CULockOnDialog");
    CWindowModelThin::setText(text);
    following = 1;
}

// @yo2 0x0077e3a0 open the dialog under `parent`
CULockOnDialog* CULockOnDialog::create(CTask* parent, float x, float y, int32_t style, const WChar* text) {
    auto* d = new CULockOnDialog(text);
    placeThin(d, x, y, style);
    return dynamic_cast<CULockOnDialog*>(d->CTask::create(parent, DLG_OK));
}

// @yo2 0x0077e700 CULockOnDialog::~CULockOnDialog
// @yo2 0x0077e6d0 CULockOnDialog scalar deleting destructor
CULockOnDialog::~CULockOnDialog() { planeDestruct(&sheet); }

// @yo2 0x0077e880 onInit: an unframed box at (358, 300); marks the scene "locking on" (+0x12c)
bool CULockOnDialog::onInit() {
    CWindowModelThin::onInit();
    textField_->text_->setAlign(0);
    y_ = 300.0f;
    pos_.y = 300.0f;
    x_ = 358.0f;
    pos_.x = 358.0f;
    movable_ = false;
    layout();
    fitToRect(this);
    boxX = targetX = ftol(x_);
    boxY = targetY = ftol(y_);
    mousePos(appMouse(), &mouseX, &mouseY);
    g_duelScene[0x12c] = 1;
    return true;
}

// @yo2 0x0077ec40 (x, y) inside the box
bool CULockOnDialog::inRect(int32_t x, int32_t y) const {
    int32_t rw = ftol(w_), rh = ftol(h_), rx = ftol(x_), ry = ftol(y_);
    return rx <= x && x < rx + rw && ry <= y && y < ry + rh;
}

// @yo2 0x0077e9e0 slot 22: the box eases 1/5 of the way to its target a frame; once the mouse touches it, it moves
// out of the way to (358, 612). Closes when the engine's lock-on flag (0x012cc374) drops.
void CULockOnDialog::tick() {
    CUGDialogBase::tick();
    if (*engAt<uint32_t>(0x012cc374) == 0) {
        if (fade_ == 0) {
            onClosed();
            running_ = false;
        }
        return;
    }
    int32_t mx = 0, my = 0;
    mousePos(appMouse(), &mx, &my);
    if (following && inRect(mx, my)) {
        following = 0;
        targetX = 0x166;
        targetY = 0x264;
    }
    boxX = (boxX - targetX) * 4 / 5 + targetX;
    boxY = (boxY - targetY) * 4 / 5 + targetY;
    x_ = pos_.x = (float)boxX;
    y_ = pos_.y = (float)boxY;
    fitToRect(this);
}

// @yo2 0x0077ebe0 onMain
bool CULockOnDialog::onMain() {
    if (unk3e8_) return false;
    if (running_) tick();
    return true;
}

// @yo2 0x0077e690 slot 18
bool CULockOnDialog::windowSlot18() { return true; }
// @yo2 0x0077e6b0 slot 23
void CULockOnDialog::ugSlot23() {}

// @yo2 0x0077ec10 slot 29
void CULockOnDialog::onClosed() {
    g_duelScene[0x12c] = 0;
    unk3e8_ = 1;
}

// ================================================================ CHelpDialog

// @yo2 0x0077edd0 CHelpDialog::CHelpDialog
CHelpDialog::CHelpDialog() = default;

// @yo2 0x0077edb0 (island) an empty function between the help dialog's factory and constructor
void helpDialogNop() {}

// @yo2 0x0077ecd0 open an empty help window under `parent` (style 5)
CHelpDialog* CHelpDialog::create(CTask* parent) {
    auto* d = new CHelpDialog;
    d->setup(0.0f, 0.0f, 5);
    return dynamic_cast<CHelpDialog*>(d->CTask::create(parent, DLG_OK));
}

// @yo2 0x0077ee30 CHelpDialog::~CHelpDialog
// @yo2 0x0077ee00 CHelpDialog scalar deleting destructor
CHelpDialog::~CHelpDialog() = default;

// @yo2 0x0077ef10 onInit
bool CHelpDialog::onInit() {
    CWindowTaskModel::onInit();
    return true;
}

// @yo2 0x0077ef30 onMain
bool CHelpDialog::onMain() { return true; }

}   // namespace ds
