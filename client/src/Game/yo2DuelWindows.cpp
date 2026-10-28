// The duel room's windows (see yo2DuelWindows.h).
#include "Game/yo2DuelWindows.h"

#include <cstring>

#include "Game/yo2AppAccess.h"
#include "Game/yo2GameManager.h"

// =====================================================================================================================
// CWindowTaskButtonDuel

CWindowTaskButtonDuel::CWindowTaskButtonDuel() { setTaskName("デュエルメニュー選択肢ボタン(コントロール)"); }

// @yo2 0x00a35b20 CWindowTaskButtonDuel::create (constructor inlined)
CWindowTaskButtonDuel* CWindowTaskButtonDuel::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* b = dynamic_cast<CWindowTaskButtonDuel*>((new CWindowTaskButtonDuel)->CTask::create(parent, 10000));
    b->mediator_ = mediator;
    return b;
}

// @yo2 0x00a35d30 CWindowTaskButtonDuel::~CWindowTaskButtonDuel
// @yo2 0x00a35d00 CWindowTaskButtonDuel deleting destructor
CWindowTaskButtonDuel::~CWindowTaskButtonDuel() = default;

// @yo2 0x00a35e60 CWindowTaskButtonDuel::loadImages: 8 x 8 pieces; looks normal (0, 0), hover (24, 0), pressed and
// checked (48, 0). The centre's checked looks start at u 58, not 56 (as in the exe).
void CWindowTaskButtonDuel::loadImages() {
    vc6::string path = "data/common/window/";   // (a literal here, not the factory's dataDir)
    path += "duel_btn_01_c01.png";
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        windowSpriteTexture(s, path);
    for (int g = 0; g < 9; g++) {
        Piece& p = pieces_[g];
        p.w = p.h = 8;
        int32_t u = (g % 3) * 8, v = (g / 3) * 8;
        const int32_t looks[5] = {u, u + 24, u + 48, u + 48, u + 48};
        for (int k = 0; k < 5; k++) {
            p.uv[k][0] = looks[k];
            p.uv[k][1] = v;
        }
    }
    pieces_[4].uv[3][0] = pieces_[4].uv[4][0] = 58;
}

// =====================================================================================================================
// CWindowTaskDuelConfigFrame

// @yo2 0x00a44880 CWindowTaskDuelConfigFrame::CWindowTaskDuelConfigFrame (keeps the base's task name)
CWindowTaskDuelConfigFrame::CWindowTaskDuelConfigFrame() = default;

// @yo2 0x00a449f0 CWindowTaskDuelConfigFrame::create
CWindowTaskDuelConfigFrame* CWindowTaskDuelConfigFrame::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* f = dynamic_cast<CWindowTaskDuelConfigFrame*>((new CWindowTaskDuelConfigFrame)->CTask::create(parent, 10000));
    f->mediator_ = mediator;
    return f;
}

// @yo2 0x00a448e0 CWindowTaskDuelConfigFrame::~CWindowTaskDuelConfigFrame
// @yo2 0x00a448b0 CWindowTaskDuelConfigFrame deleting destructor
CWindowTaskDuelConfigFrame::~CWindowTaskDuelConfigFrame() = default;

// @yo2 0x00a44ad0 CWindowTaskDuelConfigFrame::loadImages: the top left piece is the whole picture, the other pieces
// are empty; each sprite shows its piece
void CWindowTaskDuelConfigFrame::loadImages() {
    vc6::string path = windowDataDir();
    path += "duel_win_03_c01.png";
    windowSpriteTexture(topLeft_, path);
    windowDupTexture(top_, path);
    windowSpriteTexture(topRight_, path);
    windowSpriteTexture(bottomLeft_, path);
    windowSpriteTexture(bottomRight_, path);
    for (Piece& p : pieces_)
        p = {0, 0, 0, 0};
    pieces_[0] = {492, 452, 0, 0};
    auto show = [](CElement* e, const Piece& p) {
        e->rect_[0] = p.u;
        e->rect_[1] = p.v;
        e->rect_[2] = p.w;
        e->rect_[3] = p.h;
    };
    show(windowElement(topLeft_), pieces_[0]);
    show(windowElement(top_), pieces_[1]);
    show(windowElement(topRight_), pieces_[2]);
    show(windowElement(bottomLeft_), pieces_[6]);
    show(windowElement(bottomRight_), pieces_[8]);
}

// =====================================================================================================================
// CWindowModelDuelConfig

// @yo2 0x00a45980 CWindowModelDuelConfig::CWindowModelDuelConfig
CWindowModelDuelConfig::CWindowModelDuelConfig() { setTaskName("デュエル詳細設定"); }

// @yo2 0x00a460a0 CWindowModelDuelConfig::create
CWindowModelDuelConfig* CWindowModelDuelConfig::create(CTask* parent) {
    return dynamic_cast<CWindowModelDuelConfig*>((new CWindowModelDuelConfig)->CTask::create(parent, 10000));
}

