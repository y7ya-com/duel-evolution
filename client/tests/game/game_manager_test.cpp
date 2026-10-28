// yo2GameManager.cpp: the CGameMng singleton and the avatar checks it backs (the real yo2PbinMap.dat).
#include "Game/Avatar/yo2AvatarData.h"
#include "Game/yo2GameManager.h"
#include "Game/yo2PlayerBin.h"
#include "game_test.h"

int main() {
    CTask* root = CTask::createRoot();
    CGameMng::create(root, 3);
    CGameMng* m = g_gameMng;
    CHECK(m && m->taskName() == "CGameMng" && m->instName() == "ゲームマネージャ" && m->priority() == 3);
    CHECK(m->unk98_ == -1 && m->unk9c_ == 3 && !m->modeIsLobby() && m->unk434_ && !m->unk435_);
    m->setLobbyRank(4);
    m->setLobbyRank(6);
    CHECK(m->lobbyRank_ == 6 && m->prevLobbyRank_ == 4);
    m->unk9c_ = 1;
    CHECK(m->modeIsLobby());

    // lobby rank and block areas
    m->setLobbyRank(5);
    CHECK(m->rankForLobbyKind(9) == 1 && m->rankForLobbyKind(15) == 0 && m->rankForLobbyKind(12) == 5);
    m->setLobbyRankFor(1);
    CHECK(m->lobbyRank_ == 1 && m->prevLobbyRank_ == 5);
    CHECK(lobbyBlockArea(1, 0) == 4 && lobbyBlockArea(20, 23) == 6 && lobbyBlockArea(9, 31) == 7);
    CHECK(lobbyBlockArea(7, 6) == 0 && lobbyBlockArea(8, 19) == 2 && lobbyBlockArea(13, 26) == 9 && lobbyBlockArea(12, 99) == 8);

    // room entries: replaced by id, added otherwise
    const int32_t v1[3] = {1, 2, 3}, v2[3] = {7, 8, 9};
    m->setRoomEntry(10, v1, 1);
    m->setRoomEntry(20, v2, 0);
    m->setRoomEntry(10, v2, 2);
    int32_t out[3];
    uint8_t flag;
    CHECK(m->rooms_.size() == 2 && m->findRoomEntry(10, out, &flag) && out[0] == 7 && out[2] == 9 && flag == 2);
    CHECK(m->findRoomEntry(20, nullptr, nullptr) && !m->findRoomEntry(30, out, &flag));
    // lobby ids
    int32_t kind, sub;
    CHECK(lobbyKindOf(0x33, &kind, &sub) && kind == 0 && sub == 0);
    CHECK(lobbyKindOf(0x37, &kind, &sub) && kind == 4 && sub == 1);
    CHECK(lobbyKindOf(0x44, &kind, &sub) && kind == 8 && sub == 2);
    CHECK(lobbyKindOf(0x5f, &kind, nullptr) && kind == 18 && !lobbyKindOf(0x60, &kind, &sub) && !lobbyKindOf(0x32, 0, 0));

    if (!mergeDat()) {
        std::printf("game_manager_test: merge.dat missing, avatar checks skipped\n");
    } else {
        gameSetFileProvider(mergeProvider);
        m->pbinDict_.setUser(m);
        m->pbinDict_.set(CPbinDictionary::create(m));
        CHECK(m->pbinDictionary());

        CAvatarData def;
        CAvatarData a;
        avatarValidate(&a, 0, true);
        CHECK(a.equals(def.bytes_));   // the default is valid
        a.bytes_[CAvatarData::ACCESSORY2] = 0;
        avatarValidate(&a, 0, true);
        CHECK(a.bytes_[CAvatarData::ACCESSORY2] == 0x20 && a.equals(def.bytes_));   // 0 means none (32)
        a.bytes_[CAvatarData::NOSE] = a.bytes_[CAvatarData::EYES];   // an eyes part in the nose slot
        avatarValidate(&a, 0, false);
        CHECK(a.equals(def.bytes_));
        CAvatarData gx;
        gx.setDefault(CAvatarData::MALE_GX);
        CAvatarData b;
        b.bytes_[14] = 8;
        avatarValidate(&b, 1, true);
        CHECK(b.bytes_[14] == 0 && b.bytes_[CAvatarData::CLOTHES] == 0x80 && b.bytes_[CAvatarData::DUEL_DISK] == 0xb8);
        CHECK(b.bytes_[CAvatarData::NOSE] == def.bytes_[CAvatarData::NOSE]);
        avatarValidate(&gx, 1, true);   // GX parts belong to world 1's series
        CHECK(gx.bytes_[CAvatarData::CLOTHES] == 0x80);
        CAvatarData f;
        f.bytes_[CAvatarData::SEX] = 2;
        avatarValidate(&f, 0, true);
        CHECK(f.bytes_[CAvatarData::SEX] == 0);
        std::printf("game_manager_test: avatar checks on the real PBIN map\n");
    }

    CAvatarData from, to;
    from.setDefault(CAvatarData::FEMALE_GX);
    avatarCopyLooks(from, &to);
    CHECK(to.bytes_[CAvatarData::SEX] == 1 && to.bytes_[CAvatarData::CLOTHES] == 0x70 &&
          to.bytes_[CAvatarData::DUEL_DISK] == 0xb0);   // clothes and disk stay

    root->destroy(__FILE__, __LINE__);
    CTask::flushDeleted();
    CHECK(g_gameMng == nullptr);
    std::printf("game_manager_test ok\n");
}
