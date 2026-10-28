#include "System/window/yo2WindowControls.h"

#include <cstring>

#include <windows.h>   // GetAsyncKeyState, GetKeyState (platform/win32 off Windows)

#include "System/yo2Debug.h"

namespace {

bool leftButtonHeld() { return (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0; }

// 0x006054c0 into a 0x200-character buffer: windowWiden, at most 0x1ff characters.
vc6::wstring widen(const char* s) {
    vc6::wstring w = windowWiden(s);
    if (w.size() > 0x1ff)
        w.assign(w.c_str(), 0x1ff);
    return w;
}

// TODO(System): 0x006056b0 narrows with the UI code page; byte by byte, the inverse of windowWiden, until then.
vc6::string narrow(const WChar* s) {
    std::string n;
    for (; s && *s && n.size() < 0x1ff; s++)
        n += static_cast<char>(*s);
    return vc6::string(n);
}

// TODO(System): CTask has no public way to set another task's lock flags (CTask::lockFlags_, 0x20); the exe writes
// the field directly (bit 2: no TM_MAIN while hidden). Same workaround as yo2WindowTask.cpp.
struct TaskFlags : CTask {
    static uint32_t& of(CTask* t) { return t->*(&TaskFlags::lockFlags_); }
};

// setDisp, and bit 2 of the lock flags (no TM_MAIN while hidden)
void showElement(CElement* e, bool on, bool propagate) {
    e->setDisp(on, propagate);
    if (on)
        TaskFlags::of(e) &= ~2u;
    else
        TaskFlags::of(e) |= 2u;
}

void setRect(CElement* e, int32_t u, int32_t v, int32_t w, int32_t h) {
    e->rect_[0] = u;
    e->rect_[1] = v;
    e->rect_[2] = w;
    e->rect_[3] = h;
}

}  // namespace

CElement* windowElement(const CTaskPtrBase& p) {
    CElement* e = dynamic_cast<CElement*>(p.task());
    if (CTask::isValid(e))
        return e;
    YO2_ASSERT(p.task() != nullptr, "NULL access\n");
    YO2_ASSERT(p.task() == nullptr, "Wild Task\n");
    return nullptr;
}

// @yo2 0x005a27a0 windowNameTask (CWindowTask.h)
void windowNameTask(CTask* task, const char* name) {
    YO2_ASSERT(task != nullptr, "%s", name);
    task->setInstName(name);
}

// @yo2 0x005a2510 CWindowTaskFactory::dataDir (CWindowTask.h)
vc6::string windowDataDir() { return g_windowFactory->dataDir_; }

// =====================================================================================================================
// CWindowTaskPictureFrame

// @yo2 0x005a8d80 CWindowTaskPictureFrame::CWindowTaskPictureFrame
CWindowTaskPictureFrame::CWindowTaskPictureFrame() {
    setTaskName("絵を差し替える背景CWindowTaskPictureFrame(コントロール)");
}

// @yo2 0x005a9040 CWindowTaskPictureFrame::~CWindowTaskPictureFrame
// @yo2 0x005a9010 CWindowTaskPictureFrame deleting destructor
CWindowTaskPictureFrame::~CWindowTaskPictureFrame() = default;

// @yo2 0x005a9950 CWindowTaskPictureFrame::hitTest (strictly inside, enabled only)
bool CWindowTaskPictureFrame::hitTest(float x, float y) {
    if (!enabled_)
        return false;
    float x0 = static_cast<float>(static_cast<int32_t>(worldTranslation().x));
    float y0 = static_cast<float>(static_cast<int32_t>(worldTranslation().y));
    return x > x0 && x < x0 + w_ && y > y0 && y < y0 + h_;
}

// @yo2 0x005a9a20 CWindowTaskPictureFrame::handleMessage: a left click grabs the window
bool CWindowTaskPictureFrame::handleMessage(WindowMsg m) {
    if (m.msg == 0x201) {   // WM_LBUTTONDOWN
        mediator_->onControlCommand(this);
        mediator_->beginDrag(this, m.x, m.y);
    }
    return true;
}

// =====================================================================================================================
// CWindowTaskText

// @yo2 0x005aeb20 CWindowTaskText::CWindowTaskText
CWindowTaskText::CWindowTaskText() { setTaskName("テキスト(コントロール)"); }

// @yo2 0x005aea60 CWindowTaskText::create
CWindowTaskText* CWindowTaskText::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* t = new CWindowTaskText;
    t->mediator_ = mediator;
    return dynamic_cast<CWindowTaskText*>(t->CTask::create(parent, 10000));
}

// @yo2 0x005aee60 CWindowTaskText::~CWindowTaskText
// @yo2 0x005aee30 CWindowTaskText deleting destructor
CWindowTaskText::~CWindowTaskText() = default;

// @yo2 0x005aedb0 CWindowTaskText::setMediator
void CWindowTaskText::setMediator(IWindowTaskMediator* m) { mediator_ = m; }

// @yo2 0x005aedd0 CWindowTaskText::kind
uint32_t CWindowTaskText::kind() const { return 0x16; }

// @yo2 0x005aecc0 CWindowTaskText::layout (empty)
void CWindowTaskText::layout() {}

// @yo2 0x005aedf0 CWindowTaskText::hitTest (text never takes the mouse)
bool CWindowTaskText::hitTest(float, float) { return false; }

// @yo2 0x005aefe0 CWindowTaskText::onMain: re-apply its alpha
bool CWindowTaskText::onMain() {
    setAlpha(alpha_);
    return true;
}

// @yo2 0x005aece0 CWindowTaskText::setName: the displayed text, widened
void CWindowTaskText::setName(const vc6::string& s) { setText(widen(s.c_str()).c_str()); }

// @yo2 0x005af350 CWindowTaskText::setTextA
void CWindowTaskText::setTextA(const char* s) { setText(widen(s).c_str()); }

// @yo2 0x005aeed0 CWindowTaskText::onInit: the CTextElm, white, 16 pixels
bool CWindowTaskText::onInit() {
    x_ = y_ = posZ_ = 0;
    inheritTransform_ = true;
    pos_.z = 0;
    text_.setUser(this);
    windowTextElmCreate(text_, this, 10000);
    windowNameTask(windowElement(text_), "CWindowTaskTextのテキスト");
    windowElement(text_)->inheritTransform_ = true;
    windowElement(text_)->pos_.z = 0;
    setFontSize(16);
    setLineGap(0);
    setColor(1, 1, 1, 1);
    windowTextElmSetUnk748(text_, true);
    alpha_ = 1;
    return true;
}

// @yo2 0x005af000 CWindowTaskText::setText
void CWindowTaskText::setText(const WChar* s) {
    windowTextElmSetText(text_, vc6::wstring(s));
    name_ = narrow(s);
}

// @yo2 0x005af590 CWindowTaskText::setFontSize (the CTextElm re-lays out when the size changes)
void CWindowTaskText::setFontSize(int32_t size) {
    fontSize_ = size;
    windowTextElmSetFontSize(text_, size);
}

// @yo2 0x005af600 CWindowTaskText::setLineGap
void CWindowTaskText::setLineGap(int32_t gap) {
    lineGap_ = gap;
    windowTextElmSetLineGap(text_, gap);
}

// @yo2 0x005af650 CWindowTaskText::setColor
void CWindowTaskText::setColor(float r, float g, float b, float a) {
    CElement* e = windowElement(text_);
    e->color_[0] = r;
    e->color_[1] = g;
    e->color_[2] = b;
    e->color_[3] = a;
}

// @yo2 0x005af690 CWindowTaskText::setArea
void CWindowTaskText::setArea(int32_t w, int32_t h) {
    CElement* e = windowElement(text_);
    e->rect_[2] = w;
    e->rect_[3] = h;
    windowTextElmSetBox(text_, float(w), float(h));
}

// @yo2 0x005af8a0 CWindowTaskText::setAlign
void CWindowTaskText::setAlign(int32_t align) { windowTextElmSetAlign(text_, align); }
// @yo2 0x005af8d0 CWindowTaskText::align
int32_t CWindowTaskText::align() const { return windowTextElmAlign(text_); }
// @yo2 0x005af3d0 CWindowTaskText::setFirstLine
void CWindowTaskText::setFirstLine(int32_t line) { windowTextElmSetFirstLine(text_, line); }
// @yo2 0x005af7d0 CWindowTaskText::firstLine
int32_t CWindowTaskText::firstLine() const { return windowTextElmFirstLine(text_); }
// @yo2 0x005af3a0 CWindowTaskText::setPageLines
void CWindowTaskText::setPageLines(int32_t lines) { windowTextElmSetPageLines(text_, lines); }
// @yo2 0x005af800 CWindowTaskText::pageLines
int32_t CWindowTaskText::pageLines() const { return windowTextElmPageLines(text_); }

// @yo2 0x005af930 CWindowTaskText::setField430
void CWindowTaskText::setField430(int32_t v) { windowTextElmSetField430(text_, v); }

// @yo2 0x005af6e0 CWindowTaskText::width
int32_t CWindowTaskText::width() const { return windowTextElmWidth(text_); }

// @yo2 0x005af750 CWindowTaskText::lineCount (laid out at `width`)
int32_t CWindowTaskText::lineCount(float width) const { return windowTextElmLineCount(text_, width); }

// @yo2 0x005af970 CWindowTaskText::linesFrom
int32_t CWindowTaskText::linesFrom(int32_t line, float height) const {
    return windowTextElmLinesFrom(text_, line, height);
}

// @yo2 0x005baeb0 CWindowTaskText::setPos (z stays posZ_)
void CWindowTaskText::setPos(float x, float y) {
    x_ = x;
    y_ = y;
    pos_ = {x, y, posZ_};
}

// =====================================================================================================================
// CWindowTaskSwitch

namespace {
// sprites_[k] shows piece kGrid[k] (sprites_ ends with the centre, the pieces table is in grid order)
constexpr int kGrid[9] = {0, 1, 2, 3, 5, 6, 7, 8, 4};
const char* const kSwitchNames[9] = {
    "CWindowTaskSwitchの左上画像",   "CWindowTaskSwitchの中央上画像", "CWindowTaskSwitchの右上画像",
    "CWindowTaskSwitchの左中央画像", "CWindowTaskSwitchの右中央画像", "CWindowTaskSwitchの左下画像",
    "CWindowTaskSwitchの中央下画像", "CWindowTaskSwitchの右下画像",   "CWindowTaskSwitchの中央画像",
};
}  // namespace

// @yo2 0x005b6b50 CWindowTaskSwitch::CWindowTaskSwitch
CWindowTaskSwitch::CWindowTaskSwitch() { setTaskName("スイッチ(コントロール)"); }

// @yo2 0x005b6e80 CWindowTaskSwitch::~CWindowTaskSwitch
// @yo2 0x005b6e50 CWindowTaskSwitch deleting destructor
CWindowTaskSwitch::~CWindowTaskSwitch() = default;

// @yo2 0x005b6df0 CWindowTaskSwitch::kind
uint32_t CWindowTaskSwitch::kind() const { return 0xf; }

// @yo2 0x005b6f90 CWindowTaskSwitch::onInit: nine blended sprites, 80 x 24, normal look
bool CWindowTaskSwitch::onInit() {
    z_ = 0;
    x_ = y_ = 0;
    w_ = 80;
    h_ = 24;
    inheritTransform_ = true;
    setDrawMode(BLEND);
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        s.setUser(this);
    for (int k = 0; k < 9; k++) {
        windowSpriteCreate(sprites_[k], this, 10000);
        CElement* e = windowElement(sprites_[k]);
        windowNameTask(e, kSwitchNames[k]);
        e->setDrawMode(BLEND);
        e->inheritTransform_ = true;
    }
    loadImages();
    state_ = NORMAL;
    checked_ = false;
    setLook(0);
    CWindowTaskSwitch::layout();   // (not virtual in the exe: the text switch's caption doesn't exist yet)
    return true;
}

// @yo2 0x005b74e0 CWindowTaskSwitch::loadImages: swich_01_c00.png, 8 x 8 pieces, one 24 x 24 column per look
void CWindowTaskSwitch::loadImages() {
    vc6::string path = windowDataDir();
    path += "swich_01_c00.png";
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        windowSpriteTexture(s, path);
    for (int g = 0; g < 9; g++) {
        Piece& p = pieces_[g];
        p.w = p.h = 8;
        for (int k = 0; k < 5; k++) {
            p.uv[k][0] = (g % 3) * 8 + k * 24;
            p.uv[k][1] = (g / 3) * 8;
        }
    }
}

// @yo2 0x005b8940 CWindowTaskSwitch::setLook (3 changes nothing)
void CWindowTaskSwitch::setLook(int32_t look) {
    if (look < 0 || look > 5 || look == 3)
        return;
    int slot = look < 3 ? look : look - 1;
    for (int k = 0; k < 9; k++) {
        const Piece& p = pieces_[kGrid[k]];
        setRect(windowElement(sprites_[k]), p.uv[slot][0], p.uv[slot][1], p.w, p.h);
    }
}

