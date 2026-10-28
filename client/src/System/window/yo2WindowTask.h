// The game's window system (src\System\CWindowTaskBase.cpp, CWindowTaskFactory.cpp, CWindowTaskBase.h).
//
// Two kinds of CElement take part. A CWindowTaskModel is a window: it has a size, can be dragged, centred and faded,
// and owns controls as children. A CWindowTaskControll is a control inside one (text, button, list box...): it talks
// to its window through IWindowTaskMediator / IWindowTaskColleague. Both register themselves with the one
// CWindowTaskFactory (g_windowFactory), which keeps the windows in z order (front first, z = 51003 + 50 per window
// behind it, "topmost" windows always in front), the controls sorted by z, which control has the focus, which window
// is being dragged, and routes the Win32 mouse/keyboard/IME messages to the control under the cursor or in focus.
//
// Names of virtual functions are ours (the exe has none); each one says its vtable slot.
#pragma once
#include <cstdint>
#include <string>

#include "System/yo2EasyTask.h"
#include "System/yo2Element.h"
#include "System/yo2TagConverter.h"
#include "System/yo2TaskPtr.h"

class CWindowTaskModel;
class CWindowTaskControll;
using WChar = char16_t;   // the exe's UTF-16 wchar_t (2 bytes on every target)

// --- callbacks: an object + a member function behind one interface (CCallback3 / CCallbackM3 templates) ---------
enum CALLBACK_MESSAGE_TYPE : int32_t {};   // values come with the dialogs that send them

template <class R, class A1, class A2, class A3>
class CCallback3 {
public:
    virtual R call(A1 a1, A2 a2, A3 a3) = 0;   // slot 0
    virtual CCallback3* clone() const = 0;     // slot 1 (the window keeps its own copy)
    // @yo2 0x005ffd50 CCallback3<int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, int> deleting destructor
    // @yo2 0x005e7180 CCallback3<int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, int>::~CCallback3
    virtual ~CCallback3() {}                   // slot 2
};

// Layout note: MSVC 6 stores a single-inheritance member-function pointer in 4 bytes, so the exe's objects are 0xc
// (vptr, object, function); gcc's pointers are 8 bytes. Only these two methods touch the members.
template <class C, class R, class A1, class A2, class A3>
class CCallbackM3 : public CCallback3<R, A1, A2, A3> {
public:
    using Fn = R (C::*)(A1, A2, A3);
    CCallbackM3(C* obj, Fn fn) : obj_(obj), fn_(fn) {}
    // CCallbackM3<C, int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, int>::call (11 copies, one per owner class C):
    //   @yo2 0x005ff8a0 @yo2 0x005ff940 @yo2 0x005ff9e0 @yo2 0x006423f0
    //   @yo2 0x0078f290 @yo2 0x00883020 @yo2 0x008a0810 @yo2 0x008bcaa0
    //   @yo2 0x00a2d050 @yo2 0x00acd810 @yo2 0x00acd8f0
    R call(A1 a1, A2 a2, A3 a3) override { return (obj_->*fn_)(a1, a2, a3); }
    // CCallbackM3::clone (11 copies):
    //   @yo2 0x005ff8d0 @yo2 0x005ff970 @yo2 0x005ffa10 @yo2 0x00642420
    //   @yo2 0x0078f2c0 @yo2 0x00883050 @yo2 0x008a0840 @yo2 0x008bcad0
    //   @yo2 0x00a2d080 @yo2 0x00acd840 @yo2 0x00acd920
    CCallback3<R, A1, A2, A3>* clone() const override { return new CCallbackM3(*this); }
    // CCallbackM3 deleting destructor (11 copies):
    //   @yo2 0x005ffd20 @yo2 0x005ffd80 @yo2 0x005ffdb0 @yo2 0x00642490
    //   @yo2 0x0078f330 @yo2 0x008833c0 @yo2 0x008a08b0 @yo2 0x008bcb40
    //   @yo2 0x00a2d180 @yo2 0x00acdd80 @yo2 0x00acddb0
    ~CCallbackM3() override {}

private:
    C* obj_;   // 0x04
    Fn fn_;    // 0x08
};
// The one shape the windows use: result of a window to its owner (window, message, value). The exe's value is an
// int that sometimes carries a text pointer; intptr_t is that int on i686 and keeps the pointer whole on a 64-bit host.
using CWindowCallback = CCallback3<int, CWindowTaskModel*, CALLBACK_MESSAGE_TYPE, intptr_t>;

