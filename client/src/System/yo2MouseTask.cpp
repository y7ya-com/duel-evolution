#include "yo2MouseTask.h"

#include "window/yo2WindowTask.h"
#include "yo2App.h"
#include "yo2Debug.h"
#include "yo2SpriteElm.h"

// platform/sdl/platform.h (not includable next to windows.h)
bool platformKeyDownVk(int vk);
void platformShowCursor(bool show);

namespace {
constexpr uint32_t kWmActivateApp = 0x86, kWmMouseWheel = 0x20a;
constexpr int kVkLButton = 1;
constexpr int32_t kCursorSize = 40;  // mausuk_01_c00.png: two 40x40 frames, normal and pressed
}  // namespace

// ---- CMyMouseEx ----

// @yo2 0x006075d0 CMyMouseEx::~CMyMouseEx
// @yo2 0x006077e0 CMyMouseEx deleting destructor
CMyMouseEx::~CMyMouseEx() = default;

// @yo2 0x00613eb0 CMyMouseEx::WndProc: ignore the buttons for 2 frames after activation; count wheel notches
int32_t CMyMouseEx::wndProc(HWND wnd, uint32_t msg, uintptr_t wParam, intptr_t lParam) {
    if (msg == kWmActivateApp) {
        if (wParam)
            setGuardFrames(2);
        return 0;
    }
    if (msg != kWmMouseWheel)
        return YaneMouseEx::wndProc(wnd, msg, wParam, lParam);
    int16_t delta = static_cast<int16_t>(static_cast<uint32_t>(wParam) >> 16);
    wheelMsgs_ += delta >= 1 ? 1 : -1;
    return 0;
}

// @yo2 0x006075f0 CMyMouseEx::Flush: the per-frame poll
void CMyMouseEx::update() {
    int32_t x = x_, y = y_;
    uint32_t b = buttons_;
    prevWheel_ = wheel_;
    wheel_ = wheelMsgs_;
    swallowed_ = false;
    ++stillFrames_;
    flush();
    if (x != x_ || y != y_ || b != buttons_)
        stillFrames_ = 0;
}

// @yo2 0x00607660 CMyMouseEx::GetButton
void CMyMouseEx::getButton(bool& left, bool& right) const {
    left = leftPressed();
    right = rightPressed();
}

// @yo2 0x006076f0 CMyMouseEx::GetButtonUp
void CMyMouseEx::getButtonUp(bool& left, bool& right) const {
    left = leftReleased();
    right = rightReleased();
}

// @yo2 0x00607690 CMyMouseEx::IsPushRButton
bool CMyMouseEx::rightPressed() const { return !swallowed_ && YaneMouseEx::rightPressed(); }

// @yo2 0x006076c0 CMyMouseEx::IsPushLButton
bool CMyMouseEx::leftPressed() const { return !swallowed_ && YaneMouseEx::leftPressed(); }

// @yo2 0x00607720 CMyMouseEx::IsReleaseRButton
bool CMyMouseEx::rightReleased() const { return !swallowed_ && YaneMouseEx::rightReleased(); }

// @yo2 0x00607750 CMyMouseEx::IsReleaseLButton
bool CMyMouseEx::leftReleased() const { return !swallowed_ && YaneMouseEx::leftReleased(); }

// @yo2 0x00607780 CMyMouseEx::wheelDelta
int32_t CMyMouseEx::wheelDelta() const { return wheel_ - prevWheel_; }

// @yo2 0x006077a0 CMyMouseEx::consumeWheel
void CMyMouseEx::consumeWheel() { prevWheel_ = wheel_; }

// @yo2 0x006077c0 CMyMouseEx::swallowButtons
void CMyMouseEx::swallowButtons() { swallowed_ = true; }

struct CMyMouseEx::Layout {
    YO2_AT(CMyMouseEx, swallowed_, 0x28);
    YO2_AT(CMyMouseEx, wheel_, 0x2c);
    YO2_AT(CMyMouseEx, wheelMsgs_, 0x34);
    YO2_AT(CMyMouseEx, stillFrames_, 0x38);
};

// @yo2 0x00613f80 the mouse position (g_app's mouse, GetXY)
void mousePosition(int32_t& x, int32_t& y) { g_app->mouse().getXY(x, y); }

