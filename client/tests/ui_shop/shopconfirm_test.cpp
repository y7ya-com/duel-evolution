// src/shop/yo2ShopConfirm.cpp: the purchase confirmation window over the window controls' stand-ins.
#include <windows.h>

#include <vector>

#include "Game/yo2PlayerBin.h"
#include "System/yo2Debug.h"
#include "System/yo2StringDB.h"
#include "System/yo2ZSort.h"
#include "game_test.h"
#include "shop/yo2ShopConfirm.h"
#include "shop/yo2ShopExtern.h"
#include "window_stubs.h"

bool CPlayerBinData::flag(uint32_t) const { return false; }
struct FakeText : CStringDB {
    vc6::string get(uint32_t id) const override { return id == 0x20a3 ? "Buy for @@d MP?" : yo2Format("T%u", id); }
};
static std::vector<uint32_t> g_sounds;
void appPlaySound(uint32_t id, int32_t) { g_sounds.push_back(id); }
int cardPropId(int index) { return index + 1; }
const char* textCardName(int card) { return card == 4008 ? "Kuriboh" : "?"; }
std::string packName(int32_t id) { return id == 5 ? "Pack Five" : "?"; }
CPbinDictionary* shopPbinDictionary() { return nullptr; }
vc6::string shopNarrow(const char16_t* s) {
    std::string out;
    for (; *s; ++s) out += static_cast<char>(*s);
    return vc6::string(std::string_view(out));
}

static std::u16string textOf(CTaskPtr<CWindowTaskText>& t) { return std::u16string(t->text_.get()->text); }

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    FakeText text;
    g_stringDB = &text;
    g_shopWorld = 0;
    CWindowTaskFactory::create();
    CTask* root = CTask::createRoot();
    CElement* layer = CElement::newChild(root, 1);
    CShopConfirmWindow* w = CShopConfirmWindow::create(root, layer);
    CHECK(w && w->result() == CShopConfirmWindow::NONE && w->base_->parent() == layer && w->base_->pos_.z == 51003);
    CHECK(w->frame_->texture == "data/shop/shop_win_01_c00.png" && w->frame_->instName() == "確認ウィンドウ");
    CHECK(w->ok_->pos_.x == 39 && w->cancel_->pos_.x == 338 && w->ok_->pos_.y == 217);
    CHECK(w->cancelText_->x_ == 338 && w->cancelText_->y_ == 224 && w->cancelText_->posZ_ == 3);
    CHECK(w->scroll_->x_ == 448 && w->scroll_->length_ == 190 && w->lines_[9]->y_ == 48 + 16 * 9);
    CHECK(w->message_->instName() == "確認ウィンドウの確認テキスト" && w->message_->fontSize_ == 15);

    // twelve lines: ten shown, the scroll bar over the other two, the total
    ShopVec<ShopCartLine> cart;
    for (int i = 0; i < 12; i++) {
        ShopCartLine l = {};
        l.item.type = 0, l.item.param = 4007, l.item.cost = 100;
        l.count = i + 1;
        cart.push_back(l);
    }
    cart[11].item.type = 1, cart[11].item.param = 5;
    w->setCart(cart);
    CHECK(w->lineTexts_.size() == 12 && w->lineTexts_[1] == u"Kuriboh@>320/x2@>360/200MP");
    CHECK(textOf(w->lines_[0]) == u"Kuriboh@>320/x1@>360/100MP" && w->scroll_->max_ == 2);
    CHECK(w->total_ == 7800 && std::string_view(w->message()).substr(0, 16) == "Buy for 7800 MP?");
    w->scroll_->value_ = 2;
    w->onControlEvent(w->scroll_.get());
    CHECK(textOf(w->lines_[9]) == u"Pack Five@>320/x12@>360/1200MP");
    // OK / Cancel, not while hidden
    w->onControlEvent(w->cancel_.get());
    CHECK(w->result() == CShopConfirmWindow::CANCEL && g_sounds.back() == 0x10000002);
    w->clearResult();
    w->setVisible(false);
    w->onControlEvent(w->ok_.get());
    CHECK(w->result() == CShopConfirmWindow::NONE && w->isLocked(2) && w->base_->isLocked(2));
    w->setVisible(true);
    w->onControlEvent(w->ok_.get());
    CHECK(w->result() == CShopConfirmWindow::OK && g_sounds.back() == 0x10000001);
    w->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    CHECK(layer->children().empty());
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    g_stringDB = nullptr;
    std::puts("shopconfirm: ok");
}
