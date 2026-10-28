// CNetLobby: friends, black list, teams, mail, maintenance/event notices, trades (yo2NetLobby_Parse.cpp,
// 0x006bc860..0x006bfc80) and SENDMAIL.
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <ctime>

#include "NetLobby.h"
#include "NetLobby_Shop.h"
#include "NetLobby_Social.h"

static int32_t now() { return (int32_t)time(nullptr); }   // FUN_00b0c488(0)

static int32_t readS32(CNetLobby* l, int32_t* dst, int req) {
    YgPacket* p = l->in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)dst);
    ygEndRead(p);
    if (req) l->flag(req) = 2;
    return *dst;
}

static int32_t ownPid(CNetAccount& acc) {   // the selected character's pid (account +0x18ec / +0x124c)
    CPlayerInfo* me = acc.me.player(acc.me.activeSlot);
    return me ? me->pid : 0;   // fix: the exe reads through a null record for a slot >= 4
}

// @yo2 0x006adf50 text filter for chat / mail text: a plain copy in this build
void lobbyTextFilter(int32_t, const char* in, char* out) { strcpy(out, in); }

// ---- friends

// @yo2 0x006bc860 0x4511 YG_MSG_REQFRIENDRESULT
void CNetLobby::onReqFriendResult() { readS32(this, &reqFriendResult, LB_REQ_FRIEND); }

// @yo2 0x006bc8a0 0x4512 YG_MSG_FRIENDOFFER: u32 pid, 16 B name, u8 level; queued unless black-listed or already queued
// @yo2 0x006c3860 append a blank CFriendApply
void CNetLobby::onFriendOffer() {
    YgPacket* p = in();
    uint32_t pid;
    char name[17];
    uint8_t level;
    ygBeginRead(p);
    ygGet32(p, &pid);
    ygGetBytes(p, name, 16);
    ygGet8(p, &level);
    ygEndRead(p);
    if (lobbyIsBlacklisted((int32_t)pid)) return;
    for (const CFriendApply& f : friendOffers)
        if (f.pid == (int32_t)pid) return;
    // The exe keeps a VC6 vector<smart_ptr<CFriendApply>> (CNetLobby+0x13a0); std::vector by value here:
    // @yo2 0x006c6360 vector<smart_ptr<CFriendApply>>::_Insert_n
    // @yo2 0x006c3c90 smart_ptr<CFriendApply>::~smart_ptr
    // @yo2 0x006c7640 construct(smart_ptr<CFriendApply>*, smart_ptr&)
    // @yo2 0x006c7b30 smart_ptr<CFriendApply>::operator=
    // @yo2 0x006c3940 CFriendApply deleting destructor (its only virtual; nothing to free)
    friendOffers.push_back(CFriendApply{});
    CFriendApply& f = friendOffers.back();
    f.pid = (int32_t)pid;
    strcpy(f.name, name);
    f.level = level;
    flag(LB_REQ_FRIENDOFFER) = 2;
}

// @yo2 0x006bcc30 a player's name as a string (FRIENDNOTICE builds one for the own record and never uses it)
std::string playerNameString(const CPlayerInfo& p) { return std::string(p.name); }

// @yo2 0x006bc9c0 0x4515 YG_MSG_FRIENDNOTICE: s32 1 = accepted, u32 pid, 16 B name
void CNetLobby::onFriendNotice() {
    YgPacket* p = in();
    uint32_t accepted, pid;
    char name[17];
    ygBeginRead(p);
    ygGet32(p, &accepted);
    ygGet32(p, &pid);
    ygGetBytes(p, name, 16);
    ygEndRead(p);
    if (accepted == 1) {
        lobbyAddFriend((int32_t)pid, name);
        friendPid = (int32_t)pid;
        friendAccepted = 1;
        friendName = name;
    } else {
        friendAccepted = 0;
        friendPid = 0;
        friendName.clear();
    }
    flag(LB_REQ_FRIENDNOTICE) = 2;
}

// @yo2 0x006bcd40 0x4521 YG_MSG_REQFRIENDSEARCHRESULT: s32; if 0, (u32, u16) records the exe reads and drops
void CNetLobby::onFriendSearchResult() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&friendSearchResult);
    if (friendSearchResult == 0) {
        while (ygReadPos(p) != -1) {
            uint32_t a;
            uint16_t b;
            ygGet32(p, &a);
            ygGet16(p, &b);
        }
    }
    ygEndRead(p);
    flag(LB_REQ_FRIENDSEARCH) = 2;
}

