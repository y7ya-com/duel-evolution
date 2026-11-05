// ovr/chatfree.c's My Room decoder and Proximity Chat tab, no game data: the CHATNOTICE decoder never sees My Room's rank
// and gets it back after; the pump hides tab 1 once while it shows, then leaves it.
// cc -Iclient/recomp/rt client/recomp/rt/chatfree_test.c client/recomp/ovr/chatfree.c -o /tmp/chatfree-test && /tmp/chatfree-test
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include "rt.h"
uint8_t *rc_mem;
static int decodes, hidden, pumps;
void o_0052a490(CPU *c) { (void)c; }
void o_0052b540(CPU *c) { (void)c; }
void o_00a75760(CPU *c) { (void)c; }
void o_006bb780(CPU *c) { assert(*(uint8_t *)G(c->ecx + 0x9ed) != 12); decodes++; }
void o_00a770a0(CPU *c) { (void)c; pumps++; }
uint32_t rc_call(CPU *c, uint32_t fn, int n, const uint32_t *args) {
    assert(fn == 0x005f4800 && n == 2 && args[0] == 1 && args[1] == 0);
    *(uint8_t *)G(RD32m(c->ecx + 0x3e4) + 0x1c) = 0; hidden++; return 0;
}
void f_006bb780(CPU *c);
void f_00a770a0(CPU *c);
int main(void) {
    rc_mem = calloc(0x10000, 1); assert(rc_mem);
    CPU c = {0}; c.ecx = 0x1000;
    *(uint8_t *)G(c.ecx + 0x9ed) = 12;
    f_006bb780(&c); assert(decodes == 1 && *(uint8_t *)G(c.ecx + 0x9ed) == 12);
    *(uint8_t *)G(c.ecx + 0x9ed) = 4;
    f_006bb780(&c); assert(decodes == 2 && *(uint8_t *)G(c.ecx + 0x9ed) == 4);
    f_00a770a0(&c); assert(hidden == 0 && pumps == 1);   // no tabs yet
    WR32m(c.ecx + 0x3e4, 0x4000); WR32m(c.ecx + 0x3e8, 0x4000 + 6 * 0x1c);
    *(uint8_t *)G(0x4000 + 0x1c) = 1;
    f_00a770a0(&c); f_00a770a0(&c); assert(hidden == 1 && pumps == 3);
    free(rc_mem); puts("chatfree_test: passed");
}
