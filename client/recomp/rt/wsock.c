// WSOCK32 (by ordinal) on BSD sockets. WSAAsyncSelect: the USER32 pump calls rc_net_poll(), which posts the
// game's socket message (0x1401: wParam = socket, lParam = FD_READ 1 / FD_CLOSE 0x20) like Windows does.
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <unistd.h>

#include "win.h"

#define SOCK_BASE 0x1000u
#define MAXS 64
static struct { uint32_t hwnd, msg, events; int armed_read, closed; } as[MAXS];   // by fd
#define last_err (c->thread->last_error)   // WSAGetLastError is GetLastError: per thread (the connect thread
                                           // and the main thread use sockets at once)
void rc_post(uint32_t hwnd, uint32_t msg, uint32_t w, uint32_t l);
// cardwire.cpp: real passcodes on the wire (a v2 server), the exe's card ids inside; a pass-through otherwise
void rc_cw_open(int s);
void rc_cw_close(int s);
int rc_cw_recv(int s, uint8_t *out, int n, int (*raw)(int, uint8_t *, int), int (*rawSend)(int, const uint8_t *, int));
int rc_cw_send(int s, const uint8_t *p, int n, int (*rawSend)(int, const uint8_t *, int));
int rc_cw_pending(int s);
int rc_cw_v2(int s);

static int fd_of(uint32_t s) { return s >= SOCK_BASE && s < SOCK_BASE + MAXS ? (int)(s - SOCK_BASE) : -1; }
static int wsa_err(int e) {
    switch (e) {
    case EWOULDBLOCK: return 10035;
    case EINPROGRESS: return 10036;
    case ECONNREFUSED: return 10061;
    case ECONNRESET: return 10054;
    case ENOTCONN: return 10057;
    case ETIMEDOUT: return 10060;
    default: return 10050;   // WSAENETDOWN
    }
}

