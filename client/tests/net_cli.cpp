// Test driver for src/Net, run by tests/net_test*.py. Two modes:
//   net_cli build            every request builder once, fixed arguments: "<label> <wire hex>" per line
//   net_cli script|live < steps   lines "rx <gate|account|lobby> <wire hex>" (feed + handle every complete message),
//                            "call <name>[=arg]" (a builder that needs received state, or a setter), "dump <what>"
// Message groups add their own verbs in tests/net_cli_<group>.cpp (see net_cli.h).
#include "net_cli.h"

#include <ctime>
#include <iostream>

// ---- fake socket
static std::vector<uint8_t> g_in;
std::vector<uint8_t> g_out;
static size_t g_pos;
static int rd(void*, uint8_t* b, int n) {
    if (g_pos >= g_in.size()) return -1;   // would block
    int k = (int)std::min<size_t>(n, g_in.size() - g_pos);
    memcpy(b, g_in.data() + g_pos, k);
    g_pos += k;
    return k;
}
static int wr(void*, const uint8_t* b, int n) { g_out.insert(g_out.end(), b, b + n); return n; }
YgTransport ygSocketTransport(int32_t) { return {nullptr, rd, wr}; }
void ygSocketClose(int32_t sock) { printf("closed %d\n", sock); }
int32_t ygConnectAsync(const char* host, uint16_t port, YgConn* c, uint32_t) {
    c->sock = 7;
    c->state = YGC_CONNECTED;
    printf("connect %s %u\n", host, port);
    return 0;
}
int32_t ygSocketSelect(int32_t sock, uint32_t notify) {
    printf("select %d %u\n", sock, notify);
    return 0;
}

CNetGate gate;
CNetAccount acc;
CNetLobby lobby;

static void open(CMessageIOBase& o) {
    o.ensureConn();
    if (!o.conn->pkt) ygConnAllocPacket(o.conn);
    o.conn->sock = 7;
    o.conn->state = YGC_CONNECTED;
    o.conn->sendSeq = 0;
    o.conn->recvSeq = 0;
}

static void setup() {
    acc.init();
    strcpy(acc.me.user, "duenoprueba");
    strcpy(acc.me.password, "clave-inventada1");
    for (auto* o : {(CMessageIOBase*)&gate, (CMessageIOBase*)&acc, (CMessageIOBase*)&lobby}) open(*o);
}

