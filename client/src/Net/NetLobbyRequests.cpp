// The lobby's one-request tasks (the exe's src\Net\yo2NetLobby_CreateRoom.cpp, _DeleteRoom, _OfferCancel,
// _OfferRoom, _RecvMail, _ReplyDuel, _TradeCancel).
#include "NetLobbyRequests.h"

#include <cstring>

template <class T> static T* spawnUnder(CTask* parent) {
    return dynamic_cast<T*>((new T)->create(parent, 10000));
}

void CNetLobbyRequestBase::bind() {
    gate = appNetGate();
    acc = appNetAccount();
    duel = appNetDuel();
    lobby = appNetLobby();
}

template <class Send>
void CNetLobbyRequestBase::request(int32_t& state, int32_t& busy, int32_t& result, int f, int k, Send send) {
    switch (state) {
    case 2:
        busy = BUSY_WORKING;
        send();
        state = 3;
        break;
    case 3:
        busy = BUSY_WORKING;
        if (lobby->flag(f) != 2) break;
        lobby->flag(f) = 0;
        lobby->takeResult(&result, k);
        state = result == 0 ? 5 : 4;
        break;
    case 4:
        busy = BUSY_FAILED;
        state = 1;
        break;
    case 5:
        busy = BUSY_DONE;
        state = 1;
        break;
    }
}

// Every task's answered(k) is the same switch over the request bytes the lobby scene waits on; TradeCancel's also
// takes 0x13 and 0x1f.
bool CNetLobbyRequestBase::answered(int k, bool tradeCancel) {
    switch (k) {
    case 0x13: case 0x1f:
        if (!tradeCancel) return false;
        [[fallthrough]];
    case 0x10: case 0x11: case 0x12: case 0x23: case 0x2c: case 0x2d: case 0x35:
        if (lobby->flag(0x1c + k) != 2) return false;
        lobby->flag(0x1c + k) = 0;
        return true;
    }
    return false;
}

// ---- CNetLobby_CreateRoom

// @yo2 0x006b1650 create under parent (priority 10000)
CNetLobby_CreateRoom* CNetLobby_CreateRoom::spawn(CTask* parent) { return spawnUnder<CNetLobby_CreateRoom>(parent); }
// @yo2 0x006b1710
CNetLobby_CreateRoom::CNetLobby_CreateRoom() { setInstName("CNetLobby_CreateRoom"); }
// @yo2 0x006b1840 CNetLobby_CreateRoom deleting destructor
// @yo2 0x006b1870
CNetLobby_CreateRoom::~CNetLobby_CreateRoom() = default;

// @yo2 0x006b18f0
bool CNetLobby_CreateRoom::onInit() {
    bind();
    state = 1;
    busy = BUSY_IDLE;
    result = 0;
    _8c = 0;
    locked = 0;
    memset(password, 0, sizeof password);
    dstyle = 3;
    wmode = 0;
    mstat = 1;
    return true;
}

// @yo2 0x006b1ce0
void CNetLobby_CreateRoom::onDestroy() {}

// @yo2 0x006b19b0
bool CNetLobby_CreateRoom::onMain() {
    switch (state) {
    case 0:
        result = 0;
        state = 1;
        break;
    case 1:
        busy = BUSY_IDLE;
        break;
    default:
        request(state, busy, result, LB_REQ_CREATEROOM, 0xe, [this] {
            lobby->reqCreateRoom(dstyle, wmode, mstat, locked, password, d, e, f, rival);
        });
    }
    return true;
}

// @yo2 0x006b1bb0
bool CNetLobby_CreateRoom::createRoom(uint8_t ds, uint8_t wm, uint8_t ms, bool lk, const char* pw, uint8_t d5,
                                      uint8_t e6, uint8_t f7, uint32_t rv) {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    locked = lk;
    memset(password, 0, sizeof password);
    if (lk) memcpy(password, pw, sizeof password);   // the exe copies all 17 bytes
    mstat = ms;
    rival = rv;
    wmode = wm;
    d = d5;
    dstyle = ds;
    e = e6;
    f = f7;
    state = 2;
    return true;
}

// ---- CNetLobby_DeleteRoom

