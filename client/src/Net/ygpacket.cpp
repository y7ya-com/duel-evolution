#include "ygpacket.h"

#include <cstring>

#include "blowfish.h"
#include "md5.h"

static const uint8_t KEY[4] = {0x5a, 0xa5, 0x5a, 0x55};   // DAT_00c98498

static void xorKey(uint8_t* b, int n, int start) {
    for (int i = 0; i < n; i++) b[i] ^= KEY[(start + i) & 3];
}

static void digest(const uint8_t head8[8], const uint8_t* data, int len, uint8_t out[16]) {
    Md5 m;
    m.update(head8, 8);   // the original copies head+data into one stack buffer first; same bytes
    m.update(data, len);
    m.final(out);
}

// @yo2 0x0068a320 send
int32_t ygSend(YgPacket* p, const YgTransport& t) {
    if (!p || !t.send) return YG_BAD_ARGS;
    uint8_t* h = p->head;
    h[0] = p->id >> 8;    h[1] = p->id;
    h[2] = p->len >> 8;   h[3] = p->len;
    h[4] = p->param >> 24; h[5] = p->param >> 16; h[6] = p->param >> 8; h[7] = p->param;
    p->state = YG_SENT;
    digest(h, p->data, p->len, h + 8);

    uint8_t wire[24 + 0x400];
    memcpy(wire, h, 24);
    memcpy(wire + 24, p->data, p->len);
    xorKey(wire, 24 + p->len, 0);
    if (t.send(t.ctx, wire, 24 + p->len) < 0) {
        p->state = YG_BROKEN;
        return YG_SEND_ERROR;
    }
    p->state = YG_SENT_OK;
    return YG_OK;
}

// @yo2 0x00689ea0 recv
int32_t ygRecv(YgPacket* p, const YgTransport& t) {
    if (!p || !t.recv) return YG_BAD_ARGS;
    if (p->state != YG_READ_HEAD && p->state != YG_READ_BODY) {
        memset(p->head, 0, sizeof p->head);
        memset(p->data, 0, sizeof p->data);
        p->state = YG_READ_HEAD;
        p->headGot = 0;
    }
    if (p->state == YG_READ_HEAD) {
        int n = t.recv(t.ctx, p->head + p->headGot, 24 - p->headGot);
        if (n == 0) { p->state = YG_BROKEN; return YG_HEAD_CLOSED; }
        if (n < 0) {
            if (n != -1) { p->state = YG_BROKEN; return YG_HEAD_ERROR; }
            return YG_PENDING;
        }
        p->headGot += n;
        if (p->headGot < 24) return YG_PENDING;
        xorKey(p->head, 24, 0);
        const uint8_t* h = p->head;
        p->id = h[0] << 8 | h[1];
        p->len = h[2] << 8 | h[3];
        p->param = (int32_t)((uint32_t)h[4] << 24 | h[5] << 16 | h[6] << 8 | h[7]);
        memcpy(p->md5, h + 8, 16);
        if (p->len == 0) { p->state = YG_COMPLETE; return YG_OK; }   // note: an empty body skips the MD5 check
        if (p->len > 0x400) { p->state = YG_BROKEN; return YG_TOO_LONG; }
        p->state = YG_READ_BODY;
        p->bodyGot = 0;
    }
    int n = t.recv(t.ctx, p->data + p->bodyGot, p->len - p->bodyGot);
    if (n == 0) { p->state = YG_BROKEN; return YG_BODY_CLOSED; }
    if (n < 0) {
        if (n != -1) { p->state = YG_BROKEN; return YG_BODY_ERROR; }
        return YG_PENDING;
    }
    p->bodyGot += n;
    if (p->bodyGot < p->len) return YG_PENDING;
    xorKey(p->data, p->len, 24);
    uint8_t want[16];
    digest(p->head, p->data, p->len, want);
    if (memcmp(want, p->md5, 16) != 0) { p->state = YG_BROKEN; return YG_BAD_MD5; }
    p->state = YG_COMPLETE;
    p->bodyGot = 0;
    return YG_OK;
}

