// Stub bodies for what src/duel/Scene*.cpp call outside the scene's first half (the TODO(System) / TODO(scene2)
// seams of SceneCommon.h and the files), for tests/duel_scene1_cli.cpp. They answer from and record into s1::st().
// src/System is linked as a library; its own unported seams come from tests/game/window_stubs.h.
#include <windows.h>

#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <set>

#include "System/yo2File.h"
#include "duel/Engine.h"
#include "duel/EngineInternal.h"
#include "duel/NetDuel.h"
#include "duel/SceneDialogs.h"
#include "duel_scene1_stubs.h"

#include "system/d3d8_fake.cpp"
std::set<int> g_keysDown;
SHORT GetAsyncKeyState(int vk) { return g_keysDown.count(vk) ? SHORT(0x8000) : 0; }
bool yo2LoadFile(const char*, std::vector<uint8_t>&) { return false; }
#include "game/window_stubs.h"
#include "Game/yo2TgtAvaListDlg.h"
GameCtrl::GameCtrl() : now_(0) {}
bool GameCtrl::enter(int32_t) { return true; }
void GameCtrl::leave(int32_t) {}
GameCtrl g_gameCtrl;

namespace s1 {
State& st() {
    static State s;
    return s;
}
void reset() {
    st() = State();
}
}   // namespace s1

using s1::st;

// ---------------------------------------------------------------- engine / NetDuel / text / card db
DuelEngine g_eng;
static uint8_t s_netDuelBlock[sizeof(CNetDuel)];
CNetDuel* g_netDuel = reinterpret_cast<CNetDuel*>(s_netDuelBlock);
static uint8_t s_duelUiBlock[0x500];
uint8_t* g_duelUi = s_duelUiBlock;
uint8_t g_sceneId;
int32_t g_duelMode;
void engSendChoice(uint32_t v) { st().sent.push_back(v); }
uint32_t engPairA() { return st().pairA; }
int engPairANone() { return st().pairANone; }
uint16_t engCc3aa() { return (uint16_t)st().discardLeft; }
int ndIsMatch() { return st().isMatch; }
const char* textById(int id) {
    static char buf[16][32];
    static int k;
    char* b = buf[k++ & 15];
    snprintf(b, 32, "T%d", id);
    return b;
}
int cardPropId(int index) { return index; }
int cardAtk(int id) { return id * 10; }
int cardDef(int id) { return id * 10 + 5; }

// System's yaneSDK mouse seams (yo2UGDialogBase.h)
static uint8_t s_mouse[4];
CMouseEx* windowAppMouse() { return reinterpret_cast<CMouseEx*>(s_mouse); }
void windowMouseGetXY(int32_t* x, int32_t* y) {
    *x = st().mouseX;
    *y = st().mouseY;
}
bool windowMouseLButton() { return st().held; }
void windowMouseResetButton() { st().log.push_back("consume"); }

