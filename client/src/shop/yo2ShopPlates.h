// yo2shopEntry.cpp: the shop's plates. CShopMileagePlate shows the player's MP twice ("<n>MP", right-aligned).
// CShopPricePlate is the price tag under an item: a picture button with the price ("<n>MP") and a rate text.
#pragma once
#include <cstdint>

#include "System/window/yo2WindowControls.h"

class CShopMileagePlate : public CEasyTask, public IWindowTaskMediator {
public:
    static CShopMileagePlate* create(CTask* parent, CTask* layer);
    CShopMileagePlate();
    ~CShopMileagePlate() override;
    bool onInit() override;
    // @yo2 0x00aeadc0 CShopMileagePlate::onMain
    bool onMain() override { return true; }
    void onDestroy() override;
    // @yo2 0x00aea150 CShopMileagePlate::onControlEvent (empty)
    void onControlEvent(CWindowTaskControll*) override {}
    // @yo2 0x00aea130 CShopMileagePlate::onControlCommand (empty)
    void onControlCommand(CWindowTaskControll*) override {}
    void setTop(int32_t mp);
    void setBottom(int32_t mp);

    CTask* layer_ = nullptr;                   // 0x074
    CTaskPtr<CElement> base_;                  // 0x078
    CTaskPtr<CSpriteElm> plate_;               // 0x084 "商品の種類を載せるプレート" (shop_money_01_c01.png)
    CTaskPtr<CWindowTaskShadowText> top_;      // 0x090 "決定テキスト"
    CTaskPtr<CWindowTaskShadowText> bottom_;   // 0x09c "決定テキスト"
    int32_t topMp_ = 0;                        // 0x0a8
    int32_t bottomMp_ = 0;                     // 0x0ac
};
YO2_AT(CShopMileagePlate, layer_, 0x074);
YO2_AT(CShopMileagePlate, base_, 0x078);
YO2_AT(CShopMileagePlate, plate_, 0x084);
YO2_AT(CShopMileagePlate, top_, 0x090);
YO2_AT(CShopMileagePlate, bottom_, 0x09c);
YO2_AT(CShopMileagePlate, topMp_, 0x0a8);
YO2_SIZEOF(CShopMileagePlate, 0xb0);

class CShopPricePlate : public CEasyTask, public IWindowTaskMediator, public IWindowTaskColleague {
public:
    enum State : int32_t { UP, HOVER, DOWN };
    // kind 0: the blue tags (04..06), else 01..03
    static CShopPricePlate* create(CTask* parent, CTask* layer, IWindowTaskMediator* mediator, int32_t kind);
    CShopPricePlate();
    ~CShopPricePlate() override;
    bool onInit() override;
    // @yo2 0x00ae9640 CShopPricePlate::onMain
    bool onMain() override { return true; }
    void onDestroy() override;
    void onControlEvent(CWindowTaskControll* sender) override;   // the tag: passed on, the plate as the sender
    // @yo2 0x00ae9220 CShopPricePlate::onControlCommand (empty)
    void onControlCommand(CWindowTaskControll*) override {}
    // What the plate's owner gets as the sender (the plate is no control; owners only compare the pointer).
    // ponytail: the exe passes its colleague part; a token pointer is enough here
    CWindowTaskControll* asSender() { return reinterpret_cast<CWindowTaskControll*>(this); }

    void setPrice(int32_t mp);
    // @yo2 0x00ae99f0 CShopPricePlate::setCount
    void setCount(int32_t n) { count_ = n; }
    void setIndex(int32_t i);
    void setRate(float rate);
    void setVisible(bool on);
    // @yo2 0x00ae9e60 CShopPricePlate::isDown
    bool isDown() const { return state_ == DOWN; }
    void setState(int32_t s);
    int32_t buttonState() const;

    CTask* layer_ = nullptr;                    // 0x07c
    CTaskPtr<CElement> base_;                   // 0x080 "値段プレートベースエレメント"
    int32_t state_ = UP;                        // 0x08c State
    CTaskPtr<CWindowTaskPictureSwitch> tag_;    // 0x090 "値段プレート"
    CTaskPtr<CWindowTaskText> priceText_;       // 0x09c (10, 216)
    CTaskPtr<CWindowTaskText> rateText_;        // 0x0a8 (10, 236)
    bool enabled_ = false;                      // 0x0b4 clicks are passed on
    int32_t price_ = 0;                         // 0x0b8
    int32_t count_ = 0;                         // 0x0bc
    int32_t index_ = 0;                         // 0x0c0 0 .. count_ - 1
    float rate_ = 0;                            // 0x0c4
    int32_t kind_ = 0;                          // 0x0c8
    uint32_t unkCc_ = 0;                        // 0x0cc
};
YO2_AT(CShopPricePlate, mediator_, 0x078);
YO2_AT(CShopPricePlate, layer_, 0x07c);
YO2_AT(CShopPricePlate, base_, 0x080);
YO2_AT(CShopPricePlate, state_, 0x08c);
YO2_AT(CShopPricePlate, tag_, 0x090);
YO2_AT(CShopPricePlate, priceText_, 0x09c);
YO2_AT(CShopPricePlate, rateText_, 0x0a8);
YO2_AT(CShopPricePlate, enabled_, 0x0b4);
YO2_AT(CShopPricePlate, rate_, 0x0c4);
YO2_AT(CShopPricePlate, kind_, 0x0c8);
YO2_SIZEOF(CShopPricePlate, 0xd0);
