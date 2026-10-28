// yo2CardListView.cpp: the card-property icons (one cell of an icon strip per value, hidden out of range).
#include "Game/yo2CardListView.h"
#include "System/yo2ZSort.h"
#include "game_test.h"
#include "window_stubs.h"

struct Win : CWindowTaskModel {
    void layout() override {}
    int32_t maxZ() const override { return 0; }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll*) override {}
};

static bool shown(CElement* e) { return e->isVisible(true); }

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    auto* w = new Win;
    w->CTask::create(root, 0);

    auto* attr = CWindowTaskImageCardAttr::create(w, w, 3);
    CHECK(attr->taskName() == "CWindowTaskImageCardAttr" && attr->sprite_->texture == "data/common/icon/icon_zokusei_01.png");
    CHECK(shown(attr) && attr->part_[0] == 32 && attr->part_[2] == 16 && attr->w_ == 16);
    attr->setValue(10);
    CHECK(!shown(attr) && attr->value_ == 10);
    attr->setValue(9);
    CHECK(shown(attr) && attr->part_[0] == 128);

    auto* type = CWindowTaskImageCardType::create(w, w, 21);
    CHECK(shown(type) && type->part_[0] == 320);
    type->setValue(22);
    CHECK(!shown(type));
    auto* icon = CWindowTaskImageCardIcon::create(w, w, 8);
    CHECK(!shown(icon) && icon->sprite_->texture == "data/common/icon/icon_mahouwana_01.png");

    auto* forbi = CWindowTaskImageCardForbi::create(w, w, 0);   // 0 shows the cell left of the strip
    CHECK(shown(forbi) && forbi->part_[0] == -16);
    forbi->setValue(4, false);
    CHECK(!shown(forbi));
    forbi->setValue(4, true);
    CHECK(shown(forbi) && forbi->part_[0] == 48);

    auto* star = CWindowTaskImageCardStar::create(w, w, 7);
    CHECK(star->level_ && star->level_->parent() == star && star->level_->instName() == "CBgCommon::m_starlv");
    CHECK(shown(star) && star->w_ == 19 && star->part_[2] == 19 && star->level_->value_ == 7);
    CHECK(star->level_->part_[0] == 84 && star->level_->w_ == 14 && star->level_->x_ == 18);
    star->setValue(12);
    CHECK(star->level_->value_ == 12 && star->level_->part_[0] == 154);
    star->setValue(13);
    CHECK(!shown(star) && star->level_->value_ == 12);

    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("card_icons_test ok\n");
}