namespace ds {

int32_t g_cardW = 80, g_miniW = 40, g_miniH = 56;
int32_t g_sinTable[0x200];
uint32_t g_appTick;

// ---------------------------------------------------------------- list boxes: a recording stand-in
template <class T>
class TestList final : public T {};
using TestListbox = TestList<CWindowTaskListboxDuelCmd>;
void CWindowTaskListbox::layout() {}
bool CWindowTaskListbox::hitTest(float, float) { return false; }
int32_t CWindowTaskListbox::rowSpan(int32_t row) {
    return row < (int32_t)st().rowSpan.size() ? st().rowSpan[row] : 1;
}
void CWindowTaskListbox::clearHover() { st().hover = -1; }
void CWindowTaskListbox::setHover(int32_t row) { st().hover = row; }
int32_t CWindowTaskListbox::rows() { return (int32_t)st().listRows.size(); }
bool CWindowTaskListbox::selected(int32_t row) { return st().selectedMask >> row & 1u; }
static std::string narrow(const WChar* w) {
    std::string s;
    while (w && *w) s += (char)*w++;
    return s;
}
void CWindowTaskListbox::add(const WChar* text) { st().listRows.push_back(narrow(text)); }
int32_t CWindowTaskListbox::selectedCount() { return st().selectedCount; }
void CWindowTaskListbox::setSize(float, float) {}
void CWindowTaskListbox::setMargins(int32_t, int32_t, float, float) {}
void CWindowTaskListbox::setDepth(float) {}
int32_t CWindowTaskListbox::hover() const { return st().hover; }
void CWindowTaskListbox::setPicks(int32_t) {}
CWindowTaskListbox* listboxCreate(CTask* owner, IWindowTaskMediator*, bool) {
    auto* l = new TestListbox;
    l->CTask::create(owner, 10);
    return l;
}
void CWindowTaskListboxCardType::addType(int32_t t) { st().listRows.push_back("type " + std::to_string(t)); }
void CWindowTaskListboxCardAttr::addAttr(int32_t a) { st().listRows.push_back("attr " + std::to_string(a)); }
void CWindowTaskListboxDuelCmd::clearCmds() { st().listRows.clear(); }
void CWindowTaskListboxDuelCmd::addCmd(int32_t c) { st().listRows.push_back("cmd " + std::to_string(c)); }
bool listCardTypeInit(CWindowModelListCardType* d) {
    auto* l = new TestList<CWindowTaskListboxCardType>;
    l->CTask::create(d, 10);
    d->list.set(l);
    return true;
}
bool listCardAttrInit(CWindowModelListCardAttr* d) {
    auto* l = new TestList<CWindowTaskListboxCardAttr>;
    l->CTask::create(d, 10);
    d->list.set(l);
    return true;
}
bool CWindowModelListDuelCmd::baseInit() {
    CWindowModelThin::onInit();
    list.setUser(this);
    list.set(static_cast<CWindowTaskListboxDuelCmd*>(listboxCreate(this, this, false)));
    return true;
}

// ---------------------------------------------------------------- CWindowModelHelp: a plain window
CWindowModelHelp::CWindowModelHelp() {}
CWindowModelHelp::~CWindowModelHelp() {}
bool CWindowModelHelp::onMain() { return true; }
void CWindowModelHelp::layout() { pos_.x = x_, pos_.y = y_; }
int32_t CWindowModelHelp::maxZ() const { return static_cast<int32_t>(z_ + 5.0f); }
void CWindowModelHelp::setText(const WChar*) {}
void CWindowModelHelp::onControlEvent(CWindowTaskControll*) {}
void CWindowModelHelp::onControlCommand(CWindowTaskControll*) {}
void CWindowModelHelp::setup(float x, float y, int32_t) {
    x_ = x, y_ = y;
    w_ = 336, h_ = 144;
}
void CWindowModelHelp::textStyle0() {}

// ---------------------------------------------------------------- input
void mousePos(Mouse*, int32_t* x, int32_t* y) {
    *x = st().mouseX;
    *y = st().mouseY;
}
bool mouseVf02(Mouse*) { return false; }
bool mouseHeld(Mouse*) { return st().held; }
void mouseConsume(Mouse*) { st().log.push_back("consume"); }
int32_t mouseWheel(Mouse*) { return st().wheel; }
void mouseResetWheel(Mouse*) { st().wheelMoved = false; }
bool mouseWheelMoved(Mouse*) { return st().wheelMoved; }
bool mouseClicked(Mouse*) { return st().clicked; }
bool mouseRightClicked(Mouse*) { return st().rightClicked; }
bool mouseReleased(Mouse*) { return st().released; }
void mouseVf542850(Mouse*, int32_t) {}
bool keyPushed(int32_t key) { return st().keys >> key & 1u; }
void cursorWarp(int32_t x, int32_t y) { st().warps.push_back({x, y}); }
void cursorWarpRepeat(int32_t x, int32_t y) { st().warps.push_back({x, y}); }

// ---------------------------------------------------------------- sprites
static CSpriteElmOlder* s_sprites[64];
void planeDestruct(PlaneLoader*) {}
void planeDelete(PlaneLoader* p) { ::operator delete(p); }
void planeEnsure(PlaneLoader* p, int32_t i) {
    static CTaskUser user;
    if (!p->sprites) {
        p->sprites = new CTaskPtr<CSpriteElmOlder>[64];
        for (int k = 0; k < 64; k++) p->sprites[k].setUser(&user);
    }
    if (!s_sprites[i]) s_sprites[i] = new CSpriteElmOlder;
    if (p->sprites[i].task() != s_sprites[i]) p->sprites[i].set(s_sprites[i]);
}
void planeLoad(PlaneLoader*, const vc6::string& path) { st().log.push_back(std::string("load ") + path.c_str()); }
void planeLoadY(PlaneLoader*, const char* path) { st().log.push_back(std::string("loadY ") + path); }
int32_t planeFrames(PlaneLoader*, int32_t) { return st().frames; }
void spriteSize(CSpriteElmOlder*, int32_t* w, int32_t* h) {
    *w = st().spriteW;
    *h = st().spriteH;
}
void spriteSetZ(CSpriteElmOlder*, float) {}
bool spriteHit(CSpriteElmOlder*, int32_t x, int32_t y) {
    return x >= 0 && x < st().spriteW && y >= 0 && y < st().spriteH;
}
void spriteDraw(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src, const int32_t* size,
                int32_t) {
    s1::Draw d{};
    d.sprite = s;
    d.x = x, d.y = y, d.alpha = alpha;
    if ((d.hasSrc = src != nullptr)) std::memcpy(d.src, src, sizeof d.src);
    if ((d.hasSize = size != nullptr)) std::memcpy(d.size, size, sizeof d.size);
    st().draws.push_back(d);
}

// ---------------------------------------------------------------- cards
void cardPlaneDestruct(CardPlane*) {}
void cardPlaneSetCard(CardPlane*, int32_t) {}
CSpriteElmOlder* cardPlaneField(CardPlane*, int32_t, int32_t) { return nullptr; }
CSpriteElmOlder* cardPlaneHandBig(CardPlane*, int32_t) { return nullptr; }
CSpriteElmOlder* cardPlaneHandMini(CardPlane*, int32_t) { return nullptr; }
// A deterministic mat: zone z of player p at (100 + 37 z + 11 i, 200 + 300 p - 5 i)
void matPos(uint32_t p, uint32_t z, uint32_t i, int32_t* x, int32_t* y) {
    *x = 100 + 37 * (int32_t)z + 11 * (int32_t)i;
    *y = 200 + 300 * (int32_t)p - 5 * (int32_t)i;
}

// ---------------------------------------------------------------- text
void dlgTextW(WChar* out, int32_t id) {
    char b[16];
    snprintf(b, sizeof b, "D%d", id);
    int i = 0;
    for (; b[i]; i++) out[i] = (WChar)b[i];
    out[i] = 0;
}
void formatNumW(WChar* out, const WChar* fmt, int32_t n) {   // the unit text, then the number
    int i = 0;
    while (fmt && fmt[i]) out[i] = fmt[i], i++;
    char b[16];
    snprintf(b, sizeof b, "%d", n);
    for (int k = 0; b[k]; k++) out[i++] = (WChar)b[k];
    out[i] = 0;
}
bool textLine(const WChar* src, WChar* out, int32_t n) {   // line n of a "\n" list
    int line = 0, o = 0;
    for (; *src; src++) {
        if (*src == u'\n') {
            if (line++ == n) break;
            continue;
        }
        if (line == n) out[o++] = *src;
    }
    out[o] = 0;
    return true;
}
void balloonConstruct(void*) {}
void balloonDestruct(void*) {}
void balloonSetWidth(void*, int32_t) {}
void balloonSetText(void*, const vc6::wstring&) {}
void balloonHide(void*) {}

// ---------------------------------------------------------------- the scene
void debugLog(const char*, ...) {}
void playBgm(uint32_t id, int32_t fade) { st().log.push_back("bgm " + std::to_string(id) + " " + std::to_string(fade)); }
void avatarPose(int32_t, int32_t) {}
void duelAvatarPose(int32_t side, int32_t pose) {
    st().log.push_back("pose " + std::to_string(side) + " " + std::to_string(pose));
}
uint32_t systemTick() { return 1234; }
void engineReset(int32_t) {}
bool staticFieldAlive(void* t) { return t != nullptr; }
void staticFieldRefresh(void*) { st().log.push_back("field refresh"); }
CElement* sceneRoot() { return nullptr; }
CWindowTaskModel* deckListOpen(CTask*, int32_t, int32_t, int32_t, uint32_t, uint32_t, int32_t) { return nullptr; }
bool sceneTaskBusy(void* t) { return *static_cast<int*>(t) != 0; }

}   // namespace ds