// ---- body fields

// @yo2 0x0068a5a0 reset a packet (param and the received MD5 are left as they were)
void ygClear(YgPacket* p) {
    if (!p) return;
    p->id = 0;
    p->len = 0;
    memset(p->head, 0, sizeof p->head);
    memset(p->data, 0, sizeof p->data);
    p->headGot = 0;
    p->bodyGot = 0;
    p->state = 0;
}

// @yo2 0x0068a5f0 start a message
void ygBegin(YgPacket* p, int32_t id) {
    if (!p) return;
    p->id = id;
    memset(p->data, 0, sizeof p->data);
    p->len = 0;
    p->bodyGot = 0;
    p->state = YG_BUILDING;
}

// @yo2 0x0068a630 finish a message: len = what was written
void ygEnd(YgPacket* p) {
    if (!p) return;
    p->len = p->bodyGot;
    p->bodyGot = 0;
    p->state = YG_BUILT;
}

// @yo2 0x0068a670
void ygBeginRead(YgPacket* p) {
    if (!p) return;
    p->bodyGot = 0;
    p->state = YG_READING;
}

// @yo2 0x0068a6a0
void ygEndRead(YgPacket* p) {
    if (!p) return;
    p->bodyGot = 0;
    p->state = YG_READ_DONE;
}

static int32_t putBE(YgPacket* p, uint32_t v, int n) {
    if (!p) return YG_BAD_ARGS;
    if (p->bodyGot > 0x400 - n) return YG_BODY_FULL;
    for (int s = 8 * (n - 1); s >= 0; s -= 8) p->data[p->bodyGot++] = (uint8_t)(v >> s);
    return YG_OK;
}

static int32_t getBE(YgPacket* p, uint32_t* v, int n) {
    if (!p || !v) return YG_BAD_ARGS;
    if (p->bodyGot > 0x400 - n) return YG_BODY_FULL;
    uint32_t x = 0;
    for (int i = 0; i < n; i++) x = x << 8 | p->data[p->bodyGot++];
    *v = x;
    return YG_OK;
}

// @yo2 0x0068a6d0 put u8 (signed overload)
// @yo2 0x0068a740 put u8 (unsigned overload)
int32_t ygPut8(YgPacket* p, uint8_t v) { return putBE(p, v, 1); }
// @yo2 0x0068a7b0 put u16 (signed overload)
// @yo2 0x0068a830 put u16 (unsigned overload)
int32_t ygPut16(YgPacket* p, uint16_t v) { return putBE(p, v, 2); }
// @yo2 0x0068a8b0 put u32 (signed overload)
// @yo2 0x0068a930 put u32 (unsigned overload)
int32_t ygPut32(YgPacket* p, uint32_t v) { return putBE(p, v, 4); }

// @yo2 0x0068aaf0 put raw bytes
int32_t ygPutBytes(YgPacket* p, const void* src, int n) {
    if (!p || !src) return YG_BAD_ARGS;
    if (p->bodyGot > 0x400 - n) return YG_BODY_FULL;
    memcpy(p->data + p->bodyGot, src, n);
    p->bodyGot += n;
    return YG_OK;
}

// @yo2 0x0068ac10 get u8 (signed overload)
// @yo2 0x0068ac60 get u8 (unsigned overload)
int32_t ygGet8(YgPacket* p, uint8_t* v) {
    uint32_t x;
    int32_t r = getBE(p, v ? &x : nullptr, 1);
    if (r == YG_OK) *v = (uint8_t)x;
    return r;
}

// @yo2 0x0068acb0 get u16 (signed overload)
// @yo2 0x0068ad20 get u16 (unsigned overload)
int32_t ygGet16(YgPacket* p, uint16_t* v) {
    uint32_t x;
    int32_t r = getBE(p, v ? &x : nullptr, 2);
    if (r == YG_OK) *v = (uint16_t)x;
    return r;
}

