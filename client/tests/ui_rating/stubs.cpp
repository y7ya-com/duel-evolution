// Stand-ins for what src/Rating calls in other folders, linked into the Rating tests only. Each records what it
// was asked to do, for the tests to check.
#include <ctime>
#include <map>
#include <string>

#include "Rating/yo2Rating.h"
#include "System/yo2ZSort.h"
#include "stubs.h"

// ---- time(): the tests set the clock
int32_t g_fakeNow = 1000000;
extern "C" time_t time(time_t* out) {
    if (out)
        *out = g_fakeNow;
    return g_fakeNow;
}

// ---- CSpriteElm
FakeSprite::FakeSprite(const vc6::string& tex) : texture(tex) {}
int g_spritesMade;
CElement* spriteElmNew(CTask* parent, uint32_t priority, const vc6::string& texture) {
    ++g_spritesMade;
    auto* s = new FakeSprite(texture);
    return dynamic_cast<CElement*>(s->create(parent, priority));
}

// ---- CScreenFader + the scene layer
int g_fakeFaderState;
std::string g_faderLog;
CElement* g_fakeSceneLayer;
CElement* screenFaderNew(CTask* parent, uint32_t priority) { return CElement::newChild(parent, priority); }
bool screenFaderFinished(CElement*) { return g_fakeFaderState == 3; }
bool screenFaderIdle(CElement*) { return g_fakeFaderState == 0; }
void screenFaderFadeOut(CElement*, int32_t frames, uint32_t z) {
    g_faderLog += "out" + std::to_string(frames) + "/" + std::to_string(z) + ";";
    g_fakeFaderState = 1;
}
void screenFaderFadeIn(CElement*, int32_t frames, uint32_t z) {
    g_faderLog += "in" + std::to_string(frames) + "/" + std::to_string(z) + ";";
    g_fakeFaderState = 1;
}
CElement* appSceneLayer() { return g_fakeSceneLayer; }

// ---- text + HelpText
std::u16string stringDbWide(uint32_t index) {
    std::string s = "text#" + std::to_string(index);
    return std::u16string(s.begin(), s.end());
}
std::map<const HelpTextStorage*, FakeHelpText> g_helpTexts;
void helpTextConstruct(HelpTextStorage* h) { g_helpTexts[h] = FakeHelpText{-1, u"", true}; }
void helpTextDestruct(HelpTextStorage* h) { g_helpTexts[h].alive = false; }
void helpTextSetText(HelpTextStorage* h, std::u16string_view s) { g_helpTexts.at(h).text = std::u16string(s); }
void helpTextSetPriority(HelpTextStorage* h, int32_t p) { g_helpTexts.at(h).priority = p; }

// ---- CZSort: CElement queues itself every frame; nothing is drawn here
CZSort::CZSort() = default;
CZSort::~CZSort() = default;
bool CZSort::add(CElement*, float, int32_t) { return true; }
void CZSort::clear() {}
CZSortSet::CZSortSet() = default;
CZSortSet* g_zsortSet;
