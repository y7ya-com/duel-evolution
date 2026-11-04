// Standalone relay identity decoder/active-avatar test; no proprietary game image required.
// cc -Iclient/recomp/rt client/recomp/rt/tagrelay_test.c client/recomp/ovr/tagrelay.c -o /tmp/tagrelay-test && /tmp/tagrelay-test
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "rt.h"
uint8_t *rc_mem;
static int calls;
static uint32_t loaded[2];
int rc_scene_now(void) { return 0x1c; }
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args) {
    (void)c;
    assert(fn == 0x0079a370 && n == 2 && args[0] <= 1);
    loaded[args[0]] = args[1]; calls++; return 0;
}
void rc_tagrelay_chat(CPU *c, uint32_t p, uint32_t n);
static unsigned packet(uint8_t self) {
    uint8_t bytes[3 + 4 * 52] = {1, 0, self}; // friendly partner active, opposing captain active
    for (unsigned i = 0; i < 4; i++) {
        uint8_t *r = bytes + 3 + 52 * i;
        r[3] = (uint8_t)(20 + i);
        snprintf((char *)r + 4, 16, "Duelist%u", i);
        memset(r + 20, (int)(40 + i), 16);
        memset(r + 36, (int)(80 + i), 16);
    }
    const char *prefix = "@0:TAG1:", *hex = "0123456789abcdef";
    uint16_t *out = G(0x30000); unsigned n = 0;
    for (const char *p = prefix; *p; p++) out[n++] = (uint8_t)*p;
    for (unsigned i = 0; i < sizeof bytes; i++) { out[n++] = hex[bytes[i] >> 4]; out[n++] = hex[bytes[i] & 15]; }
    return n;
}
int main(void) {
    rc_mem = calloc(0x02000000, 1); assert(rc_mem);
    WR32m(0x012711ac, 0x10000); WR32m(0x10000 + 0xc70, 0x20000);
    WR32m(0x012bb6b0, 0x40000); WR32m(0x40000 + 0x448, 1);
    CPU c = {0}; unsigned n = packet(0);
    rc_tagrelay_chat(&c, 0x30000, n);
    assert(calls == 2);
    assert(RD32m(0x20000 + 0x548) == 21);
    assert(!strcmp(G(0x20000 + 0x548 + 4), "Duelist1"));
    assert(RD32m(0x20000 + 0x548 + 0x94) == 22);
    assert(*(uint8_t *)G(loaded[0]) == 81 && *(uint8_t *)G(loaded[1]) == 82);
    rc_tagrelay_chat(&c, 0x30000, n - 1); assert(calls == 2); // truncated metadata has no effect
    n = packet(3); rc_tagrelay_chat(&c, 0x30000, n); assert(calls == 2); // invalid local seat
    n = packet(255); rc_tagrelay_chat(&c, 0x30000, n); assert(calls == 4); // public spectators get active avatars too
    free(rc_mem); puts("tagrelay_test: passed"); return 0;
}
