// ponytail: POSIX only (macOS/Linux). A Windows-native build swaps in Winsock: closesocket/ioctlsocket/WSAGetLastError.
#include "net.h"

#include <cerrno>
#include <cstdio>
#include <fcntl.h>
#include <netdb.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

struct NetSocket {
    int fd;
    NetStatus status;
};

#ifdef MSG_NOSIGNAL
static const int SEND_FLAGS = MSG_NOSIGNAL;
#else
static const int SEND_FLAGS = 0;   // macOS: SO_NOSIGPIPE is set on the socket instead
#endif

NetSocket* netConnect(const char* host, int port) {
    addrinfo hints{}, *res = nullptr;
    hints.ai_family = AF_INET;   // the game only knows IPv4 (gethostbyname + inet_addr)
    hints.ai_socktype = SOCK_STREAM;
    char portStr[8];
    snprintf(portStr, sizeof portStr, "%d", port);
    if (getaddrinfo(host, portStr, &hints, &res) != 0) return nullptr;
    int fd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (fd < 0) { freeaddrinfo(res); return nullptr; }
#ifdef SO_NOSIGPIPE
    int one = 1;
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
    int r = connect(fd, res->ai_addr, res->ai_addrlen);
    freeaddrinfo(res);
    if (r != 0 && errno != EINPROGRESS) { close(fd); return nullptr; }
    return new NetSocket{fd, r == 0 ? NET_OPEN : NET_CONNECTING};
}

NetStatus netStatus(NetSocket* s) {
    if (s->status != NET_CONNECTING) return s->status;
    pollfd p{s->fd, POLLOUT, 0};
    if (poll(&p, 1, 0) <= 0) return s->status;
    int err = 0;
    socklen_t len = sizeof err;
    getsockopt(s->fd, SOL_SOCKET, SO_ERROR, &err, &len);
    s->status = err ? NET_CLOSED : NET_OPEN;
    return s->status;
}

static int recvCb(void* ctx, uint8_t* buf, int len) {
    NetSocket* s = (NetSocket*)ctx;
    ssize_t n = recv(s->fd, buf, len, 0);
    if (n > 0) return (int)n;
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) return -1;
    s->status = NET_CLOSED;
    return n == 0 ? 0 : -2;
}

// Like FUN_0068a530: keep going until everything is out.
static int sendCb(void* ctx, const uint8_t* buf, int len) {
    NetSocket* s = (NetSocket*)ctx;
    int done = 0;
    while (done < len) {
        ssize_t n = send(s->fd, buf + done, len - done, SEND_FLAGS);
        if (n > 0) { done += (int)n; continue; }
        if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) {
            pollfd p{s->fd, POLLOUT, 0};
            poll(&p, 1, 1000);
            continue;
        }
        s->status = NET_CLOSED;
        return -2;
    }
    return done;
}

int netEvent(NetSocket* s) {
    if (s->status == NET_CLOSED) return 0x20;
    if (netStatus(s) != NET_OPEN) return 0;
    pollfd p{s->fd, POLLIN, 0};
    if (poll(&p, 1, 0) <= 0) return 0;
    char c;
    ssize_t n = recv(s->fd, &c, 1, MSG_PEEK);
    if (n > 0) return 1;
    return n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) ? 0 : 0x20;
}

YgTransport netTransport(NetSocket* s) { return YgTransport{s, recvCb, sendCb}; }

void netClose(NetSocket* s) {
    if (!s) return;
    close(s->fd);
    delete s;
}
