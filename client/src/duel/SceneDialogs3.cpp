// yo2Dialogs.cpp part 3: the card type / attribute list dialogs (on System's CWindowModelDialogDecorator) and the
// summon command menu (CWindowModelListDuelCmd / CUSummonDialogSp).
#include "NetDuel.h"
#include "SceneDialogs.h"

namespace ds {

// The cursor state the command menu snapshots when it opens (four words of DAT_012a8318.. into DAT_012a7c20..).
// approximated: two stand-in blocks; +0x2c of the copy is read back as flags (bit 10 closes the menu in scene 1).
#if YO2_IN_EXE
#define g_cursorLive YO2_EXE_ARR(uint32_t, 0x012a8318)
#define g_cursorSaved YO2_EXE_ARR(uint32_t, 0x012a7c20)
#else
uint32_t g_cursorLive[12];    // DAT_012a8318
uint32_t g_cursorSaved[12];   // DAT_012a7c20
#endif

void balloonConstruct(void* b);                         // TODO(System) FUN_00a5c410 the help balloon
void balloonDestruct(void* b);                          // TODO(System) FUN_00a5c6d0
void balloonSetWidth(void* b, int32_t w);               // TODO(System) FUN_00a5c500
void balloonSetText(void* b, const vc6::wstring& s);    // TODO(System) FUN_00a5c530
void balloonHide(void* b);                              // TODO(System) FUN_00a5c6a0

// ================================================================ CWindowModelListCardType / CardAttr

// @yo2 0x0077a980 CWindowModelListCardType::~CWindowModelListCardType
// @yo2 0x0077a930 CWindowModelListCardType scalar deleting destructor
// @yo2 0x0077b090 CWindowModelListCardAttr::~CWindowModelListCardAttr
// @yo2 0x0077b040 CWindowModelListCardAttr scalar deleting destructor
// (the template's implicit destructor: the CTaskPtr, then the decorator)
template class CWindowModelListCard<CWindowTaskListboxCardType>;
template class CWindowModelListCard<CWindowTaskListboxCardAttr>;

namespace {
// the shared layout of the two list dialogs: box at (362, y) w 300, the wrapped dialog sized alike and movable
template <class D>
void placeListDialog(D* d, float y, float h) {
    d->x_ = 362.0f;
    d->y_ = y;
    CWindowModelDialogWithBtns* in = d->inner_;
    in->y_ = y;
    in->pos_.y = y;
    in->x_ = 362.0f;
    in->pos_.x = 362.0f;
    d->w_ = 300.0f;
    d->h_ = h;
    d->layout();
    if (d->inner_) {
        d->inner_->w_ = 300.0f;
        d->inner_->h_ = h;
        d->inner_->layout();
    }
    if (d->inner_) d->inner_->movable_ = true;
}
}   // namespace

// ================================================================ CUSelectTypeDialog

// @yo2 0x0077a400 CUSelectTypeDialog::CUSelectTypeDialog(mask): the types of mask bits 1..20
CUSelectTypeDialog::CUSelectTypeDialog(uint32_t mask) {
    setTaskName("CWindowModelListCardType");
    setTaskName("CUSelectTypeDialog");
    count = 0;
    for (int32_t t = 1; t < 0x15; t++)
        if (mask >> t & 1u) types[count++] = t;
}

// @yo2 0x0077a320 open the dialog under `parent`; `owner` gets its answer
void CUSelectTypeDialog::create(CTask* parent, void* owner, uint32_t unused, uint32_t mask) {
    (void)unused;
    auto* d = new CUSelectTypeDialog(mask);
    d->owner = owner;
    d->multi = 0;
    d->v3ad = 0;
    d->picks = 1;
    d->CTask::create(parent, DLG_OK);
}

// @yo2 0x0077aa20 CUSelectTypeDialog::~CUSelectTypeDialog
// @yo2 0x0077a9f0 CUSelectTypeDialog scalar deleting destructor
CUSelectTypeDialog::~CUSelectTypeDialog() = default;

// @yo2 0x0077aaa0 onInit: 300 x 368 at (362, 200), one row per type
bool CUSelectTypeDialog::onInit() {
    listCardTypeInit(this);
    placeListDialog(this, 200.0f, 368.0f);
    for (int32_t i = 0; i < count; i++) list->addType(types[i]);
    list->setPicks(picks);
    layout();
    fadeIn(0);
    return true;
}

// @yo2 0x0077ac00 onMain: OK with exactly `picks` rows ticked answers the (last) ticked type; auto mode answers 0
bool CUSelectTypeDialog::onMain() {
    int32_t sel = 0;
    if (inner_) inner_->onMain();
    if (g_duelAuto) {
        engSendChoice(0);
        return false;
    }
    if (result() == DLG_OK && list->selectedCount() == picks) {
        for (int32_t i = 0; i < count; i++)
            if (list->selected(i)) sel = types[i];
        engSendChoice((uint32_t)sel);
        return false;
    }
    resetResult();
    return true;
}

// ================================================================ CUSelectAttributeDialog

// @yo2 0x0077ae10 CUSelectAttributeDialog::CUSelectAttributeDialog(mask): attributes of mask bits 1..6
CUSelectAttributeDialog::CUSelectAttributeDialog(uint32_t mask) {
    setTaskName("CWindowModelListCardAttr");
    setTaskName("CUSelectAttributeDialog");
    count = 0;
    for (int32_t a = 1; a < 7; a++)
        if (mask >> a & 1u) attrs[count++] = a;
}

// @yo2 0x0077ad20 open the dialog under `parent`; several rows may be ticked when picks > 1
void CUSelectAttributeDialog::create(CTask* parent, void* owner, uint32_t unused, int32_t picks, uint32_t mask) {
    (void)unused;
    auto* d = new CUSelectAttributeDialog(mask);
    d->owner = owner;
    d->multi = 1 < picks;
    d->v3ad = 0;
    d->picks = picks;
    d->CTask::create(parent, DLG_OK);
}

// @yo2 0x0077b130 CUSelectAttributeDialog::~CUSelectAttributeDialog
// @yo2 0x0077b100 CUSelectAttributeDialog scalar deleting destructor
CUSelectAttributeDialog::~CUSelectAttributeDialog() = default;

// @yo2 0x0077b1b0 onInit: (count + 3) rows of 16 px centred on y = 384
bool CUSelectAttributeDialog::onInit() {
    listCardAttrInit(this);
    float y = (float)(0x180 - ((count + 3) * 0x10 >> 1));
    placeListDialog(this, y, (float)((count + 3) * 0x10));
    for (int32_t i = 0; i < count; i++) list->addAttr(attrs[i]);
    list->setPicks(picks);
    layout();
    fadeIn(0);
    return true;
}

// @yo2 0x0077b360 onMain: the ticked attributes as a bit mask
bool CUSelectAttributeDialog::onMain() {
    uint32_t sel = 0;
    if (inner_) inner_->onMain();
    if (g_duelAuto) {
        engSendChoice(0);
        return false;
    }
    if (result() == DLG_OK && list->selectedCount() == picks) {
        for (int32_t i = 0; i < count; i++)
            if (list->selected(i)) sel |= 1u << (attrs[i] & 0x1f);
        engSendChoice(sel);
        return false;
    }
    resetResult();
    return true;
}

// ================================================================ CWindowModelListDuelCmd / CUSummonDialogSp

// The command of each mask bit (DAT_00cd4a10): the DUEL_COMID menu entries in menu order.
const int32_t kSummonCommands[14] = {8, 0, 12, 7, 6, 3, 4, 5, 2, 1, 10, 13, 9, 19};

CWindowModelListDuelCmd::CWindowModelListDuelCmd() { setTaskName("CWindowModelListDuelCmd"); }

// @yo2 0x0077c720 CWindowModelListDuelCmd::~CWindowModelListDuelCmd
// @yo2 0x0077c6d0 CWindowModelListDuelCmd scalar deleting destructor
CWindowModelListDuelCmd::~CWindowModelListDuelCmd() = default;

// @yo2 0x0077c4b0 CUSummonDialogSp::CUSummonDialogSp
CUSummonDialogSp::CUSummonDialogSp() {
    balloonConstruct(balloon);
    setTaskName("CUSummonDialogSp");
}

// @yo2 0x0077c3d0 open the menu task under `parent` (priority 8000, hidden until open())
CUSummonDialogSp* CUSummonDialogSp::create(CTask* parent, float x, float y, int32_t style) {
    auto* d = new CUSummonDialogSp;
    placeThin(d, x, y, style);
    return dynamic_cast<CUSummonDialogSp*>(d->CTask::create(parent, 8000));
}

// @yo2 0x0077c830 CUSummonDialogSp::~CUSummonDialogSp
// @yo2 0x0077c800 CUSummonDialogSp scalar deleting destructor
CUSummonDialogSp::~CUSummonDialogSp() { balloonDestruct(balloon); }

// @yo2 0x0077c940 show the menu for `c` with the commands of `mask`: 158 px wide, one 16 px row per command plus
// one, its bottom left 79 px left of the card centre and half a card above it (hand cards: at y 568)
void CUSummonDialogSp::open(uint32_t a, uint32_t b, uint32_t mask, CCard* c) {
    (void)a;
    (void)b;
    count = 0;
    for (int32_t i = 0; i < 14; i++) {
        if ((int32_t)mask >> i & 1) {
            cmd[count] = kSummonCommands[i];
            bit[count] = i;
            count++;
        }
    }
    chosen = -1;
    card = c;
    openFrame = duelSceneFrame();
    uint16_t code;
    c->getCode(&code);   // the exe reuses the mask argument's slot for it
    int32_t px, py, half;
    matPos(code & 1u, (code & 0xffffu) >> 1 & 0x1f, (code & 0xffffu) >> 6 & 0xff, &px, &py);
    if ((code & 0x3e) == 0x16) {
        py = 600 - 0x20;   // DAT_00bed6f4 - 32
        half = g_cardW / 2;
    } else {
        half = g_miniH;
    }
    list->clearCmds();
    for (int32_t k = 0; k < count; k++) list->addCmd(cmd[k]);
    float x = (float)(px - 0x4f);
    float y = (float)((py - half / 2) + (count + 1) * -0x10);
    w_ = 158.0f;
    x_ = x;
    y_ = y;
    pos_.x = x;
    pos_.y = y;
    h_ = (float)((count + 1) * 0x10);
    layout();
    layout();
    fadeIn(0);
    g_cursorSaved[0] = g_cursorLive[0];
    g_cursorSaved[1] = g_cursorLive[1];
    g_cursorSaved[11] = g_cursorLive[11];
    g_cursorSaved[2] = g_cursorLive[2];
    hoverRow = 0;
    bringToFront();
    taskLock(this, 2, false);
    setDisp(true, true);
    shown = 1;
    mouseResetWheel(appMouse());
    balloonSetWidth(balloon, 0x14);
    balloonSetText(balloon, windowText(0x8c3));   // (*g_stringDB)->vf1: the text widened
}

// @yo2 0x0077cd20 hide the menu (the task stays)
void CUSummonDialogSp::hide() {
    setDisp(false, true);
    shown = 0;
    taskLock(this, 2, true);
    balloonHide(balloon);
}

// @yo2 0x0077cd60
int32_t CUSummonDialogSp::choice() const { return chosen; }
// @yo2 0x0077cd80
bool CUSummonDialogSp::hasChoice() const { return chosen != -1; }

// @yo2 0x0077cda0 (island) an empty function of this class
void summonNop(CUSummonDialogSp*) {}

// @yo2 0x0077cdc0 onInit: starts hidden (the text field too)
bool CUSummonDialogSp::onInit() {
    baseInit();
    CWindowTaskTextField* t = textField_.get();
    t->setDisp(false, true);
    taskLock(t, 2, true);
    return true;
}

// @yo2 0x0077d1b0 (x, y) inside the menu box
bool CUSummonDialogSp::inRect(int32_t x, int32_t y) const {
    int32_t w = ftol(w_), h = ftol(h_);
    int32_t rx = ftol(x_), ry = ftol(y_);
    return rx <= x && x < rx + w && ry <= y && y < ry + h;
}

// @yo2 0x0077ce00 onMain: hover / wheel over the rows, a click picks; moving off the card and the menu (or onto
// another card, or below y 600), or clicking above the bottom margin elsewhere, hides it
bool CUSummonDialogSp::onMain() {
    int32_t mx = 0, my = 0;
    CWindowModelThin::onMain();
    if (!shown) return true;
    mousePos(appMouse(), &mx, &my);
    mouseVf542850(appMouse(), 0);
    int32_t lx = ftol((double)mx - x_ - 8.0);
    int32_t ly = ftol((double)my - y_ - 8.0);
    if (g_sceneId == 1 && (g_cursorSaved[11] & 0x400)) {
        hide();
        return true;
    }
    if (!card->hit(mx, my) && !inRect(mx, my)) {
        hide();
    } else {
        if (g_cardHover && card != g_cardHover) hide();
        if (my > 600) hide();
    }
    if (lx >= 0 && !(w_ < (float)lx) && ly >= 0) {
        int32_t row = ly / 16;
        bool cleared = false;
        if (row < count) {
            list->setHover(row);
            hoverRow = row;
        } else {
            list->clearHover();
            cleared = true;
        }
        layout();
        if (cleared) list->setHover(hoverRow);
    }
    if (mouseWheelMoved(appMouse())) {
        hoverRow = (mouseWheel(appMouse()) + hoverRow) % count;
        mouseResetWheel(appMouse());
    }
    if (list->hover() != -1 && mouseClicked(appMouse())) {
        if (chosen == -1) chosen = bit[list->hover()];
        return true;
    }
    if (duelSceneFrame() == openFrame) return true;
    if (!mouseClicked(appMouse())) return true;
    if ((double)my - y_ < (double)(h_ - 8.0f)) hide();
    return true;
}

}   // namespace ds
