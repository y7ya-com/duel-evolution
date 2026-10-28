// CNetLobby message parsers (the exe's src\Net\yo2NetLobby_Parse.cpp, 0x006b7e50..0x006c3af0) and the dispatcher.
#include <cstdlib>
#include <cstring>

#include "NetLobby.h"

// One player as the block lists carry it. The exe decodes into this 0xc0-byte stack struct, then copies into the
// player record; LIST1 fills 0x00-0x67, LIST2 0x66-0x97, LIST3 0x15, LIST4 0x36, LIST5 0x98-0xbd.
struct PlayerWire {
    int32_t pid;            // 0x00
    char name[17];          // 0x04
    char comment[33];       // 0x15
    char title[33];         // 0x36
    uint8_t level;          // 0x57
    uint16_t wins, losses, titleId, w116;   // 0x58
    uint8_t b119;           // 0x60
    char country[5];        // 0x61
    uint8_t state;          // 0x66
    uint8_t block;          // 0x67
    uint8_t avatar[17];     // 0x68
    uint8_t _79;
    uint16_t x, y;          // 0x7a
    uint8_t dir;            // 0x7e
    char duelName[17];      // 0x7f
    uint8_t duelLevel;      // 0x90
    uint8_t _91;
    uint16_t duelStats[3];  // 0x92
    uint32_t teamId;        // 0x98
    char teamName[17];      // 0x9c
    char teamCode[17];      // 0xad
    uint8_t _be[2];
};
static_assert(offsetof(PlayerWire, state) == 0x66 && offsetof(PlayerWire, teamCode) == 0xad, "PlayerWire");
static_assert(sizeof(PlayerWire) == 0xc0, "PlayerWire size");

static bool duelling(uint8_t state) { return state >= 0x67 && state <= 0x6a; }

COnlinePlayer* CNetLobby::findPlayer(int32_t pid) {
    for (COnlinePlayer& p : players)
        if (p.pid == pid) return &p;
    return nullptr;
}

// @yo2 0x006adfb0 a result slot: arrived -> out, the slot goes back to pending
bool CNetLobby::takeResult(int32_t* out, int k) {
    if (k < 0 || k >= 0x70) return false;
    int32_t r = results[k];
    *out = r;
    if (r == RESULT_PENDING) {
        *out = 0;
        return false;
    }
    results[k] = RESULT_PENDING;
    return true;
}

void CNetLobby::resetResults() {
    for (int32_t& r : results) r = RESULT_PENDING;
}

// @yo2 0x006adf90
void CNetLobby::clearDuelAbort() {
    duelAbortResult = RESULT_PENDING;
    flag(LB_REQ_DUELABORT) = 0;
}

// @yo2 0x006c33d0 append a new player record
// The exe's player list is a VC6 vector<smart_ptr<COnlinePlayer>> (CNetLobby+0x9a0); std::vector by value here:
// @yo2 0x006c5860 vector<smart_ptr<COnlinePlayer>>::_Insert_n
// @yo2 0x006c3b30 smart_ptr<COnlinePlayer>::~smart_ptr
// @yo2 0x006c75b0 construct(smart_ptr<COnlinePlayer>*, smart_ptr&): ownership moves to the copy
// @yo2 0x006c7a50 smart_ptr<COnlinePlayer>::operator=
COnlinePlayer& CNetLobby::newPlayer() {
    players.emplace_back();   // COnlinePlayer's constructor (FUN_006abb70 -> CPlayerInfo 0x63bfd0): avatars at default
    return players.back();
}

// @yo2 0x006b8b70 LIST1 record, 36 B
static void readList1(YgPacket* p, PlayerWire* w) {
    ygGet32(p, (uint32_t*)&w->pid);
    ygGetBytes(p, w->name, 16);
    ygGet8(p, &w->level);
    ygGet16(p, &w->wins);
    ygGet16(p, &w->losses);
    ygGet16(p, &w->titleId);
    ygGet16(p, &w->w116);
    ygGet8(p, &w->b119);
    ygGetBytes(p, w->country, 4);
    ygGet8(p, &w->state);
    ygGet8(p, &w->block);
}

