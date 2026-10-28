// src/System/window/yo2WindowControls.cpp: frames, back plane, text (+ shadow), switches, scroll bar, text field.
#include <windows.h>

#include <cmath>
#include <cstring>
#include <map>
#include <set>
#include <vector>

#include "Game/yo2HelpText.h"
#include "System/window/yo2WindowControls.h"
#include "System/yo2ZSort.h"
#include "game_test.h"

#include "window_stubs.h"

static void key(int vk, bool down) {
    if (down) g_keysDown.insert(vk);
    else g_keysDown.erase(vk);
}

// A window that records what its controls tell it.
struct Win : CWindowTaskModel {
    std::vector<std::pair<int, CWindowTaskControll*>> calls;   // (slot, sender)
    int32_t dragX = 0, dragY = 0;
    void layout() override {}
    int32_t maxZ() const override { return static_cast<int32_t>(z_); }
    void onControlEvent(CWindowTaskControll* a) override { calls.push_back({0, a}); }
    void onControlCommand(CWindowTaskControll* a) override { calls.push_back({1, a}); }
    void mediatorSlot2(CWindowTaskControll* a) override { calls.push_back({2, a}); }
    void mediatorSlot3(CWindowTaskControll* a) override { calls.push_back({3, a}); }
    void beginDrag(CWindowTaskControll* a, int32_t x, int32_t y) override {
        calls.push_back({4, a});
        dragX = x, dragY = y;
    }
};

static bool approx(float a, float b) { return std::fabs(a - b) < 1e-4f; }
static bool rectIs(const CElement* e, int u, int v, int w, int h) {
    return e->rect_[0] == u && e->rect_[1] == v && e->rect_[2] == w && e->rect_[3] == h;
}
static CElement* el(const CTaskPtrBase& p) { return windowElement(p); }
static void updateTree(CElement* e) {   // what TM_MAIN does to the matrices, parents first
    e->updateMatrix();
    for (CTask* c : e->children())
        if (auto* ce = dynamic_cast<CElement*>(c)) updateTree(ce);
}
static WindowMsg msg(uint32_t m, int32_t x = 0, int32_t y = 0) {
    WindowMsg w{};
    w.msg = m, w.x = x, w.y = y;
    return w;
}

struct Frame : CWindowTaskPictureFrame {
    int loads = 0;
    void layout() override {}
    void loadImages() override { loads++; }
};

static void pictureFrame(Win* w) {
    auto* f = new Frame;
    CHECK(f->taskName() == "絵を差し替える背景CWindowTaskPictureFrame(コントロール)" && f->w_ == 256 && f->h_ == 256);
    f->create(w, 0);
    f->mediator_ = w;
    CHECK(f->loads == 1 && f->w_ == 80 && f->h_ == 24 && f->top_.get()->tiles.size() == 5 && !f->left_.task());
    CHECK(el(f->bottomRight_)->instName() == "CWindowTaskPictureFrameの右下画像");
    for (auto& p : f->pieces_)
        p = {8, 8, 0, 0};
    f->pieces_[4] = {16, 4, 8, 8};   // the centre
    f->CWindowTaskPictureFrame::layout();
    const WindowDupTile& centre = f->top_.get()->tiles[2];
    CHECK(f->top_.get()->tiles.size() == 5 && centre.x == 8 && centre.y == 8 && centre.sx == 4 && centre.sy == 2);
    CHECK(centre.u == 8 && centre.w == 16 && f->top_.get()->tiles[1].sy == 1 && el(f->bottomRight_)->pos_.x == 72);
    f->w_ = 100, f->h_ = 40;
    f->pos_ = {10, 20, 0};
    updateTree(w);
    CHECK(f->enabled_);   // (the constructor's default)
    f->enabled_ = false;
    CHECK(!f->hitTest(50, 30));
    f->enabled_ = true;
    CHECK(f->hitTest(50, 30) && f->hitTest(109.5f, 59.5f));
    CHECK(!f->hitTest(10, 30) && !f->hitTest(110, 30) && !f->hitTest(50, 20) && !f->hitTest(50, 60));
    CHECK(f->onMain());
    w->calls.clear();
    CHECK(f->handleMessage(msg(0x200, 1, 2)) && w->calls.empty());
    CHECK(f->handleMessage(msg(0x201, 33, 44)));
    CWindowTaskControll* me = f;
    CHECK(w->calls.size() == 2 && w->calls[0] == std::make_pair(1, me) && w->calls[1] == std::make_pair(4, me));
    CHECK(w->dragX == 33 && w->dragY == 44);
}

struct Text : CWindowTaskText {
    std::u16string got;
    void setText(const WChar* s) override { got = s; }
};

static void text(Win* w) {
    CWindowTaskText* t = CWindowTaskText::create(w, w);
    CHECK(t && t->parent() == w && t->priority() == 10000 && t->mediator_ == w);
    CHECK(t->taskName() == "テキスト(コントロール)" && t->fontSize_ == 16 && t->lineGap_ == 0 && t->alpha_ == 1);
    CHECK(t->kind() == 0x16 && !t->hitTest(0, 0));
    t->setMediator(nullptr);
    CHECK(t->mediator_ == nullptr);
    t->alpha_ = 0.25f;
    CHECK(t->onMain() && t->color_[3] == 0.25f);
    auto* x = new Text;
    CHECK(x->CTask::create(w, 0) == x && x->alive());   // (create(w, 0) would be the static factory)
    x->setName("abc");
    CHECK(x->got == u"abc");
    x->setTextA("\x82\xa0z");   // byte-wise until the code page conversion lands
    CHECK(x->got.size() == 3 && x->got[0] == 0x82 && x->got[2] == 'z');
    std::string longText(0x300, 'q');
    x->setTextA(longText.c_str());
    CHECK(x->got.size() == 0x1ff);
}

