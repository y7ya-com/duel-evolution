// CNetLobby: rooms, matches, duel room list, chat, player data, card packs, matching server.
#include <cstring>

#include "NetLobby.h"
#include "NetLobby_Rooms.h"
#include "NetLobby_Shop.h"
#include "NetLobby_Social.h"

// ---- player records

// @yo2 0x006b9820 0x4180 UPDATE_PLAYERCOMMENT: s32 pid, u8 line (0 comment, 1 second line), 32 B
void CNetLobby::onUpdateComment() {
    YgPacket* p = in();
    int32_t pid;
    uint8_t line;
    char text[33] = {};
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&pid);
    ygGet8(p, &line);
    ygGetBytes(p, text, 32);
    ygEndRead(p);
    COnlinePlayer* r = findPlayer(pid);
    if (!r || line > 1) return;   // fix: the exe writes line * 0x21 past the two lines too
    strcpy(line ? r->title : r->comment, text);
    playersChanged = 1;
}

// @yo2 0x006b9930 0x4181 UPDATE_PLAYERAVATAR: s32 pid, s32 world, 16 B parts
void CNetLobby::onUpdateAvatar() {
    YgPacket* p = in();
    int32_t pid, world;
    uint8_t parts[17] = {};
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&pid);
    ygGet32(p, (uint32_t*)&world);
    ygGetBytes(p, parts, 16);
    ygEndRead(p);
    COnlinePlayer* r = findPlayer(pid);
    if (!r || world < 0 || world > 1) return;   // fix: unbounded index in the exe
    memcpy(r->avatar[world].bytes_, parts, 16);
    playersChanged = 1;
}

// @yo2 0x006b9a10 0x5340 REQAVATARINFO result: s32; if 0, s32 pid, 16 B name, u16 x, u16 y, u8 dir
void CNetLobby::onAvatarInfo() {
    YgPacket* p = in();
    char name[17] = {};
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&avatarInfoResult);
    if (avatarInfoResult == 0) {
        uint32_t pid;
        uint16_t x, y;
        uint8_t dir;
        ygGet32(p, &pid);
        avatarPid = (int32_t)pid;
        ygGetBytes(p, name, 16);
        strncpy(avatarName, name, sizeof avatarName);
        ygGet16(p, &x);
        avatarX = x;
        ygGet16(p, &y);
        avatarY = y;
        ygGet8(p, &dir);
        avatarDir = dir > 7 ? 0 : dir;
    }
    ygEndRead(p);
    flag(LB_REQ_AVATARINFO) = 2;
}

// @yo2 0x006b9b50 0x4160 REQPLAYERINFO result: the record of someone else, into info (133 B like PSELECTRESULT)
void CNetLobby::onPlayerInfo() {
    // the exe clears the record like playerReset but leaves valid, +0x08 and the name except bytes 8-11
    uint8_t valid = info.valid, keep[7];
    char name[17];
    memcpy(keep, info._005, sizeof keep);
    memcpy(name, info.name, sizeof name);
    playerReset(&info);
    info.valid = valid;
    memcpy(info._005, keep, sizeof keep);
    memcpy(info.name, name, sizeof name);
    memset(info.name + 8, 0, 4);

    YgPacket* p = in();
    CPlayerInfo* r = &info;
    uint32_t v;
    uint16_t w;
    uint8_t b;
    char nm[17];
    auto u32 = [&] { ygGet32(p, &v); return v; };
    auto u16 = [&] { ygGet16(p, &w); return w; };
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&playerInfoResult);
    if (playerInfoResult == 0) {
        r->pid = (int32_t)u32();
        ygGetBytes(p, nm, 16);
        strcpy(r->name, nm);
        ygGet8(p, &b);
        r->level = b;
        r->u0a8 = u32();
        r->mp = u32();
        for (int i : {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15}) r->w0b0[i] = u16();
        r->u0d0 = u32();
        for (uint16_t& x : r->w0d4) x = u16();
        for (uint32_t& x : r->u0d8) x = u32();
        for (uint16_t& x : r->w0e0) x = u16();
        for (uint32_t& x : r->u0ec) x = u32();
        for (uint16_t& x : r->w104) x = u16();
        r->u10c = u32();
        r->w110 = u16();
        r->titleId = u16();
        r->w116 = u16();
        r->u11c[2] = u32();
        r->w0b0[11] = u16();   // +0xc6 last, as in PSELECTRESULT
    }
    ygEndRead(p);
    flag(LB_REQ_PLAYERINFO) = 2;
}