// @yo2 0x006b2c80
CNetLobby_DeleteRoom* CNetLobby_DeleteRoom::spawn(CTask* parent) { return spawnUnder<CNetLobby_DeleteRoom>(parent); }
// @yo2 0x006b2d40
CNetLobby_DeleteRoom::CNetLobby_DeleteRoom() { setInstName("CNetLobby_DeleteRoom"); }
// @yo2 0x006b2e70 CNetLobby_DeleteRoom deleting destructor
// @yo2 0x006b2ea0
CNetLobby_DeleteRoom::~CNetLobby_DeleteRoom() = default;

// @yo2 0x006b2f20
bool CNetLobby_DeleteRoom::onInit() {
    bind();
    busy = BUSY_IDLE;
    result = 0;
    state = 1;
    return true;
}

// @yo2 0x006b2fa0
bool CNetLobby_DeleteRoom::onMain() {
    switch (state) {
    case 0:
        state = 1;
        break;
    case 1:
        busy = BUSY_IDLE;
        result = 0;
        break;
    default:
        request(state, busy, result, LB_REQ_DELETEROOM, 0xf, [this] { lobby->reqDeleteRoom(); });
        if (state == 5) {   // deleted: no room of mine any more
            lobby->ownRoom = 0;
            lobby->myRoom = nullptr;
        }
    }
    return true;
}

// @yo2 0x006b31c0
bool CNetLobby_DeleteRoom::deleteRoom() {
    if (busy != BUSY_IDLE) return false;
    state = 2;
    busy = BUSY_WORKING;
    return true;
}

// @yo2 0x006b3130
bool CNetLobby_DeleteRoom::answered(int k) { return CNetLobbyRequestBase::answered(k); }

// ---- CNetLobby_OfferCancel

// @yo2 0x006b5100
CNetLobby_OfferCancel* CNetLobby_OfferCancel::spawn(CTask* parent) { return spawnUnder<CNetLobby_OfferCancel>(parent); }
// @yo2 0x006b51c0
CNetLobby_OfferCancel::CNetLobby_OfferCancel() { setInstName("CNetLobby_OfferCancel"); }
// @yo2 0x006b5320 CNetLobby_OfferCancel deleting destructor
// @yo2 0x006b5350 the string, then CEasyTask
CNetLobby_OfferCancel::~CNetLobby_OfferCancel() = default;

// @yo2 0x006b5430
bool CNetLobby_OfferCancel::onInit() {
    bind();
    busy = BUSY_IDLE;
    result = 0;
    state = 1;
    return true;
}

// @yo2 0x006b54b0
bool CNetLobby_OfferCancel::onMain() {
    switch (state) {
    case 0:
        state = 1;
        break;
    case 1:
        busy = BUSY_IDLE;
        result = 0;
        break;
    default:
        request(state, busy, result, LB_REQ_CANCELMATCH, 0x13, [this] { lobby->cancelReqMatch(); });
    }
    return true;
}

// @yo2 0x006b5680
bool CNetLobby_OfferCancel::cancel() {
    if (busy != BUSY_IDLE) return false;
    state = 2;
    busy = BUSY_WORKING;
    return true;
}

// @yo2 0x006b55f0
bool CNetLobby_OfferCancel::answered(int k) { return CNetLobbyRequestBase::answered(k); }

// ---- CNetLobby_OfferRoom

// @yo2 0x006b6640
CNetLobby_OfferRoom* CNetLobby_OfferRoom::spawn(CTask* parent) { return spawnUnder<CNetLobby_OfferRoom>(parent); }
// @yo2 0x006b6700
CNetLobby_OfferRoom::CNetLobby_OfferRoom() { setInstName("CNetLobby_OfferRoom"); }
// @yo2 0x006b6860 CNetLobby_OfferRoom deleting destructor
// @yo2 0x006b6890 the password, then CEasyTask
CNetLobby_OfferRoom::~CNetLobby_OfferRoom() = default;

// @yo2 0x006b6970
bool CNetLobby_OfferRoom::onInit() {
    bind();
    busy = BUSY_IDLE;
    result = 0;
    state = 1;
    return true;
}

// @yo2 0x006b6c00 CDuelRoom's player i (0 = owner, 1 = challenger)
static int32_t roomPlayer(const CDuelRoom& r, int i) { return i == 0 ? r.p1 : i == 1 ? r.p2 : 0; }