static void switchControl(Win* w) {
    size_t first = g_sprites.size();
    auto* s = new CWindowTaskSwitch;
    CHECK(s->taskName() == "スイッチ(コントロール)" && s->w_ == 256);
    s->CTask::create(w, 0);
    s->mediator_ = w;
    CHECK(s->kind() == 0xf && s->w_ == 80 && s->h_ == 24 && s->drawMode_ == CElement::BLEND && s->inheritTransform_);
    CHECK(g_sprites.size() == first + 9);
    const char* names[9] = {"左上", "中央上", "右上", "左中央", "右中央", "左下", "中央下", "右下", "中央"};
    for (int k = 0; k < 9; k++) {
        CSpriteElm* e = g_sprites[first + k];
        CHECK(el(s->sprites_[k]) == e && e->parent() == s && e->drawMode_ == CElement::BLEND && e->inheritTransform_);
        CHECK(e->texture == "data/common/window/swich_01_c00.png");
        CHECK(e->instName() == std::string("CWindowTaskSwitchの") + names[k] + "画像");
    }
    // the pieces table (as the exe writes it out)
    CHECK(s->pieces_[0].w == 8 && s->pieces_[0].uv[4][0] == 0x60 && s->pieces_[2].uv[0][0] == 0x10);
    CHECK(s->pieces_[5].uv[4][0] == 0x70 && s->pieces_[5].uv[4][1] == 8 && s->pieces_[8].uv[1][1] == 0x10);
    // look 0: TL (0,0), T (8,0), R = grid piece 5 at (16,8), C = grid piece 4 at (8,8)
    CHECK(rectIs(el(s->sprites_[0]), 0, 0, 8, 8) && rectIs(el(s->sprites_[1]), 8, 0, 8, 8));
    CHECK(rectIs(el(s->sprites_[4]), 16, 8, 8, 8) && rectIs(el(s->sprites_[8]), 8, 8, 8, 8));
    s->setLook(5);   // slot 4: 96 to the right
    CHECK(rectIs(el(s->sprites_[0]), 96, 0, 8, 8) && rectIs(el(s->sprites_[7]), 112, 16, 8, 8));
    s->setLook(3);   // nothing
    CHECK(rectIs(el(s->sprites_[0]), 96, 0, 8, 8));
    s->setLook(2);
    CHECK(rectIs(el(s->sprites_[6]), 56, 16, 8, 8));
    // layout for 80 x 24
    s->x_ = 100, s->y_ = 200;
    s->layout();
    CHECK(s->pos_.x == 100 && s->pos_.y == 200);
    CElement* T = el(s->sprites_[1]);
    CHECK(T->pos_.x == 8 && approx(T->scale_.x, 8) && el(s->sprites_[2])->pos_.x == 72);
    CElement* R = el(s->sprites_[4]);
    CHECK(R->pos_.x == 72 && R->pos_.y == 8 && approx(R->scale_.y, 1));
    CElement* BR = el(s->sprites_[7]);
    CHECK(BR->pos_.x == 72 && BR->pos_.y == 16);
    CElement* C = el(s->sprites_[8]);
    CHECK(C->pos_.x == 8 && C->pos_.y == 8 && approx(C->scale_.x, 8) && approx(C->scale_.y, 1));
    // hits: strictly inside 100..180 x 200..224
    updateTree(w);
    s->enabled_ = false;
    CHECK(!s->hit(120, 210));
    s->enabled_ = true;
    CHECK(s->hit(101, 201) && s->hit(179, 223) && !s->hit(100, 210) && !s->hit(180, 210) && !s->hit(120, 224));
    CHECK(s->hitTest(150.9f, 212.2f));
    // polled mouse: hover, press, drag off, back on, release outside
    g_mouseX = 120, g_mouseY = 210, key(VK_LBUTTON, false);
    s->onMain();
    CHECK(s->state_ == CWindowTaskSwitch::HOVER);
    s->onMain();
    CHECK(rectIs(el(s->sprites_[0]), 24, 0, 8, 8));   // hover look
    w->calls.clear();
    s->handleMessage(msg(0x201));
    CHECK(s->state_ == CWindowTaskSwitch::PRESSED);
    g_mouseX = 10;
    s->onMain();
    CHECK(s->state_ == CWindowTaskSwitch::PRESSED_OUTSIDE && rectIs(el(s->sprites_[0]), 48, 0, 8, 8));
    key(VK_LBUTTON, true);
    g_mouseX = 120;
    s->onMain();
    CHECK(s->state_ == CWindowTaskSwitch::PRESSED);
    s->handleMessage(msg(0x202));
    CWindowTaskControll* me = s;
    CHECK(s->state_ == CWindowTaskSwitch::HOVER && w->calls.size() == 1 && w->calls[0] == std::make_pair(0, me));
    g_mouseX = 10, key(VK_LBUTTON, false);
    s->onMain();
    CHECK(s->state_ == CWindowTaskSwitch::NORMAL);
    s->checked_ = true;
    s->onMain();
    CHECK(rectIs(el(s->sprites_[0]), 72, 0, 8, 8));   // checked look 4
    s->checked_ = false;
    s->focused_ = 1;
    s->onMain();
    CHECK(rectIs(el(s->sprites_[0]), 24, 0, 8, 8));   // focus shows the hover look
    s->handleMessage(msg(0x202));   // not pressed: nothing
    // keys
    w->calls.clear();
    WindowMsg ch = msg(0x102);
    ch.ch = '\t';
    s->handleMessage(ch);
    key(VK_SHIFT, true);
    s->handleMessage(ch);
    key(VK_SHIFT, false);
    ch.ch = '\r';
    s->handleMessage(ch);
    CHECK(w->calls.size() == 3 && w->calls[0].first == 2 && w->calls[1].first == 3 && w->calls[2].first == 0);
    s->setCentre(300, 100);
    CHECK(s->x_ == 260 && s->y_ == 88 && s->pos_.x == 260 && s->pos_.y == 88);
}

static void scroll(Win* w) {
    size_t first = g_sprites.size();
    CWindowTaskScroll* s = CWindowTaskScroll::create(w, w, 10);
    CHECK(s && s->taskName() == "スクロールバー縦(コントロール)" && s->max_ == 10 && s->mediator_ == w);
    CHECK(s->kind() == 0xe && g_sprites.size() == first + 6 && s->length_ == 256 && s->page_ == 6 && s->visible_);
    CHECK(s->enabled_ && s->disp_);   // show()
    for (int i = 0; i < 6; i++) CHECK(g_sprites[first + i]->texture == "data/common/window/scroll_01_c00.png");
    CHECK(el(s->upSprite_)->instName() == "CWindowTaskScrollBaseの上(左)矢印画像");
    CHECK(el(s->trackSprite_)->instName() == "CWindowTaskScrollBaseの下地画像");
    CHECK(rectIs(el(s->trackSprite_), 48, 0, 16, 16) && s->down_.uv[2][0] == 32 && s->thumbBottom_.uv[1][1] == 48);
    // thumb length: (256 - 16 - 16) / 11 = 20.36; at least 8 + 8
    CHECK(approx(s->thumbLength(), 224.0f / 11));
    s->max_ = 100;
    CHECK(s->thumbLength() == 16);
    s->max_ = 10;
    s->value_ = 5;
    CHECK(approx(s->valueToPos(0), (224 - 224.0f / 11) / 10 * 5));
    s->value_ = 50;
    s->valueToPos(0);
    CHECK(s->value_ == 10);   // clamped
    CHECK(s->posToValue(s->valueToPos(0)) == 9 || s->posToValue(s->valueToPos(0)) == 10);
    CHECK(s->posToValue(0) == 0);
    // setValue clamps and always tells the window
    w->calls.clear();
    s->setValue(-3);
    CHECK(s->value_ == 0 && s->thumbPos_ == 0 && w->calls.size() == 1 && w->calls[0].first == 0);
    s->setValue(4);
    CHECK(s->value_ == 4 && approx(s->thumbPos_, s->valueToPos(0)));
    // arrows: one step on the press, then every 4th frame after 30
    w->calls.clear();
    s->stepDown();
    CHECK(s->value_ == 5 && s->downHeld_ && w->calls.size() == 1);
    for (int i = 0; i < 30; i++) s->stepDown();
    CHECK(s->value_ == 5 && s->downFrames_ == 30);
    s->stepDown(), s->stepDown(), s->stepDown();   // frames 31..33: 32 repeats
    CHECK(s->value_ == 6);
    s->stepDown();   // 34
    CHECK(s->value_ == 6);
    s->releaseDown();
    CHECK(!s->downHeld_ && s->downFrames_ == 0);
    s->value_ = 0;
    w->calls.clear();
    s->stepUp();
    CHECK(s->value_ == 0 && s->upHeld_ && w->calls.empty());   // nothing to step: no notice
    s->releaseUp();
    // the wheel: max/10 + 1 per notch
    s->value_ = 5;
    WindowMsg wheel = msg(0x20a);
    wheel.wParam = uint32_t(120) << 16;
    s->handleMessage(wheel);
    CHECK(s->value_ == 3);
    wheel.wParam = uint32_t(uint16_t(-120)) << 16;
    s->handleMessage(wheel);
    CHECK(s->value_ == 5);
    w->calls.clear();
    s->handleMessage(msg(0x201));
    CHECK(w->calls.size() == 1 && w->calls[0].first == 1);
    s->setWheelArea(10, 10, 100, 50);
    CHECK(s->wheelHitTest(50, 30) && !s->wheelHitTest(10, 30) && !s->wheelHitTest(50, 60));
    // setMax: hidden (and TM_MAIN-locked) without anything to scroll
    s->setMax(0);
    CHECK(!s->enabled_ && !s->disp_ && s->isLocked(2) && s->value_ == 0);
    s->setMax(20);
    CHECK(s->enabled_ && s->disp_ && !s->isLocked(2) && s->max_ == 20);
    s->autoHide_ = false;
    s->setMax(-5);
    CHECK(s->max_ == 0 && s->enabled_);
    s->autoHide_ = true;
    s->setMax(20);
    // placing: the arrows at the ends, the thumb at thumbPos_
    s->value_ = 10;
    s->thumbPos_ = s->valueToPos(0);
    s->thumbLength_ = s->thumbLength();
    s->placePieces();
    CHECK(el(s->downSprite_)->pos_.y == 240 && approx(el(s->thumbTopSprite_)->pos_.y, 16 + s->thumbPos_));
    CHECK(approx(el(s->thumbMidSprite_)->scale_.y, (s->thumbLength_ - 16) / 8));
    CHECK(approx(el(s->thumbBottomSprite_)->pos_.y, 16 + 8 + s->thumbLength_ + s->thumbPos_ - 16));
    CHECK(approx(el(s->trackSprite_)->scale_.y, 16));
    s->layout();
    CHECK(el(s->trackSprite_)->pos_.z == 0 && el(s->upSprite_)->pos_.z == 1);
    // hit areas follow the sprites' world positions (bar at 500, 100)
    s->x_ = 500, s->y_ = 100;
    s->pos_ = {500, 100, 1};
    updateTree(w);
    CHECK(s->hitUp(508, 108) && !s->hitUp(508, 116) && s->hitDown(508, 345) && !s->hitDown(508, 340));
    float ty = 100 + 16 + s->thumbPos_;
    CHECK(s->hitThumb(508, int(ty) + 3) && !s->hitThumb(508, int(ty) - 2));
    CHECK(s->hitTest(508, 200) && !s->hitTest(500, 200) && !s->hitTest(508, 356));
    CHECK(approx(s->grabOffset(0, ty + 5), 5));
    // onMain: a press on the down arrow steps once; release resets
    s->value_ = 3;
    s->thumbPos_ = s->valueToPos(0);
    g_mouseX = 508, g_mouseY = 345, key(VK_LBUTTON, true);
    w->calls.clear();
    s->onMain();
    CHECK(s->value_ == 4 && s->downHeld_ && rectIs(el(s->downSprite_), 32, 16, 16, 16) && s->pressFrames_ == 1);
    key(VK_LBUTTON, false);
    s->onMain();
    CHECK(!s->downHeld_ && rectIs(el(s->downSprite_), 16, 16, 16, 16) && s->pressFrames_ == 0);
    // a click on the track below the thumb pages down
    updateTree(w);
    g_mouseX = 508, g_mouseY = 330, key(VK_LBUTTON, true);
    s->onMain();
    CHECK(s->value_ == 10);
    key(VK_LBUTTON, false);
    s->onMain();
    // dragging the thumb: grab, move, release
    s->value_ = 0;
    s->thumbPos_ = 0;
    s->placePieces();
    updateTree(w);
    g_mouseX = 508, g_mouseY = 120, key(VK_LBUTTON, true);
    s->onMain();   // grabs: dragOffset_ = 120 - thumb top (116); first drag() call records the start
    CHECK(s->dragging_ && approx(s->dragOffset_, 4) && s->dragStarted_);
    g_mouseY = 220;
    s->onMain();   // moved 100 down
    CHECK(s->value_ > 5 && approx(s->thumbPos_, 100));
    key(VK_LBUTTON, false);
    s->onMain();
    CHECK(!s->dragging_ && approx(s->thumbPos_, s->valueToPos(0)));
    // nothing happens for a mouse over another control
    s->value_ = 2;
    g_mouseX = 900, g_mouseY = 700, key(VK_LBUTTON, true);
    s->onMain();
    CHECK(s->value_ == 2);
    key(VK_LBUTTON, false);
}

