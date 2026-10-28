#include "yo2LoginEntry.h"

#include <cstring>
#include <string>

#include "Net/NetTasks.h"
#include "System/yo2Debug.h"
#include "System/yo2SceneManager.h"
#include "loginDialog.h"
#include "loginExt.h"

struct CLoginScene::Layout {
    YO2_AT(CLoginScene, state_, 0x80);
    YO2_AT(CLoginScene, bg_, 0x84);
    YO2_AT(CLoginScene, login_, 0x90);
    YO2_AT(CLoginScene, gate_, 0x9c);
    YO2_AT(CLoginScene, account_, 0xa8);
};

namespace {
constexpr int32_t BG_LOGIN = 0x29;
constexpr uint32_t LOCK_BUSY = 1;   // the login window's TM_MAIN is held while the login runs

struct TaskLockAccess : CTask {
    static void lock(CTask* t, uint32_t mask) { t->*(&TaskLockAccess::lockFlags_) |= mask; }
};

// The fields of CUserConfigManager (System, 0x58 bytes) this file's inline members touch.
struct UserConfigFields {
    uint32_t vtbl;
    uint8_t _04[0x25 - 0x04];
    bool savesPassword;     // 0x25
    uint8_t _26[0x38 - 0x26];
    vc6::string password;   // 0x38
    vc6::string encoded;    // 0x48
};
YO2_AT(UserConfigFields, savesPassword, 0x25);
YO2_AT(UserConfigFields, password, 0x38);
YO2_AT(UserConfigFields, encoded, 0x48);
YO2_SIZEOF(UserConfigFields, 0x58);
UserConfigFields* fields(CUserConfigManager* u) { return reinterpret_cast<UserConfigFields*>(u); }
const UserConfigFields* fields(const CUserConfigManager* u) { return reinterpret_cast<const UserConfigFields*>(u); }
}  // namespace

// TODO(System): the CUserConfigManager instance (DAT_01271b10).
extern CUserConfigManager* g_userConfigManager;
// @yo2 0x00806540 CUserConfigManager::getInstance (inlined copy in this file)
CUserConfigManager* userConfig() { return g_userConfigManager; }
// @yo2 0x00806560 CUserConfigManager::password (inlined copy in this file): a copy of +0x38
vc6::string userConfigPassword(const CUserConfigManager* u) { return fields(u)->password; }
// @yo2 0x00808520 CUserConfigManager::setPassword (inlined copy in this file): kept as is and encoded
void userConfigSetPassword(CUserConfigManager* u, vc6::string password) {
    fields(u)->password = password;
    fields(u)->encoded = userConfigEncode(u, fields(u)->password);
}
bool userConfigSavesPassword(const CUserConfigManager* u) { return fields(u)->savesPassword; }
void userConfigSetSavesPassword(CUserConfigManager* u, bool on) { fields(u)->savesPassword = on; }

// @yo2 0x00804850 CLoginScene::New (yo2LoginEntry.h; the constructor is inlined into it)
CLoginScene::CLoginScene() { setTaskName("CLoginScene"); }
// @yo2 0x00804ab0 CLoginScene::~CLoginScene
// @yo2 0x00804a80 CLoginScene deleting destructor
CLoginScene::~CLoginScene() = default;

// @yo2 0x008086a0 CLoginScene::Receive (just CEasyTask's)
int32_t CLoginScene::receive(CTaskMessage* msg) { return CEasyTask::receive(msg); }

// @yo2 0x00804bf0 CLoginScene::onInit: background, the world menu closed, the account task, the login window filled
// from the config
bool CLoginScene::onInit() {
    state_ = START;
    createBaseElement("CLoginSceneのm_pBaseElm");
    bg_.setUser(this);
    bg_.set(bgCommonNew(this, baseElement(), BG_LOGIN, 0));
    YO2_ASSERT(bg_.task() != nullptr, "CBgCommon NULL error");
    bg_.get()->setInstName("コモンＢＧ");
    if (CTask* world = gameWorld()) {
        menuWindowReset(gameWorldMenu(world));
        menuWindowClose(gameWorldMenu(world));
    }

    gate_.setUser(this);
    account_.setUser(this);
    account_.set(CNetAccountTask::spawn(this, baseElement()));
    YO2_ASSERT(account_.task() != nullptr, "CNetAccountTask NULL error");
    account_.get()->setInstName("アカウントタスク");

    login_.setUser(this);
    login_.set(CWindowLogin::create(baseElement(), 256, 256, CWindowLogin::RESULT_OK));
    YO2_ASSERT(login_.task() != nullptr, "CWindowLogin NULL error");
    login_.get()->setInstName("ユーザＩＤ入力ウインドウ");
    login_.get()->bringToFront();
    fillFromConfig();
    return true;
}

