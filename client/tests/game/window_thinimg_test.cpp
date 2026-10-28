// src/System/window/yo2WindowThinImg.cpp: the picture window.
#include <windows.h>

#include "Game/yo2HelpText.h"
#include "System/window/yo2WindowThinImg.h"
#include "System/yo2ZSort.h"
#include "game_test.h"

#include "window_stubs.h"

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    CWindowModelThinImg* w = CWindowModelThinImg::create(root, 100, 50, "data/x/login.png");
    CHECK(w && w->taskName() == "背景絵のウィンドウ" && w->picture_ == "data/x/login.png" && w->modal_);
    CHECK(static_cast<CSpriteElm*>(windowElement(w->image_))->texture == "data/x/login.png");
    CHECK(windowElement(w->image_)->instName() == "CWindowModelThinIngの背景" && w->callback_ == nullptr);
    CHECK(w->textField_->instName() == "CWindowModelThinImgのテキストフィールド" && w->textField_->x_ == 8);
    CHECK(w->openAnim_.kind == 2 && w->openAnim_.frames == 15 && w->openAnim_.cx == 100 && w->pos_.x == 100);
    // a sized picture: the window takes its size
    static_cast<CSpriteElm*>(windowElement(w->image_))->texW = 320;
    static_cast<CSpriteElm*>(windowElement(w->image_))->texH = 240;
    w->w_ = 320, w->h_ = 240;
    w->setText(u"Login");
    CHECK(w->textField_->text_->name().empty());   // kept until layout
    w->layout();
    CHECK(w->textField_->w_ == 304 && w->textField_->h_ == 224 && elmOf(w->textField_->text_.get())->text == u"Login");
    CHECK(w->maxZ() == static_cast<int32_t>(w->z_ + 5));
    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("window_thinimg_test ok\n");
}
