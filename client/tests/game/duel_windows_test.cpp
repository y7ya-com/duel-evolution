// src/Game/yo2DuelWindows.cpp: the duel choice button, the duel settings window and its frame.
#include <windows.h>

#include "Game/yo2AppAccess.h"
#include "Game/yo2DuelWindows.h"
#include "Game/yo2GameManager.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "game_test.h"

#include "window_stubs.h"

struct FakeText : CStringDB {
    vc6::string get(uint32_t i) const override { return i == 0xfa2 ? "OK" : "text"; }
};

uint8_t g_duelSettings[3] = {1, 0, 7};   // rows 1, 2, 3
uint8_t appDuelSetting(AppDuelSetting w) {
    return g_duelSettings[w == AppDuelSetting::ROW1 ? 0 : w == AppDuelSetting::ROW2 ? 1 : 2];
}
CWindowTaskScrollBase* duelResultScrollCreate(CTask* parent, IWindowTaskMediator* m, int32_t style) {
    return CWindowTaskScroll::create(parent, m, style);
}

static CElement* el(const CTaskPtrBase& p) { return windowElement(p); }
static bool rectIs(const CElement* e, int u, int v, int w, int h) {
    return e->rect_[0] == u && e->rect_[1] == v && e->rect_[2] == w && e->rect_[3] == h;
}

struct Win : CWindowTaskModel {
    void layout() override {}
    int32_t maxZ() const override { return 0; }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll*) override {}
};

static void buttonDuel(Win* w) {
    CWindowTaskButtonDuel* b = CWindowTaskButtonDuel::create(w, w);
    CHECK(b && b->taskName() == "デュエルメニュー選択肢ボタン(コントロール)" && b->mediator_ == w && b->kind() == 0x19);
    CHECK(static_cast<CSpriteElm*>(el(b->sprites_[0]))->texture == "data/common/window/duel_btn_01_c01.png");
    CHECK(b->pieces_[8].uv[2][0] == 64 && b->pieces_[8].uv[0][1] == 16 && b->pieces_[4].uv[4][0] == 58);
    CHECK(b->pieces_[4].uv[2][0] == 56 && b->pieces_[1].uv[1][0] == 32);
    b->setLook(1);   // hover: the top left piece from (24, 0)
    CHECK(rectIs(el(b->sprites_[0]), 24, 0, 8, 8));
}

static void duelConfig(CTask* root) {
    CWindowModelDuelConfig* c = CWindowModelDuelConfig::create(root);
    CHECK(c && c->taskName() == "デュエル詳細設定" && c->w_ == 492 && c->h_ == 452 && c->modal_ && c->topmost_);
    CHECK(c->maxZ() == static_cast<int32_t>(c->z_ + 5));
    // the frame: one picture, the other pieces empty; one tile per edge and the centre
    CWindowTaskDuelConfigFrame* f = c->frame_.get();
    CHECK(f->instName() == "デュエル詳細設定背景" && f->mediator_ == c && f->w_ == 80 && f->h_ == 24);
    CHECK(static_cast<CSpriteElm*>(el(f->topLeft_))->texture == "data/common/window/duel_win_03_c01.png");
    CHECK(rectIs(el(f->topLeft_), 0, 0, 492, 452) && rectIs(el(f->bottomRight_), 0, 0, 0, 0));
    CHECK(f->top_.get()->tiles.size() == 5 && f->top_.get()->texture == "data/common/window/duel_win_03_c01.png");
    CHECK(!f->left_.task() && el(f->topRight_)->pos_.x == 80);
    // the title and a row
    CWindowTaskShadowText* t = c->title_.get();
    CHECK(t->instName() == "デュエル詳細設定タイトル" && t->x_ == 0 && t->y_ == 4 && t->z_ == 1);
    CHECK(t->shadow_->pos_.x == 1 && t->shadow_->pos_.y == 5 && t->text_->align() == CWindowTaskText::CENTRE);
    CHECK(t->shadow_->disp_ && elmOf(t->text_.get())->color_[0] == 1 && elmOf(t->shadow_.get())->color_[0] == 0);
    CWindowTaskPictureSwitch* on = c->row1On_.get();
    CHECK(on->instName() == "オートフォーカスあり" && on->x_ == 22 && on->y_ == 53 && on->w_ == 224 && on->h_ == 32);
    CHECK(static_cast<CSpriteElm*>(el(on->click_))->texture == "data/common/window/duel_btn_02_c01.png");
    CHECK(rectIs(el(on->checkedSprite_), 0, 32, 224, 32) && on->owner_.task() == c && on->mediator_ == c);
    CHECK(c->row3CText_->x_ == 134 && c->row3CText_->y_ == 206 && c->row3CText_->z_ == 2);
    CHECK(elmOf(c->label2_->text_.get())->color_[1] == 1 && elmOf(c->label2_->text_.get())->color_[0] == 0.2f);
    // help: scroll bar and the hidden arrows; the buttons
    CHECK(c->helpScroll_->x_ == 455 && c->helpScroll_->length_ == 142 && !c->helpScroll_->autoHide_);
    CHECK(c->helpScroll_->wheelW_ == 492 && c->help_->y_ == 264);
    CHECK(!c->helpDown_->disp_ && c->helpDown_->isLocked(2) && rectIs(el(c->helpDown_->normal_), 24, 0, 24, 16));
    CHECK(c->ok_->instName() == "OKボタン" && c->ok_->x_ == 53 && c->ok_->y_ == 420 && c->cancel_->x_ == 299);
    CHECK(c->ok_->minW_ == 140 && c->ok_->z_ == 3 && c->ok_->caption_->text_->text_.get());
    // the saved settings
    CHECK(c->row1_ && g_gameMng->unk434_ && !c->row2_ && g_gameMng->unk436_ && c->row3_ == 2);
    CHECK(c->row1On_->checked_ && !c->row1Off_->checked_ && c->row2Off_->checked_ && c->row3C_->checked_);
    CHECK(!c->row3A_->checked_ && c->unk4d8_ == -1);
    c->setRow3(0);
    CHECK(c->row3A_->checked_ && !c->row3C_->checked_ && c->row3_ == 0);
    c->setRow3(5);
    CHECK(c->row3A_->checked_ && c->row3_ == 5);
    c->setRow2(true);
    CHECK(c->row2On_->checked_ && !c->row2Off_->checked_ && c->row2_);
}

int main() {
    FakeText text;
    delete g_stringDB;
    g_stringDB = &text;
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    auto* w = new Win;
    w->create(root, 0);
    buttonDuel(w);
    CGameMng::create(root, 3);
    duelConfig(root);
    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("duel_windows_test ok\n");
}
