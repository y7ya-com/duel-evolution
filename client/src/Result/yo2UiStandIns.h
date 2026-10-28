// Stand-ins for the src/System UI classes that src/Result and src/shop build on: the window framework (windows,
// controls, IWindowTaskMediator / IWindowTaskColleague), text and sprite elements. None of them is on this branch.
//
// Each class here has the exe's base classes and the members these folders touch at the exe's offsets (pinned on
// i686), padded to the exe's size; the virtual slots follow the exe's vtables. Member and method names follow
// phase2-game's src/System/window where it has the class. Nothing is defined here: the Result/shop tests link
// recording fakes (tests/ui_result/ui_fakes.cpp). TODO(System): when System's own classes land, delete this file
// and include theirs; the names below are what this code expects of them.
#pragma once
#include <cstdint>
#include <string>
#include <string_view>

#include "System/yo2EasyTask.h"
#include "System/yo2Element.h"
#include "System/yo2TaskPtr.h"

using WChar = char16_t;  // the exe's UTF-16 wchar_t

// ---------------------------------------------------------------- free functions
// yo2WidenInto (0x6054c0): MultiByteToWideChar(the UI code page) into a buffer of `cap` characters.
void yo2WidenInto(const char* s, WChar* out, int cap);
// 0x605410: swprintf into one shared buffer (valid until the next call).
const WChar* yo2FormatW(const WChar* fmt, ...);
// CWindowTask.h (0x5a27a0): assert a freshly created part exists, then setInstName(name).
void windowNameTask(CTask* task, const char* name);

// ---------------------------------------------------------------- mediator / colleague
class IWindowTaskColleague;

// A window or composite control that its controls report to. The sender is the control's colleague part.
class IWindowTaskMediator {
public:
    virtual void onControlEvent(IWindowTaskColleague* sender) = 0;    // slot 0 (a control's value changed)
    virtual void onControlCommand(IWindowTaskColleague* sender) = 0;  // slot 1 (a control was clicked)
    virtual void mediatorSlot2(IWindowTaskColleague* sender);         // slot 2 (empty, 0x594f90)
    virtual void mediatorSlot3(int32_t);                              // slot 3 (empty, 0x594fb0)
    virtual void beginDrag(IWindowTaskColleague* sender, int32_t x, int32_t y);  // slot 4 (empty, 0x594fd0)
};

class IWindowTaskColleague {
public:
    virtual void setMediator(IWindowTaskMediator* m);  // slot 0 (0x594ff0)
    IWindowTaskMediator* mediator_ = nullptr;          // +0x04
};

// ---------------------------------------------------------------- CSpriteElm (yo2SpriteElm.cpp)
class CSpriteElm : public CElement {
public:
    static CSpriteElm* newChild(CTask* parent, uint32_t priority);  // 0x61f260
    void setTexture(const vc6::string& path);                       // 0x61f320
};

// ---------------------------------------------------------------- CTextElm and its text texture
// The CD3DTextTexture a CTextElm draws with (CTextElm + 0x3cc). Named: what these folders touch.
struct CD3DTextTextureView {
    uint8_t unk00_[0x6c];
    bool dirty_;              // 0x6c re-render on the next update
    uint8_t unk6d_[0x07];
    int32_t fontHeight_;      // 0x74 its CGlyphOutline's LOGFONT lfHeight
    int32_t fontWidth_;       // 0x78 lfWidth
    uint8_t unk7c_[0x68];
    bool outlineDirty_;       // 0xe4 recreate the font
    uint8_t unke5_[0x3b];
    int32_t curHeight_;       // 0x120 the font the texture was last rendered with
    int32_t curWidth_;        // 0x124
    int32_t unk128_;          // 0x128

    void setFont(int32_t width, int32_t height);  // 0x8c8a00 (inline; the copy emitted into yo2ResultWindow.cpp)
    int32_t maxLineWidth();                       // 0x58d460
};
YO2_AT(CD3DTextTextureView, dirty_, 0x6c);
YO2_AT(CD3DTextTextureView, fontHeight_, 0x74);
YO2_AT(CD3DTextTextureView, fontWidth_, 0x78);
YO2_AT(CD3DTextTextureView, outlineDirty_, 0xe4);
YO2_AT(CD3DTextTextureView, curHeight_, 0x120);
YO2_AT(CD3DTextTextureView, curWidth_, 0x124);
YO2_SIZEOF(CD3DTextTextureView, 0x12c);

