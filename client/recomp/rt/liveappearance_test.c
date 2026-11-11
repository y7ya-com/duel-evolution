// Regression: self equips need no lobby-list entry, and the drawn chibi reloads once per changed look.
#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#include "../ovr/liveappearance.c"

uint8_t *rc_mem;
enum { APP = 0x100000, ACC = 0x110000, GAME = 0x120000, PD = 0x130000,
       LOBBY = 0x140000, CONN = 0x150000, PKT = 0x160000, AREA = 0x170000,
       MGR = 0x180000, AVATAR = 0x190000, ELM = 0x200000, ESP = 0x300000 };
static int packets, syncs, reloads, copies, step;
static uint32_t avatar_present = AVATAR;
static uint32_t me;
void o_006b9930(CPU *c) { (void)c; packets++; }
void o_00a02ad0(CPU *c) { (void)c; syncs++; }
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *a) {
    if (fn == 0x00409efd) { assert(c->ecx == MGR && n == 1 && a[0] == 1004); return avatar_present; }
    if (fn == 0x009d2220) { // the by-value copy, built just under the caller's stack
        assert(step == 1 && c->ecx == c->esp && c->esp == ESP - 0x1a8 && n == 1 && a[0] == me);
        copies++; return 0;
    }
    assert(c->ecx == AVATAR);
    switch (step++) {
    case 0: assert(fn == 0x009c2040 && n == 1 && a[0] == 1); break;
    case 1:
        assert(fn == 0x009de490 && n == 0 && c->esp == ESP - 0x1a8 && copies == reloads + 1);
        memcpy(G(ELM + 0x664), G(me + 0x138 + 20), 16); break;
    case 2: assert(fn == 0x009c1f40 && n == 0); break;
    case 3: assert(fn == 0x009de190 && n == 1 && a[0] == 0); step = 0; reloads++; break;
    default: abort();
    }
    return 0;
}
static void be32(uint32_t p, uint32_t n) {
    for (int i = 0; i < 4; i++) rc_mem[p + i] = (uint8_t)(n >> (24 - i * 8));
}
static void update(CPU *c, uint32_t pid, uint32_t world, int part) {
    be32(PKT + 0x24, pid); be32(PKT + 0x28, world);
    memset(G(PKT + 0x2c), part, 16);
    c->ecx = LOBBY; f_006b9930(c);
}
static void sync_area(CPU *c) { c->ecx = AREA; f_00a02ad0(c); }
int main(void) {
    rc_mem = calloc(1, 0x1400000); assert(rc_mem);
    WR32m(0x012711ac, APP); WR32m(APP + 0xc68, ACC);
    rc_mem[ACC + 0x121c + 0x6d0] = 2; // selected slot, not necessarily slot zero
    me = appearance_player(); WR32m(me + 0xc, 1004);
    WR32m(0x012bb6b0, GAME); WR32m(GAME + 0x448, 1);
    WR32m(0x012714c4, PD); WR32m(LOBBY + 0xf0, CONN); WR32m(CONN + 0xc, PKT);
    WR32m(PKT + 4, 24); WR32m(AREA + 0x288, MGR); WR32m(AVATAR + 0x98, ELM);
    memset(G(ELM + 0x70), 0x45, 12); WR32m(ELM + 0x34c, 6);
    CPU c = {0}; c.esp = ESP;
    update(&c, 1004, 0, 3);
    assert(rc_mem[me + 0x138] == 3 && rc_mem[PD + 0xc8] == 0);
    update(&c, 1004, 1, 3);
    assert(rc_mem[me + 0x14c] == 3 && rc_mem[PD + 0xc8] == 3);
    sync_area(&c);
    assert(reloads == 1 && !memcmp(G(AVATAR + 0xd4), G(ELM + 0x70), 12) && rc_mem[AVATAR + 0xe0] == 6);
    sync_area(&c); assert(reloads == 1); // no repeated reload while loading
    update(&c, 1004, 1, 4); sync_area(&c); assert(reloads == 2); // rapid second equip
    update(&c, 1008, 1, 5); update(&c, 1004, 7, 5);
    WR32m(PKT + 4, 23); update(&c, 1004, 1, 5);
    assert(rc_mem[me + 0x14c] == 4 && rc_mem[PD + 0xc8] == 4);
    avatar_present = 0; sync_area(&c); assert(reloads == 2);
    rc_mem[ACC + 0x121c + 0x6d0] = 0xff;
    update(&c, 1004, 1, 5); sync_area(&c); assert(reloads == 2);
    assert(packets == 7 && syncs == 5 && copies == 2);
    free(rc_mem);
    puts("liveappearance_test ok");
}