// @yo2 0x0068ad90 get u32 (unsigned overload)
// @yo2 0x0068ae20 get u32 (signed overload)
int32_t ygGet32(YgPacket* p, uint32_t* v) { return getBE(p, v, 4); }

// @yo2 0x0068b020 get n raw bytes and NUL-terminate them (dst holds n + 1)
int32_t ygGetBytes(YgPacket* p, void* dst, int n) {
    if (!p || !dst) return YG_BAD_ARGS;
    if (p->bodyGot > 0x400 - n) return YG_BODY_FULL;
    memcpy(dst, p->data + p->bodyGot, n);
    ((uint8_t*)dst)[n] = 0;
    p->bodyGot += n;
    return YG_OK;
}

// @yo2 0x0068b0b0 get a string up to delim / NUL / the end of the buffer; the terminator is consumed
int32_t ygGetString(YgPacket* p, char* dst, char delim) {
    if (!p || !dst) return YG_BAD_ARGS;
    int n = 0;
    for (char c; p->bodyGot + n < 0x400 && (c = (char)p->data[p->bodyGot + n]) != delim && c; n++) dst[n] = c;
    dst[n] = 0;
    p->bodyGot += n + 1;
    return YG_OK;
}

// @yo2 0x0068b150
int32_t ygReadPos(const YgPacket* p) {
    if (!p) return YG_BAD_ARGS;
    return p->bodyGot < p->len ? p->bodyGot : -1;
}

// FUN_0068b3e0 (network start-up, after WSAStartup) builds this key byte by byte on the stack.
static const uint8_t NET_KEY[56] = {
    0x01, 0x7f, 0x56, 0x42, 0x86, 0x9a, 0x6b, 0x82, 0x75, 0x19, 0xef, 0xd0, 0x02, 0x73, 0x14, 0x5f,
    0x2b, 0xc9, 0x92, 0xac, 0x23, 0x93, 0x91, 0xda, 0x86, 0x27, 0x88, 0x1e, 0x72, 0x94, 0x0d, 0x37,
    0x63, 0xfc, 0x07, 0x9a, 0x14, 0x08, 0x91, 0x96, 0x84, 0x3b, 0xbc, 0x76, 0x28, 0x0a, 0x1f, 0x39,
    0x65, 0x5c, 0xdd, 0x21, 0x7b, 0x98, 0x18, 0x3c};

// ponytail: keyed with NET_KEY on first use instead of in the WinSock start-up, so nothing has to call it first.
static Blowfish& cipher() {
    static Blowfish bf = [] { Blowfish b; b.setKey(NET_KEY, sizeof NET_KEY); return b; }();
    return bf;
}

// @yo2 0x0068b180 set the message cipher key
void ygSetCipherKey(const uint8_t* key, int len) {
    if (key) cipher().setKey(key, len);
}

// @yo2 0x0068b310 load a big-endian u32
static uint32_t loadBE(const uint8_t* b) { return (uint32_t)b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]; }

// @yo2 0x0068b350 store a big-endian u32
static void storeBE(uint32_t v, uint8_t* b) { b[0] = v >> 24; b[1] = v >> 16; b[2] = v >> 8; b[3] = v; }

// @yo2 0x0068b1b0 Blowfish-ECB the body in place; len rounds up to 8, the tail padded with zeroes
void ygCipher(YgPacket* p, int decrypt) {
    if (!p || (decrypt != 0 && decrypt != 1)) return;
    uint8_t buf[0x400] = {};
    memcpy(buf, p->data, p->len);
    int n = 0;
    for (; n < p->len; n += 8) {
        uint32_t l = loadBE(buf + n), r = loadBE(buf + n + 4);
        if (decrypt) cipher().decrypt(&l, &r);
        else cipher().encrypt(&l, &r);
        storeBE(l, buf + n);
        storeBE(r, buf + n + 4);
    }
    p->len = n;
    memset(p->data, 0, sizeof p->data);
    memcpy(p->data, buf, n);
}
