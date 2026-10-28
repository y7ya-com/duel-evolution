#include "titleEntry.h"

#include <cstring>

#include "Net/NetLobby.h"
#include "System/yo2Debug.h"
#include "System/yo2SceneManager.h"
#include "titleExt.h"

namespace {
constexpr int32_t LANG_KOREAN = 6;
constexpr int32_t TM_SWF_OBJ_EVENT = 0x13;  // CTmSwfObjEvent
constexpr uint32_t LOCK_HIDDEN = 2;          // CTask lock bit the title puts on the world windows it hides
enum : int32_t { CLEAR_YES = 4000, CLEAR_NO = 4001 };

// CTask::lockFlags_ is protected and src/System has no setter; the exe ORs the bit in directly (+0x20).
struct TaskLockAccess : CTask {
    static void lock(CTask* t, uint32_t mask) { t->*(&TaskLockAccess::lockFlags_) |= mask; }
};

void hideWindow(CElement* w) {
    w->setDisp(false, true);
    TaskLockAccess::lock(w, LOCK_HIDDEN);
}
}  // namespace

// @yo2 0x007f8c60 CTitleScene::New (titleEntry.h; the constructor is inlined into it)
CTitleScene::CTitleScene() { setTaskName("CTitleScene"); }
// @yo2 0x007f8ed0 CTitleScene::~CTitleScene
// @yo2 0x007f8e80 CTitleScene deleting destructor
CTitleScene::~CTitleScene() = default;

// @yo2 0x007f8f90 CTitleScene::onInit: background, the title movie, the world UI back to logged-out, fade in
bool CTitleScene::onInit() {
    createBaseElement("CTitleScene::m_pBaseElm");
    CTask* bg = bgCommonNew(this, rawElement(baseElm_), 0x40, 0);
    YO2_ASSERT(bg != nullptr, "error CTitleScene::CBgCommon::Create()");
    bg->setInstName("CTitleScene::bg");

    title_.setUser(this);
    title_.set(swfEngineNew(rawElement(baseElm_), 0, "Data/title/title_flash_01.txt", true));
    YO2_ASSERT(title_.task() != nullptr, "error CTitleScene::CSwfEngine::Create()");
    title_.get()->setInstName("CTitleScene::m_title");
    title_.get()->pos_.z = 100.0f;
    swfEngineSetPlaying(title_.get(), true);
    swfEngineSetListener(title_.get(), this);  // its buttons report to receive()

    resetWorldUi();
    // Logging out of the lobby forgets the team state.
    if (CNetLobby* lobby = appNetLobby()) {
        lobby->inTeam = 0;
        lobby->joinApplied = 0;
        // @yo2 0x007fb570 vector<TeamApplication>::erase (std::vector's, on src/Net's portable CNetLobby)
        lobby->joinApplications.erase(lobby->joinApplications.begin(), lobby->joinApplications.end());
    }

    clearDlg_.setUser(this);
    option_.setUser(this);
    screenFaderFadeIn(CSceneMng::instance()->fader(), 10, 0xee4c);
    soundPlay(BGM_TITLE, 0);
    gameWorldSetKorean(gameWorld(), systemLanguage() == LANG_KOREAN);
    return true;
}

// The world UI outlives the lobby scenes: hide its windows, reset the chat tabs and the menu, drop the duel avatars,
// and close the second server connection.
void CTitleScene::resetWorldUi() {
    CTask* world = gameWorld();
    gameWorldEnterTitle(world);
    if (!world)
        return;
    hideWindow(gameWorldMenu(world));
    hideWindow(gameWorldChat(world));
    chatWindowClear(gameWorldChat(world));
    chatWindowSetTab(gameWorldChat(world), 3, false);
    chatWindowSetTab(gameWorldChat(world), 4, false);
    chatWindowSetTab(gameWorldChat(world), 0, true);
    chatWindowSetTab(gameWorldChat(world), 1, true);
    chatWindowSetTab(gameWorldChat(world), 2, true);
    chatWindowSetTab(gameWorldChat(world), 5, true);
    menuWindowReset(gameWorldMenu(world));
    menuWindowClose(gameWorldMenu(world));
    hideWindow(gameWorldPlace(world));
    duelAvatarClear(gameWorldDuelAvatar(world), 0);
    duelAvatarClear(gameWorldDuelAvatar(world), 1);
    if (gameWorldDuelConfig(world) && gameWorldDuelConfig(world)->isVisible(false))
        hideWindow(gameWorldDuelConfig(world));
    duelRequestReset();
    appDuelConnectionDisconnect();
}