// @yo2 0x005b9ae0 CWindowTaskSwitch::layout: corners fixed, edges and centre stretched to w_ x h_
void CWindowTaskSwitch::layout() {
    pos_ = {x_, y_, z_};
    const Piece* p = pieces_;   // TL 0, T 1, TR 2, L 3, C 4, R 5, BL 6, B 7, BR 8
    auto at = [&](int k, float x, float y) { windowElement(sprites_[k])->pos_ = {x, y, 0}; };
    at(0, 0, 0);
    at(1, float(p[0].w), 0);
    windowElement(sprites_[1])->scale_.x = (w_ - float(p[2].w + p[0].w)) / float(p[1].w);
    at(2, w_ - float(p[2].w), 0);
    at(3, 0, float(p[0].h));
    windowElement(sprites_[3])->scale_.y = (h_ - float(p[6].h + p[0].h)) / float(p[3].h);
    at(4, w_ - float(p[5].w), float(p[2].h));
    windowElement(sprites_[4])->scale_.y = (h_ - float(p[8].h + p[2].h)) / float(p[5].h);
    at(5, 0, h_ - float(p[6].h));
    at(6, float(p[6].w), h_ - float(p[7].h));
    windowElement(sprites_[6])->scale_.x = (w_ - float(p[6].w + p[8].w)) / float(p[7].w);
    at(7, w_ - float(p[8].w), h_ - float(p[8].h));
    at(8, float(p[3].w), float(p[1].h));
    windowElement(sprites_[8])->scale_.x = (w_ - float(p[6].w + p[8].w)) / float(p[4].w);
    windowElement(sprites_[8])->scale_.y = (h_ - float(p[8].h + p[2].h)) / float(p[4].h);
}

// @yo2 0x005b84f0 CWindowTaskSwitch::hit (game pixels, strictly inside, enabled only)
bool CWindowTaskSwitch::hit(int32_t x, int32_t y) const {
    if (!enabled_)
        return false;
    int32_t x0 = static_cast<int32_t>(worldTranslation().x);
    int32_t y0 = static_cast<int32_t>(worldTranslation().y);
    return x0 < x && float(x) < float(x0) + w_ && y0 < y && float(y) < float(y0) + h_;
}

// @yo2 0x005b6e10 CWindowTaskSwitch::hitTest
bool CWindowTaskSwitch::hitTest(float x, float y) { return hit(static_cast<int32_t>(x), static_cast<int32_t>(y)); }

// @yo2 0x005b85c0 CWindowTaskSwitch::click: tell the window (mediator slot 0)
void CWindowTaskSwitch::click() { mediator_->onControlEvent(this); }

// @yo2 0x005b8600 CWindowTaskSwitch::onMain: hover / press tracking from the polled mouse
bool CWindowTaskSwitch::onMain() {
    setLook(0);
    if (!enabled_)
        return true;
    bool held = leftButtonHeld();
    int32_t mx, my;
    windowMouse(&mx, &my);
    switch (state_) {
    case NORMAL:
        setLook(checked_ ? 4 : 0);
        if (hit(mx, my))
            state_ = HOVER;
        break;
    case HOVER:
        setLook(checked_ ? 5 : 1);
        if (!hit(mx, my))
            state_ = NORMAL;
        break;
    case PRESSED:
        setLook(2);
        if (!hit(mx, my))
            state_ = PRESSED_OUTSIDE;
        break;
    case PRESSED_OUTSIDE:
        setLook(checked_ ? 4 : 0);
        if (!held)
            state_ = NORMAL;
        if (hit(mx, my))
            state_ = PRESSED;
        break;
    }
    if (focused_ && state_ == NORMAL)
        setLook(1);
    return true;
}

// @yo2 0x005b87e0 CWindowTaskSwitch::handleMessage: Tab / Shift+Tab move the focus, Enter and a click fire it
bool CWindowTaskSwitch::handleMessage(WindowMsg m) {
    if (m.msg == 0x102) {   // WM_CHAR
        if (m.ch == '\t') {
            if (GetKeyState(VK_SHIFT) >= 0)
                mediator_->mediatorSlot2(this);
            else
                mediator_->mediatorSlot3(this);
        } else if (m.ch == '\r') {
            mediator_->onControlEvent(this);
        }
    } else if (m.msg == 0x201) {   // WM_LBUTTONDOWN
        if (state_ == HOVER)
            state_ = PRESSED;
    } else if (m.msg == 0x202 && state_ == PRESSED) {   // WM_LBUTTONUP
        state_ = HOVER;
        click();
    }
    return true;
}

// @yo2 0x005b9ed0 CWindowTaskSwitch::setCentre
void CWindowTaskSwitch::setCentre(float x, float y) {
    x_ = static_cast<float>(x - w_ * 0.5);
    y_ = static_cast<float>(y - h_ * 0.5);
    pos_.x = x_;
    pos_.y = y_;
}

// =====================================================================================================================
// CWindowTaskScrollBase

// @yo2 0x005aaec0 CWindowTaskScrollBase::CWindowTaskScrollBase
CWindowTaskScrollBase::CWindowTaskScrollBase() { setTaskName("スクロールバー基底"); }

// @yo2 0x005ab1b0 CWindowTaskScrollBase::~CWindowTaskScrollBase
// @yo2 0x005ab180 CWindowTaskScrollBase deleting destructor
CWindowTaskScrollBase::~CWindowTaskScrollBase() = default;

// @yo2 0x005ab160 CWindowTaskScrollBase::kind
uint32_t CWindowTaskScrollBase::kind() const { return 0xe; }

// @yo2 0x005ab280 CWindowTaskScrollBase::onInit: six sprites from scroll_01_c00.png, 256 long, shown
bool CWindowTaskScrollBase::onInit() {
    z_ = 1;
    inheritTransform_ = true;
    CTaskPtr<CSpriteElm>* sprites[6] = {&upSprite_,       &downSprite_,        &thumbTopSprite_,
                                        &thumbMidSprite_, &thumbBottomSprite_, &trackSprite_};
    static const char* const names[6] = {
        "CWindowTaskScrollBaseの上(左)矢印画像", "CWindowTaskScrollBaseの下(右)矢印画像",
        "CWindowTaskScrollBaseのバー上部画像",   "CWindowTaskScrollBaseのバー中央画像",
        "CWindowTaskScrollBaseのバー下部画像",   "CWindowTaskScrollBaseの下地画像",
    };
    for (auto* s : sprites)
        s->setUser(this);
    vc6::string path = windowDataDir();
    path += "scroll_01_c00.png";
    for (int i = 0; i < 6; i++) {
        windowSpriteCreate(*sprites[i], this, 10000, path);
        windowNameTask(windowElement(*sprites[i]), names[i]);
    }
    for (auto* s : sprites)
        windowElement(*s)->inheritTransform_ = true;
    for (auto* s : sprites)
        windowElement(*s)->setDrawMode(BLEND);
    loadImages();
    setRect(windowElement(trackSprite_), trackU_, trackV_, trackW_, trackH_);
    length_ = 256;
    unk46c_ = 0;
    thumbPos_ = 0;
    thumbLength_ = 0;
    value_ = 0;
    upHeld_ = false;
    upFrames_ = 0;
    downHeld_ = false;
    downFrames_ = 0;
    unk490_ = false;
    pressFrames_ = 0;
    page_ = 6;
    dragStarted_ = false;
    dragging_ = false;
    unk4a0_ = 0;
    autoHide_ = true;
    visible_ = true;
    setWheelArea(0, 0, 0, 0);
    show();
    return true;
}

// @yo2 0x005ad8a0 CWindowTaskScrollBase::setWheelArea
void CWindowTaskScrollBase::setWheelArea(float x, float y, float w, float h) {
    wheelX_ = x;
    wheelY_ = y;
    wheelW_ = w;
    wheelH_ = h;
}

// @yo2 0x005ad8e0 CWindowTaskScrollBase::wheelHitTest
bool CWindowTaskScrollBase::wheelHitTest(float x, float y) {
    return x > wheelX_ && x < wheelW_ + wheelX_ && y > wheelY_ && y < wheelH_ + wheelY_;
}

// @yo2 0x005acbf0 CWindowTaskScrollBase::show
void CWindowTaskScrollBase::show() {
    thumbLength();
    lockFlags_ &= ~2u;
    setDisp(true, true);
    enabled_ = true;
}

// @yo2 0x005acc30 CWindowTaskScrollBase::hide (and stop TM_MAIN)
void CWindowTaskScrollBase::hide() {
    setDisp(false, true);
    enabled_ = false;
    lockFlags_ |= 2u;
}

// @yo2 0x005acc60 CWindowTaskScrollBase::thumbLength: the track shared by max_ + 1 positions, never below the
// thumb's two end pieces
float CWindowTaskScrollBase::thumbLength() {
    int32_t min = thumbBottom_.h + thumbTop_.h;
    float t = ((length_ - float(up_.h)) - float(down_.h)) / float(max_ + 1);
    return t > float(min) ? t : float(min);
}

// @yo2 0x005ad5a0 CWindowTaskScrollBase::valueToPos (clamps value_ first; its argument is unused)
float CWindowTaskScrollBase::valueToPos(int32_t) {
    float t = thumbLength();
    if (value_ < 0)
        value_ = 0;
    if (value_ > max_)
        value_ = max_;
    if (max_ == 0)
        return 0;
    return ((((length_ - float(up_.h)) - float(down_.h)) - t) / float(max_)) * float(value_);
}

// @yo2 0x005ad630 CWindowTaskScrollBase::posToValue
int32_t CWindowTaskScrollBase::posToValue(float pos) {
    float t = thumbLength();
    float perPixel = float(max_) / (((length_ - float(up_.h)) - float(down_.h)) - t);
    return static_cast<int32_t>(perPixel * pos);
}

// @yo2 0x005ad460 CWindowTaskScrollBase::setValue: clamped; the thumb follows; the window is told (slot 0)
void CWindowTaskScrollBase::setValue(int32_t v) {
    if (v < 0)
        v = 0;
    if (v > max_)
        v = max_;
    value_ = v;
    thumbPos_ = valueToPos(v);
    mediator_->onControlEvent(this);
}

// @yo2 0x005ad4e0 CWindowTaskScrollBase::setMax: shown while there is something to scroll
void CWindowTaskScrollBase::setMax(int32_t max) {
    if (max < 0) {
        max = 0;
        value_ = 0;
    }
    max_ = max;
    if (max < value_)
        value_ = max;
    thumbPos_ = valueToPos(value_);
    pos_ = {x_, y_, 1};
    if (max_ < 1) {
        if (autoHide_)
            hide();
    } else {
        show();
    }
    if (!visible_)
        hide();
}

// @yo2 0x005ad230 CWindowTaskScrollBase::stepUp: one step on the press, then every 4th frame after 30
void CWindowTaskScrollBase::stepUp() {
    if (!enabled_)
        return;
    if (!upHeld_) {
        if (--value_ < 0)
            value_ = 0;
        else
            mediator_->onControlEvent(this);
        upHeld_ = true;
    } else if (++upFrames_ > 30 && (upFrames_ & 3) == 0) {
        if (--value_ < 0)
            value_ = 0;
        else
            mediator_->onControlEvent(this);
    }
    thumbPos_ = valueToPos(value_);
}

// @yo2 0x005ad310 CWindowTaskScrollBase::stepDown
void CWindowTaskScrollBase::stepDown() {
    if (!enabled_)
        return;
    if (!downHeld_) {
        if (++value_ > max_)
            value_ = max_;
        else
            mediator_->onControlEvent(this);
        downHeld_ = true;
    } else if (++downFrames_ > 30 && (downFrames_ & 3) == 0) {
        if (++value_ > max_)
            value_ = max_;
        else
            mediator_->onControlEvent(this);
    }
    thumbPos_ = valueToPos(value_);
}

// @yo2 0x005ad420 CWindowTaskScrollBase::releaseUp
void CWindowTaskScrollBase::releaseUp() {
    upHeld_ = false;
    upFrames_ = 0;
}

// @yo2 0x005ad440 CWindowTaskScrollBase::releaseDown
void CWindowTaskScrollBase::releaseDown() {
    downHeld_ = false;
    downFrames_ = 0;
}

// @yo2 0x005acce0 CWindowTaskScrollBase::lookUp
void CWindowTaskScrollBase::lookUp(int32_t look) {
    if (look < 0 || look > 2)
        return;
    setRect(windowElement(upSprite_), up_.uv[look][0], up_.uv[look][1], up_.w, up_.h);
}

