// Recording fakes for src/Result/yo2UiStandIns.h. Field setters do what the exe's do (on the stand-in members);
// what a real control would draw is kept in FakeText records instead.
#include "ui_fakes.h"

#include <cstdarg>
#include <cstdio>

#include "System/yo2Debug.h"

std::map<const CSpriteElm*, std::string> g_spriteTextures;
int g_bringToFront;
int g_textWidthPerChar = 10;

namespace {
std::map<const void*, FakeText> g_texts;
}

FakeText& fakeText(const void* control) { return g_texts[control]; }

std::u16string u16(const char* s) {
    std::u16string out;
    for (; s && *s; ++s)
        out += static_cast<char16_t>(static_cast<unsigned char>(*s));
    return out;
}

std::string narrow(std::u16string_view s) {
    std::string out;
    for (char16_t c : s)
        out += static_cast<char>(c);
    return out;
}

// ---- free functions
void yo2WidenInto(const char* s, WChar* out, int cap) {
    std::u16string w = u16(s);
    size_t n = w.size() < size_t(cap - 1) ? w.size() : size_t(cap - 1);
    w.copy(out, n);
    out[n] = 0;
}

const WChar* yo2FormatW(const WChar* fmt, ...) {
    static WChar buf[0x400];
    char nbuf[0x400];
    std::string f = narrow(fmt);
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(nbuf, sizeof nbuf, f.c_str(), ap);
    va_end(ap);
    yo2WidenInto(nbuf, buf, 0x400);
    return buf;
}

void windowNameTask(CTask* task, const char* name) {
    YO2_ASSERT(task != nullptr, "%s", name);
    task->setInstName(name);
}

// ---- mediator / colleague
void IWindowTaskMediator::mediatorSlot2(IWindowTaskColleague*) {}
void IWindowTaskMediator::mediatorSlot3(int32_t) {}
void IWindowTaskMediator::beginDrag(IWindowTaskColleague*, int32_t, int32_t) {}
void IWindowTaskColleague::setMediator(IWindowTaskMediator* m) { mediator_ = m; }

// ---- sprites and text elements
CSpriteElm* CSpriteElm::newChild(CTask* parent, uint32_t priority) {
    auto* s = new CSpriteElm;
    return dynamic_cast<CSpriteElm*>(s->create(parent, priority));
}
void CSpriteElm::setTexture(const vc6::string& path) { g_spriteTextures[this] = path.c_str(); }

CTextElm* CTextElm::newChild(CTask* parent, uint32_t priority) {
    auto* t = new CTextElm();
    return dynamic_cast<CTextElm*>(t->create(parent, priority));
}
void CTextElm::setText(std::u16string_view text) {
    g_texts[this].text = std::u16string(text);
    g_texts[&texture_].text = std::u16string(text);
}
int32_t CD3DTextTextureView::maxLineWidth() {
    return static_cast<int32_t>(g_texts[this].text.size()) * g_textWidthPerChar;
}

// ---- CWindowTaskControll
CWindowTaskControll::CWindowTaskControll() = default;
CWindowTaskControll::~CWindowTaskControll() = default;
int32_t CWindowTaskControll::receive(CTaskMessage* msg) { return CElement::receive(msg); }
void CWindowTaskControll::onDestroy() { destroyed_ = true; }
double CWindowTaskControll::z() const { return pos_.z; }
void CWindowTaskControll::setAlpha(float a) { color_[3] = a; }
void CWindowTaskControll::setName(const vc6::string& s) { name_ = s; }
vc6::string CWindowTaskControll::name() const { return name_; }
uint32_t CWindowTaskControll::kind() const { return 0; }
bool CWindowTaskControll::handleMessage(WindowMsg) { return false; }
bool CWindowTaskControll::wheelHitTest(float, float) { return false; }
void CWindowTaskControll::setText(const WChar* s) { g_texts[this].text = s; }
void CWindowTaskControll::setTextId(int32_t) {}

// ---- CWindowTaskModel
CWindowTaskModel::CWindowTaskModel() = default;
CWindowTaskModel::~CWindowTaskModel() = default;
int32_t CWindowTaskModel::receive(CTaskMessage* msg) { return CElement::receive(msg); }
bool CWindowTaskModel::onInit() { return true; }
void CWindowTaskModel::onDestroy() { destroyed_ = true; }
void CWindowTaskModel::beginDrag(IWindowTaskColleague*, int32_t, int32_t) { dragging_ = true; }
void CWindowTaskModel::applyZ() { pos_.z = z_; }
void CWindowTaskModel::setTextA(const char* s) { setText(u16(s).c_str()); }
void CWindowTaskModel::setText(const WChar* s) { g_texts[this].text = s; }
void CWindowTaskModel::setTextId(int32_t) {}
void CWindowTaskModel::centre() {}
bool CWindowTaskModel::windowSlot15() { return true; }
void CWindowTaskModel::endDrag() { dragging_ = false; }
void CWindowTaskModel::drag(int32_t, int32_t) {}
bool CWindowTaskModel::windowSlot18() { return false; }
void CWindowTaskModel::fadeIn(uint32_t) {}
void CWindowTaskModel::windowSlot20(uint32_t) {}
void CWindowTaskModel::bringToFront() { ++g_bringToFront; }

