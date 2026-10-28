// titleEntry.cpp: CTitleScene. The title movie with its buttons (start, option, web, clear, quit); coming back here
// from the lobby also puts the world UI back to its logged-out state.
#pragma once
#include "System/yo2Scene.h"

class CTitleScene : public CSceneTask {
public:
    CTitleScene();
    ~CTitleScene() override;
    static CSceneTask* New(CTask* parent, CElement* layer) { return spawn<CTitleScene>(parent, layer); }

    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

private:
    struct Layout;
    void resetWorldUi();
    void onButton(const char* name);

    CTaskPtr<CElement> clearDlg_;  // 0x80 CTaskPtr<CWindowModelDialogYesNo> "CTitleScene::m_dialogYesNo"
    CTaskPtr<CElement> title_;     // 0x8c CTaskPtr<CSwfEngine> "CTitleScene::m_title": the menu movie
    CTaskPtr<CElement> option_;    // 0x98 CTaskPtr<COptionDlg> "CTitleScene::m_option"
    [[maybe_unused]] uint32_t unkA4_;  // 0xa4
};
YO2_SIZEOF(CTitleScene, 0xa8);

// @yo2 0x007fb510 CTaskPtr<CElement>::raw: dynamic_cast of the target, no validity check (template, title's copy)
inline CElement* rawElement(const CTaskPtr<CElement>& p) { return dynamic_cast<CElement*>(p.task()); }

// What the base element's colour is scaled by under a dialog (DAT_00be8f4c).
constexpr float kTitleDimmed = 0.75f;

// @yo2 0x007fb4d0 D3DXCOLOR::operator*= (inline, emitted in titleEntry.obj)
inline float* scaleColor(float* rgba, float k) {
    rgba[0] = k * rgba[0];
    rgba[1] = k * rgba[1];
    rgba[2] = k * rgba[2];
    rgba[3] = k * rgba[3];
    return rgba;
}
