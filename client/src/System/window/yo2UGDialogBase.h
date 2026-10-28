// CUGDialogBase: the duel's dialogs (src\duel, CWindowDeckList, CUYesNoDialog, CHelpDialog...) on a CWindowModelThin.
// It fades in over 8 frames (fade_ 256 -> 0, onOpened), can be dragged by the mouse inside its box (centre cx_, cy_,
// size boxW_ x boxH_, kept roughly on screen), and once answered (answered_) closes: the result goes to the server and
// it fades out (onClose ... onClosed). Its constructor is inlined into every subclass's.
#pragma once
#include "System/window/yo2WindowDialogs.h"

class CMouseEx;   // yaneSDK
// TODO(yaneSDK): the app's CMouseEx (CApp + 0x148) and the calls on it this class makes.
CMouseEx* windowAppMouse();                      // 0x006072b0 (CApp; the mouse at +0x148)
void windowMouseGetXY(int32_t* x, int32_t* y);   // 0x00542590 CMouseEx::GetXY (vslot 1)
bool windowMouseLButton();                       // 0x00542640 CMouseEx::LButton (vslot 3): the left button is down
void windowMouseResetButton();                   // 0x00542830 CMouseEx::ResetButton (vslot 6)
// TODO(duel): 0x0071f8c0, the dialog's answer to the server (packet 0x6423 on the duel connection).
void ugDialogSendResult(int32_t result);

class CUGDialogBase : public CWindowModelThin {
public:
    CUGDialogBase();
    ~CUGDialogBase() override;
    bool windowSlot15() override;   // the mouse: drag the dialog (true: the mouse was this dialog's)

    virtual void setBox(int32_t w, int32_t h);   // slot 21
    virtual void tick();                         // slot 22: fades, and closes once answered
    virtual void ugSlot23() = 0;                 // slot 23
    virtual bool isMouseOver() const;            // slot 24
    // @yo2 0x00767af0 CUGDialogBase::canClose
    virtual bool canClose() { return true; }     // slot 25
    // @yo2 0x00767b10 CUGDialogBase::onMouse (empty)
    virtual void onMouse(CMouseEx*) {}           // slot 26: every frame the mouse isn't dragging
    // @yo2 0x00767b30 CUGDialogBase::onOpened (empty)
    virtual void onOpened() {}                   // slot 27: faded in
    // @yo2 0x00767b50 CUGDialogBase::onClose (empty)
    virtual void onClose() {}                    // slot 28: answered, fading out
    // @yo2 0x00767b70 CUGDialogBase::onClosed (empty)
    virtual void onClosed() {}                   // slot 29: faded out

    void close(int32_t result);

    uint8_t unk3e8_ = 0;      // 0x3e8
    int32_t result_ = 0;      // 0x3ec
    int32_t fade_ = 256;      // 0x3f0 256 -> 0 fading in (32 a frame), 0 open, -1 -> -256 fading out
    bool dragging_ = false;   // 0x3f4
    bool answered_ = false;   // 0x3f5 close with result_ on the next tick
    int32_t cx_ = 512;        // 0x3f8 centre
    int32_t cy_ = 384;        // 0x3fc
    int32_t dragDx_ = 0;      // 0x400 mouse - centre when the drag started
    int32_t dragDy_ = 0;      // 0x404
    int32_t boxW_ = 0;        // 0x408 the box the mouse can grab it by, around the centre
    int32_t boxH_ = 0;        // 0x40c
    bool running_ = true;     // 0x410 false once faded out
};
YO2_AT(CUGDialogBase, result_, 0x3ec);
YO2_AT(CUGDialogBase, fade_, 0x3f0);
YO2_AT(CUGDialogBase, answered_, 0x3f5);
YO2_AT(CUGDialogBase, cx_, 0x3f8);
YO2_AT(CUGDialogBase, boxW_, 0x408);
YO2_AT(CUGDialogBase, running_, 0x410);
YO2_SIZEOF(CUGDialogBase, 0x414);
