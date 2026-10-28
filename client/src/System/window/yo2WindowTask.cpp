#include "System/window/yo2WindowTask.h"

#include <algorithm>

#include <windows.h>   // GetAsyncKeyState (platform/win32 off Windows)

#include "System/yo2Debug.h"
#include "System/yo2StringDB.h"

// @yo2 0x005e1300 the TU's static initialiser (empty)
// @yo2 0x005e1320 the TU's static initialiser (atexit for the factory's statics)
CWindowTaskFactory* g_windowFactory;

namespace {

int32_t g_clientX, g_clientY;                 // the exe asks GetClientRect / ScreenToClient each time
int32_t g_clientW = 1024, g_clientH = 768;
int32_t g_imeChars;                           // DAT_0126fa84: WM_CHARs still to drop after IME characters

// The receive() guard both bases share: a message reaching a dead task is a bug, except the "a task died" notice.
void checkReceiver(CTask* self, CTaskMessage* msg) {
    YO2_ASSERT(msg->tag == TM_DESTROYED || (self->alive() && CTask::isValid(self)),
               "error CTask::Receive(%d) not valid %p(%s)", msg->tag, static_cast<void*>(self), self->instName().c_str());
}

}  // namespace

// TODO(System): CTask has no public way to clear another task's lock flags (CTask::lockFlags_, 0x20); the exe
// writes the field directly. Access through a derived type until System adds one.
namespace {
struct TaskLock : CTask {
    static void clear(CTask* t, uint32_t mask) { t->*(&TaskLock::lockFlags_) &= ~mask; }
    static void set(CTask* t, uint32_t mask) { t->*(&TaskLock::lockFlags_) |= mask; }
};
}  // namespace
void windowClearLock(CTask* task, uint32_t mask) { TaskLock::clear(task, mask); }
void windowSetLock(CTask* task, uint32_t mask) { TaskLock::set(task, mask); }

void windowSetClient(int32_t originX, int32_t originY, int32_t width, int32_t height) {
    g_clientX = originX;
    g_clientY = originY;
    g_clientW = width;
    g_clientH = height;
}

vc6::wstring windowWiden(const char* s) {
    std::u16string w;
    for (; s && *s; s++)
        w += static_cast<char16_t>(static_cast<uint8_t>(*s));
    return vc6::wstring(w);
}

vc6::wstring windowText(uint32_t textId) { return windowWiden(g_stringDB ? g_stringDB->get(textId).c_str() : ""); }

// --- CWindowTaskControll ------------------------------------------------------------------------------------------

// @yo2 0x005de6b0 CWindowTaskControll::CWindowTaskControll (registers with the factory)
CWindowTaskControll::CWindowTaskControll() { g_windowFactory->addControl(this); }

// @yo2 0x005de7e0 CWindowTaskControll::~CWindowTaskControll
// @yo2 0x005de790 CWindowTaskControll deleting destructor
CWindowTaskControll::~CWindowTaskControll() {
    YO2_ASSERT(destroyed_, "CWindowTaskControllから派生されたクラスが継承元のOnDestroy()を呼んでいません");
}

// @yo2 0x005dea50 CWindowTaskControll::receive
int32_t CWindowTaskControll::receive(CTaskMessage* msg) {
    checkReceiver(this, msg);
    if (msg->tag == TM_MAIN)
        updateMatrix();
    return CElement::receive(msg);
}

// @yo2 0x005dec20 CWindowTaskControll::onDestroy
void CWindowTaskControll::onDestroy() {
    g_windowFactory->removeControl(this);
    destroyed_ = true;
}

// @yo2 0x005dec50 CWindowTaskControll::z
double CWindowTaskControll::z() const { return worldTranslation().z; }

// @yo2 0x005dec90 CWindowTaskControll::setTextId
void CWindowTaskControll::setTextId(int32_t textId) { setText(windowText(textId).c_str()); }

// --- CWindowTaskModel ---------------------------------------------------------------------------------------------

// @yo2 0x005ded60 CWindowTaskModel::CWindowTaskModel
CWindowTaskModel::CWindowTaskModel() { g_windowFactory->addWindow(this); }

