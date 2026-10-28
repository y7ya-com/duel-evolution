// yo2LoginEntry.cpp: CLoginScene. Shows the ID / password window (pre-filled from the last login and the saved
// password), then on OK connects to the gate and logs in through the account task; on success it stores what the
// check boxes ask for and goes to the character select, on Cancel or a gate error back to the title.
#pragma once
#include "System/yo2Scene.h"

class CWindowLogin;
class CNetGateTask;
class CNetAccountTask;

class CLoginScene : public CSceneTask {
public:
    enum State : int32_t {
        START, SHOW, WAIT_INPUT, CONNECT_DELAY, CONNECT, WAIT_GATE, GATE_DONE, LOGIN, WAIT_LOGIN, LOGGED_IN,
        TO_PLAYER_SELECT = 0xd, TO_TITLE = 0xe,
    };

    static CSceneTask* New(CTask* parent, CElement* layer) { return spawn<CLoginScene>(parent, layer); }
    CLoginScene();
    ~CLoginScene() override;
    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    int32_t state_ = START;                 // 0x80 State
    CTaskPtr<CTask> bg_;                    // 0x84 CTaskPtr<CBgCommon>
    CTaskPtr<CWindowLogin> login_;          // 0x90
    CTaskPtr<CNetGateTask> gate_;           // 0x9c
    CTaskPtr<CNetAccountTask> account_;     // 0xa8
    uint32_t unkb4_ = 0;                    // 0xb4

private:
    void fillFromConfig();
    void saveLogin();
    struct Layout;
};
YO2_SIZEOF(CLoginScene, 0xb8);

// CUserConfigManager's inline members compiled into this file (the class is System's).
struct CUserConfigManager;
vc6::string userConfigPassword(const CUserConfigManager* u);              // 0x00806560 (+0x38)
void userConfigSetPassword(CUserConfigManager* u, vc6::string password);  // 0x00808520 (+0x38, +0x48 encoded)
bool userConfigSavesPassword(const CUserConfigManager* u);                // +0x25
void userConfigSetSavesPassword(CUserConfigManager* u, bool on);