// @yo2 0x006b69f0
bool CNetLobby_OfferRoom::onMain() {
    switch (state) {
    case 0:
        state = 1;
        break;
    case 1:
        busy = BUSY_IDLE;
        result = 0;
        break;
    case 2:   // the first listed room with that player decides: it must still be the same room
        busy = BUSY_WORKING;
        for (const auto& r : lobby->rooms) {
            if (r->p1 != pid && roomPlayer(*r, 1) != pid) continue;
            if (r->id == room) {
                lobby->reqMatch(room, std::string(password).c_str());
                state = 3;
                return true;
            }
            break;
        }
        result = ROOM_GONE;
        state = 4;
        break;
    case 3:   // done once answered, whatever the answer (matchResult); the UI reads it
        busy = BUSY_WORKING;
        if (lobby->flag(LB_REQ_MATCH) != 2) break;
        lobby->flag(LB_REQ_MATCH) = 0;
        if (lobby->takeResult(&result, 0x10)) {
            state = 5;
            matchResult = result;
        } else {
            state = 4;
        }
        break;
    case 4:
        busy = BUSY_FAILED;
        state = 1;
        break;
    case 5:
        busy = BUSY_DONE;
        state = 1;
        break;
    }
    return true;
}

// @yo2 0x006b6cc0
bool CNetLobby_OfferRoom::offer(int32_t p, int32_t r, const std::string& pw) {
    YO2_ASSERT(p != 0, "プレイヤーＩＤが０だお");   // the player id is 0
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    pid = p;
    password.assign(pw.data(), pw.size());
    state = 2;
    room = r;
    return true;
}

// @yo2 0x006b6c30
bool CNetLobby_OfferRoom::answered(int k) { return CNetLobbyRequestBase::answered(k); }

// ---- CNetLobby_RecvMail

// @yo2 0x006c8b20
CNetLobby_RecvMail* CNetLobby_RecvMail::spawn(CTask* parent) { return spawnUnder<CNetLobby_RecvMail>(parent); }
// @yo2 0x006c8be0
CNetLobby_RecvMail::CNetLobby_RecvMail() { setInstName("CNetLobby_RecvMail"); }
// @yo2 0x006c8d50 CNetLobby_RecvMail deleting destructor
// @yo2 0x006c8d80 the name, then CEasyTask
CNetLobby_RecvMail::~CNetLobby_RecvMail() = default;

// @yo2 0x006c8e00
bool CNetLobby_RecvMail::onInit() {
    bind();
    busy = BUSY_IDLE;
    _90 = 0;
    state = 1;
    return true;
}

// @yo2 0x006c8e80
bool CNetLobby_RecvMail::onMain() {
    // request byte f answered: results[k], 0 = done (0xd), else failed (0xc)
    auto wait = [this](int f, int k) {
        busy = BUSY_WORKING;
        if (lobby->flag(f) != 2) return;
        lobby->flag(f) = 0;
        lobby->takeResult(&result, k);
        state = result == 0 ? 0xd : 0xc;
    };
    switch (state) {
    case 0:
        state = 1;
        break;
    case 1:
        busy = BUSY_IDLE;
        result = 0;
        break;
    case 2:
        busy = BUSY_WORKING;
        lobby->searchFriends();
        state = 3;
        break;
    case 3: wait(LB_REQ_MATCHING, 0x24); break;
    case 4:
        busy = BUSY_WORKING;
        lobby->getPidByName(std::string(name).c_str());
        state = 5;
        break;
    case 5: wait(LB_REQ_PIDBYNAME, 0x25); break;
    case 6:   // nothing sets 6
        busy = BUSY_WORKING;
        state = 7;
        break;
    case 7:
        busy = BUSY_WORKING;
        state = 0xd;
        break;
    case 8:
        busy = BUSY_WORKING;
        lobby->getMailCount();
        state = 9;
        break;
    case 9: wait(LB_REQ_MAILCOUNT, 0x28); break;
    case 10:
        busy = BUSY_WORKING;
        lobby->rcvMail();
        state = 0xb;
        break;
    case 0xb: wait(LB_REQ_RCVMAIL, 0x27); break;
    case 0xc:
        busy = BUSY_FAILED;
        state = 1;
        break;
    case 0xd:
        busy = BUSY_DONE;
        state = 1;
        break;
    }
    return true;
}

// @yo2 0x006c92e0
bool CNetLobby_RecvMail::searchFriends() {
    if (busy != BUSY_IDLE) return false;
    state = 2;
    busy = BUSY_WORKING;
    return true;
}

// @yo2 0x006c9320
bool CNetLobby_RecvMail::getPidByName(const std::string& n) {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    name.assign(n.data(), n.size());
    state = 4;
    return true;
}