// @yo2 0x006bcf10 0x4501 YG_MSG_GETPIDBYPNAMERESULT: s32; if 0, the pid
void CNetLobby::onPidByNameResult() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, (uint32_t*)&pidByNameResult);
    if (pidByNameResult == 0) ygGet32(p, (uint32_t*)&pidByName);
    else pidByName = 0;
    ygEndRead(p);
    flag(LB_REQ_PIDBYNAME) = 2;
}

// @yo2 0x006bf210 0x4531 YG_MSG_ADDBLACKRESULT
void CNetLobby::onAddBlackResult() { readS32(this, &addBlackResult, LB_REQ_ADDBLACK); }
// @yo2 0x006bf250 0x4541 YG_MSG_DELBLACKRESULT
void CNetLobby::onDelBlackResult() { readS32(this, &delBlackResult, LB_REQ_DELBLACK); }

// ---- teams

// @yo2 0x006bcfa0 0x4551 YG_MSG_TEAMCREATERESULT (no flag: the sender waits for 0x4566)
void CNetLobby::onTeamCreateResult() { readS32(this, &teamCreateResult, 0); }
// @yo2 0x006bd020 0x4566 YG_MSG_TEAMCREATERESULTEND
void CNetLobby::onTeamCreateResultEnd() { readS32(this, &teamCreateEnd, LB_REQ_TEAMCREATE); }
// @yo2 0x006bd070 0x4563 YG_MSG_TEAMCREATE_NOTICE: the exe's handler is empty
void CNetLobby::onTeamCreateNotice() {}

// @yo2 0x006bd090 0x4560 YG_MSG_TEAMDISBAND_NOTICE: u32 team; a system line in the team chat
void CNetLobby::onTeamDisbandNotice() {
    int32_t team;
    readS32(this, &team, 0);
    lobbyTeamChat(0x14cf, nullptr);
}

// @yo2 0x006bd220 0x4553 YG_MSG_TEAMDISBANDRESULT: the member list goes, and the request byte gets 0x69 (sic)
void CNetLobby::onTeamDisbandResult() {
    readS32(this, &teamDisbandResult, 0);
    teamMembers.clear();
    myTeamAuthority = 0;
    flag(LB_REQ_TEAMDISBAND) = 0x69;   // the exe writes 'i', not 2: a sender waiting for 2 never sees it
}

// @yo2 0x006bd300 0x4567 YGM_MSG_TEAMJOIN_APPY: u32 applicant, 16 B name, u32 leader, 16 B name; one per leader
void CNetLobby::onTeamJoinApply() {
    YgPacket* p = in();
    uint32_t applicant, leader;
    char applicantName[17], leaderName[17];
    ygBeginRead(p);
    ygGet32(p, &applicant);
    ygGetBytes(p, applicantName, 16);
    ygGet32(p, &leader);
    ygGetBytes(p, leaderName, 16);
    ygEndRead(p);
    for (const TeamApplication& a : joinApplications)
        if (a.leader == (int32_t)leader) return;
    // @yo2 0x006c4b90 vector<TeamApplication>::_Insert_n (0x28-byte records, two strings)
    // @yo2 0x006c73c0 uninitialized_copy of TeamApplication
    joinApplications.push_back({(int32_t)applicant, (int32_t)leader, applicantName, leaderName});
    joinApplied = 1;
}

static void teamNotice(CNetLobby* l, int32_t* pid, char name[17]) {
    YgPacket* p = l->in();
    uint32_t team;
    ygBeginRead(p);
    ygGet32(p, &team);
    ygGet32(p, (uint32_t*)pid);
    ygGetBytes(p, name, 16);
    ygEndRead(p);
}

static void dropMember(CNetLobby* l, int32_t pid) {
    auto it = std::find_if(l->teamMembers.begin(), l->teamMembers.end(), [&](const TeamMember& m) { return m.pid == pid; });
    // @yo2 0x006c7a20 TeamMember destroy, for the last element vector::erase leaves (leave / banish notices)
    if (it != l->teamMembers.end()) l->teamMembers.erase(it);
}