// @yo2 0x005acdd0 CWindowTaskScrollBase::lookDown
void CWindowTaskScrollBase::lookDown(int32_t look) {
    if (look < 0 || look > 2)
        return;
    setRect(windowElement(downSprite_), down_.uv[look][0], down_.uv[look][1], down_.w, down_.h);
}

// @yo2 0x005acec0 CWindowTaskScrollBase::lookThumb
void CWindowTaskScrollBase::lookThumb(int32_t look) {
    if (look < 0 || look > 2)
        return;
    const Piece* pieces[3] = {&thumbTop_, &thumbMid_, &thumbBottom_};
    const CTaskPtr<CSpriteElm>* sprites[3] = {&thumbTopSprite_, &thumbMidSprite_, &thumbBottomSprite_};
    for (int i = 0; i < 3; i++)
        setRect(windowElement(*sprites[i]), pieces[i]->uv[look][0], pieces[i]->uv[look][1], pieces[i]->w,
                pieces[i]->h);
}

// @yo2 0x005ac3a0 CWindowTaskScrollBase::hitUp
bool CWindowTaskScrollBase::hitUp(int32_t x, int32_t y) const {
    if (!enabled_)
        return false;
    Vec3 p = windowElement(upSprite_)->worldTranslation();
    int32_t x0 = static_cast<int32_t>(p.x), y0 = static_cast<int32_t>(p.y);
    return x0 < x && x < up_.w + x0 && y0 < y && y < up_.h + y0;
}

// @yo2 0x005ac460 CWindowTaskScrollBase::hitDown
bool CWindowTaskScrollBase::hitDown(int32_t x, int32_t y) const {
    if (!enabled_)
        return false;
    Vec3 p = windowElement(downSprite_)->worldTranslation();
    int32_t x0 = static_cast<int32_t>(p.x), y0 = static_cast<int32_t>(p.y);
    return x0 < x && x < down_.w + x0 && y0 < y && y < down_.h + y0;
}

// @yo2 0x005ac520 CWindowTaskScrollBase::hitThumb: over the three thumb pieces as scaled
bool CWindowTaskScrollBase::hitThumb(int32_t x, int32_t y) const {
    if (!enabled_)
        return false;
    CElement* top = windowElement(thumbTopSprite_);
    CElement* mid = windowElement(thumbMidSprite_);
    CElement* bottom = windowElement(thumbBottomSprite_);
    Vec3 p = top->worldTranslation();
    int32_t x0 = static_cast<int32_t>(p.x), y0 = static_cast<int32_t>(p.y);
    float w = float(thumbMid_.w) * mid->scale_.x;
    w = float(thumbBottom_.w) * bottom->scale_.x + w;
    int32_t iw = static_cast<int32_t>(float(thumbTop_.w) * top->scale_.x + w);
    float h = float(thumbMid_.h) * mid->scale_.y;
    h = float(thumbBottom_.h) * bottom->scale_.y + h;
    int32_t ih = static_cast<int32_t>(float(thumbTop_.h) * top->scale_.y + h);
    return x0 < x && x < x0 + iw && y0 < y && y < y0 + ih;
}

// @yo2 0x005ad740 CWindowTaskScrollBase::hitTest: over the track
bool CWindowTaskScrollBase::hitTest(float x, float y) {
    if (!dynamic_cast<CElement*>(trackSprite_.task()))
        return false;
    CElement* t = windowElement(trackSprite_);
    Vec3 p = t->worldTranslation();
    int32_t x0 = static_cast<int32_t>(p.x), y0 = static_cast<int32_t>(p.y);
    int32_t w = static_cast<int32_t>(float(trackW_) * t->scale_.x);
    int32_t h = static_cast<int32_t>(float(trackH_) * t->scale_.y);
    return float(x0) < x && x < float(w + x0) && float(y0) < y && y < float(h + y0);
}

// @yo2 0x005ad960 CWindowTaskScrollBase::handleMessage: a click focuses (slot 1); the wheel scrolls max/10 + 1
bool CWindowTaskScrollBase::handleMessage(WindowMsg m) {
    if (m.msg == 0x201) {
        mediator_->onControlCommand(this);
    } else if (m.msg == 0x20a) {   // WM_MOUSEWHEEL: wheel delta in the high word of wParam
        int32_t step = max_ / 10 + 1;
        if (static_cast<int16_t>(m.wParam >> 16) > 0)
            setValue(value_ - step);
        else
            setValue(value_ + step);
    }
    return true;
}

// @yo2 0x005ad6b0 CWindowTaskScrollBase::layout: z of the bar; the pieces in front of the track
void CWindowTaskScrollBase::layout() {
    pos_.z = z_;
    windowElement(upSprite_)->pos_.z = 1;
    windowElement(downSprite_)->pos_.z = 1;
    windowElement(thumbTopSprite_)->pos_.z = 1;
    windowElement(thumbMidSprite_)->pos_.z = 1;
    windowElement(thumbBottomSprite_)->pos_.z = 1;
    windowElement(trackSprite_)->pos_.z = 0;
}

// @yo2 0x005ac6d0 CWindowTaskScrollBase::onMain: arrows, thumb dragging and paging from the polled mouse
bool CWindowTaskScrollBase::onMain() {
    pos_ = {x_, y_, 1};
    if (max_ < 1) {
        if (autoHide_)
            hide();
    } else {
        show();
    }
    if (!visible_)
        hide();
    thumbLength_ = thumbLength();
    lookUp(0);
    lookDown(0);
    lookThumb(0);
    placePieces();
    if (!enabled_)
        return true;
    bool held = leftButtonHeld();
    int32_t mx, my;
    windowMouse(&mx, &my);
    if (g_windowFactory->controlAt(mx, my) != this && !dragging_)
        return true;

    if (hitUp(mx, my)) {
        if (held) {
            lookUp(2);
            stepUp();
        } else {
            lookUp(1);
            releaseUp();
        }
    }
    if (hitDown(mx, my)) {
        if (held) {
            lookDown(2);
            stepDown();
        } else {
            lookDown(1);
            releaseDown();
        }
    }
    if (hitThumb(mx, my)) {
        if (held) {
            if (!dragging_)
                dragOffset_ = grabOffset(float(mx), float(my));
            dragging_ = true;
        } else {
            lookThumb(1);
        }
    }

    // mouse position relative to the end of the up arrow
    auto fromUp = [&](int32_t m, double arrowEnd) { return static_cast<int32_t>(double(float(m)) - arrowEnd); };
    Vec3 up = windowElement(upSprite_)->worldTranslation();
    if (dragging_ && !held) {
        dragging_ = false;
        thumbPos_ = valueToPos(value_);
        pressFrames_ = 0;
    } else {
        if (dragging_) {
            lookThumb(2);
            drag(fromUp(mx, double(up_.w) + up.x), fromUp(my, double(up_.h) + up.y));
        }
        if (held)
            pressFrames_++;
        else
            pressFrames_ = 0;
    }

    // paging: a click on the track moves a page towards the mouse (repeating like the arrows)
    if (!hitThumb(mx, my) && !hitUp(mx, my) && !hitDown(mx, my) && !dragging_ &&
        (pressFrames_ == 1 || (pressFrames_ > 30 && (pressFrames_ & 3) != 0))) {
        int32_t dx = fromUp(mx, double(up_.w) + up.x);
        int32_t dy = fromUp(my, double(up_.h) + up.y);
        Vec3 t = windowElement(thumbTopSprite_)->worldTranslation();
        int32_t d = dx > dy ? static_cast<int32_t>(double(mx) - (double(t.x) + thumbTop_.w * 1.5))
                            : static_cast<int32_t>(double(my) - (double(t.y) + thumbTop_.h * 1.5));
        setValue(d < 0 ? value_ - page_ : value_ + page_);
    }
    layout();
    return true;
}

// =====================================================================================================================
// CWindowTaskScroll

CWindowTaskScroll::CWindowTaskScroll() { setTaskName("スクロールバー縦(コントロール)"); }

// @yo2 0x005ada20 CWindowTaskScroll::create (constructor inlined)
CWindowTaskScroll* CWindowTaskScroll::create(CTask* parent, IWindowTaskMediator* mediator, int32_t max) {
    auto* s = new CWindowTaskScroll;
    s->max_ = max;
    s->mediator_ = mediator;
    return dynamic_cast<CWindowTaskScroll*>(s->CTask::create(parent, 10000));
}

// @yo2 0x005adc70 CWindowTaskScroll::~CWindowTaskScroll
// @yo2 0x005adc40 CWindowTaskScroll deleting destructor
CWindowTaskScroll::~CWindowTaskScroll() = default;

// @yo2 0x005adc00 CWindowTaskScroll::grabOffset: y below the thumb's top
float CWindowTaskScroll::grabOffset(float, float y) { return y - windowElement(thumbTopSprite_)->worldTranslation().y; }

// @yo2 0x005ae0a0 CWindowTaskScroll::drag: the thumb follows the mouse (dy from the up arrow's end)
void CWindowTaskScroll::drag(int32_t, int32_t dy) {
    prevValue_ = value_;
    thumbLength_ = thumbLength();
    if (!leftButtonHeld()) {
        dragStarted_ = false;
        return;
    }
    float y = float(dy);
    if (!dragStarted_) {
        dragOffset_ = y - (windowElement(thumbTopSprite_)->pos_.y - float(up_.h));
        dragStarted_ = true;
        return;
    }
    float p = y - dragOffset_;
    if (p < 0)
        p = 0;
    float limit = length_ - (float(down_.h + up_.h) + thumbLength_);
    if (p > limit)
        p = limit;
    setValue(posToValue(p));
    thumbPos_ = p;
    if (prevValue_ != value_)
        mediator_->onControlEvent(this);
}

// @yo2 0x005add40 CWindowTaskScroll::placePieces: arrows at the ends, the thumb at thumbPos_, the track stretched
void CWindowTaskScroll::placePieces() {
    windowElement(upSprite_)->pos_ = {0, 0, 1};
    windowElement(thumbTopSprite_)->pos_ = {0, float(up_.h) + thumbPos_, 1};
    windowElement(thumbMidSprite_)->pos_ = {0, float(up_.h) + float(thumbTop_.h) + thumbPos_, 1};
    windowElement(thumbMidSprite_)->scale_.y =
        ((thumbLength_ - float(thumbTop_.h)) - float(thumbBottom_.h)) / float(thumbMid_.h);
    // (the exe places the bottom piece with the down arrow's height, not the bottom piece's)
    windowElement(thumbBottomSprite_)->pos_ = {
        0, (float(up_.h) + float(thumbTop_.h) + thumbLength_ + thumbPos_) - float(down_.h), 1};
    windowElement(downSprite_)->pos_ = {0, length_ - float(down_.h), 1};
    windowElement(trackSprite_)->pos_ = {0, 0, 0};
    CElement* t = windowElement(trackSprite_);
    t->scale_ = {1, length_ / float(trackH_), 1};
}

// @yo2 0x005adf20 CWindowTaskScroll::loadImages: 16 x 16 arrows, 16 x 8 thumb pieces, one column per look
void CWindowTaskScroll::loadImages() {
    up_ = {16, 16, {{0, 0}, {16, 0}, {32, 0}}};
    down_ = {16, 16, {{0, 16}, {16, 16}, {32, 16}}};
    thumbTop_ = {16, 8, {{0, 32}, {16, 32}, {32, 32}}};
    thumbMid_ = {16, 8, {{0, 40}, {16, 40}, {32, 40}}};
    thumbBottom_ = {16, 8, {{0, 48}, {16, 48}, {32, 48}}};
    trackW_ = 16;
    trackH_ = 16;
    trackU_ = 48;
    trackV_ = 0;
}

// =====================================================================================================================
// CWindowTaskBackPlane

// @yo2 0x005a6b20 CWindowTaskBackPlane::CWindowTaskBackPlane
CWindowTaskBackPlane::CWindowTaskBackPlane() { setTaskName("白い背景(コントロール)"); }

// @yo2 0x005a6a60 CWindowTaskBackPlane::create
CWindowTaskBackPlane* CWindowTaskBackPlane::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* b = new CWindowTaskBackPlane;
    b->mediator_ = mediator;
    return dynamic_cast<CWindowTaskBackPlane*>(b->CTask::create(parent, 10000));
}

// @yo2 0x005a6d00 CWindowTaskBackPlane::~CWindowTaskBackPlane
// @yo2 0x005a6cd0 CWindowTaskBackPlane deleting destructor
CWindowTaskBackPlane::~CWindowTaskBackPlane() = default;

// @yo2 0x005a6cb0 CWindowTaskBackPlane::kind
uint32_t CWindowTaskBackPlane::kind() const { return 5; }

