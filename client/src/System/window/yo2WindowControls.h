// The window controls (src\System\CWindowTask.cpp): frames, text, buttons ("switches"), scroll bars, list boxes,
// input fields... Each is a CWindowTaskControll built out of child elements: 9-slice sprites cut from one texture of
// data/common/window/ (a control's look is which texture rectangle each piece shows), and CTextElm labels.
//
// CSpriteElm, CDupSprite and CTextElm are System classes not ported yet. The controls create sprites and give them a
// texture through the three windowSprite* functions below; everything else they do to them (position, scale, the
// texture rectangle in rect_, visibility, draw mode) is CElement's, so it is written here against CElement.
// Functions that need CDupSprite's tiling or CTextElm's text are not rewritten yet: see STATUS_controls.md.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include "System/window/yo2WindowTask.h"

class CSpriteElm;
class CDupSprite;
class CTextElm;

// --- what the controls need from classes not ported yet -----------------------------------------------------------
// TODO(System): CSpriteElm::newChild (0x0061f260): a sprite under `parent` into `to` (CTaskPtr::set).
void windowSpriteCreate(CTaskPtr<CSpriteElm>& to, CTask* parent, uint32_t priority);
// TODO(System): CSpriteElm::create (0x0061f030): the same, with its texture file.
void windowSpriteCreate(CTaskPtr<CSpriteElm>& to, CTask* parent, uint32_t priority, const vc6::string& texture);
// TODO(System): CSpriteElm::setTexture (0x0061f320).
void windowSpriteTexture(const CTaskPtr<CSpriteElm>& sprite, const vc6::string& path);
// TODO(yaneSDK): the app's mouse in game pixels (CApp + 0x148, vslot 14 GetXY), which some controls poll every frame
// on top of the messages the factory routes to them (they read the button with GetAsyncKeyState(VK_LBUTTON)).
void windowMouse(int32_t* x, int32_t* y);

// TODO(System): CTextElm (0x760 bytes), the label element CWindowTaskText wraps: its creation, its text, two of its
// layout routines, and the fields CWindowTaskText writes directly (by their offsets in the exe's CTextElm).
void windowTextElmCreate(CTaskPtr<CTextElm>& to, CTask* parent, uint32_t priority);   // CTextElm::newChild 0x00634470
void windowTextElmSetText(const CTaskPtr<CTextElm>& t, const vc6::wstring& s);        // 0x00634850
void windowTextElmSetBox(const CTaskPtr<CTextElm>& t, float w, float h);              // 0x0058bc60
int32_t windowTextElmWidth(const CTaskPtr<CTextElm>& t);                              // 0x0058d460
int32_t windowTextElmLineCount(const CTaskPtr<CTextElm>& t, float width);             // 0x0058ea20 + its line list
int32_t windowTextElmLinesFrom(const CTaskPtr<CTextElm>& t, int32_t line, float height);   // 0x0058b270
// The fields CWindowTaskText sets (exe offsets in CTextElm for whoever ports it):
void windowTextElmSetFontSize(const CTaskPtr<CTextElm>& t, int32_t size);   // +0x440 = size, +0x444 = 0, +0x4b0 = 1,
                                                                            // +0x438 = 1 if +0x4f0 != 0 || +0x4ec != size
void windowTextElmSetLineGap(const CTaskPtr<CTextElm>& t, int32_t gap);     // +0x50c = +0x528 = float(gap)
void windowTextElmSetUnk748(const CTaskPtr<CTextElm>& t, bool on);          // +0x748 (byte; onInit sets it)
void windowTextElmSetAlign(const CTaskPtr<CTextElm>& t, int32_t align);     // +0x74c
int32_t windowTextElmAlign(const CTaskPtr<CTextElm>& t);
void windowTextElmSetFirstLine(const CTaskPtr<CTextElm>& t, int32_t line);  // +0x750
int32_t windowTextElmFirstLine(const CTaskPtr<CTextElm>& t);
void windowTextElmSetPageLines(const CTaskPtr<CTextElm>& t, int32_t lines); // +0x754
int32_t windowTextElmPageLines(const CTaskPtr<CTextElm>& t);
void windowTextElmSetField430(const CTaskPtr<CTextElm>& t, int32_t v);      // +0x430, a pointer: 0 = CTextElm's own +0x434

// TODO(System): CDupSprite, one texture drawn as a list of tiles (the striped list background).
struct WindowDupTile {
    float x, y;     // 0x00 position
    float sx, sy;   // 0x08 scale
    float u, v;     // 0x10 texture rectangle
    float w, h;     // 0x18
    uint32_t unk20; // 0x20
};
static_assert(sizeof(WindowDupTile) == 0x24, "WindowDupTile");
void windowDupCreate(CTaskPtr<CDupSprite>& to, CTask* parent, uint32_t priority, const vc6::string& texture);  // 0x005934f0
void windowDupClear(const CTaskPtr<CDupSprite>& d);                              // 0x00593270
void windowDupAddTile(const CTaskPtr<CDupSprite>& d, const WindowDupTile& t);    // 0x00592fb0
// TODO(yaneSDK): CMouseEx::IsPushLButton (vslot 16 of CApp + 0x148): the left button went down since the last flush.
bool windowMouseLeftPushed();