static void build() {
    struct B { const char* label; std::function<void()> f; };
    static const int32_t mine[10] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, theirs[10] = {10, 11, 12, 13, 14, 15, 16, 17, 18, 19};
    static const uint16_t tp[3] = {0x1111, 0x2222, 0x3333}, present[2] = {0xabcd, 0x0102};
    static const uint32_t deck[2] = {1, 0x01020304};
    static uint8_t parts[16], usb[16];
    for (int i = 0; i < 16; i++) parts[i] = (uint8_t)i, usb[i] = (uint8_t)(0xa0 + i);
    std::vector<B> bs = {
        {"base.bye", [] { gate.sendBye(); }},
        {"base.ping", [] { gate.lastPing = 0; gate.keepAlive(); }},
        {"base.ping_recent", [] { gate.lastPing = (int32_t)time(nullptr); gate.keepAlive(); }},
        {"gate.version", [] { gate.sendVersion(); }},
        {"acc.hello", [] { acc.sendHello(); }},
        {"acc.auth", [] { memset(acc.challenge, 0, 16); acc.sendAuth(); }},
        {"acc.auth_challenge", [] { for (int i = 0; i < 16; i++) acc.challenge[i] = (uint8_t)i; acc.sendAuth(); }},
        {"acc.playerlist", [] { acc.reqPlayerList(); }},
        {"acc.regplayer", [] { strcpy(acc.me.players[2].name, "Amigo"); acc.reqRegPlayer(2); }},
        {"acc.regplayer_bad", [] { acc.reqRegPlayer(4); }},
        {"acc.delplayer", [] { acc.reqDelPlayer(1); }},
        {"acc.trunk", [] { acc.reqTrunk(0); }},
        {"acc.pbin", [] { acc.reqPbin(3); }},
        {"acc.dppurchase", [] { acc.reqDuelPassPurchase(); }},
        {"lb.hello", [] { lobby.sendHello(); }},
        {"lb.auth", [] { memset(lobby.challenge, 0, 16); lobby.sendAuth(acc); }},
        {"lb.pselect", [] { lobby.reqPSelect(5, 0, nullptr, 0); }},
        {"lb.pselect_deck", [] { lobby.reqPSelect(2, 3, deck, 2); }},
        {"lb.blocklist", [] { lobby.reqBlockList(); }},
        {"lb.enterblock", [] { lobby.reqEnterBlock(0, 0); }},
        {"lb.list1", [] { lobby.reqList1(-1); }},
        {"lb.list2", [] { lobby.reqList2(-1); }},
        {"lb.list3", [] { lobby.reqList3(1001); }},
        {"lb.list4", [] { lobby.reqList4(1002); }},
        {"lb.list5", [] { lobby.reqList5(-1); }},
        {"lb.npcinfolist", [] { lobby.reqNpcInfoList(); }},
        {"lb.playerinfo", [] { lobby.reqPlayerInfo(1001); }},
        {"lb.avatarinfo", [] { lobby.reqAvatarInfo(1003); }},
        {"lb.regavatar", [] { lobby.regAvatarInfo(1, parts, 0); }},
        {"lb.comment", [] { lobby.regComment(1, "hola-hola-hola-hola-hola-hola-ho"); }},
        {"lb.title", [] { lobby.updateTitle(5); }},
        {"lb.roomlist", [] { lobby.reqDuelRoomList(0); }},
        {"lb.createroom", [] { lobby.reqCreateRoom(1, 2, 3, true, "pw", 4, 5, 6, 1007); }},
        {"lb.createroom_open", [] { lobby.reqCreateRoom(7, 8, 9, false, nullptr, 10, 11, 12, 0x01020304); }},
        {"lb.createroom_badpw", [] { lobby.reqCreateRoom(1, 2, 3, true, "0123456789abcdefg", 4, 5, 6, 7); }},
        {"lb.deleteroom", [] { lobby.reqDeleteRoom(); }},
        {"lb.matchreply", [] { lobby.matchOfferReply(true); }},
        {"lb.automatchreply", [] { lobby.autoMatchReply(false); }},
        {"lb.cancelmatch", [] { lobby.cancelReqMatch(); }},
        {"lb.chat", [] { lobby.sendChat(2, 1, 2, 3, "hello", 5); }},
        {"lb.watch", [] { lobby.reqWatch(9); }},
        {"lb.chatroomlist", [] { lobby.reqChatRoomList(); }},
        {"lb.createchatroom", [] { char n[32] = "sala"; lobby.reqCreateChatRoom(n, true, "x"); }},
        {"lb.exitchatroom", [] { lobby.reqExitChatRoom(); }},
        {"lb.selectpack", [] { lobby.selectCardPack(0x1234); }},
        {"lb.resetautowait", [] { lobby.resetAutoWait(); }},
        {"lb.friend", [] { lobby.reqFriend(1001); }},
        {"lb.friendreply", [] { lobby.friendOfferReply(1001, -1); }},
        {"lb.pidbyname", [] { lobby.getPidByName("Amigo"); }},
        {"lb.teamcreate", [] { lobby.teamCreate("Equipo"); }},
        {"lb.teamdisband", [] { lobby.teamDisband(); }},
        {"lb.teamjoin", [] { lobby.teamJoin(3); }},
        {"lb.teamjoinreply", [] { lobby.teamJoinReply(1, 2, true); }},
        {"lb.teambanish", [] { lobby.teamBanish(1001); }},
        {"lb.teamleave", [] { lobby.teamLeave(); }},
        {"lb.teamlist", [] { lobby.teamList(); }},
        {"lb.mailcount", [] { lobby.getMailCount(); }},
        {"lb.rcvmail", [] { lobby.rcvMail(); }},
        {"lb.addblack", [] { lobby.reqAddBlack(5); }},
        {"lb.delblack", [] { lobby.reqDelBlack(6); }},
        {"lb.tradeready", [] { lobby.tradeReady(); }},
        {"lb.tradestart", [] { lobby.tradeStart(); }},
        {"lb.reqtrade", [] { lobby.reqTrade(1001); }},
        {"lb.tradeofferreply", [] { lobby.tradeOfferReply(true); }},
        {"lb.canceltrade", [] { lobby.cancelReqTrade(); }},
        {"lb.addcard", [] { lobby.tradeAddCard(-2); }},
        {"lb.deletecard", [] { lobby.tradeDeleteCard(7); }},
        {"lb.tradestatus", [] { lobby.setTradeStatus(3); }},
        {"lb.tradeconfirm", [] { lobby.tradeLastConfirm(1, mine, theirs); }},
        {"lb.tradeexit", [] { lobby.tradeUserExit(); }},
        {"lb.arrivecard", [] { lobby.arriveTradeCard(); }},
        {"lb.tradeclear", [] { lobby.tradeClear(); }},
        {"lb.purchasepack", [] { lobby.purchasePackOpen(); }},
        {"lb.recoverypack", [] { lobby.recoveryPackList(); }},
        {"lb.presentpack", [] { lobby.presentPackOpen(); }},
        {"lb.dpauth", [] { char c[16] = "ABCD-1234"; lobby.reqDpAuth(c); }},
        {"lb.dpauth_toomany", [] { char c[16] = "X"; lobby.dpAuthTries = 11; lobby.reqDpAuth(c);
                                     printf("dpauth_toomany.result %d %d\n", lobby.dpAuthResult, lobby.flag(LB_REQ_DPAUTH));
                                     lobby.dpAuthTries = 0; }},
        {"lb.gunsling", [] { lobby.reqGunslingCard(); }},
        {"lb.mileageitem", [] { lobby.reqMileageItem(); }},
        {"lb.mileageresult", [] { lobby.mileageSel = 1; lobby.mileageItem[1] = 0x0a0b0c0d; lobby.mileageA[1] = 1;
                                    lobby.mileageB[1] = 2; lobby.mileageC[1] = 3; lobby.reqMileageResult(); }},
        {"lb.shopresult", [] { lobby.cart.clear(); ShopPick a{}, b{}; a.itemId = 101; a.count = 2; b.itemId = 202;
                                 b.count = 1; lobby.cart = {a, b}; lobby.reqShopResult(); }},
        {"lb.tourinfo", [] { lobby.tourInfo(); }},
        {"lb.tourentry", [] { lobby.tourReqEntry(); }},
        {"lb.tourlist", [] { lobby.tourList(); }},
        {"lb.tourendresult", [] { lobby.tourEndResult(); }},
        {"lb.tourtimer", [] { lobby.tourTimer(); }},
        {"lb.tourpcounter", [] { lobby.tourPCounter(); }},
        {"lb.tourstatus", [] { lobby.tourStatus(); }},
        {"lb.champscard", [] { lobby.reqChampsCardGet(); }},
        {"lb.usbdpauth", [] { lobby.reqUsbDpAuth(usb); }},
        {"lb.move", [] { lobby.sendMove(1000, 300, 200, 3, 0); }},
        {"lb.5310", [] { lobby.send5310(1000, 1, 2); }},
        {"lb.sdget", [] { lobby.sdGetRequest(1, 2); }},
        {"lb.tppresentinfo", [] { lobby.reqTpPresentInfo(); }},
        {"lb.tpcardget", [] { lobby.reqTpCardGet(4, tp); }},
        {"lb.startuppresent", [] { lobby.reqStartupPresent(present, 2); }},
    };
    for (auto& e : NetCliReg::list("build")) bs.push_back({e.first.c_str(), [&e] { e.second(""); }});
    for (const B& b : bs) {
        for (auto* o : {(CMessageIOBase*)&gate, (CMessageIOBase*)&acc, (CMessageIOBase*)&lobby}) o->conn->sendSeq = 0;
        g_out.clear();
        b.f();
        printf("%s %s\n", b.label, hex(g_out.data(), g_out.size()).c_str());
    }
}

