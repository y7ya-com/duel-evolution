// Stand-ins for what src/System/window calls outside System/window (the TODO(System)/TODO(yaneSDK) bridges in
// yo2WindowControls.h): sprites and text elements that record what they were told, the app mouse, GetKeyState.
// Include once per window test executable.
#pragma once
#include <windows.h>

#include <set>
#include <vector>

#include "System/window/yo2WindowControls.h"

class CSpriteElm : public CElement {
public:
    vc6::string texture;
};
std::vector<CSpriteElm*> g_sprites;   // every sprite made, in order
void windowSpriteCreate(CTaskPtr<CSpriteElm>& to, CTask* parent, uint32_t priority) {
    auto* s = new CSpriteElm;
    s->create(parent, priority);
    to.set(s);
    g_sprites.push_back(s);
}
void windowSpriteCreate(CTaskPtr<CSpriteElm>& to, CTask* parent, uint32_t priority, const vc6::string& texture) {
    windowSpriteCreate(to, parent, priority);
    to.get()->texture = texture;
}
void windowSpriteTexture(const CTaskPtr<CSpriteElm>& s, const vc6::string& path) { s.get()->texture = path; }
class CTextElm : public CElement {
public:
    int32_t fontSize = 0, lineGap = -1, align = 0, firstLine = 0, pageLines = 0, field430 = -1;
    bool unk748 = false;
    vc6::wstring text;
    float boxW = 0, boxH = 0;
    int32_t width = 0, lines = 0, linesFrom = 0;
    float lastLineWidth = 0;
};
void windowTextElmCreate(CTaskPtr<CTextElm>& to, CTask* parent, uint32_t priority) {
    auto* t = new CTextElm;
    t->create(parent, priority);
    to.set(t);
}
void windowTextElmSetText(const CTaskPtr<CTextElm>& t, const vc6::wstring& s) { t.get()->text = s; }
void windowTextElmSetBox(const CTaskPtr<CTextElm>& t, float w, float h) { t.get()->boxW = w, t.get()->boxH = h; }
int32_t windowTextElmWidth(const CTaskPtr<CTextElm>& t) { return t.get()->width; }
int32_t windowTextElmLineCount(const CTaskPtr<CTextElm>& t, float width) {
    t.get()->lastLineWidth = width;
    return t.get()->lines;
}
int32_t windowTextElmLinesFrom(const CTaskPtr<CTextElm>& t, int32_t, float) { return t.get()->linesFrom; }
void windowTextElmSetFontSize(const CTaskPtr<CTextElm>& t, int32_t size) { t.get()->fontSize = size; }
void windowTextElmSetLineGap(const CTaskPtr<CTextElm>& t, int32_t gap) { t.get()->lineGap = gap; }
void windowTextElmSetUnk748(const CTaskPtr<CTextElm>& t, bool on) { t.get()->unk748 = on; }
void windowTextElmSetAlign(const CTaskPtr<CTextElm>& t, int32_t a) { t.get()->align = a; }
int32_t windowTextElmAlign(const CTaskPtr<CTextElm>& t) { return t.get()->align; }
void windowTextElmSetFirstLine(const CTaskPtr<CTextElm>& t, int32_t l) { t.get()->firstLine = l; }
int32_t windowTextElmFirstLine(const CTaskPtr<CTextElm>& t) { return t.get()->firstLine; }
void windowTextElmSetPageLines(const CTaskPtr<CTextElm>& t, int32_t l) { t.get()->pageLines = l; }
int32_t windowTextElmPageLines(const CTaskPtr<CTextElm>& t) { return t.get()->pageLines; }
void windowTextElmSetField430(const CTaskPtr<CTextElm>& t, int32_t v) { t.get()->field430 = v; }
inline CTextElm* elmOf(CWindowTaskText* t) { return t->text_.get(); }

int32_t g_mouseX, g_mouseY;
void windowMouse(int32_t* x, int32_t* y) { *x = g_mouseX, *y = g_mouseY; }
extern std::set<int> g_keysDown;   // platform_stubs.cpp: GetAsyncKeyState
#ifndef _WIN32   // (the i686 pass only compiles this file, against the real windows.h)
SHORT GetKeyState(int vk) { return g_keysDown.count(vk) ? SHORT(0x8000) : 0; }
#endif

class CDupSprite : public CElement {
public:
    vc6::string texture;
    std::vector<WindowDupTile> tiles;
    int clears = 0;
};
void windowDupCreate(CTaskPtr<CDupSprite>& to, CTask* parent, uint32_t priority, const vc6::string& texture) {
    auto* d = new CDupSprite;
    d->create(parent, priority);
    d->texture = texture;
    to.set(d);
}
void windowDupClear(const CTaskPtr<CDupSprite>& d) {
    d.get()->tiles.clear();
    d.get()->clears++;
}
void windowDupAddTile(const CTaskPtr<CDupSprite>& d, const WindowDupTile& t) { d.get()->tiles.push_back(t); }
bool g_mouseLeftPushed;
bool windowMouseLeftPushed() { return g_mouseLeftPushed; }