// @yo2 0x005def50 CWindowTaskModel::~CWindowTaskModel
// @yo2 0x005def20 CWindowTaskModel deleting destructor
CWindowTaskModel::~CWindowTaskModel() {
    delete callback_;
    YO2_ASSERT(destroyed_, "CWindowTaskModelを継承したクラスが継承元のOnDestroy()を呼んでいません");
}

// @yo2 0x005df1f0 CWindowTaskModel::receive
int32_t CWindowTaskModel::receive(CTaskMessage* msg) {
    checkReceiver(this, msg);
    if (msg->tag == TM_MAIN)
        updateMatrix();
    return CElement::receive(msg);
}

// @yo2 0x005df4c0 CWindowTaskModel::onDestroy
void CWindowTaskModel::onDestroy() {
    g_windowFactory->removeWindow(this);
    destroyed_ = true;
}

// @yo2 0x005df5d0 CWindowTaskModel::beginDrag (IWindowTaskMediator slot 4: a control grabbed the window)
void CWindowTaskModel::beginDrag(CWindowTaskControll*, int32_t x, int32_t y) {
    dragging_ = true;
    dragX_ = x;
    dragY_ = y;
    g_windowFactory->captured_ = this;
}

// @yo2 0x005df3e0 CWindowTaskModel::setTextA (0x200 characters at most)
void CWindowTaskModel::setTextA(const char* s) {
    vc6::wstring w = windowWiden(s);
    if (w.size() > 0x1ff)
        w.assign(w.c_str(), 0x1ff);
    setText(w.c_str());
}

// @yo2 0x005df750 CWindowTaskModel::setTextId
void CWindowTaskModel::setTextId(int32_t textId) { setText(windowText(textId).c_str()); }

// @yo2 0x005df4f0 CWindowTaskModel::centre: on the parent window, or on the 1024 x 768 screen
void CWindowTaskModel::centre() {
    float w = parent_ ? parent_->w_ : 1024.0f;
    float h = parent_ ? parent_->h_ : 768.0f;
    x_ = (w - w_) * 0.5f;
    y_ = (h - h_) * 0.5f;
    pos_.x = x_;
    pos_.y = y_;
}

// @yo2 0x005df610 CWindowTaskModel::endDrag
void CWindowTaskModel::endDrag() {
    dragging_ = false;
    g_windowFactory->captured_ = nullptr;
}

// @yo2 0x005df640 CWindowTaskModel::drag (x, y in game pixels; the window follows the mouse while dragging)
void CWindowTaskModel::drag(int32_t x, int32_t y) {
    if (!movable_ || !dragging_)
        return;
    int32_t dx = x - dragX_, dy = y - dragY_;
    dragX_ = x;
    dragY_ = y;
    x_ = static_cast<float>(dx) + x_;
    y_ = static_cast<float>(dy) + y_;
    layout();
}

// @yo2 0x005df700 CWindowTaskModel::fadeIn
void CWindowTaskModel::fadeIn(uint32_t mode) { CWindowFadeIn::create(this, this, mode); }

// @yo2 0x005df430 CWindowTaskModel::bringToFront
void CWindowTaskModel::bringToFront() { g_windowFactory->bringToFront(this); }

// @yo2 0x005df450 CWindowTaskModel::isTop
bool CWindowTaskModel::isTop() const { return this == g_windowFactory->topWindow(); }

// @yo2 0x005df480 CWindowTaskModel::setCallback (keeps its own copy)
void CWindowTaskModel::setCallback(const CWindowCallback& cb) {
    delete callback_;
    callback_ = cb.clone();
}

// @yo2 0x005df6d0 CWindowTaskModel::setTopmost
void CWindowTaskModel::setTopmost(bool on) {
    topmost_ = on;
    bringToFront();
}

// --- CWindowFader / CWindowFadeIn ---------------------------------------------------------------------------------

CWindowFader::CWindowFader() {
    setTaskName("ウィンドウフェーダー");
    window_.setUser(this);
}

// @yo2 0x005dfbc0 CWindowFader::~CWindowFader
// @yo2 0x005dfb70 CWindowFader deleting destructor
CWindowFader::~CWindowFader() = default;

