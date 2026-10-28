// CNetDuel (0x00691050..0x00694460) plus the queue pop the engine uses (0x00790880).
#include "NetDuel.h"

#include <cstdio>
#include <cstring>
#include <ctime>
#include <initializer_list>

#if !(defined(_WIN32) && defined(__i386__))   // (in the game: the exe's globals, see NetDuel.h)
int32_t g_duelMode = 0;
uint32_t g_turnPlayer = 0;
uint8_t g_sceneId = 0;
static uint8_t s_duelUi[0x440];
uint8_t* g_duelUi = s_duelUi;
DuelCardList g_fusionList;   // (g_deckList is g_eng.deckList, defined with the engine)
CNetDuel* g_netDuel = nullptr;
DuelDeckMsg g_duelDeck[2];
DuelDeckMsg g_duelDeckSaved;
int32_t g_duelDeckIsSaved;
int32_t g_duelViewFusing;
#endif

// @yo2 0x00739ff0
void duelDeckSave() {
    g_duelDeckIsSaved = 1;
    g_duelDeckSaved = g_duelDeck[0];
}
// @yo2 0x0073a030
void duelDeckRestore() {
    if (g_duelDeckIsSaved) {
        g_duelDeckIsSaved = 0;
        g_duelDeck[0] = g_duelDeckSaved;
    }
}
// @yo2 0x0073a070
void duelRequestReset() { g_duelDeckIsSaved = 0; }
// @yo2 0x0073a090 the built-in deck (the exe's table at 0x00beb9d4: main count, ids, extra count, ids)
void duelDefaultDeck(int32_t j) {
    static const uint16_t kMain[] = {291, 291, 291, 291, 291, 291, 291, 291, 291, 291, 581, 581, 581, 581,
                                     581, 581, 581, 581, 581, 581, 678, 678, 678, 678, 678, 678, 678, 678,
                                     678, 678, 1106, 1106, 1106, 1106, 1106, 1106, 1106, 1106, 1106, 1106};
    static const uint16_t kExtra[] = {2160, 2160, 2160, 2160, 2160};
    DuelDeckMsg& d = g_duelDeck[j];
    d.x = d.extraCount = d.mainCount = 0;
    for (uint16_t id : kMain)
        d.main[d.mainCount++] = id;
    for (uint16_t id : kExtra)
        d.extra[d.extraCount++] = id;
}
// @yo2 0x0073d340
void duelViewFusingSet() { g_duelViewFusing = 1; }
// @yo2 0x0073d360
void duelViewFusingClear() { g_duelViewFusing = 0; }
// @yo2 0x0073d380
int32_t duelViewFusing() { return g_duelViewFusing; }

static int32_t now() { return (int32_t)time(nullptr); }
static int32_t s_lastWatchPing;   // DAT_01288eb8

static YgPacket* begin(CNetDuel* d, int32_t id) {
    ygClear(&d->out);
    ygBegin(&d->out, id);
    return &d->out;
}

static void finish(CNetDuel* d, int req = 0) {
    ygEnd(&d->out);
    d->send();
    if (req) d->flag(req) = 1;
}

// a "move" message: sending it ends the permission to move and clears every mask
static void finishMove(CNetDuel* d) {
    finish(d);
    d->clearComid();
}

static bool watching(const CNetDuel* d) { return (d->state & ND_SPECTATOR) || (d->logFlags & ND_REPLAY); }

// @yo2 0x00691050
void CNetDuel::construct() {
    init();
    b688 = 0;
    conn = nullptr;
    last = -1;
    memset(&listB, 0, sizeof listB);
    memset(&listC, 0, sizeof listC);
    flags = 0;
    input = svrCode = state = watch = 0;
    logFlags = 0;
    for (int i = 0; i < 2; i++) {
        DuelSide& s = side[i];
        s.id = 0;
        s.deckMain = -1;
        s.lp = 8000;
        s.country[0] = s.country[1] = 0;
        logSide[i][0] = logSide[i][1] = 0;
        snprintf(s.name, sizeof s.name, "KONAMI_PLAYER_%02d", i + 1);
    }
}

// @yo2 0x00691170
void CNetDuel::destruct() { destroy(); }
// 0x00691140 is the scalar deleting destructor (destruct + operator delete): no body of its own here.
// @yo2 0x00691140

