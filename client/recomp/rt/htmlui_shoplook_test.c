// The preview command must address only the live shop bust and never touch player/network data.
#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#include "../ovr/htmlui.c"
uint8_t *rc_mem;
static unsigned calls;
uint32_t rc_halloc(uint32_t n, int zero) { (void)n; (void)zero; return 0x5000; }
void rc_hfree(uint32_t p) { assert(p == 0x5000); }
void o_0060f9e0(CPU *c) { (void)c; }
void o_005932f0(CPU *c) { (void)c; }
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args) {
    assert(fn == 0x9e6e30 && c->ecx == 0x4000 && n == 1);
    assert(RD32m(args[0]) == 0xbe9d78);
    for (unsigned k = 0; k < 16; k++) assert(rc_mem[args[0] + 4 + k] == k);
    calls++; return 0;
}
static void run(CPU *c) {
    tab.nq = 1; tab.q[0].kind = Q_SHOPLOOK; tab.q[0].a = 0x3000; tab.q[0].b = 0; tab.q[0].c = 16;
    for (unsigned k = 0; k < 16; k++) tab.text[k] = k;
    play(c); assert(!tab.nq);
}
int main(void) {
    rc_mem = calloc(1, 0x1300000); assert(rc_mem);
    CPU c = {0};
    WR32m(0x126fa8c, 0x1000); WR32m(0x1271790, 0x2000);
    WR32m(0x2000 + 0x74, 0x3000); WR32m(0x2000 + 0x7c, 14);
    WR32m(0x3000, 0xbf44ec); WR32m(0x3000 + 0xb4, 0x4000); WR32m(0x4000, 0xbf0cf8);
    run(&c); assert(calls == 1);
    WR32m(0x2000 + 0x7c, 10); run(&c); assert(calls == 1);
    WR32m(0x2000 + 0x7c, 14); WR32m(0x4000, 0); run(&c); assert(calls == 1);
    WR32m(0x4000, 0xbf0cf8); WR32m(0x3000, 0); run(&c); assert(calls == 1);
    free(rc_mem); puts("htmlui shop look command ok");
}
