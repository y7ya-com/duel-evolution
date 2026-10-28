// yo2ChangeAvatarScene.cpp: CChangeAvaterScene (sic), the avatar change screen. It runs a CChangeAvatarPack on the
// world's avatar: the logged-in character's two avatars when the player is in the world (and then sends the new
// looks to the lobby), random ones for a brand-new character (who then goes on to My Room). On OK the avatars go
// into the account's character record and the player data file.
#pragma once
#include "System/yo2Scene.h"

class CChangeAvatarPack;
class CNetAccountTask;
class CNetLobbyTask;

class CChangeAvaterScene : public CSceneTask {
public:
    enum State : int32_t { START, DRESSING, REGISTER, WAIT_REGISTER, DONE };

    static CSceneTask* New(CTask* parent, CElement* layer);
    CChangeAvaterScene();
    ~CChangeAvaterScene() override;
    int32_t receive(CTaskMessage* msg) override;
    bool onInit() override;
    bool onMain() override;
    void onDestroy() override;

    CTaskPtr<CTask> bg_;                     // 0x80 CTaskPtr<CBgCommon>
    CTaskPtr<CNetAccountTask> account_;      // 0x8c
    CTaskPtr<CNetLobbyTask> lobby_;          // 0x98
    CTaskPtr<CChangeAvatarPack> pack_;       // 0xa4
    int32_t state_ = START;                  // 0xb0 State
    int32_t world_ = 0;                      // 0xb4 the world whose avatar is dressed (CGameMng +0x448)
    uint32_t unkb8_[2] = {};                 // 0xb8

private:
    struct Layout;
};
YO2_SIZEOF(CChangeAvaterScene, 0xc0);
