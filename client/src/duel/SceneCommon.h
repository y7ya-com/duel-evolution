// Shared base of the duel scene's first half (0x00750000..0x007a0000: yo2Dialogs.cpp, yo2DuelScene.cpp, yo2Card,
// yo2BattleManager, yo2DeckList, yo2DuelMsg_Task, yo2DuelField, yo2DuelAvater...: the files under src/duel named
// Scene*).
//
// The scene is built on src/System: CTask / CTaskPtr / CElement / CEasyTask / CSceneTask, vc6::string / wstring and
// the window core (CWindowTaskModel, CWindowModelThin, CWindowModelDialogOk, the controls). Classes System has not
// ported yet are either forward declarations reached through seam functions (sprites, list boxes, SWF movies) or
// small stand-ins below with the exe's size; every seam is a "TODO(System) FUN_xxxxxxxx" (or TODO(scene2) for the
// scene's second half, 0x007a0000.., another helper's range). In the game (the i686 yo2rep.dll) the seams call the
// exe's own functions (src/duel/SceneExeCalls.cpp); the host tests give them stub bodies (tests/duel_scene1_*).
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>

#include "NetDuel.h"
#include "System/window/yo2UGDialogBase.h"
#include "System/window/yo2WindowDialogs.h"
#include "System/yo2Debug.h"
#include "System/yo2Scene.h"

// Globals: in the game (the i686 build) the scene's globals ARE the exe's (DAT_ addresses), as in NetDuel.h /
// Engine.h; elsewhere they are ordinary variables (defined under #if !YO2_IN_EXE next to their users).
#if defined(_WIN32) && defined(__i386__)
#define YO2_IN_EXE 1
#define YO2_EXE_VAR(T, a) (*reinterpret_cast<T*>(a))
#define YO2_EXE_ARR(T, a) (reinterpret_cast<T*>(a))
#else
#define YO2_IN_EXE 0
#endif

// Classes the scene holds but System has not ported (opaque here; reached through the seams below).
class CSpriteElm;          // a textured quad
class CTextElm;            // a text label
class CStaticField;        // the duel mat's static field layer

namespace ds {

// ---------------------------------------------------------------- the exe's arithmetic
// __ftol: truncation toward zero (x87 values are exact in double for the scene's ranges)
inline int32_t ftol(double v) { return static_cast<int32_t>(v); }

// A task's lock flags (CTask +0x20, protected): bit 1 keeps TM_MAIN away (hidden menus).
void taskLock(CTask* t, uint32_t mask, bool on);

// ---------------------------------------------------------------- stand-ins for System classes not ported yet
// The tail that brings a stand-in to the exe's size (YO2_SIZEOF checks it on i686; the host gets a fixed tail).
#define YO2_TAIL(total, Base) (sizeof(void*) == 4 ? (total) - sizeof(Base) : 0x100)

// TODO(System): CSpriteElmOlder (yo2SpriteElmOlder.cpp, 0x5088+ bytes): the sprite sheet the duel draws cards,
// coins, dice and effects with. Only its z / colour fields and blits are used, through the seams below.
class CSpriteElmOlder : public CElement {
public:
    uint8_t sprite_[YO2_TAIL(0x50a0, CElement)];
};

// TODO(System): CWindowTaskListbox (0x005b22f0.., 0x3e8+ bytes) and the three duel list boxes built on it. The
// select dialogs make one, add rows and read / set the hovered row; nothing else.
class CWindowTaskListbox : public CWindowTaskControll {
public:
    void layout() override;                     // TODO(System) slot 13
    bool hitTest(float x, float y) override;    // TODO(System) slot 15
    int32_t rowSpan(int32_t row);               // TODO(System) vf24 (+0x60): text lines of a row
    void clearHover();                          // TODO(System) vf23 (+0x5c)
    void setHover(int32_t row);                 // TODO(System) vf26 (+0x68)
    int32_t rows();                             // TODO(System) vf27 (+0x6c)
    bool selected(int32_t row);                 // TODO(System) vf29 (+0x74)
    void add(const WChar* text);                // TODO(System) FUN_005b3ca0
    int32_t selectedCount();                    // TODO(System) FUN_005b47b0
    void setSize(float w, float h);             // TODO(System) FUN_005ef240: +0x3b8 h, +0x3b4 w (relayout on change)
    // the inline setup the select dialogs do: margins +0x3ac / +0x3b0, element at (x, y); depth +0x3bc and +0x78
    void setMargins(int32_t left, int32_t top, float x, float y);
    void setDepth(float z);
    int32_t hover() const;                      // +0x3c0: the row under the mouse, -1 none
    void setPicks(int32_t n);                   // +0x3e0 (the card type / attribute lists)

