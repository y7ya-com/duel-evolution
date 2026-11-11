#include <assert.h>
#include <stdarg.h>
#include "../ovr/starterdeck.c"
uint8_t *rc_mem;
static int original, syncs, adds, subs, totals, filters;
static uint8_t next[TRUNK_N];
void rc_log(const char *f, ...) { (void)f; }
void o_0068eca0(CPU *c) { original++; memcpy(G(c->ecx + TRUNK_OFF), next, TRUNK_N); c->ret_to = RD32m(c->esp); c->esp += 4; }
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *a) {
    (void)n;
    if (fn == 0xad7d80) { assert(c->ecx == 0x2000 + 0x121c); syncs++; }
    else if (fn == 0x9702c0) { assert(a[0] == 1 && a[1] == 2); adds++; }
    else if (fn == 0x970a80) { assert(a[0] == 2 && a[1] == 1); subs++; }
    else if (fn == 0x971270) filters++;
    else if (fn == 0x977310) { assert(a[0] == 4); totals++; }
    else assert(0);
    return 0;
}
static void receive(void) {
    CPU c = {0}; c.ecx = 0x2000; c.esp = 0x8000; WR32m(c.esp, 0x1234);
    f_0068eca0(&c); assert(c.ret_to == 0x1234 && c.esp == 0x8004);
}
int main(void) {
    rc_mem = calloc(1, 0x1300000); assert(rc_mem);
    WR32m(ACCOUNT_PTR, 0x1000); WR32m(0x1000 + 0xc68, 0x2000);
    WR32m(0x20f0, 0x3000); WR32m(0x300c, 0x3500); WR32m(0x3500, 0x3103);
    next[0] = 1; receive(); assert(original == 1 && !syncs); // first character load owns its initial sync
    WR32m(PLAYER_DATA, 0x4000); WR32m(CARD_CASE, 0x5000); WR32m(DECK_MGR, 0x6000); WR32m(0x6000 + DM_DIR + 8, 1);
    next[0] = 2; receive(); assert(syncs == 1 && !adds); // purchase while on map
    receive(); assert(syncs == 1); // duplicate snapshot
    WR8m(DECK_SCENE_ALIVE, 1); WR32m(KABAN_LIST, 0x9000); WR32m(DECK_WINDOW, 0xa000); WR32m(KABAN, 0xb000);
    rc_mem[0x2000 + TRUNK_OFF + 1] = 1; next[0] = 4;
    receive(); assert(syncs == 2 && adds == 1 && subs == 1 && filters == 1 && totals == 1);
    puts("shop inventory: account push syncs card case, open editor deltas and total; duplicate/load guards ok");
    free(rc_mem);
}
