// CWindowTaskImage ("単なる画像(コントロール)"): one sprite of a texture, the part (u, v, w, h) of it scaled to the
// control's size. A left click is reported to the window (mediator slot 1). Its card subclasses are src\Game's
// (yo2CardListView.cpp).
#pragma once
#include "System/window/yo2WindowControls.h"

class CWindowTaskImage : public CWindowTaskControll {
public:
    static CWindowTaskImage* create(CTask* parent, IWindowTaskMediator* mediator, const vc6::string& texture);
    CWindowTaskImage();
    ~CWindowTaskImage() override;
    bool onInit() override;
    bool onMain() override;
    // @yo2 0x005d6a20 CWindowTaskImage::kind
    uint32_t kind() const override { return 0x1c; }
    void layout() override;
    bool handleMessage(WindowMsg m) override;
    // @yo2 0x005d7180 CWindowTaskImage::hitTest (never)
    bool hitTest(float, float) override { return false; }
    virtual void setPart(int32_t u, int32_t v, int32_t w, int32_t h);   // slot 19

    CTaskPtr<CSpriteElm> sprite_;   // 0x368
    float x_ = 0, y_ = 0;           // 0x374
    float w_ = 0, h_ = 0;           // 0x37c drawn size (the part's size after onInit)
    int32_t part_[4] = {};          // 0x384 u, v, w, h in the texture
    vc6::string texture_;           // 0x394
    uint32_t unk3a4_ = 0;           // 0x3a4
};
YO2_AT(CWindowTaskImage, sprite_, 0x368);
YO2_AT(CWindowTaskImage, x_, 0x374);
YO2_AT(CWindowTaskImage, part_, 0x384);
YO2_AT(CWindowTaskImage, texture_, 0x394);
YO2_SIZEOF(CWindowTaskImage, 0x3a8);