// A CTaskPtr's target as the CElement it is (what CTaskPtr<T>::get returns, with get's asserts).
CElement* windowElement(const CTaskPtrBase& p);
// CWindowTask.h: name a freshly created part (asserts it exists).
void windowNameTask(CTask* task, const char* name);
// CWindowTask.h: the factory's data directory ("data/common/window/").
vc6::string windowDataDir();

// --- CWindowTaskPictureFrame: a resizable 9-slice frame; subclasses pick the texture and the piece rectangles -------
class CWindowTaskPictureFrame : public CWindowTaskControll {
public:
    CWindowTaskPictureFrame();
    ~CWindowTaskPictureFrame() override;
    // @yo2 0x005a94a0 CWindowTaskPictureFrame::onMain
    bool onMain() override { return true; }
    void layout() override = 0;   // 0x005a94c0 (CDupSprite tiling): not rewritten
    bool handleMessage(WindowMsg m) override;
    bool hitTest(float x, float y) override;
    virtual void loadImages() = 0;   // slot 19: texture + pieces_

    int32_t pieces_[36] = {};     // 0x368 the nine pieces' texture rectangles (set by loadImages)
    float x_ = 0, y_ = 0;         // 0x3f8
    float w_ = 256, h_ = 256;     // 0x400
    CTaskPtr<CSpriteElm> topLeft_;     // 0x408
    CTaskPtr<CDupSprite> top_;         // 0x414
    CTaskPtr<CSpriteElm> topRight_;    // 0x420
    CTaskPtr<CDupSprite> left_;        // 0x42c
    CTaskPtr<CDupSprite> centre_;      // 0x438
    CTaskPtr<CSpriteElm> bottomLeft_;  // 0x444
    CTaskPtr<CDupSprite> bottom_;      // 0x450
    CTaskPtr<CSpriteElm> bottomRight_; // 0x45c
    CTaskPtr<CDupSprite> right_;       // 0x468
};
YO2_AT(CWindowTaskPictureFrame, pieces_, 0x368);
YO2_AT(CWindowTaskPictureFrame, x_, 0x3f8);
YO2_AT(CWindowTaskPictureFrame, w_, 0x400);
YO2_AT(CWindowTaskPictureFrame, topLeft_, 0x408);
YO2_AT(CWindowTaskPictureFrame, right_, 0x468);
YO2_SIZEOF(CWindowTaskPictureFrame, 0x474);

// --- CWindowTaskText: a text label (a CTextElm child) -------------------------------------------------------------
class CWindowTaskText : public CWindowTaskControll {
public:
    enum Align : int32_t { LEFT, CENTRE, RIGHT };   // CTextElm + 0x74c
    static CWindowTaskText* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskText();
    ~CWindowTaskText() override;
    bool onInit() override;
    bool onMain() override;
    void setMediator(IWindowTaskMediator* m) override;
    void setName(const vc6::string& s) override;   // the text itself, from a narrow string
    uint32_t kind() const override;
    void layout() override;
    bool hitTest(float x, float y) override;
    void setText(const WChar* s) override;          // also keeps a narrow copy in name_
    virtual void setTextA(const char* s);           // slot 19

    // What the windows and the other controls set on it (each one writes CTextElm fields).
    void setFontSize(int32_t size);
    void setLineGap(int32_t gap);
    void setColor(float r, float g, float b, float a);
    void setArea(int32_t w, int32_t h);   // the box the text is laid out (and clipped) in
    void setAlign(int32_t align);         // Align
    int32_t align() const;
    void setFirstLine(int32_t line);      // the first line shown (scrolling)
    int32_t firstLine() const;
    void setPageLines(int32_t lines);     // lines shown at once
    int32_t pageLines() const;
    void setField430(int32_t v);          // CTextElm + 0x430 (0: back to its own default)
    int32_t width() const;                // of the laid-out text, in pixels
    int32_t lineCount(float width) const;
    int32_t linesFrom(int32_t line, float height) const;   // lines that fit in `height` from `line` on
    void setPos(float x, float y);   // (z stays posZ_)

    CTaskPtr<CTextElm> text_;   // 0x368
    float x_ = 0;               // 0x374
    float y_ = 0;               // 0x378
    float posZ_ = 0;            // 0x37c the z setPos keeps
    int32_t fontSize_ = 16;     // 0x380
    int32_t lineGap_ = 0;       // 0x384
    float alpha_ = 1;           // 0x388
    uint32_t unk38c_ = 0;       // 0x38c
};
YO2_AT(CWindowTaskText, x_, 0x374);
YO2_AT(CWindowTaskText, posZ_, 0x37c);
YO2_AT(CWindowTaskText, text_, 0x368);
YO2_AT(CWindowTaskText, fontSize_, 0x380);
YO2_AT(CWindowTaskText, alpha_, 0x388);
YO2_SIZEOF(CWindowTaskText, 0x390);