IMP(WSOCK32, ord115) {   // WSAStartup(version, WSADATA*)
    memset(G(ARG(1)), 0, 400);
    rc_wr16(rc_mem + ARG(1), 0x0101);
    rc_wr16(rc_mem + ARG(1) + 2, 0x0202);
    RET(2, 0);
}
IMP(WSOCK32, ord116) { RET(0, 0); }    // WSACleanup
IMP(WSOCK32, ord111) { RET(0, last_err); }   // WSAGetLastError
IMP(WSOCK32, ord113) { RET(0, 0); }    // WSACancelBlockingCall
IMP(WSOCK32, ord9) { RET(1, htons((uint16_t)ARG(0))); }   // htons
IMP(WSOCK32, ord10) { RET(1, inet_addr(GS(ARG(0)))); }    // inet_addr: network order, same bytes on both sides
#ifdef __EMSCRIPTEN__
#include "web_wsock.c"   // the WebSocket gateway in place of BSD sockets
#else
IMP(WSOCK32, ord23) {   // socket(af, type, proto)
    int fd = socket(AF_INET, ARG(1) == 1 ? SOCK_STREAM : SOCK_DGRAM, 0);
    if (fd < 0 || fd >= MAXS) { last_err = 10024; if (fd >= 0) close(fd); RET(3, 0xffffffffu); }
    int one = 1;
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
    memset(&as[fd], 0, sizeof as[fd]);
    RET(3, SOCK_BASE + (uint32_t)fd);
}
IMP(WSOCK32, ord4) {   // connect(s, sockaddr*, len): the guest's is {u16 family LE, u16 port BE, u32 addr, 8 zero}
    struct sockaddr_in sa = {.sin_len = sizeof sa, .sin_family = AF_INET};
    memcpy(&sa.sin_port, G(ARG(1) + 2), 2);
    memcpy(&sa.sin_addr, G(ARG(1) + 4), 4);
    if (getenv("YO2_SERVER")) inet_pton(AF_INET, getenv("YO2_SERVER"), &sa.sin_addr);   // as net_hook.js: every
    uint16_t port = ntohs(sa.sin_port);                                                     // game socket -> the server
    if (getenv("YO2_PORT_OFFSET") && port >= 5730 && port < 5800)   // a test run.py: only the exe's own ports, the
        sa.sin_port = htons((uint16_t)(port + atoi(getenv("YO2_PORT_OFFSET"))));   // server's lists carry the offset
    int fd = fd_of(ARG(0));
    rc_log("wsock: connect %s:%u", inet_ntoa(sa.sin_addr), ntohs(sa.sin_port));
    if (connect(fd, (struct sockaddr *)&sa, sizeof sa) < 0) { last_err = wsa_err(errno); RET(3, 0xffffffffu); }
    rc_cw_open(fd);
    RET(3, 0);
}
IMP(WSOCK32, ord3) {   // closesocket
    int fd = fd_of(ARG(0));
    if (fd >= 0) { close(fd); memset(&as[fd], 0, sizeof as[fd]); rc_cw_close(fd); }
    RET(1, 0);
}
static int raw_err;   // errno of the codec's last raw recv/send
static int raw_recv(int fd, uint8_t *b, int n) {
    ssize_t k = recv(fd, b, n, 0);
    raw_err = errno;
    return k >= 0 ? (int)k : errno == EWOULDBLOCK ? -1 : -2;
}
static int raw_send_all(int fd, const uint8_t *b, int n) {   // the codec's frames go out whole
    for (int at = 0; at < n;) {
        ssize_t k = send(fd, b + at, n - at, 0);
        if (k < 0 && errno == EWOULDBLOCK) { struct pollfd p = {fd, POLLOUT, 0}; poll(&p, 1, 100); continue; }
        if (k < 0) { raw_err = errno; return -2; }
        at += (int)k;
    }
    return n;
}
IMP(WSOCK32, ord16) {   // recv(s, buf, len, flags)
    int fd = fd_of(ARG(0));
    int k = rc_cw_recv(fd, G(ARG(1)), (int)ARG(2), raw_recv, raw_send_all);
    if (fd >= 0) as[fd].armed_read = 1;   // Windows re-enables FD_READ after each recv
    if (k == -1) { last_err = 10035; RET(4, 0xffffffffu); }   // WSAEWOULDBLOCK
    if (k < 0) { last_err = wsa_err(raw_err); RET(4, 0xffffffffu); }
    RET(4, (uint32_t)k);
}
IMP(WSOCK32, ord19) {   // send(s, buf, len, flags)
    rc_deck_tap(G(ARG(1)), (int)ARG(2));   // decktap.c: the duel deck, for the web's card-art prefetch
    int fd = fd_of(ARG(0));
    if (rc_cw_v2(fd)) {
        int k = rc_cw_send(fd, G(ARG(1)), (int)ARG(2), raw_send_all);
        if (k < 0) { last_err = wsa_err(raw_err); RET(4, 0xffffffffu); }
        RET(4, (uint32_t)k);
    }
    ssize_t k = send(fd, G(ARG(1)), ARG(2), 0);
    if (k < 0) { last_err = wsa_err(errno); RET(4, 0xffffffffu); }
    RET(4, (uint32_t)k);
}
IMP(WSOCK32, ord52) {   // gethostbyname -> a hostent in guest memory (one static per process, as Windows)
    static uint32_t he;
    rc_log("wsock: gethostbyname(%s)%s", GS(ARG(0)), getenv("YO2_SERVER") ? " -> YO2_SERVER" : "");
    struct hostent *h = gethostbyname(getenv("YO2_SERVER") ? getenv("YO2_SERVER") : GS(ARG(0)));
    if (!h || h->h_addrtype != AF_INET) { last_err = 11001; RET(1, 0); }
    if (!he) he = rc_halloc(64, 1);
    // hostent: name, aliases, short type, short len, addr_list -> [addr0, 0] ; addr at he+32, alias list at he+24
    WR32m(he, he + 40); WR32m(he + 4, he + 24); rc_wr16(rc_mem + he + 8, 2); rc_wr16(rc_mem + he + 10, 4);
    WR32m(he + 12, he + 16); WR32m(he + 16, he + 32); WR32m(he + 20, 0); WR32m(he + 24, 0);
    memcpy(G(he + 32), h->h_addr_list[0], 4);
    WR8m(he + 40, 0);
    RET(1, he);
}
IMP(WSOCK32, ord101) {   // WSAAsyncSelect(s, hwnd, msg, events): socket becomes non-blocking
    int fd = fd_of(ARG(0));
    if (fd < 0) RET(4, 0xffffffffu);
    as[fd].hwnd = ARG(1);
    as[fd].msg = ARG(2);
    as[fd].events = ARG(3);
    as[fd].armed_read = 1;
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
    RET(4, 0);
}

void rc_net_poll(void) {
    for (int fd = 0; fd < MAXS; fd++) {
        if (!as[fd].msg || as[fd].closed || !as[fd].armed_read) continue;
        if (rc_cw_pending(fd) && (as[fd].events & 1)) {   // frames the codec already holds for the exe
            as[fd].armed_read = 0;
            rc_post(as[fd].hwnd, as[fd].msg, SOCK_BASE + fd, 1);
            continue;
        }
        struct pollfd p = {fd, POLLIN, 0};
        if (poll(&p, 1, 0) <= 0) continue;
        char b;
        ssize_t k = recv(fd, &b, 1, MSG_PEEK);
        if (k > 0 && (as[fd].events & 1)) {
            as[fd].armed_read = 0;
            rc_post(as[fd].hwnd, as[fd].msg, SOCK_BASE + fd, 1);
        } else if (k == 0 || (k < 0 && errno != EWOULDBLOCK)) {
            as[fd].closed = 1;
            if (as[fd].events & 0x20) rc_post(as[fd].hwnd, as[fd].msg, SOCK_BASE + fd, 0x20);
        }
    }
}
#endif
