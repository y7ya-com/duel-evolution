// loginDialog.cpp: CWindowLogin, the user ID / password window of the login scene (an OK / Cancel dialog): two inputs
// with their labels, "save the ID" / "save the password" check boxes, and two read-only labels that stand in for the
// inputs when the launcher fixed the ID. Its OK and Cancel (and Enter in an input) report 0xfa2 / 0xfa3 through the
// dialog's own callback, which the scene polls with result().
#pragma once
#include "System/window/yo2WindowDialogs.h"

class CWindowLogin : public CWindowModelDialogOk {
public:
    enum : int32_t { RESULT_OK = 0xfa2, RESULT_CANCEL = 0xfa3 };

    static CWindowLogin* create(CTask* parent, float x, float y, int32_t okTextId);
    CWindowLogin();
    ~CWindowLogin() override;
    bool onInit() override;
    bool onMain() override;   // re-layout every frame (also caution/loginWindowInline.cpp's view, 0x7fdd30)
    void applyZ() override;   // back to its resting depth, re-layout (the view's 0x7fdd80)
    void layout() override;   // empty
    void setBandHeight(float h) override;   // re-layout (the view's 0x7fdd50)
    void onControlEvent(CWindowTaskControll* sender) override;
    void mediatorSlot2(CWindowTaskControll* sender) override;   // focus forward: ID -> password -> OK -> Cancel
    void mediatorSlot3(CWindowTaskControll* sender) override;   // focus back

    vc6::string userId() const;
    vc6::string password() const;
    bool idChecked() const;
    bool passChecked() const;
    void setUserId(vc6::string id);
    void setPassword(vc6::string password);
    void setIdChecked(bool on);
    void setPassChecked(bool on);

    CTaskPtr<CWindowTaskFrameBottomThick> frameLogin_;  // 0x400 "m_frame"
    CTaskPtr<CWindowTaskTextField> message_;            // 0x40c
    CTaskPtr<CWindowTaskText> textId_;                  // 0x418 "ID" label
    CTaskPtr<CWindowTaskText> textPass_;                // 0x424
    CTaskPtr<CWindowTaskControll> inputId_;             // 0x430 CTaskPtr<CWindowTaskInput>
    CTaskPtr<CWindowTaskControll> inputPass_;           // 0x43c
    CTaskPtr<CWindowTaskText> textCheckId_;             // 0x448 the check boxes' labels
    CTaskPtr<CWindowTaskText> textCheckPass_;           // 0x454
    CTaskPtr<CWindowTaskControll> checkId_;             // 0x460 CTaskPtr<CWindowTaskCheckbox>
    CTaskPtr<CWindowTaskControll> checkPass_;           // 0x46c
    CTaskPtr<CWindowTaskTextSwitch> buttonOk_;          // 0x478
    CTaskPtr<CWindowTaskTextSwitch> buttonCancel_;      // 0x484
    CTaskPtr<CWindowTaskText> textDemoId_;              // 0x490 the ID when it can't be edited
    CTaskPtr<CWindowTaskText> textDemoPass_;            // 0x49c the password as '*'s then

private:
    void placeButton(CWindowTaskTextSwitch* b, int32_t textId, float centreX);
    struct Layout;
};
YO2_SIZEOF(CWindowLogin, 0x4a8);
