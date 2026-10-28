// The stock windows (src\System\CWindowTask.cpp, after the controls): a thin-framed text window and the dialogs
// with a button row. A dialog reports its buttons through its callback, by default its own CDialogCallback, which
// keeps the last result for the owner to poll (result(): 4000 yes / OK, 4001 no, -1 nothing yet).
#pragma once
#include "System/window/yo2WindowControls.h"

// --- what a dialog tells its owner: the last message, its value, and up to four texts (input dialogs) ------------
class CDialogCallback {
public:
    enum : int32_t { YES = 4000, NO = 4001 };
    int onResult(CWindowTaskModel* window, CALLBACK_MESSAGE_TYPE message, intptr_t value);

    int32_t message_ = -1;    // 0x00 message of the last call
    int32_t result_ = -1;     // 0x04 message 0: the value (YES / NO)
    vc6::wstring texts_[4];   // 0x08 messages 1-4: the value is a const WChar* to copy
};
YO2_AT(CDialogCallback, texts_, 0x08);
YO2_SIZEOF(CDialogCallback, 0x48);

// --- CWindowModelThin: a text field in a thin frame (336 x 144 by default) -----------------------------------------
class CWindowModelThin : public CWindowTaskModel {
public:
    static CWindowModelThin* create(CTask* parent, float x, float y, int32_t style);
    void setup(float x, float y, int32_t style);   // what create sets before CTask::create
    CWindowModelThin();
    ~CWindowModelThin() override;
    bool onInit() override;
    // @yo2 0x005e4450 CWindowModelThin::onMain
    bool onMain() override { return true; }
    void layout() override;
    // @yo2 0x005e3cd0 CWindowModelThin::maxZ
    int32_t maxZ() const override { return static_cast<int32_t>(z_ + 5.0f); }
    void setText(const WChar* s) override;   // kept; shown by the next layout()
    // @yo2 0x005e3cb0 CWindowModelThin::windowSlot18
    bool windowSlot18() override { return false; }
    // @yo2 0x005e4550 CWindowModelThin::onControlEvent
    void onControlEvent(CWindowTaskControll*) override { bringToFront(); }
    void onControlCommand(CWindowTaskControll*) override;
    // @yo2 0x005e3d70 CWindowModelThin::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x005e3d90 CWindowModelThin::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}

    void setPanelAlpha(float a);   // the text's back plane and the frame

    // What onInit leaves for an opening zoom; nothing in this class reads it.
    struct OpenAnim {
        int32_t kind, cx, cy, unk0c, unk10, stepW, stepH, frames;
    };

    CTaskPtr<CWindowTaskFrameThin> frame_;       // 0x398
    CTaskPtr<CWindowTaskTextField> textField_;   // 0x3a4
    vc6::wstring title_;                         // 0x3b0 the text (setText)
    OpenAnim openAnim_ = {};                     // 0x3c0
    int32_t style_ = 0;                          // 0x3e0 frame texture (windowFrameTexture)
    uint32_t unk3e4_ = 0;                        // 0x3e4
};
YO2_AT(CWindowModelThin, frame_, 0x398);
YO2_AT(CWindowModelThin, textField_, 0x3a4);
YO2_AT(CWindowModelThin, title_, 0x3b0);
YO2_AT(CWindowModelThin, openAnim_, 0x3c0);
YO2_AT(CWindowModelThin, style_, 0x3e0);
YO2_SIZEOF(CWindowModelThin, 0x3e8);

// --- CWindowModelDialogWithBtns: a text field over a band of buttons, in a CWindowTaskFrameBottomThick -----------
class CWindowModelDialogWithBtns : public CWindowTaskModel {
public:
    CWindowModelDialogWithBtns();
    ~CWindowModelDialogWithBtns() override;
    bool onMain() override;
    // @yo2 0x005e6490 CWindowModelDialogWithBtns::layout (empty)
    void layout() override {}
    // @yo2 0x005e6580 CWindowModelDialogWithBtns::maxZ
    int32_t maxZ() const override { return static_cast<int32_t>(z_ + 5.0f); }
    void setText(const WChar* s) override;   // the message
    // @yo2 0x005e65d0 CWindowModelDialogWithBtns::onControlCommand
    void onControlCommand(CWindowTaskControll*) override { bringToFront(); }