// @yo2 0x005a6d70 CWindowTaskBackPlane::onInit: window_base_01_c01.png's middle piece, 70% opaque
bool CWindowTaskBackPlane::onInit() {
    x_ = y_ = 0;
    z_ = 0;
    w_ = h_ = 256;
    inheritTransform_ = true;
    sprite_.setUser(this);
    vc6::string path = windowDataDir();
    path += "window_base_01_c01.png";
    windowSpriteCreate(sprite_, this, 10000, path);
    windowNameTask(windowElement(sprite_), "CWindowTaskBackPlaneの画像");
    windowElement(sprite_)->setDrawMode(BLEND);
    windowElement(sprite_)->inheritTransform_ = true;
    setAlpha(0.7f);
    layout();
    return true;
}

// @yo2 0x005a7320 CWindowTaskBackPlane::layout: the 8 x 8 piece scaled to w_ x h_
void CWindowTaskBackPlane::layout() {
    pos_ = {x_, y_, z_};
    CElement* e = windowElement(sprite_);
    e->pos_ = {0, 0, 0};
    setRect(e, 8, 8, 8, 8);
    e->scale_.x = w_ * 0.125f;
    e->scale_.y = h_ * 0.125f;
}

// @yo2 0x005a7410 CWindowTaskBackPlane::hitTest (strictly inside)
bool CWindowTaskBackPlane::hitTest(float x, float y) {
    Vec3 p = worldTranslation();
    return x > p.x && x < p.x + w_ && y > p.y && y < p.y + h_;
}

// @yo2 0x005a74b0 CWindowTaskBackPlane::handleMessage: a click focuses, grabs the window and fires (slots 1, 4, 0)
bool CWindowTaskBackPlane::handleMessage(WindowMsg m) {
    if (m.msg == 0x201) {
        mediator_->onControlCommand(this);
        mediator_->beginDrag(this, m.x, m.y);
        mediator_->onControlEvent(this);
    }
    return true;
}

// @yo2 0x005a72e0 CWindowTaskBackPlane::setColor
void CWindowTaskBackPlane::setColor(float r, float g, float b, float a) {
    color_[0] = r;
    color_[1] = g;
    color_[2] = b;
    color_[3] = a;
}

// =====================================================================================================================
// the frames

namespace {
const char* const kFrameTextures[9] = {
    "window_base_01_c00.png", "window_base_01_c01.png", "window_base_01_c02.png",
    "window_base_01_c03.png", "window_base_01_c04.png", "window_base_01_c05.png",
    "window_base_01_c06.png", "window_base_01_c07.png", "window_base_01_c08.png",
};

// A sprite of the frame texture, named, blended, following its control.
void framePiece(CWindowTaskControll* owner, CTaskPtr<CSpriteElm>& s, const vc6::string& path, const char* name) {
    windowSpriteCreate(s, owner, 10000, path);
    windowNameTask(windowElement(s), name);
    windowElement(s)->setDrawMode(CElement::BLEND);
    windowElement(s)->inheritTransform_ = true;
}

void piece(const CTaskPtr<CSpriteElm>& s, float x, float y, int32_t u, int32_t v) {
    CElement* e = windowElement(s);
    e->pos_ = {x, y, 0};
    setRect(e, u, v, 8, 8);
}
}  // namespace

// @yo2 0x005a2690 windowFrameTexture (CWindowTask.h; the exe returns it as a std::string)
const char* windowFrameTexture(int32_t style) { return kFrameTextures[style]; }

// @yo2 0x005a0cd0 CWindowTaskFrameThin::CWindowTaskFrameThin
CWindowTaskFrameThin::CWindowTaskFrameThin() { setTaskName("枠の細いウィンドウ(コントロール)"); }

// @yo2 0x005a0c00 CWindowTaskFrameThin::create
CWindowTaskFrameThin* CWindowTaskFrameThin::create(CTask* parent, IWindowTaskMediator* mediator, int32_t style) {
    auto* f = new CWindowTaskFrameThin;
    f->style_ = style;
    f->mediator_ = mediator;
    return dynamic_cast<CWindowTaskFrameThin*>(f->CTask::create(parent, 10000));
}

// @yo2 0x005a0fb0 CWindowTaskFrameThin::~CWindowTaskFrameThin
// @yo2 0x005a0f80 CWindowTaskFrameThin deleting destructor
CWindowTaskFrameThin::~CWindowTaskFrameThin() = default;

// @yo2 0x005a0f40 CWindowTaskFrameThin::kind
uint32_t CWindowTaskFrameThin::kind() const { return 1; }

// @yo2 0x005a10a0 CWindowTaskFrameThin::onInit: eight pieces of the style's texture, 70% opaque (styles 5, 6: opaque)
bool CWindowTaskFrameThin::onInit() {
    x_ = y_ = 0;
    z_ = 1;
    w_ = h_ = 256;
    inheritTransform_ = true;
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        s.setUser(this);
    vc6::string path = windowDataDir();
    path += windowFrameTexture(style_);
    static const char* const names[8] = {
        "CWindowTaskFrameThinの左上画像",   "CWindowTaskFrameThinの中央上画像", "CWindowTaskFrameThinの右上画像",
        "CWindowTaskFrameThinの左中央画像", "CWindowTaskFrameThinの右中央画像", "CWindowTaskFrameThinの左下画像",
        "CWindowTaskFrameThinの中央下画像", "CWindowTaskFrameThinの右下画像",
    };
    for (int i = 0; i < 8; i++)
        framePiece(this, sprites_[i], path, names[i]);
    setAlpha(0.7f);
    if (style_ == 6 || style_ == 5)
        setAlpha(1);
    layout();
    return true;
}

// @yo2 0x005a29b0 CWindowTaskFrameThin::layout: 8 x 8 corners, the edges stretched
void CWindowTaskFrameThin::layout() {
    pos_ = {x_, y_, z_};
    float sx = (w_ - 16) * 0.125f, sy = (h_ - 16) * 0.125f;
    piece(sprites_[0], 0, 0, 0, 0);
    piece(sprites_[1], 8, 0, 8, 0);
    windowElement(sprites_[1])->scale_.x = sx;
    piece(sprites_[2], w_ - 8, 0, 16, 0);
    piece(sprites_[3], 0, 8, 0, 8);
    windowElement(sprites_[3])->scale_.y = sy;
    piece(sprites_[4], w_ - 8, 8, 16, 8);
    windowElement(sprites_[4])->scale_.y = sy;
    piece(sprites_[5], 0, h_ - 8, 0, 16);
    piece(sprites_[6], 8, h_ - 8, 8, 16);
    windowElement(sprites_[6])->scale_.x = sx;
    piece(sprites_[7], w_ - 8, h_ - 8, 16, 16);
}

// @yo2 0x005a2e80 CWindowTaskFrameThin::hitTest: over one of the four 8-pixel edges
bool CWindowTaskFrameThin::hitTest(float x, float y) {
    Vec3 p = worldTranslation();
    float right = p.x + w_, bottom = p.y + h_;
    if (x > p.x) {
        if (x < right && y > p.y && y < p.y + 8)   // top
            return true;
        if (x < right && bottom - 8 < y && y < bottom)   // bottom
            return true;
        if (x < p.x + 8 && y > p.y && y < bottom)   // left
            return true;
    }
    return right - 8 < x && x < right && y > p.y && y < bottom;   // right
}

// @yo2 0x005a3050 CWindowTaskFrameThin::handleMessage: a click grabs the window
bool CWindowTaskFrameThin::handleMessage(WindowMsg m) {
    if (m.msg != 0x201)
        return false;
    mediator_->onControlCommand(this);
    mediator_->beginDrag(this, m.x, m.y);
    return true;
}

// @yo2 0x005a30d0 CWindowTaskFrameThin::setVisible (the pieces only)
void CWindowTaskFrameThin::setVisible(bool on) {
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        windowElement(s)->setDisp(on, false);
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        on ? TaskFlags::of(windowElement(s)) &= ~2u : TaskFlags::of(windowElement(s)) |= 2u;
}

// @yo2 0x005a3420 CWindowTaskFrameBottomThick::CWindowTaskFrameBottomThick
CWindowTaskFrameBottomThick::CWindowTaskFrameBottomThick() { setTaskName("下の厚いウィンドウ(コントロール)"); }

// @yo2 0x005a3350 CWindowTaskFrameBottomThick::create
CWindowTaskFrameBottomThick* CWindowTaskFrameBottomThick::create(CTask* parent, IWindowTaskMediator* mediator,
                                                                 int32_t style) {
    auto* f = new CWindowTaskFrameBottomThick;
    f->style_ = style;
    f->mediator_ = mediator;
    return dynamic_cast<CWindowTaskFrameBottomThick*>(f->CTask::create(parent, 10000));
}

// @yo2 0x005a3780 CWindowTaskFrameBottomThick::~CWindowTaskFrameBottomThick
// @yo2 0x005a3750 CWindowTaskFrameBottomThick deleting destructor
CWindowTaskFrameBottomThick::~CWindowTaskFrameBottomThick() = default;

// @yo2 0x005a3730 CWindowTaskFrameBottomThick::kind
uint32_t CWindowTaskFrameBottomThick::kind() const { return 3; }

// @yo2 0x005a38f0 CWindowTaskFrameBottomThick::onInit: fourteen pieces, a 24-pixel band
bool CWindowTaskFrameBottomThick::onInit() {
    x_ = y_ = 0;
    z_ = 1;
    w_ = h_ = 256;
    inheritTransform_ = true;
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        s.setUser(this);
    vc6::string path = windowDataDir();
    path += windowFrameTexture(style_);
    bottomH_ = 24;
    static const char* const names[14] = {
        "CWindowTaskFrameBottomThickの左上画像",           "CWindowTaskFrameBottomThickの中央上画像",
        "CWindowTaskFrameBottomThickの右上画像",           "CWindowTaskFrameBottomThickの左中央画像",
        "CWindowTaskFrameBottomThickの右中央画像",         "CWindowTaskFrameBottomThickの左下画像",
        "CWindowTaskFrameBottomThickの中央下画像",         "CWindowTaskFrameBottomThickの右下画像",
        "CWindowTaskFrameBottomThickの下部分の左画像",     "CWindowTaskFrameBottomThickの下部分の右画像",
        "CWindowTaskFrameBottomThickの下部分の左下画像",   "CWindowTaskFrameBottomThickの下部分の中央下画像",
        "CWindowTaskFrameBottomThickの下部分の右下画像",   "CWindowTaskFrameBottomThickの下部分の中央部画像",
    };
    for (int i = 0; i < 14; i++)
        framePiece(this, sprites_[i], path, names[i]);
    setAlpha(0.7f);
    if (style_ == 6 || style_ == 5)
        setAlpha(1);
    layout();
    return true;
}

// @yo2 0x005a5b40 CWindowTaskFrameBottomThick::layout: the frame over h_ - bottomH_, then the band below it
void CWindowTaskFrameBottomThick::layout() {
    pos_ = {x_, y_, z_};
    float top = h_ - bottomH_;   // height of the upper frame
    float sx = (w_ - 16) * 0.125f;
    piece(sprites_[0], 0, 0, 0, 0);
    piece(sprites_[1], 8, 0, 8, 0);
    windowElement(sprites_[1])->scale_.x = sx;
    piece(sprites_[2], w_ - 8, 0, 16, 0);
    piece(sprites_[3], 0, 8, 0, 8);
    windowElement(sprites_[3])->scale_.y = (top - 16) * 0.125f;
    piece(sprites_[4], w_ - 8, 8, 16, 8);
    windowElement(sprites_[4])->scale_.y = (top - 16) * 0.125f;
    piece(sprites_[5], 0, top - 8, 0x48, 8);
    piece(sprites_[6], 8, top - 8, 0x38, 16);
    windowElement(sprites_[6])->scale_.x = sx;
    piece(sprites_[7], w_ - 8, top - 8, 0x50, 8);
    piece(sprites_[8], 0, top, 0x18, 8);
    windowElement(sprites_[8])->scale_.y = (bottomH_ - 8) * 0.125f;
    piece(sprites_[9], w_ - 8, top, 0x28, 8);
    windowElement(sprites_[9])->scale_.y = (bottomH_ - 8) * 0.125f;
    piece(sprites_[10], 0, h_ - 8, 0x18, 16);
    piece(sprites_[11], 8, h_ - 8, 0x20, 16);
    windowElement(sprites_[11])->scale_.x = sx;
    piece(sprites_[12], w_ - 8, h_ - 8, 0x28, 16);
    piece(sprites_[13], 8, top, 0x20, 8);
    windowElement(sprites_[13])->scale_.x = sx;
    windowElement(sprites_[13])->scale_.y = (bottomH_ - 8) * 0.125f;
}

