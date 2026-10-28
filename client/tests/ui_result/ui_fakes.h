// Recording fakes for src/Result/yo2UiStandIns.h (the System UI classes that Result and shop build on). They keep
// what the code under test asked for, so tests can check it. Shared by tests/ui_result and tests/ui_shop.
#pragma once
#include <map>
#include <string>
#include <vector>

#include "Result/yo2UiStandIns.h"

// What a CWindowTaskText (or a CTextElm) was told.
struct FakeText {
    std::u16string text;
    int32_t align = 0;
    int32_t w = 0, h = 0;
    int32_t firstLine = 0;
    int32_t lineLimit = 0;
    float color[4] = {1, 1, 1, 1};
    bool shown = false;
};
FakeText& fakeText(const void* control);          // CWindowTaskText* or CTextElm*
std::u16string u16(const char* s);                // ASCII/UTF-8 bytes widened one by one
std::string narrow(std::u16string_view s);        // the inverse, for messages

extern std::map<const CSpriteElm*, std::string> g_spriteTextures;  // setTexture
extern int g_bringToFront;                                         // CWindowTaskModel::bringToFront calls
extern int g_textWidthPerChar;                                     // CD3DTextTextureView::maxLineWidth fake

// What resultBaseNew / resultScrollNew made.
struct FakeControl : CWindowTaskControll {
    void layout() override {}
    bool hitTest(float, float) override { return false; }
    int32_t side = 0, kind = 0;
};
struct FakeScroll : CWindowTaskScrollBase {
    void layout() override {}
    bool hitTest(float, float) override { return false; }
};