// @yo2 0x006bd610 0x4561 YG_MSG_TEAMJOIN_NOTICE: u32 team, u32 pid, 16 B name; chat line + new member (authority 0)
void CNetLobby::onTeamJoinNotice() {
    int32_t pid;
    char name[17];
    teamNotice(this, &pid, name);
    lobbyTeamChat(0x14cc, name);
    teamMembers.push_back({pid, name, 0});
}

// @yo2 0x006bd9f0 0x4562 YG_MSG_TEAMBANISH_NOTICE: chat line, the member leaves the list
void CNetLobby::onTeamBanishNotice() {
    int32_t pid;
    char name[17];
    teamNotice(this, &pid, name);
    lobbyTeamChat(0x14cd, name);
    dropMember(this, pid);
}

// @yo2 0x006bddd0 0x4570 YG_MSG_TEAMLEAVE_NOTICE
void CNetLobby::onTeamLeaveNotice() {
    int32_t pid;
    char name[17];
    teamNotice(this, &pid, name);
    lobbyTeamChat(0x14ce, name);
    dropMember(this, pid);
}

// @yo2 0x006be190 0x4559 YG_MSG_TEAMLISTRESULT: (u32 pid, 16 B name, u8 authority) records; ours sets our authority
void CNetLobby::onTeamList(CNetAccount& acc) {
    int32_t me = ownPid(acc);
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) != -1) {
        uint32_t pid;
        char name[17];
        uint8_t authority;
        ygGet32(p, &pid);
        ygGetBytes(p, name, 16);
        ygGet8(p, &authority);
        if ((int32_t)pid == me) myTeamAuthority = authority;
        // @yo2 0x006c4790 vector<TeamMember>::_Insert_n (0x18-byte records; also the join notice's push_back)
        // @yo2 0x006c7200 uninitialized_copy of TeamMember
        teamMembers.push_back({(int32_t)pid, name, authority});
    }
    ygEndRead(p);
}

// @yo2 0x006be3e0 0x4564 YG_MSG_TEAMLISTRESULT_BEGIN: s32 members, u32 team id, 16 B name, 16 B code
void CNetLobby::onTeamListBegin(CNetAccount& acc) {
    YgPacket* p = in();
    uint32_t members, team;
    char name[17], code[17];
    ygBeginRead(p);
    ygGet32(p, &members);
    ygGet32(p, &team);
    ygGetBytes(p, name, 16);
    ygGetBytes(p, code, 16);
    ygEndRead(p);
    inTeam = members != 0;
    teamName = name;
    COnlinePlayer* r = findPlayer(ownPid(acc));
    if (!r) return;   // as in the exe: without our own record the old member list stays
    r->teamId = team;
    strncpy(r->teamName, name, sizeof r->teamName);
    memcpy(r->teamCode, code, 16);   // FUN_00ad7ed0
    r->teamCode[16] = 0;
    r->teamCodeNum = (int32_t)atol(r->teamCode);
    teamMembers.clear();
}

// @yo2 0x006be6e0 0x4565 YG_MSG_TEAMLISTRESULT_END
void CNetLobby::onTeamListEnd() {
    readS32(this, &teamListEnd, LB_REQ_TEAMLIST);
    playersChanged = 1;
}

// @yo2 0x006be750 0x4571 YG_MSG_TEAM_UPDATE: u32 pid, u32 team id, 16 B name, 16 B code for one player in the block
void CNetLobby::onTeamUpdate(CNetAccount& acc) {
    YgPacket* p = in();
    uint32_t pid, team;
    char name[17], code[17];
    ygBeginRead(p);
    ygGet32(p, &pid);
    ygGet32(p, &team);
    ygGetBytes(p, name, 16);
    ygGetBytes(p, code, 16);
    ygEndRead(p);
    COnlinePlayer* r = findPlayer((int32_t)pid);
    if (!r) return;
    r->teamId = team;
    strncpy(r->teamName, name, sizeof r->teamName);
    memcpy(r->teamCode, code, 16);
    r->teamCode[16] = 0;
    r->teamCodeNum = (int32_t)atol(r->teamCode);
    if ((int32_t)pid == ownPid(acc)) {
        teamName = name;
        inTeam = team != 0;
    }
    playersChanged = 1;
    lobbyTeamRefresh();
}

// ---- mail

