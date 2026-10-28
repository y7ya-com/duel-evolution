// In the game (yo2rep.dll, i686 only): the seams of the duel scene's first half (src/duel/Scene*) that nobody has
// rewritten yet go straight to the exe's own functions (src/duel/DuelExeCalls.cpp does the same for the engine).
// Calling conventions come from each callee's `ret N` and its call sites. Objects the exe made (list boxes, sprites,
// the app mouse, CPlaneLoaderElm sheets) are called through their own vtables at the exe's slot offsets.
//
// The window-class seams are in SceneExeCallsUi.cpp (a separate object, so a hook on a plain function doesn't pull
// the window system into the link).
#include "SceneCommon.h"

#if YO2_IN_EXE
#include "SceneAffectIcon.h"
#include "SceneCard.h"
#include "NetDuel.h"

namespace {
template <class F>
F exe(uint32_t addr) {
    return reinterpret_cast<F>(addr);
}
// a virtual call on an exe object: the function at `off` in its vtable
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
// An MSVC 6 std::string passed by value: the callee's destructor drops one reference, so share the buffer
// (refcount byte at ptr[-1]) instead of copying it.
struct Str16 {
    uint32_t w[4];
};
Str16 shareString(const vc6::string& s) {
    Str16 r;
    std::memcpy(&r, &s, sizeof r);
    char* p = reinterpret_cast<char*>(static_cast<uintptr_t>(r.w[1]));
    if (p) p[-1]++;
    return r;
}
}   // namespace

