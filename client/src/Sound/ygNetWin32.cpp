#include "ygNetWin32.h"

#if defined(_WIN32)
#include <windows.h>
#include <winsock.h>
#include <process.h>

#include <cstdlib>
#include <cstring>

const uint8_t kYgNetKey[56] = {
    0x01, 0x7f, 0x56, 0x42, 0x86, 0x9a, 0x6b, 0x82, 0x75, 0x19, 0xef, 0xd0, 0x02, 0x73, 0x14, 0x5f,
    0x2b, 0xc9, 0x92, 0xac, 0x23, 0x93, 0x91, 0xda, 0x86, 0x27, 0x88, 0x1e, 0x72, 0x94, 0x0d, 0x37,
    0x63, 0xfc, 0x07, 0x9a, 0x14, 0x08, 0x91, 0x96, 0x84, 0x3b, 0xbc, 0x76, 0x28, 0x0a, 0x1f, 0x39,
    0x65, 0x5c, 0xdd, 0x21, 0x7b, 0x98, 0x18, 0x3c};

namespace {
enum : int32_t {
    kNoMemory = -11,
    kBadArgument = -12,
    kSendError = -212,
    kWsaStartup = -801,
    kWsaVersion = -802,
    kNoSocket = -810,
    kConnectFailed = -812,
    kNoHost = -816,
};
constexpr UINT WM_YG_CONNECTED = 0x1400;  // posted to the notify window when the connect thread is done

struct ConnectJob {   // 0x10 bytes, malloc'd; the thread frees it
    char* host;       // 0x00 strdup'd
    uint16_t port;    // 0x04
    YgConn* conn;     // 0x08
    uint32_t notify;  // 0x0c the window
};
static_assert(sizeof(void*) != 4 || sizeof(ConnectJob) == 0x10, "ConnectJob");

// @yo2 0x0068b8d0 the connect thread: connect, tell the window, free the job
void __cdecl connectThread(void* arg) {
    auto* job = static_cast<ConnectJob*>(arg);
    if (!job)
        _endthread();
    YgConn* c = job->conn;
    uint32_t notify = job->notify;
    ygConnectBlocking(job->host, job->port, c);
    PostMessageA(reinterpret_cast<HWND>(static_cast<uintptr_t>(notify)), WM_YG_CONNECTED,
                 static_cast<WPARAM>(c->sock), 0);
    std::free(job->host);
    std::free(job);
    _endthread();
}
}  // namespace

// @yo2 0x0068a530 send everything, retrying while the socket would block
int32_t ygSendAll(uintptr_t sock, const char* buf, int32_t len) {
    for (int32_t left = len; left > 0;) {
        int r = send(static_cast<SOCKET>(sock), buf, left, 0);
        if (r == SOCKET_ERROR) {
            if (WSAGetLastError() != WSAEWOULDBLOCK)
                return kSendError;
            continue;
        }
        left -= r;
        buf += r;
    }
    return len;
}

// @yo2 0x0068b3e0 network start-up: WinSock 1.1, then the message cipher's key
int32_t ygNetStartup(void (*setKey)(const uint8_t* key, int len)) {
    uint8_t key[sizeof kYgNetKey];
    std::memcpy(key, kYgNetKey, sizeof key);
    WSADATA wsa;
    if (WSAStartup(0x101, &wsa) != 0)
        return kWsaStartup;
    if (wsa.wVersion != 0x101)
        return kWsaVersion;
    setKey(key, sizeof key);
    return 0;
}

// @yo2 0x0068b6c0 blocking connect (run by connectThread)
int32_t ygConnectBlocking(const char* host, uint16_t port, YgConn* c) {
    sockaddr_in sin;
    std::memset(&sin, 0, sizeof sin);
    c->state = YGC_CONNECTING;
    SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
    c->sock = static_cast<int32_t>(s);
    if (s == INVALID_SOCKET) {
        c->err = WSAGetLastError();
        c->state = YGC_FAILED;
        return kNoSocket;
    }
    unsigned long addr = inet_addr(host);
    if (addr == INADDR_NONE) {
        hostent* he = gethostbyname(host);
        if (!he) {
            c->err = WSAGetLastError();  // (the state stays CONNECTING)
            return kNoHost;
        }
        addr = *reinterpret_cast<unsigned long*>(he->h_addr_list[0]);
    }
    sin.sin_addr.s_addr = addr;
    sin.sin_family = AF_INET;
    sin.sin_port = htons(port);
    if (connect(s, reinterpret_cast<sockaddr*>(&sin), sizeof sin) != 0) {
        c->err = WSAGetLastError();
        c->state = YGC_FAILED;
        return kConnectFailed;
    }
    c->err = 0;
    c->state = YGC_CONNECTED;
    return 0;
}

// @yo2 0x0068b7e0 start connecting on a worker thread
int32_t ygConnectStart(const char* host, uint16_t port, YgConn* c, uint32_t notify) {
    if (!c || !host)
        return kBadArgument;
    auto* job = static_cast<ConnectJob*>(std::malloc(sizeof(ConnectJob)));
    if (!job)
        return kNoMemory;
    job->host = static_cast<char*>(std::malloc(std::strlen(host) + 1));
    if (!job->host)
        return kNoMemory;  // (the exe leaks the job here too)
    std::strcpy(job->host, host);
    job->conn = c;
    job->port = port;
    job->notify = notify;
    _beginthread(connectThread, 0, job);
    return 0;
}
#endif