// @yo2 0x00691190 gate = 0: no server (-24). Resets the duel state and connects.
int32_t CNetDuel::connect(int gate, const char* h, uint16_t p, uint32_t n) {
    last = -1;
    flags = 0;
    input = svrCode = state = watch = 0;
    logFlags = 0;
    memset(comid, 0, sizeof comid);
    logBce = 1;
    logCount = 1;
    if (!gate) return YG_NO_GATE;
    snprintf(host, sizeof host, "%s", h ? h : "");
    port = p;
    if (n) notify = n;
    CMessageIOBase::connect();
    return YG_OK;
}

// @yo2 0x00691310 dispatcher
int32_t CNetDuel::onRecv() {
    YgPacket* p = in();
    if (!p) return YG_BAD_ARGS;
    gotMsg = 1;
    switch (p->id) {
    case 0x6005: onOtherDeck(); break;
    case 0x6006: onOtherDeckWatch(); break;
    case 0x6007: onBookedCheck(); break;
    case 0x600c: onPreparation(); break;
    case 0x6016: onSearchInit(); break;
    case 0x6017: onSearch(); break;
    case 0x6100: onGotoJanken(); break;
    case 0x6101: onJankenResult(); break;
    case 0x6102: onGotoSelectFirst(); break;
    case 0x6103: onSelectFirst(); break;
    case 0x6104: onGotoDuelStart(); break;
    case 0x6105: onForcedJanken(); break;
    case 0x6202: onSetCommand(); break;
    case 0x6461: onTimeUp(); break;
    case 0x649b: onSvrInfo(); break;
    case 0x6610: onCardList(); break;
    case 0x6611: onComidField(); break;
    case 0x6612: onComidHand(); break;
    case 0x6613: onScore(); break;
    case 0x6701: onWatchSeen(); break;
    // 0x6010-0x6012, 0x6014, 0x6015: yo2NetDuel_DuelLog.cpp (src/Net)
    }
    return YG_OK;
}

// ---------------------------------------------------------------- client -> server

// @yo2 0x00691760
void CNetDuel::sendKey(const uint8_t* obj) {
    ygPutBytes(begin(this, 0x6004), obj + 0x10, 0x10);
    finish(this);
}

// @yo2 0x006917b0 YG_MSG_BOOKED_CHECK
void CNetDuel::sendBookedCheck(uint32_t id) {
    ygPut32(begin(this, 0x6001), id);
    finish(this, ND_REQ_BOOKED);
}

// @yo2 0x00691880 YG_MSG_PREPARATION (answered by 0x600c, which sets req 0x1d)
void CNetDuel::sendPrepare() {
    begin(this, 0x600b);
    finish(this, ND_REQ_BOOKED);
}

// @yo2 0x00691ad0
void CNetDuel::sendGotoJanken() {
    if (watching(this)) return;
    begin(this, 0x6100);
    finish(this, ND_REQ_JANKEN);
}

// @yo2 0x00691b80 0 rock, 1 scissors, 2 paper (opponent - mine) mod 3 decides
void CNetDuel::sendJankenHand(uint8_t hand) {
    ygPut8(begin(this, 0x6101), hand);
    finish(this, ND_REQ_HAND);
}

// @yo2 0x00691c20
void CNetDuel::sendGotoSelectFirst() {
    if (watching(this)) return;
    begin(this, 0x6102);
    finish(this, ND_REQ_SELECTFIRST);
}

// @yo2 0x00691cd0 0 = this client goes first
void CNetDuel::sendSelectFirst(uint8_t who) {
    ygPut8(begin(this, 0x6103), who);
    finish(this);
}

// @yo2 0x00691d60
void CNetDuel::sendGotoDuelStart() {
    begin(this, 0x6104);
    finish(this, ND_REQ_DUELSTART);
}

// @yo2 0x00691df0 3 battle, 4 main 2, 5 end
void CNetDuel::sendPhase(uint32_t phase) {
    ygPut32(begin(this, 0x002e), phase);
    finishMove(this);
}

// @yo2 0x00691e40 field: zone = slot 0..10, index 0; hand: zone 0xb, index = position; cmd = menu bit
void CNetDuel::sendMove(uint32_t player, uint32_t zone, uint32_t index, uint32_t cmd) {
    YgPacket* p = begin(this, 0x6350);
    ygPut32(p, player);
    ygPut32(p, zone);
    ygPut32(p, index);
    ygPut32(p, cmd);
    finishMove(this);
}