class CTextElm : public CElement {
public:
    static CTextElm* newChild(CTask* parent, uint32_t priority);  // 0x634470
    void setText(std::u16string_view text);                      // 0x634850 (takes a std::wstring)
    CD3DTextTextureView& texture() { return texture_; }

    uint8_t unk340_[0x8c];
    CD3DTextTextureView texture_;  // 0x3cc
    uint8_t unk4f8_[0x268];
};
YO2_AT(CTextElm, texture_, 0x3cc);
YO2_SIZEOF(CTextElm, 0x760);

// ---------------------------------------------------------------- the window framework
// One routed input message (8 dwords by value).
struct WindowMsg {
    uint32_t msg, wParam, lParam;
    int32_t x, y;
    uint8_t lButton, rButton, pad_[2];
    uint32_t key, ch;
};
static_assert(sizeof(WindowMsg) == 0x20, "WindowMsg");

class CWindowTaskControll : public CElement, public IWindowTaskColleague {
public:
    CWindowTaskControll();
    ~CWindowTaskControll() override;
    int32_t receive(CTaskMessage* msg) override;
    void onDestroy() override;

    virtual double z() const;                                  // slot 8
    virtual void setAlpha(float a);                            // slot 9
    virtual void setName(const vc6::string& s);                // slot 10
    virtual vc6::string name() const;                          // slot 11
    virtual uint32_t kind() const;                             // slot 12
    virtual void layout() = 0;                                 // slot 13
    virtual bool handleMessage(WindowMsg m);                   // slot 14
    virtual bool hitTest(float x, float y) = 0;                // slot 15
    virtual bool wheelHitTest(float x, float y);               // slot 16
    virtual void setText(const WChar* s);                      // slot 17
    virtual void setTextId(int32_t textId);                    // slot 18

    bool destroyed_ = false;   // 0x348
    uint8_t unk349_ = 0;       // 0x349
    float baseZ_ = 0;          // 0x34c (the controls' own z offset; CWindowTaskControll::z adds it)
    bool enabled_ = false;     // 0x350
    uint8_t focused_ = 0;      // 0x351
    uint8_t unk352_[2] = {};
    vc6::string name_;         // 0x354
    uint32_t unk364_ = 0;      // 0x364
};
YO2_AT(CWindowTaskControll, mediator_, 0x344);
YO2_AT(CWindowTaskControll, baseZ_, 0x34c);
YO2_AT(CWindowTaskControll, name_, 0x354);
YO2_SIZEOF(CWindowTaskControll, 0x368);

class CWindowTaskModel : public CElement, public IWindowTaskMediator {
public:
    CWindowTaskModel();
    ~CWindowTaskModel() override;
    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    void onDestroy() override;
    void beginDrag(IWindowTaskColleague* sender, int32_t x, int32_t y) override;

    virtual void applyZ();                       // slot 8
    virtual void layout() = 0;                   // slot 9
    virtual int32_t baseZ() = 0;                 // slot 10: z the window's parts are placed from
    virtual void setTextA(const char* s);        // slot 11
    virtual void setText(const WChar* s);        // slot 12
    virtual void setTextId(int32_t textId);      // slot 13
    virtual void centre();                       // slot 14
    virtual bool windowSlot15();                 // slot 15
    virtual void endDrag();                      // slot 16
    virtual void drag(int32_t x, int32_t y);     // slot 17
    virtual bool windowSlot18();                 // slot 18
    virtual void fadeIn(uint32_t mode);          // slot 19
    virtual void windowSlot20(uint32_t);         // slot 20

    void bringToFront();                         // 0x5df430