    virtual void setBandHeight(float h);                          // slot 21
    virtual void setTextColor(float r, float g, float b, float a); // slot 22
    virtual void setTextAlign(int32_t align);                      // slot 23
    // @yo2 0x005e65f0 CWindowModelDialogWithBtns::result
    virtual int32_t result() const { return dialog_.result_; }    // slot 24
    // @yo2 0x005e6610 CWindowModelDialogWithBtns::resetResult
    virtual void resetResult() { dialog_.result_ = -1; }          // slot 25
    // @yo2 0x005e6630 CWindowModelDialogWithBtns::textField
    virtual CWindowTaskTextField* textField() const { return textField_; }   // slot 26

    void useOwnCallback();    // callback_ = a call into dialog_
    void layoutBody();        // frame and text field to the window's size

    CWindowTaskFrameBottomThick* frame_ = nullptr;   // 0x398
    CWindowTaskTextField* textField_ = nullptr;      // 0x39c
    float bandH_ = 0;                                // 0x3a0 height of the button band
    int32_t style_ = 1;                              // 0x3a4 frame texture
    int32_t kind_ = 0;                               // 0x3a8 1 yes/no, 2 OK
    CDialogCallback dialog_;                         // 0x3ac
    uint32_t unk3f4_ = 0;                            // 0x3f4
};
YO2_AT(CWindowModelDialogWithBtns, frame_, 0x398);
YO2_AT(CWindowModelDialogWithBtns, bandH_, 0x3a0);
YO2_AT(CWindowModelDialogWithBtns, kind_, 0x3a8);
YO2_AT(CWindowModelDialogWithBtns, dialog_, 0x3ac);
YO2_SIZEOF(CWindowModelDialogWithBtns, 0x3f8);

// --- 『はい』『いいえ』: focus starts on 『いいえ』; the arrows move it between the two ------------------------------------
class CWindowModelDialogYesNo : public CWindowModelDialogWithBtns {
public:
    static CWindowModelDialogYesNo* create(CTask* parent, float x, float y, int32_t yesTextId, int32_t noTextId,
                                           int32_t style);
    CWindowModelDialogYesNo();
    ~CWindowModelDialogYesNo() override;
    // @yo2 0x005e71a0 CWindowModelDialogYesNo::onInit (everything is made in create)
    bool onInit() override { return true; }
    // @yo2 0x005e7430 CWindowModelDialogYesNo::onMain
    bool onMain() override { return true; }
    void layout() override;
    void onControlEvent(CWindowTaskControll* sender) override;
    // @yo2 0x005e68d0 CWindowModelDialogYesNo::onControlCommand
    void onControlCommand(CWindowTaskControll*) override { bringToFront(); }
    void mediatorSlot2(CWindowTaskControll* sender) override;
    void mediatorSlot3(CWindowTaskControll* sender) override;

    void setup(float x, float y, int32_t yesTextId, int32_t noTextId, int32_t style);

    CWindowTaskTextSwitch* yes_ = nullptr;   // 0x3f8
    int32_t yesTextId_ = 0;                  // 0x3fc
    CWindowTaskTextSwitch* no_ = nullptr;    // 0x400
    int32_t noTextId_ = 0;                   // 0x404
};
YO2_AT(CWindowModelDialogYesNo, yes_, 0x3f8);
YO2_AT(CWindowModelDialogYesNo, noTextId_, 0x404);
YO2_SIZEOF(CWindowModelDialogYesNo, 0x408);

// --- 『OK』 ----------------------------------------------------------------------------------------------------------
class CWindowModelDialogOk : public CWindowModelDialogWithBtns {
public:
    static CWindowModelDialogOk* create(CTask* parent, float x, float y, int32_t okTextId, int32_t style);
    CWindowModelDialogOk();
    ~CWindowModelDialogOk() override;
    bool onInit() override;
    // @yo2 0x005e7860 CWindowModelDialogOk::onMain
    bool onMain() override { return true; }
    void layout() override;
    void onControlEvent(CWindowTaskControll* sender) override;
    // @yo2 0x005e8250 CWindowModelDialogOk::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x005e8270 CWindowModelDialogOk::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}

    void setup(float x, float y, int32_t okTextId, int32_t style);

    CWindowTaskTextSwitch* ok_ = nullptr;   // 0x3f8
    int32_t okTextId_ = 0;                  // 0x3fc
};
YO2_AT(CWindowModelDialogOk, ok_, 0x3f8);
YO2_SIZEOF(CWindowModelDialogOk, 0x400);

