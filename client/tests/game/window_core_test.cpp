// src/System/window/yo2WindowTask.cpp: window z order, focus, message routing, dragging, fades, callbacks.
#include <windows.h>

#include <cmath>
#include <set>

#include "System/window/yo2WindowTask.h"
#include "System/yo2ZSort.h"
#include "game_test.h"

struct Win : CWindowTaskModel {
    int layouts = 0;
    void layout() override { layouts++; }
    int32_t maxZ() const override { return int32_t(z_ + 5); }
    void onControlEvent(CWindowTaskControll*) override {}
    void onControlCommand(CWindowTaskControll*) override {}
};

struct Ctl : CWindowTaskControll {
    float x0, y0, x1, y1;
    bool wheel = false;
    std::vector<WindowMsg> got;
    void layout() override {}
    bool hitTest(float x, float y) override { return x >= x0 && x < x1 && y >= y0 && y < y1; }
    bool wheelHitTest(float x, float y) override { return wheel && hitTest(x, y); }
    bool handleMessage(WindowMsg m) override { got.push_back(m); return true; }
};

static Win* window(CTask* parent) {
    auto* w = new Win;
    w->create(parent, 0);
    return w;
}

static Ctl* control(CTask* parent, float z, float x0, float y0, float x1, float y1) {
    auto* c = new Ctl;
    c->x0 = x0, c->y0 = y0, c->x1 = x1, c->y1 = y1;
    c->create(parent, 0);
    c->pos_.z = z;
    c->updateMatrix();
    return c;
}

struct Owner {
    int last = 0;
    int onResult(CWindowTaskModel*, CALLBACK_MESSAGE_TYPE m, intptr_t v) { return last = int(m) * 100 + int(v); }
};

extern std::set<int> g_keysDown;   // platform_stubs.cpp