// --- CWindowTaskSwitch: a push button, a 9-slice sprite frame with six looks -------------------------------------
class CWindowTaskSwitch : public CWindowTaskControll {
public:
    enum State : int32_t { NORMAL, HOVER, PRESSED, PRESSED_OUTSIDE };
    // Looks (columns of the texture): 0 normal, 1 hover, 2 pressed, 4 checked, 5 checked + hover; 3 draws nothing new.
    struct Piece {
        int32_t w, h;          // size
        int32_t uv[5][2];      // texture origin for looks 0, 1, 2, 4, 5
    };

    static CWindowTaskSwitch* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskSwitch();
    ~CWindowTaskSwitch() override;
    bool onInit() override;
    bool onMain() override;
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;
    bool hitTest(float x, float y) override;
    virtual void loadImages();   // slot 19

    bool hit(int32_t x, int32_t y) const;
    void setLook(int32_t look);
    void click();
    void setCentre(float x, float y);

    // 0x368 the pieces, top left .. bottom right, then the centre
    CTaskPtr<CSpriteElm> sprites_[9];
    float x_ = 0, y_ = 0;      // 0x3d4 top left
    float w_ = 256, h_ = 256;  // 0x3dc
    uint8_t unk3e4_ = 0, unk3e5_ = 0, unk3e6_ = 0;   // 0x3e4
    int32_t state_ = NORMAL;   // 0x3e8 State
    bool checked_ = false;     // 0x3ec
    Piece pieces_[9] = {};     // 0x3f0 in grid order: TL T TR / L C R / BL B BR
};
YO2_AT(CWindowTaskSwitch, sprites_, 0x368);
YO2_AT(CWindowTaskSwitch, x_, 0x3d4);
YO2_AT(CWindowTaskSwitch, w_, 0x3dc);
YO2_AT(CWindowTaskSwitch, state_, 0x3e8);
YO2_AT(CWindowTaskSwitch, checked_, 0x3ec);
YO2_AT(CWindowTaskSwitch, pieces_, 0x3f0);
YO2_SIZEOF(CWindowTaskSwitch, 0x5a0);

// --- CWindowTaskScrollBase: a scroll bar (arrows, a three-piece thumb, a track) -------------------------------------
class CWindowTaskScrollBase : public CWindowTaskControll {
public:
    // A piece's size and its texture origins for looks 0 (normal), 1 (hover), 2 (pressed).
    struct Piece {
        int32_t w, h;
        int32_t uv[3][2];
    };

    CWindowTaskScrollBase();
    ~CWindowTaskScrollBase() override;
    bool onInit() override;
    bool onMain() override;
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;
    bool hitTest(float x, float y) override;
    bool wheelHitTest(float x, float y) override;
    virtual float thumbLength();                             // slot 19
    virtual void drag(int32_t dx, int32_t dy) = 0;           // slot 20: the thumb follows the mouse
    virtual float valueToPos(int32_t unused);                // slot 21: thumb offset for value_
    virtual int32_t posToValue(float pos);                   // slot 22
    virtual float grabOffset(float x, float y) = 0;          // slot 23: where on the thumb it was grabbed
    virtual void placePieces() = 0;                          // slot 24
    virtual void loadImages() = 0;                           // slot 25: the pieces' sizes and texture origins

    bool hitUp(int32_t x, int32_t y) const;
    bool hitDown(int32_t x, int32_t y) const;
    bool hitThumb(int32_t x, int32_t y) const;
    void lookUp(int32_t look);
    void lookDown(int32_t look);
    void lookThumb(int32_t look);
    void stepUp();
    void stepDown();
    void releaseUp();
    void releaseDown();
    void setValue(int32_t v);
    void setMax(int32_t max);
    void show();
    void hide();
    void setWheelArea(float x, float y, float w, float h);

