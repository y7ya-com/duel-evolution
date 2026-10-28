// src/Result: the result windows over the recording UI fakes. Covers every function in yo2ResultWindow.cpp:
//   inline helpers: CD3DTextTexture::setFont 0x8c8a00, CWindowTaskShadowText::setShadowColor 0x8cc960 /
//                   setShadowOffset 0x8cc8a0
//   CWindowResult:  New 0x8c6ae0, init 0x8c6ee0, ~ 0x8c6e00/0x8c6dd0, onInit 0x8c71d0, onMain 0x8c8ac0,
//                   layout 0x8c6d00, baseZ 0x8c6d20, mediator slots 0x8c8ae0 0x8c6d50 0x8c6d70 0x8c6d90 0x8c6db0,
//                   setPlayerName 0x8c7a60, setText 0x8c8a40, refresh 0x8c7c40
//   CWindowTaskResultNext: New 0x8c8b50, ~ 0x8c8d60/0x8c8d30, loadImages 0x8c8e90
//   CWindowResultNpc: New 0x8c9ea0, ~ 0x8ca240/0x8ca1f0, onInit 0x8ca380, onMain 0x8cc9a0, layout 0x8ca120,
//                   baseZ 0x8ca140, mediator slots 0x8ccca0 0x8ca170 0x8ca190 0x8ca1b0 0x8ca1d0,
//                   setPlayerName 0x8cc9c0, setWins/Loses/Draws 0x8ccad0/0x8ccb20/0x8ccb70, refresh 0x8ccbc0
#include <cassert>
#include <cstdio>
#include <cstring>

#include "Result/yo2ResultWindow.h"
#include "System/yo2ZSort.h"
#include "ui_fakes.h"

