// yo2shopEntry.cpp: CShopNumber and CShopNumberString.
#include "shop/yo2ShopNumber.h"

#include <cstdio>

#include "System/window/yo2WindowControls.h"

// @yo2 0x00ae7d20 CShopNumber::create (the constructor inlined)
CShopNumber* CShopNumber::create(CTask* parent, CTask* layer) {
    auto* n = new CShopNumber;
    n->layer_ = layer;
    return dynamic_cast<CShopNumber*>(n->CTask::create(parent, 10000));
}

CShopNumber::CShopNumber() = default;

// @yo2 0x00ae7e60 CShopNumber::~CShopNumber
// @yo2 0x00ae7e30 CShopNumber deleting destructor
CShopNumber::~CShopNumber() = default;

// @yo2 0x00ae7ef0 CShopNumber::onInit: the base element, the cell table, the sprite showing cell 0
bool CShopNumber::onInit() {
    base_.setUser(this);
    base_.set(CElement::newChild(layer_, 10000));
    windowNameTask(base_.task(), "数値テキストベースエレメント");
    base_->inheritTransform_ = true;
    for (int i = 0; i < 15; i++)
        cells_[i] = {i % 8 * 16, i / 8 * 16, 16, 16};
    glyph_ = 0;
    sprite_.setUser(this);
    windowSpriteCreate(sprite_, base_.get(), 10000);
    windowNameTask(sprite_.task(), "数字");
    CElement* s = windowElement(sprite_);
    s->inheritTransform_ = true;
    s->setDrawMode(CElement::BLEND);
    windowSpriteTexture(sprite_, "data/shop/shop_number_01_c01.png");
    s->pos_ = {0, 0, 1};
    s->rect_[0] = s->rect_[1] = 0;
    s->rect_[2] = s->rect_[3] = 16;
    setGlyph(0);
    return true;
}

// @yo2 0x00ae8970 CShopNumber::onDestroy
void CShopNumber::onDestroy() {
    if (base_.task())
        base_->destroy(__FILE__, __LINE__);
}

// @yo2 0x00ae8760 CShopNumber::setGlyph
void CShopNumber::setGlyph(int32_t cell) {
    glyph_ = cell < 0 ? 0 : cell > 14 ? 14 : cell;
    CElement* s = windowElement(sprite_);
    s->rect_[0] = cells_[glyph_].x;
    s->rect_[1] = cells_[glyph_].y;
}

// @yo2 0x00ae8800 CShopNumber::setChar
void CShopNumber::setChar(char c) {
    switch (c) {
    case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
        setGlyph(c - '0');
        break;
    case '%': setGlyph(11); break;
    case 'M': setGlyph(12); break;
    case 'P': setGlyph(13); break;
    case '@': setGlyph(14); break;
    default: setGlyph(0); break;
    }
}

// @yo2 0x00ae89c0 CShopNumberString::create (the constructor inlined)
CShopNumberString* CShopNumberString::create(CTask* parent, CTask* layer) {
    auto* s = new CShopNumberString;
    s->layer_ = layer;
    return dynamic_cast<CShopNumberString*>(s->CTask::create(parent, 10000));
}

CShopNumberString::CShopNumberString() = default;

// @yo2 0x00ae8ae0 CShopNumberString::~CShopNumberString
// @yo2 0x00ae8ab0 CShopNumberString deleting destructor
CShopNumberString::~CShopNumberString() = default;

// @yo2 0x00ae8b60 CShopNumberString::onInit
bool CShopNumberString::onInit() {
    base_.setUser(this);
    base_.set(CElement::newChild(layer_, 10000));
    windowNameTask(base_.task(), "数値テキストベースエレメント");
    base_->inheritTransform_ = true;
    for (CShopNumber*& d : digits_)
        d = nullptr;
    length_ = 0;
    unk100_ = 0;
    return true;
}

// @yo2 0x00ae9050 CShopNumberString::onDestroy
void CShopNumberString::onDestroy() {
    if (base_.task())
        base_->destroy(__FILE__, __LINE__);
}

// @yo2 0x00ae8c20 CShopNumberString::setNumber (itoa, base 10)
void CShopNumberString::setNumber(int32_t n) {
    char buf[0x100];
    std::snprintf(buf, sizeof buf, "%d", n);
    setText(buf);
}

// @yo2 0x00ae8d50 CShopNumberString::setText: one CShopNumber per character, the rest destroyed
void CShopNumberString::setText(const vc6::string& s) {
    for (int32_t i = 0; i < kMaxDigits; i++) {
        if (static_cast<size_t>(i) < s.size())
            setDigit(i, s.c_str()[i]);
        else
            clearDigit(i);
    }
    length_ = static_cast<int32_t>(s.size());
}

// @yo2 0x00ae8f30 CShopNumberString::setDigit: made on first use, 14 pixels per position
void CShopNumberString::setDigit(int32_t i, char c) {
    if (!digits_[i]) {
        digits_[i] = CShopNumber::create(this, base_.get());
        windowNameTask(digits_[i], "数字列のひとけた");
    }
    digits_[i]->base_->pos_ = {static_cast<float>(i * 14), 0, 0};
    digits_[i]->setChar(c);
}

// @yo2 0x00ae9000 CShopNumberString::clearDigit
void CShopNumberString::clearDigit(int32_t i) {
    if (digits_[i]) {
        digits_[i]->destroy(__FILE__, __LINE__);
        digits_[i] = nullptr;
    }
}
