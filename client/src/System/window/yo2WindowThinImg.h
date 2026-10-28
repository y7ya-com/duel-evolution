// CWindowModelThinImg (CWindowTask.cpp 0x005e45a0..0x005e5880): a window that is one picture (its size is the
// picture's) with a text field over it; the login dialog and the title's option dialog use it.
#pragma once
#include <cstdint>

#include "System/window/yo2WindowControls.h"
#include "System/window/yo2WindowDialogs.h"   // CWindowModelThin::OpenAnim

class CWindowModelThinImg : public CWindowTaskModel {
public:
    static CWindowModelThinImg* create(CTask* parent, float x, float y, const vc6::string& picture);
    void setup(float x, float y, const vc6::string& picture);   // what create sets before CTask::create
    CWindowModelThinImg();
    ~CWindowModelThinImg() override;
    bool onInit() override;
    // @yo2 0x005e5780 CWindowModelThinImg::onMain
    bool onMain() override { return true; }
    void layout() override;   // the text field 8 pixels in
    // @yo2 0x005e47e0 CWindowModelThinImg::maxZ
    int32_t maxZ() const override { return static_cast<int32_t>(z_ + 5.0f); }
    void setText(const WChar* s) override;   // kept; shown by the next layout()
    // @yo2 0x005e47c0 CWindowModelThinImg::windowSlot18
    bool windowSlot18() override { return false; }
    // @yo2 0x005e5880 CWindowModelThinImg::onControlEvent
    void onControlEvent(CWindowTaskControll*) override { bringToFront(); }
    void onControlCommand(CWindowTaskControll*) override;
    // @yo2 0x005e4880 CWindowModelThinImg::mediatorSlot2 (empty)
    void mediatorSlot2(CWindowTaskControll*) override {}
    // @yo2 0x005e48a0 CWindowModelThinImg::mediatorSlot3 (empty)
    void mediatorSlot3(CWindowTaskControll*) override {}

    CWindowTaskTextField* textField_ = nullptr;   // 0x398 (a plain pointer in the exe too)
    vc6::wstring title_;                          // 0x39c the text (setText)
    CWindowModelThin::OpenAnim openAnim_ = {};    // 0x3ac
    CTaskPtr<CSpriteElm> image_;                  // 0x3cc the picture
    vc6::string picture_;                         // 0x3d8 its path
};
YO2_AT(CWindowModelThinImg, textField_, 0x398);
YO2_AT(CWindowModelThinImg, title_, 0x39c);
YO2_AT(CWindowModelThinImg, openAnim_, 0x3ac);
YO2_AT(CWindowModelThinImg, image_, 0x3cc);
YO2_AT(CWindowModelThinImg, picture_, 0x3d8);
YO2_SIZEOF(CWindowModelThinImg, 0x3e8);
