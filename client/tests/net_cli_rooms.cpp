// net_cli verbs for the lobby's rooms / matches / chat / packs group (NetLobby_Rooms.cpp).
#include "NetLobby_Rooms.h"
#include "net_cli.h"

std::u16string lobbyWiden(const char* s) {   // stub: latin-1
    std::u16string r;
    for (; *s; s++) r += (char16_t)(uint8_t)*s;
    return r;
}
void lobbyAutoDuelStarted(int32_t pid) { printf("autoduel %d\n", pid); }
int lobbyFriendCount() { return 3; }
uint32_t lobbyFriendId(int i) { return 1001 + i; }

static std::string narrow(const std::u16string& s) {
    std::string r;
    for (char16_t c : s) r += c == ' ' ? '_' : (char)c;
    return r;
}

NET_CLI("build", "lb.reqmatch") { lobby.reqMatch(1007, "abc"); });
NET_CLI("build", "lb.reqmatch_nopw") { lobby.reqMatch(5, nullptr); });
NET_CLI("build", "lb.matchfriends") { lobby.reqMatchingFriends(); });

NET_CLI("call", "lb.reqmatch") {   // arg: room,password
    size_t c = arg.find(',');
    lobby.reqMatch(atoi(arg.c_str()), c == std::string::npos ? "" : arg.c_str() + c + 1);
    printf("rival_after_reqmatch pid=%d name=%s level=%u\n", lobby.rival.pid, str(lobby.rival.name).c_str(),
           lobby.rival.level);
});
NET_CLI("call", "lb.matchfriends") { lobby.reqMatchingFriends(); });
NET_CLI("call", "lb.prefix") { lobby.chatPrefix[atoi(arg.c_str())] = lobbyWiden(arg.c_str() + 2); });   // "3,[W] "
NET_CLI("call", "lb.rank") { lobby.rank = (uint8_t)atoi(arg.c_str()); });
NET_CLI("call", "lb.flag") {   // "off,value"
    lobby.flag((int)strtol(arg.c_str(), nullptr, 0)) = (uint8_t)atoi(arg.c_str() + arg.find(',') + 1);
});

NET_CLI("dump", "rooms") {
    CNetLobby& l = lobby;
    printf("rooms count=%d total=%d own=%u myRoom=%d changed=%u create=%d delete=%d match=%d cancel=%d abort=%d "
           "watch=%d watchState=%u duel=%s:%u autoMode=%u avatar=%d,%s,%g,%g,%u avatarRes=%d infoRes=%d packRes=%d "
           "resetRes=%d matchingFound=%u\n",
           l.roomListCount, l.roomListTotal, l.ownRoom, l.myRoom ? l.myRoom->id : -1, l.roomsChanged,
           l.createRoomResult, l.deleteRoomResult, l.reqMatchResult, l.cancelMatchResult, l.duelAbortResult,
           l.watchResult, l.watchState, l.duelIp, l.duelPort, l.autoDuelMode, l.avatarPid, str(l.avatarName).c_str(),
           l.avatarX, l.avatarY, l.avatarDir, l.avatarInfoResult, l.playerInfoResult, l.selectPackResult,
           l.resetAutoWaitResult, l.matchingFound);
    printf("rflags");
    for (int f = 0x25; f <= 0x40; f++) printf(" %x:%u", f, l.flag(f));
    printf("\n");
    for (auto& r : l.rooms)
        printf("room %d %d %d %u %u %u %u %u %u,%u,%u\n", r->id, r->p1, r->p2, r->mstat, r->dstyle, r->wmode,
               (unsigned)r->locked, r->mine, r->x[0], r->x[1], r->x[2]);
    for (const ChatLine& c : l.chat) printf("chat %d %d %u %s\n", c.channel, c.pid, c.kind, narrow(c.text).c_str());
    printf("packs");
    for (uint16_t id : l.cardPacks) printf(" %u", id);
    printf("\npackresult");
    for (int i = 0; i < 0x50 && l.packCard[i] != -1; i++) printf(" %d:%u", l.packCard[i], l.packNew[i]);
    printf("\n");
    for (const MatchEntry& e : l.matching)
        if (e.pid) printf("match %d %u %u,%u,%u,%u,%u\n", e.pid, e.found, e.b[0], e.b[1], e.b[2], e.b[3], e.b[4]);
    dumpPlayer("rival", l.rival);
    dumpPlayer("info", l.info);
    dumpPlayer("self", acc.me.players[acc.me.activeSlot]);
    for (const COnlinePlayer& p : l.players) dumpPlayer("player", p);
    printf("u1248 %u\nnpcbin %s\ntrunk1-3 %u %u %u\n", acc.me.u2c, hex(acc.bin.npcBin, 16).c_str(), acc.me.trunk[0],
           acc.me.trunk[1], acc.me.trunk[2]);
});