// --- the two interfaces between a window and its controls ------------------------------------------------------
class IWindowTaskMediator {
public:
    // A control tells its window (or a parent control forwarding for it) about itself; sender is that control.
    virtual void onControlEvent(CWindowTaskControll* sender) = 0;     // slot 0
    virtual void onControlCommand(CWindowTaskControll* sender) = 0;   // slot 1
    // @yo2 0x00594f90 IWindowTaskMediator::mediatorSlot2 (empty)
    virtual void mediatorSlot2(CWindowTaskControll*) {}               // slot 2
    // @yo2 0x00594fb0 IWindowTaskMediator::mediatorSlot3 (empty)
    virtual void mediatorSlot3(CWindowTaskControll*) {}               // slot 3
    // @yo2 0x00594fd0 IWindowTaskMediator::beginDrag (empty; a window starts a drag)
    virtual void beginDrag(CWindowTaskControll*, int32_t, int32_t) {} // slot 4
};

class IWindowTaskColleague {
public:
    // @yo2 0x00594ff0 IWindowTaskColleague::setMediator
    virtual void setMediator(IWindowTaskMediator* m) { mediator_ = m; }   // slot 0
    IWindowTaskMediator* mediator_ = nullptr;   // +0x04
};

// What the factory hands a control for every routed message (8 dwords, passed by value).
struct WindowMsg {
    uint32_t msg;       // 0x00 WM_*
    uint32_t wParam;    // 0x04
    uint32_t lParam;    // 0x08
    int32_t x, y;       // 0x0c mouse position in game pixels (1024 x 768)
    uint8_t lButton;    // 0x14 MK_LBUTTON was down
    uint8_t rButton;    // 0x15 MK_RBUTTON was down
    uint8_t _pad[2];
    uint32_t key;       // 0x18 WM_KEYDOWN/UP: the virtual key
    uint32_t ch;        // 0x1c WM_CHAR (also IME characters turned into WM_CHAR): the character
};
static_assert(sizeof(WindowMsg) == 0x20, "WindowMsg");

// --- a control ----------------------------------------------------------------------------------------------------
class CWindowTaskControll : public CElement, public IWindowTaskColleague {
public:
    CWindowTaskControll();
    ~CWindowTaskControll() override;
    int32_t receive(CTaskMessage* msg) override;
    void onDestroy() override;

    virtual double z() const;                                 // slot 8: its world z (front = smaller)
    // @yo2 0x00595010 CWindowTaskControll::setAlpha
    virtual void setAlpha(float a) { color_[3] = a; }         // slot 9
    // @yo2 0x00595030 CWindowTaskControll::setName (the exe takes it by value)
    virtual void setName(const vc6::string& s) { name_ = s; } // slot 10
    // @yo2 0x005951e0 CWindowTaskControll::name
    virtual vc6::string name() const { return name_; }        // slot 11
    // @yo2 0x005a8ff0 CWindowTaskControll::kind (0 for the base)
    virtual uint32_t kind() const { return 0; }               // slot 12
    virtual void layout() = 0;                                // slot 13
    // @yo2 0x005aeca0 CWindowTaskControll::handleMessage (the base ignores everything)
    virtual bool handleMessage(WindowMsg) { return false; }   // slot 14
    virtual bool hitTest(float x, float y) = 0;               // slot 15: mouse buttons go to the control under it
    // @yo2 0x00595360 CWindowTaskControll::wheelHitTest (no control takes the wheel unless it overrides this)
    virtual bool wheelHitTest(float, float) { return false; } // slot 16
    // @yo2 0x00595380 CWindowTaskControll::setText (empty in the base)
    virtual void setText(const WChar*) {}                     // slot 17
    virtual void setTextId(int32_t textId);                   // slot 18: the string table's text

    bool destroyed_ = false;   // 0x348 set by onDestroy; the destructor asserts it
    uint8_t unk349_ = 0;       // 0x349
    float z_ = 0;              // 0x34c its z inside the window (layout() puts it into pos_.z)
    bool enabled_ = true;      // 0x350 messages are only routed to enabled controls
    uint8_t focused_ = 0;      // 0x351 has the keyboard focus
    uint8_t unk352_[2] = {};
    vc6::string name_;         // 0x354
    uint32_t unk364_ = 0;      // 0x364
};
YO2_AT(CWindowTaskControll, mediator_, 0x344);
YO2_AT(CWindowTaskControll, destroyed_, 0x348);
YO2_AT(CWindowTaskControll, z_, 0x34c);
YO2_AT(CWindowTaskControll, enabled_, 0x350);
YO2_AT(CWindowTaskControll, focused_, 0x351);
YO2_AT(CWindowTaskControll, name_, 0x354);
YO2_SIZEOF(CWindowTaskControll, 0x368);