    Piece up_ = {};            // 0x368 up (left) arrow
    Piece down_ = {};          // 0x388 down (right) arrow
    Piece thumbTop_ = {};      // 0x3a8
    Piece thumbMid_ = {};      // 0x3c8 stretched
    Piece thumbBottom_ = {};   // 0x3e8
    int32_t trackW_ = 0, trackH_ = 0;   // 0x408 the track: size and texture origin
    int32_t trackU_ = 0, trackV_ = 0;   // 0x410
    CTaskPtr<CSpriteElm> upSprite_;          // 0x418
    CTaskPtr<CSpriteElm> downSprite_;        // 0x424
    CTaskPtr<CSpriteElm> thumbTopSprite_;    // 0x430
    CTaskPtr<CSpriteElm> thumbMidSprite_;    // 0x43c
    CTaskPtr<CSpriteElm> thumbBottomSprite_; // 0x448
    CTaskPtr<CSpriteElm> trackSprite_;       // 0x454
    float x_ = 0, y_ = 0;      // 0x460
    float length_ = 0;         // 0x468 track length (256 after onInit)
    uint32_t unk46c_ = 0;      // 0x46c
    float thumbPos_ = 0;       // 0x470 thumb offset from the up arrow
    float thumbLength_ = 0;    // 0x474
    int32_t value_ = 0;        // 0x478 0..max_
    int32_t max_ = 0;          // 0x47c
    bool upHeld_ = false;      // 0x480 the up arrow has been stepped since it was pressed
    int32_t upFrames_ = 0;     // 0x484 frames it has been held (auto-repeat after 30, every 4th)
    bool downHeld_ = false;    // 0x488
    int32_t downFrames_ = 0;   // 0x48c
    bool unk490_ = false;      // 0x490
    int32_t pressFrames_ = 0;  // 0x494 frames the button has been down (paging repeats like the arrows)
    int32_t page_ = 6;         // 0x498 values per click on the track
    bool dragStarted_ = false; // 0x49c (CWindowTaskScroll::drag)
    bool dragging_ = false;    // 0x49d the thumb is held
    uint32_t unk4a0_ = 0;      // 0x4a0
    float dragOffset_ = 0;     // 0x4a4
    bool autoHide_ = true;     // 0x4a8 hidden while there is nothing to scroll
    float wheelX_ = 0, wheelY_ = 0, wheelW_ = 0, wheelH_ = 0;   // 0x4ac the wheel works over this area
    bool visible_ = false;     // 0x4bc false: always hidden (set to true by onInit)
};
YO2_AT(CWindowTaskScrollBase, up_, 0x368);
YO2_AT(CWindowTaskScrollBase, down_, 0x388);
YO2_AT(CWindowTaskScrollBase, thumbTop_, 0x3a8);
YO2_AT(CWindowTaskScrollBase, thumbBottom_, 0x3e8);
YO2_AT(CWindowTaskScrollBase, trackW_, 0x408);
YO2_AT(CWindowTaskScrollBase, upSprite_, 0x418);
YO2_AT(CWindowTaskScrollBase, trackSprite_, 0x454);
YO2_AT(CWindowTaskScrollBase, x_, 0x460);
YO2_AT(CWindowTaskScrollBase, length_, 0x468);
YO2_AT(CWindowTaskScrollBase, thumbPos_, 0x470);
YO2_AT(CWindowTaskScrollBase, value_, 0x478);
YO2_AT(CWindowTaskScrollBase, upHeld_, 0x480);
YO2_AT(CWindowTaskScrollBase, pressFrames_, 0x494);
YO2_AT(CWindowTaskScrollBase, dragStarted_, 0x49c);
YO2_AT(CWindowTaskScrollBase, dragOffset_, 0x4a4);
YO2_AT(CWindowTaskScrollBase, autoHide_, 0x4a8);
YO2_AT(CWindowTaskScrollBase, wheelX_, 0x4ac);
YO2_AT(CWindowTaskScrollBase, visible_, 0x4bc);
YO2_SIZEOF(CWindowTaskScrollBase, 0x4c0);

// The vertical scroll bar.
class CWindowTaskScroll : public CWindowTaskScrollBase {
public:
    static CWindowTaskScroll* create(CTask* parent, IWindowTaskMediator* mediator, int32_t max);
    CWindowTaskScroll();
    ~CWindowTaskScroll() override;
    void drag(int32_t dx, int32_t dy) override;
    float grabOffset(float x, float y) override;
    void placePieces() override;
    void loadImages() override;

    int32_t prevValue_ = 0;   // 0x4c0 value_ before the drag step
    uint32_t unk4c4_ = 0;     // 0x4c4
};
YO2_AT(CWindowTaskScroll, prevValue_, 0x4c0);
YO2_SIZEOF(CWindowTaskScroll, 0x4c8);

// --- CWindowTaskBackPlane: a plain translucent panel (one stretched 8 x 8 sprite) ---------------------------------
class CWindowTaskBackPlane : public CWindowTaskControll {
public:
    static CWindowTaskBackPlane* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskBackPlane();
    ~CWindowTaskBackPlane() override;
    bool onInit() override;
    // @yo2 0x005a6c90 CWindowTaskBackPlane::onMain
    bool onMain() override { return true; }
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;
    bool hitTest(float x, float y) override;
    void setColor(float r, float g, float b, float a);

    CTaskPtr<CSpriteElm> sprite_;   // 0x368
    float x_ = 0, y_ = 0;           // 0x374
    float w_ = 256, h_ = 256;       // 0x37c
    uint32_t unk384_ = 0;           // 0x384
};
YO2_AT(CWindowTaskBackPlane, sprite_, 0x368);
YO2_AT(CWindowTaskBackPlane, x_, 0x374);
YO2_AT(CWindowTaskBackPlane, w_, 0x37c);
YO2_SIZEOF(CWindowTaskBackPlane, 0x388);

// The window frame textures (window_base_01_c00.png .. c08.png): styles 5 and 6 are drawn opaque.
const char* windowFrameTexture(int32_t style);

// --- CWindowTaskFrameThin: a thin 8-pixel frame, 8 sprites around an empty middle -------------------------------
class CWindowTaskFrameThin : public CWindowTaskControll {
public:
    static CWindowTaskFrameThin* create(CTask* parent, IWindowTaskMediator* mediator, int32_t style);
    CWindowTaskFrameThin();
    ~CWindowTaskFrameThin() override;
    bool onInit() override;
    // @yo2 0x005a0f20 CWindowTaskFrameThin::onMain
    bool onMain() override { return true; }
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;
    bool hitTest(float x, float y) override;   // the 8-pixel border only
    void setVisible(bool on);