// @yo2 0x006be9c0 0x4601 YG_MSG_SENDMAILRESULT
void CNetLobby::onSendMailResult() { readS32(this, &sendMailResult, LB_REQ_SENDMAIL); }

// @yo2 0x006bea00 0x4603 YG_MSG_SHORTMAILNOTICE: new mail
void CNetLobby::onShortMailNotice() {
    newMail = 1;
    flag(LB_REQ_SHORTMAIL) = 2;
}

// @yo2 0x006bea20 0x4621 YG_MSG_GETMAILCOUNTRESULT
void CNetLobby::onMailCount() {
    readS32(this, &mailCount, LB_REQ_MAILCOUNT);
    if (mailCount > 0) newMail = 1;
}

// @yo2 0x006bea70 0x4611 YG_MSG_RCVMAILLISTSTART: a non-zero value ends the wait at once
void CNetLobby::onMailListStart() {
    readS32(this, &mailListResult, 0);
    if (mailListResult != 0) flag(LB_REQ_RCVMAIL) = 2;
}

// @yo2 0x006bf0d0 the mail record's destructor (its five strings)
LobbyMail::~LobbyMail() {}

// @yo2 0x006cd840
std::string LobbyMail::subjectText() const { return subject; }
// @yo2 0x006cd9c0
std::string LobbyMail::bodyText() const { return body; }
// @yo2 0x006cdb40
std::string LobbyMail::extraText() const { return extra; }

// @yo2 0x006beac0 0x4612 YG_MSG_RCVMAILLISTDATA, one mail (653 B): u32 from, 16 B, u32 to, 16 B, s32 date,
// 32 B subject, 512 B body, 64 B extra, u8 read
void CNetLobby::onMailListData() {
    YgPacket* p = in();
    uint32_t from, to, sent;
    char fromName[17], toName[17];
    char subject[33] = {}, body[0x201] = {}, extra[0x41] = {};
    uint8_t read = 0;
    ygBeginRead(p);
    ygGet32(p, &from);
    ygGetBytes(p, fromName, 16);
    ygGet32(p, &to);
    ygGetBytes(p, toName, 16);
    ygGet32(p, &sent);
    ygGetBytes(p, subject, 0x20);
    ygGetBytes(p, body, 0x200);
    ygGetBytes(p, extra, 0x40);
    ygGet8(p, &read);
    ygEndRead(p);
    LobbyMail m;
    m.from = (int32_t)from;
    m.fromName = fromName;
    m.to = (int32_t)to;
    m.toName = toName;
    m.sent = (int32_t)sent;
    m.received = now();
    char t[0x201];
    lobbyTextFilter(-1, subject, t);
    m.subject = t;
    lobbyTextFilter(-1, body, t);
    m.body = t;
    lobbyTextFilter(-1, extra, t);
    m.extra = t;
    m.valid = 1;
    m.read = read;
    m.b62 = 0;
    lobbyMailReceived(m);
}

// @yo2 0x006cd670 0x4600 YG_MSG_SENDMAIL: u32 to, 32 B subject, 512 B body, 64 B extra; the mail is stamped and filed
void CNetLobby::sendMail(LobbyMail& m) {
    auto field = [](const std::string& s, char* b, size_t n) {   // each string's bytes, zero-padded to the field
        memset(b, 0, n);
        memcpy(b, s.data(), std::min(s.size(), n));
    };
    char subject[0x20], body[0x200], extra[0x40];
    field(m.subjectText(), subject, sizeof subject);
    field(m.bodyText(), body, sizeof body);
    field(m.extraText(), extra, sizeof extra);
    ygClear(&out);
    ygBegin(&out, 0x4600);
    ygPut32(&out, (uint32_t)m.to);
    ygPutBytes(&out, subject, sizeof subject);
    ygPutBytes(&out, body, sizeof body);
    ygPutBytes(&out, extra, sizeof extra);
    ygEnd(&out);
    send();
    flag(LB_REQ_SENDMAIL) = 1;
    m.sent = now();
    lobbyMailSent(m);
}

// ---- notices

// @yo2 0x006bf290 0x4700 YG_MSG_MAINTENOTICE: s32 seconds until the server stops; lights the menu icon
void CNetLobby::onMaintenance() {
    readS32(this, &maintSeconds, 0);
    maintTime = now();
    flag(LB_REQ_MAINTENANCE) = 2;
    lobbyMenuMaintenance();
}