// --- a window -----------------------------------------------------------------------------------------------------
class CWindowTaskModel : public CElement, public IWindowTaskMediator {
public:
    CWindowTaskModel();
    ~CWindowTaskModel() override;
    int32_t receive(CTaskMessage* msg) override;
    // @yo2 0x005df3c0 CWindowTaskModel::onInit
    bool onInit() override { return true; }
    void onDestroy() override;
    void beginDrag(CWindowTaskControll*, int32_t x, int32_t y) override;   // IWindowTaskMediator slot 4

    // @yo2 0x005deea0 CWindowTaskModel::applyZ (the factory's order into pos_.z)
    virtual void applyZ() { pos_.z = z_; }                      // slot 8
    virtual void layout() = 0;                                  // slot 9: size/contents changed
    virtual int32_t maxZ() const = 0;                           // slot 10: z of its front-most part (z_ + its depth)
    virtual void setTextA(const char* s);                       // slot 11 (0x005df3e0): widened, then setText
    // @yo2 0x005deec0 CWindowTaskModel::setText (empty in the base)
    virtual void setText(const WChar*) {}                       // slot 12
    virtual void setTextId(int32_t textId);                     // slot 13 (0x005df750)
    virtual void centre();                                      // slot 14 (0x005df4f0)
    // @yo2 0x005deee0 CWindowTaskModel::windowSlot15
    virtual bool windowSlot15() { return true; }                // slot 15
    virtual void endDrag();                                     // slot 16 (0x005df610)
    virtual void drag(int32_t x, int32_t y);                    // slot 17 (0x005df640)
    // @yo2 0x005def00 CWindowTaskModel::windowSlot18
    virtual bool windowSlot18() { return false; }               // slot 18
    virtual void fadeIn(uint32_t mode);                         // slot 19 (0x005df700)
    // @yo2 0x005df730 CWindowTaskModel::windowSlot20 (empty)
    virtual void windowSlot20(uint32_t) {}                      // slot 20

    // @yo2 0x006a5b60 CWindowTaskModel::setSize (CWindowTask.h inline)
    void setSize(float w, float h) {
        w_ = w;
        h_ = h;
        layout();
    }
    void bringToFront();
    bool isTop() const;
    void setCallback(const CWindowCallback& cb);
    void setTopmost(bool on);

    bool destroyed_ = false;   // 0x344 set by onDestroy; the destructor asserts it
    uint32_t unk348_ = 0;      // 0x348
    float z_ = 0;              // 0x34c the factory's order
    bool modal_ = false;       // 0x350 re-applies its z whenever the window list changes
    bool active_ = true;       // 0x351
    bool movable_ = false;     // 0x352
    bool dragging_ = false;    // 0x353
    int32_t dragX_ = 0;        // 0x354 last drag position
    int32_t dragY_ = 0;        // 0x358
    bool topmost_ = false;     // 0x35c always in front of the other windows
    bool pinned_ = false;      // 0x35d bringToFront() leaves it where it is
    uint32_t unk360_ = 0;      // 0x360
    int32_t fadeFrames_ = 5;   // 0x364 length of a CWindowFader run
    uint8_t unk368_ = 0;       // 0x368
    int32_t fadeX_ = 0;        // 0x36c CWindowFader start values
    int32_t fadeY_ = 0;        // 0x370
    int32_t fadeW_ = 0;        // 0x374
    int32_t fadeH_ = 0;        // 0x378
    float fadeAlpha_ = 0;      // 0x37c
    float x_ = 0;              // 0x380 position (top left, game pixels)
    float y_ = 0;              // 0x384
    float w_ = 0;              // 0x388 size
    float h_ = 0;              // 0x38c
    CWindowTaskModel* parent_ = nullptr;   // 0x390 centre() centres on it
    CWindowCallback* callback_ = nullptr;  // 0x394 owned copy
};
YO2_AT(CWindowTaskModel, destroyed_, 0x344);
YO2_AT(CWindowTaskModel, z_, 0x34c);
YO2_AT(CWindowTaskModel, dragX_, 0x354);
YO2_AT(CWindowTaskModel, topmost_, 0x35c);
YO2_AT(CWindowTaskModel, fadeFrames_, 0x364);
YO2_AT(CWindowTaskModel, fadeX_, 0x36c);
YO2_AT(CWindowTaskModel, fadeAlpha_, 0x37c);
YO2_AT(CWindowTaskModel, x_, 0x380);
YO2_AT(CWindowTaskModel, w_, 0x388);
YO2_AT(CWindowTaskModel, parent_, 0x390);
YO2_AT(CWindowTaskModel, callback_, 0x394);
YO2_SIZEOF(CWindowTaskModel, 0x398);