    // top left, top, top right, left, right, bottom left, bottom, bottom right
    CTaskPtr<CSpriteElm> sprites_[8];   // 0x368
    float x_ = 0, y_ = 0;               // 0x3c8
    float w_ = 256, h_ = 256;           // 0x3d0
    int32_t style_ = 1;                 // 0x3d8 windowFrameTexture
    uint32_t unk3dc_ = 0;               // 0x3dc
};
YO2_AT(CWindowTaskFrameThin, sprites_, 0x368);
YO2_AT(CWindowTaskFrameThin, x_, 0x3c8);
YO2_AT(CWindowTaskFrameThin, w_, 0x3d0);
YO2_AT(CWindowTaskFrameThin, style_, 0x3d8);
YO2_SIZEOF(CWindowTaskFrameThin, 0x3e0);

// --- CWindowTaskFrameBottomThick: a frame with a thick bottom band (the dialogs' button row) -----------------------
class CWindowTaskFrameBottomThick : public CWindowTaskControll {
public:
    static CWindowTaskFrameBottomThick* create(CTask* parent, IWindowTaskMediator* mediator, int32_t style);
    CWindowTaskFrameBottomThick();
    ~CWindowTaskFrameBottomThick() override;
    bool onInit() override;
    // @yo2 0x005a3710 CWindowTaskFrameBottomThick::onMain
    bool onMain() override { return true; }
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;
    bool hitTest(float x, float y) override;   // the border and the bottom band
    void setVisible(bool on);

    // the frame (TL T TR L R BL B BR), the band (left, right, bottom left, bottom, bottom right), the band's middle
    CTaskPtr<CSpriteElm> sprites_[14];   // 0x368
    float x_ = 0, y_ = 0;                // 0x410
    float w_ = 256, h_ = 256;            // 0x418
    float bottomH_ = 256;                // 0x420 height of the band (24 after onInit)
    int32_t style_ = 1;                  // 0x424
};
YO2_AT(CWindowTaskFrameBottomThick, sprites_, 0x368);
YO2_AT(CWindowTaskFrameBottomThick, x_, 0x410);
YO2_AT(CWindowTaskFrameBottomThick, bottomH_, 0x420);
YO2_AT(CWindowTaskFrameBottomThick, style_, 0x424);
YO2_SIZEOF(CWindowTaskFrameBottomThick, 0x428);

// --- CWindowTaskShadowText: a text over a copy of itself one pixel down and right ----------------------------------
class CWindowTaskShadowText : public CWindowTaskControll, public IWindowTaskMediator {
public:
    static CWindowTaskShadowText* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskShadowText();
    ~CWindowTaskShadowText() override;
    bool onInit() override;
    // @yo2 0x005afbd0 CWindowTaskShadowText::onMain
    bool onMain() override { return true; }
    void setName(const vc6::string& s) override;
    uint32_t kind() const override;
    // @yo2 0x005afbf0 CWindowTaskShadowText::layout (empty)
    void layout() override {}
    bool hitTest(float x, float y) override;
    void setText(const WChar* s) override;
    virtual void setTextA(const char* s);   // slot 19
    // the texts' notices go on to this control's own mediator unchanged
    void onControlEvent(CWindowTaskControll* sender) override;
    void onControlCommand(CWindowTaskControll* sender) override;
    void mediatorSlot2(CWindowTaskControll* sender) override;
    void mediatorSlot3(CWindowTaskControll* sender) override;
    void beginDrag(CWindowTaskControll* sender, int32_t x, int32_t y) override;

    CTaskPtr<CWindowTaskText> text_;     // 0x36c
    CTaskPtr<CWindowTaskText> shadow_;   // 0x378 (hidden by CWindowTaskTextSwitch)
    int32_t shadowDx_ = 0;               // 0x384 1 after onInit
    int32_t shadowDy_ = 0;               // 0x388
    int32_t x_ = 0, y_ = 0;              // 0x38c
    uint32_t unk394_ = 0;                // 0x394
};
YO2_AT(CWindowTaskShadowText, text_, 0x36c);
YO2_AT(CWindowTaskShadowText, shadowDx_, 0x384);
YO2_AT(CWindowTaskShadowText, x_, 0x38c);
YO2_SIZEOF(CWindowTaskShadowText, 0x398);

// --- CWindowTaskTextSwitch: a button with a caption (the dialogs' 『はい』 / 『いいえ』) ---------------------------------
class CWindowTaskTextSwitch : public CWindowTaskSwitch, public IWindowTaskMediator {
public:
    static CWindowTaskTextSwitch* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskTextSwitch();
    ~CWindowTaskTextSwitch() override;
    bool onInit() override;
    bool onMain() override;
    void setName(const vc6::string& s) override;
    vc6::string name() const override;
    uint32_t kind() const override;
    void layout() override;   // the caption centred vertically; the button at least minW_ wide
    void setText(const WChar* s) override;
    // the caption's notices go on as this control's
    void onControlEvent(CWindowTaskControll* sender) override;
    void onControlCommand(CWindowTaskControll* sender) override;
    void mediatorSlot2(CWindowTaskControll* sender) override;
    void mediatorSlot3(CWindowTaskControll* sender) override;