    uint8_t listbox_[YO2_TAIL(0x3e8, CWindowTaskControll)];
};
YO2_SIZEOF(CWindowTaskListbox, 0x3e8);
// TODO(System) FUN_005b22f0: a new CWindowTaskListbox under `owner`, reporting to `mediator`
CWindowTaskListbox* listboxCreate(CTask* owner, IWindowTaskMediator* mediator, bool flag);
class CWindowTaskListboxCardType : public CWindowTaskListbox {
public:
    void addType(int32_t type);                 // TODO(System) FUN_00a18320
};
class CWindowTaskListboxCardAttr : public CWindowTaskListbox {
public:
    void addAttr(int32_t attr);                 // TODO(System) FUN_00a16be0
};
class CWindowTaskListboxDuelCmd : public CWindowTaskListbox {
public:
    void clearCmds();                           // TODO(System) FUN_00a22540
    void addCmd(int32_t cmd);                   // TODO(System) FUN_00a22270
};

// TODO(System): CWindowModelHelp (0x005e58a0.., 0x3e8 bytes): CWindowModelThin's sibling with a help text layout.
class CWindowModelHelp : public CWindowTaskModel {
public:
    CWindowModelHelp();                         // TODO(System) FUN_005e58a0
    ~CWindowModelHelp() override;
    bool onMain() override;                     // TODO(System) FUN_005e5f30 (returns true)
    void layout() override;                     // TODO(System)
    int32_t maxZ() const override;              // TODO(System)
    void setText(const WChar* s) override;      // TODO(System)
    void onControlEvent(CWindowTaskControll* sender) override;     // TODO(System)
    void onControlCommand(CWindowTaskControll* sender) override;   // TODO(System)
    void setup(float x, float y, int32_t style);   // TODO(System) FUN_005e5d30
    void textStyle0();                          // TODO(System) FUN_00599b60 + setAlign(0): text left aligned

