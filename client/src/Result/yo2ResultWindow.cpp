#include "yo2ResultWindow.h"

#include <cstdio>
#include <string>

#include "System/yo2Debug.h"

namespace {
constexpr uint32_t kPriority = 10000;

// The narrow text widened into a fixed buffer, as the exe does it before handing text to the controls.
struct Wide {
    explicit Wide(const char* s) { yo2WidenInto(s, buf, 0x100); }
    WChar buf[0x100];
};
}  // namespace

// ================================================================ inline helpers emitted into this file
// (CD3DTextTexture::setFont 0x8c8a00 is in yo2TextTextureInline.cpp, where the difftest can link it alone.)

// @yo2 0x008cc960 CWindowTaskShadowText::setShadowColor (inline)
void CWindowTaskShadowText::setShadowColor(float r, float g, float b, float a) { shadow_.get()->setColor(r, g, b, a); }

// @yo2 0x008cc8a0 CWindowTaskShadowText::setShadowOffset (inline): the shadow moves to the text's position + offset
void CWindowTaskShadowText::setShadowOffset(float dx, float dy) {
    offX_ = static_cast<int32_t>(dx);
    offY_ = static_cast<int32_t>(dy);
    shadow_.get()->setPosition(static_cast<float>(x_ + offX_), static_cast<float>(y_ + offY_));
}

// ================================================================ CWindowResult

CWindowResult::CWindowResult() { setTaskName("CResultウィンドウ"); }

// @yo2 0x008c6e00 CWindowResult::~CWindowResult (labelled duel)
// @yo2 0x008c6dd0 CWindowResult deleting destructor (labelled duel)
CWindowResult::~CWindowResult() = default;

// @yo2 0x008c6ae0 CWindowResult::New (labelled duel): the children are made before the window joins the tree
CWindowResult* CWindowResult::newChild(CTask* parent, int32_t side, int32_t kind) {
    auto* w = new CWindowResult;
    w->init(side, kind);
    return dynamic_cast<CWindowResult*>(w->create(parent, kPriority));
}

// @yo2 0x008c6ee0 CWindowResult::init (labelled duel): frame, text and scroll bar; left or right half of the screen
void CWindowResult::init(int32_t side, int32_t kind) {
    side_ = side;
    kind_ = kind;
    base_ = resultBaseNew(this, this, side, kind);
    text_ = CWindowTaskShadowText::newChild(this, this);
    scroll_ = resultScrollNew(this, this, 10);

    x_ = pos_.x = side_ ? 530.0f : 250.0f;
    y_ = pos_.y = 64.0f;
    text_->setSize(216, 576);
    text_->setFontSize(24);
    text_->main()->setLineLimit(kVisibleLines);
    text_->shadow()->setLineLimit(kVisibleLines);
    text_->main()->setColor(1, 1, 1, 1);
    text_->shadow()->setColor(0, 0, 0, 1);
    text_->setPosition(16, 99);
    scroll_->x_ = 222.0f;
    scroll_->y_ = 91.0f;
    scroll_->length_ = 336.0f;
    modal_ = true;
}

// @yo2 0x008c71d0 CWindowResult::onInit: the three numbers
bool CWindowResult::onInit() {
    winNum_.setUser(this);
    winNum_.set(CTextElm::newChild(this, kPriority));
    YO2_ASSERT(winNum_.task() != nullptr, "m_WinNum 失敗");
    winNum_.get()->setInstName("CTextElm::m_WinNum");
    loseNum_.setUser(this);
    loseNum_.set(CTextElm::newChild(this, kPriority));
    YO2_ASSERT(loseNum_.task() != nullptr, "m_LoseNum 失敗");
    loseNum_.get()->setInstName("CTextElm::m_LoseNum");
    scoreNum_.setUser(this);
    scoreNum_.set(CTextElm::newChild(this, kPriority));
    YO2_ASSERT(scoreNum_.task() != nullptr, "m_ScoreNum 失敗");
    scoreNum_.get()->setInstName("CTextElm::m_ScoreNum");
    return true;
}