// @yo2 0x00691ed0
void CNetDuel::sendPass() {
    begin(this, 0x6351);
    finishMove(this);
    if (g_duelUi[0x438] == 1) g_duelUi[0x438] = 2;
}

// @yo2 0x00691f40 debug build only (FUN_0079a540)
void CNetDuel::sendDebugCard(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t e) {
    YgPacket* p = begin(this, 0x61ff);
    for (uint32_t v : {a, b, c, d, e}) ygPut32(p, v);
    finishMove(this);
}

// @yo2 0x00691fd0 debug build only
void CNetDuel::sendDebug(uint32_t a, uint32_t b, uint32_t c, uint32_t d) {
    YgPacket* p = begin(this, 0x61f0);
    for (uint32_t v : {a, b, c, d}) ygPut32(p, v);
    finishMove(this);
}

// @yo2 0x00692060
void CNetDuel::sendDuelReady(uint8_t setPosition) {
    ygPut8(begin(this, 0x61fe), setPosition);
    finish(this);
}

// @yo2 0x006920b0
void CNetDuel::sendNumber(uint32_t n) {
    ygPut32(begin(this, 0x6426), n);
    finishMove(this);
}

// @yo2 0x00692120
void CNetDuel::sendCardValue(uint32_t card, uint32_t v) {
    YgPacket* p = begin(this, 0x6432);
    ygPut32(p, card);
    ygPut32(p, v);
    finishMove(this);
}

// @yo2 0x00692190 dialog answer (YES = 5, NO = 7; list index; ATK 0 / DEF 1...)
void CNetDuel::sendChoice(uint32_t v) {
    ygPut32(begin(this, 0x6423), v);
    finishMove(this);
}

// @yo2 0x006926d0
void CNetDuel::sendWatch() {
    begin(this, 0x6700);
    finish(this, ND_REQ_OTHERDECK);
    state |= ND_SPECTATOR;
}

// @yo2 0x00692720 0x6702 once, then again 10 s after the last one
void CNetDuel::watchKeepAlive() {
    if (watch == 2) {
        if (now() > s_lastWatchPing + 10) watch = 0;
        return;
    }
    begin(this, 0x6702);
    finish(this);
    watch = 2;
    s_lastWatchPing = now();
}

// @yo2 0x006927b0
void CNetDuel::sendWatch6703() {
    begin(this, 0x6703);
    finish(this);
}

// @yo2 0x006927f0
void CNetDuel::send6495(uint8_t v) {
    ygPut8(begin(this, 0x6495), v);
    finish(this);
}

// @yo2 0x00692840 the deck as three messages (the client sends a dummy deck; the server knows the real one)
void CNetDuel::sendDeck(const DuelDeckMsg* d) {
    if (watching(this)) return;
    YgPacket* p = begin(this, 0x6600);
    ygPut32(p, d->mainCount);
    ygPut32(p, d->x);
    ygPut32(p, d->extraCount);
    finish(this);
    // the original loops to the u32 count over fixed arrays; capped at their size
    p = begin(this, 0x6601);
    ygPut32(p, d->mainCount);
    for (uint32_t i = 0; i < d->mainCount && i < 95; i++) ygPut16(p, d->main[i]);
    finish(this);
    p = begin(this, 0x6603);
    ygPut32(p, d->extraCount);
    for (uint32_t i = 0; i < d->extraCount && i < 31; i++) ygPut16(p, d->extra[i]);
    finish(this);
}

// @yo2 0x00692b40
void CNetDuel::sendEmpty(int32_t id) {
    begin(this, id);
    finishMove(this);
}

// @yo2 0x00694460
void CNetDuel::sendSearchAck(uint8_t v) {
    ygPut8(begin(this, 0x6013), v);
    finish(this);
}

// ---------------------------------------------------------------- server -> client

// @yo2 0x00691800
void CNetDuel::onBookedCheck() {
    YgPacket* p = in();
    uint32_t v = 0;
    ygBeginRead(p);
    ygGet32(p, &v);
    ygEndRead(p);
    flags = (int32_t)v > 0 ? flags | 1 : flags & ~1u;
    flag(ND_REQ_BOOKED) = 2;
}