static bool approx(float a, float b) { return std::fabs(a - b) < 1e-4f; }

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CWindowTaskFactory* f = g_windowFactory;
    CHECK(f->dataDir_ == "data/common/window/" && !f->captured_);
    CElement* root = CElement::createRoot();

    // z order: newest in front; topmost windows stay in front; renumbered from the back (51003, +50)
    Win* a = window(root);
    Win* b = window(root);
    CHECK(f->windows_.front() == b && a->z_ == 51003 && b->z_ == 51053);
    a->setTopmost(true);
    Win* c = window(root);
    CHECK(*f->windows_.begin() == a && *++f->windows_.begin() == c);
    CHECK(a->z_ == 51103 && c->z_ == 51053 && b->z_ == 51003);
    b->bringToFront();   // behind the topmost one
    CHECK(*++f->windows_.begin() == b && b->z_ == 51053 && c->z_ == 51003);
    c->pinned_ = true;
    c->bringToFront();
    CHECK(c->z_ == 51003);
    CHECK(f->topWindow() == a && a->isTop());
    a->setDisp(false, false);
    CHECK(f->topWindow() == b);
    a->setDisp(true, false);
    c->modal_ = true;
    b->bringToFront();
    CHECK(c->pos_.z == 51003);   // modal windows re-apply their z

    // centring on the screen or the parent
    b->w_ = 200, b->h_ = 100;
    b->centre();
    CHECK(b->x_ == 412 && b->y_ == 334 && b->pos_.x == 412);
    c->w_ = 50, c->h_ = 20;
    c->parent_ = b;
    c->centre();
    CHECK(c->x_ == 75 && c->y_ == 40);

    // controls: sorted by z (larger first), hit routing with the client area scaled to 1024 x 768
    Ctl* back = control(b, 105, 0, 0, 512, 384);
    Ctl* front = control(b, 120, 100, 100, 200, 200);
    Ctl* off = control(b, 130, 0, 0, 1024, 768);
    off->enabled_ = false;
    windowSetClient(10, 20, 512, 384);
    f->dispatch(0x201, 1, (60 << 16) | 75);   // client (75,60) -> game (150,120)
    CHECK(front->got.size() == 1 && front->got[0].x == 150 && front->got[0].y == 120 && front->got[0].lButton == 1);
    CHECK(f->controls_[0] == off && f->controls_[1] == front && back->got.empty());
    f->dispatch(0x204, 2, (10 << 16) | 10);
    CHECK(back->got.size() == 1 && back->got[0].rButton == 1 && !back->got[0].lButton);
    f->dispatch(0x20a, 0, ((20 + 60) << 16) | (10 + 75));   // wheel: screen coordinates, nobody takes it
    CHECK(front->got.size() == 1);
    back->wheel = true;
    f->dispatch(0x20a, 0, ((20 + 60) << 16) | (10 + 75));
    CHECK(back->got.size() == 2 && back->got[1].x == 150);

    // focus: one per 50-wide z band (exclusive at the band's start, as in the exe); keys and characters go to it; IME characters swallow the next WM_CHARs
    f->setFocus(back);
    f->setFocus(front);
    CHECK(front->focused_ == 1 && back->focused_ == 0);
    Ctl* other = control(b, 51110, 0, 0, 1, 1);   // in front of the top window (a, z 51103)
    f->setFocus(other);
    CHECK(other->focused_ == 1 && front->focused_ == 1);   // a different band
    CHECK(f->focusedControl() == other);
    f->dispatch(0x100, 'A', 0);
    CHECK(other->got.size() == 1 && other->got[0].key == 'A');
    f->dispatch(0x286, 'x', 0);   // single-byte IME char: delivered as WM_CHAR, the next WM_CHAR is dropped
    CHECK(other->got.size() == 2 && other->got[1].msg == 0x102);
    f->dispatch(0x102, 'x', 0);
    CHECK(other->got.size() == 2);
    f->dispatch(0x102, 'y', 0);
    CHECK(other->got.size() == 3 && other->got[2].ch == 'y');
    f->dispatch(0x286, 0x82a0, 0);   // double-byte: two WM_CHARs dropped
    f->dispatch(0x102, 0x82, 0);
    f->dispatch(0x102, 0xa0, 0);
    CHECK(other->got.size() == 4);

    // dragging: the window follows mouse moves until the left button comes up
    b->movable_ = true;
    float bx = b->x_;
    b->beginDrag(nullptr, 100, 100);
    CHECK(f->captured_ == b);
    int layouts = b->layouts;
    f->dispatch(0x200, 1, (55 << 16) | 60);   // game (120,110)
    CHECK(b->x_ == bx + 20 && b->layouts == layouts + 1);
    f->dispatch(0x202, 0, (55 << 16) | 60);
    CHECK(!f->captured_ && !b->dragging_);
    f->dispatch(0x200, 1, (0 << 16) | 0);
    CHECK(b->x_ == bx + 20);

    // fades: from the stored start values back to where the window was
    a->x_ = 100, a->y_ = 50, a->w_ = 300, a->h_ = 200, a->color_[3] = 1;
    a->fadeX_ = 0, a->fadeY_ = 0, a->fadeW_ = 0, a->fadeH_ = 0, a->fadeAlpha_ = 0;
    a->fadeFrames_ = 4;
    CWindowFadeIn* fade = CWindowFadeIn::create(a, a, CWindowFader::MOVE | CWindowFader::RESIZE | CWindowFader::ALPHA);
    CHECK(fade && fade->taskName() == "ウィンドウフェーダー" && fade->priority() == 10000);
    CHECK(a->pos_.x == 0 && a->w_ == 0 && a->color_[3] == 0 && fade->frame_ == 0);
    CHECK(fade->onMain() && a->pos_.x == 0);
    CHECK(fade->onMain() && approx(a->pos_.x, 25) && approx(a->w_, 75) && approx(a->color_[3], 0.25f));
    fade->onMain(), fade->onMain();
    CHECK(!fade->onMain() && a->pos_.x == 100 && a->x_ == 100 && a->h_ == 200 && a->color_[3] == 1);

    // callbacks: the window keeps its own copy
    Owner owner;
    {
        CCallbackM3<Owner, int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, intptr_t> cb(&owner, &Owner::onResult);
        a->setCallback(cb);
    }
    CHECK(a->callback_->call(a, CALLBACK_MESSAGE_TYPE(3), 7) == 307 && owner.last == 307);

    CWindowTaskDebug* dbg = CWindowTaskDebug::create(root);
    CHECK(dbg->taskName() == "ウィンドウシステムのデバッグ用タスク" && dbg->keyUp_[0] && dbg->keyUp_[2]);
    g_keysDown = {'W'};
    CHECK(dbg->onMain() && dbg->keyUp_[0]);   // no Shift: nothing
    g_keysDown = {'W', VK_SHIFT};
    CHECK(dbg->onMain() && !dbg->keyUp_[0] && dbg->keyUp_[1]);   // dumped once
    CHECK(dbg->onMain() && !dbg->keyUp_[0]);
    g_keysDown = {};
    CHECK(dbg->onMain() && dbg->keyUp_[0]);
    f->dumpWindows();
    f->dumpControls();

    // destroying unregisters everything
    f->destroyAllWindows();
    CHECK(f->windows_.empty() && f->controls_.empty());
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("window_core_test ok\n");
}
