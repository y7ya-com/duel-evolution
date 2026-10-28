// src/System/window/yo2UGDialogBase.cpp: the duel dialogs' base: fade in/out, mouse drag, close with a result.
#include "System/window/yo2UGDialogBase.h"
#include "System/yo2ZSort.h"
#include "game_test.h"
#include "window_stubs.h"

// the CMouseEx calls (GetXY reads the same position as windowMouse's stub)
CMouseEx* windowAppMouse() { return reinterpret_cast<CMouseEx*>(&g_mouseX); }
void windowMouseGetXY(int32_t* x, int32_t* y) { *x = g_mouseX, *y = g_mouseY; }
bool g_mouseLeftDown;
bool windowMouseLButton() { return g_mouseLeftDown; }
int g_mouseResets;
void windowMouseResetButton() { g_mouseResets++; }
std::vector<int32_t> g_sent;
void ugDialogSendResult(int32_t result) { g_sent.push_back(result); }

struct Dlg : CUGDialogBase {
    std::string log;
    int mice = 0;
    void ugSlot23() override {}
    void onMouse(CMouseEx* m) override { mice += m == windowAppMouse(); }
    void onOpened() override { log += 'o'; }
    void onClose() override { log += 'c'; }
    void onClosed() override { log += 'x'; }
};

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    auto* d = new Dlg;
    d->w_ = 200, d->h_ = 100;
    CHECK(dynamic_cast<Dlg*>(d->CTask::create(root, 0)));
    CHECK(d->fade_ == 256 && d->cx_ == 512 && d->cy_ == 384 && d->running_ && d->result_ == 0);
    d->setBox(200, 100);

    // fading in: the mouse is ignored; 8 ticks to open
    g_mouseX = 512, g_mouseY = 384;
    CHECK(!d->windowSlot15());
    for (int i = 0; i < 8; i++)
        d->tick();
    CHECK(d->fade_ == 0 && d->log == "o");

    // the box: [cx - w/2, cx + w/2) x [cy - h/2, cy + h/2)
    CHECK(d->isMouseOver());
    g_mouseX = 612;
    CHECK(!d->isMouseOver());
    g_mouseX = 611;
    CHECK(d->isMouseOver());
    g_mouseY = 334;
    CHECK(d->isMouseOver());
    g_mouseY = 333;
    CHECK(!d->isMouseOver() && !d->windowSlot15() && d->mice == 1);

    // a left press over it starts a drag; moving with the button down moves the centre and the window
    g_mouseX = 520, g_mouseY = 390;
    g_mouseLeftPushed = true;
    CHECK(d->windowSlot15() && d->dragging_ && d->dragDx_ == 8 && d->dragDy_ == 6 && g_mouseResets == 1);
    g_mouseLeftPushed = false;
    g_mouseLeftDown = true;
    g_mouseX = 120, g_mouseY = 90;
    CHECK(d->windowSlot15() && d->cx_ == 112 && d->cy_ == 84);
    CHECK(d->x_ == 12 && d->y_ == 34 && d->pos_.x == 12);
    g_mouseX = 2000, g_mouseY = -500;   // clamped: a quarter of the box past 1024 x 600
    CHECK(d->windowSlot15() && d->cx_ == 1074 && d->cy_ == -25);
    g_mouseLeftDown = false;
    CHECK(d->windowSlot15() && !d->dragging_);

    // answered: the next tick sends the result and fades out; 8 more ticks to close
    d->result_ = 7;
    d->answered_ = true;
    d->tick();
    CHECK(g_sent.size() == 1 && g_sent[0] == 7 && d->fade_ == -1 && d->log == "oc");
    for (int i = 0; i < 7; i++)
        d->tick();
    CHECK(d->running_ && d->log == "oc");
    d->tick();
    CHECK(!d->running_ && d->log == "ocx");

    g_windowFactory->destroyAllWindows();
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("window_ugdialog_test ok\n");
}