// @yo2 0x00a45e40 CWindowModelDuelConfig::~CWindowModelDuelConfig
// @yo2 0x00a45df0 CWindowModelDuelConfig deleting destructor
CWindowModelDuelConfig::~CWindowModelDuelConfig() = default;

// @yo2 0x00a45d80 CWindowModelDuelConfig::maxZ
int32_t CWindowModelDuelConfig::maxZ() const { return static_cast<int32_t>(z_ + 5.0f); }

// @yo2 0x00a45db0 CWindowModelDuelConfig::applyZ
void CWindowModelDuelConfig::applyZ() { pos_.z = z_; }

// @yo2 0x00a45dd0 CWindowModelDuelConfig::onControlCommand
void CWindowModelDuelConfig::onControlCommand(CWindowTaskControll*) { bringToFront(); }

// TODO(phase1-yanesdk): 0x00a4af50, outside the assigned rows.
void CWindowModelDuelConfig::onControlEvent(CWindowTaskControll*) {}

// @yo2 0x00a49130 CWindowModelDuelConfig::setRow1
void CWindowModelDuelConfig::setRow1(bool on) {
    row1On_->checked_ = on;
    row1Off_->checked_ = !on;
    row1_ = on;
}

// @yo2 0x00a49180 CWindowModelDuelConfig::setRow2
void CWindowModelDuelConfig::setRow2(bool on) {
    row2On_->checked_ = on;
    row2Off_->checked_ = !on;
    row2_ = on;
}

// @yo2 0x00a491d0 CWindowModelDuelConfig::setRow3
void CWindowModelDuelConfig::setRow3(int32_t choice) {
    if (choice >= 0 && choice <= 2) {
        row3A_->checked_ = choice == 0;
        row3B_->checked_ = choice == 1;
        row3C_->checked_ = choice == 2;
    }
    row3_ = choice;
}

namespace {

// A shadowed text of the window (the exe writes each one out; the steps are in its order).
CWindowTaskShadowText* duelText(CWindowModelDuelConfig* w, CTaskPtr<CWindowTaskShadowText>& p, const char* name, int32_t x,
                                int32_t y) {
    p.setUser(w);
    p.set(CWindowTaskShadowText::create(w, w));
    windowNameTask(p.get(), name);
    p->inheritTransform_ = true;
    p->setPos(x, y);
    return p.get();
}
void duelTextDone(CWindowTaskShadowText* t, int32_t textId, float z) {
    if (textId)
        t->setTextId(textId);
    t->z_ = z;
    t->pos_.z = z;
}
// A row label: green, z 1.
void duelLabel(CWindowModelDuelConfig* w, CTaskPtr<CWindowTaskShadowText>& p, int32_t y, int32_t textId) {
    CWindowTaskShadowText* t = duelText(w, p, "『オートフォーカス』", 38, y);
    t->showShadow();
    t->setColors(0.2f, 1, 0.2f, 1);
    duelTextDone(t, textId, 1);
}
// A choice: a 224 x 32 switch of duel_btn_02_c01.png and its centred white caption 8 pixels down.
void duelChoice(CWindowModelDuelConfig* w, CTaskPtr<CWindowTaskPictureSwitch>& sw, CTaskPtr<CWindowTaskShadowText>& text,
                bool on, int32_t x, int32_t y, int32_t textId) {
    sw.setUser(w);
    sw.set(CWindowTaskPictureSwitch::create(w, w, w));
    windowNameTask(sw.get(), on ? "オートフォーカスあり" : "オートフォーカスなし");
    CWindowTaskPictureSwitch* s = sw.get();
    s->inheritTransform_ = true;
    s->y_ = s->pos_.y = float(y);
    s->x_ = s->pos_.x = float(x);
    s->setImages("data/common/window/duel_btn_02_c01.png", {0, 0, 224, 32}, {0, 0, 224, 32}, {0, 32, 224, 32},
                 {0, 32, 224, 32});
    s->z_ = s->pos_.z = 1;
    CWindowTaskShadowText* t = duelText(w, text, on ? "『オートフォーカスあり』" : "『オートフォーカスなし』", x, y + 8);
    t->setArea(224, 16);
    t->setAlign(CWindowTaskText::CENTRE);
    t->showShadow();
    t->setColors(1, 1, 1, 1);
    duelTextDone(t, textId, 2);
}
// The help text's arrows: 24 x 16 from (u, 0) of duel_arrow_01_c01.png, z 3, hidden.
void duelArrow(CWindowModelDuelConfig* w, CTaskPtr<CWindowTaskPictureSwitch>& sw, int32_t u, float y) {
    sw.setUser(w);
    sw.set(CWindowTaskPictureSwitch::create(w, w, w));
    windowNameTask(sw.get(), "上矢印");   // (both of them)
    CWindowTaskPictureSwitch* s = sw.get();
    WindowRect r = {u, 0, 24, 16};
    s->setImages("data/common/window/duel_arrow_01_c01.png", r, r, r, r);
    s->x_ = s->pos_.x = 234;
    s->y_ = s->pos_.y = y;
    s->z_ = s->pos_.z = 3;
    windowShowElement(s, false);
}
void duelButton(CWindowModelDuelConfig* w, CTaskPtr<CWindowTaskButtonDuel>& p, const char* name, float x, int32_t textId) {
    p.setUser(w);
    p.set(CWindowTaskButtonDuel::create(w, w));
    windowNameTask(p.get(), name);
    CWindowTaskButtonDuel* b = p.get();
    b->inheritTransform_ = true;
    b->minW_ = 140;
    b->unk5b4_ = 24;
    b->layout();
    b->x_ = b->pos_.x = x;
    b->y_ = b->pos_.y = 420;
    b->setTextId(textId);
    b->z_ = b->pos_.z = 3;
}

}  // namespace

