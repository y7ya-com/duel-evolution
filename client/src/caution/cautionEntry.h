// cautionEntry.cpp: CCautionScene, between the title and the login. It fetches the operator's notices from the web
// site (localizedAppUrl): "info0.html" (shown if there is one), "stoplogin.html" (if present, logins are suspended:
// show it and go back to the title), "info.html" (shown if there is one), then the local caution text
// data/etc/caution_?.txt; once that one is acknowledged, on to the login scene.
#pragma once
#include "HttpDownload.h"
#include "System/yo2Scene.h"

class CCautionScene : public CSceneTask {
public:
    CCautionScene();
    ~CCautionScene() override;
    static CSceneTask* New(CTask* parent, CElement* layer) { return spawn<CCautionScene>(parent, layer); }

    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

private:
    struct Layout;
    enum Step : int32_t {
        WAIT_INFO0, SHOW_INFO0, WAIT_STOPLOGIN, SHOW_STOPLOGIN, WAIT_INFO, SHOW_INFO, OPEN_CAUTION, SHOW_CAUTION,
    };
    void showDialog(CTaskPtr<CEasyTask>& dlg, CEasyTask* created, const char* failMsg, const char* instName);

    CHttpDownload stoplogin_;          // 0x080 "stoplogin.html"
    CHttpDownload info_;               // 0x0bc "info.html"
    CHttpDownload info0_;              // 0x0f8 "info0.html"
    CTaskPtr<CEasyTask> bg_;           // 0x134 CTaskPtr<CBgCommon> "CCautionScene::背景" (background)
    CTaskPtr<CEasyTask> stoploginDlg_; // 0x140 CTaskPtr<CInfoDlgCommon>, as are the next three
    CTaskPtr<CEasyTask> cautionDlg_;   // 0x14c
    CTaskPtr<CEasyTask> infoDlg_;      // 0x158
    CTaskPtr<CEasyTask> infoDlg0_;     // 0x164
    int32_t step_;                     // 0x170 Step
    [[maybe_unused]] uint32_t unk174_; // 0x174
};
YO2_SIZEOF(CCautionScene, 0x178);

// ---- other folders (not ported in this branch; tests/ui_caution doubles them) ----
// CInfoDlgCommon (src/Game) is a CEasyTask showing one CWindowModelDialogWithBtns message box.
enum : int32_t {
    INFODLG_OK = 0xfa4,         // `kind`: an OK box
    INFODLG_OK_NOTICE = 0xfa5,  // the kind used for the stop-login notice
    INFODLG_RESULT_OK = 4000,   // what the window's result() returns once OK is pressed
};
enum : uint32_t { INFODLG_CENTER = 0x2000 };  // placement flag
CEasyTask* infoDlgCreate(CTask* parent, CTask* owner, int32_t kind, const vc6::string& message,
                         uint32_t flags);                                   // CInfoDlgCommon::create 0xa5ec10
CEasyTask* infoDlgCreateFromFile(CTask* parent, CTask* owner, int32_t kind, const vc6::string& path,
                                 uint32_t flags);                           // CInfoDlgCommon::create 0xa5ee60
// The exe reads the dialog's window straight out of CInfoDlgCommon+0x84 (its CTaskPtr's task), casts it to
// CWindowModelDialogWithBtns and calls vf24 (0x5e65f0), the pressed button.
int32_t infoDlgResult(CEasyTask* dlg);
CEasyTask* bgCommonNew(CTask* parent, CElement* layer, int32_t bg, int32_t arg);  // CBgCommon::New 0xa0a030
bool soundPlay(uint32_t id, int32_t fadeFrames);  // 0x686560: 0x1xxxxxxx sound effect, 0x2xxxxxxx BGM
vc6::string localizedAppUrl();  // systemConfig()->vf27 (CSystemConfigManager::localizedAppUrl)
void appSetStopLogin(bool on);  // CApp (DAT_012711ac) +0xc7c: the server said logins are suspended
