#include "MessageIO.h"

#include <cstdlib>
#include <cstring>
#include <ctime>

#include "md5.h"

static int32_t now() { return (int32_t)time(nullptr); }   // FUN_00b0c488(0) = CRT time()

// ---- connection record

// @yo2 0x0068b5d0
YgConn* ygConnNew() {
    YgConn* c = (YgConn*)malloc(sizeof(YgConn));
    if (!c) return nullptr;
    *c = YgConn{-1, 0, 0, nullptr, YGC_IDLE, 0};
    return c;
}

// @yo2 0x0068b610
void ygConnFree(YgConn* c) { free(c); }

// @yo2 0x0068b630 allocate and clear the receive buffer
int32_t ygConnAllocPacket(YgConn* c) {
    if (!c) return YG_BAD_ARGS;
    c->pkt = (YgPacket*)malloc(sizeof(YgPacket));
    if (!c->pkt) return -11;
    ygClear(c->pkt);
    return YG_OK;
}

// @yo2 0x0068b680
void ygConnFreePacket(YgConn* c) {
    if (!c || !c->pkt) return;
    free(c->pkt);
    c->pkt = nullptr;
}

// @yo2 0x0068b950
int32_t ygConnState(const YgConn* c) { return c ? c->state : YG_BAD_ARGS; }

// @yo2 0x0068b980
int32_t ygConnError(const YgConn* c) { return c ? c->err : YG_BAD_ARGS; }

// @yo2 0x0068ba20 close a connected socket and reset the counters (the socket number itself is kept)
int32_t ygConnClose(YgConn* c) {
    if (!c) return YG_BAD_ARGS;
    if (c->state == YGC_CONNECTED) {
        c->state = YGC_CLOSING;
        ygSocketClose(c->sock);
        c->recvSeq = 0;
        c->sendSeq = 0;
        c->state = YGC_IDLE;
        ygConnFreePacket(c);
    }
    return YG_OK;
}

// @yo2 0x0068bac0 receive (resumable) and check the sequence: every message must carry the previous one + 1
int32_t ygConnRecv(YgConn* c, YgPacket* p) {
    if (!c || !p) return YG_BAD_ARGS;
    int32_t r = ygRecv(p, ygSocketTransport(c->sock));
    if (r == YG_OK && p->param != ++c->recvSeq) return YG_BAD_SEQUENCE;
    return r;
}

// @yo2 0x0068ba90
int32_t ygConnRecvOwn(YgConn* c) { return ygConnRecv(c, c->pkt); }

// @yo2 0x0068bb60 send with the next sequence number
int32_t ygConnSend(YgConn* c, YgPacket* p) {
    if (!c || !p) return YG_BAD_ARGS;
    p->param = ++c->sendSeq;
    return ygSend(p, ygSocketTransport(c->sock));
}

// @yo2 0x0068bbb0 MD5 of one buffer (login digest, room / chat-room passwords)
void ygMd5(const void* data, int len, uint8_t out[16]) {
    if (!data || !out) return;
    Md5 m;
    m.update(data, len);
    m.final(out);
}

// @yo2 0x0068b9b0 -820 when WSAAsyncSelect fails
int32_t ygConnSelect(YgConn* c, uint32_t notify) {
    if (!c) return YG_BAD_ARGS;
    return ygSocketSelect(c->sock, notify) == -1 ? -820 : YG_OK;
}

// ---- CMessageIOBase

// @yo2 0x0068cba0 constructor
void CMessageIOBase::init() {
    memset(this, 0, sizeof *this);
}

// @yo2 0x0068cc40 destructor body
void CMessageIOBase::destroy() {
    disconnect();
    memset(host, 0, sizeof host);
    port = 0;
}

// @yo2 0x0068cd00
void CMessageIOBase::ensureConn() {
    if (!conn) conn = ygConnNew();
}

// @yo2 0x0068cd30 start connecting to host:port (the result arrives later through the platform's notification)
int32_t CMessageIOBase::connect() {
    if (conn) {
        int32_t r = ygConnAllocPacket(conn);
        if (r != YG_OK) return r;
    }
    lastRecv = now();
    byeSent = 0;
    if (!conn) return YG_BAD_ARGS;   // the original's thread start refuses a null record
    return ygConnectAsync(host, port, conn, notify);
}

// @yo2 0x0068cdf0 say goodbye, close and drop the connection record
void CMessageIOBase::disconnect() {
    sendBye();
    ygConnClose(conn);
    ygConnFreePacket(conn);   // fix: the original leaks the buffer when the socket never reached "connected"
    ygConnFree(conn);
    conn = nullptr;
}

// @yo2 0x0068ce50
int32_t CMessageIOBase::state() const { return ygConnState(conn); }

// @yo2 0x0068ce70
int32_t CMessageIOBase::error() const { return ygConnError(conn); }

// @yo2 0x0068ce90 ask for FD_READ / FD_CLOSE notifications
int32_t CMessageIOBase::select(uint32_t notifyTo) { return ygConnSelect(conn, notifyTo ? notifyTo : notify); }

// @yo2 0x0068cec0 called on FD_READ, so lastRecv tracks the last time data came in
int32_t CMessageIOBase::recv() {
    int32_t r = ygConnRecvOwn(conn);
    lastRecv = now();
    return r;
}

// @yo2 0x006a5b90
bool CMessageIOBase::takeAnswer(int off) {
    if (flag(off) != 2) return false;
    flag(off) = 0;
    return true;
}

// @yo2 0x0068cf00
int32_t CMessageIOBase::hasPacket() const { return conn && conn->pkt ? YG_OK : YG_BAD_ARGS; }

// @yo2 0x0068cf30
int32_t CMessageIOBase::send() { return ygConnSend(conn, &out); }

// @yo2 0x0068cf60 0x0003 goodbye
void CMessageIOBase::sendBye() {
    if (!conn) return;
    ygClear(&out);
    ygBegin(&out, 0x0003);
    ygEnd(&out);
    send();
    byeSent = 1;
}

// @yo2 0x0068cfb0
bool CMessageIOBase::isSocket(int32_t sock) const { return conn && conn->sock == sock; }

// @yo2 0x0068cff0 0x0005 keep-alive once a minute while connected
void CMessageIOBase::keepAlive() {
    if (!conn || state() != YGC_CONNECTED || now() - lastPing <= 59) return;
    ygClear(&out);
    ygBegin(&out, 0x0005);
    ygEnd(&out);
    send();
    lastPing = now();
}

// @yo2 0x0068d080 nothing received for over two minutes
bool CMessageIOBase::timedOut() const { return conn && now() - lastRecv > 120; }
