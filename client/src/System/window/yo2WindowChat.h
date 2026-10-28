// The chat window (CWindowModelChatWindow, CWindowTask.cpp 0x005f23a0..0x005f5190): tabs of chat logs (one text list
// each) over a back plane, an icon bar with the △ / ▽ buttons, a thin frame and the input line. The window has three
// heights (mode_: 0 tall with tabs, 1 short, 2 only the input line), changed with △ / ▽.
#pragma once
#include <cstdint>
#include <list>

#include "System/window/yo2WindowControls.h"

// CInformationCallback (0x14 bytes): a window callback that remembers, per index, the last value a window reported
// (message 5, value = index << 16 | number); the chat window reports clicked tabs / logs with it.
class CInformationCallback {
public:
    int call(CWindowTaskModel* window, CALLBACK_MESSAGE_TYPE msg, intptr_t value);

    vc6::vector<int32_t> values_;   // 0x00 per index; -1 when never set
    int32_t last_ = 0;              // 0x10 the last index set
};
YO2_SIZEOF(CInformationCallback, 0x14);

// An MSVC6 std::list<std::wstring> kept by value in a movable struct: a std::list behind the head slot.
class WindowWStringQueue {
public:
    WindowWStringQueue() = default;
    WindowWStringQueue(WindowWStringQueue&& o) noexcept : l_(o.l_) { o.l_ = nullptr; }
    WindowWStringQueue(const WindowWStringQueue&) = delete;
    WindowWStringQueue& operator=(const WindowWStringQueue&) = delete;
    ~WindowWStringQueue() { delete l_; }
    std::list<vc6::wstring>& operator*() const { return *l_; }
    std::list<vc6::wstring>* operator->() const { return l_; }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;
    std::list<vc6::wstring>* l_ = new std::list<vc6::wstring>;
    [[maybe_unused]] uint32_t size_ = 0;
};

class CWindowModelChatWindow : public CWindowTaskModel {
public:
    // One tab: its log (a text list of at most maxLines lines) and its tab control.
    struct Tab {
        bool visible = true;                   // 0x00
        CWindowTaskTextlist* list = nullptr;   // 0x04
        CWindowTaskTab* tab = nullptr;         // 0x08
        int32_t maxLines = 100;                // 0x0c
        WindowWStringQueue lines;              // 0x10 the log, oldest first
    };

    // x, y: the window's left and bottom (it grows upward)
    static CWindowModelChatWindow* create(CTask* parent, float x, float y);
    CWindowModelChatWindow();
    ~CWindowModelChatWindow() override;
    bool onInit() override;
    // @yo2 0x005f2650 CWindowModelChatWindow::onMain
    bool onMain() override { return true; }
    void layout() override;
    int32_t maxZ() const override;
    // the parts' notices: △ / ▽ change mode_; a tab (or a log) reports its index through the callback
    void onControlEvent(CWindowTaskControll* sender) override;
    void onControlCommand(CWindowTaskControll* sender) override;
    // @yo2 0x005f26d0 CWindowModelChatWindow::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x005f26f0 CWindowModelChatWindow::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}

    void setGeometry(float x, float y);
    void addTab();
    void addLine(int32_t tab, const WChar* s);   // "ChatSetText": the oldest line goes past maxLines
    void clearTab(int32_t tab);
    void clearAll();
    void setTabText(int32_t tab, const WChar* s);
    void setTabVisible(int32_t tab, bool on);
    void setMaxLines(int32_t tab, int32_t n);
    void setCaret(int32_t col, int32_t line);
    void selectTab(int32_t tab);
    void selectTabAndReport(int32_t tab);
    void setResizable(bool on);   // the △ / ▽ buttons
    void setShowTabs(bool on);
    void setInputOnly(bool on);   // mode 2 and no △ / ▽
    void setInputText(const WChar* s);
    void showTabRow();            // the icon bar lit, the frame under it
    void hideTabRow();            // the icon bar dimmed, the frame out of sight

    CTaskPtr<CWindowTaskBackPlane> back_;      // 0x398
    CTaskPtr<CWindowTaskIconbar> iconbar_;     // 0x3a4
    CTaskPtr<CWindowTaskIconExpand> expand_;   // 0x3b0 △
    CTaskPtr<CWindowTaskIconHide> shrink_;     // 0x3bc ▽ (an IconHide)
    CTaskPtr<CWindowTaskThinChop> frame_;      // 0x3c8
    CTaskPtr<CWindowTaskInput> input_;         // 0x3d4
    WindowVector<Tab> tabs_;                   // 0x3e0
    CWindowTaskTab* curTab_ = nullptr;         // 0x3f0
    CWindowTaskTextlist* curList_ = nullptr;   // 0x3f4
    int32_t curIndex_ = -1;                    // 0x3f8
    uint8_t unk3fc_ = 0, unk3fd_ = 0;          // 0x3fc
    bool showTabs_ = false;                    // 0x3fe (true after onInit)
    bool resizable_ = false;                   // 0x3ff (true after onInit)
    bool inputOnly_ = false;                   // 0x400
    uint32_t unk404_ = 0, unk408_ = 0, unk40c_ = 0, unk410_ = 0;   // 0x404
    int32_t mode_ = 0;                         // 0x414 0 tall, 1 short, 2 input only (1 after onInit)
    int32_t rows_[3] = {};                     // 0x418 text rows per mode: 33, 6, 0
    CInformationCallback info_;                // 0x424
    float baseY_ = 0;                          // 0x438 the top, from y_ (the bottom) and the height
    uint32_t unk43c_ = 0;                      // 0x43c
};
YO2_SIZEOF(CWindowModelChatWindow::Tab, 0x1c);
YO2_AT(CWindowModelChatWindow, back_, 0x398);
YO2_AT(CWindowModelChatWindow, input_, 0x3d4);
YO2_AT(CWindowModelChatWindow, tabs_, 0x3e0);
YO2_AT(CWindowModelChatWindow, curTab_, 0x3f0);
YO2_AT(CWindowModelChatWindow, showTabs_, 0x3fe);
YO2_AT(CWindowModelChatWindow, mode_, 0x414);
YO2_AT(CWindowModelChatWindow, rows_, 0x418);
YO2_AT(CWindowModelChatWindow, info_, 0x424);
YO2_AT(CWindowModelChatWindow, baseY_, 0x438);
YO2_SIZEOF(CWindowModelChatWindow, 0x440);