// @yo2 0x008c8ac0 CWindowResult::onMain
bool CWindowResult::onMain() { return true; }
// @yo2 0x008c6d00 CWindowResult::layout (empty; labelled duel)
void CWindowResult::layout() {}
// @yo2 0x008c6d20 CWindowResult::baseZ (labelled duel)
int32_t CWindowResult::baseZ() { return static_cast<int32_t>(z_ + 5.0f); }
// @yo2 0x008c6d50 CWindowResult: a control was clicked, come to the front (labelled duel)
void CWindowResult::onControlCommand(IWindowTaskColleague*) { bringToFront(); }
// @yo2 0x008c6d70 CWindowResult mediator slot 2 (empty; labelled duel)
void CWindowResult::mediatorSlot2(IWindowTaskColleague*) {}
// @yo2 0x008c6d90 CWindowResult mediator slot 3 (empty; labelled duel)
void CWindowResult::mediatorSlot3(int32_t) {}
// @yo2 0x008c6db0 CWindowResult::beginDrag (empty: the window can't be dragged; labelled duel)
void CWindowResult::beginDrag(IWindowTaskColleague*, int32_t, int32_t) {}

// @yo2 0x008c7a60 CWindowResult::setPlayerName
void CWindowResult::setPlayerName(const char* name) { name_ = name; }

// @yo2 0x008c8a40 CWindowResult::setText: the scroll bar covers the lines past the 13 visible ones
void CWindowResult::setText(const WChar* s) {
    text_->setText(s);
    int32_t lines = text_->main()->lineCount(200.0f);
    scroll_->setMax(lines > kVisibleLines ? lines - kVisibleLines : 0);
}

// @yo2 0x008c8ae0 CWindowResult::onControlEvent: the scroll bar moved, scroll the text with it
void CWindowResult::onControlEvent(IWindowTaskColleague* sender) {
    if (sender != static_cast<IWindowTaskColleague*>(scroll_))
        return;
    int32_t line = scroll_->value_;
    text_->main()->setFirstLine(line);
    text_->shadow()->setFirstLine(line);
}

// One number, right-aligned at x + 210, `dy` below the window's top.
void CWindowResult::placeNumber(CTaskPtr<CTextElm>& num, int32_t value, int32_t dy) {
    char buf[0x100];
    std::snprintf(buf, sizeof buf, "@9%d", value);
    Wide w(buf);
    num.get()->setText(std::u16string(w.buf));
    num.get()->texture().setFont(0, 24);
    int32_t width = num.get()->texture().maxLineWidth();
    int32_t top = static_cast<int32_t>(y_);
    num.get()->pos_.x = static_cast<float>(static_cast<int32_t>(x_) - width + 210);
    num.get()->pos_.y = static_cast<float>(top + dy);
    num.get()->pos_.z = static_cast<float>(baseZ() + 100);
}

// @yo2 0x008c7c40 CWindowResult::refresh: name and captions, then the numbers beside the captions
void CWindowResult::refresh() {
    char buf[0x100];
    std::snprintf(buf, sizeof buf, "%s\n\nWIN\n\nLOSE\n\nSCORE\n", name_.c_str());
    Wide w(buf);
    setText(w.buf);
    layout();
    placeNumber(winNum_, wins_, 168);
    placeNumber(loseNum_, loses_, 216);
    placeNumber(scoreNum_, score_, 264);
}

struct CWindowResult::Layout {
    YO2_AT(CWindowResult, base_, 0x398);
    YO2_AT(CWindowResult, text_, 0x3a0);
    YO2_AT(CWindowResult, scroll_, 0x3a4);
    YO2_AT(CWindowResult, winNum_, 0x3a8);
    YO2_AT(CWindowResult, loseNum_, 0x3b4);
    YO2_AT(CWindowResult, scoreNum_, 0x3c0);
    YO2_AT(CWindowResult, kind_, 0x3cc);
    YO2_AT(CWindowResult, side_, 0x3d0);
    YO2_AT(CWindowResult, name_, 0x3d4);
    YO2_AT(CWindowResult, wins_, 0x3e4);
    YO2_AT(CWindowResult, score_, 0x3ec);
};

// ================================================================ CWindowTaskResultNext

CWindowTaskResultNext::CWindowTaskResultNext() { setTaskName("『次へ』ボタン(コントロール)"); }

// @yo2 0x008c8d60 CWindowTaskResultNext::~CWindowTaskResultNext
// @yo2 0x008c8d30 CWindowTaskResultNext deleting destructor
CWindowTaskResultNext::~CWindowTaskResultNext() = default;