// --- CWindowModelDialogError: an OK dialog (text 4002) in front of everything, over an invisible screen-sized plane
// that keeps the other windows from being clicked; it holds GameCtrl's CTRL_ERROR mode while it is up ----------------
class CWindowModelDialogError : public CWindowModelDialogOk {
public:
    static CWindowModelDialogError* create(CTask* parent);
    CWindowModelDialogError();
    ~CWindowModelDialogError() override;
    bool onInit() override;
    void onDestroy() override;
    void layout() override;

    CTaskPtr<CWindowTaskBackPlane> shield_;   // 0x400
    uint32_t unk40c_ = 0;                     // 0x40c never touched
};
YO2_AT(CWindowModelDialogError, shield_, 0x400);
YO2_SIZEOF(CWindowModelDialogError, 0x410);

// --- CWindowModelList: a list under an icon bar with a × button (248 x 128 by default); closeRequested_ is set when
// the × is pressed, clicked_ of list_ when an item is ------------------------------------------------------------
class CWindowModelList : public CWindowTaskModel {
public:
    static CWindowModelList* create(CTask* parent, float x, float y);
    CWindowModelList();
    ~CWindowModelList() override;
    bool onInit() override;
    // @yo2 0x005ee340 CWindowModelList::onMain
    bool onMain() override { return true; }
    void layout() override;
    // @yo2 0x005ee3f0 CWindowModelList::maxZ
    int32_t maxZ() const override { return static_cast<int32_t>(z_ + 6.0f); }
    void onControlEvent(CWindowTaskControll* sender) override;
    // @yo2 0x005ee420 CWindowModelList::onControlCommand
    void onControlCommand(CWindowTaskControll*) override { bringToFront(); }
    // @yo2 0x005ee440 CWindowModelList::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x005ee460 CWindowModelList::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}
    virtual void setPos(float x, float y);   // slot 21

    void addItem(const WChar* s);
    void clear();   // and lay out again
    void reset();   // the list's reset (slot 23), and lay out again

    CTaskPtr<CWindowTaskIconbar> bar_;          // 0x398
    CTaskPtr<CWindowTaskIconHide> hide_;        // 0x3a4 the × button
    CTaskPtr<CWindowTaskThinChop> frame_;       // 0x3b0
    CTaskPtr<CWindowTaskActiveListbox> list_;   // 0x3bc
    bool unk3c8_ = false;                       // 0x3c8
    bool closeRequested_ = false;               // 0x3c9
    uint32_t unk3cc_ = 0;                       // 0x3cc never touched
};
YO2_AT(CWindowModelList, bar_, 0x398);
YO2_AT(CWindowModelList, list_, 0x3bc);
YO2_AT(CWindowModelList, closeRequested_, 0x3c9);
YO2_SIZEOF(CWindowModelList, 0x3d0);

// --- CWindowModelDialogDecorator: a window that passes everything on to the dialog it wraps (inner_, may be null) --
// Same extra slots as CWindowModelDialogWithBtns; its constructor is inlined into the subclasses (src\Game's card
// list windows), which build inner_.
class CWindowModelDialogDecorator : public CWindowTaskModel {
public:
    ~CWindowModelDialogDecorator() override;
    bool onMain() override;
    void applyZ() override;
    void layout() override;
    int32_t maxZ() const override;
    void setText(const WChar* s) override;
    void onControlEvent(CWindowTaskControll* sender) override;
    void onControlCommand(CWindowTaskControll* sender) override;
    void mediatorSlot2(CWindowTaskControll* sender) override;
    void mediatorSlot3(CWindowTaskControll* sender) override;

    virtual void setBandHeight(float h);                            // slot 21
    virtual void setTextColor(float r, float g, float b, float a);  // slot 22
    virtual void setTextAlign(int32_t align);                       // slot 23
    virtual int32_t result() const;                                 // slot 24 (0 without inner_)
    virtual void resetResult();                                     // slot 25
    virtual CWindowTaskTextField* textField() const;                // slot 26 (null without inner_)

    CWindowModelDialogWithBtns* inner_ = nullptr;   // 0x398
};
YO2_AT(CWindowModelDialogDecorator, inner_, 0x398);
YO2_SIZEOF(CWindowModelDialogDecorator, 0x39c);