// @yo2 0x006918d0 168 bytes: names, ids, LPs, avatar parts, countries, two u32 each
void CNetDuel::onPreparation() {
    YgPacket* p = in();
    ygBeginRead(p);
    for (DuelSide& s : side) ygGetBytes(p, s.name, 16);
    for (DuelSide& s : side) ygGet32(p, (uint32_t*)&s.id);
    for (DuelSide& s : side) ygGet32(p, (uint32_t*)&s.lp);
    for (DuelSide& s : side) {
        for (char* part : s.parts) ygGetBytes(p, part, 16);
    }
    for (DuelSide& s : side) ygGetBytes(p, s.country, 4);
    for (DuelSide& s : side) {
        ygGet32(p, &s.v8c);
        ygGet32(p, &s.v90);
    }
    ygEndRead(p);
    flag(ND_REQ_PREPARE) = 2;
}

// @yo2 0x00691a50 the opponent's dummy deck sizes
void CNetDuel::onOtherDeck() {
    YgPacket* p = in();
    uint16_t a = 0, b = 0;
    ygBeginRead(p);
    ygGet16(p, &a);
    ygGet16(p, &b);
    ygEndRead(p);
    side[1].deckMain = a;
    side[1].deckExtra = b;
}

// @yo2 0x00691b40
void CNetDuel::onGotoJanken() {
    ygBeginRead(in());
    ygEndRead(in());
    flag(ND_REQ_JANKEN) = 2;
}

// @yo2 0x00691bd0
void CNetDuel::onJankenResult() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet8(p, &jankenX);
    ygGet8(p, &side[1].janken);
    ygEndRead(p);
    flag(ND_REQ_HAND) = 2;
}

// @yo2 0x00691c90
void CNetDuel::onGotoSelectFirst() {
    ygBeginRead(in());
    ygEndRead(in());
    flag(ND_REQ_SELECTFIRST) = 2;
}

// @yo2 0x00691d20
void CNetDuel::onSelectFirst() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet8(p, &first);
    ygEndRead(p);
}

// @yo2 0x00691db0 (nobody reads req 0x21)
void CNetDuel::onGotoDuelStart() {
    ygBeginRead(in());
    ygEndRead(in());
    flag(ND_REQ_DUELSTART) = 2;
}

// @yo2 0x00692200 u8 code, u8 flag
void CNetDuel::onSvrInfo() {
    YgPacket* p = in();
    uint8_t code = 0, f = 0;
    ygBeginRead(p);
    ygGet8(p, &code);
    ygGet8(p, &f);
    ygEndRead(p);
    svrCode = code;
    state = (uint8_t)((state & ~ND_SVR_FLAG) | (f & 1));
    if (code == 1) state |= ND_CUT;
}

// @yo2 0x00692290 the server imposes the janken hand (bits 3-4)
void CNetDuel::onForcedJanken() {
    YgPacket* p = in();
    uint8_t x = 0;
    ygBeginRead(p);
    ygGet8(p, &x);
    ygEndRead(p);
    state = (uint8_t)(((x & 3) << 3) | (state & 0xe7) | ND_FORCED_HAND);
}

// @yo2 0x00692350 4 u32 per side, then one more
void CNetDuel::onScore() {
    YgPacket* p = in();
    ygBeginRead(p);
    for (DuelSide& s : side)
        for (uint32_t& v : s.score) ygGet32(p, &v);
    ygGet32(p, &scoreX);
    ygEndRead(p);
}

// @yo2 0x00692470 both sides' deck sizes and identity (for a spectator)
void CNetDuel::onOtherDeckWatch() {
    YgPacket* p = in();
    ygBeginRead(p);
    for (DuelSide& s : side) {
        uint16_t a = 0, b = 0;
        ygGet16(p, &a);
        ygGet16(p, &b);
        ygGet8(p, &s.b15);
        ygGetBytes(p, s.name, 16);
        for (char* part : s.parts) ygGetBytes(p, part, 16);
        ygGetBytes(p, s.country, 4);
        s.deckMain = a;
        s.deckExtra = b;
    }
    ygGet8(p, &b67c);
    ygEndRead(p);
    flag(ND_REQ_OTHERDECK) = 2;
}