static void textApi(Win* w) {
    CWindowTaskText* t = CWindowTaskText::create(w, w);
    CTextElm* e = elmOf(t);
    CHECK(e && e->parent() == t && e->instName() == "CWindowTaskTextのテキスト" && e->inheritTransform_);
    CHECK(e->fontSize == 16 && e->lineGap == 0 && e->unk748);
    CHECK(e->color_[0] == 1 && e->color_[3] == 1 && t->fontSize_ == 16 && t->alpha_ == 1);
    t->setFontSize(12);
    CHECK(t->fontSize_ == 12 && e->fontSize == 12);
    t->setLineGap(3);
    CHECK(t->lineGap_ == 3 && e->lineGap == 3);
    t->setColor(0, 0.5f, 0, 1);
    CHECK(e->color_[1] == 0.5f);
    t->setArea(200, 40);
    CHECK(e->rect_[2] == 200 && e->rect_[3] == 40 && e->boxW == 200 && e->boxH == 40);
    t->setAlign(CWindowTaskText::RIGHT);
    t->setFirstLine(4);
    t->setPageLines(7);
    CHECK(t->align() == 2 && t->firstLine() == 4 && t->pageLines() == 7 && e->align == 2 && e->firstLine == 4);
    e->width = 77;
    e->lines = 9;
    CHECK(t->width() == 77 && t->lineCount(150) == 9 && e->lastLineWidth == 150);
    t->setText(u"Yes");
    CHECK(e->text == u"Yes" && t->name_ == "Yes");
    t->setName("No");
    CHECK(e->text == u"No");
    t->posZ_ = 3;
    t->setPos(5, 6);
    CHECK(t->x_ == 5 && t->y_ == 6 && t->pos_.x == 5 && t->pos_.z == 3);
}

static void backPlane(Win* w) {
    CWindowTaskBackPlane* b = CWindowTaskBackPlane::create(w, w);
    CHECK(b && b->taskName() == "白い背景(コントロール)" && b->kind() == 5 && b->color_[3] == 0.7f);
    CElement* s = el(b->sprite_);
    CHECK(static_cast<CSpriteElm*>(s)->texture == "data/common/window/window_base_01_c01.png");
    CHECK(s->instName() == "CWindowTaskBackPlaneの画像" && rectIs(s, 8, 8, 8, 8) && s->scale_.x == 32);
    b->x_ = 10, b->y_ = 20, b->w_ = 40, b->h_ = 16;
    b->layout();
    CHECK(b->pos_.x == 10 && s->scale_.x == 5 && s->scale_.y == 2);
    updateTree(w);
    CHECK(b->hitTest(11, 21) && !b->hitTest(10, 21) && !b->hitTest(50, 21));
    w->calls.clear();
    b->handleMessage(msg(0x201, 3, 4));
    CHECK(w->calls.size() == 3 && w->calls[0].first == 1 && w->calls[1].first == 4 && w->calls[2].first == 0);
    b->setColor(1, 0, 0, 0.5f);
    CHECK(b->color_[0] == 1 && b->color_[3] == 0.5f);
}