// @yo2 0x006bf310 0x5000 YG_MSG_EVENTINFO: u32 event id, u32 world (6 = all), u32 kind; ignored during a duel
void CNetLobby::onEventInfo() {
    YgPacket* p = in();
    uint32_t id, world, kind;
    ygBeginRead(p);
    ygGet32(p, &id);
    ygGet32(p, &world);
    ygGet32(p, &kind);
    ygEndRead(p);
    if (lobbyInDuel()) return;
    if ((world == 6 || world == rgn) && ((int32_t)id != eventId || (int32_t)kind != eventKind)) {
        eventId = (int32_t)id;
        eventKind = (int32_t)kind;
        eventNew = 1;
    }
    flag(LB_REQ_EVENTINFO) = 2;
    lobbyMenuEvent((int32_t)kind);
    switch (kind) {
    case 1: case 5: case 7: case 0xd: case 0xf: case 0x11: case 0x15: lobbyEventEffect(EVENT_FLAG_4E9); break;
    case 2: case 6: case 8: case 0xe: case 0x10: case 0x12: lobbyEventEffect(EVENT_CALL_A5A9C0); break;
    case 0xb: lobbyEventEffect(EVENT_FLAG_4EA); break;
    case 0xc: lobbyEventEffect(EVENT_CALL_A5A9E0); break;
    }
}

// @yo2 0x006bfc80 0x0004 keep-alive answer: an s32, read and dropped
void CNetLobby::onKeepAliveReply() {
    int32_t v = 0;
    readS32(this, &v, 0);
}

// ---- trades

// @yo2 0x006bf4d0 0x7103 YG_MSG_REQTRADERESULT (-493 = could not send)
void CNetLobby::onReqTradeResult() { readS32(this, &reqTradeResult, LB_REQ_TRADE); }

// @yo2 0x006bf510 0x7104 YG_MSG_TRADEOFFER: u32 pid + 16 B name of whoever asks
void CNetLobby::onTradeOffer() {
    YgPacket* p = in();
    uint32_t pid;
    char name[17];
    ygBeginRead(p);
    ygGet32(p, &pid);
    ygGetBytes(p, name, 16);
    ygEndRead(p);
    tradePartner = 0;
    memset(tradePartnerName, 0, sizeof tradePartnerName);
    confirmResult = 0;
    tradeEndOk = 0;
    tradePartner = (int32_t)pid;
    strcpy(tradePartnerName, name);
    offered = 1;
    offerCancelled = 0;
    flag(LB_REQ_TRADEOFFER) = 2;
    flag(LB_REQ_TRADEOFFERREPLY) = 0;
}

// @yo2 0x006bf5f0 0x7105 YG_MSG_TRADEOFFERREPLY
void CNetLobby::onTradeOfferReply() { readS32(this, &tradeOfferReplyResult, LB_REQ_TRADEOFFERREPLY); }

// @yo2 0x006bf650 0x7109 YG_MSG_CANCELREQTRADENOTICE
void CNetLobby::onCancelReqTradeNotice() {
    if (offered) offerCancelled = 1;
    flag(LB_REQ_CANCELTRADE) = 2;
}

static void readMove(CNetLobby* l, uint16_t* card, uint8_t* op) {
    YgPacket* p = l->in();
    ygBeginRead(p);
    ygGet16(p, card);
    ygGet8(p, op);
    ygEndRead(p);
}

// @yo2 0x006bf6c0 0x7115 YG_MSG_MOVEOWNCARD: u16 card (or index), u8 0 add / 1 remove; clears our status
void CNetLobby::onMoveOwnCard() {
    uint16_t card;
    uint8_t op;
    readMove(this, &card, &op);
    ownMoveCard = card;
    ownMoveOp = op;
    ownStatus = 0;
    flag(LB_REQ_OWNMOVE) = 2;
}

// @yo2 0x006bf750 0x7116 YG_MSG_MOVEOTHERCARD: the partner's move; clears their status
void CNetLobby::onMoveOtherCard() {
    uint16_t card;
    uint8_t op;
    readMove(this, &card, &op);
    otherMoveCard = card;
    otherMoveOp = op;
    otherStatus = 0;
    flag(LB_REQ_OTHERMOVE) = 2;
}

