#include "cautionEntry.h"

#include "System/yo2Debug.h"
#include "System/yo2SceneManager.h"

namespace {
vc6::string siteUrl(const char* page) {  // the web site's (localized) base URL + page
    vc6::string url = localizedAppUrl();
    url += page;
    return url;
}
}  // namespace

// @yo2 0x007fb6a0 CCautionScene::New (the constructor inlined)
CCautionScene::CCautionScene() { setTaskName("CCautionScene"); }

// @yo2 0x007fb940 CCautionScene::~CCautionScene
// @yo2 0x007fb8f0 CCautionScene deleting destructor
CCautionScene::~CCautionScene() = default;

// @yo2 0x007fd7f0 CCautionScene::Receive (just CEasyTask's)
int32_t CCautionScene::receive(CTaskMessage* msg) { return CSceneTask::receive(msg); }

// @yo2 0x007fba60 CCautionScene::onInit: background, start fetching stoplogin.html and info0.html, title BGM
bool CCautionScene::onInit() {
    createBaseElement("CCautionScene::m_pBaseElm");
    stoploginDlg_.setUser(this);
    cautionDlg_.setUser(this);
    infoDlg_.setUser(this);
    infoDlg0_.setUser(this);
    bg_.setUser(this);
    bg_.set(bgCommonNew(this, baseElm_.get(), 0x39, 0));
    YO2_ASSERT(bg_.task() != nullptr, "error CCautionScene::CBgCommon::Create()");
    bg_.get()->setInstName("CCautionScene::背景");
    stoplogin_.start(siteUrl("stoplogin.html"));
    info0_.start(siteUrl("info0.html"));
    soundPlay(0x20000003, 0);
    step_ = WAIT_INFO0;
    return true;
}

void CCautionScene::showDialog(CTaskPtr<CEasyTask>& dlg, CEasyTask* created, const char* failMsg,
                               const char* instName) {
    dlg.set(created);
    YO2_ASSERT(dlg.task() != nullptr, "%s", failMsg);
    dlg.get()->setInstName(instName);
}

// @yo2 0x007fbfe0 CCautionScene::onMain: one step of the notice chain per frame
bool CCautionScene::onMain() {
    static const char kCreateFailed[] = "error CCautionScene::CInfoDlgCommon::Create()";
    switch (step_) {
    case WAIT_INFO0:
        if (info0_.status() == CHttpDownload::DONE) {
            showDialog(infoDlg0_, infoDlgCreate(this, baseElm_.get(), INFODLG_OK, info0_.data(), INFODLG_CENTER),
                       kCreateFailed, "CCautionScene::m_infoDlg0");
            step_ = SHOW_INFO0;
        } else if (info0_.status() == CHttpDownload::FAILED) {
            step_ = WAIT_STOPLOGIN;  // no info0.html on the server
        }
        break;
    case SHOW_INFO0:
        if (infoDlgResult(infoDlg0_.get()) == INFODLG_RESULT_OK)
            step_ = WAIT_STOPLOGIN;
        break;
    case WAIT_STOPLOGIN:
        if (stoplogin_.status() == CHttpDownload::DONE) {
            appSetStopLogin(true);
            showDialog(stoploginDlg_,
                       infoDlgCreate(this, baseElm_.get(), INFODLG_OK_NOTICE, stoplogin_.data(), INFODLG_CENTER),
                       kCreateFailed, "CCautionScene::m_stoploginDlg");
            step_ = SHOW_STOPLOGIN;
        } else if (stoplogin_.status() == CHttpDownload::FAILED) {
            info_.start(siteUrl("info.html"));  // logins are open: the regular notice next
            step_ = WAIT_INFO;
        }
        break;
    case SHOW_STOPLOGIN:
        if (infoDlgResult(stoploginDlg_.get()) == INFODLG_RESULT_OK)
            CSceneMng::instance()->push(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
        break;
    case WAIT_INFO:
        if (info_.status() == CHttpDownload::DONE) {
            showDialog(infoDlg_, infoDlgCreate(this, baseElm_.get(), INFODLG_OK, info_.data(), INFODLG_CENTER),
                       kCreateFailed, "CCautionScene::m_infoDlg");
            step_ = SHOW_INFO;
        } else if (info_.status() == CHttpDownload::FAILED) {
            step_ = OPEN_CAUTION;
        }
        break;
    case SHOW_INFO:
        if (infoDlgResult(infoDlg_.get()) == INFODLG_RESULT_OK)
            step_ = OPEN_CAUTION;
        break;
    case OPEN_CAUTION:
        showDialog(cautionDlg_,
                   infoDlgCreateFromFile(this, baseElm_.get(), INFODLG_OK, "data/etc/caution_?.txt", INFODLG_CENTER),
                   "error CCautionScene::CInfoDlgCommon::CreateFromFile()", "CCautionScene::m_cautionDlg");
        step_ = SHOW_CAUTION;
        break;
    case SHOW_CAUTION:
        if (infoDlgResult(cautionDlg_.get()) == INFODLG_RESULT_OK)
            CSceneMng::instance()->push(SCENE_LOGIN, CSceneMng::FADE_WAIT, true);
        break;
    }
    return true;
}

// @yo2 0x007fd7a0 CCautionScene::onDestroy: the base element goes (the background and dialogs' layer with it)
void CCautionScene::onDestroy() {
    if (dynamic_cast<CElement*>(baseElm_.task()))
        baseElm_.get()->destroy(__FILE__, __LINE__);
}

struct CCautionScene::Layout {
    YO2_AT(CCautionScene, stoplogin_, 0x080);
    YO2_AT(CCautionScene, info_, 0x0bc);
    YO2_AT(CCautionScene, info0_, 0x0f8);
    YO2_AT(CCautionScene, bg_, 0x134);
    YO2_AT(CCautionScene, stoploginDlg_, 0x140);
    YO2_AT(CCautionScene, cautionDlg_, 0x14c);
    YO2_AT(CCautionScene, infoDlg_, 0x158);
    YO2_AT(CCautionScene, infoDlg0_, 0x164);
    YO2_AT(CCautionScene, step_, 0x170);
};