static void pump(CMessageIOBase& o, const std::function<int32_t()>& onRecv) {
    for (;;) {
        int32_t r = o.recv();
        if (r == YG_PENDING) return;
        printf("rx %04x %d\n", o.conn->pkt->id, r);
        if (r != YG_OK) return;
        onRecv();
        if (!o.conn) return;   // the handler hung up
    }
}

void dumpPlayer(const char* k, const CPlayerInfo& p) {
    printf("%s pid=%d valid=%d name=%s level=%u wins=%u losses=%u titleId=%u w116=%u b119=%u country=%s state=%u "
           "block=%u x=%u y=%u dir=%u avatar0=%s avatar1=%s comment=%s title=%s duelName=%s duelLevel=%u duelStats=%u,%u,%u "
           "teamId=%u teamName=%s teamCode=%s teamCodeNum=%d mp=%u u0a8=%u u11c=%u,%u,%u,%u w0b0=",
           k, p.pid, p.valid, str(p.name).c_str(), p.level, p.w0b0[1], p.w0b0[5], p.titleId, p.w116, p.b119,
           str(p.country, 4).c_str(), p.state, p.block, p.x, p.y, p.dir, hex(p.avatar[0].bytes_, 16).c_str(),
           hex(p.avatar[1].bytes_, 16).c_str(), str(p.comment).c_str(), str(p.title).c_str(), str(p.duelName).c_str(), p.duelLevel, p.duelStats[0],
           p.duelStats[1], p.duelStats[2], p.teamId, str(p.teamName, 16).c_str(), str(p.teamCode).c_str(), p.teamCodeNum, p.mp,
           p.u0a8, p.u11c[0], p.u11c[1], p.u11c[2], p.u11c[3]);
    for (int i = 0; i < 16; i++) printf("%s%u", i ? "," : "", p.w0b0[i]);
    printf(" u0d0=%u u10c=%u w110=%u\n", p.u0d0, p.u10c, p.w110);
}