// @yo2 0x006b8c30
static void applyList1(CPlayerInfo* r, const PlayerWire* w) {
    r->pid = w->pid;
    strcpy(r->name, w->name);
    r->level = w->level;
    r->w0b0[1] = w->wins;
    r->w0b0[5] = w->losses;
    r->titleId = w->titleId;
    r->w116 = w->w116;
    r->b119 = w->b119;
    memcpy(r->country, w->country, 4);   // the exe's strcpy also writes the NUL over +0x130, set just below
    r->state = w->state;
    r->block = w->block;
}

// @yo2 0x006b8de0 LIST2 record without the pid: u8 state, 16 B avatar, u16 x, u16 y, u8 dir (+ 23 B if duelling)
static void readList2(YgPacket* p, PlayerWire* w) {
    ygGet8(p, &w->state);
    ygGetBytes(p, w->avatar, 16);
    ygGet16(p, &w->x);
    ygGet16(p, &w->y);
    ygGet8(p, &w->dir);
    if (duelling(w->state)) {
        ygGetBytes(p, w->duelName, 16);
        ygGet8(p, &w->duelLevel);
        for (uint16_t& s : w->duelStats) ygGet16(p, &s);
    }
}

static void applyDuel(CPlayerInfo* r, const PlayerWire* w) {
    strcpy(r->duelName, w->duelName);
    r->duelLevel = w->duelLevel;
    memcpy(r->duelStats, w->duelStats, sizeof r->duelStats);
}

// @yo2 0x006b8eb0 note: the duel part is applied by the record's state, not by the state just read
static void applyList2(CPlayerInfo* r, const PlayerWire* w) {
    memcpy(r->avatar[g_lobbyWorld].bytes_, w->avatar, 16);
    r->x = w->x;
    r->y = w->y;
    r->dir = w->dir;
    if (duelling(r->state)) applyDuel(r, w);
}

// @yo2 0x006b9090 LIST3 record: 32 B comment
static void readList3(YgPacket* p, PlayerWire* w) { ygGetBytes(p, w->comment, 32); }
// @yo2 0x006b90c0
static void applyList3(CPlayerInfo* r, const PlayerWire* w) { strcpy(r->comment, w->comment); }
// @yo2 0x006b91d0 LIST4 record: 32 B second comment line
static void readList4(YgPacket* p, PlayerWire* w) { ygGetBytes(p, w->title, 32); }
// @yo2 0x006b9200
static void applyList4(CPlayerInfo* r, const PlayerWire* w) { strcpy(r->title, w->title); }

// @yo2 0x006b9320 LIST5 record: u32 team id, 16 B team name, 16 B team code
static void readList5(YgPacket* p, PlayerWire* w) {
    ygGet32(p, &w->teamId);
    ygGetBytes(p, w->teamName, 16);
    ygGetBytes(p, w->teamCode, 16);
}

// @yo2 0x006b9370
// @yo2 0x00ad7ed0 team code + its number (atol)
static void applyList5(CPlayerInfo* r, const PlayerWire* w) {
    r->teamId = w->teamId;
    strncpy(r->teamName, w->teamName, sizeof r->teamName);
    memcpy(r->teamCode, w->teamCode, 16);
    r->teamCode[16] = 0;
    r->teamCodeNum = (int32_t)atol(r->teamCode);
}

// LIST2..LIST5 data: records for players already in the list (unknown pids are skipped)
static void updateList(CNetLobby* l, void (*read)(YgPacket*, PlayerWire*),
                       void (*apply)(CPlayerInfo*, const PlayerWire*)) {
    YgPacket* p = l->in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        PlayerWire w{};
        ygGet32(p, (uint32_t*)&w.pid);
        read(p, &w);
        if (COnlinePlayer* r = l->findPlayer(w.pid)) apply(r, &w);
    }
    ygEndRead(p);
}

static void readCount(CNetLobby* l, int32_t* dst, int req) {
    YgPacket* p = l->in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)dst);
    ygEndRead(p);
    if (*dst != 0) l->flag(req) = 2;
}

