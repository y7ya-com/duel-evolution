// yo2shopEntry.cpp: the card shop (CShopScene) and its parts.
//
// The shop is a scene with an NPC clerk (CWaistUpNpc) and a backdrop for the current world, a category window
// (cards / packs / avatar parts) and one item window per category (CShopCardWindow, CShopPackWindow,
// CShopAvatarWindow, all CShopWindowBase), a mileage plate with the player's MP, price plates on the items, digit
// strings drawn from a sprite sheet (CShopNumber / CShopNumberString), and the purchase confirmation window. The item
// list comes from the lobby server (0x5208 REQSHOPITEM -> 0x5213/0x5209/0x5214); a purchase sends the cart (0x5210
// REQSHOPRESULT -> 0x5212 lines + 0x5211). YOLaucher's server emulator (yo2srv/tienda.py) is the reference for
// those messages.
#pragma once
#include <cstdint>
#include <string>

#include "Net/NetLobby.h"
#include "Result/yo2UiStandIns.h"
#include "shop/yo2ShopExtern.h"
#include "shop/yo2ShopVec.h"

// A cart line: an item and how many of it (0x1c bytes; the lobby's ShopPick is the same bytes).
struct ShopCartLine {
    ShopItem item;      // 0x00
    int32_t count;      // 0x14
    int32_t unk18;      // 0x18
};
static_assert(sizeof(ShopCartLine) == 0x1c, "ShopCartLine");

constexpr const char* kShopFile = "C:\\yugionline\\yo2\\client\\src\\shop\\yo2shopEntry.cpp";

// ================================================================ digits

// One digit (or '%', 'M', 'P', '@') cut from data/shop/shop_number_01_c01.png: 15 cells of 16 x 16, 8 per row.
class CShopNumber : public CEasyTask {
public:
    struct Cell {
        int32_t x, y, w, h;
    };
    static CShopNumber* newChild(CTask* parent, CTask* layer);
    CShopNumber();
    ~CShopNumber() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;
    void setGlyph(int32_t cell);
    void setChar(char c);

    CTask* layer_ = nullptr;         // 0x070 the base element's parent
    CTaskPtr<CElement> base_;        // 0x074 "数値テキストベースエレメント"
    Cell cells_[15] = {};            // 0x080
    int32_t glyph_ = 0;              // 0x170
    CTaskPtr<CSpriteElm> sprite_;    // 0x174 "数字"

private:
    struct Layout;
};
YO2_SIZEOF(CShopNumber, 0x180);

// A row of up to 32 CShopNumbers, 14 pixels apart, made and destroyed as the text changes.
class CShopNumberString : public CEasyTask {
public:
    static CShopNumberString* newChild(CTask* parent, CTask* layer);
    CShopNumberString();
    ~CShopNumberString() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;
    void setNumber(int32_t n);
    void setText(const vc6::string& s);
    void setDigit(int32_t i, char c);
    void clearDigit(int32_t i);

    static constexpr int32_t kMaxDigits = 32;

    CTask* layer_ = nullptr;                 // 0x070
    CTaskPtr<CElement> base_;                // 0x074 "数値テキストベースエレメント"
    CShopNumber* digits_[kMaxDigits] = {};   // 0x080
    int32_t unk100_ = 0;                     // 0x100
    int32_t length_ = 0;                     // 0x104 the text's length

private:
    struct Layout;
};
YO2_SIZEOF(CShopNumberString, 0x108);

// ================================================================ plates

// The price tag under an item: a picture button (the tag) with the price ("<n>MP") and a rate text.
class CShopPricePlate : public CEasyTask, public IWindowTaskMediator, public IWindowTaskColleague {
public:
    enum State : int32_t { UP, HOVER, DOWN };
    static CShopPricePlate* newChild(CTask* parent, CTask* layer, IWindowTaskMediator* mediator, int32_t kind);
    CShopPricePlate();
    ~CShopPricePlate() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;
    void onControlEvent(IWindowTaskColleague* sender) override;
    void onControlCommand(IWindowTaskColleague* sender) override;

    void setPrice(int32_t mp);
    void setCount(int32_t n);
    void setIndex(int32_t i);
    void setRate(float rate);
    void setVisible(bool on);
    bool isDown() const;
    void setState(int32_t s);
    int32_t buttonState() const;

