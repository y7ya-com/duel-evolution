// The System side of src/System/window's bridges (yo2WindowControls.h): sprites, text elements, the tiled sprite
// and the app mouse, on the real classes. Window tests link their own recording stand-ins instead.
#include <cstring>

#include "CDupSprite.h"
#include "window/yo2WindowControls.h"
#include "yo2App.h"
#include "yo2SpriteElm.h"
#include "yo2TextElm.h"

void windowSpriteCreate(CTaskPtr<CSpriteElm>& to, CTask* parent, uint32_t priority) {
    to.set(CSpriteElm::newChild(parent, priority));
}
void windowSpriteCreate(CTaskPtr<CSpriteElm>& to, CTask* parent, uint32_t priority, const vc6::string& texture) {
    to.set(CSpriteElm::newChild(parent, priority, texture));
}
void windowSpriteTexture(const CTaskPtr<CSpriteElm>& sprite, const vc6::string& path) { sprite.get()->setTexture(path); }
void windowMouse(int32_t* x, int32_t* y) { mousePosition(*x, *y); }
bool windowMouseLeftPushed() { return g_app->mouse().leftPressed(); }

void windowTextElmCreate(CTaskPtr<CTextElm>& to, CTask* parent, uint32_t priority) {
    to.set(CTextElm::newChild(parent, priority));
}
void windowTextElmSetText(const CTaskPtr<CTextElm>& t, const vc6::wstring& s) { t.get()->setText(s); }
void windowTextElmSetBox(const CTaskPtr<CTextElm>& t, float w, float h) { t.get()->sprite().setBounds(w, h); }
int32_t windowTextElmWidth(const CTaskPtr<CTextElm>& t) { return t.get()->sprite().texture().maxLineWidth(); }
int32_t windowTextElmLineCount(const CTaskPtr<CTextElm>& t, float width) { return t.get()->sprite().lineCountAt(width); }
int32_t windowTextElmLinesFrom(const CTaskPtr<CTextElm>& t, int32_t line, float height) {
    return t.get()->sprite().linesFitting(line, height);
}
// (CTextElm::onInit's font set-up, at another height)
void windowTextElmSetFontSize(const CTaskPtr<CTextElm>& t, int32_t size) {
    CD3DTextTexture& tex = t.get()->sprite().texture();
    tex.outline().font().height = size;
    tex.outline().font().width = 0;
    tex.outline().setDirty();
    if (tex.unk124() != 0 || tex.unk120() != size)
        tex.setDirty();
}
void windowTextElmSetLineGap(const CTaskPtr<CTextElm>& t, int32_t gap) {
    t.get()->sprite().layout().lineSpacing_ = static_cast<float>(gap);
    t.get()->sprite().setLineGap(static_cast<float>(gap));
}
void windowTextElmSetUnk748(const CTaskPtr<CTextElm>& t, bool on) { t.get()->wrap_ = on; }
void windowTextElmSetAlign(const CTaskPtr<CTextElm>& t, int32_t align) { t.get()->align_ = align; }
int32_t windowTextElmAlign(const CTaskPtr<CTextElm>& t) { return t.get()->align_; }
void windowTextElmSetFirstLine(const CTaskPtr<CTextElm>& t, int32_t line) { t.get()->firstLine_ = line; }
int32_t windowTextElmFirstLine(const CTaskPtr<CTextElm>& t) { return t.get()->firstLine_; }
void windowTextElmSetPageLines(const CTaskPtr<CTextElm>& t, int32_t lines) { t.get()->lineCount_ = lines; }
int32_t windowTextElmPageLines(const CTaskPtr<CTextElm>& t) { return t.get()->lineCount_; }
// The exe stores the int as the texture's converter pointer: 0 is the texture's own null converter.
void windowTextElmSetField430(const CTaskPtr<CTextElm>& t, int32_t v) {
    CD3DTextTexture& tex = t.get()->sprite().texture();
    tex.setConverterOnly(v ? reinterpret_cast<ITagConverter*>(static_cast<intptr_t>(v)) : tex.nullConverter());
}

void windowDupCreate(CTaskPtr<CDupSprite>& to, CTask* parent, uint32_t priority, const vc6::string& texture) {
    to.set(CDupSprite::newChild(parent, priority, texture));
}
void windowDupClear(const CTaskPtr<CDupSprite>& d) { d.get()->clear(); }
void windowDupAddTile(const CTaskPtr<CDupSprite>& d, const WindowDupTile& t) {
    CDupSprite::Instance i;
    static_assert(sizeof i == sizeof t, "the exe copies the tile as is");
    std::memcpy(&i, &t, sizeof i);
    d.get()->add(i);
}