    bool destroyed_ = false;   // 0x344
    uint32_t unk348_ = 0;      // 0x348
    float z_ = 0;              // 0x34c the factory's order
    bool modal_ = false;       // 0x350
    bool active_ = true;       // 0x351
    bool movable_ = false;     // 0x352
    bool dragging_ = false;    // 0x353
    int32_t dragX_ = 0;        // 0x354
    int32_t dragY_ = 0;        // 0x358
    bool topmost_ = false;     // 0x35c
    bool pinned_ = false;      // 0x35d
    uint32_t unk360_ = 0;      // 0x360
    int32_t fadeFrames_ = 5;   // 0x364
    uint8_t unk368_ = 0;       // 0x368
    int32_t fadeX_ = 0, fadeY_ = 0, fadeW_ = 0, fadeH_ = 0;  // 0x36c
    float fadeAlpha_ = 0;      // 0x37c
    float x_ = 0;              // 0x380
    float y_ = 0;              // 0x384
    float w_ = 0;              // 0x388
    float h_ = 0;              // 0x38c
    CWindowTaskModel* parent_ = nullptr;  // 0x390
    void* callback_ = nullptr;            // 0x394 CWindowCallback*
};
YO2_AT(CWindowTaskModel, destroyed_, 0x344);
YO2_AT(CWindowTaskModel, z_, 0x34c);
YO2_AT(CWindowTaskModel, modal_, 0x350);
YO2_AT(CWindowTaskModel, x_, 0x380);
YO2_AT(CWindowTaskModel, callback_, 0x394);
YO2_SIZEOF(CWindowTaskModel, 0x398);

// ---------------------------------------------------------------- controls
// A text label (a CTextElm child).
class CWindowTaskText : public CWindowTaskControll {
public:
    void layout() override;                            // slot 13 (0x5aecc0)
    bool hitTest(float x, float y) override;           // slot 15 (0x5aedf0)
    void setText(const WChar* s) override;             // slot 17 (0x5af000)
    virtual void setTextA(const char* s);              // slot 19 (0x5af350)
    void setFontSize(int32_t size);                    // 0x5af590
    void setColor(float r, float g, float b, float a); // 0x5af650 (the CTextElm's colour)
    void setSize(int32_t w, int32_t h);                // 0x5af690 (the text box)
    int32_t lineCount(float width);                    // 0x5af750 (lines when wrapped at `width`)
    void setAlign(int32_t align);                      // 0x5af8a0 (0 left, 1 centre, 2 right)
    void setFirstLine(int32_t line);                   // 0x5af3d0 (scrolling)
    void setLineLimit(int32_t lines);                  // 0x5af3a0 (CTextElm + 0x754)
    void setPosition(float x, float y);                // 0x5baeb0 (x_, y_, pos_ = (x, y, z_))
    void show();                                       // 0x5d56d0 (unlock and setDisp(true, true))

    CTaskPtr<CTextElm> text_;   // 0x368
    float x_ = 0, y_ = 0;       // 0x374
    float z_ = 0;               // 0x37c
    int32_t fontSize_ = 16;     // 0x380
    int32_t lineGap_ = 0;       // 0x384
    float alpha_ = 1;           // 0x388
    uint32_t unk38c_ = 0;
};
YO2_AT(CWindowTaskText, text_, 0x368);
YO2_AT(CWindowTaskText, x_, 0x374);
YO2_AT(CWindowTaskText, fontSize_, 0x380);
YO2_SIZEOF(CWindowTaskText, 0x390);

// A text with a drop shadow: two CWindowTaskTexts, the shadow offset by (offX_, offY_).
class CWindowTaskShadowText : public CWindowTaskControll, public IWindowTaskMediator {
public:
    static CWindowTaskShadowText* newChild(CTask* parent, IWindowTaskMediator* mediator);  // 0x5af9b0
    void layout() override;                              // slot 13 (0x5afbf0)
    bool hitTest(float x, float y) override;             // slot 15 (0x5afc10)
    void onControlEvent(IWindowTaskColleague* sender) override;    // 0x5afdc0
    void onControlCommand(IWindowTaskColleague* sender) override;  // 0x5afde0
    void setText(const WChar* s) override;               // slot 17 (0x5afc30)
    virtual void setTextA(const char* s);                // slot 19 (0x5afc80)
    void setFontSize(int32_t size);                      // 0x5e9a30
    void setPosition(float x, float y);                  // 0x83d380
    void setAlign(int32_t align);                        // 0x80c920
    void setSize(int32_t w, int32_t h);                  // 0x83d460
    void setColor(float r, float g, float b, float a);   // 0x83d340
    void setShadowColor(float r, float g, float b, float a);  // 0x8cc960 (inline, emitted into yo2ResultWindow.cpp)
    void setShadowOffset(float dx, float dy);                 // 0x8cc8a0 (inline, emitted into yo2ResultWindow.cpp)
    CWindowTaskText* main() const { return main_.get(); }
    CWindowTaskText* shadow() const { return shadow_.get(); }

