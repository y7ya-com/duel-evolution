// src/Net/MessageIO.h's socket calls on platform/net (native and web). Socket handles index a table here: the exe's
// were WinSock SOCKETs, which Net only stores and hands back. handle = index + 1, so -1 (none) never matches.
#include <vector>

#include "Net/MessageIO.h"
#include "net.h"

namespace {

struct YgSock {
    NetSocket* s;
    YgConn* connecting;   // set until the connect finishes (or the record is forgotten)
    bool closePosted;
};
// ponytail: slots are never reused; a session opens a handful of connections
std::vector<YgSock> g_socks;

YgSock* find(int32_t h) { return h > 0 && h <= (int32_t)g_socks.size() && g_socks[h - 1].s ? &g_socks[h - 1] : nullptr; }

int deadRecv(void*, uint8_t*, int) { return -2; }   // WSAENOTSOCK
int deadSend(void*, const uint8_t*, int) { return -2; }

const int32_t WSAECONNREFUSED = 10061;
const uint32_t WM_YG_SOCKET = 0x1401;

}  // namespace

YgTransport ygSocketTransport(int32_t sock) {
    YgSock* y = find(sock);
    return y ? netTransport(y->s) : YgTransport{nullptr, deadRecv, deadSend};
}

void ygSocketClose(int32_t sock) {
    if (YgSock* y = find(sock)) {
        netClose(y->s);
        *y = YgSock{};
    }
}

// The exe: socket(), resolve, blocking connect() on a thread, then c->state = 2 (err 0) or -1 (err =
// WSAGetLastError). Here connect() doesn't block and ygNetPoll finishes it. ponytail: a failure we see at once (no
// such host, no socket) is reported as a refused connection; the exe left state at 1 forever when the lookup failed.
int32_t ygConnectAsync(const char* host, uint16_t port, YgConn* c, uint32_t /*notify: the one game window*/) {
    c->state = YGC_CONNECTING;
    NetSocket* s = netConnect(host, port);
    if (!s) {
        c->err = WSAECONNREFUSED;
        c->state = YGC_FAILED;
        return 0;
    }
    g_socks.push_back(YgSock{s, c, false});
    c->sock = (int32_t)g_socks.size();
    return 0;
}

// ponytail: no WSAAsyncSelect here, ygNetPoll posts 0x1401 for every socket each frame
int32_t ygSocketSelect(int32_t, uint32_t) { return 0; }

void ygNetForget(YgConn* c) {
    for (YgSock& y : g_socks)
        if (y.connecting == c) y.connecting = nullptr;
}

void ygNetPoll(void (*post)(uint32_t, uintptr_t, intptr_t)) {
    for (size_t i = 0; i < g_socks.size(); i++) {
        YgSock& y = g_socks[i];
        if (!y.s) continue;
        NetStatus st = netStatus(y.s);
        if (y.connecting) {
            if (st == NET_CONNECTING) continue;
            y.connecting->err = st == NET_OPEN ? 0 : WSAECONNREFUSED;
            y.connecting->state = st == NET_OPEN ? YGC_CONNECTED : YGC_FAILED;
            y.connecting = nullptr;
            if (st != NET_OPEN) continue;   // never selected: no FD_CLOSE for a socket that never connected
        }
        int ev = netEvent(y.s);
        if (ev == 0 || (ev == 0x20 && y.closePosted)) continue;
        y.closePosted |= ev == 0x20;
        post(WM_YG_SOCKET, i + 1, ev);
    }
}