    CTaskPtr<CWindowTaskShadowText> caption_;   // 0x5a4
    float minW_ = 0;                            // 0x5b0 80 after onInit
    float unk5b4_ = 0;                          // 0x5b4 24 after onInit
};
YO2_AT(CWindowTaskTextSwitch, caption_, 0x5a4);
YO2_AT(CWindowTaskTextSwitch, minW_, 0x5b0);
YO2_SIZEOF(CWindowTaskTextSwitch, 0x5b8);

// --- CWindowTaskTextField: multi-line text on a back plane, with a scroll bar -------------------------------------
class CWindowTaskTextField : public CWindowTaskControll, public IWindowTaskMediator {
public:
    static CWindowTaskTextField* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskTextField();
    ~CWindowTaskTextField() override;
    bool onInit() override;
    // @yo2 0x005b0c40 CWindowTaskTextField::onMain
    bool onMain() override { return true; }
    void setName(const vc6::string& s) override;
    vc6::string name() const override;
    uint32_t kind() const override;
    void layout() override;   // "textFieldResize"
    bool hitTest(float x, float y) override;
    void setText(const WChar* s) override;
    virtual void setEnabled(bool on);   // slot 19: this control and its three parts
    // the parts' notices: the scroll bar moved (slot 0) re-lays the text; the rest go on as this control's
    void onControlEvent(CWindowTaskControll* sender) override;
    void onControlCommand(CWindowTaskControll* sender) override;
    void mediatorSlot2(CWindowTaskControll* sender) override;
    void mediatorSlot3(CWindowTaskControll* sender) override;

    CTaskPtr<CWindowTaskBackPlane> back_;   // 0x36c
    CTaskPtr<CWindowTaskScroll> scroll_;    // 0x378
    CTaskPtr<CWindowTaskText> text_;        // 0x384
    float x_ = 0, y_ = 0;                   // 0x390
    float w_ = 0, h_ = 0;                   // 0x398 256 x 256 after onInit
    float posZ_ = 0;                        // 0x3a0
    uint32_t unk3a4_ = 0;                   // 0x3a4
};
YO2_AT(CWindowTaskTextField, back_, 0x36c);
YO2_AT(CWindowTaskTextField, x_, 0x390);
YO2_AT(CWindowTaskTextField, posZ_, 0x3a0);
YO2_SIZEOF(CWindowTaskTextField, 0x3a8);

// --- CWindowTaskBackStripe: the list background, rows alternately shaded, selected rows highlighted ---------------
class CWindowTaskBackStripe : public CWindowTaskControll {
public:
    struct Row {
        float top;      // 0x00
        float height;   // 0x04
        int32_t span;   // 0x08 lines in the row
    };
    static CWindowTaskBackStripe* create(CTask* parent, IWindowTaskMediator* mediator, bool multi);
    CWindowTaskBackStripe();
    ~CWindowTaskBackStripe() override;
    bool onInit() override;
    bool onMain() override;   // hands the tiles to the CDupSprite
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;   // a click selects the row under it
    bool hitTest(float x, float y) override;
    virtual bool isSelected(int32_t row) const;   // slot 19

    void rebuild();                      // rows from the spans, one tile per row
    void applyLooks(int32_t firstItem);  // shading by the parity of the first item shown, then the selection
    void select(int32_t row);
    void clearSelection();
    void setRowSpan(int32_t row, int32_t lines);
    int32_t rowSpan(int32_t row) const;

    CTaskPtr<CDupSprite> dup_;            // 0x368
    vc6::vector<WindowDupTile> tiles_;    // 0x374
    vc6::vector<Row> rows_;               // 0x384
    float x_ = 0, y_ = 0;                 // 0x394
    float w_ = 256, h_ = 256;             // 0x39c
    int32_t rowH_ = 16;                   // 0x3a4
    int32_t rowCount_ = 0;                // 0x3a8 (int)(h_ / rowH_)
    int32_t selected_ = -1;               // 0x3ac
    bool unk3b0_ = false;                 // 0x3b0
    bool multi_ = false;                  // 0x3b1 clicks toggle rows
    vc6::vector<uint8_t> flags_;          // 0x3b4 selected rows
    vc6::map<int32_t, int32_t> spans_;    // 0x3c4 row -> lines (missing: 1)
    uint32_t unk3d4_ = 0;                 // 0x3d4
};
YO2_AT(CWindowTaskBackStripe, tiles_, 0x374);
YO2_AT(CWindowTaskBackStripe, rows_, 0x384);
YO2_AT(CWindowTaskBackStripe, x_, 0x394);
YO2_AT(CWindowTaskBackStripe, rowH_, 0x3a4);
YO2_AT(CWindowTaskBackStripe, multi_, 0x3b1);
YO2_AT(CWindowTaskBackStripe, flags_, 0x3b4);
YO2_AT(CWindowTaskBackStripe, spans_, 0x3c4);
YO2_SIZEOF(CWindowTaskBackStripe, 0x3d8);

