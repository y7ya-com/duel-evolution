// yo2Element.cpp: CElement, the base of everything drawn. It adds a transform (position, Euler rotation, scale →
// local matrix, combined with the parent's world matrix when inheritTransform is set), colours (multiplied down the
// tree), a visibility flag that can hide a whole subtree, per-element D3D render-state overrides, and the draw
// queues it enqueues itself into every TM_MAIN.
#pragma once
#include "vc6.h"
#include "yo2Math.h"
#include "yo2Task.h"

class CZSort;

class CElement : public CTask {
public:
    // How the element is blended; picks the draw queue and the device blend op.
    enum DrawMode : int32_t { OPA, CUT, BLEND, ADD, BLEND_POINT, SWF_POINT, SWF_LINEAR, DRAW_MODES };

    CElement();
    ~CElement() override;
    static CElement* createRoot();
    static CElement* newChild(CTask* parent, uint32_t priority);

    int32_t receive(CTaskMessage* msg) override;
    virtual void draw(int32_t arg);
    virtual bool onInit();
    virtual bool onMain();
    virtual void onDestroy();
    virtual void onTaskDestroyed(CTmDestroyed* msg);

    void updateMatrix();
    void updateHidden();
    void setDisp(bool show, bool propagate);
    bool isVisible(bool own) const;
    bool hidesChildren() const { return hideChildren_; }
    void setDrawMode(int32_t mode);
    void setQueue(CZSort* q);
    // @yo2 0x0060dbe0 CElement::worldTranslation (m_Matrix row 3)
    Vec3 worldTranslation() const { return world_.translationPart(); }

    Vec3 pos_;                  // 0x070 "t"
    Vec3 rot_;                  // 0x07c radians, applied Z then Y then X
    Vec3 scale_{1, 1, 1};       // 0x088 "s"
    int32_t rect_[4] = {};      // 0x094
    float color_[4] = {1, 1, 1, 1};     // 0x0a4 "col" r g b a
    float addColor_[4] = {};    // 0x0b4 "add_col"
    bool disp_ = true;          // 0x0c4
    bool hideChildren_ = false; // 0x0c5 set when disp went off with propagation; descendants hide too
    bool hiddenByParent_ = false;   // 0x0c6
    bool inheritTransform_ = false; // 0x0c7 world = local * parent's world
    Vec3 worldPos_;             // 0x0c8 "WorldPos"
    Vec3 worldScale_{1, 1, 1};  // 0x0d4 "WorldScale"
    Mat4 world_ = Mat4::identity();  // 0x0e0 "m_Matrix"
    bool matrixLocked_ = false; // 0x120 updateMatrix() does nothing
    bool keepLocalZ_ = false;   // 0x121 with inheritTransform: world z stays pos_.z
    bool autoLocal_ = true;     // 0x122 build local_ from pos_/rot_/scale_
    Mat4 local_ = Mat4::identity();  // 0x124 "m_LocalMtx"
    bool inheritColor_ = true;  // 0x164
    float inheritColor4_[4] = {1, 1, 1, 1};  // 0x168 "InheritCol": color_ times the parent's
    float inheritAddColor_[4] = {};          // 0x178 "InheritAddCol": addColor_ plus the parent's
    int32_t drawMode_ = CUT;    // 0x188 DrawMode
    int32_t blendOp_ = 3;       // 0x18c device blend mode for drawMode_
    vc6::map<uint32_t, uint32_t> renderStates_;        // 0x190 D3DRENDERSTATETYPE -> value
    vc6::map<uint32_t, uint32_t> stageStates_[8];      // 0x1a0 per texture stage
    vc6::map<uint32_t, uint32_t> unk220_[16];          // 0x220
    vc6::vector<CZSort*> queues_;  // 0x320 where onMain() enqueues the element
    uint8_t unk330_ = 0;        // 0x330
    uint32_t unk334_;           // 0x334 not initialised by the constructor
    uint32_t unk338_ = 0;       // 0x338
    uint32_t unk33c_ = 0;       // 0x33c
};
YO2_AT(CElement, pos_, 0x070);
YO2_AT(CElement, rect_, 0x094);
YO2_AT(CElement, color_, 0x0a4);
YO2_AT(CElement, disp_, 0x0c4);
YO2_AT(CElement, inheritTransform_, 0x0c7);
YO2_AT(CElement, worldPos_, 0x0c8);
YO2_AT(CElement, world_, 0x0e0);
YO2_AT(CElement, matrixLocked_, 0x120);
YO2_AT(CElement, local_, 0x124);
YO2_AT(CElement, inheritColor_, 0x164);
YO2_AT(CElement, inheritColor4_, 0x168);
YO2_AT(CElement, drawMode_, 0x188);
YO2_AT(CElement, renderStates_, 0x190);
YO2_AT(CElement, stageStates_, 0x1a0);
YO2_AT(CElement, unk220_, 0x220);
YO2_AT(CElement, queues_, 0x320);
YO2_AT(CElement, unk33c_, 0x33c);
YO2_SIZEOF(CElement, 0x340);