// The last login's ID (and, when it was saved, its password); before any, the old yugi_usr.dat if there is one.
// @yo2 0x008066e0 vc6::string copy (inlined copy in this file)
// @yo2 0x008086c0 vc6::string::c_str (inlined copy in this file)
void CLoginScene::fillFromConfig() {
    CWindowLogin* w = login_.get();
    w->setUserId(systemConfigLastLoginId());
    w->setIdChecked(false);
    if (!systemConfigLastLoginId().empty()) {
        w->setIdChecked(true);
        CUserConfigManager* u = userConfig();
        userConfigSetUser(u, systemConfigLastLoginId());
        // "CUserConfigManager::GetInstance()->Load()失敗" when it fails
        if (userConfigLoad(u) && userConfigSavesPassword(u)) {
            w->setPassword(userConfigPassword(u));
            w->setPassChecked(true);
        }
        return;
    }
    if (!legacyLoginFileEnabled())
        return;
    vc6::string path = legacyLoginFileFolder();
    path += "\\yugi_usr.dat";
    uint8_t record[32] = {};
    legacyLoginFileRead(path, record);
    char id[17] = {}, password[17] = {};
    std::memcpy(id, record, 16);
    std::memcpy(password, record + 16, 16);
    if (id[0]) {
        userConfigSetUser(userConfig(), id);
        w->setUserId(id);
        w->setIdChecked(true);
    }
    if (password[0]) {
        w->setPassword(password);
        w->setPassChecked(true);
    }
}

// What the check boxes ask for: the ID into the system config, the password (or nothing) into the user's config.
void CLoginScene::saveLogin() {
    CWindowLogin* w = login_.get();
    systemConfigSetLastLoginId(w->idChecked() ? w->userId() : vc6::string(""));
    systemConfigSave();
    CUserConfigManager* u = userConfig();
    userConfigSetUser(u, w->userId());
    const bool savePassword = w->passChecked();
    userConfigSetSavesPassword(u, savePassword);
    userConfigSetPassword(u, savePassword ? w->password() : vc6::string(""));
    userConfigSave(u);
}

// @yo2 0x00806860 CLoginScene::onMain
bool CLoginScene::onMain() {
    switch (state_) {
    case START:
        state_ = SHOW;
        break;
    case SHOW:
        state_ = WAIT_INPUT;
        break;
    case WAIT_INPUT: {
        CWindowLogin* w = login_.get();
        w->bringToFront();
        const int32_t r = w->result();
        if (r == CWindowLogin::RESULT_OK) {
            TaskLockAccess::lock(w, LOCK_BUSY);
            state_ = CONNECT_DELAY;
        } else if (r == CWindowLogin::RESULT_CANCEL) {
            CSceneMng::instance()->push(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
        }
        w->resetResult();
        break;
    }
    case CONNECT_DELAY:
        state_ = CONNECT;
        break;
    case CONNECT:
        gate_.set(CNetGateTask::spawn(this, baseElement()));
        YO2_ASSERT(gate_.task() != nullptr, "CNetGateTask NULL error");
        gate_.get()->setInstName("ゲート接続タスク");
        state_ = WAIT_GATE;
        break;
    case WAIT_GATE:
        if (gate_.get()->state == CNetGateTask::IDLE) {
            if (gate_.get()->done) {
                gate_.get()->destroy(__FILE__, 300);
                state_ = TO_TITLE;
            } else {
                state_ = GATE_DONE;
            }
        }
        break;
    case GATE_DONE:
        gate_.get()->destroy(__FILE__, 310);
        state_ = LOGIN;
        break;
    case LOGIN: {
        const vc6::string password = login_.get()->password(), user = login_.get()->userId();
        // "作業タスクにアカウント接続をリクエスト(できなかった)"
        account_.get()->login(std::string(user.c_str()), std::string(password.c_str()));
        state_ = WAIT_LOGIN;
        break;
    }
    case WAIT_LOGIN:
        switch (account_.get()->busy) {
        case CNetAccountTask::BUSY_FAILED:   // "アカウントエラー発生": the window takes input again
            windowClearLock(login_.get(), LOCK_BUSY);
            state_ = SHOW;
            break;
        case CNetAccountTask::BUSY_DONE:
            saveLogin();
            state_ = LOGGED_IN;
            break;
        default:
            break;
        }
        break;
    case LOGGED_IN:
        account_.get()->destroy(__FILE__, 371);
        state_ = TO_PLAYER_SELECT;
        break;
    case TO_PLAYER_SELECT:
        CSceneMng::instance()->push(SCENE_PLAYER_SELECT, CSceneMng::FADE_WAIT, true);
        break;
    case TO_TITLE:
        CSceneMng::instance()->push(SCENE_TITLE, CSceneMng::FADE_WAIT, true);
        break;
    default:
        break;
    }
    return true;
}

// @yo2 0x00808650 CLoginScene::onDestroy: the base element goes (the window with it)
void CLoginScene::onDestroy() {
    if (CElement* base = baseElement())
        base->destroy(__FILE__, 0x186);
}