// ---------------------------------------------------------------- the attack's seams (SceneBattleManager.h)
#include "duel/CardDB.h"
#include "duel/EngineInternal.h"
#include "duel/SceneAffectIcon.h"
// the engine's queries the attack and the affect icons make: an empty mat
void duelPlayBgm(int bgm, int, int) { st().log.push_back("duel bgm " + std::to_string(bgm)); }
uint32_t engCardIdAt(uint32_t, int, int) { return 0; }
int engRelation(const EngStats*, uint32_t, int, uint32_t, int) { return 0; }
void engStatsOf2(uint32_t, int, EngStats* s) { std::memcpy(s, st().stats, sizeof *s); }
int engCardText(uint32_t, int) { return st().cardText; }
uint32_t* engWordAt(uint32_t, int, int) { return &st().word; }
int ndInput() { return st().input; }
uint16_t ndHandMask(int, int, int) { return st().handMask; }
int engCounterRoom(uint32_t, int) { return st().counterRoom; }
int engCardAt(uint32_t, int) { return 1; }
int engTurnCount(int) { return st().turns; }
uint32_t engSlotMinLock(uint32_t, int) { return st().minLock; }
uint32_t engCounters(uint32_t, int, int k) { return st().counters[k]; }
uint32_t engSlotKeyValue(uint32_t, int, uint32_t) { return st().keyValue; }
int engSlotHasKey(uint32_t, int, int) { return st().hasKey; }
int cardRace(int) { return st().race; }
int cardAttr(int) { return st().attr; }
int MulDiv(int a, int b, int c) {   // as platform/win32/win32.cpp (Win32 rounding)
    if (!c) return -1;
    int64_t p = (int64_t)a * b, q = p / c, r = p % c;
    if (2 * (r < 0 ? -r : r) >= (c < 0 ? -(int64_t)c : c)) q += (p < 0) != (c < 0) ? -1 : 1;
    return (int)q;
}
int cardPropIndex(int id) { return id; }
int engBattleCalc() { return 0; }
int engChainTargets(uint32_t, uint8_t, uint32_t, uint32_t) { return 0; }
uint32_t engFieldMaskBit(int, int) { return 0; }
int engMayAttackDirect(uint32_t, int) { return 0; }
int engAtk(uint32_t, int) { return 0; }
int eng6f4c40(uint32_t, int) { return 0; }
int eng6f76f0(uint32_t, uint32_t) { return 0; }
namespace ds {
alignas(16) static uint8_t s_swfMem[40][sizeof(CSwfEngine)];   // opaque handles, never constructed
static CSwfEngine* const s_swf = reinterpret_cast<CSwfEngine*>(s_swfMem);
static int s_swfNext;
static uint8_t s_swfHold[40], s_swfEnded[40];
CSwfEngine* swfCreate(CTask*, uint32_t priority, const vc6::string& path, int32_t) {
    st().log.push_back("swf " + std::to_string(priority) + " " + path.c_str());
    return &s_swf[s_swfNext++ % 40];
}
void swfPlay(CSwfEngine*, int32_t loop) { st().log.push_back("swf play " + std::to_string(loop)); }
void swfPlayLabel(CSwfEngine*, int32_t, const char* label) { st().log.push_back(std::string("swf label ") + label); }
uint8_t& swfHold(CSwfEngine* s) { return s_swfHold[s - s_swf]; }
uint8_t& swfEnded(CSwfEngine* s) { return s_swfEnded[s - s_swf]; }
void planeSetZ(PlaneLoader*, int32_t, float) {}
void spriteBlit(CSpriteElmOlder* s, int32_t x, int32_t y, float sx, float sy, int32_t srcX, int32_t srcY, int32_t w,
                int32_t h, int32_t cx, int32_t cy, int32_t alpha, float angle, int32_t mode) {
    s1::Draw d{};
    d.sprite = s, d.x = x, d.y = y, d.alpha = alpha;
    d.hasSrc = true;
    d.src[0] = srcX, d.src[1] = srcY, d.src[2] = srcX + w, d.src[3] = srcY + h;
    d.blit = true, d.sx = sx, d.sy = sy, d.cx = cx, d.cy = cy, d.angle = angle, d.mode = mode;
    st().draws.push_back(d);
}
CCard* cardAt(uint32_t, int32_t, uint32_t) { return nullptr; }
bool cardSettled(uint32_t, int32_t, uint32_t) { return true; }
void lpGaugeDamage(uint32_t side, int32_t amount, int32_t slot, bool) {
    st().log.push_back("lp " + std::to_string(side) + " " + std::to_string(amount) + " " + std::to_string(slot));
}
void playSe(uint32_t id, int32_t) { st().log.push_back("se " + std::to_string(id)); }
CWindowTaskModel* sceneModalWindow() { return nullptr; }
}   // namespace ds