// @yo2 0x007f9ca0 CTitleScene::onMain: the "clear the saved ID?" box. Yes forgets the last login ID and saves the
// config; either answer re-enters the title.
bool CTitleScene::onMain() {
    if (clearDlg_.task() && dialogResult(clearDlg_.get()) == CLEAR_YES) {
        soundPlay(SE_OK, 0);
        clearDlg_.get()->destroy(__FILE__, __LINE__);
        swfEngineSetActive(title_.get(), true);
        systemConfigSetLastLoginId("");
        systemConfigSave();
        CSceneMng::instance()->push(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
    }
    if (clearDlg_.task() && dialogResult(clearDlg_.get()) == CLEAR_NO) {
        soundPlay(SE_CANCEL, 0);
        clearDlg_.get()->destroy(__FILE__, __LINE__);
        swfEngineSetActive(title_.get(), true);
        CSceneMng::instance()->push(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
    }
    return true;
}

// @yo2 0x007fa400 CTitleScene::onDestroy: the base element goes (movie, background, dialogs with it)
void CTitleScene::onDestroy() {
    if (rawElement(baseElm_))
        baseElm_.get()->destroy(__FILE__, __LINE__);
}

// @yo2 0x007fa450 CTitleScene::Receive: the option dialog closing re-enters the title (to apply what changed); the
// movie's buttons, once its intro has played
int32_t CTitleScene::receive(CTaskMessage* msg) {
    if (msg->tag == TM_DESTROYED && destroyedTaskPtr(msg) == &option_ && title_.task())
        CSceneMng::instance()->push(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
    if (msg->tag == TM_SWF_OBJ_EVENT && swfEventClicked(msg) && swfEngineFinished(title_.get()))
        onButton(swfEventObjectName(msg));
    return CSceneTask::receive(msg);
}

void CTitleScene::onButton(const char* name) {
    if (std::strcmp(name, "btn_start") == 0) {
        soundPlay(SE_OK, 0);
        CSceneMng::instance()->push(SCENE_CAUTION, CSceneMng::FADE_WAIT, true);
    } else if (std::strcmp(name, "btn_option") == 0) {
        soundPlay(SE_OK, 0);
        option_.set(optionDlgNew(rawElement(baseElm_), 0, 0, "data/title/option_dai_01_c01.png"));
        YO2_ASSERT(rawElement(option_) != nullptr, "error CTitleScene::COptionDlg::Create()");
        option_.get()->inheritColor_ = false;  // not dimmed with the rest
        option_.get()->setInstName("CTitleScene::m_option");
        float* c = baseElm_.get()->color_;
        c[0] *= kTitleDimmed;
        c[1] *= kTitleDimmed;
        c[2] *= kTitleDimmed;
        c[3] *= kTitleDimmed;
        swfEngineSetActive(title_.get(), false);
    } else if (std::strcmp(name, "btn_web") == 0) {
        soundPlay(SE_OK, 0);
        shellOpen(systemHomepageUrl().c_str());
    } else if (std::strcmp(name, "btn_clear") == 0) {
        soundPlay(SE_OK, 0);
        clearDlg_.set(dialogYesNoNew(rawElement(baseElm_), 0, 0, CLEAR_YES, CLEAR_NO, 0));
        YO2_ASSERT(rawElement(clearDlg_) != nullptr,
                   "error CTitleScene::CWindowModelDialogYesNo::Create()");
        clearDlg_.get()->inheritColor_ = false;
        clearDlg_.get()->setInstName("CTitleScene::m_dialogYesNo");
        windowSetSize(clearDlg_.get(), 500.0f, 150.0f);
        windowLayout(clearDlg_.get());
        windowSetTextId(clearDlg_.get(), 0xbcc);  // "clear the saved user ID?"
        windowCentre(clearDlg_.get());
        scaleColor(baseElm_.get()->color_, kTitleDimmed);
        swfEngineSetActive(title_.get(), false);
    } else if (std::strcmp(name, "btn_quit") == 0) {
        appQuit();
    }
}

struct CTitleScene::Layout {
    YO2_AT(CTitleScene, clearDlg_, 0x80);
    YO2_AT(CTitleScene, title_, 0x8c);
    YO2_AT(CTitleScene, option_, 0x98);
};