static uint8_t readU8(CNetLobby* l) {
    YgPacket* p = l->in();
    uint8_t v;
    ygBeginRead(p);
    ygGet8(p, &v);
    ygEndRead(p);
    return v;
}

// @yo2 0x006bf7e0 0x7117 YG_MSG_SETTRADESTATUS: our status (1 = ready)
void CNetLobby::onSetTradeStatus() {
    ownStatus = readU8(this);
    flag(LB_REQ_TRADESTATUS) = 2;
}

// @yo2 0x006bf830 0x7118 YG_MSG_TRADEALLREADY
void CNetLobby::onTradeAllReady() { flag(LB_REQ_ALLREADY) = 2; }

// @yo2 0x006bf850 0x7120 YG_MSG_TRADELASTCONFIRMRESULT: 3 = done, 2 = back to editing
void CNetLobby::onTradeLastConfirmResult() {
    confirmResult = readU8(this);
    flag(LB_REQ_TRADECONFIRM) = 2;
}

// @yo2 0x006bf8a0 0x7121 YG_MSG_TRADEEND: u8, non-zero = the cards moved
void CNetLobby::onTradeEnd() {
    tradeEndOk = readU8(this) != 0;
    flag(LB_REQ_TRADEEND) = 2;
}

// @yo2 0x006bf910 0x7112 YG_MSG_TRADEUSEREXIT: u32 pid; closes the scene only if it is the partner we know
void CNetLobby::onTradeUserExit() {
    int32_t pid;
    readS32(this, &pid, 0);
    if (pid == tradePartner) flag(LB_REQ_TRADEEXIT) = 2;
    if (offered) offerCancelled = 1;
}

// @yo2 0x006bf980 0x7113 YG_MSG_ADDCARD result
void CNetLobby::onAddCardResult() { readS32(this, &addCardResult, LB_REQ_TRADECARD); }
// @yo2 0x006bf9c0 0x7114 YG_MSG_DELETECARD result
void CNetLobby::onDeleteCardResult() { readS32(this, &deleteCardResult, LB_REQ_TRADECARD2); }

static void tableChunk(CNetLobby* l, uint8_t chunk, uint8_t* table) {
    if (chunk > 6) return;   // fix: the exe writes past the table (and a chunk byte >= 0x80 indexes backwards)
    YgPacket* p = l->in();
    ygBeginRead(p);
    if (chunk == 6) ygGetBytes(p, table + 0xc00, 0xb8);
    else ygGetBytes(p, table + chunk * 0x200, 0x200);
    ygEndRead(p);
}

// @yo2 0x006bfa00 0x7126 YG_MSG_TRADETRUNK: one chunk (6 x 512 B + 184 B)
void CNetLobby::onTradeTrunk() { tableChunk(this, tradeTrunkChunk, tradeTrunk); }

// @yo2 0x006bfa80 0x7127 YG_MSG_TRADETRUNKEND: the account's trunk becomes this one and is saved
void CNetLobby::onTradeTrunkEnd(CNetAccount& acc) {
    memcpy(acc.me.trunk, tradeTrunk, TRUNK_BYTES);
    cardDbSyncTrunk(acc.me);
    flag(LB_REQ_TRADETRUNK) = 2;
}

// @yo2 0x006bfb00 0x7122 YG_MSG_ARRIVETRADECARD
void CNetLobby::onArriveTradeCard() { flag(LB_REQ_ARRIVECARD) = 2; }

// @yo2 0x006bfb20 0x7130 YG_MSG_TRADELIMIT: one chunk of the not-tradeable counts
void CNetLobby::onTradeLimit() { tableChunk(this, tradeLimitChunk, tradeLimit); }

// @yo2 0x006bfba0 0x7131 YG_MSG_TRADELIMITEND: into the account's second table (+0x25a5)
void CNetLobby::onTradeLimitEnd(CNetAccount& acc) {
    memcpy(acc.me.trunk2, tradeLimit, TRUNK_BYTES);
    flag(LB_REQ_TRADELIMIT) = 2;
}

// @yo2 0x006bfc10 0x7134 YG_MSG_CHANGETRADESTATUS: the partner's status
void CNetLobby::onChangeTradeStatus() {
    otherStatus = readU8(this);
    flag(LB_REQ_CHANGESTATUS) = 2;
}