static void readResult(CNetLobby* l, int32_t* dst, int req) {
    YgPacket* p = l->in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)dst);
    ygEndRead(p);
    l->flag(req) = 2;
}

// @yo2 0x006b7e50 0x3002 YG_MSG_CHALLENGE
void CNetLobby::onChallenge() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGetBytes(p, challenge, 16);
    ygEndRead(p);
    flag(LB_REQ_HELLO) = 2;
}

// @yo2 0x006b7ea0 0x3004 YG_MSG_AUTHRESULT (the lobby only keeps the result)
void CNetLobby::onAuthResult() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&authResult);
    ygEndRead(p);
    if (authResult == 0) authOk = 1;
    flag(LB_REQ_AUTH) = 2;
}

// @yo2 0x006b7ef0 0x4101 YG_MSG_PSELECTRESULT: the chosen character's full record, into the account
void CNetLobby::onPSelectResult(CNetAccount& acc) {
    YgPacket* p = in();
    CPlayerInfo* r = acc.me.player(acc.me.activeSlot);
    uint32_t v;
    uint16_t w;
    uint8_t b;
    auto u32 = [&] { ygGet32(p, &v); return v; };
    auto u16 = [&] { ygGet16(p, &w); return w; };
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&pselectResult);
    if (pselectResult == 0 && r) {   // fix: the original dereferences a null record for a slot >= 4
        r->pid = (int32_t)u32();
        acc.me.u2c = u32();
        r->w116 = u16();
        r->u11c[0] = u32();
        r->u11c[1] = u32();
        r->u11c[2] = u32();
        ygGet8(p, &b);
        r->level = b;
        r->u0a8 = u32();
        r->mp = u32();
        for (int i : {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15}) r->w0b0[i] = u16();   // +0xb0..+0xce, not +0xc6
        r->u0d0 = u32();
        for (uint16_t& x : r->w0d4) x = u16();
        for (uint32_t& x : r->u0d8) x = u32();
        for (uint16_t& x : r->w0e0) x = u16();
        for (uint32_t& x : r->u0ec) x = u32();
        for (uint16_t& x : r->w104) x = u16();
        r->u10c = u32();
        r->w110 = u16();
        r->titleId = u16();
        r->w0b0[11] = u16();   // +0xc6 comes last
    }
    ygEndRead(p);
    flag(LB_REQ_PSELECT) = 2;
}

// @yo2 0x006b8580 0x4201 YG_MSG_BLOCKLIST: u16 max, then u16 id, u8 area, u8 kind, u8 index per block
void CNetLobby::onBlockList() {
    YgPacket* p = in();
    // The exe's blocks are a VC6 vector<smart_ptr<LobbyBlock>> (CNetLobby+0x9dc); std::vector by value here:
    // @yo2 0x006c3b90 vector<smart_ptr<LobbyBlock>>::erase(first, last)
    // @yo2 0x006c3c70 smart_ptr<LobbyBlock>::~smart_ptr
    blocks.clear();
    uint16_t max;
    ygBeginRead(p);
    ygGet16(p, &max);
    while (ygReadPos(p) != -1) {
        LobbyBlock b{};
        uint8_t v;
        ygGet16(p, &b.id);
        ygGet8(p, &v); b.area = v;
        ygGet8(p, &b.kind);
        ygGet8(p, &b.index);
        // @yo2 0x006c4160 vector<smart_ptr<LobbyBlock>>::_Insert_n
        // @yo2 0x006c4360 vector<smart_ptr<LobbyBlock>>::size (the lobby UI reads it too)
        // @yo2 0x006c4390 _Destroy(first, last) of smart_ptr<LobbyBlock>
        // @yo2 0x006c68f0 uninitialized_copy of smart_ptr<LobbyBlock>
        // @yo2 0x006c6940 uninitialized_fill_n of smart_ptr<LobbyBlock>
        // @yo2 0x006c6dc0 fill(first, last, smart_ptr<LobbyBlock>)
        // @yo2 0x006c6e30 copy_backward of smart_ptr<LobbyBlock>
        // @yo2 0x006c7610 construct(smart_ptr<LobbyBlock>*, smart_ptr&)
        blocks.push_back(b);
    }
    ygEndRead(p);
    // ponytail: the exe's debug assert "error YG_BLOCK_MAX" (more blocks than max) is dropped
    flag(LB_REQ_BLOCKLIST) = 2;
}

