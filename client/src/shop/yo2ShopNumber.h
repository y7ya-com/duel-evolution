// yo2shopEntry.cpp: the shop's digit strings, drawn from data/shop/shop_number_01_c01.png (15 cells of 16 x 16, eight
// to a row: "0".."9", then '%', 'M', 'P', '@').
#pragma once
#include <cstdint>

#include "System/yo2EasyTask.h"
#include "System/yo2Element.h"
#include "System/yo2TaskPtr.h"

class CSpriteElm;

// One character: a sprite showing one cell, under its own base element.
class CShopNumber : public CEasyTask {
public:
    struct Cell {
        int32_t x, y, w, h;
    };
    static CShopNumber* create(CTask* parent, CTask* layer);
    CShopNumber();
    ~CShopNumber() override;
    bool onInit() override;
    // @yo2 0x00ae8740 CShopNumber::onMain
    bool onMain() override { return true; }
    void onDestroy() override;
    void setGlyph(int32_t cell);   // 0..14
    void setChar(char c);          // '1'..'9', '%', 'M', 'P', '@'; anything else (also '0') is cell 0

    CTask* layer_ = nullptr;        // 0x070 the base element's parent
    CTaskPtr<CElement> base_;       // 0x074 "数値テキストベースエレメント"
    Cell cells_[15] = {};           // 0x080
    int32_t glyph_ = 0;             // 0x170
    CTaskPtr<CSpriteElm> sprite_;   // 0x174 "数字"
};
YO2_AT(CShopNumber, layer_, 0x070);
YO2_AT(CShopNumber, base_, 0x074);
YO2_AT(CShopNumber, cells_, 0x080);
YO2_AT(CShopNumber, glyph_, 0x170);
YO2_AT(CShopNumber, sprite_, 0x174);
YO2_SIZEOF(CShopNumber, 0x180);

// Up to 32 CShopNumbers, 14 pixels apart, made and destroyed as the text changes.
class CShopNumberString : public CEasyTask {
public:
    static constexpr int32_t kMaxDigits = 32;
    static CShopNumberString* create(CTask* parent, CTask* layer);
    CShopNumberString();
    ~CShopNumberString() override;
    bool onInit() override;
    // @yo2 0x00ae8c00 CShopNumberString::onMain
    bool onMain() override { return true; }
    void onDestroy() override;
    void setNumber(int32_t n);
    void setText(const vc6::string& s);
    void setDigit(int32_t i, char c);
    void clearDigit(int32_t i);

    CTask* layer_ = nullptr;                 // 0x070
    CTaskPtr<CElement> base_;                // 0x074 "数値テキストベースエレメント"
    CShopNumber* digits_[kMaxDigits] = {};   // 0x080 "数字列のひとけた"
    int32_t unk100_ = 0;                     // 0x100
    int32_t length_ = 0;                     // 0x104 the text's length
};
YO2_AT(CShopNumberString, layer_, 0x070);
YO2_AT(CShopNumberString, base_, 0x074);
YO2_AT(CShopNumberString, digits_, 0x080);
YO2_AT(CShopNumberString, length_, 0x104);
YO2_SIZEOF(CShopNumberString, 0x108);
