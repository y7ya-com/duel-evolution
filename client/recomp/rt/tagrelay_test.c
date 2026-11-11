// ovr/tagrelay.c, no game data: a channel-10 CHATNOTICE packet sets each side's active member and its duel avatar,
// and is read to its end; a bad or short one changes nothing; any other channel is left to the stock decoder.
// make tagrelay_test (or: cc -Iclient/recomp/rt client/recomp/rt/tagrelay_test.c client/recomp/ovr/tagrelay.c)
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "rt.h"
uint8_t *rc_mem;
static int calls, reads;
static uint32_t loaded[2];
int rc_scene_now(void) { return 0x1c; }
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args) {
    (void)c;
    if (fn == 0x0068a670 || fn == 0x0068a6a0) { assert(n == 1 && args[0] == 0x52000); reads++; return 0; }
    assert(fn == 0x0079a370 && n == 2 && args[0] <= 1);
    loaded[args[0]] = args[1]; calls++; return 0;
}
int rc_tagrelay_notice(CPU *c, uint32_t lobby);
#define LOBBY 0x50000
#define PKT 0x52000
// the 0x4402 body as server/src/duel/tagRelay.ts sends it (cut: that many text characters dropped)
static void packet(uint8_t channel, uint8_t self, unsigned cut) {
    uint8_t bytes[3 + 4 * 52] = {1, 0, self};   // the own partner active, the other captain active
    for (unsigned i = 0; i < 4; i++) {
        uint8_t *r = bytes + 3 + 52 * i;
        r[3] = (uint8_t)(20 + i);
        snprintf((char *)r + 4, 16, "Duelist%u", i);
        memset(r + 20, (int)(40 + i), 16);
        memset(r + 36, (int)(80 + i), 16);
    }
    uint8_t *d = G(PKT + 0x24);
    memset(d, 0, 0x400);
    d[1] = channel;
    char *text = (char *)d + 26;
    unsigned n = (unsigned)sprintf(text, "TAG1:");
    for (unsigned i = 0; i < sizeof bytes; i++) n += (unsigned)sprintf(text + n, "%02x", bytes[i]);
    text[n - cut] = 0;
    WR32m(PKT + 4, 26 + n + 1);
}
int main(void) {
    rc_mem = calloc(0x02000000, 1); assert(rc_mem);
    WR32m(0x012711ac, 0x10000); WR32m(0x10000 + 0xc70, 0x20000);
    WR32m(0x012bb6b0, 0x40000); WR32m(0x40000 + 0x448, 1);
    WR32m(LOBBY + 0xf0, 0x51000); WR32m(0x51000 + 0xc, PKT);
    CPU c = {0};
    packet(10, 0, 0); assert(rc_tagrelay_notice(&c, LOBBY) == 1);
    assert(calls == 2 && reads == 2);
    assert(RD32m(0x20000 + 0x548) == 21);
    assert(!strcmp(G(0x20000 + 0x548 + 4), "Duelist1"));
    assert(RD32m(0x20000 + 0x548 + 0x94) == 22);
    assert(*(uint8_t *)G(loaded[0]) == 81 && *(uint8_t *)G(loaded[1]) == 82);   // world 1's parts
    packet(10, 0, 1); assert(rc_tagrelay_notice(&c, LOBBY) == 1 && calls == 2 && reads == 4);   // short: read, no effect
    packet(10, 3, 0); assert(rc_tagrelay_notice(&c, LOBBY) == 1 && calls == 2);                // no such seat
    packet(10, 255, 0); assert(rc_tagrelay_notice(&c, LOBBY) == 1 && calls == 4);              // spectators too
    packet(0, 0, 0); assert(rc_tagrelay_notice(&c, LOBBY) == 0 && calls == 4 && reads == 8);   // a chat line: stock's
    WR32m(0x51000 + 0xc, 0); assert(rc_tagrelay_notice(&c, LOBBY) == 0);
    free(rc_mem); puts("tagrelay_test: passed"); return 0;
}
