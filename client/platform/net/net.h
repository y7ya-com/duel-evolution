// Non-blocking client sockets behind YgTransport (src/Net/ygpacket.h).
// Native: BSD sockets. Web: one WebSocket to Boxedwine's network-gateway.mjs, many sockets multiplexed on it
// (see platform/DESIGN.md, "Network"). Both are polled from the game loop, the way the original polls after
// WSAAsyncSelect's FD_CONNECT / FD_READ messages.
#pragma once
#include "Net/ygpacket.h"

struct NetSocket;

enum NetStatus { NET_CONNECTING, NET_OPEN, NET_CLOSED };

NetSocket* netConnect(const char* host, int port);   // starts connecting; nullptr if it failed at once
NetStatus netStatus(NetSocket* s);                    // cheap; call every frame until NET_OPEN
YgTransport netTransport(NetSocket* s);               // recv: >0, 0 closed, -1 would block, <-1 error
void netClose(NetSocket* s);                          // also frees s
// What WSAAsyncSelect would report now: FD_READ (1) bytes waiting, FD_CLOSE (0x20) the peer closed, or 0
int netEvent(NetSocket* s);

// ---- src/Net/MessageIO.h's three socket calls (ygSocketTransport, ygSocketClose, ygConnectAsync) live in
// net_yg.cpp on top of the above. Two things the exe did with a thread and WSAAsyncSelect become a per-frame poll:
// Finishes pending ygConnectAsync connects (c->sock/state/err, as the connect thread FUN_0068b6c0 set them), then
// posts 0x1401 (wParam = socket, lParam = FD_READ / FD_CLOSE) for every socket with something to read, the message
// FUN_0068b9b0's WSAAsyncSelect asked for. Call once per frame with platformPostMessage.
void ygNetPoll(void (*post)(uint32_t msg, uintptr_t wParam, intptr_t lParam));
// A connection record is being freed: stop finishing its connect. Net's ygConnFree has to call this (a record can
// be freed mid-connect: CMessageIOBase::disconnect); until it does, the exe's own race (its thread writing into a
// freed record) is reproduced.
struct YgConn;
void ygNetForget(YgConn* c);

#ifdef __EMSCRIPTEN__
// Default ws://127.0.0.1:8001/boxedwine-network. Set before the first netConnect.
void netSetGateway(const char* url);
#endif