// --- fades a window from its current geometry to the one stored in it (fadeX_..fadeAlpha_) -----------------------
class CWindowFader : public CElement {
public:
    enum : uint32_t { MOVE = 1, RESIZE = 2, ALPHA = 4 };
    CWindowFader();
    ~CWindowFader() override;
    bool onInit() override;
    bool onMain() override;

    CTaskPtr<CWindowTaskModel> window_;   // 0x340
    int32_t frame_ = 0;                   // 0x34c frames done (or the delay when mode_ is 0)
    int32_t x_ = 0, y_ = 0;               // 0x350 where the window was
    int32_t w_ = 0, h_ = 0;               // 0x358
    float alpha_ = 0;                     // 0x360
    uint32_t mode_ = 0;                   // 0x364 MOVE | RESIZE | ALPHA (0: just wait the window's fadeFrames_)
};
YO2_AT(CWindowFader, window_, 0x340);
YO2_AT(CWindowFader, frame_, 0x34c);
YO2_AT(CWindowFader, alpha_, 0x360);
YO2_AT(CWindowFader, mode_, 0x364);
YO2_SIZEOF(CWindowFader, 0x368);

class CWindowFadeIn : public CWindowFader {
public:
    CWindowFadeIn();
    static CWindowFadeIn* create(CTask* parent, CWindowTaskModel* window, uint32_t mode);
};
YO2_SIZEOF(CWindowFadeIn, 0x368);

// --- the factory ----------------------------------------------------------------------------------------------------
class CWindowTaskFactory {
public:
    static void create();     // g_windowFactory
    ~CWindowTaskFactory();

    void addControl(CWindowTaskControll* c);
    void removeControl(CWindowTaskControll* c);
    void sortControls();
    void addWindow(CWindowTaskModel* w);
    void insertWindow(CWindowTaskModel* w);
    void removeWindow(CWindowTaskModel* w);
    void unlinkWindow(CWindowTaskModel* w);
    void bringToFront(CWindowTaskModel* w);
    void renumber();
    void applyModalZ();
    void destroyAllWindows();
    CWindowTaskModel* topWindow() const;
    CWindowTaskControll* controlAt(int32_t x, int32_t y) const;
    CWindowTaskControll* wheelControlAt(int32_t x, int32_t y) const;
    CWindowTaskControll* focusedControl() const;
    void setFocus(CWindowTaskControll* c);
    void dispatch(uint32_t msg, uint32_t wParam, uint32_t lParam);
    void dumpWindows() const;
    void dumpControls() const;

    vc6::vector<CWindowTaskControll*> controls_;   // 0x00 front to back
    vc6::list<CWindowTaskModel*> windows_;         // 0x10 front to back
    vc6::string dataDir_;                          // 0x1c "data/common/window/"
    AtConverter tags_;                             // 0x2c the @-tag styles every text texture uses (vptr 0x00be8a5c)
    CWindowTaskModel* captured_ = nullptr;         // 0x2b0 the window being dragged
};
YO2_AT(CWindowTaskFactory, windows_, 0x10);
YO2_AT(CWindowTaskFactory, dataDir_, 0x1c);
YO2_AT(CWindowTaskFactory, captured_, 0x2b0);
YO2_SIZEOF(CWindowTaskFactory, 0x2b4);

extern CWindowTaskFactory* g_windowFactory;   // DAT_0126fa8c

// task->lockFlags_ &= ~mask (the exe clears bit 2 to let a window that is shown get TM_MAIN again).
void windowClearLock(CTask* task, uint32_t mask);
void windowSetLock(CTask* task, uint32_t mask);   // task->lockFlags_ |= mask (bit 2: hidden, no TM_MAIN)

// The game window's client area, for scaling mouse positions to 1024 x 768 (the exe asks Win32 each time).
void windowSetClient(int32_t originX, int32_t originY, int32_t width, int32_t height);

// A string-table text as UTF-16. TODO(System): CStringDB slot 1 (0x0061fb80) widens with the UI code page; until it
// lands this widens byte by byte.
vc6::wstring windowText(uint32_t textId);
// The same byte-by-byte widening for any narrow string (the exe's 0x006054c0 into a 0x200-character buffer).
vc6::wstring windowWiden(const char* s);

// The window system's debug task: Shift+W dumps the windows, Shift+C the controls, Shift+X the textures, once per press.
class CWindowTaskDebug : public CEasyTask {
public:
    static CWindowTaskDebug* create(CTask* parent);
    ~CWindowTaskDebug() override;
    bool onInit() override;
    bool onMain() override;

    bool keyUp_[3] = {};   // 0x70 W, C, X were up (or Shift was) last frame
    uint32_t unk74_ = 0;   // 0x74 never touched
};
YO2_AT(CWindowTaskDebug, keyUp_, 0x70);
YO2_SIZEOF(CWindowTaskDebug, 0x78);
