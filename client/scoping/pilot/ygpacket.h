// yo2 wire codec, rewritten from yo2.exe Ver.080912: FUN_0068a320 (Send) and FUN_00689ea0 (Recv).
// Same object layout and return codes as the original; the socket is a callback so the same code runs over
// WinSock, a test harness or a WebSocket.
#pragma once
#include <cstddef>
#include <cstdint>

struct YgTransport {
    void* ctx;
    // recv: >0 bytes read, 0 closed, -1 would block (WSAEWOULDBLOCK), <-1 other error
    int (*recv)(void* ctx, uint8_t* buf, int len);
    // send: bytes sent or <0 error (FUN_0068a530 loops until everything is sent)
    int (*send)(void* ctx, const uint8_t* buf, int len);
};

enum YgState : int16_t {
    YG_SENT = 3,            // header built, sending
    YG_SENT_OK = 4,
    YG_READ_HEAD = 5,
    YG_READ_BODY = 6,
    YG_COMPLETE = 7,
    YG_BROKEN = 0xff,       // stream desynced; the client drops the connection
};

enum YgResult : int32_t {   // original return values
    YG_OK = 0,
    YG_BAD_ARGS = -12,
    YG_PENDING = -50,       // need more bytes (would block / partial)
    YG_HEAD_CLOSED = -101,
    YG_HEAD_ERROR = -111,
    YG_TOO_LONG = -206,     // len > 0x400 (B04 in YOLaucher's notes)
    YG_BODY_CLOSED = -207,
    YG_BODY_ERROR = -208,
    YG_BAD_MD5 = -209,
    YG_SEND_ERROR = -302,
};

struct YgPacket {
    int32_t id;              // 0x000
    int32_t len;             // 0x004
    int32_t param;           // 0x008 sequence number ("parámetro"), 1, 2, 3... per connection
    uint8_t head[24];        // 0x00c wire header: id, len, param (big-endian) + MD5(head[0:8] + data)
    uint8_t data[0x400];     // 0x024
    uint8_t md5[16];         // 0x424 MD5 as received
    int32_t headGot;         // 0x434
    int32_t bodyGot;         // 0x438
    int16_t state;           // 0x43c YgState
};
static_assert(offsetof(YgPacket, head) == 0x00c, "layout");
static_assert(offsetof(YgPacket, data) == 0x024, "layout");
static_assert(offsetof(YgPacket, md5) == 0x424, "layout");
static_assert(offsetof(YgPacket, headGot) == 0x434, "layout");
static_assert(offsetof(YgPacket, state) == 0x43c, "layout");

int32_t ygSend(YgPacket* p, const YgTransport& t);   // FUN_0068a320
int32_t ygRecv(YgPacket* p, const YgTransport& t);   // FUN_00689ea0