static void frames(Win* w) {
    CWindowTaskFrameThin* f = CWindowTaskFrameThin::create(w, w, 1);
    CHECK(f && f->taskName() == "枠の細いウィンドウ(コントロール)" && f->kind() == 1 && f->color_[3] == 0.7f);
    CHECK(f->style_ == 1 && !std::strcmp(windowFrameTexture(8), "window_base_01_c08.png"));
    for (auto& s : f->sprites_)
        CHECK(static_cast<CSpriteElm*>(el(s))->texture == "data/common/window/window_base_01_c01.png");
    CHECK(el(f->sprites_[4])->instName() == "CWindowTaskFrameThinの右中央画像");
    f->w_ = 100, f->h_ = 50, f->x_ = 200, f->y_ = 100;
    f->layout();
    CHECK(el(f->sprites_[1])->scale_.x == 10.5f && el(f->sprites_[3])->scale_.y == 4.25f);
    CHECK(el(f->sprites_[7])->pos_.x == 92 && el(f->sprites_[7])->pos_.y == 42 && rectIs(el(f->sprites_[7]), 16, 16, 8, 8));
    CHECK(rectIs(el(f->sprites_[4]), 16, 8, 8, 8) && el(f->sprites_[5])->pos_.y == 42);
    updateTree(w);
    CHECK(f->hitTest(250, 103) && f->hitTest(250, 147) && f->hitTest(203, 120) && f->hitTest(297, 120));
    CHECK(!f->hitTest(250, 120) && !f->hitTest(200, 103) && !f->hitTest(300, 120));
    CHECK(!f->handleMessage(msg(0x202)));
    w->calls.clear();
    CHECK(f->handleMessage(msg(0x201, 7, 8)) && w->calls.size() == 2 && w->dragX == 7);
    f->setVisible(false);
    CHECK(!el(f->sprites_[0])->disp_ && el(f->sprites_[0])->isLocked(2));
    f->setVisible(true);
    CHECK(el(f->sprites_[0])->disp_ && !el(f->sprites_[0])->isLocked(2));
    CWindowTaskFrameThin* opaque = CWindowTaskFrameThin::create(w, w, 5);
    CHECK(opaque->color_[3] == 1);

    CWindowTaskFrameBottomThick* t = CWindowTaskFrameBottomThick::create(w, w, 0);
    CHECK(t && t->kind() == 3 && t->bottomH_ == 24 && t->color_[3] == 0.7f);
    CHECK(static_cast<CSpriteElm*>(el(t->sprites_[13]))->texture == "data/common/window/window_base_01_c00.png");
    CHECK(el(t->sprites_[13])->instName() == "CWindowTaskFrameBottomThickの下部分の中央部画像");
    t->w_ = 200, t->h_ = 100, t->x_ = 0, t->y_ = 0;
    t->layout();   // upper frame 76 high, band 24
    CHECK(el(t->sprites_[3])->scale_.y == 7.5f && el(t->sprites_[5])->pos_.y == 68 && rectIs(el(t->sprites_[5]), 72, 8, 8, 8));
    CHECK(el(t->sprites_[8])->pos_.y == 76 && el(t->sprites_[8])->scale_.y == 2 && el(t->sprites_[12])->pos_.x == 192);
    CHECK(el(t->sprites_[13])->pos_.x == 8 && el(t->sprites_[13])->scale_.x == 23 && el(t->sprites_[13])->scale_.y == 2);
    t->pos_ = {0, 0, 0};
    updateTree(w);
    CHECK(t->hitTest(100, 70) && t->hitTest(100, 99) && !t->hitTest(100, 60) && t->hitTest(198, 50));
    t->setVisible(false);
    CHECK(!el(t->sprites_[13])->disp_);
}

static void shadowAndTextSwitch(Win* w) {
    CWindowTaskShadowText* st = CWindowTaskShadowText::create(w, w);
    CHECK(st && st->taskName() == "影付き文字コントロール" && st->kind() == 0x16 && !st->hitTest(0, 0));
    CHECK(st->text_->instName() == "CWindowTaskShadowTextのテキスト" && st->text_->posZ_ == 1 && st->shadow_->posZ_ == 0);
    CHECK(st->shadow_->pos_.x == 1 && st->shadow_->pos_.y == 1 && st->shadowDx_ == 1);
    CHECK(st->text_->mediator_ == static_cast<IWindowTaskMediator*>(st));
    st->setName("hi");
    CHECK(elmOf(st->text_.get())->text == u"hi" && elmOf(st->shadow_.get())->text == u"hi");
    w->calls.clear();
    CWindowTaskControll* inner = st->text_.get();
    st->onControlEvent(inner);   // forwarded unchanged
    st->beginDrag(inner, 1, 2);
    CHECK(w->calls.size() == 2 && w->calls[0] == std::make_pair(0, inner) && w->calls[1] == std::make_pair(4, inner));

    CWindowTaskTextSwitch* b = CWindowTaskTextSwitch::create(w, w);
    CHECK(b && b->taskName() == "テキストスイッチ(コントロール)" && b->kind() == 0x19 && b->minW_ == 80);
    CWindowTaskShadowText* c = b->caption_.get();
    CHECK(c->parent() == b && c->instName() == "CWindowTaskTextSwitchのテキスト");
    CHECK(c->text_->align() == CWindowTaskText::CENTRE && c->text_->pageLines() == 1 && c->text_->fontSize_ == 16);
    CHECK(!c->shadow_->disp_ && elmOf(c->text_.get())->color_[0] == 0);
    // layout: caption 4 pixels down in a 24-high button ((24 - 16) / 2), at least 80 wide
    CHECK(c->text_->y_ == 4 && b->w_ == 80 && elmOf(c->text_.get())->rect_[3] == 16);
    elmOf(c->text_.get())->width = 100;
    b->setText(u"Yes");
    CHECK(elmOf(c->text_.get())->text == u"Yes" && b->w_ == 108 && elmOf(c->text_.get())->rect_[2] == 108);
    CHECK(el(b->sprites_[2])->pos_.x == 100);   // the frame follows the new width
    c->text_->setAlign(CWindowTaskText::LEFT);
    b->layout();
    CHECK(c->text_->x_ == 4 && c->shadow_->x_ == 5 && c->x_ == 4);
    b->setName("No");
    CHECK(elmOf(c->text_.get())->text == u"No" && b->name().empty());   // (the caption keeps no name of its own, as in the exe)
    w->calls.clear();
    b->onControlEvent(c);   // the caption's notices go on as the button's
    CHECK(w->calls.size() == 1 && w->calls[0] == std::make_pair(0, static_cast<CWindowTaskControll*>(b)));
}

static void textField(Win* w) {
    CWindowTaskTextField* f = CWindowTaskTextField::create(w, w);
    CHECK(f && f->taskName() == "テキストフィールド(コントロール)" && f->kind() == 0x17 && f->w_ == 256);
    CHECK(f->text_->instName() == "CWindowTaskTextFieldのテキスト" && f->text_->align() == CWindowTaskText::CENTRE);
    CHECK(f->scroll_->instName() == "CWindowTaskTextFieldのスクロールバー" && f->back_->instName() == "CWindowTaskTextFieldの背景");
    CHECK(f->scroll_->x_ == 240 && f->scroll_->length_ == 256 && f->back_->w_ == 256 && f->text_->posZ_ == 2);
    CTextElm* e = elmOf(f->text_.get());
    CHECK(e->rect_[2] == 240 && e->rect_[3] == 256);
    // 30 lines, 10 fit from the top, 12 at the current one
    e->lines = 30;
    e->linesFrom = 10;
    f->w_ = 300, f->h_ = 160;
    f->layout();
    CHECK(f->scroll_->max_ == 20 && f->scroll_->page_ == 10 && f->text_->pageLines() == 10 && e->lastLineWidth == 284);
    CHECK(f->scroll_->enabled_);
    e->linesFrom = 0;   // nothing fits: a page is h / line height (160 / 16)
    f->layout();
    CHECK(f->scroll_->page_ == 10 && f->scroll_->max_ == 30);
    w->calls.clear();
    f->scroll_->value_ = 5;
    f->onControlEvent(f->scroll_.get());
    CHECK(f->text_->firstLine() == 5 && w->calls.size() == 1 && w->calls[0].second == f);
    f->enabled_ = false;
    f->onControlEvent(f->scroll_.get());
    CHECK(w->calls.size() == 1);   // disabled: no notice
    f->enabled_ = true;
    f->setText(u"abc");
    CHECK(e->text == u"abc" && f->name() == "abc");
    f->setEnabled(false);
    CHECK(!f->enabled_ && !f->text_->enabled_ && !f->scroll_->enabled_ && !f->back_->enabled_);
}

