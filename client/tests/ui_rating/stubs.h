// What the Rating stand-ins (stubs.cpp) record.
#pragma once
#include <map>
#include <string>

#include "Rating/yo2Rating.h"

struct FakeSprite : CElement {
    explicit FakeSprite(const vc6::string& tex);
    vc6::string texture;
};
extern int g_spritesMade;

extern int32_t g_fakeNow;      // what time() returns
extern int g_fakeFaderState;   // 0 idle, 1 fading, 3 done
extern std::string g_faderLog; // "in10/61004;out10/61004;..."
extern CElement* g_fakeSceneLayer;

struct FakeHelpText {
    int32_t priority;
    std::u16string text;
    bool alive;
};
extern std::map<const HelpTextStorage*, FakeHelpText> g_helpTexts;