// @yo2 0x005dfff0 CWindowFader::onInit: remember where the window is, put it at the start values, show it
bool CWindowFader::onInit() {
    CWindowTaskModel* w = window_.get();
    frame_ = mode_ == 0 ? w->fadeFrames_ : 0;
    x_ = static_cast<int32_t>(w->x_);
    y_ = static_cast<int32_t>(w->y_);
    w_ = static_cast<int32_t>(w->w_);
    h_ = static_cast<int32_t>(w->h_);
    alpha_ = w->color_[3];
    if (mode_ & MOVE) {
        w->pos_.x = static_cast<float>(w->fadeX_);
        w->pos_.y = static_cast<float>(w->fadeY_);
    }
    if (mode_ & RESIZE) {
        w->w_ = static_cast<float>(w->fadeW_);
        w->h_ = static_cast<float>(w->fadeH_);
        w->layout();
    }
    if (mode_ & ALPHA)
        w->color_[3] = w->fadeAlpha_;
    w->bringToFront();
    windowClearLock(w, 2);
    w->setDisp(true, true);
    return true;
}

// @yo2 0x005e0210 CWindowFader::onMain: one step from the start values back to the remembered ones; done after
// fadeFrames_ frames (or at once when mode_ is 0)
bool CWindowFader::onMain() {
    CWindowTaskModel* w = window_.get();
    if (mode_ == 0 || w->fadeFrames_ <= frame_) {
        w->x_ = w->pos_.x = static_cast<float>(x_);
        w->y_ = w->pos_.y = static_cast<float>(y_);
        w->w_ = static_cast<float>(w_);
        w->h_ = static_cast<float>(h_);
        w->layout();
        w->color_[3] = alpha_;
        return false;
    }
    float t = static_cast<float>(frame_) / static_cast<float>(w->fadeFrames_);
    float s = 1.0f - t;
    if (mode_ & MOVE) {
        w->pos_.x = static_cast<float>(w->fadeX_) * s + static_cast<float>(x_) * t;
        w->pos_.y = static_cast<float>(w->fadeY_) * s + static_cast<float>(y_) * t;
    }
    if (mode_ & RESIZE) {
        w->h_ = static_cast<float>(w->fadeH_) * s + static_cast<float>(h_) * t;
        w->w_ = static_cast<float>(w->fadeW_) * s + static_cast<float>(w_) * t;
        w->layout();
    }
    if (mode_ & ALPHA)
        w->color_[3] = w->fadeAlpha_ * s + t * alpha_;
    frame_++;
    return true;
}

// @yo2 0x005dfdf0 CWindowFadeIn::~CWindowFadeIn (shares CWindowFader's body)
// @yo2 0x005dfdc0 CWindowFadeIn deleting destructor
CWindowFadeIn::CWindowFadeIn() = default;

// @yo2 0x005df820 CWindowFadeIn::create (priority 10000)
CWindowFadeIn* CWindowFadeIn::create(CTask* parent, CWindowTaskModel* window, uint32_t mode) {
    auto* f = new CWindowFadeIn;
    f->window_.set(window);
    f->mode_ = mode;
    return dynamic_cast<CWindowFadeIn*>(f->CTask::create(parent, 10000));
}

// --- CWindowTaskFactory -------------------------------------------------------------------------------------------

// @yo2 0x005e10d0 CWindowTaskFactory::create
void CWindowTaskFactory::create() {
    g_windowFactory = new CWindowTaskFactory;
    g_windowFactory->dataDir_ = "data/common/window/";
    g_windowFactory->captured_ = nullptr;
}

// @yo2 0x005e1390 CWindowTaskFactory::~CWindowTaskFactory
CWindowTaskFactory::~CWindowTaskFactory() = default;

// @yo2 0x005e1480 CWindowTaskFactory::addControl
// vector<CWindowTaskControll*> growth helpers inlined by push_back:
// @yo2 0x005e3700 destroy<CWindowTaskControll**>
// @yo2 0x005e3720 uninitialized_copy<CWindowTaskControll**>
// @yo2 0x005e3760 uninitialized_fill_n<CWindowTaskControll**>
// @yo2 0x005e37a0 construct<CWindowTaskControll*>
void CWindowTaskFactory::addControl(CWindowTaskControll* c) { controls_.push_back(c); }

// @yo2 0x005e16a0 CWindowTaskFactory::removeControl (the first entry only)
void CWindowTaskFactory::removeControl(CWindowTaskControll* c) {
    for (CWindowTaskControll** it = controls_.begin(); it != controls_.end(); ++it)
        if (*it == c) {
            controls_.erase(it);
            return;
        }
}

