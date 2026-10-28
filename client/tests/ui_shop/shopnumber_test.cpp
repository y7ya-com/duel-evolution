// src/shop/yo2ShopNumber.cpp and yo2ShopPlates.cpp: the shop's digit sprites, the price and the mileage plates.
#include <windows.h>

#include "System/yo2ZSort.h"
#include "game_test.h"
#include "shop/yo2ShopNumber.h"
#include "shop/yo2ShopPlates.h"

#include "window_stubs.h"

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CTask* root = CTask::createRoot();
    CElement* layer = CElement::newChild(root, 1);

    CShopNumber* n = CShopNumber::create(root, layer);
    CHECK(n && n->layer_ == layer && n->base_->parent() == layer && n->base_->instName() == "数値テキストベースエレメント");
    CSpriteElm* s = n->sprite_.get();
    CHECK(s->instName() == "数字" && s->texture == "data/shop/shop_number_01_c01.png" && s->drawMode_ == CElement::BLEND);
    CHECK(s->pos_.z == 1 && s->rect_[2] == 16 && s->rect_[3] == 16 && n->cells_[9].x == 16 && n->cells_[9].y == 16);
    n->setChar('7');
    CHECK(n->glyph_ == 7 && s->rect_[0] == 112 && s->rect_[1] == 0);
    n->setChar('P');
    CHECK(n->glyph_ == 13 && s->rect_[0] == 80 && s->rect_[1] == 16);
    n->setChar('0');
    CHECK(n->glyph_ == 0);
    n->setGlyph(99);
    CHECK(n->glyph_ == 14);
    n->setGlyph(-3);
    CHECK(n->glyph_ == 0);

    CShopNumberString* str = CShopNumberString::create(root, layer);
    str->setNumber(1250);
    CHECK(str->length_ == 4 && str->digits_[3] && !str->digits_[4]);
    CHECK(str->digits_[0]->glyph_ == 1 && str->digits_[1]->glyph_ == 2 && str->digits_[3]->glyph_ == 0);
    CHECK(str->digits_[2]->base_->pos_.x == 28 && str->digits_[2]->instName() == "数字列のひとけた");
    CHECK(str->digits_[0]->base_->parent() == str->base_.get());
    CShopNumber* kept = str->digits_[0];
    str->setText("3MP");
    CHECK(str->length_ == 3 && str->digits_[0] == kept && !str->digits_[3] && str->digits_[1]->glyph_ == 12);
    str->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    CHECK(layer->children().size() == 1);   // the string's base element went with it (n's stays)

    CWindowTaskFactory::create();
    CShopMileagePlate* m = CShopMileagePlate::create(root, layer);
    CHECK(m && m->base_->parent() == layer && m->plate_->texture == "data/shop/shop_money_01_c01.png");
    CHECK(m->plate_->instName() == "商品の種類を載せるプレート" && m->plate_->drawMode_ == CElement::BLEND);
    CWindowTaskShadowText* top = m->top_.get();
    CHECK(top->instName() == "決定テキスト" && top->x_ == 12 && top->y_ == 7 && m->bottom_->y_ == 48);
    CHECK(top->text_->align() == CWindowTaskText::RIGHT && top->text_->fontSize_ == 24 && !top->shadow_->disp_);
    CHECK(top->z_ == 1 && top->mediator_ == m && top->parent() == m->base_.get());
    m->setTop(1500);
    m->setBottom(25);
    CHECK(m->topMp_ == 1500 && m->bottomMp_ == 25 && top->text_->name() == "1500MP" && m->bottom_->text_->name() == "25MP");
    m->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    // the price tag: a picture switch with two texts; its clicks go to the owner with the plate as the sender
    struct Owner : IWindowTaskMediator {
        CWindowTaskControll* last = nullptr;
        void onControlEvent(CWindowTaskControll* s) override { last = s; }
        void onControlCommand(CWindowTaskControll*) override {}
    } owner;
    CShopPricePlate* pp = CShopPricePlate::create(root, layer, &owner, 0);
    CWindowTaskPictureSwitch* tag = pp->tag_.get();
    CHECK(pp && pp->base_->parent() == layer && pp->base_->instName() == "値段プレートベースエレメント");
    CHECK(tag->instName() == "値段プレート" && tag->parent() == pp->base_.get() && tag->inheritTransform_);
    CHECK(tag->normal_->texture == "data/shop/shop_pricetag_06_c01.png" && tag->hover_->texture == "data/shop/shop_pricetag_04_c01.png");
    CHECK(pp->priceText_->x_ == 10 && pp->priceText_->y_ == 216 && pp->rateText_->y_ == 236 && pp->rateText_->pos_.z == 3);
    CHECK(pp->enabled_ && pp->count_ == 10 && pp->rate_ == -1.0f);
    pp->setPrice(300);
    pp->setRate(0.125f);
    CHECK(pp->price_ == 300 && pp->priceText_->name() == "300MP" && pp->rateText_->name() == "12.5 %");
    pp->setIndex(12);
    CHECK(pp->index_ == 9);
    pp->setIndex(-2);
    CHECK(pp->index_ == 0);
    pp->onControlEvent(tag);
    CHECK(owner.last == pp->asSender());
    pp->setState(CShopPricePlate::DOWN);
    CHECK(pp->isDown() && tag->checked_ && pp->buttonState() == CShopPricePlate::DOWN);
    pp->setState(CShopPricePlate::UP);
    tag->setState(CWindowTaskPictureSwitch::HOVER);
    CHECK(!tag->checked_ && pp->buttonState() == CShopPricePlate::HOVER);
    pp->setVisible(false);
    CHECK(!pp->base_->disp_ && pp->base_->isLocked(2));
    pp->setVisible(true);
    CHECK(pp->base_->disp_ && !pp->base_->isLocked(2));
    CShopPricePlate* pp1 = CShopPricePlate::create(root, layer, &owner, 1);
    CHECK(pp1->tag_->normal_->texture == "data/shop/shop_pricetag_01_c01.png");
    pp->destroy(__FILE__, __LINE__);
    pp1->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::puts("shopnumber: ok");
}