static void backStripe(Win* w) {
    CWindowTaskBackStripe* b = CWindowTaskBackStripe::create(w, w, false);
    CHECK(b && b->taskName() == "しましまの背景(コントロール)" && b->kind() == 7 && b->color_[3] == 0.7f);
    CDupSprite* d = b->dup_.get();
    CHECK(d->texture == "data/common/window/window_base_01_c01.png" && d->instName() == "CWindowTaskBackStripeの画像");
    CHECK(b->rowCount_ == 1 && b->rows_.size() == 1 && b->tiles_.size() == 1);
    b->w_ = 100, b->h_ = 64;
    b->setRowSpan(2, 9);   // beyond rowCount_ (1): ignored
    CHECK(b->rowSpan(2) == 1);
    b->layout();
    CHECK(b->rowCount_ == 4 && b->rows_.size() == 4 && d->scale_.x == 12.5f && d->scale_.y == 2);
    CHECK(b->tiles_[1].y == 16 && b->tiles_[1].sx == 12.5f && b->tiles_[1].sy == 2);
    CHECK(b->tiles_[0].u == 56 && b->tiles_[1].u == 8 && b->tiles_[2].u == 56 && b->tiles_[3].u == 8);
    CHECK(b->tiles_[1].v == 8 && b->tiles_[1].w == 8);
    b->applyLooks(1);   // an odd first item: the shading starts on row 1
    CHECK(b->tiles_[0].u == 8 && b->tiles_[1].u == 56);
    b->setRowSpan(1, 2);
    b->rebuild();   // rows 0..16, 16..48, 48..64
    CHECK(b->rows_.size() == 3 && b->rows_[1].top == 16 && b->rows_[1].height == 32 && b->rows_[2].top == 48);
    CHECK(b->tiles_[2].y == 48 && b->tiles_[1].sy == 4);
    b->select(2);
    b->applyLooks(0);
    CHECK(b->selected_ == 2 && b->isSelected(2) && b->tiles_[2].u == 72 && b->tiles_[2].v == 16);
    b->select(0);
    CHECK(!b->isSelected(2) && b->isSelected(0) && !b->isSelected(9));
    b->onMain();
    CHECK(d->clears == 1 && d->tiles.size() == 3);
    b->x_ = 0, b->y_ = 0;
    b->layout();
    updateTree(w);
    w->calls.clear();
    WindowMsg m = msg(0x201, 10, 30);   // row 1 (16..48)
    b->handleMessage(m);
    CHECK(b->selected_ == 1 && w->calls.size() == 1 && w->calls[0] == std::make_pair(0, static_cast<CWindowTaskControll*>(b)));
    b->enabled_ = false;
    b->handleMessage(m);
    CHECK(w->calls.size() == 2 && w->calls[1].first == 1);
    b->enabled_ = true;
    CWindowTaskBackStripe* multi = CWindowTaskBackStripe::create(w, w, true);
    multi->h_ = 48;
    multi->layout();
    multi->select(1);
    multi->select(2);
    multi->select(1);
    CHECK(!multi->isSelected(1) && multi->isSelected(2) && multi->selected_ == 1);
}

static CTextElm* measureOf(CWindowTaskListbox* l) { return elmOf(l->measure_.get()); }

static void listbox(Win* w) {
    CWindowTaskListbox* l = CWindowTaskListbox::create(w, w, false);
    CHECK(l && l->taskName() == "リストボックス(コントロール)" && l->kind() == 0x18 && !l->hitTest(0, 0));
    CHECK(l->w_ == 256 && l->h_ == 256 && l->autoLayout_ && l->multiLine_ && l->maxSelect_ == 9999 && l->clean_);
    CHECK(l->text_->instName() == "CWindowTaskListboxのテキスト" && l->text_->align() == 1);
    CHECK(!l->measure_->disp_ && l->measure_->isLocked(2));
    CHECK(l->scroll_->instName() == "CWindowTaskListboxのスクロールバー" && l->stripe_->instName() == "CWindowTaskListboxの背景");
    CHECK(l->stripe_->color_[3] == 0.7f && l->stripe_->rowCount_ == 16 && l->scroll_->x_ == 240 && l->scroll_->z_ == 2);
    measureOf(l)->lines = 1;
    l->addItem(u"apple");
    l->addItem(u"banana");
    measureOf(l)->lines = 2;
    l->addItem(u"cherry pie");
    CHECK(l->items_->size() == 3 && l->itemCount() == 3 && l->lineCounts_[2] == 2 && l->lineTotal() == 4);
    CHECK(elmOf(l->text_.get())->text == u"apple\nbanana\ncherry pie\n" && measureOf(l)->lastLineWidth == 240);
    CHECK(l->lineToItem(0) == 0 && l->lineToItem(1) == 1 && l->lineToItem(3) == 2 && l->lineToItem(9) == 2);
    CHECK(l->itemToLine(2) == 2 && l->itemToLine(7) == 7);
    CHECK(l->stripe_->rowSpan(2) == 2 && l->text_->pageLines() == 16);
    l->select(1);
    CHECK(l->selected_ == 1 && l->isSelected(1) && l->stripe_->isSelected(1) && l->selectedCount() == 1);
    l->select(0);
    CHECK(!l->isSelected(1) && l->isSelected(0) && l->stripe_->selected_ == 0);
    // a click on the background's row 2
    w->calls.clear();
    l->stripe_->select(2);
    l->onControlEvent(l->stripe_.get());
    CHECK(l->selected_ == 2 && l->lastSender_ == 1 && w->calls.size() == 2);
    CHECK(w->calls[0] == std::make_pair(0, static_cast<CWindowTaskControll*>(l)) && w->calls[1].first == 1);
    l->setItem(1, u"blueberry");
    CHECK((*l->items_)[1] == u"blueberry" && l->lineCounts_[1] == 2 && l->lineTotal() == 5);
    l->removeItem(0);
    CHECK(l->items_->size() == 2 && (*l->items_)[0] == u"blueberry" && l->selected_ == 2 && l->lineCounts_.size() == 2);
    l->removeItem(1);
    CHECK(l->items_->size() == 1);
    l->clearSelection();
    CHECK(l->selected_ == -1 && l->selectedCount() == 0 && l->stripe_->selected_ == -1);
    l->setFontSize(12);
    CHECK(elmOf(l->text_.get())->fontSize == 12 && measureOf(l)->fontSize == 12 && l->text_->lineGap_ == 4);
    // scrolling: 20 one-line items in 16 rows
    l->clear();
    CHECK(l->items_->empty() && l->itemCount() == 0);
    measureOf(l)->lines = 1;
    for (int i = 0; i < 20; i++) l->addItem(u"x");
    CHECK(l->scroll_->max_ == 4 && l->scroll_->page_ == 16);
    l->scroll_->value_ = 3;
    l->onControlEvent(l->scroll_.get());
    CHECK(l->topItem_ == 3 && l->topLine_ == 3 && l->lastSender_ == 2 && l->text_->firstLine() == 3);
    l->select(5);   // shown on the background's row 2
    CHECK(l->stripe_->isSelected(2));
    l->setEnabled(false);
    CHECK(!l->enabled_ && !l->stripe_->enabled_ && !l->scroll_->enabled_ && !l->text_->enabled_);
    l->setEnabled(true);
    l->setAlpha(0.5f);
    CHECK(l->stripe_->color_[3] == 0.5f);
    l->multiLine_ = false;
    CHECK(l->itemLines(0) == 1 && l->lineToItem(7) == 7);
    l->multiLine_ = true;

    // multiple selection, limited by maxSelect_
    CWindowTaskListbox* m = CWindowTaskListbox::create(w, w, true);
    measureOf(m)->lines = 1;
    m->addItem(u"a"), m->addItem(u"b"), m->addItem(u"c");
    m->maxSelect_ = 2;
    m->select(0), m->select(2);
    CHECK(m->isSelected(0) && m->isSelected(2) && m->selectedCount() == 2);
    m->select(1);   // a third: refused
    CHECK(!m->isSelected(1) && m->selectedCount() == 2);
    m->select(0);   // toggles off
    CHECK(!m->isSelected(0) && m->stripe_->isSelected(2) && !m->stripe_->isSelected(0));
}

