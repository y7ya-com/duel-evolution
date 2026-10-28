// CNetLobbyTask (the exe's src\Net\yo2NetLobbyTask.cpp).
#include <ctime>

#include "NetTasks.h"

static int32_t now() { return (int32_t)time(nullptr); }

// @yo2 0x006d15a0
CNetLobbyTask::CNetLobbyTask() { setTaskName("CNetLobbyTask"); }

// @yo2 0x006d1710 CNetLobbyTask deleting destructor
// @yo2 0x006d1740 the name string goes, then CEasyTask
CNetLobbyTask::~CNetLobbyTask() = default;

// @yo2 0x006d14e0 create under parent (priority 10000)
CNetLobbyTask* CNetLobbyTask::spawn(CTask* parent) {
    return dynamic_cast<CNetLobbyTask*>((new CNetLobbyTask)->create(parent, 10000));
}

// @yo2 0x006d17c0
bool CNetLobbyTask::onInit() {
    gate = appNetGate();
    acc = appNetAccount();
    duelConn = appNetDuel();
    lobby = appNetLobby();
    busy = BUSY_IDLE;
    _90 = 0;
    state = IDLE;
    return true;
}

// The requests: only while idle.
bool CNetLobbyTask::start(int32_t target) {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    state = target;
    return true;
}

// @yo2 0x006d3ca0 connect to the lobby server (rgn, rank, area) of the gate list
bool CNetLobbyTask::connect(uint8_t rgn, uint8_t rank, uint8_t area) {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    lobby->rgn = rgn;
    lobby->rank = rank;
    lobby->area = area;
    state = CONNECT;
    return true;
}

// @yo2 0x006d3a50 connect to a My Room lobby (kind 3, lang 0, rank 12): a random area of those listed (0-7), or
// appMyRoomArea() when that's set (a random one is drawn anyway)
// @yo2 0x006d4720 vector<CServerInfo*>::insert (std::vector, in randomLobbyArea)
// @yo2 0x006d4930 vector<CServerInfo*>::size
// @yo2 0x006d4960 the element destructor range (pointers: nothing)
// @yo2 0x006d4980 uninitialized_copy
// @yo2 0x006d49c0 uninitialized_fill_n
// @yo2 0x006d4a00 construct
bool CNetLobbyTask::connectMyRoom() {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    int32_t area = randomLobbyArea(0, 12);
    if (area < 0) return false;   // the exe leaves busy at 1 here
    if (appMyRoomArea() >= 0) area = appMyRoomArea();
    lobby->rgn = 0;
    lobby->rank = 12;
    lobby->area = (uint8_t)area;
    lobby->block = 0;
    lobby->blockChange = 0;
    state = CONNECT;
    return true;
}

// @yo2 0x006d3d50
bool CNetLobbyTask::enterBlock(uint8_t block, uint8_t change) {
    if (busy != BUSY_IDLE) return false;
    busy = BUSY_WORKING;
    lobby->block = block;
    lobby->blockChange = change;
    state = ENTERBLOCK;
    return true;
}

// @yo2 0x006d3d10
bool CNetLobbyTask::regAvatar() { return start(REGAVATAR); }
// @yo2 0x006d3de0 LIST1-5, the room list and the NPC info list
bool CNetLobbyTask::reqLists() { return start(LISTS); }
// @yo2 0x006d3e20
bool CNetLobbyTask::reqLists2() { return start(LISTS); }
// @yo2 0x006d3ef0
bool CNetLobbyTask::resetAutoWait() { return start(RESETAUTOWAIT); }
// @yo2 0x006d4020
bool CNetLobbyTask::searchFriends() { return start(MATCHFRIENDS); }
// @yo2 0x006d4190
bool CNetLobbyTask::getMailCount() { return start(MAILCOUNT); }
// @yo2 0x006d41d0
bool CNetLobbyTask::rcvMail() { return start(RCVMAIL); }
// @yo2 0x006d42b0
bool CNetLobbyTask::tradeReady() { return start(TRADEREADY); }
// @yo2 0x006d42f0
bool CNetLobbyTask::tradeStart() { return start(TRADESTART); }
// @yo2 0x006d4530
bool CNetLobbyTask::tradeUserExit() { return start(TRADEEXIT); }
// @yo2 0x006d4570
bool CNetLobbyTask::arriveTradeCard() { return start(TRADEARRIVE); }
// @yo2 0x006d45b0
bool CNetLobbyTask::tradeClear() { return start(TRADECLEAR); }
// @yo2 0x006d45f0 wait for the duel server's address (0x4306 after an abort), then connect
bool CNetLobbyTask::duelAfterAbort() { return start(DUEL_AFTER_ABORT); }
// @yo2 0x006d4630 connect to the duel server at duelIp:duelPort, booked check, deck
bool CNetLobbyTask::duel() { return start(DUEL); }
// @yo2 0x006d4670 connect to the duel server and watch
bool CNetLobbyTask::watchDuel() { return start(WATCH_DUEL); }