// @yo2 0x00a46160 CWindowModelDuelConfig::onInit: 492 x 452; the controls; the saved settings
bool CWindowModelDuelConfig::onInit() {
    x_ = y_ = 0;
    w_ = 492;
    h_ = 452;
    frame_.setUser(this);
    frame_.set(CWindowTaskDuelConfigFrame::create(this, this));
    windowNameTask(frame_.get(), "デュエル詳細設定背景");
    frame_->inheritTransform_ = true;
    frame_->z_ = frame_->pos_.z = 0;

    title_.setUser(this);
    title_.set(CWindowTaskShadowText::create(this, this));
    windowNameTask(title_.get(), "デュエル詳細設定タイトル");
    CWindowTaskShadowText* t = title_.get();
    t->inheritTransform_ = true;
    t->setArea(492, 16);
    t->setPos(0, 4);
    t->setAlign(CWindowTaskText::CENTRE);
    t->showShadow();
    t->setColors(1, 1, 1, 1);
    duelTextDone(t, 0x198c, 1);

    duelLabel(this, label1_, 37, 0x197a);
    duelChoice(this, row1On_, row1OnText_, true, 22, 53, 0x197d);
    duelChoice(this, row1Off_, row1OffText_, false, 246, 53, 0x197e);
    duelLabel(this, label2_, 89, 0x197b);
    duelChoice(this, row2On_, row2OnText_, true, 22, 105, 0x197d);
    duelChoice(this, row2Off_, row2OffText_, false, 246, 105, 0x197e);
    duelLabel(this, label3_, 141, 0x197c);
    duelChoice(this, row3A_, row3AText_, true, 22, 157, 0x197f);
    duelChoice(this, row3B_, row3BText_, false, 246, 157, 0x1980);
    duelChoice(this, row3C_, row3CText_, false, 134, 198, 0x1981);

    t = duelText(this, helpLabel_, "『説明』", 38, 236);
    t->setArea(224, 16);
    t->setAlign(CWindowTaskText::LEFT);
    t->showShadow();
    t->setColors(0.2f, 1, 0.2f, 1);
    duelTextDone(t, 0, 2);
    t = duelText(this, help_, "説明", 30, 264);
    t->setArea(424, 128);
    t->setAlign(CWindowTaskText::LEFT);
    t->showShadow();
    t->setColors(1, 1, 1, 1);
    duelTextDone(t, 0x1989, 2);
    t->setPageLines(8);

    helpScroll_.setUser(this);
    helpScroll_.set(duelResultScrollCreate(this, this, 0));
    windowNameTask(helpScroll_.get(), "説明のスクロールバー");
    CWindowTaskScrollBase* sc = helpScroll_.get();
    sc->x_ = 455;
    sc->y_ = 258;
    sc->length_ = 142;
    sc->autoHide_ = false;
    sc->setWheelArea(x_, y_, w_, h_);
    duelArrow(this, helpUp_, 0, 248);
    duelArrow(this, helpDown_, 24, 392);
    duelButton(this, ok_, "OKボタン", 53, 0xfa2);
    duelButton(this, cancel_, "Cancelボタン", 299, 0xfa3);
    modal_ = true;

    // the saved settings, into the remembered values and g_gameMng
    bool row1 = appDuelSetting(AppDuelSetting::ROW1) != 0;
    g_gameMng->unk434_ = row1;
    row1_ = row1;
    uint8_t row3 = appDuelSetting(AppDuelSetting::ROW3);
    row3 = row3 == 0 ? 0 : row3 == 1 ? 1 : 2;
    g_gameMng->unk437_ = row3;
    row3_ = row3;
    bool row2 = appDuelSetting(AppDuelSetting::ROW2) != 0;
    row2_ = row2;
    g_gameMng->unk436_ = !row2;
    setTopmost(true);
    unk4d8_ = unk4dc_ = -1;
    setRow1(row1_);
    setRow2(row2_);
    setRow3(row3_);
    return true;
}
