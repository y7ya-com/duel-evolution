// One TCP connection to a yo2 server: the connection record (FUN_0068b5d0..FUN_0068bb60) and CMessageIOBase, the
// base of CNetGate / CNetAccount / CNetLobby / CNetDuel / CNetUsb (FUN_0068cba0..FUN_0068d080).
//
// Named, portable versions of the generated include/yo2 classes (same RTTI names). Offsets are the exe's: YO2_AT
// checks them on a 32-bit build, and tests/net_layout.cpp checks every named field against include/yo2. We don't use
// the generated classes directly because they type pointers as u32 (no 64-bit build) and miss fields the lobby and
// account use; see HEADER_ISSUES.md. vtable pointers are plain u32 slots: these classes are not polymorphic here.
#pragma once
#include <cstddef>
#include <cstdint>

#include "ygpacket.h"

// The CNet* classes extend CMessageIOBase, so offsetof on them is "conditionally supported"; gcc and clang do it.
#pragma GCC diagnostic ignored "-Winvalid-offsetof"
#define YO2_AT(T, f, off) static_assert(sizeof(void*) != 4 || offsetof(T, f) == (off), #T "::" #f " offset")

enum YgConnState : int32_t {
    YGC_FAILED = -1,
    YGC_IDLE = 0,
    YGC_CONNECTING = 1,
    YGC_CONNECTED = 2,
    YGC_CLOSING = 3,
};

enum : int32_t {
    YG_BAD_SEQUENCE = -203,   // a message arrived out of order (param != last + 1)
    YG_NO_SERVER = -120,      // the gate list has no server of the wanted kind
    YG_NO_GATE = -24,
    YG_VERSION_ERROR = -121,  // 0x2002 refused our version
};

struct YgConn {
    int32_t sock;      // 0x00 WSOCK32 socket, -1 = none
    int32_t recvSeq;   // 0x04 messages received on this connection
    int32_t sendSeq;   // 0x08 messages sent (each carries ++sendSeq as its param)
    YgPacket* pkt;     // 0x0c receive buffer
    int32_t state;     // 0x10 YgConnState
    int32_t err;       // 0x14 last WSAGetLastError
};
YO2_AT(YgConn, pkt, 0x0c);
YO2_AT(YgConn, err, 0x14);

YgConn* ygConnNew();                            // FUN_0068b5d0
void ygConnFree(YgConn* c);                     // FUN_0068b610
int32_t ygConnAllocPacket(YgConn* c);           // FUN_0068b630
void ygConnFreePacket(YgConn* c);               // FUN_0068b680
int32_t ygConnState(const YgConn* c);           // FUN_0068b950
int32_t ygConnError(const YgConn* c);           // FUN_0068b980
int32_t ygConnClose(YgConn* c);                 // FUN_0068ba20
int32_t ygConnRecv(YgConn* c, YgPacket* p);     // FUN_0068bac0
int32_t ygConnRecvOwn(YgConn* c);               // FUN_0068ba90
int32_t ygConnSend(YgConn* c, YgPacket* p);     // FUN_0068bb60
int32_t ygConnSelect(YgConn* c, uint32_t notify);   // FUN_0068b9b0

void ygMd5(const void* data, int len, uint8_t out[16]);   // FUN_0068bbb0

// Supplied by the platform layer (phase 3) or by a test.
YgTransport ygSocketTransport(int32_t sock);    // recv/send on that socket
void ygSocketClose(int32_t sock);               // closesocket (WSOCK32 #3)
// FUN_0068b7e0 + its thread FUN_0068b6c0: resolve host, connect, then set c->sock / c->state / c->err.
// Returns 0 once the attempt is under way (-11 out of memory).
int32_t ygConnectAsync(const char* host, uint16_t port, YgConn* c, uint32_t notify);
// WSAAsyncSelect(sock, notify, 0x1401, FD_READ | FD_CLOSE) (WSOCK32 #101): 0 or -1.
int32_t ygSocketSelect(int32_t sock, uint32_t notify);

struct CMessageIOBase {
    uint32_t _vtbl;        // 0x000
    char host[16];         // 0x004 portable: an MSVC6 std::string {alloc, ptr, len, res} in the exe; a dotted IPv4 fits
    uint16_t port;         // 0x014
    uint32_t notify;       // 0x018 window message target for WSAAsyncSelect
    uint8_t req[0xc8];     // 0x01c one byte per request kind: 1 = sent, 2 = answered (see each subclass)
    uint8_t byeSent;       // 0x0e4
    int32_t lastRecv;      // 0x0e8 time() of the last message received
    int32_t lastPing;      // 0x0ec time() of the last keep-alive
    YgConn* conn;          // 0x0f0
    YgPacket out;          // 0x0f4 the message being built

    uint8_t& flag(int off) { return req[off - 0x1c]; }   // flag(0x21) = the byte at +0x21
    bool takeAnswer(int off);  // FUN_006a5b90: flag(off) == 2 -> cleared, true

    void init();               // FUN_0068cba0
    void destroy();            // FUN_0068cc40
    void ensureConn();         // FUN_0068cd00
    int32_t connect();         // FUN_0068cd30 (vtable slot 1)
    void disconnect();         // FUN_0068cdf0
    int32_t state() const;     // FUN_0068ce50
    int32_t error() const;     // FUN_0068ce70
    int32_t select(uint32_t notifyTo = 0);   // FUN_0068ce90: 0 = this->notify
    int32_t recv();            // FUN_0068cec0
    int32_t hasPacket() const; // FUN_0068cf00: 0 when a receive buffer exists
    int32_t send();            // FUN_0068cf30
    void sendBye();            // FUN_0068cf60
    bool isSocket(int32_t sock) const;   // FUN_0068cfb0
    void keepAlive();          // FUN_0068cff0
    bool timedOut() const;     // FUN_0068d080
    YgPacket* in() const { return conn ? conn->pkt : nullptr; }
};
YO2_AT(CMessageIOBase, port, 0x014);
YO2_AT(CMessageIOBase, req, 0x01c);
YO2_AT(CMessageIOBase, byeSent, 0x0e4);
YO2_AT(CMessageIOBase, lastRecv, 0x0e8);
YO2_AT(CMessageIOBase, conn, 0x0f0);
YO2_AT(CMessageIOBase, out, 0x0f4);
static_assert(sizeof(void*) != 4 || sizeof(CMessageIOBase) == 0x534, "CMessageIOBase size");