// Setters that keep an argument for the state that sends it. The exe sets busy before or after the argument;
// nothing runs in between.
// @yo2 0x006d3ea0
bool CNetLobbyTask::matchOfferReply(bool yes) { return busy == BUSY_IDLE && (matchYes = yes, start(MATCHREPLY)); }
// @yo2 0x006d3f30
bool CNetLobbyTask::reqWatch(uint32_t room) { return busy == BUSY_IDLE && (watchRoom = room, start(WATCH)); }
// @yo2 0x006d3f80
bool CNetLobbyTask::reqFriend(uint32_t pid) { return busy == BUSY_IDLE && (friendPid = pid, start(FRIEND)); }
// @yo2 0x006d3fd0
bool CNetLobbyTask::friendOfferReply(uint32_t pid, int32_t answer) {
    if (busy != BUSY_IDLE) return false;
    offerPid = pid;
    offerAnswer = answer;
    return start(FRIENDREPLY);
}
// @yo2 0x006d4060
bool CNetLobbyTask::getPidByName(const std::string& name) {
    if (busy != BUSY_IDLE) return false;
    searchName.assign(name.data(), name.size());
    return start(PIDBYNAME);
}
// @yo2 0x006d4210
bool CNetLobbyTask::reqAddBlack(uint32_t pid) { return busy == BUSY_IDLE && (addBlackPid = pid, start(ADDBLACK)); }
// @yo2 0x006d4260
bool CNetLobbyTask::reqDelBlack(uint32_t pid) { return busy == BUSY_IDLE && (delBlackPid = pid, start(DELBLACK)); }
// @yo2 0x006d4330
bool CNetLobbyTask::reqTrade(uint32_t pid) { return busy == BUSY_IDLE && (tradePid = pid, start(TRADE)); }
// @yo2 0x006d4380
bool CNetLobbyTask::tradeOfferReply(bool yes) { return busy == BUSY_IDLE && (tradeYes = yes, start(TRADEREPLY)); }
// @yo2 0x006d43d0
bool CNetLobbyTask::tradeAddCard(int16_t card) { return busy == BUSY_IDLE && (addCard = card, start(TRADEADD)); }
// @yo2 0x006d4420
bool CNetLobbyTask::tradeDeleteCard(int16_t card) {
    return busy == BUSY_IDLE && (delCard = card, start(TRADEDEL));
}
// @yo2 0x006d4470
bool CNetLobbyTask::setTradeStatus(uint8_t s) { return busy == BUSY_IDLE && (tradeStatus = s, start(TRADESTATUS)); }
// @yo2 0x006d44c0
bool CNetLobbyTask::tradeLastConfirm(uint8_t a, const int32_t* mine, const int32_t* theirs) {
    if (busy != BUSY_IDLE) return false;
    confirmA = a;
    confirmMine = mine;
    confirmTheirs = theirs;
    return start(TRADECONFIRM);
}

