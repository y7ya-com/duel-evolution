// The WinSock side of the message layer, which the linker put in the Sound objects' range (labels.tsv: Sound):
// start-up, the blocking connect run on a worker thread, and the send loop. src/Net talks to sockets through the
// platform functions in Net/MessageIO.h; this is what the exe itself has for them, built only for Windows (the
// harness DLL runs it inside yo2.exe; native/web builds use platform/net).
#pragma once
#include <cstdint>

#include "Net/MessageIO.h"

#if defined(_WIN32)
// 0x0068a530: send all `len` bytes, retrying while the socket would block. len, or -212 on a socket error.
int32_t ygSendAll(uintptr_t sock, const char* buf, int32_t len);
// 0x0068b3e0: WSAStartup(1.1) and key the message cipher (`setKey` is Net's ygSetCipherKey unless the caller says
// otherwise). 0, -801 if WSAStartup fails, -802 if 1.1 isn't available.
int32_t ygNetStartup(void (*setKey)(const uint8_t* key, int len) = ygSetCipherKey);
// 0x0068b6c0: socket, resolve (dotted address or DNS), connect; fills c->sock / c->state / c->err.
int32_t ygConnectBlocking(const char* host, uint16_t port, YgConn* c);
// 0x0068b7e0 (__stdcall in the exe): run ygConnectBlocking on a thread, then post 0x1400 (wParam = the socket) to the `notify` window.
// 0, or -12 (no host / no record), -11 (out of memory).
int32_t ygConnectStart(const char* host, uint16_t port, YgConn* c, uint32_t notify);

// What ygNetStartup keys the message cipher with (src/Net/ygpacket.cpp's NET_KEY; the exe builds it on the stack).
extern const uint8_t kYgNetKey[56];
#endif
