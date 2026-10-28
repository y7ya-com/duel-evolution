// Stand-ins for what src/System/window calls outside System/window (the TODO(System)/TODO(yaneSDK) bridges in
// yo2WindowControls.h): sprites and text elements that record what they were told, the app mouse, GetKeyState.
// Include once per window test executable.
#pragma once
// The one copy of these stand-ins for every test suite (tests/game, tests/lobby): when System's real CSpriteElm /
// CTextElm / CDupSprite / CIME land (src/System/yo2WindowSeams.cpp), this file is what gets swapped out.
#ifndef WINDOW_STUBS_TEXT_LINES   // what a text reports its laid-out line count as (tests/lobby: 1, list items need one)
#define WINDOW_STUBS_TEXT_LINES 0
#endif
#include <windows.h>

#include <algorithm>
#include <set>
#include <string>
#include <vector>

#include "System/window/yo2WindowControls.h"

class CSpriteElm : public CElement {
public:
    vc6::string texture;
    float texW = 0, texH = 0;
    int32_t format = 0x15;         // A8R8G8B8
    uint8_t pixel[4] = {0, 0, 0, 0xff};   // every pixel of the texture
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
    bool unk748 = false, keepNewlines = false;
    vc6::wstring text;
    float boxW = 0, boxH = 0;
    int32_t width = 0, lines = WINDOW_STUBS_TEXT_LINES, linesFrom = 0, fontHeight = 16;
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
int32_t windowTextElmFontHeight(const CTaskPtr<CTextElm>& t) { return t.get()->fontHeight; }
std::vector<uint32_t> g_windowSounds;   // windowSoundPlay ids, in order
bool windowSoundPlay(uint32_t id, int32_t) {
    g_windowSounds.push_back(id);
    return true;
}
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
void windowTextElmSetKeepNewlines(const CTaskPtr<CTextElm>& t, bool on) { t.get()->keepNewlines = on; }
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
void windowDupCreate(CTaskPtr<CDupSprite>& to, CTask* parent, uint32_t priority) { windowDupCreate(to, parent, priority, ""); }
void windowDupTexture(const CTaskPtr<CDupSprite>& d, const vc6::string& path) { d.get()->texture = path; }
void windowSpriteTextureSize(const CTaskPtr<CSpriteElm>& s, float* w, float* h) { *w = s.get()->texW, *h = s.get()->texH; }
int32_t windowSpriteTextureFormat(const CTaskPtr<CSpriteElm>& s) { return s.get()->format; }
const uint8_t* windowSpriteTexturePixel(const CTaskPtr<CSpriteElm>& s, int32_t, int32_t, int32_t) { return s.get()->pixel; }
bool g_mouseLeftPushed;
bool windowMouseLeftPushed() { return g_mouseLeftPushed; }

// The caret services over `text`: '\n' ends a line, every character is 8 pixels wide, every line 16 high.
void windowTextElmCaretIndex(const CTaskPtr<CTextElm>& t, int32_t col, int32_t line, int32_t* index) {
    std::u16string_view s(t.get()->text);
    int32_t i = 0;
    for (; line > 0 && i < int32_t(s.size()); i++)
        if (s[i] == u'\n')
            line--;
    int32_t end = i;
    while (end < int32_t(s.size()) && s[end] != u'\n')
        end++;
    *index = (std::min)(i + col, end);
}
void windowTextElmCaretFromIndex(const CTaskPtr<CTextElm>& t, int32_t index, int32_t* col, int32_t* line) {
    std::u16string_view s(t.get()->text);
    index = (std::max)(0, (std::min)(index, int32_t(s.size())));
    *col = *line = 0;
    for (int32_t i = 0; i < index; i++)
        s[i] == u'\n' ? (*col = 0, ++*line) : ++*col;
}
void windowTextElmCaretPos(const CTaskPtr<CTextElm>&, int32_t col, int32_t line, float* x, float* y) {
    *x = col * 8.0f, *y = line * 16.0f;
}
void windowTextElmCaretAt(const CTaskPtr<CTextElm>&, float x, float y, int32_t* col, int32_t* line) {
    *col = int32_t(x / 8), *line = int32_t(y / 16);
}

// CIME: records what the input box told it.
class CIME : public CTask {
public:
    CWindowTaskControll* owner = nullptr;
    std::vector<uint32_t> msgs;
    float x = 0, y = 0, z = 0;
};
void windowImeCreate(CTaskPtr<CIME>& to, CTask* parent, CWindowTaskControll* owner) {
    auto* i = new CIME;
    i->owner = owner;
    i->create(parent, 10000);
    to.set(i);
}
void windowImeMessage(const CTaskPtr<CIME>& ime, const WindowMsg& m) { ime.get()->msgs.push_back(m.msg); }
void windowImeSetPos(const CTaskPtr<CIME>& ime, float x, float y, float z) {
    ime.get()->x = x, ime.get()->y = y, ime.get()->z = z;
}

std::string g_clipboard;   // a CF_TEXT clipboard
#ifndef _WIN32
BOOL IsClipboardFormatAvailable(UINT fmt) { return fmt == CF_TEXT && !g_clipboard.empty(); }
BOOL OpenClipboard(HWND) { return TRUE; }
BOOL CloseClipboard() { return TRUE; }
HANDLE GetClipboardData(UINT) { return const_cast<char*>(g_clipboard.c_str()); }
LPVOID GlobalLock(HGLOBAL h) { return h; }
BOOL GlobalUnlock(HGLOBAL) { return TRUE; }
#endif
