// yo2shopEntry.cpp: CShopConfirmWindow, the purchase confirmation: the cart's lines ("<name>  x<count>  <MP>", ten
// at a time with a scroll bar), a message and OK / Cancel. Its owner polls result().
#pragma once
#include <cstdint>

#include "Net/NetLobby.h"
#include "System/window/yo2WindowControls.h"
#include "shop/yo2ShopVec.h"

// A cart line: an item and how many of it (0x1c bytes; the lobby's ShopPick is the same bytes).
struct ShopCartLine {
    ShopItem item;      // 0x00
    int32_t count;      // 0x14
    int32_t unk18;      // 0x18
};
static_assert(sizeof(ShopCartLine) == 0x1c, "ShopCartLine");

class CShopConfirmWindow : public CEasyTask, public IWindowTaskMediator {
public:
    enum Result : int32_t { NONE = -1, OK = 0, CANCEL = 1 };
    enum { LINES = 10 };

    static CShopConfirmWindow* create(CTask* parent, CTask* layer);
    CShopConfirmWindow();
    ~CShopConfirmWindow() override;
    bool onInit() override;
    // @yo2 0x00aecef0 CShopConfirmWindow::onMain
    bool onMain() override { return true; }
    void onDestroy() override;
    void onControlEvent(CWindowTaskControll* sender) override;
    // @yo2 0x00aeb720 CShopConfirmWindow::onControlCommand (empty)
    void onControlCommand(CWindowTaskControll*) override {}

    void setCart(const ShopVec<ShopCartLine>& cart);
    void setVisible(bool on);
    void showLines();
    int32_t result() const { return result_; }       // @yo2 0x00aed680 CShopConfirmWindow::result
    void clearResult() { result_ = NONE; }            // @yo2 0x00aed6a0 CShopConfirmWindow::clearResult
    vc6::string message() const;

    CTask* layer_ = nullptr;                          // 0x074
    CTaskPtr<CElement> base_;                         // 0x078 at (300, 330), z 51003
    CTaskPtr<CSpriteElm> frame_;                      // 0x084 "確認ウィンドウ"
    CTaskPtr<CWindowTaskPictureSwitch> ok_;           // 0x090
    CTaskPtr<CWindowTaskPictureSwitch> cancel_;       // 0x09c
    CTaskPtr<CWindowTaskText> okText_;                // 0x0a8
    CTaskPtr<CWindowTaskText> cancelText_;            // 0x0b4
    CTaskPtr<CWindowTaskText> lines_[LINES];          // 0x0c0 "確認ウィンドウ商品名リスト"
    CTaskPtr<CWindowTaskScroll> scroll_;              // 0x138
    CTaskPtr<CWindowTaskText> message_;               // 0x144 "確認ウィンドウの確認テキスト"
    ShopVec<ShopCartLine> cart_;                      // 0x150
    ShopLineVec lineTexts_;                           // 0x160
    int32_t result_ = NONE;                           // 0x170 Result
    int32_t total_ = 0;                               // 0x174 MP
};
YO2_AT(CShopConfirmWindow, layer_, 0x074);
YO2_AT(CShopConfirmWindow, base_, 0x078);
YO2_AT(CShopConfirmWindow, frame_, 0x084);
YO2_AT(CShopConfirmWindow, ok_, 0x090);
YO2_AT(CShopConfirmWindow, okText_, 0x0a8);
YO2_AT(CShopConfirmWindow, lines_, 0x0c0);
YO2_AT(CShopConfirmWindow, scroll_, 0x138);
YO2_AT(CShopConfirmWindow, message_, 0x144);
YO2_AT(CShopConfirmWindow, cart_, 0x150);
YO2_AT(CShopConfirmWindow, lineTexts_, 0x160);
YO2_AT(CShopConfirmWindow, result_, 0x170);
YO2_AT(CShopConfirmWindow, total_, 0x174);
YO2_SIZEOF(CShopConfirmWindow, 0x178);