static void activeAndTextlist(Win* w) {
    CWindowTaskActiveListbox* a = CWindowTaskActiveListbox::create(w, w, false);
    CHECK(a && a->taskName() == "アクティブリストボックス(コントロール)" && a->clicked_ == -1);
    measureOf(a)->lines = 1;
    a->addItem(u"one"), a->addItem(u"two"), a->addItem(u"three");
    a->x_ = 600, a->y_ = 100;
    a->layout();
    a->z_ = 60000;   // in front of everything else in the factory
    a->stripe_->z_ = 0;
    updateTree(w);
    g_windowFactory->sortControls();
    g_mouseX = 620, g_mouseY = 120;   // row 1
    g_mouseLeftPushed = true;
    a->onMain();
    CHECK(a->selected_ == 1 && a->clicked_ == 1);
    g_mouseY = 160;   // row 3: past the items
    a->onMain();
    CHECK(a->clicked_ == -1);
    g_mouseLeftPushed = false;
    g_mouseX = 10;
    a->onMain();   // elsewhere: reset
    CHECK(a->clicked_ == -1 && a->selected_ == -1);

    CWindowTaskTextlist* t = CWindowTaskTextlist::create(w, w);
    CHECK(t && !t->stripe_->disp_ && t->stripe_->isLocked(2));
    measureOf(t)->lines = 1;
    t->setText(u"first\nsecond\nthird");
    CHECK(t->items_->size() == 3 && (*t->items_)[1] == u"second" && (*t->items_)[2] == u"third" && t->autoLayout_);
    t->setText(u"only\n");
    CHECK(t->items_->size() == 2 && (*t->items_)[1].empty());
}

static void listPieces(Win* w) {
    CWindowTaskIconbar* b = CWindowTaskIconbar::create(w, w);
    CHECK(b && b->taskName() == "アイコンバー(コントロール)" && b->kind() == 8 && b->active_ && b->w_ == 32 && b->h_ == 24);
    CHECK(static_cast<CSpriteElm*>(el(b->middle_))->texture == "data/common/window/iconbar_01_c01.png");
    CHECK(el(b->right_)->instName() == "CWindowTaskIconbarの右画像" && rectIs(el(b->right_), 16, 0, 8, 24) && b->color_[3] == 0.7f);
    b->w_ = 200;
    b->layout();
    CHECK(el(b->middle_)->scale_.x == 23 && el(b->right_)->pos_.x == 192 && rectIs(el(b->middle_), 8, 0, 8, 24));
    b->active_ = false;
    b->layout();
    CHECK(rectIs(el(b->left_), 48, 0, 8, 24) && rectIs(el(b->right_), 64, 0, 8, 24));
    b->x_ = 10, b->y_ = 10;
    b->layout();
    updateTree(w);
    CHECK(b->hitTest(11, 11) && !b->hitTest(210, 11) && !b->hitTest(11, 34));
    w->calls.clear();
    CHECK(b->handleMessage(msg(0x201, 5, 6)) && w->calls.size() == 2 && w->dragX == 5 && !b->handleMessage(msg(0x200)));

    CWindowTaskThinChop* c = CWindowTaskThinChop::create(w, w);
    CHECK(c && c->taskName() == "上が切れてるウィンドウ(コントロール)" && c->kind() == 2 && c->color_[3] == 0.7f);
    CHECK(el(c->sprites_[3])->instName() == "CWindowTaskThinChopの中央下画像");
    c->x_ = 100, c->y_ = 100, c->w_ = 80, c->h_ = 40;
    c->layout();
    CHECK(el(c->sprites_[0])->scale_.y == 4 && rectIs(el(c->sprites_[0]), 0, 8, 8, 8) && el(c->sprites_[1])->pos_.x == 72);
    CHECK(el(c->sprites_[3])->scale_.x == 8 && el(c->sprites_[4])->pos_.y == 32 && rectIs(el(c->sprites_[4]), 16, 16, 8, 8));
    updateTree(w);
    CHECK(c->hitTest(140, 138) && c->hitTest(103, 110) && c->hitTest(177, 110) && !c->hitTest(140, 103));
    CHECK(c->handleMessage(msg(0x201)) && !c->handleMessage(msg(0x202)));

    CWindowTaskIconHide* x = CWindowTaskIconHide::create(w, w);
    CHECK(x && x->taskName() == "×ボタン(コントロール)" && x->kind() == 0xb && x->w_ == 16 && x->h_ == 24);
    CHECK(static_cast<CSpriteElm*>(el(x->sprite_))->texture == "data/common/window/icon_01_c01.png");
    x->x_ = 900, x->y_ = 50;
    x->z_ = 65000;
    x->layout();
    updateTree(w);
    g_windowFactory->sortControls();
    g_mouseX = 905, g_mouseY = 60;
    key(VK_LBUTTON, false);
    x->onMain();   // hover
    CHECK(rectIs(el(x->sprite_), 16, 24, 16, 24) && x->wasUp_);
    key(VK_LBUTTON, true);
    x->onMain();   // pressed here
    CHECK(x->pressed_ && rectIs(el(x->sprite_), 32, 24, 16, 24));
    g_mouseX = 940;
    x->onMain();   // off it
    CHECK(rectIs(el(x->sprite_), 0, 24, 16, 24));
    key(VK_LBUTTON, false);
    w->calls.clear();
    x->handleMessage(msg(0x202));
    CHECK(w->calls.size() == 1 && w->calls[0] == std::make_pair(0, static_cast<CWindowTaskControll*>(x)));

    CWindowTaskListbox* l = CWindowTaskListbox::create(w, w, false);
    measureOf(l)->lines = 1;
    l->addItem(u"a");
    l->setPos(12.7f, 30.2f);
    CHECK(l->x_ == 12 && l->y_ == 30 && l->pos_.x == 12);
    measureOf(l)->lines = 3;
    l->setSize(256, 100);   // same width: no re-measuring
    CHECK(l->h_ == 100 && l->lineCounts_[0] == 1);
    l->setSize(120, 100);
    CHECK(l->w_ == 120 && l->lineCounts_[0] == 3 && l->scroll_->x_ == 104);
}

static void iconArrows(Win* w) {
    CWindowTaskIconExpand* e = CWindowTaskIconExpand::create(w, w);
    CWindowTaskIconShrink* s = CWindowTaskIconShrink::create(w, w);
    CHECK(e && e->taskName() == "△ボタン(コントロール)" && e->kind() == 0xc && e->w_ == 16 && e->h_ == 24);
    CHECK(s && s->taskName() == "▽ボタン(コントロール)" && s->kind() == 0xd);
    CHECK(el(e->sprite_)->instName() == "CWindowTaskIconExpandの画像" && el(s->sprite_)->instName() == "CWindowTaskIconShrinkの画像");
    CHECK(static_cast<CSpriteElm*>(el(s->sprite_))->texture == "data/common/window/icon_01_c01.png");
    e->x_ = 10, e->y_ = 600;
    e->layout();
    updateTree(w);
    g_mouseX = 15, g_mouseY = 610;
    key(VK_LBUTTON, false);
    e->onMain();   // hover (whatever control is on top there)
    CHECK(rectIs(el(e->sprite_), 16, 48, 16, 24) && e->wasUp_);
    w->calls.clear();
    e->handleMessage(msg(0x202));   // a release without a press
    CHECK(w->calls.empty());
    key(VK_LBUTTON, true);
    e->onMain();
    CHECK(e->pressed_ && rectIs(el(e->sprite_), 32, 48, 16, 24));
    key(VK_LBUTTON, false);
    e->handleMessage(msg(0x202));
    CHECK(w->calls.size() == 1 && w->calls[0].second == e && !e->pressed_);
    s->setLook(2);
    CHECK(rectIs(el(s->sprite_), 32, 72, 16, 24));
}

