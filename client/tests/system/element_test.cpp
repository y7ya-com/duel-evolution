// src/System: CElement transforms/colours/visibility, CZSort ordering, CEasyTask dispatch.
#include <cassert>
#include <cmath>
#include <cstdio>
#include <string>

#include "System/yo2EasyTask.h"
#include "System/yo2Element.h"
#include "System/CD3DDevice.h"
#include "System/yo2ZSort.h"

static std::string g_drawn;

struct Sprite : CElement {
    char id;
    explicit Sprite(char id) : id(id) {}
    void draw(int32_t) override { g_drawn += id; }
};

static Sprite* sprite(CTask* parent, char id, float z) {
    auto* s = new Sprite(id);
    s->create(parent, 0);
    s->pos_ = {0, 0, z};
    return s;
}

static bool approx(float a, float b) { return std::fabs(a - b) < 1e-4f; }

struct Easy : CEasyTask {
    std::string log;
    bool keep = true;
    bool onInit() override { log += 'i'; return true; }
    bool onMain() override { log += 'm'; return keep; }
    void onDestroy() override { log += 'd'; }
};

int main() {
    g_d3d = new CD3DDevice;
    g_d3d->initialize(nullptr, 800, 600, false);
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();

    // transforms: local = S * R * T; inheritTransform multiplies in the parent's world matrix
    Sprite* a = sprite(root, 'a', 5);
    a->pos_ = {10, 20, 5};
    a->scale_ = {2, 2, 1};
    Sprite* b = sprite(a, 'b', 0);
    b->pos_ = {1, 1, 0};
    b->inheritTransform_ = true;
    b->rot_ = {0, 0, 1.5707963f};  // rotation doesn't move b's own origin
    root->call(&g_tmMain);
    assert(approx(a->worldPos_.x, 10) && approx(a->worldPos_.y, 20));
    assert(approx(b->worldPos_.x, 12) && approx(b->worldPos_.y, 22));  // (1,1) scaled by a's 2 then moved
    assert(approx(b->worldScale_.x, 2));

    // colours multiply down the tree, additive colours add
    a->color_[0] = 0.5f;
    b->color_[0] = 0.5f;
    a->addColor_[1] = 0.25f;
    root->call(&g_tmMain);
    assert(approx(b->inheritColor4_[0], 0.25f) && approx(b->inheritAddColor_[1], 0.25f));

    // queues: NONE draws z descending, MIDDLE (blended draw modes) z ascending
    CZSort& none = layers.layer[CZSortSet::NONE];
    none.clear();
    Sprite* c = sprite(root, 'c', 9);
    root->call(&g_tmMain);
    g_drawn.clear();
    none.flush();
    assert(g_drawn == "cab");  // z 9, 5, 0
    none.clear();
    c->setDrawMode(CElement::BLEND);
    a->setDrawMode(CElement::ADD);
    assert(c->blendOp_ == 4 && a->blendOp_ == 6);
    root->call(&g_tmMain);
    g_drawn.clear();
    layers.layer[CZSortSet::MIDDLE].flush();
    assert(g_drawn == "ac");  // z 5, 9
    layers.layer[CZSortSet::MIDDLE].clear();
    none.clear();

    // setDisp(false, true) hides the subtree: b stops drawing too, from the same frame
    a->setDrawMode(CElement::CUT);
    a->setDisp(false, true);
    root->call(&g_tmMain);
    g_drawn.clear();
    none.flush();
    assert(g_drawn.empty() && b->hiddenByParent_);
    none.clear();
    a->setDisp(true, true);
    root->call(&g_tmMain);  // b re-reads a's state during this frame's TM_MAIN
    g_drawn.clear();
    none.flush();
    assert(g_drawn == "ab");
    none.clear();

    // CEasyTask: virtual hooks; onMain returning false destroys the task
    auto* e = new Easy;
    e->create(root, 0);
    root->call(&g_tmMain);
    e->keep = false;
    root->call(&g_tmMain);
    assert(e->log == "immd" && !e->alive());
    for (CZSort& q : layers.layer)  // the studio clears the queues every frame
        q.clear();

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    assert(CTask::liveCount() == 0);
    CD3DDevice::release();
    std::puts("element_test ok");
}
