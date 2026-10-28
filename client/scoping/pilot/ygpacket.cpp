#include "ygpacket.h"

#include <cstring>

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