// MSVC6 std::vector<std::wstring>: a std::vector behind the `first` slot (footprint only, like vc6::map).
class WindowWStringList {
public:
    WindowWStringList() = default;
    WindowWStringList(const WindowWStringList&) = delete;
    WindowWStringList& operator=(const WindowWStringList&) = delete;
    ~WindowWStringList() { delete v_; }
    std::vector<vc6::wstring>& operator*() const { return *v_; }
    std::vector<vc6::wstring>* operator->() const { return v_; }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;
    std::vector<vc6::wstring>* v_ = new std::vector<vc6::wstring>;
    [[maybe_unused]] uint32_t last_ = 0, end_ = 0;
};
YO2_SIZEOF(WindowWStringList, 0x10);

// --- CWindowTaskListbox: items shown as one text over a striped background, with a scroll bar ---------------------
class CWindowTaskListbox : public CWindowTaskControll, public IWindowTaskMediator {
public:
    static CWindowTaskListbox* create(CTask* parent, IWindowTaskMediator* mediator, bool multi);
    CWindowTaskListbox();
    ~CWindowTaskListbox() override;
    bool onInit() override;
    // @yo2 0x005b2660 CWindowTaskListbox::onMain
    bool onMain() override { return true; }
    void setAlpha(float a) override;   // the background's
    uint32_t kind() const override;
    void layout() override;            // "Resize@CWindowTaskListbox"
    bool hitTest(float x, float y) override;
    // the parts' notices: the background (a row clicked) or the scroll bar moved
    void onControlEvent(CWindowTaskControll* sender) override;   // "ColleagueChanged"
    void onControlCommand(CWindowTaskControll* sender) override;
    void mediatorSlot2(CWindowTaskControll* sender) override;
    void mediatorSlot3(CWindowTaskControll* sender) override;

    virtual int32_t lineToItem(int32_t line);    // slot 19
    virtual int32_t itemToLine(int32_t item);    // slot 20
    virtual void applyRowSpans();                // slot 21
    virtual void setEnabled(bool on);            // slot 22
    virtual void reset();                        // slot 23
    virtual int32_t itemLines(int32_t item);     // slot 24 (measured; 1 unless multiLine_)
    virtual int32_t itemCount();                 // slot 25
    virtual void select(int32_t item);           // slot 26
    virtual int32_t lineTotal();                 // slot 27
    virtual void scrollToLine(int32_t line);     // slot 28
    virtual bool isSelected(int32_t item);       // slot 29
    virtual void clearSelection();               // slot 30

    void addItem(const WChar* s);
    void removeItem(int32_t item);
    void clear();
    void setItem(int32_t item, const WChar* s);
    void recountLines();
    void setFontSize(int32_t size);
    int32_t selectedCount();
    void setPos(float x, float y);   // (CWindowTask.h inline)
    void setSize(float w, float h);  // (CWindowTask.h inline) a new width re-measures the items

    CTaskPtr<CWindowTaskBackStripe> stripe_;   // 0x36c
    CTaskPtr<CWindowTaskScroll> scroll_;       // 0x378
    CTaskPtr<CWindowTaskText> text_;           // 0x384 all the items, one per line
    CTaskPtr<CWindowTaskText> measure_;        // 0x390 hidden: measures an item's lines
    WindowWStringList items_;                  // 0x39c
    int32_t x_ = 0, y_ = 0;                    // 0x3ac
    int32_t w_ = 0, h_ = 0;                    // 0x3b4 256 x 256 after onInit
    float posZ_ = 0;                           // 0x3bc
    int32_t selected_ = -1;                    // 0x3c0 (single selection)
    int32_t topItem_ = 0;                      // 0x3c4 first item shown
    int32_t topLine_ = 0;                      // 0x3c8 first line shown
    bool clean_ = false;                       // 0x3cc laid out since the last change
    bool multi_ = false;                       // 0x3cd
    vc6::vector<uint8_t> selFlags_;            // 0x3d0 per item
    int32_t maxSelect_ = 9999;                 // 0x3e0
    vc6::vector<int32_t> lineCounts_;          // 0x3e4 per item
    uint32_t unk3f4_ = 0;                      // 0x3f4
    bool multiLine_ = true;                    // 0x3f8 items may wrap
    bool autoLayout_ = false;                  // 0x3f9 layout() does nothing while false
    int32_t lastSender_ = 0;                   // 0x3fc 1 background, 2 scroll bar
};
YO2_AT(CWindowTaskListbox, stripe_, 0x36c);
YO2_AT(CWindowTaskListbox, measure_, 0x390);
YO2_AT(CWindowTaskListbox, items_, 0x39c);
YO2_AT(CWindowTaskListbox, x_, 0x3ac);
YO2_AT(CWindowTaskListbox, posZ_, 0x3bc);
YO2_AT(CWindowTaskListbox, topLine_, 0x3c8);
YO2_AT(CWindowTaskListbox, selFlags_, 0x3d0);
YO2_AT(CWindowTaskListbox, lineCounts_, 0x3e4);
YO2_AT(CWindowTaskListbox, multiLine_, 0x3f8);
YO2_AT(CWindowTaskListbox, lastSender_, 0x3fc);
YO2_SIZEOF(CWindowTaskListbox, 0x400);