// @yo2 0x00692580 append one 40-byte entry; the engine takes them in order (popCommand)
void CNetDuel::onSetCommand() {
    // the original spins forever on re-entry (bit 1) and has no bound on the 512 slots; here both are refused
    if ((flags & 2) || last + 1 >= ND_QUEUE) return;
    flags |= 2;
    DuelCommand& c = queue[++last];
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, &c.type);
    ygGet32(p, &c.b);
    for (uint32_t& v : c.p) ygGet32(p, &v);
    ygEndRead(p);
    watch = 0;
    flags &= ~2u;
}

// @yo2 0x00692660
void CNetDuel::onWatchSeen() {
    YgPacket* p = in();
    ygBeginRead(p);
    for (uint8_t& b : jseen) ygGet8(p, &b);
    ygEndRead(p);
    watch = 1;
}

// @yo2 0x006929b0 a card list for the deck-list window, or (mode 0xfe) the fusion materials
void CNetDuel::onCardList() {
    static DuelCardList l;   // 24 KB: the original builds it on the stack
    memset(&l, 0, sizeof l);
    YgPacket* p = in();
    uint8_t b = 0;
    ygBeginRead(p);
    ygGet8(p, &b);
    l.b = b;
    ygGet32(p, &l.mode);
    ygGet32(p, &l.x);
    ygGet32(p, &l.count);
    ygGet32(p, &l.y);
    for (uint32_t i = 0; i < l.count && i < 0x1000; i++) {   // fix: unbounded in the original (past 0x1000 it runs into info[])
        uint16_t id = 0, serial = 0, owner = 0, unused = 0;
        ygGet16(p, &id);
        ygGet16(p, &serial);
        l.card[i] = (uint32_t)(serial & 0xff) << 23 | (id & 0x3fff);
        ygGet16(p, &owner);
        ygGet16(p, &unused);
        l.card[i] |= (uint32_t)(owner & 0x1ff) << 14;
    }
    ygEndRead(p);
    memcpy(l.mode == 0xfe ? &g_fusionList : &g_deckList, &l, sizeof l);
}

// @yo2 0x00692bf0 u8 who (0/1, 3 = global), s32 secs, u8 paused, s32 secs2
void CNetDuel::onTimeUp() {
    YgPacket* p = in();
    uint8_t who = 0, paused = 0;
    uint32_t secs = 0, secs2 = 0;
    ygBeginRead(p);
    ygGet8(p, &who);
    ygGet32(p, &secs);
    ygGet8(p, &paused);
    ygGet32(p, &secs2);
    ygEndRead(p);
    if (who != 3 && who > 1) return;   // fix: the original indexes side[who] with any byte
    DuelClock& c = who == 3 ? global : side[who].clock;
    c.secs = (int32_t)secs;
    c.stamp = now();
    c.paused = paused;
    c.secs2 = (int32_t)secs2;
    clockWho = who;
}

// @yo2 0x00692f40 clears every mask, then per player: zones 0..15 but 11 (u16 mask, u8 reason), 10 u8 tail
void CNetDuel::onComidField() {
    memset(comid, 0, sizeof comid);
    YgPacket* p = in();
    ygBeginRead(p);
    for (ComidBlock& c : comid) {
        for (int z = 0; z < 16; z++) {
            if (z == 11) continue;
            ygGet16(p, &c.field[z]);
            ygGet8(p, &c.reason[z]);
        }
        for (uint8_t& t : c.tail) ygGet8(p, &t);
    }
    ygEndRead(p);
}

// @yo2 0x00693030 u16 n, n x (u8 player, u16 index, u16 mask); then 2 x (u8 player, u8 k, k x u8)
void CNetDuel::onComidHand() {
    YgPacket* p = in();
    uint16_t n = 0;
    ygBeginRead(p);
    ygGet16(p, &n);
    // fix: player and index come from the wire unchecked in the original; out-of-range entries are read and dropped
    for (int i = 0; i < n; i++) {
        uint8_t pl = 0;
        uint16_t idx = 0, mask = 0;
        ygGet8(p, &pl);
        ygGet16(p, &idx);
        ygGet16(p, &mask);
        if (pl < 2 && idx < 80) comid[pl].hand[idx] = mask;
    }
    for (int j = 0; j < 2; j++) {
        uint8_t pl = 0, k = 0, v = 0;
        ygGet8(p, &pl);
        ygGet8(p, &k);
        for (int i = 0; i < k; i++) {
            ygGet8(p, &v);
            if (pl < 2 && i < 80) comid[pl].list[i] = v;
        }
    }
    ygEndRead(p);
}