// @yo2 0x006bc270 0x4140 PLAYERDATAUPDATE: my own record after a duel / purchase (125 B), plus one NPCBIN entry
void CNetLobby::onPlayerDataUpdate(CNetAccount& acc) {
    YgPacket* p = in();
    CPlayerInfo scratch;
    CPlayerInfo* r = acc.me.player(acc.me.activeSlot);
    if (!r) r = &scratch;   // fix: the exe writes through a null record for a slot >= 4
    uint32_t v;
    uint16_t w;
    uint8_t b, npcBytes[4];
    auto u32 = [&] { ygGet32(p, &v); return v; };
    auto u16 = [&] { ygGet16(p, &w); return w; };
    ygBeginRead(p);
    ygGet8(p, &b);
    r->level = b;
    r->u0a8 = u32();
    r->mp = u32();
    for (int i = 0; i < 5; i++) r->w0b0[i] = u16();   // +0xb0..+0xb8
    acc.me.u2c = u32();
    for (int i : {5, 6, 7, 8, 9, 10, 12, 13, 14, 15}) r->w0b0[i] = u16();   // +0xba..+0xc4, +0xc8..+0xce
    r->u0d0 = u32();
    for (uint16_t& x : r->w0d4) x = u16();
    for (uint32_t& x : r->u0d8) x = u32();
    for (uint16_t& x : r->w0e0) x = u16();
    for (uint32_t& x : r->u0ec) x = u32();
    for (uint16_t& x : r->w104) x = u16();
    r->u10c = u32();
    r->w110 = u16();
    r->titleId = u16();
    r->w116 = u16();
    r->u11c[2] = u32();
    int32_t npc = (int32_t)u32();
    for (uint8_t& x : npcBytes) ygGet8(p, &x);
    if (npc != 0)
        acc.bin.setItem(npc, npcBytes[0] | npcBytes[1] << 8 | npcBytes[2] << 16 | (uint32_t)npcBytes[3] << 24);
    r->w0b0[11] = u16();
    ygEndRead(p);
}

// ---- duel rooms

struct RoomWire {   // 19 B on the wire
    int32_t id, p1, p2;
    uint8_t mstat, dstyle, wmode;
    int8_t locked;
    uint8_t x[3];
};

// @yo2 0x006ba6a0
static void readRoom(YgPacket* p, RoomWire* r) {
    ygGet32(p, (uint32_t*)&r->id);
    ygGet32(p, (uint32_t*)&r->p1);
    ygGet32(p, (uint32_t*)&r->p2);
    ygGet8(p, &r->mstat);
    ygGet8(p, &r->dstyle);
    ygGet8(p, &r->wmode);
    ygGet8(p, (uint8_t*)&r->locked);
    for (uint8_t& b : r->x) ygGet8(p, &b);
}

// @yo2 0x006ba740
static void applyRoom(CDuelRoom* d, const RoomWire* r) {
    d->id = r->id;
    d->p1 = r->p1;
    d->p2 = r->p2;
    d->mstat = r->mstat;
    d->dstyle = r->dstyle;
    d->wmode = r->wmode;
    d->locked = r->locked != 0;
    memcpy(d->x, r->x, 3);
}

// my own room: P1 is my character (the exe dereferences the record without checking the slot)
static void markMine(CNetLobby* l, const CNetAccount& acc, CDuelRoom* d) {
    const CPlayerInfo* me = const_cast<CNetAccount&>(acc).me.player(acc.me.activeSlot);
    if (me && d->p1 == me->pid) {
        d->mine = 1;
        l->ownRoom = 1;
        l->myRoom = d;
    }
}

