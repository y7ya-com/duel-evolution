// src/System/window/yo2WindowImage.cpp: CWindowTaskImage (a texture part scaled to the control's size).
#include "System/window/yo2WindowImage.h"
#include "System/yo2ZSort.h"
#include "game_test.h"
#include "window_stubs.h"

struct Win : CWindowTaskModel {
    std::vector<CWindowTaskControll*> commands;
    void layout() override {}
    int32_t maxZ() const override { return static_cast<int32_t>(z_); }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll* c) override { commands.push_back(c); }
};

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    auto* w = new Win;
    w->CTask::create(root, 0);

    CWindowTaskImage* img = CWindowTaskImage::create(w, w, "data/common/icon/x.png");
    CHECK(img && img->taskName() == "単なる画像(コントロール)" && img->kind() == 0x1c && img->mediator_ == w);
    CSpriteElm* s = img->sprite_.get();
    CHECK(s && s->texture == "data/common/icon/x.png" && s->instName() == "CWindowTaskImgの画像");
    CHECK(s->drawMode_ == 2 && s->inheritTransform_ && img->inheritTransform_);
    img->setPart(16, 32, 20, 10);
    CHECK(s->rect_[0] == 16 && s->rect_[1] == 32 && s->rect_[2] == 20 && s->rect_[3] == 10);
    img->w_ = 40, img->h_ = 5, img->x_ = 3;
    img->onMain();
    CHECK(s->scale_.x == 2 && s->scale_.y == 0.5f && img->pos_.x == 3);
    CHECK(!img->hitTest(0, 0));
    WindowMsg m{};
    m.msg = 0x200;
    img->handleMessage(m);
    m.msg = 0x201;
    CHECK(img->handleMessage(m) && w->commands.size() == 1 && w->commands[0] == img);

    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("window_image_test ok\n");
}