// @yo2 0x005e1710 control order: larger z first; every control in the list must still be alive
static bool controlBefore(CWindowTaskControll* a, CWindowTaskControll* b) {
    a->z();
    b->z();
    YO2_ASSERT(a->alive() && CTask::isValid(a), "無効になったコントロールが残ってます");
    YO2_ASSERT(b->alive() && CTask::isValid(b), "無効になったコントロールが残ってます");
    YO2_ASSERT(a != nullptr, "無効になったコントロールが残ってます");
    YO2_ASSERT(b != nullptr, "無効になったコントロールが残ってます");
    return b->z() < static_cast<float>(a->z());
}

// @yo2 0x005e1b90 CWindowTaskFactory::sortControls
// @yo2 0x005e3820 std::_Sort<CWindowTaskControll**> (the exe's introsort)
// @yo2 0x005e39e0 std::_Unguarded_partition<CWindowTaskControll**>
// ponytail: std::sort, so controls at the same z may end up in a different order than the exe's sort
void CWindowTaskFactory::sortControls() { std::sort(controls_.begin(), controls_.end(), controlBefore); }

// @yo2 0x005e1ee0 CWindowTaskFactory::addWindow
void CWindowTaskFactory::addWindow(CWindowTaskModel* w) {
    for (CWindowTaskModel* o : windows_)
        YO2_ASSERT(o != w, "ウインドウの2重登録");
    insertWindow(w);
    sortControls();
    for (CWindowTaskModel* o : windows_)
        if (o->modal_ && o != w)
            o->applyZ();
}

// @yo2 0x005e3630 list<CWindowTaskModel*>::insert
// @yo2 0x005e2340 CWindowTaskFactory::insertWindow: in front of the first window that isn't topmost (topmost ones at
// the very front), then every window's z again
void CWindowTaskFactory::insertWindow(CWindowTaskModel* w) {
    for (CWindowTaskModel* o : windows_)
        YO2_ASSERT(o != w, "ウインドウの2重登録");
    w->z_ = static_cast<float>(static_cast<int32_t>(windows_.size()) * 50 + 51003);
    if (w->topmost_) {
        windows_.push_front(w);
    } else {
        auto it = windows_.begin();
        while (it != windows_.end() && (*it)->topmost_)
            ++it;
        windows_.insert(it, w);
    }
    renumber();
    sortControls();
}

// @yo2 0x005e20f0 CWindowTaskFactory::renumber: the back window gets 51003, each one in front of it 50 more
void CWindowTaskFactory::renumber() {
    int32_t z = 51003;
    for (auto it = windows_.rbegin(); it != windows_.rend(); ++it, z += 50)
        (*it)->z_ = static_cast<float>(z);
}

// @yo2 0x005e36b0 list<CWindowTaskModel*>::erase
// @yo2 0x005e2600 CWindowTaskFactory::unlinkWindow
void CWindowTaskFactory::unlinkWindow(CWindowTaskModel* w) {
    for (auto it = windows_.begin(); it != windows_.end(); ++it)
        if (*it == w) {
            windows_.erase(it);
            break;
        }
    renumber();
    applyModalZ();
    sortControls();
}

// @yo2 0x005e20a0 CWindowTaskFactory::removeWindow
void CWindowTaskFactory::removeWindow(CWindowTaskModel* w) {
    if (captured_ == w)
        captured_ = nullptr;
    unlinkWindow(w);
    applyModalZ();
    sortControls();
}

// @yo2 0x005e2140 CWindowTaskFactory::bringToFront (pinned windows stay where they are)
void CWindowTaskFactory::bringToFront(CWindowTaskModel* w) {
    if (topWindow() == w || w->pinned_)
        return;
    unlinkWindow(w);
    for (CWindowTaskModel* o : windows_)
        YO2_ASSERT(o != w, "ウインドウの2重登録");
    insertWindow(w);
    applyModalZ();
    sortControls();
}

// @yo2 0x005e26c0 CWindowTaskFactory::applyModalZ
void CWindowTaskFactory::applyModalZ() {
    for (CWindowTaskModel* o : windows_)
        if (o->modal_)
            o->applyZ();
}

// @yo2 0x005e2e90 CWindowTaskFactory::destroyAllWindows (CWindowTaskBase.h)
void CWindowTaskFactory::destroyAllWindows() {
    while (!windows_.empty())
        windows_.front()->destroy(__FILE__, 300);
}