// @yo2 0x006c3500 append a room with the constructor's defaults
// The exe's rooms are a VC6 vector<smart_ptr<CDuelRoom>> (CNetLobby+0x9c0); std::vector<std::unique_ptr> here:
// @yo2 0x006c5bc0 vector<smart_ptr<CDuelRoom>>::_Insert_n
// @yo2 0x006c3b60 smart_ptr<CDuelRoom>::~smart_ptr
// @yo2 0x006c75e0 construct(smart_ptr<CDuelRoom>*, smart_ptr&): ownership moves to the copy
// @yo2 0x006c7ac0 smart_ptr<CDuelRoom>::operator= (also vector::erase in onRoomUpdate)
// @yo2 0x006c35e0 CDuelRoom deleting destructor (its only virtual; nothing to free)
CDuelRoom& CNetLobby::newRoom() {
    rooms.push_back(std::unique_ptr<CDuelRoom>(new CDuelRoom{}));
    CDuelRoom& d = *rooms.back();
    d.dstyle = 3;
    memset(d.x, 1, 3);
    return d;
}

// @yo2 0x006ba410 0x4282 DUELROOMLISTSTART: s32 count (< 0 = error); the list is rebuilt
void CNetLobby::onRoomListStart() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&roomListCount);
    ygEndRead(p);
    // @yo2 0x006c79e0 smart_ptr<CDuelRoom> destroy, once per element (the exe's clear)
    rooms.clear();
    ownRoom = 0;
    myRoom = nullptr;
    if (roomListCount < 0) {
        flag(LB_REQ_ROOMLIST) = 2;
        roomListTotal = 0;
        return;
    }
    roomListTotal = roomListCount;
}

// @yo2 0x006ba4f0 0x4284 DUELROOMLIST: 19-byte rooms
void CNetLobby::onRoomList(const CNetAccount& acc) {
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        RoomWire w;
        readRoom(p, &w);
        CDuelRoom& d = newRoom();
        applyRoom(&d, &w);
        markMine(this, acc, &d);
    }
    ygEndRead(p);
}

// @yo2 0x006ba7b0 0x3113 UPDATE_DUELROOMINFO: one room; P1 = P2 = 0 deletes it
void CNetLobby::onRoomUpdate(const CNetAccount& acc) {
    YgPacket* p = in();
    RoomWire w;
    ygBeginRead(p);
    readRoom(p, &w);
    ygEndRead(p);
    bool gone = w.p1 == 0 && w.p2 == 0;
    size_t i = 0;
    while (i < rooms.size() && rooms[i]->id != w.id) i++;
    CDuelRoom* d = i < rooms.size() ? rooms[i].get() : nullptr;
    if (!d && !gone) d = &newRoom();
    if (d) {
        if (!gone) applyRoom(d, &w);
        markMine(this, acc, d);
        if (gone) {
            if (myRoom == d) myRoom = nullptr;   // fix: the exe keeps pointing at the deleted room
            rooms.erase(rooms.begin() + i);
        }
    }
    roomsChanged = 1;
}

static void readResult(CNetLobby* l, int32_t* dst, int req) {
    YgPacket* p = l->in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)dst);
    ygEndRead(p);
    l->flag(req) = 2;
}

// @yo2 0x006baa20 0x428a CREATEROOMRESULT
void CNetLobby::onCreateRoomResult() { readResult(this, &createRoomResult, LB_REQ_CREATEROOM); }

// @yo2 0x006baa60 0x4292 DELETEROOMRESULT (only while a delete is pending)
void CNetLobby::onDeleteRoomResult() {
    if (flag(LB_REQ_DELETEROOM) == 1) readResult(this, &deleteRoomResult, LB_REQ_DELETEROOM);
}