// @yo2 0x006bfc60 0x7133 YG_MSG_TRADESTARTRESULT
void CNetLobby::onTradeStartResult() { flag(LB_REQ_TRADESTART) = 2; }

// @yo2 0x006bf630 0x7111 YG_MSG_TRADEOFFERTIMEOUT: empty handler
// @yo2 0x006bf680 0x7110 YG_MSG_CANCELREQTRADERESULT: empty handler
// @yo2 0x006bf6a0 0x7107 YG_MSG_CARDLIST: empty handler
static void ignore() {}

// FUN_006ac020's Social cases
bool CNetLobby::onRecvSocial(CNetAccount& acc, int32_t id) {
    switch (id) {
    case 0x0004: onKeepAliveReply(); break;
    case 0x4501: onPidByNameResult(); break;
    case 0x4511: onReqFriendResult(); break;
    case 0x4512: onFriendOffer(); break;
    case 0x4515: onFriendNotice(); break;
    case 0x4521: onFriendSearchResult(); break;
    case 0x4531: onAddBlackResult(); break;
    case 0x4541: onDelBlackResult(); break;
    case 0x4551: onTeamCreateResult(); break;
    case 0x4553: onTeamDisbandResult(); break;
    case 0x4555: break;   // YG_MSG_TEAMJOINRESULT: logged, nothing else
    case 0x4559: onTeamList(acc); break;
    case 0x4560: onTeamDisbandNotice(); break;
    case 0x4561: onTeamJoinNotice(); break;
    case 0x4562: onTeamBanishNotice(); break;
    case 0x4563: onTeamCreateNotice(); break;
    case 0x4564: onTeamListBegin(acc); break;
    case 0x4565: onTeamListEnd(); break;
    case 0x4566: onTeamCreateResultEnd(); break;
    case 0x4567: onTeamJoinApply(); break;
    case 0x4570: onTeamLeaveNotice(); break;
    case 0x4571: onTeamUpdate(acc); break;
    case 0x4601: onSendMailResult(); break;
    case 0x4603: onShortMailNotice(); break;
    case 0x4611: onMailListStart(); break;
    case 0x4612: onMailListData(); break;
    case 0x4613:   // YG_MSG_RCVMAILLISTEND
        newMail = 0;
        flag(LB_REQ_RCVMAIL) = 2;
        break;
    case 0x4621: onMailCount(); break;
    case 0x4700: onMaintenance(); break;
    case 0x5000: onEventInfo(); break;
    case 0x7103: onReqTradeResult(); break;
    case 0x7104: onTradeOffer(); break;
    case 0x7105: onTradeOfferReply(); break;
    case 0x7107: case 0x7110: case 0x7111: ignore(); break;
    case 0x7109: onCancelReqTradeNotice(); break;
    case 0x7112: onTradeUserExit(); break;
    case 0x7113: onAddCardResult(); break;
    case 0x7114: onDeleteCardResult(); break;
    case 0x7115: onMoveOwnCard(); break;
    case 0x7116: onMoveOtherCard(); break;
    case 0x7117: onSetTradeStatus(); break;
    case 0x7118: onTradeAllReady(); break;
    case 0x7120: onTradeLastConfirmResult(); break;
    case 0x7121: onTradeEnd(); break;
    case 0x7122: onArriveTradeCard(); break;
    case 0x7125:   // YG_MSG_TRADETRUNKSTART
        tradeTrunkChunk = 0;
        memset(tradeTrunk, 0, sizeof tradeTrunk);
        flag(LB_REQ_TRADETRUNK) = 0;
        break;
    case 0x7126: onTradeTrunk(); tradeTrunkChunk++; break;
    case 0x7127: onTradeTrunkEnd(acc); break;
    case 0x7129:   // YG_MSG_TRADELIMITSTART
        tradeLimitChunk = 0;
        memset(tradeLimit, 0, sizeof tradeLimit);
        flag(LB_REQ_TRADELIMIT) = 0;
        break;
    case 0x7130: onTradeLimit(); tradeLimitChunk++; break;
    case 0x7131: onTradeLimitEnd(acc); break;
    case 0x7133: onTradeStartResult(); break;
    case 0x7134: onChangeTradeStatus(); break;
    default: return false;
    }
    return true;
}
