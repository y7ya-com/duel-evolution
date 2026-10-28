#include "yo2ChangeAvatarScene.h"

#include "Net/NetTasks.h"
#include "System/yo2Debug.h"
#include "System/yo2SceneManager.h"
#include "changeAvatarExt.h"
#include "yo2ChangeAvatar.h"

struct CChangeAvaterScene::Layout {
    YO2_AT(CChangeAvaterScene, bg_, 0x80);
    YO2_AT(CChangeAvaterScene, account_, 0x8c);
    YO2_AT(CChangeAvaterScene, lobby_, 0x98);
    YO2_AT(CChangeAvaterScene, pack_, 0xa4);
    YO2_AT(CChangeAvaterScene, state_, 0xb0);
    YO2_AT(CChangeAvaterScene, world_, 0xb4);
};

namespace {
constexpr int32_t BG_CHANGE_AVATAR = 0x40;
constexpr int32_t FADE_FRAMES = 10, FADE_Z = 0xee4c;
}  // namespace

// @yo2 0x008b4350 CChangeAvaterScene::New (the constructor is inlined into it)
CSceneTask* CChangeAvaterScene::New(CTask* parent, CElement* layer) { return spawn<CChangeAvaterScene>(parent, layer); }

CChangeAvaterScene::CChangeAvaterScene() {
    bg_.setUser(this);
    account_.setUser(this);
    lobby_.setUser(this);
    pack_.setUser(this);
    setTaskName("CChangeAvaterScene");
}

// @yo2 0x008b45d0 CChangeAvaterScene::~CChangeAvaterScene
// @yo2 0x008b45a0 CChangeAvaterScene deleting destructor
CChangeAvaterScene::~CChangeAvaterScene() = default;

// @yo2 0x008b5c60 CChangeAvaterScene::Receive (just CEasyTask's)
int32_t CChangeAvaterScene::receive(CTaskMessage* msg) { return CEasyTask::receive(msg); }

// @yo2 0x008b46b0 CChangeAvaterScene::onInit: background, the account and lobby tasks, the pack on the world's
// avatar (the character's own in the world, made-up ones otherwise), a fade in
bool CChangeAvaterScene::onInit() {
    createBaseElement("CChangeAvaterSceneエレメント");
    bg_.set(bgCommonNew(this, baseElement(), BG_CHANGE_AVATAR, 0));
    bg_.get()->setInstName("コモンＢＧ");
    account_.set(CNetAccountTask::spawn(this, baseElement()));
    account_.get()->setInstName("CNetAccountTask_m_netAccount");
    lobby_.set(CNetLobbyTask::spawn(this));
    if (!lobby_.task()) {
        YO2_ASSERT(false, "CNetLobbyTask タスク生成失敗！？");
        return false;
    }
    lobby_.get()->setInstName("m_netLobby -> CNetLobbyTask");

    world_ = gameWorldId();
    if (gameWorldState() == 1) {
        CPlayerInfo* me = accountActivePlayer();
        const CAvatarData* avatars[2] = {&me->avatar[0], &me->avatar[1]};
        pack_.set(CChangeAvatarPack::create(this, baseElement(), avatars, accountPlayerBin(), 0, world_));
    } else {
        pack_.set(CChangeAvatarPack::create(this, baseElement(), nullptr, accountPlayerBin(), 0, world_));
    }
    pack_.get()->setInstName("CChangeAvatarPackまとめクラス");
    screenFaderFadeIn(CSceneMng::instance()->fader(), FADE_FRAMES, FADE_Z);
    state_ = START;
    return true;
}

// @yo2 0x008b5220 CChangeAvaterScene::onMain: wait for the pack. OK stores the avatars (the world's into the player
// data file, both into the character record), then either back to My Room and the new looks to the lobby, or (a new
// character) the world goes to My Room by itself. Back restores the world and returns to My Room.
bool CChangeAvaterScene::onMain() {
    switch (state_) {
    case START:
        state_ = DRESSING;
        break;
    case DRESSING: {
        CChangeAvatarPack* pack = pack_.get();
        if (pack->state_ == CChangeAvatarPack::DONE) {
            CAvatarData looks;
            pack->avatar(world_, &looks);
            playerDataSetAvatar(playerData(), looks.bytes_);
            playerDataSave(playerData());   // "セーブ成功" / "セーブ失敗"
            CPlayerInfo* me = accountActivePlayer();
            for (int32_t i = 0; i < 2; i++) {
                pack_.get()->avatar(i, &looks);
                me->avatar[i].set(looks.bytes_);
            }
            screenFaderFadeOut(CSceneMng::instance()->fader(), FADE_FRAMES, FADE_Z);
            if (gameWorldState() == 1) {
                CSceneMng::instance()->push(SCENE_MY_ROOM, CSceneMng::FADE_WAIT, true);
                state_ = REGISTER;
                return true;
            }
            gameWorldEnterMyRoom();
        } else if (pack->state_ == CChangeAvatarPack::CANCELLED) {
            gameWorldSetLobbyRank(gameWorldPrevLobbyRank());
            screenFaderFadeOut(CSceneMng::instance()->fader(), FADE_FRAMES, FADE_Z);
            CSceneMng::instance()->push(SCENE_MY_ROOM, CSceneMng::FADE_WAIT, true);
        } else {
            return true;
        }
        state_ = DONE;
        break;
    }
    case REGISTER:
        gameWorldSetLobbyRank(world_);
        lobby_.get()->regAvatar();
        state_ = WAIT_REGISTER;
        break;
    case WAIT_REGISTER:
        // "登録成功" / "登録失敗,,,,"
        if (lobby_.get()->busy == CNetLobbyTask::BUSY_DONE || lobby_.get()->busy == CNetLobbyTask::BUSY_FAILED)
            state_ = DONE;
        break;
    default:
        break;
    }
    return true;
}

// @yo2 0x008b5c10 CChangeAvaterScene::onDestroy: the base element goes (the pack's parts with it)
void CChangeAvaterScene::onDestroy() {
    if (CElement* base = baseElement())
        base->destroy(__FILE__, 0xdb);
}