// @yo2 0x006c9450
bool CNetLobby_RecvMail::getMailCount() {
    if (busy != BUSY_IDLE) return false;
    state = 8;
    busy = BUSY_WORKING;
    return true;
}

// @yo2 0x006c9490
bool CNetLobby_RecvMail::rcvMail() {
    if (busy != BUSY_IDLE) return false;
    state = 10;
    busy = BUSY_WORKING;
    return true;
}

// @yo2 0x006c9220 like CNetLobbyTask::takeAnswer: request byte 0x1c+k answered -> take results[k]
bool CNetLobby_RecvMail::takeAnswer(int k) {
    switch (k) {
    case 0x10: case 0x11: case 0x12: case 0x13: case 0x15: case 0x1f: case 0x22: case 0x23: case 0x2c: case 0x2d:
    case 0x35: case 0x36: case 0x38: case 0x42:
        if (lobby->flag(0x1c + k) == 2) {
            lobby->flag(0x1c + k) = 0;
            lobby->takeResult(&result, k);
            return true;
        }
    }
    return false;
}

// ---- CNetLobby_ReplyDuel

// @yo2 0x006ca450
CNetLobby_ReplyDuel* CNetLobby_ReplyDuel::spawn(CTask* parent) { return spawnUnder<CNetLobby_ReplyDuel>(parent); }
// @yo2 0x006ca510
CNetLobby_ReplyDuel::CNetLobby_ReplyDuel() { setInstName("CNetLobby_ReplyDuel"); }
// @yo2 0x006ca670 CNetLobby_ReplyDuel deleting destructor
// @yo2 0x006ca6a0 the string, then CEasyTask
CNetLobby_ReplyDuel::~CNetLobby_ReplyDuel() = default;

// @yo2 0x006ca780
bool CNetLobby_ReplyDuel::onInit() {
    bind();
    busy = BUSY_IDLE;
    result = 0;
    state = 1;
    return true;
}

// @yo2 0x006ca800
bool CNetLobby_ReplyDuel::onMain() {
    switch (state) {
    case 0:
        state = 1;
        break;
    case 1:
        busy = BUSY_IDLE;
        result = 0;
        break;
    case 2:
        busy = BUSY_WORKING;
        lobby->matchOfferReply(yes);
        state = 3;
        break;
    case 3:   // 0x4303 has no answer
        busy = BUSY_WORKING;
        state = 5;
        break;
    case 4:
        busy = BUSY_FAILED;
        state = 1;
        break;
    case 5:
        busy = BUSY_DONE;
        state = 1;
        break;
    }
    return true;
}

// @yo2 0x006ca970
bool CNetLobby_ReplyDuel::reply(bool y) {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    yes = y;
    state = 2;
    return true;
}

// @yo2 0x006ca8e0
bool CNetLobby_ReplyDuel::answered(int k) { return CNetLobbyRequestBase::answered(k); }

// ---- CNetLobby_TradeCancel

// @yo2 0x006d0090
CNetLobby_TradeCancel* CNetLobby_TradeCancel::spawn(CTask* parent) { return spawnUnder<CNetLobby_TradeCancel>(parent); }
// @yo2 0x006d0150 (it names itself after the lobby task, as the exe does)
CNetLobby_TradeCancel::CNetLobby_TradeCancel() { setInstName("CNetLobbyTask"); }
// @yo2 0x006d0280 CNetLobby_TradeCancel deleting destructor
// @yo2 0x006d02b0
CNetLobby_TradeCancel::~CNetLobby_TradeCancel() = default;

// @yo2 0x006d02d0
bool CNetLobby_TradeCancel::onInit() {
    bind();
    busy = BUSY_IDLE;
    _8c = 0;
    state = 1;
    return true;
}

// @yo2 0x006d0350
bool CNetLobby_TradeCancel::onMain() {
    switch (state) {
    case 0:
        state = 1;
        break;
    case 1:
        busy = BUSY_IDLE;
        result = 0;
        break;
    default:
        request(state, busy, result, LB_REQ_CANCELTRADE, 0x38, [this] { lobby->cancelReqTrade(); });
    }
    return true;
}

// @yo2 0x006d0520
bool CNetLobby_TradeCancel::cancel() {
    if (busy != BUSY_IDLE) return false;
    state = 2;
    busy = BUSY_WORKING;
    return true;
}

// @yo2 0x006d0490
bool CNetLobby_TradeCancel::answered(int k) { return CNetLobbyRequestBase::answered(k, true); }