// @yo2 0x006bae50 0x4301 REQMATCHRESULT
void CNetLobby::onReqMatchResult() { readResult(this, &reqMatchResult, LB_REQ_MATCH); }
// @yo2 0x006bb470 0x4309 CANCELREQMATCHRESULT
void CNetLobby::onCancelMatchResult() { readResult(this, &cancelMatchResult, LB_REQ_CANCELMATCH); }
// @yo2 0x006bc230 0x42a2 RESETAUTOWAITRESULT
void CNetLobby::onResetAutoWaitResult() { readResult(this, &resetAutoWaitResult, LB_REQ_RESETAUTOWAIT); }

// The rival card of 0x4302 / 0x43a0: s32 pid, 16 B name, [u8], u8 level, u16 title, u16, 16 B avatar parts
static void readRival(CNetLobby* l, bool offer) {
    YgPacket* p = l->in();
    int32_t pid;
    char name[17];
    uint8_t level, skip, parts[17];
    uint16_t title, w116;
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&pid);
    ygGetBytes(p, name, 16);
    if (offer) ygGet8(p, &skip);   // MATCHOFFER has one byte more before the level, unused
    ygGet8(p, &level);
    ygGet16(p, &title);
    ygGet16(p, &w116);
    ygGetBytes(p, parts, 16);
    if (!offer) ygGet8(p, &l->autoDuelMode);
    ygEndRead(p);
    playerReset(&l->rival);
    l->rival.pid = pid;
    strcpy(l->rival.name, name);
    l->rival.level = level;
    l->rival.titleId = title;
    l->rival.w116 = w116;
    memcpy(l->rival.avatar[0].bytes_, parts, 16);
}

// @yo2 0x006baab0 0x43a0 AUTODUELSTART: the server paired us; mode 1 tells Game who the rival is
void CNetLobby::onAutoDuelStart() {
    readRival(this, false);
    if (autoDuelMode == 1) lobbyAutoDuelStarted(rival.pid);
    watchState = 2;
    flag(LB_REQ_AUTODUEL) = 2;
}

// @yo2 0x006bae90 0x4302 MATCHOFFER: someone wants to duel in my room
void CNetLobby::onMatchOffer() {
    readRival(this, true);
    watchState = 1;
    flag(LB_REQ_OFFER) = 2;
    flag(LB_REQ_CANCELMATCH) = 0;
    flag(LB_REQ_OFFERTIMEOUT) = 0;
}

// @yo2 0x006bb200 0x4308 OFFERTIMEOUT
void CNetLobby::onOfferTimeout() {
    flag(LB_REQ_OFFERTIMEOUT) = 2;
    flag(LB_REQ_OFFER) = 0;
}

// @yo2 0x006bb220 0x4305 CANCELREQMATCH: the challenger withdrew
void CNetLobby::onMatchCancelled() {
    playerReset(&rival);
    flag(LB_REQ_CANCELMATCH) = 2;
    flag(LB_REQ_OFFER) = 0;
}

// @yo2 0x006bb4b0 0x4310 DUELABORT
void CNetLobby::onDuelAbort() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&duelAbortResult);
    ygEndRead(p);
    playerReset(&rival);
    flag(LB_REQ_DUELABORT) = 2;
}

// @yo2 0x006bb730 0x4306 DUELSERVERNOTICE: 15 B ip + u16 port
void CNetLobby::onDuelServerNotice() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGetBytes(p, duelIp, 15);
    ygGet16(p, &duelPort);
    ygEndRead(p);
    flag(LB_REQ_DUELSERVER) = 2;
}

// @yo2 0x006bbda0 0x4321 REQWATCHRESULT: s32; if 0, the duel server like 0x4306
void CNetLobby::onWatchResult() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&watchResult);
    if (watchResult == 0) {
        ygGetBytes(p, duelIp, 15);
        ygGet16(p, &duelPort);
    }
    ygEndRead(p);
    flag(LB_REQ_WATCH) = 2;
}

// @yo2 0x006cc860 set the record's name
static void setPlayerName(CPlayerInfo& p, const std::string& s) { strcpy(p.name, s.c_str()); }

