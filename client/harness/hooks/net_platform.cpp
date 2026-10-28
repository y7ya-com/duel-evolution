// The three socket calls src/Net/MessageIO.h expects from "the platform", for the Windows build that runs inside
// yo2.exe: WinSock directly, and the connect thread is the exe's own. (platform/net covers native + web.)
#include <winsock.h>

#include "Net/MessageIO.h"

static int wsRecv(void* ctx, uint8_t* b, int n) {
    int r = recv((SOCKET)(uintptr_t)ctx, (char*)b, n, 0);
    if (r >= 0) return r;
    return WSAGetLastError() == WSAEWOULDBLOCK ? -1 : -2;
}

// @yo2 0x0068a530 send everything, spinning while the socket would block; returns len or -212
static int wsSendAll(void* ctx, const uint8_t* b, int len) {
    for (int left = len; left > 0;) {
        int r = send((SOCKET)(uintptr_t)ctx, (const char*)b, left, 0);
        if (r == SOCKET_ERROR) {
            if (WSAGetLastError() != WSAEWOULDBLOCK) return -212;
            continue;
        }
        left -= r;
        b += r;
    }
    return len;
}

YgTransport ygSocketTransport(int32_t sock) { return YgTransport{(void*)(uintptr_t)sock, wsRecv, wsSendAll}; }

void ygSocketClose(int32_t sock) { closesocket((SOCKET)sock); }

// FUN_0068b7e0 (cdecl): copies host, starts its connect thread FUN_0068b6c0, which fills c->sock/state/err;
// 0, or the error if the thread didn't start
int32_t ygConnectAsync(const char* host, uint16_t port, YgConn* c, uint32_t notify) {
    using Fn = int32_t(__cdecl*)(const char*, uint16_t, YgConn*, uint32_t);
    return reinterpret_cast<Fn>(0x0068b7e0)(host, port, c, notify);
}

// WSAAsyncSelect(sock, notify, 0x1401, FD_READ | FD_CLOSE), as FUN_0068b9b0 does
int32_t ygSocketSelect(int32_t sock, uint32_t notify) {
    return WSAAsyncSelect((SOCKET)sock, (HWND)(uintptr_t)notify, 0x1401, FD_READ | FD_CLOSE) == SOCKET_ERROR ? -1 : 0;
}