// @yo2 0x006b8840 0x4203 YG_MSG_ENTERBLOCKRESULT: s32 result; if 0, the block and two more bytes
void CNetLobby::onEnterBlockResult() {
    YgPacket* p = in();
    int32_t r;
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&r);
    if (r == 0) {
        ygGet8(p, &block);
        ygGet8(p, &block2);
        ygGet8(p, &block3);
    }
    ygEndRead(p);
    enterBlockResult = r;
    flag(LB_REQ_ENTERBLOCK) = 2;
}

// @yo2 0x006b88d0 0x4211 LIST1 START: the list is rebuilt from scratch
void CNetLobby::onList1Start() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&listCount[0]);
    ygEndRead(p);
    // @yo2 0x006c3e70 vector<smart_ptr<COnlinePlayer>>::get_allocator (the exe clears by swapping with a new vector)
    players.clear();
    if (listCount[0] != 0) flag(LB_REQ_LIST1) = 2;
}

// @yo2 0x006b89a0 0x4215 LIST2 START
void CNetLobby::onList2Start() { readCount(this, &listCount[1], LB_REQ_LIST2); }
// @yo2 0x006b89f0 0x4219 LIST3 START
void CNetLobby::onList3Start() { readCount(this, &listCount[2], LB_REQ_LIST3); }
// @yo2 0x006b8a40 0x421d LIST4 START
void CNetLobby::onList4Start() { readCount(this, &listCount[3], LB_REQ_LIST4); }
// @yo2 0x006b8a90 0x4222 LIST5 START
void CNetLobby::onList5Start() { readCount(this, &list5Count, LB_REQ_LIST5); }

// @yo2 0x006b8ae0 0x4212 LIST1 DATA: 36-byte records, each one a new player
void CNetLobby::onList1() {
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        PlayerWire w{};
        readList1(p, &w);
        applyList1(&newPlayer(), &w);
    }
    ygEndRead(p);
}

// @yo2 0x006b8d10 0x4216 LIST2 DATA
void CNetLobby::onList2() { updateList(this, readList2, applyList2); }
// @yo2 0x006b8fc0 0x421a LIST3 DATA
void CNetLobby::onList3() { updateList(this, readList3, applyList3); }
// @yo2 0x006b9100 0x421e LIST4 DATA
void CNetLobby::onList4() { updateList(this, readList4, applyList4); }
// @yo2 0x006b9250 0x4223 LIST5 DATA
void CNetLobby::onList5() { updateList(this, readList5, applyList5); }

// @yo2 0x006b9480 0x3112 someone enters (op 1), leaves (op 0) or changes state (0x67..0x6a = duelling)
//   u32 pid, u8 op, u8 block; op 1: LIST1 + LIST2 + LIST5 records; duelling: 16 B rival, u8, 3 x u16
void CNetLobby::onJoinLeave() {
    YgPacket* p = in();
    PlayerWire w{};
    uint8_t op, blk;
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&w.pid);
    ygGet8(p, &op);
    ygGet8(p, &blk);
    if (op == 1) {
        readList1(p, &w);
        readList2(p, &w);   // overwrites op's byte (+0x66) with LIST2's state, so a "join" needs state 1 there
        readList5(p, &w);
        op = w.state;
    } else if (duelling(op)) {
        ygGetBytes(p, w.duelName, 16);
        ygGet8(p, &w.duelLevel);
        for (uint16_t& s : w.duelStats) ygGet16(p, &s);
    }
    ygEndRead(p);

    if (COnlinePlayer* r = findPlayer(w.pid)) {
        if (op == 0) {
            // @yo2 0x006c6b80 copy(first, last, dest) of smart_ptr<COnlinePlayer> (vector::erase)
            // @yo2 0x006c3af0 _Destroy(first, last) of smart_ptr<COnlinePlayer>
            players.erase(players.begin() + (r - players.data()));
        } else {
            applyDuel(r, &w);
            r->state = op;
            r->block = blk;
            if (op == 1) {
                applyList1(r, &w);
                applyList2(r, &w);
                applyList5(r, &w);
            }
        }
    } else if (op == 1) {
        COnlinePlayer& n = newPlayer();
        applyList1(&n, &w);
        applyList2(&n, &w);
        memset(n.comment, 0, sizeof n.comment + sizeof n.title);
    }
    playersChanged = 1;
}