// @yo2 0x006cc420 0x4300 REQMATCH: u32 room, MD5(password); then the rival card is taken from the room's owner
void CNetLobby::reqMatch(int32_t room, const char* password) {
    char pw[17] = {};
    uint8_t digest[16];
    strncpy(pw, password ? password : "", 16);   // the exe strcpy's into 17 bytes
    ygMd5(pw, (int)strlen(pw), digest);           // an empty password still sends MD5("")
    ygClear(&out);
    ygBegin(&out, 0x4300);
    ygPut32(&out, room);
    ygPutBytes(&out, digest, 16);
    ygEnd(&out);
    send();
    flag(LB_REQ_MATCH) = 1;
    const CDuelRoom* d = nullptr;
    for (auto& r : rooms)
        if (r->id == room) d = r.get();
    const COnlinePlayer* owner = d ? findPlayer(d->p1) : nullptr;   // fix: the exe reads a null room
    if (owner) {
        rival.level = owner->level;
        rival.u0a8 = owner->u0a8;
        rival.pid = owner->pid;
        setPlayerName(rival, playerNameString(*owner));
    } else {
        playerReset(&rival);
    }
    watchState = 0;
}

// ---- chat

// @yo2 0x006bb780 0x4402 CHATNOTICE: u8 kind, u8 channel (3 = whisper tab), s32 pid, s32 language, 16 B name, text.
// Outside My Room the line "<channel prefix><name>:<text>" goes into the chat log.
// ponytail: the exe also sprintf's "+%s+: <LJ|LK|LA>%s" into a local nobody reads; dropped.
void CNetLobby::onChatNotice() {
    YgPacket* p = in();
    uint8_t kind, channel;
    int32_t pid, lang;
    char name[17] = {}, text[0x81] = {}, conv[0x81] = {};
    ygBeginRead(p);
    ygGet8(p, &kind);
    ygGet8(p, &channel);
    ygGet32(p, (uint32_t*)&pid);
    ygGet32(p, (uint32_t*)&lang);
    ygGetBytes(p, name, 16);
    ygGetString(p, text, 0);
    ygEndRead(p);
    lobbyTextFilter(lang, text, conv);
    if (rank == 12) return;
    const std::u16string& prefix = chatPrefix[channel == 3 ? 3 : 0];
    // @yo2 0x006c6c00 construct(ChatLine*, const ChatLine&): the list node's copy (the exe's line holds two wstrings)
    chat.push_back({(int8_t)channel, pid, kind, prefix + lobbyWiden(name) + u":" + lobbyWiden(conv)});
}

// ---- card packs

// @yo2 0x006bbe20 0x4800 CARDPACKLISTNOTICE: u16 pack ids (0 skipped)
void CNetLobby::onCardPackList() {
    YgPacket* p = in();
    cardPacks.clear();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        uint16_t id;
        ygGet16(p, &id);
        if (id) cardPacks.push_back(id);   // the exe builds Pack/'s record for it here (FUN_0084d8a0)
    }
    ygEndRead(p);
    flag(LB_REQ_RECOVERYPACK) = 2;
}

// @yo2 0x006bc0f0 0x4803 SELECTCARDPACKRESULT: s32, then u16 card + u8 "new" per card; each card goes into the trunk
void CNetLobby::onSelectPackResult(CNetAccount& acc) {
    YgPacket* p = in();
    clearPackCards();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&selectPackResult);
    for (int i = 0; ygReadPos(p) != -1; i++) {
        uint16_t card;
        uint8_t isNew;
        ygGet16(p, &card);
        ygGet8(p, &isNew);
        setPackCard(i, card, isNew);
        if (card != 0 && card < 0xcb9 && acc.me.trunk[card - 1] != 0xff) acc.me.trunk[card - 1]++;
    }
    ygEndRead(p);
    cardDbSyncTrunk(acc.me);
    flag(LB_REQ_SELECTPACK) = 2;
}

// ---- matching server