// @yo2 0x005a63d0 CWindowTaskFrameBottomThick::hitTest: the edges and the whole band
bool CWindowTaskFrameBottomThick::hitTest(float x, float y) {
    Vec3 p = worldTranslation();
    float right = p.x + w_, bottom = p.y + h_;
    if (x > p.x) {
        if (x < right && y > p.y && y < p.y + 8)
            return true;
        if (x < right && (bottom - bottomH_) - 8 < y && y < bottom)
            return true;
        if (x < p.x + 8 && y > p.y && y < bottom)
            return true;
    }
    return right - 8 < x && x < right && y > p.y && y < bottom;
}

// @yo2 0x005a65a0 CWindowTaskFrameBottomThick::handleMessage
bool CWindowTaskFrameBottomThick::handleMessage(WindowMsg m) {
    if (m.msg != 0x201)
        return false;
    mediator_->onControlCommand(this);
    mediator_->beginDrag(this, m.x, m.y);
    return true;
}

// @yo2 0x005a6620 CWindowTaskFrameBottomThick::setVisible
void CWindowTaskFrameBottomThick::setVisible(bool on) {
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        windowElement(s)->setDisp(on, false);
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        on ? TaskFlags::of(windowElement(s)) &= ~2u : TaskFlags::of(windowElement(s)) |= 2u;
}

// =====================================================================================================================
// CWindowTaskShadowText

CWindowTaskShadowText::CWindowTaskShadowText() { setTaskName("影付き文字コントロール"); }

// @yo2 0x005af9b0 CWindowTaskShadowText::create (constructor inlined)
CWindowTaskShadowText* CWindowTaskShadowText::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* t = new CWindowTaskShadowText;
    t->mediator_ = mediator;
    return dynamic_cast<CWindowTaskShadowText*>(t->CTask::create(parent, 10000));
}

// @yo2 0x005afec0 CWindowTaskShadowText::~CWindowTaskShadowText
// @yo2 0x005afe70 CWindowTaskShadowText deleting destructor
CWindowTaskShadowText::~CWindowTaskShadowText() = default;

// @yo2 0x005afda0 CWindowTaskShadowText::kind
uint32_t CWindowTaskShadowText::kind() const { return 0x16; }

// @yo2 0x005afc10 CWindowTaskShadowText::hitTest
bool CWindowTaskShadowText::hitTest(float, float) { return false; }

// @yo2 0x005affc0 CWindowTaskShadowText::onInit: the text in front, its shadow one pixel down and right behind it
bool CWindowTaskShadowText::onInit() {
    inheritTransform_ = true;
    x_ = y_ = 0;
    text_.setUser(this);
    text_.set(CWindowTaskText::create(this, this));
    windowNameTask(text_.get(), "CWindowTaskShadowTextのテキスト");
    shadow_.setUser(this);
    shadow_.set(CWindowTaskText::create(this, this));
    windowNameTask(shadow_.get(), "CWindowTaskShadowTextの影部分テキスト");
    text_->posZ_ = 1;
    text_->pos_.z = 1;
    shadow_->posZ_ = 0;
    shadow_->pos_.z = 0;
    text_->setField430(0);
    shadow_->setField430(0);
    shadowDx_ = 1;
    shadowDy_ = 1;
    shadow_->setPos(float(x_ + 1), float(y_ + 1));
    return true;
}

// @yo2 0x005afc30 CWindowTaskShadowText::setText (both)
void CWindowTaskShadowText::setText(const WChar* s) {
    text_->setText(s);
    shadow_->setText(s);
}

// @yo2 0x005afc80 CWindowTaskShadowText::setTextA (both)
void CWindowTaskShadowText::setTextA(const char* s) {
    text_->setTextA(s);
    shadow_->setTextA(s);
}

// @yo2 0x005afcd0 CWindowTaskShadowText::setName: the text, widened
void CWindowTaskShadowText::setName(const vc6::string& s) { setText(widen(s.c_str()).c_str()); }

// @yo2 0x005afdc0 CWindowTaskShadowText::onControlEvent (forwarded)
void CWindowTaskShadowText::onControlEvent(CWindowTaskControll* a) { mediator_->onControlEvent(a); }
// @yo2 0x005afde0 CWindowTaskShadowText::onControlCommand (forwarded)
void CWindowTaskShadowText::onControlCommand(CWindowTaskControll* a) { mediator_->onControlCommand(a); }
// @yo2 0x005afe00 CWindowTaskShadowText::mediatorSlot2 (forwarded)
void CWindowTaskShadowText::mediatorSlot2(CWindowTaskControll* a) { mediator_->mediatorSlot2(a); }
// @yo2 0x005afe20 CWindowTaskShadowText::mediatorSlot3 (forwarded)
void CWindowTaskShadowText::mediatorSlot3(CWindowTaskControll* a) { mediator_->mediatorSlot3(a); }
// @yo2 0x005afe40 CWindowTaskShadowText::beginDrag (forwarded)
void CWindowTaskShadowText::beginDrag(CWindowTaskControll* a, int32_t x, int32_t y) { mediator_->beginDrag(a, x, y); }

// =====================================================================================================================
// CWindowTaskTextSwitch

// @yo2 0x005ba000 CWindowTaskTextSwitch::CWindowTaskTextSwitch
CWindowTaskTextSwitch::CWindowTaskTextSwitch() { setTaskName("テキストスイッチ(コントロール)"); }

// @yo2 0x005b9f40 CWindowTaskTextSwitch::create
CWindowTaskTextSwitch* CWindowTaskTextSwitch::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* s = new CWindowTaskTextSwitch;
    s->mediator_ = mediator;
    return dynamic_cast<CWindowTaskTextSwitch*>(s->CTask::create(parent, 10000));
}

// @yo2 0x005ba6a0 CWindowTaskTextSwitch::~CWindowTaskTextSwitch
// @yo2 0x005ba670 CWindowTaskTextSwitch deleting destructor
CWindowTaskTextSwitch::~CWindowTaskTextSwitch() = default;

// @yo2 0x005ba530 CWindowTaskTextSwitch::kind
uint32_t CWindowTaskTextSwitch::kind() const { return 0x19; }

// @yo2 0x005baef0 CWindowTaskTextSwitch::onMain
bool CWindowTaskTextSwitch::onMain() {
    CWindowTaskSwitch::onMain();
    return true;
}

// @yo2 0x005ba7d0 CWindowTaskTextSwitch::onInit: a black, centred, 16-pixel caption without its shadow
bool CWindowTaskTextSwitch::onInit() {
    CWindowTaskSwitch::onInit();
    caption_.setUser(this);
    caption_.set(CWindowTaskShadowText::create(this, this));
    windowNameTask(caption_.get(), "CWindowTaskTextSwitchのテキスト");
    CWindowTaskShadowText* c = caption_.get();
    c->text_->setFontSize(16);
    c->shadow_->setFontSize(16);
    c->text_->setAlign(CWindowTaskText::CENTRE);
    c->shadow_->setAlign(CWindowTaskText::CENTRE);
    c->text_->setFirstLine(0);
    c->shadow_->setFirstLine(0);
    c->text_->setPageLines(1);
    c->shadow_->setPageLines(1);
    int32_t w = static_cast<int32_t>(w_), h = static_cast<int32_t>(h_);
    c->text_->setArea(w, h);
    c->shadow_->setArea(w, h);
    c->text_->setColor(0, 0, 0, 1);
    showElement(c->shadow_.get(), false, true);
    minW_ = 80;
    unk5b4_ = 24;
    layout();
    return true;
}

// @yo2 0x005baa40 CWindowTaskTextSwitch::layout
void CWindowTaskTextSwitch::layout() {
    pos_ = {x_, y_, z_};
    CWindowTaskShadowText* c = caption_.get();
    CWindowTaskText* t = c->text_.get();
    int32_t off = static_cast<int32_t>((h_ - float(t->fontSize_ + t->lineGap_)) * 0.5f);
    float fo = float(off);
    auto place = [&](float dx) {   // caption (and its shadow) dx to the right, off down
        c->x_ = static_cast<int32_t>(dx);
        c->y_ = static_cast<int32_t>(fo);
        t->x_ = dx;
        t->y_ = fo;
        t->pos_ = {dx, fo, t->posZ_};
        c->shadow_->setPos(float(c->shadowDx_) + dx, float(c->shadowDy_) + fo);
    };
    place(0);
    float tw = float(t->width() + 8);
    w_ = tw > minW_ ? tw : minW_;
    if (t->align() == CWindowTaskText::LEFT)
        place(4);
    else if (t->align() == CWindowTaskText::RIGHT)
        place(-4);
    int32_t areaH = static_cast<int32_t>(h_ - float(off + off));
    int32_t areaW = static_cast<int32_t>(w_);
    t->setArea(areaW, areaH);
    c->shadow_->setArea(areaW, areaH);
    c->z_ = 1;
    c->pos_.z = 1;
    CWindowTaskSwitch::layout();
    if (focused_)
        g_windowFactory->setFocus(this);
}

// @yo2 0x005ba170 CWindowTaskTextSwitch::setText: the caption, then re-lay
void CWindowTaskTextSwitch::setText(const WChar* s) {
    caption_->setText(s);
    layout();
}

// @yo2 0x005ba1b0 CWindowTaskTextSwitch::setName
void CWindowTaskTextSwitch::setName(const vc6::string& s) { caption_->setName(s); }

// @yo2 0x005ba290 CWindowTaskTextSwitch::name
vc6::string CWindowTaskTextSwitch::name() const { return caption_->name(); }

// @yo2 0x005ba610 CWindowTaskTextSwitch::onControlEvent (as itself)
void CWindowTaskTextSwitch::onControlEvent(CWindowTaskControll*) {
    mediator_->onControlEvent(this);
}
// @yo2 0x005ba550 CWindowTaskTextSwitch::onControlCommand (as itself)
void CWindowTaskTextSwitch::onControlCommand(CWindowTaskControll*) { mediator_->onControlCommand(this); }
// @yo2 0x005ba590 CWindowTaskTextSwitch::mediatorSlot2 (as itself)
void CWindowTaskTextSwitch::mediatorSlot2(CWindowTaskControll*) { mediator_->mediatorSlot2(this); }
// @yo2 0x005ba5d0 CWindowTaskTextSwitch::mediatorSlot3 (as itself)
void CWindowTaskTextSwitch::mediatorSlot3(CWindowTaskControll*) {
    mediator_->mediatorSlot3(this);
}

// =====================================================================================================================
// CWindowTaskTextField

// @yo2 0x005b0260 CWindowTaskTextField::CWindowTaskTextField
CWindowTaskTextField::CWindowTaskTextField() { setTaskName("テキストフィールド(コントロール)"); }

// @yo2 0x005b01a0 CWindowTaskTextField::create
CWindowTaskTextField* CWindowTaskTextField::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* f = new CWindowTaskTextField;
    f->mediator_ = mediator;
    return dynamic_cast<CWindowTaskTextField*>(f->CTask::create(parent, 10000));
}

// @yo2 0x005b09b0 CWindowTaskTextField::~CWindowTaskTextField
// @yo2 0x005b0960 CWindowTaskTextField deleting destructor
CWindowTaskTextField::~CWindowTaskTextField() = default;

// @yo2 0x005b0840 CWindowTaskTextField::kind
uint32_t CWindowTaskTextField::kind() const { return 0x17; }

// @yo2 0x005b0860 CWindowTaskTextField::hitTest
bool CWindowTaskTextField::hitTest(float, float) { return false; }

// @yo2 0x005b0a40 CWindowTaskTextField::onInit: text, a hidden scroll bar, a back plane; 256 x 256
bool CWindowTaskTextField::onInit() {
    inheritTransform_ = true;
    x_ = y_ = 0;
    posZ_ = 0;
    text_.setUser(this);
    text_.set(CWindowTaskText::create(this, this));
    windowNameTask(text_.get(), "CWindowTaskTextFieldのテキスト");
    text_->setAlign(CWindowTaskText::CENTRE);
    scroll_.setUser(this);
    scroll_.set(CWindowTaskScroll::create(this, this, 0));
    windowNameTask(scroll_.get(), "CWindowTaskTextFieldのスクロールバー");
    scroll_->show();
    showElement(scroll_.get(), false, true);
    back_.setUser(this);
    back_.set(CWindowTaskBackPlane::create(this, this));
    windowNameTask(back_.get(), "CWindowTaskTextFieldの背景");
    w_ = h_ = 256;
    layout();
    return true;
}

