// In the game (yo2rep.dll, i686 only): the window-class seams of the duel scene's first half (list boxes,
// CWindowModelHelp, the list-dialog bases) and System's mouse seams, calling the exe's own functions. See
// SceneExeCalls.cpp.
//
// Caveat: CWindowModelHelp is a stand-in class (SceneCommon.h); its members call the exe's code on our object, which
// only lines up field for field once System ports the class (the exe's code may call its virtuals by MSVC slots).
#include "SceneCommon.h"

#if YO2_IN_EXE
#include "SceneDialogs.h"

namespace {
template <class F>
F exe(uint32_t addr) {
    return reinterpret_cast<F>(addr);
}
template <class R, class... A>
R vcall(const void* obj, uint32_t off, A... a) {
    auto vt = *reinterpret_cast<const uintptr_t*>(obj);
    return (*reinterpret_cast<R(__thiscall* const*)(const void*, A...)>(vt + off))(obj, a...);
}
template <class T>
T& at(const void* obj, uint32_t off) {
    return *reinterpret_cast<T*>(reinterpret_cast<uintptr_t>(obj) + off);
}
uint8_t* app() { return *reinterpret_cast<uint8_t**>(0x012711ac); }
}   // namespace

// ---------------------------------------------------------------- System's mouse / duel-answer seams
// TODO(System): yo2UGDialogBase.h's yaneSDK seams; remove these four when src/System defines them.
CMouseEx* windowAppMouse() { return reinterpret_cast<CMouseEx*>(app() + 0x148); }
void windowMouseGetXY(int32_t* x, int32_t* y) { vcall<void>(windowAppMouse(), 0x04, x, y); }
bool windowMouseLButton() { return vcall<char>(windowAppMouse(), 0x0c) != 0; }
void windowMouseResetButton() { vcall<void>(windowAppMouse(), 0x18); }

namespace ds {

// ---------------------------------------------------------------- list boxes
void CWindowTaskListbox::layout() { vcall<void>(this, 0x34); }
bool CWindowTaskListbox::hitTest(float x, float y) { return vcall<char>(this, 0x3c, x, y) != 0; }
int32_t CWindowTaskListbox::rowSpan(int32_t row) { return vcall<int32_t>(this, 0x60, row); }
void CWindowTaskListbox::clearHover() { vcall<void>(this, 0x5c); }
void CWindowTaskListbox::setHover(int32_t row) { vcall<void>(this, 0x68, row); }
int32_t CWindowTaskListbox::rows() { return vcall<int32_t>(this, 0x6c); }
bool CWindowTaskListbox::selected(int32_t row) { return vcall<char>(this, 0x74, row) != 0; }
void CWindowTaskListbox::add(const WChar* text) {
    exe<void(__thiscall*)(void*, const WChar*)>(0x005b3ca0)(this, text);
}
int32_t CWindowTaskListbox::selectedCount() { return exe<int32_t(__thiscall*)(void*)>(0x005b47b0)(this); }
void CWindowTaskListbox::setSize(float w, float h) {
    exe<void(__thiscall*)(void*, float, float)>(0x005ef240)(this, w, h);
}
void CWindowTaskListbox::setMargins(int32_t left, int32_t top, float x, float y) {
    at<int32_t>(this, 0x3ac) = left;
    at<int32_t>(this, 0x3b0) = top;
    at<float>(this, 0x70) = x;
    at<float>(this, 0x74) = y;
}
void CWindowTaskListbox::setDepth(float z) {
    at<float>(this, 0x3bc) = z;
    at<float>(this, 0x78) = z;
}
int32_t CWindowTaskListbox::hover() const { return at<int32_t>(this, 0x3c0); }
void CWindowTaskListbox::setPicks(int32_t n) { at<int32_t>(this, 0x3e0) = n; }
CWindowTaskListbox* listboxCreate(CTask* owner, IWindowTaskMediator* mediator, bool flag) {
    return exe<CWindowTaskListbox*(__cdecl*)(CTask*, IWindowTaskMediator*, char)>(0x005b22f0)(owner, mediator, flag);
}
void CWindowTaskListboxCardType::addType(int32_t t) { exe<void(__thiscall*)(void*, int32_t)>(0x00a18320)(this, t); }
void CWindowTaskListboxCardAttr::addAttr(int32_t a) { exe<void(__thiscall*)(void*, int32_t)>(0x00a16be0)(this, a); }
void CWindowTaskListboxDuelCmd::clearCmds() { exe<void(__thiscall*)(void*)>(0x00a22540)(this); }
void CWindowTaskListboxDuelCmd::addCmd(int32_t c) { exe<void(__thiscall*)(void*, int32_t)>(0x00a22270)(this, c); }
bool listCardTypeInit(CWindowModelListCardType* d) { return exe<char(__thiscall*)(void*)>(0x00a1e8f0)(d) != 0; }
bool listCardAttrInit(CWindowModelListCardAttr* d) { return exe<char(__thiscall*)(void*)>(0x00a1def0)(d) != 0; }
bool CWindowModelListDuelCmd::baseInit() { return exe<char(__thiscall*)(void*)>(0x00a22dd0)(this) != 0; }

// ---------------------------------------------------------------- CWindowModelHelp (see the caveat above)
CWindowModelHelp::CWindowModelHelp() {}
CWindowModelHelp::~CWindowModelHelp() {}
bool CWindowModelHelp::onMain() { return true; }
void CWindowModelHelp::layout() { exe<void(__thiscall*)(void*)>(0x005e5f50)(this); }
int32_t CWindowModelHelp::maxZ() const { return exe<int32_t(__thiscall*)(const void*)>(0x005e5ac0)(this); }
void CWindowModelHelp::setText(const WChar* s) { exe<void(__thiscall*)(void*, const WChar*)>(0x005e6100)(this, s); }
void CWindowModelHelp::onControlEvent(CWindowTaskControll*) { bringToFront(); }   // 0x005e61f0
void CWindowModelHelp::onControlCommand(CWindowTaskControll*) { bringToFront(); }
void CWindowModelHelp::setup(float x, float y, int32_t style) {
    exe<void(__thiscall*)(void*, void*, float, float, int32_t)>(0x005e5d30)(this, nullptr, x, y, style);
}
void CWindowModelHelp::textStyle0() {   // (this + 0x3a4)->get() + 0x378 ->get()->setAlign(0)
    auto* part = exe<uint8_t*(__thiscall*)(void*)>(0x00599b60)(reinterpret_cast<uint8_t*>(this) + 0x3a4);
    void* text = exe<void*(__thiscall*)(void*)>(0x00599930)(part + 0x378);
    exe<void(__thiscall*)(void*, int32_t)>(0x005af8a0)(text, 0);
}

}   // namespace ds
#endif