// Messages that need no task state: sent at once.
// @yo2 0x006d46b0
bool CNetLobbyTask::sendMove(uint32_t pid, uint16_t x, uint16_t y, uint8_t dir, uint8_t b) {
    lobby->sendMove(pid, x, y, dir, b);
    return true;
}
// @yo2 0x006d46f0
bool CNetLobbyTask::send5310(uint32_t pid, uint8_t a, uint8_t b) {
    lobby->send5310(pid, a, b);
    return true;
}

// @yo2 0x006d3990 the answers the lobby UI waits for itself: request byte 0x1c+k answered -> take results[k]
bool CNetLobbyTask::takeAnswer(int k) {
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

// @yo2 0x006d3950
const char* CNetLobbyTask::duelIp() const { return lobby->duelIp; }
// @yo2 0x006d3970
uint16_t CNetLobbyTask::duelPort() const { return lobby->duelPort; }

// Request byte f answered: take results[k]; 0 (or any r >= 0) is done, the rest failed.
void CNetLobbyTask::finishOn(int f, int k, bool nonNegativeOk) {
    if (lobby->flag(f) != 2) return;
    lobby->flag(f) = 0;
    lobby->takeResult(&result, k);
    state = (nonNegativeOk ? result >= 0 : result == 0) ? DONE : FAILED;
}

// After every duel step: the duel server's 0x649b code, or the ND 0x20 bit, ends it; code 4 = refused.
void CNetLobbyTask::checkDuelServer() {
    uint8_t& code = duelSvrCode(duelConn);
    uint8_t c = code;
    if ((c == 0 || duelLast(duelConn) != -1) && !(duelState(duelConn) & 0x20)) return;
    code = 0;
    if (c == 4) {
        result = RESULT_DUEL_REFUSED;
        state = FAILED;
        duelIo(duelConn).disconnect();
    }
}

// @yo2 0x006d1840 one step per frame
bool CNetLobbyTask::onMain() {
    if (state >= CONNECT && state < FAILED) busy = BUSY_WORKING;
    CPlayerInfo* me = acc->me.player(acc->me.activeSlot);
    switch (state) {
    case START:
        state = IDLE;
        break;
    case IDLE:
        busy = BUSY_IDLE;
        result = 0;
        break;

    case CONNECT:
        lobby->ensureConn();
        lobby->notify = appWindowHandle();
        result = lobby->connect(gate);
        if (result != 0) {
            state = FAILED;
            break;
        }
        state = WAIT_CONNECT;
        connectStart = now();
        break;
    case WAIT_CONNECT:
        if (int32_t s = lobby->state(); s == YGC_CONNECTED) {
            lobby->select(appWindowHandle());
            state = HELLO;
        } else if (s == YGC_FAILED) {
            lobby->disconnect();
            result = RESULT_CONNECT_FAILED;
            state = FAILED;
        }
        break;
    case HELLO:
        lobby->sendHello();
        state = WAIT_HELLO;
        break;
    case WAIT_HELLO:   // 0x3002; connect() cleared authOk, so it set again by now = failed
        if (lobby->flag(LB_REQ_HELLO) == 2) {
            lobby->flag(LB_REQ_HELLO) = 0;
            if (lobby->authOk == 0) {
                state = AUTH;
            } else {
                busy = BUSY_FAILED;
                state = FAILED;
            }
        }
        break;
    case AUTH:
        lobby->sendAuth(*acc);
        state = WAIT_AUTH;
        break;
    case WAIT_AUTH:
        if (lobby->flag(LB_REQ_AUTH) == 2) {
            lobby->flag(LB_REQ_AUTH) = 0;
            state = lobby->takeResult(&result, 1) ? PSELECT : FAILED;
        }
        break;
    case PSELECT: {
        std::vector<uint32_t> deck = appPSelectDeck();
        lobby->reqPSelect(appLanguage(), acc->me.activeSlot, deck.data(), (int)deck.size());
        state = BLOCKLIST;
        break;
    }
    case BLOCKLIST:
        lobby->reqBlockList();
        state = WAIT_BLOCKLIST;
        break;
    case WAIT_BLOCKLIST:
        if (lobby->flag(LB_REQ_BLOCKLIST) == 2) {
            lobby->flag(LB_REQ_BLOCKLIST) = 0;
            state = ENTERBLOCK;
        }
        break;
    case ENTERBLOCK:
        lobby->reqEnterBlock(lobby->block, lobby->blockChange);
        state = WAIT_ENTERBLOCK;
        break;
    case WAIT_ENTERBLOCK:
        if (lobby->flag(LB_REQ_ENTERBLOCK) != 2) break;
        lobby->flag(LB_REQ_ENTERBLOCK) = 0;
        state = lobby->takeResult(&result, 4) && result == 0 ? REGAVATAR : FAILED;
        break;

    // The avatar's clothes for this world; in My Room (rank 12) both worlds', the other one first.
    case REGAVATAR: {
        int32_t w = appClothType();
        YO2_ASSERT(w == 0 || w == 1, "AVA_CLOTH_TYPE error!");
        if (lobby->rank == 12) w = w == 0;
        lobby->regAvatarInfo(w, me->avatar[w].bytes_, 0);
        state = WAIT_REGAVATAR;
        break;
    }
    case WAIT_REGAVATAR:
        if (lobby->flag(LB_REQ_REGAVATAR) == 2) {
            lobby->flag(LB_REQ_REGAVATAR) = 0;
            state = lobby->rank == 12 ? REGAVATAR2 : DONE;
        }
        break;
    case REGAVATAR2: {
        int32_t w = appClothType();
        YO2_ASSERT(w == 0 || w == 1, "AVA_CLOTH_TYPE error!");
        lobby->regAvatarInfo(w, me->avatar[w].bytes_, 0);
        state = WAIT_REGAVATAR2;
        break;
    }
    case WAIT_REGAVATAR2:
        if (lobby->flag(LB_REQ_REGAVATAR) == 2) {
            lobby->flag(LB_REQ_REGAVATAR) = 0;
            state = DONE;
        }
        break;

    // One message each, then its answer.
    case MATCHREPLY:
        lobby->matchOfferReply(matchYes);
        state = MATCHREPLY + 1;
        break;
    case MATCHREPLY + 1:
    case NOTHING + 1:
        state = DONE;
        break;
    case RESETAUTOWAIT:
        lobby->resetAutoWait();
        state = RESETAUTOWAIT + 1;
        break;
    case RESETAUTOWAIT + 1: finishOn(LB_REQ_RESETAUTOWAIT, 0x20); break;
    case WATCH:
        lobby->reqWatch(watchRoom);
        state = WATCH + 1;
        break;
    case WATCH + 1: finishOn(LB_REQ_WATCH, 0x16); break;
    case FRIEND:
        lobby->reqFriend(friendPid);
        state = FRIEND + 1;
        break;
    case FRIEND + 1: finishOn(LB_REQ_FRIEND, 0x21); break;
    case FRIENDREPLY:
        lobby->friendOfferReply(offerPid, offerAnswer);
        state = FRIENDREPLY + 1;
        break;
    case FRIENDREPLY + 1:
        state = DONE;
        break;
    case MATCHFRIENDS:
        lobby->searchFriends();   // sends nothing: the wait below ends with someone else's 0x3603
        state = MATCHFRIENDS + 1;
        break;
    case MATCHFRIENDS + 1: finishOn(LB_REQ_MATCHING, 0x24); break;
    case PIDBYNAME:
        lobby->getPidByName(std::string(searchName).c_str());
        state = PIDBYNAME + 1;
        break;
    case PIDBYNAME + 1: finishOn(LB_REQ_PIDBYNAME, 0x25); break;
    case NOTHING:
        state = NOTHING + 1;
        break;
    case MAILCOUNT:
        lobby->getMailCount();
        state = MAILCOUNT + 1;
        break;
    case MAILCOUNT + 1: finishOn(LB_REQ_MAILCOUNT, 0x28); break;
    case RCVMAIL:
        lobby->rcvMail();
        state = RCVMAIL + 1;
        break;
    case RCVMAIL + 1: finishOn(LB_REQ_RCVMAIL, 0x27); break;
    case ADDBLACK:
        lobby->reqAddBlack(addBlackPid);
        state = ADDBLACK + 1;
        break;
    case ADDBLACK + 1: finishOn(LB_REQ_ADDBLACK, 0x2a); break;
    case DELBLACK:
        lobby->reqDelBlack(delBlackPid);
        state = DELBLACK + 1;
        break;
    case DELBLACK + 1: finishOn(LB_REQ_DELBLACK, 0x2b); break;
    case TRADE:
        lobby->reqTrade(tradePid);
        state = TRADE + 1;
        break;
    case TRADE + 1:   // done unless refused (-493); a pending result fails
        if (lobby->flag(LB_REQ_TRADE) != 2) break;
        lobby->flag(LB_REQ_TRADE) = 0;
        if (lobby->takeResult(&result, 0x34)) {
            tradeResult = result;
            state = result != TRADE_REFUSED ? DONE : FAILED;
        } else {
            state = FAILED;
        }
        break;
    case TRADEREPLY:
        lobby->tradeOfferReply(tradeYes);
        state = TRADEREPLY + 1;
        break;
    case TRADEREPLY + 1: finishOn(LB_REQ_TRADEOFFERREPLY, 0x36); break;
    case TRADEREADY:
        lobby->tradeReady();
        state = TRADEREADY + 1;
        break;
    case TRADEREADY + 1: finishOn(LB_REQ_TRADEREADY, 0x32); break;
    case TRADESTART:
        lobby->tradeStart();
        state = TRADESTART + 1;
        break;
    case TRADESTART + 1: finishOn(LB_REQ_TRADESTART, 0x33); break;
    case TRADEADD:
        lobby->tradeAddCard(addCard);
        state = TRADEADD + 1;
        break;
    case TRADEADD + 1: finishOn(LB_REQ_TRADECARD, 0x3a); break;
    case TRADEDEL:
        lobby->tradeDeleteCard(delCard);
        state = TRADEDEL + 1;
        break;
    case TRADEDEL + 1: finishOn(LB_REQ_TRADECARD2, 0x3b); break;
    case TRADESTATUS:
        lobby->setTradeStatus(tradeStatus);
        state = TRADESTATUS + 1;
        break;
    case TRADESTATUS + 1: finishOn(LB_REQ_TRADESTATUS, 0x3e); break;
    case TRADECONFIRM:
        lobby->tradeLastConfirm(confirmA, confirmMine, confirmTheirs);
        state = TRADECONFIRM + 1;
        break;
    case TRADECONFIRM + 1: finishOn(LB_REQ_TRADECONFIRM, 0x40); break;
    case TRADEEXIT:
        lobby->tradeUserExit();
        state = TRADEEXIT + 1;
        break;
    case TRADEEXIT + 1: finishOn(LB_REQ_TRADEEXIT, 0x42); break;
    case TRADEARRIVE:
        lobby->arriveTradeCard();
        state = TRADEARRIVE + 1;
        break;
    case TRADEARRIVE + 1: finishOn(0x60, 0x44); break;
    case TRADECLEAR:
        lobby->tradeClear();
        state = TRADECLEAR + 1;
        break;
    case TRADECLEAR + 1: finishOn(LB_REQ_TRADECLEAR, 0x45); break;

    // LIST1-4, LIST5 and the room list (not in the tournament lobby, rank 8), the NPC info list.
    case LISTS:
        lobby->reqList1(-1);
        state = LISTS + 1;
        break;
    case LISTS + 1:
        if (lobby->flag(LB_REQ_LIST1) != 2) break;
        lobby->flag(LB_REQ_LIST1) = 0;
        lobby->reqList2(-1);
        state = LISTS + 2;
        break;
    case LISTS + 2:
        if (lobby->flag(LB_REQ_LIST2) != 2) break;
        lobby->flag(LB_REQ_LIST2) = 0;
        lobby->reqList3(-1);
        state = LISTS + 3;
        break;
    case LISTS + 3:
        if (lobby->flag(LB_REQ_LIST3) != 2) break;
        lobby->flag(LB_REQ_LIST3) = 0;
        lobby->reqList4(-1);
        state = LISTS + 4;
        break;
    case LISTS + 4:
        if (lobby->flag(LB_REQ_LIST4) != 2) break;
        lobby->flag(LB_REQ_LIST4) = 0;
        if (lobby->rank == 8) {
            state = ROOMLIST;
        } else {
            lobby->reqList5(-1);
            state = LISTS + 5;
        }
        break;
    case LISTS + 5:
        if (lobby->flag(LB_REQ_LIST5) != 2) break;
        lobby->flag(LB_REQ_LIST5) = 0;
        state = ROOMLIST;
        break;
    case ROOMLIST:
        if (lobby->rank != 8) {
            lobby->reqDuelRoomList(-1);
            state = ROOMLIST + 1;
        } else {
            state = NPCINFO;
        }
        break;
    case ROOMLIST + 1:
        finishOn(LB_REQ_ROOMLIST, 0xd, true);
        if (state == DONE) state = NPCINFO;
        break;
    case NPCINFO:
        lobby->reqNpcInfoList();
        state = NPCINFO + 1;
        break;
    case NPCINFO + 1: finishOn(LB_REQ_NPCINFOLIST, 0x64, true); break;

    // The duel server: connect, then a booked check and the deck (duel) or 0x6700 (watch).
    case DUEL_AFTER_ABORT:
        if (lobby->flag(LB_REQ_DUELSERVER) == 2) {
            lobby->flag(LB_REQ_DUELSERVER) = 0;
            lobby->clearDuelAbort();
            state = DUEL_CONNECT;
        }
        break;
    case DUEL:
        state = DUEL_CONNECT;
        break;
    case WATCH_DUEL:
        state = WATCH_CONNECT;
        break;
    case DUEL_CONNECT:
    case WATCH_CONNECT: {
        CMessageIOBase& io = duelIo(duelConn);
        io.ensureConn();
        io.notify = appWindowHandle();
        if (duelConnect(duelConn, gate, duelIp(), duelPort()) == 0)
            state = state == WATCH_CONNECT ? WATCH_WAIT_CONNECT : DUEL_WAIT_CONNECT;
        else
            YO2_ASSERT(false, "LB_DUEL_CONNECT_ERROR");
        break;
    }
    case DUEL_WAIT_CONNECT:
    case WATCH_WAIT_CONNECT: {
        CMessageIOBase& io = duelIo(duelConn);
        if (int32_t s = io.state(); s == YGC_CONNECTED) {
            io.select(appWindowHandle());
            if (state == WATCH_WAIT_CONNECT) {
                duelSendWatch(duelConn);
                state = WATCH_WAIT;
            } else {
                duelSendBookedCheck(duelConn, me->pid);
                state = DUEL_WAIT_BOOKED;
            }
        } else if (s == YGC_FAILED) {
            YO2_ASSERT(false, "LB_DUEL_CONNECT_WAIT_ERROR %d %s %d", s, duelIp(), duelPort());
            io.disconnect();
        }
        checkDuelServer();
        break;
    }
    case DUEL_WAIT_BOOKED:
        if (duelAnswered(duelConn, 0)) {
            if (duelBooked(duelConn))
                state = DUEL_DECK;
            else
                YO2_ASSERT(false, "LB_DUEL_BOOKEDCHECK_WAIT_ERROR");
        }
        checkDuelServer();
        break;
    case DUEL_DECK:
        duelSendMyDeck(duelConn);
        duelSendPrepare(duelConn);
        state = DUEL_WAIT_DECK;
        break;
    case DUEL_WAIT_DECK:
        if (duelAnswered(duelConn, 1)) state = DONE;
        checkDuelServer();
        break;
    case WATCH_WAIT:
        if (duelAnswered(duelConn, 6)) state = DONE;
        checkDuelServer();
        break;

    case FAILED:
        busy = BUSY_FAILED;
        state = IDLE;
        break;
    case DONE:
        busy = BUSY_DONE;
        state = IDLE;
        break;
    }
    return true;
}