// @yo2 0x005e2bb0 CWindowTaskFactory::topWindow: the front-most visible window
CWindowTaskModel* CWindowTaskFactory::topWindow() const {
    for (CWindowTaskModel* o : windows_)
        if (o && o->isVisible(false))
            return o;
    return nullptr;
}

// @yo2 0x005e2bf0 CWindowTaskFactory::controlAt
CWindowTaskControll* CWindowTaskFactory::controlAt(int32_t x, int32_t y) const {
    for (CWindowTaskControll* c : controls_)
        if (c->isVisible(false) && c->enabled_ && c->hitTest(static_cast<float>(x), static_cast<float>(y)))
            return c;
    return nullptr;
}

// @yo2 0x005e2e10 CWindowTaskFactory::wheelControlAt
CWindowTaskControll* CWindowTaskFactory::wheelControlAt(int32_t x, int32_t y) const {
    for (CWindowTaskControll* c : controls_)
        if (c->isVisible(false) && c->enabled_ && c->wheelHitTest(static_cast<float>(x), static_cast<float>(y)))
            return c;
    return nullptr;
}

// @yo2 0x005e2d80 CWindowTaskFactory::focusedControl: the focused control of the top window or in front of it
CWindowTaskControll* CWindowTaskFactory::focusedControl() const {
    CWindowTaskModel* top = topWindow();
    if (!top)
        return nullptr;
    float topZ = top->z_;
    for (CWindowTaskControll* c : controls_) {
        c->z();
        if (topZ <= c->z() && c->focused_ == 1)
            return c;
    }
    return nullptr;
}

// @yo2 0x005e2cb0 CWindowTaskFactory::setFocus: one focused control per 50-wide z band (= per window)
void CWindowTaskFactory::setFocus(CWindowTaskControll* c) {
    sortControls();
    int32_t band = static_cast<int32_t>(c->z()) / 50 * 50;
    for (CWindowTaskControll* o : controls_) {
        double z = o->z();
        if (band < z && o->z() < band + 50)
            o->focused_ = 0;
    }
    c->focused_ = 1;
}

// @yo2 0x005e2700 CWindowTaskFactory::dispatch: one Win32 message to the control it is for. Mouse positions are
// scaled from the client area to 1024 x 768; button messages go to the control under the mouse, the wheel to the
// control taking it there, keys and IME messages to the focused control. While a window is being dragged it gets
// the mouse moves and the left-button release.
void CWindowTaskFactory::dispatch(uint32_t msg, uint32_t wParam, uint32_t lParam) {
    WindowMsg m{msg, wParam, lParam, 0, 0, 0, 0, {}, 0, 0};
    CWindowTaskControll* target = nullptr;
    auto mouse = [&](int32_t px, int32_t py) {
        m.x = static_cast<int32_t>(1024.0 / g_clientW * px);
        m.y = static_cast<int32_t>(768.0 / g_clientH * py);
        if (wParam & 1)
            m.lButton = 1;
        if (wParam & 2)
            m.rButton = 1;
    };
    switch (msg) {
    case 0x100:   // WM_KEYDOWN
    case 0x101:   // WM_KEYUP
        m.key = wParam;
        target = focusedControl();
        break;
    case 0x102:   // WM_CHAR
        m.ch = wParam;
        if (g_imeChars > 0) {
            g_imeChars--;   // already delivered as WM_IME_CHAR
            break;
        }
        target = focusedControl();
        break;
    case 0x10d:   // WM_IME_ENDCOMPOSITION
    case 0x10f:   // WM_IME_COMPOSITION
    case 0x282:   // WM_IME_NOTIFY
        target = focusedControl();
        break;
    case 0x286:   // WM_IME_CHAR: a single-byte one is delivered as WM_CHAR; skip the WM_CHAR(s) Windows sends after it
        target = focusedControl();
        if (((wParam & 0xffff) >> 8) == 0) {
            m.msg = 0x102;
            g_imeChars++;
        } else {
            g_imeChars += 2;
        }
        break;
    case 0x200:   // WM_MOUSEMOVE
        mouse(lParam & 0xffff, lParam >> 16);
        if (captured_)
            captured_->drag(m.x, m.y);
        break;
    case 0x202:   // WM_LBUTTONUP
        if (captured_)
            captured_->endDrag();
        [[fallthrough]];
    case 0x201:   // WM_LBUTTONDOWN
    case 0x203:   // WM_LBUTTONDBLCLK
    case 0x204:   // WM_RBUTTONDOWN
    case 0x205:   // WM_RBUTTONUP
    case 0x207:   // WM_MBUTTONDOWN
    case 0x208:   // WM_MBUTTONUP
        mouse(lParam & 0xffff, lParam >> 16);
        sortControls();
        target = controlAt(m.x, m.y);
        break;
    case 0x20a:   // WM_MOUSEWHEEL: lParam is in screen coordinates
        mouse(static_cast<int32_t>(lParam & 0xffff) - g_clientX, static_cast<int32_t>(lParam >> 16) - g_clientY);
        sortControls();
        target = wheelControlAt(m.x, m.y);
        break;
    }
    if (target && target->enabled_)
        target->handleMessage(m);
}