// @yo2 0x00609950 IMouseCursor::mouseX
int32_t IMouseCursor::mouseX() const {
    int32_t x, y;
    mousePosition(x, y);
    return x;
}

// @yo2 0x00609970 IMouseCursor::mouseY
int32_t IMouseCursor::mouseY() const {
    int32_t x, y;
    mousePosition(x, y);
    return y;
}

// ---- CMouseManager ----

// @yo2 0x00613fc0 CMouseManager::CMouseManager
CMouseManager::CMouseManager() { setTaskName("CMouseManager"); }

// @yo2 0x00614120 CMouseManager::~CMouseManager (CElement's teardown inlined)
// @yo2 0x006140f0 CMouseManager deleting destructor
CMouseManager::~CMouseManager() = default;

// @yo2 0x00614300 CMouseManager::Create
CMouseManager* CMouseManager::newChild(CTask* parent) {
    auto* m = new CMouseManager;
    return dynamic_cast<CMouseManager*>(m->create(parent, 10000));
}

// @yo2 0x006143c0 CMouseManager::onInit
bool CMouseManager::onInit() {
    cursor_ = nullptr;
    systemCursor_ = true;
    hideSystemCursor();
    return true;
}

// @yo2 0x006143f0 CMouseManager::onMain: our cursor inside the client area, the Windows one outside it
bool CMouseManager::onMain() {
    if (cursor_) {
        int32_t x, y;
        mousePosition(x, y);
        bool inside = y >= 0;
        if (inside)
            hideSystemCursor();
        else
            showSystemCursor();
        setDisp(inside, true);
        cursor_->update();
    }
    return true;
}

// @yo2 0x00614460 CMouseManager::onDestroy
void CMouseManager::onDestroy() {
    platformShowCursor(true);
    if (cursor_) {
        cursor_->destroy();
        delete cursor_;
    }
    cursor_ = nullptr;
}

// @yo2 0x006144b0 CMouseManager::SetCursor
void CMouseManager::setCursor(IMouseCursor* cursor) {
    if (cursor_)
        cursor_->destroy();
    cursor_ = cursor;
    if (cursor)
        cursor->create(this);
}

// @yo2 0x006144f0 CMouseManager::showSystemCursor
void CMouseManager::showSystemCursor() {
    if (!systemCursor_) {
        platformShowCursor(true);
        systemCursor_ = true;
    }
}

// @yo2 0x00614520 CMouseManager::hideSystemCursor
void CMouseManager::hideSystemCursor() {
    if (systemCursor_) {
        platformShowCursor(false);
        systemCursor_ = false;
    }
}

struct CMouseManager::Layout {
    YO2_AT(CMouseManager, cursor_, 0x340);
    YO2_AT(CMouseManager, systemCursor_, 0x344);
};

// ---- CArrowCursorTask ----

// @yo2 0x00614590 CArrowCursorTask::create
void CArrowCursorTask::create(CElement* parent) {
    vc6::string path = g_windowFactory->dataDir_;
    path += "mausuk_01_c00.png";
    sprite_ = CSpriteElm::newChild(parent, 10000, path);
    sprite_->setInstName("CArrowCursorTask::m_picCursor");
    sprite_->rect_[0] = 0;
    sprite_->rect_[1] = 0;
    sprite_->rect_[2] = kCursorSize;
    sprite_->rect_[3] = kCursorSize;
    sprite_->setDrawMode(CElement::BLEND);
}

// @yo2 0x006148d0 CArrowCursorTask::update: the pressed frame while the left button is down
void CArrowCursorTask::update() {
    sprite_->rect_[0] = platformKeyDownVk(kVkLButton) ? kCursorSize : 0;
    sprite_->rect_[1] = 0;
    sprite_->rect_[2] = kCursorSize;
    sprite_->rect_[3] = kCursorSize;
}

// @yo2 0x00614990 CArrowCursorTask::show
void CArrowCursorTask::show() { sprite_->setDisp(true, true); }

// @yo2 0x006149b0 CArrowCursorTask::hide
void CArrowCursorTask::hide() { sprite_->setDisp(false, true); }

// @yo2 0x00614960 CArrowCursorTask::destroy
void CArrowCursorTask::destroy() { sprite_->destroy(__FILE__, __LINE__); }