    CTaskPtr<CWindowTaskText> main_;    // 0x36c
    CTaskPtr<CWindowTaskText> shadow_;  // 0x378
    int32_t offX_ = 0, offY_ = 0;       // 0x384
    int32_t x_ = 0, y_ = 0;             // 0x38c
    uint32_t unk394_ = 0;
};
YO2_AT(CWindowTaskShadowText, main_, 0x36c);
YO2_AT(CWindowTaskShadowText, shadow_, 0x378);
YO2_AT(CWindowTaskShadowText, offX_, 0x384);
YO2_AT(CWindowTaskShadowText, x_, 0x38c);
YO2_SIZEOF(CWindowTaskShadowText, 0x398);

// A scroll bar.
class CWindowTaskScrollBase : public CWindowTaskControll {
public:
    void setMax(int32_t max);  // 0x5ad4e0

    uint8_t unk368_[0xf8];
    float x_ = 0, y_ = 0;      // 0x460
    float length_ = 0;         // 0x468
    uint8_t unk46c_[0x0c];
    int32_t value_ = 0;        // 0x478
    int32_t max_ = 0;          // 0x47c
    uint8_t unk480_[0x40];
};
YO2_AT(CWindowTaskScrollBase, x_, 0x460);
YO2_AT(CWindowTaskScrollBase, length_, 0x468);
YO2_AT(CWindowTaskScrollBase, value_, 0x478);
YO2_SIZEOF(CWindowTaskScrollBase, 0x4c0);

// A push button: nine sprites cut from one texture, with six looks.
class CWindowTaskSwitch : public CWindowTaskControll {
public:
    struct Piece {
        int32_t w, h;
        int32_t uv[5][2];  // texture origin for looks 0, 1, 2, 4, 5
    };
    CWindowTaskSwitch();
    ~CWindowTaskSwitch() override;
    void layout() override;
    bool hitTest(float x, float y) override;
    virtual void loadImages();  // slot 19
    void setCentre(float x, float y);

    CTaskPtr<CSpriteElm> sprites_[9];  // 0x368 TL T TR L R BL B BR, then the centre
    float x_ = 0, y_ = 0;              // 0x3d4
    float w_ = 256, h_ = 256;          // 0x3dc
    uint8_t unk3e4_ = 0, unk3e5_ = 0, unk3e6_ = 0;
    int32_t state_ = 0;                // 0x3e8
    bool checked_ = false;             // 0x3ec
    Piece pieces_[9] = {};             // 0x3f0 in grid order: TL T TR / L C R / BL B BR
};
YO2_AT(CWindowTaskSwitch, sprites_, 0x368);
YO2_AT(CWindowTaskSwitch, x_, 0x3d4);
YO2_AT(CWindowTaskSwitch, pieces_, 0x3f0);
YO2_SIZEOF(CWindowTaskSwitch, 0x5a0);

// A button with a shadowed label.
class CWindowTaskTextSwitch : public CWindowTaskSwitch, public IWindowTaskMediator {
public:
    CWindowTaskTextSwitch();  // 0x5ba000
    ~CWindowTaskTextSwitch() override;
    void onControlEvent(IWindowTaskColleague* sender) override;
    void onControlCommand(IWindowTaskColleague* sender) override;

    CTaskPtr<CWindowTaskShadowText> label_;  // 0x5a4
    uint32_t unk5b0_ = 0;                    // 0x5b0
    uint32_t unk5b4_ = 0;                    // 0x5b4
};
YO2_AT(CWindowTaskTextSwitch, label_, 0x5a4);
YO2_SIZEOF(CWindowTaskTextSwitch, 0x5b8);