static void dump(const std::string& what) {
    if (const NetCliFn* f = NetCliReg::find("dump", what)) {
        (*f)("");
    } else if (what == "gate") {
        printf("gate listing=%u result=%d flag=%u list=%d\n", gate.listing, gate.result, gate.flag(GATE_REQ_VERSION),
               gate.list() != nullptr);
        for (const CServerInfo& e : gate.servers)
            printf("srv %d %d %s %s %u %u %d %d %d %u\n", e.id, e.kind, str(e.name).c_str(), e.ip, e.port, e.players, e.lang, e.rank,
                   e.area, e.extra);
        const CServerInfo* a = findAccountServer(gate.servers);
        printf("account_server %s %u\n", a ? a->address() : "-", a ? a->port : 0);
    } else if (what == "account") {
        printf("account authResult=%d authFlags=%u region=%s regResult=%d delResult=%d packs=%d challenge=%s\n",
               acc.authResult, acc.authFlags, str(acc.me.region, 4).c_str(), acc.regResult, acc.delResult,
               acc.duelPassPacks, hex(acc.challenge, 16).c_str());
        printf("flags");
        for (int f = ACC_REQ_HELLO; f <= ACC_REQ_DPPURCHASE; f++) printf(" %u", acc.flag(f));
        printf("\ntrunk %s\npbin %s\nnpcbin %s\nu1248 %u\n", hex(acc.me.trunk, TRUNK_BYTES).c_str(), hex(acc.bin.pbin, 0x80).c_str(),
               hex(acc.bin.npcBin, 0x200).c_str(), acc.me.u2c);
        for (int i = 0; i < 4; i++) dumpPlayer(("slot" + std::to_string(i)).c_str(), acc.me.players[i]);
    } else {
        printf("lobby authResult=%d authOk=%u pselect=%d enterBlock=%d block=%u,%u,%u lists=%d,%d,%d,%d,%d changed=%d "
               "avatarRes=%d commentRes=%d titleRes=%d challenge=%s moves=%d\n",
               lobby.authResult, lobby.authOk, lobby.pselectResult, lobby.enterBlockResult, lobby.block, lobby.block2,
               lobby.block3, lobby.listCount[0], lobby.listCount[1], lobby.listCount[2], lobby.listCount[3],
               lobby.list5Count, lobby.playersChanged, lobby.regAvatarResult, lobby.commentResult, lobby.titleResult,
               hex(lobby.challenge, 16).c_str(), lobby.moveCount);
        printf("flags");
        for (int f = LB_REQ_HELLO; f <= LB_REQ_LIST4; f++) printf(" %u", lobby.flag(f));
        printf(" %u\n", lobby.flag(LB_REQ_LIST5));
        for (const LobbyBlock& b : lobby.blocks) printf("blk %u %u %u %u\n", b.id, b.area, b.kind, b.index);
        for (const COnlinePlayer& p : lobby.players) dumpPlayer("player", p);
        for (const MoveRecord& m : lobby.moves) printf("move %d %08x %08x\n", m.pid, m.xy, m.dir);
        dumpPlayer("self", acc.me.players[acc.me.activeSlot]);
        printf("u1248 %u\n", acc.me.u2c);
    }
}

