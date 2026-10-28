// Net's socket calls on platform/net (net_yg.cpp), natively against a listener on 127.0.0.1 in this process:
// connect finishes through ygNetPoll, 0x1401 FD_READ then one FD_CLOSE, refused / unknown host, dead handles, forget.
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cassert>
#include <chrono>
#include <cstdio>
#include <thread>
#include <vector>

#include "Net/MessageIO.h"
#include "net/net.h"

struct PlatformLikeMsg { uint32_t msg; uintptr_t w; intptr_t l; };
static std::vector<PlatformLikeMsg> posted;
static void post(uint32_t m, uintptr_t w, intptr_t l) { posted.push_back({m, w, l}); }

// pump until done() or 5 s
template <class F> static bool pumpUntil(F done) {
    auto end = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    while (!done()) {
        if (std::chrono::steady_clock::now() > end) return false;
        ygNetPoll(post);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    return true;
}

static int listenLocal(uint16_t* port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in a{};
    a.sin_family = AF_INET;
    a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    assert(bind(fd, (sockaddr*)&a, sizeof a) == 0 && listen(fd, 4) == 0);
    socklen_t len = sizeof a;
    getsockname(fd, (sockaddr*)&a, &len);
    *port = ntohs(a.sin_port);
    return fd;
}

int main() {
    uint16_t port;
    int lfd = listenLocal(&port);
    std::thread server([lfd] {   // one client: send "hello", wait for "ok", close
        int c = accept(lfd, nullptr, nullptr);
        send(c, "hello", 5, 0);
        char buf[2];
        size_t got = 0;
        while (got < 2) got += recv(c, buf + got, 2 - got, 0);
        close(c);
    });

    YgConn* c = ygConnNew();
    ygConnectAsync("127.0.0.1", port, c, 0);
    assert(c->state == YGC_CONNECTING && c->sock > 0);
    assert(pumpUntil([&] { return c->state != YGC_CONNECTING; }) && c->state == YGC_CONNECTED && c->err == 0);

    assert(pumpUntil([&] { return !posted.empty(); }));
    assert(posted[0].msg == 0x1401 && (int32_t)posted[0].w == c->sock && posted[0].l == 1);   // FD_READ
    YgTransport t = ygSocketTransport(c->sock);
    uint8_t buf[8];
    assert(t.recv(t.ctx, buf, 8) == 5 && buf[0] == 'h');
    assert(t.send(t.ctx, (const uint8_t*)"ok", 2) == 2);

    posted.clear();
    assert(pumpUntil([&] { return !posted.empty(); }) && posted[0].l == 0x20);   // FD_CLOSE once the server hangs up
    for (int i = 0; i < 20; i++) ygNetPoll(post);
    assert(posted.size() == 1);   // FD_CLOSE is posted once
    assert(t.recv(t.ctx, buf, 8) == 0);
    server.join();

    int32_t h = c->sock;
    ygSocketClose(h);
    YgTransport dead = ygSocketTransport(h);
    assert(dead.recv(dead.ctx, buf, 1) < -1 && dead.send(dead.ctx, buf, 1) < 0);
    ygSocketClose(h);   // twice: harmless, like closesocket on a stale handle

    close(lfd);   // nothing listens there any more: refused
    YgConn* r = ygConnNew();
    ygConnectAsync("127.0.0.1", port, r, 0);
    assert(pumpUntil([&] { return r->state != YGC_CONNECTING; }) && r->state == YGC_FAILED && r->err == 10061);

    YgConn* u = ygConnNew();
    ygConnectAsync("no-such-host.invalid", 1, u, 0);
    assert(u->state == YGC_FAILED);

    uint16_t port2;
    int lfd2 = listenLocal(&port2);
    YgConn* f = ygConnNew();
    ygConnectAsync("127.0.0.1", port2, f, 0);
    ygNetForget(f);   // freed mid-connect (CMessageIOBase::disconnect): the poll must not touch it
    f->state = 77;
    for (int i = 0; i < 50; i++) { ygNetPoll(post); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
    assert(f->state == 77);
    close(lfd2);

    printf("ygnet_test ok\n");
}