namespace ds {

// ---------------------------------------------------------------- input, cursor
void mousePos(Mouse* m, int32_t* x, int32_t* y) { vcall<void>(m, 0x04, x, y); }
bool mouseVf02(Mouse* m) { return vcall<char>(m, 0x08) != 0; }
bool mouseHeld(Mouse* m) { return vcall<char>(m, 0x0c) != 0; }
void mouseConsume(Mouse* m) { vcall<void>(m, 0x18); }
int32_t mouseWheel(Mouse* m) { return vcall<int32_t>(m, 0x28); }
void mouseResetWheel(Mouse* m) { vcall<void>(m, 0x30); }
bool mouseWheelMoved(Mouse* m) { return vcall<char>(m, 0x3c) != 0; }
bool mouseClicked(Mouse* m) { return vcall<char>(m, 0x40) != 0; }
bool mouseRightClicked(Mouse* m) { return vcall<char>(m, 0x48) != 0; }
bool mouseReleased(Mouse* m) { return vcall<char>(m, 0x4c) != 0; }
void mouseVf542850(Mouse* m, int32_t v) { exe<void(__thiscall*)(void*, int32_t)>(0x00542850)(m, v); }
bool keyPushed(int32_t key) {   // the duel's key map: g_duelScene + 0x1990
    return exe<char(__thiscall*)(void*, int32_t)>(0x00580d70)(g_duelScene + 0x1990, key) != 0;
}
void cursorWarp(int32_t x, int32_t y) {
    exe<void(__thiscall*)(void*, int32_t, int32_t)>(0x007d0600)(*reinterpret_cast<void**>(0x012aa640), x, y);
}
void cursorWarpRepeat(int32_t x, int32_t y) {
    exe<void(__thiscall*)(void*, int32_t, int32_t)>(0x007d05c0)(*reinterpret_cast<void**>(0x012aa640), x, y);
}

// ---------------------------------------------------------------- sprite sheets
void planeDestruct(PlaneLoader* p) { exe<void(__thiscall*)(void*, int32_t)>(0x00651d20)(p, 0); }
void planeDelete(PlaneLoader* p) { vcall<void>(p, 0x04, 1); }
void planeEnsure(PlaneLoader* p, int32_t i) { exe<void(__thiscall*)(void*, int32_t)>(0x007d8840)(p, i); }
void planeLoad(PlaneLoader* p, const vc6::string& path) {
    exe<void(__thiscall*)(void*, Str16)>(0x007d9700)(p, shareString(path));
}
void planeLoadY(PlaneLoader* p, const char* path) {
    exe<void(__thiscall*)(void*, const char*)>(0x007540c0)(p, path);
}
int32_t planeFrames(PlaneLoader* p, int32_t i) { return exe<int32_t(__thiscall*)(void*, int32_t)>(0x007d9030)(p, i); }
void spriteSize(CSpriteElmOlder* s, int32_t* w, int32_t* h) {
    exe<void(__thiscall*)(void*, int32_t*, int32_t*)>(0x007d8690)(s, w, h);
}
void spriteBlit(CSpriteElmOlder* s, int32_t x, int32_t y, float sx, float sy, int32_t srcX, int32_t srcY, int32_t w,
                int32_t h, int32_t cx, int32_t cy, int32_t alpha, float angle, int32_t mode) {
    exe<void(__thiscall*)(void*, int32_t, int32_t, float, float, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t,
                          int32_t, float, int32_t)>(0x007d5dc0)(s, x, y, sx, sy, srcX, srcY, w, h, cx, cy, alpha, angle,
                                                                mode);
}
void spriteSetZ(CSpriteElmOlder* s, float z) { exe<void(__thiscall*)(void*, float)>(0x007d8750)(s, z); }
bool spriteHit(CSpriteElmOlder* s, int32_t x, int32_t y) {
    return exe<int32_t(__thiscall*)(void*, int32_t, int32_t)>(0x007d8780)(s, x, y) != 0;
}
void spriteDraw(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src, const int32_t* size,
                int32_t flags) {
    exe<void(__thiscall*)(void*, int32_t, int32_t, int32_t, const int32_t*, const int32_t*, int32_t)>(0x007d6310)(
        s, x, y, alpha, src, size, flags);
}

// ---------------------------------------------------------------- text
bool textLine(const WChar* src, WChar* out, int32_t i) {
    return exe<int32_t(__cdecl*)(const WChar*, WChar*, int32_t)>(0x007a0e80)(src, out, i) != 0;
}

// ---------------------------------------------------------------- cards
void matPos(uint32_t player, uint32_t zone, uint32_t index, int32_t* x, int32_t* y) {
    uint64_t r = exe<uint64_t(__cdecl*)(uint32_t, uint32_t, uint32_t)>(0x007bea20)(player, zone, index);
    *x = (int32_t)(uint32_t)r;
    *y = (int32_t)(uint32_t)(r >> 32);
}

// ---------------------------------------------------------------- dialogs' System helpers
void balloonConstruct(void* b) { exe<void(__thiscall*)(void*)>(0x00a5c410)(b); }
void balloonDestruct(void* b) { exe<void(__thiscall*)(void*)>(0x00a5c6d0)(b); }
void balloonSetWidth(void* b, int32_t w) { exe<void(__thiscall*)(void*, int32_t)>(0x00a5c500)(b, w); }
void balloonSetText(void* b, const vc6::wstring& s) {
    exe<void(__thiscall*)(void*, const vc6::wstring*)>(0x00a5c530)(b, &s);
}
void balloonHide(void* b) { exe<void(__thiscall*)(void*)>(0x00a5c6a0)(b); }

// ---------------------------------------------------------------- the scene
void debugLog(const char*, ...) {}   // FUN_0052c360: compiled out of the shipped exe's output (debug log)
void playBgm(uint32_t id, int32_t fade) { exe<void(__cdecl*)(uint32_t, int32_t)>(0x00686560)(id, fade); }
void avatarPose(int32_t side, int32_t pose) { exe<void(__cdecl*)(int32_t, int32_t)>(0x00a56630)(side, pose); }
void duelAvatarPose(int32_t side, int32_t pose) { exe<void(__cdecl*)(int32_t, int32_t)>(0x007847b0)(side, pose); }
uint32_t systemTick() { return exe<uint32_t(__cdecl*)()>(0x006071f0)(); }
bool staticFieldAlive(void* task) { return task != nullptr; }
void staticFieldRefresh(void* field) {
    exe<void(__thiscall*)(void*)>(0x0079dfa0)(g_duelScene + 0x23c8);
    exe<void(__thiscall*)(void*)>(0x007eb690)(field);
}
CElement* sceneRoot() { return *reinterpret_cast<CElement**>(g_duelScene + 0x78); }   // its CTaskPtr<CElement>'s task
CWindowTaskModel* deckListOpen(CTask* parent, int32_t x, int32_t y, int32_t style, uint32_t a, uint32_t b,
                               int32_t c) {
    return exe<CWindowTaskModel*(__cdecl*)(CTask*, int32_t, int32_t, int32_t, uint32_t, uint32_t, int32_t)>(
        0x007674a0)(parent, x, y, style, a, b, c);
}
bool sceneTaskBusy(void* task) { return vcall<char>(task, 0x04) != 0; }

// ---------------------------------------------------------------- the attack (SceneBattleManager.h)
CSwfEngine* swfCreate(CTask* parent, uint32_t priority, const vc6::string& path, int32_t flag) {
    return exe<CSwfEngine*(__cdecl*)(CTask*, uint32_t, const vc6::string*, int32_t)>(0x0066d7a0)(parent, priority,
                                                                                                &path, flag);
}
void swfPlay(CSwfEngine* s, int32_t loop) { exe<void(__thiscall*)(void*, int32_t)>(0x0066e390)(s, loop); }
void swfPlayLabel(CSwfEngine* s, int32_t loop, const char* label) {
    exe<void(__thiscall*)(void*, int32_t, const char*)>(0x0066f550)(s, loop, label);
}
uint8_t& swfHold(CSwfEngine* s) { return at<uint8_t>(s, 0x3e4); }
uint8_t& swfEnded(CSwfEngine* s) { return at<uint8_t>(s, 0x3f1); }
void planeSetZ(PlaneLoader* p, int32_t i, float z) { exe<void(__thiscall*)(void*, int32_t, float)>(0x007d9050)(p, i, z); }
CCard* cardAt(uint32_t side, int32_t zone, uint32_t index) {
    return exe<CCard*(__cdecl*)(uint32_t, int32_t, uint32_t)>(0x00760f40)(side, zone, index);
}
bool cardSettled(uint32_t side, int32_t zone, uint32_t index) {
    return exe<char(__cdecl*)(uint32_t, int32_t, uint32_t)>(0x00761060)(side, zone, index) != 0;
}
void lpGaugeDamage(uint32_t side, int32_t amount, int32_t slot, bool flag) {
    exe<void(__thiscall*)(void*, int32_t, int32_t, int32_t)>(0x007cefc0)(g_duelScene + 0xa9c + side * 0x44, amount,
                                                                         slot, flag);
}
void playSe(uint32_t id, int32_t v) { exe<void(__cdecl*)(uint32_t, int32_t)>(0x00686560)(id, v); }
CWindowTaskModel* sceneModalWindow() { return *reinterpret_cast<CWindowTaskModel**>(g_duelScene + 0x108); }

}   // namespace ds
#endif