int main(int argc, char** argv) {
    setup();
    bool live = argc > 1 && !strcmp(argv[1], "live");   // script, but "." after each command and a flush
    if (argc > 1 && !strcmp(argv[1], "build")) {
        build();
        return 0;
    }
    std::string cmd, a, b;
    while (std::cin >> cmd) {
        if (cmd == "rx") {
            std::cin >> a >> b;
            std::vector<uint8_t> w = unhex(b);
            g_in.insert(g_in.end(), w.begin(), w.end());
            if (a == "gate") pump(gate, [] { return gate.onRecv(); });
            else if (a == "account") pump(acc, [] { return acc.onRecv(); });
            else pump(lobby, [] { return lobby.onRecv(acc); });
        } else if (cmd == "call") {
            std::cin >> a;
            g_out.clear();
            if (a == "acc.auth") acc.sendAuth();
            else if (a == "lb.auth") lobby.sendAuth(acc);
            else if (a == "acc.connect") printf("connect_result %d\n", acc.connect(&gate));
            else if (a == "lb.connect") printf("connect_result %d\n", lobby.connect(&gate));
            else if (a.rfind("lb.want=", 0) == 0) sscanf(a.c_str() + 8, "%hhu,%hhu,%hhu", &lobby.rgn, &lobby.rank, &lobby.area);
            else if (a.rfind("lb.world=", 0) == 0) g_lobbyWorld = atoi(a.c_str() + 9);
            else if (a.rfind("lb.record=", 0) == 0) lobby.recordMoves = (uint8_t)atoi(a.c_str() + 10);
            else if (a.rfind("acc.slot=", 0) == 0) acc.me.activeSlot = (uint8_t)atoi(a.c_str() + 9);
            else {
                size_t eq = a.find('=');
                const NetCliFn* f = NetCliReg::find("call", a.substr(0, eq));
                if (!f) { printf("unknown call %s\n", a.c_str()); return 1; }
                (*f)(eq == std::string::npos ? "" : a.substr(eq + 1));
            }
            printf("tx %s\n", hex(g_out.data(), g_out.size()).c_str());
        } else if (cmd == "dump") {
            std::cin >> a;
            dump(a);
        }
        if (live) {
            printf(".\n");
            fflush(stdout);
        }
    }
}
