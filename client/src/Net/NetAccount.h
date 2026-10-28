// CNetAccount: the account connection (5731). Login, character slots, trunk, PBIN/NPCBIN, DUELPASS count.
//   -> 0x3001 hello          <- 0x3002 CHALLENGE (16 B)
//   -> 0x3003 login (32 B: user field + MD5(user + challenge + password), Blowfish)   <- 0x3004 AUTHRESULT
//   -> 0x3010                <- 0x3012 PLAYERLIST (u32 result + up to 4 x 76-byte records)
//   -> 0x3020 / 0x3030 create / delete a character   <- 0x3022 / 0x3032 u32 result
//   -> 0x3100 trunk          <- 0x3101, 0x3102 x 7 (6 x 512 B + 184 B), 0x3103
//   -> 0x3114 PBIN           <- 0x3114 (128 B) + 0x4234 NPCBIN (512 B)
//   -> 0x3110                <- 0x3111 u32 DUELPASS packs
#pragma once
#include "Game/Avatar/yo2AvatarData.h"
#include "MessageIO.h"
#include "NetGate.h"

// One character record. The account keeps 4 (one per slot); the lobby keeps one per player in the block
// (CLobbyPlayer = this + 4 bytes). Field names are only given where a message or YOLaucher says what they are.
struct CPlayerInfo {
    CPlayerInfo();           // FUN_0063bfd0: the two avatars at their default, every field cleared

    uint32_t _vtbl;          // 0x000
    uint8_t valid;           // 0x004 set by PLAYERLIST
    uint8_t _005[7];
    int32_t pid;             // 0x00c
    char name[17];           // 0x010
    uint8_t _021[0x41];
    char comment[33];        // 0x062 LIST3
    char title[33];          // 0x083 LIST4 (the second comment line)
    uint8_t level;           // 0x0a4
    uint8_t _0a5[3];
    uint32_t u0a8;           // 0x0a8
    uint32_t mp;             // 0x0ac shop balance (YOLaucher cartera.py)
    uint16_t w0b0[16];       // 0x0b0 [1] = wins (+0xb2), [5] = losses (+0xba) (YOLaucher bloques.py)
    uint32_t u0d0;           // 0x0d0
    uint16_t w0d4[2];        // 0x0d4
    uint32_t u0d8[2];        // 0x0d8
    uint16_t w0e0[6];        // 0x0e0
    uint32_t u0ec[6];        // 0x0ec
    uint16_t w104[3];        // 0x104
    uint8_t _10a[2];
    uint32_t u10c;           // 0x10c
    uint16_t w110;           // 0x110
    uint16_t titleId;        // 0x112 shown title (FUN_0068fc50)
    uint16_t w114;           // 0x114
    uint16_t w116;           // 0x116
    uint8_t b118;            // 0x118
    uint8_t b119;            // 0x119
    uint8_t _11a[2];
    uint32_t u11c[4];        // 0x11c
    char country[4];         // 0x12c flag code, e.g. "ES" (LIST1)
    uint8_t state;           // 0x130 1 = present, 0x67..0x6a = duelling
    uint8_t block;           // 0x131 block within the room (0xff = none)
    uint8_t _132[2];
    CAvatarData avatar[2];     // 0x134 avatar parts per world (LIST2: index = the receiver's world)
    uint16_t x, y;           // 0x15c
    uint8_t dir;             // 0x160
    uint8_t _161;
    char duelName[17];       // 0x162 rival while duelling
    uint8_t duelLevel;       // 0x173
    uint16_t duelStats[3];   // 0x174
    uint8_t _17a[2];
    uint32_t teamId;         // 0x17c LIST5
    char teamName[16];       // 0x180 portable: an MSVC6 std::string in the exe; here 16 bytes, not NUL-terminated when full
    char teamCode[17];       // 0x190
    uint8_t _1a1[3];
    int32_t teamCodeNum;     // 0x1a4 atol(teamCode)
};
YO2_AT(CPlayerInfo, pid, 0x00c);
YO2_AT(CPlayerInfo, comment, 0x062);
YO2_AT(CPlayerInfo, title, 0x083);
YO2_AT(CPlayerInfo, level, 0x0a4);
YO2_AT(CPlayerInfo, w0b0, 0x0b0);
YO2_AT(CPlayerInfo, u0d0, 0x0d0);
YO2_AT(CPlayerInfo, u0ec, 0x0ec);
YO2_AT(CPlayerInfo, u10c, 0x10c);
YO2_AT(CPlayerInfo, titleId, 0x112);
YO2_AT(CPlayerInfo, b119, 0x119);
YO2_AT(CPlayerInfo, u11c, 0x11c);
YO2_AT(CPlayerInfo, country, 0x12c);
YO2_AT(CPlayerInfo, state, 0x130);
YO2_AT(CPlayerInfo, avatar, 0x134);
YO2_AT(CPlayerInfo, x, 0x15c);
YO2_AT(CPlayerInfo, duelName, 0x162);
YO2_AT(CPlayerInfo, duelStats, 0x174);
YO2_AT(CPlayerInfo, teamId, 0x17c);
YO2_AT(CPlayerInfo, teamCode, 0x190);
YO2_AT(CPlayerInfo, teamCodeNum, 0x1a4);
YO2_SIZEOF(CPlayerInfo, 0x1a8);

enum { TRUNK_BYTES = 0xcb8 };   // one count byte per card

void playerReset(CPlayerInfo* p);   // the field clear inlined in FUN_0068f520 / FUN_0068e470