// @yo2 0x005b0c60 CWindowTaskTextField::layout: the text beside the scroll bar, the bar's range from the line count
// (the exe wraps this in a "textFieldResize" profiler scope)
void CWindowTaskTextField::layout() {
    pos_ = {x_, y_, posZ_};
    if (w_ < 0)
        w_ = 1;
    if (h_ < 0)
        h_ = 1;
    CWindowTaskScroll* s = scroll_.get();
    s->length_ = h_;
    s->y_ = 0;
    s->x_ = w_ - 16;
    s->z_ = 1;
    s->layout();
    CWindowTaskText* t = text_.get();
    t->posZ_ = 2;
    t->pos_.z = 2;
    t->setArea(static_cast<int32_t>(w_ - 16), static_cast<int32_t>(h_));
    CWindowTaskBackPlane* b = back_.get();
    b->x_ = b->y_ = 0;
    b->pos_.x = b->pos_.y = 0;
    b->w_ = w_;
    b->h_ = h_;
    b->layout();
    b->z_ = 0;
    b->pos_.z = 0;
    int32_t lineH = t->fontSize_ + t->lineGap_;
    if (lineH > 0) {
        int32_t page = t->linesFrom(s->value_, h_);
        if (page < 1)
            page = static_cast<int32_t>(h_ / float(lineH));
        int32_t first = t->linesFrom(0, h_);
        t->setPageLines(page);
        int32_t extra = t->lineCount(w_ - 16) - first;
        s->setMax(extra > 0 ? extra : 0);
        s->page_ = page;
        t->setFirstLine(s->value_);
    }
    Vec3 p = worldTranslation();
    s->setWheelArea(p.x, p.y, w_, h_);
}

// @yo2 0x005b0420 CWindowTaskTextField::setText
void CWindowTaskTextField::setText(const WChar* s) { text_->setText(s); }

// @yo2 0x005b0450 CWindowTaskTextField::setName
void CWindowTaskTextField::setName(const vc6::string& s) { text_->setName(s); }

// @yo2 0x005b0530 CWindowTaskTextField::name
vc6::string CWindowTaskTextField::name() const { return text_->name(); }

// @yo2 0x005b07d0 CWindowTaskTextField::setEnabled
void CWindowTaskTextField::setEnabled(bool on) {
    enabled_ = on;
    text_->enabled_ = on;
    back_->enabled_ = on;
    scroll_->enabled_ = on;
}

// @yo2 0x005b1720 CWindowTaskTextField::onControlEvent: the scroll bar moved
void CWindowTaskTextField::onControlEvent(CWindowTaskControll*) {
    text_->setFirstLine(scroll_->value_);
    layout();
    if (enabled_ && mediator_)
        mediator_->onControlEvent(this);
}
// @yo2 0x005b0880 CWindowTaskTextField::onControlCommand (as itself)
void CWindowTaskTextField::onControlCommand(CWindowTaskControll*) { mediator_->onControlCommand(this); }
// @yo2 0x005b08c0 CWindowTaskTextField::mediatorSlot2 (as itself)
void CWindowTaskTextField::mediatorSlot2(CWindowTaskControll*) { mediator_->mediatorSlot2(this); }
// @yo2 0x005b0900 CWindowTaskTextField::mediatorSlot3 (as itself)
void CWindowTaskTextField::mediatorSlot3(CWindowTaskControll*) {
    mediator_->mediatorSlot3(this);
}

// @yo2 0x005b6a90 CWindowTaskSwitch::create
CWindowTaskSwitch* CWindowTaskSwitch::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* s = new CWindowTaskSwitch;
    s->mediator_ = mediator;
    return dynamic_cast<CWindowTaskSwitch*>(s->CTask::create(parent, 10000));
}

// =====================================================================================================================
// CWindowTaskBackStripe

// @yo2 0x005a7620 CWindowTaskBackStripe::CWindowTaskBackStripe
CWindowTaskBackStripe::CWindowTaskBackStripe() { setTaskName("しましまの背景(コントロール)"); }

// @yo2 0x005a7550 CWindowTaskBackStripe::create
CWindowTaskBackStripe* CWindowTaskBackStripe::create(CTask* parent, IWindowTaskMediator* mediator, bool multi) {
    auto* b = new CWindowTaskBackStripe;
    b->multi_ = multi;
    b->mediator_ = mediator;
    return dynamic_cast<CWindowTaskBackStripe*>(b->CTask::create(parent, 10000));
}

// @yo2 0x005a7a30 CWindowTaskBackStripe::~CWindowTaskBackStripe
// @yo2 0x005a78d0 CWindowTaskBackStripe deleting destructor
// @yo2 0x005a7900 std::map<int, int> (spans_) destructor (MSVC6 instance)
CWindowTaskBackStripe::~CWindowTaskBackStripe() = default;

// @yo2 0x005a7890 CWindowTaskBackStripe::kind
uint32_t CWindowTaskBackStripe::kind() const { return 7; }

// @yo2 0x005a7bc0 CWindowTaskBackStripe::onInit: 16-pixel rows of window_base_01_c01.png, 70% opaque
bool CWindowTaskBackStripe::onInit() {
    x_ = y_ = 0;
    z_ = 0;
    w_ = 256;
    h_ = 16;
    rowH_ = 16;
    selected_ = -1;
    unk3b0_ = false;
    inheritTransform_ = true;
    vc6::string path = windowDataDir();
    path += "window_base_01_c01.png";
    dup_.setUser(this);
    windowDupCreate(dup_, this, 0, path);
    windowNameTask(windowElement(dup_), "CWindowTaskBackStripeの画像");
    windowElement(dup_)->setDrawMode(BLEND);
    windowElement(dup_)->inheritTransform_ = true;
    windowElement(dup_)->pos_ = {0, 0, 0};
    windowElement(dup_)->scale_.y = 0;
    // (the exe reserves room for 30 tiles in the CDupSprite and in tiles_ here)
    setAlpha(0.7f);
    layout();
    return true;
}

// @yo2 0x005a8850 CWindowTaskBackStripe::onMain
bool CWindowTaskBackStripe::onMain() {
    windowDupClear(dup_);
    for (const WindowDupTile& t : tiles_)
        windowDupAddTile(dup_, t);
    return true;
}

// @yo2 0x005a88e0 CWindowTaskBackStripe::layout
void CWindowTaskBackStripe::layout() {
    pos_ = {x_, y_, z_};
    CElement* d = windowElement(dup_);
    d->scale_ = {w_ * 0.125f, float(rowH_) * 0.125f, 1};
    d->pos_.z = 0;
    rebuild();
}

// @yo2 0x005a8290 CWindowTaskBackStripe::rebuild
void CWindowTaskBackStripe::rebuild() {
    tiles_.clear();
    rowCount_ = static_cast<int32_t>(h_ / float(rowH_));
    if (rowCount_ <= 0)
        return;
    while (flags_.size() < size_t(rowCount_))
        flags_.push_back(0);
    while (flags_.size() > size_t(rowCount_))
        flags_.erase(flags_.end() - 1);
    tiles_.clear();
    rows_.clear();
    if (float(rowH_) <= h_) {
        float y = 0;
        int32_t i = 0;
        int32_t end;
        do {
            int32_t span = rowSpan(i);
            Row r{y, float(span * rowH_), span};
            end = static_cast<int32_t>(y + float(span * rowH_));
            i++;
            y = float(end);
            if (y > h_)
                r.height = y - h_;   // (as the exe does: the overflow, not the visible part)
            rows_.push_back(r);
        } while (float(end + rowH_) <= h_);
    }
    int32_t lines = 0;
    for (size_t k = 0; k < rows_.size(); k++) {
        WindowDupTile t{};
        t.y = float(lines * rowH_);
        t.sx = w_ * 0.125f;
        t.sy = rows_[k].height * 0.125f;
        tiles_.push_back(t);
        lines += rows_[k].span;
    }
    applyLooks(0);
}

// @yo2 0x005a86c0 CWindowTaskBackStripe::applyLooks: plain, every other row from firstItem's parity shaded, selection
void CWindowTaskBackStripe::applyLooks(int32_t firstItem) {
    for (WindowDupTile& t : tiles_)
        t.u = t.v = t.w = t.h = 8;
    for (size_t i = size_t(firstItem % 2 == 0 ? 0 : 1); i < tiles_.size(); i += 2)
        tiles_[i].u = 56;
    for (size_t i = 0; i < tiles_.size(); i++)
        if (flags_[i] == 1) {
            tiles_[i].u = 72;
            tiles_[i].v = 16;
        }
}

// @yo2 0x005a8620 CWindowTaskBackStripe::select (multi: toggles)
void CWindowTaskBackStripe::select(int32_t row) {
    if (row < 0 || size_t(row) >= flags_.size())
        return;
    if (multi_) {
        flags_[row] = !flags_[row];
        selected_ = row;
        return;
    }
    if (selected_ >= 0 && selected_ < rowCount_)
        flags_[selected_] = 0;
    flags_[row] = 1;
    selected_ = row;
}

// (inlined in CWindowTaskListbox)
void CWindowTaskBackStripe::clearSelection() {
    for (int32_t i = 0; i < rowCount_; i++)
        flags_[i] = 0;
    selected_ = -1;
}

// @yo2 0x005a8d30 CWindowTaskBackStripe::isSelected
bool CWindowTaskBackStripe::isSelected(int32_t row) const {
    return row >= 0 && size_t(row) < flags_.size() && flags_[row] != 0;
}

// @yo2 0x005a89a0 CWindowTaskBackStripe::setRowSpan (std::map insert, inlined)
void CWindowTaskBackStripe::setRowSpan(int32_t row, int32_t lines) {
    if (row < 0 || row >= rowCount_)
        return;
    spans_[row] = lines;
}

// @yo2 0x005a8b20 CWindowTaskBackStripe::rowSpan
int32_t CWindowTaskBackStripe::rowSpan(int32_t row) const {
    const int32_t* v = spans_.find(row);
    return v ? *v : 1;
}

// @yo2 0x005a8ba0 CWindowTaskBackStripe::hitTest
bool CWindowTaskBackStripe::hitTest(float x, float y) {
    Vec3 p = worldTranslation();
    return x > p.x && x < p.x + w_ && y > p.y && y < p.y + h_;
}

// @yo2 0x005a8c40 CWindowTaskBackStripe::handleMessage: a click selects the row under it and tells the list (slot 0);
// a disabled stripe only takes the focus (slot 1)
bool CWindowTaskBackStripe::handleMessage(WindowMsg m) {
    if (m.msg != 0x201)
        return true;
    if (!enabled_) {
        mediator_->onControlCommand(this);
        return true;
    }
    float y = float(m.y) - worldTranslation().y;
    int32_t row = 0;
    // (the exe walks past the last row when the click is below them all)
    while (size_t(row) < rows_.size() && rows_[row].height + rows_[row].top <= y)
        row++;
    select(row);
    mediator_->onControlEvent(this);
    return true;
}

// =====================================================================================================================
// CWindowTaskListbox

// @yo2 0x005b23c0 CWindowTaskListbox::CWindowTaskListbox
CWindowTaskListbox::CWindowTaskListbox() { setTaskName("リストボックス(コントロール)"); }

// @yo2 0x005b22f0 CWindowTaskListbox::create
CWindowTaskListbox* CWindowTaskListbox::create(CTask* parent, IWindowTaskMediator* mediator, bool multi) {
    auto* l = new CWindowTaskListbox;
    l->multi_ = multi;
    l->mediator_ = mediator;
    return dynamic_cast<CWindowTaskListbox*>(l->CTask::create(parent, 10000));
}

// @yo2 0x005b28c0 CWindowTaskListbox::~CWindowTaskListbox
// @yo2 0x005b2870 CWindowTaskListbox deleting destructor
CWindowTaskListbox::~CWindowTaskListbox() = default;

// @yo2 0x005b2720 CWindowTaskListbox::kind
uint32_t CWindowTaskListbox::kind() const { return 0x18; }

// @yo2 0x005b2740 CWindowTaskListbox::hitTest
bool CWindowTaskListbox::hitTest(float, float) { return false; }

// @yo2 0x005b26f0 CWindowTaskListbox::setAlpha (the background's)
void CWindowTaskListbox::setAlpha(float a) { stripe_->setAlpha(a); }

// @yo2 0x005b2a30 CWindowTaskListbox::onInit: the text, the hidden measuring text, a scroll bar, the background
bool CWindowTaskListbox::onInit() {
    inheritTransform_ = true;
    posZ_ = 0;
    w_ = h_ = 256;
    topItem_ = topLine_ = 0;
    selected_ = -1;
    text_.setUser(this);
    text_.set(CWindowTaskText::create(this, this));
    windowNameTask(text_.get(), "CWindowTaskListboxのテキスト");
    text_->setAlign(1);
    measure_.setUser(this);
    measure_.set(CWindowTaskText::create(this, this));
    windowNameTask(measure_.get(), "CWindowTaskListboxの行数カウント用テキストタスク(常時非表示)");
    showElement(measure_.get(), false, true);
    scroll_.setUser(this);
    scroll_.set(CWindowTaskScroll::create(this, this, 0));
    windowNameTask(scroll_.get(), "CWindowTaskListboxのスクロールバー");
    stripe_.setUser(this);
    stripe_.set(CWindowTaskBackStripe::create(this, this, multi_));
    windowNameTask(stripe_.get(), "CWindowTaskListboxの背景");
    maxSelect_ = 9999;
    unk3f4_ = 0;
    setAlpha(0.7f);
    multiLine_ = true;
    autoLayout_ = true;
    lastSender_ = 0;
    layout();
    return true;
}