// @yo2 0x006af060
void CNetLobby::clearMatching() {
    for (MatchEntry& e : matching) {
        e.pid = 0;
        e.found = 0;
        e._0a = 0;
        memset(e.b, 0, sizeof e.b);
    }
    matchingCount = 0;
    matchingFound = 0;
}

// @yo2 0x006ccf80 CNetLobby::searchFriends (inline in NetLobby.h): the friend search, an empty method in the
// shipped exe. CNetLobbyTask (state 0x1b) and CNetLobby_RecvMail call it, then wait for request byte 0x40, which
// only a 0x3603 MATCHINGSVR answer sets.
// @yo2 0x006ccfa0 0x3603 MATCHINGSVR_REQPLAYER for the friend list: u32 count, then each non-zero pid
void CNetLobby::reqMatchingFriends() {
    clearMatching();
    int n = lobbyFriendCount();
    if (n > 100) n = 100;   // fix: the exe overruns its 100 entries
    matchingCount = n;
    for (int i = 0; i < n; i++) matching[i].pid = (int32_t)lobbyFriendId(i);
    if (!matchingCount) return;
    ygClear(&out);
    ygBegin(&out, 0x3603);
    ygPut32(&out, matchingCount);
    for (const MatchEntry& e : matching)
        if (e.pid) ygPut32(&out, e.pid);
    ygEnd(&out);
    send();
    flag(LB_REQ_MATCHING) = 1;
}

// @yo2 0x006bcdd0 0x3604 MATCHINGSVR_PLAYER: s32, u32 n, then n x (s32 pid, 5 x u8) for whoever is online
void CNetLobby::onMatchingPlayers() {
    YgPacket* p = in();
    uint32_t r;
    ygBeginRead(p);
    ygGet32(p, &r);
    ygGet32(p, &matchingFound);
    for (uint32_t k = 0; k < matchingFound; k++) {
        int32_t pid;
        uint8_t v[5];
        ygGet32(p, (uint32_t*)&pid);
        for (uint8_t& b : v) ygGet8(p, &b);
        for (MatchEntry& e : matching) {
            if (e.pid != pid) continue;
            e.found = 1;
            e.b[1] = v[0];
            e.b[0] = v[1];
            e.b[2] = v[2];
            e.b[3] = v[3];
            e.b[4] = v[4];
        }
    }
    ygEndRead(p);
    flag(LB_REQ_MATCHING) = 2;
}

bool CNetLobby::onRecvRooms(CNetAccount& acc, int32_t id) {
    switch (id) {
    case 0x3113: onRoomUpdate(acc); break;
    case 0x3604: onMatchingPlayers(); break;
    case 0x4140: onPlayerDataUpdate(acc); break;
    case 0x4160: onPlayerInfo(); break;
    case 0x4180: onUpdateComment(); break;
    case 0x4181: onUpdateAvatar(); break;
    case 0x4282: onRoomListStart(); break;
    case 0x4284: onRoomList(acc); break;
    case 0x4286:   // DUELROOMLISTEND
        flag(LB_REQ_ROOMLIST) = 2;
        playersChanged = 1;
        break;
    case 0x428a: onCreateRoomResult(); break;
    case 0x4292: onDeleteRoomResult(); break;
    case 0x42a2: onResetAutoWaitResult(); break;
    case 0x4301: onReqMatchResult(); break;
    case 0x4302: onMatchOffer(); break;
    case 0x4305: onMatchCancelled(); break;
    case 0x4306: onDuelServerNotice(); break;
    case 0x4308: onOfferTimeout(); break;
    case 0x4309: onCancelMatchResult(); break;
    case 0x4310: onDuelAbort(); break;
    case 0x4321: onWatchResult(); break;
    case 0x43a0: onAutoDuelStart(); break;
    case 0x4402: onChatNotice(); break;
    case 0x4800: onCardPackList(); break;
    case 0x4803: onSelectPackResult(acc); break;
    case 0x5340: onAvatarInfo(); break;
    default: return false;
    }
    return true;
}