namespace {
bool at(const Vec3& v, float x, float y, float z) { return v.x == x && v.y == y && v.z == z; }
bool rgba(const FakeText& t, float r, float g, float b, float a) {
    return t.color[0] == r && t.color[1] == g && t.color[2] == b && t.color[3] == a;
}

void testSetFont() {
    CD3DTextTextureView t{};
    t.curWidth_ = 0;
    t.curHeight_ = 24;
    t.setFont(0, 24);  // the size it was rendered with: only the outline is flagged
    assert(t.fontWidth_ == 0 && t.fontHeight_ == 24 && t.outlineDirty_ && !t.dirty_);
    t.setFont(0, 16);  // a new size: re-render too
    assert(t.fontHeight_ == 16 && t.dirty_);
    t.dirty_ = false;
    t.setFont(3, 24);
    assert(t.fontWidth_ == 3 && t.dirty_);
}

void testResult(CTask* root) {
    auto* w = CWindowResult::newChild(root, 1, 7);
    assert(w && w->taskName() == "CResultウィンドウ" && w->parent() == root);

    // init: frame, text, scroll bar; the right-hand window
    auto* base = dynamic_cast<FakeControl*>(w->base_);
    assert(base && base->side == 1 && base->kind == 7 && base->mediator_ == w && base->parent() == w);
    assert(w->side_ == 1 && w->kind_ == 7);
    assert(w->x_ == 530 && w->pos_.x == 530 && w->y_ == 64 && w->pos_.y == 64 && w->modal_);
    CWindowTaskShadowText* text = w->text_;
    assert(text && text->mediator_ == w && text->parent() == w);
    for (CWindowTaskText* t : {text->main(), text->shadow()}) {
        assert(fakeText(t).w == 216 && fakeText(t).h == 576 && t->fontSize_ == 24 && fakeText(t).lineLimit == 13);
        assert(t->x_ == 16 && t->y_ == 99);
    }
    assert(rgba(fakeText(text->main()), 1, 1, 1, 1) && rgba(fakeText(text->shadow()), 0, 0, 0, 1));
    auto* scroll = dynamic_cast<FakeScroll*>(w->scroll_);
    assert(scroll && scroll->max_ == 10 && scroll->mediator_ == w);
    assert(scroll->x_ == 222 && scroll->y_ == 91 && scroll->length_ == 336);

    // onInit: the three numbers
    assert(w->winNum_.get()->instName() == "CTextElm::m_WinNum" && w->winNum_.get()->parent() == w);
    assert(w->loseNum_.get()->instName() == "CTextElm::m_LoseNum");
    assert(w->scoreNum_.get()->instName() == "CTextElm::m_ScoreNum");
    assert(w->onMain() && w->baseZ() == 5);
    w->z_ = 51003;
    assert(w->baseZ() == 51008);

    // refresh: the text, then the numbers right-aligned at x + 210 beside the captions
    w->setPlayerName("Yugi");
    assert(w->name_ == "Yugi");
    w->setRecord(3, 12, 150);
    w->refresh();
    assert(fakeText(text->main()).text == u"Yugi\n\nWIN\n\nLOSE\n\nSCORE\n");
    assert(fakeText(text->shadow()).text == fakeText(text->main()).text);
    assert(scroll->max_ == 0);  // 8 lines fit
    struct {
        CTaskPtr<CTextElm>& num;
        const char16_t* text;
        float y;
    } nums[] = {{w->winNum_, u"@93", 64 + 168}, {w->loseNum_, u"@912", 64 + 216}, {w->scoreNum_, u"@9150", 64 + 264}};
    for (auto& n : nums) {
        CTextElm* e = n.num.get();
        assert(fakeText(e).text == n.text);
        float width = static_cast<float>(fakeText(e).text.size() * g_textWidthPerChar);
        assert(at(e->pos_, 530 - width + 210, n.y, 51008 + 100));
        assert(e->texture().fontHeight_ == 24 && e->texture().fontWidth_ == 0 && e->texture().outlineDirty_);
    }

    // setText: past 13 lines the scroll bar gets the rest
    std::u16string many;
    for (int i = 0; i < 19; ++i)
        many += u"line\n";
    w->setText(many.c_str());  // 20 lines
    assert(scroll->max_ == 7 && fakeText(text->main()).text == many);

    // the scroll bar scrolls both texts; other senders are ignored
    scroll->value_ = 4;
    w->onControlEvent(base);
    assert(fakeText(text->main()).firstLine == 0);
    w->onControlEvent(scroll);
    assert(fakeText(text->main()).firstLine == 4 && fakeText(text->shadow()).firstLine == 4);
    int front = g_bringToFront;
    w->onControlCommand(scroll);
    assert(g_bringToFront == front + 1);
    w->beginDrag(scroll, 1, 2);
    w->mediatorSlot2(scroll);
    w->mediatorSlot3(0);
    assert(!w->dragging_);

    // the left-hand window
    auto* left = CWindowResult::newChild(root, 0, 0);
    assert(left->x_ == 250 && left->pos_.x == 250);
    left->destroy(__FILE__, __LINE__);
    w->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("CWindowResult: ok\n");
}

void testNext(CTask* root, IWindowTaskMediator* owner) {
    auto* b = CWindowTaskResultNext::newChild(root, owner);
    assert(b && b->mediator_ == owner && b->taskName() == "『次へ』ボタン(コントロール)");
    for (auto& s : b->sprites_) {
        s.setUser(b);
        s.set(CSpriteElm::newChild(b, 1));
    }
    b->loadImages();
    for (auto& s : b->sprites_)
        assert(g_spriteTextures.at(s.get()) == "data/result/result_btn_01.png");
    const CWindowTaskSwitch::Piece& tl = b->pieces_[0];
    assert(tl.w == 8 && tl.h == 8 && tl.uv[1][0] == 24 && tl.uv[4][0] == 48);
    const CWindowTaskSwitch::Piece& mid = b->pieces_[4];
    assert(mid.w == 8 && mid.h == 38 && mid.uv[0][0] == 8 && mid.uv[0][1] == 8 && mid.uv[4][0] == 104);
    const CWindowTaskSwitch::Piece& br = b->pieces_[8];
    assert(br.uv[0][0] == 16 && br.uv[0][1] == 46 && br.uv[4][0] == 112 && br.uv[4][1] == 46);
    b->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("CWindowTaskResultNext: ok\n");
}

void testNpc(CTask* root) {
    auto* w = CWindowResultNpc::newChild(root);
    assert(w && w->taskName() == "CResultウィンドウ" && w->modal_);
    CSpriteElm* board = w->board_.get();
    CSpriteElm* title = w->title_.get();
    assert(board->instName() == "NPCリザルトウィンドウ土台" && board->inheritTransform_ && at(board->pos_, 250, 64, 0));
    assert(g_spriteTextures.at(board) == "data/result/npc_result_dai_01_c01.png");
    assert(title->instName() == "NPCリザルトウィンドウ" && at(title->pos_, 274, 75, 5));
    assert(g_spriteTextures.at(title) == "data/result/npc_result_title_01_?.png");

    struct {
        CTaskPtr<CWindowTaskShadowText>& ptr;
        float y;
        int32_t align;
        const char16_t* text;
    } texts[] = {
        {w->name_, 158, 1, u""},      {w->winCaption_, 182, 0, u"W"}, {w->loseCaption_, 230, 0, u"LOSE"},
        {w->drawCaption_, 278, 0, u"DRAW"}, {w->winCount_, 206, 2, u"0"},  {w->loseCount_, 254, 2, u"0"},
        {w->drawCount_, 302, 2, u"0"},
    };
    for (auto& t : texts) {
        CWindowTaskShadowText* s = t.ptr.get();
        assert(s->parent() == w && s->mediator_ == w && s->inheritTransform_);
        assert(s->x_ == 282 && s->y_ == t.y && s->offX_ == 1 && s->offY_ == 1);
        assert(s->main()->x_ == 282 && s->main()->y_ == t.y);
        assert(s->shadow()->x_ == 283 && s->shadow()->y_ == t.y + 1);
        assert(fakeText(s->main()).align == t.align && fakeText(s->shadow()).align == t.align);
        assert(fakeText(s->main()).w == 432 && fakeText(s->main()).h == 328 && s->main()->fontSize_ == 24);
        assert(rgba(fakeText(s->main()), 1, 1, 1, 1) && rgba(fakeText(s->shadow()), 0, 0, 0, 1));
        assert(fakeText(s->shadow()).shown && s->baseZ_ == 10 && s->pos_.z == 10);
        assert(fakeText(s->main()).text == t.text && fakeText(s->shadow()).text == t.text);
    }
    assert(w->name_.get()->instName() == "NPCリザルトウィンドウプレイヤー名");
    assert(w->winCaption_.get()->instName() == "NPCリザルトウィンドウ『WIN』");

    w->setPlayerName("Kaiba");
    w->setWins(5);
    w->setLoses(12);
    w->setDraws(1);
    assert(fakeText(w->name_.get()->main()).text == u"Kaiba" && w->playerName_ == "Kaiba");
    assert(fakeText(w->winCount_.get()->main()).text == u"5" && w->wins_ == 5);
    assert(fakeText(w->loseCount_.get()->main()).text == u"12" && w->loses_ == 12);
    assert(fakeText(w->drawCount_.get()->shadow()).text == u"1" && w->draws_ == 1);
    w->wins_ = 7;
    w->refresh();
    assert(fakeText(w->winCount_.get()->main()).text == u"7");

    assert(w->onMain() && w->baseZ() == 5);
    w->layout();
    int front = g_bringToFront;
    w->onControlCommand(nullptr);
    assert(g_bringToFront == front + 1);
    w->onControlEvent(nullptr);
    w->mediatorSlot2(nullptr);
    w->mediatorSlot3(0);
    w->beginDrag(nullptr, 1, 2);
    assert(!w->dragging_);
    w->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    std::printf("CWindowResultNpc: ok\n");
}
}  // namespace

int main() {
    CZSortSet layers;
    g_zsortSet = &layers;
    CElement* root = CElement::createRoot();
    testSetFont();
    testResult(root);
    auto* owner = CWindowResultNpc::newChild(root);
    testNext(root, owner);
    owner->destroy(__FILE__, __LINE__);
    testNpc(root);
    CTask::flushDeleted();
    return 0;
}