// @yo2 0x008c8b50 CWindowTaskResultNext::New
CWindowTaskResultNext* CWindowTaskResultNext::newChild(CTask* parent, IWindowTaskMediator* mediator) {
    auto* b = new CWindowTaskResultNext;
    auto* made = dynamic_cast<CWindowTaskResultNext*>(b->create(parent, kPriority));
    made->mediator_ = mediator;
    return made;
}

// @yo2 0x008c8e90 CWindowTaskResultNext::loadImages: the result screen's button skin (result_btn_01.png)
void CWindowTaskResultNext::loadImages() {
    static const Piece kPieces[9] = {
        {8, 8, {{0, 0}, {24, 0}, {48, 0}, {48, 0}, {48, 0}}},
        {8, 8, {{8, 0}, {32, 0}, {56, 0}, {56, 0}, {56, 0}}},
        {8, 8, {{16, 0}, {40, 0}, {64, 0}, {88, 0}, {112, 0}}},
        {8, 38, {{0, 8}, {24, 8}, {48, 8}, {48, 8}, {48, 8}}},
        {8, 38, {{8, 8}, {32, 8}, {56, 8}, {80, 8}, {104, 8}}},
        {8, 38, {{16, 8}, {40, 8}, {64, 8}, {88, 8}, {112, 8}}},
        {8, 8, {{0, 46}, {24, 46}, {48, 46}, {72, 46}, {96, 46}}},
        {8, 8, {{8, 46}, {32, 46}, {56, 46}, {80, 46}, {104, 46}}},
        {8, 8, {{16, 46}, {40, 46}, {64, 46}, {88, 46}, {112, 46}}},
    };
    vc6::string dir = "data/result/";
    vc6::string file = "result_btn_01.png";
    vc6::string path = dir;
    path += std::string_view(file);
    for (int i : {0, 1, 2, 3, 8, 4, 5, 6, 7})  // the exe's order: the centre comes fifth
        sprites_[i].get()->setTexture(path);
    for (int i = 0; i < 9; ++i)
        pieces_[i] = kPieces[i];
}

// ================================================================ CWindowResultNpc

CWindowResultNpc::CWindowResultNpc() { setTaskName("CResultウィンドウ"); }

// @yo2 0x008ca240 CWindowResultNpc::~CWindowResultNpc
// @yo2 0x008ca1f0 CWindowResultNpc deleting destructor
CWindowResultNpc::~CWindowResultNpc() = default;

// @yo2 0x008c9ea0 CWindowResultNpc::New
CWindowResultNpc* CWindowResultNpc::newChild(CTask* parent) {
    auto* w = new CWindowResultNpc;
    return dynamic_cast<CWindowResultNpc*>(w->create(parent, kPriority));
}

// @yo2 0x008cc9a0 CWindowResultNpc::onMain
bool CWindowResultNpc::onMain() { return true; }
// @yo2 0x008ca120 CWindowResultNpc::layout (empty)
void CWindowResultNpc::layout() {}
// @yo2 0x008ca140 CWindowResultNpc::baseZ
int32_t CWindowResultNpc::baseZ() { return static_cast<int32_t>(z_ + 5.0f); }
// @yo2 0x008ccca0 CWindowResultNpc::onControlEvent (empty)
void CWindowResultNpc::onControlEvent(IWindowTaskColleague*) {}
// @yo2 0x008ca170 CWindowResultNpc: a control was clicked, come to the front
void CWindowResultNpc::onControlCommand(IWindowTaskColleague*) { bringToFront(); }
// @yo2 0x008ca190 CWindowResultNpc mediator slot 2 (empty)
void CWindowResultNpc::mediatorSlot2(IWindowTaskColleague*) {}
// @yo2 0x008ca1b0 CWindowResultNpc mediator slot 3 (empty)
void CWindowResultNpc::mediatorSlot3(int32_t) {}
// @yo2 0x008ca1d0 CWindowResultNpc::beginDrag (empty: the window can't be dragged)
void CWindowResultNpc::beginDrag(IWindowTaskColleague*, int32_t, int32_t) {}

// A white text with a black shadow one pixel down-right, in the 432 x 328 box at x 282.
CWindowTaskShadowText* CWindowResultNpc::makeText(CTaskPtr<CWindowTaskShadowText>& ptr, const char* name, float y,
                                                  int32_t align) {
    ptr.setUser(this);
    ptr.set(CWindowTaskShadowText::newChild(this, this));
    windowNameTask(ptr.get(), name);
    CWindowTaskShadowText* t = ptr.get();
    t->inheritTransform_ = true;
    t->setFontSize(24);
    t->setPosition(282, y);
    t->setAlign(align);
    t->setSize(432, 328);
    t->shadow()->show();
    t->setColor(1, 1, 1, 1);
    t->setShadowColor(0, 0, 0, 1);
    t->setShadowOffset(1, 1);
    t->baseZ_ = 10.0f;
    t->pos_.z = 10.0f;
    return t;
}