enum : int {   // CMessageIOBase::req bytes
    ACC_REQ_HELLO = 0x1c,
    ACC_REQ_AUTH = 0x1d,
    ACC_REQ_PLAYERLIST = 0x1e,
    ACC_REQ_REGPLAYER = 0x1f,
    ACC_REQ_DELPLAYER = 0x20,
    ACC_REQ_TRUNK = 0x21,
    ACC_REQ_PBIN = 0x22,
    ACC_REQ_DPPURCHASE = 0x23,
};

// The account data sub-object at CNetAccount+0x121c: login, the 4 character records, the trunk.
struct CMyUser {
    uint32_t _vtbl;             // 0x000 (CUserInfoBase)
    uint32_t u04;               // 0x004
    char user[17];              // 0x008
    char password[17];          // 0x019
    uint8_t _02a[2];
    uint32_t u2c;               // 0x02c (PSELECTRESULT; YOLaucher sends the DP balance)
    CPlayerInfo players[4];     // 0x030
    uint8_t activeSlot;         // 0x6d0
    uint8_t trunk[TRUNK_BYTES]; // 0x6d1 the last complete trunk
    uint8_t trunk2[TRUNK_BYTES];// 0x1389
    char region[4];             // 0x2041 0x3004, e.g. "ESP"
    uint8_t region5;            // 0x2045
    uint8_t _2046[2];

    CPlayerInfo* player(int slot);        // FUN_006a5bc0
    void clear();                         // FUN_0068e470 (vtable slot 1)
    void setUser(const char* s);          // FUN_00642120
    void setPassword(const char* s);      // FUN_006421a0
};
YO2_AT(CMyUser, user, 0x008);
YO2_AT(CMyUser, password, 0x019);
YO2_AT(CMyUser, u2c, 0x02c);
YO2_AT(CMyUser, players, 0x030);
YO2_AT(CMyUser, activeSlot, 0x6d0);
YO2_AT(CMyUser, trunk2, 0x1389);
YO2_AT(CMyUser, region, 0x2041);
YO2_SIZEOF(CMyUser, 0x2048);

// PBIN / NPCBIN holder at CNetAccount+0x3264 (FUN_00ad68a0 / FUN_00ad68d0 fill it)
struct CPlayerBinData {
    uint32_t _vtbl;             // 0x000
    uint8_t pbin[0x81];         // 0x004
    uint8_t npcBin[0x201];      // 0x085
    uint8_t _286[2];

    // the exe's src\Game\yo2PlayerBin.cpp methods: PBIN flags (1024 bits) and 4-byte records in npcBin
    bool flag(uint32_t bit) const;               // FUN_00ad6a90
    void setFlag(uint32_t bit, bool on);         // FUN_00ad6900 (off toggles, as in the exe)
    uint32_t item(uint32_t id) const;            // FUN_00ad6d10 (u32 LE at npcBin[id * 4])
    void setItem(uint32_t id, uint32_t v);       // FUN_00ad6d80
};
YO2_AT(CPlayerBinData, npcBin, 0x085);
static_assert(sizeof(CPlayerBinData) == 0x288, "CPlayerBinData size");

struct CNetAccount : CMessageIOBase {
    uint8_t challenge[17];      // 0x534
    uint8_t _545[3];
    int32_t authResult;         // 0x548
    int32_t regResult;          // 0x54c
    int32_t delResult;          // 0x550
    uint8_t trunkChunk;         // 0x554
    uint8_t trunkIn[TRUNK_BYTES + 1];   // 0x555 filled by 0x3102 chunks
    uint8_t _120e[2];
    int32_t duelPassPacks;      // 0x1210
    uint32_t authFlags;         // 0x1214 0x3004: bit 0 ok, 0x20 chat ban, 0x40 trade ban (YOLaucher personajes.py)
    uint16_t u1218;             // 0x1218
    uint8_t _121a[2];
    CMyUser me;                 // 0x121c
    CPlayerBinData bin;         // 0x3264

    void init();                          // FUN_0068e040
    // @yo2 0x00642220
    CMyUser& myUser() { return me; }
    int32_t connect(const CNetGate* gate);   // FUN_0068e8d0
    void sendHello();                     // FUN_0068ef90
    void sendAuth();                      // FUN_0068efd0
    void reqPlayerList();                 // FUN_0068f150
    void reqRegPlayer(int8_t slot);       // FUN_0068f190 (name from me.players[slot].name)
    void reqDelPlayer(int8_t slot);       // FUN_0068f250
    void reqTrunk(int8_t slot);           // FUN_0068f2c0
    void reqPbin(int8_t slot);            // FUN_0068f340
    void reqDuelPassPurchase();           // FUN_0068f3c0
    int32_t onRecv();                     // FUN_0068eca0
    void onChallenge();                   // FUN_0068f430
    void onAuthResult();                  // FUN_0068f480
    void onPlayerList();                  // FUN_0068f520
    void onRegPlayerResult();             // FUN_0068fa10
    void onDelPlayerResult();             // FUN_0068fa50
    void onTrunkData();                   // FUN_0068fa90
    void onPbin();                        // FUN_0068fb10
    void onNpcBin();                      // FUN_0068fb90
    void onDuelPassPurchase();            // FUN_0068fc10
};
YO2_AT(CNetAccount, authResult, 0x548);
YO2_AT(CNetAccount, trunkChunk, 0x554);
YO2_AT(CNetAccount, duelPassPacks, 0x1210);
YO2_AT(CNetAccount, me, 0x121c);
YO2_AT(CNetAccount, bin, 0x3264);
static_assert(sizeof(void*) != 4 || sizeof(CNetAccount) == 0x34ec, "CNetAccount size");

// MD5(user + challenge + password) and the 0x3003 body; shared with the lobby's own login (FUN_006cb990).
void buildLogin(YgPacket* out, const char* user, const char* password, const uint8_t challenge[16]);