static void framePlane(Win* w) {
    CWindowTaskFramePlane* f = CWindowTaskFramePlane::create(w, w, 3);
    CHECK(f && f->taskName() == "平らなウィンドウ(コントロール)" && f->kind() == 4 && f->color_[3] == 0.7f);
    CHECK(static_cast<CSpriteElm*>(el(f->sprites_[8]))->texture == "data/common/window/window_base_01_c03.png");
    CHECK(el(f->sprites_[8])->instName() == "CWindowTaskFramePlaneの中央画像" && rectIs(el(f->sprites_[8]), 32, 8, 8, 8));
    CHECK(rectIs(el(f->sprites_[0]), 24, 0, 8, 8) && rectIs(el(f->sprites_[7]), 40, 16, 8, 8));
    f->w_ = 100, f->h_ = 50, f->x_ = 20, f->y_ = 30;
    CHECK(f->onMain());   // lays out
    CHECK(f->pos_.x == 20 && el(f->sprites_[8])->scale_.x == 10.5f && el(f->sprites_[8])->scale_.y == 4.25f);
    CHECK(el(f->sprites_[7])->pos_.x == 92 && el(f->sprites_[7])->pos_.y == 42 && el(f->sprites_[4])->scale_.y == 4.25f);
    updateTree(w);
    CHECK(f->hitTest(70, 55) && !f->hitTest(20, 55) && !f->hitTest(70, 80));
    w->calls.clear();
    CHECK(f->handleMessage(msg(0x202)) && w->calls.empty());
    CHECK(f->handleMessage(msg(0x201, 7, 8)) && w->calls.size() == 2 && w->calls[0].first == 1 && w->dragY == 8);
    CHECK(CWindowTaskFramePlane::create(w, w, 6)->color_[3] == 1);
}

static WindowMsg chr(uint32_t c, uint32_t m = WM_CHAR) {
    WindowMsg w = msg(m);
    w.ch = c;
    return w;
}
static WindowMsg keyDown(uint32_t vk) {
    WindowMsg w = msg(WM_KEYDOWN);
    w.key = vk;
    return w;
}

static void input(Win* w) {
    CWindowTaskInput* c = CWindowTaskInput::create(w, w, 2);
    CHECK(c && c->taskName() == "インプットボックス(コントロール)" && c->kind() == 0x15 && c->style_ == 2);
    CHECK(!c->multiLine_ && c->maxLen_ == 19 && c->w_ == 256 && c->h_ == 256 && c->inheritTransform_);
    CHECK(c->ime_.get()->owner == c && c->ime_.get()->instName() == "m_ime");
    CHECK(c->text_->instName() == "CWindowTaskInputのテキスト" && elmOf(c->text_.get())->fontSize == 16);
    CHECK(c->text_->posZ_ == 2);
    CHECK(c->fill_.get()->texture == std::string(windowDataDir()) + windowFrameTexture(2) && rectIs(el(c->fill_), 56, 8, 8, 8));
    CHECK(c->border_.get()->texture == c->fill_.get()->texture && rectIs(el(c->border_), 80, 16, 8, 8));
    CHECK(c->caret_.get()->texture == std::string(windowDataDir()) + "kasoru_01_c00.png" && rectIs(el(c->caret_), 0, 0, 2, 16));
    CHECK(el(c->fill_)->color_[3] == 1 && approx(el(c->fill_)->scale_.x, 239 * 0.125f) && el(c->border_)->scale_.y == 30);
    CHECK(elmOf(c->text_.get())->boxW == 248 && elmOf(c->text_.get())->boxH == 16 && elmOf(c->text_.get())->pageLines == 15);

    // typing: printable characters at the caret, each insert and each message telling the window
    w->calls.clear();
    for (char ch : std::string("abc")) c->handleMessage(chr(ch));
    CHECK(c->value_ == u"abc" && c->col_ == 3 && c->line_ == 0 && w->calls.size() == 6 && w->calls[0].first == 0);
    c->handleMessage(chr(1));   // a control character
    CHECK(c->value_ == u"abc");
    c->digitsOnly_ = true;
    c->handleMessage(chr('x'));
    c->handleMessage(chr('7'));
    CHECK(c->value_ == u"abc7");
    c->digitsOnly_ = false;
    c->maxLen_ = 4;
    c->handleMessage(chr('d'));
    CHECK(c->value_ == u"abc7");
    c->maxLen_ = 19;
    // editing keys
    c->handleMessage(keyDown(VK_LEFT));
    CHECK(c->col_ == 3);
    c->handleMessage(chr('\b'));
    CHECK(c->value_ == u"ab7" && c->col_ == 2);
    c->handleMessage(keyDown(VK_DELETE));
    CHECK(c->value_ == u"ab" && c->col_ == 2);
    c->handleMessage(keyDown(VK_HOME));
    CHECK(c->col_ == 0);
    c->handleMessage(chr('\b'));   // nothing before the caret
    CHECK(c->value_ == u"ab");
    c->handleMessage(keyDown(VK_END));
    CHECK(c->col_ == 2);
    c->setCaret(9, 0);
    int32_t col, line;
    c->caret(&col, &line);
    CHECK(col == 2 && line == 0);
    // Tab / Shift+Tab, Enter
    w->calls.clear();
    c->handleMessage(chr('\t'));
    key(VK_SHIFT, true);
    c->handleMessage(chr('\t'));
    key(VK_SHIFT, false);
    CHECK(w->calls.size() == 4 && w->calls[0].first == 2 && w->calls[2].first == 3);
    c->submitOnEnter_ = true;
    w->calls.clear();
    c->handleMessage(chr('\r'));
    CHECK(w->calls.size() == 2 && !c->entered_ && c->value_ == u"ab");
    c->multiLine_ = true;
    c->handleMessage(chr('\r'));
    CHECK(c->value_ == u"ab\n" && c->col_ == 0 && c->line_ == 1);
    c->handleMessage(keyDown(VK_UP));
    CHECK(c->line_ == 0);
    // Ctrl+V, and the double-byte IME character
    g_clipboard = "xy";
    c->clear();
    CHECK(c->value_.empty() && c->col_ == 0);
    c->text_->setText(u"");
    c->handleMessage(chr(0x16));
    CHECK(c->value_ == u"xy" && c->col_ == 2);
    g_clipboard.clear();
    c->handleMessage(chr(0x4142, WM_IME_CHAR));
    CHECK(c->value_ == u"xyA");
    // IME messages go to the IME window; layout cuts value_ to maxLen_ bytes
    c->handleMessage(msg(WM_IME_COMPOSITION));
    CHECK(c->ime_.get()->msgs == std::vector<uint32_t>{WM_IME_COMPOSITION});
    c->maxLen_ = 2;
    c->layout();
    CHECK(c->value_ == u"xy");
    // a click focuses and moves the caret under the mouse
    c->pos_ = {100, 50, 0};
    updateTree(w);
    w->calls.clear();
    c->handleMessage(msg(WM_LBUTTONDOWN, 100 + 8 + 9, 50 + 8 + 2));
    CHECK(c->focused_ == 1 && c->col_ == 1 && c->line_ == 0);
    CHECK(w->calls.size() == 2 && w->calls[0].first == 1);
    CHECK(c->hitTest(101, 51) && !c->hitTest(100, 51) && !c->hitTest(356, 51));
    // onMain: the caret shows only while focused (the test window isn't the factory's top window: never) and
    // blinking on; the IME window follows the caret
    c->caretOn_ = true;
    c->blink_ = 13;
    c->onMain();
    CHECK(c->caretOn_ && c->blink_ == 14 && el(c->caret_)->scale_.x == 0);
    c->onMain();
    CHECK(!c->caretOn_ && c->blink_ == 0);
    c->placeIme();
    CHECK(c->ime_.get()->x == 16 && c->ime_.get()->y == 8 && c->ime_.get()->z == 1);
    c->password_ = true;
    c->onMain();
    CHECK(elmOf(c->text_.get())->text == u"**");
    // up up down down left right left right B A (a wrong key restarts it without counting itself)
    c->konami_ = 0;
    for (int k : {VK_UP, VK_UP, VK_DOWN, VK_DOWN, VK_LEFT, VK_RIGHT, VK_LEFT, VK_RIGHT, int('B'), int('A')})
        c->handleMessage(keyDown(k));
    CHECK(c->konami_ == 10);
    c->handleMessage(keyDown('A'));
    CHECK(c->konami_ == 0);
}

