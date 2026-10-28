// src/System/window/yo2WindowChat.cpp: the chat window, its tabs and logs; the information callback.
#include <windows.h>

#include "Game/yo2HelpText.h"
#include "System/window/yo2WindowChat.h"
#include "System/yo2ZSort.h"
#include "game_test.h"

#include "window_stubs.h"

static CElement* el(const CTaskPtrBase& p) { return windowElement(p); }
static bool rectIs(const CElement* e, int u, int v, int w, int h) {
    return e->rect_[0] == u && e->rect_[1] == v && e->rect_[2] == w && e->rect_[3] == h;
}
static WindowMsg msg(uint32_t m) {
    WindowMsg w{};
    w.msg = m;
    return w;
}

struct Recorder : CWindowTaskModel {
    std::vector<CWindowTaskControll*> events;
    void layout() override {}
    int32_t maxZ() const override { return 0; }
    void onControlEvent(CWindowTaskControll* a) override { events.push_back(a); }
    void onControlCommand(CWindowTaskControll*) override {}
};

static void tab(CTask* root) {
    auto* w = new Recorder;
    w->create(root, 0);
    CWindowTaskTab* t = CWindowTaskTab::create(w, w);
    CHECK(t && t->taskName() == "タブ(コントロール)" && t->kind() == 9 && t->w_ == 72 && t->h_ == 24 && t->minW_ == 72);
    CHECK(rectIs(el(t->parts_[0]), 32, 0, 16, 24) && !el(t->spare_[0])->disp_ && el(t->text_)->color_[0] == 0.5f);
    CHECK(el(t->text_)->instName() == "CWindowTaskTabのテキスト" && el(t->text_)->pos_.y == 4);
    t->text_.get()->width = 100;
    t->setTabText(u"Lobby");
    CHECK(t->text_.get()->text == u"Lobby" && t->w_ == 120 && el(t->parts_[2])->pos_.x == 112 && el(t->parts_[1])->scale_.x == 12);
    CHECK(t->handleMessage(msg(WM_LBUTTONDOWN)) && w->events.size() == 1 && w->events[0] == t);
    CHECK(rectIs(el(t->parts_[1]), 16, 0, 8, 24) && el(t->text_)->color_[2] == 1);
}

static void info() {
    CInformationCallback c;
    CHECK(c.call(nullptr, CALLBACK_MESSAGE_TYPE(5), (2 << 16) | 7) == 0);
    CHECK(c.values_.size() == 3 && c.values_[0] == -1 && c.values_[2] == 7 && c.last_ == 2);
    c.call(nullptr, CALLBACK_MESSAGE_TYPE(5), (0 << 16) | 4);
    CHECK(c.values_.size() == 1 && c.values_[0] == 4 && c.last_ == 0);
    c.call(nullptr, CALLBACK_MESSAGE_TYPE(4), (5 << 16) | 4);
    CHECK(c.values_.size() == 1);
}

static void chat(CTask* root) {
    CWindowModelChatWindow* c = CWindowModelChatWindow::create(root, 100, 700);
    CHECK(c && c->taskName() == "チャットウィンドウ" && c->w_ == 776 && c->mode_ == 1 && c->modal_);
    CHECK(c->h_ == 128 && c->baseY_ == 700 && c->pos_.y == 700 && c->maxZ() == static_cast<int32_t>(c->z_ + 6));
    CHECK(c->expand_->enabled_ && !c->shrink_->enabled_ && c->expand_->x_ == 757 && c->input_->submitOnEnter_);
    CHECK(c->back_->w_ == 760 && c->back_->h_ == 96 && c->frame_->y_ == 24 && c->input_->y_ == 96);
    c->addTab();
    c->addTab();
    CHECK(c->tabs_->size() == 2 && c->curIndex_ == 0 && c->curTab_ == (*c->tabs_)[0].tab);
    CHECK(c->curList_->y_ == 24 && (*c->tabs_)[1].list->y_ == 99999 && (*c->tabs_)[1].tab->x_ == 72);
    CHECK((*c->tabs_)[0].list->h_ == 80 && (*c->tabs_)[0].list->w_ == 760);
    // the log keeps maxLines lines
    c->setMaxLines(0, 2);
    c->addLine(0, u"a");
    c->addLine(0, u"b");
    c->addLine(0, u"c");
    CHECK((*c->tabs_)[0].lines->size() == 2 && (*c->tabs_)[0].lines->front() == u"b");
    CHECK((*(*c->tabs_)[0].list->items_).size() == 2);
    // △: tall (with tabs), ▽: input only
    c->onControlEvent(c->expand_.get());
    CHECK(c->mode_ == 0 && c->h_ == 560 && c->baseY_ == 268 && c->shrink_->enabled_ && !c->expand_->enabled_);
    c->onControlEvent(c->shrink_.get());
    CHECK(c->mode_ == 2 && c->h_ == 32 && c->baseY_ == 804 && !c->input_->disp_ && c->frame_->x_ == 99999);
    c->onControlEvent(c->expand_.get());
    CHECK(c->mode_ == 1 && c->input_->disp_);
    // a tab click selects it and reports it through the information callback (with the tab sound)
    c->onControlEvent((*c->tabs_)[1].tab);
    CHECK(c->curIndex_ == 1 && c->info_.last_ == 1 && c->info_.values_[1] == 0 && g_windowSounds.back() == 0x10000000);
    CHECK(c->curList_->y_ == 24 && (*c->tabs_)[0].list->y_ == 99999);
    c->setTabVisible(1, false);
    CHECK(c->curIndex_ == 0 && !(*c->tabs_)[1].tab->disp_);
    c->clearAll();
    CHECK((*c->tabs_)[0].lines->empty() && (*(*c->tabs_)[0].list->items_).empty());
    c->setInputText(u"hi");
    CHECK(c->input_->value_ == u"hi");
    c->setInputOnly(true);
    CHECK(c->mode_ == 2 && !c->expand_->disp_);
}

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    tab(root);
    info();
    chat(root);
    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("window_chat_test ok\n");
}