    CTask* layer_ = nullptr;                    // 0x07c
    CTaskPtr<CElement> base_;                   // 0x080 "値段プレートベースエレメント"
    int32_t state_ = UP;                        // 0x08c
    CTaskPtr<CWindowTaskPictureSwitch> tag_;    // 0x090 "値段プレート"
    CTaskPtr<CWindowTaskText> priceText_;       // 0x09c
    CTaskPtr<CWindowTaskText> rateText_;        // 0x0a8
    bool enabled_ = false;                      // 0x0b4 clicks are passed on
    int32_t price_ = 0;                         // 0x0b8
    int32_t count_ = 0;                         // 0x0bc
    int32_t index_ = 0;                         // 0x0c0 0 .. count_ - 1
    float rate_ = 0;                            // 0x0c4
    int32_t kind_ = 0;                          // 0x0c8 0: the blue tags (04..06), else 01..03

private:
    struct Layout;
};
YO2_SIZEOF(CShopPricePlate, 0xd0);

// The player's MP: a plate with two right-aligned "<n>MP" texts.
class CShopMileagePlate : public CEasyTask, public IWindowTaskMediator {
public:
    static CShopMileagePlate* newChild(CTask* parent, CTask* layer);
    CShopMileagePlate();
    ~CShopMileagePlate() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;
    void onControlEvent(IWindowTaskColleague* sender) override;
    void onControlCommand(IWindowTaskColleague* sender) override;
    void setTop(int32_t mp);
    void setBottom(int32_t mp);

    CTask* layer_ = nullptr;                   // 0x074
    CTaskPtr<CElement> base_;                  // 0x078
    CTaskPtr<CSpriteElm> plate_;               // 0x084 "商品の種類を載せるプレート"
    CTaskPtr<CWindowTaskShadowText> top_;      // 0x090 "決定テキスト"
    CTaskPtr<CWindowTaskShadowText> bottom_;   // 0x09c "決定テキスト"
    int32_t topMp_ = 0;                        // 0x0a8
    int32_t bottomMp_ = 0;                     // 0x0ac

private:
    struct Layout;
};
YO2_SIZEOF(CShopMileagePlate, 0xb0);

// ================================================================ the purchase confirmation


class CShopConfirmWindow : public CEasyTask, public IWindowTaskMediator {
public:
    enum Result : int32_t { NONE = -1, OK = 0, CANCEL = 1 };
    static constexpr int32_t kLines = 10;

    static CShopConfirmWindow* newChild(CTask* parent, CTask* layer);
    CShopConfirmWindow();
    ~CShopConfirmWindow() override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;
    void onControlEvent(IWindowTaskColleague* sender) override;
    void onControlCommand(IWindowTaskColleague* sender) override;

    void setCart(ShopVec<ShopCartLine> cart);
    void setVisible(bool on);
    void showLines();
    int32_t result() const { return result_; }
    void clearResult() { result_ = NONE; }
    vc6::string message() const;

    CTask* layer_ = nullptr;                          // 0x074
    CTaskPtr<CElement> base_;                         // 0x078
    CTaskPtr<CSpriteElm> frame_;                      // 0x084 "確認ウィンドウ"
    CTaskPtr<CWindowTaskPictureSwitch> ok_;           // 0x090
    CTaskPtr<CWindowTaskPictureSwitch> cancel_;       // 0x09c
    CTaskPtr<CWindowTaskText> okText_;                // 0x0a8
    CTaskPtr<CWindowTaskText> cancelText_;            // 0x0b4
    CTaskPtr<CWindowTaskText> lines_[kLines];         // 0x0c0 "確認ウィンドウ商品名リスト"
    CTaskPtr<CWindowTaskScroll> scroll_;              // 0x138
    CTaskPtr<CWindowTaskText> message_;               // 0x144 "確認ウィンドウの確認テキスト"
    ShopVec<ShopCartLine> cart_;                      // 0x150
    ShopLineVec lineTexts_;                           // 0x160
    int32_t result_ = NONE;                           // 0x170
    int32_t total_ = 0;                               // 0x174 MP

private:
    struct Layout;
};
YO2_SIZEOF(CShopConfirmWindow, 0x178);
