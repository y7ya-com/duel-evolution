// src/Lobby/yo2FindMenu.cpp: the player list's pop-up menu.
#include "Lobby/yo2FindMenu.h"
#include "lobby_stubs.h"
#include "lobby_test.h"

struct Owner : IWindowTaskMediator {
    std::vector<CWindowTaskControll*> events;
    void onControlEvent(CWindowTaskControll* s) override { events.push_back(s); }
    void onControlCommand(CWindowTaskControll*) override {}
};

static std::u16string item(CFindMenu* m, int i) { return std::u16string((*m->list_->items_)[i]); }

int main() {
    LobbyWorld w;
    g_mouseX = 300, g_mouseY = 700;
    CFindMenu* m = CFindMenu::create(w.root);
    CHECK(m && m->itemCount_ == 7 && m->w_ == 256 && m->modal_ && m->topmost_ && g_flushes == 1);
    CHECK(m->frame_->instName() == "CWindowTaskFrameThin m_frame" && m->list_->instName() == "CWindowTaskActiveListbox m_list");
    // the order of the rows and what they mean
    const int32_t want[] = {1, 2, 7, 8, 3, 4, 0};
    for (int i = 0; i < 7; i++) CHECK(m->items_[i] == want[i]);
    CHECK(item(m, 0) == u"T1437" && item(m, 2) == u"T143e" && item(m, 6) == u"T143b");
    CHECK(m->h_ == 128 && m->frame_->h_ == 128 && m->list_->h_ == 112 && m->list_->w_ == 240 && m->list_->x_ == 8);
    CHECK(m->frame_->color_[3] == 0.9f && m->list_->stripe_->color_[3] == 0.7f);
    CHECK(!m->isVisible(true) && m->isLocked(2) && m->maxZ() == int32_t(m->z_ + 2));
    Owner owner;
    m->setMediator(&owner);

    // open: x 230, y kept on screen
    m->open();
    CHECK(m->x_ == 230 && m->pos_.x == 230 && m->y_ == 768 - 128 && m->isVisible(true) && !m->isLocked(2));
    m->layout();
    updateTree(w.root);

    // the button still down from the click that opened it: not armed, a click outside does nothing yet
    g_mouseLeftPushed = true, g_mouseX = 10, g_mouseY = 10;
    m->onMain();
    CHECK(!m->armed_ && m->isVisible(true));
    // released: armed; a click outside closes and tells the owner
    g_mouseLeftPushed = false;
    m->onMain();
    CHECK(m->armed_);
    g_mouseLeftPushed = true;
    m->onMain();
    CHECK(!m->isVisible(true) && owner.events.size() == 1 && owner.events[0] == m->asSender() && !m->picked_);

    // a click on a row: the sound, the choice, closed
    m->open();
    g_mouseLeftPushed = false, g_mouseX = 240, g_mouseY = 650;   // inside
    m->list_->clicked_ = 4;   // row 4 = choice 3
    m->onMain();
    CHECK(m->choice_ == 3 && m->picked_ && g_sounds.size() == 1 && g_sounds[0] == 0x10000001 && owner.events.size() == 2);
    CHECK(m->list_->clicked_ == -1);
    // the toggles: on (5), off (7); B: 6
    m->open();
    m->list_->clicked_ = 2;
    m->onMain();
    CHECK(m->choice_ == CFindMenu::TOGGLE_A_ON && m->toggleA_);
    m->open();
    m->list_->clicked_ = 2;
    m->onMain();
    CHECK(m->choice_ == CFindMenu::TOGGLE_A_OFF && !m->toggleA_);
    m->open();
    m->list_->clicked_ = 3;
    m->onMain();
    CHECK(m->choice_ == CFindMenu::TOGGLE_B_ON && m->toggleB_);

    // a menu of three: 64 high
    CFindMenu* small = new CFindMenu;
    small->itemMask_ = CFindMenu::ITEM_0 | CFindMenu::ITEM_3 | CFindMenu::ITEM_B;
    small->CTask::create(w.root, 10000);
    CHECK(small->itemCount_ == 3 && small->items_[0] == 8 && small->items_[1] == 3 && small->items_[2] == 0);
    CHECK(small->h_ == 64);
    std::printf("findmenu_test ok\n");
}