// ---- CWindowTaskText
void CWindowTaskText::layout() {}
bool CWindowTaskText::hitTest(float, float) { return false; }
void CWindowTaskText::setText(const WChar* s) { g_texts[this].text = s; }
void CWindowTaskText::setTextA(const char* s) { g_texts[this].text = u16(s); }
void CWindowTaskText::setFontSize(int32_t size) { fontSize_ = size; }
void CWindowTaskText::setColor(float r, float g, float b, float a) {
    FakeText& t = g_texts[this];
    t.color[0] = r, t.color[1] = g, t.color[2] = b, t.color[3] = a;
}
void CWindowTaskText::setSize(int32_t w, int32_t h) { g_texts[this].w = w, g_texts[this].h = h; }
int32_t CWindowTaskText::lineCount(float) {
    int32_t n = 1;
    for (char16_t c : g_texts[this].text)
        n += c == u'\n';
    return n;
}
void CWindowTaskText::setAlign(int32_t align) { g_texts[this].align = align; }
void CWindowTaskText::setFirstLine(int32_t line) { g_texts[this].firstLine = line; }
void CWindowTaskText::setLineLimit(int32_t lines) { g_texts[this].lineLimit = lines; }
void CWindowTaskText::setPosition(float x, float y) {
    x_ = x;
    y_ = y;
    pos_ = {x, y, z_};
}
void CWindowTaskText::show() {
    lockFlags_ &= ~2u;
    setDisp(true, true);
    g_texts[this].shown = true;
}

// ---- CWindowTaskShadowText: the two texts are made with the control
CWindowTaskShadowText* CWindowTaskShadowText::newChild(CTask* parent, IWindowTaskMediator* mediator) {
    auto* t = new CWindowTaskShadowText;
    t->mediator_ = mediator;
    if (!t->create(parent, 10000))
        return nullptr;
    for (CTaskPtr<CWindowTaskText>* p : {&t->main_, &t->shadow_}) {
        p->setUser(t);
        auto* text = new CWindowTaskText;
        p->set(dynamic_cast<CWindowTaskText*>(text->create(t, 10000)));
    }
    return t;
}
void CWindowTaskShadowText::layout() {}
bool CWindowTaskShadowText::hitTest(float, float) { return false; }
void CWindowTaskShadowText::onControlEvent(IWindowTaskColleague*) {}
void CWindowTaskShadowText::onControlCommand(IWindowTaskColleague*) {}
void CWindowTaskShadowText::setText(const WChar* s) {
    main()->setText(s);
    shadow()->setText(s);
}
void CWindowTaskShadowText::setTextA(const char* s) {
    main()->setTextA(s);
    shadow()->setTextA(s);
}
void CWindowTaskShadowText::setFontSize(int32_t size) {
    main()->setFontSize(size);
    shadow()->setFontSize(size);
}
void CWindowTaskShadowText::setPosition(float x, float y) {
    x_ = static_cast<int32_t>(x);
    y_ = static_cast<int32_t>(y);
    main()->setPosition(x, y);
    shadow()->setPosition(x + offX_, y + offY_);
}
void CWindowTaskShadowText::setAlign(int32_t align) {
    main()->setAlign(align);
    shadow()->setAlign(align);
}
void CWindowTaskShadowText::setSize(int32_t w, int32_t h) {
    main()->setSize(w, h);
    shadow()->setSize(w, h);
}
void CWindowTaskShadowText::setColor(float r, float g, float b, float a) { main()->setColor(r, g, b, a); }

// ---- scroll bar, buttons
void CWindowTaskScrollBase::setMax(int32_t max) { max_ = max; }

CWindowTaskSwitch::CWindowTaskSwitch() = default;
CWindowTaskSwitch::~CWindowTaskSwitch() = default;
void CWindowTaskSwitch::layout() {}
bool CWindowTaskSwitch::hitTest(float, float) { return false; }
void CWindowTaskSwitch::loadImages() {}
void CWindowTaskSwitch::setCentre(float x, float y) {
    x_ = x - w_ / 2;
    y_ = y - h_ / 2;
}

CWindowTaskTextSwitch::CWindowTaskTextSwitch() { setTaskName("テキストスイッチ(コントロール)"); }
CWindowTaskTextSwitch::~CWindowTaskTextSwitch() = default;
void CWindowTaskTextSwitch::onControlEvent(IWindowTaskColleague*) {}
void CWindowTaskTextSwitch::onControlCommand(IWindowTaskColleague*) {}