// @yo2 0x005b2cb0 CWindowTaskListbox::layout (the exe wraps parts in profiler scopes)
void CWindowTaskListbox::layout() {
    if (!autoLayout_)
        return;
    pos_ = {float(x_), float(y_), posZ_};
    CWindowTaskBackStripe* s = stripe_.get();
    s->x_ = s->y_ = 0;
    s->pos_.x = s->pos_.y = 0;
    s->w_ = float(w_);
    s->h_ = float(h_);
    s->layout();
    s->z_ = 0;
    s->pos_.z = 0;
    CWindowTaskScroll* b = scroll_.get();
    b->length_ = float(h_);
    b->y_ = 0;
    b->x_ = float(w_ - 16);
    b->z_ = 2;
    b->layout();
    measure_->setArea(w_ - 16, h_);
    int32_t extra = lineTotal() - static_cast<int32_t>(s->h_ / float(s->rowH_));
    b->setMax(extra < 0 ? 0 : extra);
    // "表示するテキスト作ってる": every item on its own line
    std::u16string all;
    for (const vc6::wstring& item : *items_) {
        all += std::u16string_view(item);
        all += u'\n';
    }
    text_->setText(all.c_str());
    text_->posZ_ = 2;
    text_->pos_.z = 2;
    text_->setArea(w_ - 16, h_);
    int32_t rows = static_cast<int32_t>(s->h_ / float(s->rowH_));
    scrollToLine(lineTotal() > rows ? b->value_ : 0);
    applyRowSpans();
    s->applyLooks(topItem_);
    b->page_ = static_cast<int32_t>(s->h_ / float(s->rowH_));
    Vec3 p = worldTranslation();
    b->setWheelArea(p.x, p.y, float(w_), float(h_));
    clean_ = true;
}

// @yo2 0x005b3ca0 CWindowTaskListbox::addItem
void CWindowTaskListbox::addItem(const WChar* s) {
    items_->push_back(vc6::wstring(s));
    int32_t lines = itemLines(static_cast<int32_t>(items_->size()) - 1);
    lineCounts_.push_back(lines);
    // @yo2 0x005b3dd0 CWindowTaskListbox::addItem tail: a selection flag, a re-layout if the item is in view, the range
    selFlags_.push_back(0);
    clean_ = false;
    if (selFlags_.size() <= size_t(topItem_ + stripe_->rowCount_))
        layout();
    int32_t extra = lineTotal() - static_cast<int32_t>(stripe_->h_ / float(stripe_->rowH_));
    scroll_->setMax(extra < 0 ? 0 : extra);
}

// @yo2 0x005b3f40 CWindowTaskListbox::removeItem
void CWindowTaskListbox::removeItem(int32_t item) {
    if (item < 0)
        return;
    if (size_t(item) < items_->size())
        items_->erase(items_->begin() + item);
    if (item < itemCount()) {
        selFlags_.erase(selFlags_.begin() + item);
        lineCounts_.erase(lineCounts_.begin() + item);
        clean_ = false;
        if (item == selected_)
            selected_ = -1;
        layout();
    }
}

// @yo2 0x005b40d0 CWindowTaskListbox::clear
void CWindowTaskListbox::clear() {
    items_->clear();
    selFlags_.clear();
    clean_ = false;
    selected_ = -1;
    lineCounts_.clear();
    layout();
}

// @yo2 0x005b4eb0 CWindowTaskListbox::setItem
void CWindowTaskListbox::setItem(int32_t item, const WChar* s) {
    if (item < 0 || size_t(item) >= items_->size())
        return;
    (*items_)[item] = vc6::wstring(s);
    if (multiLine_) {
        measure_->setArea(w_ - 16, h_);
        measure_->setText((*items_)[item].c_str());
        lineCounts_[item] = measure_->lineCount(float(w_ - 16));
    } else {
        lineCounts_[item] = 1;
    }
    layout();
}

// @yo2 0x005b4d80 CWindowTaskListbox::recountLines
void CWindowTaskListbox::recountLines() {
    measure_->setArea(w_ - 16, 9999);
    for (size_t i = 0; i < items_->size(); i++) {
        if (multiLine_) {
            measure_->setText((*items_)[i].c_str());
            lineCounts_[i] = measure_->lineCount(float(w_ - 16));
        } else {
            lineCounts_[i] = 1;
        }
    }
}

// @yo2 0x005b5220 CWindowTaskListbox::setFontSize (16-pixel lines: the gap makes up the rest)
void CWindowTaskListbox::setFontSize(int32_t size) {
    text_->setFontSize(size);
    measure_->setFontSize(size);
    text_->setLineGap(16 - size);
}

// @yo2 0x005b4c90 CWindowTaskListbox::itemLines
int32_t CWindowTaskListbox::itemLines(int32_t item) {
    if (!multiLine_)
        return 1;
    if (item < 0 || size_t(item) >= items_->size())
        return -1;
    measure_->setArea(w_ - 16, h_);
    measure_->setText((*items_)[item].c_str());
    return measure_->lineCount(float(w_ - 16));
}

// @yo2 0x005b2840 CWindowTaskListbox::itemCount
int32_t CWindowTaskListbox::itemCount() { return static_cast<int32_t>(selFlags_.size()); }

// @yo2 0x005b3eb0 CWindowTaskListbox::lineTotal (at least one line per item)
int32_t CWindowTaskListbox::lineTotal() {
    int32_t sum = 0;
    for (size_t i = 0; i < items_->size(); i++)
        sum += lineCounts_[i];
    return sum <= int32_t(selFlags_.size()) ? int32_t(selFlags_.size()) : sum;
}

// @yo2 0x005b4b40 CWindowTaskListbox::lineToItem
int32_t CWindowTaskListbox::lineToItem(int32_t line) {
    if (!multiLine_)
        return line;
    if (line == 0)
        return 0;
    int32_t sum = 0;
    for (size_t i = 0; i < items_->size(); i++) {
        sum += lineCounts_[i];
        if (line < sum)
            return int32_t(i);
    }
    if (int32_t(selFlags_.size()) <= line)
        return int32_t(selFlags_.size()) - 1;
    return line;
}

// @yo2 0x005b4c10 CWindowTaskListbox::itemToLine
int32_t CWindowTaskListbox::itemToLine(int32_t item) {
    if (!multiLine_)
        return item;
    int32_t sum = 0;
    for (size_t i = 0; i < items_->size(); i++) {
        if (int32_t(i) == item)
            return sum;
        sum += lineCounts_[i];
    }
    return item;
}

// @yo2 0x005b5040 CWindowTaskListbox::applyRowSpans: the background's rows follow the items' line counts
void CWindowTaskListbox::applyRowSpans() {
    CWindowTaskBackStripe* s = stripe_.get();
    s->spans_.clear();
    int32_t first = itemToLine(topItem_) - topLine_ + itemLines(topItem_);
    s->setRowSpan(0, first < 1 ? 1 : first);
    for (int32_t i = topItem_ + 1; size_t(i) < items_->size(); i++)
        s->setRowSpan(i - topItem_, lineCounts_[i]);
    text_->setFirstLine(topLine_);
    text_->setPageLines(h_ / 16);
}

// @yo2 0x005b2680 CWindowTaskListbox::setEnabled
void CWindowTaskListbox::setEnabled(bool on) {
    enabled_ = on;
    stripe_->enabled_ = on;
    scroll_->enabled_ = on;
    text_->enabled_ = on;
}

// @yo2 0x005b2820 CWindowTaskListbox::reset
void CWindowTaskListbox::reset() { clearSelection(); }

// @yo2 0x005b4800 CWindowTaskListbox::clearSelection
void CWindowTaskListbox::clearSelection() {
    for (uint8_t& f : selFlags_)
        f = 0;
    selected_ = -1;
    stripe_->clearSelection();
    layout();
}

// @yo2 0x005b4760 CWindowTaskListbox::isSelected
bool CWindowTaskListbox::isSelected(int32_t item) {
    return item >= 0 && size_t(item) < selFlags_.size() && selFlags_[item] != 0;
}

// @yo2 0x005b47b0 CWindowTaskListbox::selectedCount
int32_t CWindowTaskListbox::selectedCount() {
    int32_t n = 0;
    for (int32_t i = 0; i < itemCount(); i++)
        if (isSelected(i))
            n++;
    return n;
}

// @yo2 0x005b48a0 CWindowTaskListbox::select (multi: toggles, up to maxSelect_)
void CWindowTaskListbox::select(int32_t item) {
    if (item < 0 || size_t(item) >= selFlags_.size())
        return;
    if (!multi_) {
        if (selected_ >= 0 && size_t(selected_) < selFlags_.size())
            selFlags_[selected_] = 0;
        selFlags_[item] = 1;
    } else {
        selFlags_[item] = !selFlags_[item];
        if (selectedCount() > maxSelect_) {
            selFlags_[item] = !selFlags_[item];
            clean_ = false;
            layout();
            return;
        }
    }
    selected_ = item;
    clean_ = false;
    layout();
}

// @yo2 0x005b49b0 CWindowTaskListbox::scrollToLine: the first item shown, and the background's selection to match
void CWindowTaskListbox::scrollToLine(int32_t line) {
    topItem_ = lineToItem(line);
    topLine_ = line;
    CWindowTaskBackStripe* s = stripe_.get();
    s->clearSelection();
    if (multi_) {
        // (the exe bounds i by the flag count, not topItem_ + i)
        for (int32_t i = 0; i < s->rowCount_ && size_t(i) < selFlags_.size() &&
                            size_t(topItem_ + i) < selFlags_.size();
             i++)
            if (selFlags_[topItem_ + i])
                s->select(i);
    } else {
        s->select(selected_ - topItem_);
    }
    s->applyLooks(topItem_);
}

// @yo2 0x005b41e0 CWindowTaskListbox::onControlEvent ("ColleagueChanged")
void CWindowTaskListbox::onControlEvent(CWindowTaskControll* sender) {
    if (sender == stripe_.task()) {
        select(stripe_->selected_ + topItem_);
        lastSender_ = 1;
    } else if (sender == scroll_.task()) {
        scrollToLine(scroll_->value_);
        lastSender_ = 2;
    }
    clean_ = false;
    layout();
    mediator_->onControlEvent(this);
    if (enabled_)
        mediator_->onControlCommand(this);
}
// @yo2 0x005b2760 CWindowTaskListbox::onControlCommand (as itself)
void CWindowTaskListbox::onControlCommand(CWindowTaskControll*) { mediator_->onControlCommand(this); }
// @yo2 0x005b27a0 CWindowTaskListbox::mediatorSlot2 (as itself)
void CWindowTaskListbox::mediatorSlot2(CWindowTaskControll*) { mediator_->mediatorSlot2(this); }
// @yo2 0x005b27e0 CWindowTaskListbox::mediatorSlot3 (as itself)
void CWindowTaskListbox::mediatorSlot3(CWindowTaskControll*) { mediator_->mediatorSlot3(this); }

// --- CWindowTaskActiveListbox ---

// @yo2 0x005b5360 CWindowTaskActiveListbox::CWindowTaskActiveListbox
CWindowTaskActiveListbox::CWindowTaskActiveListbox() { setTaskName("アクティブリストボックス(コントロール)"); }

// @yo2 0x005b5290 CWindowTaskActiveListbox::create
CWindowTaskActiveListbox* CWindowTaskActiveListbox::create(CTask* parent, IWindowTaskMediator* mediator, bool multi) {
    auto* l = new CWindowTaskActiveListbox;
    l->clicked_ = -1;
    l->multi_ = multi;
    l->mediator_ = mediator;
    return dynamic_cast<CWindowTaskActiveListbox*>(l->CTask::create(parent, 10000));
}

// @yo2 0x005b54f0 CWindowTaskActiveListbox::~CWindowTaskActiveListbox
// @yo2 0x005b54c0 CWindowTaskActiveListbox deleting destructor
CWindowTaskActiveListbox::~CWindowTaskActiveListbox() = default;

// @yo2 0x005b54a0 CWindowTaskActiveListbox::reset
void CWindowTaskActiveListbox::reset() {
    clicked_ = -1;
    clearSelection();
}