// @yo2 0x005e2ed0 CWindowTaskFactory::dumpWindows (debug trace, empty in the shipped exe)
void CWindowTaskFactory::dumpWindows() const {
    yo2Trace("\n----WindowModel--------\n");
    yo2Trace("総数=%d\n", static_cast<int>(windows_.size()));
    for (CWindowTaskModel* o : windows_)
        yo2Trace("InsName=%s, TaskName=%s, z=%d,  Addr=%X,  Resize=%6.0lfns\n", o->instName().c_str(),
                 o->taskName().c_str(), static_cast<int>(o->z_), static_cast<void*>(o), 0.0);
}

// @yo2 0x005e3030 CWindowTaskFactory::dumpControls (debug trace, empty in the shipped exe)
void CWindowTaskFactory::dumpControls() const {
    yo2Trace("\n----WindowControll----\n");
    yo2Trace("総数=%d\n", static_cast<int>(controls_.size()));
    for (CWindowTaskControll* c : controls_) {
        yo2Trace("InsName=%s, TaskName=%s, z=%d ", c->instName().c_str(), c->taskName().c_str(), static_cast<int>(c->z()));
        if (c->focused_ == 1)
            yo2Trace("focus=TRUE");
        yo2Trace("\n");
    }
}

// --- CWindowTaskDebug ---------------------------------------------------------------------------------------------

// @yo2 0x005e3120 CWindowTaskDebug::create
CWindowTaskDebug* CWindowTaskDebug::create(CTask* parent) {
    auto* t = new CWindowTaskDebug;
    t->setTaskName("ウィンドウシステムのデバッグ用タスク");
    return dynamic_cast<CWindowTaskDebug*>(t->CTask::create(parent, 10000));
}

// @yo2 0x005e3420 CWindowTaskDebug::~CWindowTaskDebug
// @yo2 0x005e33f0 CWindowTaskDebug deleting destructor
// @yo2 0x005e32e0 CWindowTaskDebug::~CWindowTaskDebug (second copy of the same body, create's unwind)
CWindowTaskDebug::~CWindowTaskDebug() = default;

// @yo2 0x005e3440 CWindowTaskDebug::onInit
bool CWindowTaskDebug::onInit() {
    keyUp_[0] = keyUp_[1] = keyUp_[2] = true;
    return true;
}

// @yo2 0x005e3460 CWindowTaskDebug::onMain: each dump fires once when its key is pressed with Shift held
bool CWindowTaskDebug::onMain() {
    bool w = GetAsyncKeyState('W') < 0, c = GetAsyncKeyState('C') < 0, x = GetAsyncKeyState('X') < 0;
    bool shift = GetAsyncKeyState(VK_SHIFT) < 0;
    if (!w || !shift)
        keyUp_[0] = true;
    else if (keyUp_[0]) {
        g_windowFactory->dumpWindows();
        keyUp_[0] = false;
    }
    if (!c || !shift)
        keyUp_[1] = true;
    else if (keyUp_[1]) {
        g_windowFactory->dumpControls();
        keyUp_[1] = false;
    }
    if (!x || !shift)
        keyUp_[2] = true;
    else if (keyUp_[2]) {
        // TODO(System): the texture manager's debug dump (0x0059d700, "----texture debug print----")
        keyUp_[2] = false;
    }
    return true;
}