// @yo2 0x006c2130 0x5300 position: u32 pid, u16 x, u16 y, u8 dir, u8; recorded while recordMoves is on
void CNetLobby::onMove() {
    YgPacket* p = in();
    uint32_t pid;
    uint16_t x, y;
    uint8_t dir, b;
    ygBeginRead(p);
    ygGet32(p, &pid);
    ygGet16(p, &x);
    ygGet16(p, &y);
    ygGet8(p, &dir);
    ygGet8(p, &b);
    ygEndRead(p);
    COnlinePlayer* r = findPlayer((int32_t)pid);
    if (!r) return;
    r->x = x;
    r->y = y;
    r->dir = dir;
    if (!recordMoves) return;
    // @yo2 0x006c54e0 deque<MoveRecord>::push_back, a new 0xffc-byte block (341 records)
    // @yo2 0x006c66c0 deque<MoveRecord>::_Growmap
    // @yo2 0x006c6980 deque<MoveRecord> iterator set node
    moves.push_back({(int32_t)pid, (uint32_t)x | (uint32_t)y << 16, (uint32_t)dir | (uint32_t)b << 8});
    moveCount++;
}

// @yo2 0x006ba340 0x4171 REGAVATARINFO result
void CNetLobby::onRegAvatarResult() { readResult(this, &regAvatarResult, LB_REQ_REGAVATAR); }
// @yo2 0x006ba380 0x4173 REGPLAYERCOMMENT result
void CNetLobby::onCommentResult() { readResult(this, &commentResult, LB_REQ_COMMENT); }
// @yo2 0x006ba3c0 0x4175 UPDATE_PLAYERTITLE result
void CNetLobby::onTitleResult() { readResult(this, &titleResult, LB_REQ_TITLE); }

// FUN_006ac020: the entry-flow messages here, the rest in the group files (onRecvRooms / Social / Shop).
int32_t CNetLobby::onRecv(CNetAccount& acc) {
    YgPacket* p = in();
    if (!p) return YG_BAD_ARGS;
    switch (p->id) {
    case 0x3002: onChallenge(); break;
    case 0x3004: onAuthResult(); break;
    case 0x3112: onJoinLeave(); break;
    case 0x4101: onPSelectResult(acc); break;
    case 0x4171: onRegAvatarResult(); break;
    case 0x4173: onCommentResult(); break;
    case 0x4175: onTitleResult(); break;
    case 0x4201: onBlockList(); break;
    case 0x4203: onEnterBlockResult(); break;
    case 0x4211: onList1Start(); break;
    case 0x4212: onList1(); break;
    case 0x4213: flag(LB_REQ_LIST1) = 2; break;
    case 0x4215: onList2Start(); break;
    case 0x4216: onList2(); break;
    case 0x4217: flag(LB_REQ_LIST2) = 2; break;
    case 0x4219: onList3Start(); break;
    case 0x421a: onList3(); break;
    case 0x421b: flag(LB_REQ_LIST3) = 2; break;
    case 0x421d: onList4Start(); break;
    case 0x421e: onList4(); break;
    case 0x421f: flag(LB_REQ_LIST4) = 2; break;
    case 0x4222: onList5Start(); break;
    case 0x4223: onList5(); break;
    case 0x4224: flag(LB_REQ_LIST5) = 2; break;
    case 0x5300: onMove(); break;
    default:
        if (!onRecvRooms(acc, p->id) && !onRecvSocial(acc, p->id)) onRecvShop(acc, p->id);
    }
    return YG_OK;
}
