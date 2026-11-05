#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#define RC_SHOPDIRECT_TEST
#include "../ovr/shopdirect.c"
uint8_t *rc_mem;
static int enabled = 1, opened, shows, originals, offdoor;
static int shop_enabled(void) { return enabled; }
static int shop_open(void) { return opened; }
static void shop_show(void) { opened = 1; shows++; }
void o_009fb8c0(CPU *c) { originals++; c->ret_to = RD32m(c->esp); c->esp += 8; }
void o_009cd5c0(CPU *c) {
    uint32_t self = c->ecx;
    if (!offdoor) {
        CPU t = *c; t.ecx = 0x2000; t.esp = 0x6000;
        WR32m(t.esp, 0x1234); WR32m(t.esp + 4, 0x3000);
        f_009fb8c0(&t); assert(t.esp == 0x6008 && t.ret_to == 0x1234);
    }
    WR32m(self + 0x658, offdoor ? -1 : 2);
    c->ret_to = RD32m(c->esp); c->esp += 8;
}
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args) {
    assert(fn == 0x009cac00 && n == 0 && args == NULL && c->ecx == player); return 0;
}
static void step(void) {
    CPU c = {0}; c.ecx = 0x4000; c.esp = 0x5000; WR32m(c.esp, 0x5678);
    f_009cd5c0(&c); assert(c.esp == 0x5008 && c.ret_to == 0x5678);
}
int main(void) {
    rc_mem = calloc(1, 0x1300000); assert(rc_mem);
    WR32m(0x1271790, 0x1000); WR32m(0x107c, 12);
    WR32m(0x2274, 5); WR32m(0x2270, 3);
    WR32m(0x3004, 0x1d); WR32m(0x3010, 2);
    WR32m(0xd2d4d0 + 5 * 0x1a4 + 0x104 + 32, 11);
    step(); assert(shows == 1 && !originals);
    step(); assert(shows == 1); // open: movement frozen
    opened = 0; step(); assert(shows == 1); // closed, still on mat
    offdoor = 1; step(); assert(latched); // a probe flicker at the edge must not rearm
    rc_wrf32(rc_mem + 0x4070, 60); step(); assert(!latched); offdoor = 0; step(); assert(shows == 2);
    opened = 0; enabled = 0; step(); assert(originals == 1); // exact native fallback
    enabled = 1; rc_shopdirect_scene(10); WR32m(0x107c, 10); step(); assert(originals == 2);
    puts("shopdirect: interception, movement, latch, scene guard and fallback ok"); free(rc_mem);
}