struct Owner : CTask {
    int events = 0;
    CWindowTaskControll* sender = nullptr;
    int32_t receive(CTaskMessage* m) override {
        if (m->tag == CTmWndObjEvent::TAG) {
            events++;
            sender = static_cast<CTmWndObjEvent*>(m)->sender;
            return TR_HANDLED;
        }
        return CTask::receive(m);
    }
};

static void pictureSwitch(Win* w) {
    auto* owner = new Owner;
    owner->create(w, 0);
    CWindowTaskPictureSwitch* p = CWindowTaskPictureSwitch::create(w, owner, w);
    CHECK(p && p->taskName() == "絵スイッチ(コントロール)" && p->kind() == 0x1a && p->owner_.task() == owner);
    CHECK(el(p->checkedSprite_)->instName() == "CWindowTaskPictureSwitchの押し下げ画像" && p->unk364_ == 0xffffffff);
    CHECK(p->text_->instName() == "CWindowTaskPictureSwitchのテキスト" && p->text_->pageLines() == 1);
    p->setImages("a.png", {0, 0, 40, 20}, {0, 20, 40, 20}, {0, 40, 40, 20}, {0, 60, 40, 20});
    CHECK(p->w_ == 40 && p->h_ == 20 && rectIs(el(p->click_), 0, 40, 40, 20));
    CHECK(static_cast<CSpriteElm*>(el(p->hover_))->texture == "a.png");
    p->x_ = 300, p->y_ = 400;
    p->layout();
    updateTree(w);
    // hover, press, release: the owner hears of the click, then the window
    g_mouseX = 310, g_mouseY = 410;
    key(VK_LBUTTON, false);
    p->onMain();
    CHECK(p->state_ == CWindowTaskPictureSwitch::HOVER && el(p->hover_)->disp_ && !el(p->normal_)->disp_);
    p->handleMessage(msg(WM_LBUTTONDOWN));
    CHECK(p->state_ == CWindowTaskPictureSwitch::PRESSED);
    p->onMain();
    CHECK(el(p->click_)->disp_ && !el(p->hover_)->disp_);
    w->calls.clear();
    p->handleMessage(msg(WM_LBUTTONUP));
    CHECK(p->state_ == CWindowTaskPictureSwitch::HOVER && owner->events == 1 && owner->sender == p);
    CHECK(w->calls.size() == 1 && w->calls[0].first == 0 && w->calls[0].second == p);
    // checked: the checked look; transparent pixels don't hit
    p->checked_ = true;
    g_mouseX = 500;
    p->onMain();
    CHECK(p->state_ == CWindowTaskPictureSwitch::NORMAL && el(p->checkedSprite_)->disp_ && !el(p->normal_)->disp_);
    CHECK(p->hit(310, 410) && !p->hit(300, 410));
    static_cast<CSpriteElm*>(el(p->normal_))->pixel[3] = 0;
    CHECK(!p->hit(310, 410));
    static_cast<CSpriteElm*>(el(p->normal_))->format = 0x17;
    CHECK(p->hit(310, 410));
    // Enter clicks; the strip loader
    p->handleMessage(chr('\r'));
    CHECK(owner->events == 2);
    static_cast<CSpriteElm*>(el(p->normal_))->texW = 64, static_cast<CSpriteElm*>(el(p->normal_))->texH = 128;
    p->setImageStrip("s.png", 4);
    CHECK(p->w_ == 64 && p->h_ == 32 && rectIs(el(p->checkedSprite_), 0, 96, 64, 32) && rectIs(el(p->click_), 0, 64, 64, 32));
    p->setImageStrip("s.png", 3);
    CHECK(rectIs(el(p->checkedSprite_), 0, 64, 64, 32));
    p->text_->setKeepNewlines(true);
    CHECK(elmOf(p->text_.get())->keepNewlines);
    p->setText(u"go");
    CHECK(p->text_->y_ == 8 && elmOf(p->text_.get())->text == u"go");
}

static void menubar(Win* w) {
    int before = CWindowTaskMenubar::s_count;
    CWindowTaskMenubar* b = CWindowTaskMenubar::create(w, w);
    CHECK(b && b->kind() == 2 && CWindowTaskMenubar::s_count == before + 1 && b->pos_.y == 736);
    CHECK(el(b->frame_)->instName() == "CWindowTaskMenubarのフレーム画像" && b->frame_->priority() == 1000);
    CHECK(static_cast<CSpriteElm*>(el(b->panel_))->texture == "data/common/window/menuber_02_c01.png");
    CHECK(el(b->panel_)->color_[3] == 0.7f && el(b->frame_)->pos_.z == 2);
    CHECK(b->text1_->instName() == "ヘルプテキスト2" && b->speed_ == 1 && b->pause_ == 30 && b->unk3b8_ == -1);
    // a short message stays put; the second copy hidden
    elmOf(b->text1_.get())->width = 100;
    int32_t id = g_helpTextMng->add(5, u"short", nullptr);
    b->onMain();
    CHECK(b->message_ == u"short" && elmOf(b->text1_.get())->text == u"short" && b->width_ == 100);
    CHECK(b->text1_->x_ == 392 && b->text1_->y_ == 8 && !b->text2_->disp_ && b->pause_ == 29);
    for (int i = 0; i < 40; i++)
        b->onMain();
    CHECK(b->text1_->x_ == 392);
    // a long one scrolls after the pause, and wraps
    elmOf(b->text1_.get())->width = 700;
    g_helpTextMng->setText(id, u"long");
    b->onMain();
    CHECK(b->text2_->disp_ && b->text2_->x_ == 1404 && b->pause_ == 29);
    for (int i = 0; i < 29; i++)
        b->onMain();
    CHECK(b->scroll_ == -1 && b->text1_->x_ == 391);
    b->scroll_ = -1012;
    b->onMain();
    CHECK(b->scroll_ == 0);
    g_helpTextMng->remove(id);
    updateTree(w);
    CHECK(b->hitTest(500, 740) && !b->hitTest(0, 740) && !b->hitTest(500, 768));
    w->calls.clear();
    CHECK(!b->handleMessage(msg(WM_MOUSEMOVE)) && b->handleMessage(msg(WM_LBUTTONDOWN)) && w->calls[0].first == 1);
}

static void checkbox(Win* w) {
    CWindowTaskCheckbox* c = CWindowTaskCheckbox::create(w, w);
    CHECK(c && c->taskName() == "チェックボックス" && c->kind() == 4 && c->w_ == 16 && !c->checked_);
    CHECK(rectIs(el(c->tick_), 16, 0, 16, 16) && !el(c->tick_)->disp_ && el(c->tick_)->pos_.z == 1);
    CHECK(static_cast<CSpriteElm*>(el(c->box_))->texture == "data/common/window/check_01_c00.png");
    w->calls.clear();
    CHECK(c->handleMessage(msg(WM_LBUTTONDOWN)) && c->checked_ && el(c->tick_)->disp_ && w->calls[0].first == 0);
    c->handleMessage(msg(WM_LBUTTONDOWN));
    CHECK(!c->checked_ && el(c->tick_)->isLocked(2));
    c->pos_ = {50, 60, 0};
    updateTree(w);
    CHECK(c->hitTest(58, 68) && !c->hitTest(50, 68) && !c->hitTest(58, 76));
}

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CWindowTaskFactory::create();
    CElement* root = CElement::createRoot();
    auto* w = new Win;
    w->create(root, 0);
    pictureFrame(w);
    text(w);
    switchControl(w);
    scroll(w);
    textApi(w);
    backPlane(w);
    frames(w);
    shadowAndTextSwitch(w);
    textField(w);
    backStripe(w);
    listbox(w);
    activeAndTextlist(w);
    listPieces(w);
    input(w);
    iconArrows(w);
    framePlane(w);
    pictureSwitch(w);
    menubar(w);
    checkbox(w);
    g_windowFactory->destroyAllWindows();
    CHECK(g_windowFactory->controls_.empty());
    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("window_controls_test ok\n");
}