// @yo2 0x005b5660 CWindowTaskActiveListbox::onMain: select the 16-pixel row under the mouse; a click remembers it
bool CWindowTaskActiveListbox::onMain() {
    int32_t w = w_;
    if (scroll_->max_ > 0)
        w -= 16;
    itemCount();
    int32_t h = h_;
    int32_t mx, my;
    windowMouse(&mx, &my);
    Vec3 p = worldTranslation();
    if (g_windowFactory->controlAt(mx, my) == stripe_.task()) {
        float fx = float(mx), fy = float(my);
        if (p.x < fx && p.y < fy && fx < float(w) + p.x && fy < float(h) + p.y) {
            int32_t row = 0;
            for (int32_t y = 16; float(y) + p.y <= fy; y += 16)
                row++;
            select(topItem_ + row);
            if (windowMouseLeftPushed()) {
                clicked_ = topItem_ + row;
                if (clicked_ >= itemCount())
                    clicked_ = -1;
            }
            return true;
        }
    }
    reset();
    return true;
}

// --- CWindowTaskTextlist ---

// @yo2 0x005b5880 CWindowTaskTextlist::create (constructor inlined)
CWindowTaskTextlist* CWindowTaskTextlist::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* l = new CWindowTaskTextlist;
    l->mediator_ = mediator;
    return dynamic_cast<CWindowTaskTextlist*>(l->CTask::create(parent, 10000));
}

// @yo2 0x005b5990 CWindowTaskTextlist::~CWindowTaskTextlist
// @yo2 0x005b5960 CWindowTaskTextlist deleting destructor
CWindowTaskTextlist::~CWindowTaskTextlist() = default;

// @yo2 0x005b5b00 CWindowTaskTextlist::onInit: a list box with its background hidden
bool CWindowTaskTextlist::onInit() {
    CWindowTaskListbox::onInit();
    showElement(stripe_.get(), false, true);
    return true;
}

// @yo2 0x005b5b40 CWindowTaskTextlist::setText: one item per line (the exe reads it through a std::wistringstream);
// the last item is added before the layout is switched back on
void CWindowTaskTextlist::setText(const WChar* s) {
    clear();
    std::u16string line;
    autoLayout_ = false;
    for (const WChar* p = s ? s : u""; ; p++) {
        if (*p == 0) {
            addItem(line.c_str());
            autoLayout_ = true;
            return;
        }
        if (*p == u'\n') {
            addItem(line.c_str());
            line.clear();
        } else {
            line += *p;
        }
    }
}

// @yo2 0x005ef1f0 CWindowTaskListbox::setPos (CWindowTask.h inline)
void CWindowTaskListbox::setPos(float x, float y) {
    x_ = static_cast<int32_t>(x);
    y_ = static_cast<int32_t>(y);
    pos_.x = float(x_);
    pos_.y = float(y_);
}

// @yo2 0x005ef240 CWindowTaskListbox::setSize (CWindowTask.h inline)
void CWindowTaskListbox::setSize(float w, float h) {
    h_ = static_cast<int32_t>(h);
    if (float(w_) != w) {
        w_ = static_cast<int32_t>(w);
        recountLines();
    }
    layout();
}

// =====================================================================================================================
// CWindowTaskIconbar

// @yo2 0x005ca800 CWindowTaskIconbar::CWindowTaskIconbar
CWindowTaskIconbar::CWindowTaskIconbar() { setTaskName("アイコンバー(コントロール)"); }

// @yo2 0x005ca740 CWindowTaskIconbar::create
CWindowTaskIconbar* CWindowTaskIconbar::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* b = new CWindowTaskIconbar;
    b->mediator_ = mediator;
    return dynamic_cast<CWindowTaskIconbar*>(b->CTask::create(parent, 10000));
}

// @yo2 0x005caa10 CWindowTaskIconbar::~CWindowTaskIconbar
// @yo2 0x005ca9e0 CWindowTaskIconbar deleting destructor
CWindowTaskIconbar::~CWindowTaskIconbar() = default;

// @yo2 0x005ca9c0 CWindowTaskIconbar::kind
uint32_t CWindowTaskIconbar::kind() const { return 8; }

// @yo2 0x005caaa0 CWindowTaskIconbar::onInit: lit, 32 x 24, 70% opaque (laid out by its owner)
bool CWindowTaskIconbar::onInit() {
    inheritTransform_ = true;
    left_.setUser(this);
    middle_.setUser(this);
    right_.setUser(this);
    vc6::string path = windowDataDir();
    path += "iconbar_01_c01.png";
    framePiece(this, left_, path, "CWindowTaskIconbarの左画像");
    framePiece(this, middle_, path, "CWindowTaskIconbarの中央画像");
    framePiece(this, right_, path, "CWindowTaskIconbarの右画像");
    setRect(windowElement(left_), 0, 0, 8, 24);
    setRect(windowElement(middle_), 8, 0, 8, 24);
    setRect(windowElement(right_), 16, 0, 8, 24);
    x_ = y_ = 0;
    w_ = 32;
    h_ = 24;
    active_ = true;
    setAlpha(0.7f);
    return true;
}

// @yo2 0x005cb6c0 CWindowTaskIconbar::layout
void CWindowTaskIconbar::layout() {
    pos_ = {x_, y_, z_};
    windowElement(left_)->pos_ = {0, 0, 0};
    windowElement(middle_)->pos_ = {8, 0, 0};
    windowElement(middle_)->scale_.x = (w_ - 16) * 0.125f;
    windowElement(right_)->pos_ = {w_ - 8, 0, 0};
    int32_t u = active_ ? 0 : 48;
    setRect(windowElement(left_), u, 0, 8, 24);
    setRect(windowElement(middle_), u + 8, 0, 8, 24);
    setRect(windowElement(right_), u + 16, 0, 8, 24);
}

// @yo2 0x005cb960 CWindowTaskIconbar::hitTest
bool CWindowTaskIconbar::hitTest(float x, float y) {
    Vec3 p = worldTranslation();
    return x > p.x && x < p.x + w_ && y > p.y && y < p.y + h_;
}

// @yo2 0x005cba00 CWindowTaskIconbar::handleMessage
bool CWindowTaskIconbar::handleMessage(WindowMsg m) {
    if (m.msg != 0x201)
        return false;
    mediator_->onControlCommand(this);
    mediator_->beginDrag(this, m.x, m.y);
    return true;
}

// =====================================================================================================================
// CWindowTaskThinChop

// @yo2 0x005cbb40 CWindowTaskThinChop::CWindowTaskThinChop
CWindowTaskThinChop::CWindowTaskThinChop() { setTaskName("上が切れてるウィンドウ(コントロール)"); }

// @yo2 0x005cba80 CWindowTaskThinChop::create
CWindowTaskThinChop* CWindowTaskThinChop::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* f = new CWindowTaskThinChop;
    f->mediator_ = mediator;
    return dynamic_cast<CWindowTaskThinChop*>(f->CTask::create(parent, 10000));
}

// @yo2 0x005cbd90 CWindowTaskThinChop::~CWindowTaskThinChop
// @yo2 0x005cbd60 CWindowTaskThinChop deleting destructor
CWindowTaskThinChop::~CWindowTaskThinChop() = default;

// @yo2 0x005cbd40 CWindowTaskThinChop::kind
uint32_t CWindowTaskThinChop::kind() const { return 2; }

// @yo2 0x005cbe50 CWindowTaskThinChop::onInit: five pieces of window_base_01_c01.png, 70% opaque
bool CWindowTaskThinChop::onInit() {
    inheritTransform_ = true;
    for (CTaskPtr<CSpriteElm>& s : sprites_)
        s.setUser(this);
    vc6::string path = windowDataDir();
    path += "window_base_01_c01.png";
    static const char* const names[5] = {
        "CWindowTaskThinChopの左画像", "CWindowTaskThinChopの右画像", "CWindowTaskThinChopの左下画像",
        "CWindowTaskThinChopの中央下画像", "CWindowTaskThinChopの右下画像",
    };
    for (int i = 0; i < 5; i++)
        framePiece(this, sprites_[i], path, names[i]);
    setAlpha(0.7f);
    layout();
    return true;
}

// @yo2 0x005cccc0 CWindowTaskThinChop::layout
void CWindowTaskThinChop::layout() {
    pos_ = {x_, y_, z_};
    float sy = (h_ - 8) * 0.125f;
    piece(sprites_[0], 0, 0, 0, 8);
    windowElement(sprites_[0])->scale_.y = sy;
    piece(sprites_[1], w_ - 8, 0, 16, 8);
    windowElement(sprites_[1])->scale_.y = sy;
    piece(sprites_[2], 0, h_ - 8, 0, 16);
    piece(sprites_[3], 8, h_ - 8, 8, 16);
    windowElement(sprites_[3])->scale_.x = (w_ - 16) * 0.125f;
    piece(sprites_[4], w_ - 8, h_ - 8, 16, 16);
}

// @yo2 0x005ccac0 CWindowTaskThinChop::hitTest
bool CWindowTaskThinChop::hitTest(float x, float y) {
    Vec3 p = worldTranslation();
    float right = p.x + w_, bottom = p.y + h_;
    if (p.x < x) {
        if (x < right && bottom - 8 < y && y < bottom)   // bottom
            return true;
        if (x < p.x + 8 && p.y < y && y < bottom)   // left
            return true;
    }
    return right - 8 < x && x < right && p.y < y && y < bottom;   // right
}

// @yo2 0x005ccc40 CWindowTaskThinChop::handleMessage
bool CWindowTaskThinChop::handleMessage(WindowMsg m) {
    if (m.msg != 0x201)
        return false;
    mediator_->onControlCommand(this);
    mediator_->beginDrag(this, m.x, m.y);
    return true;
}

// =====================================================================================================================
// CWindowTaskIconHide

// @yo2 0x005cdc80 CWindowTaskIconHide::CWindowTaskIconHide
CWindowTaskIconHide::CWindowTaskIconHide() { setTaskName("×ボタン(コントロール)"); }

// @yo2 0x005cdbc0 CWindowTaskIconHide::create
CWindowTaskIconHide* CWindowTaskIconHide::create(CTask* parent, IWindowTaskMediator* mediator) {
    auto* b = new CWindowTaskIconHide;
    b->mediator_ = mediator;
    return dynamic_cast<CWindowTaskIconHide*>(b->CTask::create(parent, 10000));
}

// @yo2 0x005cde50 CWindowTaskIconHide::~CWindowTaskIconHide
// @yo2 0x005cde20 CWindowTaskIconHide deleting destructor
CWindowTaskIconHide::~CWindowTaskIconHide() = default;

// @yo2 0x005cde00 CWindowTaskIconHide::kind
uint32_t CWindowTaskIconHide::kind() const { return 0xb; }

// @yo2 0x005cdec0 CWindowTaskIconHide::onInit: icon_01_c01.png, 16 x 24
bool CWindowTaskIconHide::onInit() {
    inheritTransform_ = true;
    sprite_.setUser(this);
    vc6::string path = windowDataDir();
    path += "icon_01_c01.png";
    framePiece(this, sprite_, path, "CWindowTaskIconHideの画像");
    x_ = y_ = 0;
    w_ = 16;
    h_ = 24;
    return true;
}

// @yo2 0x005ce5a0 CWindowTaskIconHide::setLook: 0 normal, 1 hover, 2 pressed (16 x 24 cells from (0, 24))
void CWindowTaskIconHide::setLook(int32_t look) {
    if (look < 0 || look > 2)
        return;
    setRect(windowElement(sprite_), look * 16, 24, 16, 24);
}

// @yo2 0x005ce570 CWindowTaskIconHide::layout
void CWindowTaskIconHide::layout() { pos_ = {x_, y_, z_}; }

// @yo2 0x005ce660 CWindowTaskIconHide::hitTest (from the whole-pixel position)
bool CWindowTaskIconHide::hitTest(float x, float y) {
    float x0 = float(static_cast<int32_t>(worldTranslation().x));
    float y0 = float(static_cast<int32_t>(worldTranslation().y));
    return x > x0 && x < x0 + w_ && y > y0 && y < y0 + h_;
}

// @yo2 0x005ce3f0 CWindowTaskIconHide::onMain
bool CWindowTaskIconHide::onMain() {
    setLook(0);
    if (!enabled_)
        return true;
    bool held = leftButtonHeld();
    int32_t mx, my;
    windowMouse(&mx, &my);
    CWindowTaskControll* over = g_windowFactory->controlAt(mx, my);
    if (focused_)
        setLook(1);
    if (over != this)
        return true;
    if (!held) {
        if (hitTest(float(mx), float(my)))
            setLook(1);
        wasUp_ = true;
        return true;
    }
    if (!hitTest(float(mx), float(my))) {
        pressed_ = false;
        wasUp_ = false;
        return true;
    }
    if (wasUp_)
        pressed_ = true;
    setLook(pressed_ ? 2 : 1);
    wasUp_ = false;
    return true;
}

// @yo2 0x005ce720 CWindowTaskIconHide::handleMessage
bool CWindowTaskIconHide::handleMessage(WindowMsg m) {
    if (m.msg == 0x202)   // WM_LBUTTONUP
        mediator_->onControlEvent(this);
    return true;
}