    uint8_t help_[YO2_TAIL(0x3e8, CWindowTaskModel)];
};
YO2_SIZEOF(CWindowModelHelp, 0x3e8);

// ---------------------------------------------------------------- input (yaneSDK keys, the app's mouse)
using Mouse = CMouseEx;                         // the app's mouse object (*(DAT_012711ac) + 0x148), yaneSDK's
inline Mouse* appMouse() { return windowAppMouse(); }
void mousePos(Mouse* m, int32_t* x, int32_t* y);   // TODO(System) vf01 (+0x04)
bool mouseVf02(Mouse* m);                       // TODO(System) vf02 (+0x08)
bool mouseHeld(Mouse* m);                       // TODO(System) vf03 (+0x0c): left button down
void mouseConsume(Mouse* m);                    // TODO(System) vf06 (+0x18): the click was used
int32_t mouseWheel(Mouse* m);                   // TODO(System) vf10 (+0x28): wheel steps
void mouseResetWheel(Mouse* m);                 // TODO(System) vf12 (+0x30)
bool mouseWheelMoved(Mouse* m);                 // TODO(System) vf15 (+0x3c)
bool mouseClicked(Mouse* m);                    // TODO(System) vf16 (+0x40): left click
bool mouseRightClicked(Mouse* m);               // TODO(System) vf18 (+0x48)
bool mouseReleased(Mouse* m);                   // TODO(System) vf19 (+0x4c)
void mouseVf542850(Mouse* m, int32_t v);        // TODO(System) FUN_00542850
// yaneSDK FUN_00580d70 CKeyInput::isPush on the duel's key map (ECX = g_duelScene + ...). The duel's keys:
enum : int32_t { KEY_LEFT = 3, KEY_RIGHT = 4, KEY_DECIDE = 6, KEY_CANCEL = 0x14 };
bool keyPushed(int32_t key);                    // TODO(System) FUN_00580d70

// ---------------------------------------------------------------- the duel cursor (second half of the scene)
void cursorWarp(int32_t x, int32_t y);          // TODO(scene2) FUN_007d0600 CDuelCursor: move the mouse to (x, y)
void cursorWarpRepeat(int32_t x, int32_t y);    // TODO(scene2) FUN_007d05c0: the same once the key repeat allows it

// ---------------------------------------------------------------- CPlaneLoaderElm: a lazily loaded sprite sheet set
struct PlaneEntry {                    // one line of the sheet list file
    const char* path;
    int32_t frames;                    // frames across the sheet
};
struct PlaneLoader {                   // CPlaneLoaderElm, 0x38, vtable 0x00bea328 (CTaskUser base)
    uint32_t vtbl;                     // 0x00
    vc6::string dir;                   // 0x04 alloc byte + string
    uint8_t own;                       // 0x14 1
    uint8_t _15[3];
    int32_t count;                     // 0x18
    CTaskPtr<CSpriteElmOlder>* sprites;   // 0x1c one per entry, loaded on demand
    uint32_t tableVtbl;                // 0x20 auto_ptr<PlaneEntry[]> (vtable 0x00be65fc)
    PlaneEntry* table;                 // 0x24
    uint8_t tableOwned;                // 0x28
    uint8_t _29[3];
    uint32_t namesVtbl;                // 0x2c the second auto_ptr (vtable 0x00be65f0)
    void* names;                       // 0x30
    uint8_t namesOwned;                // 0x34
    uint8_t _35[3];
};
YO2_AT(PlaneLoader, dir, 0x04);
YO2_AT(PlaneLoader, sprites, 0x1c);
YO2_AT(PlaneLoader, table, 0x24);
YO2_AT(PlaneLoader, names, 0x30);
YO2_SIZEOF(PlaneLoader, 0x38);
void planeConstruct(PlaneLoader* p, uint8_t alloc);   // FUN_00757cd0 (SceneCard.cpp; inline elsewhere)
void planeDestruct(PlaneLoader* p);                   // TODO(System) inline ~CPlaneLoaderElm (the two auto_ptrs, dir)
void planeDelete(PlaneLoader* p);                     // TODO(System) FUN_00651d20 vf1(1): destroy and free
void planeEnsure(PlaneLoader* p, int32_t i);          // TODO(scene2) FUN_007d8840: load sheet i if not loaded yet
CSpriteElmOlder* planeSprite(PlaneLoader* p, int32_t i);   // FUN_00757920 (SceneCard.cpp): ensure + the TaskPtr
void planeLoad(PlaneLoader* p, const vc6::string& path);   // TODO(scene2) FUN_007d9700: read the sheet list file
void planeLoadY(PlaneLoader* p, const char* path);    // TODO(System) FUN_007540c0: planeLoad("data/Y/" + path)
int32_t planeFrames(PlaneLoader* p, int32_t i);       // TODO(scene2) FUN_007d9030: frames across sheet i
void spriteSize(CSpriteElmOlder* s, int32_t* w, int32_t* h);   // TODO(scene2) FUN_007d8690
void spriteSetZ(CSpriteElmOlder* s, float z);         // TODO(scene2) FUN_007d8750 (+0xd0 world z, +0x509c)
bool spriteHit(CSpriteElmOlder* s, int32_t x, int32_t y);   // TODO(scene2) FUN_007d8780 (inside the sheet)
// TODO(scene2) FUN_007d6310 (FUN_007d6790 / FUN_007d67d0 / FUN_007d6810 pass alpha 0xff, or alpha < 0xff):
// draw the sheet at (x, y), `src` = {x0, y0, x1, y1} cell rect or null, `size` = {w, h} target size or null.
void spriteDraw(CSpriteElmOlder* s, int32_t x, int32_t y, int32_t alpha, const int32_t* src, const int32_t* size,
                int32_t flags);

// ---------------------------------------------------------------- text
// FUN_00605410 (System's swprintf into a new wide string) for "%s"-only formats: the select-number dialog's message
vc6::wstring wformat4(const WChar* fmt, const WChar* a, const WChar* b, const WChar* c, const WChar* d);
void dlgTextW(WChar* out, int32_t id);          // TODO(System) FUN_00744a90: DLG_Text id as a wide string (0x200 B)
void formatNumW(WChar* out, const WChar* fmt, int32_t n);   // TODO(System) FUN_00743ae0: fmt with n
bool textLine(const WChar* src, WChar* out, int32_t i);     // TODO(scene2) FUN_007a0e80: line i of a "\n" list

// ---------------------------------------------------------------- the duel scene's globals (SceneDuelScene.cpp)
#if YO2_IN_EXE
#define g_duelScene YO2_EXE_VAR(uint8_t*, 0x012a9070)
#define g_duelAuto YO2_EXE_VAR(uint8_t, 0x012a90a4)
#else
extern uint8_t* g_duelScene;     // DAT_012a9070: the running CDuelScene
extern uint8_t g_duelAuto;       // DAT_012a90a4: dialogs answer their default at once (replay / auto play)
#endif
CElement* sceneRoot();           // TODO(scene1) the scene's base element (CDuelScene +0x74 CTaskPtr<CElement>'s task)
bool duelAutoFocus();            // FUN_007943d0: g_duelUi[0x434], the cursor jumps onto new dialogs
int32_t duelSceneFrame();        // *(g_duelScene + 0x1ec): the scene's frame counter

}   // namespace ds

void duelPlayBgm(int bgm, int loop, int fade);   // FUN_0073d4b0 TODO(System) (DuelExeCalls.cpp in the game)
// Engine answers (src/duel/EngineChain.cpp).
void engSendChoice(uint32_t v);  // FUN_0071f8c0: send a dialog answer
uint32_t engPairA();             // FUN_0071f480
int engPairANone();              // FUN_0071f4a0