// @yo2 0x008ca380 CWindowResultNpc::onInit: board, title, the player's name, the three captions and counts
bool CWindowResultNpc::onInit() {
    wins_ = loses_ = draws_ = 0;

    board_.setUser(this);
    board_.set(CSpriteElm::newChild(this, kPriority));
    windowNameTask(board_.get(), "NPCリザルトウィンドウ土台");
    board_.get()->inheritTransform_ = true;
    board_.get()->setTexture("data/result/npc_result_dai_01_c01.png");
    board_.get()->pos_ = {250, 64, 0};

    title_.setUser(this);
    title_.set(CSpriteElm::newChild(this, kPriority));
    windowNameTask(title_.get(), "NPCリザルトウィンドウ");
    title_.get()->inheritTransform_ = true;
    title_.get()->setTexture("data/result/npc_result_title_01_?.png");  // '?' = the language code
    title_.get()->pos_ = {274, 75, 5};

    makeText(name_, "NPCリザルトウィンドウプレイヤー名", 158, 1);
    makeText(winCaption_, "NPCリザルトウィンドウ『WIN』", 182, 0)->setText(u"W");
    // the remaining five reuse the player-name instance name (copied in the original)
    makeText(loseCaption_, "NPCリザルトウィンドウプレイヤー名", 230, 0)->setText(u"LOSE");
    makeText(drawCaption_, "NPCリザルトウィンドウプレイヤー名", 278, 0)->setText(u"DRAW");
    makeText(winCount_, "NPCリザルトウィンドウプレイヤー名", 206, 2);
    makeText(loseCount_, "NPCリザルトウィンドウプレイヤー名", 254, 2);
    makeText(drawCount_, "NPCリザルトウィンドウプレイヤー名", 302, 2);

    modal_ = true;
    refresh();
    return true;
}

// @yo2 0x008cc9c0 CWindowResultNpc::setPlayerName
void CWindowResultNpc::setPlayerName(const char* name) {
    playerName_ = name;
    name_.get()->setTextA(playerName_.c_str());
}

// @yo2 0x008ccad0 CWindowResultNpc::setWins
void CWindowResultNpc::setWins(int32_t n) {
    wins_ = n;
    winCount_.get()->setText(yo2FormatW(u"%d", wins_));
}

// @yo2 0x008ccb20 CWindowResultNpc::setLoses
void CWindowResultNpc::setLoses(int32_t n) {
    loses_ = n;
    loseCount_.get()->setText(yo2FormatW(u"%d", loses_));
}

// @yo2 0x008ccb70 CWindowResultNpc::setDraws
void CWindowResultNpc::setDraws(int32_t n) {
    draws_ = n;
    drawCount_.get()->setText(yo2FormatW(u"%d", draws_));
}

// @yo2 0x008ccbc0 CWindowResultNpc::refresh
void CWindowResultNpc::refresh() {
    name_.get()->setTextA(playerName_.c_str());
    winCount_.get()->setText(yo2FormatW(u"%d", wins_));
    loseCount_.get()->setText(yo2FormatW(u"%d", loses_));
    drawCount_.get()->setText(yo2FormatW(u"%d", draws_));
}

struct CWindowResultNpc::Layout {
    YO2_AT(CWindowResultNpc, board_, 0x398);
    YO2_AT(CWindowResultNpc, title_, 0x3a4);
    YO2_AT(CWindowResultNpc, name_, 0x3b0);
    YO2_AT(CWindowResultNpc, winCaption_, 0x3bc);
    YO2_AT(CWindowResultNpc, drawCaption_, 0x3d4);
    YO2_AT(CWindowResultNpc, winCount_, 0x3e0);
    YO2_AT(CWindowResultNpc, drawCount_, 0x3f8);
    YO2_AT(CWindowResultNpc, scroll_, 0x404);
    YO2_AT(CWindowResultNpc, playerName_, 0x410);
    YO2_AT(CWindowResultNpc, wins_, 0x420);
    YO2_AT(CWindowResultNpc, draws_, 0x428);
};
