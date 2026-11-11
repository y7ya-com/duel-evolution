// cc -Irt rt/duelrequest_test.c ovr/duelrequest.c -o <scratch>/duelrequest_test
#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#include "rt.h"
uint8_t *rc_mem;
static uint64_t now;
static int cancels, originals;
uint64_t rc_now_us(void) { return now; }
void rc_log(const char *fmt, ...) { (void)fmt; }
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args) {
    assert(c->ecx == 0x2000 && fn == 0x006cc9e0 && n == 0 && !args);
    cancels++; return 0;
}
void o_006b69f0(CPU *c) {
    originals++;
    // Model the original's state 3: only the reply flag ends the wait. Every
    // actual result goes to state 5; the UI reads matchResult (including errors).
    if (RD32m(c->ecx + 0x80) == 3 && rc_mem[0x202c] == 2) {
        rc_mem[0x202c] = 0;
        WR32m(c->ecx + 0x88, RD32m(0x2820));
        WR32m(c->ecx + 0xa4, RD32m(0x2820));
        WR32m(c->ecx + 0x80, 5);
    }
    c->ret_to = RD32m(c->esp); c->esp += 4;
}
void f_006b69f0(CPU *c);
static void step(void) {
    CPU c = {0}; c.ecx = 0x1000; c.esp = 0x3000; WR32m(c.esp, 0x1234);
    f_006b69f0(&c); assert(c.ret_to == 0x1234 && c.esp == 0x3004);
}
static void begin(void) { WR32m(0x1080, 2); step(); WR32m(0x1080, 3); now += 1000000; step(); }
int main(void) {
    rc_mem = calloc(1, 0x4000); assert(rc_mem); WR32m(0x107c, 0x2000);
    begin(); now += 44999000; step(); assert(!cancels && RD32m(0x1080) == 3);
    now += 1000; step(); assert(cancels == 1 && RD32m(0x1080) == 5 && (int32_t)RD32m(0x1088) == -616);
    step(); now += 90000000; step(); assert(cancels == 1);
    // Each supported server result wins over the deadline, including acceptance.
    const int results[] = {0, -618, -616, -600, -608, -495, -492, -602};
    for (unsigned i = 0; i < sizeof(results)/sizeof(*results); i++) {
        begin(); now += 46000000; WR32m(0x2820, results[i]); rc_mem[0x202c] = 2; step();
        assert(cancels == 1 && (int32_t)RD32m(0x1088) == results[i] && RD32m(0x1080) != 3);
    }
    assert(originals > 10); puts("duelrequest: lost reply bounded, one cancel, every result exits, no resend"); free(rc_mem);
}