// @yo2 0x00694340 DUELLOG_SERCHINFO_INIT: total pairs to expect
void CNetDuel::onSearchInit() {
    YgPacket* p = in();
    ygBeginRead(p);
    ygGet32(p, &searchTotal);
    ygEndRead(p);
    searchCount = 0;
    sendSearchAck(1);
}

// @yo2 0x00694390 DUELLOG_SERCHINFO: u16 pairs until the body or the total runs out
void CNetDuel::onSearch() {
    YgPacket* p = in();
    ygBeginRead(p);
    while (ygReadPos(p) >= 0 && (uint32_t)searchCount < searchTotal && searchCount < 0x200) {   // fix: + capacity
        ygGet16(p, &search[searchCount][0]);
        ygGet16(p, &search[searchCount][1]);
        searchCount++;
    }
    ygEndRead(p);
    sendSearchAck(1);
}

// ---------------------------------------------------------------- state

// @yo2 0x00692300
void CNetDuel::clearComid() {
    memset(comid, 0, sizeof comid);
    input &= ~1;
}

// @yo2 0x00692b90
void CNetDuel::reset() {
    watch = 0;
    last = -1;
    state &= ~ND_SPECTATOR;
    sendBye();
}

// @yo2 0x00692d50 count a clock down to now (unless paused); never below 0
static void tick(DuelClock* c) {
    int32_t t = now();
    if (t != c->stamp) {
        if (!c->paused) {
            c->secs += c->stamp - t;
            if (c->secs2 != -1) c->secs2 = c->secs2 - t + c->stamp;
        }
        c->stamp = t;
    }
    if (c->secs < 0) c->secs = 0;
}

static bool clocksOff(const CNetDuel* d) { return watching(d) || g_duelMode == 0 || g_duelMode == 1; }

// @yo2 0x00692cc0 the side's clock; only the side of the last 0x6461 runs; -1 = no clock
int32_t CNetDuel::sideSecs(uint32_t who) {
    if (clocksOff(this) || who > 1) return -1;
    DuelClock* c = &side[who].clock;
    if (clockWho == who) {
        tick(c);
        return c->secs;
    }
    return g_turnPlayer == who ? c->secs : -1;
}

// @yo2 0x00692dc0
int32_t CNetDuel::sideSecs2(int who) const { return clocksOff(this) || (unsigned)who > 1 ? -1 : side[who].clock.secs2; }

// @yo2 0x00692e30 the global clock; scene 0x14 with p = 0 shows it even in modes 0/1
int32_t CNetDuel::globalSecs(int p) {
    if (watching(this)) return -1;
    if (clockWho == 3) tick(&global);
    if ((g_sceneId != 0x14 || p != 0) && (g_duelMode == 0 || g_duelMode == 1)) return -1;
    return global.secs;
}

// @yo2 0x00693190
bool CNetDuel::answered(int n) {
    uint8_t& f = flag(0x1c + n);
    if (f != 2) return false;
    f = 0;
    return true;
}

// @yo2 0x00790880 the engine consumed queue[0]
void CNetDuel::popCommand() {
    if (last > 0) memmove(&queue[0], &queue[1], last * sizeof(DuelCommand));
    last--;
}

// @yo2 0x00694140 "XXXXXXXX..." -> u16 pairs; each 8-char group is two u16 with the FIRST char as the low nibble;
// only '1'-'9' and 'A'-'F' count, anything else is 0
void ndHexPairs(const char* s, uint16_t* out) {
    int len = (int)strlen(s);
    for (int i = 0; i < len; i += 8, out += 2) {
        uint8_t d[8];
        for (int k = 0; k < 8; k++) {
            char c = i + k < len ? s[i + k] : 0;   // the original reads past the end of a short last group
            d[k] = c >= '1' && c <= '9' ? c - '0' : c >= 'A' && c <= 'F' ? c - 'A' + 10 : 0;
        }
        out[0] = (uint16_t)(d[3] << 12 | d[2] << 8 | d[1] << 4 | d[0]);
        out[1] = (uint16_t)(d[7] << 12 | d[6] << 8 | d[5] << 4 | d[4]);
    }
}
