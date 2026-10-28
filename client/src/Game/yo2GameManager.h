// yo2GameManager.cpp: CGameMng, the game-wide manager (one instance, g_gameMng). It owns the dictionaries (avatar
// parts, NPC balloons, PBIN map), the menus and the chat window, the two players of a duel, the lobby's rank and the
// UI state flags the menus test. Most of its methods arrive with the classes they create; what is here is its
// layout, its life cycle and the helpers the other Game files call.
#pragma once
#include <cstdint>

#include "System/yo2EasyTask.h"
#include "System/yo2TaskPtr.h"

class CAvatarData;
class CChatWindow;
class CDuelAvaTask;
class CDuelDemoTask;
class CFukiDictionary;
class CMainMenu;
class CPbinDictionary;
class CRatingTask;
class CSpriteElm;
class CTeamFlagManager;
class CWADictionary;
class CWindowModelDuelConfig;
class CWindowModelMenu;
class CWindowModelMove;
class CWindowModelPlace;

// A remembered value set per lobby room id (setRoomEntry / findRoomEntry).
struct GameRoomEntry {
    int32_t id;          // 0x00
    int32_t values[3];   // 0x04
    uint8_t flag;        // 0x10
};
YO2_SIZEOF(GameRoomEntry, 0x14);

class CGameMng : public CEasyTask {
public:
    static void create(CTask* parent, uint32_t priority);
    CGameMng();
    ~CGameMng() override;

    // the members' targets, unchecked (a dynamic_cast of the pointer, null when it is gone)
    CPbinDictionary* pbinDictionary() const;
    CFukiDictionary* fukiDictionary() const;

    // @yo2 0x00a58740 CGameMng::setLobbyRank (the previous one kept)
    void setLobbyRank(int32_t rank) {
        prevLobbyRank_ = lobbyRank_;
        lobbyRank_ = rank;
    }
    bool modeIsLobby() const;   // unk9c_ is 0 or 1
    void setRoomEntry(int32_t id, const int32_t values[3], uint8_t flag);   // replaces id's, or adds one
    bool findRoomEntry(int32_t id, int32_t values[3], uint8_t* flag) const;   // either output may be null

    uint32_t unk70_ = 0;               // 0x70
    uint8_t unk74_ = 0, unk75_ = 0;    // 0x74
    vc6::string str78_;                // 0x78
    vc6::string str88_;                // 0x88
    int32_t unk98_ = -1;               // 0x98
    int32_t unk9c_ = 3;                // 0x9c
    int32_t unka0_ = 1;                // 0xa0
    int32_t unka4_ = 0;                // 0xa4
    int32_t unka8_ = 0;                // 0xa8
    vc6::string strAc_;                // 0xac
    int32_t unkbc_ = 1;                // 0xbc
    uint8_t unkc0_ = 0;                // 0xc0
    bool unkc1_ = true, unkc2_ = true; // 0xc1
    bool unkc3_ = false;               // 0xc3
    uint32_t unkc4_ = 0, unkc8_ = 0;   // 0xc4
    // TODO(Net): CDuelRoomList (vtable 0x00beb3c8 + a vector at +0x08), 0x14 bytes
    uint8_t duelRooms_[0x14] = {};     // 0xcc
    uint8_t unke0_ = 0;                // 0xe0
    // TODO(Net): CPlayerInfo[2] (src/Net/NetAccount.h, 0x1a8 each): kept opaque until Net drops its CAvatarData copy
    // (NetAccount.h and Game/Avatar/yo2AvatarData.h can't be included together yet)
    alignas(4) uint8_t players_[2][0x1a8] = {};   // 0xe4
    bool unk434_ = true;               // 0x434
    bool unk435_ = false;              // 0x435
    bool unk436_ = true, unk437_ = true;   // 0x436
    bool unk438_ = false;              // 0x438
    CTaskPtr<CWADictionary> waDict_;   // 0x43c "アバター辞書データ"
    int32_t lobbyRank_ = 0;            // 0x448
    int32_t prevLobbyRank_ = 0;        // 0x44c
    CTaskPtr<CFukiDictionary> fukiDict_;   // 0x450
    CTaskPtr<CPbinDictionary> pbinDict_;   // 0x45c
    uint8_t vec468_[0x10] = {};        // 0x468 TODO(Game): an MSVC6 vector (element type not known yet)
    uint8_t vec478_[0x10] = {};        // 0x478 TODO(Game): an MSVC6 vector
    CTaskPtr<CDuelAvaTask> duelAva_;   // 0x488
    CTaskPtr<CChatWindow> chat_;       // 0x494
    CTaskPtr<CWindowModelMenu> menu_;  // 0x4a0
    CTaskPtr<CMainMenu> mainMenu_;     // 0x4ac
    CTaskPtr<CWindowModelMove> move_;  // 0x4b8
    CTaskPtr<CWindowModelDuelConfig> duelConfig_;   // 0x4c4
    CTaskPtr<CWindowModelPlace> place_;             // 0x4d0
    CTaskPtr<CDuelDemoTask> duelDemo_;              // 0x4dc
    bool unk4e8_ = false, unk4e9_ = false, unk4ea_ = false, unk4eb_ = false, unk4ec_ = false;   // 0x4e8
    CTaskPtr<CRatingTask> rating_;     // 0x4f0
    CTaskPtr<CSpriteElm> sprite4fc_;   // 0x4fc
    CTaskPtr<CSpriteElm> sprite508_;   // 0x508
    uint8_t unk514_[0x10] = {};        // 0x514
    vc6::vector<GameRoomEntry> rooms_; // 0x524
    CTaskPtr<CTeamFlagManager> teamFlags_;   // 0x534
};
YO2_AT(CGameMng, str78_, 0x78);
YO2_AT(CGameMng, unk98_, 0x98);
YO2_AT(CGameMng, strAc_, 0xac);
YO2_AT(CGameMng, duelRooms_, 0xcc);
YO2_AT(CGameMng, players_, 0xe4);
YO2_AT(CGameMng, unk434_, 0x434);
YO2_AT(CGameMng, waDict_, 0x43c);
YO2_AT(CGameMng, lobbyRank_, 0x448);
YO2_AT(CGameMng, pbinDict_, 0x45c);
YO2_AT(CGameMng, duelAva_, 0x488);
YO2_AT(CGameMng, duelDemo_, 0x4dc);
YO2_AT(CGameMng, rating_, 0x4f0);
YO2_AT(CGameMng, rooms_, 0x524);
YO2_AT(CGameMng, teamFlags_, 0x534);
YO2_SIZEOF(CGameMng, 0x540);

extern CGameMng* g_gameMng;   // DAT_012bb6b0

// Resets an avatar whose bytes don't name parts the PBIN map allows (for its sex; with checkSeries, of its world's
// series or the common one) to the male default (world 1: with the GX clothes and duel disk).
void avatarValidate(CAvatarData* data, int world, bool checkSeries);
// Lobby ids 0x33..0x5f: three per lobby kind (sub 0, 1, 2); false for any other id. Either output may be null.
bool lobbyKindOf(int32_t lobbyId, int32_t* kind, int32_t* sub);
// Copies an avatar's bytes except the clothes and the duel disk (6 and 8).
void avatarCopyLooks(const CAvatarData& from, CAvatarData* to);
