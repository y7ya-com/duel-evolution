#include "Game/yo2GameManager.h"

#include "Game/Avatar/yo2AvatarData.h"
#include "Game/yo2EventManager.h"
#include "Game/yo2PlayerBin.h"
#include "System/yo2Debug.h"

// @yo2 0x00a54800 the TU's static initialiser (atexit)
CGameMng* g_gameMng;

// @yo2 0x00a54850 CGameMng::create: the one instance (asserts there is none yet)
void CGameMng::create(CTask* parent, uint32_t priority) {
    YO2_ASSERT(g_gameMng == nullptr, "singleton");
    auto* m = new CGameMng;
    m->setInstName("ゲームマネージャ");
    m->CTask::create(parent, priority);
}

// @yo2 0x00a56660 CGameMng::CGameMng (becomes g_gameMng)
CGameMng::CGameMng() {
    YO2_ASSERT(g_gameMng == nullptr, "singleton");
    g_gameMng = this;
    setTaskName("CGameMng");
    setInstName("ゲームマネージャ");
}

// @yo2 0x00a56f00 CGameMng::~CGameMng
// @yo2 0x00a56d60 CGameMng deleting destructor
CGameMng::~CGameMng() { g_gameMng = nullptr; }

// @yo2 0x00a58710 CGameMng::pbinDictionary
CPbinDictionary* CGameMng::pbinDictionary() const { return dynamic_cast<CPbinDictionary*>(pbinDict_.task()); }

// @yo2 0x00a586e0 CGameMng::fukiDictionary
CFukiDictionary* CGameMng::fukiDictionary() const { return dynamic_cast<CFukiDictionary*>(fukiDict_.task()); }

// @yo2 0x00a58630 CGameMng::modeIsLobby (static in the exe: reads g_gameMng)
bool CGameMng::modeIsLobby() const { return unk9c_ >= 0 && unk9c_ < 2; }

// @yo2 0x00a58cc0 avatarValidate: bytes 1-9 must name parts of their own PBIN slot (accessories may be 32, none),
// bytes 0 and 13-15 must be below 8
void avatarValidate(CAvatarData* data, int world, bool checkSeries) {
    bool ok = true;
    int32_t base = 0;
    uint8_t sex = data->bytes_[CAvatarData::SEX];
    if (sex == 1) {
        base = 0x100;
    } else if (sex > 1) {
        ok = false;
        yo2Trace("DATA Type Check Error =%d\n", sex);
    }
    for (int i = 0; ok && i < CAvatarData::SIZE; i++) {
        uint8_t b = data->bytes_[i];
        switch (i) {
        case 0:
        case 13:
        case 14:
        case 15:
            if (b > 7)
                ok = false;
            break;
        case 1: case 2: case 3: case 4: case 5: case 6: case 7: case 8: case 9: {
            if (i == CAvatarData::ACCESSORY2 && b == 0) {
                b = 0x20;
                data->bytes_[i] = 0x20;
            }
            PbinInfo info;
            g_gameMng->pbinDictionary()->getInfo(b + base, &info);
            bool none = (i == CAvatarData::ACCESSORY || i == CAvatarData::ACCESSORY2) && b == 0x20;
            if ((info.slot != i && !none) ||
                (checkSeries && info.series != 1 && info.series != (world != 0) + 2))
                ok = false;
            break;
        }
        }
    }
    if (ok)
        return;
    CAvatarData def;
    def.setDefault(CAvatarData::MALE_DM);
    if (world == 1) {
        def.bytes_[CAvatarData::CLOTHES] = 0x80;     // GX: Academia uniform and disk
        def.bytes_[CAvatarData::DUEL_DISK] = 0xb8;
    }
    data->set(def.bytes_);
}

// @yo2 0x00a58ec0 avatarCopyLooks
void avatarCopyLooks(const CAvatarData& from, CAvatarData* to) {
    for (int i = 0; i < CAvatarData::SIZE; i++)
        if (i != CAvatarData::DUEL_DISK && i != CAvatarData::CLOTHES)
            to->bytes_[i] = from.bytes_[i];
}

// @yo2 0x00a56120 CGameMng::setRoomEntry
// @yo2 0x00a5bbc0 uninitialized_copy<GameRoomEntry*>
// @yo2 0x00a5bc10 uninitialized_fill_n<GameRoomEntry*>
// @yo2 0x00a5c390 construct<GameRoomEntry>
// @yo2 0x00a5bb80 vector<GameRoomEntry>::size
// @yo2 0x00a03fd0 destroy<GameRoomEntry*> (empty)
void CGameMng::setRoomEntry(int32_t id, const int32_t values[3], uint8_t flag) {
    for (GameRoomEntry* e = rooms_.begin(); e != rooms_.end(); ++e)
        if (e->id == id) {
            e->values[0] = values[0], e->values[1] = values[1], e->values[2] = values[2];
            e->flag = flag;
            return;
        }
    GameRoomEntry e{id, {values[0], values[1], values[2]}, flag};
    rooms_.push_back(e);
}

// @yo2 0x00a56430 CGameMng::findRoomEntry
bool CGameMng::findRoomEntry(int32_t id, int32_t values[3], uint8_t* flag) const {
    for (const GameRoomEntry* e = rooms_.begin(); e != rooms_.end(); ++e)
        if (e->id == id) {
            if (values)
                values[0] = e->values[0], values[1] = e->values[1], values[2] = e->values[2];
            if (flag)
                *flag = e->flag;
            return true;
        }
    return false;
}

// @yo2 0x00a55cd0 lobbyKindOf
bool lobbyKindOf(int32_t lobbyId, int32_t* kind, int32_t* sub) {
    static const int32_t kKinds[] = {0, 4, 5, 6, 9, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18};
    if (lobbyId < 0x33 || lobbyId > 0x5f)
        return false;
    int32_t i = lobbyId - 0x33;
    if (kind)
        *kind = kKinds[i / 3];
    if (sub)
        *sub = i % 3;
    return true;
}