// A list box that follows the mouse: the row under it is selected; a click remembers it in clicked_.
class CWindowTaskActiveListbox : public CWindowTaskListbox {
public:
    static CWindowTaskActiveListbox* create(CTask* parent, IWindowTaskMediator* mediator, bool multi);
    CWindowTaskActiveListbox();
    ~CWindowTaskActiveListbox() override;
    bool onMain() override;
    void reset() override;

    int32_t clicked_ = -1;   // 0x400
    uint32_t unk404_ = 0;
};
YO2_AT(CWindowTaskActiveListbox, clicked_, 0x400);
YO2_SIZEOF(CWindowTaskActiveListbox, 0x408);

// A list box without a background whose items are the lines of one text.
class CWindowTaskTextlist : public CWindowTaskListbox {
public:
    static CWindowTaskTextlist* create(CTask* parent, IWindowTaskMediator* mediator);
    ~CWindowTaskTextlist() override;
    bool onInit() override;
    void setText(const WChar* s) override;
};
YO2_SIZEOF(CWindowTaskTextlist, 0x400);

// --- CWindowTaskIconbar: a 24-pixel bar, three pieces of iconbar_01_c01.png (lit or dimmed) -------------------------
class CWindowTaskIconbar : public CWindowTaskControll {
public:
    static CWindowTaskIconbar* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskIconbar();
    ~CWindowTaskIconbar() override;
    bool onInit() override;
    // @yo2 0x005cb6a0 CWindowTaskIconbar::onMain
    bool onMain() override { return true; }
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;   // a click grabs the window
    bool hitTest(float x, float y) override;

    CTaskPtr<CSpriteElm> left_;     // 0x368
    CTaskPtr<CSpriteElm> middle_;   // 0x374 stretched
    CTaskPtr<CSpriteElm> right_;    // 0x380
    float x_ = 0, y_ = 0;           // 0x38c
    float w_ = 256, h_ = 256;       // 0x394 32 x 24 after onInit
    bool active_ = false;           // 0x39c lit (true after onInit)
};
YO2_AT(CWindowTaskIconbar, left_, 0x368);
YO2_AT(CWindowTaskIconbar, x_, 0x38c);
YO2_AT(CWindowTaskIconbar, w_, 0x394);
YO2_AT(CWindowTaskIconbar, active_, 0x39c);
YO2_SIZEOF(CWindowTaskIconbar, 0x3a0);

// --- CWindowTaskThinChop: a thin frame without its top edge (sits under an icon bar) -------------------------------
class CWindowTaskThinChop : public CWindowTaskControll {
public:
    static CWindowTaskThinChop* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskThinChop();
    ~CWindowTaskThinChop() override;
    bool onInit() override;
    // @yo2 0x005cbd20 CWindowTaskThinChop::onMain
    bool onMain() override { return true; }
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;   // a click grabs the window
    bool hitTest(float x, float y) override;    // the left, right and bottom edges

    // left, right, bottom left, bottom, bottom right
    CTaskPtr<CSpriteElm> sprites_[5];   // 0x368
    float x_ = 0, y_ = 0;               // 0x3a4
    float w_ = 256, h_ = 256;           // 0x3ac
    uint32_t unk3b4_ = 0;               // 0x3b4
};
YO2_AT(CWindowTaskThinChop, sprites_, 0x368);
YO2_AT(CWindowTaskThinChop, x_, 0x3a4);
YO2_AT(CWindowTaskThinChop, w_, 0x3ac);
YO2_SIZEOF(CWindowTaskThinChop, 0x3b8);

// --- CWindowTaskIconHide: the window's x (close) button ------------------------------------------------------------
class CWindowTaskIconHide : public CWindowTaskControll {
public:
    static CWindowTaskIconHide* create(CTask* parent, IWindowTaskMediator* mediator);
    CWindowTaskIconHide();
    ~CWindowTaskIconHide() override;
    bool onInit() override;
    bool onMain() override;                     // looks: normal, hover (or focused), pressed
    uint32_t kind() const override;
    void layout() override;
    bool handleMessage(WindowMsg m) override;   // fires on the button's release (mediator slot 0)
    bool hitTest(float x, float y) override;
    void setLook(int32_t look);

    CTaskPtr<CSpriteElm> sprite_;   // 0x368
    float x_ = 0, y_ = 0;           // 0x374
    float w_ = 256, h_ = 256;       // 0x37c 16 x 24 after onInit
    bool pressed_ = false;          // 0x384 the press started on the button
    uint8_t unk385_ = 0;            // 0x385
    bool wasUp_ = false;            // 0x386 the button was up last frame
};
YO2_AT(CWindowTaskIconHide, sprite_, 0x368);
YO2_AT(CWindowTaskIconHide, x_, 0x374);
YO2_AT(CWindowTaskIconHide, w_, 0x37c);
YO2_AT(CWindowTaskIconHide, pressed_, 0x384);
YO2_AT(CWindowTaskIconHide, wasUp_, 0x386);
YO2_SIZEOF(CWindowTaskIconHide, 0x388);
