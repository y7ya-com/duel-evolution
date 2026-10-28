// yo2MouseTask.cpp: the mouse. CMyMouseEx is yaneSDK's CMouseEx (CApp+0x148, polled once per frame) with a wheel
// counter, a one-frame "swallow the buttons" switch and an idle-frame counter. CMouseManager is the element that
// owns the drawn cursor (an IMouseCursor): it hides the Windows cursor while the mouse is over the client area and
// moves its own there. CArrowCursorTask is the plain arrow cursor; the game's usual one is CHandCursorTask (a Swf
// animation, created by CApp).
#pragma once
#include <cstdint>

#include "CD3DDevice.h"
#include "yo2Element.h"

class CSpriteElm;

// yaneSDK's CMouseEx (0x28 bytes) as CMyMouseEx extends it. Its functions live with yaneSDK (tests: stubs.cpp).
class YaneMouseEx {
public:
    virtual ~YaneMouseEx() = default;
    // WM_MOUSEMOVE / button messages update the live button state and click counts (0x005423b0).
    virtual int32_t wndProc(HWND wnd, uint32_t msg, uintptr_t wParam, intptr_t lParam);
    bool flush();                           // 0x00542510: poll position + buttons; true if that failed
    void getXY(int32_t& x, int32_t& y) const { x = x_, y = y_; }   // 0x005425c0
    bool rightPressed() const;              // 0x00542700 went down this frame
    bool leftPressed() const;               // 0x00542730
    bool rightReleased() const;             // 0x005427d0 went up this frame
    bool leftReleased() const;              // 0x00542800
    void setGuardFrames(int32_t n) { guard_ = n; }  // 0x00542850 ignore the buttons for n frames
    void setHook(bool on) { hook_ = on; }   // 0x00542300

protected:
    bool rDownMsg_ = false;    // 0x04 from window messages
    bool lDownMsg_ = false;    // 0x05
    bool rDownPrev_ = false;   // 0x06 last frame's rDown_
    bool lDownPrev_ = false;   // 0x07
    bool hook_ = false;        // 0x08
    int32_t rClicks_ = 0;      // 0x0c
    int32_t lClicks_ = 0;      // 0x10
    bool rDown_ = false;       // 0x14 this frame
    bool lDown_ = false;       // 0x15
    uint32_t buttons_ = 0;     // 0x18 bit 0 right, bit 1 left
    int32_t x_ = 0;            // 0x1c client coordinates
    int32_t y_ = 0;            // 0x20
    int32_t guard_ = 2;        // 0x24
};
YO2_SIZEOF(YaneMouseEx, 0x28);

class CMyMouseEx : public YaneMouseEx {
public:
    CMyMouseEx() = default;
    ~CMyMouseEx() override;

    int32_t wndProc(HWND wnd, uint32_t msg, uintptr_t wParam, intptr_t lParam) override;
    void update();
    void getButton(bool& left, bool& right) const;
    void getButtonUp(bool& left, bool& right) const;
    bool rightPressed() const;
    bool leftPressed() const;
    bool rightReleased() const;
    bool leftReleased() const;
    // The wheel notches turned since the previous frame (+ away from the user).
    int32_t wheelDelta() const;
    void consumeWheel();
    // The buttons read as up until the next update() (a window that took the click calls this).
    void swallowButtons();
    int32_t stillFrames() const { return stillFrames_; }

private:
    bool swallowed_ = false;   // 0x28
    int32_t wheel_ = 0;        // 0x2c notches counted up to this frame
    int32_t prevWheel_ = 0;    // 0x30 ... up to the previous one
    int32_t wheelMsgs_ = 0;    // 0x34 running WM_MOUSEWHEEL count
    int32_t stillFrames_ = 0;  // 0x38 frames without movement or a button change
    struct Layout;
};
YO2_SIZEOF(CMyMouseEx, 0x3c);

// The mouse position as g_app's CMyMouseEx last polled it (y < 0: above the client area).
void mousePosition(int32_t& x, int32_t& y);

// What CMouseManager draws. The exe's interface has no virtual destructor (the manager deletes through it).
class IMouseCursor {
public:
    int32_t mouseX() const;
    int32_t mouseY() const;
    virtual void create(CElement* parent) = 0;
    virtual void update() = 0;
    virtual void show() = 0;
    virtual void hide() = 0;
    virtual void destroy() = 0;
    virtual void setState(int32_t state) = 0;
    virtual ~IMouseCursor() = default;
};

class CMouseManager : public CElement {
public:
    CMouseManager();
    ~CMouseManager() override;
    static CMouseManager* newChild(CTask* parent);

    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;
    // Replaces the cursor (the old one is torn down but, as in the exe, not deleted).
    void setCursor(IMouseCursor* cursor);
    IMouseCursor* cursor() const { return cursor_; }
    void showSystemCursor();
    void hideSystemCursor();

private:
    IMouseCursor* cursor_ = nullptr;  // 0x340
    bool systemCursor_ = false;       // 0x344 the Windows cursor is showing
    struct Layout;
};
YO2_SIZEOF(CMouseManager, 0x348);

class CArrowCursorTask : public IMouseCursor {
public:
    void create(CElement* parent) override;
    void update() override;
    void show() override;
    void hide() override;
    void destroy() override;
    // @yo2 0x00614570 CArrowCursorTask::setState (empty)
    void setState(int32_t) override {}

private:
    CSpriteElm* sprite_ = nullptr;  // 0x04 "CArrowCursorTask::m_picCursor"
};

// CHandCursorTask (0x68 bytes) is built on Swf objects; its folder supplies it (0x00614d00..0x006158b0).
IMouseCursor* yo2NewHandCursor();
